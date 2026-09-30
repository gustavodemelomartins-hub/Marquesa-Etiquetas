/** Trazer as fotos da LOJA ONLINE para a galeria da peça — TODAS elas.
 *
 *  O importador anterior (`fotos.js › importarFotosDaLoja`) copiava UMA
 *  imagem por código para as colunas antigas de `produtos`. Uma peça com
 *  oito fotos na Nuvemshop chegava aqui com uma. Este módulo copia a
 *  galeria inteira para `produto_fotos` (R2 + D1), na ordem da loja, e
 *  sabe dizer de cada foto de onde ela veio.
 *
 *  ── A direção ───────────────────────────────────────────────────────────
 *
 *  É LEITURA da Nuvemshop e ESCRITA só aqui dentro (D1 + R2). Nenhuma
 *  chamada escreve na loja, nenhum movimento de estoque nasce, nenhum
 *  pedido é lido. A sincronização de pedidos e de estoque continua
 *  desligada e não é tocada por nada deste arquivo.
 *
 *  ── De quem é cada foto (em camadas, e parando na dúvida) ──────────────
 *
 *   1. SKU        a imagem é de um código da loja (a variação declara o
 *                 `image_id`, ou o anúncio tem um código só) e esse código
 *                 existe aqui.
 *   2. VÍNCULO    o id da variação ou do anúncio já está gravado aqui
 *                 (`produto_variacoes.variante_id/produto_id`,
 *                 `produtos.produto_id_loja`) e aponta para UM código.
 *   3. HISTÓRICO  o endereço da imagem é exatamente o `produtos.foto_url`
 *                 que o vínculo antigo gravou em UMA peça.
 *
 *  Quando as camadas discordam, ou quando uma delas aponta para mais de um
 *  código, a foto vai para "Precisa revisar" com o motivo — e não para a
 *  peça. Uma foto na peça errada é pior do que nenhuma: a Sthefany confia
 *  na imagem para separar a peça.
 *
 *  ── Idempotência ────────────────────────────────────────────────────────
 *
 *  A identidade de uma foto da loja é o `imagem_id` da Nuvemshop, e o
 *  índice único `idx_produto_fotos_imagem_loja (sku, imagem_id_loja)` é
 *  quem garante que ela não entra duas vezes — o banco, não esta lógica.
 *  Rodar hoje e amanhã devolve "nada novo". Foto removida pela usuária fica
 *  como linha removida e também não volta.
 */
import { Nuvemshop } from '../nuvemshop.js';
import { galeriaDoCatalogo, guardarGaleria } from '../fotos.js';
import { salvarObjeto, apagarFoto, validarBytes, SEM_R2 } from '../fotos-storage.js';
import { normSku } from '../sku.js';
import {
  chaveDaFoto, VERSAO, ESTADO_FOTO, VIVA, novoId, hashDosBytes,
} from './galeria.js';

const CHAVE_ANALISE = 'fotosLojaUltimaAnalise';
/* Os códigos e o nome de cada anúncio, como a ÚLTIMA leitura completa da
   loja os viu. `loja_fotos` guarda a imagem, não o anúncio — e é daqui que
   sai "este anúncio junta AMB1 e AMB2" quando a foto não diz de quem é. */
const CHAVE_ANUNCIOS = 'fotosLojaAnuncios';

/** Quantas fotos por chamada, no máximo. Cada foto são DUAS buscas na CDN
 *  (original e miniatura), e o Worker tem teto de subrequisições por
 *  chamada. 20 fotos = 40 buscas, folgado abaixo de 50. */
export const LOTE_MAXIMO = 20;

const texto = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  return String(v.pt || v.pt_BR || Object.values(v)[0] || '').trim();
};

function lojaDesconectada(env) {
  return new Nuvemshop(env).configurada()
    ? null : 'A loja online não está conectada: falta o token da Nuvemshop neste servidor.';
}

/* ════════════════════════════════════════════════════ bytes da CDN */

/** A miniatura que a própria CDN da Nuvemshop serve: o mesmo endereço com
 *  o tamanho antes da extensão. `-320-0` foi conferido contra a CDN pelo
 *  painel legado (responde 200); um segundo par de tamanho responde 403,
 *  por isso o par antigo sai antes. Fora da CDN não existe miniatura. */
export function miniaturaDaCdn(url) {
  if (!url || !/tiendanube\.com|nuvemshop\.com/.test(url)) return null;
  const mini = url.replace(/(?:-\d{1,4}-\d{1,4})?(\.[a-z]{3,4})(\?.*)?$/i, '-320-0$1$2');
  return mini === url ? null : mini;
}

/** O tipo pelos PRIMEIROS BYTES, e não só pelo cabeçalho: CDN que responde
 *  `application/octet-stream` ou `image/jpg` não pode transformar uma foto
 *  boa em "formato não aceito". */
function tipoPelosBytes(bytes, cabecalho) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  const c = String(cabecalho || '').split(';')[0].trim().toLowerCase();
  return c === 'image/jpg' ? 'image/jpeg' : c;
}

/** Baixa uma imagem. Nunca lança: uma foto que não baixou vira MOTIVO, e
 *  as outras do lote seguem. */
export async function baixarImagem(url) {
  try {
    const sinal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(20000) : undefined;
    const resp = await fetch(url, sinal ? { signal: sinal } : undefined);
    if (!resp.ok) return { erro: `a loja respondeu ${resp.status} para esta imagem` };
    const bytes = await resp.arrayBuffer();
    const tipo = tipoPelosBytes(bytes, resp.headers.get('content-type'));
    const invalido = validarBytes(bytes, tipo);
    if (invalido) return { erro: `${invalido} (veio ${tipo || 'sem tipo'})` };
    return { bytes, tipo };
  } catch (e) {
    return { erro: `não consegui baixar: ${String((e && e.message) || e)}` };
  }
}

/** Executa `tarefa` sobre a lista com no máximo `n` ao mesmo tempo — o
 *  Worker aceita seis conexões simultâneas. */
async function emParalelo(lista, n, tarefa) {
  const saida = new Array(lista.length);
  let i = 0;
  const trabalhador = async () => {
    while (i < lista.length) {
      const j = i++;
      saida[j] = await tarefa(lista[j], j);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabalhador));
  return saida;
}

/* ════════════════════════════════════════════════════ o casamento */

async function todas(db, sql, ...args) {
  try { return (await db.prepare(sql).bind(...args).all()).results ?? []; } catch { return []; }
}

const acrescentar = (mapa, chave, valor) => {
  if (chave == null || chave === '') return;
  const k = String(chave);
  if (!mapa.has(k)) mapa.set(k, new Set());
  mapa.get(k).add(valor);
};

async function lerJson(db, chave) {
  try {
    const r = await db.prepare(`SELECT valor FROM config WHERE chave = ?`).bind(chave).first();
    return r ? JSON.parse(r.valor) : null;
  } catch { return null; }
}

/** Tudo o que já está gravado aqui e que ajuda a dizer de quem é uma foto.
 *  `anuncios` ({ produtoId: { n: nome, c: [códigos] } }) vem da leitura da
 *  loja em curso ou da última gravada; o espelho `loja_variantes` completa. */
async function lerVinculos(db, anuncios = null) {
  const produtos = new Map();
  for (const p of await todas(db, `SELECT sku, desc, status, foto_url, produto_id_loja FROM produtos`)) {
    produtos.set(normSku(p.sku), p);
  }
  /* `produto_id_loja` só existe depois da migração 4.5; sem ela a consulta
     acima falha inteira — então tenta de novo sem a coluna. */
  if (!produtos.size) {
    for (const p of await todas(db, `SELECT sku, desc, status, foto_url FROM produtos`)) {
      produtos.set(normSku(p.sku), p);
    }
  }

  const varianteParaSku = new Map();          // variante_id → Set(sku)
  const anuncioParaSku = new Map();           // produto_id  → Set(sku)
  const nomeDaVariacao = new Map();           // variante_id → nome
  for (const v of await todas(db, `SELECT sku, nome, variante_id, produto_id FROM produto_variacoes`)) {
    const k = normSku(v.sku);
    acrescentar(varianteParaSku, v.variante_id, k);
    acrescentar(anuncioParaSku, v.produto_id, k);
    if (v.variante_id) nomeDaVariacao.set(String(v.variante_id), v.nome);
  }
  const urlParaSku = new Map();
  for (const [k, p] of produtos) {
    acrescentar(anuncioParaSku, p.produto_id_loja, k);
    acrescentar(urlParaSku, p.foto_url, k);
  }

  /* O espelho da loja: quais códigos cada anúncio carrega, e o nome dele. */
  const codigosDoAnuncio = new Map();
  const nomeDoAnuncio = new Map();
  const lidos = anuncios || (await lerJson(db, CHAVE_ANUNCIOS)) || {};
  for (const [id, a] of Object.entries(lidos)) {
    if (a?.n) nomeDoAnuncio.set(String(id), a.n);
    for (const c of a?.c || []) acrescentar(codigosDoAnuncio, id, normSku(c));
  }
  for (const v of await todas(db, `SELECT produto_id, sku_norm, produto_nome FROM loja_variantes`)) {
    acrescentar(codigosDoAnuncio, v.produto_id, v.sku_norm ? normSku(v.sku_norm) : null);
    if (v.produto_nome && !nomeDoAnuncio.has(String(v.produto_id))) {
      nomeDoAnuncio.set(String(v.produto_id), v.produto_nome);
    }
  }
  return {
    produtos, varianteParaSku, anuncioParaSku, urlParaSku, nomeDaVariacao,
    codigosDoAnuncio, nomeDoAnuncio,
  };
}

const unico = (conjunto) => (conjunto && conjunto.size === 1 ? [...conjunto][0] : null);

/** De quem é UMA imagem da loja. Devolve `{ sku, via }` ou `{ revisar,
 *  motivo, candidatos }` ou `{ semPeca, motivo }`. Nunca chuta. */
function resolverDono(img, v) {
  const porSku = img.sku_norm && v.produtos.has(normSku(img.sku_norm)) ? normSku(img.sku_norm) : null;
  const vinculoVariacao = img.variante_id ? v.varianteParaSku.get(String(img.variante_id)) : null;
  const vinculoAnuncio = v.anuncioParaSku.get(String(img.produto_id));

  /* Camada 1 — SKU, conferido contra os vínculos gravados. */
  if (porSku) {
    const contra = vinculoVariacao?.size ? vinculoVariacao : null;
    if (contra && !contra.has(porSku)) {
      return {
        revisar: true, candidatos: [porSku, ...contra],
        motivo: `O código da loja (${porSku}) e a variação já vinculada aqui (${[...contra].join(', ')}) apontam para peças diferentes.`,
      };
    }
    return { sku: porSku, via: 'sku' };
  }

  /* Camada 2 — vínculo gravado: primeiro o da variação, depois o do anúncio. */
  if (vinculoVariacao?.size) {
    const sku = unico(vinculoVariacao);
    if (sku) return { sku, via: 'variacao' };
    return {
      revisar: true, candidatos: [...vinculoVariacao],
      motivo: 'A variação da loja está vinculada a mais de um código aqui.',
    };
  }
  if (vinculoAnuncio?.size) {
    const sku = unico(vinculoAnuncio);
    if (sku) return { sku, via: 'vinculo' };
    return {
      revisar: true, candidatos: [...vinculoAnuncio],
      motivo: 'O anúncio da loja reúne mais de um código daqui, e esta foto não está presa a nenhuma variação.',
    };
  }

  /* Camada 3 — o endereço que o vínculo antigo gravou numa peça só. */
  const porUrl = v.urlParaSku.get(String(img.url));
  if (porUrl?.size) {
    const sku = unico(porUrl);
    if (sku) return { sku, via: 'historico' };
    return {
      revisar: true, candidatos: [...porUrl],
      motivo: 'Este mesmo endereço de foto está gravado em mais de uma peça.',
    };
  }

  /* Nenhuma camada respondeu. Distinguir "a loja reúne vários códigos" de
     "o código da loja não existe aqui" muda a ação: uma pede decisão, a
     outra pede cadastro. */
  const codigos = [...(v.codigosDoAnuncio.get(String(img.produto_id)) || [])].filter(Boolean);
  const existentes = codigos.filter((c) => v.produtos.has(c));
  if (!img.sku_norm && existentes.length > 1) {
    return {
      revisar: true, candidatos: existentes,
      motivo: `O anúncio tem ${existentes.length} códigos daqui e a foto não está presa a nenhuma variação.`,
    };
  }
  if (!img.sku_norm && existentes.length === 1) {
    /* O espelho diz que o anúncio tem UM código daqui, mas a leitura da
       galeria não conseguiu amarrar a foto a ele (variações sem SKU). É
       quase certo — e "quase" é revisar. */
    return {
      revisar: true, candidatos: existentes,
      motivo: 'O anúncio tem variações sem código; só um dos códigos existe aqui, mas a foto não está presa a ele.',
    };
  }
  return {
    semPeca: true,
    motivo: img.sku_norm
      ? `O código ${img.sku_norm} da loja não existe aqui.`
      : 'O anúncio da loja não tem código em nenhuma variação.',
  };
}

/** O PLANO: cada imagem do espelho `loja_fotos`, com dono e situação.
 *
 *  Não fala com a loja — lê o espelho que a última análise gravou. É o
 *  que o dry-run mostra e o que o lote executa, pela MESMA função: o
 *  número que a tela promete é o número que a importação cumpre. */
export async function planejarImportacao(db, { anuncios = null } = {}) {
  const imagens = await todas(db,
    `SELECT imagem_id, produto_id, url, posicao, principal, sku_norm, variante_id
       FROM loja_fotos ORDER BY produto_id, posicao, imagem_id`);
  const v = await lerVinculos(db, anuncios);
  const nomeDoAnuncio = (id) => v.nomeDoAnuncio.get(String(id)) || null;

  /* O que já está aqui, por (sku, imagem da loja) — inclusive as linhas
     removidas, que são a memória de "não traga de volta". */
  const existentes = new Map();
  for (const r of await todas(db,
    `SELECT sku, imagem_id_loja, removida_em FROM produto_fotos WHERE imagem_id_loja IS NOT NULL`)) {
    existentes.set(`${r.sku}|${r.imagem_id_loja}`, r.removida_em ? 'removida' : 'ja_importada');
  }

  const resolvidas = imagens.map((img) => ({ img, dono: resolverDono(img, v) }));

  /* O mesmo código recebendo foto de DOIS anúncios diferentes é cadastro
     duplicado na loja — nenhuma das duas galerias é "a" galeria da peça. */
  const anunciosPorSku = new Map();
  for (const r of resolvidas) if (r.dono.sku) acrescentar(anunciosPorSku, r.dono.sku, String(r.img.produto_id));
  for (const r of resolvidas) {
    const anuncios = r.dono.sku ? anunciosPorSku.get(r.dono.sku) : null;
    if (anuncios && anuncios.size > 1) {
      r.dono = {
        revisar: true, candidatos: [r.dono.sku],
        motivo: `O código ${r.dono.sku} aparece em ${anuncios.size} anúncios diferentes da loja — cadastro duplicado lá.`,
      };
    }
  }

  const novas = [], jaImportadas = [], removidas = [];
  const revisarPorAnuncio = new Map(), semPecaPorAnuncio = new Map();
  const anunciosOk = new Set();
  for (const { img, dono } of resolvidas) {
    const pid = String(img.produto_id);
    if (dono.sku) {
      anunciosOk.add(pid);
      const item = {
        imagemId: String(img.imagem_id), produtoId: pid, url: img.url,
        posicao: Number(img.posicao || 0), sku: dono.sku, via: dono.via,
        varianteId: img.variante_id ? String(img.variante_id) : null,
        variacao: img.variante_id ? (v.nomeDaVariacao.get(String(img.variante_id)) || null) : null,
      };
      const sit = existentes.get(`${dono.sku}|${item.imagemId}`);
      if (sit === 'ja_importada') jaImportadas.push(item);
      else if (sit === 'removida') removidas.push(item);
      else novas.push(item);
      continue;
    }
    const alvo = dono.revisar ? revisarPorAnuncio : semPecaPorAnuncio;
    if (!alvo.has(pid)) {
      alvo.set(pid, {
        produtoId: pid,
        produtoNome: nomeDoAnuncio(pid),
        codigosNaLoja: [...(v.codigosDoAnuncio.get(pid) || [])].filter(Boolean),
        imagens: 0,
        foto: img.url,
        motivo: dono.motivo,
        candidatos: [],
      });
    }
    const g = alvo.get(pid);
    g.imagens++;
    for (const c of dono.candidatos || []) {
      if (!g.candidatos.some((x) => x.sku === c)) {
        g.candidatos.push({ sku: c, desc: v.produtos.get(c)?.desc || null, existe: v.produtos.has(c) });
      }
    }
  }

  /* Ordem de execução: por peça, na posição da loja. É o que faz a galeria
     nascer na mesma ordem da vitrine mesmo quando um anúncio atravessa
     dois lotes. */
  novas.sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : a.posicao - b.posicao));

  const revisar = [...revisarPorAnuncio.values()];
  const semPeca = [...semPecaPorAnuncio.values()].filter((g) => !anunciosOk.has(g.produtoId));
  const anunciosComFoto = new Set(imagens.map((i) => String(i.produto_id)));
  const skusRevisar = new Set(revisar.flatMap((g) => g.candidatos.filter((c) => c.existe).map((c) => c.sku)));

  return {
    resumo: {
      anunciosComFoto: anunciosComFoto.size,
      anunciosComCorrespondencia: anunciosOk.size,
      anunciosSemCorrespondencia: semPeca.length,
      anunciosParaRevisar: [...revisarPorAnuncio.keys()].filter((id) => !anunciosOk.has(id)).length,
      fotosEncontradas: imagens.length,
      fotosJaNoR2: jaImportadas.length,
      fotosRemovidasAqui: removidas.length,
      fotosNovas: novas.length,
      fotosParaRevisar: revisar.reduce((s, g) => s + g.imagens, 0),
      fotosSemPeca: semPeca.reduce((s, g) => s + g.imagens, 0),
      pecasComFotoNova: new Set(novas.map((n) => n.sku)).size,
      pecasComFotoDaLoja: new Set([...novas, ...jaImportadas].map((n) => n.sku)).size,
    },
    novas, jaImportadas, removidas, revisar, semPeca,
    skusParaRevisar: [...skusRevisar],
  };
}

/* ════════════════════════════════════════════════════ análise (lê a loja) */

/** O que se guarda de cada anúncio: nome e códigos das variações. Curto de
 *  propósito — é uma linha de `config`, não um segundo espelho da loja. */
function resumoDosAnuncios(produtosLoja, base = {}) {
  const saida = { ...base };
  for (const p of produtosLoja || []) {
    const codigos = [...new Set((p.variants || []).map((x) => normSku(x.sku)).filter(Boolean))];
    saida[String(p.id)] = { n: texto(p.name), c: codigos };
  }
  return saida;
}

async function gravarConfig(db, chave, valor) {
  await db.prepare(
    `INSERT INTO config (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
  ).bind(chave, JSON.stringify(valor)).run();
}

export async function ultimaAnalise(db) {
  try {
    const r = await db.prepare(`SELECT valor FROM config WHERE chave = ?`).bind(CHAVE_ANALISE).first();
    return r ? JSON.parse(r.valor) : null;
  } catch { return null; }
}

/** Lê o catálogo INTEIRO da loja, atualiza o espelho `loja_fotos` e devolve
 *  o plano. É o dry-run da importação em massa: nenhuma foto é baixada,
 *  nada vai ao R2 e nenhuma peça recebe foto.
 *
 *  O espelho é escrita NOSSA (uma tabela de leitura da vitrine), e é a
 *  mesma que a rodada de sincronização já grava — em rodada seca inclusive. */
export async function analisarFotosDaLoja(db, env) {
  const semLoja = lojaDesconectada(env);
  if (semLoja) return { ok: false, statusHttp: 409, erro: semLoja, bloqueio: 'sem_loja' };

  let produtosLoja;
  try {
    produtosLoja = await new Nuvemshop(env).produtos();
  } catch (e) {
    return { ok: false, statusHttp: 502, erro: `A loja online não respondeu: ${(e && e.message) || e}` };
  }

  const linhas = galeriaDoCatalogo(produtosLoja);
  await guardarGaleria(db, linhas);

  /* Anúncio que SUMIU da loja leva as fotos dele do espelho: a leitura
     acima é o catálogo inteiro, então o que não veio não existe mais lá. */
  const vivos = new Set(produtosLoja.map((p) => String(p.id)));
  const antigos = await todas(db, `SELECT DISTINCT produto_id FROM loja_fotos`);
  const sumiram = antigos.map((r) => String(r.produto_id)).filter((id) => !vivos.has(id));
  for (let i = 0; i < sumiram.length; i += 50) {
    await db.batch(sumiram.slice(i, i + 50).map((id) =>
      db.prepare(`DELETE FROM loja_fotos WHERE produto_id = ?`).bind(id)));
  }

  const anuncios = resumoDosAnuncios(produtosLoja);
  await gravarConfig(db, CHAVE_ANUNCIOS, anuncios);
  const plano = await planejarImportacao(db, { anuncios });
  const semImagem = produtosLoja.filter((p) => !(p.images || []).length).length;
  const retrato = {
    em: new Date().toISOString(),
    anunciosNaLoja: produtosLoja.length,
    anunciosSemFoto: semImagem,
    ...plano.resumo,
  };
  await gravarConfig(db, CHAVE_ANALISE, retrato);

  return {
    ok: true, seco: true,
    resumo: { ...plano.resumo, anunciosNaLoja: produtosLoja.length, anunciosSemFoto: semImagem },
    revisar: plano.revisar.slice(0, 300),
    semPeca: plano.semPeca.slice(0, 300),
    amostra: plano.novas.slice(0, 40),
    skusParaRevisar: plano.skusParaRevisar,
  };
}

/* ════════════════════════════════════════════════════ importação (grava) */

/** Grava UMA foto baixada: R2 primeiro, depois a linha com `INSERT OR
 *  IGNORE`. Se a linha não entrar (outra aba importou a mesma foto no
 *  mesmo instante), os bytes recém-gravados saem — e o resultado diz
 *  "já existia", que é a verdade. */
async function gravarImportada(db, env, item, baixada, mini, posicaoNaGaleria, principal) {
  const hash = await hashDosBytes(baixada.bytes);

  /* A MESMA imagem já está na galeria por upload (mesmo hash)? Então a
     foto da loja É aquela: amarra o id da loja nela em vez de duplicar. */
  if (hash) {
    const igual = await db.prepare(
      `SELECT id, imagem_id_loja FROM produto_fotos WHERE sku = ? AND conteudo_hash = ? AND ${VIVA} LIMIT 1`,
    ).bind(item.sku, hash).first();
    if (igual) {
      if (!igual.imagem_id_loja) {
        await db.prepare(`
          UPDATE produto_fotos SET imagem_id_loja = ?, produto_id_loja = ?, variante_id_loja = ?,
                 posicao_loja = ?, url_externa = COALESCE(url_externa, ?) WHERE id = ?`,
        ).bind(item.imagemId, item.produtoId, item.varianteId, item.posicao, item.url, igual.id).run();
        return { situacao: 'ja_existia', fotoId: igual.id };
      }
      /* A loja tem a mesma imagem duas vezes, com ids diferentes. Importar
         a segunda seria uma foto repetida na galeria; a linha removida
         registra a decisão para a próxima importação não perguntar de novo. */
      await db.prepare(`
        INSERT OR IGNORE INTO produto_fotos
          (id, sku, ordem, principal, origem, estado, imagem_id_loja, produto_id_loja,
           variante_id_loja, posicao_loja, url_externa, erro, removida_em, criado_em)
        VALUES (?,?,?,0,'nuvemshop',?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      ).bind(novoId(), item.sku, posicaoNaGaleria, ESTADO_FOTO.PUBLICADA, item.imagemId, item.produtoId,
        item.varianteId, item.posicao, item.url, `Imagem idêntica à foto ${igual.id}, já na galeria.`).run();
      return { situacao: 'duplicada', fotoId: igual.id };
    }
  }

  const id = novoId();
  const chaveOriginal = chaveDaFoto(item.sku, id, VERSAO.ORIGINAL);
  const chaveMini = mini ? chaveDaFoto(item.sku, id, VERSAO.MINIATURA) : null;
  await salvarObjeto(env, chaveOriginal, baixada.bytes, baixada.tipo);
  if (mini) await salvarObjeto(env, chaveMini, mini.bytes, mini.tipo);

  const r = await db.prepare(`
    INSERT OR IGNORE INTO produto_fotos
      (id, sku, ordem, principal, origem, conteudo_hash,
       original_key, original_tipo, original_tam, original_em,
       miniatura_key, miniatura_tipo, miniatura_tam,
       estado, imagem_id_loja, produto_id_loja, variante_id_loja, posicao_loja, url_externa, criado_em)
    VALUES (?,?,?,?,'nuvemshop',?,?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?,datetime('now'))`,
  ).bind(
    id, item.sku, posicaoNaGaleria, principal ? 1 : 0, hash,
    chaveOriginal, baixada.tipo, baixada.bytes.byteLength,
    chaveMini, mini ? mini.tipo : null, mini ? mini.bytes.byteLength : null,
    /* A foto veio da vitrine: ela JÁ está publicada, e com este id lá. */
    ESTADO_FOTO.PUBLICADA, item.imagemId, item.produtoId, item.varianteId, item.posicao, item.url,
  ).run();

  if (!Number(r?.meta?.changes ?? 1)) {
    await apagarFoto(env, chaveOriginal);
    if (chaveMini) await apagarFoto(env, chaveMini);
    return { situacao: 'ja_existia' };
  }
  return { situacao: 'importada', fotoId: id };
}

/** Importa o PRÓXIMO lote do plano. A tela chama de novo enquanto
 *  `restantes` > 0 — cada chamada é curta, e parar no meio não perde nada:
 *  o que entrou, entrou; o que falta, continua na fila.
 *
 *  `ignorar`: ids de imagem que já falharam nesta rodada. Sem isso uma foto
 *  quebrada na loja voltaria na frente de todo lote seguinte.
 *  `sku`: só as fotos desta peça (a importação de dentro da ficha). */
export async function importarLoteDaLoja(db, env, { limite = 12, ignorar = [], sku = null } = {}) {
  if (!env?.FOTOS) return { ok: false, statusHttp: 503, erro: SEM_R2, bloqueio: 'sem_r2' };

  const plano = await planejarImportacao(db);
  const pular = new Set((Array.isArray(ignorar) ? ignorar : []).map(String));
  const alvo = sku ? normSku(sku) : null;
  const fila = plano.novas.filter((n) => !pular.has(n.imagemId) && (!alvo || n.sku === alvo));
  const n = Math.max(1, Math.min(LOTE_MAXIMO, Number(limite) || 12));
  const lote = fila.slice(0, n);

  const baixadas = await emParalelo(lote, 4, async (item) => {
    const original = await baixarImagem(item.url);
    if (original.erro) return { original };
    const urlMini = miniaturaDaCdn(item.url);
    const mini = urlMini ? await baixarImagem(urlMini) : null;
    return { original, mini: mini && !mini.erro ? mini : null };
  });

  const falhas = [];
  let importadas = 0, jaExistiam = 0, duplicadas = 0;
  const estadoDaPeca = new Map();          // sku → { proxima, temPrincipal }
  for (let i = 0; i < lote.length; i++) {
    const item = lote[i];
    const b = baixadas[i];
    if (b.original.erro) { falhas.push({ ...item, motivo: b.original.erro }); continue; }

    if (!estadoDaPeca.has(item.sku)) {
      const atual = await db.prepare(
        `SELECT MAX(ordem) ultima, SUM(principal) principais FROM produto_fotos WHERE sku = ? AND ${VIVA}`,
      ).bind(item.sku).first();
      estadoDaPeca.set(item.sku, {
        proxima: atual?.ultima == null ? 0 : Number(atual.ultima) + 1,
        temPrincipal: Number(atual?.principais || 0) > 0,
      });
    }
    const est = estadoDaPeca.get(item.sku);
    try {
      /* Peça sem principal recebe como principal a PRIMEIRA foto da loja
         que entrar — a da vitrine. Peça que já tem principal fica com ela:
         importar nunca desfaz a escolha de alguém. */
      const r = await gravarImportada(db, env, item, b.original, b.mini, est.proxima, !est.temPrincipal);
      if (r.situacao === 'importada') {
        importadas++;
        est.proxima++;
        est.temPrincipal = true;
      } else if (r.situacao === 'duplicada') duplicadas++;
      else jaExistiam++;
    } catch (e) {
      falhas.push({ ...item, motivo: `não gravou no armazenamento: ${String((e && e.message) || e)}` });
    }
  }

  return {
    ok: true,
    importadas, jaExistiam, duplicadas,
    falharam: falhas.length,
    falhas: falhas.slice(0, 50).map((f) => ({
      imagemId: f.imagemId, sku: f.sku, url: f.url, motivo: f.motivo,
    })),
    /* As que ficaram para a próxima chamada. Falha NÃO conta aqui — ela
       tentaria de novo para sempre; quem decide tentar de novo é a pessoa. */
    restantes: fila.length - lote.length,
    total: fila.length + pular.size,
  };
}

/* ════════════════════════════════════════════════════ uma peça só */

/** "Buscar fotos na loja online" de dentro da ficha da peça.
 *
 *  Acha o anúncio pelos identificadores confiáveis — o espelho da loja, os
 *  vínculos gravados e, por último, a busca por SKU da própria Nuvemshop —,
 *  relê SÓ esse anúncio (a galeria pode ter mudado desde a última análise),
 *  e devolve o que viria. Com `seco: false`, importa. */
export async function importarFotosDaPeca(db, env, sku, { seco = true, limite = LOTE_MAXIMO, ignorar = [] } = {}) {
  const k = normSku(sku);
  const peca = await db.prepare(`SELECT sku, desc FROM produtos WHERE sku = ?`).bind(k).first();
  if (!peca) return { ok: false, statusHttp: 404, erro: `Código ${sku} não está no catálogo.` };
  const semLoja = lojaDesconectada(env);
  if (semLoja) return { ok: false, statusHttp: 409, erro: semLoja, bloqueio: 'sem_loja' };

  const ids = new Set();
  for (const r of await todas(db, `SELECT DISTINCT produto_id FROM loja_fotos WHERE sku_norm = ?`, k)) ids.add(String(r.produto_id));
  for (const r of await todas(db, `SELECT DISTINCT produto_id FROM loja_variantes WHERE sku_norm = ?`, k)) ids.add(String(r.produto_id));
  for (const r of await todas(db, `SELECT DISTINCT produto_id FROM produto_variacoes WHERE sku = ? AND produto_id IS NOT NULL`, k)) ids.add(String(r.produto_id));
  for (const r of await todas(db, `SELECT produto_id_loja FROM produtos WHERE sku = ? AND produto_id_loja IS NOT NULL`, k)) ids.add(String(r.produto_id_loja));

  const loja = new Nuvemshop(env);
  const anuncios = [];
  const avisos = [];
  for (const id of [...ids].slice(0, 5)) {
    try {
      const p = await loja.produto(id);
      if (p && p.id != null) anuncios.push(p);
    } catch (e) {
      if (e && e.status === 404) avisos.push(`O anúncio ${id} não existe mais na loja.`);
      else return { ok: false, statusHttp: 502, erro: `A loja online não respondeu: ${(e && e.message) || e}` };
    }
  }
  if (!anuncios.length) {
    /* Nada gravado aponta para a loja: pergunta à loja pelo SKU. */
    try {
      const p = await loja.chamar(`/products/sku/${encodeURIComponent(k)}`);
      if (p && p.id != null) anuncios.push(p);
    } catch (e) {
      if (!(e && e.status === 404)) {
        return { ok: false, statusHttp: 502, erro: `A loja online não respondeu: ${(e && e.message) || e}` };
      }
    }
  }
  if (!anuncios.length) {
    return {
      ok: true, encontrado: false, sku: k, anuncios: [], fotos: [], avisos,
      detalhe: `Não encontrei o código ${k} na loja online. Se a peça está lá com outro código, corrija o SKU no anúncio.`,
    };
  }

  await guardarGaleria(db, galeriaDoCatalogo(anuncios));
  /* Os anúncios relidos agora valem mais que a última análise completa. */
  const resumo = resumoDosAnuncios(anuncios, (await lerJson(db, CHAVE_ANUNCIOS)) || {});
  await gravarConfig(db, CHAVE_ANUNCIOS, resumo);
  const plano = await planejarImportacao(db, { anuncios: resumo });
  const daPeca = (l) => l.filter((x) => x.sku === k);
  const fotos = [
    ...daPeca(plano.novas).map((x) => ({ ...x, situacao: 'nova' })),
    ...daPeca(plano.jaImportadas).map((x) => ({ ...x, situacao: 'ja_importada' })),
    ...daPeca(plano.removidas).map((x) => ({ ...x, situacao: 'removida' })),
  ].sort((a, b) => a.posicao - b.posicao);
  const idsDosAnuncios = new Set(anuncios.map((p) => String(p.id)));
  const revisar = plano.revisar.filter((g) => idsDosAnuncios.has(g.produtoId)
    || g.candidatos.some((c) => c.sku === k));

  const base = {
    ok: true, encontrado: true, sku: k,
    anuncios: anuncios.map((p) => ({
      id: String(p.id), nome: texto(p.name), fotos: (p.images || []).length,
      url: p.canonical_url || null,
    })),
    fotos, revisar, avisos,
    resumo: {
      novas: fotos.filter((f) => f.situacao === 'nova').length,
      jaImportadas: fotos.filter((f) => f.situacao === 'ja_importada').length,
      removidas: fotos.filter((f) => f.situacao === 'removida').length,
      paraRevisar: revisar.reduce((s, g) => s + g.imagens, 0),
    },
  };
  if (seco) return { ...base, seco: true };

  const r = await importarLoteDaLoja(db, env, { limite, ignorar, sku: k });
  return { ...base, seco: false, importacao: r };
}
