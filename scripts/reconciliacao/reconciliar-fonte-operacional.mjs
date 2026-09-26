#!/usr/bin/env node
/** Reconciliação das fontes operacionais reais com o banco — 26/09/2026.
 *
 *  Fontes (entregues pelo dono, fora do repositório — têm nome e CPF):
 *
 *    Estoque (1).xlsx                     o que está FISICAMENTE em casa
 *    Anexo I do contrato - <nome>.xlsx    o conteúdo físico da maleta de hoje
 *    Vendas.xlsx                          o histórico de vendas, 1 a 1463
 *
 *  O que este programa NÃO é: um importador paralelo. Toda escrita passa
 *  pelas rotas reais do Worker (`api/src/index.js`), chamadas em processo,
 *  sobre um SQLite que é CÓPIA do banco de produção. Nada aqui fala com a
 *  nuvem, com o D1 remoto ou com a Nuvemshop — não por disciplina, por
 *  ausência de binding. O resultado é um banco reconciliado e um relatório;
 *  levar a diferença para produção é outro passo (`diferenca-sql.mjs`).
 *
 *  A ordem é a única que funciona sem consumir estoque de casa:
 *
 *    1. histórico     trocar a planilha (as decisões atravessam a troca)
 *    2. acertos       acerto documental das maletas acertadas fora
 *    3. maletas       encerrar as maletas antigas pelo acerto documental
 *    4. duplicatas    venda do sistema que a planilha repete, vinculada
 *    5. cobranças     venda NÃO PAGA da planilha vira conta a receber
 *    6. saídas        linha que não é venda sai do faturamento (§30)
 *    7. peças novas   o que está em casa ou em maleta e não tem cadastro
 *    8. totais        total = casa + maleta nova + maleta que fica (Luciana)
 *    9. maletas novas o Anexo I consigna do disponível
 *   10. prova         a planilha de casa, lida em modo casa, não muda nada
 *
 *  Idempotente: rodar sobre um banco já reconciliado chega ao passo 10 sem
 *  escrever uma linha. Cada passo que encontra o trabalho feito diz isso.
 *
 *  Uso:
 *    node scripts/reconciliacao/reconciliar-fonte-operacional.mjs \
 *      --banco <copia.sqlite> --fontes <pasta> --relatorio <saida.json> [--hoje AAAA-MM-DD]
 */
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const XLSX = createRequire(path.join(RAIZ, 'src/package.json'))('xlsx');
const { categoriaPeloNome } = await import(pathToFileURL(path.join(RAIZ, 'api/src/categoria-nome.js')).href);

/* ─────────────────────────────────────────────────────────────── argumentos */
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.banco || !args.fontes) {
  console.error('uso: --banco <copia.sqlite> --fontes <pasta> [--relatorio saida.json] [--hoje AAAA-MM-DD]');
  process.exit(2);
}
const HOJE = args.hoje || new Date().toISOString().slice(0, 10);
const FONTE = 'Reconciliação das fontes operacionais de 26/09/2026';

/* Os controles de sanidade que o dono conferiu à mão. Não substituem a
   leitura do arquivo: se o arquivo disser outra coisa, o programa para. */
const CONTROLES = {
  estoque: { linhas: 964, unidades: 2064 },
  anexos: {
    'Bruna Follei': { pecas: 92, skus: 92 },
    'Evelyn Veiga': { pecas: 84, skus: 84 },
    'Graciele Muniz': { pecas: 123, skus: 121, repetidos: { 426579: 2, 155147: 2 } },
  },
  vendas: { registros: 1463, ultimo: 1463 },
  preservar: ['Luciana Souza'],
};

class Parada extends Error {}
const parar = (msg, extra) => { const e = new Parada(msg); e.extra = extra; throw e; };

/* ────────────────────────────────────────────────── o banco e o Worker real */
const raw = new DatabaseSync(args.banco);
raw.exec('PRAGMA foreign_keys = ON;');
const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.bind = (...a) => comArgs(a);
  st.first = async function (col) {
    const l = raw.prepare(this.sql).get(...this.args) ?? null;
    return col && l ? l[col] : l;
  };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () {
    const r = raw.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(r.changes ?? 0) } };
  };
  return st;
};
/* O batch do D1 é atômico; o do ensaio também precisa ser, senão o ensaio
   provaria um comportamento que produção não tem. */
const DB = {
  prepare: preparar,
  async batch(stmts) {
    raw.exec('BEGIN');
    try {
      const saida = [];
      for (const s of stmts) saida.push(await s.run());
      raw.exec('COMMIT');
      return saida;
    } catch (e) {
      raw.exec('ROLLBACK');
      throw e;
    }
  },
  async exec(sql) { raw.exec(sql); return { count: 0 }; },
};
const { default: worker } = await import(pathToFileURL(path.join(RAIZ, 'api/src/index.js')).href);
const CHAVE = 'reconciliador-local';
const env = { DB, API_KEY: CHAVE };
async function api(metodo, caminho, corpo) {
  const r = await worker.fetch(new Request(`http://reconciliador.local${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), env);
  return { status: r.status, corpo: await r.json().catch(() => null) };
}
const q = (sql, ...a) => raw.prepare(sql).all(...a);
const q1 = (sql, ...a) => raw.prepare(sql).get(...a) ?? null;

/* ─────────────────────────────────────────────────────────── ler as fontes */
const skuTexto = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(typeof v === 'number' ? Math.trunc(v) : v).replace(/\s+/g, '').toUpperCase();
  return s || null;
};
const baseDe = (sku) => sku.replace(/-\d+$/, '');
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function lerPlanilha(arquivo) {
  const wb = XLSX.read(readFileSync(arquivo), { type: 'buffer', cellDates: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, blankrows: false });
}
const arquivos = readdirSync(args.fontes);
const achar = (re) => {
  const a = arquivos.filter((f) => re.test(f));
  if (a.length !== 1) parar(`Esperava um arquivo para ${re}, achei ${a.length}.`, a);
  return path.join(args.fontes, a[0]);
};

function lerEstoque() {
  const linhas = lerPlanilha(achar(/^Estoque.*\.xlsx$/i));
  const [cab, ...corpo] = linhas;
  if (!/produto/i.test(String(cab[0])) || !/estoque/i.test(String(cab[2]))) parar('Cabeçalho do estoque inesperado.', cab);
  const itens = [];
  for (const l of corpo) {
    const sku = skuTexto(l[0]);
    if (!sku) parar('Linha do estoque sem código.', l);
    if (!/^\d{6}(-\d+)?$/.test(sku)) parar(`Código fora do padrão no estoque: ${sku}`, l);
    const qtd = numero(l[2]);
    if (qtd === null || qtd < 0 || !Number.isInteger(qtd)) parar(`Quantidade inválida para ${sku}.`, l);
    itens.push({ sku, base: baseDe(sku), nome: String(l[1] ?? '').trim(), qtd, preco: numero(l[3]) });
  }
  const casa = new Map();
  const nome = new Map();
  const preco = new Map();
  const consolidados = [];
  for (const it of itens) {
    casa.set(it.base, (casa.get(it.base) ?? 0) + it.qtd);
    if (nome.has(it.base) && nome.get(it.base).toLowerCase() !== it.nome.toLowerCase()) {
      parar(`Sufixo com descrição diferente da base: ${it.sku}`, { base: nome.get(it.base), linha: it.nome });
    }
    if (!nome.has(it.base)) nome.set(it.base, it.nome);
    if (it.preco != null && !preco.has(it.base)) preco.set(it.base, it.preco);
    if (it.sku !== it.base) consolidados.push({ sku: it.sku, base: it.base, qtd: it.qtd });
  }
  return { itens, casa, nome, preco, consolidados };
}

function lerAnexo(arquivo) {
  const linhas = lerPlanilha(arquivo);
  const meta = {
    arquivo: path.basename(arquivo),
    titulo: String(linhas[0]?.[1] ?? '').trim(),
    nome: String(linhas[1]?.[1] ?? '').trim(),
    data: String(linhas[2]?.[1] ?? '').trim(),
    hora: String(linhas[3]?.[1] ?? '').trim(),
  };
  const iCab = linhas.findIndex((l) => l && /c[oó]digo/i.test(String(l[1] ?? '')));
  if (iCab < 0) parar(`Anexo sem cabeçalho de código: ${meta.arquivo}`);
  const pecas = [];
  for (const l of linhas.slice(iCab + 1)) {
    const sku = skuTexto(l[1]);
    if (!sku) continue;
    if (!/^\d{6}$/.test(sku)) parar(`Código fora do padrão no Anexo ${meta.arquivo}: ${sku}`);
    pecas.push({ sku, nome: String(l[2] ?? '').trim(), preco: numero(l[3]) });
  }
  const itens = new Map();
  for (const p of pecas) itens.set(p.sku, (itens.get(p.sku) ?? 0) + 1);
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(meta.data);
  meta.dataIso = m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  return { meta, pecas, itens };
}

function lerVendas() {
  const linhas = lerPlanilha(achar(/^Vendas.*\.xlsx$/i));
  const iCab = linhas.findIndex((l) => l && l.some((c) => String(c ?? '').trim() === 'Nº'));
  if (iCab < 0) parar('Vendas.xlsx sem cabeçalho com Nº.');
  const cab = linhas[iCab];
  const col = (nome) => cab.findIndex((c) => String(c ?? '').trim().toLowerCase().startsWith(nome));
  const cN = col('nº'); const cCli = col('nome do cliente'); const cSku = col('id produto');
  const validas = [];
  const rejeitadas = [];
  for (const l of linhas.slice(iCab + 1)) {
    const n = l[cN];
    const semNada = (l[cCli] === null || String(l[cCli]).trim() === '')
      && (l[cSku] === null || String(l[cSku]).trim() === '');
    /* A linha de modelo do Excel: número, fórmula em #N/A, nenhum cliente e
       nenhum produto. Não é venda — é a planilha pronta para a próxima. */
    if (semNada) { rejeitadas.push({ n, motivo: 'linha de modelo (sem cliente e sem produto)' }); continue; }
    validas.push(l);
  }
  const numeros = validas.map((l) => l[cN]);
  return { linhas: [cab, ...validas], rejeitadas, numeros };
}

/* ───────────────────────────────────────────────────────────────── relatório */
const relatorio = {
  fonte: FONTE, hoje: HOJE, banco: path.basename(args.banco), passos: [], avisos: [], escritas: {},
};
const passo = (nome, dados) => { relatorio.passos.push({ passo: nome, ...dados }); console.log(`\n■ ${nome}`, JSON.stringify(dados).slice(0, 600)); };
const aviso = (texto, dados) => { relatorio.avisos.push({ texto, ...(dados ? { dados } : {}) }); console.log(`  ⚠ ${texto}`); };
const contar = () => q1(`SELECT
    (SELECT COUNT(*) FROM produtos) produtos, (SELECT COALESCE(SUM(qtd),0) FROM produtos) total,
    (SELECT COALESCE(SUM(qtd),0) FROM movimentos) razao, (SELECT COUNT(*) FROM movimentos) movimentos,
    (SELECT COUNT(*) FROM vendas) vendas, (SELECT COUNT(*) FROM maletas) maletas,
    (SELECT COUNT(*) FROM maleta_itens) maleta_itens, (SELECT COUNT(*) FROM clientes) clientes,
    (SELECT COUNT(*) FROM historico_operacoes) operacoes,
    (SELECT COUNT(*) FROM historico_reclassificacao) reclassificacoes,
    (SELECT COUNT(*) FROM vendas_historico_lotes WHERE status='importado') lotes_ativos`);
const consignado = () => new Map(q(`SELECT mi.sku, SUM(mi.qtd - mi.devolvida) fora FROM maleta_itens mi
  JOIN maletas m ON m.id = mi.maleta_id WHERE m.status IN ('aberta','em_acerto') GROUP BY mi.sku`)
  .map((r) => [r.sku, Number(r.fora)]));
const maletaAberta = (revId) => q(`SELECT * FROM maletas WHERE rev_id = ? AND status IN ('aberta','em_acerto') ORDER BY id`, revId);
const itensDaMaleta = (id) => new Map(q('SELECT sku, qtd - devolvida AS q FROM maleta_itens WHERE maleta_id = ?', id)
  .filter((r) => Number(r.q) > 0).map((r) => [r.sku, Number(r.q)]));
const somaMapa = (m) => [...m.values()].reduce((s, v) => s + v, 0);
const mapaIgual = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

try {
  /* ═══════════════════════════════════════════════════════════ 0. as fontes */
  const est = lerEstoque();
  const anexos = {};
  for (const nome of Object.keys(CONTROLES.anexos)) {
    const primeiro = nome.split(' ')[0];
    anexos[nome] = lerAnexo(achar(new RegExp(`^Anexo I.*${primeiro}.*\\.xlsx$`, 'i')));
  }
  const ven = lerVendas();

  const unidadesCasa = est.itens.reduce((s, i) => s + i.qtd, 0);
  if (est.itens.length !== CONTROLES.estoque.linhas || unidadesCasa !== CONTROLES.estoque.unidades) {
    parar('Estoque não bate com a conferência do dono.', { linhas: est.itens.length, unidades: unidadesCasa });
  }
  for (const [nome, c] of Object.entries(CONTROLES.anexos)) {
    const a = anexos[nome];
    if (a.pecas.length !== c.pecas || a.itens.size !== c.skus) {
      parar(`Anexo de ${nome} não bate com a conferência.`, { pecas: a.pecas.length, skus: a.itens.size });
    }
    for (const [sku, n] of Object.entries(c.repetidos ?? {})) {
      if (a.itens.get(sku) !== n) parar(`Anexo de ${nome}: ${sku} deveria ter ${n} peças.`);
    }
    if (a.meta.nome.toLowerCase() !== nome.toLowerCase()) parar(`O Anexo diz ${a.meta.nome}, esperava ${nome}.`);
  }
  const maxN = Math.max(...ven.numeros);
  if (ven.numeros.length !== CONTROLES.vendas.registros || maxN !== CONTROLES.vendas.ultimo
      || new Set(ven.numeros).size !== ven.numeros.length) {
    parar('Vendas.xlsx não bate com a conferência.', { registros: ven.numeros.length, ultimo: maxN });
  }
  passo('0. fontes lidas', {
    estoque: { linhas: est.itens.length, unidades: unidadesCasa, codigos: est.casa.size, sufixosConsolidados: est.consolidados },
    anexos: Object.fromEntries(Object.entries(anexos).map(([n, a]) => [n, {
      pecas: a.pecas.length, skus: a.itens.size, valor: a.pecas.reduce((s, p) => s + (p.preco ?? 0), 0), cabecalho: a.meta,
    }])),
    vendas: { registros: ven.numeros.length, ultimo: maxN, rejeitadas: ven.rejeitadas.length, faixaRejeitada: [ven.rejeitadas[0]?.n, ven.rejeitadas.at(-1)?.n] },
  });
  relatorio.fontes = { rejeitadasVendas: ven.rejeitadas };

  const revs = new Map(q('SELECT id, nome, status FROM revendedoras').map((r) => [r.nome, r]));
  for (const nome of [...Object.keys(anexos), ...CONTROLES.preservar]) {
    if (!revs.has(nome)) parar(`Revendedora ${nome} não existe no banco.`);
  }

  /* ════════════════════════════════════════════════════════════ o "antes" */
  const antes = contar();
  const lucianaId = revs.get('Luciana Souza').id;
  const lucianaMaletas = maletaAberta(lucianaId);
  const retratoLuciana = () => JSON.stringify(q(`SELECT m.id, m.status, m.aberta_em, m.acerto_em, mi.sku, mi.qtd, mi.devolvida, mi.preco_envio
     FROM maletas m JOIN maleta_itens mi ON mi.maleta_id = m.id WHERE m.rev_id = ? ORDER BY m.id, mi.sku`, lucianaId));
  const lucianaAntes = retratoLuciana();
  const outrasAbertas = q(`SELECT m.id, r.nome FROM maletas m JOIN revendedoras r ON r.id = m.rev_id
     WHERE m.status IN ('aberta','em_acerto')`).filter((m) => !Object.keys(anexos).includes(m.nome) && m.nome !== 'Luciana Souza');
  if (outrasAbertas.length) parar('Há maleta aberta de revendedora sem fonte nesta rodada.', outrasAbertas);
  const conferirAntes = await api('GET', '/api/estoque/conferir');
  if (JSON.stringify(conferirAntes.corpo?.divergentes) !== '[]') parar('A razão já chega aberta.', conferirAntes.corpo);
  passo('antes', { contagens: antes, luciana: { maletas: lucianaMaletas.map((m) => m.id), pecas: somaMapa(itensDaMaleta(lucianaMaletas[0]?.id ?? 0)) } });

  /* ═════════════════════════════════════════════════════ 1. o histórico */
  const troca = await api('POST', '/api/vendas/historico/substituir', { arquivo: 'Vendas.xlsx', linhas: ven.linhas });
  if (troca.corpo?.jaImportado) {
    passo('1. histórico', { acao: 'nenhuma — esta planilha já é a que está no ar', lote: troca.corpo.jaImportado });
  } else if (!troca.corpo?.ok) {
    parar('A troca do histórico foi recusada.', troca.corpo);
  } else if (troca.corpo.limpezaPendente) {
    parar('A troca entrou, mas o lote antigo não pôde ser limpo.', troca.corpo.limpezaPendente);
  } else {
    passo('1. histórico', {
      lote: troca.corpo.loteId, antes: troca.corpo.antes, depois: troca.corpo.depois, delta: troca.corpo.delta,
      decisoes: troca.corpo.decisoes, conferencia: troca.corpo.conferencia,
    });
  }
  const lote = q1("SELECT id FROM vendas_historico_lotes WHERE status='importado'").id;
  const semNome = q(`SELECT origem_linha, sku, nome_produto_historico FROM vendas_historico_itens
      WHERE lote_id = ? AND CAST(origem_linha AS INTEGER) IN (592, 593, 946)`, lote);
  relatorio.linhasComNomeQuebrado = semNome.map((l) => ({
    ...l, nomeNoCatalogo: q1('SELECT desc FROM produtos WHERE sku = ?', l.sku)?.desc ?? null,
  }));
  relatorio.datasIrregulares = q(`SELECT origem_linha, data_original, data FROM vendas_historico_itens
      WHERE lote_id = ? AND (data IS NULL OR data_original LIKE '%/%') ORDER BY CAST(origem_linha AS INTEGER)`, lote);

  /* ══════════════════════════════════════ 2 e 3. acertos feitos fora do sistema */
  const acertosAplicados = [];
  for (const nome of Object.keys(anexos)) {
    const rev = revs.get(nome);
    const abertas = maletaAberta(rev.id);
    const anexo = anexos[nome];
    const destaRodada = abertas.filter((m) => !mapaIgual(itensDaMaleta(m.id), anexo.itens));
    if (!destaRodada.length) { acertosAplicados.push({ nome, acao: 'nenhuma — não há maleta antiga aberta' }); continue; }
    if (destaRodada.length > 1) parar(`${nome} tem mais de uma maleta antiga aberta.`, destaRodada.map((m) => m.id));
    const maleta = destaRodada[0];
    const itensMaleta = itensDaMaleta(maleta.id);
    const inicio = q1('SELECT MIN(date(criado_em)) d FROM movimentos WHERE maleta_id = ?', maleta.id)?.d ?? maleta.aberta_em;
    const primeiro = rev.nome.split(' ')[0].toLowerCase();
    /* A venda histórica do acerto: da revendedora (pelo primeiro nome), com
       desconto "Revendedora", e cujas peças TODAS saíram desta maleta. */
    const candidatas = q(`SELECT vh.chave, vh.data, vh.pecas, vh.cliente_nome_norm FROM vendas_historicas vh
        WHERE vh.lote_id = ? AND vh.classe = 'venda' AND vh.cliente_nome_norm LIKE ?`, lote, `${primeiro} %`)
      .filter((v) => {
        const its = q(`SELECT sku_base, qtd, desconto_original FROM vendas_historico_itens
            WHERE lote_id = ? AND pedido_chave = ?`, lote, v.chave);
        return its.length > 0
          && its.every((i) => /revendedora/i.test(String(i.desconto_original ?? '')) && itensMaleta.has(String(i.sku_base)));
      });
    if (candidatas.length !== 1) {
      parar(`Acerto de ${nome}: esperava uma venda histórica que feche com a maleta ${maleta.id}, achei ${candidatas.length}.`, candidatas);
    }
    const v = candidatas[0];
    const its = q(`SELECT sku_base, qtd, preco_unit, valor_total, origem_linha FROM vendas_historico_itens
        WHERE lote_id = ? AND pedido_chave = ?`, lote, v.chave);
    const vendidas = {};
    for (const i of its) vendidas[i.sku_base] = (vendidas[i.sku_base] ?? 0) + Number(i.qtd);
    for (const [sku, n] of Object.entries(vendidas)) {
      if (n > (itensMaleta.get(sku) ?? 0)) parar(`Acerto de ${nome}: vendeu ${n} de ${sku}, a maleta tinha ${itensMaleta.get(sku)}.`);
    }
    const bruto = Math.round(its.reduce((s, i) => s + Number(i.preco_unit) * Number(i.qtd), 0) * 100);
    const liquido = Math.round(its.reduce((s, i) => s + Number(i.valor_total), 0) * 100);
    if (!(bruto >= liquido)) parar(`Acerto de ${nome}: líquido maior que o bruto.`);
    if (v.cliente_nome_norm !== rev.nome.toLowerCase()) {
      aviso(`A planilha chama a revendedora de "${v.cliente_nome_norm}"; o cadastro é "${rev.nome}". `
        + 'A identidade é provada pelas peças: todas saíram da maleta dela.', { chave: v.chave, maleta: maleta.id });
    }
    const operacao = {
      vendaChave: v.chave, papel: 'acerto', revendedoraId: rev.id, pecas: Number(v.pecas),
      brutoCentavos: bruto, comissaoCentavos: bruto - liquido, liquidoCentavos: liquido,
      evidencia: {
        fonte: 'Vendas.xlsx', reconciliacao: FONTE, maleta: maleta.id,
        linhas: its.map((i) => String(i.origem_linha)),
        criterio: 'todas as peças da venda saíram da maleta; desconto "Revendedora"; bruto = preço × qtd; líquido = valor total',
      },
    };
    const previa = await api('POST', '/api/vendas/historico/operacoes', { operacoes: [operacao], seco: true });
    if (previa.status !== 200) parar(`Prévia do acerto de ${nome} recusada.`, previa.corpo);
    const gravado = await api('POST', '/api/vendas/historico/operacoes', { operacoes: [operacao], planoEsperado: previa.corpo.planoHash });
    if (gravado.status !== 200) parar(`Acerto documental de ${nome} recusado.`, gravado.corpo);

    const devolvidas = {};
    for (const [sku, n] of itensMaleta) if (n - (vendidas[sku] ?? 0) > 0) devolvidas[sku] = n - (vendidas[sku] ?? 0);
    let data = v.data;
    if (!data || data < inicio) {
      aviso(`A data da venda do acerto de ${nome} (${v.data}) é anterior à própria maleta (${inicio}). `
        + `A venda fica com a data escrita; a maleta encerra na data desta reconciliação (${HOJE}).`, { chave: v.chave });
      data = HOJE;
    }
    const corpo = { vendaChave: v.chave, vendidas, devolvidas, data };
    const seco = await api('POST', `/api/maletas/${maleta.id}/acerto-documental`, { ...corpo, seco: true });
    if (seco.status !== 200) parar(`Encerramento da maleta ${maleta.id} recusado na prévia.`, seco.corpo);
    const fechou = await api('POST', `/api/maletas/${maleta.id}/acerto-documental`, corpo);
    if (fechou.status !== 200) parar(`Encerramento da maleta ${maleta.id} recusado.`, fechou.corpo);
    acertosAplicados.push({
      nome, maleta: maleta.id, vendaChave: v.chave, dataVenda: v.data, encerradaEm: data,
      enviadas: somaMapa(itensMaleta), vendidas: fechou.corpo.plano.vendidas, devolvidas: fechou.corpo.plano.devolvidas,
      brutoReais: bruto / 100, comissaoReais: (bruto - liquido) / 100, liquidoReais: liquido / 100,
      operacao: gravado.corpo,
    });
  }
  passo('2-3. acertos documentais e maletas antigas', { acertos: acertosAplicados });

  /* ═══════════════════════════════════ 4. vendas do sistema que a planilha repete */
  const vinculos = [];
  const naoVinculadas = [];
  const vendasSistema = q(`SELECT v.* FROM vendas v WHERE v.cancelada = 0
      AND NOT EXISTS (SELECT 1 FROM historico_operacao_vendas h WHERE h.venda_id = v.id AND h.status_registro='ativa')
      ORDER BY v.id`);
  const assinatura = (itens) => itens.map((i) => `${String(i.sku).replace(/-\d+$/, '')}x${Number(i.qtd)}`).sort().join(',');
  for (const v of vendasSistema) {
    const itens = q('SELECT sku, qtd, preco FROM venda_itens WHERE venda_id = ?', v.id);
    if (!itens.length) continue;
    const nome = v.origem === 'acerto'
      ? q1('SELECT nome FROM revendedoras WHERE id = ?', v.revendedora_id)?.nome
      : (v.cliente_nome ?? null);
    if (!nome) continue;
    const norm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const sig = assinatura(itens);
    const cand = q(`SELECT vh.chave, vh.data, vh.valor_total, vh.pecas, vh.cliente_nome_norm FROM vendas_historicas vh
        WHERE vh.lote_id = ? AND vh.classe = 'venda' AND vh.cliente_nome_norm = ?`, lote, norm)
      .filter((h) => Math.abs(Number(h.valor_total) - Number(v.total)) < 0.005
        && assinatura(q('SELECT sku_base AS sku, qtd FROM vendas_historico_itens WHERE lote_id = ? AND pedido_chave = ?', lote, h.chave)) === sig);
    if (cand.length !== 1) { naoVinculadas.push({ vendaId: v.id, origem: v.origem, cliente: nome, data: v.data, total: v.total, candidatas: cand.length }); continue; }
    const h = cand[0];
    const existente = q1(`SELECT papel, cobranca_status FROM historico_operacoes WHERE venda_chave = ? AND status_registro='ativa'`, h.chave);
    if (existente) { naoVinculadas.push({ vendaId: v.id, chave: h.chave, motivo: `a venda histórica já tem decisão (${existente.papel})` }); continue; }
    const vinculo = {
      vendaId: v.id, confirmado: true,
      dataDiferenteConfirmada: v.data !== h.data, clienteDiferenteConfirmado: true,
      evidencia: { reconciliacao: FONTE, criterio: 'mesma cliente, mesmos códigos e quantidades, mesmo total', dataSistema: v.data, dataPlanilha: h.data },
    };
    let op;
    if (v.origem === 'acerto') {
      const a = JSON.parse(q1('SELECT acerto_json FROM maletas WHERE id = ?', v.maleta_id)?.acerto_json ?? '{}');
      const bruto = Math.round(Number(a.totalVendido ?? v.total) * 100);
      const comissao = Math.round(Number(a.comissao ?? 0) * 100);
      op = {
        vendaChave: h.chave, papel: 'acerto', revendedoraId: v.revendedora_id, pecas: Number(h.pecas),
        brutoCentavos: bruto, comissaoCentavos: comissao, liquidoCentavos: bruto - comissao,
        evidencia: { reconciliacao: FONTE, representa: `acerto do sistema da maleta ${v.maleta_id}` },
        vendasDuplicadas: [vinculo],
      };
    } else {
      op = { vendaChave: h.chave, papel: 'cliente', evidencia: { reconciliacao: FONTE }, vendasDuplicadas: [vinculo] };
    }
    const previa = await api('POST', '/api/vendas/historico/operacoes', { operacoes: [op], seco: true });
    if (previa.status !== 200) { naoVinculadas.push({ vendaId: v.id, chave: h.chave, recusa: previa.corpo?.erro }); continue; }
    const g = await api('POST', '/api/vendas/historico/operacoes', { operacoes: [op], planoEsperado: previa.corpo.planoHash });
    if (g.status !== 200) parar(`Vínculo da venda ${v.id} recusado depois da prévia.`, g.corpo);
    vinculos.push({ vendaId: v.id, origem: v.origem, chave: h.chave, dataSistema: v.data, dataPlanilha: h.data, total: v.total });
  }
  passo('4. vendas do sistema repetidas na planilha', { vinculadas: vinculos, naoVinculadas });

  /* ═════════════════════════════════════════════ 5. o que a planilha diz NÃO PAGO */
  const abertas = q(`SELECT vh.chave, vh.valor_total, vh.valor_pago, vh.status, vh.data, vh.cliente_nome FROM vendas_historicas vh
      WHERE vh.lote_id = ? AND vh.classe = 'venda' AND vh.status IN ('nao_paga','parcial')
        AND NOT EXISTS (SELECT 1 FROM historico_operacoes ho WHERE ho.venda_chave = vh.chave AND ho.status_registro='ativa')`, lote);
  const cobrancas = [];
  if (abertas.length) {
    const ops = abertas.map((a) => ({
      vendaChave: a.chave, papel: 'cliente', cobrancaStatus: 'aberta',
      valorEfetivoCentavos: Math.round(Number(a.valor_total) * 100),
      valorRecebidoFonteCentavos: Math.round(Number(a.valor_pago ?? 0) * 100),
      evidencia: { fonte: 'Status NÃO PAGO em Vendas.xlsx', reconciliacao: FONTE },
    }));
    const previa = await api('POST', '/api/vendas/historico/operacoes', { operacoes: ops, seco: true });
    if (previa.status !== 200) parar('Prévia das cobranças recusada.', previa.corpo);
    const g = await api('POST', '/api/vendas/historico/operacoes', { operacoes: ops, planoEsperado: previa.corpo.planoHash });
    if (g.status !== 200) parar('Cobranças recusadas.', g.corpo);
    cobrancas.push(...abertas.map((a) => ({ chave: a.chave, data: a.data, cliente: a.cliente_nome, aReceber: +(Number(a.valor_total) - Number(a.valor_pago ?? 0)).toFixed(2) })));
  }
  const indefinidas = q(`SELECT chave, data, valor_total FROM vendas_historicas WHERE lote_id = ? AND status = 'indefinida'`, lote);
  passo('5. cobranças', { criadas: cobrancas, statusIndefinidoNaoCobrado: indefinidas });

  /* ═══════════════════════════════════════════════ 6. linhas que não são venda
     A regra, por extenso, porque é dinheiro:

       1. a linha não tem dinheiro — valor zero, ou a planilha a lançou como
          inventário/ajuste. Sai do faturamento pela classe que o texto dela
          diz (presente/brinde → brinde, sorteio → sorteio, perdido → perda;
          da própria Sthefany sem outro texto → uso próprio).
          "ACHO QUE FOI VENDIDO" é perda por decisão humana (DR-016/P17).
       2. a "cliente" é a própria Sthefany e não há dinheiro registrado
          (valor vazio, ou status que não é PAGO) — uso próprio, ou brinde se
          o texto disser.
       3. a linha 351, "Sorteio (Feira Franceschini)", é sorteio por decisão
          humana registrada (DR-016/P17): a Sthefany confirmou.
       4. TODO o resto — valor positivo marcado PAGO — preserva o faturamento,
          mesmo que o texto diga brinde, presente ou sorteio. É a trava do
          dono: não se apaga faturamento por inferência. Fica listado para
          conferência humana. */
  const candidatasNaoVenda = q(`SELECT h.id, h.origem_linha, h.cliente_nome_original, h.cliente_nome_norm, h.sku, h.valor_total,
         h.pago, h.status_pagamento_original, h.desconto_original, h.observacao_original, vh.classe
       FROM vendas_historico_itens h
       LEFT JOIN vendas_historicas vh ON vh.id = h.venda_historica_id
      WHERE h.lote_id = ?
        AND NOT EXISTS (SELECT 1 FROM historico_reclassificacao rc WHERE rc.historico_item_id = h.id)
        AND (h.cliente_nome_norm = 'sthefany marques' OR h.cliente_nome_norm LIKE 'inventario%'
             OR h.cliente_nome_norm LIKE 'brinde%' OR COALESCE(h.valor_total, -1) = 0
             OR LOWER(COALESCE(h.observacao_original, '') || ' ' || COALESCE(h.desconto_original, '')) LIKE '%sorteio%'
             OR LOWER(COALESCE(h.observacao_original, '') || ' ' || COALESCE(h.desconto_original, '')) LIKE '%brinde%'
             OR LOWER(COALESCE(h.observacao_original, '')) LIKE '%perdid%')
      ORDER BY CAST(h.origem_linha AS INTEGER)`, lote);
  const decisoes = [];
  const preservadas = [];
  for (const c of candidatasNaoVenda) {
    const texto = `${c.desconto_original ?? ''} ${c.observacao_original ?? ''}`.trim();
    const t = texto.toLowerCase();
    const daDona = c.cliente_nome_norm === 'sthefany marques';
    const semDinheiro = Number(c.valor_total ?? -1) === 0 || c.classe === 'ajuste';
    const pagoPositivo = Number(c.valor_total ?? 0) > 0 && c.pago === 1;
    const classePeloTexto = () => (/sorteio/.test(t) ? 'sorteio'
      : /presente|brinde/.test(t) || /^brinde/.test(c.cliente_nome_norm ?? '') ? 'brinde'
        : /perdid|acho que foi vendido/.test(t) || /^inventario/.test(c.cliente_nome_norm ?? '') ? 'perda'
          : daDona ? 'uso_proprio' : null);
    let classe = null;
    let motivo = null;
    if (c.cliente_nome_norm === 'sthefany marques' && String(c.origem_linha) === '351' && /sorteio/.test(t)) {
      classe = 'sorteio';
      motivo = 'confirmado pela Sthefany: foi realmente um sorteio (DR-016/P17)';
    } else if (semDinheiro) {
      classe = classePeloTexto();
      motivo = /acho que foi vendido/.test(t)
        ? 'diferença de inventário confirmada como perda pela Sthefany (DR-016/P17); a frase é observação'
        : `a linha não registra dinheiro (valor zero ou lançada como ${c.classe === 'ajuste' ? 'ajuste' : 'zero'})`;
    } else if (daDona && !pagoPositivo) {
      classe = classePeloTexto();
      motivo = 'a "cliente" é a própria Sthefany e não há pagamento registrado';
    }
    if (!classe) {
      preservadas.push({
        linha: c.origem_linha, cliente: c.cliente_nome_original, sku: c.sku, valor: c.valor_total,
        status: c.status_pagamento_original, texto, porque: 'valor positivo marcado PAGO — faturamento preservado',
      });
      continue;
    }
    decisoes.push({
      historicoItemId: c.id, classe, decisao: 'aplicar', confianca: 'alta',
      motivo: `${motivo} (texto: "${texto}") — ${FONTE}`,
      _linha: c.origem_linha,
    });
  }
  let reclass = { status: 200, corpo: {} };
  if (decisoes.length) {
    reclass = await api('POST', '/api/historico/reclassificar', {
      decisoes: decisoes.map(({ _linha, ...d }) => d), usuario: 'reconciliacao-2026-09-26',
    });
    if (reclass.status !== 200 || (reclass.corpo?.problemas ?? []).length) parar('Reclassificação recusada.', reclass.corpo);
  }
  const porClasse = {};
  for (const d of decisoes) porClasse[d.classe] = (porClasse[d.classe] ?? 0) + 1;
  passo('6. saídas sem faturamento (reclassificação histórica)', {
    aplicadas: decisoes.length, porClasse,
    linhas: decisoes.map((d) => ({ linha: d._linha, classe: d.classe })),
    preservadas,
  });

  /* ═══════════════════════════════════════════════════════════ 7. peças novas */
  const catalogo = new Map(q('SELECT sku, qtd, desc, preco, status FROM produtos').map((p) => [p.sku, p]));
  const anexoTotal = new Map();
  const anexoNome = new Map();
  const anexoPreco = new Map();
  for (const a of Object.values(anexos)) {
    for (const [sku, n] of a.itens) anexoTotal.set(sku, (anexoTotal.get(sku) ?? 0) + n);
    for (const p of a.pecas) { if (!anexoNome.has(p.sku)) anexoNome.set(p.sku, p.nome); if (p.preco != null && !anexoPreco.has(p.sku)) anexoPreco.set(p.sku, p.preco); }
  }
  const novosSkus = [...new Set([...est.casa.keys(), ...anexoTotal.keys()])].filter((s) => !catalogo.has(s)).sort();
  let novosFeitos = { prontos: 0 };
  if (novosSkus.length) {
    const produtos = novosSkus.map((sku) => {
      const desc = est.nome.get(sku) || anexoNome.get(sku) || '';
      const preco = est.preco.get(sku) ?? anexoPreco.get(sku) ?? null;
      return { sku, desc, cat: categoriaPeloNome(desc), preco, qtd: (est.casa.get(sku) ?? 0) + (anexoTotal.get(sku) ?? 0) };
    });
    const an = await api('POST', '/api/produtos/novos/analisar', { produtos, origem: 'planilha' });
    if (an.status !== 200) parar('Análise das peças novas falhou.', an.corpo);
    if (an.corpo.revisao?.total || an.corpo.jaExistem?.total) parar('Peças novas pedem revisão.', { revisao: an.corpo.revisao, jaExistem: an.corpo.jaExistem });
    if (an.corpo.prontos?.total !== produtos.length || an.corpo.prontos.itens.length !== produtos.length) {
      parar('A análise das peças novas não devolveu todas como prontas.', an.corpo.resumo);
    }
    const cad = await api('POST', '/api/produtos/novos/cadastrar', { produtos: an.corpo.prontos.itens, origem: 'planilha' });
    if (cad.status !== 200 || cad.corpo?.erro) parar('Cadastro das peças novas falhou.', cad.corpo);
    novosFeitos = {
      prontos: an.corpo.prontos.total, pecas: produtos.reduce((s, p) => s + p.qtd, 0),
      semPreco: produtos.filter((p) => p.preco == null).map((p) => p.sku),
      soEmMaleta: produtos.filter((p) => !est.casa.has(p.sku)).map((p) => p.sku),
      criados: cad.corpo?.criados, ignorados: cad.corpo?.ignorados, avisos: (cad.corpo?.avisos ?? []).length,
    };
  }
  passo('7. peças novas', { codigos: novosSkus.length, ...novosFeitos });

  /* ═══════════════════════════════════════════════════════════════ 8. totais */
  /* O consignado que FICA: maletas abertas de quem não tem Anexo nesta
     rodada (a Luciana). As das três revendedoras do Anexo entram pelo Anexo
     — contar a maleta aberta delas também dobraria o total numa segunda
     passada, quando a maleta nova já existe. */
  const revsDoAnexo = new Set(Object.keys(anexos).map((n) => revs.get(n).id));
  const fora = new Map(q(`SELECT mi.sku, SUM(mi.qtd - mi.devolvida) fora FROM maleta_itens mi
      JOIN maletas m ON m.id = mi.maleta_id WHERE m.status IN ('aberta','em_acerto')
       AND m.rev_id NOT IN (${[...revsDoAnexo].join(',')}) GROUP BY mi.sku`).map((r) => [r.sku, Number(r.fora)]));
  const kits = new Set(q('SELECT DISTINCT kit_sku AS s FROM kit_componentes').map((r) => r.s));
  const alvos = [];
  const zeradosEmCasa = [];
  for (const p of q('SELECT sku, qtd, desc, status FROM produtos')) {
    if (kits.has(p.sku)) continue;
    const alvo = (est.casa.get(p.sku) ?? 0) + (anexoTotal.get(p.sku) ?? 0) + (fora.get(p.sku) ?? 0);
    if (alvo === Number(p.qtd)) continue;
    const casaAntes = Number(p.qtd) - (fora.get(p.sku) ?? 0);
    if (!est.casa.has(p.sku) && casaAntes > 0) zeradosEmCasa.push({ sku: p.sku, desc: p.desc, casaAntes });
    alvos.push({ sku: p.sku, para: alvo });
  }
  let apl = { corpo: { aplicados: 0, recusados: [] } };
  if (alvos.length) {
    apl = await api('POST', '/api/estoque-total/aplicar', { itens: alvos, fonte: 'Estoque (1).xlsx casa + Anexos I, 26/09/2026' });
    if (apl.status !== 200 || (apl.corpo?.recusados ?? []).length) parar('Ajuste de estoque total recusado.', apl.corpo);
  }
  if (zeradosEmCasa.length) {
    aviso(`${zeradosEmCasa.length} código(s) do catálogo tinham peça em casa e não estão na planilha de casa. `
      + 'A planilha é o estoque em casa inteiro, por instrução do dono: a casa deles foi a zero, com movimento rastreável.', zeradosEmCasa);
  }
  passo('8. totais', {
    ajustados: apl.corpo.aplicados, pecasAMais: alvos.reduce((s, a) => s + Math.max(0, a.para - Number(catalogo.get(a.sku)?.qtd ?? a.para)), 0),
    zeradosEmCasa,
  });

  /* ══════════════════════════════════════════════════════════ 9. maletas novas */
  const maletasNovas = [];
  for (const [nome, a] of Object.entries(anexos)) {
    const rev = revs.get(nome);
    const abertasRev = maletaAberta(rev.id);
    if (abertasRev.length === 1 && mapaIgual(itensDaMaleta(abertasRev[0].id), a.itens)) {
      maletasNovas.push({ nome, acao: 'nenhuma — a maleta aberta já é o Anexo', maleta: abertasRev[0].id });
      continue;
    }
    if (abertasRev.length) parar(`${nome} ainda tem maleta aberta diferente do Anexo.`, abertasRev.map((m) => m.id));
    const obs = `Anexo I do contrato (${a.meta.arquivo}) — ${a.meta.data}, ${a.meta.hora}. `
      + `Conteúdo físico reconciliado em ${HOJE}. A data do cabeçalho do Anexo foi guardada como previsão de acerto; `
      + 'não é data de movimentação.';
    const m = await api('POST', '/api/maletas', { revId: rev.id, abertaEm: HOJE, acertoEm: a.meta.dataIso, obs });
    if (m.status !== 201) parar(`Não consegui abrir a maleta de ${nome}.`, m.corpo);
    const add = await api('POST', `/api/maletas/${m.corpo.id}/itens`, { itens: Object.fromEntries(a.itens) });
    if (add.status !== 200 || add.corpo?.erro) parar(`Não consegui consignar as peças de ${nome}.`, add.corpo);
    const precos = q('SELECT sku, preco_envio FROM maleta_itens WHERE maleta_id = ?', m.corpo.id);
    const divergentes = precos.filter((p) => {
      const doc = a.pecas.find((x) => x.sku === p.sku)?.preco;
      return doc != null && p.preco_envio != null && Math.abs(Number(p.preco_envio) - doc) > 0.005;
    }).map((p) => ({ sku: p.sku, catalogo: p.preco_envio, anexo: a.pecas.find((x) => x.sku === p.sku)?.preco }));
    if (divergentes.length) aviso(`${divergentes.length} preço(s) do Anexo de ${nome} diferem do catálogo; vale o catálogo (§20).`, divergentes);
    maletasNovas.push({
      nome, maleta: m.corpo.id, pecas: somaMapa(itensDaMaleta(m.corpo.id)), codigos: itensDaMaleta(m.corpo.id).size,
      acertoPrevisto: a.meta.dataIso, precosDivergentes: divergentes.length,
    });
  }
  passo('9. maletas novas', { maletas: maletasNovas });

  /* ═════════════════════════════════════════════════════════════════ 10. prova */
  const depois = contar();
  const conferir = await api('GET', '/api/estoque/conferir');
  const provaCasa = await api('POST', '/api/estoque-total/analisar', {
    modo: 'casa',
    produtos: [...est.casa].map(([sku, qtd]) => ({ sku, desc: est.nome.get(sku), qtd, preco: est.preco.get(sku) ?? null })),
  });
  const foraFinal = consignado();
  const casaFinal = q('SELECT sku, qtd FROM produtos').reduce((s, p) => s + Number(p.qtd) - (foraFinal.get(p.sku) ?? 0), 0);
  const porRev = Object.fromEntries(Object.keys(anexos).concat('Luciana Souza').map((nome) => {
    const ms = maletaAberta(revs.get(nome).id);
    return [nome, { maletas: ms.map((m) => m.id), pecas: ms.reduce((s, m) => s + somaMapa(itensDaMaleta(m.id)), 0) }];
  }));
  const graciele = maletaAberta(revs.get('Graciele Muniz').id)[0];
  const itG = graciele ? itensDaMaleta(graciele.id) : new Map();
  const invariantes = {
    razaoFecha: JSON.stringify(conferir.corpo?.divergentes) === '[]',
    saldoIgualRazao: depois.total === depois.razao,
    casaIgualPlanilha: casaFinal === CONTROLES.estoque.unidades,
    provaModoCasaSemMudanca: provaCasa.corpo?.resumo?.vaoMudar === 0 && provaCasa.corpo?.resumo?.novos === 0
      && provaCasa.corpo?.resumo?.revisao === 0,
    bruna92: porRev['Bruna Follei'].pecas === 92,
    evelyn84: porRev['Evelyn Veiga'].pecas === 84,
    graciele123: porRev['Graciele Muniz'].pecas === 123,
    graciele426579x2: itG.get('426579') === 2,
    graciele155147x2: itG.get('155147') === 2,
    lucianaIntacta: retratoLuciana() === lucianaAntes,
    semSaldoNegativo: q1('SELECT COUNT(*) n FROM produtos WHERE qtd < 0').n === 0,
    semConsignadoAcimaDoTotal: q1(`SELECT COUNT(*) n FROM produtos p JOIN (SELECT mi.sku, SUM(mi.qtd - mi.devolvida) f FROM maleta_itens mi
        JOIN maletas m ON m.id = mi.maleta_id WHERE m.status IN ('aberta','em_acerto') GROUP BY mi.sku) c ON c.sku = p.sku WHERE c.f > p.qtd`).n === 0,
    umLoteAtivo: depois.lotes_ativos === 1,
    vendaExternaUnica: q1('SELECT COUNT(*) n FROM (SELECT externo_id FROM vendas WHERE externo_id IS NOT NULL GROUP BY externo_id HAVING COUNT(*) > 1)').n === 0,
  };
  passo('10. prova', { depois, casaFinal, porRevendedora: porRev, provaCasa: provaCasa.corpo?.resumo, invariantes });
  relatorio.antes = antes;
  relatorio.depois = depois;
  relatorio.invariantes = invariantes;
  relatorio.ok = Object.values(invariantes).every(Boolean);
  if (!relatorio.ok) {
    relatorio.erro = 'Invariante violada — ver `invariantes`.';
    console.error('\n✗ INVARIANTE VIOLADA', invariantes);
  } else {
    console.log('\n✓ reconciliação fechada — todas as invariantes');
  }
} catch (e) {
  relatorio.ok = false;
  relatorio.erro = e.message;
  relatorio.detalhe = e.extra ?? null;
  console.error(`\n✗ PARADA: ${e.message}`);
  if (e.extra) console.error(JSON.stringify(e.extra, null, 1).slice(0, 4000));
  if (!(e instanceof Parada)) console.error(e.stack);
}
if (args.relatorio) writeFileSync(args.relatorio, JSON.stringify(relatorio, null, 1));
raw.close();
process.exit(relatorio.ok ? 0 : 1);
