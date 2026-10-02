/** Cliente: excluir, arquivar e reativar — e o pseudo-cliente da planilha
 *  antiga saindo de Clientes sem virar segunda saída de estoque.
 *
 *  Roda o Worker real (`api/src/index.js`) em processo, sobre `api/schema.sql`
 *  + `scripts/v2-local/seed-catalogo.sql` num SQLite em memória. Toda escrita
 *  passa pelas rotas, como em produção. Sem rede, sem chave real.
 *
 *   A  cliente vazio, sem histórico → exclui de verdade
 *   B  cliente com compra → excluir é recusado (409); arquivar funciona
 *   C  arquivada sai da lista padrão (e aparece com ?arquivadas=sim)
 *   D  arquivada continua com o histórico inteiro na ficha
 *   E  arquivada pode ser reativada e volta para a lista
 *   F  pseudo-cliente "Brinde": a linha vira saída sem faturamento pela rota
 *      oficial — sem movimento de estoque, sem segunda saída ao repetir
 *   G  pseudo-cliente reclassificado e arquivado não entra em Top, ativos,
 *      recorrentes nem "Para chamar de volta"
 *   H  cliente "Sem nome" sem histórico → exclusão funciona
 *   I  cliente real com nome parecido com termo operacional NÃO é removido
 *      nem tirado dos rankings por correspondência de texto
 *
 *  Usa `node:sqlite` (Node 22.5+). Onde não existir, diz que não rodou.
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

/* Adaptador D1 → node:sqlite, o mesmo de scripts/v2-local/worker-local.mjs. */
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

const razaoFechada = () => q1(`SELECT COUNT(*) n FROM produtos p
  LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
  WHERE p.qtd <> COALESCE(m.s, 0)`).n === 0;
const retratoDoEstoque = () => JSON.stringify({
  produtos: raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all(),
  movimentos: q1('SELECT COUNT(*) n, COALESCE(SUM(qtd), 0) s FROM movimentos'),
});

/* ── a planilha: uma cliente real recorrente, um pseudo-cliente "Brinde"
   com valor marcado PAGO (o caso que a rodada de 26/09 preservou), e uma
   cliente REAL cujo nome começa com "Brinde". */
const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];
const imp = await api('POST', '/api/vendas/historico/importar', {
  arquivo: 'Vendas teste.xlsx',
  linhas: [
    CAB,
    [1, '2025-03-02', 'Rita Sumida', '100101', 'Colar', 'Banhada', 1, 105, null, 105, 'Pix', 'PAGO', 'Site'],
    [2, '2025-06-10', 'Rita Sumida', '100201', 'Brinco', 'Banhada', 1, 119, null, 119, 'Pix', 'PAGO', 'Site'],
    [3, '2026-05-08', 'Brinde dia das mães', '100301', 'Anel', 'Banhada', 1, 109, 'Eu que dei', 109, null, 'PAGO', 'Maleta (Feira)'],
    [4, '2026-04-10', 'Brinde Souza', '100401', 'Pulseira', 'Banhada', 1, 139, null, 139, 'Pix', 'PAGO', 'Maleta'],
    [5, '2026-07-10', 'Brinde Souza', '100402', 'Pulseira', 'Banhada', 1, 99, null, 99, 'Pix', 'PAGO', 'Maleta'],
  ],
});
assert.equal(imp.status, 201, `importação: ${JSON.stringify(imp.corpo)}`);
const idDe = (nome) => q1('SELECT id FROM clientes WHERE nome = ?', nome)?.id;
const RITA = idDe('Rita Sumida');
const BRINDE = idDe('Brinde dia das mães');
const SOUZA = idDe('Brinde Souza');
assert.ok(RITA && BRINDE && SOUZA, 'a importação não criou os cadastros');
assert.ok(razaoFechada(), 'a razão já nasceu aberta');
const ESTOQUE_ANTES = retratoDoEstoque();
const lista = async (extra = '') => (await api('GET', `/api/clientes?limite=2000${extra}`)).corpo.map((c) => c.nome);

/* ── A. cliente vazio → exclui ── */
const vazio = await api('POST', '/api/clientes', { nome: 'Cadastro Vazio' });
assert.equal(vazio.status, 201);
const VAZIO = vazio.corpo.id ?? idDe('Cadastro Vazio');
const depVazio = await api('GET', `/api/clientes/${VAZIO}/dependencias`);
assert.equal(depVazio.corpo.podeExcluir, true);
assert.deepEqual(depVazio.corpo.dependencias, []);
const exVazio = await api('DELETE', `/api/clientes/${VAZIO}`);
assert.equal(exVazio.status, 200);
assert.equal(idDe('Cadastro Vazio'), undefined);
prova('A — cliente sem histórico é excluído de verdade');

/* ── B. cliente com compra → não exclui, arquiva ── */
const depRita = await api('GET', `/api/clientes/${RITA}/dependencias`);
assert.equal(depRita.corpo.podeExcluir, false);
assert.ok(depRita.corpo.dependencias.some((d) => d.chave === 'historico' && d.n === 2));
const exRita = await api('DELETE', `/api/clientes/${RITA}`);
assert.equal(exRita.status, 409);
assert.ok(idDe('Rita Sumida'), 'o 409 apagou o cadastro mesmo assim');
const arqRita = await api('POST', `/api/clientes/${RITA}/arquivar`, { motivo: 'mudou de cidade' });
assert.equal(arqRita.status, 200);
assert.equal((await api('POST', `/api/clientes/${RITA}/arquivar`, {})).status, 409, 'arquivou duas vezes');
prova('B — cliente com compra: excluir dá 409 e o cadastro fica; arquivar funciona');

/* ── C. arquivada sai da lista padrão ── */
assert.ok(!(await lista()).includes('Rita Sumida'), 'arquivada continua na lista padrão');
assert.ok((await lista('&arquivadas=sim')).includes('Rita Sumida'));
assert.ok(!(await lista('&busca=rita')).includes('Rita Sumida'), 'a busca padrão acha arquivada');
prova('C — arquivada sai da lista e da busca padrão; aparece em ?arquivadas=sim');

/* ── D. arquivada continua com histórico ── */
const perfilRita = await api('GET', `/api/clientes/perfil?id=${RITA}`);
assert.equal(perfilRita.status, 200);
assert.ok(perfilRita.corpo.cadastro.arquivada_em, 'a ficha não diz que está arquivada');
assert.equal(perfilRita.corpo.cadastro.arquivada_motivo, 'mudou de cidade');
assert.equal(perfilRita.corpo.resumo.vendas, 2);
assert.equal(perfilRita.corpo.resumo.comprou, 224);
prova('D — a ficha da arquivada mantém as 2 compras e R$ 224');

/* ── E. reativar ── */
assert.equal((await api('POST', `/api/clientes/${RITA}/reativar`)).status, 200);
assert.ok((await lista()).includes('Rita Sumida'));
assert.equal(q1('SELECT arquivada_em FROM clientes WHERE id = ?', RITA).arquivada_em, null);
assert.equal((await api('POST', `/api/clientes/${RITA}/reativar`)).status, 409, 'reativou quem não estava arquivada');
prova('E — reativada volta para a lista');

/* ── F. pseudo-cliente "Brinde": a linha vira saída, sem movimento ── */
const crmAntes = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo;
assert.ok(crmAntes.todos.some((c) => c.nome === 'Brinde dia das mães'), 'cenário: o brinde devia estar contando');
const item = q1('SELECT id FROM vendas_historico_itens WHERE cliente_id = ?', BRINDE).id;
const decisao = {
  decisoes: [{ historicoItemId: item, classe: 'brinde', decisao: 'aplicar', confianca: 'alta', motivo: 'teste' }],
  usuario: 'teste',
};
const rc = await api('POST', '/api/historico/reclassificar', decisao);
assert.equal(rc.status, 200, JSON.stringify(rc.corpo));
const saidas = raw.prepare('SELECT * FROM saidas_sem_faturamento WHERE historico_item_id = ?').all(item);
assert.equal(saidas.length, 1);
assert.equal(saidas[0].tipo, 'brinde');
assert.equal(saidas[0].estoque_refletido, 0);
assert.equal(saidas[0].movimento_id, null);
assert.equal(saidas[0].sku, '100301');
assert.equal(saidas[0].data, '2026-05-08');
assert.ok(/Brinde dia das mães/.test(saidas[0].observacao), 'a saída não diz de onde veio');
const repetida = await api('POST', '/api/historico/reclassificar', decisao);
assert.notEqual(repetida.status, 200, 'aplicou a mesma linha duas vezes');
assert.equal(q1('SELECT COUNT(*) n FROM saidas_sem_faturamento').n, 1, 'segunda saída criada');
assert.equal(retratoDoEstoque(), ESTOQUE_ANTES, 'reclassificar mexeu no estoque');
assert.ok(razaoFechada());
const historicoSaidas = (await api('GET', '/api/saidas')).corpo;
assert.ok((historicoSaidas.saidas ?? []).some((s) => s.historicoItemId === item || s.historico_item_id === item || s.sku === '100301'),
  'a saída migrada não aparece em Saídas sem faturamento');
prova('F — "Brinde" vira 1 saída (SKU, data, origem), sem movimento; repetir não duplica; razão fecha');

/* ── G. pseudo-cliente fora dos rankings ── */
assert.equal((await api('POST', `/api/clientes/${BRINDE}/arquivar`, { motivo: 'cadastro operacional (brinde)' })).status, 200);
assert.equal((await api('DELETE', `/api/clientes/${BRINDE}`)).status, 409, 'excluiu cadastro com linha da planilha');
const crm = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo;
const nomes = (l) => (l ?? []).map((c) => c.nome);
for (const [onde, l] of [['todos', crm.todos], ['Top', crm.topClientes], ['chamar de volta', crm.reativacao]]) {
  assert.ok(!nomes(l).includes('Brinde dia das mães'), `pseudo-cliente em ${onde}`);
}
assert.equal(crm.kpis.ativos, crmAntes.kpis.ativos - 1);
assert.equal(crm.kpis.vendasTotal, crmAntes.kpis.vendasTotal - 1);
assert.equal(+(crmAntes.kpis.faturamentoTotal - crm.kpis.faturamentoTotal).toFixed(2), 109);
assert.ok(!(await lista()).includes('Brinde dia das mães'));
prova('G — pseudo-cliente fora de todos/Top/chamar de volta; ativos −1, vendas −1, faturamento −R$ 109');

/* ── H. "Sem nome" sem histórico ── */
const semNome = await api('POST', '/api/clientes', { nome: 'Sem nome', obs: 'Cliente atendida pela minha mãe' });
const SEM = semNome.corpo.id ?? idDe('Sem nome');
assert.equal((await api('GET', `/api/clientes/${SEM}/dependencias`)).corpo.podeExcluir, true);
assert.equal((await api('DELETE', `/api/clientes/${SEM}`)).status, 200);
assert.equal(idDe('Sem nome'), undefined);
prova('H — "Sem nome" sem histórico é excluído (observação não é dependência)');

/* ── I. cliente real com nome de termo operacional ── */
assert.ok(idDe('Brinde Souza'), 'nome parecido apagou cliente real');
assert.ok((await lista()).includes('Brinde Souza'));
assert.ok(nomes(crm.todos).includes('Brinde Souza'), 'cliente real saiu do ranking pelo nome');
assert.equal((await api('DELETE', `/api/clientes/${SOUZA}`)).status, 409);
assert.equal(q1('SELECT COUNT(*) n FROM historico_reclassificacao h JOIN vendas_historico_itens i ON i.id = h.historico_item_id WHERE i.cliente_id = ?', SOUZA).n, 0);
prova('I — "Brinde Souza" (real) continua na lista, no ranking e não pode ser excluída');

assert.equal(retratoDoEstoque(), ESTOQUE_ANTES);
assert.ok(razaoFechada());
const conferir = await api('GET', '/api/estoque/conferir');
assert.equal(conferir.status, 200);
assert.deepEqual(conferir.corpo.divergentes ?? conferir.corpo, []);
prova('estoque idêntico do começo ao fim; /api/estoque/conferir vazio');

console.log(`\n${provas} provas — clientes: excluir, arquivar, reativar, pseudo-cliente`);
