/** §31 — GARANTIA E REPARO
 *
 *  A garantia pertence ao ITEM da compra. Não ao cliente, não ao código.
 *  Se a mesma cliente comprou o mesmo SKU três vezes, prender a garantia ao
 *  SKU perde qual compra a originou — e perde junto o valor que ela
 *  efetivamente pagou naquele dia, que é a base da diferença de uma troca.
 *
 *  O que a garantia deliberadamente NÃO faz:
 *
 *    · não altera a venda original (nem total, nem itens, nem data);
 *    · não devolve a peça defeituosa ao estoque vendável — a peça está
 *      quebrada, e somá-la ao disponível a colocaria à venda de novo;
 *    · não gera faturamento. Nem a abertura, nem a devolução, nem a troca.
 *
 *  A ÚNICA receita que nasce daqui é a DIFERENÇA de uma troca, quando paga,
 *  e ela entra pela data do pagamento (§29) — nunca o preço cheio da peça
 *  nova. Trocar um anel de R$ 89 por um de R$ 99 acrescenta R$ 10 ao
 *  faturamento, não R$ 99, e não conta como uma segunda compra.
 */
import { movimentar, saldosDoSku, componentesDoKit } from './estoque.js';
import { carregarFeriados, prazoDaGarantia, somarDiasUteis } from './dias-uteis.js';
import { normalizarNomeCliente } from './vendas-historico-normalizar.js';

const STATUS = new Set(['em_reparo', 'reparada', 'devolvida', 'sem_conserto', 'concluida', 'cancelada']);
/** Os que ainda pedem alguma coisa de alguém. São estes que o Painel mostra;
 *  os outros saem da tela e continuam inteiros no histórico da cliente. */
const PENDENTES = ['em_reparo', 'reparada', 'sem_conserto'];
const ROTULO_STATUS = {
  em_reparo: 'Em reparo',
  reparada: 'Reparada · aguardando entrega',
  devolvida: 'Peça devolvida',
  sem_conserto: 'Sem conserto · troca autorizada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const hojeISO = () => new Date().toISOString().slice(0, 10);
const dataValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dinheiro = (v) => Math.round(Number(v) * 100) / 100;

/* ═════════════════════════════════════════════ de qual item ela está falando

   Duas populações de venda, duas maneiras de apontar o item:

   operacional → `venda_itens` não tem chave própria, e `rowid` não é estável
                 entre VACUUMs. A identidade é (venda_id, sku, variante_id):
                 uma venda não tem duas linhas do mesmo código na mesma
                 variante, então o trio identifica a linha sem ambiguidade.
   histórico   → `vendas_historico_itens.id` é chave primária de verdade.

   Nos dois casos o que importa não é só achar o item: é achar o VALOR
   EFETIVAMENTE PAGO por ele. Usar o preço de tabela cobraria a mais numa
   troca de peça que saiu com desconto. */

async function itemOperacional(db, { vendaId, sku, varianteId = null }) {
  const venda = await db.prepare('SELECT * FROM vendas WHERE id = ?').bind(vendaId).first();
  if (!venda) return { erro: `Venda ${vendaId} não existe.` };
  if (venda.cancelada) return { erro: `A venda ${vendaId} está cancelada.` };

  const item = await db.prepare(
    `SELECT * FROM venda_itens
      WHERE venda_id = ? AND sku = ?
        AND (variante_id IS ? OR ? IS NULL)
      LIMIT 1`,
  ).bind(vendaId, sku, varianteId, varianteId).first();
  if (!item) return { erro: `A venda ${vendaId} não tem o código ${sku}.` };

  return {
    origemFonte: 'operacional',
    vendaId: venda.id,
    historicoItemId: null,
    vendaHistoricaId: null,
    clienteId: venda.cliente_id ?? null,
    clienteNome: venda.cliente_nome ?? null,
    clienteNomeNorm: venda.cliente_nome_norm ?? null,
    sku: item.sku,
    variacao: item.variacao ?? null,
    varianteId: item.variante_id ?? null,
    produtoNome: item.desc,
    dataVenda: venda.data,
    /* `preco` é o que foi COBRADO por unidade — já com o desconto de §27. */
    valorPagoOriginal: dinheiro(item.preco),
  };
}

async function itemHistorico(db, { historicoItemId }) {
  const item = await db.prepare(
    `SELECT h.*, vh.id AS venda_historica_id, vh.data AS venda_data
       FROM vendas_historico_itens h
       LEFT JOIN vendas_historicas vh ON vh.id = h.venda_historica_id
      WHERE h.id = ?`,
  ).bind(historicoItemId).first();
  if (!item) return { erro: `Linha histórica ${historicoItemId} não existe.` };

  /* O valor pago por UNIDADE. `valor_total` é a linha inteira; dividir pela
     quantidade é o que dá o preço da peça que voltou. Sem valor conhecido a
     garantia ainda pode ser aberta — mas a troca vai precisar do número, e
     a tela cobra ali, não aqui. */
  const qtd = Number(item.qtd) || 1;
  const unit = item.valor_total != null ? Number(item.valor_total) / qtd
    : (item.preco_unit != null ? Number(item.preco_unit) : null);

  return {
    origemFonte: 'historico',
    vendaId: null,
    historicoItemId: item.id,
    vendaHistoricaId: item.venda_historica_id ?? null,
    clienteId: item.cliente_id ?? null,
    clienteNome: item.cliente_nome_original ?? null,
    clienteNomeNorm: item.cliente_nome_norm ?? null,
    sku: item.sku_base || item.sku,
    variacao: null,
    varianteId: null,
    produtoNome: item.nome_produto_historico ?? item.sku,
    dataVenda: item.data ?? item.venda_data ?? null,
    valorPagoOriginal: unit == null ? null : dinheiro(unit),
  };
}

/* ═══════════════════════════════════════════════════════════════ abertura */

export async function abrirGarantia(db, corpo = {}) {
  const motivo = String(corpo.motivo ?? '').trim();
  if (!motivo) return { ok: false, statusHttp: 400, erro: 'Diga qual é o problema da peça.' };

  const dataEntrada = corpo.dataEntrada ? String(corpo.dataEntrada).trim() : hojeISO();
  if (!dataValida(dataEntrada)) return { ok: false, statusHttp: 400, erro: 'Data de entrada inválida. Use AAAA-MM-DD.' };
  if (dataEntrada > hojeISO()) return { ok: false, statusHttp: 400, erro: `${dataEntrada} ainda não chegou.` };

  const prazo = Number(corpo.prazoDiasUteis ?? 45);
  if (!Number.isInteger(prazo) || prazo <= 0) {
    return { ok: false, statusHttp: 400, erro: 'Prazo tem que ser um número inteiro de dias úteis.' };
  }

  let base;
  if (corpo.historicoItemId != null) {
    base = await itemHistorico(db, { historicoItemId: Number(corpo.historicoItemId) });
  } else if (corpo.vendaId != null && corpo.sku) {
    base = await itemOperacional(db, {
      vendaId: Number(corpo.vendaId),
      sku: String(corpo.sku).trim().toUpperCase(),
      varianteId: corpo.varianteId == null || corpo.varianteId === '' ? null : String(corpo.varianteId),
    });
  } else {
    return {
      ok: false, statusHttp: 400,
      erro: 'Diga qual item da compra: (vendaId + sku) ou historicoItemId.',
    };
  }
  if (base.erro) return { ok: false, statusHttp: 404, erro: base.erro };

  /* A mesma peça da mesma compra não abre duas garantias ABERTAS. Duas
     linhas pendentes para o mesmo anel são sempre um clique repetido, e a
     segunda ficaria pendurada no Painel para sempre. */
  const jaAberta = await db.prepare(
    `SELECT id FROM garantias
      WHERE status IN ('em_reparo', 'reparada', 'sem_conserto')
        AND ((? IS NOT NULL AND venda_id = ? AND sku = ?)
          OR (? IS NOT NULL AND historico_item_id = ?))
      LIMIT 1`,
  ).bind(base.vendaId, base.vendaId, base.sku, base.historicoItemId, base.historicoItemId).first();
  if (jaAberta) {
    return { ok: false, statusHttp: 409, erro: `Esta peça já tem a garantia ${jaAberta.id} em aberto.`, garantiaId: jaAberta.id };
  }

  const feriados = await carregarFeriados(db);
  const previsao = somarDiasUteis(dataEntrada, prazo, feriados);

  const g = await db.prepare(
    `INSERT INTO garantias
       (origem_fonte, venda_id, historico_item_id, venda_historica_id,
        cliente_id, cliente_nome_norm, cliente_nome,
        sku, variacao, variante_id, produto_nome, data_venda, valor_pago_original,
        data_entrada, prazo_dias_uteis, previsao_retorno, motivo, observacao, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_reparo')
     RETURNING *`,
  ).bind(
    base.origemFonte, base.vendaId, base.historicoItemId, base.vendaHistoricaId,
    base.clienteId, base.clienteNomeNorm ?? normalizarNomeCliente(base.clienteNome ?? '') ?? null, base.clienteNome,
    base.sku, base.variacao, base.varianteId, base.produtoNome, base.dataVenda, base.valorPagoOriginal,
    dataEntrada, prazo, previsao, motivo,
    String(corpo.observacao ?? '').trim() || null,
  ).first();

  await evento(db, g.id, {
    tipo: 'aberta', data: dataEntrada, statusNovo: 'em_reparo',
    observacao: motivo,
    dados: { previsaoRetorno: previsao, prazoDiasUteis: prazo, valorPagoOriginal: base.valorPagoOriginal },
  });

  return {
    ok: true,
    garantia: await lerGarantia(db, g.id),
    /* §31 dito em voz alta: quem chamou não precisa deduzir que nada mudou. */
    faturamento: 0,
    estoqueAlterado: false,
    vendaOriginalAlterada: false,
  };
}

async function evento(db, garantiaId, { tipo, data, statusNovo = null, observacao = null, dados = {} }) {
  await db.prepare(
    `INSERT INTO garantia_eventos (garantia_id, tipo, data, status_novo, observacao, dados_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(garantiaId, tipo, data, statusNovo, observacao, JSON.stringify(dados ?? {})).run();
}

/* ═════════════════════════════════════════════════════════ mudança de status */

export async function mudarStatusGarantia(db, id, corpo = {}) {
  const g = await db.prepare('SELECT * FROM garantias WHERE id = ?').bind(id).first();
  if (!g) return { ok: false, statusHttp: 404, erro: 'Garantia não encontrada.' };

  const novo = String(corpo.status ?? '').trim();
  if (!STATUS.has(novo)) return { ok: false, statusHttp: 400, erro: 'Status inválido.' };
  if (g.status === novo) return { ok: false, statusHttp: 409, erro: `A garantia já está em "${ROTULO_STATUS[novo]}".` };

  /* Uma garantia que já trocou de peça não volta a "em reparo": a peça nova
     já saiu do estoque, e reabrir o caso deixaria a troca órfã. */
  const troca = await db.prepare('SELECT id FROM garantia_trocas WHERE garantia_id = ?').bind(id).first();
  if (troca && (novo === 'em_reparo' || novo === 'cancelada')) {
    return {
      ok: false, statusHttp: 409,
      erro: 'Esta garantia já teve a troca registrada — a peça nova saiu do estoque. Estorne a troca antes.',
    };
  }

  const data = corpo.data ? String(corpo.data).trim() : hojeISO();
  if (!dataValida(data)) return { ok: false, statusHttp: 400, erro: 'Data inválida. Use AAAA-MM-DD.' };

  /* "Peça devolvida" é o fim natural do reparo: registra a entrega e o caso
     sai do Painel. NÃO gera venda, NÃO gera faturamento e NÃO cria estoque
     — a peça consertada volta para a dona, não para a prateleira. */
  const encerra = ['devolvida', 'concluida', 'cancelada'].includes(novo);

  const atualizada = await db.prepare(
    `UPDATE garantias
        SET status = ?, observacao = COALESCE(?, observacao),
            encerrada_em = ?, atualizado_em = datetime('now')
      WHERE id = ? RETURNING *`,
  ).bind(novo, String(corpo.observacao ?? '').trim() || null, encerra ? data : null, id).first();

  await evento(db, id, {
    tipo: novo === 'devolvida' ? 'devolvida' : (novo === 'cancelada' ? 'cancelada' : 'status'),
    data,
    statusNovo: novo,
    observacao: String(corpo.observacao ?? '').trim() || null,
    dados: { de: g.status, para: novo },
  });

  return {
    ok: true,
    garantia: await lerGarantia(db, atualizada.id),
    faturamento: 0,
    estoqueAlterado: false,
  };
}

/* ═════════════════════════════════════════════════════════ troca de garantia

   A peça não tem conserto. Sai uma peça NOVA do estoque, e essa saída tem
   origem `troca_garantia` — nunca `venda`.

   O que a troca não pode fazer, e é para isto que o movimento tem origem
   própria: virar uma segunda venda, somar o preço cheio da peça nova ao
   faturamento, aumentar a contagem de compras da cliente ou mexer no ticket
   médio dela. */

export async function registrarTroca(db, id, corpo = {}) {
  const g = await db.prepare('SELECT * FROM garantias WHERE id = ?').bind(id).first();
  if (!g) return { ok: false, statusHttp: 404, erro: 'Garantia não encontrada.' };

  const jaTrocou = await db.prepare('SELECT * FROM garantia_trocas WHERE garantia_id = ?').bind(id).first();
  if (jaTrocou) {
    return { ok: false, statusHttp: 409, erro: 'Esta garantia já teve a troca registrada.', trocaId: jaTrocou.id };
  }
  if (g.status === 'cancelada' || g.status === 'devolvida') {
    return { ok: false, statusHttp: 409, erro: `Garantia em "${ROTULO_STATUS[g.status]}" não troca peça.` };
  }

  const skuNovo = String(corpo.skuNovo ?? '').trim().toUpperCase();
  if (!skuNovo) return { ok: false, statusHttp: 400, erro: 'Escolha a peça nova.' };

  const data = corpo.data ? String(corpo.data).trim() : hojeISO();
  if (!dataValida(data)) return { ok: false, statusHttp: 400, erro: 'Data inválida. Use AAAA-MM-DD.' };
  if (data > hojeISO()) return { ok: false, statusHttp: 400, erro: `${data} ainda não chegou.` };

  const s = await saldosDoSku(db, skuNovo);
  if (!s) return { ok: false, statusHttp: 400, erro: `Código ${skuNovo} não está no catálogo.`, sku: skuNovo };
  if ((await componentesDoKit(db, skuNovo)).length) {
    return { ok: false, statusHttp: 409, erro: `${s.desc} é um kit — troque por uma peça avulsa.`, sku: skuNovo };
  }
  if (s.disponivel < 1) {
    return { ok: false, statusHttp: 409, erro: `${s.desc}: não há peça disponível para a troca.`, sku: skuNovo };
  }

  /* O valor original é o que ela PAGOU, não o de tabela — se a peça saiu com
     desconto, cobrar a diferença sobre o preço cheio cobraria a mais. Quando
     o histórico não sabe o valor, a tela precisa dizer qual foi: adivinhar
     aqui é §2 aplicado a dinheiro. */
  const valorOriginal = corpo.valorOriginal != null
    ? dinheiro(corpo.valorOriginal)
    : (g.valor_pago_original == null ? null : dinheiro(g.valor_pago_original));
  if (valorOriginal == null || !Number.isFinite(valorOriginal)) {
    return {
      ok: false, statusHttp: 409,
      erro: 'Não sei quanto ela pagou pela peça original. Informe o valor para a diferença ser calculada.',
    };
  }

  const valorNovo = corpo.valorNovo != null ? dinheiro(corpo.valorNovo)
    : (s.preco == null ? null : dinheiro(s.preco));
  if (valorNovo == null || !Number.isFinite(valorNovo) || valorNovo < 0) {
    return { ok: false, statusHttp: 409, erro: `${s.desc} está sem preço. Informe o valor considerado da peça nova.` };
  }

  const diferenca = dinheiro(valorNovo - valorOriginal);

  /* A regra da diferença NEGATIVA não existe: ninguém definiu se vira
     crédito, reembolso ou nada. O fluxo fica pronto e a linha é gravada,
     mas com status próprio — o sistema anuncia o que decidiu não fazer (§9)
     em vez de inventar um crédito. */
  let diferencaStatus;
  if (diferenca > 0) diferencaStatus = 'a_receber';
  else if (diferenca === 0) diferencaStatus = 'nenhuma';
  else diferencaStatus = 'pendente_regra';

  const variacaoNova = String(corpo.variacaoNova ?? '').trim() || null;
  const varianteIdNovo = corpo.varianteIdNovo == null || corpo.varianteIdNovo === ''
    ? null : String(corpo.varianteIdNovo);

  const troca = await db.prepare(
    `INSERT INTO garantia_trocas
       (garantia_id, data, sku_novo, variacao_nova, variante_id_novo, produto_novo_nome,
        valor_original, valor_novo, diferenca, diferenca_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(id, data, skuNovo, variacaoNova, varianteIdNovo, s.desc,
    valorOriginal, valorNovo, diferenca, diferencaStatus).first();

  /* O movimento que baixa a peça nova. Tipo `troca`, origem `troca_garantia`.
     Nenhuma consulta de faturamento olha para movimentos, mas a movimentação
     da peça precisa dizer POR QUE ela saiu — e "vendida" seria mentira. */
  const obsMov = `Troca de garantia ${id} · ${g.sku} → ${skuNovo}`
    + (g.cliente_nome ? ` · ${g.cliente_nome}` : '');
  await db.batch(movimentar(db, {
    sku: skuNovo, tipo: 'troca', quantidade: 1, origem: 'troca_garantia',
    obs: obsMov, variacao: variacaoNova, varianteId: varianteIdNovo,
  }));
  const mov = await db.prepare(
    `SELECT id FROM movimentos WHERE sku = ? AND obs = ? ORDER BY id DESC LIMIT 1`,
  ).bind(skuNovo, obsMov).first();
  if (mov) {
    await db.prepare('UPDATE garantia_trocas SET movimento_id = ? WHERE id = ?').bind(mov.id, troca.id).run();
    troca.movimento_id = mov.id;
  }

  /* A peça DEFEITUOSA não volta ao estoque. Ela está quebrada: somá-la ao
     disponível a colocaria à venda de novo. */
  await db.prepare(
    `UPDATE garantias SET status = 'sem_conserto', atualizado_em = datetime('now') WHERE id = ?`,
  ).bind(id).run();

  await evento(db, id, {
    tipo: 'troca', data, statusNovo: 'sem_conserto',
    observacao: String(corpo.observacao ?? '').trim() || null,
    dados: {
      skuOriginal: g.sku, skuNovo, valorOriginal, valorNovo, diferenca, diferencaStatus,
    },
  });

  const depois = await saldosDoSku(db, skuNovo);
  return {
    ok: true,
    garantia: await lerGarantia(db, id),
    estoque: { sku: skuNovo, desc: s.desc, antes: s.qtd, depois: depois.qtd },
    /* Zero, e não `valorNovo`: a troca não é venda. Só a diferença, quando
       PAGA, vira receita — e por outra rota. */
    faturamento: 0,
    criouVenda: false,
    diferenca,
    diferencaStatus,
    aviso: diferencaStatus === 'pendente_regra'
      ? 'A peça nova custa menos que a original. Crédito ou reembolso ainda não é regra definida — a diferença ficou registrada e nada foi lançado.'
      : null,
  };
}

/** A diferença foi paga. É o ÚNICO ponto deste módulo que gera receita, e
 *  ela entra pela data do pagamento (§29) — não pela data da troca nem pela
 *  da venda original. */
export async function pagarDiferencaTroca(db, id, corpo = {}) {
  const troca = await db.prepare(
    `SELECT t.*, g.cliente_nome FROM garantia_trocas t
       JOIN garantias g ON g.id = t.garantia_id
      WHERE t.garantia_id = ?`,
  ).bind(id).first();
  if (!troca) return { ok: false, statusHttp: 404, erro: 'Esta garantia não tem troca registrada.' };
  if (troca.diferenca_status === 'paga') {
    return { ok: false, statusHttp: 409, erro: 'Esta diferença já foi marcada como paga.' };
  }
  if (troca.diferenca_status !== 'a_receber') {
    return {
      ok: false, statusHttp: 409,
      erro: troca.diferenca_status === 'nenhuma'
        ? 'Não há diferença a receber nesta troca.'
        : 'A peça nova custa menos que a original: crédito ou reembolso ainda não é regra definida.',
    };
  }

  const pagaEm = corpo.pagaEm ? String(corpo.pagaEm).trim() : hojeISO();
  if (!dataValida(pagaEm)) return { ok: false, statusHttp: 400, erro: 'Data de pagamento inválida. Use AAAA-MM-DD.' };
  if (pagaEm > hojeISO()) return { ok: false, statusHttp: 400, erro: `${pagaEm} ainda não chegou.` };

  /* Pagamento parcial não é previsto aqui: a diferença é um valor pequeno e
     único. Aceitar um valor diferente do devido criaria um saldo que
     ninguém acompanha. */
  const valor = corpo.valor != null ? dinheiro(corpo.valor) : dinheiro(troca.diferenca);
  if (valor !== dinheiro(troca.diferenca)) {
    return {
      ok: false, statusHttp: 409,
      erro: `A diferença é de ${troca.diferenca.toFixed(2)} — pagamento parcial não é tratado aqui.`,
    };
  }

  await db.prepare(
    `UPDATE garantia_trocas
        SET diferenca_status = 'paga', diferenca_paga_em = ?, diferenca_valor_pago = ?,
            atualizado_em = datetime('now')
      WHERE id = ?`,
  ).bind(pagaEm, valor, troca.id).run();

  await evento(db, id, {
    tipo: 'diferenca_paga', data: pagaEm,
    observacao: String(corpo.observacao ?? '').trim() || null,
    dados: { valor, de: 'a_receber', para: 'paga' },
  });

  return {
    ok: true,
    garantia: await lerGarantia(db, id),
    /* O número que entra no faturamento de `pagaEm`: só a diferença. */
    faturamento: valor,
    dataFaturamento: pagaEm,
  };
}

/** Desfaz a troca: a peça nova volta ao estoque e a garantia volta a
 *  "sem conserto". Existe porque a troca baixa estoque, e um erro de
 *  digitação no SKU novo não pode ser corrigido apagando a linha. */
export async function estornarTroca(db, id, { motivo = null } = {}) {
  const troca = await db.prepare('SELECT * FROM garantia_trocas WHERE garantia_id = ?').bind(id).first();
  if (!troca) return { ok: false, statusHttp: 404, erro: 'Esta garantia não tem troca registrada.' };
  if (troca.diferenca_status === 'paga') {
    return {
      ok: false, statusHttp: 409,
      erro: 'A diferença já foi paga — estornar aqui deixaria o dinheiro sem origem. Trate o reembolso antes.',
    };
  }
  const razao = String(motivo ?? '').trim();
  if (!razao) return { ok: false, statusHttp: 400, erro: 'Diga por que está estornando a troca.' };

  const antes = await saldosDoSku(db, troca.sku_novo);
  const obsMov = `Estorno da troca de garantia ${id} · ${razao}`;
  await db.batch(movimentar(db, {
    sku: troca.sku_novo, tipo: 'ajuste', quantidade: 1, origem: 'estorno',
    obs: obsMov, variacao: troca.variacao_nova, varianteId: troca.variante_id_novo,
  }));

  await db.prepare('DELETE FROM garantia_trocas WHERE id = ?').bind(troca.id).run();
  await evento(db, id, {
    tipo: 'troca_estornada', data: hojeISO(), observacao: razao,
    dados: { skuNovo: troca.sku_novo, diferenca: troca.diferenca },
  });

  const depois = await saldosDoSku(db, troca.sku_novo);
  return {
    ok: true,
    garantia: await lerGarantia(db, id),
    estoque: { sku: troca.sku_novo, antes: antes.qtd, depois: depois.qtd },
  };
}

/* ═══════════════════════════════════════════════════════════════ leitura */

function publica(g, troca, eventos, prazo) {
  return {
    id: g.id,
    status: g.status,
    statusRotulo: ROTULO_STATUS[g.status] ?? g.status,
    pendente: PENDENTES.includes(g.status),
    origemFonte: g.origem_fonte,
    vendaId: g.venda_id ?? null,
    historicoItemId: g.historico_item_id ?? null,
    vendaHistoricaId: g.venda_historica_id ?? null,
    clienteId: g.cliente_id ?? null,
    clienteNome: g.cliente_nome ?? null,
    clienteNomeNorm: g.cliente_nome_norm ?? null,
    sku: g.sku,
    variacao: g.variacao ?? null,
    varianteId: g.variante_id ?? null,
    produtoNome: g.produto_nome ?? null,
    dataVenda: g.data_venda ?? null,
    valorPagoOriginal: g.valor_pago_original == null ? null : Number(g.valor_pago_original),
    dataEntrada: g.data_entrada,
    motivo: g.motivo,
    observacao: g.observacao ?? null,
    encerradaEm: g.encerrada_em ?? null,
    ...prazo,
    troca: troca ? {
      id: troca.id,
      data: troca.data,
      skuNovo: troca.sku_novo,
      variacaoNova: troca.variacao_nova ?? null,
      produtoNovoNome: troca.produto_novo_nome ?? null,
      valorOriginal: Number(troca.valor_original),
      valorNovo: Number(troca.valor_novo),
      diferenca: Number(troca.diferenca),
      diferencaStatus: troca.diferenca_status,
      diferencaPagaEm: troca.diferenca_paga_em ?? null,
      diferencaValorPago: troca.diferenca_valor_pago == null ? null : Number(troca.diferenca_valor_pago),
    } : null,
    eventos: (eventos ?? []).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      data: e.data,
      statusNovo: e.status_novo ?? null,
      statusRotulo: e.status_novo ? (ROTULO_STATUS[e.status_novo] ?? e.status_novo) : null,
      observacao: e.observacao ?? null,
      dados: (() => { try { return JSON.parse(e.dados_json || '{}'); } catch { return {}; } })(),
    })),
  };
}

export async function lerGarantia(db, id, { feriados = null, hoje = null } = {}) {
  const g = await db.prepare('SELECT * FROM garantias WHERE id = ?').bind(id).first();
  if (!g) return null;
  const [troca, ev] = await Promise.all([
    db.prepare('SELECT * FROM garantia_trocas WHERE garantia_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM garantia_eventos WHERE garantia_id = ? ORDER BY id').bind(id).all(),
  ]);
  const fer = feriados ?? await carregarFeriados(db);
  const prazo = prazoDaGarantia({
    dataEntrada: g.data_entrada,
    prazoDiasUteis: g.prazo_dias_uteis,
    hoje: hoje ?? hojeISO(),
    feriados: fer,
    previsao: g.previsao_retorno,
  });
  return publica(g, troca ?? null, ev.results ?? [], prazo);
}

/** As garantias de uma cliente, para a linha do tempo do perfil. Casa por id
 *  e por nome normalizado — a mesma dupla que `perfilCliente` usa, para uma
 *  cliente sem `cliente_id` gravado não perder as garantias dela. */
export async function garantiasDaCliente(db, { clienteId = null, norm = null } = {}) {
  const { results } = await db.prepare(
    `SELECT id FROM garantias
      WHERE (? IS NOT NULL AND cliente_id = ?)
         OR (? IS NOT NULL AND cliente_nome_norm = ?)
      ORDER BY data_entrada DESC, id DESC`,
  ).bind(clienteId, clienteId, norm, norm).all();
  const feriados = await carregarFeriados(db);
  const hoje = hojeISO();
  return Promise.all((results ?? []).map((r) => lerGarantia(db, r.id, { feriados, hoje })));
}

/** O bloco "Peças em reparo" do Painel: só o que ainda pede alguma coisa.
 *  Caso encerrado sai daqui e continua inteiro no histórico da cliente. */
export async function garantiasPendentes(db, { limite = 50 } = {}) {
  const { results } = await db.prepare(
    `SELECT id FROM garantias
      WHERE status IN (${PENDENTES.map(() => '?').join(', ')})
      ORDER BY data_entrada ASC, id ASC LIMIT ?`,
  ).bind(...PENDENTES, limite).all();
  const feriados = await carregarFeriados(db);
  const hoje = hojeISO();
  const lista = await Promise.all((results ?? []).map((r) => lerGarantia(db, r.id, { feriados, hoje })));
  return {
    pendentes: lista,
    total: lista.length,
    atrasadas: lista.filter((g) => g.atrasado).length,
    consideraFeriados: feriados.size > 0,
  };
}

export async function listarGarantias(db, { status = null, limite = 200, offset = 0 } = {}) {
  const s = status && STATUS.has(status) ? status : null;
  const { results } = await db.prepare(
    `SELECT id FROM garantias
      WHERE (? IS NULL OR status = ?)
      ORDER BY data_entrada DESC, id DESC LIMIT ? OFFSET ?`,
  ).bind(s, s, limite, offset).all();
  const feriados = await carregarFeriados(db);
  const hoje = hojeISO();
  const garantias = await Promise.all((results ?? []).map((r) => lerGarantia(db, r.id, { feriados, hoje })));
  return { ok: true, garantias, limite, offset };
}

export { ROTULO_STATUS, PENDENTES as STATUS_PENDENTES };
