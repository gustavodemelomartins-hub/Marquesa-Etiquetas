#!/usr/bin/env node
/** Prova o hook de proteção. Rode depois de qualquer mudança nele:
 *
 *      node .claude/hooks/protect-production.test.mjs
 *
 *  Duas listas. A de baixo importa tanto quanto a de cima: hook que atrapalha
 *  trabalho normal acaba desligado, e aí não protege nada.
 *
 *  Sem framework, no estilo dos outros testes do projeto: imprime `ok` /
 *  `FALHA` e sai com 1 se falhou. Node puro, portátil.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(AQUI, 'protect-production.mjs');

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

const negado = (cmd) => execFileSync('node', [HOOK], {
  input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
  encoding: 'utf8',
}).includes('"deny"');

let falhas = 0;
for (const c of NEGAR) {
  if (!negado(c)) { console.log('FALHA — devia NEGAR:', c); falhas += 1; }
}
for (const c of LIBERAR) {
  if (negado(c)) { console.log('FALHA — devia LIBERAR:', c); falhas += 1; }
}

const total = NEGAR.length + LIBERAR.length;
console.log(falhas === 0
  ? `ok — ${total} casos (${NEGAR.length} negados, ${LIBERAR.length} liberados)`
  : `${falhas} FALHA(S) em ${total} casos`);
process.exit(falhas ? 1 : 0);
