/** §66 — possível duplicidade em TODO código, o estado atual vence a
 *  conferência antiga, equivalência por unicidade é operacional e zero em
 *  casa é zero na loja.
 *
 *  Worker real + loja falsa + D1 em memória, como as outras suítes da Loja
 *  online. Cada prova é um caso real de PROD de 10/10/2026, reduzido:
 *
 *    duplicidade  oculto × publicado (186027 × 170308), oculto × oculto com
 *                 preços diferentes (481514 × 454953), sem anúncio × publicado,
 *                 publicado × publicado (só informação), oculto sem peça em
 *                 casa (informação), e os que os dados resolvem: acabamento
 *                 diferente (221300 × 244831), categoria diferente, mesma foto
 *    precedência  os 8 códigos repartidos pelo §64 que a conferência das 09:51
 *                 ainda dizia "sem mapeamento"
 *    unicidade    318524 Verde × Verde Esmeralda, e o que acontece quando o
 *                 anúncio ganha outra variante
 *    zero         código sem peça em casa com a maleta sem variação; os 17
 *                 publicados que a loja vendia a mais (218178: n°20 = 3 na
 *                 loja, nenhuma em casa)
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

const loja = await subirLojaFalsa(8827);
const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const { decidirEstoqueDoSku } = await import(pathToFileURL(join(raiz, 'api/src/sync.js')).href);
const { suspeitasDeDuplicidade } = await import(pathToFileURL(join(raiz, 'api/src/catalogo/duplicidade.js')).href);
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
/* :35 é a vez das fotos no rodízio — sem R2, não faz nada. */
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
const estoques = (id) => produtoDaLoja(id).variants.map((v) => `${(v.values || []).map((x) => x.pt).join(' · ')}=${estoque(v)}`).join(', ');

/* ── o catálogo: toda quantidade nasce de movimento ─────────────────── */
const peca = (sku, qtd, desc, cat, preco = 79, obs = 'Saldo inicial do cadastro de peças novas', em = '2026-08-21 13:34:26') => {
  raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, ?, ?, ?, 'ativo')").run(sku, desc, cat, preco, qtd);
  raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, obs, criado_em) VALUES (?, 'entrada', ?, 'importacao', ?, ?)").run(sku, qtd, obs, em);
};
const mov = (sku, tipo, qtd, variacao = null, vid = null, criadoEm = null) => {
  raw.prepare(`INSERT INTO movimentos (sku, tipo, qtd, origem, variacao, variante_id${criadoEm ? ', criado_em' : ''})
    VALUES (?, ?, ?, 'inventario', ?, ?${criadoEm ? ', ?' : ''})`).run(...[sku, tipo, qtd, variacao, vid, ...(criadoEm ? [criadoEm] : [])]);
  raw.prepare('UPDATE produtos SET qtd = qtd + ? WHERE sku = ?').run(qtd, sku);
};
const repartir = (sku, nome, n, vid) => { mov(sku, 'ajuste', -n); mov(sku, 'ajuste', n, nome, vid); };
const variacaoDaqui = (sku, lista, atributo = 'Cor') => lista.forEach(([nome, vid], i) => raw.prepare(
  `INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem)
   VALUES (?, ?, ?, ?, ?, ?, 'local')`).run(sku, nome, atributo, vid, i, JSON.stringify([{ atributo, valor: nome }])));
/** Anúncio COMPLETO por padrão (foto, texto, SEO, categoria): o que decide
 *  "pronto" nesta suíte é a duplicidade, não a falta de foto. */
const anuncio = (id, sku, { atributos = [], variantes, visibility = 'visible', categorias = [13], nome, imagens = 1 }) => {
  loja.estado.produtos.push({
    id, name: { pt: nome }, handle: { pt: `p-${id}` }, visibility, published: visibility === 'visible',
    attributes: atributos.map((a) => ({ pt: a })), categories: categorias.map((c) => ({ id: c })),
    images: Array.from({ length: imagens }, (_, i) => ({ id: id * 100 + i, src: `http://cdn/${id}-${i}.jpg`, position: i + 1 })),
    description: { pt: '<p>Texto factual.</p>' }, seo_title: { pt: `Titulo ${id}` }, seo_description: { pt: `Meta ${id}` },
    variants: variantes.map(([vid, vals, est, preco = '79.00']) => ({
      id: vid, sku, price: preco, values: vals.map((pt) => ({ pt })),
      inventory_levels: [{ location_id: 'LOC1', stock: est }],
    })),
  });
  raw.prepare('UPDATE produtos SET produto_id_loja = ?, url_loja = ?, visibilidade_loja = ?, visivel = ? WHERE sku = ?')
    .run(String(id), `p-${id}`, visibility, visibility === 'visible' ? 1 : 0, sku);
};
const foto = (sku, hash) => raw.prepare(`INSERT INTO produto_fotos (id, sku, conteudo_hash, original_key, estado)
  VALUES (?, ?, ?, ?, 'original')`).run(`f-${sku}-${hash}`, sku, hash, `orig/${sku}/${hash}.jpg`);

loja.estado.categorias = [{ id: 13, name: { pt: 'Brincos' }, parent: 0 }, { id: 15, name: { pt: 'Pingentes' }, parent: 0 }];

/* Duplicidade */
const GEMEO = 'Brinco Gêmeo Teste Banho de Ouro 18k';
peca('D1', 2, GEMEO, 'Brinco', 72);                                   // publicado (170308)
anuncio(400, 'D1', { nome: GEMEO, variantes: [[4001, [], 2, '72.00']] });
peca('D2', 4, GEMEO, 'Brinco', 72, 'Saldo inicial do cadastro de peças novas', '2026-09-26 21:08:22');   // oculto novo (186027)
anuncio(401, 'D2', { nome: GEMEO, visibility: 'hidden', variantes: [[4011, [], 4, '72.00']] });
peca('D3', 1, 'Brinco Único Teste Banho de Ouro 18k', 'Brinco', 72); // controle: oculto completo, sem gêmeo
anuncio(402, 'D3', { nome: 'Brinco Único Teste Banho de Ouro 18k', visibility: 'hidden', variantes: [[4021, [], 1, '72.00']] });
const PULSEIRA = 'Pulseira Cadeia Teste Medalha Banho de Ouro 18k';
peca('E1', 1, PULSEIRA, 'Pulseira', 194, 'Reconciliação (produto novo) sessão 8, item 2442', '2026-09-04 11:00:59');
anuncio(410, 'E1', { nome: PULSEIRA, visibility: 'hidden', variantes: [[4101, [], 1, '194.00']] });
peca('E2', 1, PULSEIRA, 'Pulseira', 159, 'Reconciliação (produto novo) sessão 8, item 2444', '2026-09-04 11:00:59');
anuncio(411, 'E2', { nome: PULSEIRA, visibility: 'hidden', variantes: [[4111, [], 1, '159.00']] });
const BERLOQUE = 'Berloque Escrita Teste Banho de Ouro 18k';
peca('F1', 2, BERLOQUE, 'Berloque', 49);                              // 244831
anuncio(420, 'F1', { nome: BERLOQUE, atributos: ['Cor'], variantes: [[4201, ['Banho de Ouro 18K'], 2, '49.00']] });
peca('F2', 1, BERLOQUE, 'Berloque', 44);                              // 221300, com peça em casa
anuncio(421, 'F2', { nome: BERLOQUE, visibility: 'hidden', atributos: ['Cor'], variantes: [[4211, ['Banho de Prata'], 1, '44.00']] });
const CORACAO = 'Colar Coração Teste Banho de Ouro 18k';
peca('G1', 1, CORACAO, 'Colar', 139);
anuncio(430, 'G1', { nome: CORACAO, variantes: [[4301, [], 1, '139.00']] });
peca('G2', 1, CORACAO, 'Pingente', 139);
anuncio(431, 'G2', { nome: CORACAO, visibility: 'hidden', variantes: [[4311, [], 1, '139.00']], categorias: [15] });
const FOTO = 'Anel Mesma Foto Teste Banho de Ouro 18k';
peca('H1', 1, FOTO, 'Anel', 99); anuncio(440, 'H1', { nome: FOTO, variantes: [[4401, [], 1, '99.00']] }); foto('H1', 'abc123');
peca('H2', 1, FOTO, 'Anel', 99); anuncio(441, 'H2', { nome: FOTO, visibility: 'hidden', variantes: [[4411, [], 1, '99.00']] }); foto('H2', 'abc123');
const MALHA = 'Pulseira Malha Teste Banho de Ouro 18k';
peca('P1', 1, MALHA, 'Pulseira', 79); anuncio(450, 'P1', { nome: MALHA, variantes: [[4501, [], 1, '79.00']] });
peca('P2', 2, MALHA, 'Pulseira', 119); anuncio(451, 'P2', { nome: MALHA, variantes: [[4511, [], 2, '119.00']] });
const ESGOTADO = 'Brinco Esgotado Teste Banho de Ouro 18k';
peca('S1', 1, ESGOTADO, 'Brinco', 59); anuncio(460, 'S1', { nome: ESGOTADO, variantes: [[4601, [], 1, '59.00']] });
peca('S2', 0, ESGOTADO, 'Brinco', 59); anuncio(461, 'S2', { nome: ESGOTADO, visibility: 'hidden', variantes: [[4611, [], 0, '59.00']] });
peca('U1', 3, GEMEO, 'Brinco', 72);                                   // sem anúncio, mesmo nome do publicado

/* Precedência — repartido pelo §64, conferência antiga ainda dizia "sem mapeamento" */
peca('V1', 2, 'Anel Repartido Teste Banho de Ouro 18k', 'Anel', 89);
anuncio(470, 'V1', { nome: 'Anel Repartido Teste Banho de Ouro 18k', atributos: ['Cor', 'Tamanho'],
  variantes: [[4701, ['Banho de Ouro 18k', 'n°16'], 1, '89.00'], [4702, ['Banho de Ouro 18k', 'n°18'], 1, '89.00']], categorias: [13] });
repartir('V1', 'Banho de Ouro 18k · n°16', 1, '4701'); repartir('V1', 'Banho de Ouro 18k · n°18', 1, '4702');

/* Unicidade — 318524 */
peca('W1', 1, 'Pingente Verde Teste Banho de Ouro 18k', 'Pingente', 69);
anuncio(480, 'W1', { nome: 'Pingente Verde Teste Banho de Ouro 18k', atributos: ['Cor'], variantes: [[4801, ['Verde Esmeralda'], 1, '69.00']], categorias: [15] });
variacaoDaqui('W1', [['Verde', 'local:w1-verde']]);
repartir('W1', 'Verde', 1, 'local:w1-verde');

/* Zero em casa — e casa por variação pelo inventário */
raw.prepare("INSERT INTO revendedoras (id, nome) VALUES (1, 'Luciana')").run();
raw.prepare("INSERT INTO maletas (id, rev_id, status, aberta_em) VALUES (1, 1, 'aberta', '2026-09-26')").run();
const naMaleta = (sku, n) => raw.prepare('INSERT INTO maleta_itens (maleta_id, sku, qtd, devolvida) VALUES (1, ?, ?, 0)').run(sku, n);
peca('Z1', 2, 'Anel Fora de Casa Teste Banho de Ouro 18k', 'Anel', 79);
anuncio(490, 'Z1', { nome: 'Anel Fora de Casa Teste Banho de Ouro 18k', atributos: ['Cor', 'Tamanho'],
  variantes: [[4901, ['Banho de Ouro 18k', 'n°16'], 2], [4902, ['Banho de Ouro 18k', 'n°18'], 1]] });
naMaleta('Z1', 2);
const inv = Number(raw.prepare(`INSERT INTO inventarios (status, iniciado_em, concluido_em, numero)
  VALUES ('concluido', '2026-10-06 13:52:12', '2999-01-01 00:00:00', 1)`).run().lastInsertRowid);
const contou = (sku, linhas, total) => {
  for (const [variacao, n] of linhas) {
    raw.prepare(`INSERT INTO inventario_contagem (inventario_id, sku, variacao, contado, origem) VALUES (?, ?, ?, ?, 'bipagem')`).run(inv, sku, variacao, n);
  }
  raw.prepare(`INSERT INTO inventario_resultado (inventario_id, sku, variacao, contado, esperado, situacao)
    VALUES (?, ?, '', ?, ?, 'conferido')`).run(inv, sku, total, total);
};
for (const [sku, pid] of [['M1', 500], ['M2', 501]]) {           // 218178
  peca(sku, 3, `Anel Maleta ${sku} Teste Banho de Ouro 18k`, 'Anel');
  anuncio(pid, sku, { nome: `Anel Maleta ${sku} Teste Banho de Ouro 18k`, atributos: ['Cor', 'Tamanho'],
    variantes: [[pid * 10 + 1, ['Banho de Ouro 18k', 'n°16'], 3], [pid * 10 + 2, ['Banho de Ouro 18k', 'n°18'], 0], [pid * 10 + 3, ['Banho de Ouro 18k', 'n°20'], 2]] });
  naMaleta(sku, 1);
  contou(sku, [['nº16', 1], ['Banho de Ouro 18k · n°18', 1]], 2);
  /* a estrutura que a sincronização grava a partir da loja */
  ['n°16', 'n°18', 'n°20'].forEach((aro, i) => raw.prepare(
    `INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, produto_id, ordem, valores_json, origem)
     VALUES (?, ?, 'Tamanho', ?, ?, ?, ?, 'loja')`).run(sku, `Banho de Ouro 18k · ${aro}`, String(pid * 10 + i + 1), String(pid), i,
    JSON.stringify([{ atributo: 'Cor', valor: 'Banho de Ouro 18k' }, { atributo: 'Tamanho', valor: aro }])));
}
mov('M2', 'ajuste', 0, null, null, '3000-01-01 00:00:00');      // M2 se moveu depois do inventário

raw.prepare(`INSERT INTO config (chave, valor) VALUES ('syncCorteEm', ?), ('nuvemshopSyncAtivo', 'true'), ('nuvemshopCatalogoAtivo', 'true')`)
  .run(JSON.stringify('2026-10-08T16:30:57.000Z'));
assert.ok(razaoFecha());
const vendasAntes = q1('SELECT COUNT(*) n FROM vendas').n;
const precosAntes = JSON.stringify(qa('SELECT sku, preco FROM produtos ORDER BY sku'));
const lojaPrecosAntes = JSON.stringify(loja.estado.produtos.map((p) => p.variants.map((v) => v.price)));

await api('POST', '/api/nuvemshop/estoque/conferir');
await cron();
await cron();

let fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
const item = (sku) => fila.itens.find((x) => x.sku === sku);
const pend = (sku) => (item(sku)?.nuvemshop?.pendencias || []).map((p) => p.chave);

console.log('\n=== 1. oculto × publicado com o mesmo nome (186027 × 170308) ===');
assert.ok(pend('D2').includes('duplicidade'), JSON.stringify(item('D2').nuvemshop));
assert.equal(item('D2').situacao, 'oculto');
assert.equal(item('D2').nuvemshop.duplicidade.tipo, 'inconclusivo');
assert.match(item('D2').nuvemshop.duplicidade.motivo, /mesmo modelo de D1/);
assert.match(item('D2').nuvemshop.duplicidade.proposta, /não ganha anúncio próprio.*D1/);
assert.equal(item('D3').situacao, 'pronto', JSON.stringify(item('D3').nuvemshop.pendencias));
prova('o gêmeo fica oculto com a pergunta; o controle sem gêmeo, igualmente completo, fica pronto');
let r = await api('POST', '/api/nuvemshop/catalogo/D2/publicar', {});
assert.equal(r.status, 409, JSON.stringify(r.corpo));
assert.ok(r.corpo.faltam.includes('duplicidade'), JSON.stringify(r.corpo));
assert.equal(produtoDaLoja(401).visibility, 'hidden');
prova('publicar o gêmeo é recusado (o lote publica um de cada vez pela mesma função) — continua hidden');

console.log('\n=== 2. oculto × oculto, preços diferentes no mesmo lote (481514 × 454953) ===');
for (const s of ['E1', 'E2']) {
  assert.ok(pend(s).includes('duplicidade'), s);
  assert.notEqual(item(s).situacao, 'pronto');
}
assert.match(item('E1').nuvemshop.duplicidade.com[0].prova, /preços diferentes \(R\$ 194 × R\$ 159\).*mesmo lote/);
prova('preço diferente não prova produto diferente: os dois seguem como pergunta, com o indício escrito');

console.log('\n=== 3. os dados resolvem sozinhos ===');
assert.equal(item('F2').nuvemshop.duplicidade.tipo, 'diferente');
assert.match(item('F2').nuvemshop.duplicidade.motivo, /Banho de Prata.*Banho de Ouro 18K/);
assert.ok(!pend('F2').includes('duplicidade'));
assert.equal(item('F2').situacao, 'pronto', JSON.stringify(item('F2').nuvemshop.pendencias));
prova('acabamento diferente na loja (Prata × Ouro): suspeita removida, peça segue o fluxo');
assert.equal(item('G2').nuvemshop.duplicidade.tipo, 'diferente');
assert.ok(!pend('G2').includes('duplicidade'));
prova('categoria diferente (Colar × Pingente): suspeita removida');
assert.equal(item('H2').nuvemshop.duplicidade.tipo, 'mesmo');
assert.ok(pend('H2').includes('duplicidade'));
assert.match(item('H2').nuvemshop.duplicidade.proposta, /não publicar o H2.*H1.*histórico/);
prova('mesma foto nos dois: "mesmo produto" — não publica, propõe o vínculo, nada é unido sozinho');

console.log('\n=== 4. publicado × publicado e oculto sem peça em casa: informação ===');
for (const s of ['P1', 'P2']) {
  assert.equal(item(s).nuvemshop.duplicidade.informativo, true);
  assert.ok(!pend(s).includes('duplicidade'));
  assert.equal(item(s).situacao, 'publicado');
}
assert.equal(item('S2').situacao, 'sem_estoque');
assert.ok(!pend('S2').includes('duplicidade'));
assert.equal(item('S2').nuvemshop.duplicidade.tipo, 'inconclusivo');
prova('publicado × publicado não vira pendência; oculto sem peça em casa guarda a suspeita como informação');

console.log('\n=== 5. sem anúncio × publicado ===');
assert.equal(item('U1').nuvemshop.criavel, false);
assert.ok(pend('U1').includes('duplicidade'));
await cron(10);
assert.equal(q1(`SELECT produto_id_loja FROM produtos WHERE sku = 'U1'`).produto_id_loja, null);
assert.ok(!loja.estado.produtos.some((p) => p.variants.some((v) => v.sku === 'U1')));
prova('a criação de ocultos (:10) não cria o gêmeo sem anúncio');

console.log('\n=== 6. Central de Pendências e Loja online ===');
const central = (await api('GET', '/api/pendencias')).corpo;
const naCentral = (chave) => central.pendencias.find((p) => p.chave === chave);
assert.equal(naCentral('duplicidade:D2')?.motivo, 'possivel_duplicidade', JSON.stringify(central.pendencias.map((p) => p.chave)));
assert.ok(naCentral('duplicidade:E1') && naCentral('duplicidade:H2'));
assert.ok(!naCentral('duplicidade:F2') && !naCentral('duplicidade:S2') && !naCentral('duplicidade:P1'));
assert.match(naCentral('publicacao:U1').explicacao, /mesmo modelo/);
prova('a Central lista só os gêmeos que pedem decisão — não os resolvidos, nem os publicados, nem sem peça');

console.log('\n=== 7. a conferência antiga não vence o estado atual (os 8 do §64) ===');
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'V1'`).status, 'sincronizado');
const confV1 = (status, em) => {
  raw.prepare(`DELETE FROM nuvemshop_conferencia WHERE sku = 'V1'`).run();
  raw.prepare(`INSERT INTO nuvemshop_conferencia (sku, status, motivo, conferido_em) VALUES ('V1', ?, ?, ?)`)
    .run(status, 'O estoque daqui ainda não está repartido entre as variações. (sem_reparticao)', em);
};
const sincronizadoEm = q1(`SELECT sincronizado_em FROM nuvemshop_fila WHERE sku = 'V1'`).sincronizado_em;
confV1('variante_sem_mapeamento', '2026-01-01T00:00:00.000Z');
fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
assert.ok(!pend('V1').includes('estoque_variacao'), JSON.stringify(item('V1').nuvemshop.pendencias));
assert.equal(item('V1').nuvemshop.conferenciaVencida, true);
prova('fila sincronizada DEPOIS da conferência: o "sem mapeamento" antigo não recria a pendência');
confV1('variante_sem_mapeamento', '2999-12-31T00:00:00.000Z');
fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
assert.ok(pend('V1').includes('estoque_variacao'));
prova('conferência NOVA continua achando divergência normalmente', `fila ${sincronizadoEm}`);
confV1('variante_sem_mapeamento', '2026-01-01T00:00:00.000Z');
raw.prepare(`UPDATE nuvemshop_fila SET status = 'revisao' WHERE sku = 'V1'`).run();
fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
assert.ok(pend('V1').includes('estoque_variacao'));
raw.prepare(`UPDATE nuvemshop_fila SET status = 'sincronizado' WHERE sku = 'V1'`).run();
prova('fila em revisão volta a ser pendência, qualquer que seja a data da conferência');

console.log('\n=== 8. Verde × Verde Esmeralda (318524) ===');
assert.ok(!pend('W1').includes('variacao'), JSON.stringify(item('W1').nuvemshop.pendencias));
assert.deepEqual(item('W1').nuvemshop.equivalenciasOperacionais, [{ loja: 'Verde Esmeralda', daqui: 'Verde', regra: 'unicidade', bloqueia: false }]);
assert.equal(estoque(produtoDaLoja(480).variants[0]), 1);
assert.equal(q1(`SELECT nome FROM produto_variacoes WHERE sku = 'W1'`).nome, 'Verde');
assert.equal(produtoDaLoja(480).variants[0].values[0].pt, 'Verde Esmeralda');
assert.equal(q1(`SELECT variante_id FROM produto_variacoes WHERE sku = 'W1'`).variante_id, 'local:w1-verde');
prova('única variação dos dois lados: estoque anda, nada bloqueia, nenhum nome reescrito, nenhum vínculo gravado');
produtoDaLoja(480).variants.push({ id: 4802, sku: 'W1', price: '69.00', values: [{ pt: 'Verde Claro' }], inventory_levels: [{ location_id: 'LOC1', stock: 0 }] });
await api('POST', '/api/nuvemshop/estoque/conferir');
fila = (await api('GET', '/api/catalogo/publicacao')).corpo;
assert.ok(!item('W1').nuvemshop.equivalenciasOperacionais?.length);
const pW1 = item('W1').nuvemshop.pendencias.find((p) => p.chave === 'variacao');
assert.ok(pW1, JSON.stringify(item('W1').nuvemshop.pendencias));
assert.match(pW1.motivo, /pode ser a variação "Verde Esmeralda"/);
assert.equal(item('W1').nuvemshop.variacoesAutomaticas, false);
r = await admin('catalogo_variantes');
assert.equal(produtoDaLoja(480).variants.length, 2, JSON.stringify(r));
assert.ok(!produtoDaLoja(480).variants.some((v) => v.values[0].pt === 'Verde'));
prova('o anúncio ganhou "Verde Claro": a equivalência se desfaz, a dúvida volta para gente, e "Verde" NÃO é criada na loja');

console.log('\n=== 9. zero em casa é zero na loja ===');
/* A loja começou com n°16 = 2 e n°18 = 1; a entrada pôs o código na fila,
   e a rodada comum do cron já mandou o zero — sem ação de ninguém. */
assert.equal(estoques(490), 'Banho de Ouro 18k · n°16=0, Banho de Ouro 18k · n°18=0');
assert.equal(produtoDaLoja(490).visibility, 'visible');
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'Z1'`).status, 'sincronizado');
assert.equal(JSON.parse(q1(`SELECT resultado_json FROM nuvemshop_fila WHERE sku = 'Z1'`).resultado_json).regra, 'zero_em_casa');
prova('as 2 peças estão em maleta sem variação: as duas variantes vão a 0, o anúncio continua publicado');
const pura = decidirEstoqueDoSku({ sku: 'X', desc: 'x', qtd: 1, casa: 0 },
  { produtoId: 1, varianteId: 11, estoque: 3, locais: [], produtos: new Set(['1']), variantesSemSku: 0,
    variantes: [{ varianteId: 11, produtoId: 1, nome: '', estoque: 3, locais: [] }] }, null);
assert.deepEqual(pura.mudancas.map((m) => [m.de, m.para]), [[3, 0]]);
prova('variante única sem peça em casa: 3 → 0');

console.log('\n=== 10. a casa de cada variação pelo inventário (218178) ===');
/* A entrada pôs M1 na fila e a rodada comum do cron já aplicou a regra. */
const M1_CERTO = 'Banho de Ouro 18k · n°16=1, Banho de Ouro 18k · n°18=1, Banho de Ouro 18k · n°20=0';
const M_VELHO = 'Banho de Ouro 18k · n°16=3, Banho de Ouro 18k · n°18=0, Banho de Ouro 18k · n°20=2';
assert.equal(estoques(500), M1_CERTO);
const resM1 = JSON.parse(q1(`SELECT resultado_json FROM nuvemshop_fila WHERE sku = 'M1'`).resultado_json);
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'M1'`).status, 'sincronizado');
assert.equal(resM1.regra, 'casa_pelo_inventario');
assert.equal(resM1.pendenteNaRazao, 'maleta');
prova('n°16 3→1, n°18 0→1, n°20 2→0: cada variante recebe o que foi bipado dela; a não bipada vai a 0');
assert.equal(estoques(501), M_VELHO);
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'M2'`).status, 'revisao');
prova('M2 se moveu depois do inventário: sem prova, fica em revisão e a loja não é tocada');
/* PROD antes do deploy: o código parado em revisão pela regra antiga, com o
   número velho na loja. Nenhum movimento o tiraria de lá. */
produtoDaLoja(500).variants.forEach((v, i) => { v.inventory_levels[0].stock = [3, 0, 2][i]; });
raw.prepare(`UPDATE nuvemshop_fila SET status = 'revisao' WHERE sku = 'M1'`).run();
const movAntes = q1('SELECT COUNT(*) n FROM movimentos').n;
r = await admin('reenviar_estoque', { seco: true });
assert.deepEqual(r.skus, ['M1', 'M2']);
assert.equal(estoques(500), M_VELHO);
prova('reenvio seco: diz quais códigos em revisão iriam, não escreve');
r = await admin('reenviar_estoque', { skus: ['M1', 'M2'] });
/* A loja está ABAIXO do último envio no n°18 (0 < 1) e o número novo sobe:
   pode ser venda do site ainda não puxada. A cautela do "Tentar novamente"
   adia; a rodada seguinte do cron puxa os pedidos e só então envia. */
assert.equal(estoques(500), M_VELHO, JSON.stringify(r));
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'M1'`).status, 'pendente');
await cron();
assert.equal(estoques(500), M1_CERTO);
assert.equal(estoques(501), M_VELHO);
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'M2'`).status, 'revisao');
prova('reenvio real: a cautela adia, o cron puxa pedidos e corrige; o sem prova continua intocado');
assert.equal(q1('SELECT COUNT(*) n FROM movimentos').n, movAntes);
assert.equal(q1(`SELECT COUNT(*) n FROM movimentos WHERE sku = 'M1' AND variacao IS NOT NULL`).n, 0);
const c2 = (await api('GET', '/api/pendencias')).corpo;
assert.ok(c2.pendencias.some((p) => p.tipo === 'maleta' && p.sku === 'M1'), 'a pergunta da maleta continua');
prova('a razão não muda: a pergunta "qual variação a revendedora levou?" continua na Central');

console.log('\n=== 11. o que nunca muda ===');
assert.ok(razaoFecha());
assert.equal(q1('SELECT COUNT(*) n FROM vendas').n, vendasAntes);
assert.equal(JSON.stringify(qa('SELECT sku, preco FROM produtos ORDER BY sku')), precosAntes);
assert.equal(JSON.stringify(loja.estado.produtos.filter((p) => p.id < 9000).slice(0, JSON.parse(lojaPrecosAntes).length).map((p) => p.variants.filter((v) => v.id !== 4802).map((v) => v.price))), lojaPrecosAntes);
assert.equal(produtoDaLoja(401).visibility, 'hidden');
assert.equal(produtoDaLoja(402).visibility, 'hidden');
prova('razão fecha, nenhuma venda, nenhum preço daqui ou da loja mudou, nada foi publicado sozinho');

console.log('\n=== 12. função pura: comparação sem a loja ===');
const ident = {
  produtos: [
    { sku: 'A', desc: 'Anel Teste nº17 Banho de Ouro 18k', cat: 'Anel', preco: 89, qtd: 1 },
    { sku: 'B', desc: 'Anel Teste Banho de Ouro 18k', cat: 'Anel', preco: 89, qtd: 0, produto_id_loja: '9', visibilidade_loja: 'visible' },
  ],
  loja: [{ sku_norm: 'B', produto_id: '9', produto_nome: 'Anel Teste Banho de Ouro 18k', nome: 'n°18', valores_json: '[]', produto_visivel: 1 }],
  entradas: new Map(), fotos: new Map(),
};
const sA = suspeitasDeDuplicidade(ident).get('A');
assert.equal(sA.tipo, 'tamanho');
assert.equal(sA.decidir, true);
assert.match(sA.motivo, /outro tamanho/);
prova('o mesmo modelo em outro aro (334078 nº27 × 334079) é pergunta de estrutura, não duplicata');

loja.fechar?.();
console.log(`\n${provas} provas — §66 duplicidade, precedência, unicidade e zero em casa ok`);
process.exit(0);
