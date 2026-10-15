/** Fase 4, item 3 — a montagem pelo caminho inteiro, sem Worker.
 *
 *  Os outros três testes de montagem provam a regra sobre bancos falsos, e
 *  um banco falso concorda com quem o escreveu: ele não sabe de chave
 *  estrangeira, de `CHECK`, nem de coluna com nome trocado. Este roda o
 *  `api/schema.sql` de verdade, aplica o `api/seed-montagem.sql` de verdade
 *  e chama `registrarVenda` e `cancelarVenda` de verdade — o que sobra de
 *  fora é só o HTTP.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. o SQL do seed ou das consultas discordar do schema — nome de coluna,
 *      chave estrangeira, `CHECK` — e isso só aparecer em produção;
 *   2. a venda gravar movimento no SKU comercial;
 *   3. o cancelamento não devolver exatamente o que saiu;
 *   4. cancelar duas vezes devolver estoque duas vezes;
 *   5. a razão contábil abrir em qualquer um desses passos —
 *      `produtos.qtd == SUM(movimentos.qtd)` é a invariante do §19;
 *   6. a configuração ser vendida como peça avulsa, baixando o saldo
 *      residual que ela tem em `produtos`.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de passar em silêncio.
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
const ler = (p) => readFileSync(join(raiz, p), 'utf8');

const raw = new DatabaseSync(':memory:');
raw.exec(ler('api/schema.sql'));

/** Adaptador mínimo do D1 sobre `node:sqlite`. `batch` executa de verdade:
 *  é por ele que toda movimentação passa, e um batch que não escreve faria
 *  este teste provar o contrário do que promete. */
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

/* ─── catálogo: os seis componentes físicos com saldo, e as cinco
   configurações comerciais com saldo ZERO. A entrada vai por movimento,
   para a razão nascer fechada. */
const PECAS = [
  ['444032', 'Colar Veneziana 45cm com Extensor Banho de Ouro 18k', 74, 20],
  ['263236', 'Colar Menina Zircônia Rosa Claro Banho de Ouro 18k', 119, 20],
  ['273470', 'Colar Menina Zircônia Incolor Banho de Ouro 18k', 119, 20],
  ['251551', 'Colar Menino Zircônia Azul Banho de Ouro 18k', 119, 20],
  ['251552', 'Colar Menino Zircônia Incolor Banho de Ouro 18k', 119, 20],
  ['329494', 'Colar Menino Zircônia Verde Banho de Ouro 18k', 119, 20],
];
const CONFIGURACOES = [
  ['326660', 'Colar Casal Banho de Ouro 18k', 129],
  ['364945', 'Colar Filhas Duas Meninas Banho de Ouro 18k', 129],
  ['311066', 'Colar Filhos Dois Meninos Banho de Ouro 18k', 129],
  ['314161', 'Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k', 159],
  ['399872', 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k', 159],
];
for (const [sku, desc, preco, qtd] of PECAS) {
  raw.prepare("INSERT INTO produtos (sku,desc,cat,preco,qtd,status) VALUES (?,?,'Pingente',?,?,'ativo')")
    .run(sku, desc, preco, qtd);
  raw.prepare("INSERT INTO movimentos (sku,tipo,qtd,origem) VALUES (?,'entrada',?,'importacao')")
    .run(sku, qtd);
}
for (const [sku, desc, preco] of CONFIGURACOES) {
  raw.prepare("INSERT INTO produtos (sku,desc,cat,preco,qtd,status) VALUES (?,?,'Colar',?,0,'ativo')")
    .run(sku, desc, preco);
}

/* 1 — o seed roda contra o schema real, com as chaves estrangeiras valendo. */
raw.exec(ler('api/seed-montagem.sql'));
assert.equal(raw.prepare('SELECT COUNT(*) n FROM personalizacao_modelos').get().n, 5);
assert.equal(raw.prepare('SELECT COUNT(*) n FROM personalizacao_slots').get().n, 8);
assert.equal(raw.prepare('SELECT COUNT(*) n FROM personalizacao_opcoes').get().n, 20);
for (const m of raw.prepare('SELECT id, slug, slots_min FROM personalizacao_modelos').all()) {
  const soma = raw.prepare('SELECT SUM(qtd) s FROM personalizacao_slots WHERE modelo_id=?').get(m.id).s;
  assert.equal(m.slots_min, soma, `${m.slug}: slots_min deixou de ser a soma dos slots`);
}
console.log('  ok   o seed aplica no schema real: 5 configurações, 8 slots, 20 opções');

const { registrarVenda, cancelarVenda } = await import('../api/src/vendas-comandos.js');
const env = { PERSONALIZACAO_ATIVA: 'true' };
const corpo = async (r) => (r && typeof r.json === 'function' ? r.json() : r);

const saldos = () => Object.fromEntries(
  raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all().map((r) => [r.sku, r.qtd]));
/* §19 na prática: o saldo materializado tem de bater com a razão. */
const razaoAberta = () => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.s, 0)`).get().n;

assert.equal(razaoAberta(), 0, 'a razão já nasceu aberta');
const antes = saldos();

/* 2 e 5 — a venda: duas montagens, uma delas com a mesma cor nos dois
   slots do mesmo grupo. */
const venda = await corpo(await registrarVenda(db, env, {
  clienteNome: 'Cliente Montagem', data: '2026-09-10',
  personalizacoes: [
    { modeloSlug: 'casal', componentes: [{ componenteSku: '251551' }, { componenteSku: '263236' }] },
    { modeloSlug: 'dois-meninos', componentes: [{ componenteSku: '329494' }, { componenteSku: '329494' }] },
  ],
}));
assert.ok(venda.id, `a venda foi recusada: ${venda.erro}`);
assert.equal(venda.total, 258, 'o total não é a soma dos preços das configurações');

const depois = saldos();
assert.equal(depois['444032'], antes['444032'] - 2, 'saiu uma Veneziana por montagem?');
assert.equal(depois['251551'], antes['251551'] - 1);
assert.equal(depois['263236'], antes['263236'] - 1);
assert.equal(depois['329494'], antes['329494'] - 2, 'a mesma cor duas vezes baixou uma só');
for (const [sku] of CONFIGURACOES) {
  assert.equal(depois[sku], 0, `${sku}: a configuração recebeu saldo`);
}
assert.equal(
  raw.prepare("SELECT COUNT(*) n FROM movimentos WHERE sku IN ('326660','311066')").get().n, 0,
  'o SKU comercial recebeu movimento — ele não tem saldo para mexer',
);
assert.equal(
  raw.prepare('SELECT group_concat(sku) s FROM venda_itens WHERE venda_id=?').get(venda.id).s,
  '326660,311066',
  'o recibo perdeu a identidade comercial das configurações',
);
assert.equal(razaoAberta(), 0, 'a razão abriu depois da venda');
console.log('  ok   a venda baixa Veneziana e peças escolhidas, e nada no SKU comercial');

/* 3, 4 e 5 — o estorno. */
const cancelou = await corpo(await cancelarVenda(db, env, venda.id));
assert.equal(cancelou.ok, true, `o cancelamento falhou: ${cancelou.erro}`);
assert.deepEqual(saldos(), antes, 'o estorno não devolveu exatamente o que saiu');
assert.equal(razaoAberta(), 0, 'a razão abriu depois do estorno');

const denovo = await corpo(await cancelarVenda(db, env, venda.id));
assert.match(String(denovo.erro), /já está cancelada/, 'cancelar duas vezes foi aceito');
assert.deepEqual(saldos(), antes, 'o segundo cancelamento devolveu estoque de novo');
console.log('  ok   o estorno devolve o exato, e repetir não devolve duas vezes');

/* 6 — a porta que faria o saldo residual virar baixa. */
const avulsa = await corpo(await registrarVenda(db, env, {
  clienteNome: 'Avulsa', data: '2026-09-10', itens: [{ sku: '326660', qtd: 1 }],
}));
assert.match(String(avulsa.erro), /configuração montável/,
  'a configuração foi vendida como peça avulsa');
assert.deepEqual(saldos(), antes);
assert.equal(razaoAberta(), 0);
console.log('  ok   a configuração não vende como peça avulsa');

console.log('Montagem, caminho inteiro: ok');
