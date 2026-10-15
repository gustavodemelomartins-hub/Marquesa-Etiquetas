/** A galeria de fotos da peça — a camada em que a Marquesa é dona.
 *
 *  Antes desta fase o sistema guardava DUAS imagens por peça, em colunas de
 *  `produtos`: uma original e uma tratada, as duas com chave determinística
 *  no R2 (`produtos/<sku>/original`). Trocar a foto SOBRESCREVIA o objeto.
 *  Três coisas eram impossíveis, e as três importam:
 *
 *    1. ter mais de uma foto da mesma peça;
 *    2. dizer qual delas é a principal;
 *    3. manter o original depois de gerar a versão preparada.
 *
 *  Aqui a foto é LINHA, e cada linha carrega as suas versões. A chave do R2
 *  passa a incluir o id da foto, então "trocar" é criar outra linha — e a
 *  anterior continua existindo até alguém mandar apagá-la. É isso que faz
 *  `original` sobreviver a `preparada` por construção, e não por disciplina
 *  de quem escreve o próximo UPDATE.
 *
 *  ── O que este arquivo NÃO faz ──────────────────────────────────────────
 *
 *  Não decide de quem é uma foto. O casamento por nome de arquivo mora em
 *  `nome-de-arquivo.js`, e ele para quando não tem certeza. Não publica
 *  nada. E não substitui as três camadas que já existiam: `loja_fotos` segue
 *  sendo o espelho da vitrine, `produtos.foto_url` o endereço anotado, e as
 *  colunas `produtos.foto_*_key` continuam válidas para o painel legado.
 */
import { salvarObjeto, apagarFoto, validarBytes, SEM_R2 } from '../fotos-storage.js';
import { normSku } from '../sku.js';

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });

export const VERSAO = { ORIGINAL: 'original', PREPARADA: 'preparada' };
export const ESTADO_FOTO = {
  ORIGINAL: 'original',
  PREPARADA: 'preparada',
  APROVADA: 'aprovada',
  PUBLICADA: 'publicada',
};

/** A chave do objeto no R2.
 *
 *  O id da foto entra no caminho, e é a diferença inteira: com
 *  `produtos/<sku>/original` a segunda foto da mesma peça escrevia por cima
 *  da primeira, sem erro nenhum e sem ninguém saber. */
export function chaveDaFoto(sku, fotoId, versao) {
  return `produtos/${sku}/${fotoId}/${versao}`;
}

/** A ordem da galeria, dita uma vez só.
 *
 *  Principal primeiro, depois `ordem`, depois a chegada. O último critério
 *  não é decoração: sem ele duas fotos com a mesma `ordem` sairiam em
 *  ordem indefinida, e a mesma consulta devolveria listas diferentes em
 *  execuções diferentes. */
const ORDEM_SQL = 'ORDER BY principal DESC, ordem, criado_em, id';

const linhaPublica = (f) => ({
  id: f.id,
  sku: f.sku,
  ordem: Number(f.ordem ?? 0),
  principal: !!f.principal,
  origem: f.origem,
  arquivo: f.arquivo_nome || null,
  loteId: f.lote_id || null,
  estado: f.estado,
  temOriginal: !!f.original_key,
  temPreparada: !!f.preparada_key,
  urlExterna: f.url_externa || null,
  aprovadaEm: f.aprovada_em || null,
  aprovadaPor: f.aprovada_por || null,
  publicadaEm: f.publicada_em || null,
  imagemIdLoja: f.imagem_id_loja || null,
  erro: f.erro || null,
  criadoEm: f.criado_em,
});

/** A galeria de um código, na ordem determinística. */
export async function galeriaDoProduto(db, sku) {
  const k = normSku(sku);
  try {
    const { results } = await db.prepare(
      `SELECT * FROM produto_fotos WHERE sku = ? ${ORDEM_SQL}`).bind(k).all();
    const fotos = (results ?? []).map(linhaPublica);
    return {
      ok: true,
      sku: k,
      total: fotos.length,
      principal: fotos.find((f) => f.principal) || null,
      fotos,
    };
  } catch {
    /* Banco sem a migration: galeria vazia é a resposta honesta. Não há foto
       própria porque não há onde ela morar ainda. */
    return { ok: true, sku: k, total: 0, principal: null, fotos: [], semTabela: true };
  }
}

/** Impressão digital dos bytes, para o mesmo arquivo não entrar duas vezes.
 *  `crypto.subtle` existe no Worker e no Node moderno; onde não existir, a
 *  ausência de hash desliga só a detecção de duplicata — nunca o upload. */
async function hashDosBytes(bytes) {
  try {
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

const novoId = () => (globalThis.crypto?.randomUUID?.() || `f${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

/** Acrescenta uma foto à galeria.
 *
 *  A LINHA NASCE ANTES DO UPLOAD, e essa ordem é a correção de D5: o
 *  caminho antigo gravava no R2 dentro do laço e no D1 só no fim, então uma
 *  falha no meio deixava bytes no bucket sem referência nenhuma — invisíveis
 *  para sempre, porque reencontrá-los exigiria listar o bucket inteiro.
 *  Uma linha apontando para um objeto que não subiu é o erro oposto, e é o
 *  erro bom: ela aparece na tela, diz o que houve e pode ser apagada.
 */
export async function adicionarFoto(db, env, sku, bytes, tipo, opcoes = {}) {
  const k = normSku(sku);
  const produto = await db.prepare(`SELECT sku FROM produtos WHERE sku = ?`).bind(k).first();
  if (!produto) return ERRO(404, `Código ${sku} não está no catálogo.`);

  const invalido = validarBytes(bytes, tipo);
  if (invalido) return ERRO(400, invalido);
  if (!env?.FOTOS) return ERRO(503, SEM_R2, { bloqueio: 'sem_r2' });

  const hash = await hashDosBytes(bytes);
  if (hash) {
    const igual = await db.prepare(
      `SELECT id FROM produto_fotos WHERE sku = ? AND conteudo_hash = ? LIMIT 1`).bind(k, hash).first();
    if (igual) {
      return ERRO(409, 'Esta mesma imagem já está na galeria desta peça.', {
        duplicado: true, fotoId: igual.id,
      });
    }
  }

  const id = novoId();
  const chave = chaveDaFoto(k, id, VERSAO.ORIGINAL);
  const { n } = await db.prepare(
    `SELECT COUNT(*) n FROM produto_fotos WHERE sku = ?`).bind(k).first();
  /* A primeira foto de uma peça é a principal — não por preferência, mas
     porque uma galeria com uma imagem e nenhuma principal é um estado que
     não quer dizer nada. A partir da segunda, quem decide é gente. */
  const principal = opcoes.principal === true || n === 0 ? 1 : 0;

  await db.prepare(`
    INSERT INTO produto_fotos
      (id, sku, ordem, principal, origem, arquivo_nome, lote_id, conteudo_hash,
       original_key, original_tipo, original_tam, original_em, estado, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,datetime('now'))`).bind(
    id, k, Number(opcoes.ordem ?? n), principal, opcoes.origem || 'upload',
    opcoes.arquivoNome || null, opcoes.loteId || null, hash,
    chave, tipo, bytes.byteLength, ESTADO_FOTO.ORIGINAL,
  ).run();

  try {
    await salvarObjeto(env, chave, bytes, tipo);
  } catch (e) {
    const motivo = String((e && e.message) || e);
    await db.prepare(
      `UPDATE produto_fotos SET erro = ?, original_key = NULL WHERE id = ?`).bind(motivo, id).run();
    return ERRO(502, `A imagem não foi gravada: ${motivo}`, { fotoId: id });
  }

  return { ok: true, fotoId: id, sku: k, principal: !!principal, chave };
}

/** Registra a versão PREPARADA sem encostar no original.
 *
 *  É o ponto do desenho que garante que preparar nunca perde a foto que a
 *  Sthefany tirou: são duas chaves diferentes no R2, e este UPDATE menciona
 *  só uma delas. */
export async function registrarPreparada(db, env, fotoId, bytes, tipo) {
  const f = await db.prepare(
    `SELECT id, sku, original_key FROM produto_fotos WHERE id = ?`).bind(String(fotoId)).first();
  if (!f) return ERRO(404, 'Foto não encontrada.');
  if (!f.original_key) return ERRO(409, 'Esta foto não tem original gravado para preparar.');

  const invalido = validarBytes(bytes, tipo);
  if (invalido) return ERRO(400, invalido);
  if (!env?.FOTOS) return ERRO(503, SEM_R2, { bloqueio: 'sem_r2' });

  const chave = chaveDaFoto(f.sku, f.id, VERSAO.PREPARADA);
  await salvarObjeto(env, chave, bytes, tipo);
  await db.prepare(`
    UPDATE produto_fotos
       SET preparada_key = ?, preparada_tipo = ?, preparada_tam = ?,
           preparada_em = datetime('now'), estado = ?, erro = NULL
     WHERE id = ?`).bind(chave, tipo, bytes.byteLength, ESTADO_FOTO.PREPARADA, f.id).run();
  return { ok: true, fotoId: f.id, originalPreservado: f.original_key };
}

/** A aprovação humana da IMAGEM. Não publica nada: aprovar é dizer "esta
 *  serve", e quem leva à vitrine é o publicador, depois. */
export async function aprovarFoto(db, fotoId, { aprovadaPor = 'operador' } = {}) {
  const f = await db.prepare(
    `SELECT id, estado FROM produto_fotos WHERE id = ?`).bind(String(fotoId)).first();
  if (!f) return ERRO(404, 'Foto não encontrada.');
  if (f.estado === ESTADO_FOTO.PUBLICADA) {
    return ERRO(409, 'Esta foto já está publicada.');
  }
  await db.prepare(`
    UPDATE produto_fotos SET estado = ?, aprovada_em = datetime('now'), aprovada_por = ?
     WHERE id = ?`).bind(ESTADO_FOTO.APROVADA, String(aprovadaPor).slice(0, 120), f.id).run();
  return { ok: true, fotoId: f.id, estado: ESTADO_FOTO.APROVADA };
}

/** Troca a principal.
 *
 *  Zerar a antiga vem ANTES de marcar a nova, e não é preferência: o índice
 *  único parcial `idx_produto_fotos_principal` recusaria duas principais no
 *  mesmo SKU, e é ele — não este código — que garante a regra. Aqui só se
 *  respeita a ordem que ele impõe. */
export async function definirPrincipal(db, sku, fotoId) {
  const k = normSku(sku);
  const f = await db.prepare(
    `SELECT id FROM produto_fotos WHERE id = ? AND sku = ?`).bind(String(fotoId), k).first();
  if (!f) return ERRO(404, 'Esta foto não é desta peça.');
  await db.batch([
    db.prepare(`UPDATE produto_fotos SET principal = 0 WHERE sku = ? AND principal = 1`).bind(k),
    db.prepare(`UPDATE produto_fotos SET principal = 1 WHERE id = ?`).bind(f.id),
  ]);
  return { ok: true, sku: k, principal: f.id };
}

/** A ordem da galeria, definida por gente.
 *
 *  Recebe os ids na ordem desejada. Quem não vier na lista vai para o fim,
 *  preservando a ordem relativa que já tinha — uma reordenação parcial não
 *  deveria embaralhar o resto. */
export async function reordenarGaleria(db, sku, ids) {
  const k = normSku(sku);
  const { results } = await db.prepare(
    `SELECT id FROM produto_fotos WHERE sku = ? ${ORDEM_SQL}`).bind(k).all();
  const atuais = (results ?? []).map((r) => r.id);
  if (!atuais.length) return ERRO(404, 'Esta peça não tem galeria própria.');

  const pedida = (Array.isArray(ids) ? ids : []).map(String).filter((id) => atuais.includes(id));
  const desconhecidos = (Array.isArray(ids) ? ids : []).map(String).filter((id) => !atuais.includes(id));
  const final = [...pedida, ...atuais.filter((id) => !pedida.includes(id))];

  await db.batch(final.map((id, i) =>
    db.prepare(`UPDATE produto_fotos SET ordem = ? WHERE id = ?`).bind(i, id)));

  return {
    ok: true, sku: k, ordem: final,
    /* §22: o que o sistema decidiu não fazer é anunciado. Um id que não é
       desta peça não derruba a reordenação — ele é ignorado, e dito. */
    ignorados: desconhecidos,
  };
}

/** Apaga uma foto: os bytes primeiro, a linha depois.
 *
 *  A ordem inversa deixaria objeto órfão no bucket. E a principal não fica
 *  vaga: se a apagada era a principal, a próxima da ordem assume, porque
 *  uma galeria com fotos e nenhuma principal não quer dizer nada. */
export async function removerFotoDaGaleria(db, env, fotoId) {
  const f = await db.prepare(
    `SELECT * FROM produto_fotos WHERE id = ?`).bind(String(fotoId)).first();
  if (!f) return ERRO(404, 'Foto não encontrada.');

  for (const chave of [f.original_key, f.preparada_key]) {
    if (chave) await apagarFoto(env, chave);
  }
  await db.prepare(`DELETE FROM produto_fotos WHERE id = ?`).bind(f.id).run();

  let novaPrincipal = null;
  if (f.principal) {
    const proxima = await db.prepare(
      `SELECT id FROM produto_fotos WHERE sku = ? ${ORDEM_SQL} LIMIT 1`).bind(f.sku).first();
    if (proxima) {
      await db.prepare(`UPDATE produto_fotos SET principal = 1 WHERE id = ?`).bind(proxima.id).run();
      novaPrincipal = proxima.id;
    }
  }
  return { ok: true, removida: f.id, sku: f.sku, novaPrincipal };
}

/** Quem tem foto própria, em uma consulta — para o juiz de completude não
 *  perguntar peça por peça. Devolve dois conjuntos, porque "tem imagem" e
 *  "tem imagem preparada" são perguntas diferentes. */
export async function skusComFotoPropria(db) {
  try {
    const { results } = await db.prepare(`
      SELECT sku,
             SUM(CASE WHEN original_key IS NOT NULL OR url_externa IS NOT NULL THEN 1 ELSE 0 END) AS tem,
             SUM(CASE WHEN preparada_key IS NOT NULL THEN 1 ELSE 0 END) AS preparadas,
             SUM(CASE WHEN estado = 'aprovada' OR estado = 'publicada' THEN 1 ELSE 0 END) AS aprovadas
        FROM produto_fotos GROUP BY sku`).all();
    const com = new Set(), preparadas = new Set(), aprovadas = new Set();
    for (const r of results ?? []) {
      if (r.tem > 0) com.add(r.sku);
      if (r.preparadas > 0) preparadas.add(r.sku);
      if (r.aprovadas > 0) aprovadas.add(r.sku);
    }
    return { com, preparadas, aprovadas };
  } catch {
    return { com: new Set(), preparadas: new Set(), aprovadas: new Set() };
  }
}
