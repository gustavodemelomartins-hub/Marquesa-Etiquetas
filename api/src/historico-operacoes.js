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

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });

/** Dinheiro aqui é SEMPRE centavo inteiro. `1.5`, `NaN`, `Infinity`, `"12"`
 *  com espaço e qualquer coisa acima de 2^53 param aqui — depois do INSERT
 *  o CHECK do banco só sabe dizer "constraint failed", sem dizer de quê. */
function centavosValidos(valor) {
  if (valor == null) return { ok: true, valor: null };
  if (typeof valor !== 'number' && typeof valor !== 'string') return { ok: false };
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n < 0) return { ok: false };
  return { ok: true, valor: n };
}

function inteiroValido(valor) {
  if (valor == null) return { ok: true, valor: null };
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n < 0) return { ok: false };
  return { ok: true, valor: n };
}

/** `2026-02-31` casa com a regex e não existe no calendário. Um prazo que
 *  não existe nunca vence, e a conta ficaria invisível para sempre na lista
 *  de vencidas. */
function dataIsoValida(valor) {
  const s = String(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** `evidencia` é texto gravado hoje e lido por outra pessoa meses depois.
 *  Aceita só objeto simples que sobrevive a um round-trip JSON: `undefined`,
 *  função, `BigInt` e ciclo viram silêncio ou exceção na hora do INSERT. */
function jsonDeEvidencia(valor) {
  if (valor == null) return { ok: true, texto: '{}' };
  if (typeof valor !== 'object' || Array.isArray(valor)) return { ok: false };
  let texto;
  try { texto = JSON.stringify(valor); } catch { return { ok: false }; }
  if (typeof texto !== 'string') return { ok: false };
  try { JSON.parse(texto); } catch { return { ok: false }; }
  if (texto.length > 8000) return { ok: false };
  return { ok: true, texto };
}

/** Assinatura apenas do conteúdo comercial normalizado. IDs derivados e
 * metadados do XLSX não entram: reconstruir o mesmo conteúdo deve preservar
 * a decisão; mudar item, quantidade ou valor deve bloqueá-la.
 *
 * A regra mora AQUI, numa função só, porque ela é usada de dois lugares: a
 * leitura do banco (abaixo) e a reconstrução, que precisa saber o que a nova
 * regra de agrupamento faria ANTES de apagar a antiga. Duas implementações
 * da mesma assinatura seriam duas respostas diferentes para "mudou?" — e a
 * pergunta que elas respondem é se uma decisão humana ainda vale.
 *
 * `venda` e `itens` vêm na forma das colunas do banco, dos dois lados. */
export function fingerprintDoConteudo(venda, itens) {
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
    linhas: (itens ?? []).map((item) => ({
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
  return fingerprintDoConteudo(venda, results ?? []);
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
      /* O vínculo de duplicata é fato sobre a VENDA, não sobre a versão da
       * cobrança. Sem esta linha, receber o dinheiro criaria uma versão nova
       * e deixaria o vínculo pendurado no registro substituído: a retomada
       * do backfill leria "nenhuma duplicata gravada" e recusaria a operação
       * como se alguém a tivesse revisado com outra decisão. A chave é
       * estável, então o vínculo acompanha quem está ativo agora. */
      db.prepare(
        `UPDATE historico_operacao_vendas
            SET operacao_id = (SELECT id FROM historico_operacoes
                                WHERE venda_chave=? AND status_registro='ativa')
          WHERE operacao_id=? AND status_registro='ativa'`,
      ).bind(atual.venda_chave, atual.id),
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
  if (vencimentoEm != null && vencimentoEm !== '' && !dataIsoValida(vencimentoEm)) {
    return ERRO(400, 'Prazo inválido. Use uma data real no formato AAAA-MM-DD.');
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
    [existente.pecas, p.pecas],
    [existente.bruto_centavos, p.bruto],
    [existente.comissao_centavos, p.comissao],
    [existente.liquido_centavos, p.liquido],
    [existente.linhas_excluidas_json, JSON.stringify(p.excluidas)],
    [existente.cobranca_status, p.cobranca],
    [existente.valor_efetivo_centavos, p.efetivo],
    [existente.valor_recebido_fonte_centavos, p.recebido],
    [existente.valor_recebido_centavos, p.recebidoAtual],
    [existente.saldo_centavos, p.saldo],
    [existente.vencimento_em, p.vencimentoEm],
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

/** Entrada administrativa usada no backfill revisado. Ela analisa TODAS as
 * operações antes do primeiro INSERT e é idempotente por chave+fingerprint.
 *
 * Três travas, porque este é o caminho que escreve decisão humana em massa:
 *
 *   `seco: true`        faz a análise inteira e não escreve nada. Devolve o
 *                       plano e o `planoHash`.
 *   `planoEsperado`     é aquele hash, mandado de volta na hora de aplicar.
 *                       Se qualquer coisa mudou entre olhar e aplicar — o
 *                       histórico foi trocado, alguém quitou uma conta — o
 *                       hash muda e a escrita é recusada em vez de pousar
 *                       sobre um banco que já não é o que foi revisado.
 *   `fingerprintEsperado` por operação, para quem sabe de antemão qual
 *                       conteúdo está decidindo.
 */
export async function aplicarOperacoesHistoricas(
  db, { operacoes = [], seco = false, planoEsperado = null } = {},
) {
  if (!Array.isArray(operacoes) || !operacoes.length) {
    return ERRO(400, 'Informe ao menos uma operação.');
  }

  /* Duas linhas para a mesma venda no mesmo pacote não têm resultado
   * definido: o INSERT do vínculo procura a decisão ativa PELA CHAVE, e com
   * a chave repetida ele encontraria a linha errada — ou a certa, dependendo
   * da ordem em que o D1 resolvesse o batch. O mesmo vale para vincular a
   * mesma venda operacional a duas operações: o índice único só reclamaria
   * no fim, quando parte do pacote já estivesse gravada. Os dois casos são
   * recusados aqui, antes de olhar o banco, e sempre pelo mesmo motivo. */
  const chavesVistas = new Set();
  const donoDoVinculo = new Map();
  for (const entrada of operacoes) {
    if (!entrada || typeof entrada !== 'object') return ERRO(400, 'Operação vazia no pacote.');
    const chave = String(entrada.vendaChave ?? '').trim();
    if (!chave) return ERRO(400, 'Operação sem `vendaChave`.');
    if (chavesVistas.has(chave)) {
      return ERRO(400, `A venda ${chave} aparece duas vezes no mesmo pacote. `
        + 'Junte as duas decisões numa só antes de reenviar.');
    }
    chavesVistas.add(chave);
    if (entrada.vendasDuplicadas != null && !Array.isArray(entrada.vendasDuplicadas)) {
      return ERRO(400, `\`vendasDuplicadas\` de ${chave} não é uma lista.`);
    }
    for (const vinculo of entrada.vendasDuplicadas ?? []) {
      const vendaId = Number(vinculo?.vendaId);
      if (!Number.isSafeInteger(vendaId) || vendaId <= 0) {
        return ERRO(400, `Vínculo com \`vendaId\` inválido em ${chave}.`);
      }
      const dono = donoDoVinculo.get(vendaId);
      if (dono) {
        return ERRO(400, `A venda ${vendaId} foi vinculada a ${dono} e a ${chave} `
          + 'no mesmo pacote. Uma venda operacional duplica uma linha do histórico, não duas.');
      }
      donoDoVinculo.set(vendaId, chave);
    }
  }

  const preparadas = [];
  for (const entrada of operacoes) {
    const venda = await vendaHistoricaAtiva(db, entrada.vendaChave);
    if (!venda) return ERRO(409, `Venda histórica não encontrada: ${entrada.vendaChave}.`);
    if (venda.classe !== 'venda') return ERRO(409, `${entrada.vendaChave} não é uma venda.`);
    const fingerprint = await fingerprintDaVendaHistorica(db, venda.lote_id, venda.chave);
    if (entrada.fingerprintEsperado != null && entrada.fingerprintEsperado !== fingerprint) {
      return ERRO(409, `O conteúdo de ${venda.chave} não é o que foi revisado.`,
        { fingerprintAtual: fingerprint, fingerprintEsperado: entrada.fingerprintEsperado });
    }
    const existente = await db.prepare(
      `SELECT * FROM historico_operacoes WHERE venda_chave=? AND status_registro='ativa'`,
    ).bind(venda.chave).first();
    if (existente && existente.fingerprint !== fingerprint) {
      return ERRO(409, `A decisão ativa de ${venda.chave} pertence a outro conteúdo.`);
    }

    const papel = entrada.papel ?? 'cliente';
    if (!['cliente', 'acerto', 'revisao'].includes(papel)) return ERRO(400, `Papel inválido em ${venda.chave}.`);

    if (entrada.linhasExcluidas != null && !Array.isArray(entrada.linhasExcluidas)) {
      return ERRO(400, `\`linhasExcluidas\` de ${venda.chave} não é uma lista.`);
    }
    const excluidas = (entrada.linhasExcluidas ?? []).map(String);
    const linhas = new Set(jsonSeguro(venda.origem_linhas, []).map(String));
    if (excluidas.some((x) => !linhas.has(x))) return ERRO(409, `Linha excluída não pertence a ${venda.chave}.`);

    /* Todo dinheiro é inteiro de centavo, conferido campo a campo. O nome do
     * campo aparece na recusa: "constraint failed" não diz qual número. */
    const dinheiro = {};
    for (const [campo, bruto] of [
      ['valorEfetivoCentavos', entrada.valorEfetivoCentavos],
      ['valorRecebidoFonteCentavos', entrada.valorRecebidoFonteCentavos],
      ['valorRecebidoCentavos', entrada.valorRecebidoCentavos],
      ['saldoCentavos', entrada.saldoCentavos],
      ['brutoCentavos', entrada.brutoCentavos],
      ['comissaoCentavos', entrada.comissaoCentavos],
      ['liquidoCentavos', entrada.liquidoCentavos],
    ]) {
      const v = centavosValidos(bruto);
      if (!v.ok) return ERRO(400, `${campo} de ${venda.chave} não é um inteiro de centavos.`);
      dinheiro[campo] = v.valor;
    }
    const pecasEntrada = inteiroValido(entrada.pecas);
    if (!pecasEntrada.ok) return ERRO(400, `pecas de ${venda.chave} não é um inteiro não negativo.`);

    if (entrada.vencimentoEm != null && entrada.vencimentoEm !== ''
        && !dataIsoValida(entrada.vencimentoEm)) {
      return ERRO(400, `Prazo inválido em ${venda.chave}. Use uma data real no formato AAAA-MM-DD.`);
    }
    const vencimentoEm = entrada.vencimentoEm || null;

    const evidenciaOperacao = jsonDeEvidencia(entrada.evidencia);
    if (!evidenciaOperacao.ok) return ERRO(400, `A evidência de ${venda.chave} não é um objeto JSON válido.`);

    const efetivo = dinheiro.valorEfetivoCentavos ?? centavos(venda.valor_total);
    const recebido = dinheiro.valorRecebidoFonteCentavos ?? centavos(venda.valor_pago) ?? 0;
    const recebidoAtual = dinheiro.valorRecebidoCentavos ?? recebido;

    /* Saldo é subtração, não opinião. Antes ele era `Math.max(0, …)`: uma
     * planilha que registrasse pago MAIOR que o total virava saldo zero em
     * silêncio, e ninguém ficava sabendo que os dois números brigavam. */
    let saldo = null;
    if (efetivo != null) {
      saldo = efetivo - recebidoAtual;
      if (saldo < 0) {
        return ERRO(409, `Em ${venda.chave} o recebido (${recebidoAtual}) supera o valor efetivo `
          + `(${efetivo}). Não invento saldo negativo nem arredondo para zero — confira a planilha.`);
      }
    }
    if (dinheiro.saldoCentavos != null && dinheiro.saldoCentavos !== saldo) {
      return ERRO(409, `O saldo informado para ${venda.chave} (${dinheiro.saldoCentavos}) não é `
        + `efetivo menos recebido (${saldo}).`);
    }

    const cobranca = entrada.cobrancaStatus ?? (papel === 'cliente' && saldo > 0 ? 'aberta' : 'nenhuma');
    if (!['nenhuma', 'aberta', 'paga', 'revisao'].includes(cobranca)) {
      return ERRO(400, `Situação de cobrança inválida em ${venda.chave}.`);
    }
    const bruto = dinheiro.brutoCentavos;
    const comissao = dinheiro.comissaoCentavos;
    const liquido = dinheiro.liquidoCentavos;
    if (papel === 'acerto' && (!entrada.revendedoraId || bruto == null || comissao == null || liquido == null || bruto !== comissao + liquido)) {
      return ERRO(409, `Acerto sem valores documentais fechados em ${venda.chave}.`);
    }
    if (cobranca === 'aberta' && !(saldo > 0)) return ERRO(409, `Cobrança aberta sem saldo em ${venda.chave}.`);
    if (cobranca === 'paga' && saldo !== 0) return ERRO(409, `Cobrança paga com saldo em aberto em ${venda.chave}.`);

    const duplicatas = [];
    for (const vinculo of entrada.vendasDuplicadas ?? []) {
      const evidenciaVinculo = jsonDeEvidencia(vinculo.evidencia);
      if (!evidenciaVinculo.ok) return ERRO(400, `A evidência do vínculo ${vinculo.vendaId} não é um objeto JSON válido.`);
      const op = await assinaturaOperacional(db, Number(vinculo.vendaId));
      const hist = await assinaturaHistorica(db, venda);
      if (!op || op.total !== hist.total || op.pecas !== hist.pecas
          || JSON.stringify(op.itens) !== JSON.stringify(hist.itens)) {
        return ERRO(409, `Venda ${vinculo.vendaId} não é duplicata exata de ${venda.chave}.`);
      }
      if (!vinculo.confirmado) return ERRO(409, `Confirmação humana ausente para vincular a venda ${vinculo.vendaId}.`);
      if (op.data !== hist.data && !vinculo.dataDiferenteConfirmada) {
        return ERRO(409, `As vendas ${vinculo.vendaId} e ${venda.chave} têm datas diferentes; confirme essa diferença.`);
      }
      if (op.nome !== hist.nome && !vinculo.clienteDiferenteConfirmado) {
        return ERRO(409, `As vendas ${vinculo.vendaId} e ${venda.chave} têm nomes diferentes; confirme que é a mesma pessoa.`);
      }
      /* Já vinculada a OUTRA chave em outro pacote: o índice único pegaria,
       * mas só depois de gravar parte deste. */
      const jaVinculada = await db.prepare(
        `SELECT ho.venda_chave FROM historico_operacao_vendas hov
           JOIN historico_operacoes ho ON ho.id=hov.operacao_id
          WHERE hov.venda_id=? AND hov.status_registro='ativa'`,
      ).bind(Number(vinculo.vendaId)).first();
      if (jaVinculada && jaVinculada.venda_chave !== venda.chave) {
        return ERRO(409, `A venda ${vinculo.vendaId} já está vinculada a ${jaVinculada.venda_chave}.`);
      }
      duplicatas.push({ ...vinculo, evidenciaTexto: evidenciaVinculo.texto });
    }

    const preparada = {
      entrada, venda, fingerprint, papel, excluidas, efetivo, recebido, recebidoAtual,
      saldo, cobranca, bruto, comissao, liquido, duplicatas, vencimentoEm,
      pecas: pecasEntrada.valor ?? venda.pecas,
      evidenciaTexto: evidenciaOperacao.texto,
    };
    if (existente) {
      if (!await decisaoExistenteConfere(db, existente, preparada)) {
        return ERRO(409, `A operação ${venda.chave} já foi revisada com outra decisão.`);
      }
      preparada.existente = existente;
      preparada.ignorar = true;
    }
    preparadas.push(preparada);
  }

  const novas = preparadas.filter((p) => !p.ignorar);

  /* O plano é o que a pessoa revisou. O hash dele é o que ela devolve para
   * provar que revisou ISTO, e não o banco de dez minutos atrás. */
  const plano = preparadas.map((p) => ({
    vendaChave: p.venda.chave,
    fingerprint: p.fingerprint,
    acao: p.ignorar ? 'preservar' : 'criar',
    papel: p.papel,
    pecas: Number(p.pecas ?? 0),
    cobranca: p.cobranca,
    efetivoCentavos: p.efetivo,
    recebidoCentavos: p.recebidoAtual,
    saldoCentavos: p.saldo,
    brutoCentavos: p.bruto,
    comissaoCentavos: p.comissao,
    liquidoCentavos: p.liquido,
    linhasExcluidas: p.excluidas,
    vencimentoEm: p.vencimentoEm,
    vinculos: p.duplicatas.map((d) => Number(d.vendaId)).sort((a, b) => a - b),
  }));
  const planoHash = await sha256(plano);
  const resumo = {
    planoHash,
    criadas: novas.length,
    preservadas: preparadas.length - novas.length,
    vinculos: novas.reduce((s, p) => s + p.duplicatas.length, 0),
  };
  if (planoEsperado != null && planoEsperado !== planoHash) {
    return ERRO(409, 'O plano mudou entre o preview e a aplicação. Rode o preview de novo e '
      + 'confira a diferença antes de aplicar.', { planoHash, plano });
  }
  if (seco) return { ok: true, seco: true, ...resumo, plano };

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
      e.revendedoraId ?? null, p.pecas,
      p.bruto, p.comissao, p.liquido, JSON.stringify(p.excluidas), p.cobranca,
      p.efetivo, p.recebido, p.recebidoAtual, p.saldo, p.vencimentoEm,
      p.vencimentoEm ? 'manual' : null, e.canal ?? p.venda.canal,
      e.contexto ?? p.venda.contexto, e.observacao ?? p.venda.observacao_original,
      p.evidenciaTexto,
    ));
    for (const vinculo of p.duplicatas) {
      stmts.push(db.prepare(
        `INSERT INTO historico_operacao_vendas
          (operacao_id, venda_id, evidencia_json)
         VALUES ((SELECT id FROM historico_operacoes
                   WHERE venda_chave=? AND status_registro='ativa'), ?, ?)`,
      ).bind(p.venda.chave, Number(vinculo.vendaId), vinculo.evidenciaTexto));
    }
  }
  if (stmts.length) await db.batch(stmts);
  return { ok: true, ...resumo };
}

export async function operacoesAtivasDoLote(db, loteId) {
  const { results } = await db.prepare(
    `SELECT id, venda_chave, fingerprint, papel, cobranca_status, versao
       FROM historico_operacoes
      WHERE lote_id=? AND status_registro='ativa' ORDER BY venda_chave`,
  ).bind(loteId).all();
  return results ?? [];
}
