/** Preparação de conteúdo: a fronteira que o ERP não atravessa.
 *
 *  O sistema abre uma TAREFA e recebe um RESULTADO. Quem prepara é problema
 *  de fora — e isso não é uma indireção gratuita.
 *
 *  Hoje o executor real é humano-assistido: a Sthefany pede "prepare todos
 *  os produtos novos de hoje" na ferramenta que ela já usa, aquela
 *  ferramenta lê as tarefas pendentes e devolve os textos. Amanhã pode ser
 *  uma API chamada pelo próprio Worker. Se o domínio do catálogo soubesse o
 *  nome do fornecedor, trocar de fornecedor seria redesenhar o catálogo.
 *
 *  Por isso `executor` é rótulo livre — `humano`, `assistido`,
 *  `servico:<nome>` — e nenhuma linha deste arquivo, nenhuma coluna do banco
 *  e nenhum CHECK menciona fornecedor nenhum.
 *
 *  ── O que este arquivo NÃO faz ──────────────────────────────────────────
 *
 *  Não publica. Concluir uma tarefa leva a peça a `aguardando_aprovacao` e
 *  para ali. A aprovação é humana e é invariante do domínio: nada preparado
 *  por agente chega à Nuvemshop sem alguém dizer que pode.
 */
import { salvarPreviaPublicacao, ESTADO_PUBLICACAO, listarPublicacoes } from '../publicacao-catalogo.js';
import { normSku } from '../sku.js';

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });
const novoId = () => (globalThis.crypto?.randomUUID?.() || `t${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
const texto = (v, limite = 5000) => String(v == null ? '' : v).trim().slice(0, limite);

export const ESTADO_TAREFA = {
  PENDENTE: 'pendente',
  ENTREGUE: 'entregue',
  CONCLUIDA: 'concluida',
  FALHOU: 'falhou',
  CANCELADA: 'cancelada',
};

/** Os campos que uma tarefa pede. Lista, não colunas, porque o que se pede
 *  vai mudar — e mudar o que se pede não deveria ser migration. */
export const CAMPOS_PADRAO = ['nome_site', 'descricao_site', 'seo_titulo', 'seo_descricao'];

/** Abre tarefas para as peças indicadas — ou para todas as que estão
 *  prontas esperando alguém começar.
 *
 *  "Pronta para preparação" não é opinião: é o veredito do juiz único de
 *  completude (`catalogo/completude.js`). Uma peça sem preço ou sem
 *  categoria não entra na fila, porque preparar o texto dela seria trabalho
 *  que a aprovação vai recusar depois.
 */
export async function abrirTarefas(db, env, { skus, campos, criadoPor } = {}) {
  const lista = await listarPublicacoes(db, env);
  const elegiveis = lista.itens.filter((i) => i.estado === ESTADO_PUBLICACAO.PRONTO);

  let alvos = elegiveis;
  const recusados = [];
  if (Array.isArray(skus) && skus.length) {
    const pedidos = skus.map(normSku);
    const porSku = new Map(lista.itens.map((i) => [i.sku, i]));
    alvos = [];
    for (const s of pedidos) {
      const item = porSku.get(s);
      if (!item) { recusados.push({ sku: s, motivo: 'não está na fila de publicação' }); continue; }
      if (item.estado !== ESTADO_PUBLICACAO.PRONTO) {
        recusados.push({ sku: s, motivo: `está em "${item.estado}"`, falta: item.falta });
        continue;
      }
      alvos.push(item);
    }
  }

  const pedidos = Array.isArray(campos) && campos.length ? campos.map(String) : CAMPOS_PADRAO;
  const abertas = [], jaTinham = [];
  const stmts = [];

  for (const item of alvos) {
    const aberta = await db.prepare(
      `SELECT id FROM preparacao_tarefas WHERE sku = ? AND estado IN ('pendente','entregue') LIMIT 1`
    ).bind(item.sku).first();
    if (aberta) { jaTinham.push({ sku: item.sku, tarefaId: aberta.id }); continue; }

    const id = novoId();
    /* O retrato da peça viaja com a tarefa para o executor trabalhar sem
       precisar de outra leitura — e para a revisão humana ver depois
       exatamente o que ele viu. */
    const contexto = {
      sku: item.sku, nome: item.desc, categoria: item.cat,
      preco: item.preco, quantidadeEmCasa: item.casa,
      temFoto: item.temOriginal || item.temTratada || !!item.urlLoja,
    };
    stmts.push(db.prepare(`
      INSERT INTO preparacao_tarefas (id, sku, estado, campos_json, contexto_json, criado_em, atualizado_em)
      VALUES (?, ?, 'pendente', ?, ?, datetime('now'), datetime('now'))`).bind(
      id, item.sku, JSON.stringify(pedidos), JSON.stringify(contexto),
    ));
    /* A peça entra em "em preparação" na mesma transação da tarefa: um
       estado que diz "alguém está mexendo" sem tarefa aberta seria mentira
       na tela. */
    stmts.push(db.prepare(`
      INSERT INTO catalogo_publicacoes (sku, estado, atualizado_em)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(sku) DO UPDATE SET estado = excluded.estado, atualizado_em = excluded.atualizado_em`
    ).bind(item.sku, ESTADO_PUBLICACAO.PREPARANDO));
    abertas.push({ tarefaId: id, sku: item.sku, nome: item.desc });
  }

  if (stmts.length) await db.batch(stmts);
  return {
    ok: true,
    abertas: abertas.length, tarefas: abertas,
    /* §22: o que o sistema decidiu não fazer, com o motivo por peça. */
    jaTinhamTarefa: jaTinham,
    recusados,
    elegiveisNaFila: elegiveis.length,
    campos: pedidos,
  };
}

/** A fila que o executor lê. Sem segredo, sem contexto do fornecedor: só o
 *  que precisa ser escrito e o retrato da peça. */
export async function listarTarefas(db, { estado, limite = 200 } = {}) {
  const filtro = estado ? 'WHERE estado = ?' : '';
  const st = db.prepare(
    `SELECT * FROM preparacao_tarefas ${filtro} ORDER BY criado_em, id LIMIT ?`);
  const { results } = await (estado ? st.bind(String(estado), Number(limite)) : st.bind(Number(limite))).all();
  return {
    ok: true,
    total: (results ?? []).length,
    tarefas: (results ?? []).map((t) => ({
      id: t.id, sku: t.sku, estado: t.estado,
      campos: JSON.parse(t.campos_json || '[]'),
      contexto: t.contexto_json ? JSON.parse(t.contexto_json) : null,
      executor: t.executor || null,
      criadoEm: t.criado_em, entregueEm: t.entregue_em,
      concluidaEm: t.concluida_em, erro: t.erro || null,
      tentativas: Number(t.tentativas ?? 0),
    })),
  };
}

/** O executor avisa que pegou a tarefa.
 *
 *  Não é obrigatório — concluir direto funciona. Existe para a tela poder
 *  mostrar "alguém está trabalhando nisto" sem inferir do silêncio. */
export async function entregarTarefa(db, id, { executor } = {}) {
  const t = await db.prepare(`SELECT * FROM preparacao_tarefas WHERE id = ?`).bind(String(id)).first();
  if (!t) return ERRO(404, 'Tarefa não encontrada.');
  if (t.estado !== ESTADO_TAREFA.PENDENTE) {
    return ERRO(409, `Esta tarefa está "${t.estado}" — só uma pendente pode ser entregue.`);
  }
  await db.prepare(`
    UPDATE preparacao_tarefas SET estado = ?, executor = ?, entregue_em = datetime('now'),
           atualizado_em = datetime('now') WHERE id = ?`).bind(
    ESTADO_TAREFA.ENTREGUE, texto(executor, 120) || 'assistido', t.id).run();
  return { ok: true, tarefaId: t.id, estado: ESTADO_TAREFA.ENTREGUE };
}

/** O resultado chega, vira rascunho, e a peça passa a esperar aprovação.
 *
 *  A gravação do rascunho reusa `salvarPreviaPublicacao` de propósito: é lá
 *  que mora a trava que impede o preparador de renomear a peça em silêncio.
 *  Um executor que devolvesse outro nome estaria mudando o cadastro por
 *  baixo, e isso não é preparação de conteúdo — é decisão de catálogo.
 */
export async function concluirTarefa(db, env, id, corpo = {}) {
  const t = await db.prepare(`SELECT * FROM preparacao_tarefas WHERE id = ?`).bind(String(id)).first();
  if (!t) return ERRO(404, 'Tarefa não encontrada.');
  if (t.estado === ESTADO_TAREFA.CONCLUIDA) {
    return ERRO(409, 'Esta tarefa já foi concluída.', { tarefaId: t.id });
  }
  if (t.estado === ESTADO_TAREFA.CANCELADA) {
    return ERRO(409, 'Esta tarefa foi cancelada.');
  }

  const resultado = corpo.resultado || corpo;
  const salvo = await salvarPreviaPublicacao(db, t.sku, {
    nomeSite: resultado.nomeSite ?? resultado.nome_site,
    descricaoSite: resultado.descricaoSite ?? resultado.descricao_site,
    seoTitulo: resultado.seoTitulo ?? resultado.seo_titulo,
    seoDescricao: resultado.seoDescricao ?? resultado.seo_descricao,
  });

  if (!salvo.ok) {
    /* O resultado ruim NÃO some: ele fica gravado ao lado do motivo, para a
       pessoa ver o que o executor devolveu antes de pedir de novo. */
    await db.prepare(`
      UPDATE preparacao_tarefas SET estado = ?, erro = ?, resultado_json = ?,
             tentativas = tentativas + 1, atualizado_em = datetime('now') WHERE id = ?`).bind(
      ESTADO_TAREFA.FALHOU, salvo.erro, JSON.stringify(resultado), t.id).run();
    return { ...salvo, tarefaId: t.id, estado: ESTADO_TAREFA.FALHOU };
  }

  await db.prepare(`
    UPDATE preparacao_tarefas SET estado = ?, resultado_json = ?, executor = COALESCE(?, executor),
           concluida_em = datetime('now'), erro = NULL, atualizado_em = datetime('now')
     WHERE id = ?`).bind(
    ESTADO_TAREFA.CONCLUIDA, JSON.stringify(resultado),
    texto(corpo.executor, 120) || null, t.id).run();

  return {
    ok: true, tarefaId: t.id, sku: t.sku,
    estado: ESTADO_TAREFA.CONCLUIDA,
    item: salvo.item,
    /* Dito na resposta porque é a confusão mais fácil de cometer neste
       fluxo, e a mais cara. */
    publicado: false,
    aviso: 'Conteúdo preparado. A peça está aguardando aprovação humana — nada foi publicado.',
  };
}

export async function falharTarefa(db, id, { erro, executor } = {}) {
  const t = await db.prepare(`SELECT id FROM preparacao_tarefas WHERE id = ?`).bind(String(id)).first();
  if (!t) return ERRO(404, 'Tarefa não encontrada.');
  await db.prepare(`
    UPDATE preparacao_tarefas SET estado = ?, erro = ?, executor = COALESCE(?, executor),
           tentativas = tentativas + 1, atualizado_em = datetime('now') WHERE id = ?`).bind(
    ESTADO_TAREFA.FALHOU, texto(erro, 2000) || 'sem motivo informado',
    texto(executor, 120) || null, t.id).run();
  return { ok: true, tarefaId: t.id, estado: ESTADO_TAREFA.FALHOU };
}

/** Cancelar devolve a peça ao estado calculado: sem tarefa aberta e sem
 *  rascunho, ela volta a aparecer como pronta para preparação. */
export async function cancelarTarefa(db, id) {
  const t = await db.prepare(`SELECT id, sku, estado FROM preparacao_tarefas WHERE id = ?`).bind(String(id)).first();
  if (!t) return ERRO(404, 'Tarefa não encontrada.');
  if (t.estado === ESTADO_TAREFA.CONCLUIDA) {
    return ERRO(409, 'Tarefa concluída não se cancela — reabra a publicação da peça.');
  }
  await db.batch([
    db.prepare(`UPDATE preparacao_tarefas SET estado = ?, atualizado_em = datetime('now') WHERE id = ?`)
      .bind(ESTADO_TAREFA.CANCELADA, t.id),
    db.prepare(`DELETE FROM catalogo_publicacoes WHERE sku = ? AND estado = ?`)
      .bind(t.sku, ESTADO_PUBLICACAO.PREPARANDO),
  ]);
  return { ok: true, tarefaId: t.id, estado: ESTADO_TAREFA.CANCELADA };
}
