/** Venda presencial → pedido Nuvemshop → baixa de estoque, sem eco. */
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

console.log('\n=== 1. venda local cria pedido pago e a loja baixa o estoque ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'VD-SIMPLES', desc: 'Venda simples', cat: 'Colar', preco: 100, qtd: 5 },
] });
loja.estado.produtos = [produtoFalso(501, [{ id: 5011, sku: 'VD-SIMPLES', estoque: 5 }])];
await api('POST', '/api/loja/variantes/importar', {});

let r = await apiResp('POST', '/api/vendas', {
  clienteNome: 'Cliente do balcão', itens: [{ sku: 'VD-SIMPLES', qtd: 2 }],
});
eq('venda respondeu 201', r.status, 201);
eq('espelhamento terminou sincronizado', r.corpo.nuvemshop.status, 'sincronizada');
eq('um pedido foi criado', loja.estado.pedidosCriados.length, 1);
eq('pedido usa claim, não replace', loja.estado.pedidosCriados[0].corpo.inventory_behaviour, 'claim');
eq('pedido ficou pago', loja.estado.pedidosCriados[0].pedido.payment_status, 'paid');
eq('pedidos usam a API v1 compatível com a loja', loja.estado.caminhos.some(p => /^\/v1\/[^/]+\/orders$/.test(p)), 'true');
eq('catálogo continua na API 2025-03', loja.estado.caminhos.some(p => /^\/2025-03\/[^/]+\/products$/.test(p)), 'true');
eq('estoque da variante caiu de 5 para 3', loja.estado.produtos[0].variants[0].inventory_levels[0].stock, 3);
const st1 = await api('GET', '/api/state');
eq('estoque físico também caiu para 3', st1.produtos.find(p => p.sku === 'VD-SIMPLES').qtd, 3);

console.log('\n=== 2. retry e leitura de pedidos nunca duplicam a venda ===');
await api('POST', `/api/vendas/${r.corpo.id}/nuvemshop`, {});
eq('retry não criou segundo pedido', loja.estado.pedidosCriados.length, 1);
const rodada = await api('POST', '/api/sync', {});
eq('pedido criado daqui não voltou como venda do site', rodada.vendasCriadas, 0);
eq('estoque físico continua 3', (await api('GET', '/api/state')).produtos.find(p => p.sku === 'VD-SIMPLES').qtd, 3);
eq('continua existindo uma venda só', (await api('GET', `/api/vendas?data=${new Date().toISOString().slice(0,10)}`)).length, 1);

console.log('\n=== 3. cancelamento estorna os dois lados uma vez ===');
const cancelada = await api('POST', `/api/vendas/${r.corpo.id}/cancelar`, {});
eq('pedido externo foi cancelado', cancelada.nuvemshop.status, 'cancelada');
eq('Nuvemshop devolveu as duas unidades', loja.estado.produtos[0].variants[0].inventory_levels[0].stock, 5);
eq('estoque físico voltou a 5', (await api('GET', '/api/state')).produtos.find(p => p.sku === 'VD-SIMPLES').qtd, 5);

console.log('\n=== 4. produto com variações exige variant_id e baixa só a escolhida ===');
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
eq('a mensagem pede a variação', /varia[çc][ãa]o/i.test(r.corpo.erro), 'true');

r = await apiResp('POST', '/api/vendas', {
  clienteNome: 'Com aro', itens: [{ sku: 'VD-MULTI', qtd: 1, varianteId: '5021' }],
});
eq('com variant_id a venda entra', r.status, 201);
eq('aro 16 baixou', loja.estado.produtos[1].variants[0].inventory_levels[0].stock, 0);
eq('aro 18 ficou intacto', loja.estado.produtos[1].variants[1].inventory_levels[0].stock, 1);

console.log('\n=== 5. acerto registra as quatro vendas sem baixa dupla ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'AC-1', desc: 'Peça um do acerto', cat: 'Brinco', preco: 60, qtd: 2 },
  { sku: 'AC-2', desc: 'Peça dois do acerto', cat: 'Colar', preco: 90, qtd: 2 },
] });
loja.estado.produtos.push(
  produtoFalso(503, [{ id: 5031, sku: 'AC-1', estoque: 2 }]),
  produtoFalso(504, [{ id: 5041, sku: 'AC-2', estoque: 2 }]),
);
await api('POST', '/api/loja/variantes/importar', {});
const rev = await api('POST', '/api/revendedoras', { nome: 'Revendedora do teste' });
const maleta = await api('POST', '/api/maletas', {
  revId: rev.id, abertaEm: new Date().toISOString().slice(0, 10),
});
await api('POST', `/api/maletas/${maleta.id}/itens`, { itens: { 'AC-1': 2, 'AC-2': 2 } });
await api('POST', '/api/sync', {});
eq('as quatro peças da maleta saíram do disponível online',
  loja.estado.produtos[2].variants[0].inventory_levels[0].stock
  + loja.estado.produtos[3].variants[0].inventory_levels[0].stock, 0);
const acerto = await api('POST', `/api/maletas/${maleta.id}/acerto`, {
  devolvidas: {},
  faltas: [
    { sku: 'AC-1', linhas: [{ destino: 'vendida', qtd: 2 }] },
    { sku: 'AC-2', linhas: [{ destino: 'vendida', qtd: 2 }] },
  ],
});
eq('acerto entrou como uma venda sincronizada', acerto.nuvemshop.status, 'sincronizada');
const criacaoAcerto = loja.estado.pedidosCriados.at(-1);
const pedidoAcerto = criacaoAcerto.pedido;
eq('um pedido reuniu as quatro unidades', pedidoAcerto.products.reduce((n, p) => n + p.quantity, 0), 4);
eq('pedido do acerto não baixa de novo o que já estava consignado', criacaoAcerto.corpo.inventory_behaviour, 'bypass');
eq('AC-1 continuou indisponível, sem baixa dupla', loja.estado.produtos[2].variants[0].inventory_levels[0].stock, 0);
eq('AC-2 continuou indisponível, sem baixa dupla', loja.estado.produtos[3].variants[0].inventory_levels[0].stock, 0);
const vendasAcerto = await api('GET', `/api/vendas?data=${new Date().toISOString().slice(0,10)}`);
const vendaAcerto = vendasAcerto.find(v => v.id === acerto.vendaId);
eq('a venda ficou ligada à revendedora', vendaAcerto.revendedoraId, rev.id);
eq('a venda ficou ligada à maleta', vendaAcerto.maletaId, maleta.id);
eq('a venda do acerto tem quatro itens', vendaAcerto.itens.reduce((n, i) => n + i.qtd, 0), 4);

console.log('\n=== 6. pedido parcialmente desconhecido fica recuperável ===');
loja.estado.pedidos.push({
  id: 7001, number: 7001, status: 'open', created_at: new Date().toISOString(),
  customer: { name: 'Pedido incompleto' },
  products: [
    { sku: 'VD-SIMPLES', name: 'Conhecido', quantity: 1, price: '100' },
    { sku: 'VD-NOVO', name: 'Ainda sem cadastro', quantity: 1, price: '50' },
  ],
});
let s = await api('POST', '/api/sync', {});
eq('o item desconhecido apareceu', s.itensIgnorados.some(i => i.sku === 'VD-NOVO'), 'true');
eq('nenhuma venda parcial foi criada', s.vendasCriadas, 0);

await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'VD-NOVO', desc: 'Agora conhecido', cat: 'Brinco', preco: 50, qtd: 2 },
] });
s = await api('POST', '/api/sync', {});
eq('na rodada seguinte o pedido inteiro foi recuperado', s.vendasCriadas, 1);
eq('o item conhecido baixou só agora', (await api('GET', '/api/state')).produtos.find(p => p.sku === 'VD-SIMPLES').qtd, 4);

console.log('\n=== 7. corrida de estoque vira pendência, nunca sucesso falso ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'VD-CORRIDA', desc: 'Venda concorrente', cat: 'Brinco', preco: 70, qtd: 2 },
] });
loja.estado.produtos.push(produtoFalso(505, [{ id: 5051, sku: 'VD-CORRIDA', estoque: 1 }]));
loja.estado.criarComEstoqueInsuficiente = true;
await api('POST', '/api/loja/variantes/importar', {});
r = await apiResp('POST', '/api/vendas', {
  clienteNome: 'Concorrência no site', itens: [{ sku: 'VD-CORRIDA', qtd: 2 }],
});
eq('a venda local continua registrada', r.status, 201);
eq('a unidade não reservada ficou explícita', r.corpo.nuvemshop.status, 'estoque_divergente');
eq('a mensagem informa a quantidade', /1 unidade/.test(r.corpo.nuvemshop.erro), 'true');
await api('POST', '/api/sync', {});
const vendaCorrida = (await api('GET', `/api/vendas?data=${new Date().toISOString().slice(0,10)}`))
  .find(v => v.id === r.corpo.id);
eq('ler o próprio pedido não escondeu a divergência', vendaCorrida.nuvemshopStatus, 'estoque_divergente');
await api('POST', `/api/vendas/${r.corpo.id}/cancelar`, {});
eq('cancelar restaurou só o que a loja chegou a reservar', loja.estado.produtos.at(-1).variants[0].inventory_levels[0].stock, 1);

console.log('\n=== 8. falha temporária é retomada automaticamente pela rodada ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'VD-RETRY', desc: 'Venda para retry automático', cat: 'Brinco', preco: 55, qtd: 2 },
] });
loja.estado.produtos.push(produtoFalso(506, [{ id: 5061, sku: 'VD-RETRY', estoque: 2 }]));
await api('POST', '/api/loja/variantes/importar', {});
loja.estado.falhar = true;
r = await apiResp('POST', '/api/vendas', {
  clienteNome: 'Falha temporária', itens: [{ sku: 'VD-RETRY', qtd: 1 }],
});
eq('a venda ficou registrada apesar da queda externa', r.status, 201);
eq('a falha externa ficou marcada para retry', r.corpo.nuvemshop.status, 'erro');
const pedidosAntesRetry = loja.estado.pedidosCriados.length;
loja.estado.falhar = false;
s = await api('POST', '/api/sync', {});
eq('a rodada tentou a venda pendente', s.vendasLocais.tentadas, 1);
eq('a rodada concluiu o retry', s.vendasLocais.sincronizadas, 1);
eq('o retry criou exatamente um pedido', loja.estado.pedidosCriados.length, pedidosAntesRetry + 1);
eq('o pedido automático baixou somente uma unidade', loja.estado.produtos.at(-1).variants[0].inventory_levels[0].stock, 1);
const vendaRetry = (await api('GET', `/api/vendas?data=${new Date().toISOString().slice(0,10)}`))
  .find(v => v.id === r.corpo.id);
eq('a venda terminou sincronizada sem botão manual', vendaRetry.nuvemshopStatus, 'sincronizada');

eq('a razão continua fechando', (await api('GET', '/api/estoque/conferir')).ok, 'true');

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
