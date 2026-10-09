/** §63 — Loja online simplificada, pendências que são de gente, publicar
 *  um / selecionados / todos.
 *
 *  O Worker REAL (`api/src/index.js`), o schema REAL e a loja de mentira
 *  (`loja-falsa.mjs`), no mesmo processo — sem wrangler, sem chave, sem rede.
 *
 *    1  venda antiga sem variação NÃO vira pendência (vai para o histórico)
 *    2  estoque de hoje sem divisão por variação CONTINUA pendência
 *    3  venda em `revisao` (espelho do código) sai; venda com erro fica
 *    4  maleta sem variação aparece UMA vez (pela maleta), não duas
 *    5  oculto intencional não é alerta; publicado-e-escondido é
 *    6  publicar UM, revalidado na loja, e lendo só aquele código
 *    7  lote: o que mudou no meio é pulado; os outros publicam
 *    8  nada fica visível antes do clique
 *    9  a prévia do anúncio só lê
 *    10 conferir só lê; reconciliar escreve só o divergente
 *    11 o resumo da fila diz o MOTIVO da revisão
 *    +  razão fechando; nenhuma venda nem movimento criado por ler pendências
 *
 *      node src/loja-online-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.log('  --   node:sqlite indisponível nesta versão do Node — teste NÃO rodou');
  process.exit(0);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON;');
raw.exec(readFileSync(join(raiz, 'api/schema.sql'), 'utf8'));

let consultas = 0;
const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run, executar: st.executar });
  st.bind = (...a) => comArgs(a.map((v) => (v === undefined ? null : v)));
  st.first = async function (col) { consultas += 1; const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { consultas += 1; return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { consultas += 1; const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0) } }; };
  st.executar = function () {
    const r = raw.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0) } };
  };
  return st;
};
const DB = {
  prepare: preparar,
  async batch(stmts) {
    consultas += 1;
    raw.exec('SAVEPOINT lote');
    try {
      const s = stmts.map((x) => x.executar());
      raw.exec('RELEASE lote');
      return s;
    } catch (e) {
      raw.exec('ROLLBACK TO lote'); raw.exec('RELEASE lote');
      throw e;
    }
  },
};

const loja = await subirLojaFalsa(8824);
const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const env = {
  DB, API_KEY: 'k',
  NUVEMSHOP_STORE_ID: '123', NUVEMSHOP_TOKEN: 'token-falso',
  NUVEMSHOP_BASE: loja.url, NUVEMSHOP_WRITES_ENABLED: 'true',
};
let pendentes = [];
const ctx = { waitUntil(p) { pendentes.push(p); }, passThroughOnException() {} };
const esperarFundo = async () => { const p = pendentes; pendentes = []; await Promise.all(p); };
const api = async (metodo, caminho, corpo) => {
  consultas = 0;
  const r = await worker.fetch(new Request(`http://local${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env, ctx);
  const n = consultas;
  await esperarFundo();
  return { status: r.status, corpo: await r.json().catch(() => null), consultas: n };
};
const cron = async () => { await worker.scheduled({ cron: '*/10 * * * *' }, env, ctx); await esperarFundo(); };

const q1 = (sql, ...a) => raw.prepare(sql).get(...a);
const qa = (sql, ...a) => raw.prepare(sql).all(...a);
let provas = 0;
const prova = (t, extra = '') => { provas += 1; console.log(`  ok   ${t}${extra ? '  → ' + extra : ''}`); };
const razaoFecha = () => qa(`SELECT p.sku FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m
  ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.s, 0)`).length === 0;
const produtoDaLoja = (sku) => loja.estado.produtos.find((p) => (p.variants || []).some((v) => v.sku === sku));
const estoqueVariante = (v) => (v.inventory_levels ? v.inventory_levels[0].stock : v.stock);

/* ── o catálogo: toda quantidade nasce de movimento ─────────────────── */
const peca = (sku, qtd, desc, cat = 'Anel', preco = 79) => {
  raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, ?, ?, ?, 'ativo')").run(sku, desc, cat, preco, qtd);
  if (qtd) raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem) VALUES (?, 'entrada', ?, 'importacao')").run(sku, qtd);
};
const mov = (sku, tipo, qtd, variacao = null, vid = null, vendaId = null) => {
  raw.prepare('INSERT INTO movimentos (sku, tipo, qtd, origem, variacao, variante_id, venda_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(sku, tipo, qtd, tipo === 'venda' ? 'balcao' : 'inventario', variacao, vid, vendaId);
  raw.prepare('UPDATE produtos SET qtd = qtd + ? WHERE sku = ?').run(qtd, sku);
};
const repartir = (sku, nome, n, vid) => { mov(sku, 'ajuste', -n); mov(sku, 'ajuste', n, nome, vid); };
const variacaoDaLoja = (sku, pid, lista) => lista.forEach(([nome, vid], i) => raw.prepare(
  `INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, produto_id, ordem, valores_json, origem)
   VALUES (?, ?, 'Tamanho', ?, ?, ?, ?, 'loja')`).run(sku, nome, vid, String(pid), i, JSON.stringify([{ atributo: 'Tamanho', valor: nome }])));
const vendaAntiga = (sku, status = 'sincronizada', variacao = null, vid = null) => {
  const r = raw.prepare(`INSERT INTO vendas (cliente_nome, origem, data, total, nuvemshop_status, nuvemshop_erro)
    VALUES ('Andreia', 'balcao', '2026-08-22', 79, ?, ?)`).run(status, status === 'erro' ? 'a loja recusou' : null);
  const id = Number(r.lastInsertRowid);
  raw.prepare(`INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, variacao, variante_id, id) VALUES (?, ?, 'x', 1, 79, ?, ?, ?)`)
    .run(id, sku, variacao, vid, `item-${id}`);
  mov(sku, 'venda', -1, variacao, vid, id);
  return id;
};

const completo = (p, imagens = ['http://cdn/foto.jpg']) => ({
  ...p, visibility: 'hidden', published: false,
  description: { pt: '<p>Texto revisado.</p>' }, seo_title: { pt: 'Título | Marquesa' },
  seo_description: { pt: 'Meta description revisada à mão para a peça, com tamanho bom.' },
  categories: [{ id: 12, name: { pt: 'Anel' } }], tags: 'anel,dourado', attributes: [],
  images: imagens.map((src, i) => ({ id: 700 + i, src })),
});
loja.estado.categorias = [{ id: 12, name: { pt: 'Anel' }, parent: 0 }];

// três ocultos completos: candidatos a "pronto"
for (const [i, sku] of ['R1', 'R2', 'R3'].entries()) {
  peca(sku, 2, `Anel Pronto ${sku} Banho de Ouro 18k`);
  loja.estado.produtos.push(completo(produtoFalso(100 + i, [{ id: 1000 + i, sku, estoque: 2 }])));
  loja.estado.produtos.at(-1).variants[0].price = '79.00';
  raw.prepare('UPDATE produtos SET produto_id_loja = ?, url_loja = ? WHERE sku = ?').run(String(100 + i), `r-${i}`, sku);
}
// V1: aros 16/18 repartidos 2/2; depois uma venda ANTIGA sem dizer o aro → hoje 3 peças, divisão incerta
peca('V1', 4, 'Anel Variado Um Banho de Ouro 18k');
variacaoDaLoja('V1', 200, [['16', '2001'], ['18', '2002']]);
repartir('V1', '16', 2, '2001'); repartir('V1', '18', 2, '2002');
const vendaV1 = vendaAntiga('V1');
// V2: a venda antiga sem aro aconteceu ANTES da repartição; o saldo de hoje é conhecido (1/1)
peca('V2', 3, 'Anel Variado Dois Banho de Ouro 18k');
variacaoDaLoja('V2', 201, [['16', '2011'], ['18', '2012']]);
const vendaV2 = vendaAntiga('V2');
repartir('V2', '16', 1, '2011'); repartir('V2', '18', 1, '2012');
// V3: repartido, uma peça numa maleta aberta sem dizer o aro
peca('V3', 2, 'Anel Variado Três Banho de Ouro 18k');
variacaoDaLoja('V3', 202, [['16', '2021'], ['18', '2022']]);
repartir('V3', '16', 1, '2021'); repartir('V3', '18', 1, '2022');
raw.prepare("INSERT INTO revendedoras (id, nome) VALUES (1, 'Luciana')").run();
raw.prepare("INSERT INTO maletas (id, rev_id, status, aberta_em) VALUES (1, 1, 'aberta', '2026-09-26')").run();
raw.prepare("INSERT INTO maleta_itens (maleta_id, sku, qtd, devolvida) VALUES (1, 'V3', 1, 0)").run();
/* uma venda em `revisao` (espelho do código) e uma com erro de verdade —
   num código que CONTINUA em revisão (V1); num código sincronizado o cron
   as regulariza sozinho (`regularizarVendasStmt`), e isso é o certo. */
const vendaRevisao = vendaAntiga('V1', 'revisao', '16', '2001');
const vendaErro = vendaAntiga('V1', 'erro', '18', '2002');
loja.estado.produtos.push(
  { ...produtoFalso(200, [{ id: 2001, sku: 'V1', estoque: 2 }, { id: 2002, sku: 'V1', estoque: 2 }]), visibility: 'visible' },
  { ...produtoFalso(201, [{ id: 2011, sku: 'V2', estoque: 1 }, { id: 2012, sku: 'V2', estoque: 1 }]), visibility: 'visible' },
  { ...produtoFalso(202, [{ id: 2021, sku: 'V3', estoque: 1 }, { id: 2022, sku: 'V3', estoque: 1 }]), visibility: 'visible' },
);
for (const [sku, pid] of [['V1', 200], ['V2', 201], ['V3', 202]]) {
  raw.prepare('UPDATE produtos SET produto_id_loja = ?, url_loja = ? WHERE sku = ?').run(String(pid), `v-${pid}`, sku);
}
raw.prepare(`INSERT INTO config (chave, valor) VALUES ('syncCorteEm', ?), ('nuvemshopSyncAtivo', 'true'), ('nuvemshopCatalogoAtivo', 'true')`)
  .run(JSON.stringify('2026-10-08T16:30:57.000Z'));
assert.ok(razaoFecha());

await api('POST', '/api/nuvemshop/estoque/conferir');
await cron();

console.log('\n=== 1-4. Pendências: só o que é de gente ===');
const vendasAntes = q1('SELECT COUNT(*) n FROM vendas').n;
const movsAntes = q1('SELECT COUNT(*) n FROM movimentos').n;
let p = await api('GET', '/api/pendencias');
assert.equal(p.status, 200);
const chaves = p.corpo.pendencias.map((x) => x.chave);
assert.ok(!chaves.some((c) => c.startsWith('venda_variacao:')), chaves.join(', '));
assert.deepEqual(p.corpo.historico.itens.map((x) => x.vendaId).sort(), [vendaV1, vendaV2].sort());
assert.equal(p.corpo.historico.vendasSemVariacao, 2);
prova('1  venda antiga sem variação NÃO é pendência; fica no histórico técnico', `${p.corpo.historico.vendasSemVariacao} vendas`);

const v1 = p.corpo.pendencias.find((x) => x.chave === 'variacao:V1');
assert.ok(v1, 'V1 sem divisão confiável tem de continuar pendência');
assert.equal(v1.motivo, 'sem_reparticao');
assert.equal(v1.titulo, 'Conferir estoque por variação');
assert.doesNotMatch(v1.explicacao, /venda/i);
assert.ok(!chaves.includes('variacao:V2'), 'V2 tem saldo conhecido');
prova('2  estoque de HOJE sem divisão continua pendência — e o texto fala de contar, não da venda', v1.explicacao);

assert.ok(!chaves.includes(`nuvemshop:${vendaRevisao}`));
assert.ok(chaves.includes(`nuvemshop:${vendaErro}`));
prova('3  venda em revisão (espelho do código) saiu; venda com erro de envio continua');

assert.ok(chaves.includes('maleta_variacao:1:V3'));
assert.ok(!chaves.includes('variacao:V3'), 'a mesma peça em maleta não pode aparecer duas vezes');
prova('4  maleta sem variação aparece uma vez, pela maleta (que tem a resposta)');

assert.equal(p.corpo.resumo.total, p.corpo.pendencias.filter((x) => x.status === 'aberta').length);
assert.equal(q1('SELECT COUNT(*) n FROM vendas').n, vendasAntes);
assert.equal(q1('SELECT COUNT(*) n FROM movimentos').n, movsAntes);
assert.equal(q1(`SELECT variacao FROM venda_itens WHERE venda_id = ?`, vendaV1).variacao, null);
prova('ler pendências não cria venda, nem movimento, nem reescreve a venda antiga');

console.log('\n=== 5. oculto intencional × fora do ar inesperado ===');
let fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
const sit = (sku) => fila.itens.find((x) => x.sku === sku);
assert.deepEqual(['R1', 'R2', 'R3'].map((s) => sit(s).situacao), ['pronto', 'pronto', 'pronto'],
  JSON.stringify(['R1', 'R2', 'R3'].map((s) => sit(s).nuvemshop?.pendencias)));
assert.ok(['R1', 'R2', 'R3'].every((s) => sit(s).nuvemshop.foraDoArInesperado === false));
prova('5  três ocultos completos são "pronto" — nenhum é alerta de "fora do ar"');

console.log('\n=== 8. nada fica visível antes do clique ===');
await cron();
await api('POST', '/api/nuvemshop/estoque/conferir');
assert.ok(['R1', 'R2', 'R3'].every((s) => produtoDaLoja(s).visibility === 'hidden'));
prova('8  rodadas de cron e conferência não publicam nada');

console.log('\n=== 9. a prévia do anúncio só lê ===');
const escritasAntes = JSON.stringify([loja.estado.atualizacoes || [], loja.estado.escritas, loja.estado.criacoes || 0]);
const an = await api('GET', '/api/nuvemshop/catalogo/R1/anuncio');
assert.equal(an.status, 200, JSON.stringify(an.corpo));
assert.equal(an.corpo.visibilidade, 'hidden');
assert.equal(an.corpo.seoTitulo, 'Título | Marquesa');
assert.deepEqual(an.corpo.tags, ['anel', 'dourado']);
assert.deepEqual(an.corpo.categorias, ['Anel']);
assert.equal(an.corpo.imagens.length, 1);
assert.equal(an.corpo.variantes[0].preco, 79);
assert.deepEqual(an.corpo.faltam, []);
assert.equal(JSON.stringify([loja.estado.atualizacoes || [], loja.estado.escritas, loja.estado.criacoes || 0]), escritasAntes);
prova('9  prévia: nome, SEO, tags, categoria, fotos e variantes lidos da loja; nenhuma escrita');

console.log('\n=== 6-7. publicar um e o lote ===');
let r = await api('POST', '/api/nuvemshop/catalogo/R1/publicar', { por: 'Preparação para Nuvemshop' });
assert.equal(r.status, 200, JSON.stringify(r.corpo));
assert.equal(r.corpo.confirmadoPelaLoja, true);
assert.equal(produtoDaLoja('R1').visibility, 'visible');
assert.ok(r.consultas <= 30, `publicar leu o D1 ${r.consultas} vezes`);
prova('6  publicar UM: hidden → visible, confirmado; leitura só daquele código', `${r.consultas} consultas ao D1`);

/* O lote é uma sequência de publicações individuais (frontend `lote.ts`).
   R2 MUDOU desde a lista: alguém tirou a foto do anúncio na Nuvemshop. */
produtoDaLoja('R2').images = [];
const resultado = { publicados: [], pulados: [] };
for (const sku of ['R2', 'R3']) {
  const x = await api('POST', `/api/nuvemshop/catalogo/${sku}/publicar`, { por: 'lote' });
  if (x.status === 200) resultado.publicados.push(sku);
  else resultado.pulados.push({ sku, status: x.status, faltam: x.corpo.faltam });
}
assert.deepEqual(resultado.publicados, ['R3']);
assert.deepEqual(resultado.pulados, [{ sku: 'R2', status: 409, faltam: ['foto'] }]);
assert.equal(produtoDaLoja('R2').visibility, 'hidden');
assert.equal(produtoDaLoja('R3').visibility, 'visible');
prova('7  lote: R2 mudou (sem foto) e foi PULADO com o motivo; R3 publicou mesmo assim');

console.log('\n=== 5b. publicado por aqui e escondido depois ===');
produtoDaLoja('R1').visibility = 'hidden';
await api('POST', '/api/nuvemshop/estoque/conferir');
fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
assert.equal(sit('R1').nuvemshop.foraDoArInesperado, true);
assert.equal(sit('R2').nuvemshop.foraDoArInesperado, false);
prova('5  R1 (publicado aqui, escondido lá) é alerta; R2 (nunca publicado) não é');

console.log('\n=== 10. conferir lê; reconciliar escreve só o divergente ===');
{
  const v = produtoDaLoja('R3').variants[0];
  if (v.inventory_levels) v.inventory_levels[0].stock = 7; else v.stock = 7;
}
const patchesAntes = loja.estado.escritas.length;
r = await api('POST', '/api/nuvemshop/estoque/conferir');
assert.equal(r.status, 200);
assert.equal(loja.estado.escritas.length, patchesAntes, 'conferir não pode escrever na loja');
const resumo = (await api('GET', '/api/nuvemshop/estoque')).corpo;
assert.ok(resumo.conferencia.divergentes >= 1);
assert.ok(resumo.divergentes.some((d) => d.sku === 'R3'));
prova('10 conferir achou R3 divergente (loja 7) sem nenhum PATCH');
r = await api('POST', '/api/nuvemshop/estoque/reconciliar', {});
assert.equal(r.status, 200);
assert.ok(loja.estado.escritas.length > patchesAntes);
assert.equal(estoqueVariante(produtoDaLoja('R3').variants[0]), 2);
assert.ok(loja.estado.escritas.slice(patchesAntes).some((e) => e.id === 102), 'R3 (produto 102) tinha de receber a escrita');
assert.ok(!loja.estado.escritas.slice(patchesAntes).some((e) => e.id === 200),
  'V1 (sem divisão segura) não pode receber escrita');
prova('10 reconciliar escreveu o saldo daqui em R3; V1 ficou de fora');

console.log('\n=== 11. o resumo da fila diz o motivo ===');
const probs = resumo.problemas.filter((x) => x.status === 'revisao');
assert.equal(probs.find((x) => x.sku === 'V1')?.motivoRevisao, 'sem_reparticao');
assert.equal(probs.find((x) => x.sku === 'V3')?.motivoRevisao, 'maleta');
prova('11 revisão vem com o motivo (sem_reparticao, maleta) para a Visão geral agrupar');

assert.ok(razaoFecha());
prova('razão: produtos.qtd == SUM(movimentos.qtd) para todo código');

await loja.fechar?.();
console.log(`\n${provas} provas — §63 Loja online ok`);
process.exit(0);
