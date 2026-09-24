/** Muitas fotos de uma vez — analisadas antes de gravar qualquer byte.
 *
 *  O lote existe como TABELA, e não como resposta de uma chamada, por uma
 *  razão só: ele mostra o casamento e espera. A pessoa vê que 41 arquivos
 *  casaram com 23 códigos, que três não têm dono e que um nome está
 *  ambíguo, e só então autoriza. Um "importar fotos" que decide sozinho é
 *  exatamente o que faz a vitrine anunciar uma peça mostrando outra.
 *
 *  ── Por que o upload é um arquivo por requisição ────────────────────────
 *
 *  Porque a exigência é que UM arquivo ruim não derrube o lote inteiro. Com
 *  multipart ou um JSON gigante, um byte corrompido no meio derruba o parse
 *  e leva junto os 300 arquivos bons. Um arquivo por requisição faz a falha
 *  ser do tamanho do problema: ela vira uma linha com o motivo em
 *  `fotos_lote_itens`, e o resto do lote segue.
 *
 *  Fluxo:
 *
 *      POST  /api/fotos/lotes                      só os NOMES → o casamento
 *      PUT   /api/fotos/lotes/:id/arquivo/:nome    os bytes de UM arquivo
 *      POST  /api/fotos/lotes/:id/confirmar        fecha e resume
 */
import { casarLote, SITUACAO } from './nome-de-arquivo.js';
import { adicionarFoto } from './galeria.js';
import { normSku } from '../sku.js';

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });
const novoId = () => (globalThis.crypto?.randomUUID?.() || `l${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

/** Os códigos do catálogo, já na forma canônica, lidos UMA vez.
 *  Um lote de 300 fotos não pode fazer 300 consultas. */
async function catalogoDeSkus(db) {
  const { results } = await db.prepare(`SELECT sku FROM produtos WHERE status <> 'arquivado'`).all();
  return new Set((results ?? []).map((p) => normSku(p.sku)));
}

/** Analisa e GUARDA o casamento — sem gravar byte nenhum.
 *
 *  Guardar é o que permite o upload vir depois, um arquivo por vez, sem o
 *  servidor precisar reconstruir a decisão a cada requisição — e sem a
 *  decisão poder mudar no meio do caminho porque alguém cadastrou um
 *  produto enquanto o lote subia. */
export async function analisarLote(db, { arquivos, criadoPor } = {}) {
  const nomes = Array.isArray(arquivos) ? arquivos.map((a) => (typeof a === 'string' ? a : a?.nome)) : [];
  if (!nomes.length) return ERRO(400, 'Nenhum arquivo no lote.');
  if (nomes.length > 1000) return ERRO(400, 'Lote grande demais (máximo 1000 arquivos).');

  const casamento = casarLote(nomes, await catalogoDeSkus(db));
  const id = novoId();
  const r = casamento.resumo;
  const pendentes = r.naoEncontrados + r.ambiguos;
  const erros = r.invalidos + r.duplicados;

  const stmts = [db.prepare(`
    INSERT INTO fotos_lotes (id, estado, criado_por, arquivos, vinculados, pendentes, erros, resumo_json)
    VALUES (?, 'analisado', ?, ?, ?, ?, ?, ?)`).bind(
    id, criadoPor || null, r.arquivos, r.vinculados, pendentes, erros,
    JSON.stringify({ ...r, grupos: casamento.grupos }),
  )];
  /* Uma LINHA POR NOME DE ARQUIVO. O mesmo nome aparecendo duas vezes na
     seleção é o mesmo arquivo — a chave primária de `fotos_lote_itens` é
     `(lote_id, arquivo)` e gravar a repetição derrubaria o lote inteiro por
     causa de um clique duplo. A repetição continua CONTADA e dita no
     resumo; ela só não vira uma segunda linha. */
  const gravados = new Set();
  for (const i of casamento.itens) {
    if (gravados.has(i.arquivo)) continue;
    gravados.add(i.arquivo);
    stmts.push(db.prepare(`
      INSERT INTO fotos_lote_itens (lote_id, arquivo, sku_extraido, sku_casado, situacao, detalhe, ordem_no_sku)
      VALUES (?,?,?,?,?,?,?)`).bind(
      id, i.arquivo, i.candidatos?.[0] || null, i.sku, i.situacao, i.detalhe, i.ordemNoSku,
    ));
  }
  await db.batch(stmts);

  return {
    ok: true, loteId: id, estado: 'analisado',
    /* Nada foi gravado e a resposta diz isso na cara — o contrário de um
       "importar" que já importou quando você terminou de ler. */
    gravouBytes: false,
    resumo: { ...r, pendentes, erros },
    grupos: casamento.grupos,
    itens: casamento.itens.map((i) => ({
      arquivo: i.arquivo, sku: i.sku, situacao: i.situacao,
      ordemNoSku: i.ordemNoSku, detalhe: i.detalhe,
    })),
  };
}

export async function lerLote(db, loteId) {
  const lote = await db.prepare(`SELECT * FROM fotos_lotes WHERE id = ?`).bind(String(loteId)).first();
  if (!lote) return ERRO(404, 'Lote não encontrado.');
  const { results } = await db.prepare(
    `SELECT * FROM fotos_lote_itens WHERE lote_id = ? ORDER BY sku_casado, ordem_no_sku, arquivo`
  ).bind(lote.id).all();
  return {
    ok: true,
    loteId: lote.id, estado: lote.estado, criadoEm: lote.criado_em,
    confirmadoEm: lote.confirmado_em,
    resumo: JSON.parse(lote.resumo_json || '{}'),
    itens: (results ?? []).map((i) => ({
      arquivo: i.arquivo, sku: i.sku_casado, situacao: i.situacao,
      ordemNoSku: i.ordem_no_sku, detalhe: i.detalhe, fotoId: i.foto_id,
    })),
  };
}

/** Grava os bytes de UM arquivo do lote.
 *
 *  Só aceita arquivo que a análise já tinha vinculado. Um nome que caiu em
 *  `sku_nao_encontrado` não vira foto por insistência: ele precisa ser
 *  renomeado e reanalisado, ou resolvido à mão. */
export async function enviarArquivoDoLote(db, env, loteId, arquivo, bytes, tipo) {
  const lote = await db.prepare(`SELECT * FROM fotos_lotes WHERE id = ?`).bind(String(loteId)).first();
  if (!lote) return ERRO(404, 'Lote não encontrado.');
  if (lote.estado !== 'analisado') {
    return ERRO(409, `Este lote está ${lote.estado} — não aceita mais arquivo.`);
  }

  const item = await db.prepare(
    `SELECT * FROM fotos_lote_itens WHERE lote_id = ? AND arquivo = ?`
  ).bind(lote.id, String(arquivo)).first();
  if (!item) return ERRO(404, `"${arquivo}" não faz parte deste lote.`);
  if (item.foto_id) return ERRO(409, 'Este arquivo já foi enviado.', { fotoId: item.foto_id });
  if (item.situacao !== SITUACAO.VINCULADO && item.situacao !== SITUACAO.MULTIPLAS) {
    return ERRO(409, `"${arquivo}" não casou com nenhuma peça (${item.situacao}).`, {
      situacao: item.situacao, detalhe: item.detalhe,
    });
  }

  const r = await adicionarFoto(db, env, item.sku_casado, bytes, tipo, {
    origem: 'lote', arquivoNome: item.arquivo, loteId: lote.id,
    ordem: Number(item.ordem_no_sku ?? 0),
  });

  if (!r.ok) {
    /* A falha vira LINHA, não exceção: o lote continua de pé e a tela
       mostra qual arquivo não entrou e por quê. Duplicata tem nome próprio
       porque não é falha de upload — é a mesma imagem chegando de novo. */
    const situacao = r.duplicado ? SITUACAO.DUPLICADO : SITUACAO.ERRO_UPLOAD;
    await db.prepare(
      `UPDATE fotos_lote_itens SET situacao = ?, detalhe = ? WHERE lote_id = ? AND arquivo = ?`
    ).bind(situacao, r.erro, lote.id, item.arquivo).run();
    return { ...r, loteId: lote.id, arquivo: item.arquivo, situacao };
  }

  await db.prepare(
    `UPDATE fotos_lote_itens SET foto_id = ? WHERE lote_id = ? AND arquivo = ?`
  ).bind(r.fotoId, lote.id, item.arquivo).run();
  return { ok: true, loteId: lote.id, arquivo: item.arquivo, sku: item.sku_casado, fotoId: r.fotoId };
}

/** Fecha o lote e diz o que aconteceu de verdade.
 *
 *  O resumo é RECONTADO a partir das linhas, não copiado da análise: entre
 *  analisar e confirmar, arquivos falharam, duplicaram ou nem subiram, e
 *  repetir o número otimista da análise seria mentir no fim. */
export async function confirmarLote(db, loteId) {
  const lote = await db.prepare(`SELECT * FROM fotos_lotes WHERE id = ?`).bind(String(loteId)).first();
  if (!lote) return ERRO(404, 'Lote não encontrado.');
  if (lote.estado === 'confirmado') return { ok: true, loteId: lote.id, jaEstava: true };

  const { results } = await db.prepare(
    `SELECT situacao, foto_id, sku_casado FROM fotos_lote_itens WHERE lote_id = ?`).bind(lote.id).all();
  const itens = results ?? [];
  const gravadas = itens.filter((i) => i.foto_id).length;
  const naoGravadas = itens.length - gravadas;
  const porSituacao = {};
  for (const i of itens) porSituacao[i.situacao] = (porSituacao[i.situacao] || 0) + 1;
  const codigos = new Set(itens.filter((i) => i.foto_id).map((i) => i.sku_casado)).size;

  await db.prepare(`
    UPDATE fotos_lotes SET estado = 'confirmado', confirmado_em = datetime('now'),
           vinculados = ?, erros = ?, resumo_json = ?
     WHERE id = ?`).bind(
    gravadas, naoGravadas, JSON.stringify({ gravadas, naoGravadas, codigos, porSituacao }), lote.id,
  ).run();

  return {
    ok: true, loteId: lote.id, estado: 'confirmado',
    resumo: { arquivos: itens.length, gravadas, naoGravadas, codigos, porSituacao },
    /* §22: o que o lote decidiu não fazer, com o motivo, em vez de um
       número só que esconde as decisões. */
    naoEntraram: itens.filter((i) => !i.foto_id).length,
  };
}

export async function cancelarLote(db, loteId) {
  const lote = await db.prepare(`SELECT id, estado FROM fotos_lotes WHERE id = ?`).bind(String(loteId)).first();
  if (!lote) return ERRO(404, 'Lote não encontrado.');
  if (lote.estado === 'confirmado') {
    return ERRO(409, 'Lote já confirmado não se cancela — as fotos já estão na galeria. '
      + 'Remova as fotos uma a uma se for o caso.');
  }
  await db.prepare(`UPDATE fotos_lotes SET estado = 'cancelado' WHERE id = ?`).bind(lote.id).run();
  return { ok: true, loteId: lote.id, estado: 'cancelado' };
}
