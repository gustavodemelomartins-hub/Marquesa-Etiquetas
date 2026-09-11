/** Monte seu Colar — prova do contrato pelo Worker.
 *
 * Os testes puros (`src/montagem-*-test.mjs`) provam a regra sem banco.
 * Este prova o que só o caminho inteiro mostra: o cadastro pela rota, o
 * carrinho, a razão contábil fechando, e o estorno lido de volta do D1.
 *
 * Atualizado em 10/09/2026 para o modelo confirmado pela Sthefany: a
 * configuração comercial NÃO tem saldo, a composição é por slot tipado, a
 * base não é escolha e composição livre não existe.
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
const MENINOS = ['251551', '251552', '329494'];
const MENINAS = ['263236', '273470'];
const COMPONENTES = [...MENINAS, ...MENINOS];
const COMERCIAIS = ['326660', '364945', '311066', '314161', '399872'];
const FISICOS = [BASE, ...COMPONENTES];

const produtos = [
  { sku: BASE, desc: 'Colar Veneziana 45cm com Extensor Banho de Ouro 18k', cat: 'Colar', preco: 74, qtd: 20 },
  { sku: '263236', desc: 'Colar Menina Zircônia Rosa Claro Banho de Ouro 18k', cat: 'Pingente', preco: 119, qtd: 20 },
  { sku: '273470', desc: 'Colar Menina Zircônia Incolor Banho de Ouro 18k', cat: 'Pingente', preco: 119, qtd: 20 },
  { sku: '251551', desc: 'Colar Menino Zircônia Azul Banho de Ouro 18k', cat: 'Pingente', preco: 119, qtd: 20 },
  { sku: '251552', desc: 'Colar Menino Zircônia Incolor Banho de Ouro 18k', cat: 'Pingente', preco: 119, qtd: 20 },
  { sku: '329494', desc: 'Colar Menino Zircônia Verde Banho de Ouro 18k', cat: 'Pingente', preco: 119, qtd: 20 },
  /* Configuração comercial nasce e continua com saldo ZERO: ela é
     identidade de venda, não peça. */
  { sku: '326660', desc: 'Colar Casal Banho de Ouro 18k', cat: 'Colar', preco: 129, qtd: 0 },
  { sku: '364945', desc: 'Colar Filhas Duas Meninas Banho de Ouro 18k', cat: 'Colar', preco: 129, qtd: 0 },
  { sku: '311066', desc: 'Colar Filhos Dois Meninos Banho de Ouro 18k', cat: 'Colar', preco: 129, qtd: 0 },
  { sku: '314161', desc: 'Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k', cat: 'Colar', preco: 159, qtd: 0 },
  { sku: '399872', desc: 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k', cat: 'Colar', preco: 159, qtd: 0 },
];

const rotulo = { 251551: 'Menino Azul', 251552: 'Menino Incolor', 329494: 'Menino Verde', 263236: 'Menina Rosa Claro', 273470: 'Menina Incolor' };
const cardapio = (grupos) => grupos.flatMap((g) => (g === 'Menino' ? MENINOS : MENINAS)
  .map((sku, i) => ({ componenteSku: sku, grupo: g, rotulo: rotulo[sku], ordem: i })));

const CONFIGS = [
  { slug: 'casal', nome: 'Colar Casal Banho de Ouro 18k', skuComercial: '326660', preco: 129, slots: [['Menino', 1], ['Menina', 1]] },
  { slug: 'duas-meninas', nome: 'Colar Filhas Duas Meninas Banho de Ouro 18k', skuComercial: '364945', preco: 129, slots: [['Menina', 2]] },
  { slug: 'dois-meninos', nome: 'Colar Filhos Dois Meninos Banho de Ouro 18k', skuComercial: '311066', preco: 129, slots: [['Menino', 2]] },
  { slug: 'dois-meninos-uma-menina', nome: 'Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k', skuComercial: '314161', preco: 159, slots: [['Menino', 2], ['Menina', 1]] },
  { slug: 'duas-meninas-um-menino', nome: 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k', skuComercial: '399872', preco: 159, slots: [['Menina', 2], ['Menino', 1]] },
];

const estado = async () => (await api('GET', '/api/state')).corpo;
const saldo = async (sku) => Number((await estado()).produtos.find((p) => p.sku === sku)?.qtd ?? -1);
const saldos = async (skus) => Object.fromEntries(await Promise.all(skus.map(async (sku) => [sku, await saldo(sku)])));
const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  return Array.isArray(r.corpo?.divergentes) && r.corpo.divergentes.length === 0;
};

console.log('\n=== 1. catálogo e cadastro das configurações ===');
const imp = await api('POST', '/api/produtos/importar', { produtos });
eq('catálogo importado', imp.status, 200);
verdade('razão fecha antes de qualquer venda', await razaoFecha());

/* O cadastro é DADO: cinco chamadas, nenhum deploy. Era constante em
   personalizacao.js até 10/09/2026. */
for (const c of CONFIGS) {
  const r = await api('POST', '/api/personalizacao/modelos', {
    slug: c.slug, nome: c.nome, skuComercial: c.skuComercial,
    baseSkuPadrao: BASE, precoSugerido: c.preco,
    slots: c.slots.map(([grupo, qtd]) => ({ grupo, qtd })),
    opcoes: cardapio(c.slots.map(([g]) => g)),
  });
  eq(`configuração ${c.skuComercial} cadastrada pela rota`, r.status, 200);
}

const lista = await api('GET', '/api/personalizacao/modelos');
eq('modelos respondem', lista.status, 200);
const modelos = lista.corpo?.modelos ?? [];
eq('cinco configurações, e nenhuma composição livre', modelos.length, 5);
verdade('nenhuma é composição livre', modelos.every((m) => m.composicaoLivre === false));
eq('todas usam a mesma base fixa', new Set(modelos.map((m) => m.baseSkuPadrao)).size, 1);
eq('a base é a Veneziana confirmada', modelos.find((m) => m.slug === 'casal')?.baseSkuPadrao, BASE);
eq('o casal custa R$ 129', modelos.find((m) => m.slug === 'casal')?.precoSugerido, 129);
eq('o modelo de três custa R$ 159', modelos.find((m) => m.slug === 'dois-meninos-uma-menina')?.precoSugerido, 159);
eq('os slots do casal são um de cada',
  JSON.stringify(modelos.find((m) => m.slug === 'casal')?.slotTipos), '["Menino","Menina"]');
eq('os slots de 2M+1F saem tipados e na ordem',
  JSON.stringify(modelos.find((m) => m.slug === 'dois-meninos-uma-menina')?.slotTipos),
  '["Menino","Menino","Menina"]');

console.log('\n=== 2. a configuração não tem saldo, e o disponível vem das peças ===');
eq('o SKU comercial continua com saldo zero', await saldo('326660'), 0);
/* Menino 20+20+20 = 60 · Menina 20+20 = 40 · Veneziana 20 → o teto é a
   corrente. */
eq('disponível do casal é limitado pela Veneziana', modelos.find((m) => m.slug === 'casal')?.disponivel, 20);
eq('disponível de dois meninos é floor(60/2), limitado pela Veneziana',
  modelos.find((m) => m.slug === 'dois-meninos')?.disponivel, 20);

const avulsa = await api('POST', '/api/vendas', {
  clienteNome: 'Avulsa Errada', data: '2026-09-07',
  itens: [{ sku: '326660', qtd: 1 }],
});
eq('vender a configuração como peça avulsa é recusado', avulsa.status, 409);

console.log('\n=== 3. validações fecham antes de tocar estoque ===');
const antesRecusas = await saldos([...FISICOS, ...COMERCIAIS]);

const baseErrada = await api('POST', '/api/vendas', {
  clienteNome: 'Base Errada', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'casal', baseSku: '326660', componentes: [
    { componenteSku: '251551' }, { componenteSku: '263236' },
  ] }],
});
eq('outra base é recusada — a Veneziana não é escolha', baseErrada.status, 409);

const grupoErrado = await api('POST', '/api/vendas', {
  clienteNome: 'Grupo Errado', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'casal', componentes: [
    { componenteSku: '251551' }, { componenteSku: '329494' },
  ] }],
});
eq('dois meninos num Casal é recusado', grupoErrado.status, 409);

const demais = await api('POST', '/api/vendas', {
  clienteNome: 'Peça a Mais', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'dois-meninos-uma-menina', componentes: [
    { componenteSku: '251551' }, { componenteSku: '251552' },
    { componenteSku: '263236' }, { componenteSku: '273470' },
  ] }],
});
eq('um quarto pingente é recusado', demais.status, 409);

const foraDoCardapio = await api('POST', '/api/vendas', {
  clienteNome: 'Fora do Cardápio', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'duas-meninas', componentes: [
    { componenteSku: '263236' }, { componenteSku: '251551' },
  ] }],
});
eq('peça de outro grupo não entra na configuração', foraDoCardapio.status, 409);

const precoErrado = await api('POST', '/api/vendas', {
  clienteNome: 'Preço Errado', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'casal', preco: 99, componentes: [
    { componenteSku: '251551' }, { componenteSku: '263236' },
  ] }],
});
eq('preço manual diferente do da configuração é recusado', precoErrado.status, 409);

const inexistente = await api('POST', '/api/vendas', {
  clienteNome: 'Três Meninos', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'tres-meninos', componentes: [
    { componenteSku: '251551' }, { componenteSku: '251552' }, { componenteSku: '329494' },
  ] }],
});
eq('configuração não cadastrada é recusada — sem composição inventada', inexistente.status, 400);

const depoisRecusas = await saldos([...FISICOS, ...COMERCIAIS]);
eq('recusas não alteram estoque', JSON.stringify(depoisRecusas), JSON.stringify(antesRecusas));

console.log('\n=== 4. venda mostra uma linha e baixa somente o físico ===');
const antesVenda = await saldos([...FISICOS, ...COMERCIAIS]);
const venda = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Montagem', data: '2026-09-07',
  personalizacoes: [
    { modeloSlug: 'casal', componentes: [
      { componenteSku: '251551', rotulo: 'Menino Azul' },
      { componenteSku: '263236', rotulo: 'Menina Rosa Claro' },
    ] },
    { modeloSlug: 'duas-meninas', componentes: [
      { componenteSku: '273470', rotulo: 'Menina Incolor' },
      { componenteSku: '263236', rotulo: 'Menina Rosa Claro' },
    ] },
  ],
});
eq('duas montagens com a mesma base são aceitas', venda.status, 201);
eq('preços da configuração somam R$ 258', venda.corpo?.total, 258);

/* Repetir a mesma cor nos dois slots do mesmo grupo — decisão de
   10/09/2026. */
const repetida = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Cor Repetida', data: '2026-09-07',
  personalizacoes: [{ modeloSlug: 'dois-meninos', componentes: [
    { componenteSku: '329494', rotulo: 'Menino Verde' },
    { componenteSku: '329494', rotulo: 'Menino Verde' },
  ] }],
});
eq('Azul + Azul: a mesma cor duas vezes é venda válida', repetida.status, 201);

const dia = await api('GET', '/api/vendas?data=2026-09-07');
const lida = (dia.corpo ?? []).find((v) => v.id === venda.corpo.id);
const lidaRepetida = (dia.corpo ?? []).find((v) => v.id === repetida.corpo.id);
eq('duas montagens viram duas linhas comerciais', lida?.itens?.length, 2);
eq('os SKUs comerciais são os das configurações', lida?.itens?.map((i) => i.sku).join(','), '326660,364945');
eq('a configuração fica congelada na venda', lida?.personalizacoes?.length, 2);
eq('as duas posições iguais ficam gravadas separadas',
  lidaRepetida?.personalizacoes?.[0]?.componentes?.length, 2);

const depoisVenda = await saldos([...FISICOS, ...COMERCIAIS]);
eq('uma base por montagem', depoisVenda[BASE], antesVenda[BASE] - 3);
eq('menina rosa baixou duas', depoisVenda['263236'], antesVenda['263236'] - 2);
eq('menina incolor baixou uma', depoisVenda['273470'], antesVenda['273470'] - 1);
eq('menino azul baixou uma', depoisVenda['251551'], antesVenda['251551'] - 1);
eq('menino verde baixou duas', depoisVenda['329494'], antesVenda['329494'] - 2);
eq('nenhum SKU comercial foi baixado',
  COMERCIAIS.map((sku) => depoisVenda[sku]).join(','),
  COMERCIAIS.map((sku) => antesVenda[sku]).join(','));
verdade('razão fecha depois das baixas físicas', await razaoFecha());

console.log('\n=== 5. cancelamento devolve exatamente o que saiu ===');
eq('cancelamento das duas montagens', (await api('POST', `/api/vendas/${venda.corpo.id}/cancelar`, {})).status, 200);
eq('cancelamento da cor repetida', (await api('POST', `/api/vendas/${repetida.corpo.id}/cancelar`, {})).status, 200);
const depoisEstorno = await saldos([...FISICOS, ...COMERCIAIS]);
eq('base e componentes voltam ao saldo anterior', JSON.stringify(depoisEstorno), JSON.stringify(antesVenda));
verdade('razão fecha depois do estorno integral', await razaoFecha());

eq('cancelar de novo é recusado', (await api('POST', `/api/vendas/${venda.corpo.id}/cancelar`, {})).status, 409);
eq('e não devolve estoque duas vezes',
  JSON.stringify(await saldos([...FISICOS, ...COMERCIAIS])), JSON.stringify(antesVenda));

console.log('\n=== 6. registro retroativo não baixa nem devolve ===');
const antesRetro = await saldos(FISICOS);
const retro = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Retroativa', data: '2026-05-10',
  pago: true, dataPagamento: '2026-05-10', estoqueJaRefletido: true,
  personalizacoes: [{ modeloSlug: 'casal', componentes: [
    { componenteSku: '251551' }, { componenteSku: '263236' },
  ] }],
});
eq('montagem retroativa é aceita', retro.status, 201);
eq('retroativa não baixa estoque', JSON.stringify(await saldos(FISICOS)), JSON.stringify(antesRetro));
eq('cancelamento retroativo é aceito', (await api('POST', `/api/vendas/${retro.corpo.id}/cancelar`, {})).status, 200);
eq('retroativa também não devolve estoque', JSON.stringify(await saldos(FISICOS)), JSON.stringify(antesRetro));
verdade('razão fecha no final', await razaoFecha());

console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
