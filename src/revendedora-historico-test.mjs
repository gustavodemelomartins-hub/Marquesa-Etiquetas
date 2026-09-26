/** Histórico da revendedora — a relação inteira, não só a maleta de hoje.
 *
 * O defeito que este teste impede: a ficha mostrava a maleta atual e uma
 * lista de maletas fechadas que só enxergava `acerto_json`. O acerto feito
 * fora do sistema (e documentado no histórico de vendas) não aparecia, e
 * depois de confirmar um acerto restava só o saldo novo, sem memória do que
 * foi enviado, devolvido e vendido.
 *
 * O que fica provado:
 *   1. envio de peças vira evento, com as peças e a maleta;
 *   2. acerto recusado (distribuição errada) não cria evento nem venda;
 *   3. acerto confirmado cria o registro consultável: enviadas, devolvidas,
 *      vendidas, valores, SKUs vendidos e devolvidos, venda gerada;
 *   4. repetir o acerto não associa a venda duas vezes;
 *   5. acerto feito fora (documental) aparece junto, com a venda do
 *      histórico, e não soma duas vezes;
 *   6. a linha do tempo vem da mais recente para a mais antiga;
 *   7. os números batem com Revendedoras › Visão geral (mesma fonte).
 */
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x !== '' ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));
const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

console.log('\n=== 0. base ===');
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '610001', desc: 'Colar Um', cat: 'Colar', preco: 100, qtd: 10 },
    { sku: '610002', desc: 'Brinco Dois', cat: 'Brinco', preco: 50, qtd: 10 },
  ],
});
const rev = (await api('POST', '/api/revendedoras', { nome: 'Hist Teste' })).corpo;
const hist = async () => (await api('GET', `/api/revendedoras/${rev.id}/historico`)).corpo;
eq('histórico de quem não existe é 404', (await api('GET', '/api/revendedoras/999999/historico')).status, 404);
eq('começa com o cadastro', (await hist()).eventos.map((e) => e.tipo).join(','), 'cadastro');

console.log('\n=== 1. envio ===');
const m1 = (await api('POST', '/api/maletas', { revId: rev.id, abertaEm: '2026-09-01', acertoEm: '2026-09-20' })).corpo;
await api('POST', `/api/maletas/${m1.id}/itens`, { itens: { 610001: 3, 610002: 2 } });
const h1 = await hist();
const envio = h1.eventos.find((e) => e.tipo === 'consignacao');
eq('o envio é um evento', !!envio, true);
eq('com as cinco peças', envio?.pecas, 5);
eq('e a maleta', envio?.maletaId, m1.id);
eq('rastreável até os movimentos', (envio?.origem?.ids ?? []).length, 2);
eq('peças com ela', h1.resumo.pecasComEla, 5);

console.log('\n=== 2. acerto recusado não deixa rastro ===');
const vendasAntes = (await api('GET', '/api/state')).corpo.vendas?.length ?? 0;
const recusado = await api('POST', `/api/maletas/${m1.id}/acerto`, {
  devolvidas: { 610001: 3 }, faltas: [],
});
eq('distribuição incompleta é recusada', recusado.status, 400);
const h2 = await hist();
eq('nenhum acerto no histórico', h2.acertos.length, 0);
eq('nenhuma venda criada', (await api('GET', '/api/state')).corpo.vendas?.length ?? 0, vendasAntes);
eq('os eventos não mudaram', h2.eventos.length, h1.eventos.length);

console.log('\n=== 3. acerto confirmado fica consultável ===');
const acerto = await api('POST', `/api/maletas/${m1.id}/acerto`, {
  devolvidas: { 610001: 2, 610002: 2 },
  faltas: [{ sku: '610001', linhas: [{ qtd: 1, destino: 'vendida' }] }],
});
eq('acerto confirmado', acerto.status, 200);
const h3 = await hist();
eq('um acerto', h3.acertos.length, 1);
const a = h3.acertos[0];
eq('do sistema', a.fonte, 'sistema');
eq('com a maleta', a.maletaId, m1.id);
eq('enviadas / devolvidas / vendidas', `${a.enviadas}/${a.devolvidas}/${a.pecasVendidas}`, '5/4/1');
eq('o SKU vendido', a.itensVendidos.map((i) => `${i.sku}x${i.qtd}`).join(','), '610001x1');
eq('os SKUs devolvidos', a.itensDevolvidos.map((i) => `${i.sku}x${i.qtd}`).sort().join(','), '610001x2,610002x2');
eq('a venda que ele gerou', a.vendaId, acerto.corpo.vendaId);
eq('o valor vendido', a.vendido, 100);
eq('quem conferiu é dito como desconhecido, não inventado', a.conferidoPor, null);
eq('o evento do acerto existe', h3.eventos.some((e) => e.tipo === 'acerto' && e.acertoId === a.id), true);

console.log('\n=== 4. repetir não associa a venda duas vezes ===');
eq('repetir é recusado', (await api('POST', `/api/maletas/${m1.id}/acerto`, {
  devolvidas: { 610001: 2, 610002: 2 },
  faltas: [{ sku: '610001', linhas: [{ qtd: 1, destino: 'vendida' }] }],
})).status, 409);
eq('continua um acerto', (await hist()).acertos.length, 1);

console.log('\n=== 5. acerto feito fora do sistema ===');
const m2 = (await api('POST', '/api/maletas', { revId: rev.id, abertaEm: '2026-09-21' })).corpo;
await api('POST', `/api/maletas/${m2.id}/itens`, { itens: { 610002: 2 } });
await api('POST', '/api/vendas/historico/importar', {
  arquivo: 'hist.xlsx',
  linhas: [CAB, [1, '2026-09-25', 'Hist Teste', '610002', 'Brinco Dois', 'Banhada', 1, 50, 'Revendedora', 37.5, 'Pix', 'PAGO', 'Maleta']],
});
eq('decisão documental', (await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [{
    vendaChave: 'hist teste|2026-09-25', papel: 'acerto', revendedoraId: rev.id, pecas: 1,
    brutoCentavos: 5000, comissaoCentavos: 1250, liquidoCentavos: 3750, evidencia: { maleta: m2.id },
  }],
})).status, 200);
eq('maleta encerrada pelo documento', (await api('POST', `/api/maletas/${m2.id}/acerto-documental`, {
  vendaChave: 'hist teste|2026-09-25', vendidas: { 610002: 1 }, devolvidas: { 610002: 1 },
})).status, 200);
const h5 = await hist();
eq('dois acertos', h5.acertos.length, 2);
const doc = h5.acertos.find((x) => x.fonte === 'documento');
eq('o documental aponta a maleta', doc?.maletaId, m2.id);
eq('e os itens da venda histórica', doc?.itensVendidos.map((i) => `${i.sku}x${i.qtd}`).join(','), '610002x1');
eq('com o líquido do documento', doc?.liquido, 37.5);
eq('o resumo soma os dois, uma vez cada', h5.resumo.vendido, 150);

console.log('\n=== 6. ordem ===');
const datas = h5.eventos.map((e) => String(e.quando ?? ''));
eq('da mais recente para a mais antiga', datas.every((d, i) => i === 0 || datas[i - 1] >= d), true);
eq('o cadastro está na linha do tempo', h5.eventos.some((e) => e.tipo === 'cadastro'), true);

console.log('\n=== 7. a mesma fonte da Visão geral ===');
const visao = (await api('GET', '/api/analytics/revendedoras?periodo=tudo')).corpo.acertos
  .filter((x) => Number(x.revendedoraId) === Number(rev.id));
eq('mesmos acertos', visao.length, h5.acertos.length);
eq('mesmo líquido', +visao.reduce((s, x) => s + x.liquido, 0).toFixed(2), h5.resumo.liquido);
eq('razão fecha', JSON.stringify((await api('GET', '/api/estoque/conferir')).corpo?.divergentes), '[]');

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — a ficha da revendedora guarda o que aconteceu, não só o saldo de hoje.');
