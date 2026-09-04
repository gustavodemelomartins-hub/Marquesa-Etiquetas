/** §30.5 — AUDITORIA DOS REGISTROS HISTÓRICOS QUE NÃO SÃO VENDA
 *
 *  A planilha trazia, misturadas com as compras de verdade, linhas que nunca
 *  foram venda: "Brinde dia das mães", "Brinde festa junina", as retiradas
 *  pessoais e as diferenças de inventário ("PERDIDO", "ACHO QUE FOI
 *  VENDIDO"). Elas entraram como CLIENTE e como VENDA, e contaminam
 *  faturamento, ticket médio, peças vendidas e o ranking de clientes.
 *
 *  A regra deste módulo, e é a única que importa:
 *
 *      NÃO SE CLASSIFICA PELO NOME.
 *
 *  Ele propõe. Um humano decide. "ACHO QUE FOI VENDIDO" é o caso que prova
 *  por quê: a própria planilha está em dúvida, e um classificador que
 *  escolhesse sozinho estaria inventando a resposta — §2 aplicado a
 *  dinheiro. Ele vira `confianca: 'baixa'` e espera.
 *
 *  O que a análise NUNCA faz: escrever. `analisar` é seco por completo — lê
 *  tudo, propõe e devolve o relatório. `aplicar` só toca nas linhas que
 *  vierem nomeadas, uma a uma, e nem ele mexe no estoque:
 *
 *  ┌─ por que aplicar NÃO baixa estoque ────────────────────────────────┐
 *  │ A linha histórica JÁ baixou o estoque quando a planilha foi        │
 *  │ importada — ou nunca baixou, porque a importação histórica tem     │
 *  │ impacto ZERO sobre estoque de propósito. Nos dois casos, criar     │
 *  │ um movimento agora seria uma segunda baixa da mesma peça.          │
 *  │ Reclassificar é dizer "isto não era venda". É contabilidade        │
 *  │ comercial, não movimentação física.                                │
 *  └────────────────────────────────────────────────────────────────────┘
 */
import { normalizarNomeCliente } from './vendas-historico-normalizar.js';

/* ── os padrões, e o que cada um vale
 *
 * `alta` = o texto DIZ o que é, sem margem. "Brinde dia das mães" é brinde.
 * `media` = o texto indica fortemente, mas o nome sozinho não fecha.
 * `baixa` = há dúvida no PRÓPRIO texto. Nunca se aplica sem um humano.
 *
 * Cada padrão carrega a frase que explica a decisão, e ela vai no relatório:
 * "porque o nome começa com Brinde" é auditável; "confiança 0,87" não é. */
const PADROES = [
  {
    classe: 'brinde', confianca: 'alta',
    campo: 'nome',
    teste: (t) => /^brinde\b/.test(t) || /\bbrinde\s+(de|do|da|dia|festa)\b/.test(t),
    porque: 'o nome da "cliente" é a própria ocasião do brinde',
  },
  {
    classe: 'brinde', confianca: 'media',
    campo: 'observacao',
    teste: (t) => /\bbrinde\b/.test(t) && !/\bcom\s+brinde\b/.test(t),
    porque: 'a observação diz que a peça foi brinde',
  },
  {
    classe: 'perda', confianca: 'alta',
    campo: 'observacao',
    teste: (t) => /^perdid[oa]\b/.test(t) || /\bpe[cç]a\s+perdida\b/.test(t),
    porque: 'a observação afirma que a peça foi perdida',
  },
  {
    classe: 'perda', confianca: 'alta',
    campo: 'nome',
    teste: (t) => /^invent[aá]rio\b/.test(t) || /^diferen[cç]a\s+de\s+invent/.test(t),
    porque: 'a linha foi lançada como inventário, não como compra de alguém',
  },
  {
    classe: 'perda', confianca: 'media',
    campo: 'observacao',
    teste: (t) => /\bn[aã]o\s+foi\s+poss[ií]vel\s+identificar\b/.test(t)
      || /\bdiferen[cç]a\s+de\s+(estoque|invent)/.test(t),
    porque: 'a observação descreve uma diferença de estoque sem origem conhecida',
  },
  {
    classe: 'perda', confianca: 'baixa',
    campo: 'observacao',
    /* O caso que existe para provar a regra: a planilha está em dúvida, e
       o sistema não tem como resolver a dúvida dela. */
    teste: (t) => DUVIDA.test(t),
    porque: 'a própria observação está em dúvida ("acho que…") — ninguém pode decidir isto por ela',
  },
];

/** Dúvida escrita na própria linha. Está fora da lista de padrões porque não
 *  é um padrão entre outros: é um VETO que rebaixa qualquer certeza.
 *
 *  Sem ele, "Inventário" com a observação "ACHO QUE FOI VENDIDO" casava com o
 *  padrão do NOME — confiança alta — e virava aplicável sozinho, decidindo
 *  justamente o caso que ninguém pode decidir. A ordem da lista resolvia
 *  errado porque a força de um padrão não é a força da LINHA: quem escreveu
 *  "acho que" está dizendo que não sabe, e nenhuma outra pista sobrepõe isso. */
const DUVIDA = /\bacho\s+que\b|\btalvez\b|\bn[aã]o\s+sei\b|\bn[aã]o\s+tenho\s+certeza\b|\?\s*$/;

/** Uso próprio é o único padrão que depende de um NOME de pessoa, e nome não
 *  é identidade (§2). Por isso ele não está na lista acima: quem chama diz
 *  quais nomes são retiradas pessoais, e o padrão só existe se ela disser.
 *  Vazio, nenhuma linha é proposta como uso próprio. */
function padraoUsoProprio(nomes) {
  const alvo = new Set((nomes ?? []).map((n) => normalizarNomeCliente(String(n))).filter(Boolean));
  if (!alvo.size) return null;
  return {
    classe: 'uso_proprio', confianca: 'media', campo: 'nome_norm',
    teste: (t) => alvo.has(t),
    porque: 'o nome está na lista de retiradas pessoais informada na chamada',
  };
}

const limpar = (v) => String(v ?? '').trim().toLowerCase();

/** A proposta para UMA linha, ou null. A primeira regra que casa vence, e a
 *  ordem da lista é a ordem de força — `alta` antes de `baixa`. */
function propor(linha, padroes) {
  const campos = {
    nome: limpar(linha.cliente_nome_original),
    nome_norm: limpar(linha.cliente_nome_norm) || normalizarNomeCliente(linha.cliente_nome_original ?? '') || '',
    observacao: limpar(linha.observacao_original),
  };
  /* O veto vem ANTES de escolher o padrão: a dúvida da linha não compete
     com as pistas, ela as rebaixa. */
  const emDuvida = DUVIDA.test(campos.observacao);

  for (const p of padroes) {
    const t = campos[p.campo];
    if (!t) continue;
    if (p.teste(t)) {
      const origem = p.campo === 'observacao' ? 'observacao_original' : 'cliente_nome_original';
      const texto = String(linha[origem] ?? '').trim();
      if (emDuvida) {
        return {
          classe: p.classe,
          confianca: 'baixa',
          motivo: `${p.porque} (texto: "${texto}") — MAS a observação da linha está em `
            + `dúvida ("${String(linha.observacao_original ?? '').trim()}"). `
            + 'Ninguém pode decidir isto pela planilha: precisa de conferência humana.',
        };
      }
      return {
        classe: p.classe,
        confianca: p.confianca,
        motivo: `${p.porque} (texto: "${texto}")`,
      };
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════ analisar */

/** SECO. Lê todas as linhas históricas importadas, propõe classificação e
 *  devolve o relatório. Não escreve uma linha sequer. */
export async function analisarHistoricoNaoVenda(db, { nomesUsoProprio = [], limite = 5000 } = {}) {
  const extra = padraoUsoProprio(nomesUsoProprio);
  const padroes = extra ? [extra, ...PADROES] : PADROES;

  const { results } = await db.prepare(
    `SELECT h.id, h.origem_linha, h.data, h.sku, h.sku_base,
            h.cliente_nome_original, h.cliente_nome_norm,
            h.nome_produto_historico, h.qtd, h.valor_total, h.preco_unit,
            h.observacao_original, h.canal, h.contexto,
            h.venda_historica_id,
            rc.id AS reclassificacao_id, rc.status AS reclassificacao_status,
            rc.classe_nova AS reclassificacao_classe,
            /* A planilha JÁ marcava algumas destas linhas como ajuste — e o
               painel já as excluía. Sem esta coluna o relatório de impacto
               contaria o valor delas como dinheiro que vai sair do
               faturamento, e o número seria maior do que a verdade. Um
               relatório de impacto que exagera é pior que nenhum: ele é
               usado para decidir. */
            vh.classe AS venda_classe
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
       LEFT JOIN historico_reclassificacao rc ON rc.historico_item_id = h.id
       LEFT JOIN vendas_historicas vh ON vh.id = h.venda_historica_id
      ORDER BY h.id
      LIMIT ?`,
  ).bind(limite).all();

  const candidatos = [];
  const jaDecididos = [];
  let analisadas = 0;

  for (const h of results ?? []) {
    analisadas++;
    if (h.reclassificacao_id) {
      jaDecididos.push({
        id: h.id, status: h.reclassificacao_status, classe: h.reclassificacao_classe,
      });
      continue;
    }
    const p = propor(h, padroes);
    if (!p) continue;
    /* `ajuste` é o que a PLANILHA já marcou como não-venda. Reclassificar a
       linha continua valendo — ela sai também dos ITENS, do ranking de
       produtos e da contagem de peças — mas o dinheiro dela já não estava
       no faturamento, e o relatório diz isso. */
    const jaFora = h.venda_classe === 'ajuste';
    candidatos.push({
      historicoItemId: h.id,
      origemLinha: h.origem_linha,
      nomeAtual: h.cliente_nome_original ?? null,
      data: h.data ?? null,
      sku: h.sku ?? null,
      produto: h.nome_produto_historico ?? null,
      qtd: h.qtd == null ? null : Number(h.qtd),
      valor: h.valor_total == null ? null : Number(h.valor_total),
      observacao: h.observacao_original ?? null,
      classificacaoProposta: p.classe,
      confianca: p.confianca,
      motivo: p.motivo,
      /* Já fora do faturamento porque a planilha a marcou como ajuste. */
      jaForaDoFaturamento: jaFora,
      /* A linha só pode ser aplicada sozinha quando o texto não deixa
         margem. Tudo o mais espera conferência humana — inclusive `media`,
         porque "média" é exatamente o nome de "não tenho certeza". */
      aplicavelAutomaticamente: p.confianca === 'alta',
    });
  }

  const porClasse = { brinde: 0, uso_proprio: 0, perda: 0 };
  const porConfianca = { alta: 0, media: 0, baixa: 0 };
  let valorEnvolvido = 0;
  let valorJaFora = 0;
  let pecasEnvolvidas = 0;
  for (const c of candidatos) {
    porClasse[c.classificacaoProposta]++;
    porConfianca[c.confianca]++;
    pecasEnvolvidas += c.qtd ?? 0;
    if (c.jaForaDoFaturamento) valorJaFora += c.valor ?? 0;
    else valorEnvolvido += c.valor ?? 0;
  }

  return {
    ok: true,
    seco: true,
    analisadas,
    candidatos,
    jaDecididos,
    resumo: {
      total: candidatos.length,
      porClasse,
      porConfianca,
      /* O impacto do que se propõe tirar do faturamento, ANTES de tirar.
         É o número que a decisão humana precisa ver — e por isso ele conta
         só o que HOJE está sendo somado. */
      valorQueSaiDoFaturamento: +valorEnvolvido.toFixed(2),
      /* O que a planilha já marcou como ajuste: reclassificar ainda vale
         (a linha sai dos itens e do ranking de produtos), mas o dinheiro
         dela nunca esteve no faturamento. */
      valorJaForaDoFaturamento: +valorJaFora.toFixed(2),
      pecasQueSaemDeVendidas: pecasEnvolvidas,
      aplicaveisAutomaticamente: candidatos.filter((c) => c.aplicavelAutomaticamente).length,
      aguardandoConferencia: candidatos.filter((c) => !c.aplicavelAutomaticamente).length,
    },
    aviso: 'Nada foi escrito. Nenhuma linha da planilha é apagada em nenhum momento: '
      + 'aplicar apenas marca a linha como não-venda, e as somas comerciais passam a ignorá-la.',
    naoFaz: [
      'não altera estoque — a linha histórica não movimentou peça, e criar um movimento agora seria uma segunda baixa',
      'não apaga nem edita a linha original da planilha',
      'não decide sozinho os casos de confiança média ou baixa',
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════ aplicar */

/** Grava a decisão. `decisoes` é uma lista de
 *  `{ historicoItemId, classe, decisao: 'aplicar' | 'recusar', motivo? }`.
 *
 *  Nada é decidido aqui: cada linha vem nomeada por quem chamou. Não existe
 *  "aplicar todas" neste módulo de propósito — a tela pode oferecer o botão,
 *  mas ela manda a lista, e a lista fica registrada. */
export async function aplicarReclassificacao(db, { decisoes = [], usuario = null } = {}) {
  if (!Array.isArray(decisoes) || !decisoes.length) {
    return { ok: false, statusHttp: 400, erro: 'Nenhuma decisão para aplicar.' };
  }
  const CLASSES = new Set(['brinde', 'uso_proprio', 'perda']);

  const aplicadas = [];
  const recusadas = [];
  const problemas = [];

  for (const d of decisoes) {
    const id = Number(d.historicoItemId);
    if (!Number.isInteger(id)) { problemas.push({ d, erro: 'historicoItemId inválido' }); continue; }

    const linha = await db.prepare(
      `SELECT h.* FROM vendas_historico_itens h
         JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
        WHERE h.id = ?`,
    ).bind(id).first();
    if (!linha) { problemas.push({ historicoItemId: id, erro: 'linha não encontrada ou lote revertido' }); continue; }

    const jaTem = await db.prepare(
      'SELECT id, status FROM historico_reclassificacao WHERE historico_item_id = ?',
    ).bind(id).first();
    if (jaTem) {
      problemas.push({ historicoItemId: id, erro: `já decidida (${jaTem.status})` });
      continue;
    }

    const recusa = d.decisao === 'recusar';
    const classe = String(d.classe ?? '').trim();
    if (!recusa && !CLASSES.has(classe)) {
      problemas.push({ historicoItemId: id, erro: 'classe inválida' });
      continue;
    }
    const motivo = String(d.motivo ?? '').trim()
      || (recusa ? 'confirmada como venda por decisão humana' : 'reclassificada por decisão humana');

    await db.prepare(
      `INSERT INTO historico_reclassificacao
         (historico_item_id, classe_nova, confianca, motivo, status, decidido_em, decidido_por)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    ).bind(
      id,
      /* Uma recusa também precisa de `classe_nova` por causa do CHECK, e
         guardar a classe que foi RECUSADA é informação: diz o que alguém
         olhou e disse que não era. */
      recusa ? (CLASSES.has(classe) ? classe : 'perda') : classe,
      String(d.confianca ?? 'alta'),
      motivo,
      recusa ? 'recusada' : 'aplicada',
      usuario,
    ).run();

    /* Mesma honestidade do relatório: a linha que a planilha já tratava como
       ajuste não estava no faturamento, e contar o valor dela aqui inflaria
       o impacto declarado da operação. */
    const venda = linha.venda_historica_id
      ? await db.prepare('SELECT classe FROM vendas_historicas WHERE id = ?')
        .bind(linha.venda_historica_id).first()
      : null;
    (recusa ? recusadas : aplicadas).push({
      historicoItemId: id, classe, valor: linha.valor_total, qtd: linha.qtd,
      jaFora: venda?.classe === 'ajuste',
    });
  }

  const valorRemovido = aplicadas.reduce((s, a) => s + (a.jaFora ? 0 : Number(a.valor ?? 0)), 0);
  const pecasRemovidas = aplicadas.reduce((s, a) => s + Number(a.qtd ?? 0), 0);

  return {
    ok: problemas.length === 0,
    statusHttp: problemas.length ? 207 : 200,
    aplicadas: aplicadas.length,
    recusadas: recusadas.length,
    problemas,
    impacto: {
      valorRemovidoDoFaturamento: +valorRemovido.toFixed(2),
      pecasRemovidasDeVendidas: pecasRemovidas,
      estoqueAlterado: false,
      linhasApagadas: 0,
    },
  };
}

/** Desfaz uma decisão. A linha volta a ser venda e as somas voltam a
 *  alcançá-la — nada foi perdido no caminho, porque nada foi apagado.
 *
 *  E não devolve peça ao estoque, pelo mesmo motivo que aplicar não tirou:
 *  quem baixou a peça foi a importação da planilha, e ela continua baixada.
 *  Somar +1 aqui inventaria uma unidade que nunca voltou para a gaveta —
 *  o defeito simétrico do que §3 da revisão manda impedir. */
export async function desfazerReclassificacao(db, historicoItemId) {
  const r = await db.prepare(
    'DELETE FROM historico_reclassificacao WHERE historico_item_id = ? RETURNING *',
  ).bind(Number(historicoItemId)).first();
  if (!r) return { ok: false, statusHttp: 404, erro: 'Não há decisão registrada para esta linha.' };
  return {
    ok: true,
    desfeita: { historicoItemId: r.historico_item_id, classeAnterior: r.classe_nova },
    estoqueAlterado: false,
    porQueNaoAlterouEstoque:
      'a baixa desta peça é da linha da planilha, não desta decisão — devolver aqui somaria '
      + 'ao estoque uma unidade que nunca saiu por causa dela',
  };
}

export async function listarReclassificacoes(db, { status = null } = {}) {
  const { results } = await db.prepare(
    `SELECT rc.*, h.cliente_nome_original, h.data, h.sku, h.qtd, h.valor_total,
            h.nome_produto_historico, h.observacao_original
       FROM historico_reclassificacao rc
       JOIN vendas_historico_itens h ON h.id = rc.historico_item_id
      WHERE (? IS NULL OR rc.status = ?)
      ORDER BY rc.id DESC`,
  ).bind(status, status).all();
  return { ok: true, reclassificacoes: results ?? [] };
}

export { PADROES as PADROES_AUDITORIA, propor as proporClassificacao };
