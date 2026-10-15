import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'docs', 'testing', 'test-suites.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const level = process.argv[2] || 'release';
const known = new Set(['list', ...manifest.levels.map((item) => item.id)]);

if (!known.has(level)) {
  console.error(`Nível desconhecido: ${level}. Use: ${[...known].join(', ')}`);
  process.exit(2);
}

const forbidden = /(?:--remote\b|wrangler\s+(?:deploy|d1\s+execute[^\n]*--remote)|git\s+push\b|npm\s+publish\b|marquesa-api\.marquesaetiquetas\.workers\.dev)/i;
for (const suite of manifest.suites) {
  for (const command of suite.commands || []) {
    const rendered = [command.bin, ...(command.args || [])].join(' ');
    if (forbidden.test(rendered)) {
      throw new Error(`Comando proibido no manifesto (${suite.id}): ${rendered}`);
    }
  }
}

if (level === 'list') {
  for (const suite of manifest.suites) {
    console.log(`${suite.id}\t${suite.level}\t${suite.mode}\t${suite.description}`);
  }
  process.exit(0);
}

const selected = manifest.suites.filter((suite) => suite.gates?.includes(level));
if (!selected.length) {
  const meta = manifest.levels.find((item) => item.id === level);
  console.log(`${meta.label}: nenhum gate automático. ${meta.howToRun}`);
  process.exit(0);
}

let failed = 0;
for (const suite of selected) {
  console.log(`\n[baseline] ${suite.id} — ${suite.description}`);
  for (const command of suite.commands) {
    const cwd = path.resolve(root, command.cwd || '.');
    let bin = command.bin;
    let args = command.args || [];
    if (bin === 'npm') {
      const bundledNpm = path.resolve(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      const npmCli = process.env.npm_execpath || (existsSync(bundledNpm) ? bundledNpm : null);
      if (npmCli) {
        bin = process.execPath;
        args = [npmCli, ...args];
      }
    }
    if (bin === 'python' && process.platform !== 'win32') bin = 'python3';
    const result = spawnSync(bin, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, CI: process.env.CI || '1' },
    });
    if (result.error || result.status !== 0) {
      console.error(`[baseline] FALHOU: ${suite.id}${result.error ? ` (${result.error.message})` : ''}`);
      failed += 1;
      break;
    }
  }
}

console.log(`\n[baseline] ${selected.length - failed}/${selected.length} gates aprovados no nível ${level}.`);
process.exit(failed ? 1 : 0);
