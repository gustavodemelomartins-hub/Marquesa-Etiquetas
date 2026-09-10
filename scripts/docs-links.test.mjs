#!/usr/bin/env node
// Gate de documentação: nenhum link nem referência de caminho pode apontar para
// arquivo inexistente. Existe para que a taxonomia de docs/ possa ser
// reorganizada sem transformar documento em beco sem saída.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Caminhos citados de propósito como história: artefatos removidos, exemplos e
// arquivos locais não versionados. Citar não é prometer que existe hoje.
const REFERENCIAS_HISTORICAS = new Set([
  '.claude/approvals/README.md',
  '.claude/approvals/EXEMPLO.json',
  '.claude/approvals/production-release.json',
  '.claude/hooks/lib/release-approval.mjs',
  '.claude/hooks/lib/release-approval.test.mjs',
  '.claude/settings.local.json',
  'docs/x.md',
  // Suíte aposentada, citada riscada em docs/BASELINE.md.
  'src/import-casa-test.mjs',
  // Amostra local opcional: docs/TESTING.md descreve o caso em que não existe.
  'src/__dados__/vendas-historico.json',
]);

const arquivos = execFileSync('git', ['ls-files', '*.md'], { cwd: raiz, encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

const linkMarkdown = /\[[^\]]*\]\(([^)\s]+)\)/g;
// Extensões da mais longa para a mais curta: `json` não pode casar como `js`.
const mencaoDeCaminho = /(?:^|[\s`(\[<"'|])((?:docs|api|src|frontend|scripts|\.claude)\/[A-Za-z0-9_./-]*\.(?:mjs|json|html|toml|sql|md|js|py))(?![A-Za-z0-9])/g;

const falhas = [];
let links = 0;
let mencoes = 0;

for (const arquivo of arquivos) {
  const texto = readFileSync(path.join(raiz, arquivo), 'utf8');

  for (const achado of texto.matchAll(linkMarkdown)) {
    const alvo = achado[1];
    if (/^(https?:|mailto:|#)/.test(alvo)) continue;
    links += 1;
    const destino = path.resolve(raiz, path.dirname(arquivo), alvo.split('#')[0]);
    if (!existsSync(destino)) falhas.push(`${arquivo}: link quebrado -> ${alvo}`);
  }

  for (const achado of texto.matchAll(mencaoDeCaminho)) {
    const alvo = achado[1];
    mencoes += 1;
    if (REFERENCIAS_HISTORICAS.has(alvo)) continue;
    if (!existsSync(path.join(raiz, alvo))) falhas.push(`${arquivo}: caminho inexistente -> ${alvo}`);
  }
}

if (falhas.length) {
  for (const falha of falhas) console.error(`FALHA: ${falha}`);
  console.error(`${falhas.length} referência(s) quebrada(s) em ${arquivos.length} documentos`);
  process.exit(1);
}

console.log(`Documentação: ok — ${arquivos.length} documentos, ${links} links e ${mencoes} caminhos citados`);
