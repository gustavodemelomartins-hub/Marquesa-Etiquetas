/** Variações da peça na V2 — o estoque físico não depende da loja (06/10/2026).
 *
 *  O caso real: código 391471, "Anel Coração Vazado Cravejado Banho de Ouro
 *  18k", total 2. A Nuvemshop vende o anel com UMA variante, 1509838878,
 *  "Banho de Ouro 18K · n°18" (loja online: 2). No inventário a Sthefany
 *  criou aqui "nº24" e "nº18". Em Peças → Variações ela pôs nº24 = 1 e
 *  nº18 = 1, e salvar foi recusado com
 *  "A variante 1509838878 não existe na loja para 391471." — a rota
 *  conferia contra UMA fonte (a loja OU o cadastro daqui) e a tela mandava
 *  as duas.
 *
 *  Worker real em processo, `api/schema.sql` num SQLite em memória, toda
 *  escrita pelas rotas. Nenhuma chamada de rede pode acontecer: o `fetch`
 *  global explode se alguém tentar falar com a Nuvemshop.
 *
 *   1  o print: a estrutura mostra nº24 e nº18, e a variante da loja vira
 *      "loja online: 2" na linha do nº18 — não uma terceira linha
 *   2  o painel clássico continua recebendo a resposta de sempre
 *   3  o payload EXATO da tela antiga (com o id da loja em zero) salva
 *   4  nº18 = 1, nº24 = 1, total 2, nada publicado, nenhum vínculo inventado
 *   5  id da loja com quantidade (tela velha) → recusa humana, nada muda
 *   6  variante desconhecida → frase sem id; o id vai em campo à parte
 *   7  produto que saiu da loja (variante apagada lá) → só as daqui, salva
 *   8  Nuvemshop fora do ar / sync desligado: nenhuma chamada de rede
 *   9  "Aro 18" com nº18 existente → "já existe: nº18"
 *  10  duas unidades da mesma variação
 *  11  distribuição que não fecha: o resto fica "não informada"
 *  12  acima do total: recusa humana, total intocado
 *  13  variante da loja COM saldo + equivalente daqui: dúvida, as duas ficam
 *  14  loja com 2 variantes vinculadas + uma criada aqui: as três salvam
 *  15  equivalência pura: ordem invertida casa; anel em duas cores não
 *  16  a razão fecha no fim
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

/* 8 — a Nuvemshop "fora do ar": qualquer chamada de rede é um erro. */
let chamadasDeRede = 0;
globalThis.fetch = async () => { chamadasDeRede += 1; throw new Error('rede proibida neste teste'); };

const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const { equivalenciasLojaLocal } = await import(pathToFileURL(join(raiz, 'api/src/variacao-nome.js')).href);
const env = { DB, API_KEY: 'k' };          // sem token da loja: sync desligado
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
const semTecnico = (txt) => {
  assert.ok(!/\b\d{8,}\b|local:|[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(txt)), `mensagem técnica na tela: ${txt}`);
};

/* ── cenário */
const ONTEM = '2026-10-04 09:00:00';
const peca = (sku, desc, qtd) => raw.prepare(
  "INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, 'Anel', 69, ?, 'ativo')").run(sku, desc, qtd);
const mov = (sku, qtd, variacao = null, varianteId = null) => raw.prepare(
  "INSERT INTO movimentos (sku, variacao, variante_id, tipo, qtd, origem, criado_em) VALUES (?, ?, ?, 'entrada', ?, 'importacao', ?)",
).run(sku, variacao, varianteId, qtd, ONTEM);
const daqui = (sku, nome, vid, ordem, origem = 'local', valores = [{ atributo: 'Tamanho', valor: nome }]) => raw.prepare(
  'INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem) VALUES (?, ?, ?, ?, ?, ?, ?)',
).run(sku, nome, 'Tamanho', vid, ordem, JSON.stringify(valores), origem);
const daLoja = (sku, vid, pid, valores, estoque, posicao = 0) => raw.prepare(
  `INSERT INTO loja_variantes (variante_id, produto_id, sku, sku_norm, valores_json, nome, estoque, posicao, lido_em)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-02T15:12:28.977Z')`,
).run(vid, pid, sku, sku, JSON.stringify(valores), valores.map((v) => v.valor).join(' · '), estoque, posicao);
const banho = (aro) => [{ atributo: 'Cor', valor: 'Banho de Ouro 18K' }, { atributo: 'Tamanho', valor: aro }];

/* 391471 — exatamente como está em PROD (lido em 06/10/2026). */
peca('391471', 'Anel Coração Vazado Cravejado Banho de Ouro 18k', 2); mov('391471', 2);
daLoja('391471', '1509838878', '339112478', banho('n°18'), 2, 2);
daqui('391471', 'nº24', 'local:e3a68e92-50fa-4dbb-b169-bfcaae665988', 0);
daqui('391471', 'nº18', 'local:26336e56-971d-4cbc-b88c-7a31a63ef631', 1);
const N24 = 'local:e3a68e92-50fa-4dbb-b169-bfcaae665988';
const N18 = 'local:26336e56-971d-4cbc-b88c-7a31a63ef631';

const razaoFecha = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return r.corpo.ok === true && r.corpo.divergentes.length === 0;
};
const saldoDe = (sku, vid) => q1('SELECT COALESCE(SUM(qtd), 0) s FROM movimentos WHERE sku = ? AND variante_id = ?', sku, vid).s;
const semVariacao = (sku) => q1(
  'SELECT COALESCE(SUM(qtd), 0) s FROM movimentos WHERE sku = ? AND variacao IS NULL AND variante_id IS NULL', sku).s;
const totalDe = (sku) => q1('SELECT qtd FROM produtos WHERE sku = ?', sku).qtd;
assert.ok(await razaoFecha(), 'cenário: a razão nasce fechada');

/* ═════════ 1 — o print */
const est = await api('GET', '/api/produtos/391471/variacoes?visao=estoque');
assert.equal(est.status, 200, JSON.stringify(est.corpo));
assert.deepEqual(est.corpo.variacoes.map((v) => v.nome), ['nº24', 'nº18'],
  'a variante da loja voltou a ser uma linha própria ao lado do nº18');
const l18 = est.corpo.variacoes.find((v) => v.nome === 'nº18');
const l24 = est.corpo.variacoes.find((v) => v.nome === 'nº24');
assert.equal(l18.estoqueLoja, 2);
assert.equal(l18.lojaOnline, 'equivalente');
assert.equal(l18.varianteId, N18, 'a variação daqui ganhou o id da loja: vínculo inventado');
assert.equal(l24.lojaOnline, 'nao_publicada');
assert.equal(l24.estoqueLoja, null);
prova('1 — o print: nº24 e nº18; a variante da loja é "loja online: 2" no nº18, não uma terceira linha');

/* ═════════ 2 — o clássico não muda */
const classico = await api('GET', '/api/produtos/391471/variacoes');
assert.equal(classico.corpo.variacoes.length, 3);
assert.ok(classico.corpo.variacoes.every((v) => v.lojaOnline === undefined));
prova('2 — sem ?visao=estoque a resposta é a de sempre (painel clássico intocado)');

/* ═════════ 5 — tela velha mandando quantidade para o id da loja */
const velha = await api('POST', '/api/produtos/391471/variacoes/distribuir', {
  parcial: true, obs: 'teste',
  distribuicao: [{ varianteId: '1509838878', qtd: 1 }, { varianteId: N24, qtd: 1 }],
});
assert.equal(velha.status, 409, JSON.stringify(velha.corpo));
semTecnico(velha.corpo.erro);
assert.equal(qa("SELECT id FROM movimentos WHERE sku = '391471'").length, 1, 'a recusa escreveu movimento');
prova('5 — id da loja com quantidade (tela aberta antes da correção): recusa humana, nada escrito');

/* ═════════ 6 — variante desconhecida */
const desconhecida = await api('POST', '/api/produtos/391471/variacoes/distribuir', {
  parcial: true, distribuicao: [{ varianteId: '9999999999', qtd: 1 }],
});
assert.equal(desconhecida.status, 400);
semTecnico(desconhecida.corpo.erro);
assert.equal(desconhecida.corpo.varianteDesconhecida, '9999999999');
prova('6 — variante desconhecida: a frase não tem id; o id vai em campo à parte');

/* ═════════ 3 e 4 — o payload EXATO que a tela do print mandou */
const salvo = await api('POST', '/api/produtos/391471/variacoes/distribuir', {
  parcial: true, obs: 'Variações conferidas na ficha da peça',
  distribuicao: [{ varianteId: '1509838878', qtd: 0 }, { varianteId: N24, qtd: 1 }, { varianteId: N18, qtd: 1 }],
});
assert.equal(salvo.status, 200, JSON.stringify(salvo.corpo));
prova('3 — o payload exato da tela do print salva');

assert.equal(saldoDe('391471', N18), 1);
assert.equal(saldoDe('391471', N24), 1);
assert.equal(saldoDe('391471', '1509838878'), 0);
assert.equal(semVariacao('391471'), 0);
assert.equal(totalDe('391471'), 2, 'salvar variações mudou o total');
assert.deepEqual(qa("SELECT nome, variante_id, origem FROM produto_variacoes WHERE sku = '391471' ORDER BY ordem")
  .map((r) => [r.nome, r.variante_id, r.origem]),
[['nº24', N24, 'local'], ['nº18', N18, 'local']], 'a estrutura daqui mudou (cópia da loja ou vínculo inventado)');
assert.equal(q1("SELECT estoque FROM loja_variantes WHERE variante_id = '1509838878'").estoque, 2,
  'a leitura da loja foi alterada');
const depois = await api('GET', '/api/produtos/391471/variacoes?visao=estoque');
assert.deepEqual(depois.corpo.variacoes.map((v) => [v.nome, v.saldo]), [['nº24', 1], ['nº18', 1]]);
assert.ok(await razaoFecha());
prova('4 — nº18 = 1, nº24 = 1, total 2; loja intocada, nenhum vínculo com a Nuvemshop gravado');

/* ═════════ 7 — a variante sumiu da loja depois (produto despublicado) */
peca('500500', 'Anel Fora da Loja', 3); mov('500500', 3);
daqui('500500', 'nº16', 'local:a16', 0); daqui('500500', 'n°17', '1320000001', 1, 'loja');
const sumiu = await api('POST', '/api/produtos/500500/variacoes/distribuir', {
  parcial: true, distribuicao: [{ varianteId: 'local:a16', qtd: 1 }, { varianteId: '1320000001', qtd: 1 }],
});
assert.equal(sumiu.status, 200, JSON.stringify(sumiu.corpo));
assert.equal(saldoDe('500500', 'local:a16'), 1);
assert.equal(semVariacao('500500'), 1);
const e7 = await api('GET', '/api/produtos/500500/variacoes?visao=estoque');
assert.ok(e7.corpo.variacoes.every((v) => v.lojaOnline === null), 'peça fora da loja não deve falar de loja');
prova('7 — variante gravada com id da loja que a loja não tem mais: salva igual, sem falar de loja');

/* ═════════ 8 */
assert.equal(chamadasDeRede, 0, 'alguém tentou falar com a Nuvemshop ao salvar estoque');
prova('8 — Nuvemshop fora do ar e sync desligado: nenhuma chamada de rede ao ler ou salvar');

/* ═════════ 9 — "Aro 18" com nº18 */
const aro = await api('POST', '/api/produtos/391471/variacoes/adicionar', { valor: 'Aro 18' });
assert.equal(aro.status, 409, JSON.stringify(aro.corpo));
assert.equal(aro.corpo.existente, 'nº18');
semTecnico(aro.corpo.erro);
assert.equal(q1("SELECT COUNT(*) n FROM produto_variacoes WHERE sku = '391471'").n, 2);
prova('9 — "Aro 18" com nº18 cadastrado: "Essa variação já existe: nº18", nada criado');

/* ═════════ 10 e 11 — duas do mesmo aro; o que não fecha fica "não informada" */
peca('600600', 'Anel Duas Iguais', 3); mov('600600', 3);
daLoja('600600', '1600000001', '1600', banho('n°20'), 0);
daqui('600600', 'nº20', 'local:b20', 0); daqui('600600', 'nº22', 'local:b22', 1);
const duas = await api('POST', '/api/produtos/600600/variacoes/distribuir', {
  parcial: true, distribuicao: [{ varianteId: 'local:b20', qtd: 2 }],
});
assert.equal(duas.status, 200, JSON.stringify(duas.corpo));
assert.equal(saldoDe('600600', 'local:b20'), 2);
assert.equal(saldoDe('600600', 'local:b22'), 0);
assert.equal(semVariacao('600600'), 1);
assert.equal(totalDe('600600'), 3);
prova('10 — duas unidades da mesma variação (nº20 = 2)');
prova('11 — soma 2 de 3: a terceira fica "variação ainda não informada", total igual');

/* ═════════ 12 — acima do total */
const acima = await api('POST', '/api/produtos/600600/variacoes/distribuir', {
  parcial: true, distribuicao: [{ varianteId: 'local:b20', qtd: 2 }, { varianteId: 'local:b22', qtd: 2 }],
});
assert.equal(acima.status, 409);
semTecnico(acima.corpo.erro);
assert.equal(totalDe('600600'), 3);
prova('12 — acima do total: recusa com os dois números, total intocado');

/* ═════════ 13 — variante da loja COM saldo: dúvida, não dobra */
peca('700700', 'Anel Com Saldo na Loja', 3);
mov('700700', 1, 'Banho de Ouro 18K · n°17', '1700000001'); mov('700700', 2);
daLoja('700700', '1700000001', '1700', banho('n°17'), 1);
daqui('700700', 'nº17', 'local:c17', 0);
const e13 = await api('GET', '/api/produtos/700700/variacoes?visao=estoque');
assert.deepEqual(e13.corpo.variacoes.map((v) => v.nome).sort(), ['Banho de Ouro 18K · n°17', 'nº17'],
  'variante da loja com peça física foi escondida');
const d13 = await api('POST', '/api/produtos/700700/variacoes/distribuir', {
  parcial: true, distribuicao: [{ varianteId: '1700000001', qtd: 1 }, { varianteId: 'local:c17', qtd: 1 }],
});
assert.equal(d13.status, 200, JSON.stringify(d13.corpo));
assert.equal(saldoDe('700700', '1700000001'), 1);
assert.equal(saldoDe('700700', 'local:c17'), 1);
prova('13 — variante da loja com saldo + equivalente daqui: as duas visíveis, nenhuma escolhida sozinha');

/* ═════════ 14 — loja com duas variantes vinculadas + uma daqui */
peca('800800', 'Anel Três Aros', 3); mov('800800', 3);
daLoja('800800', '1800000016', '1800', [{ atributo: 'Tamanho', valor: 'n°16' }], 1, 0);
daLoja('800800', '1800000017', '1800', [{ atributo: 'Tamanho', valor: 'n°17' }], 1, 1);
daqui('800800', 'n°16', '1800000016', 0, 'loja'); daqui('800800', 'n°17', '1800000017', 1, 'loja');
daqui('800800', 'nº24', 'local:d24', 2);
const d14 = await api('POST', '/api/produtos/800800/variacoes/distribuir', {
  parcial: true, distribuicao: [
    { varianteId: '1800000016', qtd: 1 }, { varianteId: '1800000017', qtd: 1 }, { varianteId: 'local:d24', qtd: 1 },
  ],
});
assert.equal(d14.status, 200, JSON.stringify(d14.corpo));
assert.equal(saldoDe('800800', 'local:d24'), 1);
assert.equal(saldoDe('800800', '1800000016'), 1);
assert.equal(semVariacao('800800'), 0);
prova('14 — duas variantes da loja + nº24 criada aqui: as três salvam (antes a daqui era recusada)');

/* ═════════ 15 — a equivalência pura */
const L = (id, valores) => ({ variante_id: id, nome: valores.map((v) => v.valor).join(' · '), valores_json: JSON.stringify(valores) });
assert.deepEqual([...equivalenciasLojaLocal(
  [L('1', [{ atributo: 'Tamanho', valor: 'n°17' }, { atributo: 'Cor', valor: 'Banho de Ouro 18K' }])],
  [{ variante_id: 'local:x', nome: 'nº17' }])], [['1', 'local:x']]);
assert.deepEqual([...equivalenciasLojaLocal(
  [L('1', [{ atributo: 'Cor', valor: 'Dourado' }, { atributo: 'Tamanho', valor: 'n°18' }]),
    L('2', [{ atributo: 'Cor', valor: 'Prata' }, { atributo: 'Tamanho', valor: 'n°18' }])],
  [{ variante_id: 'local:y', nome: 'nº18' }])], []);
assert.deepEqual([...equivalenciasLojaLocal(
  [L('1', banho('n°18'))],
  [{ variante_id: 'local:a', nome: 'nº18' }, { variante_id: 'local:b', nome: 'Aro 18' }])], []);
prova('15 — equivalência: "n°17 · Banho" casa com nº17; Dourado/Prata não; dois "18" daqui é dúvida');

/* ═════════ 16 */
assert.ok(await razaoFecha(), 'a razão terminou aberta');
assert.equal(chamadasDeRede, 0);
prova('16 — GET /api/estoque/conferir vazio: produtos.qtd == SUM(movimentos.qtd)');

console.log(`\nVariações locais na V2: ${provas} provas, razão fechada, nenhuma chamada à loja.`);
