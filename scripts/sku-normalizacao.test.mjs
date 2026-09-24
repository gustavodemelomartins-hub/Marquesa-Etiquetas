/** Fase 4, item 2 — uma resposta só para "qual é o código desta peça?".
 *
 *  REGRA DE NEGÓCIO (decidida por Gustavo em 10/09/2026):
 *
 *      Espaço interno não diferencia SKU na Marquesa.
 *      `BR1234` e `BR 1234` são a MESMA identidade.
 *
 *  Antes desta decisão havia 23 normalizações de SKU espalhadas pelo
 *  backend: seis funções chamadas `normSku`, uma por arquivo, e dezessete
 *  `String(x).trim().toUpperCase()` soltos dentro de outras funções.
 *  Dezenove delas preservavam o espaço do meio — as quatro canônicas eram
 *  `sku.js`, `variantes.js`, `produtos.js` e `catalogo.js`. A diferença não
 *  dava erro em lugar nenhum: dava peça que não casa.
 *
 *  Agora existe UMA: `sku.js › normSku`. Este teste é o que impede a lista
 *  de voltar a crescer.
 *
 *  Os defeitos que ele existe para impedir:
 *
 *   1. uma segunda definição de `normSku` aparecer em qualquer módulo;
 *   2. alguém normalizar um código à mão com `.trim().toUpperCase()`, que é
 *      a forma exata que preservava o espaço interno;
 *   3. a canônica deixar de valer a regra de negócio;
 *   4. `0` virar ausente, ou ausente virar outra coisa que não string vazia;
 *   5. as reexportações apontarem para funções diferentes;
 *   6. a normalização em JavaScript deixar de espelhar a expressão do índice
 *      `idx_produtos_sku_norm` — o SQLite só usa um índice de expressão
 *      quando a consulta repete a expressão igual, caractere por caractere.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normSku as canonica } from '../api/src/sku.js';
import { normSku as deProdutos } from '../api/src/produtos.js';
import { normSku as deVariantes } from '../api/src/variantes.js';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FONTE = join(RAIZ, 'api', 'src');
const DONO = 'api/src/sku.js';

/** Módulos que podem REEXPORTAR o nome, porque ele já fazia parte da
 *  superfície deles quando outros módulos passaram a importá-lo de lá.
 *  Reexportar é apontar para a mesma função — não é uma segunda definição. */
const REEXPORTAM = new Set(['api/src/produtos.js', 'api/src/variantes.js']);

/** Nenhuma exceção. Se aparecer uma necessidade real de normalizar um
 *  código de outro jeito, ela entra aqui com o motivo — e isso obriga
 *  alguém a decidir, em vez de a lista crescer sozinha. */
const EXCECOES_TRIM_UPPER = {};

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return caminho.endsWith('.js') ? [caminho] : [];
  });
}

const falhas = [];
const linhaDe = (texto, pos) => texto.slice(0, pos).split('\n').length;

const fontes = arquivos(FONTE).map((caminho) => ({
  rel: relative(RAIZ, caminho).replace(/\\/g, '/'),
  texto: readFileSync(caminho, 'utf8'),
}));

let definicoes = 0;
for (const { rel, texto } of fontes) {
  /* 1 — uma definição só. */
  for (const m of texto.matchAll(/(?:export\s+)?const\s+normSku\s*=/g)) {
    definicoes += 1;
    if (rel !== DONO) {
      falhas.push(`${rel}:${linhaDe(texto, m.index)}: segunda definição de normSku.\n`
        + `        A única mora em ${DONO}. Importe de lá — ou reexporte, se o nome já `
        + 'fazia parte da superfície deste módulo.');
    }
  }

  /* Reexportação só nos módulos declarados. */
  for (const m of texto.matchAll(/export\s*\{\s*normSku\s*\}\s*from/g)) {
    if (!REEXPORTAM.has(rel)) {
      falhas.push(`${rel}:${linhaDe(texto, m.index)}: reexporta normSku sem estar declarado.\n`
        + '        Reexportar espalha o nome; quem precisa dele importa de sku.js.');
    }
  }

  /* 2 — a forma que preservava o espaço interno. */
  for (const m of texto.matchAll(/\.trim\(\)\s*\.toUpperCase\(\)|\.toUpperCase\(\)\s*\.trim\(\)/g)) {
    if (EXCECOES_TRIM_UPPER[rel]) continue;
    falhas.push(`${rel}:${linhaDe(texto, m.index)}: normalização de código à mão.\n`
      + '        `.trim().toUpperCase()` é exatamente a forma que preserva o espaço do meio.\n'
      + '        Use normSku() — espaço interno não diferencia SKU (regra de 10/09/2026).');
  }

  /* Quem usa, importa. */
  const usa = /\bnormSku\s*\(/.test(texto);
  const declara = rel === DONO || /import\s*\{[^}]*\bnormSku\b[^}]*\}\s*from/.test(texto);
  if (usa && !declara) {
    falhas.push(`${rel}: usa normSku() sem importar.`);
  }
}

if (definicoes !== 1) {
  falhas.push(`Existem ${definicoes} definições de normSku. Tem de existir exatamente 1.`);
}

/* 3 — a regra de negócio, exercitada. */
const MESMA_IDENTIDADE = [
  ['BR1234', 'BR 1234'],
  ['BR1234', ' br1234 '],
  ['BR1234', 'br 12 34'],
  ['BR1234', '\tBR\t1234 '],
  ['BR1234', 'BR' + String.fromCharCode(160) + '1234'],  // espaço sem quebra, o que sai de planilha
  ['100633', '10 06 33'],
];
for (const [a, b] of MESMA_IDENTIDADE) {
  if (canonica(a) !== canonica(b)) {
    falhas.push(`A regra de negócio quebrou: ${JSON.stringify(a)} e ${JSON.stringify(b)} `
      + `deveriam ser a mesma identidade, viraram ${JSON.stringify(canonica(a))} `
      + `e ${JSON.stringify(canonica(b))}.`);
  }
}

/* Códigos realmente diferentes continuam diferentes. */
const DIFERENTES = [['BR1234', 'BR1235'], ['BR1234', 'BR123'], ['100633', '100634']];
for (const [a, b] of DIFERENTES) {
  if (canonica(a) === canonica(b)) {
    falhas.push(`${JSON.stringify(a)} e ${JSON.stringify(b)} viraram o mesmo código.`);
  }
}

/* 4 — ausente e zero. */
if (canonica(0) !== '0') falhas.push(`normSku(0) virou ${JSON.stringify(canonica(0))} em vez de "0".`);
for (const ausente of [null, undefined, '', '   ']) {
  if (canonica(ausente) !== '') {
    falhas.push(`normSku(${JSON.stringify(ausente)}) deixou de ser string vazia.`);
  }
}

/* 5 — as reexportações são a MESMA função, não uma cópia parecida. */
if (deProdutos !== canonica) falhas.push('produtos.js reexporta uma função diferente da de sku.js.');
if (deVariantes !== canonica) falhas.push('variantes.js reexporta uma função diferente da de sku.js.');

/* 6 — o espelho em SQL. */
const skuJs = fontes.find((f) => f.rel === DONO).texto;
for (const pedaco of ["' '", 'CHAR(9)', 'CHAR(160)', 'UPPER(']) {
  if (!skuJs.includes(pedaco)) {
    falhas.push(`sku.js: SQL_NORM perdeu ${pedaco} — o índice idx_produtos_sku_norm `
      + 'deixaria de ser usado, e a checagem de unicidade viraria varredura da tabela.');
  }
}

if (falhas.length) {
  console.error('Normalização de SKU: REPROVADO\n');
  for (const f of falhas) console.error('  ' + f);
  console.error('\nRegra: espaço interno não diferencia SKU. Ver docs/domains/SKU-NORMALIZACAO.md.');
  process.exit(1);
}

console.log(`Normalização de SKU: ok — uma definição (${DONO}), `
  + `${REEXPORTAM.size} reexportações apontando para ela, `
  + `${fontes.length} módulos varridos, nenhuma normalização à mão.`);
