/** Revisão pré-go-live — os três pontos críticos, provados contra o Worker.
 *
 *  Cada seção começa pelo DEFEITO que ela impede de voltar:
 *
 *   §2  a ficha da cliente era montada pelo NOME. Duas "Cliente sem nome"
 *       cadastradas separadamente dividem o mesmo nome normalizado — e a
 *       ficha de uma mostrava, somava e deixava editar o dinheiro da outra.
 *   §3  reclassificar uma linha da planilha não baixa estoque (a linha já
 *       baixou na importação). Faltava o simétrico: DESFAZER também não
 *       pode devolver peça, senão o estorno inventa uma unidade que nunca
 *       voltou para a gaveta.
 *   §4  o pagamento tem data própria e ela é editável: vender e receber em
 *       28/08, lançando em 04/09, tem que faturar em AGOSTO.
 *
 *      api/dev-local.sh && node src/revisao-pre-golive-test.mjs
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

const P = (s) => `RV-${s}`;
const pecasNoEstoque = async () => {
  const st = await api('GET', '/api/state');
  return (st.corpo?.produtos ?? []).reduce((s, p) => s + Number(p.qtd ?? 0), 0);
};
const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  const d = r.corpo?.divergentes ?? r.corpo?.divergencias ?? [];
  return Array.isArray(d) ? d.length === 0 : (d.total ?? 0) === 0;
};
const perfilPorId = (id) => api('GET', `/api/clientes/perfil?id=${id}`);

console.log('\n=== 0. catálogo ===');
{
  const r = await api('POST', '/api/produtos/importar', {
    produtos: [
      { sku: P('ANEL'), desc: 'Anel Revisão', preco: 89, cat: 'Anéis', qtd: 30 },
      { sku: P('BRIN'), desc: 'Brinco Revisão', preco: 69, cat: 'Brincos', qtd: 30 },
      { sku: P('COLR'), desc: 'Colar Revisão', preco: 199, cat: 'Colares', qtd: 30 },
      { sku: P('GIFT'), desc: 'Pingente Revisão', preco: 49, cat: 'Pingentes', qtd: 30 },
    ],
  });
  eq('catálogo importado', r.status, 200);
}

/* ══════════════════════════════════════════════════════════════ §2
   Duas pessoas diferentes com exatamente o mesmo nome.
   Abrir, editar e dar garantia numa NÃO pode alcançar a outra. */
console.log('\n=== 1. duas "Cliente sem nome" são duas pessoas ===');
let X = null; let Y = null; let vendaX = null;
{
  const a = await api('POST', '/api/clientes', { nome: 'Cliente sem nome' });
  const b = await api('POST', '/api/clientes', { nome: 'Cliente sem nome' });
  eq('os dois cadastros são aceitos', `${a.status}/${b.status}`, '201/201');
  X = a.corpo.id; Y = b.corpo.id;
  naoEq('e têm ids diferentes', X, Y);

  const vx = await api('POST', '/api/vendas', {
    clienteId: X, clienteNome: 'Cliente sem nome',
    itens: [{ sku: P('ANEL'), qtd: 1 }],
  });
  eq('venda da cliente X registrada', vx.status, 201);
  vendaX = vx.corpo.id;

  const vy = await api('POST', '/api/vendas', {
    clienteId: Y, clienteNome: 'Cliente sem nome',
    itens: [{ sku: P('BRIN'), qtd: 2 }],
  });
  eq('venda da cliente Y registrada', vy.status, 201);

  /* A terceira venda vai pelo NOME, sem id. O servidor se recusa a escolher
     entre as duas homônimas (§2 na escrita), então ela fica sem dono — e é
     por isso que ela não pode aparecer em nenhuma das duas fichas. */
  const vz = await api('POST', '/api/vendas', {
    clienteNome: 'Cliente sem nome',
    itens: [{ sku: P('COLR'), qtd: 1 }],
  });
  eq('venda pelo nome, sem id, é aceita', vz.status, 201);

  const px = await perfilPorId(X);
  const py = await perfilPorId(Y);
  eq('perfil de X responde', px.status, 200);
  eq('perfil de X é o id de X', px.corpo.clienteId, X);
  eq('perfil de Y é o id de Y', py.corpo.clienteId, Y);
  eq('X gastou só o que X comprou', px.corpo.resumo.faturamento, 89);
  eq('Y gastou só o que Y comprou', py.corpo.resumo.faturamento, 138);
  eq('X tem 1 compra', px.corpo.resumo.vendas, 1);
  eq('Y tem 1 compra', py.corpo.resumo.vendas, 1);
  verdade('a venda sem dono não entra em nenhuma das duas',
    px.corpo.resumo.faturamento === 89 && py.corpo.resumo.faturamento === 138);

  eq('o sistema DIZ que o nome é ambíguo', px.corpo.nomeAmbiguo, true);
  eq('e quantos cadastros o dividem', px.corpo.homonimos, 2);
  verdade('com um aviso por extenso', /cadastros com este mesmo nome/i.test(px.corpo.aviso ?? ''));
}

console.log('\n=== 2. editar X não toca em Y ===');
{
  const antesY = await perfilPorId(Y);
  const r = await api('PATCH', `/api/clientes/${X}`, {
    nome: 'Amanda Ribeiro', tel: '11988887777', cidade: 'Santos',
  });
  eq('edição aceita', r.status, 200);
  eq('o id NÃO muda', r.corpo.cliente.id, X);
  eq('e o sistema avisa que não amarrou histórico órfão', r.corpo.nomeEraAmbiguo, true);

  const px = await perfilPorId(X);
  eq('X tem o nome novo', px.corpo.cadastro.nome, 'Amanda Ribeiro');
  eq('X guardou o telefone', px.corpo.cadastro.tel, '11988887777');
  eq('X preservou o que gastou', px.corpo.resumo.faturamento, 89);
  eq('X preservou as compras', px.corpo.resumo.vendas, 1);
  eq('X preservou o ticket médio', px.corpo.resumo.ticketMedio, 89);
  eq('o nome dela deixou de ser ambíguo', px.corpo.nomeAmbiguo, false);

  const py = await perfilPorId(Y);
  eq('Y continua com o nome antigo', py.corpo.cadastro.nome, 'Cliente sem nome');
  eq('Y não ganhou nem perdeu dinheiro', py.corpo.resumo.faturamento, antesY.corpo.resumo.faturamento);
  eq('Y não ganhou nem perdeu compra', py.corpo.resumo.vendas, antesY.corpo.resumo.vendas);
}

console.log('\n=== 3. garantia de X não aparece em Y ===');
{
  const g = await api('POST', '/api/garantias', {
    vendaId: vendaX, sku: P('ANEL'),
    motivo: 'pedra soltou', dataEntrada: '2026-09-01',
  });
  eq('garantia aberta no item de X', g.status, 201);
  eq('e amarrada ao id de X', g.corpo.garantia.clienteId, X);

  const px = await perfilPorId(X);
  const py = await perfilPorId(Y);
  eq('X vê 1 garantia', (px.corpo.garantias ?? []).length, 1);
  eq('Y vê 0 garantias', (py.corpo.garantias ?? []).length, 0);
  eq('a garantia não virou faturamento em ninguém',
    `${px.corpo.resumo.faturamento}/${py.corpo.resumo.faturamento}`, '89/138');
}

/* ══════════════════════════════════════════════════════════════ §3
   Cada alteração física de estoque acontece exatamente uma vez. */
console.log('\n=== 4. saída classificatória não baixa, e o estorno não devolve ===');
{
  const antes = await pecasNoEstoque();
  const r = await api('POST', '/api/saidas', {
    tipo: 'brinde', sku: P('GIFT'), qtd: 1, data: '2026-08-15',
    motivo: 'reclassificação de linha histórica',
    origemRegistro: 'migracao_historico',
  });
  eq('registro classificatório aceito', r.status, 201);
  eq('e ele declara que não mexeu no estoque', r.corpo.estoqueAlterado, false);
  eq('não é dono da baixa', r.corpo.saida.estoqueRefletido, false);
  eq('e não aponta para movimento nenhum', r.corpo.saida.movimentoId, 'null');
  eq('estoque intocado', await pecasNoEstoque(), antes);

  const e = await api('POST', `/api/saidas/${r.corpo.saida.id}/estornar`,
    { motivo: 'a decisão foi revista' });
  eq('estorno aceito', e.status, 200);
  eq('estorno NÃO devolveu peça', e.corpo.estoqueAlterado, false);
  eq('estoque continua o mesmo', await pecasNoEstoque(), antes);
  eq('a linha continua no histórico, marcada', e.corpo.saida.estornada, true);
  verdade('e o sistema explica por que não devolveu',
    /nunca baixou estoque/i.test(e.corpo.porQueNaoAlterouEstoque ?? ''));
  verdade('razão contábil fecha', await razaoFecha());
}

console.log('\n=== 5. saída manual continua sendo dona da baixa ===');
{
  const antes = await pecasNoEstoque();
  const r = await api('POST', '/api/saidas', {
    tipo: 'brinde', sku: P('GIFT'), qtd: 1, data: '2026-08-16', motivo: 'Dia das Mães',
  });
  eq('saída manual aceita', r.status, 201);
  eq('ela É a baixa', r.corpo.saida.estoqueRefletido, true);
  eq('e diz que mexeu no estoque', r.corpo.estoqueAlterado, true);
  eq('uma peça a menos', await pecasNoEstoque(), antes - 1);

  const e = await api('POST', `/api/saidas/${r.corpo.saida.id}/estornar`,
    { motivo: 'lançada por engano' });
  eq('estorno aceito', e.status, 200);
  eq('e este devolve a peça', e.corpo.estoqueAlterado, true);
  eq('estoque restaurado', await pecasNoEstoque(), antes);
  verdade('razão contábil fecha', await razaoFecha());
}

console.log('\n=== 6. reclassificar linha histórica e DESFAZER não mexe no estoque ===');
{
  const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
    'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
    'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];
  const linhas = [CAB,
    [1, '2026-05-02', 'Marina Revisão', 920001, 'Colar Fino', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Site'],
    [2, '2026-05-10', 'Brinde dia das mães', 920002, 'Colar Gota', 'Bruto', 1, 89, null, 89, null, 'PAGO', 'Brinde'],
  ];
  const imp = await api('POST', '/api/vendas/historico/importar',
    { linhas, arquivo: 'revisao-pre-golive.xlsx' });
  eq('lote histórico importado', imp.status, 201);
  await api('POST', '/api/vendas/historico/reconstruir', {});

  const estoqueAposImportar = await pecasNoEstoque();

  const a = await api('GET', '/api/historico/auditoria');
  eq('auditoria responde', a.status, 200);
  const brinde = (a.corpo.candidatos ?? []).find((c) => /dia das mães/i.test(c.nomeAtual ?? ''));
  verdade('o brinde é proposto', !!brinde);
  eq('e o relatório declara que não altera estoque', a.corpo.impacto?.estoqueAlterado ?? false, false);

  const fatAntes = (await api('GET', '/api/analytics/vendas?periodo=tudo')).corpo.faturamento;

  const ap = await api('POST', '/api/historico/reclassificar', {
    decisoes: [{ historicoItemId: brinde.historicoItemId, classe: 'brinde', decisao: 'aplicar' }],
  });
  eq('reclassificação aplicada', ap.status, 200);
  eq('aplicar declara estoque intocado', ap.corpo.impacto.estoqueAlterado, false);
  eq('estoque intocado de fato', await pecasNoEstoque(), estoqueAposImportar);

  const fatDepois = (await api('GET', '/api/analytics/vendas?periodo=tudo')).corpo.faturamento;
  eq('o faturamento caiu exatamente o valor da linha',
    +(fatAntes - fatDepois).toFixed(2), 89);

  /* O simétrico, que é o ponto desta seção: DESFAZER também não devolve. */
  const un = await api('DELETE', `/api/historico/reclassificar/${brinde.historicoItemId}`);
  eq('decisão desfeita', un.status, 200);
  eq('desfazer declara estoque intocado', un.corpo.estoqueAlterado, false);
  eq('e o estoque não ganhou peça nenhuma', await pecasNoEstoque(), estoqueAposImportar);
  verdade('e explica por quê',
    /nunca saiu por causa dela/i.test(un.corpo.porQueNaoAlterouEstoque ?? ''));

  const fatVolta = (await api('GET', '/api/analytics/vendas?periodo=tudo')).corpo.faturamento;
  eq('e o faturamento voltou ao que era', fatVolta, fatAntes);
  verdade('razão contábil fecha', await razaoFecha());
}

/* ══════════════════════════════════════════════════════════════ §4
   A data do pagamento é editável, e é ela que decide o mês do dinheiro. */
console.log('\n=== 7. venda retroativa fatura no mês do pagamento ===');
{
  const mes = async (chave) => {
    const ev = await api('GET', '/api/analytics/evolucao?periodo=tudo&granularidade=mes');
    const p = (ev.corpo.pontos ?? ev.corpo.series ?? ev.corpo ?? []);
    const lista = Array.isArray(p) ? p : (p.pontos ?? []);
    const achado = lista.find((x) => String(x.chave ?? x.mes ?? '') === chave);
    return Number(achado?.faturamento ?? 0);
  };
  const agoAntes = await mes('2026-08');

  const r = await api('POST', '/api/vendas', {
    clienteNome: 'Retroativa Revisão',
    itens: [{ sku: P('COLR'), qtd: 1 }],
    data: '2026-08-28', pago: true, dataPagamento: '2026-08-28',
  });
  eq('venda retroativa aceita', r.status, 201);
  eq('a data da venda é a informada', r.corpo.data, '2026-08-28');
  eq('e o dinheiro é de agosto, não do dia do lançamento', r.corpo.faturamentoEm, '2026-08-28');
  eq('agosto subiu o valor da venda', +((await mes('2026-08')) - agoAntes).toFixed(2), 199);

  /* E o caminho de quem só marca o pagamento depois: a data continua sendo
     escolhida, não é o momento do clique. */
  const np = await api('POST', '/api/vendas', {
    clienteNome: 'Retroativa Revisão 2',
    itens: [{ sku: P('COLR'), qtd: 1 }],
    data: '2026-08-20', pago: false,
  });
  eq('venda retroativa NÃO paga aceita', np.status, 201);
  eq('e nasce como A Receber', np.corpo.aReceber, 199);

  const agoAntesDoPagamento = await mes('2026-08');
  const pg = await api('POST', `/api/vendas/${np.corpo.id}/pagamento`, { dataPagamento: '2026-08-30' });
  eq('pagamento com data escolhida aceito', pg.status, 200);
  eq('a data da venda continua sendo a da venda', pg.corpo.data, '2026-08-20');
  eq('o dinheiro entra em 30/08, não hoje', pg.corpo.faturamentoEm, '2026-08-30');
  eq('e a procedência diz que alguém informou', pg.corpo.pagamentoOrigem, 'informado');
  eq('agosto subiu de novo', +((await mes('2026-08')) - agoAntesDoPagamento).toFixed(2), 199);

  const futuro = await api('POST', '/api/vendas', {
    clienteNome: 'Retroativa Revisão 3',
    itens: [{ sku: P('COLR'), qtd: 1 }],
    data: '2026-08-20', pago: true, dataPagamento: '2027-01-01',
  });
  eq('data de pagamento no futuro é recusada', futuro.status, 400);
}

console.log('\n=== 8. o relatório de pagamentos existe e é seco ===');
{
  const r = await api('GET', '/api/vendas/pagamento/auditoria');
  eq('auditoria de pagamentos responde', r.status, 200);
  verdade('classifica por evidência', Array.isArray(r.corpo.porClasse) && r.corpo.porClasse.length > 0);
  verdade('e diz o que não faz', (r.corpo.naoFaz ?? []).some((x) => /não escreve/i.test(x)));
  const site = r.corpo.porClasse.find((c) => c.classe === 'indeterminado_site');
  verdade('pedido do site, quando existe, é marcado para conferência humana',
    !site || site.conferenciaHumana === true);
}

console.log('\n=== 9. a razão contábil fecha no fim de tudo ===');
verdade('produtos.qtd == SUM(movimentos.qtd)', await razaoFecha());

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\ntudo ok\n');
process.exit(falhas ? 1 : 0);
