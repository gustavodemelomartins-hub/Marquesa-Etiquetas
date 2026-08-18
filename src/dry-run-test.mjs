/** Prova formal do que `POST /api/sync {"seco": true}` escreve e não escreve.
 *
 *  Este teste existe porque "dry-run" é uma promessa, e promessa sobre
 *  estoque físico precisa de prova, não de leitura de código. O motor de
 *  reconciliação vai ser construído EM CIMA desta rodada seca: se ela
 *  escrever algo que ninguém esperava, o motor herda o problema.
 *
 *  O método: fotografa as oito tabelas relevantes direto do SQLite, linha
 *  por linha, ANTES e DEPOIS. Não pergunta à API o que ela acha que
 *  aconteceu — lê o banco.
 *
 *  A rodada seca testada aqui TEM trabalho de verdade para fazer: um
 *  pedido novo esperando virar venda e produtos com estoque divergente na
 *  loja. Um dry-run sem nada a fazer não prova nada.
 *
 *  O requisito principal, e o motivo de tudo isto:
 *
 *      dry-run nunca altera estoque, razão contábil, vendas nem a Nuvemshop.
 *
 *  O que ele ALTERA — metadado técnico de leitura — está provado aqui
 *  também, item a item, para ninguém descobrir de surpresa depois.
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';
const D1_DIR = 'api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

/** Igualdade de conteúdo entre duas fotos da mesma tabela. Quando falha,
 *  mostra a primeira linha que difere — "mudou alguma coisa" não ajuda
 *  ninguém a entender o quê. */
function igual(t, antes, depois) {
  if (antes === depois) return ok(t);
  const a = JSON.parse(antes), d = JSON.parse(depois);
  if (a.length !== d.length) {
    return bad(t, `linhas: ${a.length} antes, ${d.length} depois`);
  }
  for (let i = 0; i < a.length; i++) {
    const x = JSON.stringify(a[i]), y = JSON.stringify(d[i]);
    if (x !== y) return bad(t, `linha ${i}\n         antes:  ${x}\n         depois: ${y}`);
  }
  bad(t, 'diferem sem linha divergente (ordem?)');
}

const diferente = (t, antes, depois, nota = '') =>
  (antes !== depois ? ok(t, nota) : bad(t, 'não mudou, e deveria — ' + nota));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

/* ------------------------------------------------------------- o banco */

/** O D1 local do miniflare é um SQLite comum no disco. Abrir só para
 *  leitura, com o Worker no ar, é seguro: SQLite aceita vários leitores.
 *  Nada aqui escreve. */
function abrirBanco() {
  const arquivos = readdirSync(D1_DIR)
    .filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (arquivos.length !== 1) {
    throw new Error(`esperava 1 arquivo .sqlite em ${D1_DIR}, achei ${arquivos.length}`);
  }
  return new DatabaseSync(join(D1_DIR, arquivos[0]), { readOnly: true });
}

/* Cada recurso com a ordenação que o torna comparável: pela chave natural,
   nunca por rowid. `produto_variacoes` é apagada e regravada a cada rodada,
   e por rowid duas fotos iguais em conteúdo pareceriam diferentes. */
const RECURSOS = {
  produtos:          'SELECT * FROM produtos ORDER BY sku',
  movimentos:        'SELECT * FROM movimentos ORDER BY id',
  vendas:            'SELECT * FROM vendas ORDER BY id',
  venda_itens:       'SELECT * FROM venda_itens ORDER BY venda_id, sku',
  produto_variacoes: 'SELECT * FROM produto_variacoes ORDER BY sku, nome',
  config:            'SELECT * FROM config ORDER BY chave',
  loja_snapshot:     'SELECT * FROM loja_snapshot ORDER BY id',
  sync_execucoes:    'SELECT * FROM sync_execucoes ORDER BY id',
};

function fotografar(db, loja) {
  const foto = {};
  for (const [nome, sql] of Object.entries(RECURSOS)) {
    foto[nome] = JSON.stringify(db.prepare(sql).all());
  }
  /* A nona linha da tabela do relatório: a loja de mentira conta cada PATCH
     que chega. É o único jeito de provar "não escreveu na Nuvemshop" sem
     confiar no que o próprio código diz que fez. */
  foto.escritasNuvemshop = loja.estado.escritas.length;
  /* E o saldo por SKU isolado, porque `produtos` inteira inclui colunas que
     a rodada seca PODE mexer — e a que ela não pode é esta. */
  foto.qtdPorSku = JSON.stringify(db.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all());
  return foto;
}

/** A invariante mais importante do sistema, conferida no banco e não pela
 *  API: `produtos.qtd == SUM(movimentos.qtd)` para todo SKU. Kits ficam de
 *  fora: eles nunca têm saldo próprio. */
function razaoDivergente(db) {
  return db.prepare(`
    SELECT p.sku, p.qtd, COALESCE(SUM(m.qtd), 0) AS soma
      FROM produtos p LEFT JOIN movimentos m ON m.sku = p.sku
     WHERE p.sku NOT IN (SELECT kit_sku FROM kit_componentes)
     GROUP BY p.sku
    HAVING p.qtd <> COALESCE(SUM(m.qtd), 0)`).all();
}

/* ================================================================= setup */

const loja = await subirLojaFalsa();
console.log('loja falsa em ' + loja.url);

await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'S1', desc: 'Colar S1', cat: 'Colar', preco: 100, qtd: 10 },
    { sku: 'S2', desc: 'Brinco S2', cat: 'Brinco', preco: 50, qtd: 6 },
    { sku: 'S3', desc: 'Anel S3', cat: 'Anel', preco: 80, qtd: 4 },
  ],
});

/* S3 com duas variações: é o que faz `produto_variacoes` existir, e essa
   tabela é apagada e regravada a cada rodada — inclusive na seca. */
loja.estado.produtos = [
  produtoFalso(1, [{ id: 11, sku: 'S1', estoque: 10 }]),
  produtoFalso(2, [{ id: 22, sku: 'S2', estoque: 6 }]),
  { id: 3, name: { pt: 'Anel S3' }, handle: { pt: 'anel-s3' }, published: true,
    attributes: [{ pt: 'Aro' }],
    variants: [
      { id: 31, sku: 'S3', values: [{ pt: '16' }], inventory_levels: [{ location_id: 'LOC1', stock: 3 }] },
      { id: 32, sku: 'S3', values: [{ pt: '18' }], inventory_levels: [{ location_id: 'LOC1', stock: 1 }] },
    ] },
];

console.log('\n=== 0. uma rodada REAL primeiro, para haver o que comparar ===');
/* Uma foto de banco vazio não prova nada: "não mudou" seria verdade por
   falta de conteúdo. A rodada real enche as oito tabelas. */
loja.estado.pedidos = [{
  id: 9001, number: 9001, status: 'open', created_at: '2026-08-16T10:00:00-03:00',
  customer: { name: 'Cliente Um' },
  products: [{ sku: 'S1', name: 'Colar S1', quantity: 2, price: '100.00' }],
}];

const r = await api('POST', '/api/sync', {});
eq('a rodada real terminou bem', r.ok, 'true');
eq('criou a venda', r.vendasCriadas, 1);

const db = abrirBanco();
const nLinhas = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

eq('há movimentos para comparar', nLinhas('movimentos') > 0, 'true');
eq('há vendas para comparar', nLinhas('vendas'), 1);
eq('há itens de venda para comparar', nLinhas('venda_itens'), 1);
eq('há variações para comparar', nLinhas('produto_variacoes'), 2);
eq('há retrato da loja para comparar', nLinhas('loja_snapshot'), 1);
eq('há execução registrada para comparar', nLinhas('sync_execucoes'), 1);
eq('a razão fecha antes de tudo', razaoDivergente(db).length, 0);

/* ======================= 1. dry-run COM trabalho de verdade esperando */

console.log('\n=== 1. a rodada seca de verdade ===');

/* Duas coisas para a rodada seca ter o que fazer:
   a) um pedido novo, que ela vai contar como venda mas não pode gravar;
   b) estoque mexido na loja por fora, para o empurrão ter mudanças. */
loja.estado.pedidos.push({
  id: 9002, number: 9002, status: 'open', created_at: '2026-08-17T09:00:00-03:00',
  customer: { name: 'Cliente Dois' },
  products: [{ sku: 'S2', name: 'Brinco S2', quantity: 3, price: '50.00' }],
});
loja.estado.produtos[0].variants[0].inventory_levels[0].stock = 99;
loja.estado.produtos[1].variants[0].inventory_levels[0].stock = 0;

const antes = fotografar(db, loja);
const seco = await api('POST', '/api/sync', { seco: true });

eq('a rodada seca terminou bem', seco.ok, 'true');
eq('ela se declara seca no relatório', seco.seco, 'true');

/* --- ela TINHA trabalho: sem isto, todo "não mudou" abaixo é vazio --- */
eq('CONTOU a venda que criaria', seco.vendasCriadas, 1);
eq('CALCULOU mudanças de estoque para a loja', seco.mudancas.length > 0, 'true');
eq('mas não declarou nada aplicado', seco.aplicado === undefined, 'true');

const depois = fotografar(db, loja);

/* ------------------------------------------------ O QUE NÃO PODE MUDAR */

console.log('\n--- o que a rodada seca NÃO pode alterar ---');

igual('produtos.qtd: nenhum saldo se mexeu', antes.qtdPorSku, depois.qtdPorSku);
igual('movimentos: a razão contábil está intacta', antes.movimentos, depois.movimentos);
igual('vendas: nenhuma venda foi criada', antes.vendas, depois.vendas);
igual('venda_itens: nenhum item de venda foi criado', antes.venda_itens, depois.venda_itens);
eq('Nuvemshop: nenhum PATCH saiu', depois.escritasNuvemshop, antes.escritasNuvemshop);
eq('a razão continua fechando depois da rodada seca', razaoDivergente(db).length, 0);

/* As duas chaves de config que marcam progresso da sincronização. Avançar
   qualquer uma numa rodada seca faria a rodada REAL seguinte pular pedidos
   que nunca foram lidos de verdade — venda perdida em silêncio. */
const cfg = (foto, chave) => {
  const linha = JSON.parse(foto.config).find(c => c.chave === chave);
  return linha ? linha.valor : '(ausente)';
};
eq('config.syncUltimoPedido não avançou',
   cfg(depois, 'syncUltimoPedido'), cfg(antes, 'syncUltimoPedido'));
eq('config.syncUltimoEstoque não avançou',
   cfg(depois, 'syncUltimoEstoque'), cfg(antes, 'syncUltimoEstoque'));

/* ---------------------------------------------- O QUE MUDA, E POR QUÊ */

console.log('\n--- o metadado de leitura que ela SIM atualiza ---');

const execs = JSON.parse(depois.sync_execucoes);
eq('sync_execucoes ganhou exatamente 1 linha',
   execs.length - JSON.parse(antes.sync_execucoes).length, 1);
const ultima = execs[execs.length - 1];
eq('e ela ficou com status "ok"', ultima.status, 'ok');
eq('nada foi declarado enviado nela', ultima.produtos_enviados ?? 0, 0);
eq('o detalhe guarda seco:true — dá para distinguir da rodada real',
   JSON.parse(ultima.detalhe_json).seco, 'true');

diferente('loja_snapshot: o retrato da loja foi atualizado',
  antes.loja_snapshot, depois.loja_snapshot, 'ela releu a loja inteira');

diferente('produtos: o espelho da loja acompanhou',
  antes.produtos, depois.produtos, 'coluna-espelho, não é saldo');

const espelho = (foto, sku) =>
  JSON.parse(foto.produtos).find(p => p.sku === sku).estoque_loja;
eq('S1: o espelho passou a mostrar os 99 que a loja tem agora',
   espelho(depois, 'S1'), 99);
eq('S1: e o saldo REAL continua 8, que é o que existe aqui',
   JSON.parse(depois.qtdPorSku).find(p => p.sku === 'S1').qtd, 8);

console.log('\n=== 2. rodar seco duas vezes seguidas é inofensivo ===');
const antes2 = fotografar(db, loja);
await api('POST', '/api/sync', { seco: true });
const depois2 = fotografar(db, loja);
igual('produtos.qtd continua igual', antes2.qtdPorSku, depois2.qtdPorSku);
igual('movimentos continua igual', antes2.movimentos, depois2.movimentos);
igual('vendas continua igual', antes2.vendas, depois2.vendas);
igual('venda_itens continua igual', antes2.venda_itens, depois2.venda_itens);
igual('produto_variacoes: regravada com o MESMO conteúdo',
  antes2.produto_variacoes, depois2.produto_variacoes);
/* Contra o "antes", não contra zero: a rodada REAL da seção 0 já mandou
   um PATCH legítimo, e ele fica no contador para sempre. O que importa é
   que a rodada seca não SOMOU nenhum. */
eq('Nuvemshop continua sem receber nada da rodada seca',
   depois2.escritasNuvemshop, antes2.escritasNuvemshop);

console.log('\n=== 3. o freio pausa a rodada seca igual à real ===');
/* O freio é conferido ANTES do `if (seco) return`. Isso importa: é o que
   permite descobrir que a rodada travaria sem precisar arriscar a loja. */
await api('POST', '/api/produtos/importar', {
  produtos: Array.from({ length: 30 }, (_, i) => ({
    sku: `Z${i}`, desc: `Peça Z${i}`, cat: 'Outros', preco: 10, qtd: 0,
  })),
});
loja.estado.produtos.push(...Array.from({ length: 30 }, (_, i) =>
  produtoFalso(100 + i, [{ id: 1000 + i, sku: `Z${i}`, estoque: 5 }])));

const antes3 = fotografar(db, loja);
const pausado = await api('POST', '/api/sync', { seco: true });
const depois3 = fotografar(db, loja);

eq('a rodada seca pausou no freio', !!pausado.pausado, 'true');
eq('e disse quantos zeraria', pausado.pausado.zerando > 15, 'true');
igual('nada foi gravado no estoque mesmo assim', antes3.qtdPorSku, depois3.qtdPorSku);
igual('nem na razão contábil', antes3.movimentos, depois3.movimentos);
eq('nem na Nuvemshop', depois3.escritasNuvemshop, antes3.escritasNuvemshop);

const execs3 = JSON.parse(depois3.sync_execucoes);
eq('a execução ficou registrada como "pausado"',
   execs3[execs3.length - 1].status, 'pausado');

console.log('\n=== 4. e a rodada REAL, essa sim, escreve ===');
/* O contraste que fecha a prova: as mesmas condições, sem `seco`, mudam
   tudo aquilo que a seca não mudou. Se este bloco não escrevesse, os
   "não mudou" acima seriam verdade por acidente. */
const antes4 = fotografar(db, loja);
const real = await api('POST', '/api/sync', { forcar: true });
const depois4 = fotografar(db, loja);

eq('a rodada real terminou bem', real.ok, 'true');
diferente('agora SIM movimentos mudou', antes4.movimentos, depois4.movimentos,
  'a venda do pedido 9002 entrou');
diferente('agora SIM vendas mudou', antes4.vendas, depois4.vendas);
diferente('agora SIM produtos.qtd mudou', antes4.qtdPorSku, depois4.qtdPorSku);
eq('agora SIM a Nuvemshop recebeu PATCH', depois4.escritasNuvemshop > 0, 'true');
eq('S2 baixou 3 pela venda que a rodada seca só tinha contado',
   JSON.parse(depois4.qtdPorSku).find(p => p.sku === 'S2').qtd, 3);
eq('a razão fecha depois da rodada real', razaoDivergente(db).length, 0);

db.close();
await loja.fechar();

console.log(`\n${falhas === 0 ? 'TUDO CERTO' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
