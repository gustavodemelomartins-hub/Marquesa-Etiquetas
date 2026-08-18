/** Variações de um código: o aro do anel, o comprimento da corrente.
 *
 *  O que precisa ficar provado:
 *
 *   1. quem descobre as variações é a sincronização, lendo a loja
 *   2. repartir NÃO muda o total do código (§19: são dois atos diferentes)
 *   3. a soma das opções tem de bater com o estoque, e a recusa explica
 *   4. código COM variação exige dizer qual; código sem, não muda em nada
 *   5. o saldo por variação e o total do código continuam sendo a MESMA soma
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

const prod = async sku => (await api('GET', '/api/state')).produtos.find(p => p.sku === sku);

const loja = await subirLojaFalsa();

await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'ANEL', desc: 'Anel Solitário', cat: 'Anel', preco: 99, qtd: 6 },
    { sku: 'COLAR', desc: 'Colar simples, sem variação', cat: 'Colar', preco: 80, qtd: 4 },
  ],
});

loja.estado.produtos = [
  { id: 80, name: { pt: 'Anel Solitário' }, handle: { pt: 'anel' }, published: true,
    attributes: [{ pt: 'Aro' }],
    variants: [
      { id: 801, sku: 'ANEL', values: [{ pt: '16' }], inventory_levels: [{ location_id: 'L1', stock: 2 }] },
      { id: 802, sku: 'ANEL', values: [{ pt: '18' }], inventory_levels: [{ location_id: 'L1', stock: 3 }] },
      { id: 803, sku: 'ANEL', values: [{ pt: '20' }], inventory_levels: [{ location_id: 'L1', stock: 1 }] },
    ] },
  produtoFalso(81, [{ id: 811, sku: 'COLAR', estoque: 4 }]),
];

console.log('\n=== 1. a sincronização descobre e REPARTE sozinha ===');
/* Ninguém confirma nada: a loja já tem uma caixinha de estoque por
   variação, e é dela que sai a repartição inicial. */
let r = await api('POST', '/api/sync', { forcar: true });
const anel = await prod('ANEL');
eq('o anel passou a ter variações', (anel.variacoes || []).length, 3);
eq('com os nomes que a loja informou', anel.variacoes.map(v => v.nome).join(','), '16,18,20');
eq('e o nome do atributo', anel.variacoes[0].atributo, 'Aro');
eq('o colar continua sem variação nenhuma', (await prod('COLAR')).variacoes, 'undefined');

eq('o estoque foi repartido sem ninguém digitar',
  anel.variacoes.map(v => `${v.nome}:${v.qtd}`).join(' '), '16:2 18:3 20:1');
eq('não sobrou peça sem aro', anel.semVariacao, 0);
eq('e o total do código não mudou', anel.qtd, 6);
eq('a rodada relatou o que repartiu', (r.semeados || []).length, 1);

console.log('\n=== 2. semear NÃO desfaz o que já foi mexido ===');
/* O pior bug possível aqui seria a rodada da madrugada desfazer a correção
   feita à mão na véspera. */
await api('POST', '/api/produtos/ANEL/repartir', { distribuicao: { '16': 4, '18': 1, '20': 1 } });
r = await api('POST', '/api/sync', { forcar: true });
const anelB = await prod('ANEL');
eq('a correção à mão sobreviveu à sincronização',
  anelB.variacoes.map(v => `${v.nome}:${v.qtd}`).join(' '), '16:4 18:1 20:1');
eq('e a rodada não semeou de novo', (r.semeados || []).length, 0);

console.log('\n=== 3. a soma tem de bater com o estoque ===');
r = await api('POST', '/api/produtos/ANEL/repartir', { distribuicao: { '16': 2, '18': 2, '20': 1 } });
eq('5 não fecha com 6: recusou', !!r.erro, 'true');
eq('e explicou os dois números', /dá 5.*é 6/.test(r.erro), 'true');

console.log('\n=== 4. repartir não muda o total (§19) ===');
r = await api('POST', '/api/produtos/ANEL/repartir', { distribuicao: { '16': 2, '18': 3, '20': 1 } });
eq('agora foi', r.ok, 'true');
const anel2 = await prod('ANEL');
eq('o total continua 6 — repartir não é corrigir', anel2.qtd, 6);
eq('não sobrou nada sem aro', anel2.semVariacao, 0);
eq('e cada aro ficou com o seu', anel2.variacoes.map(v => `${v.nome}:${v.qtd}`).join(' '), '16:2 18:3 20:1');

console.log('\n=== 5. código com variação exige dizer qual ===');
r = await api('POST', '/api/produtos/ANEL/movimento', { tipo: 'venda', quantidade: 1 });
eq('venda sem aro é recusada', !!r.erro, 'true');
eq('e diz o motivo', /mais de uma opção/.test(r.erro), 'true');

r = await api('POST', '/api/produtos/ANEL/movimento', { tipo: 'venda', quantidade: 1, variacao: '99' });
eq('aro que não existe também é recusado', /não tem a opção/.test(r.erro), 'true');

console.log('\n=== 6. código SEM variação não muda em nada ===');
r = await api('POST', '/api/produtos/COLAR/movimento', { tipo: 'venda', quantidade: 1 });
eq('passa direto, sem perguntar nada', r.ok, 'true');
eq('e o estoque baixou', (await prod('COLAR')).qtd, 3);

console.log('\n=== 7. vender um aro baixa o aro E o total ===');
r = await api('POST', '/api/produtos/ANEL/movimento', { tipo: 'venda', quantidade: 1, variacao: '18' });
eq('a venda entrou', r.ok, 'true');
const anel3 = await prod('ANEL');
eq('o total foi de 6 para 5', anel3.qtd, 5);
eq('o aro 18 foi de 3 para 2', anel3.variacoes.find(v => v.nome === '18').qtd, 2);
eq('os outros aros não se mexeram',
  anel3.variacoes.filter(v => v.nome !== '18').map(v => v.qtd).join(','), '2,1');
eq('e continua sem sobra sem aro', anel3.semVariacao, 0);

console.log('\n=== 8. a razão fecha (§19) ===');
const conf = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos', conf.divergentes.length, 0);
/* A prova de que não há contabilidade paralela: a soma dos aros é o total. */
eq('a soma dos aros é exatamente o total do código',
  anel3.variacoes.reduce((s, v) => s + v.qtd, 0) + anel3.semVariacao, anel3.qtd);

console.log('\n=== 9. aro que sumiu da loja some daqui na rodada seguinte ===');
loja.estado.produtos[0].variants = loja.estado.produtos[0].variants.filter(v => v.values[0].pt !== '20');
await api('POST', '/api/sync', { forcar: true });
const anel4 = await prod('ANEL');
eq('sobraram dois aros', anel4.variacoes.map(v => v.nome).join(','), '16,18');
eq('o total do código não mudou por causa disso', anel4.qtd, 5);
/* A peça do aro 20 não sumiu do estoque — ela volta a ser "sem aro", que é
   honesto: existe, e agora não se sabe de que aro é. */
eq('a peça do aro que saiu volta a ficar sem aro', anel4.semVariacao, 1);

console.log('\n=== 10. cada variação volta para a caixinha dela na loja ===');
/* O ciclo fechado: vendeu o aro 18 aqui, a loja recebe menos NO ARO 18, e
   os outros aros ficam intactos. É o oposto do bug antigo, que escrevia o
   total do código inteiro numa variação só. */
/* Neste ponto sobraram dois aros na loja (o 20 saiu no bloco 9), o total do
   código é 5 e uma peça está "sem aro" — a que era do aro removido. */
const vAnel = loja.estado.produtos.find(p => p.id === 80).variants;
const estoqueDe = nome => vAnel.find(v => v.values[0].pt === nome).inventory_levels[0].stock;

r = await api('POST', '/api/sync', { forcar: true });
eq('a rodada terminou bem', r.ok, 'true');
const anelF = await prod('ANEL');
eq('o aro 16 na loja bate com o nosso', estoqueDe('16'), anelF.variacoes.find(v => v.nome === '16').qtd);
eq('o aro 18 na loja bate com o nosso', estoqueDe('18'), anelF.variacoes.find(v => v.nome === '18').qtd);
eq('nenhuma variação recebeu o total do código',
  vAnel.some(v => v.inventory_levels[0].stock === anelF.qtd), 'false');
/* A peça sem aro não é anunciada: melhor deixar de vender uma do que
   vender um aro que não existe. Ela volta ao ar assim que for atribuída. */
eq('a peça sem aro não foi anunciada em aro nenhum',
  vAnel.reduce((s, v) => s + v.inventory_levels[0].stock, 0), anelF.qtd - anelF.semVariacao);

console.log('\n=== 11. peça em maleta ainda segura o empurrão ===');
/* "Em casa" por aro dependeria de a maleta saber qual aro saiu. Enquanto
   ela não sabe, descontar do aro errado tiraria do ar uma peça que existe. */
const rev = await api('POST', '/api/revendedoras', { nome: 'Teste Variação' });
const mal = await api('POST', '/api/maletas', { revId: rev.id });
await api('POST', `/api/maletas/${mal.id}/itens`, { itens: { ANEL: 1 } });

r = await api('POST', '/api/sync', { forcar: true });
eq('a rodada terminou bem', r.ok, 'true');
if (!r.ok) console.log('    erro da rodada:', r.erro);
const segurado = (r.semEmpurrar || []).find(x => x.sku === 'ANEL');
eq('o anel saiu do empurrão enquanto tem peça na rua', !!segurado, 'true');
eq('e o motivo é a maleta, não a variação', segurado && segurado.motivo, 'maleta');

console.log('\n=== 12. soma da loja que não bate NÃO é repartida ===');
/* O cenário real que o freio pegou: a loja carrega a herança do bug antigo,
   com o total do código inteiro dentro da primeira variação. Repartir na
   ordem entupiria a primeira e zeraria as outras — reproduzindo o bug e
   ainda apagando os outros tamanhos na loja. */
await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'HERANCA', desc: 'Anel com a herança do bug', cat: 'Anel', preco: 70, qtd: 6 }],
});
loja.estado.produtos.push({
  id: 90, name: { pt: 'Anel com a herança do bug' }, handle: { pt: 'heranca' }, published: true,
  attributes: [{ pt: 'Aro' }],
  variants: [
    // 6 = o total do código inteiro, escrito aqui pelo bug antigo
    { id: 901, sku: 'HERANCA', values: [{ pt: '16' }], inventory_levels: [{ location_id: 'L1', stock: 6 }] },
    { id: 902, sku: 'HERANCA', values: [{ pt: '18' }], inventory_levels: [{ location_id: 'L1', stock: 2 }] },
    { id: 903, sku: 'HERANCA', values: [{ pt: '20' }], inventory_levels: [{ location_id: 'L1', stock: 1 }] },
  ],
});

r = await api('POST', '/api/sync', { forcar: true });
const her = await prod('HERANCA');
eq('a loja soma 9 e nós temos 6: não repartiu nada',
  her.variacoes.map(v => v.qtd).join(','), '0,0,0');
eq('as 6 peças continuam sem variação', her.semVariacao, 6);
eq('e a rodada disse por que não repartiu',
  (r.naoSemeados || []).some(x => x.sku === 'HERANCA' && x.somaLoja === 9 && x.total === 6), 'true');

/* E o mais importante: sem repartição, nada é empurrado — nenhum aro é
   zerado na loja. Era isso que o freio tinha barrado. */
const vHer = loja.estado.produtos.find(p => p.id === 90).variants;
eq('nenhum aro foi zerado na loja', vHer.map(v => v.inventory_levels[0].stock).join(','), '6,2,1');
const barrado = (r.semEmpurrar || []).find(x => x.sku === 'HERANCA');
eq('e o código ficou fora do empurrão', !!barrado, 'true');
eq('com o motivo certo', barrado.motivo, 'sem_reparticao');

console.log('\n=== 13. desfazer a repartição automática que não devia ter havido ===');
/* Repartição pela metade também não empurra: se sobram peças sem variação,
   as caixinhas somadas dariam menos do que existe, e a diferença sairia do
   ar como se a peça não existisse. */
await api('POST', '/api/produtos/HERANCA/repartir', { distribuicao: { '16': 3, '18': 2, '20': 1 } });
eq('repartido à mão, agora fecha', (await prod('HERANCA')).semVariacao, 0);

const desf = await api('POST', '/api/variacoes/desfazer-semeadura');
eq('o desfazer rodou', desf.ok, 'true');
/* HERANCA foi repartido à MÃO, então não pode ser desfeito por engano. */
eq('código corrigido à mão é preservado', (await prod('HERANCA')).semVariacao, 0);

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
