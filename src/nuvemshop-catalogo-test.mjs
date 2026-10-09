/** §62 — Catálogo oculto na Nuvemshop: cadastrar (hidden) ≠ publicar (visible).
 *
 *  O Worker REAL (`api/src/index.js`), o schema REAL e a loja de mentira
 *  (`loja-falsa.mjs`), no mesmo processo — sem wrangler, sem chave, sem rede.
 *
 *  Os 14 casos do pedido de 09/10/2026, na ordem:
 *
 *    1  produto sem foto é criado como hidden
 *    2  hidden não aparece na vitrine pública (404)
 *    3  descrição e SEO sobem com ele, e ele continua hidden
 *    4  variantes criadas corretamente (atributo, valores, saldo de cada uma)
 *    5  variante/produto que já existe na loja é MAPEADO, não duplicado
 *    6  produto hidden participa do envio de estoque (§61)
 *    7  foto adicionada depois: sobe, e o produto continua hidden
 *    8  tudo completo → "pronto" na Preparação
 *    9  publicar (clique) → visible, confirmado pela releitura
 *    10 variante com saldo incerto bloqueia o visible
 *    11 reprocessar a criação não duplica (nem depois de o Worker morrer)
 *    12 falha da API: erro registrado, a rodada seguinte cria uma vez só
 *    13 produto que já existia não perde SEO, imagens, nome nem visibilidade
 *    14 os códigos já mapeados continuam iguais na conferência
 *    +  kill switch, API que ignora `visibility`, variante única com estoque
 *       repartido aqui (o caso 391471)
 *
 *      node src/nuvemshop-catalogo-test.mjs
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

const loja = await subirLojaFalsa(8823);
const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const est = await import(pathToFileURL(join(raiz, 'api/src/nuvemshop-estoque.js')).href);
const FOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const env = {
  DB, API_KEY: 'k',
  NUVEMSHOP_STORE_ID: '123', NUVEMSHOP_TOKEN: 'token-falso',
  NUVEMSHOP_BASE: loja.url, NUVEMSHOP_WRITES_ENABLED: 'true',
  FOTOS: {
    async get(k) { return k ? { body: FOTO, httpMetadata: { contentType: 'image/jpeg' }, size: FOTO.length } : null; },
    async put() {}, async delete() {},
  },
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
const cron = async (expr = '*/10 * * * *') => {
  consultas = 0;
  await worker.scheduled({ cron: expr }, env, ctx);
  await esperarFundo();
  return consultas;
};
const vitrine = async (handle) => (await fetch(`${loja.url}/vitrine/produtos/${handle}`)).status;

const q1 = (sql, ...a) => raw.prepare(sql).get(...a);
const qa = (sql, ...a) => raw.prepare(sql).all(...a);
let provas = 0;
const prova = (t, extra = '') => { provas += 1; console.log(`  ok   ${t}${extra ? '  → ' + extra : ''}`); };

const produtoDaLoja = (sku) => loja.estado.produtos.find((p) => (p.variants || []).some((v) => v.sku === sku));
const estoqueVariante = (v) => (v.inventory_levels ? v.inventory_levels[0].stock : v.stock);
const linhaCat = (sku) => q1('SELECT * FROM nuvemshop_catalogo WHERE sku = ?', sku);
const razaoFecha = () => qa(`SELECT p.sku FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m
  ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.s, 0)`).length === 0;

/* ── o catálogo daqui: toda quantidade nasce de movimento ─────────────── */
const peca = (sku, qtd, desc, cat = 'Brinco', preco = 59) => {
  raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, ?, ?, ?, 'ativo')").run(sku, desc, cat, preco, qtd);
  if (qtd) raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem) VALUES (?, 'entrada', ?, 'importacao')").run(sku, qtd);
};
const variacaoLocal = (sku, nome, valores, ordem = 0) => raw.prepare(
  `INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem)
   VALUES (?, ?, ?, ?, ?, ?, 'local')`).run(sku, nome, valores.map((x) => x.atributo).join(' · '),
  `local:${sku}-${ordem}`, ordem, JSON.stringify(valores));
const repartir = (sku, nome, n, vid) => {
  raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, variacao, variante_id) VALUES (?, 'ajuste', ?, 'inventario', NULL, NULL)").run(sku, -n);
  raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, variacao, variante_id) VALUES (?, 'ajuste', ?, 'inventario', ?, ?)").run(sku, n, nome, vid);
};

// já publicados e mapeados
peca('EX1', 4, 'Colar Existente Banho de Ouro 18k', 'Colar', 129);
peca('EX2', 2, 'Pulseira Existente Banho de Ouro 18k', 'Pulseira', 89);
// sem anúncio
peca('N1', 3, 'Brinco Infantil Coração Banho de Ouro 18k', 'Brinco', 59);
peca('N2', 3, 'Anel Teste Liso Banho de Ouro 18k', 'Anel', 79);
variacaoLocal('N2', 'nº16', [{ atributo: 'Tamanho', valor: 'nº16' }], 0);
variacaoLocal('N2', 'nº18', [{ atributo: 'Tamanho', valor: 'nº18' }], 1);
repartir('N2', 'nº16', 1, 'local:N2-0');
repartir('N2', 'nº18', 2, 'local:N2-1');
peca('N3', 2, 'Anel Incerto Banho de Ouro 18k', 'Anel', 79);
variacaoLocal('N3', 'nº15', [{ atributo: 'Tamanho', valor: 'nº15' }], 0);
variacaoLocal('N3', 'nº17', [{ atributo: 'Tamanho', valor: 'nº17' }], 1);
peca('N4', 1, 'Pulseira Sem Preço Banho de Ouro 18k', 'Pulseira', null);
peca('N5', 2, 'Brinco Infantil Flor Banho de Ouro 18k', 'Brinco', 59);
variacaoLocal('N5', 'Azul', [{ atributo: 'Tamanho', valor: 'Azul' }], 0);
peca('ADOT1', 1, 'Brinco Já Na Loja Banho de Ouro 18k', 'Brinco', 49);
// anúncio com 2 variantes; aro novo criado aqui; código em revisão (sem repartir)
peca('M1', 3, 'Anel Multi Banho de Ouro 18k', 'Anel', 99);
variacaoLocal('M1', 'Banho de Ouro 18K · nº17', [{ atributo: 'Cor', valor: 'Banho de Ouro 18K' }, { atributo: 'Tamanho', valor: 'nº17' }], 5);
// variante única na loja (aro 18), aqui repartido em nº18 = 1 e nº24 = 1 (o 391471)
peca('S1', 2, 'Anel Coração Vazado Banho de Ouro 18k', 'Anel', 69);
variacaoLocal('S1', 'nº24', [{ atributo: 'Tamanho', valor: 'nº24' }], 0);
variacaoLocal('S1', 'nº18', [{ atributo: 'Tamanho', valor: 'nº18' }], 1);
repartir('S1', 'nº24', 1, 'local:S1-0');
repartir('S1', 'nº18', 1, 'local:S1-1');

const comConteudo = (p) => ({
  ...p, description: { pt: '<p>Texto revisado em 08/10.</p>' }, seo_title: { pt: 'SEO revisado | Marquesa' },
  seo_description: { pt: 'Meta revisada à mão, não pode sumir.' }, categories: [{ id: 11 }], visibility: 'visible',
  attributes: p.attributes || [],
});
const comAtributos = (p, attrs, valores) => {
  p.attributes = attrs.map((a) => ({ pt: a }));
  p.variants.forEach((v, i) => { v.values = valores[i].map((x) => ({ pt: x })); v.price = '99.00'; });
  return p;
};
loja.estado.categorias = [
  { id: 10, name: { pt: 'Brinco' }, parent: 0 }, { id: 11, name: { pt: 'Colar' }, parent: 0 },
  { id: 12, name: { pt: 'Anel' }, parent: 0 }, { id: 13, name: { pt: 'Pulseira' }, parent: 0 },
  { id: 14, name: { pt: 'Brincos' }, parent: 10 },
];
loja.estado.produtos = [
  comConteudo(produtoFalso(1, [{ id: 11, sku: 'EX1', estoque: 4 }], { imagens: ['http://cdn/ex1.jpg'] })),
  comConteudo(produtoFalso(2, [{ id: 21, sku: 'EX2', estoque: 2 }], { imagens: ['http://cdn/ex2.jpg'] })),
  { ...produtoFalso(3, [{ id: 31, sku: 'ADOT1', estoque: 1 }], { publicado: false }), visibility: 'hidden' },
  comConteudo(comAtributos(produtoFalso(4, [{ id: 41, sku: 'M1', estoque: 2 }, { id: 42, sku: 'M1', estoque: 1 }]),
    ['Cor', 'Tamanho'], [['Banho de Ouro 18K', 'n°20'], ['Banho de Ouro 18K', 'n°22']])),
  comConteudo(comAtributos(produtoFalso(5, [{ id: 51, sku: 'S1', estoque: 2 }]), ['Cor', 'Tamanho'], [['Banho de Ouro 18K', 'n°18']])),
];
for (const [sku, pid] of [['EX1', 1], ['EX2', 2], ['M1', 4], ['S1', 5]]) {
  raw.prepare("UPDATE produtos SET produto_id_loja = ?, url_loja = ? WHERE sku = ?").run(String(pid), `p-${pid}`, sku);
}
/* As variantes de M1 vindas da loja, como a importação grava (>1 variante). */
for (const [nome, vid, i] of [['Banho de Ouro 18K · n°20', '41', 0], ['Banho de Ouro 18K · n°22', '42', 1]]) {
  raw.prepare(`INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, produto_id, ordem, valores_json, origem)
    VALUES ('M1', ?, 'Cor · Tamanho', ?, '4', ?, ?, 'loja')`).run(nome, vid, i,
    JSON.stringify([{ atributo: 'Cor', valor: 'Banho de Ouro 18K' }, { atributo: 'Tamanho', valor: nome.split(' · ')[1] }]));
}
const CORTE = '2026-10-08T16:30:57.000Z';
raw.prepare(`INSERT INTO config (chave, valor) VALUES ('syncCorteEm', ?), ('nuvemshopSyncAtivo', 'true')`).run(JSON.stringify(CORTE));
const antesEx1 = structuredClone(loja.estado.produtos[0]);

/* espelho inicial e fila em dia (o mundo de 08/10: §61 ligado) */
await api('POST', '/api/nuvemshop/estoque/conferir');
await cron();

console.log('\n=== 0. travas: kill switch desligado e ensaio seco ===');
let r = await api('POST', '/api/nuvemshop/catalogo/criar', { seco: false });
assert.equal(r.corpo.trava, 'catalogo_desligado');
assert.equal(loja.estado.criacoes || 0, 0);
prova('catálogo desligado (ausente = desligado): nenhum produto criado', r.corpo.motivo);
await api('PUT', '/api/nuvemshop/catalogo/automatico', { ativo: true });
r = await api('POST', '/api/nuvemshop/catalogo/criar', {});
assert.equal(r.corpo.seco, true);
assert.equal(loja.estado.criacoes || 0, 0);
const n1Previa = r.corpo.itens.find((x) => x.sku === 'N1').enviaria;
assert.equal(n1Previa.visibility, 'hidden');
assert.equal('published' in n1Previa, false, 'mandar published junto com visibility dá 422 na API real');
prova('sem {"seco": false} é ensaio: devolve o corpo exato, visibility=hidden, sem published', `${r.corpo.itens.length} corpos`);
const bloqN5 = (await api('GET', '/api/nuvemshop/catalogo')).corpo.itens.find((x) => x.sku === 'N5');
assert.equal(bloqN5.criavel, false);
assert.match(bloqN5.bloqueios.join(' '), /Tamanho/);
prova('variação com cor no atributo "Tamanho" não é criada: revisar', bloqN5.bloqueios[0]);

console.log('\n=== 1-5. criar oculto, sem duplicar ===');
r = await api('POST', '/api/nuvemshop/catalogo/criar', { seco: false });
assert.equal(r.status, 200, JSON.stringify(r.corpo));
const criados = r.corpo.itens.filter((x) => x.acao === 'criado').map((x) => x.sku).sort();
assert.deepEqual(criados, ['N1', 'N2', 'N3', 'N4']);
assert.equal(loja.estado.criacoes, 4);
const pN1 = produtoDaLoja('N1');
assert.equal(pN1.visibility, 'hidden');
assert.equal(pN1.published, false);
assert.equal(pN1.images.length, 0);
assert.equal(linhaCat('N1').estado, 'oculto');
assert.equal(q1(`SELECT produto_id_loja p FROM produtos WHERE sku='N1'`).p, String(pN1.id));
prova('1  N1 sem foto criado OCULTO na loja; id gravado aqui', `produto ${pN1.id}`);
assert.equal(await vitrine(pN1.handle.pt), 404);
prova('2  a vitrine pública responde 404 para o produto hidden');
assert.match(pN1.description.pt, /Brinco Infantil Coração/);
assert.match(pN1.seo_title.pt, /\| Marquesa$/);
assert.ok(pN1.seo_description.pt.length >= 65 && pN1.seo_description.pt.length <= 160);
assert.deepEqual(pN1.categories.map((c) => c.id), [10]);
prova('3  descrição, SEO e categoria (mesmo nome) subiram; continua hidden', pN1.seo_title.pt);
const pN2 = produtoDaLoja('N2');
assert.deepEqual(pN2.attributes, [{ pt: 'Tamanho' }]);
assert.deepEqual(pN2.variants.map((v) => [v.values[0].pt, estoqueVariante(v)]), [['nº16', 1], ['nº18', 2]]);
const pvN2 = qa(`SELECT nome, variante_id, origem FROM produto_variacoes WHERE sku='N2' ORDER BY ordem`);
assert.deepEqual(pvN2.map((x) => x.origem), ['loja', 'loja']);
assert.deepEqual(pvN2.map((x) => x.variante_id), pN2.variants.map((v) => String(v.id)));
prova('4  N2 com as variações daqui: atributo Tamanho, nº16 = 1 e nº18 = 2; vínculo gravado');
assert.equal(q1(`SELECT produto_id_loja p FROM produtos WHERE sku='ADOT1'`).p, '3');
assert.equal(loja.estado.produtos.filter((p) => p.variants.some((v) => v.sku === 'ADOT1')).length, 1);
prova('5  ADOT1 já existia na loja (oculto): mapeado pela conferência, nenhum POST para ele');
/* Um código que aparece na loja DEPOIS da última conferência (cadastrado à
   mão no painel da Nuvemshop): a rodada lê a loja antes de criar e adota. */
peca('ADOT2', 1, 'Brinco Cadastrado À Mão Banho de Ouro 18k', 'Brinco', 49);
loja.estado.produtos.push({ ...produtoFalso(6, [{ id: 61, sku: 'ADOT2', estoque: 0 }], { publicado: false }), visibility: 'hidden' });
const antesAdot = loja.estado.criacoes;
r = await api('POST', '/api/nuvemshop/catalogo/criar', { seco: false });
assert.equal(loja.estado.criacoes, antesAdot);
assert.equal(linhaCat('ADOT2').origem, 'adotado');
assert.equal(q1(`SELECT produto_id_loja p FROM produtos WHERE sku='ADOT2'`).p, '6');
prova('5  ADOT2 cadastrado à mão na loja depois da conferência: ADOTADO, nenhum POST');
const pN4 = produtoDaLoja('N4');
assert.equal(pN4.variants[0].price, null);
assert.equal(pN4.visibility, 'hidden');
prova('sem preço: criado oculto e SEM preço (nada inventado)');

console.log('\n=== 5b. variante que falta num anúncio que já existe ===');
r = await api('POST', '/api/nuvemshop/catalogo/variantes', {});
assert.equal(r.corpo.seco, true);
assert.deepEqual(r.corpo.planos.map((p) => [p.sku, p.nomeNovo, p.bloqueio]), [['M1', 'Banho de Ouro 18K · n°17', null]]);
r = await api('POST', '/api/nuvemshop/catalogo/variantes', { seco: false });
assert.equal(r.corpo.criadas, 1);
const pM1 = produtoDaLoja('M1');
const nova = pM1.variants.find((v) => v.values.map((x) => x.pt).join(' · ') === 'Banho de Ouro 18K · n°17');
assert.ok(nova);
assert.equal(estoqueVariante(nova), 0);
assert.equal(nova.price, '99.00');
assert.equal(q1(`SELECT variante_id v FROM produto_variacoes WHERE sku='M1' AND nome='Banho de Ouro 18K · n°17'`).v, String(nova.id));
r = await api('POST', '/api/nuvemshop/catalogo/variantes', { seco: false });
assert.equal(pM1.variants.length, 3);
prova('M1 ganhou o aro n°17 (grafia das irmãs, estoque 0, preço comum); rodar de novo não duplica');

console.log('\n=== 6. o produto oculto recebe estoque pela fila ===');
await cron();
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku='N1'`).status, 'sincronizado');
const v = await api('POST', '/api/vendas', { clienteNome: 'Cliente', itens: [{ sku: 'N1', qtd: 1 }], pago: true });
assert.equal(v.status, 201, JSON.stringify(v.corpo));
assert.equal(estoqueVariante(produtoDaLoja('N1').variants[0]), 2);
assert.equal(produtoDaLoja('N1').visibility, 'hidden');
prova('6  venda de N1 aqui: a variante OCULTA na loja foi de 3 para 2');

console.log('\n=== 7. foto que entra depois ===');
raw.prepare(`INSERT INTO produto_fotos (id, sku, ordem, principal, origem, original_key, original_tipo, estado)
  VALUES ('f-n1', 'N1', 0, 1, 'upload', 'fotos/N1/f-n1/original', 'image/jpeg', 'original')`).run();
r = await api('POST', '/api/nuvemshop/catalogo/fotos', { seco: false });
assert.equal(r.corpo.enviadas, 1, JSON.stringify(r.corpo));
assert.equal(produtoDaLoja('N1').images.length, 1);
assert.equal(produtoDaLoja('N1').visibility, 'hidden');
assert.equal(await vitrine(produtoDaLoja('N1').handle.pt), 404);
prova('7  foto subiu para o anúncio e ele CONTINUA hidden (foto não publica)');

console.log('\n=== 8-9. pronto para publicar; publicar é um clique ===');
await api('POST', '/api/nuvemshop/estoque/conferir');
const fila1 = await api('GET', '/api/catalogo/publicacao');
const itN1 = fila1.corpo.itens.find((x) => x.sku === 'N1');
assert.equal(itN1.situacao, 'pronto', JSON.stringify(itN1.nuvemshop?.pendencias));
assert.equal(produtoDaLoja('N1').visibility, 'hidden');
prova('8  N1 completo aparece como "pronto" — e NADA mudou na loja sozinho');
r = await api('POST', '/api/nuvemshop/catalogo/N1/publicar', { por: 'Sthefany' });
assert.equal(r.status, 200, JSON.stringify(r.corpo));
assert.equal(r.corpo.confirmadoPelaLoja, true);
assert.equal(produtoDaLoja('N1').visibility, 'visible');
assert.equal(await vitrine(produtoDaLoja('N1').handle.pt), 200);
assert.equal(linhaCat('N1').estado, 'visivel');
assert.equal(linhaCat('N1').publicado_por, 'Sthefany');
prova('9  publicar: hidden → visible, confirmado pela releitura; vitrine responde 200');

console.log('\n=== 10. saldo incerto e falta de preço seguram o visible ===');
const pN3 = produtoDaLoja('N3');
assert.deepEqual(pN3.variants.map(estoqueVariante), [0, 0]);
r = await api('POST', '/api/nuvemshop/catalogo/N3/publicar', {});
assert.equal(r.status, 409);
assert.ok(r.corpo.faltam.includes('estoque_variacao'), JSON.stringify(r.corpo.faltam));
assert.equal(pN3.visibility, 'hidden');
prova('10 N3 (variações sem saldo repartido) nasceu com 0 em cada uma e NÃO publica', r.corpo.faltam.join(', '));
r = await api('POST', '/api/nuvemshop/catalogo/N4/publicar', {});
assert.equal(r.status, 409);
assert.ok(r.corpo.faltam.includes('preco'));
prova('sem preço não publica', r.corpo.faltam.join(', '));

console.log('\n=== 11-12. idempotência e falha da API ===');
const antes11 = loja.estado.criacoes;
await api('POST', '/api/nuvemshop/catalogo/criar', { seco: false });
assert.equal(loja.estado.criacoes, antes11);
prova('11 rodar a criação de novo: nenhum POST');
peca('N6', 1, 'Colar Morreu No Meio Banho de Ouro 18k', 'Colar', 99);
loja.estado.produtos.push({ ...produtoFalso(777, [{ id: 7771, sku: 'N6', estoque: 1 }], { publicado: false }), visibility: 'hidden' });
raw.prepare(`INSERT INTO nuvemshop_catalogo (sku, estado, origem, travado_ate, atualizado_em)
  VALUES ('N6', 'criando', 'criado', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`).run();
await api('POST', '/api/nuvemshop/catalogo/criar', { seco: false });
assert.equal(loja.estado.criacoes, antes11);
assert.equal(linhaCat('N6').estado, 'oculto');
assert.equal(q1(`SELECT produto_id_loja p FROM produtos WHERE sku='N6'`).p, '777');
prova('11 Worker que morreu entre o POST e a gravação: a rodada seguinte ACHA o produto e só vincula');
peca('N7', 1, 'Pulseira Falha Banho de Ouro 18k', 'Pulseira', 89);
loja.estado.falharCriacao = 1;
r = await api('POST', '/api/nuvemshop/catalogo/criar', { seco: false });
assert.equal(linhaCat('N7').estado, 'erro');
assert.equal(linhaCat('N7').tentativas, 1);
r = await api('POST', '/api/nuvemshop/catalogo/criar', { seco: false });
assert.equal(linhaCat('N7').estado, 'oculto');
assert.equal(loja.estado.produtos.filter((p) => p.variants.some((x) => x.sku === 'N7')).length, 1);
prova('12 loja falhou (500): erro registrado; a rodada seguinte criou UMA vez');

console.log('\n=== 13-14. o que já existia fica intacto ===');
const depoisEx1 = loja.estado.produtos[0];
for (const k of ['name', 'description', 'seo_title', 'seo_description', 'images', 'categories', 'visibility', 'handle']) {
  assert.deepEqual(depoisEx1[k], antesEx1[k], `EX1.${k} mudou`);
}
assert.ok(!(loja.estado.atualizacoes || []).some((a) => a.id === 1 || a.id === 2));
prova('13 EX1/EX2 (publicados, com SEO): nenhum PUT; nome, texto, SEO, imagens e URL iguais');
await cron();
await api('POST', '/api/nuvemshop/estoque/conferir');
const conf = JSON.parse(q1(`SELECT valor FROM config WHERE chave='nuvemshopConferencia'`).valor);
const statusDe = (sku) => qa('SELECT status FROM nuvemshop_conferencia WHERE sku = ?', sku).map((x) => x.status);
for (const s of ['EX1', 'EX2', 'ADOT1', 'N1', 'N2', 'N6', 'N7']) assert.deepEqual([...new Set(statusDe(s))], ['ok'], s);
assert.equal(conf.divergentes, 0, JSON.stringify(qa("SELECT sku, variante, online, ns_estoque FROM nuvemshop_conferencia WHERE status = 'divergente'")));
prova('14 conferência: os já mapeados continuam iguais, e os novos ocultos entraram na cobertura', `${conf.iguais} iguais, 0 divergentes`);

console.log('\n=== variante única na loja, estoque repartido aqui (391471) ===');
assert.equal(estoqueVariante(produtoDaLoja('S1').variants[0]), 1);
prova('S1: a loja tem só o aro 18 e recebeu 1 (o aro 18), não o total 2');

console.log('\n=== a API que ignora `visibility` ===');
peca('N8', 1, 'Colar Publicado Por Engano Banho de Ouro 18k', 'Colar', 99);
loja.estado.ignorarVisibilidade = true;
r = await api('POST', '/api/nuvemshop/catalogo/criar', { seco: false });
loja.estado.ignorarVisibilidade = false;
const pN8 = produtoDaLoja('N8');
assert.match(r.corpo.interrompido || '', /hidden/);
assert.equal(q1(`SELECT valor FROM config WHERE chave='nuvemshopCatalogoAtivo'`).valor, 'false');
assert.equal(linhaCat('N8').estado, 'erro');
prova('a loja não respeitou hidden: rodada INTERROMPIDA e cadastro automático DESLIGADO', r.corpo.interrompido);
assert.ok((loja.estado.atualizacoes || []).some((a) => a.id === pN8.id && a.corpo.visibility === 'hidden'));
prova('…e o Worker mandou esconder o produto na mesma rodada');

console.log('\n=== cron: com o catálogo ligado, cria sozinho quando a fila está ociosa ===');
await api('PUT', '/api/nuvemshop/catalogo/automatico', { ativo: true });
peca('N9', 1, 'Pingente Novo Banho de Ouro 18k', 'Pingente', 39);
raw.prepare(`UPDATE nuvemshop_fila SET status='sincronizado' WHERE status='pendente'`).run();
const realDate = Date;
let criadoPeloCron = false;
for (let i = 0; i < 2 && !criadoPeloCron; i++) {
  const minuto = i === 0 ? 5 : 25;
  globalThis.Date = class extends realDate {
    getUTCMinutes() { return minuto; }
  };
  await cron();
  globalThis.Date = realDate;
  criadoPeloCron = !!linhaCat('N9');
}
assert.equal(linhaCat('N9').estado, 'oculto');
assert.equal(produtoDaLoja('N9').visibility, 'hidden');
const pend = (await api('GET', '/api/nuvemshop/catalogo')).corpo.itens.find((x) => x.sku === 'N9').pendencias.map((x) => x.chave);
assert.ok(pend.includes('categoria'), 'Pingente não existe como categoria na loja');
prova('N9 cadastrado OCULTO pelo cron; "Pingente" sem categoria igual na loja vira pendência', pend.join(', '));

assert.ok(razaoFecha(), 'razão quebrou');
prova('razão: produtos.qtd == SUM(movimentos.qtd) para todo código');

await loja.fechar();
console.log(`\n${provas} provas — §62 catálogo oculto ok`);
