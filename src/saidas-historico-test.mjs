/** Histórico de Saídas sem faturamento — o que entrou, o que veio da planilha
 *  e o que foi corrigido, tudo consultável depois.
 *
 * O defeito que este teste impede: a reclassificação de uma linha histórica
 * (brinde, uso próprio, perda, sorteio) tirava a linha do faturamento mas
 * NÃO aparecia em Saídas — o brinde de 2025 simplesmente sumia da tela onde
 * se procura brinde. O desenho previa `origem_registro = 'migracao_historico'`
 * e `saida_id`; nada os usava.
 *
 * O que fica provado:
 *   1. saída manual aparece na hora, baixa o estoque e não gera receita;
 *   2. estornar preserva a saída (estornada, com motivo) e devolve a peça;
 *   3. reclassificar linha da planilha cria a saída histórica, sem mexer no
 *      estoque, e tira o dinheiro do faturamento;
 *   4. linha sem data vira registro legado, visível, não some;
 *   5. estornar a saída histórica desfaz a reclassificação — a linha volta a
 *      ser venda e a saída continua no histórico, estornada;
 *   6. desfazer a reclassificação estorna a saída em vez de apagá-la;
 *   7. busca e filtro por tipo;
 *   8. a razão fecha do começo ao fim.
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
const qtd = async (sku) => Number((await api('GET', '/api/state')).corpo.produtos.find((p) => String(p.sku) === sku)?.qtd);
const faturamento = async () => Number((await api('GET', '/api/analytics/painel?periodo=tudo')).corpo?.geral?.faturamento ?? NaN);
const saidas = async (qs = '') => (await api('GET', `/api/saidas${qs}`)).corpo;

console.log('\n=== 0. base ===');
eq('produtos', (await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '444444', desc: 'Colar Brinde', cat: 'Colar', preco: 80, qtd: 5 },
    { sku: '555555', desc: 'Anel Sorteio', cat: 'Anel', preco: 60, qtd: 3 },
  ],
})).status, 200);
eq('planilha com três linhas que não são venda', (await api('POST', '/api/vendas/historico/importar', {
  arquivo: 'S.xlsx',
  linhas: [
    CAB,
    [1, '2026-05-10', 'Sthefany Marques', '444444', 'Colar Brinde', 'Banhada', 1, 80, 'Presente Cecilia', 0, null, 'PAGO', 'Maleta'],
    [2, '2026-06-01', 'Brinde festa junina', '555555', 'Anel Sorteio', 'Banhada', 1, 60, null, 60, 'Pix', 'PAGO', 'Brinde festa junina'],
    [3, '-', 'Sthefany Marques', '444444', 'Colar Brinde', 'Banhada', 1, null, null, null, null, '-', '-'],
    [4, '2026-06-02', 'Cliente Real', '555555', 'Anel Sorteio', 'Banhada', 1, 60, null, 60, 'Pix', 'PAGO', 'Maleta'],
  ],
})).corpo?.ok, true);
const fatInicial = await faturamento();
eq('razão fecha antes', await razao(), '[]');

console.log('\n=== 1. saída manual ===');
const antes = await qtd('444444');
const manual = await api('POST', '/api/saidas', {
  tipo: 'brinde', data: '2026-09-20', sku: '444444', qtd: 1, motivo: 'Brinde cliente VIP', observacao: 'teste',
});
eq('registrada', manual.status, 201);
eq('baixou uma peça', await qtd('444444'), antes - 1);
eq('não gerou receita', await faturamento(), fatInicial);
const lista1 = await saidas();
eq('aparece no histórico na hora', lista1.saidas.some((s) => s.id === manual.corpo.saida.id), true);
eq('como lançamento manual', lista1.saidas.find((s) => s.id === manual.corpo.saida.id)?.origemRegistro, 'manual');

console.log('\n=== 2. estorno preserva ===');
const est = await api('POST', `/api/saidas/${manual.corpo.saida.id}/estornar`, { motivo: 'lançado duas vezes' });
eq('estornada', est.status, 200);
eq('a peça voltou', await qtd('444444'), antes);
const lista2 = await saidas();
const estornada = lista2.saidas.find((s) => s.id === manual.corpo.saida.id);
eq('a saída continua no histórico', !!estornada, true);
eq('marcada estornada, com o motivo', `${estornada?.estornada}|${estornada?.estornoMotivo}`, 'true|lançado duas vezes');
eq('razão fecha', await razao(), '[]');

console.log('\n=== 3. reclassificação cria a saída histórica ===');
const aud = (await api('GET', '/api/historico/auditoria?usoProprio=Sthefany Marques')).corpo;
const itemDe = (n) => aud.candidatos.find((c) => String(c.origemLinha) === String(n));
eq('a auditoria propõe as linhas', [1, 2, 3].every((n) => itemDe(n)), true);
const estoqueAntesReclass = await qtd('555555');
const rec = await api('POST', '/api/historico/reclassificar', {
  decisoes: [
    { historicoItemId: itemDe(1).historicoItemId, classe: 'brinde', decisao: 'aplicar', motivo: 'presente da Sthefany' },
    { historicoItemId: itemDe(2).historicoItemId, classe: 'brinde', decisao: 'aplicar', motivo: 'brinde festa junina' },
    { historicoItemId: itemDe(3).historicoItemId, classe: 'uso_proprio', decisao: 'aplicar', motivo: 'retirada da dona' },
  ],
  usuario: 'teste',
});
eq('reclassificou três', rec.corpo?.aplicadas, 3);
eq('o estoque não se moveu', await qtd('555555'), estoqueAntesReclass);
eq('o dinheiro da linha 2 saiu do faturamento', await faturamento(), +(fatInicial - 60).toFixed(2));
const lista3 = await saidas();
const historicas = lista3.saidas.filter((s) => s.origemRegistro === 'migracao_historico');
eq('duas saídas históricas (as que têm data)', historicas.length, 2);
eq('nenhuma baixou estoque de novo', historicas.every((s) => s.estoqueRefletido === false), true);
eq('com a data da planilha', historicas.map((s) => s.data).sort().join(','), '2026-05-10,2026-06-01');
eq('e o texto da planilha como motivo', historicas.some((s) => /Presente Cecilia/.test(s.motivo ?? '')), true);

console.log('\n=== 4. linha sem data vira legado, não some ===');
eq('uma linha legada', (lista3.legado ?? []).length, 1);
eq('dizendo por quê', lista3.legado?.[0]?.porque, 'sem data na planilha');
eq('com a pessoa e a linha', `${lista3.legado?.[0]?.pessoa}|${lista3.legado?.[0]?.linhaPlanilha}`, 'Sthefany Marques|3');

console.log('\n=== 5. estornar a saída histórica devolve a linha às vendas ===');
const s2 = historicas.find((s) => s.data === '2026-06-01');
const est2 = await api('POST', `/api/saidas/${s2.id}/estornar`, { motivo: 'era venda de verdade' });
eq('estornada', est2.status, 200);
eq('sem tocar no estoque', est2.corpo?.estoqueAlterado, false);
eq('o dinheiro voltou ao faturamento', await faturamento(), fatInicial);
const aud2 = (await api('GET', '/api/historico/auditoria')).corpo;
eq('a linha voltou a ser proposta (a decisão saiu)',
  aud2.candidatos.some((c) => String(c.origemLinha) === '2'), true);
eq('a saída continua no histórico, estornada',
  (await saidas()).saidas.find((s) => s.id === s2.id)?.estornada, true);

console.log('\n=== 6. desfazer a reclassificação estorna a saída ===');
const s1 = historicas.find((s) => s.data === '2026-05-10');
const desf = await api('DELETE', `/api/historico/reclassificar/${itemDe(1).historicoItemId}`);
eq('desfeita', desf.status, 200);
const s1depois = (await saidas()).saidas.find((s) => s.id === s1.id);
eq('a saída não foi apagada', !!s1depois, true);
eq('ficou estornada, com o motivo', `${s1depois?.estornada}|${/desfeita/.test(s1depois?.estornoMotivo ?? '')}`, 'true|true');

console.log('\n=== 7. busca e filtro ===');
eq('busca por texto', (await saidas('?busca=cecilia')).saidas.length, 1);
eq('busca por código', (await saidas('?busca=444444')).saidas.every((s) => s.sku === '444444'), true);
eq('filtro por tipo', (await saidas('?tipo=uso_proprio')).saidas.length, 0);
eq('filtro por tipo alcança o legado', (await saidas('?tipo=uso_proprio')).legado.length, 1);

console.log('\n=== 8. razão ===');
eq('a razão contábil fecha', await razao(), '[]');

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — saída manual, histórica e legada ficam no histórico, e nada some ao corrigir.');
