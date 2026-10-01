/** "Vendas feitas": uma linha = uma VENDA, e a importação não duplica.
 *
 *  O defeito de 01/10/2026: a compra de Elizama Meira em 19/09/2026 — cinco
 *  peças, R$ 504,00 no total — aparecia na V2 como CINCO vendas de R$ 504,00.
 *  O banco estava certo (uma venda em `vendas_historicas`, cinco itens
 *  apontando para ela). A multiplicação acontecia na leitura: a tela agrupava
 *  a lista de ITENS por `referencia`, que nas vendas da planilha é o Nº da
 *  LINHA. Este teste fixa o contrato novo, `GET /api/vendas/feitas`, e os
 *  casos que o pedido de correção enumerou:
 *
 *    A  1 venda, 1 item, R$ 100            → 1 venda de R$ 100
 *    B  1 venda, 5 itens, R$ 504            → 1 venda de R$ 504, 5 itens dentro
 *    C  mesma cliente, mesmo dia, 2 compras → no SISTEMA, 2 vendas; na
 *       PLANILHA, 1 venda (a planilha não tem nº de pedido — a regra
 *       documentada é cliente + data, e este teste a fixa em vez de fingir
 *       que dá para separar)
 *    D  o mesmo arquivo duas vezes          → nada duplica; planilha
 *       ATUALIZADA pela porta errada também é recusada
 *    E  pagamento parcial                   → total, recebido e a receber certos
 *    F  linha sem data / sem valor          → venda própria, valor NULL (não 0),
 *       mesma resposta a cada importação
 *
 *  Roda contra o Worker local (`scripts/v2-local/worker-local.mjs`), com o
 *  banco vazio:
 *    API_URL=http://127.0.0.1:8799 API_KEY=chave-local-de-teste node src/vendas-feitas-test.mjs
 */
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x !== '' ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok(t, JSON.stringify(a)) : bad(t, `esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

/* A planilha. As linhas 10 a 14 são a compra real de Elizama Meira, com os
   mesmos códigos e valores que estão em produção. */
const PLANILHA = [
  CAB,
  // A — uma venda, uma peça
  [1, '2026-09-01', 'Ana Única', '700001', 'Brinco A', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Site'],
  // B — Elizama Meira, 19/09/2026: 5 peças, R$ 504,00, não paga
  [10, '2026-09-19', 'ELIZAMA MEIRA', '316411', 'Colar', 'Banhada', 1, 105, null, 105, null, 'NÃO PAGO', 'Maleta'],
  [11, '2026-09-19', 'Elizama Meira', '101665', 'Brinco', 'Banhada', 1, 62, null, 62, null, 'NÃO PAGO', 'Maleta'],
  [12, '2026-09-19', 'Elizama Meira', '301665', 'Pulseira', 'Banhada', 1, 89, null, 89, null, 'NÃO PAGO', 'Maleta'],
  [13, '2026-09-19', 'Elizama Meira', '562583', 'Anel', 'Banhada', 1, 119, null, 119, null, 'NÃO PAGO', 'Maleta'],
  [14, '2026-09-19', 'Elizama Meira', '446425', 'Choker', 'Banhada', 1, 129, null, 129, null, 'NÃO PAGO', 'Maleta'],
  // C (planilha) — mesma cliente, mesmo dia, duas linhas; e um outro dia
  [20, '2026-09-05', 'Bia Duas', '700002', 'Anel B', 'Banhada', 1, 50, null, 50, 'Pix', 'PAGO', 'Site'],
  [21, '2026-09-05', 'Bia Duas', '700003', 'Anel C', 'Banhada', 1, 70, null, 70, 'Pix', 'PAGO', 'Instagram'],
  [22, '2026-09-06', 'Bia Duas', '700004', 'Anel D', 'Banhada', 1, 30, null, 30, 'Pix', 'PAGO', 'Site'],
  // E — parcial: uma peça paga e outra não, na mesma compra
  [30, '2026-09-10', 'Carla Parcial', '700005', 'Colar E', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Maleta'],
  [31, '2026-09-10', 'Carla Parcial', '700006', 'Colar F', 'Banhada', 1, 80, null, 80, null, 'NÃO PAGO', 'Maleta'],
  // F — sem data utilizável, e sem valor
  [40, 'Não lembro', 'Dora Sem Data', '700007', 'Brinco G', 'Banhada', 1, 40, null, 40, 'Pix', 'PAGO', 'Site'],
  [41, '2026-09-12', 'Eva Sem Valor', '700008', 'Brinco H', 'Banhada', 1, '-', null, '-', 'Pix', 'PAGO', 'Site'],
];

/** Todas as vendas, paginando de 2 em 2 — a página pequena prova que uma
 *  venda nunca chega cortada ao meio. */
async function todasAsVendas(q = '') {
  const vendas = [];
  for (let off = 0; ; off += 2) {
    const r = await api('GET', `/api/vendas/feitas?limite=2&offset=${off}${q}`);
    if (r.status !== 200) { bad('lista respondeu', r.status); return vendas; }
    vendas.push(...r.corpo.vendas);
    if (r.corpo.vendas.length < 2) break;
  }
  return vendas;
}
const daCliente = (vs, re) => vs.filter((v) => re.test(v.cliente ?? ''));
const reais = (c) => (c == null ? null : c / 100);

console.log('\n=== 0. base: produtos do sistema e a planilha ===');
eq('produtos criados', (await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'VF001', desc: 'Colar Sistema', cat: 'Colar', preco: 100, qtd: 10 },
    { sku: 'VF002', desc: 'Brinco Sistema', cat: 'Brinco', preco: 60, qtd: 10 },
  ],
})).status, 200);
const imp = await api('POST', '/api/vendas/historico/importar', { arquivo: 'Vendas.xlsx', linhas: PLANILHA });
eq('planilha importada', imp.status, 201);
const razaoAntes = (await api('GET', '/api/estoque/conferir')).corpo?.divergentes;
eq('razão fecha', razaoAntes, []);

let vendas = await todasAsVendas();
const totalNaPrimeira = vendas.length;

console.log('\n=== A. uma venda, uma peça ===');
const [ana] = daCliente(vendas, /Ana Única/);
eq('uma venda', daCliente(vendas, /Ana Única/).length, 1);
eq('de R$ 100', reais(ana?.financeiro.valorVenda), 100);
eq('com uma peça', ana?.itens.length, 1);
eq('paga', ana?.financeiro.statusPagamento, 'paga');

console.log('\n=== B. Elizama Meira: 5 peças, UMA venda de R$ 504 ===');
const eli = daCliente(vendas, /elizama/i);
eq('UMA venda, não cinco', eli.length, 1);
eq('total R$ 504,00', reais(eli[0]?.financeiro.valorVenda), 504);
eq('5 itens dentro dela', eli[0]?.itens.length, 5);
eq('5 peças', eli[0]?.pecas, 5);
eq('os itens somam o total', eli[0]?.itens.reduce((s, i) => s + i.valor, 0), 504);
eq('cada item tem o próprio preço, não o total da compra',
  eli[0]?.itens.map((i) => i.precoUnit), [105, 62, 89, 119, 129]);
eq('a receber R$ 504,00', reais(eli[0]?.financeiro.valorAReceber), 504);
eq('cada item lembra a linha da planilha', eli[0]?.itens.map((i) => i.linhaPlanilha), ['10', '11', '12', '13', '14']);

/* A lista de AUDITORIA continua item a item — e agora diz de que venda cada
   item é, com a mesma chave. */
const auditoria = (await api('GET', '/api/vendas/lista?limite=1000&busca=elizama')).corpo.itens;
eq('a lista de itens continua com 5 linhas', auditoria.length, 5);
eq('todas apontam para a MESMA venda', [...new Set(auditoria.map((i) => i.venda_chave))], [eli[0]?.chave]);

/* A página é de VENDAS: pedir uma venda traz a venda inteira. */
const busca = await api('GET', '/api/vendas/feitas?limite=1&busca=446425');
eq('buscar um código traz a venda inteira', busca.corpo.vendas[0]?.itens.length, 5);
eq('e uma venda só', busca.corpo.total, 1);

console.log('\n=== C. mesma cliente, mesmo dia ===');
const bia = daCliente(vendas, /Bia Duas/);
eq('planilha: mesmo dia é uma venda (regra cliente + data), outro dia é outra', bia.length, 2);
const bia05 = bia.find((v) => v.data === '2026-09-05');
eq('a do dia 05 tem as duas peças', bia05?.itens.length, 2);
eq('e o total das duas', reais(bia05?.financeiro.valorVenda), 120);
eq('canais diferentes viram Misto, não um deles por sorte', bia05?.canal, 'Misto');

const s1 = await api('POST', '/api/vendas', {
  clienteNome: 'Fernanda Sistema', data: '2026-09-20', pago: true, dataPagamento: '2026-09-20',
  itens: [{ sku: 'VF001', qtd: 1, preco: 100 }],
});
const s2 = await api('POST', '/api/vendas', {
  clienteNome: 'Fernanda Sistema', data: '2026-09-20', pago: false,
  itens: [{ sku: 'VF002', qtd: 2, preco: 60 }],
});
eq('duas vendas registradas no sistema', [s1.status, s2.status], [201, 201]);
vendas = await todasAsVendas();
const fer = daCliente(vendas, /Fernanda Sistema/);
eq('sistema: duas compras no mesmo dia são DUAS vendas', fer.length, 2);
eq('com os próprios totais', fer.map((v) => reais(v.financeiro.valorVenda)).sort(), [100, 120]);
const fer2 = fer.find((v) => v.id === s2.corpo.id);
eq('a de 2 brincos: 1 linha, 2 peças', [fer2?.itens.length, fer2?.pecas], [1, 2]);
eq('preço unitário 60, subtotal 120', [fer2?.itens[0]?.precoUnit, fer2?.itens[0]?.valor], [60, 120]);

console.log('\n=== D. importar de novo não duplica ===');
const imp2 = await api('POST', '/api/vendas/historico/importar', { arquivo: 'Vendas (cópia).xlsx', linhas: PLANILHA });
eq('o mesmo conteúdo é recusado', imp2.status, 409);
const atualizada = [...PLANILHA,
  [50, '2026-09-25', 'Gabi Nova', '700009', 'Anel I', 'Banhada', 1, 45, null, 45, 'Pix', 'PAGO', 'Site']];
const imp3 = await api('POST', '/api/vendas/historico/importar', { arquivo: 'Vendas atualizada.xlsx', linhas: atualizada });
eq('planilha ATUALIZADA pela porta de importar é recusada', imp3.status, 409);
eq('e diz o caminho certo', /Trocar planilha/.test(imp3.corpo?.erro ?? ''), true);
vendas = await todasAsVendas();
eq('nenhuma venda nova depois das duas recusas', vendas.length, totalNaPrimeira + 2);
eq('Elizama continua com UMA venda', daCliente(vendas, /elizama/i).length, 1);

const troca = await api('POST', '/api/vendas/historico/substituir', { arquivo: 'Vendas atualizada.xlsx', linhas: atualizada });
eq('pela troca, a atualizada entra', troca.status, 200);
vendas = await todasAsVendas();
eq('e só a venda nova aparece a mais', vendas.length, totalNaPrimeira + 3);
eq('Elizama continua com UMA venda de R$ 504', daCliente(vendas, /elizama/i)
  .map((v) => reais(v.financeiro.valorVenda)), [504]);
eq('um lote só no ar', (await api('GET', '/api/vendas/historico/lotes')).corpo.lotes
  .filter((l) => l.status === 'importado').length, 1);

console.log('\n=== E. pagamento parcial ===');
const carla = daCliente(vendas, /Carla Parcial/)[0];
eq('total R$ 180', reais(carla?.financeiro.valorVenda), 180);
eq('recebido R$ 100', reais(carla?.financeiro.valorRecebido), 100);
eq('a receber R$ 80', reais(carla?.financeiro.valorAReceber), 80);
eq('situação parcial', carla?.financeiro.statusPagamento, 'parcial');

/* Recebida pelo Financeiro depois da planilha: a lista tem de dizer paga.
   Até 01/10/2026 ela lia só a planilha e seguia dizendo "não paga". */
const chaveEli = 'elizama meira|2026-09-19';
eq('cobrança da Elizama aberta', (await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [{
    vendaChave: chaveEli, papel: 'cliente', cobrancaStatus: 'aberta',
    valorEfetivoCentavos: 50400, valorRecebidoFonteCentavos: 0, evidencia: { fonte: 'teste' },
  }],
})).status, 200);
const conta = (await api('GET', '/api/contas-receber')).corpo.contas.find((c) => /elizama/i.test(c.cliente ?? ''));
eq('aparece em A receber por R$ 504', conta?.valorReceber, 504);
eq('recebida pelo Financeiro', (await api('POST', '/api/contas-receber/receber', {
  chave: conta?.chave, confirmar: true, versaoEsperada: conta?.versao, pagaEm: '2026-09-30',
})).status, 200);
const eliPaga = daCliente(await todasAsVendas(), /elizama/i)[0];
eq('Vendas feitas diz paga', eliPaga?.financeiro.statusPagamento, 'paga');
eq('com R$ 504 recebidos e nada a receber',
  [reais(eliPaga?.financeiro.valorRecebido), reais(eliPaga?.financeiro.valorAReceber)], [504, 0]);

const fer2Antes = daCliente(vendas, /Fernanda Sistema/).find((v) => v.id === s2.corpo.id);
eq('venda do sistema não paga: a receber R$ 120', reais(fer2Antes?.financeiro.valorAReceber), 120);
eq('recebida', (await api('POST', `/api/vendas/${s2.corpo.id}/pagamento`, { pago: true, dataPagamento: '2026-09-28' })).status, 200);
const fer2Depois = daCliente(await todasAsVendas(), /Fernanda Sistema/).find((v) => v.id === s2.corpo.id);
eq('e passa a paga', fer2Depois?.financeiro.statusPagamento, 'paga');

console.log('\n=== F. linha sem data, linha sem valor ===');
const dora = daCliente(vendas, /Dora Sem Data/);
eq('sem data: venda própria', dora.length, 1);
eq('com data NULL, não inventada', dora[0]?.data, null);
const eva = daCliente(vendas, /Eva Sem Valor/)[0];
eq('sem valor: NULL, não zero', eva?.financeiro.valorVenda, null);
eq('e o servidor diz que não sabe', eva?.financeiro.indeterminado.includes('valorVenda'), true);
const ordem1 = vendas.map((v) => v.chave).join(',');
const ordem2 = (await todasAsVendas()).map((v) => v.chave).join(',');
eq('a mesma leitura duas vezes dá a mesma lista, na mesma ordem', ordem1 === ordem2, true);

console.log('\n=== estoque ===');
eq('a razão continua fechando', (await api('GET', '/api/estoque/conferir')).corpo?.divergentes, []);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
