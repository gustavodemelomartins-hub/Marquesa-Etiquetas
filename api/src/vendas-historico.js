/** Importação do histórico de vendas (planilha `Vendas Marquesa.xlsx`).
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  A REGRA ABSOLUTA
 *
 *  Este módulo NUNCA chama `movimentar()`, nunca escreve em `movimentos`,
 *  nunca toca `produtos.qtd`, nunca chama a Nuvemshop e nunca encosta em
 *  maleta. Não é uma restrição de estilo: o estoque de hoje já incorpora
 *  estas vendas. Criar movimento para cada linha histórica descontaria a
 *  mesma peça duas vezes, deixaria o saldo negativo e empurraria esse número
 *  para a loja — tirando do ar peça que existe.
 *
 *  A invariante `produtos.qtd == SUM(movimentos.qtd)` continua valendo aqui
 *  sem nem precisar ser verificada, porque nenhuma linha de `movimentos` é
 *  escrita. O teste prova isso contando movimentos antes e depois.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  A SEQUÊNCIA, que é a mesma de todo importador do projeto
 *
 *      analisar (seco)  →  relatório  →  decisão humana  →  aplicar
 *
 *  `analisar` não escreve NADA e devolve o impacto esperado, que para estoque
 *  é sempre exatamente zero.
 */

import {
  mapearColunas, normalizarLinha, normalizarTexto, normalizarNomeCliente,
} from './vendas-historico-normalizar.js';
import {
  reconstruirVendas, reconstruir, backfillNormalizacao, REGRA_DESCRITA,
} from './vendas-historicas.js';

/* --------------------------------------------------------------- utilidades */

/** sha-256 do conteúdo normalizado do arquivo. É o que torna a importação
 *  idempotente: o mesmo arquivo não entra duas vezes, mesmo renomeado. */
export async function hashDoConteudo(linhas) {
  const texto = JSON.stringify(linhas);
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const naoNulo = (v) => v !== null && v !== undefined;

/* ------------------------------------------------------------------ análise */

/** Lê as linhas, normaliza tudo e devolve o relatório COMPLETO — sem escrever
 *  uma única linha em lugar nenhum.
 *
 *  É por este relatório que se decide importar ou não, e é contra ele que a
 *  reconciliação pós-importação é conferida. */
export async function analisarHistorico(db, { linhas, arquivo = 'Vendas Marquesa.xlsx' }) {
  if (!Array.isArray(linhas) || linhas.length < 2) {
    return { ok: false, erro: 'A planilha precisa de cabeçalho e ao menos uma linha.' };
  }

  const cabecalho = linhas[0];
  const corpo = linhas.slice(1).filter((l) => Array.isArray(l) && l.some(naoNulo));
  const { indices, faltando } = mapearColunas(cabecalho);

  /* Sem SKU ou sem cliente a planilha não é esta planilha. As outras colunas
   * podem faltar — a linha entra com o campo em NULL e o problema anotado. */
  const essenciais = faltando.filter((c) => ['sku', 'cliente', 'qtd'].includes(c));
  if (essenciais.length) {
    return {
      ok: false,
      erro: `Não achei as colunas: ${essenciais.join(', ')}. Confira se a planilha é a de vendas.`,
      cabecalhoLido: cabecalho,
    };
  }

  const registros = corpo.map((l, i) =>
    normalizarLinha(l, indices, { origemLinhaFallback: String(i + 2) }));

  /* linhas repetidas DENTRO do próprio arquivo */
  const vistos = new Map();
  const duplicadasNoArquivo = [];
  for (const r of registros) {
    const chave = String(r.origem_linha);
    if (vistos.has(chave)) duplicadasNoArquivo.push(chave);
    else vistos.set(chave, r);
  }

  const hash = await hashDoConteudo(linhas);
  const loteAnterior = await db.prepare(
    `SELECT id, arquivo_nome, criado_em, linhas_importadas
       FROM vendas_historico_lotes WHERE arquivo_hash = ? AND status = 'importado'`,
  ).bind(hash).first();

  const [catalogo, clientes] = await Promise.all([
    carregarCatalogo(db),
    carregarClientes(db),
  ]);

  const resumo = resumir(registros, catalogo, clientes);

  return {
    ok: true,
    arquivo,
    hash,
    jaImportado: loteAnterior
      ? { loteId: loteAnterior.id, em: loteAnterior.criado_em, linhas: loteAnterior.linhas_importadas }
      : null,
    colunasFaltando: faltando,
    duplicadasNoArquivo,
    ...resumo,
    /* O número que importa mais neste relatório inteiro. */
    impactoEstoque: {
      movimentos: 0,
      produtosAfetados: 0,
      nuvemshop: 0,
      explicacao: 'Importação histórica não movimenta estoque: o saldo de hoje '
        + 'já incorpora estas vendas.',
    },
  };
}

async function carregarCatalogo(db) {
  const { results } = await db.prepare(
    'SELECT sku, desc, cat, foto_original_key, foto_tratada_key, foto_url FROM produtos',
  ).all();
  const porSku = new Map();
  const porBase = new Map();
  for (const p of results ?? []) {
    const s = String(p.sku).toUpperCase();
    porSku.set(s, p);
    const base = s.replace(/-\d+$/, '');
    if (!porBase.has(base)) porBase.set(base, p);
  }
  return { porSku, porBase };
}

async function carregarClientes(db) {
  const { results } = await db.prepare('SELECT id, nome, nome_norm, tel FROM clientes').all();
  const porNorm = new Map();
  for (const c of results ?? []) {
    const n = c.nome_norm ?? normalizarNomeCliente(c.nome);
    if (n && !porNorm.has(n)) porNorm.set(n, c);
  }
  return porNorm;
}

/** As contagens que fecham com a fonte. Tudo derivado do ITEM — que é o nível
 *  em que o histórico realmente existe. */
function resumir(registros, catalogo, clientes) {
  const soma = (f) => registros.reduce((s, r) => s + (f(r) ?? 0), 0);

  const pagos = registros.filter((r) => r.pago === 1);
  const datas = registros.map((r) => r.data).filter(Boolean).sort();

  const semData = registros.filter((r) => r.problemas.includes('sem_data'));
  const semValor = registros.filter((r) => r.problemas.includes('sem_valor'));
  const origemRevisar = registros.filter((r) => r.problemas.includes('origem_a_revisar'));

  /* SKU do histórico × catálogo de hoje: casa pelo código cheio, e depois
   * pelo código-base (o sufixo `-2` era variação no controle antigo). */
  const casados = [];
  const naoEncontrados = [];
  for (const r of registros) {
    const cheio = r.sku ? catalogo.porSku.get(r.sku) : null;
    const base = !cheio && r.sku_base ? catalogo.porBase.get(r.sku_base) : null;
    if (cheio || base) casados.push({ ...r, _catalogo: cheio ?? base, _porBase: !cheio });
    else naoEncontrados.push(r);
  }

  /* clientes: nomes do arquivo × cadastro atual */
  const nomes = new Map();
  for (const r of registros) {
    const n = r.cliente_nome_norm;
    if (!n) continue;
    if (!nomes.has(n)) nomes.set(n, { norm: n, original: r.cliente_nome_original, linhas: 0 });
    nomes.get(n).linhas++;
  }
  const clientesExistentes = [];
  const clientesNovos = [];
  for (const info of nomes.values()) {
    const achado = clientes.get(info.norm);
    if (achado) clientesExistentes.push({ ...info, clienteId: achado.id, clienteNome: achado.nome });
    else clientesNovos.push(info);
  }

  const contar = (campo) => {
    const m = new Map();
    for (const r of registros) {
      const k = r[campo] ?? '(não classificado)';
      if (!m.has(k)) m.set(k, { valor: k, linhas: 0, pecas: 0, faturamento: 0 });
      const e = m.get(k);
      e.linhas++; e.pecas += r.qtd ?? 0; e.faturamento += r.valor_total ?? 0;
    }
    return [...m.values()].sort((a, b) => b.faturamento - a.faturamento);
  };

  return {
    linhas: registros.length,
    validas: registros.filter((r) => r.problemas.length === 0).length,
    comProblema: registros.filter((r) => r.problemas.length > 0).length,

    pecas: soma((r) => r.qtd),
    faturamentoPago: +soma((r) => (r.pago === 1 ? r.valor_total : 0)).toFixed(2),
    faturamentoTodas: +soma((r) => r.valor_total).toFixed(2),
    linhasPagas: pagos.length,

    periodo: { de: datas[0] ?? null, ate: datas[datas.length - 1] ?? null },
    semData: semData.length,
    semValor: semValor.length,
    origemARevisar: origemRevisar.length,

    skusDistintos: new Set(registros.map((r) => r.sku).filter(Boolean)).size,
    skusCasados: new Set(casados.map((r) => r.sku)).size,
    skusNaoEncontrados: [...new Set(naoEncontrados.map((r) => r.sku).filter(Boolean))],
    linhasSkuNaoEncontrado: naoEncontrados.length,

    clientesNoArquivo: nomes.size,
    clientesJaCadastrados: clientesExistentes.length,
    clientesACriar: clientesNovos.length,
    /* amostra, para a tela mostrar sem despejar 348 nomes */
    amostraClientesNovos: clientesNovos.slice(0, 20),

    porCanal: contar('canal'),
    porContexto: contar('contexto'),
    porTipo: contar('tipo'),
    porPagamento: contar('pagamento_forma'),

    /* Quantas VENDAS estas linhas vão virar.
     *
     *  Este campo dizia `disponivel: false` e explicava que contar pedidos
     *  seria invenção — porque a planilha numera linhas, não pedidos, e a
     *  leitura da época era que dezenas de linhas na mesma data seriam um
     *  acerto de maleta. O dono do negócio corrigiu as duas coisas em
     *  2026-08-28: a regra existe (mesmo cliente + mesma data = uma venda) e
     *  o que não é venda vem ESCRITO na planilha, não deduzido do tamanho.
     *
     *  A prévia usa a MESMA função que a reconstrução usa depois de
     *  importar, então o número que a tela mostra antes é o número que vai
     *  existir depois. `origem_linha` faz o papel de id: nesta etapa nada
     *  foi gravado e não há id de banco ainda. */
    pedidos: (() => {
      const previa = reconstruirVendas(
        registros.map((r) => ({ ...r, id: r.origem_linha })),
      );
      const vendas = previa.filter((v) => v.classe === 'venda');
      const elegiveis = previa.filter((v) => v.elegivelTicket);
      const fat = elegiveis.reduce((s, v) => s + (v.valorTotal ?? 0), 0);
      return {
        disponivel: true,
        vendas: vendas.length,
        ajustes: previa.length - vendas.length,
        semData: vendas.filter((v) => !v.data).length,
        ticketMedio: elegiveis.length ? +(fat / elegiveis.length).toFixed(2) : null,
        vendasElegiveis: elegiveis.length,
        maiorVenda: Math.max(0, ...vendas.map((v) => v.itens)),
        regra: REGRA_DESCRITA,
      };
    })(),

    exemplosProblema: registros.filter((r) => r.problemas.length)
      .slice(0, 25)
      .map((r) => ({
        linha: r.origem_linha,
        cliente: r.cliente_nome_original,
        sku: r.sku_original,
        data: r.data_original,
        problemas: r.problemas,
      })),

    _registros: registros,
  };
}

/* ---------------------------------------------------------------- aplicação */

/** Grava o histórico. Só escreve nas tabelas `vendas_historico_*`,
 *  `clientes` e `clientes_vinculo_revisao` — nunca em `movimentos`.
 *
 *  Idempotente por duas travas independentes:
 *   1. índice único em `arquivo_hash` (lote importado) — o mesmo arquivo não
 *      entra duas vezes;
 *   2. índice único em (lote_id, origem_linha) — a mesma linha do mesmo lote
 *      não entra duas vezes, nem sob retry no meio da escrita. */
export async function importarHistorico(db, { linhas, arquivo = 'Vendas Marquesa.xlsx' }) {
  const analise = await analisarHistorico(db, { linhas, arquivo });
  if (!analise.ok) return analise;

  if (analise.jaImportado) {
    return {
      ok: false,
      jaImportado: analise.jaImportado,
      erro: `Este arquivo já foi importado em ${analise.jaImportado.em} `
        + `(lote ${analise.jaImportado.loteId}, ${analise.jaImportado.linhas} linhas). `
        + 'Rodar de novo não duplicaria nada — a importação foi recusada antes disso.',
    };
  }

  const registros = analise._registros;

  const lote = await db.prepare(
    `INSERT INTO vendas_historico_lotes (arquivo_nome, arquivo_hash, linhas_total)
     VALUES (?, ?, ?) RETURNING id`,
  ).bind(arquivo, analise.hash, registros.length).first();

  /* ── clientes: cria os nomes novos, propõe revisão para o que é ambíguo */
  const clientes = await carregarClientes(db);
  const porNome = new Map();
  const revisoes = [];

  for (const r of registros) {
    const n = r.cliente_nome_norm;
    if (!n || porNome.has(n)) continue;
    const achado = clientes.get(n);
    if (achado) { porNome.set(n, achado.id); continue; }

    /* Nome curto (só primeiro nome) casando com mais de um cadastro é
     * exatamente o caso que NÃO pode ser unido sozinho. */
    const parecidos = [...clientes.entries()].filter(([k]) => k.startsWith(n + ' ') || n.startsWith(k + ' '));
    if (parecidos.length === 1 && n.includes(' ')) {
      /* nome completo do arquivo contendo o cadastro curto: ainda é palpite */
      revisoes.push({ norm: n, original: r.cliente_nome_original,
        candidatoId: parecidos[0][1].id, candidatoNome: parecidos[0][1].nome,
        motivo: 'nome parecido com cadastro existente' });
    } else if (parecidos.length > 1) {
      revisoes.push({ norm: n, original: r.cliente_nome_original,
        candidatoId: null, candidatoNome: null,
        motivo: `${parecidos.length} cadastros parecidos — ambíguo` });
    }

    const novo = await db.prepare(
      `INSERT INTO clientes (nome, nome_norm, origem, criada_em)
       VALUES (?, ?, 'historico', datetime('now')) RETURNING id`,
    ).bind(r.cliente_nome_original ?? '(sem nome)', n).first();
    porNome.set(n, novo.id);
    clientes.set(n, { id: novo.id, nome: r.cliente_nome_original, nome_norm: n });
  }

  /* ── revendedoras citadas na origem ("Revendedora (Beatriz)") */
  const { results: revs } = await db.prepare('SELECT id, nome FROM revendedoras').all();
  const revPorNorm = new Map((revs ?? []).map((v) => [normalizarTexto(v.nome), v.id]));

  /* ── os itens */
  const stmts = [];
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO vendas_historico_itens (
       lote_id, origem_linha,
       data_original, cliente_nome_original, sku_original, nome_produto_historico,
       tipo_original, preco_unit_original, desconto_original, valor_total_original,
       pagamento_original, status_pagamento_original, observacao_original,
       data, cliente_id, cliente_nome_norm, sku, sku_base, tipo, qtd,
       preco_unit, valor_total, desconto_valor, desconto_pct, desconto_rotulo,
       pagamento_forma, pagamento_parcelas, pago, canal, contexto,
       revendedora_nome, revendedora_id, problemas_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  for (const r of registros) {
    stmts.push(inserir.bind(
      lote.id, String(r.origem_linha),
      r.data_original, r.cliente_nome_original, r.sku_original, r.nome_produto_historico,
      r.tipo_original, r.preco_unit_original, r.desconto_original, r.valor_total_original,
      r.pagamento_original, r.status_pagamento_original, r.observacao_original,
      r.data, r.cliente_nome_norm ? porNome.get(r.cliente_nome_norm) ?? null : null,
      r.cliente_nome_norm, r.sku, r.sku_base, r.tipo, r.qtd,
      r.preco_unit, r.valor_total, r.desconto_valor, r.desconto_pct, r.desconto_rotulo,
      r.pagamento_forma, r.pagamento_parcelas, r.pago, r.canal, r.contexto,
      r.revendedora_nome,
      r.revendedora_nome ? revPorNorm.get(normalizarTexto(r.revendedora_nome)) ?? null : null,
      r.problemas.length ? JSON.stringify(r.problemas) : null,
    ));
  }

  /* D1 tem teto por batch; fatiar mantém a escrita previsível */
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));

  for (const v of revisoes) {
    await db.prepare(
      `INSERT OR IGNORE INTO clientes_vinculo_revisao
         (lote_id, nome_original, nome_norm, candidato_id, candidato_nome, motivo, linhas)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(lote.id, v.original ?? '', v.norm, v.candidatoId, v.candidatoNome, v.motivo,
      registros.filter((r) => r.cliente_nome_norm === v.norm).length).run();
  }

  const conferencia = await reconciliar(db, lote.id, analise);

  await db.prepare(
    `UPDATE vendas_historico_lotes
        SET linhas_importadas = ?, linhas_rejeitadas = ?, relatorio_json = ?
      WHERE id = ?`,
  ).bind(conferencia.importadas, registros.length - conferencia.importadas,
    JSON.stringify(conferencia), lote.id).run();

  /* A camada derivada nasce junto com o lote. Sem isto, o painel mostraria
   * zero venda logo depois de uma importação bem-sucedida — os itens estão
   * no banco, mas ninguém os agrupou ainda. Continua sem tocar estoque:
   * agrupar linhas que já existiam não cria nem consome peça. */
  const reconstrucao = await reconstruir(db, { loteId: lote.id });
  await backfillNormalizacao(db);

  return {
    ok: true,
    loteId: lote.id,
    analise: semRegistros(analise),
    conferencia,
    reconstrucao: reconstrucao.lotes[0] ?? null,
  };
}

function semRegistros(a) { const { _registros, ...resto } = a; return resto; }

/** Compara o que ficou no banco com o que a análise leu do arquivo.
 *
 *  Cada diferença precisa de explicação individual — "quase bateu" não é
 *  critério de aceitação para o histórico financeiro da operação. */
export async function reconciliar(db, loteId, analise) {
  const b = await db.prepare(
    `SELECT COUNT(*)                                   AS importadas,
            COALESCE(SUM(qtd), 0)                      AS pecas,
            COALESCE(SUM(valor_total), 0)              AS faturamento_todas,
            COALESCE(SUM(CASE WHEN pago = 1 THEN valor_total ELSE 0 END), 0) AS faturamento_pago,
            COUNT(DISTINCT cliente_nome_norm)          AS clientes,
            COUNT(DISTINCT sku)                        AS skus,
            SUM(CASE WHEN data IS NULL THEN 1 ELSE 0 END)        AS sem_data,
            SUM(CASE WHEN valor_total IS NULL THEN 1 ELSE 0 END) AS sem_valor,
            SUM(CASE WHEN canal IS NULL THEN 1 ELSE 0 END)       AS sem_canal,
            MIN(data) AS de, MAX(data) AS ate
       FROM vendas_historico_itens WHERE lote_id = ?`,
  ).bind(loteId).first();

  const cmp = (nome, fonte, banco) => ({
    campo: nome, fonte, banco, bate: Math.abs((fonte ?? 0) - (banco ?? 0)) < 0.005,
  });

  const linhas = [
    cmp('linhas', analise.linhas, b.importadas),
    cmp('peças', analise.pecas, b.pecas),
    cmp('faturamento (pago)', analise.faturamentoPago, +Number(b.faturamento_pago).toFixed(2)),
    cmp('faturamento (todas)', analise.faturamentoTodas, +Number(b.faturamento_todas).toFixed(2)),
    cmp('clientes distintos', analise.clientesNoArquivo, b.clientes),
    cmp('SKUs distintos', analise.skusDistintos, b.skus),
    cmp('linhas sem data', analise.semData, b.sem_data),
    cmp('linhas sem valor', analise.semValor, b.sem_valor),
  ];

  /* A prova de que a regra absoluta foi respeitada. */
  const movimentos = await db.prepare(
    `SELECT COUNT(*) AS n FROM movimentos WHERE origem = 'historico' OR tipo = 'historico'`,
  ).first();

  return {
    importadas: b.importadas,
    periodo: { de: b.de, ate: b.ate },
    semCanal: b.sem_canal,
    linhas,
    fecha: linhas.every((l) => l.bate),
    movimentosCriados: movimentos.n,
    estoqueIntocado: movimentos.n === 0,
  };
}

/** Desfaz um lote inteiro. Só apaga o que ELE escreveu, e como nada em
 *  `movimentos` foi criado, não há efeito de estoque para desfazer. */
export async function reverterLote(db, loteId) {
  const lote = await db.prepare(
    'SELECT id, status FROM vendas_historico_lotes WHERE id = ?',
  ).bind(loteId).first();
  if (!lote) return { ok: false, erro: 'Lote não encontrado.' };
  if (lote.status === 'revertido') return { ok: false, erro: 'Lote já revertido.' };

  const antes = await db.prepare(
    'SELECT COUNT(*) AS n FROM vendas_historico_itens WHERE lote_id = ?',
  ).bind(loteId).first();

  await db.batch([
    /* O ITEM aponta para a venda derivada (`venda_historica_id`), então a
       venda não pode sair antes dele: o D1 força chave estrangeira em toda
       query e não aceita `PRAGMA foreign_keys`. Apagar `vendas_historicas`
       primeiro devolvia
       `FOREIGN KEY constraint failed` e a reversão inteira falhava com 500.
       Item primeiro, venda derivada depois. */
    db.prepare('DELETE FROM vendas_historico_itens WHERE lote_id = ?').bind(loteId),
    db.prepare('DELETE FROM vendas_historicas WHERE lote_id = ?').bind(loteId),
    db.prepare('DELETE FROM clientes_vinculo_revisao WHERE lote_id = ?').bind(loteId),
    db.prepare(
      `UPDATE vendas_historico_lotes SET status = 'revertido', revertido_em = datetime('now')
        WHERE id = ?`,
    ).bind(loteId),
  ]);

  /* Cliente criado pela importação e que ficou sem nenhum histórico deixa de
   * ter razão de existir. Três exceções, e as três valem mais que a
   * arrumação:
   *
   *   1. cliente com venda OPERACIONAL — ela comprou de verdade, pelo
   *      sistema, e o cadastro é o dono daquela venda;
   *   2. cliente com histórico de OUTRO lote ainda de pé;
   *   3. cliente com QUALQUER dado digitado à mão — telefone, CPF, cidade,
   *      email, instagram, nascimento ou observação. Esse cadastro deixou de
   *      ser um subproduto da planilha no instante em que alguém sentou e
   *      digitou o telefone dela. Trocar a planilha não pode custar o
   *      trabalho de cadastro: a linha da planilha volta na importação
   *      seguinte, o telefone não volta de lugar nenhum. */
  const r = await db.prepare(
    `DELETE FROM clientes
      WHERE origem = 'historico'
        AND id NOT IN (SELECT cliente_id FROM vendas_historico_itens WHERE cliente_id IS NOT NULL)
        AND id NOT IN (SELECT cliente_id FROM vendas WHERE cliente_id IS NOT NULL)
        AND COALESCE(NULLIF(TRIM(tel), ''), NULLIF(TRIM(cpf), ''),
                     NULLIF(TRIM(cidade), ''), NULLIF(TRIM(email), ''),
                     NULLIF(TRIM(instagram), ''), NULLIF(TRIM(nascimento), ''),
                     NULLIF(TRIM(obs), '')) IS NULL`,
  ).run();

  return {
    ok: true,
    loteId,
    itensRemovidos: antes.n,
    clientesRemovidos: r.meta?.changes ?? null,
  };
}

/** O retrato do histórico que está de pé agora. É o "antes" da troca, e é
 *  o mesmo conjunto de números que o "depois" vai mostrar — comparar duas
 *  leituras diferentes seria comparar nada. */
export async function retratoDoHistorico(db) {
  const [lotes, vendas] = await Promise.all([
    db.prepare(
      `SELECT id, arquivo_nome, linhas_importadas, criado_em
         FROM vendas_historico_lotes WHERE status = 'importado' ORDER BY id`,
    ).all(),
    db.prepare(
      `SELECT COUNT(*) AS vendas,
              COALESCE(SUM(pecas), 0) AS pecas,
              ROUND(COALESCE(SUM(valor_pago), 0), 2) AS faturamento,
              COUNT(DISTINCT cliente_nome_norm) AS clientes,
              MIN(data) AS de, MAX(data) AS ate
         FROM vendas_historicas vh
         JOIN vendas_historico_lotes l ON l.id = vh.lote_id AND l.status = 'importado'
        WHERE vh.classe = 'venda'`,
    ).first(),
  ]);
  const linhas = (lotes.results ?? []).reduce((t, l) => t + Number(l.linhas_importadas ?? 0), 0);
  return {
    lotes: (lotes.results ?? []).map((l) => ({
      id: l.id, arquivo: l.arquivo_nome, linhas: l.linhas_importadas, em: l.criado_em,
    })),
    linhas,
    vendas: Number(vendas?.vendas ?? 0),
    pecas: Number(vendas?.pecas ?? 0),
    faturamento: Number(vendas?.faturamento ?? 0),
    clientes: Number(vendas?.clientes ?? 0),
    periodo: { de: vendas?.de ?? null, ate: vendas?.ate ?? null },
  };
}

/** TROCAR a planilha do histórico por uma corrigida.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  POR QUE ISTO EXISTE E NÃO BASTA "IMPORTAR DE NOVO"
 *
 *  A trava de idempotência é o HASH DO ARQUIVO: o mesmo arquivo não entra
 *  duas vezes. Um arquivo DIFERENTE entra sem reclamar — e é exatamente o
 *  caso de quem corrigiu o sobrenome de uma cliente e reexportou a
 *  planilha. O painel passaria a somar as 695 vendas antigas com as 691
 *  novas, e o faturamento dobraria sem nenhum erro na tela.
 *
 *  Então trocar é uma operação só: revira o que está de pé e põe o novo no
 *  lugar, com o antes e o depois na mesma resposta.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  A ORDEM É DELIBERADA
 *
 *  A análise vem ANTES da reversão. Arquivo ilegível, cabeçalho trocado ou
 *  planilha vazia param aqui, com o histórico antigo intacto — a troca nem
 *  começa. Só depois de o arquivo novo provar que é legível o antigo sai.
 *
 *  Se ainda assim a importação falhar depois da reversão, a resposta diz
 *  quais lotes foram revertidos e por qual arquivo: reverter LIBERA o hash
 *  (o índice único só vale para lote `importado`), então reimportar a
 *  planilha antiga é um caminho de volta que existe de verdade.
 *
 *  ─────────────────────────────────────────────────────────────────────────
 *  ESTOQUE: nada, dos dois lados
 *
 *  Reverter não desfaz movimento porque a importação nunca criou nenhum, e
 *  importar não cria. A troca inteira é invisível para a razão contábil. */
export async function substituirHistorico(db, { linhas, arquivo = 'Vendas Marquesa.xlsx' }) {
  const analise = await analisarHistorico(db, { linhas, arquivo });
  if (!analise.ok) return { ok: false, etapa: 'analise', ...semRegistros(analise) };

  const antes = await retratoDoHistorico(db);

  /* O mesmo arquivo que já está de pé não é uma troca — é um clique
     repetido. Recusar aqui evita derrubar o histórico para pôr de volta
     exatamente o que estava lá. */
  if (analise.jaImportado) {
    return {
      ok: false,
      etapa: 'analise',
      jaImportado: analise.jaImportado,
      antes,
      erro: `Esta planilha JÁ é a que está no ar (lote ${analise.jaImportado.loteId}, `
        + `importada em ${analise.jaImportado.em}). Não há o que trocar.`,
    };
  }

  const revertidos = [];
  for (const l of antes.lotes) {
    const r = await reverterLote(db, l.id);
    if (!r.ok) {
      return {
        ok: false,
        etapa: 'reversao',
        antes,
        revertidos,
        erro: `Não consegui reverter o lote ${l.id} (${l.arquivo}): ${r.erro} `
          + 'Nada foi importado; o histórico continua como estava.',
      };
    }
    revertidos.push({ ...l, itensRemovidos: r.itensRemovidos, clientesRemovidos: r.clientesRemovidos });
  }

  const imp = await importarHistorico(db, { linhas, arquivo });
  if (!imp.ok) {
    return {
      ok: false,
      etapa: 'importacao',
      antes,
      revertidos,
      erro: `${imp.erro ?? 'A importação falhou.'} `
        + (revertidos.length
          ? `O histórico anterior JÁ havia sido revertido (${revertidos.map((r) => `lote ${r.id}: ${r.arquivo}`).join('; ')}). `
            + 'Reverter libera o arquivo para nova importação — subir a planilha antiga de volta funciona.'
          : ''),
    };
  }

  const depois = await retratoDoHistorico(db);

  return {
    ok: true,
    antes,
    depois,
    revertidos,
    loteId: imp.loteId,
    analise: imp.analise,
    conferencia: imp.conferencia,
    reconstrucao: imp.reconstrucao,
    /* a diferença explícita, para a tela não ter de subtrair nada e para o
       operador ver o que a troca fez, e não só o resultado final */
    delta: {
      linhas: depois.linhas - antes.linhas,
      vendas: depois.vendas - antes.vendas,
      pecas: depois.pecas - antes.pecas,
      faturamento: +(depois.faturamento - antes.faturamento).toFixed(2),
      clientes: depois.clientes - antes.clientes,
    },
  };
}

/** Os lotes já importados, para a tela saber o que existe. */
export async function listarLotes(db) {
  const { results } = await db.prepare(
    `SELECT id, arquivo_nome, linhas_total, linhas_importadas, linhas_rejeitadas,
            status, criado_em, revertido_em
       FROM vendas_historico_lotes ORDER BY id DESC`,
  ).all();
  return { lotes: results ?? [] };
}
