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
 *
 *  ══════════════════════════════════════════════════════════════════════
 *  §36 — A TROCA PASSA A TER REGISTRO COMERCIAL (regra nova, 05/09/2026)
 *  ══════════════════════════════════════════════════════════════════════
 *
 *  A Sthefany definiu que a peça que entra numa troca sem conserto tem de
 *  NASCER COMO VENDA: aparecer no histórico da cliente, nas preferências,
 *  na contagem de peças. Antes ela sumia — o caso da Evelyn Veiga mostrava
 *  "troca 393950 → 313860 · diferença R$ 10 · a receber" como uma linha de
 *  texto, sem ação para receber os R$ 10 e sem nada no A Receber.
 *
 *  O que MUDA: a troca cria uma linha em `vendas`, ligada à garantia por
 *  `garantia_trocas.venda_id`.
 *
 *  O que NÃO muda, e é o ponto inteiro: o DINHEIRO. A venda criada tem
 *  `total` = a DIFERENÇA, não o preço da peça nova. Os R$ 89 que a cliente
 *  pagou na compra original já entraram no faturamento no dia deles; faturar
 *  R$ 99 agora os contaria pela segunda vez. O item guarda os dois números
 *  lado a lado — `preco_tabela` = 99, `preco` = 10 — e o abatimento aparece
 *  rotulado como "Crédito de garantia · <sku original>", que é exatamente o
 *  que aconteceu no balcão.
 *
 *  O ESTOQUE também não muda: a peça nova sai UMA vez, no movimento de tipo
 *  `troca` que esta função já criava. A venda não gera segundo movimento —
 *  ela aponta para o mesmo, por `movimentos.venda_id`.
 *
 *  E a diferença deixa de precisar de tela própria para ser cobrada: sendo
 *  uma venda não paga, ela entra no "A Receber" pelo mesmo caminho de
 *  qualquer venda de balcão fiada.
 *
 *  A contagem em dobro do faturamento é barrada em `analytics.js`:
 *  `visaoGeral` soma `garantia_trocas.diferenca_valor_pago` e passa a somar
 *  só as trocas SEM `venda_id` — as antigas, de antes desta regra.
 */
import { movimentar, saldosDoSku, componentesDoKit, semSaldoProprio } from './estoque.js';
import { carregarFeriados, prazoDaGarantia, somarDiasUteis } from './dias-uteis.js';
import { normalizarNomeCliente } from './vendas-historico-normalizar.js';
import { parametros } from './plataforma/d1.js';
import { normSku } from './sku.js';
import { novoVendaItemId } from './venda-item-id.js';

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

   operacional → `venda_itens.id` (Fase 5.2). É estável, imutável e não
                 posicional, e é o caminho preferido: quem sabe QUAL linha
                 está olhando manda o id e acabou.
   histórico   → `vendas_historico_itens.id` é chave primária de verdade.

   O trio (venda_id, sku, variante_id) continua aceito, para quem ainda não
   tem o id em mãos, mas NÃO é mais tratado como identidade. §27 permite duas
   linhas do mesmo código na mesma venda com preços diferentes, e o trio casa
   as duas. Quando isso acontece o sistema PARA e devolve as candidatas — a
   peça que voltou é a cliente que sabe, não o `LIMIT 1`.

   Nos três casos o que importa não é só achar o item: é achar o VALOR
   EFETIVAMENTE PAGO por ele. Usar o preço de tabela cobraria a mais numa
   troca de peça que saiu com desconto. */

async function itemOperacional(db, { vendaItemId = null, vendaId = null, sku = null, varianteId = null }) {
  let item = null;
  let vinculo = 'direto';

  if (vendaItemId) {
    item = await db.prepare('SELECT * FROM venda_itens WHERE id = ?').bind(String(vendaItemId)).first();
    if (!item) return { erro: `O item ${vendaItemId} não existe em venda nenhuma.` };
    if (vendaId != null && Number(item.venda_id) !== Number(vendaId)) {
      return { erro: `O item ${vendaItemId} não é da venda ${vendaId}.` };
    }
    vendaId = item.venda_id;
  }

  const venda = await db.prepare('SELECT * FROM vendas WHERE id = ?').bind(vendaId).first();
  if (!venda) return { erro: `Venda ${vendaId} não existe.` };
  if (venda.cancelada) return { erro: `A venda ${vendaId} está cancelada.` };

  if (!item) {
    /* Sem id: as candidatas do trio, TODAS, para poder contar antes de
       escolher. `IS` e não `=` no variante_id — NULL = NULL é NULL, e a peça
       sem variação sumiria da própria busca. Quando o chamador não disse a
       variante, o filtro não é aplicado: aí as candidatas são todas as linhas
       daquele código, e se houver mais de uma ele vai ter de dizer qual. */
    const { results } = await db.prepare(
      `SELECT * FROM venda_itens
        WHERE venda_id = ? AND sku = ?
          AND (? IS NULL OR variante_id IS ?)
        ORDER BY id`,
    ).bind(vendaId, sku, varianteId, varianteId).all();
    const candidatas = results ?? [];

    if (!candidatas.length) return { erro: `A venda ${vendaId} não tem o código ${sku}.` };
    if (candidatas.length > 1) {
      /* §2 e §9: o sistema não escolhe entre duas peças físicas, e não
         engole a dúvida. Devolve as duas com o que as distingue. */
      return {
        erro: `A venda ${vendaId} tem ${candidatas.length} linhas do código ${sku}. `
            + 'Diga qual delas voltou (vendaItemId).',
        ambiguo: true,
        candidatas: candidatas.map((c) => ({
          vendaItemId: c.id,
          sku: c.sku,
          variacao: c.variacao ?? null,
          varianteId: c.variante_id ?? null,
          qtd: c.qtd,
          precoPago: dinheiro(c.preco),
          descontoRotulo: c.desconto_rotulo ?? null,
        })),
      };
    }
    item = candidatas[0];
    vinculo = 'direto';
  }

  return {
    origemFonte: 'operacional',
    vendaItemId: item.id ?? null,
    vendaItemVinculo: item.id ? vinculo : 'sem_match',
    vendaId: venda.id,
    historicoItemId: null,
    vendaHistoricaId: null,
    clienteId: venda.cliente_id ?? null,
    clienteNome: venda.cliente_nome ?? null,
    /* §2 — a venda em que o sistema se recusou a escolher entre homônimas
       não tem dona, e a garantia dela também não pode ter. O nome fica para
       exibição; o que NÃO fica é a chave que a penduraria na ficha errada. */
    clienteNomeNorm: venda.cliente_ambiguo ? null : (venda.cliente_nome_norm ?? null),
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
    /* A planilha não tem linha em `venda_itens` — a pergunta não se aplica,
       e dizer isso é diferente de deixar nulo sem explicação. */
    vendaItemId: null,
    vendaItemVinculo: 'nao_se_aplica',
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

  const vendaItemId = corpo.vendaItemId == null || corpo.vendaItemId === ''
    ? null : String(corpo.vendaItemId);

  let base;
  if (corpo.historicoItemId != null) {
    base = await itemHistorico(db, { historicoItemId: Number(corpo.historicoItemId) });
  } else if (vendaItemId || (corpo.vendaId != null && corpo.sku)) {
    base = await itemOperacional(db, {
      vendaItemId,
      vendaId: corpo.vendaId == null ? null : Number(corpo.vendaId),
      sku: corpo.sku ? normSku(corpo.sku) : null,
      varianteId: corpo.varianteId == null || corpo.varianteId === '' ? null : String(corpo.varianteId),
    });
  } else {
    return {
      ok: false, statusHttp: 400,
      erro: 'Diga qual item da compra: vendaItemId, (vendaId + sku) ou historicoItemId.',
    };
  }
  /* Ambiguidade não é "não encontrei": é "encontrei demais". 409 com as
     candidatas na resposta, para a tela poder perguntar. */
  if (base.erro) {
    return base.ambiguo
      ? { ok: false, statusHttp: 409, erro: base.erro, candidatas: base.candidatas }
      : { ok: false, statusHttp: 404, erro: base.erro };
  }

  /* A MESMA PEÇA não abre duas garantias ABERTAS. Duas linhas pendentes para
     o mesmo anel são um clique repetido, e a segunda ficaria pendurada no
     Painel para sempre.
   *
   *  5.4b — "a mesma peça" passa a significar a mesma UNIDADE FÍSICA, e não
   *  o mesmo código. Decisão de produto de 12/09/2026. A trava larga por
   *  (venda, código) existia para compensar a ausência de identidade da
   *  unidade: com o trio como chave, duas unidades iguais na mesma compra
   *  eram indistinguíveis, e recusar as duas era o único jeito seguro. A
   *  Fase 5.2b deu identidade à linha, e a compensação deixou de fazer
   *  sentido — a cliente que comprou dois anéis iguais e viu um soltar a
   *  pedra em setembro e o outro descascar em outubro tem dois casos.
   *
   *  O que NÃO foi afrouxado, e é o ponto delicado: a garantia antiga sem
   *  ponteiro confiável (`ambiguo`, `sem_match`, ou qualquer linha anterior
   *  a 5.2b) pode ser desta unidade — ninguém sabe. Ela continua bloqueando
   *  pelo código, como antes. Distinguir unidades por suposição seria
   *  exatamente o chute que 5.2b se recusou a dar. */
  const jaAberta = await db.prepare(
    `SELECT id FROM garantias
      WHERE status IN ('em_reparo', 'reparada', 'sem_conserto')
        AND (
          -- planilha: a chave primária de verdade resolve sozinha
          (? IS NOT NULL AND historico_item_id = ?)
          -- operacional COM ponteiro: a mesma unidade, e mais a garantia
          -- antiga do mesmo código que não sabe a que unidade pertence
          OR (? IS NOT NULL AND (venda_item_id = ?
               OR (venda_id = ? AND sku = ? AND venda_item_id IS NULL)))
          -- operacional SEM ponteiro: a trava larga de antes, intacta
          OR (? IS NULL AND ? IS NOT NULL AND venda_id = ? AND sku = ?)
        )
      LIMIT 1`,
  ).bind(
    base.historicoItemId, base.historicoItemId,
    base.vendaItemId, base.vendaItemId, base.vendaId, base.sku,
    base.vendaItemId, base.vendaId, base.vendaId, base.sku,
  ).first();
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
        data_entrada, prazo_dias_uteis, previsao_retorno, motivo, observacao, status,
        venda_item_id, venda_item_vinculo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_reparo', ?, ?)
     RETURNING *`,
  ).bind(
    base.origemFonte, base.vendaId, base.historicoItemId, base.vendaHistoricaId,
    base.clienteId, base.clienteNomeNorm ?? normalizarNomeCliente(base.clienteNome ?? '') ?? null, base.clienteNome,
    base.sku, base.variacao, base.varianteId, base.produtoNome, base.dataVenda, base.valorPagoOriginal,
    dataEntrada, prazo, previsao, motivo,
    String(corpo.observacao ?? '').trim() || null,
    /* §31 — a garantia nasce apontando para a LINHA. O trio ao lado vira o
       que sempre deveria ter sido: descrição, não identidade. */
    base.vendaItemId ?? null, base.vendaItemVinculo ?? null,
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

/** 5.4c — a diferença foi paga, e a linha do tempo da garantia tem de dizer.
 *
 *  Existem DUAS portas para esse mesmo fato: `pagarDiferencaTroca`, aqui, e a
 *  tela A Receber, que desde §36 recebe a diferença como se fosse uma venda
 *  qualquer — e é por ela que isso acontece de verdade, porque nenhuma tela
 *  chama a rota da garantia. Só a primeira escrevia o evento. O dinheiro
 *  fechava nos dois lugares e a história do caso ficava mentindo por omissão.
 *
 *  Esta função é o ponto único das duas portas. Ela é IDEMPOTENTE por
 *  construção: o evento é único por TROCA, não por garantia. A distinção
 *  importa — depois de um estorno a garantia pode receber uma troca nova, e
 *  o pagamento dessa segunda troca é um fato novo, que merece a própria
 *  linha. Repetir a chamada para a MESMA troca não escreve nada.
 *
 *  Devolve `true` quando gravou, `false` quando já havia. */
export async function registrarPagamentoDaDiferenca(db, garantiaId, {
  trocaId, valor, pagaEm, vendaId = null, observacao = null,
}) {
  const jaTem = await db.prepare(
    `SELECT id FROM garantia_eventos
      WHERE garantia_id = ? AND tipo = 'diferenca_paga'
        AND json_extract(dados_json, '$.trocaId') = ?
      LIMIT 1`,
  ).bind(garantiaId, trocaId).first();
  if (jaTem) return false;

  await evento(db, garantiaId, {
    tipo: 'diferenca_paga', data: pagaEm, observacao,
    dados: { trocaId, valor, de: 'a_receber', para: 'paga', vendaId },
  });
  return true;
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
  const troca = await db.prepare(
    'SELECT id FROM garantia_trocas WHERE garantia_id = ? AND estornada = 0').bind(id).first();
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

  const jaTrocou = await db.prepare(
    'SELECT * FROM garantia_trocas WHERE garantia_id = ? AND estornada = 0').bind(id).first();
  if (jaTrocou) {
    return { ok: false, statusHttp: 409, erro: 'Esta garantia já teve a troca registrada.', trocaId: jaTrocou.id };
  }
  if (g.status === 'cancelada' || g.status === 'devolvida') {
    return { ok: false, statusHttp: 409, erro: `Garantia em "${ROTULO_STATUS[g.status]}" não troca peça.` };
  }

  /* 5.4b — a compra de origem pode ter sido cancelada DEPOIS da abertura.
     `abrirGarantia` recusa venda cancelada, mas nada reconferia daí em
     diante, e a troca baixava uma peça nova do estoque por uma compra que
     não existe mais. O caso não é apagado — ele continua no histórico, e
     quem decidir o que fazer com ele decide olhando (§9). */
  if (g.origem_fonte === 'operacional' && g.venda_id != null) {
    const venda = await db.prepare('SELECT cancelada FROM vendas WHERE id = ?').bind(g.venda_id).first();
    if (!venda) {
      return { ok: false, statusHttp: 409, erro: `A venda ${g.venda_id}, de onde esta peça saiu, não existe mais.` };
    }
    if (venda.cancelada) {
      return {
        ok: false, statusHttp: 409,
        erro: `A venda ${g.venda_id}, de onde esta peça saiu, foi cancelada. `
            + 'Trocar agora tiraria uma peça nova do estoque por uma compra que não existe.',
        vendaCancelada: true,
      };
    }
  }

  const skuNovo = normSku(corpo.skuNovo);
  if (!skuNovo) return { ok: false, statusHttp: 400, erro: 'Escolha a peça nova.' };

  const data = corpo.data ? String(corpo.data).trim() : hojeISO();
  if (!dataValida(data)) return { ok: false, statusHttp: 400, erro: 'Data inválida. Use AAAA-MM-DD.' };
  if (data > hojeISO()) return { ok: false, statusHttp: 400, erro: `${data} ainda não chegou.` };

  const s = await saldosDoSku(db, skuNovo);
  if (!s) return { ok: false, statusHttp: 400, erro: `Código ${skuNovo} não está no catálogo.`, sku: skuNovo };
  /* Nem kit nem configuração montável: a troca movimenta o SKU trocado, e
     nenhum dos dois tem saldo próprio para movimentar. */
  if (semSaldoProprio(s) || (await componentesDoKit(db, skuNovo)).length) {
    return {
      ok: false, statusHttp: 409, sku: skuNovo,
      erro: s.montagem
        ? `${s.desc} é uma configuração montável — troque por uma peça avulsa.`
        : `${s.desc} é um kit — troque por uma peça avulsa.`,
    };
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

  /* §36 — o registro comercial da peça nova, ANTES do movimento: assim o
     movimento já nasce apontando para a venda, e a razão do estoque explica
     de onde a saída veio sem precisar de um segundo UPDATE que poderia
     falhar no meio. */
  const venda = await registrarVendaDaTroca(db, {
    garantia: g, troca, skuNovo, descNovo: s.desc,
    variacaoNova, varianteIdNovo, valorOriginal, valorNovo, diferenca, data,
  });

  /* O movimento que baixa a peça nova. Tipo `troca`, origem `troca_garantia`.
     Continua NÃO sendo `venda`: a movimentação da peça precisa dizer por que
     ela saiu, e a saída foi uma troca. O `venda_id` liga os dois sem
     confundir o motivo com o registro. */
  const obsMov = `Troca de garantia ${id} · ${g.sku} → ${skuNovo}`
    + (g.cliente_nome ? ` · ${g.cliente_nome}` : '')
    + (venda ? ` · registro comercial ${venda.id}` : '');
  await db.batch(movimentar(db, {
    sku: skuNovo, tipo: 'troca', quantidade: 1, origem: 'troca_garantia',
    obs: obsMov, variacao: variacaoNova, varianteId: varianteIdNovo,
    vendaId: venda ? venda.id : null,
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
    /* Zero AGORA, e não `valorNovo`: existe registro comercial da peça nova
       (§36), mas ele vale a DIFERENÇA, e ela só vira faturamento no dia em
       que for paga. Trocar não é receber. */
    faturamento: 0,
    criouVenda: !!venda,
    vendaId: venda ? venda.id : null,
    diferenca,
    diferencaStatus,
    aviso: diferencaStatus === 'pendente_regra'
      ? 'A peça nova custa menos que a original. Crédito ou reembolso ainda não é regra definida — a diferença ficou registrada e nada foi lançado.'
      : null,
  };
}

/** §36 — o registro comercial da peça nova de uma troca.
 *
 *  Uma venda de verdade, na tabela `vendas`, para a peça aparecer no
 *  histórico da cliente, nas preferências e na contagem de peças. Com três
 *  travas que a impedem de virar dinheiro que não existiu:
 *
 *    1. `total` é a DIFERENÇA, nunca o preço da peça nova. O crédito da peça
 *       devolvida entra como desconto rotulado no item.
 *    2. NENHUM movimento de estoque é criado aqui. A peça sai uma vez, no
 *       movimento de tipo `troca` que o chamador grava logo em seguida.
 *    3. `origem = 'troca'`, para toda consulta poder distinguir esta linha
 *       de uma venda de balcão sem ter que adivinhar pelo valor.
 *
 *  Diferença positiva nasce NÃO PAGA — é a conta a receber que o pacote
 *  pede. Diferença zero ou negativa nasce paga com total zero: não há o que
 *  cobrar, e o crédito de uma peça mais barata continua sendo regra que
 *  ninguém definiu (`pendente_regra`), anunciada em vez de inventada.
 *
 *  Falhar aqui NÃO derruba a troca: a peça física já mudou de mãos, e o
 *  registro comercial é a parte que pode ser refeita. A troca fica gravada
 *  com `venda_id` nulo — que é exatamente o estado das trocas anteriores a
 *  esta regra, já tratado em todo lugar. */
async function registrarVendaDaTroca(db, {
  garantia, troca, skuNovo, descNovo, variacaoNova, varianteIdNovo,
  valorOriginal, valorNovo, diferenca, data,
}) {
  try {
    const nome = String(garantia.cliente_nome ?? '').trim();
    const norm = garantia.cliente_nome_norm ?? (nome ? normalizarNomeCliente(nome) : null);
    /* A diferença é o que ela ainda deve. Negativa não vira dívida nem
       crédito: vira zero cobrado, e o caso fica marcado `pendente_regra`. */
    const aCobrar = diferenca > 0 ? dinheiro(diferenca) : 0;
    const pago = aCobrar > 0 ? 0 : 1;

    const venda = await db.prepare(
      `INSERT INTO vendas (cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                           nuvemshop_status, pago, data_pagamento, observacao,
                           pagamento_origem, cobravel)
       VALUES (?, ?, ?, 'troca', ?, ?, 'nao_aplicavel', ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(
      garantia.cliente_id ?? null, nome || null, norm, data, aCobrar,
      pago,
      /* Diferença zero "pagou" no dia da troca porque não havia nada a
         pagar — e sem data o faturamento não saberia onde pôr o zero. */
      pago ? data : null,
      `Troca de garantia ${garantia.id} · ${garantia.sku} → ${skuNovo}`,
      pago ? 'informado' : null,
      /* Só é cobrável o que ela realmente deve. */
      aCobrar > 0 ? 1 : 0,
    ).first();

    await db.prepare(
      `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, variacao, variante_id,
                                preco_tabela, desconto_valor, desconto_rotulo, id)
       VALUES (?, ?, ?, 1, ?, 'troca', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      venda.id, skuNovo, descNovo, aCobrar, variacaoNova, varianteIdNovo,
      /* Os dois números lado a lado: o que a peça vale e o que foi cobrado.
         Sem `preco_tabela`, daqui a um ano ninguém saberia que a peça de
         R$ 10 no recibo era uma peça de R$ 99 com crédito de garantia. */
      dinheiro(valorNovo),
      dinheiro(valorNovo) - aCobrar === 0 ? null : dinheiro(dinheiro(valorNovo) - aCobrar),
      `Crédito de garantia · ${garantia.sku} (${dinheiro(valorOriginal).toFixed(2)})`,
      novoVendaItemId(),
    ).run();

    await db.prepare('UPDATE garantia_trocas SET venda_id = ? WHERE id = ?')
      .bind(venda.id, troca.id).run();
    troca.venda_id = venda.id;
    return venda;
  } catch (e) {
    /* §9: o que não deu certo é dito, não engolido. O chamador devolve
       `criouVenda: false` e a tela mostra a troca sem o registro comercial,
       que é o comportamento de antes desta regra — nunca um sucesso falso. */
    console.error('troca: não consegui criar o registro comercial da peça nova', e);
    return null;
  }
}

/** A diferença foi paga. É o ÚNICO ponto deste módulo que gera receita, e
 *  ela entra pela data do pagamento (§29) — não pela data da troca nem pela
 *  da venda original. */
export async function pagarDiferencaTroca(db, id, corpo = {}) {
  const troca = await db.prepare(
    `SELECT t.*, g.cliente_nome FROM garantia_trocas t
       JOIN garantias g ON g.id = t.garantia_id
      WHERE t.garantia_id = ? AND t.estornada = 0`,
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

  /* §36 — a troca com registro comercial tem DUAS linhas para fechar, e
     elas fecham juntas ou o dinheiro fica contado pela metade. O `batch`
     é o que garante isso: ou as duas gravam, ou nenhuma.
     A venda NÃO tem estoque tocado aqui — a peça saiu no dia da troca, e
     receber a diferença não a faz sair de novo (§29). */
  const escritas = [
    db.prepare(
      `UPDATE garantia_trocas
          SET diferenca_status = 'paga', diferenca_paga_em = ?, diferenca_valor_pago = ?,
              atualizado_em = datetime('now')
        WHERE id = ?`,
    ).bind(pagaEm, valor, troca.id),
  ];
  if (troca.venda_id) {
    escritas.push(db.prepare(
      `UPDATE vendas
          SET pago = 1, data_pagamento = ?, pagamento_origem = 'informado', cobravel = 0
        WHERE id = ? AND pago = 0`,
    ).bind(pagaEm, troca.venda_id));
  }
  await db.batch(escritas);

  await registrarPagamentoDaDiferenca(db, id, {
    trocaId: troca.id, valor, pagaEm, vendaId: troca.venda_id ?? null,
    observacao: String(corpo.observacao ?? '').trim() || null,
  });

  return {
    ok: true,
    garantia: await lerGarantia(db, id),
    /* O número que entra no faturamento de `pagaEm`: só a diferença.
       Quando a troca tem registro comercial, ele entra PELA VENDA — o
       `receitaDiferencaTroca` de analytics.js ignora estas, justamente para
       o mesmo real não ser somado duas vezes. */
    faturamento: valor,
    dataFaturamento: pagaEm,
    vendaId: troca.venda_id ?? null,
    porOndeFatura: troca.venda_id ? 'venda' : 'diferenca_troca',
  };
}

/** Desfaz a troca: a peça nova volta ao estoque e a garantia continua em
 *  "sem conserto", à espera de outra troca. Existe porque a troca baixa
 *  estoque, e um erro de digitação no SKU novo não pode ser corrigido
 *  apagando a linha.
 *
 *  5.4d — ESTORNAR NÃO APAGA O FATO (§28). Até aqui esta função dava
 *  `DELETE` na linha: sumiam o SKU novo, o valor original, o valor da peça
 *  nova, a data e o `movimento_id`, e sobrava um evento com três campos. A
 *  mesma função já cancelava a VENDA em vez de apagá-la, citando §28, e
 *  `saidas.js` diz a regra em voz alta para o caso gêmeo. A troca era o
 *  outlier. Agora ela é marcada, e a história inteira fica legível. */
export async function estornarTroca(db, id, { motivo = null } = {}) {
  const troca = await db.prepare(
    'SELECT * FROM garantia_trocas WHERE garantia_id = ? AND estornada = 0').bind(id).first();
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
  const quando = hojeISO();
  const obsMov = `Estorno da troca de garantia ${id} · ${razao}`;
  await db.batch(movimentar(db, {
    sku: troca.sku_novo, tipo: 'ajuste', quantidade: 1, origem: 'estorno',
    obs: obsMov, variacao: troca.variacao_nova, varianteId: troca.variante_id_novo,
  }));
  /* A outra ponta de `movimento_id`: um tirou a peça do estoque, este a
     trouxe de volta. Com os dois na linha, a razão se explica sozinha. */
  const mov = await db.prepare(
    `SELECT id FROM movimentos WHERE sku = ? AND obs = ? ORDER BY id DESC LIMIT 1`,
  ).bind(troca.sku_novo, obsMov).first();

  /* §36 — o registro comercial da peça nova é CANCELADO, não apagado
     (§28: cancela, não apaga). Ele sai de toda soma pelo mesmo caminho de
     qualquer venda cancelada, e a linha fica dizendo o que houve. */
  if (troca.venda_id) {
    await db.prepare(
      `UPDATE vendas
          SET cancelada = 1, cobravel = 0,
              observacao = COALESCE(observacao || ' · ', '') || 'Troca estornada: ' || ?
        WHERE id = ?`,
    ).bind(razao, troca.venda_id).run();
  }

  /* A linha fica. `AND estornada = 0` para que duas chamadas simultâneas não
     estornem duas vezes: a segunda muda zero linhas e não escreve evento. */
  const marcada = await db.prepare(
    `UPDATE garantia_trocas
        SET estornada = 1, estorno_em = ?, estorno_motivo = ?, estorno_movimento_id = ?,
            atualizado_em = datetime('now')
      WHERE id = ? AND estornada = 0`,
  ).bind(quando, razao, mov ? mov.id : null, troca.id).run();
  if (marcada?.meta && marcada.meta.changes === 0) {
    return { ok: false, statusHttp: 409, erro: 'Esta troca já tinha sido estornada.' };
  }

  await evento(db, id, {
    tipo: 'troca_estornada', data: quando, observacao: razao,
    dados: {
      trocaId: troca.id,
      skuNovo: troca.sku_novo,
      valorOriginal: Number(troca.valor_original),
      valorNovo: Number(troca.valor_novo),
      diferenca: troca.diferenca,
      dataDaTroca: troca.data,
      vendaId: troca.venda_id ?? null,
      movimentoDaTroca: troca.movimento_id ?? null,
      movimentoDoEstorno: mov ? mov.id : null,
    },
  });

  const depois = await saldosDoSku(db, troca.sku_novo);
  return {
    ok: true,
    garantia: await lerGarantia(db, id),
    estoque: { sku: troca.sku_novo, antes: antes.qtd, depois: depois.qtd },
    /* A troca continua existindo, e a resposta diz onde. */
    trocaEstornadaId: troca.id,
    vendaCancelada: troca.venda_id ?? null,
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
    /* 5.2b — o ponteiro oficial, e como ele foi obtido. `vendaItemVinculo`
       nunca é escondido: `ambiguo` e `sem_match` são as garantias que o
       backfill se recusou a adivinhar, e a tela precisa poder dizer isso. */
    vendaItemId: g.venda_item_id ?? null,
    vendaItemVinculo: g.venda_item_vinculo ?? null,
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
      /* §36 — o registro comercial da peça nova. `null` nas trocas
         anteriores à regra, e é assim que toda soma distingue as duas
         populações sem contar dinheiro duas vezes. */
      vendaId: troca.venda_id ?? null,
      movimentoId: troca.movimento_id ?? null,
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
    db.prepare(
      'SELECT * FROM garantia_trocas WHERE garantia_id = ? AND estornada = 0').bind(id).first(),
    db.prepare('SELECT * FROM garantia_eventos WHERE garantia_id = ? ORDER BY id').bind(id).all(),
  ]);
  const fer = feriados ?? await carregarFeriados(db);
  const prazo = prazoDaGarantia({
    dataEntrada: g.data_entrada,
    prazoDiasUteis: g.prazo_dias_uteis,
    hoje: hoje ?? hojeISO(),
    feriados: fer,
    previsao: g.previsao_retorno,
    /* 5.4b — caso encerrado não atrasa mais. O relógio para no dia em que o
       caso terminou; enquanto ele está aberto, `encerrada_em` é nulo e o
       cálculo continua correndo até hoje, como sempre correu. */
    encerradaEm: g.encerrada_em ?? null,
  });
  return publica(g, troca ?? null, ev.results ?? [], prazo);
}

/** As garantias de uma cliente, para a linha do tempo do perfil.
 *
 *  Casa por id e por nome normalizado — a mesma dupla que `perfilCliente`
 *  usa, para uma cliente sem `cliente_id` gravado não perder as garantias
 *  dela. Com a mesma trava de §2: o nome só alcança a garantia que NÃO tem
 *  dono, e quem chama passa `norm: null` quando o nome é ambíguo. Sem isso,
 *  duas "Cliente sem nome" veriam a garantia uma da outra. */
export async function garantiasDaCliente(db, { clienteId = null, norm = null } = {}) {
  const { results } = await db.prepare(
    `SELECT id FROM garantias
      WHERE (? IS NOT NULL AND cliente_id = ?)
         OR (cliente_id IS NULL AND ? IS NOT NULL AND cliente_nome_norm = ?)
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
      WHERE status IN (${parametros(PENDENTES.length)})
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

/* ══════════════════════════════════════════ 5.2b — o que ficou sem ponteiro
 *
 *  O relatório da migração de identidade. Ele existe porque o backfill se
 *  RECUSA a adivinhar: quando o trio antigo casava duas linhas, ou nenhuma,
 *  a garantia ficou sem `venda_item_id` e com o motivo registrado. Isso não
 *  pode virar dado esquecido no banco — §9, o que o sistema decidiu não
 *  fazer é anunciado.
 *
 *  Somente leitura. Não conserta nada: quem resolve uma ambiguidade é gente
 *  olhando qual peça voltou, e o caminho para gravar a decisão é abrir a
 *  garantia com `vendaItemId`. */
export async function vinculosDeGarantia(db, { limite = 200 } = {}) {
  const { results: contagem } = await db.prepare(
    `SELECT COALESCE(venda_item_vinculo, 'nao_classificado') AS vinculo, COUNT(*) AS total
       FROM garantias GROUP BY 1 ORDER BY 1`,
  ).all();

  const porVinculo = Object.fromEntries((contagem ?? []).map((r) => [r.vinculo, Number(r.total)]));

  /* As candidatas de cada caso ambíguo, para o relatório poder mostrar o que
     distingue uma linha da outra — preço cobrado, variação, motivo. Sem
     isso, "ambíguo" seria só uma reclamação. */
  const { results: pendentes } = await db.prepare(
    `SELECT g.id, g.venda_id, g.sku, g.variante_id, g.variacao, g.produto_nome,
            g.valor_pago_original, g.data_entrada, g.status, g.venda_item_vinculo,
            g.cliente_nome
       FROM garantias g
      WHERE g.origem_fonte = 'operacional'
        AND g.venda_item_id IS NULL
        AND COALESCE(g.venda_item_vinculo, 'nao_classificado') <> 'nao_se_aplica'
      ORDER BY g.data_entrada DESC, g.id DESC
      LIMIT ?`,
  ).bind(limite).all();

  const casos = [];
  for (const p of pendentes ?? []) {
    const { results: cands } = await db.prepare(
      `SELECT id, sku, variacao, variante_id, qtd, preco, desconto_rotulo
         FROM venda_itens WHERE venda_id = ? AND sku = ? ORDER BY id`,
    ).bind(p.venda_id, p.sku).all();
    casos.push({
      garantiaId: p.id,
      motivo: p.venda_item_vinculo ?? 'nao_classificado',
      vendaId: p.venda_id,
      sku: p.sku,
      variacao: p.variacao ?? null,
      varianteId: p.variante_id ?? null,
      produtoNome: p.produto_nome ?? null,
      clienteNome: p.cliente_nome ?? null,
      dataEntrada: p.data_entrada,
      status: p.status,
      valorPagoOriginal: p.valor_pago_original == null ? null : Number(p.valor_pago_original),
      candidatas: (cands ?? []).map((c) => ({
        vendaItemId: c.id,
        variacao: c.variacao ?? null,
        varianteId: c.variante_id ?? null,
        qtd: c.qtd,
        precoPago: dinheiro(c.preco),
        descontoRotulo: c.desconto_rotulo ?? null,
      })),
    });
  }

  return {
    ok: true,
    porVinculo,
    ambiguas: porVinculo.ambiguo ?? 0,
    semMatch: porVinculo.sem_match ?? 0,
    resolvidas: (porVinculo.direto ?? 0) + (porVinculo.backfill_unico ?? 0)
      + (porVinculo.backfill_unico_valor ?? 0),
    naoSeAplica: porVinculo.nao_se_aplica ?? 0,
    casos,
    limite,
  };
}

export { ROTULO_STATUS, PENDENTES as STATUS_PENDENTES };
