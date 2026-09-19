#!/usr/bin/env node
/**
 * PreToolUse (Bash) — proteção proporcional ao risco E ao destino.
 *
 * A governança é production-first: deploy, push, migration, secret e
 * rollback são Classe C e podem ser executados por agentes depois dos gates
 * de docs/SECURITY.md. Este hook não cria um botão humano para Classe C.
 *
 * Duas coisas o fazem intervir:
 *
 *   1. Classe D — destruição extraordinária, ou alvo/conteúdo que ele não
 *      consegue inspecionar com segurança. Vale sempre, congelada ou não;
 *   2. o FREEZE de produção. Enquanto `.claude/governanca.json` disser
 *      `prodCongelada`, uma operação Classe C que atinja produção deixa de
 *      ser autônoma e passa a exigir instrução humana explícita. A mesma
 *      operação apontada para DEV/staging continua autônoma.
 *
 * O destino nunca é adivinhado pelo texto do comando. Worker e banco saem
 * de `api/wrangler.toml`, que é quem declara os ambientes de verdade; o ramo
 * sai do refspec do próprio `git push`. Quando o alvo não pode ser provado,
 * a resposta é `ask` — "não sei" nunca vira "pode".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

const perguntar = (motivo) => decidir('ask', motivo);
const negar = (motivo) => decidir('deny', motivo);

function semHeredoc(cmd) {
  return cmd.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, ' <<HEREDOC ');
}

function semEnvelope(cmd) {
  let atual = cmd;
  for (let i = 0; i < 5; i += 1) {
    const anterior = atual;
    atual = atual
      .replace(/\b(?:ba|z|da|k)?sh\s+-[a-z]*c\s+(['"])([\s\S]*?)\1/g, ' ; $2 ; ')
      .replace(/\beval\s+(['"])([\s\S]*?)\1/g, ' ; $2 ; ');
    if (atual === anterior) break;
  }
  return atual;
}

function segmentos(cmd) {
  return cmd
    .split(/\n|;|\|\||&&|(?<!\d)[|&](?!\d)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg) => {
      const partes = seg.split(/\s+/).filter((t) => !/^\w+=/.test(t));
      let i = 0;
      while (i < partes.length
        && (/^(sudo|env|npx|pnpm|yarn|bunx|time|timeout|nohup|stdbuf|command|xargs|nice)$/.test(partes[i])
          || (i > 0 && /^(-|\d+[smhd]?)$/.test(partes[i])))) i += 1;
      return [(partes[i] ?? '').replace(/^.*[\\/]/, ''), seg];
    });
}

/** Os argumentos POSICIONAIS de uma ferramenta, até a primeira opção.
 *  `wrangler d1 execute DB --remote` → ['d1','execute','DB'];
 *  `wrangler deploy --env staging`   → ['deploy'], sem confundir o valor
 *  `staging` com um subcomando. */
function posicionais(seg, ferramenta) {
  const tokens = seg.split(/\s+/).filter(Boolean).filter((t) => !/^\w+=/.test(t));
  const i = tokens.findIndex((t) => t.replace(/^.*[\\/]/, '').replace(/['"]/g, '') === ferramenta);
  if (i < 0) return [];
  const saida = [];
  for (const t of tokens.slice(i + 1)) {
    if (t.startsWith('-')) break;
    saida.push(t.replace(/^['"]|['"]$/g, ''));
  }
  return saida;
}

function opcao(seg, longa, curta) {
  const re = new RegExp(`(?:^|\\s)(?:--${longa}(?:=|\\s+)|-${curta}\\s+)(["']?)([A-Za-z0-9_.\\-]+)\\1`);
  const m = re.exec(seg);
  return m ? m[2] : null;
}

const temFlag = (seg, nome) => new RegExp(`(?:^|\\s)--${nome}\\b`).test(seg);

/* ─────────────────────────────────────────── o estado e os ambientes reais */

/** Ausente, ilegível ou inválido = CONGELADA. Arquivo corrompido não
 *  destrava produção. */
function governanca(raiz) {
  const padrao = { prodCongelada: true, ramosProtegidos: ['main', 'master'], pagesNaoProdutivos: [] };
  try {
    const g = JSON.parse(readFileSync(path.join(raiz, '.claude', 'governanca.json'), 'utf8'));
    return {
      prodCongelada: g.prodCongelada !== false,
      ramosProtegidos: Array.isArray(g.ramosProtegidos) ? g.ramosProtegidos : padrao.ramosProtegidos,
      pagesNaoProdutivos: Array.isArray(g.pagesNaoProdutivos) ? g.pagesNaoProdutivos : [],
    };
  } catch { return padrao; }
}

/** Quem é cada ambiente, lido de `api/wrangler.toml`. O ambiente raiz (sem
 *  `--env`) é produção; os nomeados só são DEV quando não reaproveitam
 *  nenhum recurso da raiz. Não ler o arquivo devolve `null`, e aí nada pode
 *  ser provado como DEV. */
function ambientes(raiz) {
  let texto;
  try { texto = readFileSync(path.join(raiz, 'api', 'wrangler.toml'), 'utf8'); } catch { return null; }
  const envs = new Map();
  const pegar = (nome) => {
    if (!envs.has(nome)) envs.set(nome, { worker: null, d1: [] });
    return envs.get(nome);
  };
  pegar('');
  let atual = '';
  let d1 = null;
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.replace(/#.*$/, '').trim();
    if (!l) continue;
    const tabela = /^\[\[?([^\]]+)\]\]?$/.exec(l);
    if (tabela) {
      const caminho = tabela[1].trim();
      const m = /^env\.([A-Za-z0-9_-]+)(?:\.(.*))?$/.exec(caminho);
      atual = m ? m[1] : '';
      const resto = m ? (m[2] ?? '') : caminho;
      pegar(atual);
      d1 = null;
      if (resto === 'd1_databases') { d1 = {}; pegar(atual).d1.push(d1); }
      continue;
    }
    const par = /^([A-Za-z0-9_]+)\s*=\s*["']([^"']*)["']/.exec(l);
    if (!par) continue;
    if (d1) { d1[par[1]] = par[2]; continue; }
    if (par[1] === 'name') pegar(atual).worker = par[2];
  }
  return envs;
}

/** Os nomes que pertencem à produção: o Worker raiz e os bancos dele. */
function nomesDeProducao(envs) {
  const raizEnv = envs.get('') ?? { worker: null, d1: [] };
  return new Set([raizEnv.worker, ...raizEnv.d1.map((d) => d.database_name)].filter(Boolean));
}

/** `null` quando não dá para provar. Nunca devolve "é DEV" por eliminação. */
function ambienteEhProducao(nomeEnv, envs) {
  if (!envs) return null;
  if (nomeEnv === '') return true;
  if (!envs.has(nomeEnv)) return null;
  const alvo = envs.get(nomeEnv);
  const prod = nomesDeProducao(envs);
  if (prod.has(alvo.worker)) return true;
  if (alvo.d1.some((d) => prod.has(d.database_name))) return true;
  return false;
}

/** O banco que um `wrangler d1 …` realmente atinge. O argumento pode ser o
 *  nome do banco, o UUID ou o BINDING — e binding só se resolve sabendo o
 *  ambiente. Devolve `null` quando não há como saber. */
function bancoAlvo(argumento, nomeEnv, envs) {
  if (!argumento || !envs) return null;
  const todos = [...envs.values()].flatMap((e) => e.d1);
  const porNome = todos.find((d) => d.database_name === argumento);
  if (porNome) return porNome.database_name;
  const porId = todos.find((d) => d.database_id === argumento);
  if (porId) return porId.database_name;
  const doEnv = (envs.get(nomeEnv) ?? envs.get('')).d1.find((d) => d.binding === argumento);
  if (doEnv) return doEnv.database_name;
  return argumento;
}

/** Um banco só é DEV quando algum ambiente NÃO produtivo o declara.
 *  `marquesa-db` — a cópia congelada de rollback — não é declarado por
 *  ambiente nenhum, e é exatamente por isso que ele cai aqui como "não
 *  comprovadamente DEV" em vez de passar por engano. */
function bancoEhProducao(nome, envs) {
  if (!nome || !envs) return null;
  if (nomesDeProducao(envs).has(nome)) return true;
  for (const [chave, env] of envs) {
    if (chave === '') continue;
    if (ambienteEhProducao(chave, envs) === false && env.d1.some((d) => d.database_name === nome)) {
      return false;
    }
  }
  return null;
}

/* ────────────────────────────────────────────────── SQL: Classe D de sempre */

function limparSql(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

function valoresDaOpcao(seg, nome) {
  const achados = [];
  const re = new RegExp(`--${nome}(?:=|\\s+)(?:"([^"]*)"|'([^']*)'|([^\\s;&|]+))`, 'g');
  let m = re.exec(seg);
  while (m) {
    achados.push(m[1] ?? m[2] ?? m[3] ?? '');
    m = re.exec(seg);
  }
  return achados;
}

const arquivosSql = (seg) => valoresDaOpcao(seg, 'file');
const comandosInline = (seg) => valoresDaOpcao(seg, 'command');

function exigirClasseD(sql, origem) {
  const limpo = limparSql(sql);
  if (/\bdrop\s+(table|database|index|view|trigger)\b|\bdrop\s+column\b|\btruncate\b/i.test(limpo)) {
    perguntar(`${origem} contém remoção estrutural. É Classe D: exige instrução humana explícita para este alvo.`);
  }
  if (/\b(delete\s+from|update\s+[`"[\]\w.]+\s+set)\b/i.test(limpo) && !/\bwhere\b/i.test(limpo)) {
    perguntar(`${origem} contém DELETE/UPDATE em massa sem WHERE verificável. É Classe D.`);
  }
}

function conferirArquivo(bruto, base, raiz) {
  const abs = path.resolve(base, bruto);
  const relativo = path.relative(raiz, abs);
  if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
    perguntar(`O SQL ${bruto} está fora do repositório. Confirme explicitamente esse artefato antes de executar.`);
  }
  try {
    exigirClasseD(readFileSync(abs, 'utf8'), `O arquivo ${bruto}`);
  } catch {
    perguntar(`Não foi possível ler ${bruto} para classificar o SQL antes da execução.`);
  }
}

/* ───────────────────────────────────────────────────────────────── decisão */

let entrada = {};
try { entrada = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const comando = entrada?.tool_input?.command || entrada?.tool_input?.cmd || '';
if (!comando) process.exit(0);

const raiz = process.cwd();
const regra = governanca(raiz);
const envs = ambientes(raiz);

/** O freio do freeze. `producao === null` quer dizer "não consegui provar o
 *  alvo", e sob freeze isso vale o mesmo que produção: é justamente o caso
 *  em que um engano passaria despercebido. */
function travarSeProduzir(producao, o_que, alvo) {
  if (!regra.prodCongelada) return;
  if (producao === false) return;
  const como = producao === true ? `atinge ${alvo}` : `não permite provar que o alvo é DEV (${alvo})`;
  perguntar(
    `${o_que} ${como}, e a produção está CONGELADA (.claude/governanca.json). `
    + 'Classe C contra produção deixa de ser autônoma durante o freeze: peça instrução humana explícita, '
    + 'ou aponte a operação para DEV/staging.',
  );
}

let base = raiz;
for (const [nome, seg] of segmentos(semEnvelope(semHeredoc(comando)))) {
  if (nome === 'cd') {
    const alvo = seg.replace(/^cd\s+/, '').trim().replace(/^['"]|['"]$/g, '');
    if (alvo) base = path.resolve(base, alvo);
    continue;
  }

  if (/^(cat|type|less|more|head|tail|bat|strings|cp|open)$/.test(nome)
      && /(\.dev\.vars(?!\.example)|(^|[\s/])\.env(\.(?!example)\S*)?(\s|$)|backups[\\/]|seed\.sql)/i.test(seg)) {
    negar('Segredo ou dado real não entra no contexto do agente. Use somente nomes, metadados e contagens seguras.');
  }

  if (nome === 'git') {
    /* Classe D vale com freeze ou sem ele. */
    if (/\bpush\b.*(--force\b|--force-with-lease\b|(^|\s)-f(\s|$))/i.test(seg)
        || /\breset\s+--hard\b|\bclean\s+-[a-z]*f|\b(filter-branch|filter-repo)\b|\breflog\s+expire\b|\bgc\s+--prune=now\b/i.test(seg)) {
      perguntar('Operação Git destrutiva/reescrita de histórico é Classe D e exige instrução humana explícita.');
    }

    const tokens = seg.split(/\s+/).filter(Boolean);
    const iPush = tokens.indexOf('push');
    if (iPush >= 0) {
      if (/(?:^|\s)(?:--delete|-d)(?:\s|$)/.test(seg)) {
        perguntar('Apagar ramo remoto é Classe D e exige instrução humana explícita.');
      }
      /* O destino é o lado direito do refspec, não o nome do remoto e não o
         que está aqui na máquina. `HEAD:main` publica em main. */
      const args = tokens.slice(iPush + 1).filter((t) => !t.startsWith('-'));
      const refs = args.slice(1).map((r) => {
        const limpo = r.replace(/^\+/, '');
        const destino = limpo.includes(':') ? limpo.slice(limpo.indexOf(':') + 1) : limpo;
        return destino.replace(/^refs\/heads\//, '');
      });
      if (refs.length === 0) {
        travarSeProduzir(null, 'Um push sem refspec explícito', 'o ramo vem do upstream configurado');
      } else {
        for (const ref of refs) {
          if (regra.ramosProtegidos.includes(ref)) {
            travarSeProduzir(true, `O push publica em \`${ref}\``, `o ramo de produção \`${ref}\``);
          }
        }
      }
    }
  }

  if (nome === 'wrangler') {
    if (/\b(d1\s+delete|delete\s+marquesa-api|r2\s+(?:object|bucket)\s+delete)\b/i.test(seg)) {
      perguntar('Exclusão de recurso ou dado Cloudflare é Classe D e exige instrução humana explícita.');
    }

    const args = posicionais(seg, 'wrangler');
    const nomeEnv = opcao(seg, 'env', 'e') ?? '';
    const ehProd = ambienteEhProducao(nomeEnv, envs);
    const rotulo = nomeEnv ? `o ambiente \`${nomeEnv}\`` : 'o ambiente raiz (produção)';

    /* Publicar, reverter, religar gatilho ou trocar segredo: o que muda o
       Worker publicado. Leitura (`tail`, `… list`, `whoami`) não entra. */
    const publica = args[0] === 'deploy'
      || args[0] === 'rollback'
      || (args[0] === 'triggers' && args[1] === 'deploy')
      || (args[0] === 'versions' && (args[1] === 'deploy' || args[1] === 'upload'));
    if (publica) {
      travarSeProduzir(ehProd, `\`wrangler ${args.join(' ')}\` publica em`, rotulo);
    }

    if (args[0] === 'secret' && ['put', 'delete', 'bulk'].includes(args[1])) {
      travarSeProduzir(ehProd, `\`wrangler secret ${args[1]}\` escreve em`, rotulo);
    }

    if (args[0] === 'pages' && args[1] === 'deploy') {
      const projeto = opcao(seg, 'project-name', 'p');
      const conhecido = projeto && regra.pagesNaoProdutivos.includes(projeto);
      travarSeProduzir(
        conhecido ? false : null,
        '`wrangler pages deploy` publica em',
        projeto ? `o projeto \`${projeto}\`, que não está declarado como não-produtivo` : 'um projeto Pages não informado',
      );
    }

    if (/\bd1\b/.test(seg) && args[0] === 'd1') {
      /* `migrations apply DB` e `time-travel restore DB` põem o banco uma
         posição adiante de `execute DB`. Errar isto leria "restore" como se
         fosse o nome do banco. */
      const agrupado = args[1] === 'migrations' || args[1] === 'time-travel';
      const subcomando = agrupado ? args[2] : args[1];
      const banco = bancoAlvo(agrupado ? args[3] : args[2], nomeEnv, envs);

      /* O SQL é classificado sempre — DEV também não apaga tabela por
         descuido. Isto continua sendo Classe D, independente do freeze. */
      if (subcomando === 'execute' || subcomando === 'apply') {
        for (const arquivo of arquivosSql(seg)) conferirArquivo(arquivo, base, raiz);
        for (const sql of comandosInline(seg)) exigirClasseD(sql, 'O SQL inline');
      }

      /* `--local` não sai da máquina. Sem `--local`, o alvo é o banco real,
         e é o destino dele que decide. */
      const escreve = ['execute', 'apply', 'restore', 'import'].includes(subcomando);
      if (escreve && !temFlag(seg, 'local') && !temFlag(seg, 'preview')) {
        travarSeProduzir(
          bancoEhProducao(banco, envs),
          `\`wrangler d1 ${args.slice(1).join(' ')}\` escreve em`,
          banco ? `o banco \`${banco}\`` : 'um banco que o comando não identifica',
        );
      }
    }
  }

  if (nome === 'curl' && /forcar["'\s]*:\s*true/i.test(seg)
      && !/localhost|127\.0\.0\.1|staging/i.test(seg)) {
    perguntar('Sincronização forçada contra a loja real é Classe D sem uma solicitação explícita para esse efeito.');
  }
}

process.exit(0);
