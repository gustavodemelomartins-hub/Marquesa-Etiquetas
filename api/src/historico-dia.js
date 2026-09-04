/** §32 — O QUE ACONTECEU NAQUELE DIA
 *
 *  Escolher 28/08 em Vendas mostrava só metade do dia: as vendas de balcão
 *  daquela data. A peça que saiu numa maleta, a que foi acertada com a
 *  revendedora e a linha que veio da planilha ficavam invisíveis — e quem
 *  procurava "a venda que eu fiz no dia 28" concluía que ela não entrou.
 *
 *  Esta consulta junta TODAS as origens comerciais de uma data, cada linha
 *  dizendo de onde veio. Duas coisas a governam:
 *
 *  1. É o DIA DA MOVIMENTAÇÃO, não o do pagamento. Uma venda feita em 28/08
 *     e paga em setembro aparece aqui em 28/08 — e no faturamento de
 *     setembro (§29). As duas coisas são verdadeiras e dizem coisas
 *     diferentes; a linha carrega as duas datas para a tela não ter que
 *     escolher.
 *
 *  2. Cada movimentação aparece UMA vez. Uma venda de balcão que também
 *     existe como linha de planilha é a mesma venda vista de dois lugares:
 *     os mesmos filtros que o painel usa para não contar em dobro valem
 *     aqui, importados de `analytics.js` em vez de reescritos — regra
 *     copiada é divergência com data marcada.
 *
 *  Nem tudo aqui é venda, e a linha diz isso em `ehVenda`. Consignação de
 *  maleta, brinde e troca de garantia aconteceram no dia e pertencem ao
 *  histórico; nenhuma delas é dinheiro que entrou.
 */
/* O JOIN que traz a operação histórica ativa de cada linha vem de
   `analytics.js`, não é reescrito aqui — é ele que decide se a linha é
   compra de cliente ou acerto de revendedora.

   Os dois FILTROS de lá deliberadamente NÃO são usados: ambos restringem a
   `papel='cliente'` e a `origem <> 'acerto'`, e o histórico do dia quer
   justamente as duas metades. A parte que importa dos dois — não contar em
   dobro o que já é operação histórica — aparece escrita no WHERE de cada
   consulta abaixo. */
import { JOIN_OPERACAO_ITEM_HISTORICO } from './analytics.js';

/** O que entrou no caixa nesta data: as vendas cujo PAGAMENTO caiu aqui
 *  (não as que foram feitas aqui) mais a diferença de troca recebida hoje. */
function recebidoNoDia(vendas, trocas, data) {
  const deVenda = vendas
    .filter((l) => (l.dataPagamento ?? null) === data)
    .reduce((s, l) => s + (l.valor ?? 0), 0);
  const deTroca = trocas
    .filter((t) => t.diferenca_status === 'paga' && t.diferenca_paga_em === data)
    .reduce((s, t) => s + Number(t.diferenca ?? 0), 0);
  return +(deVenda + deTroca).toFixed(2);
}

const ORIGENS = {
  cliente: 'Cliente',
  revendedora: 'Revendedora',
  acerto: 'Acerto',
  consignacao: 'Consignação',
  saida: 'Saída sem faturamento',
  garantia: 'Troca de garantia',
};

/** Tudo o que aconteceu comercialmente numa data, no nível do ITEM.
 *  `data` é obrigatória e é sempre `YYYY-MM-DD`. */
export async function historicoDoDia(db, data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data ?? ''))) {
    return { ok: false, statusHttp: 400, erro: 'Data inválida. Use AAAA-MM-DD.' };
  }

  const [operacional, historico, saidas, trocas, consignacoes] = await Promise.all([
    /* ─── 1 e 2: as vendas do sistema, de cliente e de acerto.
       A mesma tabela guarda as duas (§9); o que as separa é `origem` e a
       presença de revendedora. `NOT EXISTS(historico_operacao_vendas)` é o
       que impede a venda já representada por uma operação histórica de
       aparecer duas vezes. */
    db.prepare(
      `SELECT v.id AS venda_id, v.data AS data, v.data_pagamento AS data_pagamento,
              v.pago AS pago, v.observacao AS observacao_venda,
              CASE WHEN v.origem = 'acerto' OR v.revendedora_id IS NOT NULL
                   THEN 'acerto' ELSE 'cliente' END AS papel,
              COALESCE(c.nome, v.cliente_nome) AS cliente,
              r.nome AS revendedora, v.maleta_id AS maleta_id,
              i.sku AS sku, i.desc AS produto, i.qtd AS qtd,
              ROUND(i.qtd * i.preco, 2) AS valor,
              i.preco_tabela AS preco_tabela, i.desconto_valor AS desconto_valor,
              i.desconto_rotulo AS desconto_rotulo, i.motivo AS motivo,
              i.variacao AS variacao
         FROM vendas v
         JOIN venda_itens i ON i.venda_id = v.id
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN revendedoras r ON r.id = v.revendedora_id
        WHERE v.data = ? AND v.cancelada = 0
          AND NOT EXISTS (
            SELECT 1 FROM historico_operacao_vendas hov
             WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa'
          )
        ORDER BY v.id, i.rowid`,
    ).bind(data).all(),

    /* ─── 3 e 4: as linhas da planilha daquele dia.
       `papel` vem da operação histórica: é ela — e não o nome — que decide
       se aquela linha foi compra de cliente ou acerto de revendedora. */
    db.prepare(
      `SELECT h.id AS historico_item_id, h.data AS data,
              COALESCE(ho.papel, 'cliente') AS papel,
              h.cliente_nome_original AS cliente,
              COALESCE(r.nome, h.revendedora_nome) AS revendedora,
              h.sku AS sku, h.nome_produto_historico AS produto, h.qtd AS qtd,
              h.valor_total AS valor, h.preco_unit AS preco_tabela,
              h.desconto_valor AS desconto_valor,
              COALESCE(h.desconto_original, h.desconto_rotulo) AS desconto_rotulo,
              h.canal AS canal, h.contexto AS contexto,
              h.observacao_original AS observacao_venda, h.pago AS pago,
              ho.paga_em AS paga_em, ho.cobranca_status AS cobranca_status,
              h.venda_historica_id AS venda_historica_id
         FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
         ${JOIN_OPERACAO_ITEM_HISTORICO}
         LEFT JOIN revendedoras r ON r.id = h.revendedora_id
        WHERE h.data = ?
          AND NOT EXISTS (
            SELECT 1 FROM json_each(COALESCE(ho.linhas_excluidas_json, '[]')) ex
             WHERE CAST(ex.value AS TEXT) = CAST(h.origem_linha AS TEXT)
          )
          AND NOT EXISTS (
            SELECT 1 FROM historico_reclassificacao rc
             WHERE rc.historico_item_id = h.id AND rc.status = 'aplicada'
          )
        ORDER BY h.id`,
    ).bind(data).all(),

    /* ─── 5: §30. Saiu do estoque, não é venda. Aparece porque aconteceu
       naquele dia e alguém vai procurar por ela — com valor nulo, de
       propósito: não existe dinheiro nesta linha. */
    db.prepare(
      `SELECT s.id, s.tipo, s.sentido, s.data, s.sku, s.qtd, s.motivo, s.observacao,
              s.estornada, p.desc AS produto
         FROM saidas_sem_faturamento s
         LEFT JOIN produtos p ON p.sku = s.sku
        WHERE s.data = ? ORDER BY s.id`,
    ).bind(data).all().catch(() => ({ results: [] })),

    /* ─── 6: §31. A peça nova saiu do estoque, e a saída não é venda.
       Só a diferença — quando paga — é dinheiro, e ela entra pela data do
       pagamento, não por esta. */
    db.prepare(
      `SELECT t.id, t.data, t.sku_novo, t.produto_novo_nome, t.diferenca,
              t.diferenca_status, t.diferenca_paga_em, t.valor_original, t.valor_novo,
              g.id AS garantia_id, g.sku AS sku_original, g.cliente_nome AS cliente
         FROM garantia_trocas t
         JOIN garantias g ON g.id = t.garantia_id
        WHERE t.data = ? ORDER BY t.id`,
    ).bind(data).all().catch(() => ({ results: [] })),

    /* ─── 7: a maleta que saiu naquele dia. Consignação NÃO é venda (§5.3):
       a peça continua sendo da Marquesa, só mudou de lugar. Entra no
       histórico do dia porque é movimentação para revendedora, e sai com
       valor nulo pelo mesmo motivo das saídas acima. */
    db.prepare(
      `SELECT m.id AS maleta_id, m.aberta_em AS data, r.nome AS revendedora,
              mi.sku AS sku, mi.qtd AS qtd, mi.preco_envio AS preco_envio,
              p.desc AS produto
         FROM maletas m
         JOIN maleta_itens mi ON mi.maleta_id = m.id
         JOIN revendedoras r ON r.id = m.rev_id
         LEFT JOIN produtos p ON p.sku = mi.sku
        WHERE m.aberta_em = ? AND m.status <> 'cancelada'
        ORDER BY m.id, mi.sku`,
    ).bind(data).all(),
  ]);

  const linhas = [];

  for (const r of operacional.results ?? []) {
    const acerto = r.papel === 'acerto';
    linhas.push({
      origem: acerto ? ORIGENS.acerto : ORIGENS.cliente,
      origemChave: acerto ? 'acerto' : 'cliente',
      fonte: 'operacional',
      referencia: `venda:${r.venda_id}`,
      vendaId: r.venda_id,
      data: r.data,
      dataPagamento: r.data_pagamento ?? null,
      pago: r.pago == null ? null : !!r.pago,
      cliente: acerto ? null : (r.cliente ?? null),
      revendedora: r.revendedora ?? null,
      maletaId: r.maleta_id ?? null,
      sku: r.sku,
      produto: r.produto,
      variacao: r.variacao ?? null,
      qtd: Number(r.qtd ?? 0),
      valor: r.valor == null ? null : Number(r.valor),
      precoTabela: r.preco_tabela == null ? null : Number(r.preco_tabela),
      descontoValor: r.desconto_valor == null ? null : Number(r.desconto_valor),
      descontoRotulo: r.desconto_rotulo ?? null,
      tipo: r.motivo ?? 'venda',
      observacao: r.observacao_venda ?? null,
      /* `motivo` guarda o destino da peça no acerto: `vendida` é venda,
         `perdida`/`brinde`/`troca` não são. A linha diz qual é qual em vez
         de deixar quem lê somar tudo. */
      ehVenda: !r.motivo || r.motivo === 'venda' || r.motivo === 'vendida',
    });
  }

  for (const r of historico.results ?? []) {
    const acerto = r.papel === 'acerto';
    linhas.push({
      origem: acerto ? ORIGENS.acerto : ORIGENS.cliente,
      origemChave: acerto ? 'acerto' : 'cliente',
      fonte: 'historico',
      referencia: `historico:${r.historico_item_id}`,
      historicoItemId: r.historico_item_id,
      vendaHistoricaId: r.venda_historica_id ?? null,
      data: r.data,
      dataPagamento: r.cobranca_status === 'paga' && r.paga_em
        ? String(r.paga_em).slice(0, 10) : null,
      pago: r.pago == null ? null : !!r.pago,
      cliente: acerto ? null : (r.cliente ?? null),
      revendedora: r.revendedora ?? null,
      maletaId: null,
      sku: r.sku,
      produto: r.produto,
      variacao: null,
      qtd: Number(r.qtd ?? 0),
      valor: r.valor == null ? null : Number(r.valor),
      precoTabela: r.preco_tabela == null ? null : Number(r.preco_tabela),
      descontoValor: r.desconto_valor == null ? null : Number(r.desconto_valor),
      descontoRotulo: r.desconto_rotulo ?? null,
      tipo: 'venda',
      canal: r.canal ?? null,
      contexto: r.contexto ?? null,
      observacao: r.observacao_venda ?? null,
      ehVenda: true,
    });
  }

  for (const r of saidas.results ?? []) {
    linhas.push({
      origem: ORIGENS.saida,
      origemChave: 'saida',
      fonte: 'saida',
      referencia: `saida:${r.id}`,
      saidaId: r.id,
      data: r.data,
      dataPagamento: null,
      pago: null,
      cliente: null,
      revendedora: null,
      sku: r.sku,
      produto: r.produto ?? r.sku,
      qtd: r.sentido === 'entrada' ? -Number(r.qtd ?? 0) : Number(r.qtd ?? 0),
      /* Nulo, não zero: não existe dinheiro nesta linha, e um zero somaria
         silenciosamente numa média de ticket. */
      valor: null,
      tipo: r.tipo,
      observacao: [r.motivo, r.observacao].filter(Boolean).join(' · ') || null,
      estornada: !!r.estornada,
      ehVenda: false,
    });
  }

  for (const r of trocas.results ?? []) {
    linhas.push({
      origem: ORIGENS.garantia,
      origemChave: 'garantia',
      fonte: 'garantia',
      referencia: `troca:${r.id}`,
      garantiaId: r.garantia_id,
      data: r.data,
      dataPagamento: r.diferenca_paga_em ?? null,
      pago: r.diferenca_status === 'paga',
      cliente: r.cliente ?? null,
      revendedora: null,
      sku: r.sku_novo,
      produto: r.produto_novo_nome ?? r.sku_novo,
      qtd: 1,
      /* O valor da linha é a DIFERENÇA, nunca o preço da peça nova: a troca
         não é uma segunda venda de R$ 99 (§31). */
      valor: Number(r.diferenca ?? 0),
      tipo: 'troca_garantia',
      observacao: `Troca de ${r.sku_original} (pago ${Number(r.valor_original).toFixed(2)}) `
        + `por ${r.sku_novo} (${Number(r.valor_novo).toFixed(2)}) · diferença ${r.diferenca_status}`,
      ehVenda: false,
    });
  }

  for (const r of consignacoes.results ?? []) {
    linhas.push({
      origem: ORIGENS.consignacao,
      origemChave: 'consignacao',
      fonte: 'maleta',
      referencia: `maleta:${r.maleta_id}:${r.sku}`,
      maletaId: r.maleta_id,
      data: r.data,
      dataPagamento: null,
      pago: null,
      cliente: null,
      revendedora: r.revendedora ?? null,
      sku: r.sku,
      produto: r.produto ?? r.sku,
      qtd: Number(r.qtd ?? 0),
      valor: null,
      precoTabela: r.preco_envio == null ? null : Number(r.preco_envio),
      tipo: 'consignacao',
      observacao: `Maleta ${r.maleta_id} aberta neste dia — a peça saiu de casa, não foi vendida`,
      ehVenda: false,
    });
  }

  /* Uma linha por movimentação, e a chave de deduplicação é a `referencia`:
     mesmo que uma fonte futura repita um registro, ele entra uma vez só. */
  const vistas = new Set();
  const unicas = linhas.filter((l) => {
    if (vistas.has(l.referencia)) return false;
    vistas.add(l.referencia);
    return true;
  });

  const soVenda = unicas.filter((l) => l.ehVenda);
  const resumo = {
    linhas: unicas.length,
    duplicadasRemovidas: linhas.length - unicas.length,
    vendas: soVenda.length,
    pecasVendidas: soVenda.reduce((s, l) => s + (l.qtd ?? 0), 0),
    valorVendido: +soVenda.reduce((s, l) => s + (l.valor ?? 0), 0).toFixed(2),
    /* O dinheiro que entrou NESTE dia é outra pergunta: é a venda cujo
       PAGAMENTO caiu aqui, não a que foi feita aqui (§29). A diferença de
       troca paga hoje entra junto, porque também é dinheiro deste dia. */
    recebidoNoDia: recebidoNoDia(soVenda, trocas.results ?? [], data),
    porOrigem: {},
    semFaturamento: unicas.filter((l) => !l.ehVenda).length,
  };
  for (const l of unicas) {
    const k = l.origem;
    const a = resumo.porOrigem[k] ?? { linhas: 0, pecas: 0, valor: 0 };
    a.linhas++; a.pecas += l.qtd ?? 0; a.valor += l.valor ?? 0;
    resumo.porOrigem[k] = a;
  }
  for (const k of Object.keys(resumo.porOrigem)) {
    resumo.porOrigem[k].valor = +resumo.porOrigem[k].valor.toFixed(2);
  }

  return { ok: true, data, itens: unicas, resumo };
}

export { ORIGENS as ORIGENS_DO_DIA };
