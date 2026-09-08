#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(raiz, arquivo), 'utf8');
let ok = 0;
let falhas = 0;

function t(nome, condicao) {
  if (condicao) ok += 1;
  else { falhas += 1; console.error(`FALHA: ${nome}`); }
}

const settings = JSON.parse(ler('.claude/settings.json'));
const allow = new Set(settings.permissions.allow);
const ask = new Set(settings.permissions.ask);

for (const regra of [
  'Bash(npx wrangler deploy:*)',
  'Bash(npx wrangler d1 migrations apply DB --remote:*)',
  'Bash(npx wrangler secret put:*)',
  'Bash(npx wrangler rollback:*)',
  'Edit(api/schema.sql)',
  'Edit(api/wrangler.toml)',
  'Edit(.github/workflows/**)',
  'Edit(.codex/**)',
  'Edit(.agents/**)',
  'Write(api/migracao-*.sql)',
]) {
  t(`Classe C/configuração liberada em settings: ${regra}`, allow.has(regra) && !ask.has(regra));
}

function decisao(command) {
  const hook = path.join(raiz, '.claude/hooks/protect-production.mjs');
  const r = spawnSync(process.execPath, [hook], {
    cwd: raiz,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
  if (r.status !== 0) return `erro:${r.status}`;
  if (!r.stdout.trim()) return 'allow';
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

for (const command of [
  'git push origin main',
  'npx wrangler deploy',
  'npx wrangler d1 execute DB --remote --file=api/migracao-publicacao-catalogo.sql',
  'npx wrangler secret put API_KEY',
]) t(`Classe C autônoma: ${command}`, decisao(command) === 'allow');

for (const command of [
  'git push --force origin main',
  'git reset --hard HEAD~1',
  'npx wrangler d1 delete marquesa-db-prod',
  'npx wrangler d1 execute DB --remote --command "DROP TABLE produtos"',
]) t(`Classe D pede decisão: ${command}`, decisao(command) === 'ask');

for (const command of ['cat api/.dev.vars', 'head backups/prod.sql']) {
  t(`segredo/dado real negado: ${command}`, decisao(command) === 'deny');
}

for (const arquivo of [
  '.claude/hooks/lib/release-approval.mjs',
  '.claude/hooks/lib/release-approval.test.mjs',
  '.claude/approvals/README.md',
  '.claude/approvals/EXEMPLO.json',
]) t(`legado removido: ${arquivo}`, !existsSync(path.join(raiz, arquivo)));

const security = ler('docs/SECURITY.md');
const agents = ler('AGENTS.md');
const claude = ler('CLAUDE.md');
t('SECURITY declara production-first', /production-first/i.test(security));
t('SECURITY identifica marquesa-db-prod', security.includes('marquesa-db-prod'));
t('roteadores declaram a mesma hierarquia', agents.includes('## Hierarquia de instruções')
  && claude.includes('## Hierarquia de instruções'));

console.log(falhas ? `${falhas} FALHA(S) em ${ok + falhas} casos` : `ok — ${ok} casos`);
process.exit(falhas ? 1 : 0);
