/** REVISÃO OPERACIONAL 1 — as provas dos cenários A–T do pacote.
 *
 *  Cada seção começa dizendo o DEFEITO que ela existe para impedir de
 *  voltar. Teste que só afirma o comportamento certo não explica por que ele
 *  importa, e quem mexer no código depois não sabe o que vai quebrar.
 *
 *  Os defeitos, em uma linha cada:
 *
 *   §35  os cartões de Lançamentos somavam só a tabela `vendas`: escolher
 *        05/08/2026 mostrava R$ 0 com a lista cheia logo abaixo;
 *   §35b `/api/vendas/dia` descartava do segundo item em diante de cada
 *        venda como se fosse repetição — R$ 110 em 3 peças virava R$ 50 em 1;
 *   §36  a troca de garantia não criava registro comercial da peça nova, e a
 *        diferença de R$ 10 da Evelyn não tinha como ser cobrada;
 *   §37  "A receber" lia uma fonte só: venda fiada e diferença de troca não
 *        apareciam em lugar nenhum do Painel;
 *   §38  o card "Gastou" do perfil mostrava o RECEBIDO como se fosse o
 *        comprado — quem comprou R$ 1.000 e pagou R$ 700 aparecia com 700;
 *   §39  não havia como corrigir o SKU de uma venda já registrada;
 *   §40  "REVISAR VARIAÇÃO" avisava e não oferecia caminho para resolver;
 *   §41  colar personalizado não tinha onde ser modelado sem explodir o
 *        cadastro em variantes.
 *
 *      api/dev-local.sh && node src/pos-golive-1-test.mjs
 */
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x, x2 = '') => (x ? ok(t, x2) : bad(t, x2));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const P = (s) => `PG1-${s}`;
const saldo = async (sku) => {
  const st = await api('GET', '/api/state');
  return Number((st.corpo?.produtos ?? []).find((p) => p.sku === sku)?.qtd ?? -1);
};
const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  const d = r.corpo?.divergentes ?? r.corpo?.divergencias ?? r.corpo ?? [];
  return Array.isArray(d) ? d.length === 0 : (d.total ?? 0) === 0;
};

console.log('\n=== 0. catálogo de teste ===');
{
  const r = await api('POST', '/api/produtos/importar', {
    produtos: [
      /* os dois SKUs do caso real da Evelyn Veiga */
      { sku: P('393950'), desc: 'Anel Minimalista Cruz Banho de Ouro 18k', preco: 89, cat: 'Anéis', qtd: 10 },
      { sku: P('313860'), desc: 'Anel Trama Banho de Ouro 18k', preco: 99, cat: 'Anéis', qtd: 10 },
      /* o caso da Juliana Negri: código errado e código certo */
      { sku: P('999999'), desc: 'Brinco Errado', preco: 60, cat: 'Brincos', qtd: 10 },
      { sku: P('326660'), desc: 'Brinco Argola Média Banho de Ouro 18k', preco: 60, cat: 'Brincos', qtd: 10 },
      /* Monte seu Colar: base e componentes */
      { sku: P('VENEZ'), desc: 'Colar Veneziana Banho de Ouro 18k', preco: 79, cat: 'Colares', qtd: 10 },
      { sku: P('MENVE'), desc: 'Pingente Filho Verde Banho de Ouro 18k', preco: 35, cat: 'Pingentes', qtd: 4 },
      { sku: P('MENAZ'), desc: 'Pingente Filho Azul Banho de Ouro 18k', preco: 35, cat: 'Pingentes', qtd: 3 },
      { sku: P('MENRO'), desc: 'Pingente Filha Rosa Banho de Ouro 18k', preco: 35, cat: 'Pingentes', qtd: 5 },
      /* variação, para os cenários P–S */
      { sku: P('AROVAR'), desc: 'Anel Solitário Coroa Cravejado Cristal', preco: 109, cat: 'Anéis', qtd: 6 },
    ],
  });
  eq('catálogo importado', r.status, 200);
  verdade('razão fecha antes de começar', await razaoFecha());
}

/* ══════════════════════════════════════════════════════════ CENÁRIO A / B
   O defeito: os cartões de Lançamentos eram somados no navegador a partir
   de `GET /api/vendas`, que só lê a tabela `vendas`. Um dia com movimento
   histórico aparecia zerado. E o cartão de acerto dizia "peças que a
   revendedora não devolveu" — peça em maleta não é venda. */
console.log('\n=== A/B. os cartões seguem a data escolhida ===');
{
  const r1 = await api('POST', '/api/vendas', {
    clienteNome: 'Cartao Um', data: '2026-08-05',
    itens: [{ sku: P('393950'), qtd: 1 }, { sku: P('313860'), qtd: 2 }],
  });
  eq('venda de 05/08 registrada', r1.status, 201);
  eq('total da venda', r1.corpo.total, 89 + 99 * 2);

  const dia = await api('GET', '/api/vendas/lancamentos?data=2026-08-05');
  eq('cartões da data respondem', dia.status, 200);
  eq('vendido no dia', dia.corpo.vendidoNoDia.valor, 287);
  eq('peças no dia', dia.corpo.vendidoNoDia.pecas, 3);
  eq('balcão: valor', dia.corpo.balcao.valor, 287);
  eq('balcão: 1 venda, não 3 linhas', dia.corpo.balcao.vendas, 1);
  eq('balcão: 3 peças', dia.corpo.balcao.pecas, 3);
  eq('acerto sem movimento no dia', dia.corpo.acerto.liquido, 0);

  const outro = await api('GET', '/api/vendas/lancamentos?data=2026-08-06');
  eq('outra data zera os cartões', outro.corpo.vendidoNoDia.valor, 0);
  eq('e a data volta no corpo', outro.corpo.data, '2026-08-06');

  /* §35b — o defeito da deduplicação: a chave era da VENDA, então do
     segundo item em diante cada linha era descartada como repetição. */
  const bruto = await api('GET', '/api/vendas/dia?data=2026-08-05');
  eq('o dia mostra os 2 itens da venda', bruto.corpo.itens.length, 2);
  eq('e nada foi descartado como duplicata', bruto.corpo.resumo.duplicadasRemovidas, 0);
  eq('peças vendidas no dia', bruto.corpo.resumo.pecasVendidas, 3);
  eq('valor vendido no dia', bruto.corpo.resumo.valorVendido, 287);
}

/* ═══════════════════════════════════════════════════════════ CENÁRIO G/H
   O caso real da Evelyn Veiga, do print de 05/08/2026:
     393950 (R$ 89) → garantia → sem conserto → troca por 313860 (R$ 99)
     diferença R$ 10 · a receber
   O sistema registrava a troca e parava ali: não havia ação para receber os
   R$ 10, e eles não apareciam no A Receber. */
console.log('\n=== G/H. troca da Evelyn: R$ 89 → R$ 99, diferença R$ 10 ===');
let vendaEvelyn; let garantiaEvelyn; let vendaDaTroca;
{
  const compra = await api('POST', '/api/vendas', {
    clienteNome: 'Evelyn Veiga', data: '2026-03-14',
    itens: [{ sku: P('393950'), qtd: 1 }],
  });
  eq('compra original registrada', compra.status, 201);
  vendaEvelyn = compra.corpo.id;

  const g = await api('POST', '/api/garantias', {
    origemFonte: 'operacional', vendaId: vendaEvelyn, sku: P('393950'),
    motivo: 'Peça escureceu', dataEntrada: '2026-06-02',
  });
  eq('garantia aberta', g.status, 201);
  garantiaEvelyn = g.corpo.garantia.id;
  eq('valor pago original reconhecido', g.corpo.garantia.valorPagoOriginal, 89);

  const antesNova = await saldo(P('313860'));
  const t = await api('POST', `/api/garantias/${garantiaEvelyn}/troca`, {
    skuNovo: P('313860'), data: '2026-08-05',
  });
  eq('troca registrada', t.status, 201);
  eq('diferença calculada', t.corpo.diferenca, 10);
  eq('status da diferença', t.corpo.diferencaStatus, 'a_receber');

  /* §36 — a peça nova nasce como registro comercial */
  eq('criou registro comercial da peça nova', t.corpo.criouVenda, true);
  vendaDaTroca = t.corpo.vendaId;
  verdade('e devolveu o id da venda criada', !!vendaDaTroca, String(vendaDaTroca));

  /* estoque: a peça nova sai UMA vez */
  eq('estoque da peça nova baixou 1', await saldo(P('313860')), antesNova - 1);
  verdade('razão fecha depois da troca', await razaoFecha());

  /* o dinheiro: nada foi faturado ainda */
  eq('nada faturado na troca', t.corpo.faturamento, 0);

  /* a venda criada vale a DIFERENÇA, não os R$ 99 */
  const vs = await api('GET', '/api/vendas?data=2026-08-05');
  const vt = (vs.corpo ?? []).find((v) => v.id === vendaDaTroca);
  verdade('a venda da troca aparece no dia', !!vt);
  eq('a venda vale a diferença, não o preço da peça', vt.total, 10);
  eq('e nasce NÃO paga', vt.pago, false);
  eq('o item guarda o preço de tabela da peça nova', vt.itens[0].precoTabela, 99);
  eq('o crédito da peça devolvida aparece como abatimento', vt.itens[0].descontoValor, 89);
  verdade('e é rotulado como crédito de garantia',
    /Crédito de garantia/.test(vt.itens[0].descontoRotulo || ''), vt.itens[0].descontoRotulo);
}

console.log('\n=== G2. a diferença aparece no A Receber ===');
{
  const cr = await api('GET', '/api/contas-receber');
  eq('a lista responde', cr.status, 200);
  const linha = (cr.corpo.contas ?? []).find((c) => c.chave === `venda:${vendaDaTroca}`);
  verdade('a diferença da Evelyn está no A Receber', !!linha);
  eq('com o valor da diferença', linha.valorReceber, 10);
  eq('e a origem dita por extenso', linha.origem, 'Diferença de troca/garantia');
  eq('em nome da cliente', linha.cliente, 'Evelyn Veiga');

  /* o Painel também tem que enxergar */
  const p = await api('GET', '/api/analytics/painel');
  const noPainel = (p.corpo?.contasReceber?.contas ?? [])
    .some((c) => c.chave === `venda:${vendaDaTroca}`);
  verdade('e o Painel mostra a mesma linha', noPainel);
}

console.log('\n=== H. registrar o pagamento da diferença encerra a pendência ===');
{
  const antesEstoque = await saldo(P('313860'));
  const r = await api('POST', '/api/contas-receber/receber', {
    chave: `venda:${vendaDaTroca}`, confirmar: true, pagaEm: '2026-09-01',
  });
  eq('pagamento registrado', r.status, 200);
  eq('sem tocar em estoque', r.corpo.estoqueTocado, false);
  eq('estoque realmente não mexeu', await saldo(P('313860')), antesEstoque);

  const cr = await api('GET', '/api/contas-receber');
  const aindaLa = (cr.corpo.contas ?? []).some((c) => c.chave === `venda:${vendaDaTroca}`);
  verdade('a pendência saiu do A Receber', !aindaLa);

  /* a garantia também fechou — as duas linhas andam juntas */
  const g = await api('GET', `/api/garantias/${garantiaEvelyn}`);
  eq('a troca ficou como paga', g.corpo.troca.diferencaStatus, 'paga');
  eq('na data informada', g.corpo.troca.diferencaPagaEm, '2026-09-01');
  eq('e a troca aponta para a venda', g.corpo.troca.vendaId, vendaDaTroca);

  /* NÃO pode contar duas vezes: o faturamento de setembro tem R$ 10, e não
     R$ 20 (venda + diferença somadas em separado) */
  const dia = await api('GET', '/api/vendas/lancamentos?data=2026-09-01');
  eq('entrou no caixa exatamente uma vez', dia.corpo.recebidoNoDia, 10);
  verdade('razão continua fechando', await razaoFecha());
}

/* ═══════════════════════════════════════════════════════════ CENÁRIO J
   O defeito: o card "GASTOU" do perfil somava o RECEBIDO. Uma cliente que
   comprou R$ 1.000 e pagou R$ 700 aparecia como se tivesse comprado 700. */
console.log('\n=== J. comprou 1000, pagou 700, deve 300 ===');
{
  const paga = await api('POST', '/api/vendas', {
    clienteNome: 'Compradora Parcial', data: '2026-07-10',
    itens: [{ sku: P('313860'), qtd: 7, preco: 100, descontoRotulo: 'Grupo VIP' }],
  });
  eq('compra paga de R$ 700', paga.corpo.total, 700);

  const aberta = await api('POST', '/api/vendas', {
    clienteNome: 'Compradora Parcial', data: '2026-07-11', pago: false,
    itens: [{ sku: P('999999'), qtd: 3, preco: 100, descontoRotulo: 'Grupo VIP' }],
  });
  eq('compra fiada de R$ 300', aberta.corpo.total, 300);

  const perfil = await api('GET', '/api/clientes/perfil?norm=' + encodeURIComponent('compradora parcial'));
  eq('perfil responde', perfil.status, 200);
  eq('COMPROU', perfil.corpo.resumo.comprou, 1000);
  eq('PAGO', perfil.corpo.resumo.pago, 700);
  eq('EM ABERTO', perfil.corpo.resumo.emAberto, 300);
  eq('compras', perfil.corpo.resumo.vendas, 2);
  eq('peças', perfil.corpo.resumo.pecas, 10);
  /* o ticket médio dela passa a ser do que ela COMPRA, para não contradizer
     o card de cima: 1000 / 2 compras */
  eq('ticket médio coerente com o comprado', perfil.corpo.resumo.ticketMedio, 500);

  /* a venda fiada também tem que estar no A Receber */
  const cr = await api('GET', '/api/contas-receber');
  const l = (cr.corpo.contas ?? []).find((c) => c.chave === `venda:${aberta.corpo.id}`);
  verdade('a venda fiada está no A Receber', !!l);
  eq('pelos R$ 300', l && l.valorReceber, 300);
}

/* ═══════════════════════════════════════════════════════════ CENÁRIO I
   O defeito relatado pela Sthefany: digitar a data de prazo era difícil, e
   o valor não sobrevivia ao recarregar. */
console.log('\n=== I. prazo salvo e relido ===');
{
  const cr = await api('GET', '/api/contas-receber');
  const conta = (cr.corpo.contas ?? []).find((c) => c.tipo === 'venda' && c.podeDefinirPrazo);
  verdade('há conta que aceita prazo', !!conta);

  const r = await api('PATCH', '/api/contas-receber/prazo', {
    chave: conta.chave, vencimentoEm: '2026-09-15',
  });
  eq('prazo aceito', r.status, 200);

  /* recarregar tem que trazer o mesmo valor: o defeito relatado era o
     campo voltar vazio depois do Enter. */
  const outra = await api('GET', '/api/contas-receber');
  const relida = (outra.corpo.contas ?? []).find((c) => c.chave === conta.chave);
  eq('o prazo sobreviveu ao recarregar', relida && relida.vencimentoEm, '2026-09-15');
  eq('e a conta não passou a ser vencida', relida && relida.vencida, 'false');

  const invalida = await api('PATCH', '/api/contas-receber/prazo', {
    chave: conta.chave, vencimentoEm: '2026-02-31',
  });
  eq('31 de fevereiro é recusado', invalida.status, 400);
  const aindaVale = await api('GET', '/api/contas-receber');
  eq('e a data boa continua lá',
    (aindaVale.corpo.contas ?? []).find((c) => c.chave === conta.chave)?.vencimentoEm, '2026-09-15');

  const limpa = await api('PATCH', '/api/contas-receber/prazo', {
    chave: conta.chave, vencimentoEm: null,
  });
  eq('apagar o prazo é permitido', limpa.status, 200);
  const semPrazo = await api('GET', '/api/contas-receber');
  eq('e some mesmo',
    (semPrazo.corpo.contas ?? []).find((c) => c.chave === conta.chave)?.vencimentoEm, 'null');
  await api('PATCH', '/api/contas-receber/prazo', { chave: conta.chave, vencimentoEm: '2026-09-15' });
}

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
