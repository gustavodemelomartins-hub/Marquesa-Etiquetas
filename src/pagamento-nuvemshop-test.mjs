/** §36.4 — faturamento é dinheiro recebido; A Receber é dívida de verdade.
 *
 *  O DEFEITO que este arquivo impede de voltar tem duas camadas.
 *
 *  A primeira: a sincronização tratava todo pedido não cancelado como venda
 *  paga no dia em que apareceu. Pedido de PIX esperando pagamento entrava no
 *  faturamento como se o dinheiro tivesse entrado.
 *
 *  A segunda, mais sutil e mais cara: corrigir a primeira jogando tudo o que
 *  não é `paid` em "A Receber". Faturamento e A Receber NÃO são
 *  complementares. Um pedido reembolsado não é nem um nem outro — ninguém
 *  deve nada. Um pedido pago pela metade é os dois, em partes. Traduzir
 *  status técnico direto para dívida inventa débito de quem não deve.
 *
 *  Teste puro: sem Worker, sem rede, sem loja. Só a função que decide.
 *
 *      node src/pagamento-nuvemshop-test.mjs
 */
import { pagamentoDoPedido, valorRecebidoDoPedido, pedidoCancelado } from '../api/src/sync.js';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x) => (x ? ok(t) : bad(t));

const DIA = '2026-09-04';
/* O que o resto do sistema faz com o retorno, em duas linhas — é isto que
   cada cenário abaixo está de fato afirmando. */
const faturamento = (r, total) => (r.pago === 1 ? total : (r.valorRecebido ?? 0));
const aReceber = (r, total) => {
  if (r.pago === 1 || r.cobravel === 0) return 0;
  return r.valorRecebido === null ? total : +(total - r.valorRecebido).toFixed(2);
};

/* ═════════════════════════════════════════════════════════════ CENÁRIO A */
console.log('\n=== A. pedido 100 pending → faturamento 0, A Receber 100 ===');
{
  const r = pagamentoDoPedido({ payment_status: 'pending', status: 'open' }, DIA, 100);
  eq('pago', r.pago, 0);
  eq('sem data de pagamento', r.dataPagamento, 'null');
  eq('o cliente deve', r.cobravel, 1);
  eq('faturamento', faturamento(r, 100), 0);
  eq('A Receber', aReceber(r, 100), 100);
  eq('carimbo', r.origem, 'nuvemshop_pendente');
}

/* ═════════════════════════════════════════════════════════════ CENÁRIO B */
console.log('\n=== B. pedido 100 paid → faturamento 100, A Receber 0 ===');
{
  const r = pagamentoDoPedido(
    { payment_status: 'paid', paid_at: '2026-09-02T18:40:00-0300', status: 'open' }, DIA, 100);
  eq('pago', r.pago, 1);
  eq('a data é a do recebimento, não a do pedido', r.dataPagamento, '2026-09-02');
  eq('ninguém deve nada', r.cobravel, 0);
  eq('faturamento', faturamento(r, 100), 100);
  eq('A Receber', aReceber(r, 100), 0);
  eq('carimbo', r.origem, 'nuvemshop_pago');
}
{
  /* `paid_at` ausente: o fallback existe, mas é DECLARADO. */
  const r = pagamentoDoPedido({ payment_status: 'paid', status: 'open' }, DIA, 100);
  eq('sem paid_at, cai na data do pedido', r.dataPagamento, DIA);
  eq('e o fallback é anunciado', r.fallbackData, true);
  eq('com carimbo próprio, para o relatório separar', r.origem, 'nuvemshop_pago_sem_data');
}

/* ═════════════════════════════════════════════════════════════ CENÁRIO C */
console.log('\n=== C. pending → paid: a receita é registrada UMA vez ===');
{
  const pedido = { id: 7001, payment_status: 'pending', status: 'open' };
  const antes = pagamentoDoPedido(pedido, DIA, 100);
  eq('enquanto pendente, faturamento', faturamento(antes, 100), 0);
  eq('enquanto pendente, A Receber', aReceber(antes, 100), 100);

  pedido.payment_status = 'paid';
  pedido.paid_at = '2026-09-05T09:00:00-0300';
  const depois = pagamentoDoPedido(pedido, DIA, 100);
  eq('depois de pago, faturamento', faturamento(depois, 100), 100);
  eq('depois de pago, A Receber', aReceber(depois, 100), 0);
  /* A soma dos dois momentos é 100, não 200: o pendente valia 0. É esta
     conta que prova que marcar pago não duplica receita. */
  eq('a receita total dos dois momentos', faturamento(antes, 100) + faturamento(depois, 100), 100);
  /* O estoque não aparece em lugar nenhum desta função, e é essa a garantia
     de que a mudança de pagamento não pode baixar peça: ela não tem como.
     A prova de que o estoque baixa uma vez só é do teste de sincronização. */
  verdade('a decisão de pagamento não menciona estoque',
    !('estoque' in depois) && !('qtd' in depois));
}

/* ═════════════════════════════════════════════════════════════ CENÁRIO D */
console.log('\n=== D. partially_paid 40 de 100 ===');
{
  /* Com a informação: entra o que entrou, e o saldo é o que fica a receber. */
  const comValor = pagamentoDoPedido({
    payment_status: 'partially_paid', status: 'open',
    paid_at: '2026-09-03T10:00:00-0300',
    transactions: [
      { status: 'paid', amount: '40.00' },
      { status: 'pending', amount: '60.00' },
    ],
  }, DIA, 100);
  eq('não está pago por inteiro', comValor.pago, 0);
  eq('entrou 40', comValor.valorRecebido, 40);
  eq('e o resto é devido', comValor.cobravel, 1);
  eq('faturamento', faturamento(comValor, 100), 40);
  eq('A Receber', aReceber(comValor, 100), 60);
  eq('carimbo', comValor.origem, 'nuvemshop_parcial');
  eq('com a data do que entrou', comValor.dataPagamento, '2026-09-03');
}
{
  /* SEM a informação: nada é contabilizado. Nem faturamento, nem dívida.
     Este é o caminho que vale hoje — nenhum payload real da loja da
     Marquesa foi observado, então nenhum valor pode ser presumido. */
  const semValor = pagamentoDoPedido({ payment_status: 'partially_paid', status: 'open' }, DIA, 100);
  eq('carimbo', semValor.origem, 'pagamento_parcial_indeterminado');
  eq('faturamento: nada inventado', faturamento(semValor, 100), 0);
  eq('A Receber: nada inventado', aReceber(semValor, 100), 0);
  eq('não é cobrável enquanto não se souber', semValor.cobravel, 0);
  verdade('e o motivo diz o que falta', /não informou quanto foi pago/i.test(semValor.porque));

  /* Valor que não fecha com o total também não serve. */
  const incoerente = pagamentoDoPedido({
    payment_status: 'partially_paid', status: 'open',
    transactions: [{ status: 'paid', amount: 250 }],
  }, DIA, 100);
  eq('valor maior que o total é recusado', incoerente.origem, 'pagamento_parcial_indeterminado');
}

/* ═════════════════════════════════════════════════════════════ CENÁRIO E */
console.log('\n=== E. refunded NÃO é A Receber ===');
{
  const r = pagamentoDoPedido({ payment_status: 'refunded', status: 'open' }, DIA, 100);
  eq('não está pago', r.pago, 0);
  eq('e NINGUÉM deve nada', r.cobravel, 0);
  eq('A Receber', aReceber(r, 100), 0);
  eq('faturamento', faturamento(r, 100), 0);
  eq('nenhum faturamento negativo foi inventado', faturamento(r, 100) >= 0, true);
  eq('carimbo explícito', r.origem, 'nuvemshop_reembolsado');
  eq('e o caso é marcado como pendente de POLÍTICA, não de informação',
    r.exigePolitica, true);
  verdade('com o motivo por extenso', /política contábil de reembolso/i.test(r.porque));
}

/* ═════════════════════════════════════════════════════════════ CENÁRIO F */
console.log('\n=== F. voided + pedido cancelado → NÃO é A Receber ===');
{
  const r = pagamentoDoPedido(
    { payment_status: 'voided', status: 'cancelled', cancelled_at: '2026-09-01T12:00:00-0300' },
    DIA, 100);
  eq('não está pago', r.pago, 0);
  eq('e ninguém deve nada', r.cobravel, 0);
  eq('A Receber', aReceber(r, 100), 0);
  eq('faturamento', faturamento(r, 100), 0);
  eq('carimbo', r.origem, 'nuvemshop_anulado');
  eq('o cancelamento foi lido do pedido, não da palavra voided',
    pedidoCancelado({ status: 'cancelled' }), true);
}

/* ═════════════════════════════════════════════════════════════ CENÁRIO G */
console.log('\n=== G. voided + pedido ATIVO → cobrança documentada ===');
{
  /* A regra: pagamento anulado num pedido que segue de pé deixa a peça fora
     do estoque e o cliente devendo. Carimbo próprio para que a decisão
     apareça num relatório sem ninguém precisar ler código. */
  const r = pagamentoDoPedido({ payment_status: 'voided', status: 'open' }, DIA, 100);
  eq('não está pago', r.pago, 0);
  eq('mas o cliente ainda deve', r.cobravel, 1);
  eq('A Receber', aReceber(r, 100), 100);
  eq('faturamento', faturamento(r, 100), 0);
  eq('carimbo próprio, separável do pendente comum',
    r.origem, 'nuvemshop_pendente_apos_anulacao');
  verdade('e a regra fica escrita no retorno',
    /pedido continua ativo/i.test(r.porque));
}

/* ══════════════════════════════════════════════════════ os demais estados */
console.log('\n=== H. authorized: reservado não é recebido ===');
{
  const ativo = pagamentoDoPedido({ payment_status: 'authorized', status: 'open' }, DIA, 100);
  eq('não é faturamento', faturamento(ativo, 100), 0);
  eq('é cobrança em aberto enquanto o pedido vive', aReceber(ativo, 100), 100);
  eq('carimbo próprio, separável do pendente', ativo.origem, 'nuvemshop_autorizado');
  verdade('e a regra está dita', /não capturado/i.test(ativo.porque));

  const cancelado = pagamentoDoPedido(
    { payment_status: 'authorized', status: 'cancelled' }, DIA, 100);
  eq('autorizado + cancelado não é cobrança', aReceber(cancelado, 100), 0);
  eq('carimbo', cancelado.origem, 'nuvemshop_cancelado');
}

console.log('\n=== I. pending + pedido cancelado → não é cobrança ===');
{
  const r = pagamentoDoPedido({ payment_status: 'pending', status: 'cancelled' }, DIA, 100);
  eq('A Receber', aReceber(r, 100), 0);
  eq('carimbo', r.origem, 'nuvemshop_cancelado');
}

console.log('\n=== J. abandonado e desconhecido não viram dívida ===');
{
  const ab = pagamentoDoPedido({ payment_status: 'abandoned', status: 'open' }, DIA, 100);
  eq('abandonado: A Receber', aReceber(ab, 100), 0);
  eq('abandonado: faturamento', faturamento(ab, 100), 0);
  eq('carimbo', ab.origem, 'nuvemshop_abandonado');

  const novo = pagamentoDoPedido({ payment_status: 'pix_em_analise', status: 'open' }, DIA, 100);
  eq('estado desconhecido: A Receber', aReceber(novo, 100), 0);
  eq('estado desconhecido: faturamento', faturamento(novo, 100), 0);
  eq('carimbo', novo.origem, 'nuvemshop_estado_desconhecido');
  verdade('e o estado bruto é preservado para quem for investigar',
    novo.estadoLoja === 'pix_em_analise');
}

console.log('\n=== K. sem o campo, o sistema diz que NÃO SABE ===');
for (const pedido of [{}, { payment_status: null }, { payment_status: '' }]) {
  const r = pagamentoDoPedido(pedido, DIA, 100);
  /* Preserva o comportamento antigo — mudar para não pago apagaria
     faturamento sem prova nenhuma — mas carimba a dúvida. */
  eq('comportamento antigo preservado', r.pago, 1);
  eq('carimbo de dúvida', r.origem, 'indeterminado_site');
  eq('e não cria dívida', aReceber(r, 100), 0);
}

console.log('\n=== L. a leitura do valor recebido não adivinha campo nenhum ===');
{
  eq('sem transações: não sei', valorRecebidoDoPedido({}), 'null');
  eq('lista vazia: não sei', valorRecebidoDoPedido({ transactions: [] }), 'null');
  eq('só transação pendente: não sei',
    valorRecebidoDoPedido({ transactions: [{ status: 'pending', amount: 50 }] }), 'null');
  eq('soma só o que está pago',
    valorRecebidoDoPedido({ transactions: [
      { status: 'paid', amount: 30 }, { status: 'approved', amount: 10 },
      { status: 'pending', amount: 60 },
    ] }), 40);
  eq('aceita valor em objeto {value}',
    valorRecebidoDoPedido({ transactions: [{ status: 'paid', amount: { value: '25.50' } }] }), 25.5);
  eq('lixo não vira número',
    valorRecebidoDoPedido({ transactions: [{ status: 'paid', amount: 'abc' }] }), 'null');
}

console.log('\n=== M. estado bruto normalizado, decisão não muda ===');
{
  const r = pagamentoDoPedido({ payment_status: 'PENDING', status: 'open' }, DIA, 100);
  eq('maiúsculas não confundem a decisão', r.cobravel, 1);
  eq('e o estado bruto fica em minúsculas', r.estadoLoja, 'pending');
}

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\ntudo ok\n');
process.exit(falhas ? 1 : 0);
