#!/usr/bin/env node
/** Uma rota GET do Worker real sobre uma cópia local do banco — somente
 *  leitura, para conferir a resposta com dados reais sem publicar nada.
 *
 *    node scripts/reconciliacao/consultar.mjs <banco.sqlite> <caminho> [...caminhos]
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [banco, ...caminhos] = process.argv.slice(2);
const raw = new DatabaseSync(banco, { readOnly: true });
const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.bind = (...a) => comArgs(a);
  st.first = async function (col) { const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { throw new Error('consulta somente leitura'); };
  return st;
};
const DB = { prepare: preparar, async batch() { throw new Error('consulta somente leitura'); } };
const { default: worker } = await import(pathToFileURL(path.join(RAIZ, 'api/src/index.js')).href);
for (const c of caminhos) {
  const r = await worker.fetch(new Request(`http://local${c}`, { headers: { Authorization: 'Bearer x' } }), { DB, API_KEY: 'x' });
  console.log(JSON.stringify({ caminho: c, status: r.status, corpo: await r.json().catch(() => null) }));
}
