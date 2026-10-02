/** Linha reclassificada como saída sem faturamento NÃO é venda — em lugar
 *  nenhum, inclusive "Vendas feitas" e a busca global (02/10/2026).
 *
 *  Até aqui os rankings tiravam a linha reclassificada (FILTRO_ITEM_HISTORICO),
 *  mas `/api/vendas/feitas` não: as 9 vendas "sem informação" da Sthefany
 *  Marques, já reclassificadas em 26/09, continuavam aparecendo como venda.
 *
 *  Worker real em processo, `api/schema.sql` + catálogo do harness num SQLite
 *  em memória, toda escrita pelas rotas.
 *
 *   A  venda normal continua em Vendas feitas
 *   B  linha reclassificada sai de Vendas feitas e da busca
 *   C  e aparece em Saídas sem faturamento, com o motivo certo
 *   D  sem mexer no estoque de novo
 *   E  e fora das métricas comerciais (crm)
 *   F  a linha original da planilha continua auditável, com valor e status
 *   G  reclassificar de novo não duplica saída
 *   H  o cadastro da Sthefany continua ativo
 *   I  a ficha dela não mostra as linhas reclassificadas como compra
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
raw.exec(readFileSync(join(raiz, 'scripts/v2-local/seed-catalogo.sql'), 'utf8'));

const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.bind = (...a) => comArgs(a);
  st.first = async function (col) { const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes ?? 0) } }; };
  return st;
};
const DB = {
  prepare: preparar,
  async batch(stmts) { const s = []; for (const x of stmts) s.push(await x.run()); return s; },
  async exec(sql) { raw.exec(sql); return { count: 0 }; },
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
const retratoDoEstoque = () => JSON.stringify({
  produtos: raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all(),
  movimentos: q1('SELECT COUNT(*) n, COALESCE(SUM(qtd), 0) s FROM movimentos'),
});

const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];
const imp = await api('POST', '/api/vendas/historico/importar', {
  arquivo: 'Vendas teste.xlsx',
  linhas: [
    CAB,
    [1, '2025-03-02', 'Ana Real', '100101', 'Colar', 'Banhada', 1, 105, null, 105, 'Pix', 'PAGO', 'Site'],
    [2, '2025-06-10', 'Ana Real', '100201', 'Brinco', 'Banhada', 1, 119, null, 119, 'Pix', 'PAGO', 'Site'],
    [3, '2025-12-24', 'Sthefany Marques', '100301', 'Anel', 'Banhada', 1, 169, 'Presente vó Gustavo', 169, null, 'PAGO', 'Maleta'],
    [4, '2025-12-28', 'Sthefany Marques', '100401', 'Pulseira', 'Banhada', 1, 79, null, 79, null, 'PAGO', 'Maleta'],
  ],
});
assert.equal(imp.status, 201, JSON.stringify(imp.corpo));
const STHEFANY = q1("SELECT id FROM clientes WHERE nome = 'Sthefany Marques'").id;
const itens = raw.prepare('SELECT id, valor_total, desconto_original FROM vendas_historico_itens WHERE cliente_id = ? ORDER BY id').all(STHEFANY);
assert.equal(itens.length, 2);
const ESTOQUE = retratoDoEstoque();
const feitas = async (extra = '') => (await api('GET', `/api/vendas/feitas?limite=500${extra}`)).corpo.vendas;
const crmAntes = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo;
assert.equal((await feitas()).filter((v) => v.cliente === 'Sthefany Marques').length, 2, 'cenário: Sthefany aparecia antes');

/* ── a reclassificação, pela rota oficial, com a evidência de cada linha ── */
const rc = await api('POST', '/api/historico/reclassificar', {
  decisoes: [
    { historicoItemId: itens[0].id, classe: 'brinde', decisao: 'aplicar', confianca: 'alta',
      motivo: 'texto "Presente vó Gustavo"; confirmação humana do responsável em 02/10/2026' },
    { historicoItemId: itens[1].id, classe: 'uso_proprio', decisao: 'aplicar', confianca: 'alta',
      motivo: 'sem texto que diferencie; confirmação humana do responsável em 02/10/2026' },
  ],
  usuario: 'teste',
});
assert.equal(rc.status, 200, JSON.stringify(rc.corpo));

/* A */
const depois = await feitas();
assert.equal(depois.filter((v) => v.cliente === 'Ana Real').length, 2);
prova('A — venda normal continua em Vendas feitas');

/* B */
assert.equal(depois.filter((v) => v.cliente === 'Sthefany Marques').length, 0, 'reclassificada em Vendas feitas');
assert.equal((await feitas('&busca=sthefany')).length, 0, 'busca global acha a saída como venda');
assert.equal((await feitas('&busca=100301')).length, 0, 'busca por SKU acha a saída como venda');
const lista = (await api('GET', '/api/vendas/lista?limite=500')).corpo;
assert.ok(Array.isArray(lista.itens) && lista.itens.some((l) => l.cliente === 'Ana Real'), 'cenário: a lista item a item tem a Ana');
assert.ok(!lista.itens.some((l) => l.cliente === 'Sthefany Marques'), 'a lista item a item ainda a mostra');
prova('B — reclassificada sai de Vendas feitas, da busca (nome e SKU) e da lista item a item');

/* C */
const saidas = (await api('GET', '/api/saidas')).corpo.saidas;
const daSthefany = saidas.filter((s) => itens.some((i) => i.id === (s.historicoItemId ?? s.historico_item_id)));
assert.deepEqual(daSthefany.map((s) => s.tipo).sort(), ['brinde', 'uso_proprio']);
prova('C — aparece em Saídas sem faturamento: um brinde e um uso próprio');

/* D */
assert.equal(retratoDoEstoque(), ESTOQUE, 'reclassificar mexeu no estoque');
assert.equal(q1('SELECT COUNT(*) n FROM saidas_sem_faturamento WHERE estoque_refletido = 1').n, 0);
prova('D — estoque idêntico; nenhuma saída com baixa de estoque');

/* E */
const crm = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo;
assert.ok(!crm.todos.some((c) => c.nome === 'Sthefany Marques'), 'Sthefany na base comercial');
assert.ok(!crm.topClientes.some((c) => c.nome === 'Sthefany Marques'));
assert.ok(!crm.reativacao.some((c) => c.nome === 'Sthefany Marques'));
assert.equal(crm.kpis.vendasTotal, crmAntes.kpis.vendasTotal - 2);
assert.equal(+(crmAntes.kpis.faturamentoTotal - crm.kpis.faturamentoTotal).toFixed(2), 248);
assert.equal(crm.kpis.ativos, crmAntes.kpis.ativos - 1);
prova('E — fora de base, Top, chamar de volta; vendas −2, faturamento −R$ 248, ativos −1');

/* F */
const original = raw.prepare('SELECT id, valor_total, status_pagamento_original, desconto_original FROM vendas_historico_itens WHERE cliente_id = ? ORDER BY id').all(STHEFANY);
assert.deepEqual(original.map((i) => [i.valor_total, i.status_pagamento_original]), [[169, 'PAGO'], [79, 'PAGO']]);
const decisoes = raw.prepare('SELECT classe_nova, motivo, decidido_por, decidido_em, status FROM historico_reclassificacao ORDER BY id').all();
assert.equal(decisoes.length, 2);
assert.ok(decisoes.every((d) => d.status === 'aplicada' && d.decidido_por === 'teste' && d.decidido_em && /02\/10\/2026/.test(d.motivo)));
prova('F — linha original intacta (valor e PAGO); decisão com classe, motivo, quem e quando');

/* G */
const de_novo = await api('POST', '/api/historico/reclassificar', {
  decisoes: [{ historicoItemId: itens[0].id, classe: 'brinde', decisao: 'aplicar' }], usuario: 'teste',
});
assert.notEqual(de_novo.status, 200);
assert.equal(q1('SELECT COUNT(*) n FROM saidas_sem_faturamento').n, 2);
assert.equal(q1('SELECT COUNT(*) n FROM historico_reclassificacao').n, 2);
prova('G — reclassificar de novo é recusado; nenhuma saída duplicada');

/* H */
const cadastros = (await api('GET', '/api/clientes?limite=2000')).corpo;
assert.ok(cadastros.some((c) => c.id === STHEFANY && !c.arquivada));
prova('H — cadastro da Sthefany continua ativo na lista');

/* I */
const ficha = (await api('GET', `/api/clientes/perfil?id=${STHEFANY}`)).corpo;
assert.equal(ficha.resumo.vendas, 0);
assert.equal(ficha.resumo.comprou, 0);
assert.equal(ficha.vendas.length, 0);
prova('I — ficha da Sthefany: 0 compras, R$ 0 comprado');

const conferir = (await api('GET', '/api/estoque/conferir')).corpo;
assert.deepEqual(conferir.divergentes ?? conferir, []);
prova('razão fecha no fim');
console.log(`\n${provas} provas — reclassificada não é venda`);
