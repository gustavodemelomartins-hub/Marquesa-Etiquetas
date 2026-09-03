/** Reconciliação integral do estoque atual da Stephanie.
 *
 * Roda somente contra uma cópia local do D1. Os números abaixo são a decisão
 * auditável produzida pelo cruzamento de Estoque.xlsx, Vendas Marquesa (3),
 * as quatro planilhas de maleta e o retrato do sistema.
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

const novosDoEstoque = [
  ['697789', 'Pulseira Elos Oval Banho de Ouro 18k', 'Pulseira', 5, 159],
  ['599522', 'Pulseira Cartier Oval Banho de Ouro 18k', 'Pulseira', 10, 109],
  ['670215', 'Pulseira Masculina Elo Oval Banho de Ouro 18k', 'Pulseira', 5, 169],
  ['529589', 'Pingente Cadeado Banho de Ouro 18k', 'Pingente', 1, 39],
  ['527523', 'Pingente São Jose Banho de Ouro 18k', 'Pingente', 1, 39],
  ['513566', 'Pingente Nossa Senhora de Guadalupe Banho de Ouro 18k', 'Pingente', 2, 39],
  ['520270', 'Pingente Nossa Senhora de Fátima Banho de Ouro 18k', 'Pingente', 4, 39],
  ['574680', 'Pingente Nossa Senhora Aparecida Banho de Ouro 18k', 'Pingente', 2, 39],
  ['563054', 'Pingente São Miguel Arcanjo Banho de Ouro 18k', 'Pingente', 3, 39],
  ['481514', 'Pulseira Cadeia de Consagração Medalha e Cadeado Banho de Ouro 18k', 'Pulseira', 1, 194],
  ['484220', 'Pulseira Cadeia de Consagração Medalha Banho de Ouro 18k', 'Pulseira', 1, 179],
  ['454953', 'Pulseira Cadeia de Consagração Medalha e Cadeado Banho de Ouro 18k', 'Pulseira', 1, 159],
  ['483454', 'Pulseira Cadeia de Consagração Medalha Banho de Ouro 18k', 'Pulseira', 1, 139],
  ['457541', 'Pulseira Cadeia de Consagração Masculina Medalha Banho de Ouro 18k', 'Pulseira', 1, 209],
  ['420020', 'Pulseira Cadeia de Consagração Masculina Duas Medalha Banho de Ouro 18k', 'Pulseira', 1, 189],
];

const vendidosEsgotados = [
  ['508952', 'Pingente Nossa Senhora das Graças Banho de Ouro 18k', 'Pingente', 0, 39],
  ['399872', 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k', 'Colar', 0, 129],
];

const alvosExistentes = [
  ['420935', 1], ['233280', 2], ['171241', 3], ['190359', 1], ['466730', 3],
  ['327653', 1], ['647729', 7], ['317225', 1], ['252668', 1], ['229297', 1],
  ['263236', 5], ['584162', 1], ['350039', 1], ['155148', 5], ['123184', 4],
  // Ausentes do estoque atual e comprovadamente vendidos depois do retrato
  // do sistema. A planilha omite esgotados; estes alvos zero são explícitos.
  ['126826', 0], ['153244', 0], ['158154', 0], ['163505', 0], ['165683', 0],
  ['316382', 0], ['384665', 0], ['420967', 0], ['789166', 0], ['838474', 0],
];

const comoProduto = ([sku, desc, cat, qtd, preco]) => ({ sku, desc, cat, qtd, preco });
const totalEstoque = (estado) => estado.produtos.reduce((s, p) => s + Number(p.qtd || 0), 0);
const porSku = (estado, sku) => estado.produtos.find((p) => p.sku === sku);

async function aprovarTodos(sessao) {
  for (const item of sessao.itens) {
    const r = await api('POST', `/api/reconciliacao/${sessao.id}/itens/${item.id}/aprovar`);
    eq(`aprova ${item.sku}`, r.status, 200);
  }
}

console.log('\n=== 1. ponto de partida ===');
let estado = (await api('GET', '/api/state')).corpo;
eq('estoque do sistema antes da reconciliação', totalEstoque(estado), 1485);
const razaoAntes = await api('GET', '/api/estoque/conferir');
eq('razão fecha antes', JSON.stringify(razaoAntes.corpo.divergentes), '[]');

console.log('\n=== 2. cadastra 15 códigos atuais e 2 vendidos/esgotados ===');
const sessaoNovos = await api('POST', '/api/reconciliacao/planilha/produtos-novos/analisar', {
  produtos: [...novosDoEstoque, ...vendidosEsgotados].map(comoProduto),
});
eq('análise de produtos novos responde', sessaoNovos.status, 200);
eq('17 códigos realmente novos', sessaoNovos.corpo.itens.length, 17);
await aprovarTodos(sessaoNovos.corpo);
const aplicouNovos = await api('POST', `/api/reconciliacao/${sessaoNovos.corpo.id}/aplicar`);
eq('sessão de produtos aplicada', aplicouNovos.corpo.status, 'aplicada');
eq('17 cadastros aplicados', aplicouNovos.corpo.aplicados, 17);

for (const [sku] of vendidosEsgotados) {
  const inativou = await api('PATCH', `/api/produtos/${sku}`, { status: 'inativo' });
  eq(`${sku} arquivado`, inativou.status, 200);
}

estado = (await api('GET', '/api/state')).corpo;
eq('39 peças novas entram por movimento', totalEstoque(estado), 1524);

console.log('\n=== 3. aplica somente os 25 ajustes explicados ===');
const sessaoAjustes = await api('POST', '/api/reconciliacao/planilha/estoque-total/analisar', {
  produtos: alvosExistentes.map(([sku, qtd]) => ({ sku, qtd })),
});
eq('análise de ajustes responde', sessaoAjustes.status, 200);
eq('25 diferenças explicadas', sessaoAjustes.corpo.itens.length, 25);
eq('nenhum conflito com quantidade consignada',
  sessaoAjustes.corpo.itens.filter((i) => i.risco === 'desconhecido').length, 0);
await aprovarTodos(sessaoAjustes.corpo);
const aplicouAjustes = await api('POST', `/api/reconciliacao/${sessaoAjustes.corpo.id}/aplicar`);
eq('sessão de ajustes aplicada', aplicouAjustes.corpo.status, 'aplicada');
eq('25 movimentos aplicados', aplicouAjustes.corpo.aplicados, 25);

console.log('\n=== 4. resultado físico e exceções confirmadas ===');
estado = (await api('GET', '/api/state')).corpo;
eq('estoque final correto', totalEstoque(estado), 1496);
eq('pingente de filhos 263236 fica em 5', porSku(estado, '263236').qtd, 5);
eq('venda já registrada do 420967 deixa saldo zero', porSku(estado, '420967').qtd, 0);
eq('508952 existe para o histórico, esgotado', porSku(estado, '508952').qtd, 0);
eq('508952 não polui catálogo ativo', porSku(estado, '508952').status, 'inativo');
eq('399872 existe para o colar vendido, esgotado', porSku(estado, '399872').qtd, 0);
eq('399872 não polui catálogo ativo', porSku(estado, '399872').status, 'inativo');

// A segunda maleta da Andréia já havia baixado estas quatro peças no sistema.
// A planilha não as descontou; portanto, o saldo do sistema deve permanecer.
eq('Andréia M2: 181279 preservado', porSku(estado, '181279').qtd, 1);
eq('Andréia M2: 141572 preservado', porSku(estado, '141572').qtd, 0);
eq('Andréia M2: 309637 preservado', porSku(estado, '309637').qtd, 0);
eq('Andréia M2: 136012 preservado', porSku(estado, '136012').qtd, 2);

const mov263236 = await api('GET', '/api/estoque/263236/movimentos');
eq('263236 ganhou um movimento explicativo', mov263236.corpo.movimentos.at(-1).qtd, -1);
eq('movimento vem da reconciliação', mov263236.corpo.movimentos.at(-1).origem, 'reconciliacao');
const mov420967 = await api('GET', '/api/estoque/420967/movimentos');
eq('420967 ganhou baixa explicativa', mov420967.corpo.movimentos.at(-1).qtd, -1);

const razaoDepois = await api('GET', '/api/estoque/conferir');
eq('razão fecha depois', JSON.stringify(razaoDepois.corpo.divergentes), '[]');

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — 1.496 peças, catálogo novo e cada ajuste com movimento.');
