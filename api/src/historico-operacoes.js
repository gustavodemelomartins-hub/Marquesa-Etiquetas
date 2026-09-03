/** Decisões duráveis sobre vendas históricas.
 *
 * `vendas_historicas` é reconstruída e pode sumir/reaparecer. Papel da
 * pessoa, acerto documental, vínculo de duplicata e quitação não podem ser
 * gravados nela. Esta camada nunca importa `estoque.js`: pagamento não move
 * peça e vínculo de duplicata não cancela a venda operacional que fez a
 * baixa física correta.
 */

const centavos = (valor) => valor == null ? null : Math.round(Number(valor) * 100);
const reais = (valor) => valor == null ? null : +(Number(valor) / 100).toFixed(2);
const hoje = () => new Date().toISOString().slice(0, 10);
const agora = () => new Date().toISOString();

async function sha256(valor) {
  const bytes = new TextEncoder().encode(JSON.stringify(valor));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function jsonSeguro(valor, padrao) {
  try { return JSON.parse(valor ?? ''); } catch { return padrao; }
}

/** Assinatura apenas do conteúdo comercial normalizado. IDs derivados e
 * metadados do XLSX não entram: reconstruir o mesmo conteúdo deve preservar
 * a decisão; mudar item, quantidade ou valor deve bloqueá-la. */
export async function fingerprintDaVendaHistorica(db, loteId, vendaChave) {
  const venda = await db.prepare(
    `SELECT chave, classe, cliente_nome_norm, data, pecas, valor_total,
            valor_pago, status, canal, contexto, origem_linhas
       FROM vendas_historicas
      WHERE lote_id = ? AND chave = ?`,
  ).bind(loteId, vendaChave).first();
  if (!venda) return null;
  const { results } = await db.prepare(
    `SELECT origem_linha, sku_base, qtd, valor_total, pago,
            desconto_original, observacao_original
       FROM vendas_historico_itens
      WHERE lote_id = ? AND pedido_chave = ?
      ORDER BY id`,
  ).bind(loteId, vendaChave).all();
  return sha256({
    chave: venda.chave,
    classe: venda.classe,
    nome: venda.cliente_nome_norm,
    data: venda.data,
    pecas: Number(venda.pecas),
    valorTotal: centavos(venda.valor_total),
    valorPago: centavos(venda.valor_pago),
    status: venda.status,
    canal: venda.canal,
    contexto: venda.contexto,
    linhas: (results ?? []).map((item) => ({
      numero: String(item.origem_linha),
      sku: item.sku_base,
      qtd: Number(item.qtd),
      valor: centavos(item.valor_total),
      pago: item.pago,
      desconto: item.desconto_original,
      observacao: item.observacao_original,
    })),
  });
}

function operacaoPublica(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    versao: Number(row.versao),
    vendaChave: row.venda_chave,
    papel: row.papel,
    clienteId: row.cliente_id == null ? null : Number(row.cliente_id),
    clienteNorm: row.cliente_nome_norm,
    cliente: row.cliente,
    revendedoraId: row.revendedora_id == null ? null : Number(row.revendedora_id),
    data: row.data,
    pecas: Number(row.pecas ?? 0),
    cobrancaStatus: row.cobranca_status,
    valorEfetivo: reais(row.valor_efetivo_centavos),
    valorRecebidoFonte: reais(row.valor_recebido_fonte_centavos),
    valorRecebido: reais(row.valor_recebido_centavos),
    valorReceber: reais(row.saldo_centavos),
    vencimentoEm: row.vencimento_em,
    vencimentoOrigem: row.vencimento_origem,
    pagaEm: row.paga_em,
    canal: row.canal,
    contexto: row.contexto,
    observacao: row.observacao,
    vencida: row.cobranca_status === 'aberta' && !!row.vencimento_em && row.vencimento_em < hoje(),
  };
}

const SQL_CONTA = `
  SELECT ho.*, vh.data,
         COALESCE(c.nome, vh.cliente_nome) AS cliente
    FROM historico_operacoes ho
    JOIN vendas_historico_lotes l
      ON l.id = ho.lote_id AND l.status = 'importado'
    JOIN vendas_historicas vh
      ON vh.lote_id = ho.lote_id AND vh.chave = ho.venda_chave
    LEFT JOIN clientes c ON c.id = COALESCE(ho.cliente_id, vh.cliente_id)
   WHERE ho.status_registro = 'ativa'`;

export async function listarContasReceber(db, { status = 'aberta' } = {}) {
  const aceitos = new Set(['aberta', 'paga', 'todas']);
  if (!aceitos.has(status)) return { ok: false, statusHttp: 400, erro: 'Status de cobrança inválido.' };
  const filtro = status === 'todas' ? '' : ' AND ho.cobranca_status = ?';
  const q = db.prepare(
    `${SQL_CONTA}
       AND ho.papel = 'cliente'
       AND ho.cobranca_status <> 'nenhuma'${filtro}
     ORDER BY CASE
                WHEN ho.cobranca_status='aberta' AND ho.vencimento_em < date('now') THEN 0
                WHEN ho.cobranca_status='aberta' AND ho.vencimento_em IS NOT NULL THEN 1
                WHEN ho.cobranca_status='aberta' THEN 2
                ELSE 3
              END,
              ho.vencimento_em, vh.data, cliente`,
  );
  const { results } = status === 'todas' ? await q.all() : await q.bind(status).all();

  /* A lista é pequena e todos os cálculos continuam em centavos inteiros. */
  const { results: abertas } = await db.prepare(
    `${SQL_CONTA} AND ho.papel='cliente' AND ho.cobranca_status='aberta'`,
  ).all();
  const listaAbertas = abertas ?? [];
  const totalCentavos = listaAbertas.reduce((s, x) => s + Number(x.saldo_centavos ?? 0), 0);
  return {
    ok: true,
    resumo: {
      quantidade: listaAbertas.length,
      totalCentavos,
      total: reais(totalCentavos),
      vencidas: listaAbertas.filter((x) => x.vencimento_em && x.vencimento_em < hoje()).length,
      semPrazo: listaAbertas.filter((x) => !x.vencimento_em).length,
    },
    contas: (results ?? []).map(operacaoPublica),
  };
}

async function contaAtiva(db, id) {
  const direta = await db.prepare(`${SQL_CONTA} AND ho.id = ?`).bind(id).first();
  if (direta) return direta;
  /* O id muda a cada versão. Resolver a chave da versão pedida torna um
   * retry do mesmo clique seguro: se a primeira resposta se perdeu, a
   * segunda chamada encontra a versão ativa em vez de responder 404. */
  const anterior = await db.prepare(
    'SELECT venda_chave FROM historico_operacoes WHERE id = ?',
  ).bind(id).first();
  if (!anterior) return null;
  return db.prepare(`${SQL_CONTA} AND ho.venda_chave = ?`)
    .bind(anterior.venda_chave).first();
}

const CAMPOS_VERSAO = [
  'lote_id', 'venda_chave', 'fingerprint', 'papel', 'cliente_id', 'cliente_nome_norm',
  'revendedora_id', 'pecas', 'bruto_centavos', 'comissao_centavos', 'liquido_centavos',
  'linhas_excluidas_json', 'cobranca_status', 'valor_efetivo_centavos',
  'valor_recebido_fonte_centavos', 'valor_recebido_centavos', 'saldo_centavos', 'vencimento_em',
  'vencimento_origem', 'paga_em', 'canal', 'contexto', 'observacao', 'evidencia_json',
];

async function criarNovaVersao(db, atual, mudancas) {
  const proxima = { ...atual, ...mudancas };
  const versao = Number(atual.versao) + 1;
  const valores = CAMPOS_VERSAO.map((campo) => proxima[campo]);
  try {
    await db.batch([
      db.prepare(
        `UPDATE historico_operacoes
            SET status_registro='substituida', atualizado_em=datetime('now')
          WHERE id=? AND versao=? AND status_registro='ativa'`,
      ).bind(atual.id, atual.versao),
      db.prepare(
        `INSERT INTO historico_operacoes
          (${CAMPOS_VERSAO.join(',')}, versao, status_registro, substitui_id, atualizado_em)
         VALUES (${CAMPOS_VERSAO.map(() => '?').join(',')}, ?, 'ativa', ?, datetime('now'))`,
      ).bind(...valores, versao, atual.id),
    ]);
  } catch (erro) {
    const corrente = await db.prepare(
      `SELECT id, versao, cobranca_status, saldo_centavos, vencimento_em, paga_em
         FROM historico_operacoes
        WHERE venda_chave=? AND status_registro='ativa'`,
    ).bind(atual.venda_chave).first();
    return { ok: false, statusHttp: 409, erro: 'A cobrança mudou em outra ação. Recarregue antes de continuar.', corrente };
  }
  const nova = await contaAtiva(db, proxima.id ?? atual.id);
  /* `contaAtiva(id antigo)` não encontra a versão nova; a chave é estável. */
  const row = nova ?? await db.prepare(`${SQL_CONTA} AND ho.venda_chave=?`).bind(atual.venda_chave).first();
  return { ok: true, conta: operacaoPublica(row) };
}

export async function marcarContaPaga(db, id, { confirmar = false, versaoEsperada = null } = {}) {
  if (!confirmar) return { ok: false, statusHttp: 400, erro: 'Confirme explicitamente que o valor foi pago.' };
  const atual = await contaAtiva(db, id);
  if (!atual) return { ok: false, statusHttp: 404, erro: 'Cobrança não encontrada.' };
  if (atual.papel !== 'cliente') return { ok: false, statusHttp: 409, erro: 'Acerto de revendedora não é dívida de cliente.' };
  if (atual.cobranca_status === 'paga') return { ok: true, jaEstavaPaga: true, conta: operacaoPublica(atual) };
  if (atual.cobranca_status !== 'aberta') return { ok: false, statusHttp: 409, erro: 'Esta operação não está aberta para recebimento.' };
  if (Number(versaoEsperada) !== Number(atual.versao)) {
    return { ok: false, statusHttp: 409, erro: 'A cobrança mudou. Recarregue antes de confirmar.', conta: operacaoPublica(atual) };
  }
  return criarNovaVersao(db, atual, {
    cobranca_status: 'paga',
    valor_recebido_centavos: atual.valor_efetivo_centavos,
    saldo_centavos: 0,
    paga_em: agora(),
  });
}

export async function definirVencimento(db, id, { vencimentoEm = null, versaoEsperada = null } = {}) {
  if (vencimentoEm != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(vencimentoEm))) {
    return { ok: false, statusHttp: 400, erro: 'Prazo inválido. Use AAAA-MM-DD.' };
  }
  const atual = await contaAtiva(db, id);
  if (!atual) return { ok: false, statusHttp: 404, erro: 'Cobrança não encontrada.' };
  if (atual.cobranca_status !== 'aberta') return { ok: false, statusHttp: 409, erro: 'Só cobrança aberta recebe prazo.' };
  if (Number(versaoEsperada) !== Number(atual.versao)) {
    return { ok: false, statusHttp: 409, erro: 'A cobrança mudou. Recarregue antes de definir o prazo.', conta: operacaoPublica(atual) };
  }
  return criarNovaVersao(db, atual, {
    vencimento_em: vencimentoEm || null,
    vencimento_origem: vencimentoEm ? 'manual' : null,
  });
}

async function vendaHistoricaAtiva(db, chave) {
  return db.prepare(
    `SELECT vh.*, l.id AS lote_ativo
       FROM vendas_historicas vh
       JOIN vendas_historico_lotes l ON l.id=vh.lote_id AND l.status='importado'
      WHERE vh.chave=?`,
  ).bind(chave).first();
}

async function assinaturaOperacional(db, vendaId) {
  const venda = await db.prepare(
    `SELECT id, data, total, cancelada, cliente_nome_norm FROM vendas WHERE id=?`,
  ).bind(vendaId).first();
  if (!venda || Number(venda.cancelada)) return null;
  const { results } = await db.prepare(
    `SELECT sku, qtd, preco FROM venda_itens WHERE venda_id=? ORDER BY sku, rowid`,
  ).bind(vendaId).all();
  return {
    data: venda.data,
    nome: venda.cliente_nome_norm,
    total: centavos(venda.total),
    pecas: (results ?? []).reduce((s, x) => s + Number(x.qtd), 0),
    itens: agruparAssinatura(results ?? [], (x) => ({
      sku: x.sku, qtd: x.qtd, centavos: centavos(Number(x.qtd) * Number(x.preco)),
    })),
  };
}

async function assinaturaHistorica(db, venda) {
  const { results } = await db.prepare(
    `SELECT sku_base, qtd, valor_total FROM vendas_historico_itens
      WHERE lote_id=? AND pedido_chave=? ORDER BY sku_base, id`,
  ).bind(venda.lote_id, venda.chave).all();
  return {
    data: venda.data,
    nome: venda.cliente_nome_norm,
    total: centavos(venda.valor_total),
    pecas: Number(venda.pecas),
    itens: agruparAssinatura(results ?? [], (x) => ({
      sku: x.sku_base, qtd: x.qtd, centavos: centavos(x.valor_total),
    })),
  };
}

function agruparAssinatura(itens, ler) {
  const porSku = new Map();
  for (const item of itens) {
    const l = ler(item);
    const sku = String(l.sku ?? '').trim().toUpperCase();
    const atual = porSku.get(sku) ?? { qtd: 0, centavos: 0 };
    atual.qtd += Number(l.qtd ?? 0);
    atual.centavos += Number(l.centavos ?? 0);
    porSku.set(sku, atual);
  }
  return [...porSku.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sku, x]) => `${sku}|${x.qtd}|${x.centavos}`);
}

const mesmo = (a, b) => String(a ?? '') === String(b ?? '');

async function decisaoExistenteConfere(db, existente, p) {
  const e = p.entrada;
  const campos = [
    [existente.papel, p.papel],
    [existente.cliente_id, e.clienteId ?? p.venda.cliente_id],
    [existente.cliente_nome_norm, e.clienteNomeNorm ?? p.venda.cliente_nome_norm],
    [existente.revendedora_id, e.revendedoraId ?? null],
    [existente.pecas, e.pecas ?? p.venda.pecas],
    [existente.bruto_centavos, p.bruto],
    [existente.comissao_centavos, p.comissao],
    [existente.liquido_centavos, p.liquido],
    [existente.linhas_excluidas_json, JSON.stringify(p.excluidas)],
    [existente.cobranca_status, p.cobranca],
    [existente.valor_efetivo_centavos, p.efetivo],
    [existente.valor_recebido_fonte_centavos, p.recebido],
    [existente.valor_recebido_centavos, p.recebidoAtual],
    [existente.saldo_centavos, p.saldo],
    [existente.vencimento_em, e.vencimentoEm ?? null],
    [existente.canal, e.canal ?? p.venda.canal],
    [existente.contexto, e.contexto ?? p.venda.contexto],
    [existente.observacao, e.observacao ?? p.venda.observacao_original],
  ];
  if (campos.some(([a, b]) => !mesmo(a, b))) return false;
  const { results } = await db.prepare(
    `SELECT venda_id FROM historico_operacao_vendas
      WHERE operacao_id=? AND status_registro='ativa' ORDER BY venda_id`,
  ).bind(existente.id).all();
  const gravadas = (results ?? []).map((x) => Number(x.venda_id));
  const pedidas = p.duplicatas.map((x) => Number(x.vendaId)).sort((a, b) => a - b);
  return JSON.stringify(gravadas) === JSON.stringify(pedidas);
}

/** Entrada administrativa usada no backfill revisado. Ela analisa todas as
 * operações antes do primeiro INSERT e é idempotente por chave+fingerprint. */
export async function aplicarOperacoesHistoricas(db, { operacoes = [] } = {}) {
  if (!Array.isArray(operacoes) || !operacoes.length) {
    return { ok: false, statusHttp: 400, erro: 'Informe ao menos uma operação.' };
  }
  const preparadas = [];
  for (const entrada of operacoes) {
    const venda = await vendaHistoricaAtiva(db, entrada.vendaChave);
    if (!venda) return { ok: false, statusHttp: 409, erro: `Venda histórica não encontrada: ${entrada.vendaChave}.` };
    if (venda.classe !== 'venda') return { ok: false, statusHttp: 409, erro: `${entrada.vendaChave} não é uma venda.` };
    const fingerprint = await fingerprintDaVendaHistorica(db, venda.lote_id, venda.chave);
    const existente = await db.prepare(
      `SELECT * FROM historico_operacoes WHERE venda_chave=? AND status_registro='ativa'`,
    ).bind(venda.chave).first();
    if (existente && existente.fingerprint !== fingerprint) {
      return { ok: false, statusHttp: 409, erro: `A decisão ativa de ${venda.chave} pertence a outro conteúdo.` };
    }

    const papel = entrada.papel ?? 'cliente';
    if (!['cliente', 'acerto', 'revisao'].includes(papel)) return { ok: false, statusHttp: 400, erro: `Papel inválido em ${venda.chave}.` };
    const excluidas = (entrada.linhasExcluidas ?? []).map(String);
    const linhas = new Set(jsonSeguro(venda.origem_linhas, []).map(String));
    if (excluidas.some((x) => !linhas.has(x))) return { ok: false, statusHttp: 409, erro: `Linha excluída não pertence a ${venda.chave}.` };

    const efetivo = entrada.valorEfetivoCentavos ?? centavos(venda.valor_total);
    const recebido = entrada.valorRecebidoFonteCentavos ?? centavos(venda.valor_pago) ?? 0;
    const recebidoAtual = entrada.valorRecebidoCentavos ?? recebido;
    const saldo = entrada.saldoCentavos ?? (efetivo == null ? null : Math.max(0, efetivo - recebidoAtual));
    const cobranca = entrada.cobrancaStatus ?? (papel === 'cliente' && saldo > 0 ? 'aberta' : 'nenhuma');
    const bruto = entrada.brutoCentavos ?? null;
    const comissao = entrada.comissaoCentavos ?? null;
    const liquido = entrada.liquidoCentavos ?? null;
    if (papel === 'acerto' && (!entrada.revendedoraId || bruto == null || comissao == null || liquido == null || bruto !== comissao + liquido)) {
      return { ok: false, statusHttp: 409, erro: `Acerto sem valores documentais fechados em ${venda.chave}.` };
    }
    if (cobranca === 'aberta' && !(saldo > 0)) return { ok: false, statusHttp: 409, erro: `Cobrança aberta sem saldo em ${venda.chave}.` };

    const duplicatas = [];
    for (const vinculo of entrada.vendasDuplicadas ?? []) {
      const op = await assinaturaOperacional(db, Number(vinculo.vendaId));
      const hist = await assinaturaHistorica(db, venda);
      if (!op || op.total !== hist.total || op.pecas !== hist.pecas
          || JSON.stringify(op.itens) !== JSON.stringify(hist.itens)) {
        return { ok: false, statusHttp: 409, erro: `Venda ${vinculo.vendaId} não é duplicata exata de ${venda.chave}.` };
      }
      if (!vinculo.confirmado) return { ok: false, statusHttp: 409, erro: `Confirmação humana ausente para vincular a venda ${vinculo.vendaId}.` };
      if (op.data !== hist.data && !vinculo.dataDiferenteConfirmada) {
        return { ok: false, statusHttp: 409,
          erro: `As vendas ${vinculo.vendaId} e ${venda.chave} têm datas diferentes; confirme essa diferença.` };
      }
      if (op.nome !== hist.nome && !vinculo.clienteDiferenteConfirmado) {
        return { ok: false, statusHttp: 409,
          erro: `As vendas ${vinculo.vendaId} e ${venda.chave} têm nomes diferentes; confirme que é a mesma pessoa.` };
      }
      duplicatas.push(vinculo);
    }
    const preparada = { entrada, venda, fingerprint, papel, excluidas, efetivo, recebido, recebidoAtual, saldo, cobranca, bruto, comissao, liquido, duplicatas };
    if (existente) {
      if (!await decisaoExistenteConfere(db, existente, preparada)) {
        return { ok: false, statusHttp: 409, erro: `A operação ${venda.chave} já foi revisada com outra decisão.` };
      }
      preparada.existente = existente;
      preparada.ignorar = true;
    }
    preparadas.push(preparada);
  }

  const novas = preparadas.filter((p) => !p.ignorar);
  const stmts = [];
  for (const p of novas) {
    const e = p.entrada;
    stmts.push(db.prepare(
      `INSERT INTO historico_operacoes
        (lote_id, venda_chave, fingerprint, papel, cliente_id, cliente_nome_norm,
         revendedora_id, pecas, bruto_centavos, comissao_centavos, liquido_centavos,
         linhas_excluidas_json, cobranca_status, valor_efetivo_centavos,
         valor_recebido_fonte_centavos, valor_recebido_centavos, saldo_centavos, vencimento_em,
         vencimento_origem, canal, contexto, observacao, evidencia_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      p.venda.lote_id, p.venda.chave, p.fingerprint, p.papel,
      e.clienteId ?? p.venda.cliente_id, e.clienteNomeNorm ?? p.venda.cliente_nome_norm,
      e.revendedoraId ?? null, e.pecas ?? p.venda.pecas,
      p.bruto, p.comissao, p.liquido, JSON.stringify(p.excluidas), p.cobranca,
      p.efetivo, p.recebido, p.recebidoAtual, p.saldo, e.vencimentoEm ?? null,
      e.vencimentoEm ? 'manual' : null, e.canal ?? p.venda.canal,
      e.contexto ?? p.venda.contexto, e.observacao ?? p.venda.observacao_original,
      JSON.stringify(e.evidencia ?? {}),
    ));
    for (const vinculo of p.duplicatas) {
      stmts.push(db.prepare(
        `INSERT INTO historico_operacao_vendas
          (operacao_id, venda_id, evidencia_json)
         VALUES ((SELECT id FROM historico_operacoes
                   WHERE venda_chave=? AND status_registro='ativa'), ?, ?)`,
      ).bind(p.venda.chave, Number(vinculo.vendaId), JSON.stringify(vinculo.evidencia ?? {})));
    }
  }
  if (stmts.length) await db.batch(stmts);
  return { ok: true, criadas: novas.length, preservadas: preparadas.length - novas.length, vinculos: novas.reduce((s, p) => s + p.duplicatas.length, 0) };
}

export async function operacoesAtivasDoLote(db, loteId) {
  const { results } = await db.prepare(
    `SELECT id, venda_chave, fingerprint, papel, cobranca_status, versao
       FROM historico_operacoes
      WHERE lote_id=? AND status_registro='ativa' ORDER BY venda_chave`,
  ).bind(loteId).all();
  return results ?? [];
}
