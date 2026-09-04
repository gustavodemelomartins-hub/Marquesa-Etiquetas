/** A VENDA histórica, reconstruída a partir das linhas da planilha.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  A REGRA, EM UMA LINHA
 *
 *      MESMO CLIENTE NORMALIZADO + MESMA DATA = UMA VENDA.
 *
 *  As linhas daquele grupo são os itens dela. Uma cliente com 36 linhas em
 *  13/06/2026 comprou 36 peças numa venda só.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  O QUE MUDOU, E POR QUÊ
 *
 *  Até 2026-08-27 o sistema recusava contar pedidos históricos: a planilha
 *  numera LINHAS (a coluna `Nº` vai de 1 a 1.341 sem repetir), e sem uma
 *  regra de agrupamento validada qualquer ticket médio seria artefato da
 *  importação. A recusa estava certa para o que se sabia.
 *
 *  O dono do negócio esclareceu como a operação funcionava, e a regra passou
 *  a existir. Junto veio a correção de uma inferência errada: NÃO se
 *  classifica uma operação como acerto/ajuste porque ela tem muitas linhas.
 *  O que não é venda vem ESCRITO na planilha. Nesta base isso são 3 linhas,
 *  todas do "cliente" Inventário, marcadas PERDIDO e ACHO QUE FOI VENDIDO —
 *  e nenhuma delas é grande.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  O BRUTO NÃO É TOCADO
 *
 *  Nada aqui reescreve `vendas_historico_itens`. A camada derivada é
 *  descartável por construção: `reconstruir()` apaga e refaz, e o resultado
 *  é idêntico a cada rodada porque a regra é determinística. A única escrita
 *  no item é o ponteiro de volta (`venda_historica_id` e `pedido_chave`).
 *
 *  ESTOQUE: agrupar linhas que já existiam não cria nem consome peça. Nenhuma
 *  função deste arquivo chama `movimentar()`.
 */

import { normalizarNomeCliente, normalizarTexto } from './vendas-historico-normalizar.js';
import { operacoesAtivasDoLote, fingerprintDoConteudo } from './historico-operacoes.js';

/* ═════════════════════════════════════════════════ o que NÃO é venda

   Só entra aqui o que a planilha declara. Nada é deduzido do tamanho do
   grupo, do valor, nem do número de linhas — foi exatamente essa dedução
   que produziu a leitura errada anterior.

   Se um dia a planilha passar a escrever "acerto" ou "ajuste" na
   Observação, é esta lista que cresce — e só ela. */
const MARCAS_NAO_VENDA = [
  /^perdido$/,
  /^acho que foi vendido$/,
  /^ajuste(\s|$)/,
  /^acerto de estoque(\s|$)/,
  /^corre[çc][ãa]o(\s|$)/,
  /^invent[áa]rio(\s|$)/,
];

/** Nomes que a planilha usa como "cliente" mas que não são pessoa: são a
 *  contrapartida de uma operação interna. Explícito, um por um. */
const CLIENTES_NAO_PESSOA = new Set(['inventario']);

/** A linha representa uma venda, ou uma operação de outra natureza?
 *
 *  Devolve o motivo junto: um número que muda a contagem tem de conseguir
 *  se explicar sem que ninguém precise abrir o código. */
export function classificarLinha(item) {
  const obs = normalizarTexto(item.observacao_original);
  const norm = item.cliente_nome_norm ?? normalizarNomeCliente(item.cliente_nome_original);

  if (obs !== null) {
    for (const re of MARCAS_NAO_VENDA) {
      if (re.test(obs)) {
        return { classe: 'ajuste', motivo: `a planilha marca "${item.observacao_original}"` };
      }
    }
  }
  if (norm !== null && CLIENTES_NAO_PESSOA.has(norm)) {
    return { classe: 'ajuste', motivo: `"${item.cliente_nome_original}" não é cliente, é operação interna` };
  }
  return { classe: 'venda', motivo: null };
}

/* ═══════════════════════════════════════════════════════ status de pagamento

   `pago` tem três estados no item: 1 (PAGO), 0 (NÃO PAGO) e NULL
   (desconhecido — a planilha escreveu "-"). NULL nunca vira zero: dizer
   "não pagou" sobre o que não se sabe é inventar inadimplência. */
export function statusDaVenda(itens) {
  const pagos = itens.filter((i) => i.pago === 1).length;
  const naoPagos = itens.filter((i) => i.pago === 0).length;
  const total = itens.length;

  if (pagos === total) return 'paga';
  if (naoPagos === total) return 'nao_paga';
  if (pagos > 0 && naoPagos > 0) return 'parcial';
  if (pagos > 0) return 'parcial';       /* resto é desconhecido, não é "paga" */
  return 'indefinida';
}

/* ═══════════════════════════════════════════════════════════ o agrupamento */

/** Reconstrói as vendas a partir dos itens. Função PURA: recebe linhas,
 *  devolve vendas. Não toca banco, e é por isso que dá para testá-la com
 *  quatro linhas em memória.
 *
 *  Itens sem data não podem ser agrupados por data. Em vez de encaixá-los
 *  no dia mais próximo (palpite) ou descartá-los (perde faturamento), cada
 *  um vira uma venda própria, marcada — e fora do ticket médio, porque não
 *  se sabe se ela era parte de outra compra. São 15 linhas em 1.341. */
export function reconstruirVendas(itens) {
  const grupos = new Map();

  for (const item of itens) {
    const { classe, motivo } = classificarLinha(item);
    const norm = item.cliente_nome_norm ?? normalizarNomeCliente(item.cliente_nome_original);
    const semData = !item.data;

    /* O ajuste nunca se mistura a uma venda, mesmo que caia no mesmo
       cliente e no mesmo dia: são naturezas diferentes de operação. */
    const chave = classe === 'ajuste'
      ? `${norm ?? 'sem-nome'}|ajuste:${item.id}`
      : semData
        ? `${norm ?? 'sem-nome'}|sd:${item.id}`
        : `${norm ?? 'sem-nome'}|${item.data}`;

    let g = grupos.get(chave);
    if (!g) {
      g = {
        chave,
        classe,
        regra: classe === 'ajuste'
          ? `operação separada da venda: ${motivo}`
          : semData
            ? 'linha sem data utilizável — venda própria, fora do ticket médio'
            : 'mesmo cliente normalizado + mesma data',
        clienteNome: item.cliente_nome_original ?? null,
        clienteNomeNorm: norm,
        clienteId: item.cliente_id ?? null,
        data: item.data ?? null,
        itens: [],
      };
      grupos.set(chave, g);
    }
    /* O `cliente_id` aparece quando QUALQUER item do grupo já está vinculado
       ao cadastro — a vinculação é por nome e vale para o grupo inteiro. */
    if (g.clienteId === null && item.cliente_id != null) g.clienteId = item.cliente_id;
    g.itens.push(item);
  }

  const vendas = [];
  for (const g of grupos.values()) {
    const its = g.itens;
    const pecas = its.reduce((s, i) => s + (Number(i.qtd) || 0), 0);
    const semValor = its.some((i) => i.valor_total == null);
    const valorTotal = semValor
      ? null
      : +its.reduce((s, i) => s + Number(i.valor_total), 0).toFixed(2);
    const valorPago = +its
      .reduce((s, i) => s + (i.pago === 1 ? Number(i.valor_total ?? 0) : 0), 0)
      .toFixed(2);
    const status = statusDaVenda(its);

    /* Canal e contexto da venda: o do grupo quando todos concordam. Quando
       divergem — a cliente comprou pela Maleta e pelo Site no mesmo dia — o
       canal vira 'Misto' em vez de escolher um dos dois por sorte. */
    const canais = [...new Set(its.map((i) => i.canal).filter(Boolean))];
    const contextos = [...new Set(its.map((i) => i.contexto).filter(Boolean))];

    vendas.push({
      chave: g.chave,
      classe: g.classe,
      regra: g.regra,
      clienteNome: g.clienteNome,
      clienteNomeNorm: g.clienteNomeNorm,
      clienteId: g.clienteId,
      data: g.data,
      itens: its.length,
      pecas,
      valorTotal,
      valorPago,
      status,
      /* A definição do que pode virar ticket médio, num lugar só. */
      elegivelTicket: g.classe === 'venda' && status === 'paga' && !!g.data && !semValor,
      canal: canais.length === 1 ? canais[0] : (canais.length > 1 ? 'Misto' : null),
      contexto: contextos.length === 1 ? contextos[0] : null,
      observacaoOriginal: its[0]?.observacao_original ?? null,
      origemLinhas: its.map((i) => i.origem_linha),
      itensIds: its.map((i) => i.id),
    });
  }

  /* Ordem estável: a reconstrução tem de sair idêntica a cada rodada, senão
     "reproduzível" é só uma palavra no documento. */
  vendas.sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')
    || a.chave.localeCompare(b.chave));
  return vendas;
}

/* ═══════════════════════════════════════════════════════ escrita no banco */

/** Apaga e refaz a camada derivada de um lote. Idempotente por construção:
 *  rodar duas vezes seguidas devolve exatamente o mesmo conteúdo.
 *
 *  O DELETE é de tabela DERIVADA e tem filtro pelo lote — nada aqui pode
 *  perder dado de origem, porque a origem não é tocada. */
export async function reconstruir(db, { loteId = null, aceitarQuebraDeDecisao = false } = {}) {
  const lotes = loteId != null
    ? [{ id: loteId }]
    : (await db.prepare(
      `SELECT id FROM vendas_historico_lotes WHERE status = 'importado' ORDER BY id`,
    ).all()).results ?? [];

  const resumo = [];
  const quebrasAceitas = [];
  for (const lote of lotes) {
    const { results: itens } = await db.prepare(
      /* `sku_base` e `desconto_original` não entram no agrupamento; entram no
         fingerprint, e sem eles a conferência de decisão abaixo compararia
         uma assinatura diferente da que o banco guardou. */
      `SELECT id, origem_linha, data, cliente_id, cliente_nome_norm,
              cliente_nome_original, qtd, valor_total, pago, canal, contexto,
              observacao_original, sku_base, desconto_original
         FROM vendas_historico_itens
        WHERE lote_id = ?
        ORDER BY id`,
    ).bind(lote.id).all();

    const vendas = reconstruirVendas(itens ?? []);

    /* ── uma decisão humana não pode ser invalidada em silêncio ────────────
       `historico_operacoes` guarda papel, acerto documental, vínculo de
       duplicata e cobrança — cada uma presa a uma `venda_chave` e ao
       fingerprint do conteúdo que a pessoa olhou quando decidiu.

       Reconstruir apaga e refaz `vendas_historicas`. Se a regra de
       agrupamento mudar (ou a normalização de nome mudar sob ela), uma chave
       pode DEIXAR DE EXISTIR — e a cobrança some da lista, porque o SQL das
       contas entra por JOIN nessa tabela — ou pode voltar com OUTRO
       conteúdo, e aí a decisão continua no ar aplicada a números que ninguém
       revisou. Nenhum dos dois dá erro sozinho. Os dois são dinheiro.

       Então a conferência acontece ANTES do DELETE, com o resultado que a
       regra nova produziria. Quebrou, não reconstrói: devolve exatamente
       quais decisões quebram e por quê. */
    const decisoes = await operacoesAtivasDoLote(db, lote.id);
    if (decisoes.length) {
      const porId = new Map((itens ?? []).map((i) => [i.id, i]));
      const porChave = new Map(vendas.map((v) => [v.chave, v]));
      const quebras = [];
      for (const d of decisoes) {
        const v = porChave.get(d.venda_chave);
        if (!v) {
          quebras.push({
            vendaChave: d.venda_chave, papel: d.papel, cobranca: d.cobranca_status,
            motivo: 'esta venda deixa de existir com o agrupamento novo',
          });
          continue;
        }
        const linhaDaVenda = {
          chave: v.chave, classe: v.classe, cliente_nome_norm: v.clienteNomeNorm,
          data: v.data, pecas: v.pecas, valor_total: v.valorTotal,
          valor_pago: v.valorPago, status: v.status, canal: v.canal, contexto: v.contexto,
        };
        const itensDaVenda = [...v.itensIds]
          .sort((a, b) => a - b)
          .map((id) => porId.get(id))
          .filter(Boolean);
        const novo = await fingerprintDoConteudo(linhaDaVenda, itensDaVenda);
        if (novo !== d.fingerprint) {
          quebras.push({
            vendaChave: d.venda_chave, papel: d.papel, cobranca: d.cobranca_status,
            motivo: 'o conteúdo desta venda muda com o agrupamento novo',
            fingerprintDaDecisao: d.fingerprint, fingerprintNovo: novo,
          });
        }
      }
      if (quebras.length && !aceitarQuebraDeDecisao) {
        return {
          ok: false,
          statusHttp: 409,
          loteId: lote.id,
          erro: `Reconstruir este lote invalidaria ${quebras.length} decisão(ões) humana(s) `
            + 'ativa(s) sobre vendas históricas. Este lote não foi tocado. Reveja as decisões '
            + 'listadas antes de insistir.',
          quebras,
          /* A parada é ANTES do DELETE deste lote, mas lotes anteriores da
             mesma chamada já foram refeitos. Refazer é idempotente pela
             mesma regra, então não há estrago — mas quem lê a recusa merece
             saber o que já aconteceu, em vez de supor que nada rodou. */
          lotesJaReconstruidos: resumo.map((r) => r.loteId),
          regra: REGRA_DESCRITA,
        };
      }
      if (quebras.length) quebrasAceitas.push(...quebras.map((q) => ({ ...q, loteId: lote.id })));
    }

    /* limpa o que havia — o ponteiro do item primeiro, senão ele fica
       apontando para uma venda que deixou de existir */
    await db.prepare(
      `UPDATE vendas_historico_itens
          SET venda_historica_id = NULL, pedido_chave = NULL
        WHERE lote_id = ?`,
    ).bind(lote.id).run();
    await db.prepare('DELETE FROM vendas_historicas WHERE lote_id = ?').bind(lote.id).run();

    /* D1 tem teto por batch; fatiar mantém a escrita previsível */
    const inserts = vendas.map((v) => db.prepare(
      `INSERT INTO vendas_historicas
         (lote_id, chave, classe, regra, cliente_nome, cliente_nome_norm, cliente_id,
          data, itens, pecas, valor_total, valor_pago, status, elegivel_ticket,
          canal, contexto, observacao_original, origem_linhas)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      lote.id, v.chave, v.classe, v.regra, v.clienteNome, v.clienteNomeNorm, v.clienteId,
      v.data, v.itens, v.pecas, v.valorTotal, v.valorPago, v.status, v.elegivelTicket ? 1 : 0,
      v.canal, v.contexto, v.observacaoOriginal, JSON.stringify(v.origemLinhas),
    ));
    for (let i = 0; i < inserts.length; i += 50) await db.batch(inserts.slice(i, i + 50));

    /* liga cada item à sua venda, pela chave */
    const ligacoes = vendas.map((v) => db.prepare(
      `UPDATE vendas_historico_itens
          SET venda_historica_id = (SELECT id FROM vendas_historicas
                                     WHERE lote_id = ? AND chave = ?),
              pedido_chave = ?
        WHERE lote_id = ? AND id IN (${v.itensIds.map(() => '?').join(',')})`,
    ).bind(lote.id, v.chave, v.chave, lote.id, ...v.itensIds));
    for (let i = 0; i < ligacoes.length; i += 50) await db.batch(ligacoes.slice(i, i + 50));

    resumo.push({
      loteId: lote.id,
      linhas: (itens ?? []).length,
      vendas: vendas.filter((v) => v.classe === 'venda').length,
      ajustes: vendas.filter((v) => v.classe === 'ajuste').length,
      elegiveis: vendas.filter((v) => v.elegivelTicket).length,
      semData: vendas.filter((v) => v.classe === 'venda' && !v.data).length,
    });
  }

  return {
    ok: true,
    lotes: resumo,
    regra: REGRA_DESCRITA,
    /* Só aparece quando alguém passou por cima da trava de propósito. */
    ...(quebrasAceitas.length ? { decisoesInvalidadas: quebrasAceitas } : {}),
  };
}

/* ═══════════════════════════════════ uma normalização de cliente, não duas

   `analytics.js` comparava cliente operacional com cliente histórico por
   `LOWER(TRIM(...))` em SQL, enquanto a importação usava `normalizarNomeCliente()`
   em JS — que dobra o acento. As duas discordam em "José"/"jose" e
   "Vitória"/"vitoria", e a mesma pessoa apareceria duas vezes no painel com
   metade do gasto em cada.

   A correção é gravar o normalizado com o MESMO JS e o SQL só ler a coluna.
   Nunca existe uma segunda implementação da regra. */
export async function backfillNormalizacao(db) {
  const { results: vendas } = await db.prepare(
    `SELECT v.id, COALESCE(c.nome, v.cliente_nome) AS nome
       FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE v.cliente_nome_norm IS NULL
        AND COALESCE(c.nome, v.cliente_nome) IS NOT NULL`,
  ).all();

  const { results: clientes } = await db.prepare(
    'SELECT id, nome FROM clientes WHERE nome_norm IS NULL',
  ).all();

  const stmts = [
    ...(vendas ?? []).map((v) => db.prepare('UPDATE vendas SET cliente_nome_norm = ? WHERE id = ?')
      .bind(normalizarNomeCliente(v.nome), v.id)),
    ...(clientes ?? []).map((c) => db.prepare('UPDATE clientes SET nome_norm = ? WHERE id = ?')
      .bind(normalizarNomeCliente(c.nome), c.id)),
  ];
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));

  return { vendas: (vendas ?? []).length, clientes: (clientes ?? []).length };
}

export const REGRA_DESCRITA = 'Mesmo cliente normalizado + mesma data = uma venda '
  + 'histórica; as linhas do grupo são os itens dela. O que a planilha marca '
  + 'explicitamente como não-venda (PERDIDO, ACHO QUE FOI VENDIDO, ajuste, '
  + 'correção) fica separado como ajuste. Linha sem data utilizável vira venda '
  + 'própria e não entra no ticket médio.';

/** A camada derivada existe e está em dia? A tela pergunta isso antes de
 *  mostrar número de venda — melhor dizer "reconstrua" do que mostrar zero. */
export async function estadoReconstrucao(db) {
  const r = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM vendas_historicas v
               JOIN vendas_historico_lotes l ON l.id = v.lote_id AND l.status='importado') AS vendas,
            (SELECT COUNT(*) FROM vendas_historico_itens h
               JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status='importado') AS itens,
            (SELECT COUNT(*) FROM vendas_historico_itens h
               JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status='importado'
              WHERE h.venda_historica_id IS NULL)                             AS itens_soltos`,
  ).first();
  return {
    vendas: Number(r?.vendas ?? 0),
    itens: Number(r?.itens ?? 0),
    itensSoltos: Number(r?.itens_soltos ?? 0),
    emDia: Number(r?.itens ?? 0) > 0 && Number(r?.itens_soltos ?? 0) === 0,
    regra: REGRA_DESCRITA,
  };
}
