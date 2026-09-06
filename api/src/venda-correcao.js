/** §41 — CORRIGIR O CÓDIGO DE UMA PEÇA JÁ VENDIDA
 *
 *  O caso real: Juliana Negri, 30/08/2026. Uma peça foi lançada com o código
 *  errado; o certo é 326660. Não havia caminho nenhum pela interface, e as
 *  duas saídas óbvias são as duas erradas:
 *
 *    cancelar e relançar  perde a data, a cliente, o desconto e o histórico,
 *                         e cria uma venda nova onde houve uma só;
 *    editar direto        deixa a correção indistinguível de um erro de
 *                         digitação novo — daqui a três meses ninguém sabe
 *                         se aquele código sempre foi aquele.
 *
 *  O que esta rota faz: troca o código NA LINHA da venda, mantém tudo o mais
 *  como está, e grava em `venda_item_correcoes` o que era antes, o que
 *  passou a ser e o que aconteceu com o estoque.
 *
 *  ─── o estoque, que é onde mora o risco
 *
 *  Duas populações, duas respostas, e confundi-las cria peça do nada ou
 *  perde peça de verdade:
 *
 *    OPERACIONAL   a venda baixou estoque pelo sistema. Corrigir devolve
 *                  uma unidade ao código errado e tira uma do certo —
 *                  exatamente uma vez cada. A devolução é um movimento
 *                  novo, não o apagamento do antigo (§28): a razão continua
 *                  contando a história inteira, e `produtos.qtd ==
 *                  SUM(movimentos.qtd)` continua valendo nos dois códigos.
 *
 *    HISTÓRICO     a linha veio da planilha, e o estoque dela já estava
 *                  refletido quando o saldo inicial foi carregado. Corrigir
 *                  o código NÃO movimenta nada — movimentar aqui inventaria
 *                  uma peça no código errado e sumiria com uma no certo.
 *
 *  ─── o que NÃO muda, e é metade do pedido
 *
 *  venda, cliente, data, preço cobrado, desconto e faturamento. Corrigir o
 *  código é dizer QUAL peça saiu, não quanto ela custou. O preço só muda se
 *  quem chama pedir explicitamente, e a mudança fica registrada ao lado.
 */
import { movimentar, saldosDoSku } from './estoque.js';

const hojeISO = () => new Date().toISOString().slice(0, 10);
const dinheiro = (v) => Math.round(Number(v) * 100) / 100;
const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });

/** O último movimento gravado com uma observação exata. `movimentos` não
 *  devolve o id no batch, e a observação é única por construção (traz o
 *  carimbo de tempo). Mesmo caminho que garantias.js e saidas.js já usam. */
async function idDoMovimento(db, sku, obs) {
  const m = await db.prepare(
    'SELECT id FROM movimentos WHERE sku = ? AND obs = ? ORDER BY id DESC LIMIT 1',
  ).bind(sku, obs).first();
  return m ? m.id : null;
}

export async function corrigirItemDeVenda(db, corpo = {}) {
  const fonte = String(corpo.fonte ?? '').trim();
  if (fonte !== 'operacional' && fonte !== 'historico') {
    return ERRO(400, 'Diga se a venda é do sistema (operacional) ou da planilha (historico).');
  }
  const skuNovo = String(corpo.skuNovo ?? '').trim().toUpperCase();
  if (!skuNovo) return ERRO(400, 'Escolha o código correto.');

  const motivo = String(corpo.motivo ?? '').trim() || null;

  /* O código novo precisa EXISTIR. Corrigir para um código que não está no
     catálogo trocaria um erro conhecido por um desconhecido — e a chave
     estrangeira de `movimentos` recusaria depois, no meio da escrita. */
  const novo = await saldosDoSku(db, skuNovo);
  if (!novo) return ERRO(400, `Código ${skuNovo} não está no catálogo.`, { sku: skuNovo });

  return fonte === 'operacional'
    ? corrigirOperacional(db, corpo, skuNovo, novo, motivo)
    : corrigirHistorico(db, corpo, skuNovo, novo, motivo);
}

/* ═════════════════════════════════════════════════ venda do sistema */

async function corrigirOperacional(db, corpo, skuNovo, novo, motivo) {
  const vendaId = Number(corpo.vendaId);
  const skuAntes = String(corpo.sku ?? '').trim().toUpperCase();
  if (!Number.isFinite(vendaId) || !skuAntes) {
    return ERRO(400, 'Informe a venda e o código que está errado.');
  }
  if (skuAntes === skuNovo) return ERRO(409, 'O código informado é o mesmo que já está na venda.');

  const venda = await db.prepare('SELECT * FROM vendas WHERE id = ?').bind(vendaId).first();
  if (!venda) return ERRO(404, `Venda ${vendaId} não existe.`);
  if (venda.cancelada) return ERRO(409, 'Venda cancelada não é corrigida — ela já não conta em lugar nenhum.');

  /* `venda_itens` não tem chave própria. O rowid identifica a LINHA dentro
     desta escrita — é o que permite corrigir uma linha quando a venda tem
     duas do mesmo código. Ele não é guardado nem comparado com nada de
     outra requisição, que é a ressalva de §32 sobre rowid. */
  const varianteAntes = corpo.varianteId == null || corpo.varianteId === ''
    ? null : String(corpo.varianteId);
  const item = await db.prepare(
    `SELECT rowid AS linha, * FROM venda_itens
      WHERE venda_id = ? AND sku = ?
        AND (? IS NULL OR variante_id = ?)
      ORDER BY rowid LIMIT 1`,
  ).bind(vendaId, skuAntes, varianteAntes, varianteAntes).first();
  if (!item) return ERRO(404, `A venda ${vendaId} não tem o código ${skuAntes}.`);

  const qtd = Number(item.qtd) || 0;
  if (qtd <= 0) return ERRO(409, 'A linha não tem quantidade para corrigir.');

  /* ─── a variação do código novo.
     Código com mais de uma variação exige saber QUAL saiu: escolher a
     primeira repetiria, na correção, exatamente o erro que a Central de
     Pendências existe para não cometer (§2 — nunca chute a distribuição). */
  const variacaoNova = String(corpo.variacaoNova ?? '').trim() || null;
  const varianteIdNovo = corpo.varianteIdNovo == null || corpo.varianteIdNovo === ''
    ? null : String(corpo.varianteIdNovo);
  const variacoes = await db.prepare(
    'SELECT nome, variante_id FROM produto_variacoes WHERE sku = ? ORDER BY ordem, nome',
  ).bind(skuNovo).all().catch(() => ({ results: [] }));
  const listaVar = variacoes.results ?? [];
  if (listaVar.length > 1 && !variacaoNova && !varianteIdNovo) {
    return ERRO(409, `${novo.desc} tem mais de uma variação. Diga qual saiu.`, {
      sku: skuNovo,
      variacoes: listaVar.map((v) => ({ nome: v.nome, varianteId: v.variante_id })),
    });
  }

  /* ─── estoque: só o que a peça física exige, e uma vez cada.
     A peça errada volta (ela nunca saiu de verdade) e a certa sai. Se não
     houver peça disponível no código certo, a correção PARA e diz o número
     — corrigir não pode criar saldo negativo em silêncio. */
  const moverEstoque = corpo.moverEstoque === undefined ? true : !!corpo.moverEstoque;
  if (moverEstoque && novo.disponivel < qtd) {
    return ERRO(409,
      `${novo.desc}: só há ${novo.disponivel} ${novo.disponivel === 1 ? 'peça disponível' : 'peças disponíveis'}, `
      + `e a correção precisa de ${qtd}. Confira o estoque antes de corrigir.`,
      { sku: skuNovo, disponivel: novo.disponivel, necessario: qtd });
  }

  const carimbo = new Date().toISOString();
  const obsEstorno = `Correção de código na venda ${vendaId}: ${skuAntes} → ${skuNovo} · ${carimbo}`;
  const obsBaixa = `Correção de código na venda ${vendaId}: recebe de ${skuAntes} · ${carimbo}`;

  const stmts = [
    db.prepare(
      /* O NOME também é corrigido, e o preço só se pedirem. `preco_tabela`
         segue intocado: ele é o catálogo NO MOMENTO DA VENDA, e trocar o
         código não reescreve quanto a peça custava naquele dia. */
      `UPDATE venda_itens
          SET sku = ?, desc = ?, variacao = ?, variante_id = ?
        WHERE rowid = ?`,
    ).bind(skuNovo, novo.desc, variacaoNova, varianteIdNovo, item.linha),
  ];

  let precoDepois = null;
  if (corpo.preco !== undefined && corpo.preco !== null && corpo.preco !== '') {
    const p = Number(corpo.preco);
    if (!Number.isFinite(p) || p < 0) return ERRO(400, 'Preço inválido.');
    precoDepois = dinheiro(p);
    /* Mudar o preço muda o TOTAL da venda — e é por isso que ele não muda
       sozinho. Quem pede o preço novo está pedindo os dois. */
    const totalNovo = dinheiro(Number(venda.total) - Number(item.preco) * qtd + precoDepois * qtd);
    stmts.push(db.prepare('UPDATE venda_itens SET preco = ? WHERE rowid = ?')
      .bind(precoDepois, item.linha));
    stmts.push(db.prepare('UPDATE vendas SET total = ? WHERE id = ?').bind(totalNovo, vendaId));
  }

  if (moverEstoque) {
    /* `ajuste` com sinal explícito, e não `entrada`/`venda`: nenhuma peça
       entrou no estoque nem foi vendida agora. O que houve foi uma
       correção de identidade, e o tipo do movimento diz isso. */
    stmts.push(...movimentar(db, {
      sku: skuAntes, tipo: 'ajuste', quantidade: qtd, origem: 'correcao_sku',
      vendaId, obs: obsEstorno, variacao: item.variacao, varianteId: item.variante_id,
    }));
    stmts.push(...movimentar(db, {
      sku: skuNovo, tipo: 'ajuste', quantidade: -qtd, origem: 'correcao_sku',
      vendaId, obs: obsBaixa, variacao: variacaoNova, varianteId: varianteIdNovo,
    }));
  }

  await db.batch(stmts);

  const movEstorno = moverEstoque ? await idDoMovimento(db, skuAntes, obsEstorno) : null;
  const movBaixa = moverEstoque ? await idDoMovimento(db, skuNovo, obsBaixa) : null;

  const correcao = await registrarCorrecao(db, {
    fonte: 'operacional', vendaId, historicoItemId: null,
    skuAntes, skuDepois: skuNovo,
    descAntes: item.desc, descDepois: novo.desc,
    variacaoAntes: item.variacao, variacaoDepois: variacaoNova,
    varianteIdAntes: item.variante_id, varianteIdDepois: varianteIdNovo,
    precoAntes: precoDepois == null ? null : Number(item.preco),
    precoDepois,
    estoqueMovido: moverEstoque ? 1 : 0,
    movEstorno, movBaixa, motivo,
  });

  const [depoisAntigo, depoisNovo] = await Promise.all([
    saldosDoSku(db, skuAntes), saldosDoSku(db, skuNovo),
  ]);

  return {
    ok: true,
    correcao,
    vendaId,
    /* §29 dito na resposta: a correção não é um pagamento nem um cancelamento. */
    faturamentoAlterado: precoDepois != null,
    estoque: moverEstoque ? {
      devolvido: { sku: skuAntes, qtd, saldo: depoisAntigo ? depoisAntigo.qtd : null },
      baixado: { sku: skuNovo, qtd, saldo: depoisNovo ? depoisNovo.qtd : null },
    } : { movimentado: false, motivo: 'Quem pediu a correção declarou que o estoque já está refletido.' },
    resumo: `SKU corrigido de ${skuAntes} para ${skuNovo} em ${hojeISO()}.`,
  };
}

/* ═════════════════════════════════════════════ linha da planilha */

async function corrigirHistorico(db, corpo, skuNovo, novo, motivo) {
  const id = Number(corpo.historicoItemId);
  if (!Number.isFinite(id)) return ERRO(400, 'Informe qual linha do histórico está errada.');

  const item = await db.prepare(
    `SELECT h.*, l.status AS lote_status
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id
      WHERE h.id = ?`,
  ).bind(id).first();
  if (!item) return ERRO(404, `Linha histórica ${id} não existe.`);
  if (item.lote_status !== 'importado') {
    return ERRO(409, 'O lote desta linha foi revertido — ela já não conta em lugar nenhum.');
  }
  if (String(item.sku_base ?? '').toUpperCase() === skuNovo) {
    return ERRO(409, 'O código informado é o mesmo que já está na linha.');
  }

  /* O estoque de uma linha de planilha NÃO se move. Ela é o retrato de uma
     venda que já aconteceu, e o saldo inicial do sistema já a levou em
     conta. Devolver e baixar aqui criaria uma peça no código errado e
     sumiria com uma no certo. Quem chama pode forçar o contrário, e a
     escolha fica registrada — mas o padrão é não mexer. */
  const moverEstoque = corpo.moverEstoque === true;
  if (moverEstoque) {
    return ERRO(409,
      'Linha da planilha não movimenta estoque: o saldo inicial já a levou em conta, '
      + 'e movimentar aqui criaria uma peça no código errado. Corrija só a identidade.');
  }

  /* Só as colunas de LEITURA são corrigidas. As `*_original` — e
     `sku_original` em particular — guardam o que estava escrito na célula, e
     essa é a única cópia do que a planilha dizia. Corrigir a leitura é o
     ato; apagar a fonte seria outro, e não é este.

     `nome_produto_historico` também fica: ele é o nome NA ÉPOCA, dado da
     planilha. Quem exibe resolve o nome novo pela correção registrada
     (perfilCliente faz isso), em vez de reescrever o que a fonte disse. */
  await db.prepare(
    'UPDATE vendas_historico_itens SET sku = ?, sku_base = ? WHERE id = ?',
  ).bind(skuNovo, skuNovo, id).run();

  const correcao = await registrarCorrecao(db, {
    fonte: 'historico', vendaId: null, historicoItemId: id,
    skuAntes: item.sku_base ?? item.sku ?? '(sem código)', skuDepois: skuNovo,
    descAntes: item.nome_produto_historico, descDepois: novo.desc,
    variacaoAntes: null, variacaoDepois: null,
    varianteIdAntes: null, varianteIdDepois: null,
    precoAntes: null, precoDepois: null,
    estoqueMovido: 0, movEstorno: null, movBaixa: null, motivo,
  });

  return {
    ok: true,
    correcao,
    historicoItemId: id,
    faturamentoAlterado: false,
    estoque: {
      movimentado: false,
      motivo: 'Linha da planilha: o estoque dela já estava refletido no saldo inicial.',
    },
    fontePreservada: {
      skuOriginal: item.sku_original ?? null,
      nomeNaEpoca: item.nome_produto_historico ?? null,
      regra: 'A célula da planilha não é reescrita. O que mudou é a leitura dela.',
    },
    resumo: `SKU corrigido de ${item.sku_base ?? item.sku} para ${skuNovo} em ${hojeISO()}.`,
  };
}

/* ══════════════════════════════════════════════════════════ auditoria */

async function registrarCorrecao(db, c) {
  const r = await db.prepare(
    `INSERT INTO venda_item_correcoes
       (fonte, venda_id, historico_item_id, sku_antes, sku_depois, desc_antes, desc_depois,
        variacao_antes, variacao_depois, variante_id_antes, variante_id_depois,
        preco_antes, preco_depois, estoque_movido,
        movimento_estorno_id, movimento_baixa_id, motivo)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
  ).bind(
    c.fonte, c.vendaId, c.historicoItemId, c.skuAntes, c.skuDepois,
    c.descAntes ?? null, c.descDepois ?? null,
    c.variacaoAntes ?? null, c.variacaoDepois ?? null,
    c.varianteIdAntes ?? null, c.varianteIdDepois ?? null,
    c.precoAntes, c.precoDepois, c.estoqueMovido,
    c.movEstorno, c.movBaixa, c.motivo,
  ).first();
  return publica(r);
}

function publica(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    fonte: r.fonte,
    vendaId: r.venda_id == null ? null : Number(r.venda_id),
    historicoItemId: r.historico_item_id == null ? null : Number(r.historico_item_id),
    skuAntes: r.sku_antes,
    skuDepois: r.sku_depois,
    descAntes: r.desc_antes ?? null,
    descDepois: r.desc_depois ?? null,
    variacaoDepois: r.variacao_depois ?? null,
    precoAntes: r.preco_antes == null ? null : Number(r.preco_antes),
    precoDepois: r.preco_depois == null ? null : Number(r.preco_depois),
    estoqueMovido: !!r.estoque_movido,
    motivo: r.motivo ?? null,
    criadoEm: r.criado_em,
    /* O texto que a tela mostra ao lado do item, no formato que o pacote
       pediu: "SKU corrigido de XXXXX para 326660 em DD/MM/AAAA." */
    texto: `SKU corrigido de ${r.sku_antes} para ${r.sku_depois} em `
      + `${String(r.criado_em ?? '').slice(0, 10).split('-').reverse().join('/')}.`,
  };
}

/** As correções de uma venda ou de uma linha do histórico, para a tela
 *  poder mostrá-las junto do item. */
export async function correcoesDeVenda(db, { vendaId = null, historicoItemIds = [] } = {}) {
  const partes = [];
  if (vendaId != null) {
    const { results } = await db.prepare(
      'SELECT * FROM venda_item_correcoes WHERE venda_id = ? ORDER BY id',
    ).bind(vendaId).all();
    partes.push(...(results ?? []));
  }
  const ids = (historicoItemIds ?? []).filter((x) => x != null);
  if (ids.length) {
    const qs = ids.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT * FROM venda_item_correcoes WHERE historico_item_id IN (${qs}) ORDER BY id`,
    ).bind(...ids).all();
    partes.push(...(results ?? []));
  }
  return partes.map(publica);
}

/** A lista de auditoria: o que foi corrigido, quando e o que aconteceu com
 *  o estoque. Existe para a pergunta "esse código sempre foi esse?" ter
 *  resposta sem abrir o banco. */
export async function listarCorrecoes(db, { limite = 200, offset = 0 } = {}) {
  const { results } = await db.prepare(
    `SELECT c.*, v.data AS venda_data, COALESCE(cl.nome, v.cliente_nome) AS cliente,
            h.data AS hist_data, h.cliente_nome_original AS cliente_hist
       FROM venda_item_correcoes c
       LEFT JOIN vendas v ON v.id = c.venda_id
       LEFT JOIN clientes cl ON cl.id = v.cliente_id
       LEFT JOIN vendas_historico_itens h ON h.id = c.historico_item_id
      ORDER BY c.id DESC LIMIT ? OFFSET ?`,
  ).bind(limite, offset).all();
  return {
    ok: true,
    correcoes: (results ?? []).map((r) => ({
      ...publica(r),
      dataVenda: r.venda_data ?? r.hist_data ?? null,
      cliente: r.cliente ?? r.cliente_hist ?? null,
    })),
    limite,
    offset,
  };
}
