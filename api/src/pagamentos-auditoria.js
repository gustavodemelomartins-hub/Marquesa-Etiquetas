/** §1 da revisão pré-go-live — o estado de pagamento das vendas, por prova.
 *
 *  O defeito que este módulo existe para impedir: uma migration que marca
 *  toda venda como paga transforma conta a receber real em faturamento, e
 *  ninguém percebe, porque o número sobe em vez de sumir.
 *
 *  A classificação abaixo é a MESMA que `migracao-vendas-pagamento.sql`
 *  aplica no backfill — e é escrita para rodar ANTES dele, sem depender de
 *  nenhuma coluna nova. É o relatório que se lê para decidir, não o efeito
 *  de já ter decidido.
 *
 *  Nada aqui escreve. */

/* A evidência mora fora de `vendas`: numa operação histórica amarrada à
   venda por `historico_operacao_vendas`. Cobrança aberta é pendência
   provada; cobrança paga com `paga_em` é pagamento provado, COM data. */
const evidencia = (estado) => `EXISTS (
  SELECT 1 FROM historico_operacao_vendas hov
    JOIN historico_operacoes ho ON ho.id = hov.operacao_id
   WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa'
     AND ho.status_registro = 'ativa' AND ho.cobranca_status = '${estado}'
     ${estado === 'paga' ? 'AND ho.paga_em IS NOT NULL' : ''})`;

const CLASSE = `CASE
  WHEN ${evidencia('aberta')} THEN 'evidencia_pendencia'
  WHEN ${evidencia('paga')}   THEN 'evidencia_pagamento'
  WHEN v.origem = 'site'      THEN 'indeterminado_site'
  ELSE 'sem_evidencia_legado' END`;

export const CLASSES = {
  evidencia_pendencia: {
    rotulo: 'Evidência de pendência',
    decisao: 'pago = 0, sem data de pagamento',
    porque: 'existe cobrança ABERTA amarrada a esta venda — é conta a receber de verdade',
  },
  evidencia_pagamento: {
    rotulo: 'Evidência de pagamento',
    decisao: "pago = 1, data vinda de `paga_em`",
    porque: 'a cobrança foi marcada paga e guardou a data real do recebimento',
  },
  indeterminado_site: {
    rotulo: 'Indeterminado (pedido do site)',
    decisao: 'faturamento 0 e A Receber 0 — a ausência de informação permanece ausência',
    porque: 'o banco nunca guardou o estado do pagamento deste pedido. Sem evidência '
      + 'de recebimento não há faturamento; sem evidência de dívida não há conta a '
      + 'receber. A linha vira pendência de conferência financeira',
    conferenciaHumana: true,
  },
  sem_evidencia_legado: {
    rotulo: 'Legado sem evidência',
    decisao: 'pago = 1, data da venda como aproximação DECLARADA',
    porque: 'nunca existiu informação de pagamento para esta linha, e o sistema '
      + 'sempre a contou no dia da venda — a migration preserva isso, sem chamar de fato',
  },
};

/** O retrato. `ok: true` sempre que a leitura foi possível — o julgamento é
 *  de quem lê, não daqui. */
export async function auditoriaPagamentos(db, { limiteLista = 200 } = {}) {
  const { results } = await db.prepare(
    `SELECT classe, COUNT(*) AS vendas, ROUND(COALESCE(SUM(total), 0), 2) AS valor,
            MIN(data) AS primeira, MAX(data) AS ultima
       FROM (SELECT v.id, v.total, v.data, ${CLASSE} AS classe
               FROM vendas v WHERE v.cancelada = 0)
      GROUP BY classe ORDER BY classe`,
  ).all();

  const porClasse = (results ?? []).map((r) => ({
    classe: r.classe,
    ...CLASSES[r.classe],
    vendas: Number(r.vendas ?? 0),
    valor: Number(r.valor ?? 0),
    primeira: r.primeira ?? null,
    ultima: r.ultima ?? null,
  }));

  /* A lista nominal do que ficou indeterminado. Número agregado não se
     confere: quem decide precisa ver o pedido, a data e o valor. */
  const indeterminadas = (await db.prepare(
    `SELECT id, data, total, externo_id, cliente_nome
       FROM vendas WHERE cancelada = 0 AND origem = 'site'
      ORDER BY data DESC, id DESC LIMIT ?`,
  ).bind(limiteLista).all()).results ?? [];

  /* O que a migration NÃO pode mover: as contas a receber que já existem. */
  let contasReceber = [];
  try {
    contasReceber = (await db.prepare(
      `SELECT cobranca_status, COUNT(*) AS operacoes,
              COALESCE(SUM(saldo_centavos), 0) AS saldo_centavos
         FROM historico_operacoes
        WHERE status_registro = 'ativa' AND papel = 'cliente'
        GROUP BY cobranca_status ORDER BY cobranca_status`,
    ).all()).results ?? [];
  } catch { contasReceber = []; }

  /* O estado REAL, quando as colunas já existem. Antes da migration esta
     parte simplesmente não responde — e dizer isso é melhor que devolver
     zero, que pareceria "nenhuma venda a receber". */
  let gravado = null;
  try {
    gravado = (await db.prepare(
      `SELECT COALESCE(pagamento_origem, '(sem carimbo)') AS pagamento_origem,
              pago, COUNT(*) AS vendas, ROUND(COALESCE(SUM(total), 0), 2) AS valor
         FROM vendas WHERE cancelada = 0
        GROUP BY pagamento_origem, pago ORDER BY pagamento_origem, pago`,
    ).all()).results ?? [];
  } catch { gravado = null; }

  const acha = (c) => porClasse.find((x) => x.classe === c);
  return {
    ok: true,
    porClasse,
    indeterminadas,
    contasReceber,
    /* `null` = a migration ainda não rodou neste banco. */
    estadoGravado: gravado,
    resumo: {
      /* `indeterminado_site` NÃO entra em pagas: ele não é nem pago nem a
         receber — é falta de informação, e conta-se à parte. */
      pagas: (acha('evidencia_pagamento')?.vendas ?? 0) + (acha('sem_evidencia_legado')?.vendas ?? 0),
      naoPagas: acha('evidencia_pendencia')?.vendas ?? 0,
      indeterminadas: acha('indeterminado_site')?.vendas ?? 0,
      valorNaoPago: acha('evidencia_pendencia')?.valor ?? 0,
      valorIndeterminado: acha('indeterminado_site')?.valor ?? 0,
    },
    naoFaz: [
      'não escreve nada — este relatório existe para ser lido ANTES da migration',
      'não decide o estado de pedido do site: o banco não guarda pagamento da loja',
      'não move conta a receber: cobrança aberta continua aberta depois do backfill',
    ],
  };
}
