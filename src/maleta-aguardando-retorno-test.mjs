/** §67 — inventário em casa ≠ variação das peças em maleta.
 *
 *  Regra confirmada pela Sthefany (10/10/2026): o que o inventário bipou com
 *  variação era o que estava EM CASA. A peça que já estava com a revendedora
 *  não tem variação conhecida — e ninguém consegue dizê-la até a maleta
 *  voltar. Worker real + loja falsa + D1 em memória:
 *
 *    estado      a peça da maleta sai da lista de pendências, do total e do
 *                sino, e vai para "Aguardando retorno de maleta"
 *    total       o código continua com todas as peças (casa + revendedora)
 *    loja        recebe só o que está provado em casa por variação; a
 *                quantidade da maleta não é distribuída
 *    retorno     no acerto, a peça que VOLTOU é conferida: a variação dela é
 *                gravada, ela entra no saldo daquela variação em casa, e a
 *                loja recebe o número novo
 *    nunca       nada é deduzido por exclusão, nada é inventado
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
    try { const s = stmts.map((x) => x.executar()); raw.exec('RELEASE lote'); return s; } catch (e) { raw.exec('ROLLBACK TO lote'); raw.exec('RELEASE lote'); throw e; }
  },
};

const loja = await subirLojaFalsa(8828);
const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const env = {
  DB, API_KEY: 'k', NUVEMSHOP_STORE_ID: '123', NUVEMSHOP_TOKEN: 'token-falso',
  NUVEMSHOP_BASE: loja.url, NUVEMSHOP_WRITES_ENABLED: 'true',
};
let pendentes = [];
const ctx = { waitUntil(p) { pendentes.push(p); }, passThroughOnException() {} };
const esperarFundo = async () => { const p = pendentes; pendentes = []; await Promise.all(p); };
const api = async (metodo, caminho, corpo) => {
  const r = await worker.fetch(new Request(`http://local${caminho}`, {
    method: metodo, headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env, ctx);
  await esperarFundo();
  return { status: r.status, corpo: await r.json().catch(() => null) };
};
const cron = async (minuto = 35) => {
  const original = Date.prototype.getUTCMinutes;
  Date.prototype.getUTCMinutes = () => minuto;
  try { await worker.scheduled({ cron: '*/10 * * * *' }, env, ctx); await esperarFundo(); } finally { Date.prototype.getUTCMinutes = original; }
};
const q1 = (sql, ...a) => raw.prepare(sql).get(...a);
const qa = (sql, ...a) => raw.prepare(sql).all(...a);
let provas = 0;
const prova = (t, extra = '') => { provas += 1; console.log(`  ok   ${t}${extra ? '  → ' + extra : ''}`); };
const razaoFecha = () => qa(`SELECT p.sku FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m
  ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.s, 0)`).length === 0;
const estoques = (id) => loja.estado.produtos.find((p) => p.id === id).variants
  .map((v) => `${v.values.map((x) => x.pt).join(' · ')}=${v.inventory_levels[0].stock}`).join(', ');
const saldo = (sku) => Object.fromEntries(qa(`SELECT COALESCE(variacao, '∅') v, SUM(qtd) s FROM movimentos WHERE sku = ? GROUP BY variacao`, sku)
  .map((r) => [r.v, r.s]).filter(([, s]) => s !== 0));

/* ── o caso do 408061: 5 anéis; 2 em casa bipados no inventário (nº18 e nº24);
      3 com a revendedora desde antes, sem aro informado ── */
const peca = (sku, qtd, desc, preco = 79) => {
  raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, 'Anel', ?, ?, 'ativo')").run(sku, desc, preco, qtd);
  raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES (?, 'entrada', ?, 'importacao', 'Saldo inicial')").run(sku, qtd);
};
const variacoes = (sku, pid, aros) => aros.forEach(([aro, vid], i) => raw.prepare(
  `INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, produto_id, ordem, valores_json, origem)
   VALUES (?, ?, 'Tamanho', ?, ?, ?, ?, 'loja')`).run(sku, aro, vid, String(pid), i, JSON.stringify([{ atributo: 'Tamanho', valor: aro }])));
const anuncio = (id, sku, variantes) => {
  loja.estado.produtos.push({
    id, name: { pt: `Anel ${sku}` }, handle: { pt: `p-${id}` }, visibility: 'visible', published: true,
    attributes: [{ pt: 'Tamanho' }], categories: [{ id: 12 }], images: [{ id: 1, src: 'http://cdn/x.jpg', position: 1 }],
    description: { pt: '<p>x</p>' }, seo_title: { pt: 't' }, seo_description: { pt: 'd' },
    variants: variantes.map(([vid, aro, est]) => ({ id: Number(vid), sku, price: '79.00', values: [{ pt: aro }], inventory_levels: [{ location_id: 'LOC1', stock: est }] })),
  });
  raw.prepare(`UPDATE produtos SET produto_id_loja = ?, url_loja = ?, visibilidade_loja = 'visible', visivel = 1 WHERE sku = ?`).run(String(id), `p-${id}`, sku);
};
const repartir = (sku, aro, vid, n) => {
  raw.prepare(`INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES (?, 'ajuste', ?, 'variacao', 'Inventário #1 (concluído em x): a bipagem por variação provou')`).run(sku, -n);
  raw.prepare(`INSERT INTO movimentos (sku, tipo, qtd, origem, variacao, variante_id, obs) VALUES (?, 'ajuste', ?, 'variacao', ?, ?, 'Inventário #1 (concluído em x): a bipagem por variação provou')`).run(sku, n, aro, vid);
};

raw.prepare("INSERT INTO revendedoras (id, nome) VALUES (1, 'Luciana'), (2, 'Andreia')").run();
peca('X1', 5, 'Anel Aparador Teste Banho de Ouro 18k');
variacoes('X1', 900, [['nº18', '9001'], ['nº24', '9002']]);
anuncio(900, 'X1', [['9001', 'nº18', 3], ['9002', 'nº24', 2]]);
repartir('X1', 'nº18', '9001', 1); repartir('X1', 'nº24', '9002', 1);
raw.prepare("INSERT INTO maletas (id, rev_id, status, aberta_em) VALUES (1, 1, 'aberta', '2026-09-26')").run();
raw.prepare("INSERT INTO maleta_itens (maleta_id, sku, qtd, devolvida, preco_envio) VALUES (1, 'X1', 3, 0, 79)").run();
raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, maleta_id, revendedora_id) VALUES ('X1', 'consignacao', 0, 'maleta', 1, 1)").run();
const inv = Number(raw.prepare(`INSERT INTO inventarios (status, iniciado_em, concluido_em, numero) VALUES ('concluido', '2026-10-06', '2999-01-01 00:00:00', 1)`).run().lastInsertRowid);
for (const [aro, n] of [['nº18', 1], ['nº24', 1]]) raw.prepare(`INSERT INTO inventario_contagem (inventario_id, sku, variacao, contado, origem) VALUES (?, 'X1', ?, ?, 'bipagem')`).run(inv, aro, n);
raw.prepare(`INSERT INTO inventario_resultado (inventario_id, sku, variacao, contado, esperado, situacao) VALUES (?, 'X1', '', 2, 2, 'conferido')`).run(inv);
/* Y1: código de UMA variação em casa — e ainda assim não se deduz a da maleta */
peca('Y1', 3, 'Anel Unico Teste Banho de Ouro 18k');
variacoes('Y1', 910, [['nº16', '9101'], ['nº20', '9102']]);
anuncio(910, 'Y1', [['9101', 'nº16', 2], ['9102', 'nº20', 1]]);
repartir('Y1', 'nº16', '9101', 2);
raw.prepare("INSERT INTO maletas (id, rev_id, status, aberta_em) VALUES (2, 2, 'aberta', '2026-09-26')").run();
raw.prepare("INSERT INTO maleta_itens (maleta_id, sku, qtd, devolvida, preco_envio) VALUES (2, 'Y1', 1, 0, 79)").run();
raw.prepare(`INSERT INTO config (chave, valor) VALUES ('syncCorteEm', ?), ('nuvemshopSyncAtivo', 'true'), ('nuvemshopCatalogoAtivo', 'true')`)
  .run(JSON.stringify('2026-10-08T16:30:57.000Z'));
assert.ok(razaoFecha());
const vendasAntes = q1('SELECT COUNT(*) n FROM vendas').n;
const precosAntes = JSON.stringify(qa('SELECT sku, preco FROM produtos ORDER BY sku'));

await api('POST', '/api/nuvemshop/estoque/conferir');
await cron();

console.log('\n=== 1-3. peça com revendedora, variação não informada: estado, não tarefa ===');
let central = (await api('GET', '/api/pendencias')).corpo;
assert.ok(!central.pendencias.some((p) => p.tipo === 'maleta'), JSON.stringify(central.pendencias.map((p) => p.chave)));
assert.equal(central.resumo.total, central.pendencias.filter((p) => p.status === 'aberta').length);
const ag = central.aguardandoRetorno;
const x1 = ag.itens.find((i) => i.sku === 'X1');
assert.deepEqual({ qtd: x1.qtd, variacao: x1.variacao, situacao: x1.situacao, maleta: x1.maletaId, rev: x1.revendedora },
  { qtd: 3, variacao: 'Não informada', situacao: 'Aguardando conferência no retorno', maleta: 1, rev: 'Luciana' });
assert.equal(ag.codigos, 2);
assert.equal(ag.pecas, 4);
prova('a peça da maleta vai para "Aguardando retorno de maleta", fora do total e do sino');

console.log('\n=== 6. o total não perde peça nenhuma ===');
let estado = (await api('GET', '/api/state')).corpo;
const pX = estado.produtos.find((p) => p.sku === 'X1');
assert.deepEqual({ qtd: pX.qtd, consignado: pX.consignado, disponivel: pX.disponivel }, { qtd: 5, consignado: 3, disponivel: 2 });
assert.deepEqual(estado.maletas.find((m) => m.id === 1).variacoes, {});
prova('X1: 2 em casa + 3 com revendedoras = 5; a maleta não "sabe" variação nenhuma');

console.log('\n=== 5. loja: só o que está provado em casa ===');
assert.equal(estoques(900), 'nº18=1, nº24=1');
assert.equal(estoques(910), 'nº16=2, nº20=1', 'Y1 sem prova do inventário: nada inventado');
assert.equal(q1(`SELECT status FROM nuvemshop_fila WHERE sku = 'Y1'`).status, 'revisao');
prova('X1: a loja tem 1 + 1 (a casa bipada); as 3 da maleta não são distribuídas', estoques(900));

console.log('\n=== 1-2. nada é deduzido ===');
assert.equal(q1('SELECT COUNT(*) n FROM maleta_item_variacoes').n, 0);
assert.deepEqual(saldo('Y1'), { 'nº16': 2, '∅': 1 });
prova('Y1 só tem nº16 em casa — e a peça da maleta NÃO vira nº16 por exclusão');

console.log('\n=== 4. no retorno, a variação da peça que voltou é conferida ===');
const doc = (variacoes) => ({ devolvidas: { X1: 2 }, faltas: [{ sku: 'X1', linhas: [{ qtd: 1, destino: 'vendida' }] }], ...(variacoes ? { variacoes } : {}) });
let r = await api('POST', '/api/maletas/1/acerto', doc({ X1: [{ variacao: 'nº24', qtd: 1 }] }));
assert.equal(r.status, 400); assert.match(r.corpo.erro, /somam 1, e voltaram 2/);
r = await api('POST', '/api/maletas/1/acerto', doc({ X1: [{ variacao: 'nº30', qtd: 2 }] }));
assert.equal(r.status, 400); assert.match(r.corpo.erro, /não é uma variação cadastrada/);
assert.equal(q1(`SELECT status FROM maletas WHERE id = 1`).status, 'aberta');
prova('variação que não fecha com o que voltou, ou que não existe: recusado, nada gravado');
r = await api('POST', '/api/maletas/1/acerto', doc({ X1: [{ variacao: 'nº24', varianteId: '9002', qtd: 2 }] }));
assert.equal(r.status, 200, JSON.stringify(r.corpo));
assert.deepEqual(r.corpo.acerto.variacoesConferidas, [{ sku: 'X1', variacao: 'nº24', qtd: 2, atribuidas: 2 }]);
assert.deepEqual(saldo('X1'), { 'nº18': 1, 'nº24': 3 });
assert.equal(q1(`SELECT qtd FROM produtos WHERE sku = 'X1'`).qtd, 4);
assert.equal(q1(`SELECT COUNT(*) n FROM movimentos WHERE sku = 'X1' AND tipo = 'devolucao' AND variacao = 'nº24'`).n, 1);
assert.equal(q1(`SELECT variacao FROM venda_itens WHERE sku = 'X1'`).variacao, null);
prova('2 voltaram conferidas nº24: entram no saldo nº24 em casa; a vendida segue sem variação (histórico)', JSON.stringify(saldo('X1')));
await cron();
assert.equal(estoques(900), 'nº18=1, nº24=3');
central = (await api('GET', '/api/pendencias')).corpo;
assert.ok(!central.aguardandoRetorno.itens.some((i) => i.sku === 'X1'));
prova('a loja recebe nº24 = 3; a maleta encerrada sai de "aguardando retorno"', estoques(900));

console.log('\n=== acerto sem a conferência (painel clássico): continua funcionando ===');
r = await api('POST', '/api/maletas/2/acerto', { devolvidas: { Y1: 1 }, faltas: [] });
assert.equal(r.status, 200, JSON.stringify(r.corpo));
assert.deepEqual(saldo('Y1'), { 'nº16': 2, '∅': 1 });
assert.equal(r.corpo.acerto.variacoesConferidas, undefined);
prova('sem variação informada no retorno, a peça volta "sem variação" — nada é escolhido por ela');

console.log('\n=== o que nunca muda ===');
assert.ok(razaoFecha());
assert.equal(JSON.stringify(qa('SELECT sku, preco FROM produtos ORDER BY sku')), precosAntes);
assert.equal(q1(`SELECT COUNT(*) n FROM vendas WHERE origem <> 'acerto'`).n, vendasAntes);
prova('razão fecha, preço igual, nenhuma venda antiga tocada');

loja.fechar?.();
console.log(`\n${provas} provas — §67 maleta aguardando retorno ok`);
process.exit(0);
