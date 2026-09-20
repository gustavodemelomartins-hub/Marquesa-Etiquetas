/* O Worker REAL, servido localmente sobre um SQLite em memória.
 *
 *  Não é uma simulação da API: é `api/src/index.js` — o mesmo `fetch`, o
 *  mesmo roteador, os mesmos handlers, o mesmo `api/schema.sql`. O que muda
 *  é só de onde vem o binding `DB`: em vez do D1 da Cloudflare, o adaptador
 *  mínimo sobre `node:sqlite` que os testes do repositório já usam.
 *
 *  Consequência que importa: este processo não tem binding nenhum para
 *  nuvem. Não existe caminho daqui até PROD, nem até o D1 remoto, nem até a
 *  Nuvemshop — não por disciplina, por ausência.
 */
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const raiz = process.argv[2] || '.';
const porta = Number(process.argv[3] || 8787);
const semente = process.argv[4] || null;

const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON;');
raw.exec(readFileSync(path.join(raiz, 'api/schema.sql'), 'utf8'));
if (semente) raw.exec(readFileSync(semente, 'utf8'));

/* Adaptador D1 → node:sqlite. Mesmo contrato dos testes: `run` devolve
   `meta.changes`, que é como o código de produção detecta corrida. */
const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.bind = (...a) => comArgs(a);
  st.first = async function (col) {
    const l = raw.prepare(this.sql).get(...this.args) ?? null;
    return col && l ? l[col] : l;
  };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () {
    const r = raw.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(r.changes ?? 0) } };
  };
  return st;
};
const DB = {
  prepare: preparar,
  async batch(stmts) { const saida = []; for (const s of stmts) saida.push(await s.run()); return saida; },
  async exec(sql) { raw.exec(sql); return { count: 0 }; },
};

const { default: worker } = await import(pathToFileURL(path.join(raiz, 'api/src/index.js')).href);
const env = { DB, API_KEY: 'chave-local-de-teste' };

createServer(async (req, res) => {
  const url = `http://127.0.0.1:${porta}${req.url}`;
  const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => {
    const p = []; req.on('data', (c) => p.push(c)); req.on('end', () => ok(Buffer.concat(p)));
  });
  const pedido = new Request(url, {
    method: req.method,
    headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    ...(corpo && corpo.length ? { body: corpo } : {}),
  });
  try {
    const r = await worker.fetch(pedido, env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ erro: String(e && e.stack || e) }));
  }
}).listen(porta, '127.0.0.1', () => console.log(`Worker local (D1 em memória) em http://127.0.0.1:${porta}`));
