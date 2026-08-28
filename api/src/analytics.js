/** Inteligência comercial: os números do Painel de Vendas e do CRM.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  DUAS POPULAÇÕES, UMA DEFINIÇÃO DE VENDA
 *
 *  As vendas da Marquesa vivem em dois lugares:
 *
 *    operacional  `vendas` + `venda_itens`  — pedido de verdade, move
 *                 estoque, registrado pelo sistema desde o go-live.
 *
 *    histórico    `vendas_historicas`       — a planilha antiga, RECONSTRUÍDA
 *                 em vendas por `vendas-historicas.js`. Não move estoque e
 *                 nunca moveu.
 *
 *  Até 2026-08-27 a segunda população não tinha pedido, e este arquivo
 *  recusava contar vendas e ticket médio históricos. A regra de agrupamento
 *  passou a existir — mesmo cliente normalizado + mesma data = uma venda — e
 *  com ela os dois números passaram a ser calculáveis e auditáveis. O campo
 *  `historicoDisponivel: false` e o texto que o acompanhava saíram.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  UMA NORMALIZAÇÃO DE CLIENTE
 *
 *  Cliente operacional e cliente histórico se encontram por
 *  `cliente_nome_norm` — a coluna gravada pelo MESMO `normalizarNomeCliente()`
 *  em JS que a importação usa. Este arquivo não normaliza mais nada em SQL:
 *  `LOWER(TRIM())` dobrava caixa mas não acento, e separava "Vitória" de
 *  "vitoria" em duas clientes.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  DUAS ROTAS AGREGADAS
 *
 *  `painel()` e `crm()` devolvem, cada uma, tudo o que a sua tela precisa,
 *  numa resposta só. A tela não faz seis chamadas para desenhar seis blocos
 *  que dependem do mesmo recorte de período — e os blocos não podem
 *  discordar entre si, porque saem da mesma leitura.
 */

import { normalizarNomeCliente } from './vendas-historico-normalizar.js';
import { REGRA_DESCRITA } from './vendas-historicas.js';
import { categoriaDoItem } from './categoria-nome.js';

const PERIODOS = new Set(['7d', '30d', '90d', '12m', 'tudo']);

/** Traduz o filtro da tela em recorte de data. `tudo` devolve null e a
 *  consulta sai sem WHERE de período. */
export function faixaDePeriodo(periodo = 'tudo', hoje = new Date()) {
  if (!PERIODOS.has(periodo)) periodo = 'tudo';
  if (periodo === 'tudo') return { de: null, ate: null, periodo };
  const dias = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 }[periodo];
  const ate = new Date(hoje);
  const de = new Date(hoje);
  de.setDate(de.getDate() - dias);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { de: iso(de), ate: iso(ate), periodo };
}

function recorte(coluna, { de, ate }) {
  if (!de) return { sql: '', binds: [] };
  return { sql: ` AND ${coluna} >= ? AND ${coluna} <= ?`, binds: [de, ate] };
}

/* ═════════════════════════════════════════════ a VENDA, nas duas populações

   Um CTE só, reusado por todo o arquivo. É o que garante que "1.375 vendas"
   signifique a mesma coisa no cartão do topo, no gráfico e no ranking. */
function cteVendas(faixa, { incluirAjuste = false } = {}) {
  const h = recorte('vh.data', faixa);
  const v = recorte('v.data', faixa);
  return {
    sql: `
      SELECT 'historico' AS fonte, vh.id AS id, vh.data AS data,
             vh.cliente_nome_norm AS norm, vh.cliente_nome AS nome,
             vh.cliente_id AS cliente_id, vh.pecas AS pecas,
             COALESCE(vh.valor_pago, 0) AS faturamento,
             vh.valor_total AS valor_total, vh.status AS status,
             vh.elegivel_ticket AS elegivel, vh.canal AS canal,
             vh.contexto AS contexto, vh.classe AS classe
        FROM vendas_historicas vh
        JOIN vendas_historico_lotes l ON l.id = vh.lote_id AND l.status = 'importado'
       WHERE ${incluirAjuste ? '1 = 1' : "vh.classe = 'venda'"}${h.sql}
      UNION ALL
      SELECT 'operacional', v.id, v.data,
             v.cliente_nome_norm, COALESCE(c.nome, v.cliente_nome),
             v.cliente_id, (SELECT COALESCE(SUM(i.qtd), 0) FROM venda_itens i WHERE i.venda_id = v.id),
             v.total, v.total, 'paga', 1,
             CASE v.origem WHEN 'balcao' THEN 'Balcão' WHEN 'site' THEN 'Site'
                           WHEN 'acerto' THEN 'Acerto de maleta'
                           ELSE v.origem END,
             NULL, 'venda'
        FROM vendas v
        LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE v.cancelada = 0${v.sql}`,
    binds: [...h.binds, ...v.binds],
  };
}

/* ═══════════════════════════════════════════════════════ visão geral (KPIs) */

export async function visaoGeral(db, { periodo = 'tudo' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const V = cteVendas(faixa);
  const h = recorte('h.data', faixa);
  const v = recorte('v.data', faixa);

  const [geral, itens, novos] = await Promise.all([
    db.prepare(
      `WITH vd AS (${V.sql})
       SELECT COUNT(*)                                       AS vendas,
              SUM(CASE WHEN fonte = 'historico'   THEN 1 ELSE 0 END) AS vendas_historicas,
              SUM(CASE WHEN fonte = 'operacional' THEN 1 ELSE 0 END) AS vendas_sistema,
              COALESCE(SUM(pecas), 0)                        AS pecas,
              ROUND(COALESCE(SUM(faturamento), 0), 2)        AS faturamento,
              COUNT(DISTINCT COALESCE(norm, 'sem-nome'))     AS clientes,
              SUM(elegivel)                                  AS elegiveis,
              ROUND(COALESCE(SUM(CASE WHEN elegivel = 1 THEN valor_total END), 0), 2) AS fat_elegivel,
              SUM(CASE WHEN data IS NULL THEN 1 ELSE 0 END)  AS sem_data,
              MIN(data) AS de, MAX(data) AS ate
         FROM vd`,
    ).bind(...V.binds).first(),

    /* peças e códigos saem do ITEM, não da venda: são somas exatas nas duas
       populações e não dependem de agrupamento nenhum */
    db.prepare(
      `SELECT (SELECT COUNT(DISTINCT h.sku_base) FROM vendas_historico_itens h
                 JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status='importado'
                WHERE h.sku_base IS NOT NULL${h.sql})
            + (SELECT COUNT(DISTINCT i.sku) FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
                WHERE v.cancelada = 0${v.sql}) AS skus,
              (SELECT COUNT(*) FROM vendas_historicas x
                 JOIN vendas_historico_lotes l2 ON l2.id = x.lote_id AND l2.status='importado'
                WHERE x.classe = 'ajuste') AS ajustes,
              (SELECT COUNT(*) FROM vendas_historico_itens h2
                 JOIN vendas_historico_lotes l3 ON l3.id = h2.lote_id AND l3.status='importado') AS linhas_brutas`,
    ).bind(...h.binds, ...v.binds).first(),

    /* cliente novo = PRIMEIRA compra de toda a história caiu no período */
    faixa.de ? db.prepare(
      `WITH todas AS (${cteVendas({ de: null, ate: null }).sql})
       SELECT COUNT(*) AS novos FROM (
         SELECT COALESCE(norm,'sem-nome') AS k, MIN(data) AS primeira
           FROM todas WHERE data IS NOT NULL GROUP BY k
       ) WHERE primeira >= ? AND primeira <= ?`,
    ).bind(faixa.de, faixa.ate).first() : Promise.resolve({ novos: null }),
  ]);

  const vendas = Number(geral?.vendas ?? 0);
  const pecas = Number(geral?.pecas ?? 0);
  const faturamento = Number(geral?.faturamento ?? 0);
  const elegiveis = Number(geral?.elegiveis ?? 0);
  const fatElegivel = Number(geral?.fat_elegivel ?? 0);

  return {
    periodo: faixa,
    faturamento: +faturamento.toFixed(2),
    vendas,
    pecas,
    clientes: Number(geral?.clientes ?? 0),
    skus: Number(itens?.skus ?? 0),
    clientesNovos: novos?.novos ?? null,
    valorMedioPorItem: pecas > 0 ? +(faturamento / pecas).toFixed(2) : null,
    intervalo: { de: geral?.de ?? null, ate: geral?.ate ?? null },

    /* ─── ticket médio: agora existe, e a regra vem junto do número.
       Denominador é a venda ELEGÍVEL — paga por inteiro, com data e sem
       item de valor desconhecido. Misturar paga com pendente ou com sem-data
       daria um número menor e sem significado. */
    ticketMedio: {
      valor: elegiveis > 0 ? +(fatElegivel / elegiveis).toFixed(2) : null,
      vendasElegiveis: elegiveis,
      faturamentoElegivel: +fatElegivel.toFixed(2),
      regra: 'faturamento das vendas pagas elegíveis ÷ número dessas vendas. '
        + 'Elegível = paga por inteiro, com data conhecida e sem item de valor '
        + 'desconhecido. Venda pendente, parcial, sem data ou ajuste fica de fora.',
    },

    composicao: {
      vendasHistoricas: Number(geral?.vendas_historicas ?? 0),
      vendasSistema: Number(geral?.vendas_sistema ?? 0),
      linhasBrutas: Number(itens?.linhas_brutas ?? 0),
      ajustes: Number(itens?.ajustes ?? 0),
      vendasSemData: Number(geral?.sem_data ?? 0),
      regraAgrupamento: REGRA_DESCRITA,
    },
  };
}

/* ═══════════════════════════════════════════════════════════ série temporal */

export async function evolucao(db, { periodo = 'tudo', granularidade = 'mes' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const fmt = granularidade === 'dia' ? '%Y-%m-%d' : '%Y-%m';
  const V = cteVendas(faixa);

  const { results } = await db.prepare(
    `WITH vd AS (${V.sql})
     SELECT strftime('${fmt}', data) AS chave,
            ROUND(SUM(faturamento), 2) AS faturamento,
            SUM(pecas)                 AS pecas,
            COUNT(*)                   AS vendas
       FROM vd WHERE data IS NOT NULL
      GROUP BY chave ORDER BY chave`,
  ).bind(...V.binds).all();

  return {
    periodo: faixa,
    granularidade,
    pontos: (results ?? []).map((r) => ({
      chave: r.chave,
      faturamento: Number(r.faturamento ?? 0),
      pecas: Number(r.pecas ?? 0),
      vendas: Number(r.vendas ?? 0),
    })),
  };
}

/* ══════════════════════════════════════════════════════════════── produtos */

/** Mais vendidos. Casa o histórico com o catálogo de hoje pelo CÓDIGO —
 *  nunca pelo nome, que muda de estação para estação — e traz a foto quando
 *  ela existe. Produto fora do catálogo continua no ranking, sem foto: a
 *  ausência de imagem não pode esconder o que mais vendeu. */
export async function produtosMaisVendidos(db, { periodo = 'tudo', limite = 20, por = 'faturamento' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const h = recorte('h.data', faixa);
  const v = recorte('v.data', faixa);
  const ordem = por === 'quantidade' ? 'pecas' : 'faturamento';

  const { results } = await db.prepare(
    `WITH juntos AS (
       SELECT h.sku_base AS chave,
              h.nome_produto_historico AS nome_hist,
              h.qtd AS qtd,
              CASE WHEN h.pago = 1 THEN h.valor_total ELSE 0 END AS valor
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
        WHERE h.sku_base IS NOT NULL${h.sql}
       UNION ALL
       SELECT UPPER(i.sku), i.desc, i.qtd, i.qtd * i.preco
         FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
        WHERE v.cancelada = 0${v.sql}
     )
     SELECT j.chave                        AS sku,
            MAX(j.nome_hist)               AS nome_historico,
            p.desc                         AS nome_atual,
            p.cat                          AS categoria,
            p.foto_original_key, p.foto_tratada_key, p.foto_url,
            SUM(j.qtd)                     AS pecas,
            ROUND(SUM(j.valor), 2)         AS faturamento
       FROM juntos j
       LEFT JOIN produtos p ON UPPER(p.sku) = j.chave
      GROUP BY j.chave
      ORDER BY ${ordem} DESC
      LIMIT ?`,
  ).bind(...h.binds, ...v.binds, limite).all();

  const total = (results ?? []).reduce((s, r) => s + Number(r.faturamento), 0);
  return {
    periodo: faixa,
    por,
    produtos: (results ?? []).map((r) => ({
      sku: r.sku,
      nomeHistorico: r.nome_historico,
      nomeAtual: r.nome_atual,
      renomeado: !!(r.nome_atual && r.nome_historico && r.nome_atual !== r.nome_historico),
      noCatalogo: !!r.nome_atual,
      categoria: categoriaDoItem({ catCatalogo: r.categoria, nomeHistorico: r.nome_historico }),
      /* a tela pede a foto por `/api/fotos/<sku>`; aqui só se diz se existe */
      temFoto: !!(r.foto_tratada_key || r.foto_original_key || r.foto_url),
      fotoUrl: r.foto_url ?? null,
      pecas: Number(r.pecas),
      faturamento: Number(r.faturamento),
      participacao: total > 0 ? +(Number(r.faturamento) / total * 100).toFixed(1) : 0,
    })),
  };
}

/** Distribuição por categoria.
 *
 *  A categoria sai do catálogo quando a peça ainda existe lá, e do NOME
 *  histórico quando não existe — 62% das linhas do histórico são de peças
 *  fora do catálogo de hoje.
 *
 *  O que ela NÃO usa é `vendas_historico_itens.tipo`: `tipo` é o material
 *  (Prata 925, Banhada, Bruto), e somá-lo com Brinco e Colar no mesmo total
 *  fazia a rosca responder uma pergunta diferente da que o título fazia.
 *
 *  O agrupamento acontece em JS porque a regra é uma tabela de palavras
 *  (`categoria-nome.js`) — reescrevê-la em SQL criaria a segunda
 *  implementação que §33 proíbe. São ~1.400 linhas: cabe na memória do
 *  Worker sem cerimônia. */
export async function categoriasMaisVendidas(db, { periodo = 'tudo' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const h = recorte('h.data', faixa);
  const v = recorte('v.data', faixa);

  const { results } = await db.prepare(
    `SELECT p.cat AS cat_catalogo, h.nome_produto_historico AS nome, h.qtd AS qtd,
            CASE WHEN h.pago = 1 THEN h.valor_total ELSE 0 END AS valor
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
       LEFT JOIN produtos p ON UPPER(p.sku) = h.sku_base
      WHERE 1 = 1${h.sql}
      UNION ALL
     SELECT p.cat, i.desc, i.qtd, i.qtd * i.preco
       FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
       LEFT JOIN produtos p ON p.sku = i.sku
      WHERE v.cancelada = 0${v.sql}`,
  ).bind(...h.binds, ...v.binds).all();

  const acc = new Map();
  for (const r of results ?? []) {
    const cat = categoriaDoItem({ catCatalogo: r.cat_catalogo, nomeHistorico: r.nome });
    const a = acc.get(cat) ?? { pecas: 0, faturamento: 0 };
    a.pecas += Number(r.qtd ?? 0);
    a.faturamento += Number(r.valor ?? 0);
    acc.set(cat, a);
  }

  const linhas = [...acc.entries()]
    .map(([categoria, a]) => ({ categoria, pecas: a.pecas, faturamento: +a.faturamento.toFixed(2) }))
    .sort((x, y) => y.pecas - x.pecas);

  const totalPecas = linhas.reduce((s, r) => s + r.pecas, 0);
  const totalFat = linhas.reduce((s, r) => s + r.faturamento, 0);
  return {
    periodo: faixa,
    totalPecas,
    totalFaturamento: +totalFat.toFixed(2),
    categorias: linhas.map((r) => ({
      ...r,
      /* participação por PEÇAS: é o que a rosca desenha, e misturar as duas
         bases faria a legenda não somar 100% */
      participacao: totalPecas > 0 ? +(r.pecas / totalPecas * 100).toFixed(1) : 0,
      participacaoFaturamento: totalFat > 0 ? +(r.faturamento / totalFat * 100).toFixed(1) : 0,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════── origem */

/** Canal, contexto e revendedora — a dimensão mais rica da planilha, que
 *  vinha escrita à mão em `Observação Venda`.
 *
 *  Devolve SEMPRE o bruto ao lado do classificado: "Maleta (Feira
 *  Franceschini)" é o dado, e canal=Maleta/contexto=Feira Franceschini é a
 *  leitura dele. A leitura precisa continuar conferível por quem escreveu. */
export async function porOrigem(db, { periodo = 'tudo' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const V = cteVendas(faixa);
  const h = recorte('h.data', faixa);

  const [canais, contextos, brutos] = await Promise.all([
    db.prepare(
      `WITH vd AS (${V.sql})
       SELECT COALESCE(canal, '(não classificado)') AS canal,
              COUNT(*) AS vendas, SUM(pecas) AS pecas,
              ROUND(SUM(faturamento), 2) AS faturamento,
              COUNT(DISTINCT COALESCE(norm,'sem-nome')) AS clientes
         FROM vd GROUP BY canal ORDER BY faturamento DESC`,
    ).bind(...V.binds).all(),

    db.prepare(
      `WITH vd AS (${V.sql})
       SELECT canal, contexto, COUNT(*) AS vendas, SUM(pecas) AS pecas,
              ROUND(SUM(faturamento), 2) AS faturamento
         FROM vd WHERE contexto IS NOT NULL
        GROUP BY canal, contexto ORDER BY faturamento DESC`,
    ).bind(...V.binds).all(),

    /* o texto exatamente como a Sthefany escreveu — a auditoria da leitura */
    db.prepare(
      `SELECT h.observacao_original AS texto, COUNT(*) AS linhas, SUM(h.qtd) AS pecas,
              ROUND(SUM(CASE WHEN h.pago = 1 THEN h.valor_total ELSE 0 END), 2) AS faturamento
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
        WHERE 1 = 1${h.sql}
        GROUP BY texto ORDER BY linhas DESC`,
    ).bind(...h.binds).all(),
  ]);

  const total = (canais.results ?? []).reduce((s, r) => s + Number(r.faturamento), 0);
  return {
    periodo: faixa,
    totalFaturamento: +total.toFixed(2),
    canais: (canais.results ?? []).map((r) => ({
      canal: r.canal,
      vendas: Number(r.vendas),
      pecas: Number(r.pecas ?? 0),
      faturamento: Number(r.faturamento ?? 0),
      clientes: Number(r.clientes),
      participacao: total > 0 ? +(Number(r.faturamento) / total * 100).toFixed(1) : 0,
    })),
    contextos: (contextos.results ?? []).map((r) => ({
      canal: r.canal,
      contexto: r.contexto,
      origem: `${r.canal ?? '?'} · ${r.contexto}`,
      vendas: Number(r.vendas),
      pecas: Number(r.pecas ?? 0),
      faturamento: Number(r.faturamento ?? 0),
    })),
    brutos: (brutos.results ?? []).map((r) => ({
      texto: r.texto ?? '(vazio)',
      linhas: Number(r.linhas),
      pecas: Number(r.pecas ?? 0),
      faturamento: Number(r.faturamento ?? 0),
    })),
  };
}

/* ═══════════════════════════════════════════════════════ estado do cliente

   §25 pediu regra derivada do comportamento, não 30/60/90 chutado. A régua
   de cada cliente é a FREQUÊNCIA DELA: quem compra a cada 20 dias e sumiu há
   70 está em risco; quem compra a cada 200 dias e sumiu há 70 está em dia.

   Para quem tem uma compra só não existe frequência própria — aí vale a
   mediana da base, que é o comportamento típico observado, não um palpite.

   Os dois multiplicadores e os dois pisos ficam AQUI, num lugar só, com o
   nome do que fazem. São convenção declarada e ajustável, não verdade
   revelada — e a tela mostra a régua junto do número. */
export const REGUA_RELACIONAMENTO = {
  fatorRisco: 2,        /* passou de 2× a própria frequência → em risco   */
  fatorInativo: 4,      /* passou de 4× → inativa                          */
  pisoRiscoDias: 45,    /* ninguém entra em risco antes disso              */
  pisoInativoDias: 180, /* nem em inativa antes disso                      */
  recorrenteMinimo: 2,  /* 2 vendas ou mais é cliente recorrente           */
};

/** Classifica UMA cliente. Recebe o que já foi medido — não vai ao banco —
 *  para que a mesma função sirva à lista, ao perfil e ao gráfico. */
export function classificarCliente({ vendas, primeira, ultima, intervaloBase }, hoje) {
  if (!ultima) return { estado: 'sem histórico', diasSemComprar: null, frequenciaDias: null };

  const dias = Math.floor((Date.parse(hoje) - Date.parse(ultima)) / 86400000);
  const n = Number(vendas ?? 0);

  /* a frequência da própria cliente: o intervalo médio entre as compras
     dela. Com uma compra só não há intervalo — usa-se o típico da base. */
  const frequencia = (n >= 2 && primeira && ultima)
    ? Math.max(1, Math.round((Date.parse(ultima) - Date.parse(primeira)) / 86400000 / (n - 1)))
    : (intervaloBase ?? null);

  const R = REGUA_RELACIONAMENTO;
  const limiteRisco = frequencia ? Math.max(R.pisoRiscoDias, frequencia * R.fatorRisco) : R.pisoRiscoDias;
  const limiteInativo = frequencia ? Math.max(R.pisoInativoDias, frequencia * R.fatorInativo) : R.pisoInativoDias;

  let estado;
  if (dias > limiteInativo) estado = 'inativa';
  else if (dias > limiteRisco) estado = 'em risco';
  else if (n >= R.recorrenteMinimo) estado = 'recorrente';
  else estado = 'ativa';

  return {
    estado,
    diasSemComprar: dias,
    frequenciaDias: frequencia,
    limiteRisco,
    limiteInativo,
  };
}

/* ═══════════════════════════════════════════════════════════════── clientes */

/** A base de clientes medida em VENDAS reconstruídas, não em linhas.
 *  É o insumo comum do ranking, da saúde da base e da reativação. */
async function baseDeClientes(db, faixa) {
  const V = cteVendas(faixa);
  const { results } = await db.prepare(
    `WITH vd AS (${V.sql})
     SELECT COALESCE(norm, 'sem-nome')     AS norm,
            MAX(nome)                      AS nome,
            MAX(cliente_id)                AS cliente_id,
            COUNT(*)                       AS vendas,
            SUM(pecas)                     AS pecas,
            ROUND(SUM(faturamento), 2)     AS faturamento,
            ROUND(MAX(faturamento), 2)     AS maior_compra,
            MIN(data)                      AS primeira,
            MAX(data)                      AS ultima,
            SUM(CASE WHEN fonte = 'operacional' THEN 1 ELSE 0 END) AS vendas_sistema
       FROM vd
      GROUP BY norm`,
  ).bind(...V.binds).all();

  const linhas = results ?? [];

  /* o intervalo típico da base: mediana das frequências de quem tem 2+
     vendas. É o que serve de régua para quem ainda comprou uma vez só. */
  const freqs = linhas
    .filter((r) => Number(r.vendas) >= 2 && r.primeira && r.ultima)
    .map((r) => (Date.parse(r.ultima) - Date.parse(r.primeira)) / 86400000 / (Number(r.vendas) - 1))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const intervaloBase = freqs.length
    ? Math.max(1, Math.round(freqs[Math.floor(freqs.length / 2)]))
    : null;

  const hoje = new Date().toISOString().slice(0, 10);
  return {
    intervaloBase,
    hoje,
    clientes: linhas.map((r) => {
      const c = classificarCliente({
        vendas: r.vendas, primeira: r.primeira, ultima: r.ultima, intervaloBase,
      }, hoje);
      return {
        norm: r.norm,
        /* §10: a chave técnica pode ser `sem-nome`; a APRESENTAÇÃO é uma só,
           e não inventa nome nenhum. */
        nome: r.nome ?? (r.norm === 'sem-nome' ? 'Cliente não identificado' : r.norm),
        identificada: r.norm !== 'sem-nome',
        clienteId: r.cliente_id ?? null,
        vendas: Number(r.vendas),
        pecas: Number(r.pecas ?? 0),
        faturamento: Number(r.faturamento ?? 0),
        maiorCompra: Number(r.maior_compra ?? 0),
        ticketMedio: Number(r.vendas) > 0
          ? +(Number(r.faturamento ?? 0) / Number(r.vendas)).toFixed(2) : null,
        primeiraCompra: r.primeira ?? null,
        ultimaCompra: r.ultima ?? null,
        vendasSistema: Number(r.vendas_sistema ?? 0),
        recorrente: Number(r.vendas) >= REGUA_RELACIONAMENTO.recorrenteMinimo,
        ...c,
      };
    }),
  };
}

export async function clientesRanking(db, { periodo = 'tudo', limite = 50, ordem = 'faturamento' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const { clientes, intervaloBase } = await baseDeClientes(db, faixa);
  const chave = { faturamento: 'faturamento', pecas: 'pecas', compras: 'vendas' }[ordem] ?? 'faturamento';
  const lista = [...clientes].sort((a, b) => b[chave] - a[chave]);
  return {
    periodo: faixa,
    ordem,
    total: clientes.length,
    intervaloBaseDias: intervaloBase,
    clientes: lista.slice(0, limite),
  };
}

/** Compatibilidade: o nome antigo, com a régua nova por baixo. */
export function classificarRelacionamento(r, hoje) {
  return classificarCliente({
    vendas: r.vendas ?? r.datas_distintas ?? r.datasComCompra ?? 0,
    primeira: r.primeira ?? r.primeiraCompra ?? null,
    ultima: r.ultima ?? r.ultimaCompra ?? null,
    intervaloBase: null,
  }, hoje).estado;
}

/* ═══════════════════════════════════════════════════════ perfil individual */

export async function perfilCliente(db, { clienteId = null, norm = null } = {}) {
  if (clienteId === null && norm === null) return { ok: false, erro: 'Informe clienteId ou norm.' };

  let cadastro = null;
  if (clienteId !== null) {
    cadastro = await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(clienteId).first();
  } else {
    cadastro = await db.prepare('SELECT * FROM clientes WHERE nome_norm = ? LIMIT 1').bind(norm).first();
    /* cadastro anterior à migration tem `nome_norm` nulo. Quem não achou pela
       coluna procura comparando com o MESMO normalizador em JS, e grava o
       valor no caminho — nunca existe uma segunda regra em SQL. */
    if (!cadastro) {
      const { results } = await db.prepare('SELECT * FROM clientes WHERE nome_norm IS NULL').all();
      cadastro = (results ?? []).find((c) => normalizarNomeCliente(c.nome) === norm) ?? null;
      if (cadastro) {
        await db.prepare('UPDATE clientes SET nome_norm = ? WHERE id = ?').bind(norm, cadastro.id).run();
        cadastro.nome_norm = norm;
      }
    }
  }

  const chaveNorm = norm ?? cadastro?.nome_norm ?? normalizarNomeCliente(cadastro?.nome) ?? null;
  const V = cteVendas({ de: null, ate: null });

  const [vendasR, itensR] = await Promise.all([
    /* a linha do tempo é de VENDAS, não de linhas de planilha: uma compra de
       36 peças aparece uma vez, com 36 itens dentro */
    db.prepare(
      `WITH vd AS (${V.sql})
       SELECT * FROM vd
        WHERE COALESCE(norm,'sem-nome') = ?
           OR (cliente_id IS NOT NULL AND cliente_id = ?)
        ORDER BY data DESC`,
    ).bind(chaveNorm, clienteId).all(),

    db.prepare(
      `SELECT h.data, h.sku, h.sku_base, h.nome_produto_historico AS nome, h.qtd,
              h.valor_total AS valor, h.canal, h.contexto, h.pago,
              h.observacao_original, h.venda_historica_id AS venda_ref,
              'historico' AS fonte, p.cat AS categoria
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
         LEFT JOIN produtos p ON UPPER(p.sku) = h.sku_base
        WHERE (h.cliente_id IS NOT NULL AND h.cliente_id = ?) OR h.cliente_nome_norm = ?
        UNION ALL
       SELECT v.data, i.sku, UPPER(i.sku), i.desc, i.qtd, i.qtd * i.preco,
              v.origem, NULL, 1, NULL, v.id, 'operacional', p2.cat
         FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
         LEFT JOIN produtos p2 ON p2.sku = i.sku
        WHERE v.cancelada = 0
          AND ((v.cliente_id IS NOT NULL AND v.cliente_id = ?) OR v.cliente_nome_norm = ?)
        ORDER BY data DESC`,
    ).bind(clienteId, chaveNorm, clienteId, chaveNorm).all(),
  ]);

  const vendas = vendasR.results ?? [];
  const itens = itensR.results ?? [];

  const faturamento = vendas.reduce((s, v) => s + Number(v.faturamento ?? 0), 0);
  const pecas = vendas.reduce((s, v) => s + Number(v.pecas ?? 0), 0);
  const datas = vendas.map((v) => v.data).filter(Boolean).sort();
  const primeira = datas[0] ?? null;
  const ultima = datas[datas.length - 1] ?? null;

  const contar = (campo, fonte, resolver) => {
    const m = new Map();
    for (const l of fonte) {
      const k = (resolver ? resolver(l) : l[campo]) ?? '(não classificado)';
      m.set(k, (m.get(k) ?? 0) + Number(l.qtd ?? l.pecas ?? 0));
    }
    return [...m.entries()].map(([valor, qtd]) => ({ valor, pecas: qtd }))
      .sort((a, b) => b.pecas - a.pecas);
  };

  /* a categoria do perfil segue a MESMA regra da rosca do painel: catálogo
     quando a peça ainda existe, nome histórico quando não. Sem isto, 62% dos
     itens caíam em "(não classificado)" e a preferência da cliente sumia. */
  const categoriaDe = (l) => categoriaDoItem({
    catCatalogo: l.categoria, nomeHistorico: l.nome,
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const estado = classificarCliente(
    { vendas: vendas.length, primeira, ultima, intervaloBase: null }, hoje,
  );

  return {
    ok: true,
    cadastro: cadastro ?? null,
    norm: chaveNorm,
    nomeExibicao: cadastro?.nome
      ?? vendas[0]?.nome
      ?? (chaveNorm === 'sem-nome' || !chaveNorm ? 'Cliente não identificado' : chaveNorm),
    resumo: {
      faturamento: +faturamento.toFixed(2),
      pecas,
      vendas: vendas.length,
      ticketMedio: vendas.length > 0 ? +(faturamento / vendas.length).toFixed(2) : null,
      gastoMedioPorPeca: pecas > 0 ? +(faturamento / pecas).toFixed(2) : null,
      primeiraCompra: primeira,
      ultimaCompra: ultima,
      ...estado,
      itensLancados: itens.length,
      vendasSistema: vendas.filter((v) => v.fonte === 'operacional').length,
    },
    canalPreferido: contar('canal', vendas)[0]?.valor ?? null,
    categoriasPreferidas: contar(null, itens, categoriaDe).slice(0, 6),
    produtosPreferidos: contar('nome', itens).slice(0, 10),
    contextos: contar('contexto', vendas).filter((c) => c.valor !== '(não classificado)').slice(0, 6),
    /* a linha do tempo: a VENDA, com os itens dela agrupados por baixo */
    vendas: vendas.slice(0, 200).map((v) => ({
      fonte: v.fonte,
      id: v.id,
      data: v.data,
      pecas: Number(v.pecas ?? 0),
      valor: Number(v.faturamento ?? 0),
      status: v.status,
      canal: v.canal,
      contexto: v.contexto,
      itens: itens.filter((i) => (v.fonte === 'historico'
        ? i.venda_ref === v.id && i.fonte === 'historico'
        : i.venda_ref === v.id && i.fonte === 'operacional')),
    })),
    totalItens: itens.length,
  };
}

/* ══════════════════════════════════════════════════════ lista operacional */

/** A listagem no nível do ITEM — a visão de auditoria do histórico bruto.
 *
 *  De propósito NÃO agrupa em vendas: é aqui que se confere linha a linha o
 *  que a planilha dizia, e a venda reconstruída aparece ao lado
 *  (`vendaHistoricaId`) para poder navegar de uma para a outra. Agrupar aqui
 *  tiraria justamente o acesso ao dado de origem, que §7 exige preservar. */
export async function listarVendasUnificado(db, {
  de = null, ate = null, busca = null, canal = null, limite = 200, offset = 0,
} = {}) {
  const like = busca ? `%${String(busca).toLowerCase()}%` : null;

  const { results } = await db.prepare(
    `WITH juntos AS (
       SELECT 'historico' AS fonte, h.id AS id, NULL AS venda_id,
              h.venda_historica_id AS venda_historica_id, h.pedido_chave AS pedido_chave,
              h.origem_linha AS referencia, h.data AS data,
              h.cliente_nome_original AS cliente, h.cliente_nome_norm AS cliente_norm,
              h.sku AS sku, h.nome_produto_historico AS produto, h.qtd AS qtd,
              h.valor_total AS valor, h.canal AS canal, h.contexto AS contexto,
              h.observacao_original AS observacao, h.pago AS pago, 0 AS cancelada
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
       UNION ALL
       SELECT 'operacional', i.rowid, v.id, NULL, NULL, CAST(v.id AS TEXT), v.data,
              COALESCE(c.nome, v.cliente_nome), v.cliente_nome_norm,
              i.sku, i.desc, i.qtd, i.qtd * i.preco, v.origem, NULL, NULL, 1, v.cancelada
         FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
         LEFT JOIN clientes c ON c.id = v.cliente_id
     )
     SELECT * FROM juntos
      WHERE (? IS NULL OR data >= ?)
        AND (? IS NULL OR data <= ?)
        AND (? IS NULL OR canal = ?)
        AND (? IS NULL OR LOWER(cliente) LIKE ? OR LOWER(produto) LIKE ? OR LOWER(sku) LIKE ?)
      ORDER BY data DESC, id DESC
      LIMIT ? OFFSET ?`,
  ).bind(de, de, ate, ate, canal, canal, like, like, like, like, limite, offset).all();

  return { itens: results ?? [], limite, offset };
}

/* ══════════════════════════════════════════════════ ROTA AGREGADA: o painel */

/** Tudo o que o Painel de Vendas desenha, numa resposta só. */
export async function painel(db, { periodo = 'tudo' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const [geral, evo, cat, prod, orig, rank] = await Promise.all([
    visaoGeral(db, { periodo }),
    evolucao(db, { periodo, granularidade: 'mes' }),
    categoriasMaisVendidas(db, { periodo }),
    produtosMaisVendidos(db, { periodo, limite: 5, por: 'quantidade' }),
    porOrigem(db, { periodo }),
    clientesRanking(db, { periodo, limite: 5, ordem: 'faturamento' }),
  ]);

  /* ─── insights do rodapé. Só entram métricas que este mesmo payload
     sustenta. §19: nada de "+18% vs. período anterior" — a comparação com o
     período anterior NÃO está implementada, e um percentual inventado é pior
     que um cartão a menos. */
  const melhorMes = [...evo.pontos].sort((a, b) => b.faturamento - a.faturamento)[0] ?? null;
  const catCampea = cat.categorias[0] ?? null;
  const canalCampeao = orig.canais[0] ?? null;

  return {
    periodo: faixa,
    geral,
    evolucao: evo,
    categorias: cat,
    produtos: prod,
    origem: orig,
    topClientes: rank.clientes,
    insights: {
      categoriaCampea: catCampea && {
        nome: catCampea.categoria, pecas: catCampea.pecas, participacao: catCampea.participacao,
      },
      canalCampeao: canalCampeao && {
        nome: canalCampeao.canal, faturamento: canalCampeao.faturamento,
        participacao: canalCampeao.participacao,
      },
      melhorMes: melhorMes && {
        chave: melhorMes.chave, faturamento: melhorMes.faturamento,
        pecas: melhorMes.pecas, vendas: melhorMes.vendas,
      },
      ticketMedio: geral.ticketMedio.valor,
      clientesNovos: geral.clientesNovos,
    },
  };
}

/* ═══════════════════════════════════════════════════ ROTA AGREGADA: o CRM */

/** Tudo o que a aba Clientes desenha, numa resposta só. */
export async function crm(db, { periodo = 'tudo', topN = 5 } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const { clientes, intervaloBase, hoje } = await baseDeClientes(db, faixa);

  const porFaturamento = [...clientes].sort((a, b) => b.faturamento - a.faturamento);
  const top = porFaturamento.slice(0, topN);

  /* série mensal dos top N — o gráfico de linhas. Uma consulta só, filtrada
     pelos nomes já escolhidos, em vez de uma por cliente. */
  let serie = { meses: [], clientes: [] };
  if (top.length) {
    const V = cteVendas(faixa);
    const marks = top.map(() => '?').join(',');
    const { results } = await db.prepare(
      `WITH vd AS (${V.sql})
       SELECT COALESCE(norm,'sem-nome') AS norm, strftime('%Y-%m', data) AS mes,
              ROUND(SUM(faturamento), 2) AS faturamento,
              SUM(pecas) AS pecas, COUNT(*) AS vendas
         FROM vd
        WHERE data IS NOT NULL AND COALESCE(norm,'sem-nome') IN (${marks})
        GROUP BY norm, mes ORDER BY mes`,
    ).bind(...V.binds, ...top.map((c) => c.norm)).all();

    const meses = [...new Set((results ?? []).map((r) => r.mes))].sort();
    serie = {
      meses,
      clientes: top.map((c) => ({
        norm: c.norm,
        nome: c.nome,
        pontos: meses.map((m) => {
          const r = (results ?? []).find((x) => x.norm === c.norm && x.mes === m);
          return {
            mes: m,
            faturamento: r ? Number(r.faturamento) : 0,
            pecas: r ? Number(r.pecas) : 0,
            vendas: r ? Number(r.vendas) : 0,
          };
        }),
      })),
    };
  }

  const conta = (e) => clientes.filter((c) => c.estado === e).length;
  const total = clientes.length;
  const pct = (n) => (total > 0 ? +(n / total * 100).toFixed(1) : 0);

  const recorrentes = clientes.filter((c) => c.recorrente).length;
  const faturamentoTotal = clientes.reduce((s, c) => s + c.faturamento, 0);
  const vendasTotal = clientes.reduce((s, c) => s + c.vendas, 0);

  /* "Cliente novo" só significa alguma coisa dentro de um recorte. Em
     `tudo`, toda cliente teve a primeira compra dentro do período por
     definição, e o número seria a base inteira repetida num cartão. Devolve
     null, e a tela diz como obter o número em vez de mostrar um redundante. */
  const novos = faixa.de
    ? clientes.filter((c) => c.primeiraCompra
      && c.primeiraCompra >= faixa.de && c.primeiraCompra <= faixa.ate).length
    : null;

  /* oportunidades: quem já comprou, está fora da própria régua, e tem valor
     que justifique o contato. Ordenado por gasto — quem mais rendeu primeiro. */
  const reativacao = clientes
    .filter((c) => (c.estado === 'em risco' || c.estado === 'inativa') && c.vendas >= 1 && c.identificada)
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 12);

  /* canal preferido da BASE — deixando claro que é da base, não de um
     cliente (§28 pediu que a origem do número fosse explícita) */
  const canaisBase = await porOrigem(db, { periodo });
  const canalBase = canaisBase.canais[0] ?? null;

  const campeao = porFaturamento[0] ?? null;
  const maisFrequente = [...clientes].sort((a, b) => b.vendas - a.vendas)[0] ?? null;
  const maiorCompra = [...clientes].sort((a, b) => b.maiorCompra - a.maiorCompra)[0] ?? null;
  const maiorTicket = [...clientes].filter((c) => c.vendas >= 2)
    .sort((a, b) => (b.ticketMedio ?? 0) - (a.ticketMedio ?? 0))[0] ?? null;

  return {
    periodo: faixa,
    hoje,
    regua: { ...REGUA_RELACIONAMENTO, intervaloBaseDias: intervaloBase },

    kpis: {
      /* "ativos" = comprou dentro do período selecionado. Objetivo e
         conferível — não é "não-inativo", que dependeria da régua. */
      ativos: total,
      recorrentes,
      recorrentesPct: pct(recorrentes),
      novos,
      ticketMedioPorVenda: vendasTotal > 0 ? +(faturamentoTotal / vendasTotal).toFixed(2) : null,
      /* §22: NÃO é LTV. LTV projeta valor futuro; isto é o que já foi gasto,
         somado e dividido. O nome diz o que a conta faz. */
      valorHistoricoMedioPorCliente: total > 0 ? +(faturamentoTotal / total).toFixed(2) : null,
      faturamentoTotal: +faturamentoTotal.toFixed(2),
      vendasTotal,
    },

    serieTopClientes: serie,

    saudeBase: {
      total,
      grupos: [
        { estado: 'recorrente', rotulo: 'Recorrentes', n: conta('recorrente'), pct: pct(conta('recorrente')) },
        { estado: 'ativa', rotulo: 'Ativos', n: conta('ativa'), pct: pct(conta('ativa')) },
        { estado: 'em risco', rotulo: 'Em risco', n: conta('em risco'), pct: pct(conta('em risco')) },
        { estado: 'inativa', rotulo: 'Inativos', n: conta('inativa'), pct: pct(conta('inativa')) },
        { estado: 'sem histórico', rotulo: 'Sem histórico', n: conta('sem histórico'), pct: pct(conta('sem histórico')) },
      ].filter((g) => g.n > 0),
      explicacao: `A régua é a frequência de cada cliente: passou de ${REGUA_RELACIONAMENTO.fatorRisco}× `
        + `o próprio intervalo entre compras (mínimo de ${REGUA_RELACIONAMENTO.pisoRiscoDias} dias) entra em risco; `
        + `${REGUA_RELACIONAMENTO.fatorInativo}× (mínimo de ${REGUA_RELACIONAMENTO.pisoInativoDias}) vira inativa. `
        + `Quem só comprou uma vez usa o intervalo típico da base`
        + (intervaloBase ? `, hoje de ${intervaloBase} dias.` : '.'),
    },

    reativacao,
    topClientes: porFaturamento.slice(0, 10),
    todos: porFaturamento,

    insights: {
      campeao: campeao && { nome: campeao.nome, norm: campeao.norm, faturamento: campeao.faturamento, pecas: campeao.pecas },
      maisFrequente: maisFrequente && { nome: maisFrequente.nome, norm: maisFrequente.norm, vendas: maisFrequente.vendas },
      maiorCompra: maiorCompra && { nome: maiorCompra.nome, norm: maiorCompra.norm, valor: maiorCompra.maiorCompra },
      maiorTicket: maiorTicket && { nome: maiorTicket.nome, norm: maiorTicket.norm, ticketMedio: maiorTicket.ticketMedio },
      canalDaBase: canalBase && { nome: canalBase.canal, participacao: canalBase.participacao },
    },
  };
}
