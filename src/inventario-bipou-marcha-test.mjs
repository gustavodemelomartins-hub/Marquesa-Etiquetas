/** Inventário "bipou e marcha" — o jeito da Sthefany, no servidor (02/10/2026).
 *
 *  O sistema já sabe quanto deveria haver em casa. Ela bipa a referência UMA
 *  vez para dizer "conferi" e só diz QUANTO falta. Um bipe é um código
 *  conferido, nunca "+1 unidade".
 *
 *  Worker real em processo, `api/schema.sql` num SQLite em memória, toda
 *  escrita pelas rotas.
 *
 *   A  esperado 6, um bipe sem falta → conferido, contado 6 (não 1)
 *   B  esperado 6, falta 2 → contado 4, diferença −2 no fechamento
 *   C  o mesmo código bipado duas vezes não duplica a contagem
 *   D  código não bipado é "não conferido" e não vira perda
 *   E  dois códigos seguidos, sem nada entre eles, são dois conferidos
 *   F  (tela) — o foco volta ao leitor: frontend/src/features/inventario/estacao.test.tsx
 *   G  pausar → retomar preserva conferidos e faltas
 *   H  descartar não cria ajuste nenhum
 *   I  concluir: só a diferença confirmada vira ajuste, e só quando aplicada
 *   J  peça com revendedora: o esperado em casa exclui o que está fora, com o nome dela
 *   K  variação com razão identificada: o esperado é o da variação
 *   L  variação criada durante a contagem: salva, registrada no inventário,
 *      e conferível em seguida — sem estoque mexido
 *   +  esperado 0 em casa pede quantas achou; falta maior que o esperado é recusada;
 *      anel sem identidade de aro: o código inteiro se confere, a falta nele não vira movimento
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
  async batch(stmts) { const s = []; for (const x of stmts) s.push(await x.run()); return s; },
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
let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

/* ── catálogo. Toda quantidade nasce de movimento (a razão fecha). */
const ONTEM = '2026-10-01 09:00:00';
const peca = (sku, desc, qtd, cat = 'Anel') => {
  raw.prepare("INSERT INTO produtos (sku, desc, cat, preco, qtd, status) VALUES (?, ?, ?, 99, ?, 'ativo')")
    .run(sku, desc, cat, qtd);
};
const mov = (sku, qtd, variacao = null, varianteId = null) => raw.prepare(
  "INSERT INTO movimentos (sku, variacao, variante_id, tipo, qtd, origem, criado_em) VALUES (?, ?, ?, 'entrada', ?, 'importacao', ?)",
).run(sku, variacao, varianteId, qtd, ONTEM);

peca('100001', 'Anel Topo Reto', 7); mov('100001', 7);           // A: 7 no total, 1 com a Evelyn
peca('100002', 'Brinco Gota', 10, 'Brinco'); mov('100002', 10);  // B: 10, 2 Evelyn + 2 Bruna
peca('100003', 'Colar Elos', 3, 'Colar'); mov('100003', 3);      // D: ninguém bipa
peca('100004', 'Pulseira Fita', 2, 'Pulseira'); mov('100004', 2);
peca('100005', 'Argola Lisa', 1, 'Brinco'); mov('100005', 1);    // toda com revendedora
/* K — anel com aros e razão IDENTIFICADA: cada peça sabe de qual aro é. */
peca('200001', 'Anel Solitário', 7);
mov('200001', 3, 'Aro 16', 'v16'); mov('200001', 4, 'Aro 18', 'v18');
raw.prepare("INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem) VALUES (?, ?, 'Tamanho', ?, ?, ?, 'local')")
  .run('200001', 'Aro 16', 'v16', 0, JSON.stringify([{ atributo: 'Tamanho', valor: 'Aro 16' }]));
raw.prepare("INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem) VALUES (?, ?, 'Tamanho', ?, ?, ?, 'local')")
  .run('200001', 'Aro 18', 'v18', 1, JSON.stringify([{ atributo: 'Tamanho', valor: 'Aro 18' }]));
/* Anel com aros cadastrados e razão SEM identidade — o retrato de produção. */
peca('300001', 'Anel Aro Duplo', 5); mov('300001', 5);
for (const [i, n] of ['n°16', 'n°18'].entries()) {
  raw.prepare("INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, ordem, valores_json, origem) VALUES (?, ?, 'Tamanho', ?, ?, ?, 'loja')")
    .run('300001', n, `x${i}`, i, JSON.stringify([{ atributo: 'Tamanho', valor: n }]));
}

/* ── revendedoras e maletas abertas. */
raw.prepare("INSERT INTO revendedoras (id, nome, status) VALUES (1, 'Evelyn Veiga', 'ativa'), (2, 'Bruna Follei', 'ativa')").run();
raw.prepare("INSERT INTO maletas (id, rev_id, status, aberta_em) VALUES (1, 1, 'aberta', '2026-09-26'), (2, 2, 'aberta', '2026-09-26')").run();
const naMaleta = (maleta, sku, qtd) => {
  raw.prepare('INSERT INTO maleta_itens (maleta_id, sku, qtd, preco_envio, devolvida) VALUES (?, ?, ?, 99, 0)').run(maleta, sku, qtd);
  raw.prepare("INSERT INTO movimentos (sku, tipo, qtd, origem, maleta_id, criado_em) VALUES (?, 'consignacao', 0, 'maleta', ?, ?)").run(sku, maleta, ONTEM);
};
naMaleta(1, '100001', 1);
naMaleta(1, '100002', 2); naMaleta(2, '100002', 2);
naMaleta(2, '100005', 1);
naMaleta(1, '200001', 1); naMaleta(2, '200001', 3);
raw.prepare("INSERT INTO maleta_item_variacoes (maleta_id, sku, variacao, variante_id, qtd) VALUES (1, '200001', 'Aro 16', 'v16', 1), (2, '200001', 'Aro 18', 'v18', 3)").run();

const retratoDoEstoque = () => JSON.stringify({
  produtos: raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all(),
  movimentos: q1('SELECT COUNT(*) n, COALESCE(SUM(qtd), 0) s FROM movimentos'),
});
const razaoAberta = () => q1(`SELECT COUNT(*) n FROM produtos p
  LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
  WHERE p.qtd <> COALESCE(m.s, 0)`).n;
assert.equal(razaoAberta(), 0, 'cenário: a razão nasce fechada');
const ESTOQUE = retratoDoEstoque();

const abre = await api('POST', '/api/inventarios', {});
assert.equal(abre.status, 201, JSON.stringify(abre.corpo));
const ID = abre.corpo.id;
const bipa = (sku, extra = {}) => api('POST', `/api/inventarios/${ID}/itens`, { sku, faltando: 0, ...extra });
const linhas = () => raw.prepare('SELECT * FROM inventario_contagem WHERE inventario_id = ? ORDER BY sku, variacao').all(ID);

/* J — antes de bipar: o esperado em casa já exclui o que está com elas, com o nome. */
const det0 = (await api('GET', `/api/inventarios/${ID}`)).corpo;
const esp = (sku) => det0.esperados.find((e) => e.sku === sku);
assert.equal(esp('100001').esperado, 6);
assert.deepEqual(esp('100001').revendedoras.map((r) => [r.nome, r.qtd]), [['Evelyn Veiga', 1]]);
assert.equal(esp('100002').esperado, 6);
assert.deepEqual(esp('100002').revendedoras.map((r) => [r.nome, r.qtd]).sort(), [['Bruna Follei', 2], ['Evelyn Veiga', 2]]);
assert.equal(esp('100002').total, 10);
prova('J — esperado em casa 6 = 7 − 1 (Evelyn); 6 = 10 − 2 (Evelyn) − 2 (Bruna), com o nome de cada uma');

/* A */
const a = await bipa('100001');
assert.equal(a.status, 200, JSON.stringify(a.corpo));
assert.equal(a.corpo.contado, 6, 'um bipe virou uma unidade');
assert.equal(a.corpo.esperado, 6);
assert.equal(a.corpo.faltando, 0);
prova('A — esperado 6, um bipe sem falta: conferido, encontrado efetivo 6 (não 1)');

/* B */
const b = await bipa('100002', { faltando: 2 });
assert.equal(b.status, 200, JSON.stringify(b.corpo));
assert.equal(b.corpo.contado, 4);
assert.equal(b.corpo.faltando, 2);
prova('B — esperado 6, falta 2: encontrado 4');

/* C */
const c1 = await bipa('100004');
const c2 = await bipa('100004');
assert.equal(c2.status, 200);
assert.equal(c1.corpo.contado, 2);
assert.equal(c2.corpo.contado, 2, 'o segundo bipe somou');
assert.equal(linhas().filter((l) => l.sku === '100004').length, 1, 'o segundo bipe criou outra linha');
prova('C — o mesmo código bipado duas vezes: uma linha, contado 2 (não 4)');

/* E — dois códigos seguidos, sem nada entre eles. */
const [e1, e2] = [await bipa('100001'), await bipa('100004')];
assert.equal(e1.status, 200); assert.equal(e2.status, 200);
assert.equal(e2.corpo.cobertura.conferidos, 3);
prova('E — leituras seguidas de códigos diferentes: todas gravadas, cobertura 3');

/* Esperado 0 em casa: não há "falta" a dizer; quantas achou é o número. */
const zero = await bipa('100005');
assert.equal(zero.status, 409);
assert.equal(zero.corpo.precisaContado, true);
assert.equal((await api('POST', `/api/inventarios/${ID}/itens`, { sku: '100005', contado: 1 })).status, 200);
const demais = await bipa('100002', { faltando: 7 });
assert.equal(demais.status, 400, 'aceitou falta maior que o esperado');
assert.equal(linhas().find((l) => l.sku === '100002').faltando, 2, 'a recusa mexeu na linha');
prova('esperado 0 em casa pede quantas achou; falta maior que o esperado é recusada sem mexer em nada');

/* K — o esperado da variação, com o que está na maleta de cada aro. */
const det1 = (await api('GET', `/api/inventarios/${ID}`)).corpo;
const anel = det1.esperados.find((e) => e.sku === '200001');
assert.equal(anel.variacaoComIdentidade, true);
assert.deepEqual(anel.variacoes.map((v) => [v.nome, v.esperado]), [['Aro 16', 2], ['Aro 18', 1]]);
const k16 = await bipa('200001', { variacao: 'Aro 16' });
assert.equal(k16.status, 200, JSON.stringify(k16.corpo));
assert.equal(k16.corpo.contado, 2);
const k18 = await bipa('200001', { variacao: 'Aro 18', faltando: 1 });
assert.equal(k18.corpo.contado, 0);
prova('K — Aro 16: 3 − 1 na maleta = 2 em casa; Aro 18: 4 − 3 = 1, falta 1 → 0');

/* Anel sem identidade de aro. O esperado do aro não existe; o código inteiro sim. */
const semIdent = await bipa('300001', { variacao: 'n°16' });
assert.equal(semIdent.status, 409);
assert.equal(semIdent.corpo.precisaContado, true);
const codigo = await bipa('300001', { codigoInteiro: true });
assert.equal(codigo.status, 200, JSON.stringify(codigo.corpo));
assert.equal(codigo.corpo.contado, 5);
assert.equal((await api('POST', `/api/inventarios/${ID}/itens`, { sku: '300001', faltando: 0 })).status, 409,
  'contou o anel com aros sem dizer que é o código inteiro');
prova('anel sem identidade de aro: o aro pede o número; o código inteiro se confere com um bipe');

/* L — variação nova sem sair do inventário. */
const nova = await api('POST', `/api/inventarios/${ID}/variacoes`, { sku: '300001', valor: 'n°20' });
assert.equal(nova.status, 201, JSON.stringify(nova.corpo));
assert.deepEqual(nova.corpo.criadas.map((x) => x.nome), ['n°20']);
assert.ok(q1("SELECT 1 FROM produto_variacoes WHERE sku = '300001' AND nome = 'n°20'"), 'a variação não foi salva');
assert.equal(q1("SELECT variante_id FROM produto_variacoes WHERE sku = '300001' AND nome = 'n°16'").variante_id, 'x0',
  'criar uma variação trocou o vínculo das outras');
const repetida = await api('POST', `/api/inventarios/${ID}/variacoes`, { sku: '300001', valor: 'N°20' });
assert.equal(repetida.status, 409);
const nova2 = await api('POST', `/api/inventarios/${ID}/variacoes`, { sku: '100003', valor: 'Aro 20' });
assert.equal(nova2.status, 201, JSON.stringify(nova2.corpo));
const contaNova = await api('POST', `/api/inventarios/${ID}/itens`, { sku: '100003', variacao: 'Aro 20', contado: 1 });
assert.equal(contaNova.status, 200, JSON.stringify(contaNova.corpo));
const det2 = (await api('GET', `/api/inventarios/${ID}`)).corpo;
assert.deepEqual(det2.eventos.map((e) => [e.sku, e.variacao]), [['300001', 'n°20'], ['100003', 'Aro 20']]);
assert.equal(retratoDoEstoque(), ESTOQUE, 'criar variação mexeu no estoque');
await api('DELETE', `/api/inventarios/${ID}/itens/100003?variacao=${encodeURIComponent('Aro 20')}`);
prova('L — variação criada na leitura: salva no catálogo, vínculos preservados, registrada no inventário, conferível, estoque igual');

/* G — pausar e retomar. */
assert.equal((await api('POST', `/api/inventarios/${ID}/pausar`)).status, 200);
assert.equal((await api('POST', `/api/inventarios/${ID}/retomar`)).status, 200);
const det3 = (await api('GET', `/api/inventarios/${ID}`)).corpo;
const falta2 = det3.contagem.find((x) => x.sku === '100002');
assert.equal(falta2.faltando, 2);
assert.equal(falta2.esperadoNaHora, 6);
assert.equal(det3.contagem.find((x) => x.sku === '100001').faltando, 0);
prova('G — pausar → retomar: conferidos e faltas preservados, com o esperado da hora');

/* D + I — concluir. */
assert.equal(retratoDoEstoque(), ESTOQUE, 'contar mexeu no estoque');
const fim = await api('POST', `/api/inventarios/${ID}/concluir`, {});
assert.equal(fim.status, 200, JSON.stringify(fim.corpo));
const rel = fim.corpo;
const achaEm = (lista, sku) => lista.find((l) => l.sku === sku);
assert.ok(achaEm(rel.naoConferido, '100003'), 'o código não bipado sumiu');
assert.ok(!achaEm(rel.faltando, '100003'), 'não conferido virou falta');
prova('D — código não bipado fica "não conferido" e não vira perda');

assert.deepEqual(rel.faltando.map((l) => [l.sku, l.variacao, l.dif]).sort(),
  [['100002', null, -2], ['200001', 'Aro 18', -1]]);
assert.ok(achaEm(rel.conferidosItens, '100001'));
assert.ok(achaEm(rel.conferidosItens, '300001'), 'o anel conferido pelo código inteiro não foi dado por conferido');
assert.equal(retratoDoEstoque(), ESTOQUE, 'concluir mexeu no estoque');
const apl = await api('POST', `/api/inventarios/${ID}/aplicar`, { itens: [{ sku: '100002', motivo: 'Não encontrada na casa' }] });
assert.equal(apl.status, 200, JSON.stringify(apl.corpo));
assert.equal(q1("SELECT qtd FROM produtos WHERE sku = '100002'").qtd, 8);
assert.equal(q1("SELECT qtd FROM produtos WHERE sku = '100001'").qtd, 7);
assert.equal(razaoAberta(), 0);
prova('I — concluir não mexe no estoque; só a diferença confirmada (−2) vira ajuste, pela razão');

/* Anel sem identidade, com falta no código inteiro: registrada, nunca movimento. */
const inv2 = (await api('POST', '/api/inventarios', {})).corpo.id;
assert.equal((await api('POST', `/api/inventarios/${inv2}/itens`, { sku: '300001', codigoInteiro: true, faltando: 1 })).status, 200);
const rel2 = (await api('POST', `/api/inventarios/${inv2}/concluir`, {})).corpo;
assert.ok(achaEm(rel2.naoComparavel, '300001'), 'a falta sem aro virou diferença aplicável');
assert.equal((await api('POST', `/api/inventarios/${inv2}/aplicar`, { itens: [{ sku: '300001', motivo: 'Não encontrada na casa' }] })).status, 409);
prova('falta no código inteiro de um anel sem identidade de aro: registrada, não comparável, sem movimento');

/* H — descartar. */
const antesH = retratoDoEstoque();
const inv3 = (await api('POST', '/api/inventarios', {})).corpo.id;
await api('POST', `/api/inventarios/${inv3}/itens`, { sku: '100001', faltando: 3 });
const saidasAntes = q1('SELECT COUNT(*) n FROM saidas_sem_faturamento').n;
assert.equal((await api('POST', `/api/inventarios/${inv3}/cancelar`)).status, 200);
assert.equal(retratoDoEstoque(), antesH);
assert.equal(q1('SELECT COUNT(*) n FROM saidas_sem_faturamento').n, saidasAntes);
assert.equal((await api('POST', `/api/inventarios/${inv3}/aplicar`, { itens: [{ sku: '100001', motivo: 'x' }] })).status, 409);
prova('H — descartar: nenhum ajuste, nenhuma saída, estoque igual');

assert.equal(razaoAberta(), 0);
console.log(`\n${provas} provas, 0 falhas`);
