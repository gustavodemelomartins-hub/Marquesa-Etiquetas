/** Papéis por operação, duplicidades, acertos exatos e contas a receber.
 *
 * Roda contra o Worker local com banco descartável. A prova central é que
 * importar/classificar/quitar histórico nunca cria movimento de estoque.
 */
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const CABECALHO = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

const LINHAS = [
  CABECALHO,
  [1, '2026-08-19', 'Cliente Duplicada', 'DUP001', 'Colar Duplicado', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Feira'],
  [2, '2026-08-21', 'Cliente Devedora', 'DEBT001', 'Brinco VIP', 'Banhada', 2, 100, 'Grupo VIP · R$ 50 de desconto', 150, null, 'NÃO PAGO', 'Grupo VIP'],
  [3, '2026-08-22', 'Evelyn Veiga', 'ACER001', 'Mix da maleta', 'Banhada', 3, 100, 'Revendedora', 300, 'Pix', 'PAGO', 'Revendedora (Evelyn)'],
];

console.log('\n=== 1. base e venda operacional que também está na planilha ===');
const produtos = await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'DUP001', desc: 'Colar Duplicado', cat: 'Colar', preco: 100, qtd: 5 },
] });
eq('produto criado', produtos.status, 200);
const venda = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Duplicada', data: '2026-08-20', itens: [{ sku: 'DUP001', qtd: 1 }],
});
eq('venda operacional criada', venda.status, 201);
const rev = await api('POST', '/api/revendedoras', { nome: 'Evelyn Veiga' });
eq('revendedora criada', rev.status, 201);

const movAntes = await api('GET', '/api/estoque/DUP001/movimentos');
const nMovAntes = movAntes.corpo.movimentos.length;
const qtdAntes = movAntes.corpo.saldos.qtd;

console.log('\n=== 2. histórico entra sem estoque e recebe papéis por operação ===');
const imp = await api('POST', '/api/vendas/historico/importar', {
  arquivo: 'amostra-operacoes.xlsx', linhas: LINHAS,
});
eq('histórico importado', imp.status, 201);
const operacoes = [
  {
    vendaChave: 'cliente duplicada|2026-08-19', papel: 'cliente',
    vendasDuplicadas: [{ vendaId: venda.corpo.id, confirmado: true,
      dataDiferenteConfirmada: true, evidencia: { teste: true } }],
  },
  {
    vendaChave: 'cliente devedora|2026-08-21', papel: 'cliente',
    cobrancaStatus: 'aberta', valorEfetivoCentavos: 15000,
    valorRecebidoFonteCentavos: 0, observacao: 'Grupo VIP',
  },
  {
    vendaChave: 'evelyn veiga|2026-08-22', papel: 'acerto', revendedoraId: rev.corpo.id,
    pecas: 3, brutoCentavos: 30000, comissaoCentavos: 9000, liquidoCentavos: 21000,
    evidencia: { documento: 'maleta-teste' },
  },
];
const semConfirmarData = structuredClone(operacoes);
delete semConfirmarData[0].vendasDuplicadas[0].dataDiferenteConfirmada;
const bloqueada = await api('POST', '/api/vendas/historico/operacoes', { operacoes: semConfirmarData });
eq('data diferente exige confirmação específica', bloqueada.status, 409);
const classif = await api('POST', '/api/vendas/historico/operacoes', { operacoes });
eq('operações classificadas', classif.status, 200);
eq('três decisões criadas', classif.corpo.criadas, 3);
eq('duplicidade vinculada', classif.corpo.vinculos, 1);

const repetida = await api('POST', '/api/vendas/historico/operacoes', { operacoes });
eq('repetir o mesmo lote é seguro', repetida.status, 200);
eq('não cria decisão de novo', repetida.corpo.criadas, 0);
eq('preserva as três', repetida.corpo.preservadas, 3);

console.log('\n=== 3. acerto sai de Vendas e aparece exato em Revendedoras ===');
const acertos = await api('GET', '/api/analytics/revendedoras?periodo=tudo');
eq('analytics de revendedoras responde', acertos.status, 200);
eq('vendido documental', acertos.corpo.totais.vendido, 300);
eq('comissão documental', acertos.corpo.totais.comissao, 90);
eq('líquido documental', acertos.corpo.totais.liquido, 210);
eq('três peças no acerto', acertos.corpo.totais.pecas, 3);

const vendasAntes = await api('GET', '/api/analytics/vendas?periodo=tudo');
eq('duplicata conta uma vez e acerto não vira cliente', vendasAntes.corpo.pecas, 3);
eq('antes de quitar, só a venda operacional faturou', vendasAntes.corpo.faturamento, 100);
const lancamentos = await api('GET', '/api/vendas/lista?limite=50&offset=0');
eq('acerto e cópia operacional saem também de Lançamentos', lancamentos.corpo.itens.length, 2);
eq('a compra duplicada aparece uma vez',
  lancamentos.corpo.itens.filter((i) => i.cliente === 'Cliente Duplicada').length, 1);
eq('Evelyn não aparece como compra pessoal',
  lancamentos.corpo.itens.some((i) => i.cliente === 'Evelyn Veiga'), false);

console.log('\n=== 4. NÃO PAGO mostra valor cobrado, desconto e origem ===');
const receber = await api('GET', '/api/contas-receber');
eq('uma compra em aberto', receber.corpo.resumo.quantidade, 1);
eq('total a receber', receber.corpo.resumo.total, 150);
eq('sem inventar prazo', receber.corpo.resumo.semPrazo, 1);
const conta = receber.corpo.contas[0];
eq('origem preservada', conta.canal, 'Grupo VIP');

const perfil = await api('GET', '/api/clientes/perfil?norm=cliente%20devedora');
eq('perfil responde', perfil.status, 200);
eq('compra mostra valor cobrado, não zero', perfil.corpo.vendas[0].valor, 150);
eq('selo financeiro aberto', perfil.corpo.vendas[0].cobrancaStatus, 'aberta');
eq('desconto mostrado em reais', perfil.corpo.vendas[0].itens[0].desconto_valor, 50);

console.log('\n=== 5. prazo e quitação são versionados e não mexem no estoque ===');
const prazo = await api('PATCH', `/api/contas-receber/${conta.id}/vencimento`, {
  versaoEsperada: conta.versao, vencimentoEm: '2026-09-30',
});
eq('prazo definido', prazo.status, 200);
eq('versão avançou', prazo.corpo.conta.versao, conta.versao + 1);

const paga = await api('POST', `/api/contas-receber/${prazo.corpo.conta.id}/marcar-paga`, {
  confirmar: true, versaoEsperada: prazo.corpo.conta.versao,
});
eq('pagamento confirmado', paga.status, 200);
eq('saldo zerado', paga.corpo.conta.valorReceber, 0);

const retry = await api('POST', `/api/contas-receber/${prazo.corpo.conta.id}/marcar-paga`, {
  confirmar: true, versaoEsperada: prazo.corpo.conta.versao,
});
eq('retry do clique é idempotente', retry.status, 200);
eq('avisa que já estava paga', retry.corpo.jaEstavaPaga, true);

const abertasDepois = await api('GET', '/api/contas-receber');
eq('nenhuma dívida continua aberta', abertasDepois.corpo.resumo.quantidade, 0);
const vendasDepois = await api('GET', '/api/analytics/vendas?periodo=tudo');
eq('quitação entra no faturamento', vendasDepois.corpo.faturamento, 250);

const movDepois = await api('GET', '/api/estoque/DUP001/movimentos');
eq('quitação não alterou quantidade', movDepois.corpo.saldos.qtd, qtdAntes);
eq('nem criou movimento', movDepois.corpo.movimentos.length, nMovAntes);
const razao = await api('GET', '/api/estoque/conferir');
eq('razão contábil continua fechando', JSON.stringify(razao.corpo.divergentes), '[]');

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — papéis, acertos, duplicidade, cobrança e estoque fecham.');
