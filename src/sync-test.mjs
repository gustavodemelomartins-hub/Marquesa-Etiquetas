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

console.log('\n=== 12. a sincronização guarda o retrato da loja que ela leu ===');
/* O bug que isto trava: `estoque_loja`, `url_loja`, `visivel` e
   `loja_snapshot` só eram escritos pela importação manual do CSV. A
   sincronização lia a loja inteira, empurrava o estoque e jogava fora o que
   aprendeu — então a aba Loja continuava acusando "estoque errado no site" e
   mandando gerar CSV para consertar o que a própria rodada já tinha
   consertado. Repare que NENHUM CSV foi importado neste teste. */
loja.estado.produtos.push(produtoFalso(4, [{ id: 44, sku: 'B4', estoque: 3 }], { publicado: false }));
await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'B4', desc: 'Anel B4', cat: 'Anel', preco: 70, qtd: 3 }],
});

r = await api('POST', '/api/sync', { forcar: true });
eq('a rodada terminou bem', r.ok, 'true');

const est12 = await api('GET', '/api/state');
const pb4 = est12.produtos.find(p => p.sku === 'B4');
eq('o código casado ficou marcado como publicado, sem CSV nenhum', !!pb4.urlLoja, 'true');
eq('com o identificador de URL que a loja informou', pb4.urlLoja, 'produto-4');
eq('e com o estoque que a loja tem agora', pb4.estoqueLoja, 3);
eq('produto oculto na loja chega como oculto', pb4.visivel, 'false');

/* O ponto central: depois de sincronizar, "estoque errado no site" tem de
   ser zero — porque a loja acabou de receber os números e o retrato foi
   atualizado junto. Antes deste conserto, esta contagem só caía com uma
   importação manual de CSV. */
const errados = est12.produtos.filter(p => p.urlLoja && (p.estoqueLoja || 0) !== Math.max(0, p.qtd - p.consignado));
eq('nada aparece como "estoque errado" logo após sincronizar', errados.length, 0);

eq('o retrato sabe quantos produtos a loja tem', est12.loja.produtosNaLoja, 4);
eq('e quantos códigos são meus', est12.loja.codigosCasados, 3);
eq('B3 continua contado como só-da-loja', est12.loja.soNaLoja, 1);
eq('o retrato tem data de leitura', !!est12.loja.lidoEm, 'true');

console.log('\n=== 13. produto tirado do ar deixa de constar como publicado ===');
loja.estado.produtos = loja.estado.produtos.filter(p => p.id !== 4);
r = await api('POST', '/api/sync', { forcar: true });
const pb4Depois = (await api('GET', '/api/state')).produtos.find(p => p.sku === 'B4');
eq('sumiu da loja, sumiu daqui também', !!pb4Depois.urlLoja, 'false');
eq('e volta a contar como "falta subir"', pb4Depois.estoqueLoja, 'undefined');

console.log('\n=== 14. variação não é cadastro duplicado ===');
/* O caso real: 56 códigos apareceram como "duplicados" numa loja que tem 2.
   Eram variações do MESMO produto, que é o normal. Duplicado é o mesmo
   código em produtos DIFERENTES.

   O que varia NÃO é uma lista fixa de tamanho e cor: quem nomeia é a loja,
   produto a produto. Por isso o teste usa "Comprimento", que não é nenhum
   dos dois — se o código presumisse as dimensões, quebraria aqui. */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'ANEL-T', desc: 'Anel com tamanhos', cat: 'Anel', preco: 90, qtd: 6 },
    { sku: 'GARG-C', desc: 'Gargantilha em três comprimentos', cat: 'Colar', preco: 130, qtd: 5 },
    { sku: 'DUPLO', desc: 'Código em dois anúncios', cat: 'Colar', preco: 120, qtd: 4 },
  ],
});
const comVariacoes = (id, sku, nome, atributo, vals) => ({
  id, name: { pt: nome }, handle: { pt: 'p-' + id }, published: true,
  attributes: [{ pt: atributo }],
  variants: vals.map((v, i) => ({
    id: id * 10 + i, sku, values: [{ pt: v.nome }],
    inventory_levels: [{ location_id: 'L1', stock: v.qtd }],
  })),
});
loja.estado.produtos = [
  comVariacoes(70, 'ANEL-T', 'Anel com tamanhos', 'Tamanho',
    [{ nome: '16', qtd: 2 }, { nome: '18', qtd: 3 }, { nome: '20', qtd: 1 }]),
  comVariacoes(73, 'GARG-C', 'Gargantilha em três comprimentos', 'Comprimento',
    [{ nome: '40cm', qtd: 1 }, { nome: '45cm', qtd: 2 }]),
  /* MESMO código em dois produtos diferentes: esse sim é duplicado */
  produtoFalso(71, [{ id: 711, sku: 'DUPLO', estoque: 2 }]),
  produtoFalso(72, [{ id: 722, sku: 'DUPLO', estoque: 2 }]),
];

r = await api('POST', '/api/sync', { forcar: true });
eq('a rodada terminou bem', r.ok, 'true');
eq('só o código em dois anúncios conta como duplicado', r.duplicadosNaLoja.join(','), 'DUPLO');
eq('o anel com 3 tamanhos NÃO é chamado de duplicado',
  r.duplicadosNaLoja.includes('ANEL-T'), 'false');

const naoEmpurrou = (r.semEmpurrar || []).reduce((m, x) => (m[x.sku] = x, m), {});
eq('o código em dois anúncios continua fora do empurrão', !!naoEmpurrou['DUPLO'], 'true');
eq('e o motivo é ser duplicata, não variação', naoEmpurrou['DUPLO'].motivo, 'duplicado');
eq('o anel com tamanhos NÃO fica mais de fora — cada aro tem o seu',
  !!naoEmpurrou['ANEL-T'], 'false');

const est14 = await api('GET', '/api/state');
const pAnel = est14.produtos.find(p => p.sku === 'ANEL-T');
eq('as variações do anel vieram da loja', pAnel.variacoes.map(v => v.nome).join(','), '16,18,20');
eq('e o nome do atributo também', pAnel.variacoes[0].atributo, 'Tamanho');
eq('o estoque foi repartido sozinho, sem ninguém confirmar',
  pAnel.variacoes.map(v => `${v.nome}:${v.qtd}`).join(' '), '16:2 18:3 20:1');
eq('o total do código não mudou por causa da repartição', pAnel.qtd, 6);

/* O bug que motivou tudo: a versão anterior escrevia o total inteiro do
   código numa variação só. A trava vale para sempre. */
const tam = loja.estado.produtos.find(p => p.id === 70).variants;
eq('nenhum tamanho recebeu o total do código',
  tam.some(v => v.inventory_levels[0].stock === pAnel.qtd), 'false');
eq('cada tamanho ficou com o número dele', tam.map(v => v.inventory_levels[0].stock).join(','), '2,3,1');

/* O nome do que varia sai da loja, não de uma lista nossa: um atributo que
   não é tamanho nem cor tem de atravessar inteiro até a tela. */
const pGarg = est14.produtos.find(p => p.sku === 'GARG-C');
eq('a gargantilha varia por comprimento, e isso atravessou',
  pGarg.variacoes[0].atributo, 'Comprimento');
eq('com os comprimentos que a loja informou',
  pGarg.variacoes.map(v => v.nome).join(' '), '40cm 45cm');
/* A loja só sabia de 3 das 5 gargantilhas: o resto fica "sem variação" em
   vez de ser chutado dentro de um comprimento qualquer. */
eq('a loja repartiu 1 e 2', pGarg.variacoes.map(v => v.qtd).join(','), '1,2');
eq('e as 2 que a loja não soube dizer ficaram sem variação', pGarg.semVariacao, 2);
eq('sem inventar peça: o total continua 5', pGarg.qtd, 5);

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
