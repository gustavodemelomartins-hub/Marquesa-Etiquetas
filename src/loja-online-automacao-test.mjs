/** §64 — o que o sistema descobre com segurança, ele resolve sozinho.
 *
 *  O Worker REAL (`api/src/index.js`), o schema REAL e a loja de mentira
 *  (`loja-falsa.mjs`), no mesmo processo — sem wrangler, sem chave, sem rede.
 *
 *    1  Cor = nº19 (cadastro daqui) vira Tamanho
 *    2  Tamanho = Azul vira Cor — e a peça deixa de travar o cadastro
 *    3  variação que falta na Nuvemshop é criada (grafia das irmãs, banho copiado)
 *    4  variação equivalente já existente ("nº 18" × "n°18") não duplica
 *    5  nº19 ≠ nº21
 *    6  divisão desconhecida: a variação é criada com 0 e nada é inventado
 *    7  categoria Anel aplicada sozinha
 *    8  Argola vai para Brinco (categoria canônica da loja)
 *    9  oculto sem estoque sai da fila
 *    10 ganhou estoque, volta para a fila
 *    11 (no vitest: `sem_preparador` não aparece na tela)
 *    12 venda antiga sem variação continua histórico, mesmo depois da repartição
 *    13 SKU, preço e estoque preservados na normalização e na criação
 *    14 releitura da loja depois de criar a variante
 *    +  inventário prova a divisão → reparte; maleta sem variação ou
 *       movimento depois do inventário → não reparte
 *    +  "mesmo modelo" exige a mesma família; kit não é pendência
 *    +  razão fechando, nada visível sem clique, nenhuma venda criada
 *
 *      node src/loja-online-automacao-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { subirLojaFalsa } from './loja-falsa.mjs';

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

const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run, executar: st.executar });
  st.bind = (...a) => comArgs(a.map((v) => (v === undefined ? null : v)));
  st.first = async function (col) { const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0) } }; };
  st.executar = function () {
    const r = raw.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(r.changes ?? 0), last_row_id: Number(r.lastInsertRowid ?? 0) } };
  };
  return st;
};
const DB = {
  prepare: preparar,
  async batch(stmts) {
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

const loja = await subirLojaFalsa(8826);
const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const { equivalenciasLojaLocal } = await import(pathToFileURL(join(raiz, 'api/src/variacao-nome.js')).href);
const env = {
  DB, API_KEY: 'k',
  NUVEMSHOP_STORE_ID: '123', NUVEMSHOP_TOKEN: 'token-falso',
  NUVEMSHOP_BASE: loja.url, NUVEMSHOP_WRITES_ENABLED: 'true',
};
let pendentes = [];
const ctx = { waitUntil(p) { pendentes.push(p); }, passThroughOnException() {} };
const esperarFundo = async () => { const p = pendentes; pendentes = []; await Promise.all(p); };
const api = async (metodo, caminho, corpo) => {
  const r = await worker.fetch(new Request(`http://local${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env, ctx);
  await esperarFundo();
  return { status: r.status, corpo: await r.json().catch(() => null) };
};
/* O rodízio do cron é pela hora; aqui o minuto é fixo — :35 é a vez das
   fotos, que sem R2 não faz nada. */
const cron = async (minuto = 35) => {
  const original = Date.prototype.getUTCMinutes;
  Date.prototype.getUTCMinutes = () => minuto;
  try { await worker.scheduled({ cron: '*/10 * * * *' }, env, ctx); await esperarFundo(); } finally { Date.prototype.getUTCMinutes = original; }
};
const admin = async (acao, extra = {}) => {
  raw.prepare(`INSERT INTO config (chave, valor) VALUES ('nuvemshopPedidoAdmin', ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`).run(JSON.stringify({ acao, seco: false, ...extra }));
  await cron();
  return JSON.parse(q1(`SELECT valor FROM config WHERE chave = 'nuvemshopCatalogoUltimaRodada'`).valor);
};

const q1 = (sql, ...a) => raw.prepare(sql).get(...a);
const qa = (sql, ...a) => raw.prepare(sql).all(...a);
let provas = 0;
const prova = (t, extra = '') => { provas += 1; console.log(`  ok   ${t}${extra ? '  → ' + extra : ''}`); };
const razaoFecha = () => qa(`SELECT p.sku FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m
  ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.s, 0)`).length === 0;
const produtoDaLoja = (id) => loja.estado.produtos.find((p) => String(p.id) === String(id));
const estoque = (v) => (v.inventory_levels ? v.inventory_levels[0].stock : v.stock);
const valores = (v) => (v.values || []).map((x) => x.pt).join(' · ');

/* ── o catálogo: toda quantidade nasce de movimento ─────────────────── */
const peca = (sku, qtd, desc, cat, preco = 79) => {
  raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, ?, ?, ?, 'ativo')").run(sku, desc, cat, preco, qtd);
  if (qtd) raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem) VALUES (?, 'entrada', ?, 'importacao')").run(sku, qtd);
};
const mov = (sku, tipo, qtd, variacao = null, vid = null, criadoEm = null) => {
  raw.prepare(`INSERT INTO movimentos (sku, tipo, qtd, origem, variacao, variante_id${criadoEm ? ', criado_em' : ''})
    VALUES (?, ?, ?, 'inventario', ?, ?${criadoEm ? ', ?' : ''})`).run(...[sku, tipo, qtd, variacao, vid, ...(criadoEm ? [criadoEm] : [])]);
  raw.prepare('UPDATE produtos SET qtd = qtd + ? WHERE sku = ?').run(qtd, sku);
};
const repartir = (sku, nome, n, vid) => { mov(sku, 'ajuste', -n); mov(sku, 'ajuste', n, nome, vid); };
const variacaoDaqui = (sku, lista, atributo = 'Tamanho') => lista.forEach(([nome, vid], i) => raw.prepare(
  `INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem)
   VALUES (?, ?, ?, ?, ?, ?, 'local')`).run(sku, nome, atributo, vid, i, JSON.stringify([{ atributo, valor: nome }])));
const anuncio = (id, sku, { atributos = [], variantes, visibility = 'visible', categorias = [], nome = `Produto ${id}` }) => {
  loja.estado.produtos.push({
    id, name: { pt: nome }, handle: { pt: `p-${id}` }, visibility, published: visibility === 'visible',
    attributes: atributos.map((a) => ({ pt: a })), categories: categorias.map((c) => ({ id: c })), images: [],
    description: { pt: '<p>Texto.</p>' }, seo_title: { pt: 'T' }, seo_description: { pt: 'D' },
    variants: variantes.map(([vid, vals, est, preco = '79.00']) => ({
      id: vid, sku, price: preco, values: vals.map((pt) => ({ pt })),
      inventory_levels: [{ location_id: 'LOC1', stock: est }],
    })),
  });
  raw.prepare('UPDATE produtos SET produto_id_loja = ?, url_loja = ? WHERE sku = ?').run(String(id), `p-${id}`, sku);
};

loja.estado.categorias = [
  { id: 12, name: { pt: 'Anel' }, parent: 0 },
  { id: 13, name: { pt: 'Brinco' }, parent: 0 },
  { id: 14, name: { pt: 'Brincos' }, parent: 13 },
  { id: 15, name: { pt: 'Raizes' }, parent: 0 },
  { id: 16, name: { pt: 'Prata 925' }, parent: 0 },
  { id: 17, name: { pt: 'Conjuntos' }, parent: 16 },
];

// A1 — anúncio de variante única n°21; aqui nº21 e nº19, divisão conhecida (1/1)
peca('A1', 2, 'Anel Aparador Teste Banho de Ouro 18k', 'Anel', 79);
anuncio(300, 'A1', { atributos: ['Cor', 'Tamanho'], variantes: [[3001, ['Banho de Ouro 18k', 'n°21'], 2]] });
variacaoDaqui('A1', [['nº21', 'local:a1-21'], ['nº19', 'local:a1-19']]);
repartir('A1', 'nº21', 1, 'local:a1-21'); repartir('A1', 'nº19', 1, 'local:a1-19');
// A3 — equivalentes já na loja, escritos de outro jeito
peca('A3', 2, 'Anel Equivalente Teste Banho de Ouro 18k', 'Anel', 69);
anuncio(301, 'A3', { atributos: ['Cor', 'Tamanho'], variantes: [[3011, ['Banho de Ouro 18k', 'n°18'], 1, '69.00'], [3012, ['Banho de Ouro 18k', 'n°20'], 1, '69.00']] });
variacaoDaqui('A3', [['nº 18', 'local:a3-18'], ['Aro 20', 'local:a3-20']]);
// A4 — variante única n°18; aqui nº18 e nº22, 2 peças sem divisão e sem inventário
peca('A4', 2, 'Anel Incerto Teste Banho de Ouro 18k', 'Anel', 89);
anuncio(302, 'A4', { atributos: ['Cor', 'Tamanho'], variantes: [[3021, ['Banho de Ouro 18k', 'n°18'], 2, '89.00']] });
variacaoDaqui('A4', [['nº18', 'local:a4-18'], ['nº22', 'local:a4-22']]);
// B1 — "Tamanho = Azul" daqui, sem anúncio; B2 — "Cor = nº19" daqui
peca('B1', 2, 'Brinco Ponto Teste Banho de Ouro 18k', 'Brinco', 59);
variacaoDaqui('B1', [['Azul', 'local:b1-az'], ['Cristal', 'local:b1-cr']], 'Tamanho');
repartir('B1', 'Azul', 1, 'local:b1-az'); repartir('B1', 'Cristal', 1, 'local:b1-cr');
peca('B2', 2, 'Anel Atributo Teste Banho de Ouro 18k', 'Anel', 59);
variacaoDaqui('B2', [['nº19', 'local:b2-19'], ['nº20', 'local:b2-20']], 'Cor');
// C1/C2/C3 — ocultos sem categoria na loja
peca('C1', 1, 'Anel Categoria Teste Banho de Ouro 18k', 'Anel');
anuncio(310, 'C1', { visibility: 'hidden', variantes: [[3101, [], 1]] });
peca('C2', 1, 'Argola Média Teste Banho de Ouro 18k', 'Argola');
anuncio(311, 'C2', { visibility: 'hidden', variantes: [[3111, [], 1]] });
peca('C3', 1, 'Pingente Cavalo Teste Banho de Ouro 18k', 'Pingente');
anuncio(312, 'C3', { visibility: 'hidden', variantes: [[3121, [], 1]] });
// Z1 — oculto, sem peça em casa
peca('Z1', 0, 'Anel Esgotado Teste Banho de Ouro 18k', 'Anel');
anuncio(320, 'Z1', { visibility: 'hidden', variantes: [[3201, [], 0]], categorias: [12] });
// I1/I2/I3 — o inventário bipou por variação
const inv = Number(raw.prepare(`INSERT INTO inventarios (status, iniciado_em, concluido_em, numero)
  VALUES ('concluido', '2026-10-06 13:52:12', '2999-01-01 00:00:00', 1)`).run().lastInsertRowid);
const contou = (sku, linhas, total, esperado = total) => {
  raw.prepare(`INSERT INTO inventario_contagem (inventario_id, sku, variacao, contado, origem) VALUES (?, ?, '', 0, 'bipagem')`).run(inv, sku);
  for (const [variacao, n] of linhas) {
    raw.prepare(`INSERT INTO inventario_contagem (inventario_id, sku, variacao, contado, origem) VALUES (?, ?, ?, ?, 'bipagem')`).run(inv, sku, variacao, n);
  }
  raw.prepare(`INSERT INTO inventario_resultado (inventario_id, sku, variacao, contado, esperado, situacao)
    VALUES (?, ?, '', ?, ?, 'conferido')`).run(inv, sku, total, esperado);
};
for (const [sku, pid] of [['I1', 330], ['I2', 331], ['I3', 332]]) {
  peca(sku, sku === 'I1' ? 4 : 3, `Anel Inventariado ${sku} Banho de Ouro 18k`, 'Anel');
  anuncio(pid, sku, { atributos: ['Cor', 'Tamanho'], variantes: [[pid * 10 + 1, ['Banho de Ouro 18k', 'n°16'], 1], [pid * 10 + 2, ['Banho de Ouro 18k', 'n°18'], 1]] });
}
// I1: uma venda ANTIGA sem dizer o aro (4 → 3), depois o inventário contou 2 n°16 + 1 n°18
const vendaAntiga = Number(raw.prepare(`INSERT INTO vendas (cliente_nome, origem, data, total, nuvemshop_status)
  VALUES ('Andreia', 'balcao', '2026-08-22', 79, 'sincronizada')`).run().lastInsertRowid);
raw.prepare(`INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES (?, 'I1', 'x', 1, 79, 'item-antigo')`).run(vendaAntiga);
raw.prepare(`INSERT INTO movimentos (sku, tipo, qtd, origem, venda_id) VALUES ('I1', 'venda', -1, 'balcao', ?)`).run(vendaAntiga);
raw.prepare(`UPDATE produtos SET qtd = qtd - 1 WHERE sku = 'I1'`).run();
contou('I1', [['Banho de Ouro 18k · n°16', 2], ['Banho de Ouro 18k · n°18', 1]], 3);
// I2: uma das 3 peças está numa maleta e a maleta não diz o aro
raw.prepare("INSERT INTO revendedoras (id, nome) VALUES (1, 'Luciana')").run();
raw.prepare("INSERT INTO maletas (id, rev_id, status, aberta_em) VALUES (1, 1, 'aberta', '2026-09-26')").run();
raw.prepare("INSERT INTO maleta_itens (maleta_id, sku, qtd, devolvida) VALUES (1, 'I2', 1, 0)").run();
contou('I2', [['Banho de Ouro 18k · n°16', 1], ['Banho de Ouro 18k · n°18', 1]], 2);
// I3: contou certo, mas o código teve movimento DEPOIS do fim do inventário
contou('I3', [['Banho de Ouro 18k · n°16', 2], ['Banho de Ouro 18k · n°18', 1]], 3);
mov('I3', 'ajuste', 0, null, null, '3000-01-01 00:00:00');
// N0/N1 — "Brinco Ponto de Luz Rosa" anunciado; "Colar Ponto de Luz Rosa" daqui
peca('N0', 1, 'Brinco Ponto de Luz Rosa Teste Banho de Ouro 18k', 'Brinco');
anuncio(340, 'N0', { nome: 'Brinco Ponto de Luz Rosa Teste Banho de Ouro 18k', variantes: [[3401, [], 1]], categorias: [13] });
peca('N1', 1, 'Colar Ponto de Luz Rosa Teste Banho de Ouro 18k', 'Colar', 149);
peca('N2', 1, 'Brinco Ponto de Luz Rosa Teste Banho de Ouro 18k', 'Brinco', 89);   // mesmo nome, mesma família
// K1 — kit
peca('K1', 1, 'Colar Filhos Teste Banho de Ouro 18k', 'Colar');
raw.prepare("INSERT INTO kit_componentes (kit_sku, componente_sku, qtd) VALUES ('K1', 'N0', 1)").run();

raw.prepare(`INSERT INTO config (chave, valor) VALUES ('syncCorteEm', ?), ('nuvemshopSyncAtivo', 'true'), ('nuvemshopCatalogoAtivo', 'true')`)
  .run(JSON.stringify('2026-10-08T16:30:57.000Z'));
assert.ok(razaoFecha());
const vendasAntes = q1('SELECT COUNT(*) n FROM vendas').n;
const precosAntes = JSON.stringify(qa('SELECT sku, preco, qtd FROM produtos ORDER BY sku'));

await api('POST', '/api/nuvemshop/estoque/conferir');
await cron();

console.log('\n=== 1-2. atributo que contradiz o valor ===');
let r = await admin('normalizar_atributos');
const atributo = (sku) => qa('SELECT DISTINCT atributo FROM produto_variacoes WHERE sku = ?', sku).map((x) => x.atributo).join(',');
assert.equal(atributo('B2'), 'Tamanho', JSON.stringify(r));
assert.deepEqual(qa('SELECT nome FROM produto_variacoes WHERE sku = ? ORDER BY ordem', 'B2').map((x) => x.nome), ['nº19', 'nº20']);
prova('1  "Cor = nº19" daqui virou Tamanho — o nome da variação não mudou');
assert.equal(atributo('B1'), 'Cor');
assert.deepEqual(JSON.parse(q1(`SELECT valores_json FROM produto_variacoes WHERE sku='B1' AND nome='Azul'`).valores_json), [{ atributo: 'Cor', valor: 'Azul' }]);
let fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
const item = (sku) => fila.itens.find((x) => x.sku === sku);
assert.equal(item('B1').nuvemshop.criavel, true, JSON.stringify(item('B1').nuvemshop.bloqueios));
assert.equal(atributo('A1'), 'Tamanho', 'aro em Tamanho não muda');
prova('2  "Tamanho = Azul" virou Cor, e a peça deixou de travar o cadastro');

console.log('\n=== 3-6, 13-14. variação que falta na Nuvemshop ===');
const criadasAntes = (loja.estado.variantesCriadas || []).length;
r = await admin('catalogo_variantes');
const p300 = produtoDaLoja(300);
assert.equal(p300.variants.length, 2, JSON.stringify(r));
const nova = p300.variants.find((v) => v.id !== 3001);
assert.equal(valores(nova), 'Banho de Ouro 18k · n°19', 'banho copiado das irmãs, grafia "n°" das irmãs');
assert.equal(nova.sku, 'A1');
assert.equal(Number(nova.price), 79);
assert.equal(estoque(nova), 0, 'nasce com 0, nunca null (infinito)');
prova('3  nº19 criado na loja como "Banho de Ouro 18k · n°19" — SKU e preço do código, estoque 0');

assert.equal(produtoDaLoja(301).variants.length, 2);
assert.ok(!(loja.estado.variantesCriadas || []).slice(criadasAntes).some((x) => x.produto === 301));
prova('4  "nº 18" e "Aro 20" daqui são os n°18/n°20 da loja: nada foi criado');

assert.equal(equivalenciasLojaLocal([{ variante_id: 'L', nome: 'n°21' }], [{ variante_id: 'A', nome: 'nº19' }]).size, 0);
assert.equal(equivalenciasLojaLocal([{ variante_id: 'L', nome: 'Verde Esmeralda' }], [{ variante_id: 'A', nome: 'Verde' }]).size, 1);
assert.equal(equivalenciasLojaLocal([{ variante_id: 'L', nome: 'Verde Esmeralda' }], [{ variante_id: 'A', nome: 'Azul' }]).size, 0);
assert.equal(p300.variants.find((v) => v.id === 3001).values.map((x) => x.pt).join(' · '), 'Banho de Ouro 18k · n°21');
prova('5  nº19 ≠ n°21 (a n°21 continua intacta); Verde ≡ Verde Esmeralda só por unicidade');

const p302 = produtoDaLoja(302);
const n22 = p302.variants.find((v) => v.id !== 3021);
assert.equal(valores(n22), 'Banho de Ouro 18k · n°22');
assert.equal(estoque(n22), 0);
await cron();
assert.equal(estoque(p302.variants.find((v) => v.id === 3021)), 2, 'sem divisão: o número da loja não é reescrito');
assert.equal(estoque(produtoDaLoja(302).variants.find((v) => v.id !== 3021)), 0);
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'A4'`).status, 'revisao');
let pend = (await api('GET', '/api/pendencias')).corpo;
const a4 = pend.pendencias.find((x) => x.chave === 'variacao:A4');
assert.equal(a4?.titulo, 'Conferir estoque por variação', JSON.stringify(pend.pendencias.map((x) => x.chave)));
prova('6  divisão desconhecida: n°22 criada com 0, nada inventado; a pergunta que sobra é "quantas de cada?"', a4.explicacao);

assert.equal(estoque(produtoDaLoja(300).variants.find((v) => v.id === 3001)), 1);
assert.equal(estoque(produtoDaLoja(300).variants.find((v) => v.id !== 3001)), 1);
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'A1'`).status, 'sincronizado');
assert.equal(JSON.stringify(qa('SELECT sku, preco, qtd FROM produtos ORDER BY sku')), precosAntes);
assert.equal(q1(`SELECT variante_id FROM produto_variacoes WHERE sku='A1' AND nome='nº21'`).variante_id, '3001');
assert.equal(q1(`SELECT variante_id FROM produto_variacoes WHERE sku='A1' AND nome='nº19'`).variante_id, String(nova.id));
assert.ok(razaoFecha());
prova('13 SKU, preço e total preservados; o saldo conhecido (1/1) foi para as duas variantes');

const espelho = qa(`SELECT variante_id, nome FROM loja_variantes WHERE produto_id = '300' ORDER BY variante_id`);
assert.equal(espelho.length, 2);
assert.ok(espelho.some((x) => x.variante_id === String(nova.id)));
assert.ok(r.itens.some((x) => x.sku === 'A1' && x.acao === 'criada'));
r = await admin('catalogo_variantes');
assert.equal(produtoDaLoja(300).variants.length, 2, 'rodar de novo não duplica');
prova('14 a loja foi relida: espelho com a variante nova; segunda rodada não duplica');

console.log('\n=== 7-8. categoria óbvia ===');
r = await admin('catalogo_categorias');
const cats = (id) => (produtoDaLoja(id).categories || []).map((c) => Number(c && typeof c === 'object' ? c.id : c));
assert.deepEqual(cats(310), [12], JSON.stringify(r));
prova('7  "Anel" sem categoria na loja recebeu a categoria Anel', JSON.stringify(r.itens?.find((x) => x.sku === 'C1')));
assert.deepEqual(cats(311), [13]);
prova('8  "Argola" foi para Brinco — a categoria canônica da loja');
assert.deepEqual(cats(312), []);
fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
assert.match(item('C3').nuvemshop.pendencias.find((x) => x.chave === 'categoria').motivo, /Escolha/);
assert.equal(item('C3').nuvemshop.categoriaLoja, null);
assert.ok(!item('C1').nuvemshop.pendencias.some((x) => x.chave === 'categoria'));
prova('   pingente avulso (sem equivalente na loja) continua pergunta — e só ele');

console.log('\n=== 9-10. estoque zero é estado ===');
assert.equal(item('Z1').situacao, 'sem_estoque');
assert.ok(!item('Z1').pendencias.includes('sem_estoque'));
prova('9  oculto sem peça em casa: situação "sem_estoque", fora de pronto/oculto/atenção');
mov('Z1', 'entrada', 1);
fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
assert.ok(['oculto', 'pronto'].includes(item('Z1').situacao), item('Z1').situacao);
prova('10 entrou peça: voltou para a fila sozinho', item('Z1').situacao);

console.log('\n=== inventário: divisão provada ===');
r = await admin('reparticao_inventario', { seco: true });
const porSku = Object.fromEntries((r.itens || []).map((x) => [x.sku, x]));
assert.equal(porSku.I1?.acao, 'provado', JSON.stringify(r));
assert.equal(porSku.I2?.acao, 'recusado');
assert.match(porSku.I2.erro, /maleta sem variação/);
assert.match(porSku.I3.erro, /movimento depois do inventário/);
r = await admin('reparticao_inventario');
const saldo = (sku, nome) => q1(`SELECT COALESCE(SUM(qtd),0) s FROM movimentos WHERE sku = ? AND variacao = ?`, sku, nome).s;
assert.equal(saldo('I1', 'Banho de Ouro 18k · n°16'), 2, JSON.stringify(r));
assert.equal(saldo('I1', 'Banho de Ouro 18k · n°18'), 1);
assert.equal(q1(`SELECT qtd FROM produtos WHERE sku='I1'`).qtd, 3);
assert.ok(qa(`SELECT obs FROM movimentos WHERE sku='I1' AND origem='variacao'`).every((x) => /Inventário #1/.test(x.obs)));
await cron();
assert.deepEqual(produtoDaLoja(330).variants.map(estoque), [2, 1]);
prova('+  inventário bipou 2 n°16 + 1 n°18 e nada mudou depois: repartido e enviado (2/1)');
assert.equal(qa(`SELECT 1 FROM movimentos WHERE sku='I2' AND origem='variacao'`).length, 0);
assert.equal(qa(`SELECT 1 FROM movimentos WHERE sku='I3' AND origem='variacao'`).length, 0);
prova('+  peça em maleta sem variação, ou movimento depois do inventário: nada é repartido');

console.log('\n=== 12. venda antiga ===');
pend = (await api('GET', '/api/pendencias')).corpo;
assert.ok(pend.historico.itens.some((x) => x.vendaId === vendaAntiga));
assert.ok(!pend.pendencias.some((x) => x.chave.includes(String(vendaAntiga))));
assert.equal(q1(`SELECT variacao FROM venda_itens WHERE venda_id = ?`, vendaAntiga).variacao, null);
assert.equal(q1('SELECT COUNT(*) n FROM vendas').n, vendasAntes);
prova('12 a venda antiga sem variação continua histórico — não ganhou aro, não virou pendência');

console.log('\n=== mesmo modelo exige a mesma família; kit não é tarefa ===');
fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
assert.equal(item('N1').nuvemshop.criavel, true, JSON.stringify(item('N1').nuvemshop.bloqueios));
assert.equal(item('N2').nuvemshop.criavel, false);
assert.match(item('N2').nuvemshop.bloqueios.join(' '), /mesmo modelo/);
assert.equal(item('K1').nuvemshop.naoSeAplica, 'kit');
const chaves = pend.pendencias.map((x) => x.chave);
assert.ok(!chaves.includes('publicacao:K1') && !chaves.includes('publicacao:N1'));
assert.ok(chaves.includes('publicacao:N2'), chaves.join(', '));
assert.match(pend.pendencias.find((x) => x.chave === 'publicacao:N2').explicacao, /mesmo modelo/);
prova('+  "Colar Ponto de Luz Rosa" ≠ "Brinco Ponto de Luz Rosa"; "Brinco …" igual ao anunciado continua pergunta; kit some');

console.log('\n=== nada publicado, razão fechando ===');
await cron(5); await cron(15); await cron(25); await cron(45);
const visiveisCriados = loja.estado.produtos.filter((p) => p.id > 900000 && p.visibility !== 'hidden');
assert.equal(visiveisCriados.length, 0);
assert.ok([310, 311, 312, 320].every((id) => produtoDaLoja(id).visibility === 'hidden'));
assert.ok(razaoFecha());
assert.equal(q1('SELECT COUNT(*) n FROM vendas').n, vendasAntes);
prova('+  o rodízio inteiro rodou: nada ficou visível, nenhuma venda criada, razão fecha');

console.log(`\n${provas} provas, 0 falhas`);
await loja.fechar?.();
process.exit(0);
