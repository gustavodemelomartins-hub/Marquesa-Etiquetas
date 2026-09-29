/** §30 — SAÍDAS SEM FATURAMENTO
 *
 *  Brinde, uso próprio, perda/diferença de inventário e sorteio. Todas saem
 *  do estoque e nenhuma delas é venda.
 *
 *  O defeito que este módulo existe para corrigir: essas saídas entravam
 *  como CLIENTE e como VENDA. "Brinde dia das mães" virou uma cliente no
 *  ranking; a retirada pessoal virou compra dela; a peça perdida no
 *  inventário virou faturamento. Todo indicador comercial — faturamento,
 *  ticket médio, peças vendidas, clientes ativos — nasceu contaminado por
 *  dinheiro que nunca entrou.
 *
 *  As regras, que valem para os quatro tipos:
 *
 *    · baixa o estoque UMA vez, por `estoque.js › movimentar` (§19);
 *    · não cria cliente, não cria venda, não cria contas a receber;
 *    · não aparece em faturamento, ticket médio ou ranking — e isso não é
 *      um filtro que alguém precisa lembrar de escrever: a linha não está
 *      em `vendas`, então nenhuma soma de venda a alcança;
 *    · corrigir é ESTORNAR, não apagar: o histórico fica, o estoque volta.
 */
import { movimentar, saldosDoSku, componentesDoKit } from './estoque.js';
import { normSku } from './sku.js';

const TIPOS = new Set(['brinde', 'uso_proprio', 'perda', 'sorteio']);
const ROTULO = {
  brinde: 'Brinde',
  uso_proprio: 'Uso próprio',
  perda: 'Diferença de inventário / Perda',
  sorteio: 'Sorteio',
};

/** O tipo de MOVIMENTO que cada saída produz. Brinde e uso próprio sempre
 *  baixam; perda baixa ou devolve, conforme o sentido — uma diferença de
 *  inventário pode ser para os dois lados, e forçar tudo para baixo
 *  esconderia a sobra. Entrada usa `ajuste` porque é o único tipo cujo sinal
 *  vem no valor, e é o que a devolução de uma sobra realmente é. */
function tipoDeMovimento(tipo, sentido) {
  if (sentido === 'entrada') return 'ajuste';
  if (tipo === 'uso_proprio') return 'uso_proprio';
  if (tipo === 'brinde') return 'brinde';
  if (tipo === 'sorteio') return 'sorteio';
  return 'perda';
}

/** A ORIGEM do movimento — de onde o fato nasceu, que é outra coisa do que
 *  ele é. Uma diferença de inventário é `perda` como TIPO e `inventario`
 *  como ORIGEM: o motivo explica que é diferença, e a origem é o que a tela
 *  de histórico da peça mostra para dizer que aquilo veio de uma contagem
 *  física, não de um lançamento avulso. (Fase 4.4, decisão D9.) */
function origemDoMovimento(tipo, inventarioId) {
  return inventarioId != null ? 'inventario' : tipo;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);
const centavos = (v) => Math.round(v * 100) / 100;
const dataValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function publica(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    tipoRotulo: ROTULO[row.tipo] ?? row.tipo,
    sentido: row.sentido,
    data: row.data,
    sku: row.sku,
    produto: row.produto ?? null,
    /* §46 (29/09/2026) — o valor do que saiu, GRAVADO na saída: o preço de
       venda e o custo daquele momento. NULL quer dizer "não informado", e a
       tela diz isso — nunca soma 0. `*Fonte` diz de onde veio o número
       (lancamento | planilha | manual). `precoAtual`/`custoAtual` são os da
       peça HOJE, só para sugerir ao completar — nunca entram na conta. */
    precoUnit: row.preco_unit == null ? null : Number(row.preco_unit),
    precoFonte: row.preco_fonte ?? null,
    custoUnit: row.custo_unit == null ? null : Number(row.custo_unit),
    custoFonte: row.custo_fonte ?? null,
    valorTotal: row.preco_unit == null ? null : centavos(Number(row.preco_unit) * row.qtd),
    custoTotal: row.custo_unit == null ? null : centavos(Number(row.custo_unit) * row.qtd),
    precoAtual: row.preco_atual == null ? null : Number(row.preco_atual),
    custoAtual: row.custo_atual == null ? null : Number(row.custo_atual),
    /* Nome antigo do preço, mantido para quem ainda lê `precoVenda`. */
    precoVenda: row.preco_unit == null ? null : Number(row.preco_unit),
    variacao: row.variacao ?? null,
    varianteId: row.variante_id ?? null,
    qtd: row.qtd,
    motivo: row.motivo ?? null,
    observacao: row.observacao ?? null,
    movimentoId: row.movimento_id ?? null,
    /* Quem é dono da baixa física. `false` = esta linha só CLASSIFICA uma
       saída que já aconteceu (a linha da planilha já baixou a peça), e por
       isso o estorno dela não devolve nada. */
    estoqueRefletido: !!row.estoque_refletido,
    origemUsuario: row.origem_usuario ?? null,
    inventarioId: row.inventario_id ?? null,
    estornada: !!row.estornada,
    estornoEm: row.estorno_em ?? null,
    estornoMotivo: row.estorno_motivo ?? null,
    origemRegistro: row.origem_registro,
    historicoItemId: row.historico_item_id ?? null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em ?? null,
  };
}

/* ────────────────────────────────────────────────────────────── registrar */

export async function registrarSaida(db, corpo = {}) {
  const tipo = String(corpo.tipo ?? '').trim();
  if (!TIPOS.has(tipo)) {
    return { ok: false, statusHttp: 400, erro: 'Tipo inválido. Use brinde, uso_proprio, perda ou sorteio.' };
  }
  const sentido = String(corpo.sentido ?? 'saida').trim();
  if (sentido !== 'saida' && sentido !== 'entrada') {
    return { ok: false, statusHttp: 400, erro: 'Sentido inválido. Use saida ou entrada.' };
  }
  /* Sobra só existe em diferença de inventário. Brinde que ENTRA no estoque
     não é brinde — é devolução, e tem caminho próprio. */
  if (sentido === 'entrada' && tipo !== 'perda') {
    return {
      ok: false, statusHttp: 400,
      erro: 'Só a diferença de inventário pode somar peça. Brinde, uso próprio e sorteio sempre saem.',
    };
  }

  const data = corpo.data ? String(corpo.data).trim() : hojeISO();
  if (!dataValida(data)) return { ok: false, statusHttp: 400, erro: 'Data inválida. Use AAAA-MM-DD.' };
  /* Data futura é erro de digitação, pelo mesmo motivo da venda (§28): ela
     deslocaria a saída para um mês que ainda não aconteceu. */
  if (data > hojeISO()) {
    return { ok: false, statusHttp: 400, erro: `${data} ainda não chegou.` };
  }

  const sku = normSku(corpo.sku);
  if (!sku) return { ok: false, statusHttp: 400, erro: 'Informe o código da peça.' };
  const qtd = Number(corpo.qtd);
  if (!Number.isInteger(qtd) || qtd <= 0) {
    return { ok: false, statusHttp: 400, erro: 'Quantidade tem que ser um inteiro maior que zero.' };
  }

  /* §3 da revisão — de quem é a baixa física.
   *
   *  Uma linha vinda da planilha JÁ baixou a peça quando o lote foi
   *  importado. Reclassificá-la como brinde não pode baixar de novo: seria
   *  a segunda baixa da mesma peça. Ela entra como registro CLASSIFICATÓRIO
   *  — `estoque_refletido = 0`, sem movimento, e o estorno dela também não
   *  devolve peça nenhuma. Cada alteração física acontece uma vez só. */
  const daMigracao = corpo.origemRegistro === 'migracao_historico'
    || corpo.historicoItemId != null;
  const estoqueRefletido = !daMigracao;

  const s = await saldosDoSku(db, sku);
  if (!s) return { ok: false, statusHttp: 400, erro: `Código ${sku} não está no catálogo.`, sku };

  /* Kit não sai daqui. Ele não tem saldo próprio, e dar um brinde de kit
     precisaria decidir quais componentes saem — §2: não se chuta. */
  if ((await componentesDoKit(db, sku)).length) {
    return {
      ok: false, statusHttp: 409, sku,
      erro: `${s.desc} é um kit. Lance a saída dos componentes, um a um.`,
    };
  }

  if (estoqueRefletido && sentido === 'saida' && qtd > s.disponivel) {
    return { ok: false, statusHttp: 409, erro: `${s.desc}: só tem ${s.disponivel} disponível.`, sku };
  }

  const motivo = String(corpo.motivo ?? '').trim() || null;
  const observacao = String(corpo.observacao ?? '').trim() || null;
  /* Saída sem nenhuma explicação é indistinguível de erro de lançamento seis
     meses depois — a mesma regra que o desconto na venda já segue (§27).
     Perda aceita só a observação, porque "PERDIDO" é o que ela escreve. */
  if (!motivo && !observacao) {
    return {
      ok: false, statusHttp: 409,
      erro: 'Diga o motivo ou escreva uma observação — saída sem explicação não se audita depois.',
    };
  }

  const variacao = String(corpo.variacao ?? '').trim() || null;
  const varianteId = corpo.varianteId == null || corpo.varianteId === '' ? null : String(corpo.varianteId);

  /* §4.4/D8 — a diferença de inventário aponta para a contagem que a
     explicou. Só `perda` pode ter esse vínculo: brinde, uso próprio e
     sorteio não nascem de contagem nenhuma, e deixá-los entrar aqui daria a
     eles a origem `inventario` sem que ninguém tivesse contado nada. */
  const inventarioId = corpo.inventarioId == null ? null : Number(corpo.inventarioId);
  if (inventarioId != null && (!Number.isInteger(inventarioId) || tipo !== 'perda')) {
    return {
      ok: false, statusHttp: 400,
      erro: 'Só diferença de inventário se liga a um inventário.',
    };
  }

  /* O VALOR fica gravado na saída (29/09/2026). Lançamento de hoje: o
     preço e o custo da peça agora. Linha da planilha: o preço que a
     planilha registrou — o de hoje não diz nada sobre uma saída de abril —
     e custo nenhum, porque não há fonte. Sem preço (ou 0) fica NULL. */
  const ref = await db.prepare('SELECT preco, custo FROM produtos WHERE sku = ?').bind(sku).first();
  let precoUnit = null, precoFonte = null, custoUnit = null, custoFonte = null;
  if (daMigracao) {
    const h = corpo.historicoItemId == null ? null : await db.prepare(
      'SELECT preco_unit_original AS p FROM vendas_historico_itens WHERE id = ?',
    ).bind(corpo.historicoItemId).first();
    const p = h ? Number(h.p) : NaN;
    if (Number.isFinite(p) && p > 0) { precoUnit = p; precoFonte = 'planilha'; }
  } else {
    const p = Number(ref?.preco);
    if (ref?.preco != null && Number.isFinite(p) && p > 0) { precoUnit = p; precoFonte = 'lancamento'; }
    if (ref?.custo != null && Number.isFinite(Number(ref.custo))) {
      custoUnit = Number(ref.custo); custoFonte = 'lancamento';
    }
  }

  let linha;
  try {
    linha = await db.prepare(
      `INSERT INTO saidas_sem_faturamento
         (tipo, sentido, data, sku, variacao, variante_id, qtd, motivo, observacao,
          origem_usuario, origem_registro, historico_item_id, estoque_refletido, inventario_id,
          preco_unit, preco_fonte, custo_unit, custo_fonte)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).bind(
      tipo, sentido, data, sku, variacao, varianteId, qtd, motivo, observacao,
      String(corpo.usuario ?? '').trim() || null,
      daMigracao ? 'migracao_historico' : 'manual',
      corpo.historicoItemId ?? null,
      estoqueRefletido ? 1 : 0,
      inventarioId,
      precoUnit, precoFonte, custoUnit, custoFonte,
    ).first();
  } catch (e) {
    /* A idempotência é do BANCO, não da aplicação: `idx_saida_inventario_unica`
       recusa a segunda aplicação da mesma diferença mesmo sob crash-e-retry
       ou duas abas abertas — o que o antigo flag lido e escrito no mesmo
       batch não garantia. O relançamento depois do ESTORNO continua livre,
       porque o índice só vale para `estornada = 0`. */
    if (inventarioId != null && /UNIQUE constraint/i.test(String(e?.message ?? e))) {
      return {
        ok: false, statusHttp: 409, sku,
        erro: `A diferença de ${sku}${variacao ? ` (${variacao})` : ''} `
          + `do inventário ${inventarioId} já foi lançada.`,
      };
    }
    throw e;
  }

  /* Linha classificatória para aqui: nenhum movimento, nenhum saldo tocado,
     e a resposta diz isso em voz alta em vez de deixar quem chamou supor. */
  if (!estoqueRefletido) {
    return {
      ok: true,
      saida: publica({ ...linha, produto: s.desc }),
      estoque: { sku, desc: s.desc, antes: s.qtd, depois: s.qtd },
      estoqueAlterado: false,
      porQueNaoAlterouEstoque:
        'a linha histórica já baixou esta peça na importação — baixar aqui seria a segunda baixa',
      faturamento: 0,
      criouVenda: false,
      criouCliente: false,
    };
  }

  /* A linha que a razão vai mostrar no histórico da peça. A referência ao
     inventário entra aqui porque é ela que responde "de onde saiu isto" sem
     obrigar quem lê a saltar para outra tabela: `origem = 'inventario'` diz
     que o fato nasceu de uma contagem, e `#19` diz de QUAL. O motivo dela
     vem logo depois, que é o que a coluna sempre carregou. */
  const obsMov = `${ROTULO[tipo]} ${linha.id}`
    + (inventarioId != null ? ` · inventário #${inventarioId}` : '')
    + (motivo ? ` · ${motivo}` : '')
    + (data === hojeISO() ? '' : ` · de ${data}`);

  /* `efeitoDe` aplica o sinal do TIPO, então a quantidade vai sempre
     positiva aqui — menos no `ajuste` da sobra, que é o único tipo cujo
     sinal vem no valor e por isso precisa ser dito. */
  const stmts = movimentar(db, {
    sku,
    tipo: tipoDeMovimento(tipo, sentido),
    quantidade: qtd,
    origem: origemDoMovimento(tipo, inventarioId),
    obs: obsMov,
    variacao,
    varianteId,
  });
  await db.batch(stmts);

  /* O movimento recém-gravado é buscado depois porque `movimentar` devolve
     statements para o batch, e o batch não devolve o id de volta. `obs`
     carrega o id da saída, então a busca é exata — não é "o último". */
  const mov = await db.prepare(
    `SELECT id FROM movimentos WHERE sku = ? AND obs = ? ORDER BY id DESC LIMIT 1`,
  ).bind(sku, obsMov).first();
  if (mov) {
    await db.prepare('UPDATE saidas_sem_faturamento SET movimento_id = ? WHERE id = ?')
      .bind(mov.id, linha.id).run();
    linha.movimento_id = mov.id;
  }

  const depois = await saldosDoSku(db, sku);
  return {
    ok: true,
    saida: publica({ ...linha, produto: s.desc }),
    estoque: { sku, desc: s.desc, antes: s.qtd, depois: depois.qtd },
    estoqueAlterado: true,
    /* §30 dito em voz alta na resposta: quem chamou não precisa deduzir. */
    faturamento: 0,
    criouVenda: false,
    criouCliente: false,
  };
}

/* ───────────────────────────────────────────────────────────────── estorno */

/** Estornar NÃO apaga. Um segundo movimento devolve a peça, e a linha
 *  continua no histórico dizendo que houve, e que foi desfeita. Soft delete
 *  sem rastro deixaria o estoque certo e a explicação perdida. */
export async function estornarSaida(db, id, { motivo = null } = {}) {
  const linha = await db.prepare('SELECT * FROM saidas_sem_faturamento WHERE id = ?').bind(id).first();
  if (!linha) return { ok: false, statusHttp: 404, erro: 'Saída não encontrada.' };
  if (linha.estornada) return { ok: false, statusHttp: 409, erro: 'Esta saída já foi estornada.' };

  const razao = String(motivo ?? '').trim();
  if (!razao) return { ok: false, statusHttp: 400, erro: 'Diga por que está estornando.' };

  const antes = await saldosDoSku(db, linha.sku);

  /* A linha que nunca foi dona da baixa não devolve peça ao ser estornada.
     Devolver aqui somaria ao estoque uma unidade que jamais saiu por causa
     dela — a peça saiu na importação da planilha, e continua fora. O
     estorno existe mesmo assim: ele desfaz a CLASSIFICAÇÃO. */
  if (!linha.estoque_refletido) {
    /* Estornar a saída histórica é dizer que a linha da planilha ERA venda:
       a decisão de reclassificação que a criou sai junto, no mesmo batch,
       senão o dinheiro continuaria fora do faturamento sem saída nenhuma
       que o explicasse. A saída estornada fica, com o motivo. */
    await db.batch([
      db.prepare(
        `UPDATE saidas_sem_faturamento
            SET estornada = 1, estorno_em = datetime('now'), estorno_motivo = ?,
                atualizado_em = datetime('now')
          WHERE id = ?`,
      ).bind(razao, id),
      db.prepare('DELETE FROM historico_reclassificacao WHERE saida_id = ?').bind(id),
    ]);
    const atualizada = await db.prepare('SELECT * FROM saidas_sem_faturamento WHERE id = ?').bind(id).first();
    return {
      ok: true,
      saida: publica(atualizada),
      estoque: { sku: linha.sku, antes: antes.qtd, depois: antes.qtd },
      estoqueAlterado: false,
      porQueNaoAlterouEstoque:
        'esta linha nunca baixou estoque — quem baixou foi a linha da planilha, e ela continua baixada',
    };
  }

  const obsMov = `Estorno da ${ROTULO[linha.tipo]} ${linha.id} · ${razao}`;

  /* O inverso exato do movimento original, sempre por `ajuste` — o tipo cujo
     sinal vem no valor. Saída estornada devolve (+qtd); sobra estornada
     retira (−qtd). */
  const stmts = movimentar(db, {
    sku: linha.sku,
    tipo: 'ajuste',
    quantidade: linha.sentido === 'entrada' ? -linha.qtd : linha.qtd,
    origem: 'estorno',
    obs: obsMov,
    variacao: linha.variacao,
    varianteId: linha.variante_id,
  });
  await db.batch(stmts);

  const mov = await db.prepare(
    `SELECT id FROM movimentos WHERE sku = ? AND obs = ? ORDER BY id DESC LIMIT 1`,
  ).bind(linha.sku, obsMov).first();

  const atualizada = await db.prepare(
    `UPDATE saidas_sem_faturamento
        SET estornada = 1, estorno_em = datetime('now'), estorno_motivo = ?,
            estorno_movimento_id = ?, atualizado_em = datetime('now')
      WHERE id = ? RETURNING *`,
  ).bind(razao, mov?.id ?? null, id).first();

  const depois = await saldosDoSku(db, linha.sku);
  return {
    ok: true,
    saida: publica(atualizada),
    estoque: { sku: linha.sku, antes: antes.qtd, depois: depois.qtd },
    estoqueAlterado: true,
  };
}

/* ───────────────────────────────────────────────────────────────── leitura */

export async function listarSaidas(db, {
  de = null, ate = null, tipo = null, incluirEstornadas = true, limite = 200, offset = 0,
  busca = null,
} = {}) {
  const t = tipo && TIPOS.has(tipo) ? tipo : null;
  const { results } = await db.prepare(
    `SELECT s.*, p.desc AS produto, p.preco AS preco_atual, p.custo AS custo_atual
       FROM saidas_sem_faturamento s
       LEFT JOIN produtos p ON p.sku = s.sku
      WHERE (? IS NULL OR s.data >= ?)
        AND (? IS NULL OR s.data <= ?)
        AND (? IS NULL OR s.tipo = ?)
        AND (? = 1 OR s.estornada = 0)
        AND (? IS NULL OR s.sku LIKE ? OR LOWER(COALESCE(p.desc, '')) LIKE ?
             OR LOWER(COALESCE(s.motivo, '') || ' ' || COALESCE(s.observacao, '')) LIKE ?)
      ORDER BY s.data DESC, s.id DESC
      LIMIT ? OFFSET ?`,
  ).bind(de, de, ate, ate, t, t, incluirEstornadas ? 1 : 0,
    ...(() => { const b = busca ? `%${String(busca).trim().toLowerCase()}%` : null; return [b, b, b, b]; })(),
    limite, offset).all();

  const linhas = (results ?? []).map(publica);
  /* O resumo diz, na mesma resposta, quantas PEÇAS saíram sem virar venda.
     É o número que responde "quanto eu dei de brinde este mês" — e ele não
     existe em lugar nenhum das métricas de venda, de propósito. */
  const resumo = { brinde: 0, uso_proprio: 0, perda: 0, sorteio: 0, total: 0, estornadas: 0 };
  /* §46 — o dinheiro, ao lado das peças, com o valor GRAVADO em cada
     saída. Linha sem valor NÃO entra como zero: ela é contada à parte
     (`semCusto`/`semPreco` em lançamentos, `pecasSem*` em peças), senão o
     total pareceria completo com metade das peças sem valor. */
  const valor = {
    custo: 0, venda: 0, semCusto: 0, semPreco: 0, pecasSemCusto: 0, pecasSemPreco: 0,
  };
  for (const l of linhas) {
    if (l.estornada) { resumo.estornadas++; continue; }
    const n = l.sentido === 'entrada' ? -l.qtd : l.qtd;
    resumo[l.tipo] += n;
    resumo.total += n;
    if (l.custoUnit == null) { valor.semCusto++; valor.pecasSemCusto += n; } else valor.custo += l.custoUnit * n;
    if (l.precoUnit == null) { valor.semPreco++; valor.pecasSemPreco += n; } else valor.venda += l.precoUnit * n;
  }
  valor.custo = Math.round(valor.custo * 100) / 100;
  valor.venda = Math.round(valor.venda * 100) / 100;
  resumo.valor = valor;
  /* §30 — linha da planilha reclassificada como não-venda que NÃO virou
     saída (sem data, ou código fora do catálogo). Ela não some: aparece aqui,
     marcada como legado, com o que a planilha registrou. */
  const { results: semSaida } = await db.prepare(
    `SELECT rc.id, rc.classe_nova, rc.motivo, rc.decidido_em, rc.decidido_por,
            h.id AS item_id, h.origem_linha, h.data, h.sku, h.qtd, h.valor_total,
            h.cliente_nome_original, h.nome_produto_historico, h.observacao_original, h.desconto_original,
            p.desc AS produto
       FROM historico_reclassificacao rc
       JOIN vendas_historico_itens h ON h.id = rc.historico_item_id
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
       LEFT JOIN produtos p ON p.sku = h.sku_base
      WHERE rc.status = 'aplicada' AND rc.saida_id IS NULL
        AND (? IS NULL OR rc.classe_nova = ?)
      ORDER BY h.data DESC, rc.id DESC`,
  ).bind(t, t).all();
  const legado = (semSaida ?? []).map((r) => ({
    reclassificacaoId: r.id,
    tipo: r.classe_nova,
    tipoRotulo: ROTULO[r.classe_nova] ?? r.classe_nova,
    data: r.data ?? null,
    sku: r.sku ?? null,
    produto: r.produto ?? r.nome_produto_historico ?? null,
    qtd: r.qtd == null ? null : Number(r.qtd),
    valorPlanilha: r.valor_total == null ? null : Number(r.valor_total),
    pessoa: r.cliente_nome_original ?? null,
    observacao: [r.desconto_original, r.observacao_original].filter(Boolean).join(' · ') || null,
    motivo: r.motivo,
    linhaPlanilha: r.origem_linha,
    historicoItemId: r.item_id,
    decididoEm: r.decidido_em,
    decididoPor: r.decidido_por ?? null,
    porque: !r.data ? 'sem data na planilha' : 'código fora do catálogo',
  }));
  return { ok: true, saidas: linhas, resumo, limite, offset, legado };
}

/* ─────────────────────────────────────────── completar o valor depois */

const LIMITE_MOTIVO_VALOR = 200;

/** Preenche ou corrige o preço de venda e/ou o custo unitário de uma saída
 *  JÁ lançada — o caso da linha antiga sem valor e do custo que a peça não
 *  tinha. Toda mudança vai para `saidas_valor_historico` com o anterior, o
 *  novo e o motivo, que é obrigatório: edição financeira retroativa sem
 *  motivo não se audita depois. Não mexe em estoque nem em movimento.
 *
 *  `tambemNaPeca` grava o custo também como custo de REFERÊNCIA da peça
 *  (`produtos.custo`, com `produtos_custo_historico` origem `saida`), para as
 *  próximas saídas já nascerem com ele. */
export async function completarValorSaida(db, id, corpo = {}) {
  const linha = await db.prepare('SELECT * FROM saidas_sem_faturamento WHERE id = ?').bind(id).first();
  if (!linha) return { ok: false, statusHttp: 404, erro: 'Saída não encontrada.' };

  const motivo = String(corpo.motivo ?? '').trim();
  if (motivo.length < 3) {
    return { ok: false, statusHttp: 400, erro: 'Diga de onde veio o valor (ex.: "nota da compra", "preço da etiqueta").' };
  }
  if (motivo.length > LIMITE_MOTIVO_VALOR) {
    return { ok: false, statusHttp: 400, erro: `Motivo longo demais (máximo ${LIMITE_MOTIVO_VALOR} caracteres).` };
  }

  const lerValor = (v, nome) => {
    if (v === undefined) return { ignora: true };
    if (v === null || v === '') return { valor: null };
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return { erro: `${nome} inválido.` };
    return { valor: centavos(n) };
  };
  const preco = lerValor(corpo.precoUnit, 'Preço');
  const custo = lerValor(corpo.custoUnit, 'Custo');
  if (preco.erro || custo.erro) return { ok: false, statusHttp: 400, erro: preco.erro || custo.erro };
  if (preco.ignora && custo.ignora) return { ok: false, statusHttp: 400, erro: 'Informe o preço, o custo ou os dois.' };
  if (!preco.ignora && preco.valor === 0) {
    return { ok: false, statusHttp: 400, erro: 'Preço de venda 0 não é valor: deixe em branco se não se sabe.' };
  }

  const stmts = [];
  const mudou = [];
  const campo = (nome, fonteCol, atual, novo) => {
    const anterior = atual == null ? null : Number(atual);
    if (anterior === novo) return;
    stmts.push(db.prepare(
      `UPDATE saidas_sem_faturamento SET ${nome} = ?, ${fonteCol} = ?, atualizado_em = datetime('now') WHERE id = ?`,
    ).bind(novo, novo == null ? null : 'manual', id));
    stmts.push(db.prepare(
      `INSERT INTO saidas_valor_historico (saida_id, campo, anterior, novo, fonte, motivo)
       VALUES (?, ?, ?, ?, 'manual', ?)`,
    ).bind(id, nome, anterior, novo, motivo));
    mudou.push({ campo: nome, anterior, novo });
  };
  if (!preco.ignora) campo('preco_unit', 'preco_fonte', linha.preco_unit, preco.valor);
  if (!custo.ignora) campo('custo_unit', 'custo_fonte', linha.custo_unit, custo.valor);

  if (corpo.tambemNaPeca && !custo.ignora && custo.valor != null) {
    const p = await db.prepare('SELECT custo FROM produtos WHERE sku = ?').bind(linha.sku).first();
    const anterior = p?.custo == null ? null : Number(p.custo);
    if (p && anterior !== custo.valor) {
      stmts.push(db.prepare('UPDATE produtos SET custo = ? WHERE sku = ?').bind(custo.valor, linha.sku));
      stmts.push(db.prepare(
        `INSERT INTO produtos_custo_historico (sku, anterior, novo, origem, motivo) VALUES (?, ?, ?, 'saida', ?)`,
      ).bind(linha.sku, anterior, custo.valor, `Saída #${id}: ${motivo}`.slice(0, 200)));
      mudou.push({ campo: 'produtos.custo', anterior, novo: custo.valor });
    }
  }

  if (stmts.length) await db.batch(stmts);
  const nova = await db.prepare(
    `SELECT s.*, p.desc AS produto, p.preco AS preco_atual, p.custo AS custo_atual
       FROM saidas_sem_faturamento s LEFT JOIN produtos p ON p.sku = s.sku WHERE s.id = ?`,
  ).bind(id).first();
  return { ok: true, saida: publica(nova), mudou, estoqueAlterado: false };
}

/** O histórico de valor de uma saída, do mais novo ao mais antigo. */
export async function historicoValorSaida(db, id) {
  const { results } = await db.prepare(
    `SELECT campo, anterior, novo, fonte, motivo, em FROM saidas_valor_historico
      WHERE saida_id = ? ORDER BY em DESC, id DESC`,
  ).bind(id).all();
  return { ok: true, historico: results ?? [] };
}

export { ROTULO as ROTULO_SAIDA, TIPOS as TIPOS_SAIDA };
