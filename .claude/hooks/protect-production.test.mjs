#!/usr/bin/env node
/** Prova o hook de proteção. Rode depois de qualquer mudança nele:
 *
 *      node .claude/hooks/protect-production.test.mjs
 *
 *  Quatro blocos. O segundo importa tanto quanto o primeiro: hook que
 *  atrapalha trabalho normal acaba desligado, e aí não protege nada. O
 *  terceiro cuida do conteúdo dos arquivos `.sql`, onde o alvo certo não
 *  prova nada. O quarto é o Production Release Approval — a decisão PURA já
 *  está provada em `lib/release-approval.test.mjs`; aqui só se prova que
 *  este hook, de verdade, CONSULTA aquela decisão nos quatro pontos certos
 *  (merge/push de `main`, migration de produção, deploy) e que os hard-deny
 *  permanentes (force push, DROP, `d1 delete`, `time-travel restore`,
 *  secret) continuam absolutos mesmo com uma aprovação válida presente.
 *
 *  O bloco 4 usa `MARQUESA_APROVACAO_CAMINHO`/`MARQUESA_AUDITORIA_CAMINHO`
 *  para nunca tocar `.claude/approvals/production-release.json` de verdade
 *  — ele escreve num arquivo temporário fora do repositório.
 *
 *  Pré-condição do bloco 4: nenhum arquivo RASTREADO deste repositório pode
 *  ter mudança não commitada quando o teste rodar — é um dos fatos que
 *  `validarAprovacao` confere de verdade, contra o repositório real. Arquivo
 *  NÃO rastreado (`??`) não conta, pelo mesmo motivo que não conta no hook
 *  (`arvoreEstaLimpa`): não pode vazar para um push nem mudar o que um
 *  `--file=` lê. Rodar com mudança não commitada em arquivo rastreado faz os
 *  casos "aprovação válida" falharem com o motivo "árvore suja", não com um
 *  bug do hook.
 *
 *  Sem framework, no estilo dos outros testes do projeto: imprime `ok` /
 *  `FALHA` e sai com 1 se falhou. Node puro, portátil.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ACOES } from './lib/release-approval.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(AQUI, 'protect-production.mjs');
const RAIZ = path.resolve(AQUI, '..', '..');

/** Devolve 'deny', 'ask' ou 'ok' — silêncio do hook é 'ok'. `envExtra` só é
 *  usado pelo bloco 4, para apontar o hook para um arquivo de aprovação de
 *  teste em vez do real. */
function decisao(cmd, envExtra = {}) {
  const saida = execFileSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
    encoding: 'utf8',
    cwd: RAIZ,
    env: { ...process.env, ...envExtra },
  });
  if (!saida.trim()) return 'ok';
  try {
    return JSON.parse(saida).hookSpecificOutput?.permissionDecision ?? 'ok';
  } catch { return 'ok'; }
}

const NEGAR = [
  'npx wrangler deploy',
  'npx wrangler deploy --env staging',
  'cd api && npx wrangler deploy --env staging',
  'npm test && npx wrangler pages deploy frontend/dist --project-name marquesa-dev',
  'npx wrangler versions deploy',
  'npx wrangler secret put API_KEY --env staging',
  'npx wrangler d1 delete marquesa-db-dev',
  'npx wrangler d1 time-travel restore marquesa-db-dev --timestamp=...',
  'npx wrangler d1 execute marquesa-db --remote --file=schema.sql',
  'npx wrangler d1 execute marquesa-db --local --file=schema.sql',
  'npx wrangler d1 execute marquesa-db --remote --command "SELECT 1"',
  /* O BINDING endereça o mesmo banco sem citar o nome dele. Depois do
   * go-live, produção é `marquesa-db-prod` e o binding `DB` sem `--env`
   * resolve para ela — a regra que casa por nome não veria nada aqui. */
  'npx wrangler d1 execute DB --remote --file=schema.sql',
  'cd api && npx wrangler d1 execute DB --remote --file=migracao-clientes.sql',
  'npx wrangler d1 migrations apply DB --remote',
  /* leitura pura MISTURADA com --file continua exigindo aprovação — o
   * arquivo pode conter qualquer coisa, então a presença dele manda. */
  'npx wrangler d1 execute DB --remote --command "SELECT 1" --file=schema.sql',
  /* --command que não é prova de leitura pura (mistura SELECT com algo que
   * não é) continua exigindo aprovação, mesmo sem --file. */
  'npx wrangler d1 execute DB --remote --command "SELECT 1; DELETE FROM produtos"',
  'npx wrangler d1 execute DB --remote --command "UPDATE produtos SET qtd = 0"',
  /* limitação conhecida, e do lado seguro: `segmentos()` corta em `;` sem
   * entender aspas, então um --command com DUAS statements SELECT
   * separadas por `;` chega em pedaços — nenhum se prova leitura pura
   * sozinho, e a ação cai para "exige aprovação" em vez de "leitura livre".
   * Documentado, não corrigido: escrever um parser de shell só para isto
   * custaria mais do que o caso de uso (a régua do projeto já pede um
   * `--command` por SELECT). */
  'npx wrangler d1 execute DB --remote --command "select sku from produtos; SELECT 1"',
  /* ambiente errado também não passa */
  'npx wrangler d1 execute DB --env production --remote --command "SELECT 1"',
  'npx wrangler d1 execute marquesa-db-prod --remote --command "SELECT 1"',
  'npx wrangler r2 object delete marquesa-fotos/abc.jpg',
  'npx wrangler d1 execute marquesa-db-dev --local --command "DROP TABLE produtos"',
  'npx wrangler d1 execute marquesa-db-dev --local --command "DELETE FROM produtos"',
  'npx wrangler d1 execute marquesa-db-dev --remote --command "UPDATE produtos SET qtd = 0"',
  'git push --force origin develop',
  'git push -f origin develop',
  'git push origin main',
  'git push origin HEAD:main',
  'git reset --hard HEAD~1',
  'git clean -fd',
  /* merge PARA dentro de main, sem aprovação — a direção que importa */
  'git checkout main && git merge claude/alguma-feature',
  'git switch main && git merge claude/alguma-feature',
  'git checkout -b main && git merge claude/alguma-feature',
  'git filter-branch --tree-filter x HEAD',
  'cat api/.dev.vars',
  'curl -X POST https://marquesa-api.workers.dev/api/sync -d \'{"forcar": true}\'',
  /* envelope de shell não pode virar rota de fuga */
  'bash -c "npx wrangler deploy"',
  "sh -c 'git push --force origin main'",
  'eval "npx wrangler d1 delete marquesa-db-dev"',
  'echo x | xargs npx wrangler deploy',
  'timeout 60 npx wrangler deploy',
];

const LIBERAR = [
  /* leitura e desenvolvimento normal */
  'npx wrangler d1 execute marquesa-db-dev --remote --command "SELECT COUNT(*) FROM produtos"',
  'npx wrangler d1 execute marquesa-db-dev --local --command "DELETE FROM produtos WHERE id = 3"',
  'npx wrangler d1 execute marquesa-db-dev --local --command "UPDATE produtos SET qtd = 0 WHERE sku = \'X\'"',
  'npx wrangler d1 info marquesa-db',
  'npx wrangler d1 list',
  /* o binding continua livre onde ele é seguro: `--env staging` prova o
   * ambiente, e `--local` é um SQLite dentro de api/.wrangler.
   * (com `--file` a decisão passa a depender do conteúdo do arquivo — esse
   *  caminho é coberto pelo bloco 3, não aqui) */
  'npx wrangler d1 execute DB --env staging --remote --command "SELECT COUNT(*) FROM produtos"',
  'npx wrangler d1 execute DB --local --command "SELECT 1"',
  'cd api && npx wrangler d1 execute DB --local --command "SELECT 1"',
  /* leitura pura contra o binding de PRODUÇÃO, sem --file: não muta nada,
   * liberada sem aprovação de release (§ READ-ONLY DE PRODUÇÃO) */
  'npx wrangler d1 execute DB --remote --command "SELECT 1"',
  'npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) FROM produtos"',
  'npx wrangler d1 execute DB --remote --command "PRAGMA table_info(produtos)"',
  /* export é backup — leitura, mesmo contra o binding de PRODUÇÃO */
  'npx wrangler d1 export DB --remote --output ../backups/x.sql',
  'cd api && npx wrangler d1 export DB --remote --output ../backups/y.sql',
  /* merge/push que NÃO afetam `main` continuam livres, mesma direção de
   * sempre: merge PARA FORA de main, ou push de outro branch */
  'git merge develop main',
  'git checkout develop && git merge main',
  'npx wrangler dev --local --port 8787',
  'npx wrangler dev --env staging --remote --port 8788',
  'npx wrangler pages deployment list --project-name marquesa-dev',
  'git push origin develop',
  'git push --dry-run origin develop',
  'git status --short',
  'git diff --stat',
  'git log --oneline -5',
  'node src/sync-test.mjs',
  'node src/e2e.mjs',
  'cd frontend && npm test && npm run build',
  'python src/build.py',
  'curl -s http://localhost:8787/api/health',
  'curl -s -d \'{"seco": true}\' http://localhost:8787/api/sync',
  'cat .env.example',
  /* falar sobre o comando não é rodar o comando */
  "cat > docs/x.md <<'EOF'\nO hook nega `wrangler deploy` e `git push --force`.\nEOF",
  'grep -rn "wrangler deploy" docs/',
  'grep -rn "DROP TABLE" api/',
  'rg "d1 delete" docs/',
  'echo "nao rode wrangler deploy"',
  'bash -c "npm test"',
  'timeout 60 node src/sync-test.mjs',
];

/* --------------------------------------------------------------------------
 *  Bloco 3 — conteúdo do arquivo apontado por --file
 *
 *  O alvo estar certo (`marquesa-db-dev`) não diz nada sobre o que está
 *  dentro do `.sql`. Fixturas vivem DENTRO da raiz porque a regra de caminho
 *  faz parte do que está sendo provado. São apagadas no fim.
 * ----------------------------------------------------------------------- */

const PASTA = path.join(AQUI, '__fixturas__');
const FORA = path.join(tmpdir(), 'marquesa-hook-fora.sql');

const FIXTURAS = {
  'criar.sql': 'CREATE TABLE IF NOT EXISTS teste (id INTEGER PRIMARY KEY, nome TEXT);',
  /* espelha api/migracao-catalogo.sql: migração aditiva de verdade */
  'aditiva.sql': [
    'ALTER TABLE produtos ADD COLUMN foto_original_key  TEXT;',
    'ALTER TABLE produtos ADD COLUMN foto_original_tipo TEXT;',
    'CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos(sku);',
  ].join('\n'),
  'consulta.sql': 'SELECT sku, qtd FROM produtos WHERE qtd > 0;',
  'comentario.sql': [
    '-- Este arquivo NÃO faz DROP TABLE produtos;',
    '/* nem TRUNCATE TABLE produtos; — é só texto explicando o que evitamos */',
    'CREATE TABLE IF NOT EXISTS teste (id INTEGER PRIMARY KEY);',
  ].join('\n'),
  'texto.sql': "INSERT INTO log (msg) VALUES ('DELETE FROM produtos');",
  'derruba.sql': 'DROP TABLE produtos;',
  'trunca.sql': 'TRUNCATE TABLE produtos;',
  'apaga.sql': 'DELETE FROM produtos;',
  'zera.sql': 'UPDATE produtos SET qtd = 0;',
  'substitui.sql': "REPLACE INTO produtos (sku, qtd) VALUES ('A', 1);",
  'tira-coluna.sql': 'ALTER TABLE produtos DROP COLUMN foto_original_key;',
  'renomeia.sql': 'ALTER TABLE produtos RENAME TO produtos_antigo;',
  'quase-tudo-seguro.sql': [
    'CREATE TABLE IF NOT EXISTS teste (id INTEGER PRIMARY KEY);',
    'INSERT INTO teste (id) VALUES (1);',
    'DROP TABLE produtos;            -- a única perigosa, e basta ela',
    'CREATE INDEX IF NOT EXISTS idx_teste ON teste(id);',
  ].join('\n'),
  'com espaco.sql': 'DROP TABLE produtos;',
  'seguro com espaco.sql': 'CREATE TABLE IF NOT EXISTS teste (id INTEGER PRIMARY KEY);',
};

/* [comando, decisão esperada] — sempre relativo à raiz do repositório */
const REL = '.claude/hooks/__fixturas__';
const ARQUIVO = [
  /* --------- passam: aditivo, leitura, e texto que só PARECE perigoso ---- */
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/criar.sql`, 'ok'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/aditiva.sql`, 'ok'],
  [`npx wrangler d1 execute marquesa-db-dev --remote --file ${REL}/consulta.sql`, 'ok'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=./${REL}/criar.sql`, 'ok'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/comentario.sql`, 'ok'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/texto.sql`, 'ok'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file="${REL}/seguro com espaco.sql"`, 'ok'],
  /* o caminho é relativo ao `cd`, como no fluxo real do projeto */
  ['cd api && npx wrangler d1 execute marquesa-db-dev --local --file=schema.sql', 'ok'],

  /* ----------------------------- destrutivo: bloqueado, nem pergunta ----- */
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/derruba.sql`, 'deny'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file ${REL}/derruba.sql`, 'deny'],
  [`npx wrangler d1 execute marquesa-db-dev --remote --file=${REL}/trunca.sql`, 'deny'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/tira-coluna.sql`, 'deny'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/quase-tudo-seguro.sql`, 'deny'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file="${REL}/com espaco.sql"`, 'deny'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file '${REL}/com espaco.sql'`, 'deny'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${FORA.replace(/\\/g, '/')}`, 'deny'],

  /* ------------------- duvidoso ou não conferível: decide uma pessoa ----- */
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/apaga.sql`, 'ask'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/zera.sql`, 'ask'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/substitui.sql`, 'ask'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/renomeia.sql`, 'ask'],
  [`npx wrangler d1 execute marquesa-db-dev --local --file=${REL}/nao-existe.sql`, 'ask'],

  /* --------- alvo de PRODUÇÃO continua barrado antes de olhar o arquivo -- */
  [`npx wrangler d1 execute marquesa-db --local --file=${REL}/criar.sql`, 'deny'],
];

/* ══════════════════════════════════════════════════════════════════════════
 *  Bloco 4 — Production Release Approval: o hook CONSULTA a aprovação, e os
 *  hard-deny permanentes ignoram ela por completo.
 * ══════════════════════════════════════════════════════════════════════════ */

const APROVACAO_TESTE = path.join(tmpdir(), 'marquesa-hook-aprovacao-teste.json');
const AUDITORIA_TESTE = path.join(tmpdir(), 'marquesa-hook-auditoria-teste.jsonl');
const ENV_TESTE = { MARQUESA_APROVACAO_CAMINHO: APROVACAO_TESTE, MARQUESA_AUDITORIA_CAMINHO: AUDITORIA_TESTE };
/* env "sem aprovação nenhuma": aponta para um caminho que nunca existe, em
 * vez de deixar o hook cair no caminho real de `.claude/approvals/` — assim
 * o bloco 4 nunca lê nem escreve o arquivo de aprovação de verdade. */
const ENV_SEM_APROVACAO = { MARQUESA_APROVACAO_CAMINHO: path.join(tmpdir(), 'marquesa-hook-sem-aprovacao.json') };

function shaReal() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: RAIZ }).trim();
}
function branchReal() {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', cwd: RAIZ }).trim();
}
/** Mesmo critério de `arvoreEstaLimpa` no hook: arquivo NÃO rastreado (`??`)
 *  não conta como sujeira — só modificação não commitada em arquivo que o
 *  Git já conhece. */
function arvoreRealLimpa() {
  const saida = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', cwd: RAIZ });
  return saida.split('\n').every((linha) => !linha.trim() || linha.startsWith('??'));
}
function sha256Do(caminho) {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

/** Aprovação "de referência" para os testes: válida em todo campo, cobrindo
 *  as cinco ações, para o branch/commit REAIS do repositório onde o teste
 *  está rodando — é o que faz `shaEhAncestral` e `arvoreLimpa` conferirem
 *  contra fatos verdadeiros, sem precisar de um repositório Git de mentira. */
function aprovacaoValida(overrides = {}) {
  const agora = Date.now();
  return {
    versao: 1,
    id: 'teste-integracao-release-approval',
    ambiente: 'production',
    branch: branchReal(),
    commit: shaReal(),
    acoes: Object.values(ACOES),
    criadaEm: new Date(agora - 60_000).toISOString(),
    expiraEm: new Date(agora + 3_600_000).toISOString(),
    migration: { arquivo: `${REL}/aditiva.sql`, sha256: sha256Do(path.join(PASTA, 'aditiva.sql')) },
    ...overrides,
  };
}

function escreverAprovacao(objeto) {
  writeFileSync(APROVACAO_TESTE, JSON.stringify(objeto, null, 2), 'utf8');
}

/* [comando, env, decisão esperada] — o env decide qual aprovação (se
 * alguma) o hook enxerga para este comando. */
function casosReleaseApproval() {
  const valida = aprovacaoValida();
  const expirada = aprovacaoValida({ expiraEm: new Date(Date.now() - 1000).toISOString() });
  const shaErrado = aprovacaoValida({ commit: '0'.repeat(40) });
  const migrationErrada = aprovacaoValida({ migration: { arquivo: 'api/outra-migration.sql', sha256: 'a'.repeat(64) } });
  const escopoReduzido = aprovacaoValida({ acoes: [ACOES.MERGE_MAIN] });

  return [
    /* 1. sem aprovação → as quatro categorias continuam bloqueadas, como
     *    sempre foram — nada nesta mudança afrouxa o caminho padrão. */
    ['git checkout main && git merge claude/alguma-feature', ENV_SEM_APROVACAO, 'deny'],
    ['git checkout main && git push origin main', ENV_SEM_APROVACAO, 'deny'],
    ['git checkout main && npx wrangler deploy', ENV_SEM_APROVACAO, 'deny'],
    [`git checkout main && npx wrangler d1 execute DB --remote --file=${REL}/aditiva.sql`, ENV_SEM_APROVACAO, 'deny'],

    /* 2. aprovação válida → cada uma das quatro ações passa a ser liberada */
    ['git checkout main && git merge claude/alguma-feature', valida, 'ok'],
    ['git checkout main && git push origin main', valida, 'ok'],
    ['git checkout main && npx wrangler deploy', valida, 'ok'],
    ['git checkout main && npx wrangler pages deploy frontend/dist', valida, 'ok'],
    [`git checkout main && npx wrangler d1 execute DB --remote --file=${REL}/aditiva.sql`, valida, 'ok'],

    /* 3. aprovação expirada → volta a bloquear */
    ['git checkout main && git push origin main', expirada, 'deny'],

    /* 4. SHA que não é ancestral do HEAD atual → bloqueado */
    ['git checkout main && git push origin main', shaErrado, 'deny'],

    /* 5. migration diferente da aprovada (nome OU hash) → bloqueada */
    [`git checkout main && npx wrangler d1 execute DB --remote --file=${REL}/aditiva.sql`, migrationErrada, 'deny'],
    [`git checkout main && npx wrangler d1 execute DB --remote --file=${REL}/criar.sql`, valida, 'deny'],

    /* 6. escopo: aprovação só de merge-main não libera deploy */
    ['git checkout main && npx wrangler deploy', escopoReduzido, 'deny'],
    ['git checkout main && git merge claude/alguma-feature', escopoReduzido, 'ok'],

    /* 7. HARD DENY PERMANENTE — mesmo com a aprovação VÁLIDA presente acima,
     *    estas continuam bloqueadas sem exceção. É o teste que prova que a
     *    mudança não virou desculpa para afrouxar as travas de dado físico.
     *
     *    Os dois casos de conteúdo (DROP/TRUNCATE) usam uma aprovação cujo
     *    `migration.arquivo`/`sha256` bate EXATAMENTE com o arquivo — tudo o
     *    que a camada de aprovação confere está certo. Só assim o teste prova
     *    que é a checagem de CONTEÚDO (independente de aprovação) que barra,
     *    não algum outro campo que por acaso não bateu. */
    ['git push --force origin main', valida, 'deny'],
    ['git push -f origin main', valida, 'deny'],
    ['git reset --hard HEAD~1', valida, 'deny'],
    ['git clean -fd', valida, 'deny'],
    [
      `git checkout main && npx wrangler d1 execute DB --remote --file=${REL}/derruba.sql`,
      aprovacaoValida({ migration: { arquivo: `${REL}/derruba.sql`, sha256: sha256Do(path.join(PASTA, 'derruba.sql')) } }),
      'deny', // DROP — aprovação bate 100% e ainda assim é negado
    ],
    [
      `git checkout main && npx wrangler d1 execute DB --remote --file=${REL}/trunca.sql`,
      aprovacaoValida({ migration: { arquivo: `${REL}/trunca.sql`, sha256: sha256Do(path.join(PASTA, 'trunca.sql')) } }),
      'deny', // TRUNCATE — mesma prova
    ],
    ['npx wrangler d1 delete marquesa-db-dev', valida, 'deny'],
    ['npx wrangler d1 time-travel restore marquesa-db-prod --bookmark=x', valida, 'deny'],
    ['npx wrangler secret put API_KEY', valida, 'deny'],
    ['npx wrangler rollback', valida, 'deny'],
    ['npx wrangler deploy --env staging', valida, 'deny'], // staging não é o escopo desta aprovação

    /* 8. export/backup e leitura continuam liberados SEM aprovação nenhuma
     *    — reconfirmado aqui com o env "sem aprovação" para deixar claro
     *    que não são, e nunca foram, gate de release. */
    ['npx wrangler d1 export DB --remote --output ../backups/x.sql', ENV_SEM_APROVACAO, 'ok'],
    ['npx wrangler d1 execute DB --remote --command "SELECT 1"', ENV_SEM_APROVACAO, 'ok'],
  ];
}

let falhas = 0;
const conferir = (cmd, esperado, envExtra = {}) => {
  const veio = decisao(cmd, envExtra);
  if (veio !== esperado) {
    console.log(`FALHA — esperava ${esperado}, veio ${veio}:`, cmd);
    falhas += 1;
  }
};

let releaseApprovalCasos = [];
try {
  mkdirSync(PASTA, { recursive: true });
  for (const [nome, sql] of Object.entries(FIXTURAS)) {
    writeFileSync(path.join(PASTA, nome), `${sql}\n`, 'utf8');
  }
  writeFileSync(FORA, 'CREATE TABLE IF NOT EXISTS teste (id INTEGER PRIMARY KEY);\n', 'utf8');

  for (const c of NEGAR) conferir(c, 'deny');
  for (const c of LIBERAR) conferir(c, 'ok');
  for (const [c, esperado] of ARQUIVO) conferir(c, esperado);

  if (!arvoreRealLimpa()) {
    console.log('AVISO: há arquivo RASTREADO com mudança não commitada — o bloco 4 '
      + '(Release Approval) pode falhar nos casos "aprovação válida" por causa disso, '
      + 'não por bug no hook. Faça commit/stash e rode de novo para um veredito limpo.');
  }
  releaseApprovalCasos = casosReleaseApproval();
  for (const [cmd, aprov, esperado] of releaseApprovalCasos) {
    if (aprov !== ENV_SEM_APROVACAO) escreverAprovacao(aprov);
    conferir(cmd, esperado, aprov === ENV_SEM_APROVACAO ? ENV_SEM_APROVACAO : ENV_TESTE);
    rmSync(APROVACAO_TESTE, { force: true });
  }
} finally {
  rmSync(PASTA, { recursive: true, force: true });
  rmSync(FORA, { force: true });
  rmSync(APROVACAO_TESTE, { force: true });
  rmSync(AUDITORIA_TESTE, { force: true });
}

const total = NEGAR.length + LIBERAR.length + ARQUIVO.length;
console.log(falhas === 0
  ? `ok — ${total} casos (${NEGAR.length} comandos negados, ${LIBERAR.length} liberados, `
    + `${ARQUIVO.length} de conteúdo de --file)`
  : `${falhas} FALHA(S) em ${total} casos`);
process.exit(falhas ? 1 : 0);
