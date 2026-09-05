/** §36.1 — faturamento é só dinheiro efetivamente recebido.
 *
 *  O DEFEITO que este arquivo impede de voltar: a sincronização tratava
 *  TODO pedido não cancelado como venda paga no dia em que apareceu. Pedido
 *  de PIX esperando pagamento entrava no faturamento como se o dinheiro
 *  tivesse entrado — e a existência de um pedido não é evidência de
 *  recebimento.
 *
 *  Teste puro: sem Worker, sem rede, sem loja. Só a função que decide.
 *
 *      node src/pagamento-nuvemshop-test.mjs
 */
import { pagamentoDoPedido } from '../api/src/sync.js';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));

const DIA = '2026-09-04';

console.log('\n=== 1. pedido PAGO entra pela data REAL do recebimento ===');
{
  const r = pagamentoDoPedido({ payment_status: 'paid', paid_at: '2026-09-02T18:40:00-0300' }, DIA);
  eq('pago', r.pago, 1);
  eq('a data é a do pagamento, não a do pedido', r.dataPagamento, '2026-09-02');
  eq('procedência', r.origem, 'nuvemshop_pago');
}
{
  /* Pago, mas a loja não disse quando. A data do pedido é o mais próximo que
     existe, e o carimbo continua dizendo de onde veio. */
  const r = pagamentoDoPedido({ payment_status: 'paid' }, DIA);
  eq('pago sem paid_at cai na data do pedido', r.dataPagamento, DIA);
  eq('e continua carimbado como vindo da loja', r.origem, 'nuvemshop_pago');
}

console.log('\n=== 2. pedido esperando pagamento NÃO é faturamento ===');
for (const estado of ['pending', 'abandoned', 'voided', 'refunded']) {
  const r = pagamentoDoPedido({ payment_status: estado }, DIA);
  eq(`"${estado}" não é pago`, r.pago, 0);
  eq(`"${estado}" não ganha data de pagamento`, r.dataPagamento, 'null');
  eq(`"${estado}" é carimbado`, r.origem, 'nuvemshop_nao_pago');
}

console.log('\n=== 3. autorizado e parcial também não são recebido ===');
{
  /* `authorized` é o cartão RESERVADO, não capturado — o dinheiro não saiu
     da conta de ninguém. `partially_paid` é recebido pela metade, que não é
     recebido. Contar qualquer um dos dois seria repetir o defeito com outro
     nome. */
  const a = pagamentoDoPedido({ payment_status: 'authorized' }, DIA);
  eq('authorized não é pago', a.pago, 0);
  const p = pagamentoDoPedido({ payment_status: 'partially_paid' }, DIA);
  eq('partially_paid não é pago', p.pago, 0);
}

console.log('\n=== 4. sem o campo, o sistema diz que NÃO SABE ===');
for (const pedido of [{}, { payment_status: null }, { payment_status: '' }]) {
  const r = pagamentoDoPedido(pedido, DIA);
  /* Preserva o comportamento antigo — mudar para "não pago" apagaria
     faturamento sem prova nenhuma — mas a linha sai carimbada como
     indeterminada, e é por esse carimbo que a conferência humana a acha. */
  eq('sem campo: comportamento antigo preservado', r.pago, 1);
  eq('sem campo: carimbo de dúvida', r.origem, 'indeterminado_site');
  eq('sem campo: sem estado da loja para registrar', r.estadoLoja, 'null');
}

console.log('\n=== 5. o estado da loja é preservado como veio ===');
{
  const r = pagamentoDoPedido({ payment_status: 'PENDING' }, DIA);
  eq('maiúsculas não confundem a decisão', r.pago, 0);
  eq('e o estado bruto fica registrado em minúsculas', r.estadoLoja, 'pending');
}

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\ntudo ok\n');
process.exit(falhas ? 1 : 0);
