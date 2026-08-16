/** Teste da sincronização com a Nuvemshop, contra uma loja de mentira.
 *
 *  O que precisa ficar provado aqui, em ordem de importância:
 *
 *   1. pedido do site vira venda daqui e baixa o estoque
 *   2. rodar duas vezes NÃO cobra a mesma venda duas vezes
 *   3. o empurrão acontece DEPOIS de puxar, senão desfaz a própria venda
 *   4. o freio segura uma rodada grande demais em vez de aplicar
 *   5. produto que só existe na loja não é tocado
 */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

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

const loja = await subirLojaFalsa();
console.log('loja falsa em ' + loja.url);

/* catálogo dos dois lados. B3 só existe na loja: não pode ser tocado. */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'B1', desc: 'Colar B1', cat: 'Colar', preco: 100, qtd: 10 },
    { sku: 'B2', desc: 'Brinco B2', cat: 'Brinco', preco: 50, qtd: 4 },
  ],
});
loja.estado.produtos = [
  produtoFalso(1, [{ id: 11, sku: 'B1', estoque: 10 }]),
  produtoFalso(2, [{ id: 22, sku: 'B2', estoque: 4 }]),
  produtoFalso(3, [{ id: 33, sku: 'B3', estoque: 7 }]),
];

const saldo = async sku => (await api('GET', '/api/state')).produtos.find(p => p.sku === sku).qtd;

console.log('\n=== 1. pedido do site vira venda ===');
loja.estado.pedidos = [{
  id: 5001, number: 5001, status: 'open', created_at: '2026-08-16T10:00:00-03:00',
  customer: { name: 'Cliente do Site' },
  products: [{ sku: 'B1', name: 'Colar B1', quantity: 2, price: '100.00' }],
}];

let r = await api('POST', '/api/sync', {});
eq('a rodada terminou bem', r.ok, 'true');
eq('leu 1 pedido', r.pedidosLidos, 1);
eq('criou 1 venda', r.vendasCriadas, 1);
eq('o estoque baixou (10 − 2)', await saldo('B1'), 8);

const vendas = await api('GET', '/api/vendas?data=2026-08-16');
const doSite = vendas.filter(v => v.origem === 'site');
eq('a venda ficou marcada como vinda do site', doSite.length, 1);
eq('com o nome de quem comprou', doSite[0].clienteNome, 'Cliente do Site');

console.log('\n=== 2. empurrou o estoque certo, e só o que conhece ===');
const b1 = loja.estado.produtos[0].variants[0];
eq('B1 na loja virou 8', b1.inventory_levels[0].stock, 8);
eq('B3 não foi tocado: não saber de um produto não é saber que ele tem zero',
  loja.estado.produtos[2].variants[0].inventory_levels[0].stock, 7);
eq('nenhuma chamada saiu sem User-Agent (a API real recusaria)',
  loja.estado.semUserAgent, 0);

console.log('\n=== 3. rodar de novo não cobra a venda outra vez ===');
r = await api('POST', '/api/sync', {});
eq('releu o pedido (a janela olha para trás de propósito)', r.pedidosLidos, 1);
eq('mas não criou venda nova', r.vendasCriadas, 0);
eq('e o estoque continua 8, não 6', await saldo('B1'), 8);

console.log('\n=== 4. a ordem certa: puxar antes de empurrar ===');
/* Se o empurrão viesse primeiro, ele devolveria 8 para a loja e a peça
   vendida agora voltaria para a prateleira. */
loja.estado.pedidos.push({
  id: 5002, number: 5002, status: 'open', created_at: '2026-08-16T11:00:00-03:00',
  customer: { name: 'Outra Cliente' },
  products: [{ sku: 'B1', name: 'Colar B1', quantity: 1, price: '100.00' }],
});
r = await api('POST', '/api/sync', {});
eq('a venda nova entrou', r.vendasCriadas, 1);
eq('nosso estoque foi para 7', await saldo('B1'), 7);
eq('e a loja recebeu 7, não o 8 antigo', b1.inventory_levels[0].stock, 7);

console.log('\n=== 5. item de pedido que não casa é anunciado, não engolido ===');
loja.estado.pedidos.push({
  id: 5003, number: 5003, status: 'open', created_at: '2026-08-16T12:00:00-03:00',
  customer: { name: 'Terceira' },
  products: [{ sku: 'NAO-EXISTE', name: 'Peça fantasma', quantity: 1, price: '80.00' }],
});
r = await api('POST', '/api/sync', {});
eq('o item sem par foi listado', r.itensIgnorados.length, 1);
eq('com o código que não casou', r.itensIgnorados[0].sku, 'NAO-EXISTE');

console.log('\n=== 6. pedido cancelado no site não vira venda ===');
loja.estado.pedidos.push({
  id: 5004, number: 5004, status: 'cancelled', created_at: '2026-08-16T13:00:00-03:00',
  cancelled_at: '2026-08-16T13:30:00-03:00',
  customer: { name: 'Desistiu' },
  products: [{ sku: 'B2', name: 'Brinco B2', quantity: 1, price: '50.00' }],
});
r = await api('POST', '/api/sync', {});
eq('B2 continua intocado', await saldo('B2'), 4);

console.log('\n=== 7. o freio segura uma rodada grande demais ===');
await api('PUT', '/api/config', { syncLimiteZerar: 1 });
/* zera os dois em casa: a loja ficaria sem nada à venda */
await api('POST', '/api/produtos/B1/movimento', { tipo: 'perda', quantidade: 7, obs: 'teste' });
await api('POST', '/api/produtos/B2/movimento', { tipo: 'perda', quantidade: 4, obs: 'teste' });

r = await api('POST', '/api/sync', {});
eq('a rodada foi pausada em vez de aplicada', !!r.pausado, 'true');
eq('e explicou o motivo', /zeraria 2 produtos/.test(r.pausado.motivo), 'true');
eq('a loja NÃO foi zerada', b1.inventory_levels[0].stock, 7);

console.log('\n=== 8. e aplica quando ela manda aplicar ===');
r = await api('POST', '/api/sync', { forcar: true });
eq('agora foi', !!r.pausado, 'false');
eq('a loja recebeu o zero', b1.inventory_levels[0].stock, 0);

console.log('\n=== 9. token sem permissão de pedidos (o erro real de produção) ===');
/* Foi o primeiro erro que a integração deu na loja de verdade. O que não
   pode acontecer NUNCA: falhar em ler os pedidos e mesmo assim empurrar
   estoque — seria escrever na loja sem saber o que já foi vendido. */
const antesDoErro = b1.inventory_levels[0].stock;
loja.estado.negarEscopo = { recurso: 'orders', escopo: 'read_orders' };
r = await api('POST', '/api/sync', {});
eq('a rodada falhou', r.ok, 'false');
eq('e explicou o que fazer, em vez de repetir o código do erro',
  /permissão de ler pedidos/.test(r.erro) && /gere um token novo/.test(r.erro), 'true');
eq('NÃO empurrou estoque sem conseguir ler as vendas', b1.inventory_levels[0].stock, antesDoErro);

const est = await api('GET', '/api/state');
eq('e a tela mostra o erro em vez de dizer que sincronizou', !!est.sync.erro, 'true');
eq('sem se declarar em dia', est.sync.ultimoStatus, 'erro');
loja.estado.negarEscopo = null;

console.log('\n=== 10. troca do código pelo token (caminho do app de parceiro) ===');
/* Este é o passo que a Marquesa realmente usou: ela criou um app de
   parceiro (App ID + Client Secret), não um "aplicativo sob medida" — então
   o token não vem pronto, precisa ser trocado por um código de autorização.
   A rota é pública (sem Bearer) de propósito: quem chama é o navegador dela
   vindo da Nuvemshop, não o dashboard. */
loja.estado.codigoValido = 'codigo-de-teste-abc';

let resp = await fetch(API + '/api/nuvemshop/callback?code=codigo-errado');
let corpo = await resp.text();
eq('código errado mostra o motivo, não trava sem explicação',
  /recusou a troca/.test(corpo), 'true');

resp = await fetch(API + '/api/nuvemshop/callback?code=codigo-de-teste-abc');
corpo = await resp.text();
eq('respondeu 200', resp.status, 200);
eq('a página mostra o token para copiar', /token-trocado-codigo-de-teste-abc/.test(corpo), 'true');
eq('e o id da loja', /555444/.test(corpo), 'true');
eq('sem pedir Bearer nenhum (a página abre no navegador dela, sem chave)', resp.status !== 401, 'true');

console.log('\n=== 11. a razão fecha depois de tudo (§19) ===');
const conf = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos', conf.divergentes.length, 0);

const hist = await api('GET', '/api/sync');
eq('cada rodada ficou registrada', hist.length >= 7, 'true');
eq('a pausada aparece como pausada no histórico',
  hist.some(h => h.status === 'pausado'), 'true');

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
