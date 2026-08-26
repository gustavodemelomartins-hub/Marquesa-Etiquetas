/** Venda presencial → saldo absoluto na Nuvemshop, sem criar pedido. */
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';
let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`);
const apiResp = async (m, p, b) => {
  const r = await fetch(API + p, {
    method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  return { status: r.status, corpo: await r.json() };
};
const api = (m, p, b) => apiResp(m, p, b).then(r => r.corpo);

const loja = await subirLojaFalsa();
const hoje = new Date().toISOString().slice(0, 10);

console.log('\n=== 1. venda local baixa estoque sem criar pedido ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'VD-SIMPLES', desc: 'Venda simples', cat: 'Colar', preco: 100, qtd: 5 },
] });
loja.estado.produtos = [produtoFalso(501, [{ id: 5011, sku: 'VD-SIMPLES', estoque: 5 }])];
await api('POST', '/api/loja/variantes/importar', {});
let r = await apiResp('POST', '/api/vendas', {
  clienteNome: 'Cliente do balcão', itens: [{ sku: 'VD-SIMPLES', qtd: 2 }],
});
eq('venda respondeu 201', r.status, 201);
eq('estoque terminou sincronizado', r.corpo.nuvemshop.status, 'sincronizada');
eq('nenhum pedido foi criado', loja.estado.pedidosCriados.length, 0);
eq('nenhum POST /orders saiu', loja.estado.caminhos.some(p => /\/orders$/.test(p)), false);
eq('estoque online caiu de 5 para 3', loja.estado.produtos[0].variants[0].inventory_levels[0].stock, 3);
eq('estoque físico caiu para 3', (await api('GET', '/api/state')).produtos.find(p => p.sku === 'VD-SIMPLES').qtd, 3);

console.log('\n=== 2. retry é idempotente ===');
await api('POST', `/api/vendas/${r.corpo.id}/nuvemshop`, {});
eq('retry continua sem pedido', loja.estado.pedidosCriados.length, 0);
eq('retry manteve saldo absoluto 3', loja.estado.produtos[0].variants[0].inventory_levels[0].stock, 3);

console.log('\n=== 3. cancelamento repõe os dois estoques ===');
const cancelada = await api('POST', `/api/vendas/${r.corpo.id}/cancelar`, {});
eq('cancelamento foi somente de estoque', cancelada.nuvemshop.status, 'cancelada_local');
eq('online voltou para 5', loja.estado.produtos[0].variants[0].inventory_levels[0].stock, 5);
eq('físico voltou para 5', (await api('GET', '/api/state')).produtos.find(p => p.sku === 'VD-SIMPLES').qtd, 5);

console.log('\n=== 4. variação continua obrigatória e isolada ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'VD-MULTI', desc: 'Anel com aro', cat: 'Anel', preco: 80, qtd: 2 },
] });
loja.estado.produtos.push({
  id: 502, name: { pt: 'Anel com aro' }, handle: { pt: 'anel-com-aro' }, published: true,
  attributes: [{ pt: 'Aro' }], images: [],
  variants: [
    { id: 5021, sku: 'VD-MULTI', values: [{ pt: '16' }], inventory_levels: [{ location_id: 'LOC1', stock: 1 }] },
    { id: 5022, sku: 'VD-MULTI', values: [{ pt: '18' }], inventory_levels: [{ location_id: 'LOC1', stock: 1 }] },
  ],
});
await api('POST', '/api/loja/variantes/importar', {});
await api('POST', '/api/sync', { forcar: true });
r = await apiResp('POST', '/api/vendas', { clienteNome: 'Sem aro', itens: [{ sku: 'VD-MULTI', qtd: 1 }] });
eq('sem variant_id a venda é recusada', r.status, 409);
r = await apiResp('POST', '/api/vendas', {
  clienteNome: 'Com aro', itens: [{ sku: 'VD-MULTI', qtd: 1, varianteId: '5021' }],
});
eq('com variant_id a venda entra', r.status, 201);
eq('aro 16 baixou', loja.estado.produtos[1].variants[0].inventory_levels[0].stock, 0);
eq('aro 18 ficou intacto', loja.estado.produtos[1].variants[1].inventory_levels[0].stock, 1);
eq('variação também não criou pedido', loja.estado.pedidosCriados.length, 0);

console.log('\n=== 5. acerto não baixa duas vezes ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'AC-1', desc: 'Peça do acerto', cat: 'Brinco', preco: 60, qtd: 2 },
] });
loja.estado.produtos.push(produtoFalso(503, [{ id: 5031, sku: 'AC-1', estoque: 2 }]));
await api('POST', '/api/loja/variantes/importar', {});
const rev = await api('POST', '/api/revendedoras', { nome: 'Revendedora do teste' });
const maleta = await api('POST', '/api/maletas', { revId: rev.id, abertaEm: hoje });
const montagem = await api('POST', `/api/maletas/${maleta.id}/itens`, { itens: { 'AC-1': 2 } });
eq('montagem atualizou a Nuvemshop na hora', montagem.nuvemshop.status, 'sincronizada');
eq('maleta tirou as peças do online sem botão extra', loja.estado.produtos[2].variants[0].inventory_levels[0].stock, 0);
const acerto = await api('POST', `/api/maletas/${maleta.id}/acerto`, {
  devolvidas: {}, faltas: [{ sku: 'AC-1', linhas: [{ destino: 'vendida', qtd: 2 }] }],
});
eq('acerto terminou sincronizado', acerto.nuvemshop.status, 'sincronizada');
eq('acerto não baixou abaixo de zero', loja.estado.produtos[2].variants[0].inventory_levels[0].stock, 0);
eq('acerto não criou pedido', loja.estado.pedidosCriados.length, 0);

await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'AC-DEV', desc: 'Peça devolvida', cat: 'Brinco', preco: 40, qtd: 1 },
] });
loja.estado.produtos.push(produtoFalso(505, [{ id: 5051, sku: 'AC-DEV', estoque: 1 }]));
await api('POST', '/api/loja/variantes/importar', {});
const maletaDevolvida = await api('POST', '/api/maletas', { revId: rev.id, abertaEm: hoje });
await api('POST', `/api/maletas/${maletaDevolvida.id}/itens`, { itens: { 'AC-DEV': 1 } });
eq('segunda maleta também baixou online', loja.estado.produtos.at(-1).variants[0].inventory_levels[0].stock, 0);
const soDevolucao = await api('POST', `/api/maletas/${maletaDevolvida.id}/acerto`, {
  devolvidas: { 'AC-DEV': 1 }, faltas: [],
});
eq('acerto sem venda também sincronizou', soDevolucao.nuvemshop.status, 'sincronizada');
eq('devolução voltou ao online', loja.estado.produtos.at(-1).variants[0].inventory_levels[0].stock, 1);

console.log('\n=== 6. falha de PATCH fica retomável ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'VD-RETRY', desc: 'Venda para retry', cat: 'Brinco', preco: 55, qtd: 2 },
] });
loja.estado.produtos.push(produtoFalso(504, [{ id: 5041, sku: 'VD-RETRY', estoque: 2 }]));
await api('POST', '/api/loja/variantes/importar', {});
loja.estado.falharPatchParaProduto = new Set([504]);
r = await apiResp('POST', '/api/vendas', { clienteNome: 'Falha temporária', itens: [{ sku: 'VD-RETRY', qtd: 1 }] });
eq('venda local continua registrada', r.status, 201);
eq('falha externa fica visível', r.corpo.nuvemshop.status, 'erro');
const primeiraPendente = r.corpo.id;
r = await apiResp('POST', '/api/vendas', { clienteNome: 'Segunda falha', itens: [{ sku: 'VD-RETRY', qtd: 1 }] });
eq('segunda venda também fica retomável', r.corpo.nuvemshop.status, 'erro');
const segundaPendente = r.corpo.id;
loja.estado.falharPatchParaProduto = null;
const retry = await api('POST', `/api/vendas/${primeiraPendente}/nuvemshop`, {});
eq('retry concluiu', retry.status, 'sincronizada');
eq('uma publicação regularizou as duas pendentes', retry.vendasRegularizadas >= 2, true);
eq('retry publicou saldo absoluto 0', loja.estado.produtos.at(-1).variants[0].inventory_levels[0].stock, 0);
const vendasFinais = await api('GET', `/api/vendas?data=${hoje}`);
eq('segunda pendente também foi encerrada', vendasFinais.find(v => v.id === segundaPendente).nuvemshopStatus, 'sincronizada');
eq('retry não criou pedido', loja.estado.pedidosCriados.length, 0);

console.log('\n=== 7. confirmação explícita vence o freio sem desligá-lo ===');
await api('PUT', '/api/config', { syncLimiteMudancas: 0 });
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'VD-FORCE', desc: 'Confirmação do freio', cat: 'Brinco', preco: 45, qtd: 1 },
] });
loja.estado.produtos.push(produtoFalso(506, [{ id: 5061, sku: 'VD-FORCE', estoque: 1 }]));
await api('POST', '/api/loja/variantes/importar', {});
r = await apiResp('POST', '/api/vendas', { clienteNome: 'Freio', itens: [{ sku: 'VD-FORCE', qtd: 1 }] });
eq('sem confirmação o freio segurou', !!r.corpo.nuvemshop.pausado, true);
const forcada = await api('POST', `/api/vendas/${r.corpo.id}/nuvemshop`, { forcar: true });
eq('com confirmação publicou', forcada.status, 'sincronizada');
eq('confirmação não criou pedido', loja.estado.pedidosCriados.length, 0);
await api('PUT', '/api/config', { syncLimiteMudancas: 40 });

eq('a razão continua fechando', (await api('GET', '/api/estoque/conferir')).ok, true);
await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
