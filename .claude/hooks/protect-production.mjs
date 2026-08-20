#!/usr/bin/env node
/** PreToolUse (Bash) — segunda camada de proteção contra produção.
 *
 *  Não substitui `permissions` do settings.json: existe porque prefixo não
 *  sabe distinguir `marquesa-db` de `marquesa-db-dev`, nem um deploy com
 *  `--env staging` de um sem. Aqui a decisão é por regex, com negative
 *  lookahead nos nomes de produção.
 *
 *  Duas precauções contra falso positivo — porque hook que atrapalha
 *  trabalho normal acaba desligado, e aí não protege nada:
 *
 *   1. corpo de heredoc é REMOVIDO antes da análise. Escrever documentação
 *      que cita um comando perigoso não é rodar o comando;
 *   2. a análise é por SEGMENTO, e só olha o segmento cujo primeiro token é
 *      a ferramenta em questão. `grep -rn "d1 delete" docs/` é leitura.
 *
 *  Portátil de propósito: Node puro, sem dependência, sem shell. Roda igual
 *  no Windows, no WSL2, num container ou noutro orquestrador.
 *
 *  Contrato: lê JSON no stdin, escreve JSON no stdout, sai com 0 sempre.
 *  Silêncio = liberado.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROD_DB = /marquesa-db(?!-dev)/;
const PROD_R2 = /marquesa-fotos(?!-dev)/;
const PROD_WORKER = /marquesa-api(?!-staging)/;

function decidir(decisao, motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decisao,
      permissionDecisionReason: motivo,
    },
  }));
  process.exit(0);
}

const negar = (motivo) => decidir('deny', motivo);
/** Devolve a decisão para uma pessoa. Usado quando o hook NÃO consegue
 *  provar que a operação é segura — fail closed sem virar bloqueio. */
const perguntar = (motivo) => decidir('ask', motivo);

function ramoAtual() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return ''; }
}

/** Tira o corpo dos heredocs: é conteúdo de arquivo, não comando. */
function semHeredoc(cmd) {
  return cmd.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, ' <<HEREDOC ');
}

/** Abre envelopes de shell: `bash -c "…"`, `sh -c '…'`, `eval "…"`.
 *  Sem isto, `bash -c "wrangler deploy"` passaria batido — o primeiro token
 *  do segmento seria `bash`, e nenhuma regra de wrangler seria consultada.
 *  Repete até estabilizar, para pegar envelope dentro de envelope. */
function semEnvelope(cmd) {
  let anterior;
  let atual = cmd;
  let voltas = 0;
  do {
    anterior = atual;
    atual = atual
      .replace(/\b(?:ba|z|da|k)?sh\s+-[a-z]*c\s+(['"])([\s\S]*?)\1/g, ' ; $2 ; ')
      .replace(/\beval\s+(['"])([\s\S]*?)\1/g, ' ; $2 ; ');
    voltas += 1;
  } while (atual !== anterior && voltas < 5);
  return atual;
}

/** Quebra em segmentos executáveis e devolve [primeiroToken, segmento]. */
function segmentos(cmd) {
  return cmd
    .split(/\n|;|\|\||&&|(?<!\d)[|&](?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const partes = s.split(/\s+/).filter((t) => !/^\w+=/.test(t));
      let i = 0;
      while (i < partes.length
        && (/^(sudo|env|npx|pnpm|yarn|bunx|time|timeout|nohup|stdbuf|command|xargs|nice)$/.test(partes[i])
          || (i > 0 && /^(-|\d+[smhd]?$)/.test(partes[i])))) i += 1;
      const nome = (partes[i] ?? '').replace(/^.*[\\/]/, '');
      return [nome, s];
    });
}

/* --------------------------------------------------------------------------
 *  --file=<arquivo.sql>: validar o CONTEÚDO, não só o comando
 *
 *  Sem isto, o alvo estar certo (`marquesa-db-dev`) bastava para rodar um
 *  arquivo com `DROP TABLE` dentro. Não é parser de SQL — é heurística
 *  conservadora, e o que ela não consegue provar seguro vira `ask`.
 * ----------------------------------------------------------------------- */

function raizDoRepositorio() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || process.cwd();
  } catch { return process.cwd(); }
}

/** Extrai os valores de --file, nas duas sintaxes e com aspas. */
function arquivosSql(seg) {
  const achados = [];
  const re = /--file(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/g;
  let m = re.exec(seg);
  while (m !== null) {
    achados.push(m[1] ?? m[2] ?? m[3] ?? '');
    m = re.exec(seg);
  }
  return achados;
}

/** Tira comentário e literal de texto: `-- DROP TABLE` num comentário não é
 *  uma statement, e um DROP dentro de aspas nunca é executado. */
function limparSql(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

const DESTRUTIVO = [
  [/\bdrop\s+(table|database|index|view|trigger)\b/i, 'DROP'],
  [/\bdrop\s+column\b/i, 'ALTER TABLE … DROP COLUMN'],
  [/\btruncate\b/i, 'TRUNCATE'],
];
const DUVIDOSO = [
  [/\bdelete\s+from\b/i, 'DELETE'],
  [/\bupdate\s+[`"[\]\w.]+\s+set\b/i, 'UPDATE'],
  [/\breplace\s+into\b/i, 'REPLACE INTO'],
  [/\binsert\s+or\s+replace\b/i, 'INSERT OR REPLACE'],
  [/\balter\s+table\b[^;]*\brename\b/i, 'ALTER TABLE … RENAME'],
];

/** Decide sobre um `--file`, e nunca devolve "pode rodar" por omissão. */
function conferirArquivo(bruto_, base, raiz) {
  if (!bruto_) {
    perguntar('`--file` sem valor legível. O hook não conseguiu conferir o SQL — '
      + 'confirme à mão o que este arquivo executa.');
  }
  const alvo = path.resolve(base, bruto_);
  /* `git rev-parse` devolve `c:/…` e `path.resolve` devolve `C:\…`. Comparar
   * os dois crus reprovaria todo caminho legítimo no Windows. */
  const normal = (p) => (process.platform === 'win32'
    ? path.resolve(p).toLowerCase()
    : path.resolve(p));
  const a = normal(alvo);
  const r = normal(raiz);
  const dentro = a === r || a.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
  if (!dentro) {
    negar(`O arquivo \`${bruto_}\` está FORA da raiz do repositório. Executar SQL vindo `
      + 'de fora do projeto (dump, backup, pasta temporária) não acontece automaticamente.');
  }

  let texto;
  try {
    texto = readFileSync(alvo, 'utf8');
  } catch {
    perguntar(`Não consegui ler \`${bruto_}\` para conferir o SQL antes de executá-lo. `
      + 'Sem leitura não há prova de que é seguro — confirme à mão.');
  }

  const limpo = limparSql(texto);
  for (const [re, nome] of DESTRUTIVO) {
    if (re.test(limpo)) {
      negar(`\`${bruto_}\` contém ${nome}. Operação destrutiva não é executada `
        + 'automaticamente em ambiente nenhum, nem no DEV. Carregue `safe-d1-change`, '
        + 'e deixe a aplicação para uma pessoa.');
    }
  }
  for (const [re, nome] of DUVIDOSO) {
    if (re.test(limpo)) {
      perguntar(`\`${bruto_}\` contém ${nome} — o hook não consegue provar que é seguro. `
        + 'Leia o arquivo e confirme antes de aplicar. Estoque aqui representa peça física.');
    }
  }
}

let bruto = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (p) => { bruto += p; });
process.stdin.on('end', () => {
  let evento;
  try { evento = JSON.parse(bruto || '{}'); } catch { process.exit(0); }
  if (evento.tool_name !== 'Bash') process.exit(0);

  const cru = String(evento.tool_input?.command ?? '');
  if (!cru.trim()) process.exit(0);

  const raiz = raizDoRepositorio();
  let base = process.cwd();

  for (const [nome, seg] of segmentos(semEnvelope(semHeredoc(cru)))) {
    const seco = /--dry-run\b/.test(seg);

    /* `cd api && wrangler d1 execute … --file=schema.sql` é rotina: o caminho
     * do arquivo é relativo ao cd, não ao diretório da sessão. */
    if (nome === 'cd') {
      const destino = (seg.match(/\bcd\s+(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/) ?? []);
      const valor = destino[1] ?? destino[2] ?? destino[3];
      if (valor) base = path.resolve(base, valor);
    }

    /* -------------------------------------------------------- Cloudflare */
    if (nome === 'wrangler') {
      const sub = seg.replace(/^.*?wrangler\s+/, '');
      if (/^(deploy|rollback)\b|\b(versions|triggers)\s+deploy\b|\bpages\s+deploy\b/.test(sub) && !seco) {
        negar('`wrangler deploy` não é executado por agente em NENHUM ambiente '
          + '(docs/SECURITY.md, Classe C). O DEV publica por push em `develop` '
          + '(.github/workflows/deploy-dev.yml); o Worker staging é comando humano. '
          + 'Entregue o comando ao Gustavo em vez de rodá-lo.');
      }
      if (/--env[= ]\s*(production|prod)\b/.test(seg)) {
        negar('Comando aponta para o ambiente de produção (`--env production`). Bloqueado.');
      }
      if (/\bsecret\b/.test(seg) && /\b(put|delete|bulk)\b/.test(seg)) {
        negar('Alteração de secret exige autorização humana explícita, inclusive em staging.');
      }
      if (/\bd1\s+delete\b/.test(seg) || /\btime-travel\s+restore\b/.test(seg)) {
        negar('`d1 delete` e `time-travel restore` são irreversíveis. Só com instrução humana explícita.');
      }
      if (/\bd1\s+(execute|migrations|export)\b/.test(seg) && PROD_DB.test(seg)) {
        negar('Alvo é `marquesa-db` (PRODUÇÃO), não `marquesa-db-dev`. Escrita ou migration '
          + 'em produção exige autorização humana explícita e backup confirmado. '
          + 'Carregue a skill `database-dev` e prove o alvo.');
      }
      if (/\br2\s+(object\s+(put|delete)|bucket\s+(create|delete))\b/.test(seg) && PROD_R2.test(seg)) {
        negar('Alvo é o bucket R2 de PRODUÇÃO (`marquesa-fotos`). O bucket DEV é `marquesa-fotos-dev`.');
      }
      if (/\b(delete|secret)\b/.test(seg) && PROD_WORKER.test(seg)) {
        negar('Comando muta o Worker de PRODUÇÃO (`marquesa-api`). O Worker DEV é `marquesa-api-staging`.');
      }

      /* SQL destrutivo só conta quando é o wrangler que vai executá-lo */
      if (/\bd1\s+(execute|migrations)\b/.test(seg)) {
        if (/\bdrop\s+(table|database|index)\b/i.test(seg)) {
          negar('`DROP` não é executado automaticamente em ambiente nenhum. Carregue '
            + '`safe-d1-change`, escreva a migration e deixe a aplicação para uma pessoa.');
        }
        if (/\btruncate\b/i.test(seg)) negar('`TRUNCATE` não é executado automaticamente.');
        if (/\b(delete\s+from|update)\s+\w/i.test(seg) && !/\bwhere\b/i.test(seg)) {
          negar('DELETE ou UPDATE em massa sem `WHERE` validado. Bloqueado em qualquer '
            + 'ambiente — estoque aqui representa peça física.');
        }
        /* O alvo estar certo não prova nada sobre o que está dentro do arquivo. */
        for (const arquivo of arquivosSql(seg)) conferirArquivo(arquivo, base, raiz);
      }
    }

    /* --------------------------------------------------------------- Git */
    if (nome === 'git') {
      if (/\bpush\b/.test(seg) && /(--force\b|--force-with-lease\b|(^|\s)-f(\s|$))/.test(seg)) {
        negar('`git push --force` é proibido em qualquer branch, sem exceção (CLAUDE.md).');
      }
      if (/\breset\s+--hard\b/.test(seg)) {
        negar('`git reset --hard` descarta trabalho. Só com instrução humana explícita.');
      }
      if (/\bclean\s+-[a-z]*f/.test(seg)) {
        negar('`git clean -f` apaga arquivo não versionado. Só com instrução humana explícita.');
      }
      if (/\b(filter-branch|filter-repo)\b/.test(seg)) {
        negar('Reescrita de histórico. Só com instrução humana explícita.');
      }
      if (/\bupdate-ref\s+-d\b/.test(seg) || /\breflog\s+expire\b/.test(seg) || /\bgc\s+--prune=now\b/.test(seg)) {
        negar('Comando destrói pontos de retorno do Git. Bloqueado.');
      }
      if (/\bpush\b/.test(seg) && !seco) {
        const alvoMain = /\bpush\b.*\b(main|master|HEAD:main|origin\/main)\b/.test(seg);
        const semAlvo = !/\bpush\s+\S+\s+\S+/.test(seg);
        if (alvoMain || (semAlvo && /^(main|master)$/.test(ramoAtual()))) {
          negar('Push em `main` exige autorização humana explícita. O fluxo normal é '
            + '`git push origin develop`, que dispara o deploy DEV.');
        }
      }
      if (/\bmerge\b/.test(seg) && /\bmain\b/.test(seg)) {
        negar('Merge envolvendo `main` exige autorização humana explícita (CLAUDE.md).');
      }
    }

    /* --------------------------------------------- segredo e dado real */
    if (/^(cat|type|less|more|head|tail|bat|strings|cp|open)$/.test(nome)
        && /(\.dev\.vars(?!\.example)|(^|[\s/])\.env(\.(?!example)\S*)?(\s|$)|backups\/|seed\.sql)/.test(seg)) {
      negar('Segredo e dado real de cliente não entram no contexto de um agente. '
        + 'Os NOMES das variáveis estão em `.env.example`.');
    }

    /* -------------------------------- sync forçado contra a loja real */
    if (nome === 'curl' && /forcar["'\s]*:\s*true/.test(seg)
        && !/localhost|127\.0\.0\.1|staging/.test(seg)) {
      negar('`POST /api/sync {"forcar": true}` fora do ambiente local ou staging escreve '
        + 'na loja real. Use `{"seco": true}` para o ensaio.');
    }
  }

  process.exit(0);
});
