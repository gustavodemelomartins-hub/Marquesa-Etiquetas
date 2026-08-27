/** Inteligência comercial: os números da aba Vendas e do CRM.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  DUAS POPULAÇÕES, UMA LEITURA
 *
 *  As vendas da Marquesa vivem em dois lugares, e por bons motivos:
 *
 *    operacional  `vendas` + `venda_itens`  — tem pedido de verdade
 *                 (`vendas.id`), move estoque, e é o que o sistema registra
 *                 desde o go-live.
 *
 *    histórico    `vendas_historico_itens`  — a planilha antiga. Existe só no
 *                 nível do ITEM: a coluna `Nº` numera linhas, não pedidos.
 *                 Não move estoque e nunca moveu.
 *
 *  Faturamento, peças, clientes e produtos são somas de itens, então
 *  atravessam as duas populações e são EXATOS.
 *
 *  Contagem de pedidos e ticket médio, não: eles precisam de um pedido, e o
 *  histórico não tem. Toda função aqui que devolve esses dois números devolve
 *  junto de qual população ele saiu — e `pedidos.historico.disponivel` é
 *  `false` de propósito, não por falta de implementação.
 *
 *  Inventar um agrupamento (cliente + data, por exemplo) transformaria um
 *  acerto de maleta de 36 linhas em "uma compra de 36 peças" e produziria um
 *  ticket médio que ninguém consegue auditar. Melhor não ter o número.
 */

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

/** Monta o par (SQL, binds) do recorte, para as duas populações. */
function recorte(coluna, { de, ate }) {
  if (!de) return { sql: '', binds: [] };
  return { sql: ` AND ${coluna} >= ? AND ${coluna} <= ?`, binds: [de, ate] };
}

/* ═══════════════════════════════════════════════════════ visão geral (KPIs) */

export async function visaoGeral(db, { periodo = 'tudo' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const h = recorte('h.data', faixa);
  const v = recorte('v.data', faixa);

  /* histórico: soma de itens. `pago = 1` é o critério de faturamento —
   * `pago IS NULL` é desconhecido e não entra como receita. */
  const hist = await db.prepare(
    `SELECT COUNT(*)                        AS linhas,
            COALESCE(SUM(h.qtd), 0)         AS pecas,
            COALESCE(SUM(CASE WHEN h.pago = 1 THEN h.valor_total END), 0) AS faturamento,
            COUNT(DISTINCT h.cliente_nome_norm) AS clientes,
            COUNT(DISTINCT h.sku_base)      AS skus,
            MIN(h.data) AS de, MAX(h.data) AS ate
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
      WHERE 1 = 1${h.sql}`,
  ).bind(...h.binds).first();

  /* operacional: a venda cancelada sai do faturamento mas continua no
   * histórico — §28. */
  const oper = await db.prepare(
    `SELECT COUNT(DISTINCT v.id)            AS pedidos,
            COALESCE(SUM(i.qtd), 0)         AS pecas,
            COALESCE(SUM(i.qtd * i.preco), 0) AS faturamento,
            COUNT(DISTINCT COALESCE(v.cliente_id, v.cliente_nome)) AS clientes,
            COUNT(DISTINCT i.sku)           AS skus
       FROM vendas v
       JOIN venda_itens i ON i.venda_id = v.id
      WHERE v.cancelada = 0${v.sql}`,
  ).bind(...v.binds).first();

  const faturamento = Number(hist.faturamento) + Number(oper.faturamento);
  const pecas = Number(hist.pecas) + Number(oper.pecas);

  return {
    periodo: faixa,
    faturamento: +faturamento.toFixed(2),
    pecas,
    clientes: Number(hist.clientes) + Number(oper.clientes),
    skus: Number(hist.skus) + Number(oper.skus),
    valorMedioPorItem: pecas > 0 ? +(faturamento / pecas).toFixed(2) : null,

    historico: {
      linhas: hist.linhas,
      pecas: Number(hist.pecas),
      faturamento: +Number(hist.faturamento).toFixed(2),
      clientes: hist.clientes,
      periodo: { de: hist.de, ate: hist.ate },
    },
    operacional: {
      pedidos: oper.pedidos,
      pecas: Number(oper.pecas),
      faturamento: +Number(oper.faturamento).toFixed(2),
      clientes: oper.clientes,
      ticketMedio: oper.pedidos > 0
        ? +(Number(oper.faturamento) / oper.pedidos).toFixed(2) : null,
    },

    /* Onde a honestidade fica explícita para quem consome a API. */
    ticketMedio: {
      operacional: oper.pedidos > 0
        ? +(Number(oper.faturamento) / oper.pedidos).toFixed(2) : null,
      historico: null,
      historicoDisponivel: false,
      motivo: 'A planilha histórica identifica linhas, não pedidos — uma cliente '
        + 'aparece com dezenas de linhas na mesma data (acerto de maleta). Sem regra '
        + 'de agrupamento validada, um ticket médio histórico seria invenção.',
    },
  };
}

/* ═══════════════════════════════════════════════════════════ série temporal */

export async function evolucao(db, { periodo = 'tudo', granularidade = 'mes' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const fmt = granularidade === 'dia' ? '%Y-%m-%d' : '%Y-%m';
  const h = recorte('h.data', faixa);
  const v = recorte('v.data', faixa);

  const { results: hist } = await db.prepare(
    `SELECT strftime('${fmt}', h.data) AS chave,
            COALESCE(SUM(CASE WHEN h.pago = 1 THEN h.valor_total END), 0) AS faturamento,
            COALESCE(SUM(h.qtd), 0) AS pecas
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
      WHERE h.data IS NOT NULL${h.sql}
      GROUP BY chave`,
  ).bind(...h.binds).all();

  const { results: oper } = await db.prepare(
    `SELECT strftime('${fmt}', v.data) AS chave,
            COALESCE(SUM(i.qtd * i.preco), 0) AS faturamento,
            COALESCE(SUM(i.qtd), 0) AS pecas
       FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
      WHERE v.cancelada = 0${v.sql}
      GROUP BY chave`,
  ).bind(...v.binds).all();

  const m = new Map();
  const juntar = (linhas, campo) => {
    for (const l of linhas ?? []) {
      if (!l.chave) continue;
      if (!m.has(l.chave)) {
        m.set(l.chave, { chave: l.chave, faturamento: 0, pecas: 0, historico: 0, operacional: 0 });
      }
      const e = m.get(l.chave);
      e.faturamento += Number(l.faturamento);
      e.pecas += Number(l.pecas);
      e[campo] += Number(l.faturamento);
    }
  };
  juntar(hist, 'historico');
  juntar(oper, 'operacional');

  return {
    periodo: faixa,
    granularidade,
    pontos: [...m.values()]
      .map((p) => ({ ...p, faturamento: +p.faturamento.toFixed(2) }))
      .sort((a, b) => a.chave.localeCompare(b.chave)),
  };
}

/* ══════════════════════════════════════════════════════════════── produtos */

/** Mais vendidos. Casa o histórico com o catálogo de hoje pelo código-base,
 *  para trazer foto e nome atual — e devolve os DOIS nomes quando eles
 *  divergem, porque o nome de época é parte do histórico. */
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
      /* só é "renomeado" quando a peça existe hoje E o nome mudou */
      renomeado: !!(r.nome_atual && r.nome_historico && r.nome_atual !== r.nome_historico),
      noCatalogo: !!r.nome_atual,
      categoria: r.categoria,
      temFoto: !!(r.foto_tratada_key || r.foto_original_key || r.foto_url),
      pecas: Number(r.pecas),
      faturamento: Number(r.faturamento),
      participacao: total > 0 ? +(Number(r.faturamento) / total * 100).toFixed(1) : 0,
    })),
  };
}

export async function categoriasMaisVendidas(db, { periodo = 'tudo' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const h = recorte('h.data', faixa);
  const v = recorte('v.data', faixa);

  const { results } = await db.prepare(
    `WITH juntos AS (
       SELECT COALESCE(p.cat, h.tipo, 'Não classificado') AS cat, h.qtd AS qtd,
              CASE WHEN h.pago = 1 THEN h.valor_total ELSE 0 END AS valor
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
         LEFT JOIN produtos p ON UPPER(p.sku) = h.sku_base
        WHERE 1 = 1${h.sql}
       UNION ALL
       SELECT COALESCE(p.cat, 'Não classificado'), i.qtd, i.qtd * i.preco
         FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
         LEFT JOIN produtos p ON p.sku = i.sku
        WHERE v.cancelada = 0${v.sql}
     )
     SELECT cat AS categoria, SUM(qtd) AS pecas, ROUND(SUM(valor), 2) AS faturamento
       FROM juntos GROUP BY cat ORDER BY faturamento DESC`,
  ).bind(...h.binds, ...v.binds).all();

  const total = (results ?? []).reduce((s, r) => s + Number(r.faturamento), 0);
  return {
    periodo: faixa,
    categorias: (results ?? []).map((r) => ({
      categoria: r.categoria,
      pecas: Number(r.pecas),
      faturamento: Number(r.faturamento),
      participacao: total > 0 ? +(Number(r.faturamento) / total * 100).toFixed(1) : 0,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════── origem */

/** Canal, contexto e revendedora — a dimensão mais rica da planilha, que
 *  vinha escrita à mão em `Observação Venda`.
 *
 *  Devolve SEMPRE o bruto ao lado do classificado: a classificação precisa
 *  continuar conferível, e "Maleta (Feira Franceschini)" é o dado, enquanto
 *  canal=Maleta/contexto=Feira Franceschini é a leitura dele. */
export async function porOrigem(db, { periodo = 'tudo' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const h = recorte('h.data', faixa);

  const agrupar = async (colunas, rotulo) => {
    const { results } = await db.prepare(
      `SELECT ${colunas} AS chave,
              COUNT(*) AS linhas,
              SUM(h.qtd) AS pecas,
              ROUND(SUM(CASE WHEN h.pago = 1 THEN h.valor_total ELSE 0 END), 2) AS faturamento,
              COUNT(DISTINCT h.cliente_nome_norm) AS clientes
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
        WHERE 1 = 1${h.sql}
        GROUP BY chave ORDER BY faturamento DESC`,
    ).bind(...h.binds).all();
    const total = (results ?? []).reduce((s, r) => s + Number(r.faturamento), 0);
    return (results ?? []).map((r) => ({
      [rotulo]: r.chave ?? '(não classificado)',
      linhas: r.linhas,
      pecas: Number(r.pecas ?? 0),
      faturamento: Number(r.faturamento),
      clientes: r.clientes,
      participacao: total > 0 ? +(Number(r.faturamento) / total * 100).toFixed(1) : 0,
    }));
  };

  const [canais, contextos, brutos] = await Promise.all([
    agrupar('h.canal', 'canal'),
    agrupar("COALESCE(h.canal, '?') || CASE WHEN h.contexto IS NULL THEN '' ELSE ' · ' || h.contexto END", 'origem'),
    agrupar('h.observacao_original', 'texto'),
  ]);

  /* vendas operacionais entram como canal próprio, sem se misturar ao
   * histórico: origem='site' é a Nuvemshop, 'balcao' é a tela, 'acerto' é
   * maleta fechada */
  const { results: operacional } = await db.prepare(
    `SELECT v.origem AS canal, COUNT(DISTINCT v.id) AS pedidos,
            SUM(i.qtd) AS pecas, ROUND(SUM(i.qtd * i.preco), 2) AS faturamento
       FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
      WHERE v.cancelada = 0 GROUP BY v.origem ORDER BY faturamento DESC`,
  ).all();

  return {
    periodo: faixa,
    canais,
    contextos,
    /* o texto exatamente como a Sthefany escreveu — a auditoria da classificação */
    brutos,
    operacional: (operacional ?? []).map((r) => ({
      canal: r.canal, pedidos: r.pedidos,
      pecas: Number(r.pecas ?? 0), faturamento: Number(r.faturamento ?? 0),
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════── clientes */

/** Ranking de clientes. Une histórico e operacional pelo nome normalizado
 *  quando não há `cliente_id` — que é o caso de todo o histórico até alguém
 *  resolver a revisão de vínculo. */
export async function clientesRanking(db, { periodo = 'tudo', limite = 50, ordem = 'faturamento' } = {}) {
  const faixa = faixaDePeriodo(periodo);
  const h = recorte('h.data', faixa);
  const v = recorte('v.data', faixa);
  const col = { faturamento: 'faturamento', pecas: 'pecas', compras: 'datas_distintas' }[ordem] ?? 'faturamento';

  const { results } = await db.prepare(
    `WITH juntos AS (
       SELECT h.cliente_id AS cid, h.cliente_nome_norm AS norm,
              h.cliente_nome_original AS nome, h.data AS data, h.qtd AS qtd,
              CASE WHEN h.pago = 1 THEN h.valor_total ELSE 0 END AS valor,
              'historico' AS fonte
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
        WHERE 1 = 1${h.sql}
       UNION ALL
       SELECT v.cliente_id, LOWER(TRIM(COALESCE(c.nome, v.cliente_nome))),
              COALESCE(c.nome, v.cliente_nome), v.data, i.qtd, i.qtd * i.preco, 'operacional'
         FROM vendas v
         JOIN venda_itens i ON i.venda_id = v.id
         LEFT JOIN clientes c ON c.id = v.cliente_id
        WHERE v.cancelada = 0${v.sql}
     )
     SELECT COALESCE(norm, 'sem-nome')  AS norm,
            MAX(cid)                    AS cliente_id,
            MAX(nome)                   AS nome,
            SUM(qtd)                    AS pecas,
            ROUND(SUM(valor), 2)        AS faturamento,
            COUNT(DISTINCT data)        AS datas_distintas,
            MIN(data)                   AS primeira,
            MAX(data)                   AS ultima,
            SUM(CASE WHEN fonte = 'operacional' THEN 1 ELSE 0 END) AS itens_operacional
       FROM juntos
      GROUP BY norm
      ORDER BY ${col} DESC
      LIMIT ?`,
  ).bind(...h.binds, ...v.binds, limite).all();

  const hoje = new Date().toISOString().slice(0, 10);
  return {
    periodo: faixa,
    ordem,
    clientes: (results ?? []).map((r) => ({
      clienteId: r.cliente_id,
      nome: r.nome,
      norm: r.norm,
      pecas: Number(r.pecas ?? 0),
      faturamento: Number(r.faturamento ?? 0),
      /* "datas distintas em que comprou". NÃO é número de pedidos — duas
       * compras no mesmo dia contam uma vez. O nome do campo diz isso. */
      datasComCompra: r.datas_distintas,
      primeiraCompra: r.primeira,
      ultimaCompra: r.ultima,
      gastoMedioPorPeca: r.pecas > 0 ? +(Number(r.faturamento) / Number(r.pecas)).toFixed(2) : null,
      relacionamento: classificarRelacionamento(r, hoje),
    })),
  };
}

/** Deriva o estado do relacionamento dos dados — nunca de lista fixa.
 *
 *  Os cortes (90 e 180 dias) são convenção declarada, não verdade do
 *  negócio; ficam aqui num lugar só para poderem ser ajustados com a
 *  operação em vez de espalhados pela tela. */
export function classificarRelacionamento(r, hoje) {
  const ultima = r.ultima ?? r.ultimaCompra;
  if (!ultima) return 'sem histórico';
  const dias = Math.floor((Date.parse(hoje) - Date.parse(ultima)) / 86400000);
  const datas = Number(r.datas_distintas ?? r.datasComCompra ?? 0);
  if (dias > 180) return 'para reativação';
  if (dias > 90) return 'em risco';
  if (datas >= 3) return 'recorrente';
  if (datas === 1) return 'nova';
  return 'ativa';
}

/** O perfil de UMA cliente: dados, resumo comercial, histórico e preferências.
 *
 *  Aceita `clienteId` (cadastro) ou `norm` (nome normalizado) — o histórico
 *  antigo só tem nome, então exigir id deixaria 348 clientes sem perfil. */
export async function perfilCliente(db, { clienteId = null, norm = null } = {}) {
  if (clienteId === null && norm === null) return { ok: false, erro: 'Informe clienteId ou norm.' };

  const cadastro = clienteId !== null
    ? await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(clienteId).first()
    : await db.prepare('SELECT * FROM clientes WHERE nome_norm = ? LIMIT 1').bind(norm).first();

  const chaveNorm = norm ?? cadastro?.nome_norm ?? null;

  const { results: itens } = await db.prepare(
    `SELECT h.data, h.sku, h.sku_base, h.nome_produto_historico AS nome, h.qtd,
            h.valor_total AS valor, h.canal, h.contexto, h.pago,
            h.observacao_original, 'historico' AS fonte, NULL AS venda_id
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
      WHERE (h.cliente_id IS NOT NULL AND h.cliente_id = ?) OR h.cliente_nome_norm = ?
      UNION ALL
     SELECT v.data, i.sku, UPPER(i.sku), i.desc, i.qtd, i.qtd * i.preco,
            v.origem, NULL, 1, NULL, 'operacional', v.id
       FROM vendas v JOIN venda_itens i ON i.venda_id = v.id
       LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE v.cancelada = 0
        AND ((v.cliente_id IS NOT NULL AND v.cliente_id = ?)
             OR LOWER(TRIM(COALESCE(c.nome, v.cliente_nome))) = ?)
      ORDER BY data DESC`,
  ).bind(clienteId, chaveNorm, clienteId, chaveNorm).all();

  const linhas = itens ?? [];
  const pago = linhas.filter((l) => l.pago === 1);
  const faturamento = pago.reduce((s, l) => s + Number(l.valor ?? 0), 0);
  const pecas = linhas.reduce((s, l) => s + Number(l.qtd ?? 0), 0);
  const datas = [...new Set(linhas.map((l) => l.data).filter(Boolean))].sort();

  const contar = (campo) => {
    const m = new Map();
    for (const l of linhas) {
      const k = l[campo] ?? '(não classificado)';
      m.set(k, (m.get(k) ?? 0) + Number(l.qtd ?? 0));
    }
    return [...m.entries()].map(([valor, pecas]) => ({ valor, pecas }))
      .sort((a, b) => b.pecas - a.pecas);
  };

  const hoje = new Date().toISOString().slice(0, 10);
  const pedidosReais = new Set(linhas.filter((l) => l.venda_id).map((l) => l.venda_id)).size;

  return {
    ok: true,
    cadastro: cadastro ?? null,
    norm: chaveNorm,
    resumo: {
      faturamento: +faturamento.toFixed(2),
      pecas,
      datasComCompra: datas.length,
      primeiraCompra: datas[0] ?? null,
      ultimaCompra: datas[datas.length - 1] ?? null,
      gastoMedioPorPeca: pecas > 0 ? +(faturamento / pecas).toFixed(2) : null,
      relacionamento: classificarRelacionamento(
        { ultima: datas[datas.length - 1] ?? null, datas_distintas: datas.length }, hoje,
      ),
      pedidosOperacionais: pedidosReais,
      ticketMedioOperacional: null,   /* preenchido abaixo quando há pedido */
    },
    canalPreferido: contar('canal')[0]?.valor ?? null,
    produtosPreferidos: contar('nome').slice(0, 10),
    historico: linhas.slice(0, 200),
    totalItens: linhas.length,
  };
}

/* ══════════════════════════════════════════════════════ lista operacional */

/** A listagem de vendas com os filtros que a operação usa. Junta as duas
 *  populações e diz de qual cada linha veio. */
export async function listarVendasUnificado(db, {
  de = null, ate = null, busca = null, canal = null, limite = 200, offset = 0,
} = {}) {
  const like = busca ? `%${String(busca).toLowerCase()}%` : null;

  const { results } = await db.prepare(
    `WITH juntos AS (
       SELECT 'historico' AS fonte, h.id AS id, NULL AS venda_id,
              h.origem_linha AS referencia, h.data AS data,
              h.cliente_nome_original AS cliente, h.cliente_nome_norm AS cliente_norm,
              h.sku AS sku, h.nome_produto_historico AS produto, h.qtd AS qtd,
              h.valor_total AS valor, h.canal AS canal, h.contexto AS contexto,
              h.observacao_original AS observacao, h.pago AS pago, 0 AS cancelada
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
       UNION ALL
       SELECT 'operacional', i.rowid, v.id, CAST(v.id AS TEXT), v.data,
              COALESCE(c.nome, v.cliente_nome), LOWER(TRIM(COALESCE(c.nome, v.cliente_nome))),
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
