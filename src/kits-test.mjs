/** Teste do caso real: o "Colar Casal de Filhos" (kit) e o "Colar Filho(a)"
 *  (também kit) compartilhando a mesma corrente e os mesmos pingentes.
 *
 *  A pergunta que este teste tem que responder com certeza: dá para os
 *  DOIS anúncios ficarem publicados sem nunca vender a mesma peça física
 *  duas vezes?
 */
const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const disp = async sku => (await api('GET', '/api/state')).produtos.find(p => p.sku === sku).disponivel;

console.log('=== catálogo: componentes soltos + os dois kits ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'CORRENTE-45', desc: 'Corrente avulsa 45cm Prata 925', cat: 'Colar', preco: 89, qtd: 1 },
  { sku: '718220', desc: 'Pingente Menino Cravejado Azul Banho de Prata', cat: 'Pingente', preco: 79, qtd: 1 },
  { sku: '721946', desc: 'Pingente Menina Cravejada Rosa Pink Banho de Prata', cat: 'Pingente', preco: 79, qtd: 1 },
  { sku: '424442', desc: 'Colar Casal de Filhos com Coração Cravejado 45cm Prata 925', cat: 'Colar', preco: 219, qtd: 0 },
  { sku: '424443', desc: 'Colar Filho (a) com Coração Cravejado 45 cm Prata 925', cat: 'Colar', preco: 189, qtd: 0 },
]});

console.log('\n=== 1. não deixa virar kit com saldo próprio ===');
let r = await api('PUT', '/api/produtos/424442/componentes', {
  componentes: [{ sku: 'CORRENTE-45', qtd: 1 }],
});
// 424442 foi importado com qtd:0, então isso na verdade passaria — testa o caso oposto
await api('POST', '/api/produtos/424442/movimento', { tipo: 'entrada', quantidade: 2, obs: 'teste' });
r = await api('PUT', '/api/produtos/424442/componentes', { componentes: [{ sku: 'CORRENTE-45', qtd: 1 }] });
eq('recusou virar kit com 2 no saldo', /erro/.test(JSON.stringify(r)), 'true');
eq('e disse por quê', /Zere com um ajuste/.test(r.erro), 'true');
await api('POST', '/api/produtos/424442/movimento', { tipo: 'ajuste', quantidade: -2, obs: 'zerando para virar kit' });

console.log('\n=== 2. monta os dois kits ===');
r = await api('PUT', '/api/produtos/424442/componentes', {
  componentes: [{ sku: 'CORRENTE-45', qtd: 1 }, { sku: '718220', qtd: 1 }, { sku: '721946', qtd: 1 }],
});
eq('424442 (casal) montado', r.ok, 'true');
r = await api('PUT', '/api/produtos/424443/componentes', {
  componentes: [{ sku: 'CORRENTE-45', qtd: 1 }, { sku: '718220', qtd: 1 }],
});
eq('424443 (só o menino) montado', r.ok, 'true');

console.log('\n=== 3. com 1 de cada componente, os DOIS anúncios mostram 1 ===');
eq('casal disponível', await disp('424442'), 1);
eq('só-o-menino disponível', await disp('424443'), 1);

console.log('\n=== 4. vender um derruba o outro NA HORA (o problema real) ===');
r = await api('POST', '/api/vendas', { clienteNome: 'Cliente Teste', itens: [{ sku: '424442', qtd: 1 }] });
eq('a venda do casal passou', r.ok, 'true');
eq('casal foi para 0', await disp('424442'), 0);
eq('e o "só o menino" TAMBÉM foi para 0 — não sobrou peça pra ele', await disp('424443'), 0);
eq('a corrente sumiu do estoque solto', await disp('CORRENTE-45'), 0);
eq('os dois pingentes também', `${await disp('718220')},${await disp('721946')}`, '0,0');

console.log('\n=== 5. cancelar a venda devolve tudo aos componentes ===');
const vendas = await api('GET', '/api/vendas?data=' + new Date().toISOString().slice(0, 10));
const vendaId = vendas.find(v => v.itens.some(i => i.sku === '424442')).id;
await api('POST', `/api/vendas/${vendaId}/cancelar`);
eq('casal voltou a 1', await disp('424442'), 1);
eq('e o outro kit também, porque a peça física voltou', await disp('424443'), 1);

console.log('\n=== 6. o carrinho não deixa vender os dois no mesmo carrinho (só tem peça pra um) ===');
r = await api('POST', '/api/vendas', {
  clienteNome: 'Duas de uma vez',
  itens: [{ sku: '424442', qtd: 1 }, { sku: '424443', qtd: 1 }],
});
eq('a venda foi recusada', !!r.erro, 'true');
eq('avisando que só tem 0 disponível pro segundo item do carrinho', /só tem 0 dispon/.test(r.erro), 'true');
eq('e nada foi descontado (nem a venda parcial)', await disp('424442'), 1);

console.log('\n=== 7. kit não entra em maleta ===');
await api('POST', '/api/revendedoras', { nome: 'Rev Teste' });
const mid = (await api('POST', '/api/maletas', { revId: 1 })).id;
r = await api('POST', `/api/maletas/${mid}/itens`, { itens: { 424442: 1 } });
eq('recusado, não silenciosamente ignorado', r.recusados.length, 1);
eq('com motivo claro', /peça montada/.test(r.recusados[0].motivo), 'true');

console.log('\n=== 8. inventário ignora os kits, conta só os componentes reais ===');
const inv = await api('POST', '/api/inventarios');
r = await api('POST', `/api/inventarios/${inv.id}/concluir`);
const skusNoRelatorio = [...r.faltando, ...r.sobrando].map(l => l.sku);
eq('424442 e 424443 não aparecem (não são coisa pra bipar)',
  skusNoRelatorio.includes('424442') || skusNoRelatorio.includes('424443'), 'false');

console.log('\n=== 9. a razão fecha no fim de tudo (§19) ===');
const conf = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos em todo SKU', conf.divergentes.length, 0);

console.log(falhas ? `\n✗ ${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
