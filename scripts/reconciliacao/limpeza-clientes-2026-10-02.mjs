#!/usr/bin/env node
/** Termina a limpeza de Clientes que a rodada de 26/09/2026 deixou pela
 *  metade — sobre uma CÓPIA do banco de produção, pelas rotas reais.
 *
 *  O que ficou para trás em 26/09 (`reconciliar-fonte-operacional.mjs`, passo
 *  6) e por quê: a regra 4 de lá preservava toda linha com "valor positivo
 *  marcado PAGO", mesmo com texto de brinde, até uma conferência humana. E
 *  ninguém tirou de Clientes os cadastros cujas linhas já tinham virado
 *  saída sem faturamento.
 *
 *  A conferência humana veio em 02/10/2026 (pedido do dono):
 *
 *    1. "Brinde dia das mães" é motivo de saída, não cliente. A única linha
 *       dele (R$ 109,00 PAGO, "Eu que dei") vira BRINDE pela rota oficial
 *       `POST /api/historico/reclassificar` — saída classificatória,
 *       `estoque_refletido = 0`, nenhum movimento;
 *    2. os três cadastros operacionais — "Brinde dia das mães", "Brinde
 *       festa junina", "Inventário" — são ARQUIVADOS: as linhas da planilha
 *       apontam para eles (`cliente_id`), e §28 não apaga histórico;
 *    3. "Sem nome" (#219), sem dependência nenhuma, é EXCLUÍDO pela rota que
 *       só exclui cadastro sem histórico.
 *
 *  Sthefany Marques (#64) NÃO é tocada: é pessoa real. As linhas dela que
 *  eram uso próprio/brinde sem dinheiro já foram reclassificadas em 26/09;
 *  as 8 que restam têm valor marcado PAGO — dinheiro registrado, compra dela
 *  até prova em contrário. Ficam listadas no relatório para decisão.
 *
 *  Os alvos são por ID, nunca por nome (§2). Se o banco não bater com o que
 *  foi auditado (nome, quantidade de linhas, estado da reclassificação), o
 *  programa para sem escrever.
 *
 *    node scripts/reconciliacao/limpeza-clientes-2026-10-02.mjs --banco <copia.sqlite> [--relatorio saida.json]
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.banco) { console.error('uso: --banco <copia.sqlite> [--relatorio saida.json]'); process.exit(2); }

const USUARIO = 'limpeza-clientes-2026-10-02';
const ALVOS = {
  brindeMaes: { id: 300, nome: 'Brinde dia das mães', itens: 1 },
  brindeJunina: { id: 311, nome: 'Brinde festa junina', itens: 1 },
  inventario: { id: 326, nome: 'Inventário', itens: 3 },
  semNome: { id: 219, nome: 'Sem nome', itens: 0 },
  sthefany: { id: 64, nome: 'Sthefany Marques' },
};
const ITEM_BRINDE_MAES = 3785;

const raw = new DatabaseSync(args.banco);
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
const { default: worker } = await import(pathToFileURL(path.join(RAIZ, 'api/src/index.js')).href);
const env = { DB, API_KEY: 'limpeza' };
const api = async (metodo, caminho, corpo) => {
  const r = await worker.fetch(new Request(`http://limpeza.local${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer limpeza', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: r.status, corpo: await r.json().catch(() => null) };
};
const q = (sql, ...a) => raw.prepare(sql).all(...a);
const q1 = (sql, ...a) => raw.prepare(sql).get(...a) ?? null;
const parar = (msg, extra) => { console.error(`PAROU: ${msg}`, extra ?? ''); process.exit(1); };

/* ── a trava: o banco é o que foi auditado ── */
for (const a of Object.values(ALVOS)) {
  const c = q1('SELECT nome FROM clientes WHERE id = ?', a.id);
  if (!c || c.nome.normalize('NFC') !== a.nome.normalize('NFC')) parar(`cliente #${a.id} não é "${a.nome}"`, c);
  if (a.itens !== undefined) {
    const n = q1('SELECT COUNT(*) n FROM vendas_historico_itens WHERE cliente_id = ?', a.id).n;
    if (n !== a.itens) parar(`#${a.id} tem ${n} linhas na planilha, esperado ${a.itens}`);
  }
}
const itemMaes = q1('SELECT * FROM vendas_historico_itens WHERE id = ?', ITEM_BRINDE_MAES);
if (!itemMaes || itemMaes.cliente_id !== ALVOS.brindeMaes.id) parar('a linha do Brinde dia das mães mudou');
if (!q1("SELECT 1 FROM pragma_table_info('clientes') WHERE name = 'arquivada_em'")) {
  parar('a cópia não tem clientes.arquivada_em — aplique api/migracao-clientes-arquivo.sql antes');
}

/* ── o retrato: estoque, financeiro, clientes ── */
const retrato = async () => {
  const crm = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo;
  const lista = (await api('GET', '/api/clientes?limite=2000')).corpo;
  const contas = (await api('GET', '/api/contas-receber')).corpo;
  const nomes = (l) => (l ?? []).map((c) => c.nome);
  const pseudo = ['Brinde dia das mães', 'Brinde festa junina', 'Inventário', 'Sem nome'];
  return {
    estoque: q1(`SELECT (SELECT COUNT(*) FROM produtos) produtos, (SELECT SUM(qtd) FROM produtos) pecas,
                        (SELECT COUNT(*) FROM movimentos) movimentos, (SELECT SUM(qtd) FROM movimentos) somaMovimentos`),
    razaoDivergente: q1(`SELECT COUNT(*) n FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m
                          ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.s, 0)`).n,
    vendasOperacionais: q1('SELECT COUNT(*) n, SUM(total) total FROM vendas'),
    pagamentos: {
      vendas: q1('SELECT SUM(pago) pagas, SUM(COALESCE(valor_recebido, 0)) recebido FROM vendas'),
      operacoes: q1('SELECT COUNT(*) n, SUM(COALESCE(valor_recebido_centavos, 0)) recebidoCentavos FROM historico_operacoes'),
      credito: q1('SELECT COUNT(*) n, SUM(valor_centavos) centavos FROM credito_movimentos'),
    },
    aReceber: { contas: contas?.resumo?.quantidade ?? null, totalCentavos: contas?.resumo?.totalCentavos ?? null },
    saidas: q1('SELECT COUNT(*) n, SUM(qtd) pecas FROM saidas_sem_faturamento'),
    reclassificacoes: q1("SELECT COUNT(*) n FROM historico_reclassificacao WHERE status = 'aplicada'"),
    clientes: {
      cadastros: q1('SELECT COUNT(*) n FROM clientes').n,
      naLista: lista.length,
      arquivadas: q1('SELECT COUNT(*) n FROM clientes WHERE arquivada_em IS NOT NULL').n,
      pseudoNaLista: nomes(lista).filter((n) => pseudo.includes(n)),
    },
    dashboard: {
      ativos: crm.kpis.ativos, recorrentes: crm.kpis.recorrentes, vendas: crm.kpis.vendasTotal,
      faturamento: crm.kpis.faturamentoTotal, ticketMedio: crm.kpis.ticketMedioPorVenda,
      pseudoNoRanking: nomes(crm.todos).filter((n) => pseudo.includes(n)),
      pseudoNoTop: nomes(crm.topClientes).filter((n) => pseudo.includes(n)),
      pseudoEmChamarDeVolta: nomes(crm.reativacao).filter((n) => pseudo.includes(n)),
    },
  };
};

/* ── a auditoria, antes de escrever ── */
const auditoria = Object.fromEntries(await Promise.all(Object.entries(ALVOS).map(async ([k, a]) => [k, {
  id: a.id, nome: a.nome,
  linhas: q(`SELECT i.id, i.origem_linha linha, i.data, i.sku, i.qtd, i.valor_total valor, i.status_pagamento_original status,
                    TRIM(COALESCE(i.desconto_original, '') || ' ' || COALESCE(i.observacao_original, '')) texto,
                    rc.classe_nova reclassificada, rc.saida_id saida
               FROM vendas_historico_itens i LEFT JOIN historico_reclassificacao rc ON rc.historico_item_id = i.id
              WHERE i.cliente_id = ? ORDER BY i.data`, a.id),
  dependencias: (await api('GET', `/api/clientes/${a.id}/dependencias`)).corpo,
}])));
const antes = await retrato();

/* ── 1. a linha do Brinde dia das mães vira brinde ── */
const rc = await api('POST', '/api/historico/reclassificar', {
  decisoes: [{
    historicoItemId: ITEM_BRINDE_MAES, classe: 'brinde', decisao: 'aplicar', confianca: 'alta',
    motivo: '"Brinde dia das mães" é a ocasião do brinde, não uma cliente ("Eu que dei"). '
      + 'Decisão do dono em 02/10/2026: brinde é saída sem faturamento, mesmo com valor marcado PAGO na planilha.',
  }],
  usuario: USUARIO,
});
if (rc.status !== 200) parar('reclassificação recusada', rc.corpo);

/* ── 2. arquivar os cadastros operacionais ── */
for (const a of [ALVOS.brindeMaes, ALVOS.brindeJunina, ALVOS.inventario]) {
  const r = await api('POST', `/api/clientes/${a.id}/arquivar`, {
    motivo: `cadastro operacional da planilha antiga (${a.id === ALVOS.inventario.id ? 'diferença de inventário' : 'brinde'}) — não é cliente; as linhas estão em Saídas sem faturamento`,
  });
  if (r.status !== 200) parar(`arquivar #${a.id}`, r.corpo);
}

/* ── 3. excluir "Sem nome" — a rota só exclui sem dependência ── */
const ex = await api('DELETE', `/api/clientes/${ALVOS.semNome.id}`);
if (ex.status !== 200) parar('excluir "Sem nome"', ex.corpo);

const depois = await retrato();
const saidaNova = q1('SELECT id, tipo, data, sku, qtd, motivo, observacao, estoque_refletido, movimento_id, preco_unit FROM saidas_sem_faturamento WHERE historico_item_id = ?', ITEM_BRINDE_MAES);

/* ── as provas que não podem falhar ── */
const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const provas = {
  estoqueIntacto: iguais(antes.estoque, depois.estoque),
  razaoFecha: depois.razaoDivergente === 0,
  vendasOperacionaisIntactas: iguais(antes.vendasOperacionais, depois.vendasOperacionais),
  pagamentosIntactos: iguais(antes.pagamentos, depois.pagamentos),
  aReceberIntacto: iguais(antes.aReceber, depois.aReceber),
  umaSaidaNova: depois.saidas.n === antes.saidas.n + 1,
  saidaSemMovimento: saidaNova?.estoque_refletido === 0 && saidaNova?.movimento_id === null,
  pseudoForaDaLista: depois.clientes.pseudoNaLista.length === 0,
  pseudoForaDosRankings: depois.dashboard.pseudoNoRanking.length === 0
    && depois.dashboard.pseudoNoTop.length === 0 && depois.dashboard.pseudoEmChamarDeVolta.length === 0,
  sthefanyIntacta: !!q1('SELECT 1 FROM clientes WHERE id = 64 AND arquivada_em IS NULL'),
};
const relatorio = { usuario: USUARIO, auditoria, antes, depois, saidaNova, provas };
if (args.relatorio) writeFileSync(args.relatorio, JSON.stringify(relatorio, null, 2));
console.log(JSON.stringify({ antes, depois, saidaNova, provas }, null, 2));
if (Object.values(provas).some((v) => !v)) parar('alguma prova falhou', provas);
console.log('\nTodas as provas passaram.');
