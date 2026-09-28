/** §46 e §47 (27/09/2026) — o modelo de colar nasce na venda, e o custo da
 *  peça tem histórico. Sem Worker: o `api/schema.sql` de verdade sobre
 *  `node:sqlite`, e as funções de verdade.
 *
 *  O que este teste impede:
 *
 *   1. o cardápio (corrente + pingentes) sair diferente do confirmado;
 *   2. cadastrar o modelo na venda gravar slots/opções que a venda recusa;
 *   3. a mesma combinação ganhar dois modelos, ou um código servir a dois;
 *   4. o código novo nascer com estoque (modelo não tem peça própria);
 *   5. a venda do modelo novo baixar algo além da corrente e dos pingentes,
 *      ou abrir a razão (`produtos.qtd == SUM(movimentos.qtd)`);
 *   6. o custo ser gravado sem histórico, ou gravar histórico sem mudança;
 *   7. "Saiu sem faturar" somar custo ausente como zero;
 *   8. a pendência de vínculo de cliente sumir de novo (a consulta pedia
 *      colunas que a tabela nunca teve).
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
const raw = new DatabaseSync(':memory:');
raw.exec(readFileSync(join(raiz, 'api/schema.sql'), 'utf8'));

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

const PECAS = [
  ['444032', 'Colar Veneziana 45cm + extensor Banho de Ouro 18k', 'Colar', 74, 10],
  ['263236', 'Pingente Menina Zircônia Rosa Claro Banho de Ouro 18k', 'Pingente', 119, 5],
  ['273470', 'Pingente Menina Zircônia Incolor Banho de Ouro 18k', 'Pingente', 119, 5],
  ['251551', 'Colar Menino Zircônia Azul Banho de Ouro 18k', 'Colar', 119, 2],
  ['251552', 'Colar Menino Zircônia Incolor Banho de Ouro 18k', 'Colar', 119, 5],
  ['329494', 'Colar Menino Zircônia Verde Banho de Ouro 18k', 'Colar', 119, 2],
  ['111111', 'Brinco Qualquer Banho de Ouro 18k', 'Brinco', 50, 3],
];
for (const [sku, desc, cat, preco, qtd] of PECAS) {
  raw.prepare("INSERT OR IGNORE INTO categorias (nome) VALUES (?)").run(cat);
  raw.prepare("INSERT INTO produtos (sku,desc,cat,preco,qtd,status) VALUES (?,?,?,?,?,'ativo')")
    .run(sku, desc, cat, preco, qtd);
  raw.prepare("INSERT INTO movimentos (sku,tipo,qtd,origem) VALUES (?,'entrada',?,'importacao')").run(sku, qtd);
}
/* Os códigos comerciais como estão em produção: com `qtd 1` herdado. */
for (const [sku, desc, preco, status] of [
  ['326660', 'Colar Casal Banho de Ouro 18k', 129, 'ativo'],
  ['314161', 'Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k', 159, 'ativo'],
  ['399872', 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k', 129, 'inativo'],
]) {
  raw.prepare("INSERT INTO produtos (sku,desc,cat,preco,qtd,status) VALUES (?,?,'Colar',?,1,?)")
    .run(sku, desc, preco, status);
  raw.prepare("INSERT INTO movimentos (sku,tipo,qtd,origem) VALUES (?,'entrada',1,'importacao')").run(sku);
}

const razaoAberta = () => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.s, 0)`).get().n;
const qtd = (sku) => raw.prepare('SELECT qtd FROM produtos WHERE sku=?').get(sku).qtd;
assert.equal(razaoAberta(), 0);

const { listarComponentes, cadastrarModeloNaVenda, listarModelos } = await import('../api/src/personalizacao.js');
const { registrarVenda } = await import('../api/src/vendas-comandos.js');
const { editarProduto } = await import('../api/src/catalogo-comandos.js');
const { listarSaidas, registrarSaida } = await import('../api/src/saidas.js');
const { listarPendencias } = await import('../api/src/pendencias.js');
const env = { PERSONALIZACAO_ATIVA: 'true' };

/* 1 — o cardápio. */
const card = await listarComponentes(db);
assert.equal(card.base.sku, '444032');
assert.equal(card.base.disponivel, 10);
assert.deepEqual(card.grupos.map((g) => [g.grupo, g.itens.map((i) => i.sku)]), [
  ['Menino', ['251551', '251552', '329494']],
  ['Menina', ['263236', '273470']],
]);
assert.ok(card.codigosComerciais.some((c) => c.sku === '326660'), 'o Colar Casal não foi sugerido como código');
assert.ok(!card.codigosComerciais.some((c) => c.sku === '111111'), 'um brinco foi sugerido como colar');
console.log('  ok   cardápio: a corrente, 3 meninos, 2 meninas, e os colares do catálogo como sugestão');

/* 2 — cadastrar com um código que já existe. */
const casal = await cadastrarModeloNaVenda(db, {
  nome: 'Colar Casal Banho de Ouro 18k', preco: 129, skuComercial: '326660',
  contagem: { Menino: 1, Menina: 1 },
});
assert.equal(casal.ok, true, `recusou o Casal: ${casal.erro}`);
assert.deepEqual(casal.modelo.slots.map((s) => [s.grupo, s.qtd]).sort(), [['Menina', 1], ['Menino', 1]]);
assert.equal(casal.modelo.opcoes.length, 5, 'o modelo não oferece os 5 pingentes');
assert.equal(casal.modelo.precoSugerido, 129);
console.log('  ok   o Casal nasce na venda com o código 326660, 1+1 posições e os 5 pingentes');

/* 3 — duplicatas. */
const repetido = await cadastrarModeloNaVenda(db, {
  nome: 'Outro Casal', preco: 139, skuComercial: '314161', contagem: { Menina: 1, Menino: 1 },
});
assert.equal(repetido.ok, false);
assert.equal(repetido.statusHttp, 409);
assert.match(repetido.erro, /já é o modelo/);
const codigoUsado = await cadastrarModeloNaVenda(db, {
  nome: 'Dois meninos', preco: 129, skuComercial: '326660', contagem: { Menino: 2 },
});
assert.equal(codigoUsado.statusHttp, 409);
assert.match(codigoUsado.erro, /já é do modelo/);
assert.equal((await cadastrarModeloNaVenda(db, { nome: 'x', preco: 10, contagem: {} })).statusHttp, 400);
assert.equal((await cadastrarModeloNaVenda(db, { nome: 'x', preco: 10, contagem: { Cachorro: 1 }, gerarCodigo: true })).statusHttp, 400);
assert.equal((await cadastrarModeloNaVenda(db, { nome: 'x', preco: 0, contagem: { Menino: 1 }, gerarCodigo: true })).statusHttp, 400);
console.log('  ok   a mesma combinação e o mesmo código não viram dois modelos; sem pingente, grupo estranho ou preço, recusa');

/* 4 — código novo. */
const tres = await cadastrarModeloNaVenda(db, {
  nome: 'Colar Filhos Três Meninos Banho de Ouro 18k', preco: 159, gerarCodigo: true,
  contagem: { Menino: 3 },
});
assert.equal(tres.ok, true, `recusou o código novo: ${tres.erro}`);
const novoSku = tres.modelo.skuComercial;
const novo = raw.prepare('SELECT * FROM produtos WHERE sku=?').get(novoSku);
assert.equal(novo.qtd, 0, 'o código novo nasceu com estoque');
assert.equal(novo.cat, 'Colar');
assert.equal(raw.prepare('SELECT COUNT(*) n FROM movimentos WHERE sku=?').get(novoSku).n, 0);
assert.equal((await listarModelos(db)).modelos.length, 2);
console.log(`  ok   código novo ${novoSku}: estoque 0, nenhum movimento, categoria Colar`);

/* 5 — vender o modelo novo, com a mesma cor repetida. */
const antes = Object.fromEntries(raw.prepare('SELECT sku, qtd FROM produtos').all().map((r) => [r.sku, r.qtd]));
const venda = await corpo(await registrarVenda(db, env, {
  clienteNome: 'Cliente Colar', data: '2026-09-27',
  personalizacoes: [{
    modeloId: tres.modelo.id,
    componentes: [{ componenteSku: '251552' }, { componenteSku: '251552' }, { componenteSku: '329494' }],
  }],
}));
assert.ok(venda.id, `a venda foi recusada: ${venda.erro}`);
assert.equal(venda.total, 159);
assert.equal(qtd('444032'), antes['444032'] - 1, 'a corrente não saiu uma vez');
assert.equal(qtd('251552'), antes['251552'] - 2);
assert.equal(qtd('329494'), antes['329494'] - 1);
assert.equal(qtd(novoSku), 0, 'o código comercial ganhou movimento');
assert.equal(razaoAberta(), 0, 'a razão abriu na venda');

/* O Casal, com o código que já tinha saldo 1: a venda ignora esse saldo. */
const vendaCasal = await corpo(await registrarVenda(db, env, {
  clienteNome: 'Cliente Casal', data: '2026-09-27',
  personalizacoes: [{ modeloId: casal.modelo.id, componentes: [{ componenteSku: '251551' }, { componenteSku: '273470' }] }],
}));
assert.ok(vendaCasal.id, `a venda do Casal foi recusada: ${vendaCasal.erro}`);
assert.equal(qtd('326660'), 1, 'o saldo herdado do 326660 foi mexido pela venda');
assert.equal(razaoAberta(), 0);
console.log('  ok   vender baixa a corrente e cada pingente uma vez; o código comercial não se mexe; razão fechada');

/* Corrente acabou: a venda é recusada. */
raw.prepare("INSERT INTO movimentos (sku,tipo,qtd,origem) VALUES ('444032','ajuste',?,'teste')").run(-qtd('444032'));
raw.prepare("UPDATE produtos SET qtd = 0 WHERE sku='444032'").run();
const semCorrente = await corpo(await registrarVenda(db, env, {
  clienteNome: 'Sem corrente', data: '2026-09-27',
  personalizacoes: [{ modeloId: casal.modelo.id, componentes: [{ componenteSku: '251551' }, { componenteSku: '273470' }] }],
}));
assert.ok(!semCorrente.id, 'vendeu colar sem corrente');
assert.equal(razaoAberta(), 0);
console.log('  ok   sem corrente em estoque, o colar não vende');

/* 6 — custo com histórico. */
const hist = () => raw.prepare("SELECT anterior, novo, origem FROM produtos_custo_historico WHERE sku='111111' ORDER BY id").all()
  .map((r) => ({ ...r }));
let r = await corpo(await editarProduto(db, '111111', { custo: 22.5 }));
assert.equal(r.ok, true);
r = await corpo(await editarProduto(db, '111111', { custo: 22.5 }));
assert.equal(r.ok, true);
r = await corpo(await editarProduto(db, '111111', { custo: 20, custoOrigem: 'saida' }));
assert.equal(r.ok, true);
assert.deepEqual(hist(), [
  { anterior: null, novo: 22.5, origem: 'ficha' },
  { anterior: 22.5, novo: 20, origem: 'saida' },
], 'o histórico do custo não é o esperado');
assert.equal((await corpo(await editarProduto(db, '111111', { custo: -1 }))).erro !== undefined, true);
assert.equal((await corpo(await editarProduto(db, 'NAOEXISTE', { custo: 5 }))).erro !== undefined, true);
assert.equal(razaoAberta(), 0, 'mudar custo mexeu em estoque');
console.log('  ok   custo: grava histórico só quando muda, recusa negativo e peça inexistente, não mexe em estoque');

/* 7 — Saiu sem faturar com dinheiro. */
await corpo(await registrarSaida(db, { tipo: 'brinde', sku: '111111', qtd: 2, data: '2026-09-27', motivo: 'Dia das mães' }));
await corpo(await registrarSaida(db, { tipo: 'perda', sku: '263236', qtd: 1, data: '2026-09-27', motivo: 'PERDIDO' }));
const s = await listarSaidas(db, {});
const brinde = s.saidas.find((x) => x.sku === '111111');
assert.equal(brinde.custoUnit, 20);
assert.equal(brinde.precoVenda, 50);
assert.deepEqual(s.resumo.valor, { custo: 40, venda: 219, semCusto: 1, semPreco: 0 },
  'o resumo em dinheiro somou errado ou tratou custo ausente como zero');
assert.equal(razaoAberta(), 0);
console.log('  ok   saiu sem faturar: R$ 40 a custo, R$ 219 a preço de venda, 1 linha sem custo contada à parte');

/* 8 — vínculo de cliente aparece na central. */
raw.prepare("INSERT INTO clientes (nome) VALUES ('Maria Aparecida Lima')").run();
const cid = raw.prepare("SELECT id FROM clientes WHERE nome='Maria Aparecida Lima'").get().id;
raw.prepare(`INSERT INTO clientes_vinculo_revisao (nome_original, nome_norm, candidato_id, candidato_nome, motivo, linhas)
             VALUES ('Maria A. Lima', 'maria a lima', ?, 'Maria Aparecida Lima', 'nome parecido', 3)`).run(cid);
const pend = await listarPendencias(db, { tipo: 'cliente' });
const v = pend.pendencias.find((p) => p.motivo === 'vinculo_em_duvida');
assert.ok(v, 'a pendência de vínculo de cliente não aparece');
assert.equal(v.cliente, 'Maria A. Lima');
assert.equal(v.candidatoId, cid);
assert.equal(v.candidato, 'Maria Aparecida Lima');
assert.ok(v.revisaoId > 0);
console.log('  ok   a pendência de vínculo de cliente aparece, com a revisão e a cliente candidata');

console.log('Modelo na venda, custo e vínculo: ok');
