/** §42 — A CENTRAL DE PENDÊNCIAS
 *
 *  O defeito relatado, no print de 04/09/2026: a venda da Andreia Aparecida
 *  aparece com o selo REVISAR VARIAÇÃO e a explicação certa —
 *
 *      647729: Há peças deste código em maleta aberta, e a maleta ainda não
 *      sabe qual variação saiu.
 *
 *  — e nenhum caminho para responder. O sistema identifica o problema com
 *  precisão e para ali. A Sthefany diz que já cadastrou todas as variações
 *  que possui: a primeira ação, então, é ESCOLHER entre as que existem, não
 *  criar variação nova.
 *
 *  ─── por que isto NÃO é uma tabela nova
 *
 *  Uma pendência é sempre derivável do estado: a variação não mapeada sai de
 *  `variacoesParaRevisao`, a venda travada de `vendas.nuvemshop_status`, o
 *  vínculo duvidoso de `clientes_vinculo_revisao`, a diferença de troca de
 *  `garantia_trocas`. Guardar uma cópia disso numa tabela criaria um segundo
 *  lugar para a mesma verdade divergir — e a divergência apareceria
 *  justamente quando alguém resolvesse o caso e a lista continuasse
 *  mostrando.
 *
 *  Esta rota é LEITURA agregada sobre as fontes que já existem. A única
 *  coisa que ela grava é "revisar depois", que não é fato de negócio: é a
 *  decisão de uma pessoa de olhar isso na semana que vem, e mora em
 *  `config`, ao lado das outras preferências compartilhadas.
 *
 *  ─── e por que RESOLVER não movimenta estoque
 *
 *  Dizer qual aro saiu é um ato de IDENTIDADE, não de quantidade. A peça já
 *  saiu quando a venda foi registrada ou quando a maleta foi aberta;
 *  movimentar de novo aqui seria a segunda baixa da mesma peça. O que muda é
 *  o `variacao`/`variante_id` do movimento que já existe — a soma `qtd` não
 *  é tocada, e por isso `produtos.qtd == SUM(movimentos.qtd)` continua
 *  valendo antes e depois, sem exceção.
 */
import { variacoesParaRevisao, normSku } from './variantes.js';
import { listarPublicacoes, ESTADO_PUBLICACAO } from './publicacao-catalogo.js';
import { parametros } from './plataforma/d1.js';

const CHAVE_ADIADAS = 'pendencias_adiadas';
const hojeISO = () => new Date().toISOString().slice(0, 10);
const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });

const GRUPOS = {
  variacao: 'Variações',
  venda: 'Vendas',
  maleta: 'Maletas',
  nuvemshop: 'Nuvemshop',
  cliente: 'Clientes',
  catalogo: 'Catálogo',
  garantia: 'Garantias',
};

/* ═══════════════════════════════════════════════ "revisar depois" */

async function lerAdiadas(db) {
  try {
    const r = await db.prepare('SELECT valor FROM config WHERE chave = ?').bind(CHAVE_ADIADAS).first();
    const v = r ? JSON.parse(r.valor) : {};
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

async function gravarAdiadas(db, mapa) {
  await db.prepare(
    `INSERT INTO config (chave, valor) VALUES (?, ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
  ).bind(CHAVE_ADIADAS, JSON.stringify(mapa)).run();
}

/** Adiar não resolve: a pendência sai da lista principal e volta na data
 *  combinada. Sem data, some para sempre — e isso seria engolir, não adiar
 *  (§9). Por isso a data é obrigatória. */
export async function adiarPendencia(db, { chave, ate = null, motivo = null } = {}) {
  if (!chave) return ERRO(400, 'Diga qual pendência está sendo adiada.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ate ?? ''))) {
    return ERRO(400, 'Diga até quando revisar depois. Adiar sem data é esquecer.');
  }
  if (String(ate) <= hojeISO()) return ERRO(400, `${ate} não é depois de hoje.`);
  const mapa = await lerAdiadas(db);
  mapa[chave] = { ate: String(ate), em: hojeISO(), motivo: motivo ? String(motivo).slice(0, 200) : null };
  await gravarAdiadas(db, mapa);
  return { ok: true, chave, ate, adiadas: Object.keys(mapa).length };
}

export async function retomarPendencia(db, { chave } = {}) {
  if (!chave) return ERRO(400, 'Diga qual pendência volta para a lista.');
  const mapa = await lerAdiadas(db);
  delete mapa[chave];
  await gravarAdiadas(db, mapa);
  return { ok: true, chave };
}

/* ═════════════════════════════════════════════════ a lista agregada */

/** Todas as pendências abertas, de todas as fontes, numa lista só.
 *
 *  Cada linha traz `chave` (identidade estável, usada para adiar e para
 *  resolver), `tipo`, o suficiente para decidir sem abrir outra tela, e —
 *  quando o caso é de variação — as variações JÁ CADASTRADAS para escolher.
 *  Oferecer "criar variação" primeiro seria responder outra pergunta. */
export async function listarPendencias(db, { tipo = null, incluirAdiadas = false } = {}) {
  const adiadas = await lerAdiadas(db);
  const hoje = hojeISO();
  const pendencias = [];

  const [revisao, vendasTravadas, itensSemVariacao, maletasAbertas,
    vinculos, trocas, operacoesRevisao, publicacao, produtosPendentes,
    fotosOrfas] = await Promise.all([
    variacoesParaRevisao(db).catch(() => ({ itens: [] })),

    /* Vendas que a sincronização decidiu não escrever. `revisao` é o selo
       que aparece na tela de Lançamentos; os outros são falha de rede ou
       espera, e pertencem à mesma lista porque a pergunta é a mesma: o que
       está parado esperando alguém? */
    db.prepare(
      `SELECT v.id, v.data, v.nuvemshop_status, v.nuvemshop_erro, v.total,
              COALESCE(c.nome, v.cliente_nome) AS cliente, r.nome AS revendedora
         FROM vendas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN revendedoras r ON r.id = v.revendedora_id
        WHERE v.cancelada = 0
          AND v.origem <> 'site'
          AND v.nuvemshop_status IN ('erro','revisao','estoque_divergente','cancelamento_pendente')
        ORDER BY v.data DESC, v.id DESC LIMIT 200`,
    ).all().catch(() => ({ results: [] })),

    /* Item vendido de um código que TEM mais de uma variação e saiu sem
       dizer qual. É a pendência no nível da VENDA — resolvível por §8.1. */
    db.prepare(
      `SELECT v.id AS venda_id, v.data, i.rowid AS linha, i.sku, i.desc, i.qtd,
              COALESCE(c.nome, v.cliente_nome) AS cliente, r.nome AS revendedora,
              (SELECT COUNT(*) FROM produto_variacoes pv WHERE pv.sku = i.sku) AS n_variacoes
         FROM vendas v
         JOIN venda_itens i ON i.venda_id = v.id
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN revendedoras r ON r.id = v.revendedora_id
        WHERE v.cancelada = 0
          AND i.variacao IS NULL AND i.variante_id IS NULL
          AND (SELECT COUNT(*) FROM produto_variacoes pv WHERE pv.sku = i.sku) > 1
        ORDER BY v.data DESC, v.id DESC LIMIT 200`,
    ).all().catch(() => ({ results: [] })),

    /* Peça em maleta aberta cujo código tem variação e a maleta não diz
       qual — resolvível por §8.2. A conta é por SKU dentro da maleta:
       quanto saiu menos quanto já foi identificado. */
    db.prepare(
      `SELECT mi.maleta_id, mi.sku, p.desc, r.nome AS revendedora, m.aberta_em,
              (mi.qtd - mi.devolvida) AS fora,
              COALESCE((SELECT SUM(mv.qtd) FROM maleta_item_variacoes mv
                         WHERE mv.maleta_id = mi.maleta_id AND mv.sku = mi.sku), 0) AS identificado,
              (SELECT COUNT(*) FROM produto_variacoes pv WHERE pv.sku = mi.sku) AS n_variacoes
         FROM maleta_itens mi
         JOIN maletas m ON m.id = mi.maleta_id
         JOIN revendedoras r ON r.id = m.rev_id
         LEFT JOIN produtos p ON p.sku = mi.sku
        WHERE m.status IN ('aberta','em_acerto')
          AND (mi.qtd - mi.devolvida) > 0
          AND (SELECT COUNT(*) FROM produto_variacoes pv WHERE pv.sku = mi.sku) > 1
        ORDER BY m.id, mi.sku`,
    ).all().catch(() => ({ results: [] })),

    db.prepare(
      `SELECT id, nome_arquivo, cliente_id, linhas FROM clientes_vinculo_revisao
        WHERE status = 'pendente' ORDER BY linhas DESC LIMIT 100`,
    ).all().catch(() => ({ results: [] })),

    /* §31 — troca cuja diferença é NEGATIVA. Crédito ou reembolso nunca foi
       definido como regra: o caso fica aqui, esperando decisão humana, em
       vez de virar um crédito que ninguém combinou. */
    db.prepare(
      `SELECT t.garantia_id, t.sku_novo, t.diferenca, t.data, g.sku AS sku_original,
              g.cliente_nome
         FROM garantia_trocas t JOIN garantias g ON g.id = t.garantia_id
        WHERE t.diferenca_status = 'pendente_regra'`,
    ).all().catch(() => ({ results: [] })),

    db.prepare(
      `SELECT ho.id, ho.venda_chave, ho.cliente_nome_norm, vh.data, vh.cliente_nome
         FROM historico_operacoes ho
         JOIN vendas_historico_lotes l ON l.id = ho.lote_id AND l.status = 'importado'
         JOIN vendas_historicas vh ON vh.lote_id = ho.lote_id AND vh.chave = ho.venda_chave
        WHERE ho.status_registro = 'ativa' AND ho.papel = 'revisao' LIMIT 100`,
    ).all().catch(() => ({ results: [] })),

    listarPublicacoes(db).catch(() => ({ itens: [] })),

    db.prepare(`SELECT sku, desc, cat, preco, qtd, origem, motivo, criado_em
      FROM produtos_pendentes ORDER BY criado_em, sku LIMIT 300`)
      .all().catch(() => ({ results: [] })),

    db.prepare(`SELECT id, url, sku_loja, nome_loja, produto_id, visto_em
      FROM fotos_orfas ORDER BY visto_em, id LIMIT 300`)
      .all().catch(() => ({ results: [] })),
  ]);

  /* As variações CADASTRADAS de cada código que aparece nesta lista, para a
     tela poder oferecer a escolha sem uma segunda ida ao servidor. Uma
     consulta só, não uma por pendência — a auditoria do D1 mandou. */
  const skus = new Set([
    ...(revisao.itens ?? []).map((x) => x.sku),
    ...(itensSemVariacao.results ?? []).map((x) => x.sku),
    ...(maletasAbertas.results ?? []).map((x) => x.sku),
  ].filter(Boolean));
  const variacoesPorSku = new Map();
  if (skus.size) {
    const qs = parametros(skus.size);
    const { results } = await db.prepare(
      `SELECT pv.sku, pv.nome, pv.atributo, pv.variante_id, pv.valores_json, pv.estoque_loja,
              COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo
                         WHERE mo.sku = pv.sku
                           AND (mo.variante_id = pv.variante_id
                                OR (mo.variante_id IS NULL AND mo.variacao = pv.nome))), 0) AS saldo
         FROM produto_variacoes pv
        WHERE pv.sku IN (${qs})
        ORDER BY pv.sku, pv.ordem, pv.nome`,
    ).bind(...[...skus]).all().catch(() => ({ results: [] }));
    for (const v of results ?? []) {
      if (!variacoesPorSku.has(v.sku)) variacoesPorSku.set(v.sku, []);
      let valores = [];
      try { valores = JSON.parse(v.valores_json || '[]'); } catch { valores = []; }
      variacoesPorSku.get(v.sku).push({
        nome: v.nome,
        atributo: v.atributo ?? null,
        varianteId: v.variante_id == null ? null : String(v.variante_id),
        valores,
        estoqueLoja: v.estoque_loja == null ? null : Number(v.estoque_loja),
        saldo: Number(v.saldo ?? 0),
      });
    }
  }
  const vars = (sku) => variacoesPorSku.get(sku) ?? variacoesPorSku.get(normSku(sku)) ?? [];

  const efeitoPadrao = (p) => {
    if (p.tipo === 'variacao' || p.tipo === 'maleta' || p.tipo === 'venda') {
      return 'A peça continua sem identidade de variação e a sincronização não pode corrigir esse código com segurança.';
    }
    if (p.tipo === 'nuvemshop') return 'O estoque publicado pode continuar diferente do estoque físico até a exceção ser resolvida.';
    if (p.tipo === 'catalogo') return 'O produto não avança para revisão nem pode ser publicado.';
    if (p.tipo === 'cliente') return 'O histórico continua sem vínculo confirmado com um cadastro.';
    if (p.tipo === 'garantia') return 'Nenhum crédito ou reembolso é lançado sem a regra humana.';
    return 'O caso continua fora dos resultados oficiais até a decisão.';
  };
  const juntar = (p) => pendencias.push({
    informacaoFaltante: p.informacaoFaltante || p.explicacao || 'Falta uma decisão humana.',
    efeito: p.efeito || efeitoPadrao(p),
    proximoPasso: p.proximoPasso || null,
    ...p,
    grupo: GRUPOS[p.tipo] ?? 'Outros',
    adiadaAte: adiadas[p.chave] ? adiadas[p.chave].ate : null,
    status: adiadas[p.chave] && adiadas[p.chave].ate > hoje ? 'adiada' : 'aberta',
  });

  /* ─── 1. variações não mapeadas (o motor da sincronização) */
  for (const r of revisao.itens ?? []) {
    juntar({
      chave: `variacao:${r.sku}`,
      tipo: 'variacao',
      sku: r.sku,
      produto: r.desc,
      origem: 'Sincronização com a Nuvemshop',
      qtd: r.total,
      motivo: r.motivo,
      explicacao: r.explicacao,
      detalhe: r.detalhe ?? null,
      naLoja: r.variantes ?? [],
      variacoesPossiveis: vars(r.sku),
      /* `sem_reparticao` tem rota própria e antiga (distribuir); `maleta`
         agora tem a de §8.2; os outros continuam sendo diagnóstico. */
      acoes: r.motivo === 'sem_reparticao' ? ['distribuir', 'revisar_depois']
        : r.motivo === 'maleta' ? ['resolver_maleta', 'revisar_depois']
          : ['revisar_depois'],
    });
  }

  /* ─── preparação/publicação do catálogo (Pacote 4)
     Somente bloqueios entram na Central. Prévia aguardando aprovação e item
     aprovado pertencem à área principal "Publicar na Nuvemshop". */
  const NOMES_FALTA = {
    codigo: 'código', nome: 'Nome da peça', categoria: 'categoria', preco: 'preço',
    quantidade: 'quantidade em casa', foto: 'foto original', fundo_branco: 'foto com fundo branco',
  };
  for (const r of publicacao.itens ?? []) {
    if (![ESTADO_PUBLICACAO.FALTA, ESTADO_PUBLICACAO.PREPARANDO, ESTADO_PUBLICACAO.FALHOU]
      .includes(r.estado)) continue;
    const faltam = (r.falta ?? []).map((x) => NOMES_FALTA[x] || x);
    const falhou = r.estado === ESTADO_PUBLICACAO.FALHOU;
    const preparando = r.estado === ESTADO_PUBLICACAO.PREPARANDO;
    juntar({
      chave: `publicacao:${r.sku}`,
      tipo: 'catalogo',
      sku: r.sku,
      produto: r.desc,
      origem: 'Publicação na Nuvemshop',
      qtd: r.casa,
      valor: r.preco == null ? null : r.preco * r.casa,
      motivo: r.estado,
      explicacao: falhou
        ? (r.erroPublicacao || 'A última tentativa não concluiu a publicação.')
        : preparando
          ? (r.bloqueioExterno?.motivo || 'A foto e a prévia comercial ainda estão sendo preparadas.')
          : `Falta ${faltam.join(', ')}.`,
      informacaoFaltante: falhou
        ? 'É preciso confirmar que os dados aprovados continuam iguais antes de repetir.'
        : preparando
          ? (faltam.length ? faltam.join(', ') : 'prévia comercial preparada pelo agente')
          : faltam.join(', '),
      efeito: falhou
        ? 'O produto não foi criado nem atualizado na loja; o erro permanece visível para retry seguro.'
        : 'O produto não avança para aprovação e nada é escrito na loja.',
      proximoPasso: r.bloqueioExterno?.proximoPasso
        || (falhou ? 'Revise o erro e prepare uma nova tentativa segura.'
          : preparando ? 'Conclua o fundo branco e a prévia comercial.'
            : 'Abra o cadastro da peça e complete os campos indicados.'),
      acoes: falhou ? ['repetir_publicacao', 'revisar_depois']
        : preparando ? ['preparar_publicacao', 'preencher_previa', 'revisar_depois']
          : ['editar_produto', 'revisar_depois'],
    });
  }

  for (const r of produtosPendentes.results ?? []) {
    juntar({
      chave: `cadastro:${r.sku}`,
      tipo: 'catalogo',
      sku: r.sku,
      produto: r.desc || r.sku,
      origem: r.origem || 'Importação de produtos novos',
      qtd: Number(r.qtd ?? 0),
      motivo: 'cadastro_pendente',
      explicacao: r.motivo || 'O código foi encontrado na planilha, mas ainda não virou produto.',
      informacaoFaltante: 'Revisão e aprovação do cadastro da peça.',
      efeito: 'A peça não entra no catálogo nem no estoque enquanto o cadastro não for aprovado.',
      proximoPasso: 'Abra a fila de produtos novos, confira os dados e aprove ou rejeite o item.',
      acoes: ['revisar_cadastro', 'revisar_depois'],
    });
  }

  for (const r of fotosOrfas.results ?? []) {
    juntar({
      chave: `foto_orfa:${r.id}`,
      tipo: 'catalogo',
      sku: r.sku_loja || null,
      produto: r.nome_loja || r.sku_loja || 'Foto sem correspondência',
      origem: 'Catálogo da Nuvemshop',
      motivo: 'foto_sem_correspondencia',
      explicacao: 'A imagem veio da loja, mas o código não corresponde com segurança a uma peça daqui.',
      informacaoFaltante: 'Código exato da peça dona desta foto.',
      efeito: 'A foto não é vinculada automaticamente; assim o painel evita mostrar uma peça no produto errado.',
      proximoPasso: 'Informe o código correto ou revise depois.',
      fotoOrfaId: Number(r.id),
      fotoUrl: r.url,
      acoes: ['vincular_foto', 'revisar_depois'],
    });
  }

  /* ─── 2. item de venda sem variação (§8.1) */
  for (const r of itensSemVariacao.results ?? []) {
    juntar({
      chave: `venda_variacao:${r.venda_id}:${r.linha}`,
      tipo: 'venda',
      sku: r.sku,
      produto: r.desc,
      origem: r.revendedora ? 'Acerto de maleta' : 'Venda',
      cliente: r.cliente ?? null,
      revendedora: r.revendedora ?? null,
      vendaId: Number(r.venda_id),
      linha: Number(r.linha),
      data: r.data,
      qtd: Number(r.qtd ?? 0),
      motivo: 'variacao_da_venda',
      explicacao: `Este código tem ${r.n_variacoes} variações cadastradas e a venda `
        + 'não diz qual saiu. Escolher aqui não baixa estoque de novo — a peça já saiu.',
      variacoesPossiveis: vars(r.sku),
      acoes: ['resolver_venda', 'revisar_depois'],
    });
  }

  /* ─── 3. peça em maleta sem variação (§8.2) */
  for (const r of maletasAbertas.results ?? []) {
    const falta = Number(r.fora ?? 0) - Number(r.identificado ?? 0);
    if (falta <= 0) continue;
    juntar({
      chave: `maleta_variacao:${r.maleta_id}:${r.sku}`,
      tipo: 'maleta',
      sku: r.sku,
      produto: r.desc ?? r.sku,
      origem: 'Maleta aberta',
      revendedora: r.revendedora ?? null,
      maletaId: Number(r.maleta_id),
      data: r.aberta_em ?? null,
      qtd: falta,
      identificado: Number(r.identificado ?? 0),
      fora: Number(r.fora ?? 0),
      motivo: 'variacao_da_maleta',
      explicacao: `${falta} ${falta === 1 ? 'peça saiu' : 'peças saíram'} nesta maleta `
        + `e ${falta === 1 ? 'não tem' : 'não têm'} variação identificada. `
        + 'Dizer qual é identidade, não movimentação: nada sai do estoque de novo.',
      variacoesPossiveis: vars(r.sku),
      acoes: ['resolver_maleta', 'revisar_depois'],
    });
  }

  /* ─── 4. venda travada na Nuvemshop */
  for (const r of vendasTravadas.results ?? []) {
    juntar({
      chave: `nuvemshop:${r.id}`,
      tipo: 'nuvemshop',
      vendaId: Number(r.id),
      data: r.data,
      cliente: r.cliente ?? null,
      revendedora: r.revendedora ?? null,
      valor: Number(r.total ?? 0),
      motivo: r.nuvemshop_status,
      explicacao: r.nuvemshop_erro
        || 'A sincronização não escreveu o estoque desta venda na loja.',
      acoes: ['reenviar', 'revisar_depois'],
    });
  }

  /* ─── 5. vínculo de cliente em dúvida (§2) */
  for (const r of vinculos.results ?? []) {
    juntar({
      chave: `cliente:${r.id}`,
      tipo: 'cliente',
      cliente: r.nome_arquivo ?? null,
      qtd: Number(r.linhas ?? 0),
      motivo: 'vinculo_em_duvida',
      explicacao: 'O nome da planilha se parece com um cadastro, mas não é prova. '
        + 'Nome não é identidade: só uma pessoa pode dizer se são a mesma.',
      acoes: ['revisar_depois'],
    });
  }

  /* ─── 6. troca cuja regra não existe */
  for (const r of trocas.results ?? []) {
    juntar({
      chave: `troca:${r.garantia_id}`,
      tipo: 'garantia',
      sku: r.sku_novo,
      cliente: r.cliente_nome ?? null,
      data: r.data,
      valor: Number(r.diferenca ?? 0),
      motivo: 'credito_sem_regra',
      explicacao: `A peça nova (${r.sku_novo}) custa menos que a original (${r.sku_original}). `
        + 'Crédito ou reembolso ainda não é regra definida — nada foi lançado.',
      acoes: ['revisar_depois'],
    });
  }

  /* ─── 7. operação histórica marcada para revisão */
  for (const r of operacoesRevisao.results ?? []) {
    juntar({
      chave: `operacao:${r.id}`,
      tipo: 'venda',
      cliente: r.cliente_nome ?? r.cliente_nome_norm ?? null,
      data: r.data,
      motivo: 'operacao_em_revisao',
      explicacao: 'Esta operação da planilha foi marcada para revisão e não conta '
        + 'como venda nem como acerto até alguém decidir.',
      acoes: ['revisar_depois'],
    });
  }

  const visiveis = pendencias.filter((p) => (incluirAdiadas || p.status === 'aberta')
    && (!tipo || p.tipo === tipo));

  const porTipo = {};
  for (const p of pendencias) {
    if (p.status !== 'aberta') continue;
    const g = porTipo[p.tipo] ?? { grupo: GRUPOS[p.tipo] ?? 'Outros', total: 0 };
    g.total += 1;
    porTipo[p.tipo] = g;
  }

  return {
    ok: true,
    resumo: {
      total: pendencias.filter((p) => p.status === 'aberta').length,
      adiadas: pendencias.filter((p) => p.status === 'adiada').length,
      porTipo,
    },
    pendencias: visiveis,
    regra: 'A lista é derivada do estado, não guardada: resolver o caso a faz '
      + 'sumir daqui sozinha. Resolver uma variação é dizer QUAL peça saiu — '
      + 'identidade, não movimentação. Nada é baixado do estoque de novo.',
  };
}

/* ══════════════════════════════════════════ §8.1 — resolver pela venda */

/** Diz qual variação saiu numa linha de venda que não sabia.
 *
 *  Escreve em DOIS lugares, e os dois pelo mesmo motivo: a linha da venda é
 *  o que a tela mostra, e o movimento é o que a sincronização lê para saber
 *  qual caixinha da loja diminuir. Deixar um dos dois para trás faria a
 *  venda parecer resolvida e a loja continuar sem saber.
 *
 *  O que NÃO acontece: nenhum movimento novo. `movimentos.qtd` não é tocado,
 *  então a razão fecha exatamente igual antes e depois. */
export async function resolverVariacaoDaVenda(db, corpo = {}) {
  const vendaId = Number(corpo.vendaId);
  if (!Number.isFinite(vendaId)) return ERRO(400, 'Diga de qual venda é a linha.');
  const sku = String(corpo.sku ?? '').trim().toUpperCase();
  if (!sku) return ERRO(400, 'Diga qual código está sem variação.');

  const escolha = await escolherVariacao(db, sku, corpo);
  if (escolha.erro) return escolha.erro;

  const venda = await db.prepare('SELECT id, cancelada FROM vendas WHERE id = ?').bind(vendaId).first();
  if (!venda) return ERRO(404, `Venda ${vendaId} não existe.`);
  if (venda.cancelada) return ERRO(409, 'Venda cancelada não precisa de variação.');

  /* A linha exata, quando quem chama a identificou. Sem ela, a primeira sem
     variação — é o caso normal, e resolver a errada não existe: elas são
     idênticas em tudo, inclusive no que falta. */
  const linha = corpo.linha != null ? Number(corpo.linha) : null;
  const item = await db.prepare(
    `SELECT rowid AS linha, * FROM venda_itens
      WHERE venda_id = ? AND sku = ?
        AND (? IS NULL OR rowid = ?)
        AND (variacao IS NULL AND variante_id IS NULL)
      ORDER BY rowid LIMIT 1`,
  ).bind(vendaId, sku, linha, linha).first();
  if (!item) {
    return ERRO(409, `A venda ${vendaId} não tem linha de ${sku} esperando variação.`);
  }

  /* §8.5 — o conflito, explicado em vez de barrado em silêncio.
     Escolher uma variação cujo saldo não comporta a venda é sinal de que
     alguma outra peça está atribuída errado. A resolução PROSSEGUE mesmo
     assim quando quem chama confirma, porque a peça física já saiu — o que
     não pode acontecer é isso passar sem ninguém ver. */
  const conflito = escolha.saldo != null && escolha.saldo < 0
    ? { saldoDaVariacao: escolha.saldo, qtd: Number(item.qtd ?? 0) }
    : null;

  await db.batch([
    db.prepare('UPDATE venda_itens SET variacao = ?, variante_id = ? WHERE rowid = ?')
      .bind(escolha.nome, escolha.varianteId, item.linha),
    /* O movimento da venda passa a dizer de qual caixinha a peça saiu.
       `qtd` NÃO é tocado — é identidade, não quantidade. */
    db.prepare(
      `UPDATE movimentos SET variacao = ?, variante_id = ?
        WHERE venda_id = ? AND sku = ? AND variacao IS NULL AND variante_id IS NULL`,
    ).bind(escolha.nome, escolha.varianteId, vendaId, sku),
  ]);

  return {
    ok: true,
    chave: `venda_variacao:${vendaId}:${item.linha}`,
    vendaId,
    sku,
    variacao: escolha.nome,
    varianteId: escolha.varianteId,
    estoqueMovimentado: false,
    conflito,
    resumo: `${sku} na venda ${vendaId} agora é "${escolha.nome}". `
      + 'Nenhuma peça saiu do estoque: a variação é identidade, não movimentação.',
  };
}

/* ═════════════════════════════════════════ §8.2 — resolver pela maleta */

/** Diz quais variações estão numa maleta aberta.
 *
 *  Aceita a distribuição inteira de uma vez — uma maleta leva dois anéis do
 *  mesmo código, um 16 e um 18, e isso é o caso normal, não a exceção. Por
 *  isso a tabela é filha e não uma coluna em `maleta_itens`.
 *
 *  A soma nunca pode passar do que saiu: dizer que três peças de um código
 *  estão numa maleta que levou duas inventaria uma peça. */
export async function resolverVariacaoDaMaleta(db, corpo = {}) {
  const maletaId = Number(corpo.maletaId);
  const sku = String(corpo.sku ?? '').trim().toUpperCase();
  if (!Number.isFinite(maletaId) || !sku) return ERRO(400, 'Diga a maleta e o código.');

  const maleta = await db.prepare(
    `SELECT m.id, m.status, mi.qtd, mi.devolvida
       FROM maletas m JOIN maleta_itens mi ON mi.maleta_id = m.id AND mi.sku = ?
      WHERE m.id = ?`,
  ).bind(sku, maletaId).first();
  if (!maleta) return ERRO(404, `A maleta ${maletaId} não levou o código ${sku}.`);
  if (!['aberta', 'em_acerto'].includes(maleta.status)) {
    return ERRO(409, 'Maleta encerrada ou cancelada não muda mais.');
  }
  const fora = Number(maleta.qtd ?? 0) - Number(maleta.devolvida ?? 0);

  const bruto = Array.isArray(corpo.distribuicao) ? corpo.distribuicao : [];
  if (!bruto.length) return ERRO(400, 'Diga quantas peças de cada variação estão na maleta.');

  const linhas = [];
  let total = 0;
  for (const d of bruto) {
    const qtd = Number(d.qtd ?? 0);
    if (!Number.isFinite(qtd) || qtd < 0) return ERRO(400, 'Quantidade inválida.');
    if (qtd === 0) continue;
    const escolha = await escolherVariacao(db, sku, d);
    if (escolha.erro) return escolha.erro;
    linhas.push({ nome: escolha.nome, varianteId: escolha.varianteId, qtd });
    total += qtd;
  }
  if (!linhas.length) return ERRO(400, 'Nenhuma quantidade informada.');
  if (total > fora) {
    return ERRO(409,
      `A maleta ${maletaId} tem ${fora} ${fora === 1 ? 'peça' : 'peças'} de ${sku} fora, `
      + `e a distribuição soma ${total}. Dizer mais do que saiu inventaria peça.`,
      { fora, informado: total });
  }

  const stmts = [
    /* A distribuição é substituída por inteiro: quem corrige está dizendo o
       quadro completo, e mesclar deixaria sobras de uma tentativa anterior. */
    db.prepare('DELETE FROM maleta_item_variacoes WHERE maleta_id = ? AND sku = ?')
      .bind(maletaId, sku),
    ...linhas.map((l) => db.prepare(
      `INSERT INTO maleta_item_variacoes (maleta_id, sku, variacao, variante_id, qtd, origem, observacao)
       VALUES (?, ?, ?, ?, ?, 'humana', ?)`,
    ).bind(maletaId, sku, l.nome, l.varianteId, l.qtd,
      String(corpo.observacao ?? '').trim() || null)),
    /* O movimento de CONSIGNAÇÃO passa a dizer qual variação saiu de casa.
       Ele vale 0 no total (§5.3: consignação não é venda), então mexer na
       identidade dele não move saldo nenhum — mas é ele que a
       reconciliação lê para saber onde a peça está. */
    ...(linhas.length === 1 ? [db.prepare(
      `UPDATE movimentos SET variacao = ?, variante_id = ?
        WHERE maleta_id = ? AND sku = ? AND tipo = 'consignacao'
          AND variacao IS NULL AND variante_id IS NULL`,
    ).bind(linhas[0].nome, linhas[0].varianteId, maletaId, sku)] : []),
  ];
  await db.batch(stmts);

  return {
    ok: true,
    chave: `maleta_variacao:${maletaId}:${sku}`,
    maletaId,
    sku,
    distribuicao: linhas,
    fora,
    identificado: total,
    faltaIdentificar: fora - total,
    estoqueMovimentado: false,
    resumo: `${total} de ${fora} ${fora === 1 ? 'peça' : 'peças'} de ${sku} `
      + `${total === 1 ? 'identificada' : 'identificadas'} na maleta ${maletaId}. `
      + 'Nenhuma peça saiu do estoque: identificar não é movimentar.',
  };
}

/* ══════════════════════════════════════════════════════════ apoio */

/** Resolve o par (nome, variante_id) a partir do que a tela mandou, e
 *  recusa o que não existe. Aceitar uma variação não cadastrada seria criar
 *  variação por engano numa tela de resolver pendência — e a Sthefany já
 *  disse que cadastrou todas as que possui. */
async function escolherVariacao(db, sku, d) {
  const varianteId = d.varianteId == null || d.varianteId === '' ? null : String(d.varianteId);
  const nome = String(d.variacao ?? '').trim() || null;
  if (!varianteId && !nome) {
    return { erro: ERRO(400, 'Escolha a variação — nem o nome nem o variant_id vieram.') };
  }

  const { results } = await db.prepare(
    `SELECT nome, variante_id,
            COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo
                       WHERE mo.sku = produto_variacoes.sku
                         AND (mo.variante_id = produto_variacoes.variante_id
                              OR (mo.variante_id IS NULL AND mo.variacao = produto_variacoes.nome))), 0) AS saldo
       FROM produto_variacoes WHERE sku = ?`,
  ).bind(sku).all();
  const lista = results ?? [];
  if (!lista.length) {
    return { erro: ERRO(409, `${sku} não tem variação cadastrada. Cadastre as variações antes de resolver.`) };
  }

  const achada = varianteId
    ? lista.find((v) => String(v.variante_id) === varianteId)
    : lista.find((v) => v.nome === nome);
  if (!achada) {
    return {
      erro: ERRO(409,
        `"${varianteId ?? nome}" não é uma variação cadastrada de ${sku}.`,
        { variacoes: lista.map((v) => ({ nome: v.nome, varianteId: v.variante_id })) }),
    };
  }
  return {
    nome: achada.nome,
    varianteId: achada.variante_id == null ? null : String(achada.variante_id),
    saldo: Number(achada.saldo ?? 0),
  };
}
