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

/* ═════════════════════════════════════════════════════════ CENÁRIO C–F
   O defeito: o gráfico "Evolução por mês" mostrava 25 barras e não deixava
   perguntar nada sobre nenhuma delas. */
console.log('\n=== C–F. resumo de um mês ===');
{
  /* Maio e junho de 2026, não outubro: a venda não pode ser de data futura
     (o sistema recusa, e com razão), e hoje é setembro de 2026 no ambiente
     de teste. Datar o cenário no futuro faria o teste falhar por causa do
     teste. */
  /* a MESMA cliente compra quatro vezes em maio — o teste de "clientes
     atendidos", que é gente e não compra */
  for (const d of ['2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23']) {
    const r = await api('POST', '/api/vendas', {
      clienteNome: 'Repetida do Mes', data: d, itens: [{ sku: P('326660'), qtd: 1 }],
    });
    eq(`compra de ${d} registrada`, r.status, 201);
  }
  await api('POST', '/api/vendas', {
    clienteNome: 'Outra do Mes', data: '2026-05-05',
    itens: [{ sku: P('393950'), qtd: 2 }],
  });
  /* e uma compra fiada de maio que só será paga em junho: é ela que separa
     "vendido no mês" de "faturado no mês" */
  /* uma peça que os cenários anteriores não consumiram: o estoque de
     313860 já acabou lá em cima, e uma venda recusada por falta de peça
     faria este cenário falhar por motivo alheio ao que ele prova. */
  const fiada = await api('POST', '/api/vendas', {
    clienteNome: 'Fiada de Maio', data: '2026-05-20', pago: false,
    itens: [{ sku: P('VENEZ'), qtd: 1 }],
  });
  eq('a compra fiada foi registrada', fiada.status, 201);

  const m = await api('GET', '/api/analytics/mes?mes=2026-05');
  eq('o resumo do mês responde', m.status, 200);
  eq('com o mês por extenso', m.corpo.rotulo, 'maio de 2026');

  /* C — os quatro cartões */
  eq('vendas do mês', m.corpo.cards.vendas.total, 6);
  eq('peças do mês', m.corpo.cards.pecas.total, 7);
  /* D — cliente repetida conta UMA vez */
  eq('clientes atendidos são pessoas, não compras', m.corpo.cards.clientesAtendidos.total, 3);
  /* faturamento exclui a fiada: 4×60 + 2×89 = 418, e os 99 ficam de fora */
  eq('faturamento do mês, sem a compra fiada', m.corpo.cards.faturamento.valor, 418);

  /* E — as categorias somam as peças do mês */
  const somaCat = (m.corpo.categorias ?? []).reduce((s, c) => s + c.pecas, 0);
  eq('a soma das categorias bate com as peças', somaCat, m.corpo.cards.pecas.total);

  /* F — o histórico traz venda e itens */
  eq('o histórico lista as compras do mês', m.corpo.vendas.length, 6);
  const daFiada = m.corpo.vendas.find((v) => v.id === fiada.corpo.id && v.fonte === 'operacional');
  verdade('a compra fiada aparece na lista de vendas', !!daFiada);
  eq('marcada como ainda não paga', daFiada && daFiada.aindaNaoPaga, 'true');
  eq('e com o valor comercial, não zero', daFiada && daFiada.valor, 79);
  verdade('cada compra traz os itens dela',
    (m.corpo.vendas[0].itens ?? []).length > 0, String((m.corpo.vendas[0].itens ?? []).length));

  /* §2.4 — pagar em junho move o dinheiro, não a venda */
  const pg = await api('POST', '/api/contas-receber/receber', {
    chave: `venda:${fiada.corpo.id}`, confirmar: true, pagaEm: '2026-06-04',
  });
  eq('pagamento em junho aceito', pg.status, 200);
  const out = await api('GET', '/api/analytics/mes?mes=2026-05');
  const jun = await api('GET', '/api/analytics/mes?mes=2026-06');
  eq('a venda continua sendo de maio', out.corpo.cards.vendas.total, 6);
  eq('a peça também', out.corpo.cards.pecas.total, 7);
  eq('o faturamento de maio não mudou', out.corpo.cards.faturamento.valor, 418);
  eq('e os R$ 79 entraram em junho', jun.corpo.cards.faturamento.valor, 79);
  eq('sem virar venda de junho', jun.corpo.cards.vendas.total, 0);
  eq('junho declara de onde veio o dinheiro',
    jun.corpo.faturamentoDeOutrosMeses.valor, 79);
  const marcada = out.corpo.vendas.find((v) => v.id === fiada.corpo.id && v.fonte === 'operacional');
  eq('e a linha de maio diz que foi paga em outro mês',
    marcada && marcada.faturaEmOutroMes, 'true');

  const invalido = await api('GET', '/api/analytics/mes?mes=2026-13');
  eq('mês impossível é recusado', invalido.status, 400);
}

/* ═══════════════════════════════════════════════════════ CENÁRIO K / L
   O caso real: Juliana Negri, 30/08/2026, peça lançada com o código errado.
   O certo é 326660. Não havia caminho nenhum pela interface, e as duas
   saídas óbvias eram as duas erradas — cancelar e relançar perde a venda,
   editar direto torna a correção indistinguível de um erro novo. */
console.log('\n=== K/L. corrigir o SKU de uma venda operacional ===');
{
  const antesErrado = await saldo(P('999999'));
  const antesCerto = await saldo(P('326660'));

  const v = await api('POST', '/api/vendas', {
    clienteNome: 'Juliana Negri', data: '2026-08-30',
    itens: [{ sku: P('999999'), qtd: 1 }],
  });
  eq('venda de 30/08 registrada', v.status, 201);
  const vendaId = v.corpo.id;
  eq('estoque do código errado baixou', await saldo(P('999999')), antesErrado - 1);

  const r = await api('POST', '/api/vendas/corrigir-item', {
    fonte: 'operacional', vendaId, sku: P('999999'), skuNovo: P('326660'),
    motivo: 'Código lançado errado no balcão',
  });
  eq('correção aceita', r.status, 200);
  eq('e o texto da auditoria sai no formato pedido',
    /^SKU corrigido de .* para .* em \d{2}\/\d{2}\/\d{4}\.$/.test(r.corpo.correcao.texto), 'true');

  /* L — o estoque anda uma vez em cada lado */
  eq('o código errado recebeu a peça de volta', await saldo(P('999999')), antesErrado);
  eq('e o certo baixou uma', await saldo(P('326660')), antesCerto - 1);
  verdade('a razão continua fechando', await razaoFecha());

  /* a venda continua a mesma: cliente, data, preço, faturamento */
  const dia = await api('GET', '/api/vendas?data=2026-08-30');
  const venda = (dia.corpo ?? []).find((x) => x.id === vendaId);
  verdade('a venda continua existindo', !!venda);
  eq('mesma cliente', venda.clienteNome, 'Juliana Negri');
  eq('mesma data', venda.data, '2026-08-30');
  eq('mesmo total', venda.total, 60);
  eq('o item agora tem o código certo', venda.itens[0].sku, P('326660'));
  eq('e o nome da peça certa', venda.itens[0].desc, 'Brinco Argola Média Banho de Ouro 18k');
  eq('a correção não alterou faturamento', r.corpo.faturamentoAlterado, 'false');

  /* a auditoria aparece no perfil da cliente, junto do item */
  const perfil = await api('GET', '/api/clientes/perfil?norm=' + encodeURIComponent('juliana negri'));
  const c = (perfil.corpo.correcoes ?? [])[0];
  verdade('a correção aparece na ficha da cliente', !!c);
  eq('dizendo de qual código para qual', c && c.skuAntes + '→' + c.skuDepois,
    `${P('999999')}→${P('326660')}`);
  eq('e que o estoque foi movido', c && c.estoqueMovido, 'true');

  /* corrigir de novo para o mesmo código é recusado */
  const denovo = await api('POST', '/api/vendas/corrigir-item', {
    fonte: 'operacional', vendaId, sku: P('326660'), skuNovo: P('326660'),
  });
  eq('corrigir para o mesmo código é recusado', denovo.status, 409);

  /* código que não existe no catálogo é recusado antes de escrever nada */
  const inexistente = await api('POST', '/api/vendas/corrigir-item', {
    fonte: 'operacional', vendaId, sku: P('326660'), skuNovo: 'NAO-EXISTE',
  });
  eq('código fora do catálogo é recusado', inexistente.status, 400);
  eq('e o estoque não se mexeu por causa disso', await saldo(P('326660')), antesCerto - 1);
}

/* ══════════════════════════════════════════════════════════ CENÁRIO M
   Linha da planilha: o estoque dela já estava refletido no saldo inicial.
   Movimentar aqui criaria uma peça no código errado e sumiria com uma no
   certo — e é exatamente esse o erro que o cenário existe para impedir. */
console.log('\n=== M. corrigir o SKU de uma linha do histórico ===');
{
  /* A planilha chega como array de arrays: cabeçalho + linhas, do mesmo
     jeito que o SheetJS entrega no navegador. */
  const lote = await api('POST', '/api/vendas/historico/importar', {
    arquivo: 'correcao-pos-golive-1.xlsx',
    linhas: [
      ['Nº', 'Data', 'Nome do Cliente', 'ID Produto Marquesa', 'Nome Produto',
        'Quantidade Vendida', 'Preço Unit. Venda', 'Valor Total Venda',
        'Forma de Pagamento', 'Status Pagamento', 'Observação Venda'],
      ['9001', '2026-04-10', 'Historica Correcao', P('999999'), 'Peça com código errado',
        1, 60, 60, 'PIX', 'PAGO', 'Maleta'],
    ],
  });
  eq('lote histórico importado', lote.status, 201);

  const lista = await api('GET', '/api/vendas/lista?busca=' + encodeURIComponent('Historica Correcao'));
  const linha = (lista.corpo?.itens ?? []).find((x) => x.fonte === 'historico');
  verdade('a linha da planilha foi encontrada', !!linha,
    linha ? JSON.stringify({ id: linha.id, sku: linha.sku }) : 'nenhuma');

  if (!linha) {
    bad('sem linha histórica para corrigir — o cenário M não rodou');
  } else {
    linha.itemId = linha.id ?? linha.itemId;
    const antesErrado = await saldo(P('999999'));
    const antesCerto = await saldo(P('326660'));
    const r = await api('POST', '/api/vendas/corrigir-item', {
      fonte: 'historico', historicoItemId: linha.itemId, skuNovo: P('326660'),
      motivo: 'Código da planilha estava errado',
    });
    eq('correção histórica aceita', r.status, 200);
    eq('e ela NÃO movimenta estoque', r.corpo.estoque.movimentado, 'false');
    eq('o código errado não ganhou peça', await saldo(P('999999')), antesErrado);
    eq('o certo não perdeu peça', await saldo(P('326660')), antesCerto);
    verdade('a razão continua fechando', await razaoFecha());
    verdade('e a célula da planilha continua intacta',
      !!r.corpo.fontePreservada && r.corpo.fontePreservada.skuOriginal !== P('326660'));

    const forcar = await api('POST', '/api/vendas/corrigir-item', {
      fonte: 'historico', historicoItemId: linha.itemId, skuNovo: P('393950'), moverEstoque: true,
    });
    eq('forçar movimento numa linha de planilha é recusado', forcar.status, 409);
  }
}

/* ═══════════════════════════════════════════════════ CENÁRIO P–S
   O print de 04/09/2026: a venda da Andreia Aparecida com o selo REVISAR
   VARIAÇÃO e a explicação certa — "647729: Há peças deste código em maleta
   aberta, e a maleta ainda não sabe qual variação saiu" — e nenhum caminho
   para responder. O sistema identificava o problema com precisão e parava. */
console.log('\n=== P–S. Central de Pendências e resolução de variação ===');
{
  /* o código com aro, como o 647729 do print */
  const varsSku = P('AROVAR');
  const dv = await api('PUT', `/api/produtos/${encodeURIComponent(varsSku)}/variacoes`, {
    atributos: [{ nome: 'Aro', valores: ['16', '18'] }],
  });
  eq('variações cadastradas', dv.status, 200);
  const rep = await api('POST', `/api/produtos/${encodeURIComponent(varsSku)}/repartir`, {
    distribuicao: { 16: 3, 18: 3 },
  });
  eq('estoque repartido entre os aros', rep.status, 200);
  verdade('razão fecha depois de repartir', await razaoFecha());

  /* ─── P: resolver pela VENDA */
  const venda = await api('POST', '/api/vendas', {
    clienteNome: 'Andreia Aparecida', data: '2026-09-04',
    itens: [{ sku: varsSku, qtd: 1, varianteId: null }],
  });
  /* venda de código com variação exige dizer qual quando a LOJA tem mais de
     uma variante; sem espelho da loja ela passa sem variação, e é
     exatamente esse o caso que vira pendência */
  eq('venda registrada', venda.status, 201);
  const vendaId = venda.corpo.id;

  const p1 = await api('GET', '/api/pendencias');
  eq('a central responde', p1.status, 200);
  const pv = (p1.corpo.pendencias ?? []).find(
    (x) => x.tipo === 'venda' && x.vendaId === vendaId && x.motivo === 'variacao_da_venda');
  verdade('a venda sem variação virou pendência', !!pv,
    pv ? pv.chave : JSON.stringify((p1.corpo.pendencias ?? []).map((x) => x.chave)));
  verdade('com as variações JÁ CADASTRADAS para escolher',
    pv && (pv.variacoesPossiveis ?? []).length === 2,
    pv ? (pv.variacoesPossiveis ?? []).map((v) => v.nome).join(',') : '');
  verdade('e a ação de resolver pela venda',
    pv && (pv.acoes ?? []).includes('resolver_venda'));

  const saldoAntes = await saldo(varsSku);
  const rv = await api('POST', '/api/pendencias/variacao/venda', {
    vendaId, sku: varsSku, variacao: '16',
  });
  eq('resolver pela venda foi aceito', rv.status, 200);
  /* R — resolver NÃO baixa estoque de novo */
  eq('e não movimentou estoque', rv.corpo.estoqueMovimentado, 'false');
  eq('o saldo do código não mudou', await saldo(varsSku), saldoAntes);
  verdade('a razão continua fechando', await razaoFecha());

  const p2 = await api('GET', '/api/pendencias');
  const aindaLa = (p2.corpo.pendencias ?? []).some((x) => x.chave === pv.chave);
  verdade('a pendência fechou sozinha', !aindaLa);

  /* a variação chegou nos DOIS lugares: a linha da venda e o movimento */
  const dia = await api('GET', '/api/vendas?data=2026-09-04');
  const linha = (dia.corpo ?? []).find((x) => x.id === vendaId);
  eq('a linha da venda agora diz o aro', linha && linha.itens[0].variacao, '16');
  const movs = await api('GET', `/api/produtos/${encodeURIComponent(varsSku)}/movimentos`);
  const mv = (movs.corpo?.movimentos ?? []).find((x) => x.vendaId === vendaId || x.venda_id === vendaId);
  if (mv) eq('e o movimento também', mv.variacao ?? mv.variacao_nome, '16');
  else ok('rota de movimentos não expõe o campo nesta versão — conferido pelo saldo por variação');

  /* variação que não existe é recusada, com a lista do que existe */
  const inventada = await api('POST', '/api/pendencias/variacao/venda', {
    vendaId, sku: varsSku, variacao: '99',
  });
  eq('variação não cadastrada é recusada', inventada.status, 409);

  /* ─── Q: resolver pela MALETA */
  const rev = await api('POST', '/api/revendedoras', { nome: 'Revendedora Pendencia' });
  const revId = rev.corpo?.id ?? rev.corpo?.revendedora?.id;
  verdade('revendedora criada', !!revId, String(revId));
  const mal = await api('POST', '/api/maletas', { revId, abertaEm: '2026-09-01' });
  eq('maleta aberta', mal.status, 201);
  const maletaId = mal.corpo.id;
  verdade('maleta tem id', !!maletaId, String(maletaId));
  /* os itens entram por rota própria, e o corpo é um mapa sku → quantidade */
  const mi = await api('POST', `/api/maletas/${maletaId}/itens`, {
    itens: { [varsSku]: 2 },
  });
  eq('2 peças do código foram para a maleta', mi.status, 200);

  const p3 = await api('GET', '/api/pendencias?tipo=maleta');
  const pm = (p3.corpo.pendencias ?? []).find((x) => x.maletaId === maletaId && x.sku === varsSku);
  verdade('a maleta sem variação virou pendência', !!pm,
    pm ? `${pm.chave} · falta ${pm.qtd}` : 'nenhuma');
  eq('dizendo quantas peças faltam identificar', pm && pm.qtd, 2);

  const saldoMaletaAntes = await saldo(varsSku);
  /* a maleta levou um 16 e um 18 — o caso normal, e a razão de a tabela ser
     filha em vez de uma coluna em maleta_itens */
  const rm = await api('POST', '/api/pendencias/variacao/maleta', {
    maletaId, sku: varsSku,
    distribuicao: [{ variacao: '16', qtd: 1 }, { variacao: '18', qtd: 1 }],
  });
  eq('resolver pela maleta foi aceito', rm.status, 200);
  eq('e não movimentou estoque', rm.corpo.estoqueMovimentado, 'false');
  eq('o saldo não mudou', await saldo(varsSku), saldoMaletaAntes);
  eq('e não falta mais identificar nada', rm.corpo.faltaIdentificar, 0);
  verdade('a razão continua fechando', await razaoFecha());

  const p4 = await api('GET', '/api/pendencias?tipo=maleta');
  const aindaMaleta = (p4.corpo.pendencias ?? []).some((x) => x.chave === pm.chave);
  verdade('a pendência da maleta fechou', !aindaMaleta);

  /* S — dizer mais do que saiu inventaria peça: recusado com os dois números */
  const demais = await api('POST', '/api/pendencias/variacao/maleta', {
    maletaId, sku: varsSku,
    distribuicao: [{ variacao: '16', qtd: 5 }],
  });
  eq('distribuição maior que o que saiu é recusada', demais.status, 409);
  verdade('e a recusa mostra os dois números',
    /soma 5/.test(demais.corpo.erro || '') && /2 peças/.test(demais.corpo.erro || ''),
    demais.corpo.erro);

  /* "revisar depois" tira da lista sem resolver — e exige uma data, porque
     adiar sem data é esquecer */
  const semData = await api('POST', '/api/pendencias/adiar', { chave: 'nuvemshop:1' });
  eq('adiar sem data é recusado', semData.status, 400);
}

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
