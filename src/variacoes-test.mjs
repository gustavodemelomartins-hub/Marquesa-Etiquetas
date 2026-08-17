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

console.log('\n=== 1. a sincronização descobre as variações sozinha ===');
await api('POST', '/api/sync', { forcar: true });
const anel = await prod('ANEL');
eq('o anel passou a ter variações', (anel.variacoes || []).length, 3);
eq('com os nomes que a loja informou', anel.variacoes.map(v => v.nome).join(','), '16,18,20');
eq('e o nome do atributo', anel.variacoes[0].atributo, 'Aro');
eq('o colar continua sem variação nenhuma', (await prod('COLAR')).variacoes, 'undefined');

console.log('\n=== 2. antes de repartir, tudo está "sem aro" ===');
eq('o total do anel continua 6', anel.qtd, 6);
eq('e as 6 peças ainda não têm aro', anel.semVariacao, 6);
eq('nenhum aro tem saldo ainda', anel.variacoes.map(v => v.qtd).join(','), '0,0,0');

console.log('\n=== 3. a soma tem de bater com o estoque ===');
let r = await api('POST', '/api/produtos/ANEL/repartir', { distribuicao: { '16': 2, '18': 2, '20': 1 } });
eq('5 não fecha com 6: recusou', !!r.erro, 'true');
eq('e explicou os dois números', /dá 5.*é 6/.test(r.erro), 'true');
eq('sem ter mexido em nada', (await prod('ANEL')).semVariacao, 6);

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

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
