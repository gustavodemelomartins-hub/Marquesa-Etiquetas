/** A linha do tempo da garantia, num lugar só.
 *
 *  Estas duas funções moravam dentro de `garantias.js`. Saíram em 5.3b por
 *  uma razão de dependência, não de estética: o núcleo único de pagamento
 *  de venda (`pagamento-venda.js`) precisa escrever o evento da diferença,
 *  e `garantias.js` precisa chamar aquele núcleo. Com as duas funções aqui,
 *  o grafo fica numa direção só:
 *
 *      garantia-eventos.js  ← pagamento-venda.js ← garantias.js
 *                           ← contas-receber.js
 *                           ← vendas-comandos.js
 *
 *  Nada de ciclo, e nenhuma das três portas de pagamento precisa reimplementar
 *  a escrita do evento.
 */

export async function evento(db, garantiaId, {
  tipo, data, statusNovo = null, observacao = null, dados = {},
}) {
  await db.prepare(
    `INSERT INTO garantia_eventos (garantia_id, tipo, data, status_novo, observacao, dados_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(garantiaId, tipo, data, statusNovo, observacao, JSON.stringify(dados ?? {})).run();
}

/** 5.4c — a diferença foi paga, e a linha do tempo da garantia tem de dizer.
 *
 *  Existem TRÊS portas para esse mesmo fato: a rota da garantia, a tela
 *  A Receber e `POST /api/vendas/:id/pagamento`. Desde 5.3b as três passam
 *  pelo mesmo núcleo, e é ele que chama esta função — uma vez, no lugar certo.
 *
 *  Ela é IDEMPOTENTE por construção: o evento é único por TROCA, não por
 *  garantia. A distinção importa — depois de um estorno a garantia pode
 *  receber uma troca nova, e o pagamento dessa segunda troca é um fato novo,
 *  que merece a própria linha. Repetir a chamada para a MESMA troca não
 *  escreve nada.
 *
 *  5.3b — e a idempotência olha o ÚLTIMO evento da troca, não a mera
 *  existência de um `diferenca_paga`. Desfazer o pagamento da venda reabre a
 *  diferença e escreve `diferenca_pagamento_desfeito`; pagar de novo depois
 *  disso é um fato novo e verdadeiro, e ficaria mudo se a checagem fosse
 *  "existe algum pagamento gravado?". Retry do mesmo clique continua não
 *  escrevendo nada, que é o que a idempotência existe para garantir.
 *
 *  Devolve `true` quando gravou, `false` quando já havia. */
export async function registrarPagamentoDaDiferenca(db, garantiaId, {
  trocaId, valor, pagaEm, vendaId = null, observacao = null,
}) {
  const ultimo = await db.prepare(
    `SELECT tipo FROM garantia_eventos
      WHERE garantia_id = ?
        AND tipo IN ('diferenca_paga', 'diferenca_pagamento_desfeito')
        AND json_extract(dados_json, '$.trocaId') = ?
      ORDER BY id DESC LIMIT 1`,
  ).bind(garantiaId, trocaId).first();
  if (ultimo && ultimo.tipo === 'diferenca_paga') return false;

  await evento(db, garantiaId, {
    tipo: 'diferenca_paga', data: pagaEm, observacao,
    dados: { trocaId, valor, de: 'a_receber', para: 'paga', vendaId },
  });
  return true;
}

/** 5.3b — o inverso, e ele existe porque o inverso acontece.
 *
 *  Desfazer o pagamento da venda que representa a diferença (§36) reabre a
 *  diferença: sem isto, `vendas` diria "não paga" e `garantia_trocas` diria
 *  "paga", que é exatamente a discordância entre tabelas que 5.3b existe para
 *  acabar. §28 — o fato não é apagado, ganha uma linha que o desfaz.
 *
 *  Idempotente pelo mesmo critério: só escreve quando o último evento da
 *  troca é um pagamento. */
export async function registrarPagamentoDaDiferencaDesfeito(db, garantiaId, {
  trocaId, valor, quando, vendaId = null, motivo = null,
}) {
  const ultimo = await db.prepare(
    `SELECT tipo FROM garantia_eventos
      WHERE garantia_id = ?
        AND tipo IN ('diferenca_paga', 'diferenca_pagamento_desfeito')
        AND json_extract(dados_json, '$.trocaId') = ?
      ORDER BY id DESC LIMIT 1`,
  ).bind(garantiaId, trocaId).first();
  if (!ultimo || ultimo.tipo !== 'diferenca_paga') return false;

  await evento(db, garantiaId, {
    tipo: 'diferenca_pagamento_desfeito', data: quando, observacao: motivo,
    dados: { trocaId, valor, de: 'paga', para: 'a_receber', vendaId },
  });
  return true;
}
