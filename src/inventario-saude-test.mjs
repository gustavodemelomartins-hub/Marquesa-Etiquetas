/** Saúde do estoque no servidor (03/10/2026) — `resumoInventario` sobre o
 *  `api/schema.sql` real num SQLite em memória.
 *
 *   A  histórico zerado: sem "último", diasDesde null (a tela diz "primeira
 *      conferência pendente", nunca saudável)
 *   B  cancelado não conta como conferência
 *   C  concluído: a data é a dele, no dia de São Paulo, e o prazo vale
 *   D  concluído além do prazo: vencido
 *
 *    node src/inventario-saude-test.mjs
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resumoInventario } from '../api/src/inventario.js';
import { diaOperacional } from '../api/src/fuso.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = new DatabaseSync(':memory:');
raw.exec(readFileSync(join(RAIZ, 'api/schema.sql'), 'utf8'));
const preparar = (sql) => {
  const st = { sql, args: [] };
  st.bind = (...a) => ({ ...st, args: a });
  st.first = async function () { return raw.prepare(this.sql).get(...this.args) ?? null; };
  return st;
};
const db = { prepare: preparar };
const utc = (diasAtras) => new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 19).replace('T', ' ');
let n = 0;

/* A */
let r = await resumoInventario(db, 45);
assert.equal(r.ultimoId, null); assert.equal(r.ultimoEm, null); assert.equal(r.diasDesde, null);
assert.equal(r.vencido, true, 'nunca contou ainda é "precisa de ação", não saúde');
n++;

/* B */
raw.prepare("INSERT INTO inventarios (status, iniciado_em, concluido_em) VALUES ('cancelado', ?, ?)").run(utc(2), utc(2));
r = await resumoInventario(db, 45);
assert.equal(r.ultimoId, null, 'cancelado não é conferência');
assert.equal(r.diasDesde, null);
n++;

/* C */
const quando = utc(3);
const { id } = raw.prepare("INSERT INTO inventarios (status, iniciado_em, concluido_em) VALUES ('concluido', ?, ?) RETURNING id").get(quando, quando);
r = await resumoInventario(db, 45);
assert.equal(r.ultimoId, id);
assert.equal(r.ultimoEm, diaOperacional(quando), 'a data é a do concluído, no dia de São Paulo');
assert.equal(r.diasDesde, 3);
assert.equal(r.vencido, false);
n++;

/* D */
r = await resumoInventario(db, 3);
assert.equal(r.vencido, true, 'no dia do prazo já venceu');
n++;

console.log(`saúde do estoque (servidor): ${n}/${n} ok`);
