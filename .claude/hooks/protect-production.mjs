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
import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ACOES, validarAprovacao } from './lib/release-approval.mjs';

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

/* --------------------------------------------------------------------------
 *  Production Release Approval — autorização por RELEASE, não por comando
 *
 *  Merge em `main`, push de `main`, migration no D1 de produção e deploy
 *  (Worker/Pages) eram `negar()` incondicional — nenhuma aprovação prévia
 *  destravava. Isso protegia bem, mas obrigava uma pessoa a aprovar cada
 *  `Bash` da sequência de publicação, um por um, mesmo depois de já ter
 *  dito "pode publicar este release".
 *
 *  Agora essas quatro categorias consultam `.claude/approvals/
 *  production-release.json` (lido por `carregarAprovacao`) e a decisão pura
 *  de `validarAprovacao` (`lib/release-approval.mjs`) — branch, commit,
 *  ação, ambiente, árvore limpa e (para migration) o hash do arquivo têm
 *  todos de bater, e a aprovação expira sozinha. Sem aprovação válida, o
 *  comportamento é EXATAMENTE o de antes: `negar()`.
 *
 *  O que NÃO muda: tudo no bloco "SQL destrutivo" mais abaixo (DROP,
 *  TRUNCATE, DELETE/UPDATE sem WHERE, `d1 delete`, `time-travel restore`,
 *  `git push --force`, `git reset --hard`, secret) continua `negar()`
 *  incondicional, sem NENHUM caminho de aprovação — essas checagens nem
 *  perguntam se existe aprovação. Uma aprovação de release autoriza UM
 *  arquivo de migration específico contra o binding de produção; não muda
 *  o que esse arquivo pode conter.
 *
 *  Importante: quando a aprovação É válida, a função devolve e quem chamou
 *  simplesmente NÃO nega — não existe um "permitir() que já sai". Sair cedo
 *  no caminho aprovado pularia as checagens de CONTEÚDO que vêm depois no
 *  mesmo comando (a seção "SQL destrutivo"), e aprovação de release nunca
 *  deveria ser capaz de calar essa checagem.
 */

const CAMINHO_APROVACAO = ['.claude', 'approvals', 'production-release.json'];
const CAMINHO_AUDITORIA = ['.claude', 'approvals', 'audit.log.jsonl'];

function shaAtual() {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return ''; }
}

/** `false` também quando o comando `git status` falhar — sem prova de que
 *  a árvore está limpa, ela não está. Fail-closed. */
function arvoreEstaLimpa() {
  try {
    const saida = execSync('git status --porcelain', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return saida.trim() === '';
  } catch { return false; }
}

/** `--is-ancestor` também é verdadeiro quando os dois SHAs são iguais —
 *  cobre tanto "a aprovação ainda é a ponta de main" (fast-forward) quanto
 *  "main já ganhou um commit de merge por cima dela". Recusa qualquer coisa
 *  que não pareça um SHA de Git ANTES de montar o comando — nunca interpola
 *  texto não validado numa string de shell. */
function commitEhAncestral(shaAntigo, raiz) {
  if (!/^[0-9a-f]{7,40}$/i.test(String(shaAntigo || ''))) return false;
  try {
    execSync(`git merge-base --is-ancestor ${shaAntigo} HEAD`, { cwd: raiz, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

/** `null` para "sem aprovação" cobre três casos de uma vez: arquivo não
 *  existe, sem permissão de leitura, ou JSON inválido. Os três são tratados
 *  IGUAL por `validarAprovacao` — nunca travam o hook, nunca "quase liberam".
 *
 *  `MARQUESA_APROVACAO_CAMINHO`/`MARQUESA_AUDITORIA_CAMINHO` existem só para
 *  o teste de integração: sem elas, o hook sempre lê/escreve os caminhos
 *  reais dentro do repositório. Isto existe para o teste NUNCA precisar
 *  escrever em `.claude/approvals/production-release.json` de verdade — um
 *  teste que sobrescrevesse uma aprovação real em andamento seria pior que
 *  o problema que está provando não existir. */
function carregarAprovacao(raiz) {
  const caminho = process.env.MARQUESA_APROVACAO_CAMINHO || path.join(raiz, ...CAMINHO_APROVACAO);
  try {
    const bruto = readFileSync(caminho, 'utf8');
    return JSON.parse(bruto);
  } catch { return null; }
}

function hashArquivoSha256(caminhoAbsoluto) {
  try {
    return createHash('sha256').update(readFileSync(caminhoAbsoluto)).digest('hex');
  } catch { return null; }
}

/** Caminho de `--file=<algo>` normalizado para o formato em que a aprovação
 *  o registra: relativo à RAIZ do repositório, com `/`. Sem isto, rodar o
 *  mesmo comando de dentro de `api/` (onde `--file=migracao-x.sql` não leva
 *  o prefixo `api/`) pareceria um arquivo "diferente" do aprovado. */
function caminhoRelativoARaiz(bruto, base, raiz) {
  const abs = path.resolve(base, bruto);
  return path.relative(raiz, abs).split(path.sep).join('/');
}

/** Best-effort: uma falha ao gravar auditoria nunca derruba a decisão do
 *  hook (o contrato dele é sair com 0 sempre). O log é para revisão humana
 *  depois, não parte da decisão em si. */
function registrarAuditoria(raiz, entrada) {
  try {
    const caminho = process.env.MARQUESA_AUDITORIA_CAMINHO || path.join(raiz, ...CAMINHO_AUDITORIA);
    const linha = `${JSON.stringify({ em: new Date().toISOString(), ...entrada })}\n`;
    appendFileSync(caminho, linha, 'utf8');
  } catch { /* nunca deixa a auditoria quebrar a decisão */ }
}

/** Reúne os fatos (branch simulada, árvore, ancestralidade, hash do arquivo
 *  quando fizer sentido) e devolve a decisão de `validarAprovacao`, já
 *  registrada em auditoria. `branchSimulada` é passada por quem chama — ela
 *  reflete `checkout`/`switch` já vistos MAIS CEDO no mesmo comando, não só
 *  o branch real no início do processo (ver `simularCheckout`). */
function decisaoDeRelease(raiz, acao, branchSimulada, extras = {}) {
  const aprovacao = carregarAprovacao(raiz);
  const resultado = validarAprovacao({
    aprovacao,
    acao,
    agora: new Date(),
    ambienteAlvo: 'production',
    branchAtual: branchSimulada,
    arvoreLimpa: arvoreEstaLimpa(),
    shaEhAncestral: aprovacao ? commitEhAncestral(aprovacao.commit, raiz) : false,
    migrationArquivo: extras.migrationArquivo ?? null,
    migrationHashAtual: extras.migrationHashAtual ?? null,
  });
  registrarAuditoria(raiz, {
    acao,
    decisao: resultado.ok ? 'allow' : 'deny',
    motivo: resultado.motivo,
    aprovacaoId: aprovacao?.id ?? null,
    branch: branchSimulada,
    headAtual: shaAtual(),
  });
  return resultado;
}

/** Atualiza a branch "simulada" quando o segmento é um `checkout`/`switch`.
 *  Sem isto, `git checkout main && git merge <branch>` na MESMA invocação
 *  seria avaliado com o branch de ANTES do comando rodar — o hook roda antes
 *  do Bash, então `ramoAtual()` sozinho nunca veria o `checkout` que ainda
 *  vai acontecer. Mesma ideia do `base` para `cd`, um pouco abaixo. */
function simularCheckout(seg, atual) {
  const m = seg.match(/\bgit\s+(?:checkout|switch)\s+(?:-b\s+)?(-\S+\s+)*([A-Za-z0-9._/-]+)\s*$/);
  if (!m) return atual;
  const alvo = m[2];
  if (!alvo || alvo.startsWith('-')) return atual;
  return alvo;
}

/** Extrai os valores de `--command`, nas duas sintaxes e com aspas — mesmo
 *  padrão de `arquivosSql`, usado para achar SQL solto (`-c`/`--command`) em
 *  vez de um `--file`. */
function comandosInline(seg) {
  const achados = [];
  const re = /--command(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/g;
  let m = re.exec(seg);
  while (m !== null) {
    achados.push(m[1] ?? m[2] ?? m[3] ?? '');
    m = re.exec(seg);
  }
  return achados;
}

/** `true` só quando TODA statement do texto (depois de tirar comentário e
 *  literal) é `SELECT`/`WITH`/`PRAGMA`/`EXPLAIN`. Vazio, ou qualquer coisa
 *  que não prove ser leitura, devolve `false` — fail-closed: a dúvida não
 *  vira "deve ser leitura", vira "trate como escrita". */
function ehLeituraPura(sqlBruto) {
  const limpo = limparSql(String(sqlBruto || '')).trim();
  if (!limpo) return false;
  const statements = limpo.split(';').map((s) => s.trim()).filter(Boolean);
  if (!statements.length) return false;
  return statements.every((s) => /^(select|with|pragma|explain)\b/i.test(s));
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
  let branchSimulada = ramoAtual();

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
      const ehRollback = /^rollback\b/.test(sub);
      const ehDeployWorker = /^deploy\b/.test(sub) || /\b(versions|triggers)\s+deploy\b/.test(sub);
      const ehDeployPages = /\bpages\s+deploy\b/.test(sub);
      if (ehRollback && !seco) {
        negar('`wrangler rollback` não é executado por agente em NENHUM ambiente — '
          + 'é caminho de emergência, sempre comando humano.');
      }
      if ((ehDeployWorker || ehDeployPages) && !seco) {
        if (/--env[= ]\s*staging\b/.test(seg)) {
          negar('Deploy de DEV não é executado direto pelo agente — o pipeline é '
            + '`git push origin develop` (.github/workflows/deploy-dev.yml). '
            + 'Entregue o comando ao Gustavo se precisar rodar assim mesmo.');
        } else {
          const acao = ehDeployPages ? ACOES.PAGES_DEPLOY : ACOES.WORKER_DEPLOY;
          const r = decisaoDeRelease(raiz, acao, branchSimulada);
          if (!r.ok) {
            negar(`\`wrangler ${ehDeployPages ? 'pages ' : ''}deploy\` de PRODUÇÃO exige uma `
              + `aprovação de release válida (docs/SECURITY.md § Production Release Approval). ${r.motivo}`);
          }
          /* aprovado: não nega, não pergunta — cai para fora do if. Não há
             checagem de conteúdo depois desta para wrangler deploy, então
             cair para fora aqui já é "liberado" para este segmento. */
        }
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
      /* O NOME não é mais a única forma de endereçar o banco. `wrangler d1
       * execute DB --remote` usa o BINDING, que o wrangler.toml resolve pelo
       * ambiente: sem `--env staging` isso é o D1 de produção, e a regra de
       * cima — que casa por nome — não veria nada.
       *
       * A invariante real não é o nome, é o par (remoto, ambiente): o único
       * D1 remoto que um agente pode tocar sozinho sem aprovação de release
       * é o do `--env staging`. `--local` continua livre: é um SQLite
       * dentro de api/.wrangler. */
      if (/\bd1\s+(execute|migrations|export)\b/.test(seg)
          && /--remote\b/.test(seg)
          && !/--env[= ]\s*staging\b/.test(seg)
          /* nomear o banco DEV já prova o alvo — a regra de cima cuida do
           * resto. Esta existe para o caso em que NADA no comando diz qual
           * banco é, que é justamente o do binding. */
          && !/marquesa-db-dev\b/.test(seg)) {
        const ehExport = /\bd1\s+export\b/.test(seg);
        if (ehExport) {
          /* Export é LEITURA — não escreve uma linha no D1. Tratá-lo como
             migration obrigaria uma aprovação de release só para tirar
             backup, e backup é exatamente o que precisa poder rodar SEM
             depender de já ter um release aprovado (é o passo 1, antes de
             tudo). Continua endereçado pelo binding, então nunca alcança o
             banco errado por acidente — só deixou de exigir aprovação. */
        } else {
          const leituras = comandosInline(seg);
          const arquivos = arquivosSql(seg);
          const somenteLeituraPorComando = leituras.length > 0
            && arquivos.length === 0
            && leituras.every((c) => ehLeituraPura(c));
          if (!somenteLeituraPorComando) {
            let migrationArquivo = null;
            let migrationHashAtual = null;
            if (arquivos.length === 1) {
              migrationArquivo = caminhoRelativoARaiz(arquivos[0], base, raiz);
              migrationHashAtual = hashArquivoSha256(path.resolve(raiz, migrationArquivo));
            }
            const r = arquivos.length > 1
              ? { ok: false, motivo: 'o comando cita mais de um `--file`; a aprovação de release cobre um arquivo por vez.' }
              : decisaoDeRelease(raiz, ACOES.D1_MIGRATE_PROD, branchSimulada, { migrationArquivo, migrationHashAtual });
            if (!r.ok) {
              negar('`d1` remoto sem `--env staging` endereça o D1 de PRODUÇÃO — inclusive '
                + 'pelo binding (`d1 execute DB --remote`), que não cita nome de banco nenhum. '
                + `Exige uma aprovação de release válida para a migration exata (skill \`database-dev\`). ${r.motivo}`);
            }
            /* aprovado: cai para fora. A checagem de CONTEÚDO (DROP/TRUNCATE/
               DUVIDOSO) roda depois, incondicional — a aprovação nunca a
               dispensa, ver bloco "SQL destrutivo" mais abaixo. */
          }
          /* somenteLeituraPorComando: SELECT/WITH/PRAGMA/EXPLAIN por --command,
             sem --file — não pode mutar nada, liberado sem aprovação. */
        }
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
      /* ANTES de qualquer checagem que dependa de branch: se este segmento
         é um checkout/switch, atualiza a simulação para os segmentos
         seguintes DO MESMO comando (`git checkout main && git merge x`). */
      branchSimulada = simularCheckout(seg, branchSimulada);

      if (/\bpush\b/.test(seg) && /(--force\b|--force-with-lease\b|(^|\s)-f(\s|$))/.test(seg)) {
        negar('`git push --force` é proibido em qualquer branch, sem exceção (CLAUDE.md). '
          + 'Nenhuma aprovação de release cobre isto — não existe caminho aprovado para force push.');
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
        if (alvoMain || (semAlvo && /^(main|master)$/.test(branchSimulada))) {
          const r = decisaoDeRelease(raiz, ACOES.PUSH_MAIN, branchSimulada);
          if (!r.ok) {
            negar('Push em `main` exige uma aprovação de release válida '
              + '(docs/SECURITY.md § Production Release Approval). O fluxo normal para DEV é '
              + `\`git push origin develop\`, sem aprovação nenhuma. ${r.motivo}`);
          }
          /* aprovado: cai para fora — nada depois disto no bloco git checa
             o conteúdo de um push, então liberar aqui já é liberar. */
        }
      }
      if (/\bmerge\b/.test(seg) && branchSimulada === 'main') {
        const r = decisaoDeRelease(raiz, ACOES.MERGE_MAIN, branchSimulada);
        if (!r.ok) {
          negar('Merge envolvendo `main` exige uma aprovação de release válida '
            + `(docs/SECURITY.md § Production Release Approval). ${r.motivo}`);
        }
        /* aprovado: cai para fora, mesmo raciocínio do push acima. */
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
