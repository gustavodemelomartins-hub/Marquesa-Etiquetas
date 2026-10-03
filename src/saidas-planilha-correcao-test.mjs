/** A planilha "Saiu sem faturar" vence a classificação automática — por
 *  linha, com trilha, sem estoque (02/10/2026). E a situação de um acerto
 *  de maleta deriva do próprio acerto.
 *
 *  Worker real em processo, `api/schema.sql` + catálogo do harness num
 *  SQLite em memória, toda escrita pelas rotas.
 *
 *   A  uso próprio → brinde: a saída troca de tipo, o rótulo vira a observação
 *      da planilha, o custo informado é gravado com histórico
 *   B  linha sem saída (sem data) corrigida aparece no legado com a classe nova,
 *      a observação e o custo
 *   C  sorteio → brinde; o resumo por motivo bate com as linhas
 *   D  a decisão anterior não se apaga: classe e motivo de antes ficam na correção
 *   E  aplicar de novo não escreve nada
 *   F  estoque idêntico; nenhuma saída com baixa
 *   G  Vendas feitas e métricas comerciais não mudam
 *   H  filtrar por motivo devolve só aquele motivo (saídas e legado)
 *   I  saída que baixou estoque é recusada (a classe está no movimento)
 *   J  acerto: pago quando o recebido cobre o líquido do acerto — não pelo
 *      status da venda inteira da planilha
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
  st.bind = (...a) => comArgs(a.map((v) => (v === undefined ? null : v)));
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
const { situacaoDoAcertoDocumental } = await import(pathToFileURL(join(raiz, 'api/src/analytics.js')).href);
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
    [2, '2025-12-28', 'Sthefany Marques', '100401', 'Pulseira', 'Banhada', 1, 79, null, 79, null, 'PAGO', 'Maleta'],
    [3, null, 'Sthefany Marques', '100301', 'Anel', 'Banhada', 1, null, null, null, null, '-', '-'],
    [4, '2025-05-10', 'Sthefany Marques', '100201', 'Brinco', 'Banhada', 1, 69, null, 69, null, 'PAGO', 'Sorteio (Feira)'],
    [5, '2026-08-06', 'Inventário', '100102', 'Colar', 'Banhada', 1, 0, null, 0, null, '-', 'PERDIDO'],
  ],
});
assert.equal(imp.status, 201, JSON.stringify(imp.corpo));
const item = (n) => q1('SELECT id FROM vendas_historico_itens WHERE origem_linha = ?', String(n)).id;
const rc = await api('POST', '/api/historico/reclassificar', {
  decisoes: [
    { historicoItemId: item(2), classe: 'uso_proprio', decisao: 'aplicar', motivo: 'regra automática: a cliente é a dona' },
    { historicoItemId: item(3), classe: 'uso_proprio', decisao: 'aplicar', motivo: 'regra automática: a cliente é a dona' },
    { historicoItemId: item(4), classe: 'sorteio', decisao: 'aplicar', motivo: 'texto "Sorteio"' },
    { historicoItemId: item(5), classe: 'perda', decisao: 'aplicar', motivo: 'texto "PERDIDO"' },
  ],
  usuario: 'teste',
});
assert.equal(rc.status, 200, JSON.stringify(rc.corpo));
const ESTOQUE = retratoDoEstoque();
const feitasAntes = (await api('GET', '/api/vendas/feitas?limite=500')).corpo.vendas.length;
const crmAntes = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo.kpis;

const FONTE = 'planilha "Saiu sem faturar" da Sthefany, 02/10/2026';
const corrige = (n, classe, extra = {}) => api('POST', `/api/historico/reclassificar/${item(n)}/corrigir`, {
  classe, fonte: FONTE, motivo: 'classificação dada pela Sthefany na planilha', usuario: 'teste', ...extra,
});

/* A */
const a = await corrige(2, 'brinde', { observacao: 'Presente Angela', custo: 8.585950783543169 });
assert.equal(a.status, 200, JSON.stringify(a.corpo));
assert.equal(a.corpo.classeAnterior, 'uso_proprio');
assert.equal(a.corpo.mudouClasse, true);
const s2 = q1('SELECT * FROM saidas_sem_faturamento WHERE historico_item_id = ?', item(2));
assert.equal(s2.tipo, 'brinde');
assert.equal(s2.motivo, 'Presente Angela');
assert.equal(s2.custo_unit, 8.59);
assert.match(s2.observacao, /Classe corrigida de Uso próprio para Brinde/);
assert.equal(q1("SELECT COUNT(*) n FROM saidas_valor_historico WHERE saida_id = ? AND campo = 'custo_unit' AND fonte = 'planilha'", s2.id).n, 1);
prova('A — uso próprio → brinde: tipo, rótulo "Presente Angela", custo R$ 8,59 com histórico');

/* B */
const b = await corrige(3, 'brinde', { observacao: 'Presente Ester', custo: 2.56 });
assert.equal(b.status, 200, JSON.stringify(b.corpo));
assert.equal(b.corpo.saidaId, null);
const tudo = (await api('GET', '/api/saidas')).corpo;
const leg = tudo.legado.find((l) => l.historicoItemId === item(3));
assert.equal(leg.tipo, 'brinde');
assert.equal(leg.observacao, 'Presente Ester');
assert.equal(leg.custoInformado, 2.56);
prova('B — linha sem data corrigida: no legado como Brinde, "Presente Ester", custo R$ 2,56');

/* C */
assert.equal((await corrige(4, 'brinde', { observacao: 'Brinde Feira Franceschini - Dia das Mães' })).status, 200);
assert.equal((await corrige(5, 'perda', { observacao: 'PERDIDO' })).status, 200);
const depois = (await api('GET', '/api/saidas')).corpo;
assert.deepEqual(
  { brinde: depois.resumo.brinde, uso: depois.resumo.uso_proprio, perda: depois.resumo.perda, sorteio: depois.resumo.sorteio },
  { brinde: 2, uso: 0, perda: 1, sorteio: 0 });
prova('C — sorteio → brinde; resumo: brinde 2, perda 1, uso próprio 0, sorteio 0 (+1 brinde no legado)');

/* D */
const corr = raw.prepare('SELECT * FROM historico_reclassificacao_correcoes ORDER BY id').all();
assert.equal(corr.length, 4);
assert.deepEqual(corr.map((c) => [c.classe_anterior, c.classe_nova]),
  [['uso_proprio', 'brinde'], ['uso_proprio', 'brinde'], ['sorteio', 'brinde'], ['perda', 'perda']]);
assert.equal(corr[0].motivo_anterior, 'regra automática: a cliente é a dona');
assert.ok(corr.every((c) => c.fonte === FONTE));
assert.match(q1('SELECT motivo FROM historico_reclassificacao WHERE historico_item_id = ?', item(2)).motivo, /Presente Angela/);
prova('D — classe e motivo anteriores preservados na correção, com a fonte; perda anotada sem mudar a classe');

/* E */
const de = await corrige(2, 'brinde', { observacao: 'Presente Angela', custo: 8.59 });
assert.equal(de.corpo.jaAplicada, true);
assert.equal(q1('SELECT COUNT(*) n FROM historico_reclassificacao_correcoes').n, 4);
prova('E — a mesma correção de novo: jaAplicada, nada escrito');

/* F */
assert.equal(retratoDoEstoque(), ESTOQUE, 'a correção mexeu no estoque');
assert.equal(q1('SELECT COUNT(*) n FROM saidas_sem_faturamento WHERE estoque_refletido = 1').n, 0);
prova('F — estoque idêntico; nenhuma saída com baixa');

/* G */
assert.equal((await api('GET', '/api/vendas/feitas?limite=500')).corpo.vendas.length, feitasAntes);
const crm = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo.kpis;
assert.equal(crm.vendasTotal, crmAntes.vendasTotal);
assert.equal(crm.faturamentoTotal, crmAntes.faturamentoTotal);
prova('G — Vendas feitas e faturamento iguais: corrigir a classe não mexe no comercial');

/* H */
const soBrinde = (await api('GET', '/api/saidas?tipo=brinde')).corpo;
assert.ok(soBrinde.saidas.length === 2 && soBrinde.saidas.every((x) => x.tipo === 'brinde'));
assert.ok(soBrinde.legado.length === 1 && soBrinde.legado.every((x) => x.tipo === 'brinde'));
const soPerda = (await api('GET', '/api/saidas?tipo=perda')).corpo;
assert.ok(soPerda.saidas.every((x) => x.tipo === 'perda') && soPerda.legado.length === 0);
prova('H — filtrar por motivo devolve só aquele motivo, nas saídas e no legado');

/* I */
const real = await api('POST', '/api/saidas', { tipo: 'uso_proprio', sku: '100202', qtd: 1, motivo: 'teste' });
assert.equal(real.status, 201, JSON.stringify(real.corpo));
raw.prepare('UPDATE historico_reclassificacao SET saida_id = ? WHERE historico_item_id = ?').run(real.corpo.saida.id, item(5));
const recusa = await corrige(5, 'brinde', { observacao: 'x' });
assert.equal(recusa.status, 409);
raw.prepare('UPDATE historico_reclassificacao SET saida_id = (SELECT id FROM saidas_sem_faturamento WHERE historico_item_id = ?) WHERE historico_item_id = ?').run(item(5), item(5));
prova('I — saída que baixou estoque é recusada (a classe está no movimento da razão)');

/* J */
const casos = [
  [{ liquidoCentavos: 147310, recebidoCentavos: 147310, statusDaVenda: 'parcial' }, 'paga'],
  [{ liquidoCentavos: 147310, recebidoCentavos: 100000, statusDaVenda: 'paga' }, 'parcial'],
  [{ liquidoCentavos: 147310, recebidoCentavos: 0, statusDaVenda: 'paga' }, 'a_receber'],
  [{ liquidoCentavos: null, recebidoCentavos: null, statusDaVenda: 'parcial' }, 'parcial'],
  [{ liquidoCentavos: null, recebidoCentavos: null, statusDaVenda: 'paga' }, 'paga'],
  [{ liquidoCentavos: null, recebidoCentavos: null, statusDaVenda: 'nao_paga' }, 'a_receber'],
];
for (const [entrada, esperado] of casos) assert.equal(situacaoDoAcertoDocumental(entrada), esperado, JSON.stringify(entrada));
prova('J — acerto: recebido ≥ líquido do acerto é Pago mesmo com linha excluída não paga; parcial e a receber pela mesma conta');

console.log(`\n${provas} provas, 0 falhas`);
