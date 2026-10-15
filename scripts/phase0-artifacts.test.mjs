import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('docs/testing/test-suites.json', 'utf8'));
const routes = readFileSync('docs/architecture/API-ROUTES-BASELINE.md', 'utf8');
const worker = readFileSync('api/src/index.js', 'utf8');
const forbidden = /--remote\b|wrangler\s+deploy|git\s+push|marquesa-api\.marquesaetiquetas\.workers\.dev/i;

assert.equal(manifest.schemaVersion, 1);
assert.deepEqual(manifest.levels.map((item) => item.id), ['fast', 'domain', 'integration', 'browser', 'release']);
for (const suite of manifest.suites) {
  for (const command of suite.commands || []) {
    assert.ok(!forbidden.test([command.bin, ...(command.args || [])].join(' ')), `comando inseguro: ${suite.id}`);
  }
}
const catalogued = new Set(manifest.suites.flatMap((suite) => [
  ...(suite.files || []),
  ...(suite.commands || []).flatMap((command) => (command.args || [])
    .filter((arg) => arg.endsWith('.mjs')).map((arg) => arg.split('/').pop())),
]));
const sourceSuites = readdirSync('src').filter((name) => name.endsWith('-test.mjs') || name === 'e2e.mjs' || name.endsWith('-e2e.mjs'));
assert.deepEqual(sourceSuites.filter((name) => !catalogued.has(name)), [], 'há suítes sem classificação no manifesto');

const lines = worker.split(/\r?\n/);
const dispatchConditions = [];
for (let i = 0; i < lines.length; i += 1) {
  if (!/^\s*if\s*\(/.test(lines[i])) continue;
  let condition = lines[i];
  while (!condition.includes('{') && i + 1 < lines.length) condition += ` ${lines[++i]}`;
  if (/\bpath\b/.test(condition)) dispatchConditions.push(condition);
}
/* A Fase 0 fixou 132 decisões de rota dentro do despachante. A Fase 2 as
   move para `api/src/http/routes/`, então o número só pode cair: quem prova
   que nenhum contrato se perdeu no caminho é scripts/api-contracts.test.mjs,
   que compara o conjunto inteiro com o inventário versionado. Aqui fica
   apenas o freio contra crescer de novo. */
assert.ok(dispatchConditions.length <= 132,
  `o despachante cresceu para ${dispatchConditions.length}; rota nova nasce em api/src/http/routes/`);
for (const marker of ['/api/health', '/api/state', '/api/sync', '/api/reconciliacao', '/api/inventarios', '/api/vendas']) {
  assert.ok(routes.includes(marker), `rota sentinela ausente: ${marker}`);
}
assert.match(routes, /142 contratos método\/caminho/);
console.log('Phase 0 artifacts: OK');
