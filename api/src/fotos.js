/** Foto da peça: importar da loja uma vez, e daqui para frente tratar aqui.
 *
 *  A direção importa. Hoje a loja tem as fotos e o sistema não tem nenhuma,
 *  então a primeira carga vem de lá. Depois disso o sentido se inverte: a
 *  peça é cadastrada aqui, a foto é adicionada aqui, e a loja é abastecida
 *  a partir daqui. Este arquivo serve aos dois momentos.
 *
 *  Duas coisas que ele não faz, de propósito:
 *
 *   - não adivinha de quem é a foto. Código que não bate exatamente vai
 *     para `fotos_orfas`. Uma foto no produto errado é pior que nenhuma:
 *     a loja passa a anunciar uma peça mostrando outra, e ninguém percebe
 *     olhando o painel.
 *   - não publica nada sozinha. Ela prepara e marca o estado; quem manda
 *     para a loja é a sincronização, que tem confirmação própria.
 */

import { Nuvemshop } from './nuvemshop.js';

/* Os cinco estados da foto, que é o que a tela mostra na peça. */
export const FOTO = {
  SEM: 'sem_foto',
  ORIGINAL: 'original',            // tem a foto crua, falta o fundo branco
  PENDENTE: 'fundo_pendente',      // mandada para tratamento, ainda não voltou
  PRONTA: 'fundo_gerado',          // tem a versão com fundo branco
  ERRO: 'erro',
};

const texto = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  return String(v.pt || v.pt_BR || Object.values(v)[0] || '').trim();
};
const normSku = (v) => String(v == null ? '' : v).trim().toUpperCase();

/* ==================================================================== */
/* 1. Carga inicial: puxar as fotos que já estão na Nuvemshop            */
/* ==================================================================== */

/** Lê a loja, casa imagem com produto pelo SKU e grava o vínculo.
 *
 *  `seco: true` faz a mesma leitura e a mesma conta sem gravar nada — é o
 *  que a tela usa para dizer "vou trazer 412 fotos e 37 ficam sem dono"
 *  antes de qualquer escrita.
 *
 *  Só preenche quem está sem foto. Foto que alguém já colocou aqui é a
 *  mais nova das duas, e sobrescrever seria desfazer trabalho de gente.
 */
export async function importarFotosDaLoja(db, env, { seco = false, refazer = false } = {}) {
  const loja = new Nuvemshop(env);
  if (!loja.configurada()) {
    return { ok: false, erro: 'A loja não está conectada. Falta o token da Nuvemshop.' };
  }

  const nossos = new Map((await db.prepare(
    `SELECT sku, desc, foto_original, foto_tratada, foto_status FROM produtos`
  ).all()).results.map(p => [p.sku, p]));

  const produtosLoja = await loja.produtos();

  const casadas = [], orfas = [], jaTinham = [];
  const vistos = new Set();

  for (const p of produtosLoja) {
    const imagens = (p.images || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    if (!imagens.length) continue;
    const porId = new Map(imagens.map(i => [String(i.id), i.src]));

    for (const v of p.variants || []) {
      const sku = normSku(v.sku);
      if (!sku) continue;
      /* A variação pode ter imagem própria (o anel dourado e o prateado);
         quando não tem, vale a primeira do produto. */
      const src = (v.image_id && porId.get(String(v.image_id))) || imagens[0].src;
      if (!src) continue;

      const nosso = nossos.get(sku);
      if (!nosso) {
        if (!vistos.has(src)) {
          vistos.add(src);
          orfas.push({ url: src, skuLoja: sku, nomeLoja: texto(p.name), produtoId: String(p.id) });
        }
        continue;
      }
      if (nosso.foto_original && !refazer) { jaTinham.push({ sku, desc: nosso.desc }); continue; }
      casadas.push({ sku, desc: nosso.desc, url: src });
    }
  }

  if (seco) {
    return {
      ok: true, seco: true,
      resumo: { casadas: casadas.length, orfas: orfas.length, jaTinham: jaTinham.length },
      casadas: casadas.slice(0, 200), orfas: orfas.slice(0, 200),
    };
  }

  const stmts = [];
  for (const c of casadas) {
    stmts.push(db.prepare(
      `UPDATE produtos SET foto_original = ?, foto_origem = 'nuvemshop',
              foto_status = CASE WHEN foto_tratada IS NOT NULL THEN ? ELSE ? END,
              foto_erro = NULL, foto_em = datetime('now')
        WHERE sku = ?`
    ).bind(c.url, FOTO.PRONTA, FOTO.ORIGINAL, c.sku));
  }
  for (const o of orfas) {
    stmts.push(db.prepare(
      `INSERT INTO fotos_orfas (url, sku_loja, nome_loja, produto_id) VALUES (?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET sku_loja=excluded.sku_loja, nome_loja=excluded.nome_loja`
    ).bind(o.url, o.skuLoja, o.nomeLoja, o.produtoId));
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));

  return {
    ok: true,
    resumo: { casadas: casadas.length, orfas: orfas.length, jaTinham: jaTinham.length },
    casadas: casadas.slice(0, 200), orfas: orfas.slice(0, 200),
  };
}

export async function listarFotosOrfas(db) {
  const r = await db.prepare(
    `SELECT * FROM fotos_orfas ORDER BY visto_em DESC, id DESC LIMIT 500`).all();
  return {
    fotos: r.results.map(f => ({
      id: f.id, url: f.url, skuLoja: f.sku_loja, nomeLoja: f.nome_loja,
      produtoId: f.produto_id, vistoEm: f.visto_em,
    })),
  };
}

/** Resolve uma foto órfã à mão: a pessoa diz de quem ela é. É a única
 *  forma de sair da fila — o sistema nunca decide isso sozinho. */
export async function adotarFotoOrfa(db, { id, sku }) {
  const foto = await db.prepare(`SELECT * FROM fotos_orfas WHERE id = ?`).bind(+id).first();
  if (!foto) return { erro: 'Foto não encontrada' };
  const p = await db.prepare(`SELECT sku FROM produtos WHERE sku = ?`).bind(normSku(sku)).first();
  if (!p) return { erro: `O código ${normSku(sku)} não existe no catálogo` };
  await db.batch([
    db.prepare(`UPDATE produtos SET foto_original = ?, foto_origem = 'nuvemshop',
                       foto_status = ?, foto_erro = NULL, foto_em = datetime('now') WHERE sku = ?`)
      .bind(foto.url, FOTO.ORIGINAL, p.sku),
    db.prepare(`DELETE FROM fotos_orfas WHERE id = ?`).bind(+id),
  ]);
  return { ok: true, sku: p.sku };
}

/* ==================================================================== */
/* 2. Foto adicionada aqui                                              */
/* ==================================================================== */

export async function definirFoto(db, sku, { original, tratada, limpar } = {}) {
  const p = await db.prepare(`SELECT sku, foto_original, foto_tratada FROM produtos WHERE sku = ?`)
    .bind(normSku(sku)).first();
  if (!p) return { erro: 'Produto não encontrado' };

  if (limpar) {
    await db.prepare(
      `UPDATE produtos SET foto_original=NULL, foto_tratada=NULL, foto_erro=NULL,
              foto_status=?, foto_em=datetime('now') WHERE sku = ?`).bind(FOTO.SEM, p.sku).run();
    return { ok: true, status: FOTO.SEM };
  }

  const nova = original === undefined ? p.foto_original : (original || null);
  const trat = tratada === undefined ? p.foto_tratada : (tratada || null);
  /* Trocar a foto original invalida a tratada: o fundo branco é daquela
     foto, não desta. Deixar a antiga ali mandaria a peça errada para a
     loja e ninguém notaria. */
  const trocouOriginal = original !== undefined && original !== p.foto_original;
  const tratFinal = trocouOriginal && tratada === undefined ? null : trat;

  const status = tratFinal ? FOTO.PRONTA : (nova ? FOTO.ORIGINAL : FOTO.SEM);
  await db.prepare(
    `UPDATE produtos SET foto_original=?, foto_tratada=?, foto_status=?, foto_erro=NULL,
            foto_origem=COALESCE(foto_origem,'upload'), foto_em=datetime('now') WHERE sku = ?`
  ).bind(nova, tratFinal, status, p.sku).run();
  return { ok: true, status };
}

/* ==================================================================== */
/* 3. Fundo branco                                                      */
/* ==================================================================== */

/** Manda a foto original para tratamento e guarda o resultado.
 *
 *  O tratamento em si é um serviço de fora (o ChatGPT gerando a versão com
 *  fundo branco). Ele é chamado por HTTP e configurado por variável de
 *  ambiente — `FOTO_FUNDO_URL`, e `FOTO_FUNDO_TOKEN` se ele pedir chave.
 *
 *  Enquanto esse endereço não existir, a peça é marcada como
 *  `fundo_pendente` e a resposta diz exatamente o que falta. Ela NÃO é
 *  marcada como pronta, e nenhuma imagem é inventada: uma foto que o
 *  sistema diz ter e não tem é pior que uma foto faltando, porque a
 *  publicação em lote confiaria nela.
 */
export async function gerarFundoBranco(db, env, sku) {
  const p = await db.prepare(
    `SELECT sku, desc, foto_original, foto_tratada FROM produtos WHERE sku = ?`
  ).bind(normSku(sku)).first();
  if (!p) return { erro: 'Produto não encontrado' };
  if (!p.foto_original) return { erro: 'Esta peça ainda não tem foto original para tratar' };

  const endereco = String(env.FOTO_FUNDO_URL || '').trim();
  if (!endereco) {
    await db.prepare(
      `UPDATE produtos SET foto_status=?, foto_erro=NULL, foto_em=datetime('now') WHERE sku=?`
    ).bind(FOTO.PENDENTE, p.sku).run();
    return {
      ok: true, status: FOTO.PENDENTE, pendente: true,
      detalhe: 'A peça entrou na fila de fundo branco. O serviço de tratamento ainda não '
             + 'está configurado no servidor (falta FOTO_FUNDO_URL) — nada foi gerado.',
    };
  }

  try {
    const resp = await fetch(endereco, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.FOTO_FUNDO_TOKEN ? { Authorization: `Bearer ${env.FOTO_FUNDO_TOKEN}` } : {}),
      },
      body: JSON.stringify({ sku: p.sku, descricao: p.desc, imagem: p.foto_original, fundo: 'branco' }),
    });
    if (!resp.ok) throw new Error(`o serviço respondeu ${resp.status}`);
    const corpo = await resp.json();
    const url = String(corpo.url || corpo.imagem || '').trim();
    if (!url) throw new Error('o serviço não devolveu o endereço da imagem tratada');

    await db.prepare(
      `UPDATE produtos SET foto_tratada=?, foto_status=?, foto_erro=NULL, foto_em=datetime('now') WHERE sku=?`
    ).bind(url, FOTO.PRONTA, p.sku).run();
    return { ok: true, status: FOTO.PRONTA, url };
  } catch (e) {
    const msg = String(e && e.message || e);
    await db.prepare(
      `UPDATE produtos SET foto_status=?, foto_erro=?, foto_em=datetime('now') WHERE sku=?`
    ).bind(FOTO.ERRO, msg, p.sku).run();
    return { ok: false, status: FOTO.ERRO, erro: msg };
  }
}

/* ==================================================================== */
/* 4. O que o agente de catálogo enxerga                                */
/* ==================================================================== */

/** "O que está pronto para subir, e o que falta em cada um que não está."
 *
 *  Esta é a leitura que o agente/CEO da Marquesa usa para trabalhar, e é
 *  de propósito uma LEITURA: ele pode preparar tudo, mas quem publica é a
 *  sincronização, depois de alguém confirmar na tela.
 */
export async function pendenciasDePublicacao(db) {
  const r = await db.prepare(`
    SELECT p.sku, p.desc, p.cat, p.preco, p.qtd, p.url_loja,
           p.foto_original, p.foto_tratada, p.foto_status,
           p.qtd - COALESCE((
             SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
               JOIN maletas m ON m.id = mi.maleta_id
              WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')
           ), 0) AS casa
      FROM produtos p
     WHERE p.status = 'ativo'`).all();

  const prontos = [], semFoto = [], semFundoBranco = [], semDescricao = [], semCategoria = [], semPreco = [];

  for (const p of r.results) {
    if (p.url_loja) continue;             // já está na loja: não é assunto daqui
    if ((p.casa || 0) <= 0) continue;     // sem peça em casa não há o que anunciar

    const item = {
      sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco, casa: p.casa,
      fotoStatus: p.foto_status || FOTO.SEM,
    };
    const falta = [];
    if (!p.foto_original) { falta.push('foto'); semFoto.push(item); }
    else if (!p.foto_tratada) { falta.push('fundo_branco'); semFundoBranco.push(item); }
    /* "Descrição" aqui é a descrição comercial. A da etiqueta é curta por
       natureza — quando ela é só o próprio código, não há texto nenhum. */
    if (!p.desc || p.desc.trim() === p.sku) { falta.push('descricao'); semDescricao.push(item); }
    if (!p.cat || p.cat === 'Outros') { falta.push('categoria'); semCategoria.push(item); }
    if (p.preco == null) { falta.push('preco'); semPreco.push(item); }

    if (!falta.length) prontos.push(item);
  }

  const valor = (l) => l.reduce((s, p) => s + (p.casa * (p.preco || 0)), 0);
  const ordena = (l) => l.slice().sort((a, b) => (b.casa * (b.preco || 0)) - (a.casa * (a.preco || 0)));

  return {
    resumo: {
      prontos: prontos.length,
      pecasProntas: prontos.reduce((s, p) => s + p.casa, 0),
      valorPronto: valor(prontos),
      semFoto: semFoto.length,
      semFundoBranco: semFundoBranco.length,
      semDescricao: semDescricao.length,
      semCategoria: semCategoria.length,
      semPreco: semPreco.length,
      valorParado: valor([...semFoto, ...semFundoBranco, ...semDescricao, ...semCategoria, ...semPreco]),
    },
    prontos: ordena(prontos).slice(0, 500),
    semFoto: ordena(semFoto).slice(0, 500),
    semFundoBranco: ordena(semFundoBranco).slice(0, 500),
    semDescricao: ordena(semDescricao).slice(0, 500),
    semCategoria: ordena(semCategoria).slice(0, 500),
    semPreco: ordena(semPreco).slice(0, 500),
  };
}
