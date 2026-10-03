#!/usr/bin/env node
/** Rodada de 02/10/2026 (noite) — sobre uma CÓPIA do banco de produção, pelas
 *  rotas reais quando a rota existe.
 *
 *  1. INVENTÁRIOS DE TESTE. Regra do dono (03/10/2026): TODOS os inventários
 *     existentes antes desta limpeza são teste/desenvolvimento; o próximo que
 *     a Sthefany abrir é o primeiro real. A lista não é fixa: são todos os
 *     que a cópia tem, auditados um a um. A trava confere, antes de apagar,
 *     que NENHUM gerou resultado, ajuste, saída, evento ou movimento, e que
 *     nenhum está em andamento (um aberto agora pode ser o primeiro real,
 *     começado depois do export — aí para e pergunta). Não existe rota
 *     de exclusão de inventário — e não deve existir: §28 preserva histórico
 *     de verdade. Este é o caso autorizado de lixo de teste, e por isso vai
 *     por SQL revisável, nunca por botão.
 *
 *  2. A PLANILHA "SAIU SEM FATURAR" DA STHEFANY vence a classificação
 *     automática para os códigos que ela contém (9 uso próprio, 26 brinde,
 *     3 inventário). Cada linha passa por
 *     `POST /api/historico/reclassificar/:item/corrigir`: classe, observação
 *     e custo informado, com a decisão anterior preservada. Custo 0 ou de
 *     fórmula quebrada (`#NAME?` na aba INVENTÁRIO) é "não informado".
 *     Nenhum estoque é tocado.
 *
 *  O que a trava RECUSA fazer e só anuncia: o 821920 (27/09, "Presente Ana
 *  JS") não tem linha nenhuma no sistema — não foi venda nem saída. Lançá-lo
 *  agora seria uma baixa de estoque nova, e esta rodada não mexe em estoque.
 *
 *  `--guardas <arq.json>` grava as condições extras que o SQL confere em
 *  produção antes de escrever (dependência zero, ids exatos) — entra como 5º
 *  argumento de `diferenca-sql.mjs`.
 *
 *    node scripts/reconciliacao/rodada-inventario-2026-10-02.mjs --banco <copia.sqlite> --planilha <saidas.json> [--relatorio saida.json] [--guardas guardas.json]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.banco || !args.planilha) { console.error('uso: --banco <copia.sqlite> --planilha <saidas.json>'); process.exit(2); }

const USUARIO = 'planilha-saiu-sem-faturar-2026-10-02';
const FONTE = 'planilha "Saiu sem faturar.xlsx" da Sthefany, 02/10/2026';
const SEM_REGISTRO = new Set(['821920']);

const raw = new DatabaseSync(args.banco);
const q = (sql, ...a) => raw.prepare(sql).all(...a);
const q1 = (sql, ...a) => raw.prepare(sql).get(...a) ?? null;
const parar = (msg, extra) => { console.error(`PAROU: ${msg}`, extra ?? ''); process.exit(1); };

/* A migration desta rodada, na cópia, antes de tudo (o "antes" da diferença
   já a contém; ela vai para produção como arquivo próprio). */
if (!q("SELECT name FROM pragma_table_info('inventario_contagem') WHERE name = 'faltando'").length) {
  parar('a cópia não tem a migration api/migracao-inventario-conferencia.sql aplicada');
}

const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.bind = (...a) => comArgs(a.map((v) => (v === undefined ? null : v)));
  st.first = async function (col) { const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes ?? 0) } }; };
  return st;
};
const DB = { prepare: preparar, async batch(stmts) { const s = []; for (const x of stmts) s.push(await x.run()); return s; } };
const { default: worker } = await import(pathToFileURL(path.join(RAIZ, 'api/src/index.js')).href);
const env = { DB, API_KEY: 'rodada' };
const api = async (metodo, caminho, corpo) => {
  const r = await worker.fetch(new Request(`http://rodada.local${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer rodada', 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: r.status, corpo: await r.json().catch(() => null) };
};

const retrato = async () => {
  const saidas = (await api('GET', '/api/saidas?limite=1000')).corpo;
  const crm = (await api('GET', '/api/analytics/crm?periodo=tudo')).corpo;
  const feitas = (await api('GET', '/api/vendas/feitas?limite=5000')).corpo;
  const contaTipo = (t) => saidas.saidas.filter((s) => !s.estornada && s.tipo === t).length
    + saidas.legado.filter((l) => l.tipo === t).length;
  return {
    estoque: q1(`SELECT (SELECT SUM(qtd) FROM produtos) pecas, (SELECT COUNT(*) FROM movimentos) movimentos,
                        (SELECT SUM(qtd) FROM movimentos) somaMovimentos`),
    razaoDivergente: q1(`SELECT COUNT(*) n FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m
                          ON m.sku = p.sku WHERE p.qtd <> COALESCE(m.s, 0)`).n,
    inventarios: q1('SELECT COUNT(*) n FROM inventarios').n,
    contagens: q1('SELECT COUNT(*) n FROM inventario_contagem').n,
    saidas: { linhas: saidas.saidas.length, legado: saidas.legado.length, comBaixa: q1('SELECT COUNT(*) n FROM saidas_sem_faturamento WHERE estoque_refletido = 1').n },
    porMotivo: { brinde: contaTipo('brinde'), uso_proprio: contaTipo('uso_proprio'), perda: contaTipo('perda'), sorteio: contaTipo('sorteio') },
    reclassificacoes: q1("SELECT COUNT(*) n FROM historico_reclassificacao WHERE status = 'aplicada'").n,
    vendasFeitas: feitas.total,
    faturamentoCrm: crm.kpis.faturamentoTotal,
    vendasCrm: crm.kpis.vendasTotal,
    vendasSistema: q1('SELECT COUNT(*) n, SUM(total) total FROM vendas'),
  };
};
const antes = await retrato();

/* ═══════════════════════════════════════ 1. inventários de teste */
const invs = q('SELECT * FROM inventarios ORDER BY id');
const INVENTARIOS_DE_TESTE = invs.map((i) => i.id);
if (!invs.length) parar('não há inventário nenhum — nada a limpar; reavalie a rodada');
const emAndamento = invs.filter((i) => !['cancelado', 'concluido'].includes(i.status));
if (emAndamento.length) parar('há inventário em andamento — pode ser o primeiro real; pergunte antes', emAndamento.map((i) => [i.id, i.status]));
const dependencias = {
  resultado: q1(`SELECT COUNT(*) n FROM inventario_resultado WHERE inventario_id IN (${INVENTARIOS_DE_TESTE})`).n,
  itensAntigos: q1(`SELECT COUNT(*) n FROM inventario_itens WHERE inventario_id IN (${INVENTARIOS_DE_TESTE})`).n,
  naoIdentificado: q1(`SELECT COUNT(*) n FROM inventario_nao_identificado WHERE inventario_id IN (${INVENTARIOS_DE_TESTE})`).n,
  saidas: q1(`SELECT COUNT(*) n FROM saidas_sem_faturamento WHERE inventario_id IN (${INVENTARIOS_DE_TESTE})`).n,
  eventos: q1(`SELECT COUNT(*) n FROM inventario_eventos WHERE inventario_id IN (${INVENTARIOS_DE_TESTE})`).n,
  movimentosDeInventario: q1("SELECT COUNT(*) n FROM movimentos WHERE origem = 'inventario'").n,
  movimentosQueCitam: q1("SELECT COUNT(*) n FROM movimentos WHERE obs LIKE '%nventário #%' OR obs LIKE '%nventario #%'").n,
  contagens: q(`SELECT inventario_id, COUNT(*) n, SUM(contado) pecas FROM inventario_contagem
                 WHERE inventario_id IN (${INVENTARIOS_DE_TESTE}) GROUP BY inventario_id`),
};
for (const k of ['resultado', 'itensAntigos', 'naoIdentificado', 'saidas', 'eventos', 'movimentosDeInventario', 'movimentosQueCitam']) {
  if (dependencias[k]) parar(`inventário de teste tem dependência real: ${k} = ${dependencias[k]}`);
}
/* O que o SQL confere em PRODUÇÃO antes de escrever: os ids são exatamente
   os auditados, e nenhuma dependência nasceu entre o export e a aplicação. */
const lista = INVENTARIOS_DE_TESTE.join(',');
const guardas = [
  `(SELECT COUNT(*) FROM inventarios WHERE id IN (${lista})) = ${INVENTARIOS_DE_TESTE.length}`,
  `(SELECT COALESCE(MAX(id),0) FROM inventarios) = ${Math.max(...INVENTARIOS_DE_TESTE)}`,
  `(SELECT COUNT(*) FROM inventarios WHERE status NOT IN ('cancelado','concluido')) = 0`,
  `(SELECT COUNT(*) FROM inventario_resultado) = 0`,
  `(SELECT COUNT(*) FROM inventario_itens) = 0`,
  `(SELECT COUNT(*) FROM inventario_nao_identificado) = 0`,
  `(SELECT COUNT(*) FROM inventario_eventos) = 0`,
  `(SELECT COUNT(*) FROM saidas_sem_faturamento WHERE inventario_id IS NOT NULL) = 0`,
  `(SELECT COUNT(*) FROM movimentos WHERE origem = 'inventario') = 0`,
  `(SELECT COUNT(*) FROM movimentos) = ${q1('SELECT COUNT(*) n FROM movimentos').n}`,
];
if (args.guardas) writeFileSync(args.guardas, JSON.stringify(guardas, null, 1));

raw.exec('BEGIN');
raw.prepare(`DELETE FROM inventario_contagem WHERE inventario_id IN (${INVENTARIOS_DE_TESTE})`).run();
raw.prepare(`DELETE FROM inventarios WHERE id IN (${INVENTARIOS_DE_TESTE})`).run();
raw.exec('COMMIT');

/* ═══════════════════════════════════════ 2. a planilha "Saiu sem faturar" */
const planilha = JSON.parse(readFileSync(args.planilha, 'utf8'));
const porAba = planilha.reduce((m, l) => ({ ...m, [l.classe]: (m[l.classe] ?? 0) + 1 }), {});
if (porAba.uso_proprio !== 9 || porAba.brinde !== 26 || porAba.perda !== 3) parar('a planilha não tem 9/26/3', porAba);

const VIVO = `JOIN vendas_historico_lotes l ON l.id = i.lote_id AND l.status = 'importado'`;
const linhas = [];
const semRegistro = [];
for (const p of planilha) {
  if (SEM_REGISTRO.has(p.sku)) {
    const existe = q(`SELECT i.id FROM vendas_historico_itens i ${VIVO}
      WHERE (i.sku = ? OR i.sku_base = ?) AND i.cliente_nome_original IN ('Sthefany Marques', 'Inventário')`, p.sku, p.sku);
    const saida = q('SELECT id FROM saidas_sem_faturamento WHERE sku = ?', p.sku);
    if (existe.length || saida.length) parar(`${p.sku} ganhou registro — reavalie`, { existe, saida });
    semRegistro.push(p);
    continue;
  }
  const cand = q(`SELECT i.id, i.data, i.origem_linha, i.cliente_nome_original, rc.id rc, rc.classe_nova
      FROM vendas_historico_itens i ${VIVO}
      JOIN historico_reclassificacao rc ON rc.historico_item_id = i.id AND rc.status = 'aplicada'
     WHERE (i.sku = ? OR i.sku_base = ?) AND i.cliente_nome_original = ?`, p.sku, p.sku, p.pessoa);
  const achada = cand.length === 1 ? cand[0] : cand.find((c) => (c.data ?? null) === (p.data ?? null));
  if (!achada) parar(`${p.sku} (${p.pessoa}, ${p.data ?? 'sem data'}) não tem UMA linha reclassificada`, cand);
  if (p.data && achada.data !== p.data) parar(`${p.sku}: data da planilha ${p.data} ≠ ${achada.data}`);
  /* Custo: o que a planilha dá, quando é número de verdade. Zero ("não lembro
     o custo") e o #NAME? da aba INVENTÁRIO são "não informado". */
  const custo = p.classe === 'perda' || !(Number(p.custo) > 0) ? null : Math.round(Number(p.custo) * 100) / 100;
  linhas.push({ p, item: achada, custo });
}
if (linhas.length + semRegistro.length !== 38) parar('a contagem de linhas não fecha 38');

const resultados = [];
for (const { p, item, custo } of linhas) {
  const r = await api('POST', `/api/historico/reclassificar/${item.id}/corrigir`, {
    classe: p.classe, fonte: FONTE, usuario: USUARIO,
    motivo: 'Classificação dada pela Sthefany na planilha "Saiu sem faturar" (vence a classificação automática).',
    observacao: p.obs ?? null,
    custo,
  });
  if (r.status !== 200 || !r.corpo?.ok) parar(`correção de ${p.sku} falhou`, r);
  resultados.push({
    sku: p.sku, produto: p.produto, data: p.data, item: item.id, linhaPlanilha: item.origem_linha,
    classeAntes: item.classe_nova, classeDepois: p.classe, mudou: item.classe_nova !== p.classe,
    observacao: p.obs ?? null, custo, saidaId: r.corpo.saidaId,
  });
}

/* Idempotência provada na própria cópia: a segunda passada não escreve. */
const antesSegunda = q1('SELECT COUNT(*) n FROM historico_reclassificacao_correcoes').n;
for (const { p, item, custo } of linhas.slice(0, 3)) {
  const r = await api('POST', `/api/historico/reclassificar/${item.id}/corrigir`, {
    classe: p.classe, fonte: FONTE, usuario: USUARIO, motivo: 'repetição', observacao: p.obs ?? null, custo,
  });
  if (!r.corpo?.jaAplicada) parar(`a segunda passada de ${p.sku} escreveu`, r);
}
if (q1('SELECT COUNT(*) n FROM historico_reclassificacao_correcoes').n !== antesSegunda) parar('a segunda passada escreveu');

const depois = await retrato();
if (JSON.stringify(depois.estoque) !== JSON.stringify(antes.estoque)) parar('o estoque mudou', { antes: antes.estoque, depois: depois.estoque });
if (depois.razaoDivergente) parar('a razão abriu');
if (depois.saidas.comBaixa !== antes.saidas.comBaixa) parar('apareceu saída com baixa de estoque');
if (depois.vendasFeitas !== antes.vendasFeitas || depois.faturamentoCrm !== antes.faturamentoCrm) parar('o comercial mudou');

const relatorio = {
  inventariosDeTeste: { apagados: invs.map((i) => ({ id: i.id, status: i.status, iniciado: i.iniciado_em, pausado: i.pausado_em, fim: i.concluido_em })), dependencias, guardas },
  saidas: {
    corrigidas: resultados.filter((r) => r.mudou),
    anotadas: resultados.filter((r) => !r.mudou).length,
    semRegistro: semRegistro.map((p) => ({ sku: p.sku, produto: p.produto, data: p.data, obs: p.obs })),
  },
  antes, depois,
};
if (args.relatorio) writeFileSync(args.relatorio, JSON.stringify(relatorio, null, 1));
console.log(JSON.stringify({
  apagados: INVENTARIOS_DE_TESTE, contagensApagadas: dependencias.contagens,
  corrigidas: relatorio.saidas.corrigidas.map((r) => `${r.sku} ${r.classeAntes}→${r.classeDepois}`),
  anotadas: relatorio.saidas.anotadas, semRegistro: relatorio.saidas.semRegistro.map((s) => s.sku),
  antes: { porMotivo: antes.porMotivo, estoque: antes.estoque, inventarios: antes.inventarios },
  depois: { porMotivo: depois.porMotivo, estoque: depois.estoque, inventarios: depois.inventarios },
}, null, 1));
