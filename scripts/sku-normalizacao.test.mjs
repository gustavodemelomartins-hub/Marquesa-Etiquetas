/** Fase 4, item 2 — quantas respostas o sistema tem para "qual é o código
 *  desta peça?".
 *
 *  A resposta deveria ser uma. São OITO: seis funções chamadas `normSku`,
 *  cada uma escrita no seu arquivo, mais duas normalizações soltas dentro
 *  de outras funções. Elas não são todas iguais, e a diferença entre elas
 *  não dá erro em lugar nenhum — dá peça que não casa.
 *
 *  Quatro removem o espaço INTERNO: `BR 1234` vira `BR1234`. Quatro só
 *  aparam as pontas e passam para maiúsculas: `BR 1234` continua
 *  `BR 1234`, e nunca casa com o código guardado.
 *
 *  Este teste é um INVENTÁRIO, não uma correção. Ele não muda comportamento
 *  nenhum: ele impede que a lista cresça sem alguém decidir, e obriga a
 *  declaração a bater com o código. Mexer numa destas linhas sem atualizar
 *  a lista reprova aqui — que é exatamente o momento certo de decidir.
 *
 *  O comentário de cabeçalho de `sku.js` já descrevia este risco em 2026:
 *  "duas linhas, dois estoques, e só uma delas casando com a loja — a outra
 *  vira peça fantasma que ninguém encontra". A lista abaixo mostra onde ele
 *  ainda está de pé.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normSku as canonica } from '../api/src/sku.js';
import { normSku as deProdutos } from '../api/src/produtos.js';
import { normSku as deVariantes } from '../api/src/variantes.js';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Cada normalização de SKU que existe hoje, com o que ela faz com o espaço
 *  do MEIO do código e o que isso significa quando ela erra.
 *
 *  `interna: 'remove'`   → concorda com `sku.js`, que é a canônica;
 *  `interna: 'preserva'` → diverge, e a coluna `consequencia` diz onde. */
const INVENTARIO = [
  {
    onde: 'api/src/sku.js',
    trecho: "export const normSku = (v) => String(v == null ? '' : v)",
    seguinte: ".trim().replace(/[\\s\\u00a0]+/g, '').toUpperCase();",
    interna: 'remove',
    papel: 'A CANÔNICA. Espelha a expressão do índice `idx_produtos_sku_norm`.',
  },
  {
    onde: 'api/src/variantes.js',
    trecho: "export const normSku = (v) => String(v == null ? '' : v).trim().replace(/\\s+/g, '').toUpperCase();",
    interna: 'remove',
    papel: 'Escreve `loja_variantes.sku_norm` — a chave por onde a venda acha a variação.',
  },
  {
    onde: 'api/src/produtos.js',
    trecho: "export const normSku = (v) => String(v == null ? '' : v).trim().replace(/[\\s",
    interna: 'remove',
    papel: 'Apagar, arquivar e conferir dependências de uma peça.',
  },
  {
    onde: 'api/src/catalogo.js',
    trecho: "const normSku = (v) => texto(v).replace(/\\s+/g, '').toUpperCase();",
    interna: 'remove',
    papel: 'Importação de planilha e cadastro — é o que grava `produtos.sku`.',
  },
  {
    onde: 'api/src/fotos.js',
    trecho: "const normSku = (v) => String(v == null ? '' : v).trim().toUpperCase();",
    interna: 'preserva',
    papel: 'Indexa `loja_fotos.sku_norm` e responde `/api/fotos/:sku`.',
    consequencia:
      'Um código digitado na loja com espaço no meio é indexado aqui como "BR 1234" '
      + 'enquanto `loja_variantes.sku_norm` guarda "BR1234". A foto existe e nunca '
      + 'chega na peça.',
  },
  {
    onde: 'api/src/publicacao-catalogo.js',
    trecho: "const normSku = (v) => String(v == null ? '' : v).trim().toUpperCase();",
    interna: 'preserva',
    papel: 'Fila de publicação do catálogo.',
    consequencia: 'Mesma divergência da de fotos, no caminho da publicação.',
  },
  {
    onde: 'api/src/nuvemshop.js',
    trecho: ".map(v => ({ v, sku: String(v.sku || '').trim().toUpperCase() }))",
    interna: 'preserva',
    papel: 'mapearSkus — a chave por onde a sincronização casa a loja com o catálogo.',
    consequencia:
      'ESTA É A MAIS CARA. Uma variante cujo SKU foi digitado na loja com espaço '
      + 'entra no mapa como "BR 1234" e nunca casa com o código local "BR1234": o '
      + 'código parece não existir na loja e a sincronização o ignora, em silêncio.',
  },
  {
    onde: 'api/src/vendas-comandos.js',
    trecho: "const sku = String(entrada.sku || '').trim().toUpperCase();",
    interna: 'preserva',
    papel: 'O código digitado na venda de balcão.',
    consequencia:
      'Sem consequência silenciosa: `saldosDoSku` não encontra e a venda para com '
      + '"Código X não está no catálogo", que é a resposta certa. Fica na lista '
      + 'porque é a mesma pergunta respondida de um nono jeito.',
  },
];

const falhas = [];
const fonte = new Map();
const ler = (rel) => {
  if (!fonte.has(rel)) fonte.set(rel, readFileSync(join(RAIZ, rel), 'utf8'));
  return fonte.get(rel);
};

/** Remove espaço interno? Decidido pelo TEXTO da normalização: só quem tem
 *  um `.replace()` sobre classe de espaço remove. */
const removeInterno = (trecho) => /\.replace\(\s*\/\[?\\s/.test(trecho);

for (const item of INVENTARIO) {
  const texto = ler(item.onde);
  const inteiro = item.trecho + (item.seguinte || '');
  if (!texto.includes(item.trecho)) {
    falhas.push(`${item.onde}: a normalização declarada não está mais no arquivo.\n`
      + `        Declarado: ${item.trecho}\n`
      + '        Se ela mudou de forma, atualize o inventário — é a hora de decidir.');
    continue;
  }
  if (item.seguinte && !texto.includes(item.seguinte)) {
    falhas.push(`${item.onde}: a continuação da normalização mudou.`);
    continue;
  }
  const real = removeInterno(inteiro) ? 'remove' : 'preserva';
  if (real !== item.interna) {
    falhas.push(`${item.onde}: declarada como "${item.interna}" do espaço interno, `
      + `mas o código agora "${real}".`);
  }
}

/* Nenhuma normalização NOVA pode aparecer sem entrar no inventário. */
const declarados = new Set(INVENTARIO.map((i) => i.onde));
const arquivosComNormSku = ['catalogo.js', 'fotos.js', 'produtos.js', 'publicacao-catalogo.js',
  'sku.js', 'variantes.js', 'nuvemshop.js', 'vendas-comandos.js', 'pendencias.js',
  'estoque.js', 'sync.js', 'reconciliacao.js', 'personalizacao.js', 'venda-correcao.js',
  'inventario.js', 'maletas-comandos.js', 'catalogo-comandos.js', 'state.js']
  .map((n) => 'api/src/' + n);

for (const rel of arquivosComNormSku) {
  let texto;
  try { texto = ler(rel); } catch { continue; }
  for (const m of texto.matchAll(/(?:export\s+)?const\s+normSku\s*=/g)) {
    if (declarados.has(rel)) continue;
    const linha = texto.slice(0, m.index).split('\n').length;
    falhas.push(`${rel}:${linha}: normalização de SKU nova, fora do inventário.\n`
      + '        Antes de acrescentar mais uma, veja se alguma das oito serve.');
  }
}

/* As três exportadas têm de concordar — elas decidem chaves que se
   encontram: `produtos.sku`, `loja_variantes.sku_norm` e a checagem de
   unicidade. */
const SONDAS = ['BR1234', ' br1234 ', 'BR 1234', '10 06 33', '\tbr 12 34 ', '', null, undefined, 0];
for (const sonda of SONDAS) {
  const a = canonica(sonda);
  for (const [nome, fn] of [['produtos.js', deProdutos], ['variantes.js', deVariantes]]) {
    if (fn(sonda) !== a) {
      falhas.push(`${nome}: normaliza ${JSON.stringify(sonda)} como ${JSON.stringify(fn(sonda))}, `
        + `e sku.js como ${JSON.stringify(a)}. Estas três decidem chaves que se encontram.`);
    }
  }
}

/* A divergência declarada é real, e é esta: */
const preservando = (v) => String(v == null ? '' : v).trim().toUpperCase();
if (preservando('BR 1234') === canonica('BR 1234')) {
  falhas.push('A divergência do inventário sumiu do comportamento. '
    + 'Se alguém a corrigiu, atualize o inventário e diga qual decisão foi tomada.');
}

/* E `0` nunca é ausente, em nenhuma delas. */
for (const [nome, fn] of [['sku.js', canonica], ['produtos.js', deProdutos], ['variantes.js', deVariantes]]) {
  if (fn(0) !== '0') falhas.push(`${nome}: o código 0 virou ${JSON.stringify(fn(0))} em vez de "0".`);
  if (fn(null) !== '') falhas.push(`${nome}: ausente deixou de virar string vazia.`);
}

if (falhas.length) {
  console.error('Normalização de SKU: REPROVADO\n');
  for (const f of falhas) console.error('  ' + f);
  process.exit(1);
}

const divergentes = INVENTARIO.filter((i) => i.interna === 'preserva');
console.log(`Normalização de SKU: ok — ${INVENTARIO.length} normalizações inventariadas, `
  + `${divergentes.length} divergentes e declaradas:`);
for (const d of divergentes) console.log(`   · ${d.onde} — ${d.papel}`);
console.log('   Nenhuma foi alterada por este teste. Ver docs/domains/SKU-NORMALIZACAO.md.');
