/** Foto da cliente (avatar), descoberta no Instagram PÚBLICO.
 *
 *  O Worker NUNCA fala com o Instagram para buscar: quem busca é um script
 *  auxiliar fora do Worker (`scripts/instagram-avatares/`), que só entrega
 *  candidatos crus a `registrarCandidatos`. Aqui moram as decisões — pontuar,
 *  guardar, confirmar, baixar a imagem para o R2 — porque são elas que
 *  precisam de teste e de trava. O Instagram é tratado como integração
 *  externa não confiável: nada aqui depende dele estar no ar, e nenhuma rota
 *  de Clientes importa este módulo no caminho crítico (ver `anexarAvatares`,
 *  que engole a falta das tabelas).
 *
 *  Regra de ouro: foto faltando é melhor que foto da pessoa errada. Por isso
 *  NÃO existe autoaceite — toda foto passa por um "É ela". */

import { normalizarNomeCliente } from './vendas-historico-normalizar.js';
import { assinarFoto, conferirAssinaturaFoto } from './assinatura.js';
import { salvarObjeto, lerFoto, apagarFoto } from './fotos-storage.js';

export const AVATAR_MAX_BYTES = 512 * 1024;      // o thumb do Instagram tem ~10 KB
export const SCORE_MINIMO = 0.6;                  // abaixo disso nem vira sugestão
export const MAX_CANDIDATOS = 5;
const MAX_TENTATIVAS = 3;
const HOSTS_IMAGEM = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

export const chaveAvatar = (id) => `clientes/${id}/avatar`;
const agora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/* ------------------------------------------------------------- pontuação */

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function tokens(v) {
  const n = normalizarNomeCliente(v);
  if (!n) return [];
  return n.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t && !PARTICULAS.has(t));
}

function casaToken(a, b) {
  if (a === b) return 1;
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return 0.5;
  return 0;
}

/** Quão provável é que `perfil` seja a cliente `nome`. Só nome e username —
 *  nenhum outro dado do Instagram entra na conta.
 *
 *  Primeiro nome sozinho NUNCA basta: exige primeiro E último nome batendo.
 *  Cliente de nome único nunca pontua (sem evidência possível). */
export function pontuar(nome, perfil) {
  const C = tokens(nome);
  if (C.length < 2) return { score: 0, motivo: 'nome_curto' };
  const N = tokens(perfil.full_name);
  const U = String(perfil.username || '').toLowerCase().replace(/[^a-z]/g, '');
  const primeiro = C[0], ultimo = C[C.length - 1];

  if (!N.length) {
    // sem nome público: só o username, e só se carregar primeiro+último nome
    const colado = U.includes(primeiro + ultimo) || U.includes(ultimo + primeiro);
    return colado ? { score: 0.6, motivo: 'username' } : { score: 0, motivo: 'sem_evidencia' };
  }

  const usados = new Set();
  let exatos = 0, abrev = 0;
  const achou = {};
  for (const c of C) {
    let melhor = -1, nota = 0;
    N.forEach((n, i) => {
      if (usados.has(i)) return;
      const s = casaToken(c, n);
      if (s > nota) { nota = s; melhor = i; }
    });
    if (melhor >= 0) { usados.add(melhor); achou[c] = true; nota === 1 ? exatos++ : abrev++; }
  }
  if (!achou[primeiro] || !achou[ultimo]) return { score: 0.3, motivo: 'so_parte_do_nome' };

  const completo = exatos + abrev === C.length;
  let score, motivo;
  if (completo && abrev === 0 && N.length === C.length) {
    const mesmaOrdem = C.every((c, i) => c === N[i]);
    score = mesmaOrdem ? 0.95 : 0.88; motivo = mesmaOrdem ? 'nome_completo' : 'ordem_diferente';
  } else if (completo && abrev === 0) { score = 0.82; motivo = 'nome_contido'; }
  else if (completo) { score = 0.7; motivo = 'abreviacao'; }
  else { score = 0.65; motivo = 'parcial'; }
  if (U.includes(primeiro + ultimo) || U.includes(ultimo + primeiro)) score = Math.min(0.97, score + 0.02);
  return { score: Math.round(score * 100) / 100, motivo };
}

/* ----------------------------------------------------------- validações */

export function urlImagemValida(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && HOSTS_IMAGEM.test(x.hostname);
  } catch { return false; }
}

/** O tipo real pelos primeiros bytes — o Content-Type da CDN não é prova. */
export function tipoPorBytes(buf) {
  const b = new Uint8Array(buf.slice ? buf.slice(0, 12) : buf);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return null;
}

/** Baixa a miniatura do perfil. Devolve `{ bytes, tipo }` ou `{ erro }` —
 *  nunca lança: expirou, 403, tipo estranho, grande demais, tudo vira
 *  mensagem para a tela. */
export async function baixarImagem(url, buscar = fetch) {
  if (!urlImagemValida(url)) return { erro: 'Endereço da foto não é do Instagram.' };
  let r;
  try {
    r = await buscar(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  } catch { return { erro: 'Não consegui baixar a foto agora.' }; }
  if (!r.ok) return { erro: 'A foto sugerida não está mais disponível. Rode a busca de novo.', expirada: true };
  const bytes = await r.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > AVATAR_MAX_BYTES) return { erro: 'A foto veio vazia ou grande demais.' };
  const tipo = tipoPorBytes(bytes);
  if (!tipo) return { erro: 'A foto não é uma imagem JPEG, PNG ou WebP.' };
  return { bytes, tipo };
}

/* --------------------------------------------------------- fila e busca */

/** Quem ainda precisa de busca. É a FILA e é também o checkpoint: cliente sem
 *  linha em `cliente_avatar_busca` está pendente — inclusive a recém-criada,
 *  sem que o cadastro precise saber que isto existe. */
export async function filaDeBusca(db, { limite = 10, refazer = false } = {}) {
  limite = Math.max(1, Math.min(+limite || 10, 25));
  const { results } = await db.prepare(
    `SELECT c.id, c.nome, c.instagram FROM clientes c
      WHERE NOT EXISTS (SELECT 1 FROM cliente_avatar a WHERE a.cliente_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM cliente_avatar_candidato k WHERE k.cliente_id = c.id AND k.status = 'pendente')
        AND (NOT EXISTS (SELECT 1 FROM cliente_avatar_busca b WHERE b.cliente_id = c.id)
             OR EXISTS (SELECT 1 FROM cliente_avatar_busca b WHERE b.cliente_id = c.id AND (
                  (b.status = 'erro' AND b.tentativas < ? AND b.consultado_em < datetime('now', '-1 hour'))
               OR (? = 1 AND b.status IN ('feita', 'sem_resultado') AND b.consultado_em < datetime('now', '-90 days')))))
      ORDER BY c.id LIMIT ?`,
  ).bind(MAX_TENTATIVAS, refazer ? 1 : 0, limite * 2).all();
  const fila = [];
  for (const c of results) {
    const handle = limparHandle(c.instagram);
    if (tokens(c.nome).length < 2 && !handle) {
      // nome único e sem @ cadastrado: não há evidência possível — anuncia, não busca
      await db.prepare(
        `INSERT INTO cliente_avatar_busca (cliente_id, status, candidatos, erro, consultado_em)
         VALUES (?, 'ignorada', 0, 'nome_curto', ?)
         ON CONFLICT(cliente_id) DO UPDATE SET status='ignorada', erro='nome_curto', consultado_em=excluded.consultado_em`,
      ).bind(c.id, agora()).run();
      continue;
    }
    fila.push({ id: c.id, nome: c.nome, instagram: handle });
    if (fila.length >= limite) break;
  }
  return fila;
}

export function limparHandle(v) {
  const s = String(v || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null;
}

/** Recebe o que o script achou. Pontua, descarta o fraco, guarda os melhores
 *  e atualiza o checkpoint. `resultado`: 'ok' | 'erro'. */
export async function registrarCandidatos(db, { clienteId, resultado, erro, candidatos }) {
  const cli = await db.prepare('SELECT id, nome, instagram FROM clientes WHERE id = ?').bind(clienteId).first();
  if (!cli) return { status: 404, corpo: { erro: 'Cliente não encontrada' } };
  const t = agora();

  if (resultado === 'erro') {
    await db.prepare(
      `INSERT INTO cliente_avatar_busca (cliente_id, status, erro, consultado_em) VALUES (?, 'erro', ?, ?)
       ON CONFLICT(cliente_id) DO UPDATE SET status='erro', erro=excluded.erro,
         tentativas = tentativas + 1, consultado_em = excluded.consultado_em`,
    ).bind(clienteId, String(erro || 'erro').slice(0, 200), t).run();
    return { status: 200, corpo: { ok: true, status: 'erro' } };
  }

  const handle = limparHandle(cli.instagram);
  const avaliados = [];
  for (const p of Array.isArray(candidatos) ? candidatos : []) {
    const username = String(p?.username || '').toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(username) || !urlImagemValida(p.profile_pic_url)) continue;
    let { score, motivo } = pontuar(cli.nome, p);
    // o @ que a própria equipe cadastrou é indício forte — mas segue pedindo confirmação
    if (handle && username === handle) { score = Math.max(score, 0.9); motivo = 'cadastro'; }
    if (score < SCORE_MINIMO) continue;
    avaliados.push({
      userId: p.user_id == null ? null : String(p.user_id), username,
      fullName: String(p.full_name || '').slice(0, 120) || null, pic: p.profile_pic_url, score, motivo,
    });
  }
  avaliados.sort((a, b) => b.score - a.score);
  const guardar = avaliados.slice(0, MAX_CANDIDATOS);
  for (const a of guardar) {
    // refazer a busca atualiza a foto/nome, mas NUNCA reabre quem já foi recusado
    await db.prepare(
      `INSERT INTO cliente_avatar_candidato
         (cliente_id, instagram_user_id, username, full_name, profile_pic_url, score, motivo, consultado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cliente_id, username) DO UPDATE SET
         instagram_user_id = excluded.instagram_user_id, full_name = excluded.full_name,
         profile_pic_url = excluded.profile_pic_url, score = excluded.score,
         motivo = excluded.motivo, consultado_em = excluded.consultado_em`,
    ).bind(clienteId, a.userId, a.username, a.fullName, a.pic, a.score, a.motivo, t).run();
  }
  const status = guardar.length ? 'feita' : 'sem_resultado';
  await db.prepare(
    `INSERT INTO cliente_avatar_busca (cliente_id, status, candidatos, erro, consultado_em) VALUES (?, ?, ?, NULL, ?)
     ON CONFLICT(cliente_id) DO UPDATE SET status = excluded.status, candidatos = excluded.candidatos,
       erro = NULL, consultado_em = excluded.consultado_em`,
  ).bind(clienteId, status, guardar.length, t).run();
  return { status: 200, corpo: { ok: true, status, candidatos: guardar.length } };
}

/* ------------------------------------------------------------ sugestão */

/** A próxima sugestão pendente da cliente (a de maior score), com quantas
 *  outras restam e um aviso quando há risco de homônimo. */
export async function sugestaoDaCliente(db, clienteId, { depoisDe = null } = {}) {
  const { results } = await db.prepare(
    `SELECT id, instagram_user_id, username, full_name, profile_pic_url, score, motivo
       FROM cliente_avatar_candidato WHERE cliente_id = ? AND status = 'pendente'
      ORDER BY score DESC, id`,
  ).bind(clienteId).all();
  if (!results.length) return { sugestao: null, restantes: 0 };
  // "Próxima sugestão" gira pela lista sem recusar ninguém
  let i = 0;
  if (depoisDe != null) i = (results.findIndex((r) => r.id === +depoisDe) + 1) % results.length;
  const s = results[i];
  const cli = await db.prepare('SELECT nome_norm FROM clientes WHERE id = ?').bind(clienteId).first();
  const outras = cli?.nome_norm
    ? (await db.prepare('SELECT COUNT(*) n FROM clientes WHERE nome_norm = ? AND id <> ?').bind(cli.nome_norm, clienteId).first()).n : 0;
  const fortes = results.filter((r) => r.score >= 0.8).length;
  let aviso = null;
  if (outras > 0) aviso = 'Há outra cliente cadastrada com este mesmo nome — confira antes de confirmar.';
  else if (fortes > 1) aviso = 'Mais de um perfil combina com este nome — confira antes de confirmar.';
  return {
    sugestao: { candidatoId: s.id, username: s.username, nome: s.full_name, foto: s.profile_pic_url, score: s.score, motivo: s.motivo },
    restantes: results.length - 1, aviso,
  };
}

/** "É ela" / "Não é ela". Confirmar baixa a foto para o R2 ANTES de gravar
 *  qualquer coisa: se o download ou o R2 falhar, a sugestão continua
 *  pendente e nada muda. */
export async function decidirCandidato(db, env, clienteId, { candidatoId, acao }, buscar = fetch) {
  const cand = await db.prepare(
    `SELECT * FROM cliente_avatar_candidato WHERE id = ? AND cliente_id = ?`,
  ).bind(candidatoId, clienteId).first();
  if (!cand) return { status: 404, corpo: { erro: 'Sugestão não encontrada' } };
  if (cand.status !== 'pendente') return { status: 409, corpo: { erro: 'Esta sugestão já foi decidida' } };
  const t = agora();

  if (acao === 'recusar') {
    await db.prepare(`UPDATE cliente_avatar_candidato SET status='recusado', decidido_em=? WHERE id=?`).bind(t, cand.id).run();
    return { status: 200, corpo: { ok: true, acao } };
  }
  if (acao !== 'confirmar') return { status: 400, corpo: { erro: 'acao deve ser confirmar ou recusar' } };

  const dono = await db.prepare(
    `SELECT a.cliente_id, c.nome FROM cliente_avatar a JOIN clientes c ON c.id = a.cliente_id
      WHERE lower(a.instagram_username) = ? AND a.cliente_id <> ?`,
  ).bind(cand.username, clienteId).first();
  if (dono) return { status: 409, corpo: { erro: `@${cand.username} já é a foto de ${dono.nome}.` } };

  const img = await baixarImagem(cand.profile_pic_url, buscar);
  if (img.erro) return { status: 502, corpo: { erro: img.erro } };
  const salvo = await salvarObjeto(env, chaveAvatar(clienteId), img.bytes, img.tipo);
  if (salvo.erro) return { status: 503, corpo: { erro: salvo.erro } };

  await db.batch([
    db.prepare(
      `INSERT INTO cliente_avatar (cliente_id, instagram_user_id, instagram_username, r2_key, tipo, tamanho, source, confirmed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'instagram', ?, ?)
       ON CONFLICT(cliente_id) DO UPDATE SET instagram_user_id=excluded.instagram_user_id,
         instagram_username=excluded.instagram_username, r2_key=excluded.r2_key, tipo=excluded.tipo,
         tamanho=excluded.tamanho, confirmed_at=excluded.confirmed_at, updated_at=excluded.updated_at`,
    ).bind(clienteId, cand.instagram_user_id, cand.username, salvo.key, salvo.tipo, salvo.tamanho, t, t),
    db.prepare(`UPDATE cliente_avatar_candidato SET status='confirmado', decidido_em=? WHERE id=?`).bind(t, cand.id),
    db.prepare(`UPDATE cliente_avatar_candidato SET status='descartado', decidido_em=? WHERE cliente_id=? AND status='pendente'`).bind(t, clienteId),
  ]);
  return { status: 200, corpo: { ok: true, acao, username: cand.username } };
}

export async function removerAvatar(db, env, clienteId) {
  const a = await db.prepare('SELECT r2_key FROM cliente_avatar WHERE cliente_id = ?').bind(clienteId).first();
  if (!a) return { status: 404, corpo: { erro: 'Esta cliente não tem foto' } };
  await apagarFoto(env, a.r2_key);
  await db.prepare('DELETE FROM cliente_avatar WHERE cliente_id = ?').bind(clienteId).run();
  return { status: 200, corpo: { ok: true } };
}

/* ------------------------------------------------------- leitura / URL */

export async function urlAvatar(env, clienteId, atualizadoEm) {
  const { exp, sig } = await assinarFoto(env, `cliente:${clienteId}`, 'avatar');
  const v = Date.parse(String(atualizadoEm).replace(' ', 'T') + 'Z') || 0;
  return `/api/clientes/${clienteId}/avatar?exp=${exp}&sig=${sig}&v=${v}`;
}

export async function servirAvatar(db, env, clienteId, exp, sig) {
  if (!(await conferirAssinaturaFoto(env, `cliente:${clienteId}`, 'avatar', exp, sig))) return { negado: true };
  const a = await db.prepare('SELECT r2_key FROM cliente_avatar WHERE cliente_id = ?').bind(clienteId).first().catch(() => null);
  return { foto: a ? await lerFoto(env, a.r2_key) : null };
}

/** Decora respostas de Clientes com `avatarUrl` e `avatarSugestao`.
 *  FALHA EM SILÊNCIO: banco sem a migration, R2 fora, qualquer erro — a lista
 *  de clientes sai igual, só sem foto. Clientes nunca quebra por causa disto. */
export async function anexarAvatares(db, env, linhas) {
  try {
    const alvo = linhas.filter((l) => l && l.clienteId != null);
    if (!alvo.length) return;
    const [fotos, sug] = await Promise.all([
      db.prepare('SELECT cliente_id, updated_at FROM cliente_avatar').all(),
      db.prepare(`SELECT DISTINCT cliente_id FROM cliente_avatar_candidato WHERE status = 'pendente'`).all(),
    ]);
    const porId = new Map(fotos.results.map((f) => [f.cliente_id, f.updated_at]));
    const comSug = new Set(sug.results.map((s) => s.cliente_id));
    for (const l of alvo) {
      if (porId.has(l.clienteId)) l.avatarUrl = await urlAvatar(env, l.clienteId, porId.get(l.clienteId));
      if (comSug.has(l.clienteId)) l.avatarSugestao = true;
    }
  } catch { /* sem tabela / sem R2: segue sem foto */ }
}

export async function resumoAvatares(db) {
  const q = async (sql) => (await db.prepare(sql).first()).n;
  return {
    clientes: await q('SELECT COUNT(*) n FROM clientes'),
    comFoto: await q('SELECT COUNT(*) n FROM cliente_avatar'),
    comSugestao: await q(`SELECT COUNT(DISTINCT cliente_id) n FROM cliente_avatar_candidato WHERE status='pendente'`),
    semResultado: await q(`SELECT COUNT(*) n FROM cliente_avatar_busca WHERE status='sem_resultado'`),
    ignoradas: await q(`SELECT COUNT(*) n FROM cliente_avatar_busca WHERE status='ignorada'`),
    comErro: await q(`SELECT COUNT(*) n FROM cliente_avatar_busca WHERE status='erro'`),
    naFila: (await db.prepare(
      `SELECT COUNT(*) n FROM clientes c WHERE NOT EXISTS (SELECT 1 FROM cliente_avatar_busca b WHERE b.cliente_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM cliente_avatar a WHERE a.cliente_id = c.id)`).first()).n,
  };
}
