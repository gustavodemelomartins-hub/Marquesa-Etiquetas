/** §36.4 ponta a ponta — o dinheiro muda de estado, o estoque não.
 *
 *  O teste puro (`pagamento-nuvemshop-test.mjs`) prova a REGRA. Este prova o
 *  EFEITO dela no banco, contra a loja de mentira:
 *
 *   1. pedido pendente vira venda, baixa o estoque UMA vez e não fatura;
 *   2. o mesmo pedido, agora pago, entra no faturamento — e o estoque NÃO
 *      baixa de novo. Era o buraco: o `externo_id` já conhecido fazia a
 *      rodada seguinte pular o pedido inteiro, e o PIX que caía nunca virava
 *      faturamento;
 *   3. reembolso não vira conta a receber;
 *   4. pagamento que uma PESSOA registrou não é sobrescrito pela loja;
 *   5. voltar de pago para não pago exige decisão humana — a sincronização
 *      se recusa e anuncia, em vez de apagar faturamento de mês fechado.
 *
 *      api/dev-local.sh && node src/sync-pagamento-test.mjs
 */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x) => (x ? ok(t) : bad(t));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then((r) => r.json());

const loja = await subirLojaFalsa();
console.log('loja falsa em ' + loja.url);

await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'PG1', desc: 'Colar do Site', cat: 'Colar', preco: 100, qtd: 10 }],
});
loja.estado.produtos = [produtoFalso(1, [{ id: 11, sku: 'PG1', estoque: 10 }])];

const saldo = async () => Number(
  (await api('GET', '/api/state')).produtos.find((p) => p.sku === 'PG1').qtd);
const geral = () => api('GET', '/api/analytics/vendas?periodo=tudo');
const movimentos = async () => {
  const r = await api('GET', '/api/estoque/PG1/movimentos');
  const lista = Array.isArray(r) ? r : (r.movimentos ?? r.linhas ?? []);
  return lista.length;
};
const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  const d = r.divergentes ?? r.divergencias ?? [];
  return Array.isArray(d) ? d.length === 0 : false;
};

/* ─────────────────────────────────────────────────────────────────────── */
console.log('\n=== 1. pedido pendente: a peça sai, o dinheiro não entra ===');
const PEDIDO = {
  id: 9101, number: 9101, status: 'open', payment_status: 'pending',
  created_at: '2026-08-16T10:00:00-03:00',
  customer: { name: 'Cliente do Site' },
  products: [{ sku: 'PG1', name: 'Colar do Site', quantity: 2, price: '100.00' }],
};
loja.estado.pedidos = [PEDIDO];

const fatAntes = (await geral()).faturamento;
let r = await api('POST', '/api/sync', {});
eq('a rodada terminou bem', r.ok, 'true');
eq('criou 1 venda', r.vendasCriadas, 1);
eq('o estoque baixou uma vez (10 − 2)', await saldo(), 8);
const movsDepoisDoPrimeiro = await movimentos();

const g1 = await geral();
eq('faturamento não subiu', +(g1.faturamento - fatAntes).toFixed(2), 0);
eq('e virou conta a receber', +(g1.aReceber ?? 0).toFixed(2), 200);
verdade('o pedido foi anunciado como não pago',
  (r.pedidosNaoPagos ?? []).some((p) => String(p.pedido) === '9101'));
eq('e o motivo veio junto',
  (r.pedidosNaoPagos ?? []).find((p) => String(p.pedido) === '9101')?.carimbo,
  'nuvemshop_pendente');
verdade('razão contábil fecha', await razaoFecha());

/* ─────────────────────────────────────────────────────────────────────── */
console.log('\n=== 2. o PIX caiu: fatura UMA vez, estoque NÃO baixa de novo ===');
PEDIDO.payment_status = 'paid';
PEDIDO.paid_at = '2026-08-20T14:00:00-03:00';

r = await api('POST', '/api/sync', {});
eq('a rodada terminou bem', r.ok, 'true');
eq('nenhuma venda nova foi criada', r.vendasCriadas, 0);
eq('o estoque continua 8 — nenhuma segunda baixa', await saldo(), 8);
eq('e nenhum movimento novo foi gravado', await movimentos(), movsDepoisDoPrimeiro);

const atualizado = (r.pagamentosAtualizados ?? []).find((p) => String(p.pedido) === '9101');
verdade('a atualização de pagamento foi anunciada', !!atualizado);
eq('de não pago', atualizado?.de?.pago, 0);
eq('para pago', atualizado?.para?.pago, 1);
eq('pela data real do recebimento', atualizado?.para?.dataPagamento, '2026-08-20');
eq('e declarando que não tocou estoque', atualizado?.estoqueAlterado, false);

const g2 = await geral();
eq('faturamento subiu exatamente o valor do pedido',
  +(g2.faturamento - fatAntes).toFixed(2), 200);
eq('e a conta a receber zerou', +(g2.aReceber ?? 0).toFixed(2), 0);
eq('a contagem de vendas não dobrou', g2.vendas, g1.vendas);
verdade('razão contábil fecha', await razaoFecha());

/* Rodar mais uma vez não pode somar de novo. */
r = await api('POST', '/api/sync', {});
const g3 = await geral();
eq('rodar de novo não move o faturamento', g3.faturamento, g2.faturamento);
eq('nem o estoque', await saldo(), 8);
eq('nem cria movimento', await movimentos(), movsDepoisDoPrimeiro);

/* ─────────────────────────────────────────────────────────────────────── */
console.log('\n=== 3. voltar de pago para reembolsado exige decisão humana ===');
PEDIDO.payment_status = 'refunded';
r = await api('POST', '/api/sync', {});
const g4 = await geral();
eq('o faturamento NÃO foi apagado pela sincronização', g4.faturamento, g2.faturamento);
eq('e o reembolso não virou conta a receber', +(g4.aReceber ?? 0).toFixed(2), 0);
verdade('o caso foi anunciado como pendente de política',
  (r.pedidosExigindoPolitica ?? []).some((p) => String(p.pedido) === '9101'));
verdade('com o motivo por extenso',
  /removeria faturamento já contado/i.test(
    (r.pedidosExigindoPolitica ?? []).find((p) => String(p.pedido) === '9101')?.porque ?? ''));

/* ─────────────────────────────────────────────────────────────────────── */
console.log('\n=== 4. pedido reembolsado que chega NOVO não vira dívida ===');
loja.estado.pedidos.push({
  id: 9102, number: 9102, status: 'open', payment_status: 'refunded',
  created_at: '2026-08-17T10:00:00-03:00',
  customer: { name: 'Cliente Reembolsada' },
  products: [{ sku: 'PG1', name: 'Colar do Site', quantity: 1, price: '100.00' }],
});
const aReceberAntes = +((await geral()).aReceber ?? 0).toFixed(2);
r = await api('POST', '/api/sync', {});
eq('a venda foi registrada', r.vendasCriadas, 1);
eq('a peça saiu do estoque (a mercadoria foi embora)', await saldo(), 7);
const g5 = await geral();
eq('mas NÃO virou faturamento', g5.faturamento, g4.faturamento);
eq('e NÃO virou conta a receber', +(g5.aReceber ?? 0).toFixed(2), aReceberAntes);
verdade('foi anunciado como não cobrável',
  (r.pedidosNaoCobraveis ?? []).some((p) => String(p.pedido) === '9102'));
verdade('e como pendente de política de reembolso',
  (r.pedidosExigindoPolitica ?? []).some((p) => String(p.pedido) === '9102'));
verdade('razão contábil fecha', await razaoFecha());

/* ─────────────────────────────────────────────────────────────────────── */
console.log('\n=== 5. pagamento registrado por uma PESSOA não é sobrescrito ===');
{
  const v = await api('POST', '/api/vendas', {
    clienteNome: 'Cliente de Balcão', itens: [{ sku: 'PG1', qtd: 1 }],
    data: '2026-08-18', pago: false,
  });
  const pago = await api('POST', `/api/vendas/${v.id}/pagamento`, { dataPagamento: '2026-08-19' });
  eq('a pessoa registrou o pagamento', pago.pagamentoOrigem, 'informado');
  const antes = (await geral()).faturamento;
  await api('POST', '/api/sync', {});
  eq('a sincronização não mexeu nele', (await geral()).faturamento, antes);
}

console.log('\n=== 6. o dry-run já diz o que não vai virar faturamento ===');
{
  loja.estado.pedidos.push({
    id: 9103, number: 9103, status: 'open', payment_status: 'pending',
    created_at: '2026-08-19T10:00:00-03:00',
    customer: { name: 'Cliente Seca' },
    products: [{ sku: 'PG1', name: 'Colar do Site', quantity: 1, price: '100.00' }],
  });
  const estoqueAntes = await saldo();
  const seco = await api('POST', '/api/sync', { seco: true });
  verdade('o dry-run anuncia o pedido não pago',
    (seco.pedidosNaoPagos ?? []).some((p) => String(p.pedido) === '9103'));
  eq('e não escreveu nada no estoque', await saldo(), estoqueAntes);
}

console.log('\n=== 7. a razão contábil fecha no fim de tudo ===');
verdade('produtos.qtd == SUM(movimentos.qtd)', await razaoFecha());

await loja.fechar?.();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
