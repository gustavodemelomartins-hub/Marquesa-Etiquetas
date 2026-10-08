/** Inventário V2 — leitura do D1 e fechamento sem baixa dupla
 *  (08/10/2026, REGRAS §60). O servidor.
 *
 *  O inventário #1 de produção esbarrou em três coisas ao mesmo tempo:
 *
 *   A  cada bipe relia o catálogo inteiro (`cobertura`) — ~3.900 linhas do
 *      D1 por bipe, e a tela nem usava o número. Ajudou a esgotar a cota
 *      diária da conta em 06/10/2026;
 *   B  o balanço e o fechamento faziam UMA consulta por código conferido
 *      (886 com 821 códigos). O plano Free do Workers recusa a invocação
 *      que passa de 50 consultas: Balanço e Finalizar não terminavam;
 *   C  com B consertado, o fechamento baixaria a mesma peça DUAS vezes:
 *      tratava como "saiu depois da contagem" o Ajustar estoque que ela fez
 *      depois de contar, e o brinde/uso próprio LANÇADO depois mas
 *      acontecido antes (15 códigos, 27 peças no #1).
 *
 *  As provas, na ordem:
 *   1  o bipe não devolve `cobertura` e o número de consultas dele não
 *      cresce com o catálogo;
 *   2  o balanço e o fechamento ficam abaixo de 50 consultas com 150
 *      códigos conferidos (antes: uma por código);
 *   3  a consulta nova do "esperado em casa" dá o MESMO resultado da antiga,
 *      linha a linha, com maletas abertas, encerradas e em acerto;
 *   4  Ajustar estoque depois da contagem: a linha fica conferida, a
 *      diferença é zero e o fechamento NÃO mexe no estoque;
 *   5  saída lançada depois com data anterior ao dia da contagem: não baixa
 *      de novo;
 *   6  venda real depois da contagem continua retroagindo (D10 intacto);
 *   7  falta de verdade continua virando ajuste de inventário, uma vez só;
 *   8  a razão fecha no fim: produtos.qtd == SUM(movimentos.qtd).
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

/* Cada `.first/.all/.run` é uma consulta ao D1; um `batch` é UMA chamada. */
let consultas = 0;
const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.bind = (...a) => comArgs(a.map((v) => (v === undefined ? null : v)));
  st.first = async function (col) { consultas += 1; const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { consultas += 1; return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { consultas += 1; const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes ?? 0) } }; };
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
const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const env = { DB, API_KEY: 'k' };
const api = async (metodo, caminho, corpo) => {
  consultas = 0;
  const r = await worker.fetch(new Request(`http://local${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: r.status, corpo: await r.json().catch(() => null), consultas };
};
const q1 = (sql, ...a) => raw.prepare(sql).get(...a);
const qa = (sql, ...a) => raw.prepare(sql).all(...a);
let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

/* ── catálogo: toda quantidade nasce de movimento (a razão fecha). */
const ANTES = '2026-09-20 12:00:00';
const peca = (sku, qtd) => {
  raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, 'Brinco', 99, ?, 'ativo')")
    .run(sku, `Peça ${sku}`, qtd);
  raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, criado_em) VALUES (?, 'entrada', ?, 'importacao', ?)")
    .run(sku, qtd, ANTES);
};
const N = 150;
const skus = Array.from({ length: N }, (_, i) => String(200000 + i));
for (const s of skus) peca(s, 3);
for (const s of ['900001', '900002', '900003', '900004']) peca(s, s === '900001' ? 10 : 5);

/* Maletas: aberta, em acerto e encerrada — o "em casa" desconta só as duas
   primeiras. */
raw.exec("INSERT INTO revendedoras (id, nome) VALUES (1, 'Rev A'), (2, 'Rev B'), (3, 'Rev C')");
raw.exec(`INSERT INTO maletas (id, rev_id, status) VALUES (1, 1, 'aberta'), (2, 2, 'em_acerto'), (3, 3, 'encerrada')`);
const naMaleta = (m, sku, qtd, dev = 0) => raw.prepare(
  'INSERT INTO maleta_itens (maleta_id, sku, qtd, preco_envio, devolvida) VALUES (?, ?, ?, 99, ?)').run(m, sku, qtd, dev);
naMaleta(1, skus[0], 1); naMaleta(2, skus[0], 1); naMaleta(3, skus[0], 2, 1);
naMaleta(1, skus[1], 2, 1); naMaleta(3, skus[2], 1);

/* 3 — a consulta antiga do "esperado em casa", copiada como era. */
const SQL_ANTIGO = `
  SELECT p.sku, p.desc, p.cat, p.preco, p.qtd,
         COALESCE((SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
             JOIN maletas m ON m.id = mi.maleta_id
            WHERE mi.sku = p.sku AND m.status IN ('aberta', 'em_acerto')), 0) AS consignado,
         p.qtd - COALESCE((SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
             JOIN maletas m ON m.id = mi.maleta_id
            WHERE mi.sku = p.sku AND m.status IN ('aberta', 'em_acerto')), 0) AS esperado
    FROM produtos p
   WHERE p.sku NOT IN (SELECT kit_sku FROM kit_componentes)
     AND p.sku NOT IN (SELECT sku_comercial FROM personalizacao_modelos WHERE sku_comercial IS NOT NULL)`;

const aberto = await api('POST', '/api/inventarios', {});
assert.ok(aberto.corpo?.id, JSON.stringify(aberto.corpo));
const ID = aberto.corpo.id;

const det = await api('GET', `/api/inventarios/${ID}`);
assert.equal(det.status, 200);
const antigo = qa(SQL_ANTIGO).map((r) => [r.sku, Number(r.consignado), Number(r.esperado)]);
const novo = det.corpo.esperados.map((r) => [r.sku, Number(r.consignado), Number(r.esperado)]);
assert.deepEqual(novo.slice().sort(), antigo.slice().sort());
assert.deepEqual(novo.find((r) => r[0] === skus[0]), [skus[0], 2, 1]);
prova('3 — "esperado em casa" novo = antigo, linha a linha (maleta aberta, em acerto e encerrada)');

/* 1 — o bipe. */
let lid = 0;
const ler = (sku, gesto = 'bipe', extra = {}) => api('POST', `/api/inventarios/${ID}/leituras`,
  { sku, gesto, leituraId: `t-${lid++}`, ...extra });
const primeiro = await ler(skus[10]);
assert.equal(primeiro.status, 200);
assert.equal(primeiro.corpo.cobertura, undefined, 'o bipe voltou a devolver cobertura');
assert.deepEqual(primeiro.corpo.linhas.map((l) => [l.variacao, l.contado]), [['', 1]]);
const consultasDoBipe = primeiro.consultas;
assert.ok(consultasDoBipe <= 10, `bipe com ${consultasDoBipe} consultas`);
/* Mais 120 produtos no catálogo: o bipe custa o mesmo. */
for (let i = 0; i < 120; i += 1) peca(String(300000 + i), 1);
const depois = await ler(skus[11]);
assert.equal(depois.consultas, consultasDoBipe, 'o custo do bipe cresceu com o catálogo');
const reenvio = await api('POST', `/api/inventarios/${ID}/leituras`, { sku: skus[11], gesto: 'bipe', leituraId: `t-${lid - 1}` });
assert.equal(reenvio.corpo.repetida, true);
assert.equal(reenvio.corpo.cobertura, undefined);
assert.equal(q1('SELECT contado FROM inventario_contagem WHERE inventario_id = ? AND sku = ?', ID, skus[11]).contado, 1);
prova(`1 — bipe sem cobertura, ${consultasDoBipe} consultas, e não cresce com o catálogo; reenvio não soma`);

/* Contagem de todos os códigos — o número certo em casa, menos nos 30
   primeiros (skus[20..49]): falta 1 em cada, para provar que o Finalizar
   aplica 31 diferenças numa requisição só sem passar do teto. */
const comFalta = skus.slice(20, 50);
for (const s of skus) {
  const casa = q1(`SELECT p.qtd - COALESCE((SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi JOIN maletas m ON m.id = mi.maleta_id
     WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')), 0) AS c FROM produtos p WHERE sku = ?`, s).c;
  const r = await ler(s, 'definir', { quantidade: comFalta.includes(s) ? casa - 1 : casa });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
}
/* 900001: sistema 10, ela conta 4. 900002: conta 5, depois o brinde de
   setembro é lançado. 900003: conta 5, depois vende 1 (fato posterior).
   900004: some uma peça de verdade — conta 4. */
for (const [s, n] of [['900001', 4], ['900002', 4], ['900003', 5], ['900004', 4]]) {
  assert.equal((await ler(s, 'definir', { quantidade: n })).status, 200);
}
/* A contagem aconteceu ontem às 11h de Brasília; o que vem abaixo é hoje. */
raw.prepare("UPDATE inventario_contagem SET contado_em = '2026-10-06 14:00:00' WHERE inventario_id = ?").run(ID);

/* 4 — Ajustar estoque depois de contar: 10 → 4. */
const aj = await api('POST', '/api/produtos/900001/ajustar-estoque',
  { quantidadeAtual: 10, quantidadeCorreta: 4, motivo: 'correcao_cadastro' });
assert.equal(aj.status, 200, JSON.stringify(aj.corpo));
/* 5 — brinde de 27/09 lançado hoje (a peça já estava fora na contagem). */
raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES ('900002', 'brinde', -1, 'brinde', 'Brinde de 2026-09-27')").run();
const movBrinde = q1('SELECT MAX(id) AS id FROM movimentos').id;
raw.prepare("UPDATE produtos SET qtd = qtd - 1 WHERE sku = '900002'").run();
raw.prepare(`INSERT INTO saidas_sem_faturamento (tipo, sentido, data, sku, qtd, motivo, movimento_id, estoque_refletido)
  VALUES ('brinde', 'saida', '2026-09-27', '900002', 1, 'Presente', ?, 1)`).run(movBrinde);
/* 6 — venda de 07/10 (depois da contagem), lançada hoje. */
raw.exec("INSERT INTO vendas (id, cliente_nome, origem, data, total) VALUES (501, 'Cliente', 'balcao', '2026-10-07', 99)");
raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, venda_id, obs) VALUES ('900003', 'venda', -1, 'venda', 501, 'Venda 501')").run();
raw.prepare("UPDATE produtos SET qtd = qtd - 1 WHERE sku = '900003'").run();

/* 2 — balanço: abaixo do teto de 50 consultas do plano Free. */
const bal = await api('GET', `/api/inventarios/${ID}/balanco`);
assert.equal(bal.status, 200, JSON.stringify(bal.corpo));
assert.ok(bal.consultas < 50, `balanço com ${bal.consultas} consultas`);
const linhaDe = (rel, sku) => [...rel.faltando, ...rel.sobrando]
  .find((l) => l.sku === sku);
assert.deepEqual(bal.corpo.faltando.map((l) => [l.sku, l.dif]).sort(),
  [...comFalta, '900004'].map((s) => [s, -1]).sort(),
  `faltas: ${JSON.stringify(bal.corpo.faltando.map((l) => [l.sku, l.contado, l.esperado, l.aviso]))}`);
assert.deepEqual(bal.corpo.sobrando, []);
prova(`2 — balanço com ${N + 4} códigos conferidos: ${bal.consultas} consultas (antes: uma por código)`);
assert.equal(linhaDe(bal.corpo, '900001'), undefined);
prova('4 — Ajustar estoque depois de contar (10 → 4): sem diferença no balanço');
prova('5 — brinde de 27/09 lançado depois da contagem: sem diferença no balanço');
prova('6 — venda de 07/10, depois da contagem: retroage e não é divergência');

/* Fechamento: concluir + aplicar (o que a tela "Finalizar" faz). */
const fim = await api('POST', `/api/inventarios/${ID}/concluir`, {});
assert.equal(fim.status, 200, JSON.stringify(fim.corpo));
assert.ok(fim.consultas < 50, `concluir com ${fim.consultas} consultas`);
const r1 = q1("SELECT situacao, dif FROM inventario_resultado WHERE inventario_id = ? AND sku = '900001'", ID);
assert.deepEqual([r1.situacao, r1.dif], ['conferido', 0]);
const qtdAntes = new Map(comFalta.map((s) => [s, q1('SELECT qtd FROM produtos WHERE sku = ?', s).qtd]));
const ap = await api('POST', `/api/inventarios/${ID}/aplicar`,
  { itens: [...comFalta, '900004'].map((sku) => ({ sku, motivoId: 'contagem_fisica', motivo: 'Contagem física' })) });
assert.equal(ap.status, 200, JSON.stringify(ap.corpo));
assert.ok(ap.consultas < 50, `aplicar 31 diferenças com ${ap.consultas} consultas`);
for (const s of comFalta) assert.equal(q1('SELECT qtd FROM produtos WHERE sku = ?', s).qtd, qtdAntes.get(s) - 1);
const idsMov = new Set(qa("SELECT id FROM movimentos WHERE origem = 'inventario'").map((r) => r.id));
for (const r of (ap.corpo.aplicados ?? ap.corpo.itens ?? [])) if (r.movimentoId) assert.ok(idsMov.has(r.movimentoId), `movimentoId ${r.movimentoId} não existe`);
prova(`7b — Finalizar com 31 diferenças: ${ap.consultas} chamadas ao D1 numa requisição (teto do Free: 50)`);
const qtd = (s) => q1('SELECT qtd FROM produtos WHERE sku = ?', s).qtd;
assert.deepEqual(['900001', '900002', '900003', '900004'].map(qtd), [4, 4, 4, 4]);
const deNovo = await api('POST', `/api/inventarios/${ID}/aplicar`,
  { itens: [{ sku: '900004', motivoId: 'contagem_fisica', motivo: 'Contagem física' }] });
assert.equal(qtd('900004'), 4, 'aplicar de novo baixou outra vez');
assert.ok(deNovo.status >= 400 || JSON.stringify(deNovo.corpo).includes('já foi corrigido'), JSON.stringify(deNovo.corpo));
assert.equal(q1("SELECT COUNT(*) AS n FROM movimentos WHERE sku = '900004' AND origem = 'inventario'").n, 1);
assert.equal(q1("SELECT COUNT(*) AS n FROM movimentos WHERE origem = 'inventario'").n, 31);
prova('7 — falta real (900004) vira UM ajuste de inventário; aplicar de novo não baixa outra vez');
prova('4/5/6 — fechamento: 900001 fica 4 (não −2), 900002 fica 4, 900003 fica 4');

const furos = qa(`SELECT p.sku FROM produtos p
  WHERE p.qtd <> COALESCE((SELECT SUM(m.qtd) FROM movimentos m WHERE m.sku = p.sku), 0)`);
assert.deepEqual(furos, []);
assert.equal(qa('SELECT sku FROM produtos WHERE qtd < 0').length, 0);
prova('8 — razão fecha e nenhum estoque negativo');

/* 9 — o teto de consultas por requisição tem nome, e a requisição pesada
   vira uma linha de log (sem query string). */
const { traduzirErro } = await import(pathToFileURL(join(raiz, 'api/src/http/erros.js')).href);
const { criarContador, vigiarRequisicao, ALERTA_D1 } = await import(pathToFileURL(join(raiz, 'api/src/d1-metrica.js')).href);
const teto = traduzirErro(new Error('D1_ERROR: Too many API requests by single worker invocation.'));
assert.equal(teto.status, 503);
assert.equal((await teto.json()).limite, 'd1-consultas-por-requisicao');
const cota = traduzirErro(new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit"));
assert.equal((await cota.json()).limite, 'd1-leitura-diaria');
const logs = [];
const saida = { warn: (x) => logs.push(x) };
const leve = criarContador({ leve: true });
for (let i = 0; i < ALERTA_D1.consultas - 1; i += 1) leve.consultas.push({ sql: 'x', lidas: null });
assert.equal(vigiarRequisicao(leve, { metodo: 'GET', path: '/api/x', ms: 10, status: 200 }, saida), null);
leve.consultas.push({ sql: 'x', lidas: null });
const reg = vigiarRequisicao(leve, { metodo: 'GET', path: '/api/inventarios/1/balanco', ms: 10, status: 200 }, saida);
assert.equal(reg.evento, 'd1-requisicao-pesada');
assert.equal(JSON.parse(logs[0]).caminho, '/api/inventarios/1/balanco');
prova('9 — "Too many API requests" vira 503 com nome; a requisição pesada vira uma linha de log');

console.log(`\n${provas} provas — inventário V2: leitura do D1 e fechamento sem baixa dupla`);
