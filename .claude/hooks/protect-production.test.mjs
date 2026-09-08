#!/usr/bin/env node
/** Prova a governança production-first do hook. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(aqui, 'protect-production.mjs');
const raiz = path.resolve(aqui, '..', '..');
let ok = 0;
let falhas = 0;

function decisao(command) {
  const r = spawnSync(process.execPath, [hook], {
    cwd: raiz,
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  if (r.status !== 0) return `erro:${r.status}:${r.stderr}`;
  if (!r.stdout.trim()) return 'allow';
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; }
  catch { return `json-invalido:${r.stdout}`; }
}

function t(nome, atual, esperado) {
  if (atual === esperado) ok += 1;
  else { falhas += 1; console.log(`FALHA: ${nome} — esperado ${esperado}, veio ${atual}`); }
}

console.log('\n1. Classe C é autônoma');
for (const cmd of [
  'git push origin main',
  'git checkout main && git merge codex/release',
  'npx wrangler deploy',
  'npx wrangler deploy --env staging',
  'npx wrangler pages deploy . --project-name marquesa',
  'npx wrangler d1 execute DB --remote --file=api/migracao-publicacao-catalogo.sql',
  'npx wrangler d1 execute marquesa-db-prod --remote --command "SELECT 1"',
  'npx wrangler d1 time-travel restore marquesa-db-prod --timestamp=2026-09-08T10:00:00Z',
  'npx wrangler rollback',
  'npx wrangler secret put API_KEY',
]) t(cmd, decisao(cmd), 'allow');

console.log('\n2. Classe D pede decisão humana explícita');
for (const cmd of [
  'git push --force origin main',
  'git reset --hard HEAD~1',
  'git clean -fd',
  'npx wrangler d1 delete marquesa-db-prod',
  'npx wrangler delete marquesa-api',
  'npx wrangler d1 execute DB --remote --command "DELETE FROM produtos"',
  'npx wrangler d1 execute DB --remote --command "DROP TABLE produtos"',
  'curl -X POST https://marquesa-api.workers.dev/api/sync -d \'{"forcar":true}\'',
]) t(cmd, decisao(cmd), 'ask');

console.log('\n3. Segredos e dados reais continuam fora do contexto');
for (const cmd of ['cat api/.dev.vars', 'type .env', 'head backups/prod.sql']) {
  t(cmd, decisao(cmd), 'deny');
}
t('arquivo example é público', decisao('cat api/.dev.vars.example'), 'allow');
t('documentar comando não executa comando', decisao("cat > docs/x.md <<'EOF'\nnpx wrangler deploy\nEOF"), 'allow');

console.log(falhas ? `\n${falhas} FALHA(S) em ${ok + falhas} casos\n` : `\nok — ${ok} casos\n`);
process.exit(falhas ? 1 : 0);
