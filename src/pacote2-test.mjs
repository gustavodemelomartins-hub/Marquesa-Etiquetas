/** Pacote 2 — prova do contrato canônico do Monte seu Colar.
 *
 * Roda contra o Worker local com PERSONALIZACAO_ATIVA=true e banco
 * descartável já criado por api/schema.sql:
 *
 *   npx wrangler dev --env staging --local --persist-to ../.tmp/p2-fresh-d1
 *   node src/pacote2-test.mjs
 */
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x, detalhe = '') => (x ? ok(t, detalhe) : bad(t, detalhe));
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const BASE = '444032';
const COMPONENTES = ['263236', '273470', '251551', '251552', '329494'];
const COMERCIAIS = ['326660', '364945', '311066', '314161', '399872'];
const produtos = [
  { sku: BASE, desc: 'Colar Veneziana Banho de Ouro 18k', cat: 'Colar', preco: 79, qtd: 20 },
  { sku: '263236', desc: 'Colar Menina Zircônia Rosa Claro Banho de Ouro 18k', cat: 'Pingente', preco: 35, qtd: 20 },
  { sku: '273470', desc: 'Colar Menina Zircônia Incolor Banho de Ouro 18k', cat: 'Pingente', preco: 35, qtd: 20 },
  { sku: '251551', desc: 'Colar Menino Zircônia Azul Banho de Ouro 18k', cat: 'Pingente', preco: 35, qtd: 20 },
  { sku: '251552', desc: 'Colar Menino Zircônia Incolor Banho de Ouro 18k', cat: 'Pingente', preco: 35, qtd: 20 },
  { sku: '329494', desc: 'Colar Menino Zircônia Verde Banho de Ouro 18k', cat: 'Pingente', preco: 35, qtd: 20 },
  { sku: '326660', desc: 'Colar Casal Banho de Ouro 18k', cat: 'Colar', preco: 129, qtd: 7 },
  { sku: '364945', desc: 'Colar Filhas Duas Meninas Banho de Ouro 18k', cat: 'Colar', preco: 129, qtd: 7 },
  { sku: '311066', desc: 'Colar Filhos Dois Meninos Banho de Ouro 18k', cat: 'Colar', preco: 129, qtd: 7 },
  { sku: '314161', desc: 'Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k', cat: 'Colar', preco: 159, qtd: 7 },
  { sku: '399872', desc: 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k', cat: 'Colar', preco: 159, qtd: 7 },
];

const estado = async () => (await api('GET', '/api/state')).corpo;
const saldo = async (sku) => Number((await estado()).produtos.find((p) => p.sku === sku)?.qtd ?? -1);
const saldos = async (skus) => Object.fromEntries(await Promise.all(skus.map(async (sku) => [sku, await saldo(sku)])));
const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  return Array.isArray(r.corpo?.divergentes) && r.corpo.divergentes.length === 0;
};

console.log('\n=== 1. catálogo e modelos canônicos ===');
const imp = await api('POST', '/api/produtos/importar', { produtos });
eq('catálogo canônico importado', imp.status, 200);
verdade('razão fecha antes da venda', await razaoFecha());
eq('A receber funciona numa instalação limpa', (await api('GET', '/api/contas-receber')).status, 200);

const lista = await api('GET', '/api/personalizacao/modelos');
eq('modelos respondem', lista.status, 200);
const modelos = lista.corpo?.modelos ?? [];
eq('cinco modelos e uma composição livre', modelos.filter((m) => m.canonico).length, 6);
eq('todos usam a base fixa', new Set(modelos.filter((m) => m.canonico).map((m) => m.baseSkuPadrao)).size, 1);
eq('a base é a Veneziana confirmada', modelos.find((m) => m.slug === 'casal')?.baseSkuPadrao, BASE);
eq('o casal custa R$ 129', modelos.find((m) => m.slug === 'casal')?.precoSugerido, 129);
eq('o modelo de três custa R$ 159', modelos.find((m) => m.slug === 'dois-meninos-uma-menina')?.precoSugerido, 159);
eq('a composição livre não inventa preço', modelos.find((m) => m.slug === 'livre')?.precoSugerido, null);
eq('as cinco opções físicas são as confirmadas',
  [...new Set(modelos.find((m) => m.slug === 'casal')?.opcoes.map((o) => o.componenteSku))].sort().join(','),
  [...COMPONENTES].sort().join(','));

console.log('\n=== 2. validações fecham antes de tocar estoque ===');
const antesRecusas = await saldos([BASE, ...COMPONENTES, ...COMERCIAIS]);
const baseErrada = await api('POST', '/api/vendas', {
  clienteNome: 'Base Errada', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'casal', baseSku: '326660', componentes: [
    { componenteSku: '251551' }, { componenteSku: '263236' },
  ] }],
});
eq('outra base é recusada', baseErrada.status, 409);

const slotErrado = await api('POST', '/api/vendas', {
  clienteNome: 'Slot Errado', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'casal', componentes: [
    { componenteSku: '251551' }, { componenteSku: '329494' },
  ] }],
});
eq('sexo incompatível com a posição é recusado', slotErrado.status, 409);

const precoErrado = await api('POST', '/api/vendas', {
  clienteNome: 'Preço Errado', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'casal', preco: 99, componentes: [
    { componenteSku: '251551' }, { componenteSku: '263236' },
  ] }],
});
eq('preço manual em modelo fechado é recusado', precoErrado.status, 409);

const livreSemValor = await api('POST', '/api/vendas', {
  clienteNome: 'Livre Sem Valor', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'livre', componentes: [{ componenteSku: '251551' }] }],
});
eq('composição livre exige preço', livreSemValor.status, 409);
const depoisRecusas = await saldos([BASE, ...COMPONENTES, ...COMERCIAIS]);
eq('recusas não alteram estoque', JSON.stringify(depoisRecusas), JSON.stringify(antesRecusas));

console.log('\n=== 3. venda mostra uma linha e baixa somente o físico ===');
const antesVenda = await saldos([BASE, ...COMPONENTES, ...COMERCIAIS]);
const venda = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Pacote Dois', data: '2026-09-07',
  personalizacoes: [
    { modeloSlug: 'casal', componentes: [
      { componenteSku: '251551', rotulo: 'Menino azul' },
      { componenteSku: '263236', rotulo: 'Menina rosa claro' },
    ] },
    { modeloSlug: 'duas-meninas', componentes: [
      { componenteSku: '273470', rotulo: 'Menina incolor' },
      { componenteSku: '263236', rotulo: 'Menina rosa claro' },
    ] },
  ],
});
eq('duas composições com a mesma base são aceitas', venda.status, 201);
eq('preços automáticos somam R$ 258', venda.corpo?.total, 258);

const vendaLivre = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Composição Livre', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'livre', preco: 147, componentes: [
    { componenteSku: '329494', rotulo: 'Menino verde' },
    { componenteSku: '251552', rotulo: 'Menino incolor' },
    { componenteSku: '273470', rotulo: 'Menina incolor' },
  ] }],
});
eq('composição livre com valor é aceita', vendaLivre.status, 201);
eq('valor manual é preservado', vendaLivre.corpo?.total, 147);

const dia = await api('GET', '/api/vendas?data=2026-09-07');
const fixaLida = (dia.corpo ?? []).find((v) => v.id === venda.corpo.id);
const livreLida = (dia.corpo ?? []).find((v) => v.id === vendaLivre.corpo.id);
eq('duas composições viram duas linhas comerciais', fixaLida?.itens?.length, 2);
eq('SKUs comerciais dos modelos são os corretos', fixaLida?.itens?.map((i) => i.sku).join(','), '326660,364945');
eq('livre vira uma única linha interna', livreLida?.itens?.length, 1);
eq('SKU comercial livre é estável', livreLida?.itens?.[0]?.sku, 'MONTE-COLAR');
eq('configuração fixa fica congelada', fixaLida?.personalizacoes?.length, 2);
eq('configuração livre fica congelada', livreLida?.personalizacoes?.[0]?.componentes?.length, 3);

const depoisVenda = await saldos([BASE, ...COMPONENTES, ...COMERCIAIS]);
eq('uma base por composição', depoisVenda[BASE], antesVenda[BASE] - 3);
eq('menina rosa baixou duas', depoisVenda['263236'], antesVenda['263236'] - 2);
eq('menina incolor baixou duas', depoisVenda['273470'], antesVenda['273470'] - 2);
eq('menino azul baixou uma', depoisVenda['251551'], antesVenda['251551'] - 1);
eq('menino incolor baixou uma', depoisVenda['251552'], antesVenda['251552'] - 1);
eq('menino verde baixou uma', depoisVenda['329494'], antesVenda['329494'] - 1);
eq('nenhum SKU comercial foi baixado',
  COMERCIAIS.map((sku) => depoisVenda[sku]).join(','),
  COMERCIAIS.map((sku) => antesVenda[sku]).join(','));
verdade('razão fecha depois das baixas físicas', await razaoFecha());

console.log('\n=== 4. cancelamento estorna toda a composição ===');
eq('cancelamento da venda fixa', (await api('POST', `/api/vendas/${venda.corpo.id}/cancelar`, {})).status, 200);
eq('cancelamento da venda livre', (await api('POST', `/api/vendas/${vendaLivre.corpo.id}/cancelar`, {})).status, 200);
const depoisEstorno = await saldos([BASE, ...COMPONENTES, ...COMERCIAIS]);
eq('base e componentes voltam exatamente ao saldo inicial', JSON.stringify(depoisEstorno), JSON.stringify(antesVenda));
verdade('razão fecha depois do estorno integral', await razaoFecha());

console.log('\n=== 5. registro retroativo não baixa nem devolve ===');
const antesRetro = await saldos([BASE, ...COMPONENTES]);
const retro = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Retroativa Pacote Dois', data: '2026-05-10',
  pago: true, dataPagamento: '2026-05-10', estoqueJaRefletido: true,
  personalizacoes: [{ modeloSlug: 'casal', componentes: [
    { componenteSku: '251551' }, { componenteSku: '263236' },
  ] }],
});
eq('venda personalizada retroativa é aceita', retro.status, 201);
eq('retroativa não baixa estoque', JSON.stringify(await saldos([BASE, ...COMPONENTES])), JSON.stringify(antesRetro));
eq('cancelamento retroativo é aceito', (await api('POST', `/api/vendas/${retro.corpo.id}/cancelar`, {})).status, 200);
eq('retroativa também não devolve estoque', JSON.stringify(await saldos([BASE, ...COMPONENTES])), JSON.stringify(antesRetro));
verdade('razão fecha no final', await razaoFecha());

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
