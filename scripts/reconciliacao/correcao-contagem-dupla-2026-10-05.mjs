#!/usr/bin/env node
/** Auditoria de TODOS os códigos tocados pelo go-live e correção do que a
 *  prova sustenta — 05/10/2026, sobre uma CÓPIA do banco de produção.
 *
 *  O caso que abriu: o anel 256359 aparece com 8 no total e a Sthefany
 *  comprou 7. A razão explica o 8 inteiro: entrada 7 (21/08) + ajuste +1 do
 *  go-live (26/09, "planilha diz 8, sistema tinha 7"). O "8" do go-live era
 *  `planilha (7) + Anexos I (0) + maleta que fica (1, a da Luciana)` — mas a
 *  coluna "Estoque atual" da `Estoque (1).xlsx` NÃO era o que estava em casa:
 *  era o TOTAL, já com a peça da maleta dentro. A peça foi somada duas vezes.
 *
 *  A correção de 28/09 (`correcao-contagem-dupla-2026-09-28`) só pegou o
 *  código cujo ajuste era IGUAL ao que estava nas maletas novas #16–#18. Os
 *  que tinham peça na maleta da Luciana (#15) — sozinha ou junto com #16–#18
 *  — ficaram de fora, porque o ajuste deles era maior que a maleta nova.
 *
 *  A PROVA, por código (as três têm de valer):
 *    1. a planilha diz EXATAMENTE o total que o sistema tinha antes do
 *       go-live (`planilha == Σ movimentos anteriores ao ajuste`) — ela era
 *       um total, não uma contagem da casa;
 *    2. o ajuste do go-live é EXATAMENTE a soma das peças que estavam em
 *       maleta (#15 + #16–#18) — nada além da maleta explica o ajuste;
 *    3. o excesso que sobrou (ajuste + correção de 28/09) é > 0.
 *  Como população: dos 90 códigos da maleta #15, 86 têm planilha == total
 *  anterior; dos 460 códigos sem maleta, 422 também — a planilha era o total.
 *  E o primeiro caso foi confirmado no físico pela Sthefany (comprou 7).
 *
 *  O que NÃO se corrige aqui (vai para revisão humana / inventário):
 *    · provável erro: peça cadastrada no go-live com planilha + maleta — a
 *      planilha provavelmente já contava a peça da maleta, mas não há total
 *      anterior para provar;
 *    · inconclusivo: planilha ≠ total anterior (contagem real diferente);
 *    · código cuja razão separa por aro — a correção exigiria dizer de qual
 *      aro (regra 2).
 *
 *  Toda escrita passa pela rota real `POST /api/produtos/:sku/ajustar-estoque`
 *  (§54), com motivo "Correção de cadastro" e a observação da prova. A
 *  diferença vai para produção como SQL revisável (`diferenca-sql.mjs`).
 *
 *    node scripts/reconciliacao/correcao-contagem-dupla-2026-10-05.mjs \
 *      --banco <copia.sqlite> --planilha "<Estoque (1).xlsx>" \
 *      --relatorio <saida.json> --csv <saida.csv> [--guardas guardas.json] [--seco]
 */
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const XLSX = createRequire(path.join(RAIZ, 'src/package.json'))('xlsx');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.banco || !args.planilha) {
  console.error('uso: --banco <copia.sqlite> --planilha <Estoque (1).xlsx> [--relatorio r.json] [--csv r.csv] [--guardas g.json] [--seco]');
  process.exit(2);
}
const parar = (msg, extra) => { console.error(`PAROU: ${msg}`, extra ?? ''); process.exit(1); };

const raw = new DatabaseSync(args.banco);
const q = (sql, ...a) => raw.prepare(sql).all(...a);
const q1 = (sql, ...a) => raw.prepare(sql).get(...a) ?? null;
const mapa = (sql) => new Map(q(sql).map((r) => [r.k, Number(r.v)]));

/* ── a planilha do go-live, consolidada pela base do código (como o go-live fez) */
const wb = XLSX.readFile(args.planilha);
const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(1);
const planilha = new Map();
for (const l of linhas) {
  if (l[0] == null || l[0] === '') continue;
  const base = String(l[0]).trim().replace(/-\d+$/, '');
  planilha.set(base, (planilha.get(base) ?? 0) + Number(l[2]));
}
if (planilha.size !== 956 || [...planilha.values()].reduce((s, n) => s + n, 0) !== 2064) {
  parar('a planilha não é a do go-live (956 códigos, 2064 peças)', { codigos: planilha.size });
}

/* ── os marcos da razão. Achados pelo TEXTO, conferidos pela contagem. */
const golive = q(`SELECT MIN(id) a, MAX(id) b, COUNT(*) n FROM movimentos
  WHERE tipo = 'ajuste' AND obs LIKE 'Estoque total (Estoque (1).xlsx casa + Anexos I, 26/09/2026)%'`)[0];
const c28 = q(`SELECT MIN(id) a, MAX(id) b, COUNT(*) n FROM movimentos
  WHERE tipo = 'ajuste' AND obs LIKE 'Estoque total (Correção 28/09: contagem dupla do go-live%'`)[0];
if (golive.n !== 337 || c28.n !== 186) parar('os marcos do go-live não são os auditados', { golive, c28 });
/* A marca é a do `diferenca-sql.mjs` (a linha-marca de idempotência). Este
   programa não grava marca própria: uma segunda linha em `config` mudaria a
   contagem que a precondição do SQL confere. */
const jaAplicada = q1(`SELECT valor FROM config WHERE chave = 'reconciliacao:correcao-contagem-dupla-2026-10-05'`);
if (jaAplicada) parar('esta correção já foi aplicada neste banco', jaAplicada);

const T_PRE = mapa(`SELECT sku k, SUM(qtd) v FROM movimentos WHERE id < ${golive.a} GROUP BY sku`);
const AJ = mapa(`SELECT sku k, SUM(qtd) v FROM movimentos WHERE id BETWEEN ${golive.a} AND ${golive.b}
  AND obs LIKE 'Estoque total (Estoque (1).xlsx%' GROUP BY sku`);
const C28 = mapa(`SELECT sku k, SUM(qtd) v FROM movimentos WHERE id BETWEEN ${c28.a} AND ${c28.b}
  AND obs LIKE 'Estoque total (Correção 28/09%' GROUP BY sku`);
const NOVO = mapa(`SELECT sku k, SUM(qtd) v FROM movimentos WHERE tipo = 'entrada'
  AND obs = 'Saldo inicial do cadastro de peças novas' AND date(criado_em) = '2026-09-26' GROUP BY sku`);
/* Maleta da Luciana (#15) e as três do Anexo I (#16–#18): o que estava nelas
   NO go-live. A #15 segue aberta, e nada entrou nela depois de 01/09. */
const lucianaPosGolive = q1(`SELECT COUNT(*) n FROM movimentos WHERE maleta_id = 15 AND tipo = 'consignacao'
  AND criado_em >= '2026-09-26'`).n;
if (lucianaPosGolive) parar('entrou peça na maleta #15 depois do go-live — reavalie a conta da maleta');
const M15 = mapa(`SELECT sku k, SUM(qtd) v FROM maleta_itens WHERE maleta_id = 15 GROUP BY sku`);
const M16 = mapa(`SELECT sku k, SUM(qtd) v FROM maleta_itens WHERE maleta_id IN (16,17,18) GROUP BY sku`);
const CONSIG = mapa(`SELECT mi.sku k, SUM(mi.qtd - mi.devolvida) v FROM maleta_itens mi JOIN maletas m ON m.id = mi.maleta_id
  WHERE m.status IN ('aberta','em_acerto') GROUP BY mi.sku`);
const IDENT = new Set(q(`SELECT DISTINCT pv.sku k FROM produto_variacoes pv WHERE COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo
  WHERE mo.sku = pv.sku AND (mo.variante_id = pv.variante_id OR (mo.variante_id IS NULL AND mo.variacao = pv.nome))), 0) <> 0`)
  .map((r) => r.k));
const CONFIRMADO_NO_FISICO = {
  256359: 'a Sthefany comprou 7 (05/10/2026)',
  127513: 'a Sthefany tem 3: 1 em casa + 2 com revendedoras (28/09/2026)',
};

const g = (m, k) => m.get(k) ?? 0;
const relatorio = [];
for (const p of q('SELECT sku, desc, qtd FROM produtos ORDER BY sku')) {
  const k = p.sku;
  const aj = g(AJ, k); const c = g(C28, k); const novo = g(NOVO, k);
  if (!aj && !c && !novo) continue;
  const P = planilha.has(k) ? planilha.get(k) : null;
  const tPre = g(T_PRE, k); const m15 = g(M15, k); const m16 = g(M16, k);
  const cons = m15 + m16; const excesso = aj + c;
  let classe; let recomendacao; let correcao = 0;
  if (novo && P !== null && cons > 0) {
    classe = 'provável erro';
    recomendacao = `peça cadastrada no go-live com planilha ${P} + maleta ${cons}; se a planilha já contava a maleta, há ${cons} a mais. Conferir no inventário.`;
  } else if (novo) {
    classe = 'correto';
    recomendacao = 'peça cadastrada no go-live sem maleta somada';
  } else if (P !== null && P === tPre && aj > 0 && aj === cons && excesso > 0) {
    if (IDENT.has(k)) {
      classe = 'provável erro';
      recomendacao = `prova completa (excesso ${excesso}), mas a razão separa por aro: diga de qual aro antes de corrigir (regra 2).`;
    } else if (p.qtd - excesso < g(CONSIG, k)) {
      classe = 'inconclusivo';
      recomendacao = `corrigir ${-excesso} deixaria o total abaixo do que está com revendedoras (${g(CONSIG, k)}).`;
    } else {
      classe = 'comprovadamente errada';
      correcao = -excesso;
      recomendacao = `planilha ${P} = total do sistema antes do go-live; ajuste +${aj} = peças em maleta (#15: ${m15}, #16–18: ${m16}). Corrigir ${correcao}.`;
    }
  } else if (P !== null && P === tPre && excesso === 0) {
    classe = 'correto';
    recomendacao = c ? 'já corrigido em 28/09' : 'o go-live não mudou o total';
  } else if (aj && cons > 0) {
    classe = 'inconclusivo';
    recomendacao = `planilha ${P ?? '—'}, total antes ${tPre}, maleta ${cons}: a diferença não é só a maleta. Contar no inventário.`;
  } else {
    classe = 'inconclusivo';
    recomendacao = `ajuste da planilha sem peça em maleta (planilha ${P ?? '—'}, total antes ${tPre}). Não é contagem dupla; conferir no inventário.`;
  }
  relatorio.push({
    sku: k, produto: p.desc, saldo_atual: p.qtd, em_casa: p.qtd - g(CONSIG, k), com_revendedoras: g(CONSIG, k),
    maleta15: m15, maletas16_18: m16, sistema_antes_golive: tPre, planilha: P,
    ajuste_golive: aj, correcao_2809: c, saldo_calculado: classe === 'comprovadamente errada' ? p.qtd + correcao : '',
    diferenca: correcao, movimento_suspeito: aj ? `ajuste importacao 26/09 ${aj > 0 ? '+' : ''}${aj}` : (novo ? `entrada go-live ${novo}` : ''),
    data: '2026-09-26', origem: "Estoque (1).xlsx casa + Anexos I (reconciliar-fonte-operacional.mjs)",
    classe, confirmado_no_fisico: CONFIRMADO_NO_FISICO[k] ?? '', recomendacao,
  });
}

const porClasse = relatorio.reduce((acc, r) => {
  acc[r.classe] ??= { codigos: 0, pecas: 0 };
  acc[r.classe].codigos += 1; acc[r.classe].pecas += Math.abs(r.diferenca);
  return acc;
}, {});
for (const k of Object.keys(CONFIRMADO_NO_FISICO)) {
  const r = relatorio.find((x) => x.sku === k);
  if (!r || r.classe !== 'comprovadamente errada') parar(`o caso confirmado no físico ${k} não passou na prova`, r);
}

/* ── aplicar pela rota real, sobre a cópia */
const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run, executar: st.executar });
  st.bind = (...a) => comArgs(a.map((v) => (v === undefined ? null : v)));
  st.first = async function (col) { const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes ?? 0) } }; };
  st.executar = function () { return raw.prepare(this.sql).run(...this.args); };
  return st;
};
const DB = {
  prepare: preparar,
  async batch(stmts) {
    raw.exec('BEGIN');
    try { const r = stmts.map((x) => x.executar()); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; }
  },
};
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

const retrato = () => q1(`SELECT (SELECT SUM(qtd) FROM produtos) total, (SELECT COUNT(*) FROM movimentos) movimentos,
  (SELECT COALESCE(MAX(id),0) FROM movimentos) maxMov,
  (SELECT COUNT(*) FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
    WHERE p.qtd <> COALESCE(m.s, 0)) razaoDivergente`);
const antes = retrato();
if (antes.razaoDivergente) parar('a razão já está aberta na cópia', antes);

const alvos = relatorio.filter((r) => r.classe === 'comprovadamente errada');
const aplicados = [];
if (!args.seco) {
  for (const r of alvos) {
    const obs = `Contagem dupla do go-live (26/09): a planilha Estoque (1).xlsx já era o total (${r.planilha}), `
      + `e o ajuste +${r.ajuste_golive} somou de novo as peças em maleta`
      + (r.correcao_2809 ? ` (28/09 já tirou ${-r.correcao_2809})` : '')
      + `. Auditoria de 05/10/2026${r.confirmado_no_fisico ? `; ${r.confirmado_no_fisico}` : ''}.`;
    const resp = await api('POST', `/api/produtos/${encodeURIComponent(r.sku)}/ajustar-estoque`, {
      quantidadeAtual: r.saldo_atual, quantidadeCorreta: r.saldo_atual + r.diferenca,
      motivo: 'correcao_cadastro', observacao: obs.slice(0, 300),
    });
    if (resp.status !== 200 || !resp.corpo?.ok) parar(`ajuste recusado em ${r.sku}`, resp);
    aplicados.push({ sku: r.sku, de: resp.corpo.de, para: resp.corpo.para });
  }
}
const depois = retrato();
if (depois.razaoDivergente) parar('a razão abriu depois da correção', depois);
const conferir = await api('GET', '/api/estoque/conferir');
if (!conferir.corpo?.ok) parar('/api/estoque/conferir não voltou vazio', conferir.corpo);

const pecas = alvos.reduce((s, r) => s + r.diferenca, 0);
if (!args.seco && depois.total !== antes.total + pecas) parar('o total não mudou exatamente o corrigido', { antes, depois, pecas });

if (args.guardas) {
  /* O que o SQL confere em PRODUÇÃO antes de escrever: o saldo de CADA
     código corrigido é o que foi auditado, e nenhuma maleta mudou. */
  const guardas = [
    ...alvos.map((r) => `(SELECT qtd FROM produtos WHERE sku = '${r.sku}') = ${r.saldo_atual}`),
    `(SELECT COUNT(*) FROM maleta_itens) = ${q1('SELECT COUNT(*) n FROM maleta_itens').n}`,
    `(SELECT COALESCE(SUM(devolvida),0) FROM maleta_itens) = ${q1('SELECT COALESCE(SUM(devolvida),0) n FROM maleta_itens').n}`,
    `(SELECT COUNT(*) FROM inventarios WHERE status = 'aberto') = 0`,
  ];
  writeFileSync(args.guardas, JSON.stringify(guardas, null, 2));
}

const saida = {
  geradoEm: new Date().toISOString(), seco: !!args.seco,
  marcos: { golive, correcao2809: c28 },
  porClasse, antes, depois, pecasCorrigidas: pecas, codigosCorrigidos: aplicados.length,
  confirmadosNoFisico: CONFIRMADO_NO_FISICO, relatorio,
};
if (args.relatorio) writeFileSync(args.relatorio, JSON.stringify(saida, null, 2));
if (args.csv) {
  const cols = Object.keys(relatorio[0]);
  const esc = (v) => (/[;"\n]/.test(String(v ?? '')) ? `"${String(v ?? '').replace(/"/g, '""')}"` : String(v ?? ''));
  writeFileSync(args.csv, '﻿' + [cols.join(';'), ...relatorio.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n'));
}
console.log(JSON.stringify({ porClasse, antes, depois, pecasCorrigidas: pecas, codigosCorrigidos: aplicados.length }, null, 2));
