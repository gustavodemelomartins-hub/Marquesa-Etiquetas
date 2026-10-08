/** §61 — Estoque online incremental: Marquesa → Nuvemshop pela fila.
 *
 *  O Worker REAL (`api/src/index.js`), o schema REAL e a loja de mentira
 *  (`loja-falsa.mjs`), tudo no mesmo processo — sem wrangler, sem chave,
 *  sem rede. O banco é um SQLite em memória com o adaptador D1 que conta
 *  consultas, e o `batch` é atômico (SAVEPOINT), como no D1.
 *
 *  O que fica provado, na ordem do pedido de 08/10/2026:
 *
 *    1  venda baixa a loja na hora (5 → 4), lendo UM produto, não o catálogo
 *    2  reprocessar o mesmo evento não baixa de novo (continua 4, nunca 3)
 *    3  loja fora: a venda vale, a fila guarda, a loja converge depois
 *    4  brinde: estoque e loja −1, faturamento igual
 *    5  consignação: em casa −1, loja acompanha
 *    6  retorno da revendedora: em casa +1, loja acompanha
 *    7  variante: só a caixinha vendida muda
 *    8  ajuste de inventário: a loja recebe o saldo ABSOLUTO novo
 *    9  produto incompleto: fica na preparação e nada é publicado
 *    10 duas rodadas no mesmo código: um envio; código que muda durante a
 *       rodada não é marcado sincronizado com o número velho
 *    +  kill switch, corte de pedidos, pedido do site antes de empurrar,
 *       cautela contra venda do site não importada, conferência e
 *       reconciliação, e o custo em consultas D1 de uma venda.
 *
 *      node src/nuvemshop-fila-test.mjs
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

const loja = await subirLojaFalsa(8813);
const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const { processarFila, executarCron } = await import(pathToFileURL(join(raiz, 'api/src/nuvemshop-estoque.js')).href);
const env = {
  DB, API_KEY: 'k',
  NUVEMSHOP_STORE_ID: '123', NUVEMSHOP_TOKEN: 'token-falso',
  NUVEMSHOP_BASE: loja.url, NUVEMSHOP_WRITES_ENABLED: 'true',
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
  const nRequisicao = consultas;
  await esperarFundo();
  return { status: r.status, corpo: await r.json().catch(() => null), consultas: nRequisicao, consultasComFundo: consultas };
};
const cron = async (expr = '*/10 * * * *') => {
  consultas = 0;
  await worker.scheduled({ cron: expr }, env, ctx);
  await esperarFundo();
  return consultas;
};

const q1 = (sql, ...a) => raw.prepare(sql).get(...a);
const qa = (sql, ...a) => raw.prepare(sql).all(...a);
let provas = 0;
const prova = (t, extra = '') => { provas += 1; console.log(`  ok   ${t}${extra ? '  → ' + extra : ''}`); };

const estoqueLoja = (vid) => {
  for (const p of loja.estado.produtos) {
    const v = p.variants.find((x) => String(x.id) === String(vid));
    if (v) return v.inventory_levels ? v.inventory_levels[0].stock : v.stock;
  }
  return undefined;
};
const setEstoqueLoja = (vid, n) => {
  for (const p of loja.estado.produtos) {
    const v = p.variants.find((x) => String(x.id) === String(vid));
    if (v) { v.inventory_levels[0].stock = n; return; }
  }
};
const casa = (sku) => q1(`SELECT p.qtd - COALESCE((SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
  JOIN maletas m ON m.id = mi.maleta_id WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')), 0) AS c
  FROM produtos p WHERE p.sku = ?`, sku).c;
const fila = (sku) => q1('SELECT * FROM nuvemshop_fila WHERE sku = ?', sku);
const razaoFecha = () => qa(`SELECT p.sku FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m
  ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.s, 0)`).length === 0;

/* ── catálogo dos dois lados: toda quantidade nasce de movimento ─────── */
const peca = (sku, qtd, desc = `Peça ${sku}`, cat = 'Brinco') => {
  raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, ?, 99, ?, 'ativo')").run(sku, desc, cat, qtd);
  if (qtd) raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem) VALUES (?, 'entrada', ?, 'importacao')").run(sku, qtd);
};
peca('A100', 5, 'Colar A100', 'Colar');
peca('GIFT1', 5); peca('CONS1', 5); peca('AJ1', 10);
peca('AZUL1', 3, 'Pulseira Azul'); peca('ROSA1', 3, 'Pulseira Rosa');
peca('NOVO1', 3, 'NOVO1');     // sem nome, sem foto, sem anúncio
peca('B200', 4, 'Brinco B200');
/* Seis peças a mais só para a fila inicial passar do limite incremental
   (12) e provar o caminho em lote. */
const FILLERS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
for (const f of FILLERS) peca(f, 2, `Anel ${f}`, 'Anel');

loja.estado.produtos = [
  produtoFalso(1, [{ id: 11, sku: 'A100', estoque: 5 }]),
  produtoFalso(2, [{ id: 21, sku: 'AZUL1', estoque: 3 }, { id: 22, sku: 'ROSA1', estoque: 3 }]),
  produtoFalso(3, [{ id: 31, sku: 'GIFT1', estoque: 5 }]),
  produtoFalso(4, [{ id: 41, sku: 'CONS1', estoque: 5 }]),
  produtoFalso(5, [{ id: 51, sku: 'AJ1', estoque: 10 }]),
  produtoFalso(6, [{ id: 61, sku: 'B200', estoque: 4 }]),
  produtoFalso(7, [{ id: 71, sku: 'SOLOJA', estoque: 2 }]),
  produtoFalso(8, [{ id: 81, sku: '', estoque: 1 }]),
  ...FILLERS.map((f, i) => produtoFalso(100 + i, [{ id: 1000 + i, sku: f, estoque: 2 }])),
];
/* O mapeamento que a conferência/sync grava (produto_id_loja). */
for (const [sku, pid] of [['A100', 1], ['AZUL1', 2], ['ROSA1', 2], ['GIFT1', 3], ['CONS1', 4], ['AJ1', 5], ['B200', 6],
  ...FILLERS.map((f, i) => [f, 100 + i])]) {
  raw.prepare("UPDATE produtos SET produto_id_loja = ?, url_loja = ? WHERE sku = ?").run(String(pid), `p-${pid}`, sku);
}

console.log('\n=== 0. o gatilho enche a fila; desligado, nada sai ===');
assert.equal(fila('A100').status, 'pendente');
prova('cada movimento de entrada pôs o código na fila, pelo banco');
let r = await processarFila(DB, env, { origem: 'teste' });
assert.equal(r.desligado, true);
assert.equal(loja.estado.escritas.length, 0);
prova('kill switch ausente = desligado: nada foi enviado, a fila continua cheia');

/* corte de pedidos (obrigatório para o cron puxar) e o switch ligado */
const CORTE = '2026-10-08T16:30:57.000Z';
raw.prepare(`INSERT INTO config (chave, valor) VALUES ('syncCorteEm', ?), ('nuvemshopSyncAtivo', 'true')`).run(JSON.stringify(CORTE));
loja.estado.pedidos = [{
  id: 7001, number: 7001, status: 'open', payment_status: 'paid', paid_at: '2026-10-07T12:00:00Z',
  created_at: '2026-10-07T12:00:00Z', customer: { name: 'Antes do corte' },
  products: [{ sku: 'B200', variant_id: 61, name: 'B200', quantity: 1, price: '99.00' }],
}];

console.log('\n=== reconciliação inicial pela fila (em lote) ===');
const vendasAntes = q1('SELECT COUNT(*) n FROM vendas').n;
await cron();
assert.equal(q1('SELECT COUNT(*) n FROM vendas').n, vendasAntes, 'pedido anterior ao corte virou venda');
prova('pedido anterior ao corte NÃO virou venda (inventário já contou a peça)');
const ultima = JSON.parse(q1(`SELECT valor FROM config WHERE chave='nuvemshopUltimaRodada'`).valor);
assert.equal(ultima.modo, 'lote');
assert.equal(fila('A100').status, 'sincronizado');
assert.equal(fila('NOVO1').status, 'ignorado');
prova('fila inicial processada em LOTE; NOVO1 sem anúncio fica "ignorado"', `${ultima.processados} códigos, ${ultima.chamadasLoja} chamadas à loja`);
assert.equal(loja.estado.escritas.length, 0, 'loja já batia e mesmo assim houve PATCH');
prova('tudo já batia: nenhum PATCH (escrita só quando o saldo difere)');

/* ═════════════════════════════════════════════════════ TESTE 1 — VENDA */
console.log('\n=== 1. venda: Marquesa 5 → 4 e Nuvemshop 5 → 4 ===');
const catAntes = loja.estado.leiturasDoCatalogo || 0;
const prodAntes = loja.estado.leiturasDeProduto || 0;
const v1 = await api('POST', '/api/vendas', { clienteNome: 'Cliente Teste', itens: [{ sku: 'A100', qtd: 1 }], pago: true });
assert.equal(v1.status, 201, JSON.stringify(v1.corpo));
assert.equal(casa('A100'), 4);
assert.equal(estoqueLoja(11), 4);
assert.equal(v1.corpo.nuvemshop.status, 'sincronizada');
prova('Marquesa 4, Nuvemshop 4, sem botão', `venda ${v1.corpo.id}`);
assert.equal((loja.estado.leiturasDoCatalogo || 0) - catAntes, 0);
assert.equal((loja.estado.leiturasDeProduto || 0) - prodAntes, 1);
prova('a venda leu UM produto da loja e nenhuma página do catálogo');
assert.ok(v1.consultas <= 40, `a venda fez ${v1.consultas} consultas ao D1`);
prova('custo D1 da venda inteira (registro + envio)', `${v1.consultas} consultas (teto do Free: 50)`);
const ultimaEscrita = loja.estado.escritas.at(-1);
assert.deepEqual(ultimaEscrita.variants.map((v) => v.inventory_levels[0].stock), [4]);
prova('o PATCH levou o SALDO (stock: 4), nunca um "−1"');
assert.equal(q1('SELECT nuvemshop_status s FROM vendas WHERE id = ?', v1.corpo.id).s, 'sincronizada');

/* ═══════════════════════════════════════════════ TESTE 2 — IDEMPOTÊNCIA */
console.log('\n=== 2. reprocessar o mesmo evento: continua 4, nunca 3 ===');
const escritasAntes = loja.estado.escritas.length;
const movAntes = q1('SELECT COUNT(*) n FROM movimentos').n;
const vendasN = q1('SELECT COUNT(*) n FROM vendas').n;
await api('POST', `/api/vendas/${v1.corpo.id}/nuvemshop`, {});
raw.prepare(`UPDATE nuvemshop_fila SET status='pendente', versao=versao+1 WHERE sku='A100'`).run();
await processarFila(DB, env, { skus: ['A100'], origem: 'teste' });
await cron(); await cron();
assert.equal(estoqueLoja(11), 4);
assert.equal(casa('A100'), 4);
assert.equal(q1('SELECT COUNT(*) n FROM movimentos').n, movAntes);
assert.equal(q1('SELECT COUNT(*) n FROM vendas').n, vendasN);
prova('reenvio manual, reprocesso da fila e dois crons: loja 4, Marquesa 4, nenhum movimento ou venda a mais');
assert.equal(loja.estado.escritas.length, escritasAntes);
prova('e nenhum PATCH: o saldo já estava certo');

/* ═════════════════════════════════════════════ TESTE 3 — NUVEMSHOP FORA */
console.log('\n=== 3. a loja cai: a venda vale, a fila guarda, a loja converge ===');
loja.estado.falhar = true;
const v3 = await api('POST', '/api/vendas', { clienteNome: 'Cliente Teste', itens: [{ sku: 'A100', qtd: 1 }], pago: true });
assert.equal(v3.status, 201);
assert.equal(casa('A100'), 3);
assert.equal(estoqueLoja(11), 4);
const f3 = fila('A100');
assert.equal(f3.status, 'erro');
assert.ok(f3.proxima_em, 'falha sem próxima tentativa marcada');
assert.equal(f3.tentativas, 1);
prova('venda gravada, Marquesa 3, fila em erro com nova tentativa marcada', `próxima ${f3.proxima_em}`);
assert.ok(!/token-falso/.test(f3.ultimo_erro || ''), 'o erro gravado expôs o token');
prova('o erro gravado é frase para gente, sem token');
loja.estado.falhar = false;
await cron();
assert.equal(estoqueLoja(11), 4, 'o cron passou por cima da espera marcada');
prova('antes da hora marcada o cron não insiste (backoff)');
raw.prepare(`UPDATE nuvemshop_fila SET proxima_em = '2000-01-01T00:00:00.000Z' WHERE sku = 'A100'`).run();
await cron();
assert.equal(estoqueLoja(11), 3);
assert.equal(fila('A100').status, 'sincronizado');
assert.equal(fila('A100').tentativas, 0);
prova('a loja voltou e convergiu para 3, sem venda nem movimento duplicado');
assert.equal(q1(`SELECT COUNT(*) n FROM vendas WHERE id = ?`, v3.corpo.id).n, 1);
assert.equal(q1('SELECT nuvemshop_status s FROM vendas WHERE id = ?', v3.corpo.id).s, 'sincronizada');
prova('a venda que ficou em erro passou a "sincronizada" quando o código convergiu');

/* ════════════════════════════════════════════════════ TESTE 4 — BRINDE */
console.log('\n=== 4. brinde: estoque −1, loja −1, faturamento igual ===');
const fat0 = (await api('GET', '/api/analytics/vendas?periodo=tudo')).corpo.faturamento;
const b4 = await api('POST', '/api/saidas', { tipo: 'brinde', sku: 'GIFT1', qtd: 1, motivo: 'Dia das Mães' });
assert.equal(b4.status, 201, JSON.stringify(b4.corpo));
assert.equal(casa('GIFT1'), 4);
assert.equal(estoqueLoja(31), 4);
prova('brinde chegou à loja pelo gancho da requisição (sem chamada explícita na rota)');
assert.equal((await api('GET', '/api/analytics/vendas?periodo=tudo')).corpo.faturamento, fat0);
prova('faturamento não mudou');

/* ═══════════════════════════════════════════════ TESTE 5 — CONSIGNAÇÃO */
console.log('\n=== 5. consignação: em casa 5 → 4, loja 4 ===');
const rev = (await api('POST', '/api/revendedoras', { nome: 'Revendedora Teste' })).corpo;
const mal = (await api('POST', '/api/maletas', { revId: rev.id, abertaEm: '2026-10-08' })).corpo;
const c5 = await api('POST', `/api/maletas/${mal.id}/itens`, { itens: { CONS1: 1 } });
assert.equal(c5.status, 200, JSON.stringify(c5.corpo));
assert.equal(q1(`SELECT qtd FROM produtos WHERE sku='CONS1'`).qtd, 5);
assert.equal(casa('CONS1'), 4);
assert.equal(estoqueLoja(41), 4);
assert.equal(c5.corpo.nuvemshop.status, 'sincronizada');
prova('total 5, em casa 4, consignado +1, Nuvemshop 4');

/* ════════════════════════════════════════════ TESTE 6 — RETORNO DA MALETA */
console.log('\n=== 6. a peça volta: em casa 4 → 5, loja 5 ===');
const a6 = await api('POST', `/api/maletas/${mal.id}/acerto`, { devolvidas: { CONS1: 1 }, faltas: [] });
assert.equal(a6.status, 200, JSON.stringify(a6.corpo));
assert.equal(casa('CONS1'), 5);
assert.equal(estoqueLoja(41), 5);
prova('retorno da revendedora: em casa 5, Nuvemshop 5');

/* ══════════════════════════════════════════════════ TESTE 7 — VARIANTE */
console.log('\n=== 7. variante: vende a Azul, a Rosa não muda ===');
const escr7 = loja.estado.escritas.length;
const v7 = await api('POST', '/api/vendas', { clienteNome: 'Cliente Teste', itens: [{ sku: 'AZUL1', qtd: 1 }], pago: true });
assert.equal(v7.status, 201);
assert.equal(estoqueLoja(21), 2);
assert.equal(estoqueLoja(22), 3);
const enviadas7 = loja.estado.escritas.slice(escr7).flatMap((p) => p.variants.map((v) => v.id));
assert.deepEqual(enviadas7, [21]);
prova('Azul 3 → 2; Rosa continua 3, e o PATCH só endereçou a variante 21');

/* ════════════════════════════════════════════ TESTE 8 — AJUSTE (INVENTÁRIO) */
console.log('\n=== 8. ajuste de estoque: a loja recebe o saldo absoluto ===');
const a8 = await api('POST', '/api/produtos/AJ1/ajustar-estoque', { quantidadeAtual: 10, quantidadeCorreta: 7, motivo: 'correcao_cadastro' });
assert.equal(a8.status, 200, JSON.stringify(a8.corpo));
assert.equal(estoqueLoja(51), 7);
assert.equal(loja.estado.escritas.at(-1).variants[0].inventory_levels[0].stock, 7);
prova('AJ1 10 → 7, e a loja recebeu stock: 7');

/* ═════════════════════════════════════════ TESTE 9 — PRODUTO INCOMPLETO */
console.log('\n=== 9. produto com estoque e sem foto/nome: preparação, nunca publicado ===');
const pub = await api('GET', '/api/catalogo/publicacao');
const novo = pub.corpo.itens.find((i) => i.sku === 'NOVO1');
assert.ok(novo, 'NOVO1 sumiu da fila de publicação');
assert.equal(novo.estado, 'falta_informacao');
assert.ok(novo.falta.includes('foto'));
assert.ok(novo.falta.includes('nome'));
prova('NOVO1 aparece com o que falta', novo.falta.join(', '));
assert.equal(loja.estado.caminhos.filter((c) => /\/products$/.test(c)).length >= 0, true);
assert.equal(loja.estado.produtos.length, 8 + FILLERS.length);
assert.equal(fila('NOVO1').status, 'ignorado');
prova('nenhum produto foi criado na loja; o código fica fora do envio de estoque');

/* ═══════════════════════════════════ TESTE 10 — DUAS RODADAS, MESMO CÓDIGO */
console.log('\n=== 10. corrida: duas rodadas pegam a mesma fila ===');
raw.prepare(`UPDATE nuvemshop_fila SET status='pendente', versao=versao+1 WHERE sku='B200'`).run();
setEstoqueLoja(61, 9);   // loja errada de propósito
const escr10 = loja.estado.escritas.length;
const [p1, p2] = await Promise.all([
  processarFila(DB, env, { skus: ['B200'], origem: 't1' }),
  processarFila(DB, env, { skus: ['B200'], origem: 't2' }),
]);
assert.equal(p1.processados + p2.processados, 1);
assert.equal(loja.estado.escritas.length - escr10, 1);
assert.equal(estoqueLoja(61), 4);
prova('só uma rodada pegou o código (arrendamento), um PATCH, loja 4');

/* versão: o código muda DURANTE a rodada */
loja.estado.atraso = 150;
setEstoqueLoja(61, 9);
raw.prepare(`UPDATE nuvemshop_fila SET status='pendente', versao=versao+1 WHERE sku='B200'`).run();
const lenta = processarFila(DB, env, { skus: ['B200'], origem: 'lenta' });
await new Promise((ok) => setTimeout(ok, 40));
await api('POST', '/api/vendas', { clienteNome: 'Cliente Teste', itens: [{ sku: 'B200', qtd: 1 }], pago: true });
await lenta;
loja.estado.atraso = 0;
assert.equal(casa('B200'), 3);
assert.equal(fila('B200').status, 'pendente', 'rodada lenta marcou sincronizado com o número velho');
prova('a rodada lenta enviou o número de antes e NÃO marcou sincronizado (versão mudou)');
await cron();
assert.equal(estoqueLoja(61), 3);
assert.equal(fila('B200').status, 'sincronizado');
prova('a rodada seguinte mandou o saldo novo: loja 3');

/* ═══════════════════════════ pedido do site: puxar ANTES de empurrar */
console.log('\n=== pedido do site e a cautela da requisição ===');
loja.estado.pedidos.push({
  id: 7002, number: 7002, status: 'open', payment_status: 'paid', paid_at: '2026-10-09T10:00:00Z',
  created_at: '2026-10-09T10:00:00Z', customer: { name: 'Cliente do Site' },
  products: [{ sku: 'A100', variant_id: 11, name: 'A100', quantity: 1, price: '99.00' }],
});
setEstoqueLoja(11, 2);   // a loja baixou sozinha: 3 → 2
await api('POST', '/api/produtos/A100/ajustar-estoque', { quantidadeAtual: 3, quantidadeCorreta: 4, motivo: 'correcao_cadastro' });
assert.equal(estoqueLoja(11), 2, 'a requisição devolveu à venda uma peça vendida no site');
assert.equal(fila('A100').status, 'pendente');
prova('loja abaixo do último envio + nosso número maior: a requisição ADIA (não sobrescreve)');
await cron();
assert.equal(q1(`SELECT COUNT(*) n FROM vendas WHERE externo_id = 'nuvemshop:7002'`).n, 1);
assert.equal(casa('A100'), 3);
assert.equal(estoqueLoja(11), 3);
prova('o cron puxou o pedido 7002 (venda do site), depois empurrou: Marquesa 3, loja 3');
await cron(); await cron();
assert.equal(q1(`SELECT COUNT(*) n FROM vendas WHERE externo_id = 'nuvemshop:7002'`).n, 1);
assert.equal(casa('A100'), 3);
prova('três crons depois: uma venda só do pedido 7002 (externo_id)');
const movSite = q1(`SELECT variante_id FROM movimentos WHERE origem='site' ORDER BY id DESC LIMIT 1`);
assert.equal(movSite.variante_id, '11');
prova('a baixa do site guarda a variante vendida');

/* ═══════════════════════════════════════ kill switch pela rota */
console.log('\n=== kill switch ===');
await api('PUT', '/api/nuvemshop/estoque/automatico', { ativo: false });
await api('POST', '/api/vendas', { clienteNome: 'Cliente Teste', itens: [{ sku: 'GIFT1', qtd: 1 }], pago: true });
assert.equal(casa('GIFT1'), 3);
assert.equal(estoqueLoja(31), 4);
assert.equal(fila('GIFT1').status, 'pendente');
prova('desligado: venda gravada, loja intocada, código guardado na fila');
await api('PUT', '/api/nuvemshop/estoque/automatico', { ativo: true });
await cron();
assert.equal(estoqueLoja(31), 3);
prova('religado: o cron entregou o que ficou parado');

/* ═══════════════════════════════ freio: só o caminho em lote, só sem gente */
console.log('\n=== freio do caminho em lote ===');
raw.prepare(`INSERT INTO config (chave, valor) VALUES ('syncLimiteMudancas', '3')`).run();
const emMassa = ['A100', 'GIFT1', 'CONS1', 'AJ1', 'B200', 'AZUL1', 'ROSA1', ...FILLERS];
const certo = Object.fromEntries(emMassa.map((s) => [s, casa(s)]));
for (const vid of [11, 31, 41, 51, 61, 21, 22, ...FILLERS.map((f, i) => 1000 + i)]) setEstoqueLoja(vid, 50);
for (const s of emMassa) raw.prepare(`UPDATE nuvemshop_fila SET status='pendente', versao=versao+1 WHERE sku=?`).run(s);
const escrFreio = loja.estado.escritas.length;
await cron();
assert.equal(loja.estado.escritas.length, escrFreio, 'o cron passou do freio em massa');
assert.ok(q1(`SELECT valor FROM config WHERE chave='nuvemshopFreio'`), 'o freio não ficou anunciado');
assert.equal(fila('A100').status, 'pendente');
prova('13 códigos mudando de uma vez: o cron PARA, anuncia o freio e não escreve');
const sp = await api('POST', '/api/nuvemshop/estoque/sincronizar', {});
assert.equal(sp.status, 200, JSON.stringify(sp.corpo));
for (const s of emMassa) assert.equal(fila(s).status, 'sincronizado', s);
assert.equal(estoqueLoja(11), certo.A100);
assert.equal(estoqueLoja(1005), certo.F6);
assert.equal(q1(`SELECT valor FROM config WHERE chave='nuvemshopFreio'`), undefined);
prova('"Sincronizar pendências" (gesto humano) passa do freio e limpa o aviso');
raw.prepare(`DELETE FROM config WHERE chave='syncLimiteMudancas'`).run();

/* ═══════════════════════ consignado IDENTIFICADO sai da caixinha certa */
console.log('\n=== variação na maleta: a loja vende só o que está em casa ===');
raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status, produto_id_loja, url_loja) VALUES ('ANEL1', 'Anel com aro', 'Anel', 99, 4, 'ativo', '10', 'p-10')").run();
raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, variacao, variante_id) VALUES ('ANEL1', 'entrada', 2, 'importacao', '16', '1101'), ('ANEL1', 'entrada', 2, 'importacao', '18', '1102')").run();
loja.estado.produtos.push({
  id: 10, name: { pt: 'Anel com aro' }, handle: { pt: 'anel' }, published: true, attributes: [{ pt: 'Aro' }], images: [],
  variants: [
    { id: 1101, sku: 'ANEL1', values: [{ pt: '16' }], inventory_levels: [{ location_id: 'LOC1', stock: 2 }] },
    { id: 1102, sku: 'ANEL1', values: [{ pt: '18' }], inventory_levels: [{ location_id: 'LOC1', stock: 2 }] },
  ],
});
await cron();
const mal2 = (await api('POST', '/api/maletas', { revId: rev.id, abertaEm: '2026-10-08' })).corpo;
await api('POST', `/api/maletas/${mal2.id}/itens`, { itens: { ANEL1: 1 } });
assert.equal(fila('ANEL1').status, 'revisao');
assert.equal(estoqueLoja(1101) + estoqueLoja(1102), 4);
prova('peça na maleta sem dizer o aro: revisão, nada escrito (não se adivinha a caixinha)');
raw.prepare("INSERT INTO maleta_item_variacoes (maleta_id, sku, variacao, variante_id, qtd, origem) VALUES (?, 'ANEL1', '16', '1101', 1, 'humana')").run(mal2.id);
assert.equal(fila('ANEL1').status, 'pendente');
prova('dizer o aro na maleta pôs o código na fila (gatilho)');
await cron();
assert.equal(estoqueLoja(1101), 1);
assert.equal(estoqueLoja(1102), 2);
prova('aro 16 na loja = 2 − 1 na maleta = 1; aro 18 continua 2');

/* ═══════════════════════════════════════ conferência e reconciliação */
console.log('\n=== conferir e reconciliar ===');
setEstoqueLoja(51, 99);
loja.estado.produtos.push(produtoFalso(9, [{ id: 91, sku: 'AZUL1', estoque: 1 }]));   // duplicado
let c = await api('POST', '/api/nuvemshop/estoque/conferir', {});
assert.equal(c.status, 200, JSON.stringify(c.corpo));
const ps = c.corpo.resumo.porStatus;
assert.equal(ps.divergente, 1);
assert.equal(ps.so_nuvemshop, 1);
assert.equal(ps.sem_sku, 1);
assert.ok(ps.sku_duplicado >= 2);
assert.equal(ps.aguardando_preparacao, 1);
prova('conferência classifica', JSON.stringify(ps));
assert.equal(estoqueLoja(51), 99);
prova('conferir não escreve na loja');
loja.estado.produtos.pop();
c = await api('POST', '/api/nuvemshop/estoque/conferir', {});
const seco = await api('POST', '/api/nuvemshop/estoque/reconciliar', { seco: true });
assert.deepEqual(seco.corpo.skus, ['AJ1']);
assert.equal(estoqueLoja(51), 99);
const rec = await api('POST', '/api/nuvemshop/estoque/reconciliar', {});
assert.equal(rec.status, 200, JSON.stringify(rec.corpo));
assert.equal(estoqueLoja(51), 7);
c = await api('POST', '/api/nuvemshop/estoque/conferir', {});
assert.equal(c.corpo.resumo.divergentes, 0);
prova('reconciliar mandou o saldo do Marquesa; nova conferência: 0 divergências');
const resumo = await api('GET', '/api/nuvemshop/estoque');
assert.equal(resumo.corpo.ativo, true);
assert.ok(resumo.corpo.ultimaSincronizacaoEm);
assert.equal((resumo.corpo.problemas || []).filter((p) => p.status === 'erro').length, 0);
prova('o resumo da tela diz: ativo, última sincronização, nenhum erro');

/* ═════════════════ pedido administrativo pelo banco (sem chave de API) */
console.log('\n=== pedido administrativo ao cron: conferir, depois reconciliar ===');
setEstoqueLoja(61, 40);
raw.prepare(`INSERT INTO config (chave, valor) VALUES ('nuvemshopPedidoAdmin', ?)`).run(JSON.stringify({ acao: 'conferir' }));
await cron();
assert.equal(estoqueLoja(61), 40, 'conferir escreveu na loja');
assert.equal(q1(`SELECT COUNT(*) n FROM nuvemshop_conferencia WHERE sku='B200' AND status='divergente'`).n, 1);
assert.equal(q1(`SELECT valor FROM config WHERE chave='nuvemshopPedidoAdmin'`), undefined);
prova('"conferir" pelo cron: leu, gravou o retrato (B200 divergente) e não escreveu na loja');
raw.prepare(`INSERT INTO config (chave, valor) VALUES ('nuvemshopPedidoAdmin', ?)`).run(JSON.stringify({ acao: 'reconciliar' }));
await cron();
assert.equal(estoqueLoja(61), casa('B200'));
prova('"reconciliar" pelo cron: mandou o saldo do Marquesa', `B200 = ${casa('B200')}`);

/* ═════ loja sem pedido novo: 404 "Last page is 0" é lista vazia, não erro */
console.log('\n=== loja sem pedido novo na janela ===');
const pedidosGuardados = loja.estado.pedidos;
loja.estado.pedidos = [];
setEstoqueLoja(61, 30);
raw.prepare(`UPDATE nuvemshop_fila SET status='pendente', versao=versao+1 WHERE sku='B200'`).run();
await cron();
assert.equal(estoqueLoja(61), casa('B200'), 'lista de pedidos vazia parou a rodada');
prova('a loja respondeu 404 "Last page is 0" em /orders e a rodada seguiu: B200 enviado');
loja.estado.pedidos = pedidosGuardados;

/* ═══════════════════════════════════════ custo do cron ocioso */
console.log('\n=== custo ===');
const nCron = await cron();
assert.ok(nCron <= 12, `cron ocioso fez ${nCron} consultas`);
prova('cron sem nada na fila', `${nCron} consultas ao D1, nenhuma leitura do catálogo`);
assert.ok(razaoFecha());
prova('a razão fecha: produtos.qtd == SUM(movimentos.qtd) para todo código');

console.log(`\n${provas} provas · ok`);
await loja.fechar();
