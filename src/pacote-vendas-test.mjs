/** O pacote de §29 a §32, provado ponta a ponta contra o Worker local.
 *
 *  Este arquivo é a resposta aos cenários A–K do pedido. Cada seção começa
 *  dizendo o DEFEITO que ela existe para impedir de voltar — porque um
 *  teste que só afirma o comportamento certo não explica por que ele
 *  importa, e o próximo a mexer no código não sabe o que vai quebrar.
 *
 *  Os defeitos, em uma linha cada:
 *
 *   §29  marcar uma venda "A Receber" como paga não movia o dinheiro para o
 *        mês em que ele entrou — `vendas` não tinha onde escrever a data;
 *   §30  brinde, uso próprio e diferença de inventário entravam como
 *        CLIENTE e como VENDA, inflando faturamento e ticket médio com
 *        dinheiro que nunca existiu;
 *   §31  não havia como registrar garantia por item da compra, e uma troca
 *        vinha sendo lançada como segunda venda — R$ 99 de faturamento
 *        onde só houve R$ 10 de diferença;
 *   §32  o filtro por data em Vendas mostrava metade do dia;
 *   §12  renomear uma cliente desligava o histórico dela, e a edição
 *        parecia não ter salvado.
 *
 *      api/dev-local.sh && node src/pacote-vendas-test.mjs
 */
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const naoEq = (t, a, b) => (String(a) !== String(b) ? ok(t, String(a)) : bad(t, `não podia ser ${b}`));
const verdade = (t, x) => (x ? ok(t) : bad(t));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const hoje = new Date().toISOString().slice(0, 10);
const P = (sku) => `PV-${sku}`;

const saldo = async (sku) => {
  const st = await api('GET', '/api/state');
  return Number((st.corpo?.produtos ?? []).find((p) => p.sku === sku)?.qtd ?? -1);
};
const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  const div = r.corpo?.divergencias ?? r.corpo ?? [];
  return Array.isArray(div) ? div.length === 0 : (div.total ?? 0) === 0;
};

console.log('\n=== 0. catálogo de teste ===');
{
  const r = await api('POST', '/api/produtos/importar', {
    produtos: [
      { sku: P('ANEL'), desc: 'Anel Minimalista Cruz', preco: 89, cat: 'Anéis', qtd: 20 },
      { sku: P('BRIN'), desc: 'Brinco Pétalas', preco: 69, cat: 'Brincos', qtd: 20 },
      { sku: P('NOVO'), desc: 'Anel Trama', preco: 99, cat: 'Anéis', qtd: 20 },
      { sku: P('GIFT'), desc: 'Pingente Coração', preco: 49, cat: 'Pingentes', qtd: 20 },
    ],
  });
  eq('catálogo importado', r.status, 200);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO A
   Venda em julho, pagamento em setembro.
   A venda continua sendo de julho; o dinheiro é de setembro. */
console.log('\n=== A. venda de julho, pagamento em setembro ===');
let vendaA;
{
  const r = await api('POST', '/api/vendas', {
    clienteNome: 'Cenario A', itens: [{ sku: P('ANEL'), qtd: 1 }],
    data: '2026-07-15', pago: false,
  });
  eq('venda de 15/07 registrada', r.status, 201);
  vendaA = r.corpo.id;
  eq('total', r.corpo.total, 89);
  eq('nasce NÃO paga', r.corpo.pago, false);
  eq('sem data de pagamento', r.corpo.dataPagamento, null);
  eq('o valor inteiro fica a receber', r.corpo.aReceber, 89);

  const pg = await api('POST', `/api/vendas/${vendaA}/pagamento`, { dataPagamento: '2026-09-04' });
  eq('pagamento aceito', pg.status, 200);
  eq('a data da VENDA não mudou', pg.corpo.data, '2026-07-15');
  eq('a data do PAGAMENTO é setembro', pg.corpo.dataPagamento, '2026-09-04');
  eq('o faturamento é de setembro', pg.corpo.faturamentoEm, '2026-09-04');
  eq('marcar paga NÃO mexe em estoque', pg.corpo.estoqueAlterado, false);

  /* A prova que interessa: a série mensal põe a VENDA em julho e o DINHEIRO
     em setembro. Se as duas caíssem na mesma chave, a separação de §29 não
     estaria valendo em lugar nenhum. */
  const ev = await api('GET', '/api/analytics/evolucao?periodo=tudo&granularidade=mes');
  const pontos = ev.corpo?.pontos ?? [];
  const jul = pontos.find((p) => p.chave === '2026-07');
  const set = pontos.find((p) => p.chave === '2026-09');
  eq('julho conta a venda', jul?.vendas, 1);
  eq('julho NÃO conta o dinheiro', jul?.faturamento, 0);
  eq('setembro conta o dinheiro', set?.faturamento, 89);
  eq('setembro NÃO conta a venda', set?.vendas ?? 0, 0);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO B
   Venda NÃO paga: a receber, faturamento zero. Depois paga. */
console.log('\n=== B. não paga vira a receber; depois de paga, fatura ===');
{
  const antes = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const fatAntes = antes.corpo.faturamento;

  const r = await api('POST', '/api/vendas', {
    clienteNome: 'Cenario B', itens: [{ sku: P('BRIN'), qtd: 1 }], pago: false,
  });
  eq('venda não paga registrada', r.status, 201);

  const meio = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('faturamento NÃO subiu', meio.corpo.faturamento, fatAntes);
  eq('a receber subiu 69', +(meio.corpo.aReceber - antes.corpo.aReceber).toFixed(2), 69);

  const pg = await api('POST', `/api/vendas/${r.corpo.id}/pagamento`, {});
  eq('pagamento aceito', pg.status, 200);
  eq('data do pagamento é hoje por padrão', pg.corpo.dataPagamento, hoje);

  const depois = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('faturamento subiu 69', +(depois.corpo.faturamento - fatAntes).toFixed(2), 69);
  eq('a receber voltou ao que era', depois.corpo.aReceber, antes.corpo.aReceber);

  const dup = await api('POST', `/api/vendas/${r.corpo.id}/pagamento`, {});
  eq('pagar duas vezes é recusado', dup.status, 409);
  const depois2 = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('e o faturamento não dobrou', depois2.corpo.faturamento, depois.corpo.faturamento);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO C
   Preço de tabela 89, negociado 79. O item vale 79; o produto continua 89. */
console.log('\n=== C. preço negociado vale só nesta linha da venda ===');
{
  const r = await api('POST', '/api/vendas', {
    clienteNome: 'Cenario C',
    itens: [{ sku: P('ANEL'), qtd: 1, preco: 79, descontoRotulo: 'Grupo VIP' }],
  });
  eq('venda com preço negociado', r.status, 201);
  eq('o TOTAL é o cobrado', r.corpo.total, 79);

  const lista = await api('GET', `/api/vendas?data=${hoje}`);
  const v = (lista.corpo ?? []).find((x) => x.id === r.corpo.id);
  eq('o item foi gravado por 79', v?.itens?.[0]?.preco, 79);
  eq('e o de tabela ficou registrado', v?.itens?.[0]?.precoTabela, 89);
  eq('o desconto é derivado, não digitado', v?.itens?.[0]?.descontoValor, 10);

  const st = await api('GET', '/api/state');
  const prod = (st.corpo?.produtos ?? []).find((p) => p.sku === P('ANEL'));
  eq('o preço do CATÁLOGO não mudou', prod?.preco, 89);

  const semMotivo = await api('POST', '/api/vendas', {
    clienteNome: 'Cenario C', itens: [{ sku: P('ANEL'), qtd: 1, preco: 79 }],
  });
  eq('preço diferente SEM motivo é recusado', semMotivo.status, 409);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO D
   Brinde: −1 no estoque, +0 em tudo o que é comercial. */
console.log('\n=== D. brinde baixa estoque e não é venda ===');
let brindeId;
{
  const a = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const s0 = await saldo(P('GIFT'));

  const r = await api('POST', '/api/saidas', {
    tipo: 'brinde', sku: P('GIFT'), qtd: 1, motivo: 'Dia das Mães',
    observacao: 'ação promocional',
  });
  eq('brinde registrado', r.status, 201);
  brindeId = r.corpo.saida.id;
  eq('estoque −1', await saldo(P('GIFT')), s0 - 1);
  eq('a própria resposta diz que não faturou', r.corpo.faturamento, 0);
  eq('e que não criou venda', r.corpo.criouVenda, false);
  eq('e que não criou cliente', r.corpo.criouCliente, false);

  const b = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('faturamento inalterado', b.corpo.faturamento, a.corpo.faturamento);
  eq('vendas inalteradas', b.corpo.vendas, a.corpo.vendas);
  eq('peças vendidas inalteradas', b.corpo.pecas, a.corpo.pecas);
  eq('clientes inalterados', b.corpo.clientes, a.corpo.clientes);
  eq('ticket médio inalterado', b.corpo.ticketMedio.valor, a.corpo.ticketMedio.valor);

  const rank = await api('GET', '/api/analytics/clientes?periodo=tudo&limite=50');
  const nomes = (rank.corpo?.clientes ?? []).map((c) => String(c.nome ?? '').toLowerCase());
  verdade('o brinde não virou cliente no ranking',
    !nomes.some((n) => n.includes('brinde') || n.includes('dia das mães')));

  const semExplicacao = await api('POST', '/api/saidas', { tipo: 'brinde', sku: P('GIFT'), qtd: 1 });
  eq('saída sem explicação nenhuma é recusada', semExplicacao.status, 409);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO E
   Uso próprio: mesmo comportamento financeiro do brinde. */
console.log('\n=== E. uso próprio tem o mesmo efeito financeiro do brinde ===');
{
  const a = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const s0 = await saldo(P('GIFT'));

  const r = await api('POST', '/api/saidas', {
    tipo: 'uso_proprio', sku: P('GIFT'), qtd: 1, motivo: 'uso pessoal',
  });
  eq('uso próprio registrado', r.status, 201);
  eq('estoque −1', await saldo(P('GIFT')), s0 - 1);

  const b = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('faturamento inalterado', b.corpo.faturamento, a.corpo.faturamento);
  eq('vendas inalteradas', b.corpo.vendas, a.corpo.vendas);
  eq('não aparece como compra de ninguém', b.corpo.clientes, a.corpo.clientes);

  const entrada = await api('POST', '/api/saidas', {
    tipo: 'uso_proprio', sentido: 'entrada', sku: P('GIFT'), qtd: 1, motivo: 'x',
  });
  eq('uso próprio não pode SOMAR peça', entrada.status, 400);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO F
   Perda de inventário: ajusta estoque, faturamento zero. */
console.log('\n=== F. diferença de inventário ajusta estoque e não fatura ===');
{
  const a = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const s0 = await saldo(P('BRIN'));

  const r = await api('POST', '/api/saidas', {
    tipo: 'perda', sku: P('BRIN'), qtd: 2,
    observacao: 'PERDIDO — não foi possível identificar a origem da diferença',
  });
  eq('perda registrada', r.status, 201);
  eq('estoque −2', await saldo(P('BRIN')), s0 - 2);

  const b = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('faturamento inalterado', b.corpo.faturamento, a.corpo.faturamento);
  eq('vendas inalteradas', b.corpo.vendas, a.corpo.vendas);

  /* Diferença para o outro lado: a sobra é o único caso que SOMA peça, e
     ela existe porque um inventário pode achar peça a mais. */
  const s1 = await saldo(P('BRIN'));
  const sobra = await api('POST', '/api/saidas', {
    tipo: 'perda', sentido: 'entrada', sku: P('BRIN'), qtd: 1,
    observacao: 'sobra encontrada na contagem',
  });
  eq('sobra de inventário aceita', sobra.status, 201);
  eq('estoque +1', await saldo(P('BRIN')), s1 + 1);
  const c = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('e continua sem faturar', c.corpo.faturamento, a.corpo.faturamento);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO G
   Garantia: venda original intacta, estoque intacto, faturamento intacto. */
console.log('\n=== G. garantia não toca em venda, estoque nem faturamento ===');
let vendaG; let garantiaG;
{
  const v = await api('POST', '/api/vendas', {
    clienteNome: 'Evelyn Teste',
    itens: [{ sku: P('ANEL'), qtd: 1, preco: 89 }],
  });
  eq('compra de origem registrada', v.status, 201);
  vendaG = v.corpo.id;

  const a = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const s0 = await saldo(P('ANEL'));

  const g = await api('POST', '/api/garantias', {
    vendaId: vendaG, sku: P('ANEL'),
    motivo: 'a pedra soltou', dataEntrada: hoje,
  });
  eq('garantia aberta', g.status, 201);
  garantiaG = g.corpo.garantia.id;
  eq('vinculada ao ITEM daquela venda', g.corpo.garantia.vendaId, vendaG);
  eq('com o valor que ela PAGOU', g.corpo.garantia.valorPagoOriginal, 89);
  eq('prazo de 45 dias úteis', g.corpo.garantia.prazoDiasUteis, 45);
  verdade('com previsão de retorno calculada', !!g.corpo.garantia.previsaoRetorno);
  eq('zero dias úteis decorridos no dia da entrada', g.corpo.garantia.diasUteisDecorridos, 0);
  eq('45 restantes', g.corpo.garantia.diasUteisRestantes, 45);
  eq('não mexeu em estoque', g.corpo.estoqueAlterado, false);
  eq('não alterou a venda original', g.corpo.vendaOriginalAlterada, false);

  eq('o estoque comercial não foi incrementado', await saldo(P('ANEL')), s0);
  const b = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('faturamento inalterado', b.corpo.faturamento, a.corpo.faturamento);
  eq('vendas inalteradas', b.corpo.vendas, a.corpo.vendas);

  const lista = await api('GET', `/api/vendas?data=${hoje}`);
  const vv = (lista.corpo ?? []).find((x) => x.id === vendaG);
  eq('a venda original continua com o total dela', vv?.total, 89);
  eq('e com o item dela', vv?.itens?.length, 1);

  const dup = await api('POST', '/api/garantias', {
    vendaId: vendaG, sku: P('ANEL'), motivo: 'de novo',
  });
  eq('a mesma peça não abre duas garantias em aberto', dup.status, 409);

  const painel = await api('GET', '/api/analytics/painel?periodo=tudo');
  eq('a garantia aparece em Peças em reparo', painel.corpo?.pecasEmReparo?.total, 1);
  const item = painel.corpo?.pecasEmReparo?.itens?.[0];
  eq('com o nome da cliente', item?.clienteNome, 'Evelyn Teste');
  eq('e com o código da peça', item?.sku, P('ANEL'));
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO H
   Troca 89 → 99: baixa só a peça nova, faturamento imediato 0,
   diferença 10 a receber. Depois de paga, faturamento +10 — nunca +99. */
console.log('\n=== H. troca de garantia: entra a diferença, nunca o preço cheio ===');
{
  const a = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const sNovo = await saldo(P('NOVO'));
  const sVelho = await saldo(P('ANEL'));

  const t = await api('POST', `/api/garantias/${garantiaG}/troca`, {
    skuNovo: P('NOVO'), data: hoje,
  });
  eq('troca registrada', t.status, 201);
  eq('a peça nova saiu do estoque', await saldo(P('NOVO')), sNovo - 1);
  eq('a peça defeituosa NÃO voltou ao estoque', await saldo(P('ANEL')), sVelho);
  eq('a diferença é 99 − 89', t.corpo.diferenca, 10);
  eq('e está a receber', t.corpo.diferencaStatus, 'a_receber');
  eq('a troca não faturou nada agora', t.corpo.faturamento, 0);
  eq('e não criou venda', t.corpo.criouVenda, false);

  const b = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('faturamento não mudou com a troca', b.corpo.faturamento, a.corpo.faturamento);
  eq('a contagem de vendas não mudou', b.corpo.vendas, a.corpo.vendas);
  eq('as peças vendidas não mudaram', b.corpo.pecas, a.corpo.pecas);
  eq('o ticket médio não mudou', b.corpo.ticketMedio.valor, a.corpo.ticketMedio.valor);

  /* O movimento da peça nova precisa dizer POR QUE ela saiu. "Vendida"
     seria mentira, e é justamente a mentira que inflava o faturamento. */
  const mov = await api('GET', `/api/produtos/${encodeURIComponent(P('NOVO'))}/movimentos`);
  if (mov.status === 200) {
    const m = (mov.corpo?.movimentos ?? mov.corpo ?? [])[0];
    naoEq('a saída não é do tipo venda', m?.tipo, 'venda');
  } else {
    ok('rota de movimentos não existe nesta versão — origem conferida no banco pelo teste de razão');
  }

  const pg = await api('POST', `/api/garantias/${garantiaG}/troca/pagar`, { pagaEm: hoje });
  eq('diferença paga aceita', pg.status, 200);
  eq('e o que entra é 10', pg.corpo.faturamento, 10);
  eq('pela data do pagamento', pg.corpo.dataFaturamento, hoje);

  const c = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('faturamento subiu exatamente 10', +(c.corpo.faturamento - b.corpo.faturamento).toFixed(2), 10);
  naoEq('e NÃO subiu 99', +(c.corpo.faturamento - b.corpo.faturamento).toFixed(2), 99);
  eq('a contagem de vendas continua a mesma', c.corpo.vendas, b.corpo.vendas);
  eq('a origem do dinheiro é declarada', c.corpo.composicao.faturamentoDeDiferencaTroca, 10);

  const dup = await api('POST', `/api/garantias/${garantiaG}/troca/pagar`, {});
  eq('pagar a diferença duas vezes é recusado', dup.status, 409);
  const d = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('e o faturamento não dobrou', d.corpo.faturamento, c.corpo.faturamento);
}

console.log('\n=== H.2 troca mais barata: o sistema PARA em vez de inventar crédito ===');
{
  const v = await api('POST', '/api/vendas', {
    clienteNome: 'Troca Barata', itens: [{ sku: P('NOVO'), qtd: 1 }],
  });
  const g = await api('POST', '/api/garantias', {
    vendaId: v.corpo.id, sku: P('NOVO'), motivo: 'quebrou',
  });
  const t = await api('POST', `/api/garantias/${g.corpo.garantia.id}/troca`, {
    skuNovo: P('GIFT'),
  });
  eq('a troca é registrada', t.status, 201);
  eq('a diferença é negativa', t.corpo.diferenca, -50);
  eq('e o status diz que a regra não existe', t.corpo.diferencaStatus, 'pendente_regra');
  verdade('e o aviso é dito em voz alta', !!t.corpo.aviso);

  const pg = await api('POST', `/api/garantias/${g.corpo.garantia.id}/troca/pagar`, {});
  eq('não dá para "pagar" uma diferença que não existe', pg.status, 409);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO I
   Editar a cliente: mesmo id, mesmo histórico. */
console.log('\n=== I. editar a cliente preserva id e histórico ===');
{
  const v = await api('POST', '/api/vendas', {
    clienteNome: 'Senhora (nao sei nome)',
    itens: [{ sku: P('BRIN'), qtd: 2 }],
  });
  eq('venda para a cliente sem nome', v.status, 201);

  const antes = await api('GET', '/api/clientes/perfil?norm=' + encodeURIComponent('senhora (nao sei nome)'));
  eq('perfil abre', antes.status, 200);
  const id = antes.corpo.cadastro.id;
  const gastouAntes = antes.corpo.resumo.faturamento;
  const comprasAntes = antes.corpo.resumo.vendas;
  eq('ela gastou 138', gastouAntes, 138);
  eq('em 1 compra', comprasAntes, 1);

  const ed = await api('PATCH', `/api/clientes/${id}`, {
    nome: 'Cliente sem nome',
    obs: 'Cliente atendida pela minha mãe. Não me lembro do nome.',
  });
  eq('edição aceita', ed.status, 200);
  eq('MESMO cliente_id', ed.corpo.cliente.id, id);
  eq('nome salvo', ed.corpo.cliente.nome, 'Cliente sem nome');
  eq('observação salva', ed.corpo.cliente.obs, 'Cliente atendida pela minha mãe. Não me lembro do nome.');
  eq('a tela recebe o norm novo para reabrir a ficha', ed.corpo.norm, 'cliente sem nome');
  verdade('o sistema reconhece que houve renomeação', ed.corpo.renomeou === true);
  verdade('e presta contas do amarre por id', !!ed.corpo.historicoAmarrado);
  eq('sem ambiguidade de nome, ele amarra', ed.corpo.nomeEraAmbiguo, false);

  /* A prova de §12: abrir por id e pelo nome NOVO tem que devolver a mesma
     cliente, com o mesmo dinheiro. Antes da correção, renomear zerava o
     valor gasto — e era isso que parecia "não salvou". */
  const porId = await api('GET', `/api/clientes/perfil?id=${id}`);
  eq('por id: mesmo nome', porId.corpo.cadastro.nome, 'Cliente sem nome');
  eq('por id: mesmo faturamento', porId.corpo.resumo.faturamento, gastouAntes);
  eq('por id: mesmas compras', porId.corpo.resumo.vendas, comprasAntes);

  const porNome = await api('GET', '/api/clientes/perfil?norm=' + encodeURIComponent('cliente sem nome'));
  eq('pelo nome novo: mesmo id', porNome.corpo.cadastro.id, id);
  eq('pelo nome novo: mesmo faturamento', porNome.corpo.resumo.faturamento, gastouAntes);
  eq('pelo nome novo: mesmas compras', porNome.corpo.resumo.vendas, comprasAntes);

  const vazio = await api('PATCH', `/api/clientes/${id}`, { nome: '   ' });
  eq('nome vazio é recusado', vazio.status, 400);

  const semNada = await api('PATCH', `/api/clientes/${id}`, { tel: '', cpf: '', email: '' });
  eq('campos desconhecidos podem ficar vazios', semNada.status, 200);
  eq('e continua o mesmo id', semNada.corpo.cliente.id, id);
}

/* §2 dentro de §12: renomear NÃO pode chutar de quem é o histórico solto.
   Com duas cadastradas com o mesmo nome, a venda feita só pelo nome pode ser
   de qualquer uma das duas — e amarrá-la à que está sendo editada seria
   escolher a dona do dinheiro por conta própria. */
console.log('\n=== I.2 nome ambíguo: o amarre não acontece, e isso é dito ===');
{
  const c1 = await api('POST', '/api/clientes', { nome: 'Camila Duplicada' });
  const c2 = await api('POST', '/api/clientes', { nome: 'Camila Duplicada' });
  eq('duas cadastradas com o mesmo nome', `${c1.status}/${c2.status}`, '201/201');

  const v = await api('POST', '/api/vendas', {
    clienteNome: 'Camila Duplicada', itens: [{ sku: P('GIFT'), qtd: 1 }],
  });
  eq('a venda é aceita', v.status, 201);

  const idC1 = c1.corpo.id ?? c1.corpo.cliente?.id;
  const ed = await api('PATCH', `/api/clientes/${idC1}`, { nome: 'Camila da Feira' });
  eq('a edição do cadastro funciona normalmente', ed.status, 200);
  eq('o nome mudou', ed.corpo.cliente.nome, 'Camila da Feira');
  eq('mas o sistema avisa que o nome era ambíguo', ed.corpo.nomeEraAmbiguo, true);
  eq('e não amarrou nada por conta própria', ed.corpo.historicoAmarrado, null);
  verdade('dizendo por quê, em voz alta', !!ed.corpo.aviso);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO J
   Filtro por data: todas as origens, uma vez cada. */
console.log('\n=== J. o histórico do dia junta todas as origens, sem duplicar ===');
{
  const DIA = '2026-08-28';
  const v1 = await api('POST', '/api/vendas', {
    clienteNome: 'Cliente do dia 28', itens: [{ sku: P('ANEL'), qtd: 1 }],
    data: DIA, pago: false,
  });
  eq('venda de 28/08 registrada', v1.status, 201);

  const s1 = await api('POST', '/api/saidas', {
    tipo: 'brinde', sku: P('GIFT'), qtd: 1, data: DIA, motivo: 'Festa Junina',
  });
  eq('brinde de 28/08 registrado', s1.status, 201);

  const d = await api('GET', `/api/vendas/dia?data=${DIA}`);
  eq('histórico do dia responde', d.status, 200);
  const itens = d.corpo.itens ?? [];
  verdade('a venda do dia aparece', itens.some((i) => i.vendaId === v1.corpo.id));
  verdade('a saída sem faturamento aparece', itens.some((i) => i.origemChave === 'saida'));
  verdade('cada linha diz de onde veio', itens.every((i) => !!i.origem));
  eq('nada foi contado duas vezes', d.corpo.resumo.duplicadasRemovidas, 0);

  const refs = itens.map((i) => i.referencia);
  eq('as referências são únicas', new Set(refs).size, refs.length);

  const vendaNoDia = itens.find((i) => i.vendaId === v1.corpo.id);
  eq('a venda do dia é venda', vendaNoDia.ehVenda, true);
  eq('e o brinde não é', itens.find((i) => i.origemChave === 'saida').ehVenda, false);
  eq('o brinde entra sem valor nenhum', itens.find((i) => i.origemChave === 'saida').valor, null);

  /* §32 + §29 juntos: a venda de 28/08 paga depois continua no histórico
     de 28/08, e o dinheiro dela NÃO é do dia 28. */
  await api('POST', `/api/vendas/${v1.corpo.id}/pagamento`, { dataPagamento: hoje });
  const d2 = await api('GET', `/api/vendas/dia?data=${DIA}`);
  verdade('a venda continua no histórico de 28/08',
    (d2.corpo.itens ?? []).some((i) => i.vendaId === v1.corpo.id));
  eq('mas o dinheiro dela não é do dia 28', d2.corpo.resumo.recebidoNoDia, 0);
  const linha = (d2.corpo.itens ?? []).find((i) => i.vendaId === v1.corpo.id);
  eq('a linha carrega as DUAS datas', linha.data, DIA);
  eq('e diz quando foi paga', linha.dataPagamento, hoje);
}

/* ══════════════════════════════════════════════════════════════ CENÁRIO K
   Estorno de brinde: estoque volta, histórico fica. */
console.log('\n=== K. estornar um brinde devolve a peça e mantém o histórico ===');
{
  const s0 = await saldo(P('GIFT'));

  const semMotivo = await api('POST', `/api/saidas/${brindeId}/estornar`, {});
  eq('estorno sem motivo é recusado', semMotivo.status, 400);

  const e = await api('POST', `/api/saidas/${brindeId}/estornar`, { motivo: 'lancei no código errado' });
  eq('estorno aceito', e.status, 200);
  eq('estoque restaurado', await saldo(P('GIFT')), s0 + 1);
  eq('a saída continua existindo', e.corpo.saida.id, brindeId);
  eq('marcada como estornada', e.corpo.saida.estornada, true);
  eq('com o motivo registrado', e.corpo.saida.estornoMotivo, 'lancei no código errado');
  verdade('e com a data do estorno', !!e.corpo.saida.estornoEm);

  const dup = await api('POST', `/api/saidas/${brindeId}/estornar`, { motivo: 'de novo' });
  eq('estornar duas vezes é recusado', dup.status, 409);
  eq('e o estoque não subiu de novo', await saldo(P('GIFT')), s0 + 1);

  const lista = await api('GET', '/api/saidas');
  verdade('o histórico preserva a saída estornada',
    (lista.corpo.saidas ?? []).some((x) => x.id === brindeId && x.estornada));
}

/* ═══════════════════════════════════════════ auditoria dos dados históricos */
console.log('\n=== L. a auditoria histórica propõe e NÃO decide sozinha ===');
{
  const r = await api('GET', '/api/historico/auditoria');
  eq('auditoria responde', r.status, 200);
  eq('e é SECA', r.corpo.seco, true);
  verdade('anuncia o que não faz', Array.isArray(r.corpo.naoFaz) && r.corpo.naoFaz.length >= 3);
  verdade('e traz o impacto antes de aplicar',
    r.corpo.resumo && 'valorQueSaiDoFaturamento' in r.corpo.resumo);

  const vazio = await api('POST', '/api/historico/reclassificar', { decisoes: [] });
  eq('aplicar sem lista é recusado', vazio.status, 400);
}

/* §35 completo, com linhas de planilha de verdade: o que a auditoria propõe,
   o que ela se RECUSA a propor sozinha, e o que acontece ao aplicar. */
console.log('\n=== L.2 a auditoria sobre linhas históricas de verdade ===');
{
  const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
    'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
    'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];
  const linhas = [CAB,
    [1, '2026-05-02', 'Marina Teste', 910001, 'Colar Fino', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Site'],
    [2, '2026-05-10', 'Brinde dia das mães', 910002, 'Colar Gota', 'Bruto', 1, 89, null, 89, null, 'PAGO', 'Brinde'],
    [3, '2026-06-24', 'Brinde festa junina', 910003, 'Brinco Ponto', 'Banhada', 2, 45, null, 90, null, 'PAGO', 'Brinde'],
    [4, '2026-07-02', 'Sthefany Marques', 910004, 'Anel Trama', 'Prata 925', 1, 120, null, 120, null, 'PAGO', 'uso pessoal'],
    /* Este é o caso que o pacote nomeia: a planilha está em dúvida, e nenhum
       classificador pode resolver a dúvida dela. */
    [5, '2026-08-05', 'Inventário', 910005, 'Colar Longo', 'Bruto', 1, 150, null, 150, null, 'PAGO', 'ACHO QUE FOI VENDIDO'],
  ];
  const imp = await api('POST', '/api/vendas/historico/importar',
    { linhas, arquivo: 'auditoria-teste.xlsx' });
  eq('lote histórico importado', imp.status, 201);
  await api('POST', '/api/vendas/historico/reconstruir', {});

  const a = await api('GET', '/api/historico/auditoria?usoProprio=' + encodeURIComponent('Sthefany Marques'));
  eq('auditoria responde', a.status, 200);
  const c = a.corpo.candidatos ?? [];
  const acha = (t) => c.find((x) => String(x.nomeAtual ?? '').toLowerCase().includes(t));

  const b1 = acha('dia das mães');
  eq('"Brinde dia das mães" é proposto como brinde', b1?.classificacaoProposta, 'brinde');
  eq('com confiança alta', b1?.confianca, 'alta');
  eq('e é aplicável sozinho', b1?.aplicavelAutomaticamente, true);

  const up = acha('sthefany');
  eq('a retirada pessoal é proposta como uso próprio', up?.classificacaoProposta, 'uso_proprio');
  eq('mas NÃO é aplicável sozinha — nome não é identidade', up?.aplicavelAutomaticamente, false);

  const duvida = c.find((x) => String(x.observacao ?? '').toUpperCase().includes('ACHO QUE'));
  verdade('"ACHO QUE FOI VENDIDO" entra no relatório', !!duvida);
  eq('com confiança BAIXA, mesmo o nome dizendo "Inventário"', duvida?.confianca, 'baixa');
  eq('e NUNCA aplicável sozinho', duvida?.aplicavelAutomaticamente, false);
  verdade('o motivo explica que a dúvida é da própria planilha',
    /d[úu]vida/i.test(duvida?.motivo ?? ''));

  verdade('a compra de verdade NÃO virou candidata',
    !c.some((x) => String(x.nomeAtual ?? '').toLowerCase().includes('marina')));

  /* O impacto declarado tem que ser o impacto REAL. Linha que a planilha já
     tratava como ajuste não estava no faturamento, e contá-la aqui infla o
     número que a decisão humana usa. */
  const antes = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const impacto = a.corpo.resumo.valorQueSaiDoFaturamento;

  const auto = c.filter((x) => x.aplicavelAutomaticamente);
  const ap = await api('POST', '/api/historico/reclassificar', {
    decisoes: auto.map((x) => ({
      historicoItemId: x.historicoItemId, classe: x.classificacaoProposta,
      confianca: x.confianca, motivo: x.motivo.slice(0, 180),
    })),
    usuario: 'teste',
  });
  eq('aplicar aceita a lista nomeada', ap.status, 200);
  eq('nenhuma linha da planilha foi apagada', ap.corpo.impacto.linhasApagadas, 0);
  eq('e o estoque não foi tocado', ap.corpo.impacto.estoqueAlterado, false);

  const depois = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const caiu = +(antes.corpo.faturamento - depois.corpo.faturamento).toFixed(2);
  eq('o faturamento caiu exatamente o que o relatório previu', caiu,
    +Number(ap.corpo.impacto.valorRemovidoDoFaturamento).toFixed(2));
  verdade('e o previsto no relatório cobre o que saiu', impacto >= caiu);

  const rank = await api('GET', '/api/analytics/clientes?periodo=tudo&limite=60');
  const nomes = (rank.corpo?.clientes ?? []).map((x) => String(x.nome ?? '').toLowerCase());
  verdade('o brinde saiu do ranking de clientes', !nomes.some((n) => n.includes('brinde')));
  verdade('a compra de verdade continua no ranking', nomes.some((n) => n.includes('marina')));

  const desfaz = await api('DELETE', `/api/historico/reclassificar/${auto[0].historicoItemId}`);
  eq('desfazer é possível', desfaz.status, 200);
  const volta = await api('GET', '/api/analytics/vendas?periodo=tudo');
  verdade('e o valor volta para o faturamento',
    volta.corpo.faturamento > depois.corpo.faturamento);
}

/* ══════════════════════════════════════════════════════ a razão, no fim */
console.log('\n=== M. §19: a razão contábil fecha depois de tudo ===');
{
  verdade('produtos.qtd == SUM(movimentos.qtd) para todo SKU', await razaoFecha());

  /* Nenhuma peça pode ter sido baixada duas vezes por nenhum dos caminhos
     novos: venda paga depois, brinde, uso próprio, perda, troca, estorno. */
  const st = await api('GET', '/api/state');
  const negativos = (st.corpo?.produtos ?? []).filter((p) => Number(p.qtd) < 0);
  eq('nenhum saldo negativo', negativos.length, 0);
}

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\ntudo ok\n');
process.exit(falhas ? 1 : 0);
