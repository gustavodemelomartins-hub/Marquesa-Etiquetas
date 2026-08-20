#!/usr/bin/env node
/** Prova o hook de proteção. Rode depois de qualquer mudança nele:
 *
 *      node .claude/hooks/protect-production.test.mjs
 *
 *  Três blocos. O segundo importa tanto quanto o primeiro: hook que atrapalha
 *  trabalho normal acaba desligado, e aí não protege nada. O terceiro cuida
 *  do conteúdo dos arquivos `.sql`, onde o alvo certo não prova nada.
 *
 *  Sem framework, no estilo dos outros testes do projeto: imprime `ok` /
 *  `FALHA` e sai com 1 se falhou. Node puro, portátil.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(AQUI, 'protect-production.mjs');
const RAIZ = path.resolve(AQUI, '..', '..');

/** Devolve 'deny', 'ask' ou 'ok' — silêncio do hook é 'ok'. */
function decisao(cmd) {
  const saida = execFileSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
    encoding: 'utf8',
    cwd: RAIZ,
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
  'git merge develop main',
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

let falhas = 0;
const conferir = (cmd, esperado) => {
  const veio = decisao(cmd);
  if (veio !== esperado) {
    console.log(`FALHA — esperava ${esperado}, veio ${veio}:`, cmd);
    falhas += 1;
  }
};

try {
  mkdirSync(PASTA, { recursive: true });
  for (const [nome, sql] of Object.entries(FIXTURAS)) {
    writeFileSync(path.join(PASTA, nome), `${sql}\n`, 'utf8');
  }
  writeFileSync(FORA, 'CREATE TABLE IF NOT EXISTS teste (id INTEGER PRIMARY KEY);\n', 'utf8');

  for (const c of NEGAR) conferir(c, 'deny');
  for (const c of LIBERAR) conferir(c, 'ok');
  for (const [c, esperado] of ARQUIVO) conferir(c, esperado);
} finally {
  rmSync(PASTA, { recursive: true, force: true });
  rmSync(FORA, { force: true });
}

const total = NEGAR.length + LIBERAR.length + ARQUIVO.length;
console.log(falhas === 0
  ? `ok — ${total} casos (${NEGAR.length} comandos negados, ${LIBERAR.length} liberados, `
    + `${ARQUIVO.length} de conteúdo de --file)`
  : `${falhas} FALHA(S) em ${total} casos`);
process.exit(falhas ? 1 : 0);
