/** Validação de entrada da venda de balcão — QA de 28/09/2026.
 *
 *  Três defeitos que o teste como usuária achou e que este arquivo impede
 *  de voltar:
 *
 *   1. `qtd: 0.5` era aceito. A razão contábil fechava (a soma bate), mas a
 *      peça ficava com "14,5 disponível" — um número que não corresponde a
 *      nada na gaveta. Entrada, saída, maleta e inventário já exigiam
 *      inteiro; a venda era a única porta aberta.
 *   2. `data: 2026-02-30` era aceita: só o FORMATO era conferido. O SQLite
 *      guarda como texto, e nenhum relatório por mês a põe no lugar certo.
 *   3. Um corpo que não é JSON devolvia 500 "Falha interna" — erro de quem
 *      mandou, respondido como defeito do servidor.
 *
 *  Roda contra qualquer Worker local de banco limpo:
 *
 *      node scripts/v2-local/worker-local.mjs . 8787 &
 *      API_URL=http://127.0.0.1:8787 API_KEY=chave-local-de-teste node src/venda-validacao-test.mjs
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
  body: b === undefined ? undefined : (typeof b === 'string' ? b : JSON.stringify(b)),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const SKU = 'VALID-01';
const saldo = async () => {
  const st = await api('GET', '/api/state');
  return Number((st.corpo?.produtos ?? []).find((p) => p.sku === SKU)?.qtd ?? -1);
};
const vender = (extra) => api('POST', '/api/vendas', {
  clienteNome: 'Teste Validação', itens: [{ sku: SKU, qtd: 1 }], ...extra,
});

console.log('\n=== 0. uma peça com preço e estoque ===');
eq('cadastrou', (await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: SKU, desc: 'Anel Validação', preco: 50, cat: 'Outros', qtd: 10 }],
})).status, 200);
eq('saldo inicial', await saldo(), 10);

console.log('\n=== 1. quantidade é peça inteira ===');
{
  const r = await vender({ itens: [{ sku: SKU, qtd: 0.5 }] });
  eq('0,5 peça é recusada com 400', r.status, 400);
  eq('a frase diz o que fazer', /número inteiro/.test(r.corpo?.erro ?? ''), true);
  eq('o estoque não mexeu', await saldo(), 10);
  eq('1,5 também é recusada', (await vender({ itens: [{ sku: SKU, qtd: 1.5 }] })).status, 400);
  eq('"2" (texto) continua valendo — é inteiro', (await vender({ itens: [{ sku: SKU, qtd: '2' }] })).status, 201);
  eq('e baixou 2', await saldo(), 8);
}

console.log('\n=== 2. data tem que existir no calendário ===');
{
  const r = await vender({ data: '2026-02-30' });
  eq('30/02 é recusada', r.status, 400);
  eq('13º mês é recusado (sem estourar)', (await vender({ data: '2026-13-01' })).status, 400);
  eq('pagamento em 31/04 é recusado', (await vender({ data: '2026-04-01', dataPagamento: '2026-04-31' })).status, 400);
  eq('data real do passado continua valendo', (await vender({ data: '2026-02-28' })).status, 201);
  eq('estoque: só as vendas aceitas baixaram', await saldo(), 7);
}

console.log('\n=== 3. corpo que não é JSON é erro de quem mandou ===');
{
  const r = await api('POST', '/api/vendas', '{x');
  eq('400, não 500', r.status, 400);
  eq('sem "Falha interna"', r.corpo?.erro === 'Falha interna', false);
}

console.log('\n=== 4. a razão contábil continua fechando ===');
{
  const r = await api('GET', '/api/estoque/conferir');
  eq('GET /api/estoque/conferir vazio', (r.corpo?.divergentes ?? []).length, 0);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
