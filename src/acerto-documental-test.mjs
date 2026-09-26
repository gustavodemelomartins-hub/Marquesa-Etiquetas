/** Acerto de maleta feito FORA do sistema e documentado no histórico.
 *
 * O defeito que este teste impede: a maleta foi acertada com a revendedora,
 * as vendas entraram na planilha e o acerto virou decisão documental — mas a
 * maleta continuava aberta no sistema, travando peça que já tinha voltado
 * para casa. Fechá-la pelo acerto normal criaria uma SEGUNDA venda para as
 * mesmas peças e faria o acerto aparecer duas vezes em Revendedoras.
 *
 * O que fica provado:
 *   1. `seco` devolve o plano e não escreve nada;
 *   2. peças vendidas que não batem com a venda histórica são recusadas;
 *   3. acerto de outra revendedora é recusado;
 *   4. distribuição que não soma o enviado é recusada;
 *   5. aplicado: maleta encerrada, consignado zerado, só as vendidas saem do
 *      total, nenhuma venda nova, e o acerto aparece UMA vez;
 *   6. repetir é recusado; a razão fecha do começo ao fim.
 *
 * Roda contra o Worker local com banco limpo.
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

const razao = async () => JSON.stringify((await api('GET', '/api/estoque/conferir')).corpo?.divergentes);
const estado = async () => (await api('GET', '/api/state')).corpo;
const qtd = (st, sku) => Number(st.produtos.find((p) => String(p.sku) === sku)?.qtd);

console.log('\n=== 0. cenário: maleta aberta, acerto feito fora, venda na planilha ===');
eq('produtos', (await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '111111', desc: 'Colar A', cat: 'Colar', preco: 100, qtd: 5 },
    { sku: '222222', desc: 'Brinco B', cat: 'Brinco', preco: 50, qtd: 4 },
    { sku: '333333', desc: 'Anel C', cat: 'Anel', preco: 80, qtd: 3 },
  ],
})).status, 200);
const rev = (await api('POST', '/api/revendedoras', { nome: 'Bruna Teste' })).corpo;
const outra = (await api('POST', '/api/revendedoras', { nome: 'Outra Teste' })).corpo;
const maleta = (await api('POST', '/api/maletas', { revId: rev.id, abertaEm: '2026-09-01' })).corpo;
eq('peças consignadas', (await api('POST', `/api/maletas/${maleta.id}/itens`, {
  itens: { 111111: 2, 222222: 2, 333333: 1 },
})).status, 200);
eq('planilha com o acerto', (await api('POST', '/api/vendas/historico/importar', {
  arquivo: 'acerto.xlsx',
  linhas: [
    CAB,
    [1, '2026-09-22', 'Bruna Teste', '111111', 'Colar A', 'Banhada', 1, 100, 'Revendedora', 70, 'Pix', 'PAGO', 'Maleta'],
    [2, '2026-09-22', 'Bruna Teste', '222222', 'Brinco B', 'Banhada', 1, 50, 'Revendedora', 35, 'Pix', 'PAGO', 'Maleta'],
    [3, '2026-09-10', 'Outra Teste', '333333', 'Anel C', 'Banhada', 1, 80, 'Revendedora', 56, 'Pix', 'PAGO', 'Maleta'],
  ],
})).corpo?.ok, true);
eq('decisão documental do acerto', (await api('POST', '/api/vendas/historico/operacoes', {
  operacoes: [
    {
      vendaChave: 'bruna teste|2026-09-22', papel: 'acerto', revendedoraId: rev.id, pecas: 2,
      brutoCentavos: 15000, comissaoCentavos: 4500, liquidoCentavos: 10500,
      evidencia: { fonte: 'teste' },
    },
    {
      vendaChave: 'outra teste|2026-09-10', papel: 'acerto', revendedoraId: outra.id, pecas: 1,
      brutoCentavos: 8000, comissaoCentavos: 2400, liquidoCentavos: 5600,
      evidencia: { fonte: 'teste' },
    },
  ],
})).status, 200);
const antes = await estado();
const vendasAntes = (antes.vendas ?? []).length;
const acertosAntes = (await api('GET', '/api/analytics/revendedoras?periodo=tudo')).corpo?.acertos?.length ?? 0;
eq('razão fecha antes', await razao(), '[]');

const url = `/api/maletas/${maleta.id}/acerto-documental`;
const certo = {
  vendaChave: 'bruna teste|2026-09-22',
  vendidas: { 111111: 1, 222222: 1 },
  devolvidas: { 111111: 1, 222222: 1, 333333: 1 },
};

console.log('\n=== 1. seco não escreve ===');
const seco = await api('POST', url, { ...certo, seco: true });
eq('o plano sai', seco.status, 200);
eq('com 2 vendidas e 3 devolvidas', `${seco.corpo?.plano?.vendidas}/${seco.corpo?.plano?.devolvidas}`, '2/3');
eq('sem venda nova', seco.corpo?.plano?.vendaNova, false);
eq('na data do acerto', seco.corpo?.plano?.data, '2026-09-22');
eq('e a maleta continua aberta',
  (await estado()).maletas.find((m) => Number(m.id) === Number(maleta.id))?.status, 'aberta');

console.log('\n=== 2, 3, 4. as recusas ===');
const naoBate = await api('POST', url, {
  vendaChave: certo.vendaChave,
  vendidas: { 111111: 2, 222222: 0 },
  devolvidas: { 222222: 2, 333333: 1 },
});
eq('vendidas que não batem com a planilha', naoBate.status, 409);
eq('e diz quais códigos', (naoBate.corpo?.divergentes ?? []).map((d) => d.sku).sort().join(','), '111111,222222');
eq('acerto de outra revendedora', (await api('POST', url, {
  vendaChave: 'outra teste|2026-09-10', vendidas: { 333333: 1 },
  devolvidas: { 111111: 2, 222222: 2 },
})).status, 409);
eq('distribuição que não soma o enviado', (await api('POST', url, {
  ...certo, devolvidas: { 111111: 1, 222222: 1 },
})).status, 400);
eq('chave sem acerto documental', (await api('POST', url, {
  ...certo, vendaChave: 'ninguem|2026-01-01',
})).status, 409);
eq('nada disso escreveu', await razao(), '[]');
eq('a maleta segue aberta',
  (await estado()).maletas.find((m) => Number(m.id) === Number(maleta.id))?.status, 'aberta');

console.log('\n=== 5. aplicar ===');
const feito = await api('POST', url, certo);
eq('o encerramento passa', feito.status, 200);
const depois = await estado();
const m = depois.maletas.find((x) => Number(x.id) === Number(maleta.id));
eq('maleta encerrada', m?.status, 'encerrada');
eq('na data do acerto', m?.encerradaEm ?? m?.encerrada_em, '2026-09-22');
eq('só as vendidas saíram do total (111111)', qtd(depois, '111111'), qtd(antes, '111111') - 1);
eq('só as vendidas saíram do total (222222)', qtd(depois, '222222'), qtd(antes, '222222') - 1);
eq('a devolvida continua no total (333333)', qtd(depois, '333333'), qtd(antes, '333333'));
const disp = depois.produtos.find((p) => String(p.sku) === '333333');
if (disp && disp.consignado !== undefined) eq('e nada mais conta como consignado', disp.consignado, 0);
eq('nenhuma venda nova', (depois.vendas ?? []).length, vendasAntes);
const acertos = (await api('GET', '/api/analytics/revendedoras?periodo=tudo')).corpo?.acertos ?? [];
eq('o acerto aparece uma vez, não duas', acertos.length, acertosAntes);
eq('razão fecha depois', await razao(), '[]');

console.log('\n=== 6. repetir ===');
eq('repetir é recusado', (await api('POST', url, certo)).status, 409);
eq('e o total não se move de novo', qtd(await estado(), '111111'), qtd(antes, '111111') - 1);

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — o acerto feito fora fecha a maleta sem segunda venda e sem segundo acerto.');
