/** Fase 5.3f · G10 — a razão contábil do dinheiro.
 *
 *  O gap estrutural de §9, escrito com todas as letras: *"estoque tem razão
 *  contábil verificável; recebíveis não têm nada equivalente"*.
 *
 *  `GET /api/estoque/conferir` faz uma pergunta só e não aceita "mais ou
 *  menos": `produtos.qtd == SUM(movimentos.qtd)`. Dinheiro não tem uma
 *  igualdade única — tem um conjunto de estados que NÃO PODEM coexistir. Cada
 *  verificação aqui é um deles, e cada uma nasceu de um defeito real da
 *  auditoria de 5.3, não de imaginação:
 *
 *    B4  `pago = 1` com `valor_recebido` menor que o total
 *    B6  recebido MAIOR que o total, escondido por `Math.max(0, …)`
 *    §28 venda cancelada que continua cobrável
 *    5.3b troca `a_receber` cuja venda já foi paga — o dinheiro entrou e a
 *         outra ponta não soube
 *    5.3e saldo de crédito negativo
 *
 *  **Este módulo não conserta nada.** Ele mede. Consertar cada caso exige
 *  decidir o que aconteceu de verdade — quem pagou, quanto, quando —, e essa
 *  é exatamente a decisão que um script não pode tomar sozinho sem inventar
 *  dinheiro. A resposta nomeia a linha e o valor para que alguém decida.
 *
 *  Módulo FOLHA: importa só `credito.js`, que também é folha.
 */

import { conferirCredito } from './credito.js';

/** Dinheiro em REAL ainda mora em `vendas`, `venda_itens` e `garantia_trocas`
 *  (a conversão é 5.7). Comparar REAL com `<` direto faria esta conferência
 *  acusar diferença de meio centavo que não existe — e uma verificação que
 *  grita à toa é desligada pela primeira pessoa que a vê. A tolerância é UM
 *  centavo, em centavos inteiros, e está escrita aqui em vez de espalhada. */
const TOLERANCIA_CENTAVOS = 1;
const centavos = (v) => Math.round(Number(v ?? 0) * 100);

async function linhas(db, sql) {
  const { results } = await db.prepare(sql).all().catch(() => ({ results: [] }));
  return results ?? [];
}

export async function conferirFinanceiro(db) {
  const checagens = [];

  /* ── B4: a venda diz que foi paga e o valor registrado não cobre o total.
     Uma das duas afirmações é falsa, e as duas viraram estado no banco pela
     porta que 5.3b unificou. Quem decide qual é a verdadeira é humano. */
  const pagaIncompleta = (await linhas(db,
    `SELECT id, total, valor_recebido, data_pagamento, pagamento_origem
       FROM vendas
      WHERE pago = 1 AND cancelada = 0 AND valor_recebido IS NOT NULL`,
  )).filter((v) => centavos(v.total) - centavos(v.valor_recebido) > TOLERANCIA_CENTAVOS);
  checagens.push({
    id: 'venda_paga_com_recebido_menor',
    origem: 'B4',
    invariante: 'pago = 1 implica valor_recebido >= total (quando o valor é conhecido)',
    divergentes: pagaIncompleta.map((v) => ({
      vendaId: Number(v.id),
      totalCentavos: centavos(v.total),
      recebidoCentavos: centavos(v.valor_recebido),
      faltamCentavos: centavos(v.total) - centavos(v.valor_recebido),
      dataPagamento: v.data_pagamento ?? null,
    })),
  });

  /* ── B6: recebeu a MAIS. `contas-receber.js` faz `Math.max(0, …)` e o saldo
     vira zero em silêncio; `historico-operacoes.js` recusa explicitamente, e
     está certo. A sobra é crédito da cliente ou erro de digitação — as duas
     precisam de alguém olhando, e nenhuma pode desaparecer. */
  const sobra = (await linhas(db,
    `SELECT id, total, valor_recebido FROM vendas
      WHERE valor_recebido IS NOT NULL AND cancelada = 0`,
  )).filter((v) => centavos(v.valor_recebido) - centavos(v.total) > TOLERANCIA_CENTAVOS);
  checagens.push({
    id: 'venda_recebido_maior_que_total',
    origem: 'B6',
    invariante: 'valor_recebido <= total — a sobra não pode virar zero em silêncio',
    divergentes: sobra.map((v) => ({
      vendaId: Number(v.id),
      totalCentavos: centavos(v.total),
      recebidoCentavos: centavos(v.valor_recebido),
      sobraCentavos: centavos(v.valor_recebido) - centavos(v.total),
    })),
  });

  /* ── §28: cancelar tira do A Receber. Uma venda cancelada que continuou
     cobrável é dívida de uma compra que não existe — foi assim que B5
     transformou um pedido reembolsado em cobrança de R$ 250. */
  const canceladaCobravel = await linhas(db,
    `SELECT id, total, data FROM vendas
      WHERE cancelada = 1 AND cobravel = 1 AND pago = 0`,
  );
  checagens.push({
    id: 'venda_cancelada_ainda_cobravel',
    origem: '§28 · B5',
    invariante: 'venda cancelada não é cobrável',
    divergentes: canceladaCobravel.map((v) => ({
      vendaId: Number(v.id), totalCentavos: centavos(v.total), data: v.data,
    })),
  });

  /* ── 5.3b: a diferença da troca nasce como venda (§36). Se a venda foi paga
     e a troca continua `a_receber`, o dinheiro entrou por uma ponta e a outra
     não soube — exatamente a divergência que o núcleo único existe para
     impedir. Aparecer aqui significa que alguém escreveu fora dele. */
  const trocaDessincronizada = await linhas(db,
    `SELECT t.id AS troca_id, t.garantia_id, t.venda_id, t.diferenca, v.data_pagamento
       FROM garantia_trocas t JOIN vendas v ON v.id = t.venda_id
      WHERE t.estornada = 0 AND t.diferenca_status = 'a_receber'
        AND v.pago = 1 AND v.cancelada = 0`,
  );
  checagens.push({
    id: 'troca_a_receber_com_venda_paga',
    origem: '5.3b',
    invariante: 'a troca e a venda que a representa dizem a mesma coisa sobre o pagamento',
    divergentes: trocaDessincronizada.map((t) => ({
      trocaId: Number(t.troca_id),
      garantiaId: Number(t.garantia_id),
      vendaId: Number(t.venda_id),
      diferencaCentavos: centavos(t.diferenca),
      vendaPagaEm: t.data_pagamento ?? null,
    })),
  });

  /* ── o CHECK do schema cobre bancos novos; bancos migrados podem carregar
     linhas anteriores a ele. Uma diferença "paga" sem data não tem mês, e
     §29 diz que é a data do pagamento que decide o faturamento. */
  const pagaSemData = await linhas(db,
    `SELECT id, garantia_id, diferenca FROM garantia_trocas
      WHERE diferenca_status = 'paga' AND diferenca_paga_em IS NULL`,
  );
  checagens.push({
    id: 'troca_paga_sem_data',
    origem: '§29',
    invariante: 'diferença paga tem data de pagamento — sem ela, não tem mês',
    divergentes: pagaSemData.map((t) => ({
      trocaId: Number(t.id), garantiaId: Number(t.garantia_id), diferencaCentavos: centavos(t.diferenca),
    })),
  });

  /* ── 5.3e: a mesma invariante da razão de crédito, no mesmo painel. Quem
     pergunta "o dinheiro está consistente?" não deveria precisar saber que
     existem duas rotas para isso. */
  const credito = await conferirCredito(db);
  checagens.push({
    id: 'credito_saldo_negativo',
    origem: '5.3e',
    invariante: 'SUM(credito_movimentos.valor_centavos) >= 0 por cliente',
    divergentes: credito.divergentes,
  });

  const total = checagens.reduce((n, c) => n + c.divergentes.length, 0);
  return {
    ok: total === 0,
    total,
    /* O painel devolve TODAS as verificações, inclusive as limpas. Uma lista
       que só mostra problema não deixa ninguém ver o que foi conferido — e
       "nada apareceu" precisa poder ser distinguido de "nada foi olhado". */
    checagens,
    toleranciaCentavos: TOLERANCIA_CENTAVOS,
    regra: 'Cada verificação nasceu de um defeito real da auditoria de 5.3. '
      + 'Este endpoint MEDE e não conserta: consertar exige decidir quem pagou '
      + 'quanto e quando, e isso nenhum script decide sozinho sem inventar dinheiro.',
  };
}
