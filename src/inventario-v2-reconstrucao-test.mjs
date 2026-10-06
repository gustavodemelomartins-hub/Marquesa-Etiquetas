/** Inventário reconstruído na V2 (06/10/2026) — o servidor.
 *
 *  O feedback que esta rodada atende: a Sthefany largou o primeiro
 *  inventário real no meio. Um bipe "conferia a referência inteira" e
 *  aparecia como "6 em casa" (ela entendeu que a máquina contou várias);
 *  duas peças do mesmo aro não cabiam; a peça com revendedora de aro
 *  desconhecido travava tudo; o número era #12.
 *
 *  Worker real em processo, `api/schema.sql` num SQLite em memória, toda
 *  escrita pelas rotas. Cada prova é um item da lista do pedido:
 *
 *   1  uma unidade: um bipe = 1 conferida, contra o esperado em casa
 *   2  duas unidades iguais: dois bipes = 2
 *   3  a mesma leitura reenviada (rede) não soma de novo
 *   4  segundo bipe legítimo (outra leitura) soma
 *   5  várias unidades da mesma variação (nº23 → 2), "definir" e "menos"
 *   6  criar variação durante o inventário: oficial, sem duplicar a peça bipada
 *   7  variação que já existe ("23" com "nº23"): recusada, diz qual é
 *   8  revendedora com variação conhecida: esperado em casa da variação desconta
 *   9  revendedora com variação desconhecida: fica "não informada", nunca vira aro
 *  10  peça não conferida: aparece no balanço, não vira falta, não mexe em estoque
 *  11  falta: ajuste de inventário com "Contagem física", histórico legível
 *  12  sobra: ajuste positivo; sobra nunca é perda
 *  13  pausado: não aceita leitura; 14 retomada: continua de onde parou
 *  15  balanço antes de finalizar e fechamento
 *  16  excluir inventário sem movimento; 17 com movimento, recusado
 *  18  numeração operacional: o primeiro real é #1 mesmo com id 12
 *  19  diferença com peça sem variação num anel que separa por aro: pede a variação
 *  20  guardar as variações contadas: o resto fica "não informada", total igual
 *  21  "todas aqui", "nenhuma", "limpar"; kit não se conta
 *  22  a razão fecha no fim (GET /api/estoque/conferir)
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

/* ── catálogo. Toda quantidade nasce de movimento (a razão fecha). */
const ONTEM = '2026-10-04 09:00:00';
const peca = (sku, desc, qtd, cat = 'Anel') => raw.prepare(
  "INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, ?, 99, ?, 'ativo')").run(sku, desc, cat, qtd);
const mov = (sku, qtd, variacao = null, varianteId = null) => raw.prepare(
  "INSERT INTO movimentos (sku, variacao, variante_id, tipo, qtd, origem, criado_em) VALUES (?, ?, ?, 'entrada', ?, 'importacao', ?)",
).run(sku, variacao, varianteId, qtd, ONTEM);
const variacao = (sku, nome, vid, ordem, origem = 'local') => raw.prepare(
  "INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem) VALUES (?, ?, 'Tamanho', ?, ?, ?, ?)",
).run(sku, nome, vid, ordem, JSON.stringify([{ atributo: 'Tamanho', valor: nome }]), origem);

peca('111111', 'Brinco Gota', 6, 'Brinco'); mov('111111', 6);          // 1–4, 11
peca('222222', 'Colar Elo', 3, 'Colar'); mov('222222', 3);             // 12: sobra
peca('333333', 'Pulseira Fita', 2, 'Pulseira'); mov('333333', 2);      // 10: não conferida
/* 256359 — o anel da Sthefany: 7 no total, razão SEM aro (go-live), 1 com a
   Evelyn sem aro conhecido. Aros cadastrados: nº18, nº21, nº23. */
peca('256359', 'Anel Inspiração Cartier', 7); mov('256359', 7);
variacao('256359', 'nº18', 'local:a18', 0); variacao('256359', 'nº21', 'local:a21', 1); variacao('256359', 'nº23', 'local:a23', 2);
/* 400400 — anel cuja razão SEPARA por aro: n°16: 2, n°18: 3 (grafia da loja). 1 do
   n°18 está com a Bruna, identificado. */
peca('400400', 'Anel Solitário', 5);
mov('400400', 2, 'n°16', 'v16'); mov('400400', 3, 'n°18', 'v18');
variacao('400400', 'n°16', 'v16', 0, 'loja'); variacao('400400', 'n°18', 'v18', 1, 'loja');
/* Um kit (não se conta). */
peca('KIT001', 'Kit Presente', 0, 'Brinco');
raw.prepare("INSERT INTO kit_componentes (kit_sku, componente_sku, qtd) VALUES ('KIT001', '111111', 1)").run();

raw.prepare("INSERT INTO revendedoras (id, nome, status) VALUES (1, 'Evelyn Veiga', 'ativa'), (2, 'Bruna Follei', 'ativa')").run();
raw.prepare("INSERT INTO maletas (id, rev_id, status, aberta_em) VALUES (1, 1, 'aberta', '2026-09-26'), (2, 2, 'aberta', '2026-09-26')").run();
const naMaleta = (maleta, sku, qtd) => {
  raw.prepare('INSERT INTO maleta_itens (maleta_id, sku, qtd, preco_envio, devolvida) VALUES (?, ?, ?, 99, 0)').run(maleta, sku, qtd);
  raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, maleta_id, criado_em) VALUES (?, 'consignacao', 0, 'maleta', ?, ?)").run(sku, maleta, ONTEM);
};
naMaleta(1, '256359', 1);                       // 9: aro desconhecido
naMaleta(2, '400400', 1);                       // 8: aro conhecido
raw.prepare("INSERT INTO maleta_item_variacoes (maleta_id, sku, variacao, variante_id, qtd) VALUES (2, '400400', 'n°18', 'v18', 1)").run();

const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(Array.isArray(r.corpo.divergentes), 'a conferência da razão mudou de formato');
  return r.corpo.ok === true && r.corpo.divergentes.length === 0;
};
const totalDe = (sku) => q1('SELECT qtd FROM produtos WHERE sku = ?', sku).qtd;
assert.ok(await razaoFecha(), 'cenário: a razão nasce fechada');

/* ═════════ 18 — numeração: os testes apagados levaram os ids 1–11 */
raw.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('inventarios', 11)").run();
const abre = await api('POST', '/api/inventarios', {});
assert.equal(abre.status, 201, JSON.stringify(abre.corpo));
const ID = abre.corpo.id;
assert.equal(ID, 12, 'o id técnico deveria seguir o contador');
assert.equal(abre.corpo.numero, 1, 'o primeiro inventário real não é o #1');
assert.equal((await api('GET', '/api/inventarios')).corpo[0].numero, 1);
assert.equal((await api('GET', `/api/inventarios/${ID}`)).corpo.numero, 1);
prova('18 — o primeiro inventário real é o #1 na tela, com id técnico 12 por baixo');

let n = 0;
const leitura = (corpo) => api('POST', `/api/inventarios/${ID}/leituras`, { leituraId: `t-${++n}`, ...corpo });
const linhas = (sku) => Object.fromEntries(qa(
  'SELECT variacao, contado FROM inventario_contagem WHERE inventario_id = ? AND sku = ?', ID, sku)
  .map((l) => [l.variacao, l.contado]));

/* ═════════ 1, 2, 3, 4 — um bipe é uma unidade */
const det0 = (await api('GET', `/api/inventarios/${ID}`)).corpo;
assert.equal(det0.esperados.find((e) => e.sku === '111111').esperado, 6);
const b1 = await leitura({ sku: '111111', gesto: 'bipe' });
assert.equal(b1.status, 200, JSON.stringify(b1.corpo));
assert.deepEqual(b1.corpo.linhas.map((l) => [l.variacao, l.contado]), [['', 1]]);
prova('1 — um bipe = 1 unidade conferida (não "6 em casa")');

const b2 = await leitura({ sku: '111111', gesto: 'bipe' });
assert.equal(b2.corpo.linhas[0].contado, 2);
prova('2 — duas peças iguais, dois bipes: 2 conferidas');

const reenvio = await api('POST', `/api/inventarios/${ID}/leituras`, { leituraId: `t-${n}`, sku: '111111', gesto: 'bipe' });
assert.equal(reenvio.status, 200);
assert.equal(reenvio.corpo.repetida, true);
assert.equal(linhas('111111')[''], 2, 'a mesma leitura reenviada somou de novo');
assert.equal(q1('SELECT COUNT(*) n FROM inventario_leituras WHERE inventario_id = ? AND sku = ?', ID, '111111').n, 2);
prova('3 — a mesma leitura reenviada (rede ruim) não soma de novo, e o rastro tem uma linha por leitura');

await leitura({ sku: '111111', gesto: 'bipe' });
await leitura({ sku: '111111', gesto: 'bipe' });
assert.equal(linhas('111111')[''], 4);
prova('4 — segundo bipe legítimo (outra leitura) soma');

/* ═════════ 5 — várias unidades da mesma variação */
const bAnel = await leitura({ sku: '256359', gesto: 'bipe' });            // sem aro: "não informada"
assert.deepEqual(linhas('256359'), { '': 1 });
const moveu = await leitura({ sku: '256359', gesto: 'mover', de: '', para: '23' });   // "23" = nº23
assert.equal(moveu.status, 200, JSON.stringify(moveu.corpo));
assert.deepEqual(linhas('256359'), { '': 0, 'nº23': 1 });
await leitura({ sku: '256359', gesto: 'mais', variacao: 'nº23' });
assert.equal(linhas('256359')['nº23'], 2, 'a segunda peça do mesmo aro não coube');
await leitura({ sku: '256359', gesto: 'definir', variacao: 'nº21', quantidade: 3 });
await leitura({ sku: '256359', gesto: 'menos', variacao: 'nº21' });
assert.deepEqual(linhas('256359'), { '': 0, 'nº21': 2, 'nº23': 2 });
const negativo = await leitura({ sku: '256359', gesto: 'menos', variacao: 'nº18' });
assert.equal(negativo.status, 409, 'contagem ficou negativa');
assert.equal(bAnel.status, 200);
prova('5 — nº23 → 2 e nº21 → 2: variação não é unidade única; "23" é o nº23; nunca negativo');

/* ═════════ 6, 7 — criar variação no inventário, sem duplicar */
await leitura({ sku: '256359', gesto: 'bipe' });                          // a peça na mão, sem aro
const cria = await api('POST', `/api/inventarios/${ID}/variacoes`, { sku: '256359', valor: '19', quantidade: 1 });
assert.equal(cria.status, 201, JSON.stringify(cria.corpo));
assert.deepEqual(cria.corpo.criadas.map((c) => c.nome), ['nº19'], 'a grafia não seguiu as irmãs');
assert.deepEqual(linhas('256359'), { '': 0, 'nº19': 1, 'nº21': 2, 'nº23': 2 },
  'o anel bipado e a variação criada contaram a mesma peça duas vezes');
assert.ok(q1("SELECT 1 x FROM produto_variacoes WHERE sku = '256359' AND nome = 'nº19'"), 'a variação não ficou no cadastro');
const estrutura = (await api('GET', '/api/produtos/256359/variacoes')).corpo;
assert.ok(estrutura.variacoes.some((v) => v.nome === 'nº19'), 'a variação nova não aparece em Peças');
assert.equal(totalDe('256359'), 7, 'criar variação mexeu no estoque');
assert.ok(q1("SELECT 1 x FROM inventario_eventos WHERE inventario_id = ? AND variacao = 'nº19'", ID));
prova('6 — variação criada no inventário: oficial no cadastro, a peça bipada passa para ela, estoque igual');

for (const grafia of ['23', 'nº 23', 'N23', 'n°23', 'Aro 23']) {
  const dup = await api('POST', `/api/inventarios/${ID}/variacoes`, { sku: '256359', valor: grafia, quantidade: 1 });
  assert.equal(dup.status, 409, `"${grafia}" criou uma segunda nº23`);
  assert.equal(dup.corpo.jaExiste, true);
  assert.equal(dup.corpo.existente, 'nº23');
}
assert.equal(q1("SELECT COUNT(*) n FROM produto_variacoes WHERE sku = '256359'").n, 4);
assert.equal(linhas('256359')['nº23'], 2, 'a tentativa duplicada contou peça');
const dupPeca = await api('POST', '/api/produtos/400400/variacoes/adicionar', { valor: '16' });
assert.equal(dupPeca.status, 409);
assert.equal(dupPeca.corpo.existente, 'n°16');
const novaPeca = await api('POST', '/api/produtos/400400/variacoes/adicionar', { valor: '20' });
assert.equal(novaPeca.status, 201, JSON.stringify(novaPeca.corpo));
assert.equal(novaPeca.corpo.valor, 'n°20', 'em Peças, a grafia nova não seguiu a da loja');
prova('7 — "23", "nº 23", "N23", "n°23", "Aro 23" são a nº23 que já existe: nada criado, nada contado');

/* ═════════ 8, 9 — o que está com revendedoras */
const det1 = (await api('GET', `/api/inventarios/${ID}`)).corpo;
const sol = det1.esperados.find((e) => e.sku === '400400');
assert.equal(sol.razaoPorVariacao, true);
assert.deepEqual(sol.variacoes.filter((v) => v.nome !== 'n°20').map((v) => [v.nome, v.cadastro, v.comRevendedoras, v.esperado]),
  [['n°16', 2, 0, 2], ['n°18', 3, 1, 2]]);
assert.deepEqual(sol.revendedoras.map((r) => [r.nome, r.qtd, r.variacoes.map((x) => x.nome)]),
  [['Bruna Follei', 1, ['n°18']]]);
prova('8 — revendedora com variação conhecida: o n°18 em casa é 3 − 1 = 2, e a maleta diz o aro');

const cartier = det1.esperados.find((e) => e.sku === '256359');
assert.equal(cartier.esperado, 6, 'total 7 − 1 com a Evelyn');
assert.equal(cartier.razaoPorVariacao, false);
assert.ok(cartier.variacoes.every((v) => v.esperado === null), 'o servidor inventou o esperado de um aro');
assert.equal(cartier.naoInformada.comRevendedoras, 1);
assert.deepEqual(cartier.revendedoras[0].variacoes, [], 'a peça da Evelyn ganhou um aro');
prova('9 — revendedora com variação desconhecida: "não informada", nenhum aro atribuído');

/* ═════════ 13, 14 — pausar e retomar */
assert.equal((await api('POST', `/api/inventarios/${ID}/pausar`)).status, 200);
const pausada = await leitura({ sku: '111111', gesto: 'bipe' });
assert.equal(pausada.status, 409, 'contou com o inventário pausado');
assert.equal(linhas('111111')[''], 4);
prova('13 — pausado: a leitura é recusada e nada muda');
assert.equal((await api('POST', `/api/inventarios/${ID}/retomar`)).status, 200);
const det2 = (await api('GET', `/api/inventarios/${ID}`)).corpo;
assert.equal(det2.contagem.find((c) => c.sku === '111111').contado, 4);
assert.equal((await leitura({ sku: '111111', gesto: 'mais' })).corpo.linhas[0].contado, 5);
prova('14 — retomada: a contagem continua de onde parou');

/* ═════════ 21 — todas, nenhuma, limpar; kit */
const kit = await leitura({ sku: 'KIT001', gesto: 'bipe' });
assert.equal(kit.status, 409);
await leitura({ sku: '222222', gesto: 'todas' });
assert.deepEqual(linhas('222222'), { '': 3 });
await leitura({ sku: '222222', gesto: 'mais' });                          // achou uma a mais
await leitura({ sku: '333333', gesto: 'nenhuma' });
assert.deepEqual(linhas('333333'), { '': 0 });
await leitura({ sku: '333333', gesto: 'limpar' });
assert.deepEqual(linhas('333333'), {}, '"limpar" não voltou para não conferido');
prova('21 — "todas aqui" vira o esperado; "nenhuma" é zero; "limpar" volta a não conferido; kit não se conta');

/* Anel que separa por aro, com peça contada sem aro: */
await leitura({ sku: '400400', gesto: 'bipe' });
await leitura({ sku: '400400', gesto: 'mais', variacao: 'n°16' });
await leitura({ sku: '400400', gesto: 'mais', variacao: 'n°16' });

/* ═════════ 15, 10 — balanço antes de finalizar */
const bal = await api('GET', `/api/inventarios/${ID}/balanco`);
assert.equal(bal.status, 200, JSON.stringify(bal.corpo));
const B = bal.corpo;
const acha = (lista, sku) => lista.find((l) => l.sku === sku);
assert.equal(B.numero, 1);
assert.ok(acha(B.naoConferido, '333333'), 'a peça não conferida sumiu do balanço');
assert.ok(!acha(B.faltando, '333333'), 'não conferida virou falta');
assert.equal(acha(B.faltando, '111111').dif, -1);
assert.equal(acha(B.sobrando, '222222').dif, 1);
const anelB = acha(B.faltando, '256359');
assert.equal(anelB.contado, 5); assert.equal(anelB.esperado, 6);
assert.equal(anelB.modo, 'codigo');
const solB = acha(B.faltando, '400400');
assert.equal(solB.modo, 'escolher');
assert.equal(solB.precisaVariacao, true);
assert.equal(B.impacto.reduzem, 3);
assert.equal(B.impacto.aumentam, 1);
assert.equal(B.impacto.naoConferidos, 1);
assert.equal(B.totais.pecasEsperadas, 6 + 3 + 2 + 6 + 4);
assert.equal(totalDe('111111'), 6, 'o balanço mexeu no estoque');
prova('10, 15 — balanço ao vivo: falta, sobra, não conferida e o impacto antes de finalizar; nada escrito');

/* ═════════ fechamento */
const fim = await api('POST', `/api/inventarios/${ID}/concluir`, {});
assert.equal(fim.status, 200, JSON.stringify(fim.corpo));
assert.equal(fim.corpo.numero, 1);
const antesAplicar = { a: totalDe('111111'), b: totalDe('222222'), c: totalDe('333333') };
assert.deepEqual(antesAplicar, { a: 6, b: 3, c: 2 }, 'concluir mexeu no estoque');
prova('15 — concluir congela o retrato e não mexe em estoque');

/* ═════════ 11 — falta: ajuste de inventário legível */
const ap1 = await api('POST', `/api/inventarios/${ID}/aplicar`, {
  itens: [{ sku: '111111', motivo: 'Contagem física', motivoId: 'contagem_fisica' }],
});
assert.equal(ap1.status, 200, JSON.stringify(ap1.corpo));
assert.equal(totalDe('111111'), 5);
const m1 = q1("SELECT tipo, qtd, origem, obs FROM movimentos WHERE sku = '111111' AND origem = 'inventario'");
assert.equal(m1.tipo, 'ajuste'); assert.equal(m1.qtd, -1);
assert.match(m1.obs, /^Ajuste de inventário #1 · Contagem física · contado 5, sistema dizia 6/);
assert.equal(q1("SELECT COUNT(*) n FROM saidas_sem_faturamento WHERE sku = '111111'").n, 0, 'a falta virou perda sozinha');
prova('11 — falta: ajuste de inventário #1 · Contagem física · contado 5, sistema dizia 6 — e não é perda');

/* ═════════ 12 — sobra */
const perdaNaSobra = await api('POST', `/api/inventarios/${ID}/aplicar`, {
  itens: [{ sku: '222222', motivo: 'Perda confirmada', motivoId: 'perda' }],
});
assert.equal(perdaNaSobra.status, 409, 'sobra virou perda');
const ap2 = await api('POST', `/api/inventarios/${ID}/aplicar`, {
  itens: [{ sku: '222222', motivo: 'Contagem física', motivoId: 'contagem_fisica' }],
});
assert.equal(ap2.status, 200, JSON.stringify(ap2.corpo));
assert.equal(totalDe('222222'), 4);
prova('12 — sobra: +1 por ajuste; "Perda confirmada" numa sobra é recusada');

/* ═════════ 9 + 11 — o anel sem aro na razão: falta no código inteiro */
const ap3 = await api('POST', `/api/inventarios/${ID}/aplicar`, {
  itens: [{ sku: '256359', motivo: 'Contagem física', motivoId: 'contagem_fisica' }],
});
assert.equal(ap3.status, 200, JSON.stringify(ap3.corpo));
assert.equal(totalDe('256359'), 6);
const m3 = q1("SELECT variacao, variante_id FROM movimentos WHERE sku = '256359' AND origem = 'inventario'");
assert.deepEqual([m3.variacao, m3.variante_id], [null, null], 'a falta do anel ganhou um aro inventado');
prova('9 — a falta do anel sem aro na razão entra no código inteiro, sem aro inventado');

/* ═════════ 19 — anel que separa por aro, com peça contada sem aro */
const semDestino = await api('POST', `/api/inventarios/${ID}/aplicar`, {
  itens: [{ sku: '400400', motivo: 'Contagem física', motivoId: 'contagem_fisica' }],
});
assert.equal(semDestino.status, 409);
assert.equal(semDestino.corpo.precisaVariacao, true);
/* Contou 3 em casa (1 sem aro + 2 do n°16); esperava 4 (n°16: 2, n°18: 2).
   Ela diz: a que falta é do n°18. Tirar do n°16 deixaria 1 ali, possível;
   tirar 2 do n°18, não. */
const destino = await api('POST', `/api/inventarios/${ID}/aplicar`, {
  itens: [{ sku: '400400', motivo: 'Contagem física', motivoId: 'contagem_fisica', destino: '18' }],
});
assert.equal(destino.status, 200, JSON.stringify(destino.corpo));
assert.equal(q1("SELECT SUM(qtd) s FROM movimentos WHERE sku = '400400' AND variacao = 'n°18'").s, 2);
assert.equal(totalDe('400400'), 4);
prova('19 — anel que separa por aro e peça contada sem aro: só ajusta quando ela diz qual aro');

/* ═════════ 20 — guardar as variações contadas do anel sem aro na razão */
const guarda = await api('POST', `/api/inventarios/${ID}/variacoes/guardar`, { sku: '256359' });
assert.equal(guarda.status, 200, JSON.stringify(guarda.corpo));
const saldoVar = (nome) => q1(
  "SELECT COALESCE(SUM(qtd), 0) s FROM movimentos WHERE sku = '256359' AND variacao = ?", nome).s;
assert.deepEqual(['nº18', 'nº19', 'nº21', 'nº23'].map(saldoVar), [0, 1, 2, 2]);
const semAro = q1("SELECT COALESCE(SUM(qtd), 0) s FROM movimentos WHERE sku = '256359' AND variacao IS NULL").s;
assert.equal(semAro, 1, 'a peça da Evelyn (aro desconhecido) não ficou em "não informada"');
assert.equal(totalDe('256359'), 6, 'guardar as variações mudou o total');
prova('20 — variações contadas guardadas: nº19 1 · nº21 2 · nº23 2, e 1 "não informada" (a da Evelyn)');

/* A distribuição parcial em Peças não deixa atribuir aro à peça da Evelyn. */
const tudo = await api('POST', '/api/produtos/256359/variacoes/distribuir', {
  parcial: true,
  distribuicao: [{ varianteId: 'local:a18', qtd: 1 }, { varianteId: 'local:a21', qtd: 2 },
    { varianteId: 'local:a23', qtd: 2 }, { varianteId: cria.corpo.criadas[0].varianteId, qtd: 1 }],
});
assert.equal(tudo.status, 409, 'a distribuição deu um aro à peça da revendedora');
assert.match(tudo.corpo.erro, /sem variação informada/);
const parcial = await api('POST', '/api/produtos/256359/variacoes/distribuir', {
  parcial: true,
  distribuicao: [{ varianteId: 'local:a18', qtd: 0 }, { varianteId: 'local:a21', qtd: 2 },
    { varianteId: 'local:a23', qtd: 2 }, { varianteId: cria.corpo.criadas[0].varianteId, qtd: 0 }],
});
assert.equal(parcial.status, 200, JSON.stringify(parcial.corpo));
assert.equal(totalDe('256359'), 6);
prova('20b — distribuição parcial em Peças: soma abaixo do total vale; atribuir aro à peça da maleta, não');

/* ═════════ 16, 17 — excluir */
const bloq = await api('DELETE', `/api/inventarios/${ID}`);
assert.equal(bloq.status, 409, 'excluiu um inventário que mexeu no estoque');
assert.ok(bloq.corpo.efeitos.length);
prova('17 — inventário que alterou estoque não pode ser excluído');

const inv2 = await api('POST', '/api/inventarios', {});
assert.equal(inv2.corpo.numero, 2);
await api('POST', `/api/inventarios/${inv2.corpo.id}/leituras`, { leituraId: 'x-1', sku: '111111', gesto: 'bipe' });
assert.equal((await api('POST', `/api/inventarios/${inv2.corpo.id}/cancelar`)).status, 200);
const exc = await api('DELETE', `/api/inventarios/${inv2.corpo.id}`);
assert.equal(exc.status, 200, JSON.stringify(exc.corpo));
assert.equal(exc.corpo.numero, 2);
assert.equal(q1('SELECT numero FROM inventarios_excluidos WHERE inventario_id = ?', inv2.corpo.id).numero, 2);
assert.equal(q1('SELECT COUNT(*) n FROM inventario_leituras WHERE inventario_id = ?', inv2.corpo.id).n, 0);
const inv3 = await api('POST', '/api/inventarios', {});
assert.equal(inv3.corpo.numero, 2, 'o número de um inventário de teste excluído não voltou');
assert.ok(inv3.corpo.id > inv2.corpo.id, 'o id técnico voltou');
prova('16 — inventário sem movimento é excluído com registro; o número dele volta, o id não');

/* ═════════ 22 — a razão */
assert.ok(await razaoFecha(), 'a razão terminou aberta');
prova('22 — GET /api/estoque/conferir vazio: produtos.qtd == SUM(movimentos.qtd)');

/* ═════════ a migration: o #12 de PROD vira o #1 */
{
  const velho = new DatabaseSync(':memory:');
  const schema = readFileSync(join(raiz, 'api/schema.sql'), 'utf8')
    .replace(/,\s*-- O NÚMERO que a tela mostra[\s\S]*?numero\s+INTEGER\n\);/, '\n);')
    .replace('CREATE UNIQUE INDEX IF NOT EXISTS idx_inventarios_numero ON inventarios(numero);', '')
    .replace(/CREATE TABLE IF NOT EXISTS inventario_leituras[\s\S]*?ON inventario_leituras\(inventario_id, sku\);/, '')
    .replace(/  -- Código com variação \(06\/10\/2026\)[\s\S]*?partes_json   TEXT,\n/, '')
    .replace(",\n  numero        INTEGER                              -- o número que ele tinha na tela\n);", '\n);');
  velho.exec(schema);
  assert.ok(!velho.prepare("SELECT name FROM pragma_table_info('inventarios')").all().some((c) => c.name === 'numero'),
    'o schema "de antes" do teste já tinha a coluna');
  velho.exec("INSERT INTO sqlite_sequence (name, seq) VALUES ('inventarios', 11)");
  velho.exec("INSERT INTO inventarios (status, pausado_em) VALUES ('aberto', '2026-10-05 19:07:32')");
  velho.exec(readFileSync(join(raiz, 'api/migracao-inventario-v2.sql'), 'utf8'));
  const r = velho.prepare('SELECT id, numero FROM inventarios').get();
  assert.deepEqual([r.id, r.numero], [12, 1]);
  prova('migration: o inventário 12 (o real, pausado) vira o Inventário #1, sem renumerar o id');
}

console.log(`\nInventário V2 reconstruído: ${provas} provas, razão fechada.`);
