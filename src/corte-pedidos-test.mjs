/** O corte do go-live: pedido antigo da loja é história, não venda nova.
 *
 *  O problema real: no corte de 2026-08-22 a operação mudou de banco. A
 *  Nuvemshop continua com pedidos que, no banco novo, nunca foram vendas —
 *  e `vendas.externo_id` não protege contra eles, porque a proteção é
 *  contra REPETIR o que já entrou, não contra IMPORTAR o que nunca entrou.
 *  Sem corte, a primeira sincronização de verdade criaria essas vendas e
 *  baixaria estoque de peça que já saiu por outro caminho.
 *
 *  A janela de 6 horas de `syncUltimoPedido` também não resolve: ela é uma
 *  FOLGA PARA TRÁS, feita para não perder pedido, e o preço dela é
 *  justamente reconsiderar o que é velho. Por isso o corte é uma data
 *  própria, e não um ajuste na janela.
 *
 *  O que precisa ficar provado aqui, em ordem de importância:
 *
 *   1. sem corte, o pedido antigo entra — é o comportamento de sempre, e é
 *      ele que torna o corte necessário;
 *   2. com corte, o pedido anterior à data NÃO vira venda, não move
 *      estoque e não escreve movimento;
 *   3. o que ficou de fora é ANUNCIADO, com id, número, data e motivo;
 *   4. pedido POSTERIOR ao corte continua entrando normalmente — o corte
 *      não é uma parede permanente contra venda nova;
 *   5. a idempotência continua sendo a trava de sempre: rodar duas vezes
 *      não cobra a mesma venda duas vezes;
 *   6. pedido sem data legível não passa pelo corte (fail closed);
 *   7. data inválida em `config.syncCorteEm` é recusada na entrada da rota,
 *      e não vira "sem corte" em silêncio;
 *   8. a razão contábil fecha no fim.
 *
 *  Precisa do Worker local no ar e do banco limpo.
 */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';
import { corteDePedidos } from '../api/src/sync.js';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const crua = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
});
const api = (m, p, b) => crua(m, p, b).then(r => r.json());

const loja = await subirLojaFalsa();
console.log('loja falsa em ' + loja.url);

await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'K1', desc: 'Colar K1', cat: 'Colar', preco: 100, qtd: 10 },
    { sku: 'K2', desc: 'Brinco K2', cat: 'Brinco', preco: 50, qtd: 6 },
  ],
});
loja.estado.produtos = [
  produtoFalso(1, [{ id: 11, sku: 'K1', estoque: 10 }]),
  produtoFalso(2, [{ id: 22, sku: 'K2', estoque: 6 }]),
];

const estado = () => api('GET', '/api/state');
const saldo = async sku => (await estado()).produtos.find(p => p.sku === sku).qtd;
const vendasEm = async data => (await api('GET', `/api/vendas?data=${data}`)).length;
/* As três datas em que uma venda PODERIA nascer aqui: as duas dos pedidos
   antigos e a do pedido novo. `GET /api/vendas` responde por dia; contar só
   "hoje" deixaria passar justamente o erro que o corte existe para impedir. */
const contarVendas = async () => (await vendasEm('2026-08-01'))
  + (await vendasEm('2026-08-10')) + (await vendasEm('2026-08-23'));
const movimentosDe = async sku =>
  (await api('GET', `/api/estoque/${sku}/movimentos`)).movimentos.length;
const barrado = (r, id) => r.pedidosAntesDoCorte.find(p => p.id === id);

/* Datas fixas de propósito: o corte é uma comparação de data, e um teste
   que dependesse de "agora" passaria ou falharia conforme a hora. */
const PEDIDO_ANTIGO_A = {
  id: 9001, number: 9001, status: 'open', created_at: '2026-08-01T10:00:00-03:00',
  customer: { name: 'Cliente Antiga A' },
  products: [{ sku: 'K1', name: 'Colar K1', quantity: 2, price: '100.00' }],
};
const PEDIDO_ANTIGO_B = {
  id: 9002, number: 9002, status: 'open', created_at: '2026-08-10T09:00:00-03:00',
  customer: { name: 'Cliente Antiga B' },
  products: [{ sku: 'K2', name: 'Brinco K2', quantity: 1, price: '50.00' }],
};
const CORTE = '2026-08-22T00:00:00-03:00';
const mesmoInstante = (t, a, b) => eq(t, new Date(a).toISOString(), new Date(b).toISOString());

/* ------------------------------------------------------------------ */
console.log('\n=== 1. sem corte, o pedido antigo entraria (o problema) ===');
loja.estado.pedidos = [PEDIDO_ANTIGO_A, PEDIDO_ANTIGO_B];

eq('o banco nasce sem corte nenhum', (await estado()).config.syncCorteEm, 'null');
let r = await api('POST', '/api/sync', { seco: true });
eq('a rodada seca leu os dois pedidos', r.pedidosLidos, 2);
eq('e diria que criaria 2 vendas antigas', r.vendasCriadas, 2);
eq('nada ficou de fora por corte', r.pedidosAntesDoCorte.length, 0);
eq('mas a rodada seca não criou venda nenhuma', await contarVendas(), 0);
eq('nem mexeu no estoque', await saldo('K1'), 10);

/* ------------------------------------------------------------------ */
console.log('\n=== 2. com corte, o pedido antigo não vira venda ===');
r = await api('PUT', '/api/config', { syncCorteEm: CORTE });
eq('o corte foi aceito', r.ok, 'true');
mesmoInstante('e pode ser conferido sem abrir o banco',
  (await estado()).config.syncCorteEm, CORTE);

const movimentosAntes = await movimentosDe('K1');
r = await api('POST', '/api/sync', {});
eq('a rodada terminou bem', r.ok, 'true');
eq('leu os dois pedidos', r.pedidosLidos, 2);
eq('e não criou venda nenhuma', r.vendasCriadas, 0);
eq('nenhuma venda no banco', await contarVendas(), 0);
eq('K1 continua com 10', await saldo('K1'), 10);
eq('K2 continua com 6', await saldo('K2'), 6);
eq('nenhum movimento novo em K1', await movimentosDe('K1'), movimentosAntes);

/* ------------------------------------------------------------------ */
console.log('\n=== 3. o que ficou de fora é anunciado, não engolido ===');
eq('os dois pedidos antigos foram listados', r.pedidosAntesDoCorte.length, 2);
mesmoInstante('a rodada declara qual corte usou', r.corteEm, CORTE);
eq('com o id do pedido', barrado(r, 9001).id, 9001);
eq('com o número do pedido', barrado(r, 9001).numero, 9001);
eq('com a data de criação', barrado(r, 9001).criadoEm, PEDIDO_ANTIGO_A.created_at);
eq('com o status que a loja informou', barrado(r, 9001).status, 'open');
eq('e com o motivo', barrado(r, 9001).motivo, 'anterior ao corte');
eq('o segundo também está lá', barrado(r, 9002).motivo, 'anterior ao corte');

/* ------------------------------------------------------------------ */
console.log('\n=== 4. pedido POSTERIOR ao corte continua entrando ===');
/* A rodada anterior avançou `syncUltimoPedido` para o pedido mais novo que
   leu, então a janela de 6h agora começa perto de 10/08 — o 9001 nem chega
   a ser lido. Isso não enfraquece o corte: o que a janela deixa passar, o
   corte barra, e o que a janela corta já não era candidato. */
loja.estado.pedidos.push({
  id: 9003, number: 9003, status: 'open', created_at: '2026-08-23T08:00:00-03:00',
  customer: { name: 'Cliente Nova' },
  products: [{ sku: 'K1', name: 'Colar K1', quantity: 3, price: '100.00' }],
});
r = await api('POST', '/api/sync', {});
eq('a venda nova entrou', r.vendasCriadas, 1);
eq('e é a única venda do banco', await contarVendas(), 1);
eq('o estoque baixou (10 − 3)', await saldo('K1'), 7);
eq('o antigo que a janela ainda alcança segue barrado',
  barrado(r, 9002).motivo, 'anterior ao corte');
eq('e a loja recebeu 7', loja.estado.produtos[0].variants[0].inventory_levels[0].stock, 7);

/* ------------------------------------------------------------------ */
console.log('\n=== 5. rodar de novo não cobra a mesma venda duas vezes ===');
r = await api('POST', '/api/sync', {});
eq('não criou venda nova', r.vendasCriadas, 0);
eq('continua 1 venda', await contarVendas(), 1);
eq('e o estoque continua 7', await saldo('K1'), 7);
eq('o pedido já importado não é contado como barrado pelo corte',
  barrado(r, 9003), undefined);

/* ------------------------------------------------------------------ */
console.log('\n=== 6. pedido sem data legível não passa pelo corte ===');
loja.estado.pedidos.push({
  id: 9004, number: 9004, status: 'open', created_at: null,
  customer: { name: 'Sem data' },
  products: [{ sku: 'K2', name: 'Brinco K2', quantity: 1, price: '50.00' }],
});
r = await api('POST', '/api/sync', {});
eq('não virou venda', r.vendasCriadas, 0);
eq('K2 segue intocado', await saldo('K2'), 6);
eq('e o motivo é explícito', barrado(r, 9004).motivo, 'sem data legível');

/* ------------------------------------------------------------------ */
console.log('\n=== 7. data inválida é recusada na entrada ===');
let resp = await crua('PUT', '/api/config', { syncCorteEm: 'ontem de manhã' });
eq('a rota recusou', resp.status, 400);
mesmoInstante('o corte anterior continua valendo',
  (await estado()).config.syncCorteEm, CORTE);

resp = await crua('PUT', '/api/config', { syncCorteEm: null });
eq('e null é a forma de tirar o corte', resp.status, 200);
eq('sem corte de novo', (await estado()).config.syncCorteEm, 'null');
r = await api('POST', '/api/sync', { seco: true });
eq('aí nada mais é barrado por corte', r.pedidosAntesDoCorte.length, 0);
eq('e a rodada seca continua sem escrever venda', await contarVendas(), 1);

/* ------------------------------------------------------------------ */
console.log('\n=== 7b. segunda camada: valor sujo escrito direto no banco ===');
/* A rota já recusa data inválida. Esta é a camada de baixo — a que vale se
   alguém gravar a chave por SQL. Sem Worker e sem banco: um `db` de mentira
   com a única consulta que `corteDePedidos` faz. */
const dbFalso = valor => ({
  prepare: () => ({ bind: () => ({ first: async () => (valor === undefined ? null : { valor }) }) }),
});
eq('sem a chave, não há corte', await corteDePedidos(dbFalso(undefined)), null);
eq('com null gravado, não há corte', await corteDePedidos(dbFalso('null')), null);
eq('com data boa, devolve o instante',
  (await corteDePedidos(dbFalso(JSON.stringify(CORTE)))).iso, new Date(CORTE).toISOString());
let derrubou = false;
try { await corteDePedidos(dbFalso(JSON.stringify('ontem de manhã'))); }
catch (e) { derrubou = /syncCorteEm/.test(e.message); }
eq('data ilegível derruba a rodada, não vira "sem corte"', derrubou, true);

/* ------------------------------------------------------------------ */
console.log('\n=== 8. a razão fecha no fim de tudo (§19) ===');
const conferir = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos em todo SKU', conferir.divergentes.length, 0);

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
