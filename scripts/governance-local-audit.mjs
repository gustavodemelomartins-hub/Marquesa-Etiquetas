#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => readFileSync(path.join(raiz, arquivo), 'utf8');
const hash = (arquivo) => createHash('sha256').update(ler(arquivo)).digest('hex');
const problemas = [];

/* O nome de UM clone errado não é a regra; a regra é que nenhum caminho da
   máquina de quem commitou pode entrar na configuração versionada. Um clone
   novo, uma worktree ou o WSL têm outro caminho, e a proteção calaria em
   silêncio. O hook resolve tudo a partir de `process.cwd()`, então o caminho
   relativo ao repositório é a forma portátil — a mesma que
   `.claude/settings.json` já usa. */
const hooksConfig = '.codex/hooks.json';
if (!existsSync(path.join(raiz, hooksConfig))) {
  problemas.push(`${hooksConfig} ausente`);
} else {
  let comandos = [];
  try {
    const cfg = JSON.parse(ler(hooksConfig));
    comandos = Object.values(cfg.hooks ?? {})
      .flat()
      .flatMap((entrada) => entrada?.hooks ?? [])
      .map((gancho) => String(gancho?.command ?? ''));
  } catch {
    problemas.push(`${hooksConfig} não é JSON legível`);
  }
  if (comandos.length === 0) problemas.push(`${hooksConfig} não declara nenhum hook`);
  for (const comando of comandos) {
    if (/(?:^|[\s'"])(?:[A-Za-z]:[\\/]|[\\/]{1,2}[A-Za-z])/.test(comando)) {
      problemas.push(`${hooksConfig}: caminho absoluto desta máquina em "${comando}"`);
    }
  }
  for (const alvo of ['.codex/hooks/protect-production.mjs', '.codex/hooks/verify-before-stop.mjs']) {
    if (!comandos.some((c) => c.includes(alvo))) problemas.push(`${hooksConfig} não aciona ${alvo}`);
  }
}

function decisao(hookRelativo, command) {
  const r = spawnSync(process.execPath, [path.join(raiz, hookRelativo)], {
    cwd: raiz,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
  if (r.status !== 0) return `erro:${r.status}`;
  if (!r.stdout.trim()) return 'allow';
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

/* O adaptador do Codex tem que decidir igual ao do Claude, inclusive quanto
   ao DESTINO: DEV segue autônomo, produção congelada pede decisão humana, e
   Classe D pede sempre. */
const congelada = (() => {
  try { return JSON.parse(ler('.claude/governanca.json')).prodCongelada !== false; }
  catch { return true; }
})();

const matriz = [
  ['git push origin develop', 'allow'],
  ['npx wrangler deploy --env staging', 'allow'],
  ['npx wrangler d1 execute marquesa-db-dev --remote --file=api/migracao-publicacao-catalogo.sql', 'allow'],
  ['npx wrangler secret put API_KEY --env staging', 'allow'],
  ['git push origin main', congelada ? 'ask' : 'allow'],
  ['npx wrangler deploy', congelada ? 'ask' : 'allow'],
  ['npx wrangler d1 execute DB --remote --file=api/migracao-publicacao-catalogo.sql', congelada ? 'ask' : 'allow'],
  ['npx wrangler secret put API_KEY', congelada ? 'ask' : 'allow'],
  ['git push --force origin main', 'ask'],
  ['npx wrangler d1 execute DB --env staging --remote --command "DROP TABLE produtos"', 'ask'],
  ['cat api/.dev.vars', 'deny'],
];

const hookCodex = '.codex/hooks/protect-production.mjs';
if (!existsSync(path.join(raiz, hookCodex))) {
  problemas.push(`${hookCodex} ausente`);
} else {
  for (const [command, esperado] of matriz) {
    const atual = decisao(hookCodex, command);
    if (atual !== esperado) problemas.push(`hook Codex: ${command} => ${atual}; esperado ${esperado}`);
  }
}

const skillsClaude = path.join(raiz, '.claude/skills');
for (const entrada of readdirSync(skillsClaude, { withFileTypes: true })) {
  if (!entrada.isDirectory()) continue;
  const c = `.claude/skills/${entrada.name}/SKILL.md`;
  const a = `.agents/skills/${entrada.name}/SKILL.md`;
  if (!existsSync(path.join(raiz, a))) problemas.push(`skill Codex ausente: ${a}`);
  else if (hash(c) !== hash(a)) problemas.push(`skill Codex divergente: ${entrada.name}`);
}

const guardian = '.codex/agents/database-guardian.toml';
if (!existsSync(path.join(raiz, guardian))) {
  problemas.push(`${guardian} ausente`);
} else if (!/marquesa-db-prod/.test(ler(guardian))) {
  problemas.push('database-guardian do Codex ainda identifica o banco antigo como produção');
}

if (problemas.length) {
  console.error(`DIVERGENTE — ${problemas.length} problema(s) locais:`);
  for (const problema of problemas) console.error(`- ${problema}`);
  process.exit(1);
}

console.log('ok — adaptadores locais Codex coerentes com a governança versionada');
