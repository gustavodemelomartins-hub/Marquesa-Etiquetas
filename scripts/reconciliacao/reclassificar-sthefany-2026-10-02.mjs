#!/usr/bin/env node
/** Reclassifica as 8 linhas restantes da Sthefany Marques (#64) — sobre uma
 *  CÓPIA do banco de produção, pelas rotas reais.
 *
 *  Conferência humana do responsável em 02/10/2026: TODAS as linhas da
 *  planilha atribuídas à Sthefany Marques são uso próprio ou presentes dados
 *  por ela — nenhuma é venda comercial. É a conferência que a regra 4 do
 *  reconciliador de 26/09 esperava ("valor positivo marcado PAGO não sai do
 *  faturamento sem conferência humana").
 *
 *  Classe de cada linha pela evidência escrita nela, nunca pelo nome:
 *    texto "Presente …"            → brinde
 *    sem texto que diferencie      → uso_proprio (a "cliente" é a própria dona)
 *
 *  Nada de estoque: a rota cria saída classificatória (`estoque_refletido =
 *  0`) quando o código está no catálogo, e registro legado quando não está.
 *  O cadastro #64 NÃO é arquivado nem excluído.
 *
 *    node scripts/reconciliacao/reclassificar-sthefany-2026-10-02.mjs --banco <copia.sqlite> [--relatorio saida.json]
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

const USUARIO = 'reclassificacao-sthefany-2026-10-02';
const STHEFANY = 64;
const CONFIRMACAO = 'Confirmação humana do responsável em 02/10/2026: as linhas atribuídas a Sthefany Marques '
  + 'são uso próprio ou presentes dados por ela, não venda comercial.';
/* As 8 linhas, auditadas no export de 02/10/2026. Qualquer diferença para. */
const LINHAS = [
  { id: 2904, data: '2024-11-07', sku: '944768', valor: 99 },
  { id: 2914, data: '2024-11-30', sku: '524730', valor: 129 },
  { id: 2859, data: '2025-04-11', sku: '922884', valor: 189 },
  { id: 3514, data: '2025-12-24', sku: '204997', valor: 169 },
  { id: 3515, data: '2025-12-24', sku: '377105', valor: 79 },
  { id: 3516, data: '2025-12-28', sku: '152177', valor: 79 },
  { id: 3793, data: '2026-05-10', sku: '450475', valor: 49 },
  { id: 3870, data: '2026-06-11', sku: '322557', valor: 129 },
];

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
const env = { DB, API_KEY: 'reclass' };
const api = async (metodo, caminho, corpo) => {
  const r = await worker.fetch(new Request(`http://reclass.local${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer reclass', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: r.status, corpo: await r.json().catch(() => null) };
};
const q = (sql, ...a) => raw.prepare(sql).all(...a);
const q1 = (sql, ...a) => raw.prepare(sql).get(...a) ?? null;
const parar = (msg, extra) => { console.error(`PAROU: ${msg}`, extra ?? ''); process.exit(1); };

/* ── a trava: o conjunto é exatamente o auditado ── */
const VIVO = `JOIN vendas_historico_lotes l ON l.id = i.lote_id AND l.status = 'importado'`;
const todas = q(`SELECT i.id FROM vendas_historico_itens i ${VIVO} WHERE i.cliente_id = ?`, STHEFANY);
if (todas.length !== 34) parar(`a Sthefany tem ${todas.length} linhas, esperado 34`);
const semId = q1(`SELECT COUNT(*) n FROM vendas_historico_itens i ${VIVO}
                   WHERE i.cliente_id IS NULL AND i.cliente_nome_norm = 'sthefany marques'`).n;
if (semId) parar(`${semId} linhas da Sthefany sem cliente_id — o conjunto não está provado`);
if (q1("SELECT COUNT(*) n FROM vendas WHERE cliente_id = ? OR cliente_nome_norm = 'sthefany marques'", STHEFANY).n) {
  parar('há venda do sistema da Sthefany — fora do que foi auditado');
}
const jaFeitas = q1(`SELECT COUNT(*) n FROM vendas_historico_itens i ${VIVO}
                      JOIN historico_reclassificacao rc ON rc.historico_item_id = i.id AND rc.status = 'aplicada'
                     WHERE i.cliente_id = ?`, STHEFANY).n;
if (jaFeitas !== 26) parar(`${jaFeitas} já reclassificadas, esperado 26`);
const restantes = q(`SELECT i.* FROM vendas_historico_itens i ${VIVO}
                      WHERE i.cliente_id = ?
                        AND NOT EXISTS (SELECT 1 FROM historico_reclassificacao rc WHERE rc.historico_item_id = i.id)
                      ORDER BY i.data, i.id`, STHEFANY);
const conferem = restantes.length === LINHAS.length && restantes.every((r) => {
  const e = LINHAS.find((x) => x.id === r.id);
  return e && e.data === r.data && e.sku === r.sku && Number(r.valor_total) === e.valor;
});
if (!conferem) parar('as linhas restantes não são as 8 auditadas', restantes.map((r) => [r.id, r.data, r.sku, r.valor_total]));
const soma = restantes.reduce((s, r) => s + Number(r.valor_total), 0);
if (soma !== 922) parar(`soma ${soma}, esperado 922`);

/* ── a classe de cada linha, pela evidência dela ── */
const decisoes = restantes.map((r) => {
  const texto = [r.desconto_original, r.observacao_original].map((t) => String(t ?? '').trim()).filter(Boolean).join(' · ');
  const presente = /\bpresente\b/i.test(String(r.desconto_original ?? ''));
  const classe = presente ? 'brinde' : 'uso_proprio';
  const evidencia = presente
    ? `texto da planilha "${r.desconto_original}" identifica presente`
    : 'a planilha não diz o destino (só "Maleta"); a "cliente" é a própria Sthefany — uso próprio';
  return {
    historicoItemId: r.id, classe, decisao: 'aplicar', confianca: 'alta',
    motivo: `${CONFIRMACAO} ${evidencia}. Na planilha: Nº ${r.origem_linha}, R$ ${Number(r.valor_total).toFixed(2)} `
      + `marcado ${r.status_pagamento_original}, antes contado como venda paga.`,
    _linha: { id: r.id, linha: r.origem_linha, data: r.data, sku: r.sku, peca: r.nome_produto_historico,
      valor: r.valor_total, status: r.status_pagamento_original, texto, classe },
  };
});

/* ── o retrato ── */
const retrato = async () => {
  const crm = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo;
  const feitas = (await api('GET', '/api/vendas/feitas?limite=5000')).corpo;
  const ficha = (await api('GET', `/api/clientes/perfil?id=${STHEFANY}`)).corpo;
  const contas = (await api('GET', '/api/contas-receber')).corpo;
  const saidas = (await api('GET', '/api/saidas')).corpo;
  return {
    estoque: q1(`SELECT (SELECT SUM(qtd) FROM produtos) pecas, (SELECT COUNT(*) FROM movimentos) movimentos,
                        (SELECT SUM(qtd) FROM movimentos) somaMovimentos`),
    razaoDivergente: q1(`SELECT COUNT(*) n FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m
                          ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.s, 0)`).n,
    saidasLinhas: q1('SELECT COUNT(*) n, SUM(qtd) pecas FROM saidas_sem_faturamento').n,
    saidasComBaixa: q1('SELECT COUNT(*) n FROM saidas_sem_faturamento WHERE estoque_refletido = 1').n,
    saidasTela: { linhas: saidas.saidas.length, legado: saidas.legado.length },
    reclassificacoes: q1("SELECT COUNT(*) n FROM historico_reclassificacao WHERE status = 'aplicada'").n,
    vendasSistema: q1('SELECT COUNT(*) n, SUM(total) total, SUM(pago) pagas FROM vendas'),
    operacoes: q1('SELECT COUNT(*) n, SUM(COALESCE(valor_recebido_centavos, 0)) recebidoCentavos FROM historico_operacoes'),
    aReceber: { contas: contas?.resumo?.quantidade ?? null, totalCentavos: contas?.resumo?.totalCentavos ?? null },
    vendasFeitas: { total: feitas.total, daSthefany: feitas.vendas.filter((v) => v.cliente === 'Sthefany Marques').length },
    comercial: {
      ativos: crm.kpis.ativos, vendas: crm.kpis.vendasTotal, faturamento: crm.kpis.faturamentoTotal,
      ticketMedio: crm.kpis.ticketMedioPorVenda, recorrentes: crm.kpis.recorrentes,
      sthefanyNaBase: crm.todos.some((c) => c.clienteId === STHEFANY),
      sthefanyNoTop: crm.topClientes.some((c) => c.clienteId === STHEFANY),
      sthefanyChamarDeVolta: crm.reativacao.some((c) => c.nome === 'Sthefany Marques'),
    },
    sthefany: {
      cadastro: !!q1('SELECT 1 FROM clientes WHERE id = ? AND arquivada_em IS NULL', STHEFANY),
      compras: ficha.resumo.vendas, comprou: ficha.resumo.comprou, pago: ficha.resumo.pago,
    },
  };
};

const antes = await retrato();
const rc = await api('POST', '/api/historico/reclassificar', {
  decisoes: decisoes.map(({ _linha, ...d }) => d), usuario: USUARIO,
});
if (rc.status !== 200) parar('reclassificação recusada', rc.corpo);
const depois = await retrato();
const repetida = await api('POST', '/api/historico/reclassificar', {
  decisoes: decisoes.map(({ _linha, ...d }) => d), usuario: USUARIO,
});
const depoisDaRepeticao = q1('SELECT COUNT(*) n FROM saidas_sem_faturamento').n;

const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const provas = {
  estoqueIntacto: iguais(antes.estoque, depois.estoque),
  razaoFecha: depois.razaoDivergente === 0,
  nenhumaBaixa: depois.saidasComBaixa === antes.saidasComBaixa,
  vendasDoSistemaIntactas: iguais(antes.vendasSistema, depois.vendasSistema),
  operacoesIntactas: iguais(antes.operacoes, depois.operacoes),
  aReceberIntacto: iguais(antes.aReceber, depois.aReceber),
  oitoDecisoes: depois.reclassificacoes === antes.reclassificacoes + 8,
  repeticaoRecusada: repetida.status !== 200 && depoisDaRepeticao === depois.saidasLinhas,
  faturamentoMenos922: +(antes.comercial.faturamento - depois.comercial.faturamento).toFixed(2) === 922,
  sthefanyZerada: depois.sthefany.compras === 0 && depois.sthefany.comprou === 0,
  sthefanyAtiva: depois.sthefany.cadastro,
  sthefanyForaDeVendasFeitas: depois.vendasFeitas.daSthefany === 0,
  sthefanyForaDoComercial: !depois.comercial.sthefanyNaBase && !depois.comercial.sthefanyNoTop
    && !depois.comercial.sthefanyChamarDeVolta,
};
const linhas = decisoes.map((d) => d._linha).map((l) => ({
  ...l, saida: q1('SELECT id FROM saidas_sem_faturamento WHERE historico_item_id = ?', l.id)?.id ?? 'legado (código fora do catálogo)',
}));
const relatorio = { usuario: USUARIO, linhas, soma, antes, depois, provas };
if (args.relatorio) writeFileSync(args.relatorio, JSON.stringify(relatorio, null, 2));
console.log(JSON.stringify(relatorio, null, 2));
if (Object.values(provas).some((v) => !v)) parar('alguma prova falhou', provas);
console.log('\nTodas as provas passaram.');
