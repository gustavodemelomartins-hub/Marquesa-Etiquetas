/** Descartar um inventário (`POST /api/inventarios/:id/cancelar`) contra o
 *  schema real e o módulo real, sem Worker.
 *
 *  O inventário pausado bloqueia abrir outro. Descartar é a saída: ele vira
 *  `cancelado`, continua no histórico e nada do que foi contado chega ao
 *  estoque. As provas:
 *
 *   1. abrir → pausar → continuar: a contagem continua lá;
 *   2. abrir → pausar → descartar: status `cancelado`;
 *   3. descartar não muda estoque, não cria movimento nem saída;
 *   4. o descartado continua no histórico, com a contagem guardada;
 *   5. depois de descartar, um inventário novo pode ser aberto;
 *   6. recusar a confirmação é não chamar a rota — o inventário fica intacto
 *      (a parte de tela está em frontend/src/features/inventario/descartar.test.tsx);
 *   7. concluído e cancelado não aceitam descarte, e cancelado não aceita ajuste.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de passar em silêncio.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.log('  --   node:sqlite indisponível nesta versão do Node — teste NÃO rodou');
  process.exit(0);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');

const raw = new DatabaseSync(':memory:');
raw.exec(ler('api/schema.sql'));
for (const comando of ler('api/migracao-inventario-4-4.sql')
  .replace(/^--.*$/gm, '').split(';').map((c) => c.trim()).filter(Boolean)) {
  try { raw.exec(comando); } catch (e) {
    if (!/duplicate column name/i.test(String(e.message))) throw e;
  }
}

let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

/* ── adaptador mínimo do D1 sobre node:sqlite (o mesmo do inventario-4-4-test). */
const prepararStmt = (sql) => {
  let binds = [];
  const valores = () => binds.map((v) => (
    v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v)));
  const stmt = {
    sql,
    bind(...v) { binds = v; return stmt; },
    async all() { return { results: raw.prepare(sql).all(...valores()) }; },
    async first(coluna) {
      const r = raw.prepare(sql).get(...valores()) ?? null;
      return coluna === undefined ? r : (r == null ? null : r[coluna]);
    },
    async run() { return { meta: raw.prepare(sql).run(...valores()) }; },
    executar() { return raw.prepare(sql).run(...valores()); },
  };
  return stmt;
};
const db = {
  prepare: prepararStmt,
  async batch(stmts) { return (stmts || []).map((s) => ({ meta: s.executar() })); },
};
const corpo = async (r) => (r && typeof r.json === 'function' ? r.json() : r);
const status = (r) => (r && typeof r.status === 'number' ? r.status : 200);

/* ── catálogo, com a entrada pela razão para ela nascer fechada. */
const PECAS = [['100001', 'Colar Simples', 79, 5], ['100002', 'Pulseira Elos', 59, 3]];
for (const [sku, desc, preco, qtd] of PECAS) {
  raw.prepare("INSERT INTO produtos (sku,desc,cat,preco,qtd,status) VALUES (?,?,'Colar',?,?,'ativo')")
    .run(sku, desc, preco, qtd);
  raw.prepare("INSERT INTO movimentos (sku,tipo,qtd,origem,criado_em) VALUES (?,'entrada',?,'importacao','2026-09-01 09:00:00')")
    .run(sku, qtd);
}

const razaoAberta = () => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.s, 0)`).get().n;
const retratoDoEstoque = () => JSON.stringify({
  produtos: raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all(),
  movimentos: raw.prepare('SELECT * FROM movimentos ORDER BY id').all(),
  saidas: raw.prepare('SELECT * FROM saidas_sem_faturamento ORDER BY id').all(),
});

const inv = await import('../api/src/inventario.js');

assert.equal(razaoAberta(), 0, 'a razão já nasceu aberta');
const ESTOQUE_ANTES = retratoDoEstoque();

/* ── 1. abrir → pausar → continuar. */
const aberto = await inv.abrirInventario(db);
assert.equal(status(aberto), 201);
const ID = (await corpo(aberto)).id;
assert.equal(status(await inv.contarItem(db, ID, { sku: '100001', contado: 2 })), 200);
assert.equal(status(await inv.contarItem(db, ID, { sku: '100002', contado: 0 })), 200);
assert.equal((await corpo(await inv.pausarInventario(db, ID))).status, 'pausado');
assert.equal((await corpo(await inv.listarInventarios(db)))[0].status, 'pausado');
assert.equal((await corpo(await inv.retomarInventario(db, ID))).status, 'aberto');
const retomado = await corpo(await inv.detalheInventario(db, ID));
assert.equal(retomado.status, 'aberto');
assert.equal(retomado.contagem.length, 2, 'retomar perdeu contagem');
prova('abrir → pausar → continuar: volta a "aberto" com as duas contagens');

/* Um pausado bloqueia o seguinte — é o problema que o descarte resolve. */
await inv.pausarInventario(db, ID);
const bloqueado = await inv.abrirInventario(db);
assert.equal(status(bloqueado), 409);
assert.equal((await corpo(bloqueado)).id, ID);
prova('um inventário pausado impede abrir outro (409 com o id dele)');

/* ── 6. voltar da confirmação = não chamar a rota: nada muda. */
const antesDeVoltar = JSON.stringify(raw.prepare('SELECT * FROM inventarios WHERE id = ?').get(ID));
assert.equal(JSON.stringify(raw.prepare('SELECT * FROM inventarios WHERE id = ?').get(ID)), antesDeVoltar);
assert.equal((await corpo(await inv.detalheInventario(db, ID))).status, 'pausado');
prova('sem a chamada de cancelar, o inventário segue pausado e intacto');

/* ── 2. abrir → pausar → descartar. */
const descartado = await inv.cancelarInventario(db, ID);
assert.equal(status(descartado), 200);
assert.deepEqual(await corpo(descartado), { ok: true });
const linha = raw.prepare('SELECT status, concluido_em FROM inventarios WHERE id = ?').get(ID);
assert.equal(linha.status, 'cancelado');
assert.ok(linha.concluido_em, 'o descarte não registrou quando aconteceu');
prova('descartar um pausado deixa o inventário "cancelado", com a data');

/* ── 3. estoque antes = estoque depois. */
assert.equal(retratoDoEstoque(), ESTOQUE_ANTES, 'descartar mexeu no estoque');
assert.equal(razaoAberta(), 0);
prova('descartar não muda produtos.qtd, não cria movimento nem saída; a razão fecha');

/* ── 4. continua no histórico, com o que foi contado guardado. */
const lista = await corpo(await inv.listarInventarios(db));
const noHistorico = lista.find((i) => i.id === ID);
assert.ok(noHistorico, 'o descartado sumiu do histórico');
assert.equal(noHistorico.status, 'cancelado');
const detalhe = await corpo(await inv.detalheInventario(db, ID));
assert.equal(detalhe.status, 'cancelado');
assert.equal(detalhe.contagem.length, 2, 'descartar apagou a contagem');
prova('o descartado continua no histórico como cancelado, com a contagem preservada');

/* ── 5. agora dá para abrir outro. */
const novo = await inv.abrirInventario(db);
assert.equal(status(novo), 201);
const NOVO = (await corpo(novo)).id;
assert.notEqual(NOVO, ID);
prova('depois do descarte, um inventário novo abre');

/* ── 7. o que já terminou não é descartado, e cancelado não vira ajuste. */
assert.equal(status(await inv.cancelarInventario(db, ID)), 409, 'cancelou duas vezes');
assert.equal(status(await inv.pausarInventario(db, ID)), 409, 'pausou um cancelado');
assert.equal(status(await inv.retomarInventario(db, ID)), 409, 'retomou um cancelado');
assert.equal(status(await inv.contarItem(db, ID, { sku: '100001', contado: 1 })), 409, 'contou num cancelado');
assert.equal(status(await inv.concluirInventario(db, ID)), 409, 'concluiu um cancelado');
assert.equal(status(await inv.ajustarInventario(db, ID, { itens: [{ sku: '100002', qtd: -3 }] })), 409,
  'aplicou ajuste de um inventário cancelado');
assert.equal(status(await inv.concluirInventario(db, NOVO)), 200);
assert.equal(status(await inv.cancelarInventario(db, NOVO)), 409, 'descartou um concluído');
assert.equal(raw.prepare('SELECT status FROM inventarios WHERE id = ?').get(NOVO).status, 'concluido');
assert.equal(status(await inv.cancelarInventario(db, 999)), 404);
assert.equal(retratoDoEstoque(), ESTOQUE_ANTES, 'alguma recusa mexeu no estoque');
assert.equal(razaoAberta(), 0);
prova('concluído e cancelado recusam descarte (409); cancelado recusa contar, concluir e ajustar');

console.log(`\n${provas} provas — descartar inventário`);
