/** Inventário V2 — a mesma peça não é contada duas vezes em silêncio
 *  (06/10/2026, REGRAS §59). O servidor.
 *
 *  A Sthefany bipava a peça, olhava a ficha e bipava de novo (passados os
 *  4 s da trava antiga), e depois digitava a quantidade da planilha antiga
 *  por cima do que já tinha bipado. As provas, na ordem do pedido:
 *
 *   1  primeiro bipe: +1
 *   5  o MESMO evento reenviado (retry, rede ruim) nunca soma
 *   4  "Contar outra unidade" é outra leitura e soma
 *   7  2 bipados + 5 digitados = 5 — nunca 7
 *   9  o mesmo valor digitado não cria evento
 *  10  valor menor substitui
 *  11  linha não conferida: definir define
 *  12  variação nº23 = 2, digita 3 → 3
 *      variação com bipes sem variação: `naoInformadas` passa as bipadas
 *      para a variação dita, atômico, e o reenvio não soma
 *
 *  Worker real em processo, `api/schema.sql` num SQLite em memória.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.log('  --   node:sqlite indisponível nesta versão do Node — teste NÃO rodou');
  process.exit(0);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = new DatabaseSync(':memory:');
raw.exec(readFileSync(join(raiz, 'api/schema.sql'), 'utf8'));

const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.bind = (...a) => comArgs(a.map((v) => (v === undefined ? null : v)));
  st.first = async function (col) { const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes ?? 0) } }; };
  return st;
};
/* O D1 roda o batch numa transação: se um comando falha, nada fica. O
   SQLite daqui imita isso com SAVEPOINT — é o que a trava da leitura
   repetida precisa para ser provada. */
const DB = {
  prepare: preparar,
  async batch(stmts) {
    raw.exec('SAVEPOINT lote');
    try {
      const s = [];
      for (const x of stmts) s.push(await x.run());
      raw.exec('RELEASE lote');
      return s;
    } catch (e) {
      raw.exec('ROLLBACK TO lote'); raw.exec('RELEASE lote');
      throw e;
    }
  },
};
const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const env = { DB, API_KEY: 'k' };
const api = async (metodo, caminho, corpo) => {
  const r = await worker.fetch(new Request(`http://local${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: r.status, corpo: await r.json().catch(() => null) };
};
const q1 = (sql, ...a) => raw.prepare(sql).get(...a);
const qa = (sql, ...a) => raw.prepare(sql).all(...a);
let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

/* ── catálogo: toda quantidade nasce de movimento (a razão fecha). */
const ONTEM = '2026-10-04 09:00:00';
const peca = (sku, desc, qtd, cat = 'Anel') => raw.prepare(
  "INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, ?, 99, ?, 'ativo')").run(sku, desc, cat, qtd);
const mov = (sku, qtd) => raw.prepare(
  "INSERT INTO movimentos (sku, tipo, qtd, origem, criado_em) VALUES (?, 'entrada', ?, 'importacao', ?)").run(sku, qtd, ONTEM);
const variacao = (sku, nome, vid, ordem) => raw.prepare(
  "INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem) VALUES (?, ?, 'Tamanho', ?, ?, ?, 'local')",
).run(sku, nome, vid, ordem, JSON.stringify([{ atributo: 'Tamanho', valor: nome }]));

peca('347801', 'Colar Coração', 6, 'Colar'); mov('347801', 6);
peca('256359', 'Anel Inspiração Cartier', 7); mov('256359', 7);
variacao('256359', 'nº18', 'local:a18', 0); variacao('256359', 'nº23', 'local:a23', 1);

const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return r.corpo.ok === true && r.corpo.divergentes.length === 0;
};
const estoque = () => qa('SELECT sku, qtd FROM produtos ORDER BY sku').map((r) => `${r.sku}:${r.qtd}`).join(' ');
const estoqueAntes = estoque();
assert.ok(await razaoFecha(), 'cenário: a razão nasce fechada');

const abre = await api('POST', '/api/inventarios', {});
assert.equal(abre.status, 201, JSON.stringify(abre.corpo));
const ID = abre.corpo.id;
let n = 0;
const leitura = (corpo, leituraId = `d-${++n}`) => api('POST', `/api/inventarios/${ID}/leituras`, { leituraId, ...corpo });
const linhas = (sku) => Object.fromEntries(qa(
  'SELECT variacao, contado FROM inventario_contagem WHERE inventario_id = ? AND sku = ?', ID, sku)
  .map((l) => [l.variacao, l.contado]));
const total = (sku) => Object.values(linhas(sku)).reduce((s, q) => s + q, 0);
const rastro = (sku) => q1('SELECT COUNT(*) n FROM inventario_leituras WHERE inventario_id = ? AND sku = ?', ID, sku).n;

/* ═════════ 1, 5, 13 — a mesma leitura reenviada (rede ruim, retry) */
const b1 = await leitura({ sku: '347801', gesto: 'bipe' }, 'bipe-colar-1');
assert.equal(b1.status, 200, JSON.stringify(b1.corpo));
assert.equal(total('347801'), 1);
prova('1 — primeiro bipe: 0 → 1');

const [r1, r2] = await Promise.all([
  leitura({ sku: '347801', gesto: 'bipe' }, 'bipe-colar-1'),
  leitura({ sku: '347801', gesto: 'bipe' }, 'bipe-colar-1'),
]);
const r3 = await leitura({ sku: '347801', gesto: 'bipe' }, 'bipe-colar-1');
for (const r of [r1, r2, r3]) {
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.repetida, true, 'o reenvio não foi reconhecido');
}
assert.equal(total('347801'), 1, 'o mesmo evento reenviado somou');
assert.equal(rastro('347801'), 1);
prova('5/13 — o mesmo evento reenviado 3× (dois ao mesmo tempo): continua 1, uma linha no rastro');

/* ═════════ 4 — "Contar outra unidade" é OUTRA leitura: soma */
await leitura({ sku: '347801', gesto: 'bipe' }, 'bipe-colar-2');
assert.equal(total('347801'), 2);
prova('4 — "Contar outra unidade" (leitura nova) soma: 1 → 2');

/* ═════════ 7, 8 — o caso da Sthefany: 2 bipes, depois digita 5 da planilha */
const d5 = await leitura({ sku: '347801', gesto: 'definir', quantidade: 5 });
assert.equal(d5.status, 200, JSON.stringify(d5.corpo));
assert.deepEqual(linhas('347801'), { '': 5 }, 'o número digitado somou ao bipado');
assert.notEqual(total('347801'), 7);
prova('7/8 — 2 bipados + "5" digitado = 5 (substitui), nunca 7');

/* ═════════ 9 — o mesmo valor: nada gravado */
const antesRastro = rastro('347801');
const igual = await leitura({ sku: '347801', gesto: 'definir', quantidade: 5 });
assert.equal(igual.status, 200);
assert.equal(igual.corpo.inalterada, true);
assert.equal(rastro('347801'), antesRastro, 'digitar o mesmo número criou outro evento');
assert.deepEqual(linhas('347801'), { '': 5 });
prova('9 — digitar 5 quando já está 5: nenhum evento novo, continua 5');

/* ═════════ 10 — menos é correção legítima */
await leitura({ sku: '347801', gesto: 'definir', quantidade: 3 });
assert.deepEqual(linhas('347801'), { '': 3 });
prova('10 — digitar 3 quando está 5: fica 3');

/* ═════════ 11 — peça não conferida: definir define */
await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº18', quantidade: 2 });
assert.deepEqual(linhas('256359'), { 'nº18': 2 });
prova('11 — entrada manual em linha não conferida define o valor');

/* ═════════ 12 — variação nº23 com 2, digita 3 → 3 */
await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 2 });
await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 3 });
assert.equal(linhas('256359')['nº23'], 3, 'nº23 somou em vez de substituir');
prova('12 — variação nº23 = 2, digita 3: nº23 = 3 (não 5)');

/* ═════════ variação: bipes sem variação "estão entre as digitadas" */
await leitura({ sku: '256359', gesto: 'limpar' });
await leitura({ sku: '256359', gesto: 'bipe' });
await leitura({ sku: '256359', gesto: 'bipe' });
assert.deepEqual(linhas('256359'), { '': 2 });
/* o comportamento de antes, para registro: sem a marca, 2 + 5 = 7 */
const semMarca = await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 5 }, 'sem-marca');
assert.equal(semMarca.status, 200);
assert.equal(total('256359'), 7, 'o cenário de antes não reproduziu');
await leitura({ sku: '256359', gesto: 'limpar' });
await leitura({ sku: '256359', gesto: 'bipe' });
await leitura({ sku: '256359', gesto: 'bipe' });
const comMarca = await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 5, naoInformadas: true }, 'com-marca');
assert.equal(comMarca.status, 200, JSON.stringify(comMarca.corpo));
assert.deepEqual(linhas('256359'), { '': 0, 'nº23': 5 });
assert.equal(total('256359'), 5);
const reenvioMarca = await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 5, naoInformadas: true }, 'com-marca');
assert.equal(reenvioMarca.corpo.repetida, true);
assert.deepEqual(linhas('256359'), { '': 0, 'nº23': 5 });
assert.deepEqual(qa("SELECT variacao, delta FROM inventario_leituras WHERE inventario_id = ? AND leitura_id = 'com-marca' ORDER BY variacao", ID)
  .map((r) => [r.variacao, r.delta]), [['', -2], ['nº23', 5]]);
prova('variação — 2 bipadas sem variação + "5 no nº23, são estas": nº23 = 5, total 5 (antes: 7); reenvio não soma; rastro diz o que passou');

/* parcial: 7 sem variação, 5 no nº23 → só 5 passam */
await leitura({ sku: '256359', gesto: 'limpar' });
await leitura({ sku: '256359', gesto: 'definir', variacao: '', quantidade: 7 });
await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 5, naoInformadas: true });
assert.deepEqual(linhas('256359'), { '': 2, 'nº23': 5 });
/* nº23 já com 4, 2 sem variação, digita 5: entra só 1 */
await leitura({ sku: '256359', gesto: 'limpar' });
await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 4 });
await leitura({ sku: '256359', gesto: 'definir', variacao: '', quantidade: 2 });
await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 5, naoInformadas: true });
assert.deepEqual(linhas('256359'), { '': 1, 'nº23': 5 });
/* diminuir com a marca: nada passa, só substitui */
await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº23', quantidade: 3, naoInformadas: true });
assert.deepEqual(linhas('256359'), { '': 1, 'nº23': 3 });
prova('variação — só passa o que cabe no número dito (7 → 5 passam, 2 ficam; nº23 4 → 5 leva 1); diminuir não mexe nas sem variação');

/* a marca numa peça sem variação, ou na linha "sem variação", é inofensiva */
const marcaSemVariacao = await leitura({ sku: '347801', gesto: 'definir', quantidade: 4, naoInformadas: true });
assert.equal(marcaSemVariacao.status, 200);
assert.deepEqual(linhas('347801'), { '': 4 });
prova('a marca só vale numa variação: na linha sem variação é um "definir" comum');

/* ═════════ a contagem não mexe em estoque; a razão fecha */
assert.equal(estoque(), estoqueAntes, 'contagem mexeu em estoque');
assert.ok(await razaoFecha(), 'a razão terminou aberta');
prova('nada disso mexe em estoque; GET /api/estoque/conferir vazio');

console.log(`\nInventário V2 — contagem dupla: ${provas} provas, razão fechada.`);
