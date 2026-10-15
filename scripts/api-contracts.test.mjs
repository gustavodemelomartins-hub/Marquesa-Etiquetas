#!/usr/bin/env node
// Contrato antes = contrato depois.
//
// O strangler move rota de lugar; o que ele não pode fazer é mudar método,
// caminho ou exigência de chave. Este gate compara o que o código serve hoje
// com o inventário versionado em docs/architecture/api-contracts.json. Se a
// diferença for intencional, ela é decisão de contrato público — atualize o
// inventário no mesmo commit e diga por quê.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerContratos } from './lib/api-contracts.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifesto = JSON.parse(readFileSync(path.join(raiz, 'docs/architecture/api-contracts.json'), 'utf8'));

const esperado = new Map(manifesto.contratos.map((item) => [item.contrato, item.auth]));
const servido = new Map(lerContratos(raiz).map((item) => [item.contrato, item.auth]));

const falhas = [];
for (const [contrato, auth] of esperado) {
  if (!servido.has(contrato)) falhas.push(`contrato sumiu do código: ${contrato}`);
  else if (servido.get(contrato) !== auth) {
    falhas.push(`autenticação mudou em ${contrato}: ${auth} -> ${servido.get(contrato)}`);
  }
}
for (const contrato of servido.keys()) {
  if (!esperado.has(contrato)) falhas.push(`contrato novo sem inventário: ${contrato}`);
}
if (manifesto.total !== manifesto.contratos.length) {
  falhas.push(`total declarado (${manifesto.total}) não bate com a lista (${manifesto.contratos.length})`);
}

if (falhas.length) {
  for (const falha of falhas) console.error(`FALHA: ${falha}`);
  process.exit(1);
}

const publicos = [...servido.values()].filter((auth) => auth === 'sem-bearer').length;
console.log(`Contratos HTTP: ok — ${servido.size} preservados, ${publicos} sem Bearer`);
