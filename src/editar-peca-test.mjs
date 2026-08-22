/** A1 — a quantidade de cada variação se edita em "Editar peça".
 *
 *  Até a FASE 2 havia UM lugar para dizer quanto vai em cada variação:
 *  Pendências. Isso resolvia a exceção e deixava a rotina sem casa — quem
 *  já sabe que tem 2 verdes, 3 vermelhos e 1 laranja tinha de esperar o
 *  produto cair numa fila de revisão para poder digitar isso.
 *
 *  As duas telas continuam existindo, e a diferença entre elas não é de
 *  layout — é de PERGUNTA:
 *
 *    Pendências   — "como se reparte ESTE total?" A soma tem de fechar com
 *                   o estoque do código, e sobrar ou faltar peça é sinal de
 *                   que o total é que está errado. Continua estrito.
 *    Editar peça  — "quantas de cada eu tenho?" O total do código é a SOMA,
 *                   e a diferença vira um movimento de `ajuste` explícito.
 *
 *  O que precisa ficar provado:
 *
 *   1. sem `ajustarTotal`, a recusa da FASE 2 continua igual (409);
 *   2. com `ajustarTotal`, a soma passa a ser o total — e por MOVIMENTO,
 *      nunca por saldo digitado;
 *   3. a diferença fica rastreável: um `ajuste` com obs dizendo de quanto
 *      para quanto;
 *   4. o vínculo é por `variante_id`: a loja pode renomear a variação que o
 *      saldo não se mexe;
 *   5. quantidade negativa é recusada;
 *   6. `produtos.qtd == SUM(movimentos.qtd)` continua valendo o tempo todo;
 *   7. `sem_reparticao` continua bloqueando a escrita na loja quando de
 *      fato ninguém repartiu nada.
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
}).then(async r => ({ status: r.status, corpo: await r.json() }));

const json = async (m, p, b) => (await api(m, p, b)).corpo;
const prod = async sku => (await json('GET', '/api/state')).produtos.find(p => p.sku === sku);
const estrutura = sku => json('GET', `/api/produtos/${sku}/variacoes`);
const saldoDe = (e, vid) => (e.variacoes.find(v => String(v.varianteId) === String(vid)) || {}).saldo;

async function razaoFecha(titulo) {
  const r = await json('GET', '/api/estoque/conferir');
  const furos = (r.divergencias || r.itens || r || []).length ?? 0;
  eq(titulo, furos, 0);
}

const loja = await subirLojaFalsa();

/* ------------------------------------------------------------- o cenário
   COLARV — três cores na loja, TODAS zeradas lá e aqui. É o caso do
   pedido: a janela mostrava "aqui: 0" três vezes e não deixava mexer.
   COLARX — duas variações e um total que a loja não confirma: continua
   sendo caso de Pendências, e tem de continuar bloqueando a escrita.     */
await json('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'COLARV', desc: 'Colar de cores', cat: 'Colar', preco: 90, qtd: 0 },
    { sku: 'COLARX', desc: 'Colar dois tamanhos', cat: 'Colar', preco: 70, qtd: 5 },
  ],
});

const corVariante = (id, valor, estoque) => ({
  id, sku: 'COLARV', values: [{ pt: valor }],
  inventory_levels: [{ location_id: 'L1', stock: estoque }],
});

loja.estado.produtos = [
  {
    id: 50, name: { pt: 'Colar de cores' }, handle: { pt: 'colar-cores' }, published: true,
    attributes: [{ pt: 'Cor' }], images: [],
    variants: [corVariante(501, 'Verde', 0), corVariante(502, 'Vermelho', 0), corVariante(503, 'Laranja', 0)],
  },
  produtoFalso(60, [
    { id: 601, sku: 'COLARX', estoque: 1 },
    { id: 602, sku: 'COLARX', estoque: 1 },
  ]),
];

await json('POST', '/api/loja/variantes/importar', {});

console.log('\n=== 1. a janela mostra as três variações, todas em zero ===');
let e = await estrutura('COLARV');
eq('três linhas', e.variacoes.length, 3);
eq('cada uma com o id da loja', e.variacoes.map(v => v.varianteId).join(','), '501,502,503');
eq('e todas zeradas aqui', e.variacoes.map(v => v.saldo).join(','), '0,0,0');
eq('o total do código também', e.qtd, 0);

console.log('\n=== 2. sem ajustarTotal, a recusa da FASE 2 continua igual ===');
/* É a regra de Pendências, e ela não pode ter afrouxado de lado: repartir e
   corrigir o total são atos diferentes (§19). */
let r = await api('POST', '/api/produtos/COLARV/variacoes/distribuir', {
  distribuicao: [
    { varianteId: '501', qtd: 2 }, { varianteId: '502', qtd: 3 }, { varianteId: '503', qtd: 1 },
  ],
});
eq('recusou', r.status, 409);
eq('e disse os dois números', `${r.corpo.soma}/${r.corpo.total}`, '6/0');
eq('nada foi gravado', (await prod('COLARV')).qtd, 0);

console.log('\n=== 3. com ajustarTotal, a soma vira o total ===');
r = await api('POST', '/api/produtos/COLARV/variacoes/distribuir', {
  distribuicao: [
    { varianteId: '501', qtd: 2 }, { varianteId: '502', qtd: 3 }, { varianteId: '503', qtd: 1 },
  ],
  ajustarTotal: true,
  obs: 'Quantidades por variação salvas em "Editar peça" (COLARV)',
});
eq('aceitou', r.status, 200);
eq('o total foi de 0 para 6', `${r.corpo.totalAjustado.de}→${r.corpo.totalAjustado.para}`, '0→6');
eq('e o produto ficou com 6', (await prod('COLARV')).qtd, 6);

e = await estrutura('COLARV');
eq('Verde ficou com 2', saldoDe(e, 501), 2);
eq('Vermelho com 3', saldoDe(e, 502), 3);
eq('Laranja com 1', saldoDe(e, 503), 1);
eq('e não sobrou peça sem variação', e.saldoSemVariacao, 0);
await razaoFecha('a razão fecha depois de gravar');

console.log('\n=== 4. a mudança é rastreável, não um saldo que mudou sozinho ===');
const mov = await json('GET', '/api/estoque/COLARV/movimentos');
const ajusteTotal = mov.movimentos.filter(m => m.origem === 'variacao' && /passa de 0 para 6/.test(m.obs || ''));
eq('existe UM movimento explicando o total novo', ajusteTotal.length, 1);
eq('e ele vale exatamente a diferença', ajusteTotal[0].qtd, 6);
eq('nenhum movimento é de tipo desconhecido',
  mov.movimentos.every(m => ['entrada', 'ajuste'].includes(m.tipo)), 'true');
eq('cada variação tem movimento com o id dela, não só o nome',
  mov.movimentos.filter(m => m.variante_id).map(m => m.variante_id).sort().join(','),
  '501,502,503');

console.log('\n=== 5. quantidade negativa é recusada ===');
r = await api('POST', '/api/produtos/COLARV/variacoes/distribuir', {
  distribuicao: [{ varianteId: '501', qtd: -1 }, { varianteId: '502', qtd: 3 }, { varianteId: '503', qtd: 1 }],
  ajustarTotal: true,
});
eq('recusou', r.status, 400);
eq('e nomeou a variação', /Verde/.test(r.corpo.erro), 'true');
eq('o estoque não mudou', (await prod('COLARV')).qtd, 6);

console.log('\n=== 6. a loja renomeia a variação e o saldo não se mexe ===');
/* Nome é dado da loja e muda sozinho. Identidade é o variant_id — se o
   saldo andasse junto com o nome, um "Verde" virando "Verde Água" faria
   duas peças físicas sumirem do lugar certo. */
loja.estado.produtos[0].variants[0].values = [{ pt: 'Verde Água' }];
await json('POST', '/api/loja/variantes/importar', {});
const naLoja = await json('GET', '/api/loja/variantes/COLARV');
eq('a loja passou a chamar de outro jeito',
  naLoja.variantes.find(v => v.varianteId === '501').nome, 'Verde Água');
e = await estrutura('COLARV');
eq('o saldo continua na MESMA caixinha', saldoDe(e, 501), 2);
eq('e o total do código não se mexeu', e.qtd, 6);

console.log('\n=== 7. editar de novo, agora para baixo ===');
r = await api('POST', '/api/produtos/COLARV/variacoes/distribuir', {
  distribuicao: [{ varianteId: '501', qtd: 1 }, { varianteId: '502', qtd: 1 }, { varianteId: '503', qtd: 1 }],
  ajustarTotal: true,
});
eq('aceitou', r.status, 200);
eq('o total foi de 6 para 3', `${r.corpo.totalAjustado.de}→${r.corpo.totalAjustado.para}`, '6→3');
e = await estrutura('COLARV');
eq('cada uma com 1', e.variacoes.map(v => v.saldo).join(','), '1,1,1');
eq('e nada solto', e.saldoSemVariacao, 0);
await razaoFecha('a razão fecha depois de reduzir');

console.log('\n=== 8. salvar o mesmo número duas vezes não inventa movimento ===');
const antes = (await json('GET', '/api/estoque/COLARV/movimentos')).movimentos.length;
r = await api('POST', '/api/produtos/COLARV/variacoes/distribuir', {
  distribuicao: [{ varianteId: '501', qtd: 1 }, { varianteId: '502', qtd: 1 }, { varianteId: '503', qtd: 1 }],
  ajustarTotal: true,
});
eq('aceitou', r.status, 200);
eq('e disse que já estava assim', r.corpo.jaEstava, 'true');
eq('sem gravar movimento nenhum',
  (await json('GET', '/api/estoque/COLARV/movimentos')).movimentos.length, antes);

console.log('\n=== 9. sem_reparticao continua bloqueando quem não foi repartido ===');
/* COLARX tem 5 aqui e a loja mostra 1+1. A soma não bate, então a
   sincronização não confia na repartição de lá — e não escreve nada. */
const rev = await json('GET', '/api/variacoes/revisao');
const x = (rev.itens || []).find(i => i.sku === 'COLARX');
eq('COLARX está na fila de revisão', !!x, 'true');
eq('pelo motivo certo', x && x.motivo, 'sem_reparticao');
eq('e COLARV saiu da fila depois de editado',
  (rev.itens || []).some(i => i.sku === 'COLARV'), 'false');

const escritasAntes = loja.estado.escritas.length;
await json('POST', '/api/sync', { forcar: true });
const tocouX = loja.estado.escritas.slice(escritasAntes)
  .some(w => String(w.url || '').includes('/60/') || String(JSON.stringify(w)).includes('60'));
eq('a sincronização não escreveu na caixinha do COLARX', tocouX, 'false');
eq('e o COLARX continua com o estoque dele intacto', (await prod('COLARX')).qtd, 5);

console.log('\n=== 10. a razão fecha no fim de tudo (§19) ===');
await razaoFecha('saldo bate com a soma dos movimentos em todo SKU');

await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
