/** Foto da peça: importar da loja uma vez, e daqui para frente tratar aqui.
 *
 *  A direção importa. Hoje a loja tem as fotos e o sistema não tem nenhuma,
 *  então a primeira carga vem de lá. Depois disso o sentido se inverte: a
 *  peça é cadastrada aqui, a foto é adicionada aqui, e a loja é abastecida
 *  a partir daqui. Este arquivo serve aos dois momentos.
 *
 *  Os bytes da imagem vivem no R2 (ver `fotos-storage.js`); o D1 guarda só
 *  a referência — chave, tipo, tamanho e estado (`migracao-catalogo.sql`).
 *  Nenhuma função aqui grava um endereço de fora como se fosse a foto: uma
 *  URL da Nuvemshop é lida uma vez, os bytes são copiados para o bucket, e
 *  dali em diante a peça é dona da própria imagem — a loja pode reorganizar
 *  o catálogo dela sem que uma foto nossa suma.
 *
 *  Duas coisas que este arquivo não faz, de propósito:
 *
 *   - não adivinha de quem é a foto. Código que não bate exatamente vai
 *     para `fotos_orfas`. Uma foto no produto errado é pior que nenhuma:
 *     a loja passa a anunciar uma peça mostrando outra, e ninguém percebe
 *     olhando o painel.
 *   - não publica nada sozinha. Ela prepara e marca o estado; quem manda
 *     para a loja é a sincronização, que tem confirmação própria.
 */

import { Nuvemshop } from './nuvemshop.js';
import { salvarFoto, lerFoto, apagarFoto, tipoValido } from './fotos-storage.js';

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

/** Busca os bytes de uma URL de fora (Nuvemshop) para copiar ao R2.
 *  Devolve `null` em vez de lançar — uma foto que não baixou não pode
 *  travar as outras 400 do mesmo lote. */
async function baixar(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const tipo = (resp.headers.get('content-type') || '').split(';')[0].trim();
    const bytes = await resp.arrayBuffer();
    if (!tipoValido(tipo) || !bytes.byteLength) return null;
    return { bytes, tipo };
  } catch {
    return null;
  }
}

/* ==================================================================== */
/* 1. Carga inicial: puxar as fotos que já estão na Nuvemshop            */
/* ==================================================================== */

/** Lê a loja, casa imagem com produto pelo SKU e copia os bytes para o R2.
 *
 *  `seco: true` faz a mesma leitura e a mesma conta sem baixar nem gravar
 *  nada — é o que a tela usa para dizer "vou trazer 412 fotos e 37 ficam
 *  sem dono" antes de qualquer escrita.
 *
 *  Só preenche quem está sem foto. Foto que alguém já colocou aqui é a
 *  mais nova das duas, e sobrescrever seria desfazer trabalho de gente.
 */
/** Lê a loja inteira UMA vez e casa código com imagem.
 *
 *  Os dois caminhos que usam isto — copiar os bytes para o R2 e apenas
 *  anotar o endereço — precisam exatamente do mesmo casamento. Escrever a
 *  regra duas vezes é como as duas se separam em silêncio: um dia o
 *  importador prefere a imagem da variação e o vinculador prefere a do
 *  produto, e ninguém percebe olhando a tela.
 *
 *  Separa em quatro grupos, porque "não tem foto" tem causas diferentes e
 *  o relatório precisa distinguir:
 *
 *    pares          o código existe aqui e a loja tem imagem para ele
 *    semImagem      o código existe aqui e na loja, mas a loja não tem imagem
 *    naoEncontrados o código existe aqui e a loja não conhece
 *    orfas          a loja tem imagem de um código que não existe aqui
 */
async function lerFotosDaLoja(db, env) {
  const nossos = new Map((await db.prepare(
    `SELECT sku, desc, foto_original_key, foto_tratada_key, foto_status, foto_url FROM produtos`
  ).all()).results.map(p => [p.sku, p]));

  const produtosLoja = await new Nuvemshop(env).produtos();

  const pares = new Map();          // sku → { sku, desc, url, nosso }
  const semImagem = new Map();      // sku → { sku, desc }
  const orfas = [];
  const vistosNaLoja = new Set();
  const urlsOrfas = new Set();

  for (const p of produtosLoja) {
    /* `position` é o que a loja chama de ordem das fotos; a primeira é a
       principal, que é a que aparece na vitrine. */
    const imagens = (p.images || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    const porId = new Map(imagens.map(i => [String(i.id), i.src]));

    for (const v of p.variants || []) {
      const sku = normSku(v.sku);
      if (!sku) continue;
      vistosNaLoja.add(sku);

      /* A variação pode ter imagem própria (o anel dourado e o prateado);
         quando não tem, vale a principal do produto. */
      const src = (v.image_id && porId.get(String(v.image_id))) || (imagens[0] && imagens[0].src) || null;

      const nosso = nossos.get(sku);
      if (!nosso) {
        if (src && !urlsOrfas.has(src)) {
          urlsOrfas.add(src);
          orfas.push({ url: src, skuLoja: sku, nomeLoja: texto(p.name), produtoId: String(p.id) });
        }
        continue;
      }
      if (!src) { if (!pares.has(sku)) semImagem.set(sku, { sku, desc: nosso.desc }); continue; }
      /* O mesmo código pode aparecer em mais de uma variação. A primeira
         imagem encontrada vale — escolher a "melhor" entre duas exigiria um
         critério que ninguém definiu, e chutar é o que esta camada não faz. */
      if (!pares.has(sku)) { pares.set(sku, { sku, desc: nosso.desc, url: src, nosso }); semImagem.delete(sku); }
    }
  }

  const naoEncontrados = [...nossos.values()]
    .filter(n => !vistosNaLoja.has(n.sku))
    .map(n => ({ sku: n.sku, desc: n.desc }));

  return {
    nossos,
    pares: [...pares.values()],
    semImagem: [...semImagem.values()],
    naoEncontrados,
    orfas,
  };
}

/** A mesma recusa nos dois caminhos: sem token, nenhum dos dois tem o que
 *  fazer, e dizer isso é melhor que devolver "nenhuma foto encontrada". */
function lojaDesconectada(env) {
  return new Nuvemshop(env).configurada()
    ? null : 'A loja não está conectada. Falta o token da Nuvemshop.';
}

/** Registra na fila "sem correspondência" as imagens cujo código não bate
 *  com nenhum daqui. Os dois caminhos alimentam a mesma fila. */
function stmtsOrfas(db, orfas) {
  return orfas.map(o => db.prepare(
    `INSERT INTO fotos_orfas (url, sku_loja, nome_loja, produto_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET sku_loja=excluded.sku_loja, nome_loja=excluded.nome_loja`
  ).bind(o.url, o.skuLoja, o.nomeLoja, o.produtoId));
}

/* ==================================================================== */
/* 1a. Vincular: anotar ONDE a foto está, sem trazer os bytes            */
/* ==================================================================== */

/** Casa código com imagem e grava só o endereço.
 *
 *  É o caminho barato: uma leitura da loja resolve o catálogo inteiro, sem
 *  um download por peça. A miniatura aparece na mesma hora, servida pela
 *  CDN da própria Nuvemshop, e a tabela de estoque para de dizer "sem foto"
 *  para peça que tem foto — na loja.
 *
 *  O que ele NÃO faz, e é de propósito: não mexe em `foto_status`. Aquele
 *  campo responde "temos os bytes?", e a resposta continua sendo não. Quem
 *  passa a ter os bytes é `importarFotosDaLoja`, e quando isso acontecer a
 *  chave do R2 vence a URL sem que nenhuma linha precise ser reescrita.
 */
export async function vincularFotosDaLoja(db, env, { seco = false, refazer = false } = {}) {
  const semLoja = lojaDesconectada(env);
  if (semLoja) return { ok: false, erro: semLoja };

  let lido;
  try {
    lido = await lerFotosDaLoja(db, env);
  } catch (e) {
    /* Coluna que falta é migração pendente, não loja fora do ar. Sobe para
       o tratador do index.js, que sabe dizer qual arquivo rodar — engolir
       aqui transformaria "falta a migração" em "a loja não respondeu". */
    if (/no such (table|column)/i.test(String((e && e.message) || e))) throw e;
    /* Timeout, 401, 5xx da loja: o relatório diz o que houve em vez de
       deixar a tela achando que o catálogo não tem foto nenhuma. */
    return { ok: false, erro: e.message || 'A loja não respondeu.' };
  }
  const { nossos, pares, semImagem, naoEncontrados, orfas } = lido;

  const aVincular = pares.filter(p => refazer || !p.nosso.foto_url);
  const jaTinham = pares.length - aVincular.length;

  const resumo = {
    analisados: nossos.size,
    encontradas: aVincular.length,
    jaTinham,
    semImagem: semImagem.length,
    naoEncontrados: naoEncontrados.length,
    orfas: orfas.length,
  };

  if (seco) {
    return {
      ok: true, seco: true, resumo,
      amostra: aVincular.slice(0, 200).map(p => ({ sku: p.sku, desc: p.desc, url: p.url })),
      semImagem: semImagem.slice(0, 100),
      naoEncontrados: naoEncontrados.slice(0, 100),
    };
  }

  /* As órfãs são CONTADAS aqui e enfileiradas só pela importação. Vincular
     é uma passada de leitura que grava um endereço por peça; encher a fila
     de revisão humana como efeito colateral disso seria escrita que ninguém
     pediu, e a fila é uma lista de decisões pendentes, não de avistamentos. */
  const stmts = aVincular.map(p => db.prepare(
    /* COALESCE: quem já subiu foto pela tela é 'upload' e continua sendo.
       A origem diz de onde veio a IMAGEM que vale, não a última que passou. */
    `UPDATE produtos SET foto_url = ?, foto_url_em = datetime('now'),
            foto_origem = COALESCE(foto_origem, 'nuvemshop')
      WHERE sku = ?`
  ).bind(p.url, p.sku));

  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));

  return {
    ok: true, resumo,
    amostra: aVincular.slice(0, 200).map(p => ({ sku: p.sku, desc: p.desc, url: p.url })),
    semImagem: semImagem.slice(0, 100),
    naoEncontrados: naoEncontrados.slice(0, 100),
  };
}

/* ==================================================================== */
/* 1b. Carga completa: copiar os bytes para o R2                         */
/* ==================================================================== */

/** Lê a loja, casa imagem com produto pelo SKU e copia os bytes para o R2.
 *
 *  `seco: true` faz a mesma leitura e a mesma conta sem baixar nem gravar
 *  nada — é o que a tela usa para dizer "vou trazer 412 fotos e 37 ficam
 *  sem dono" antes de qualquer escrita.
 *
 *  Só preenche quem está sem foto. Foto que alguém já colocou aqui é a
 *  mais nova das duas, e sobrescrever seria desfazer trabalho de gente.
 */
export async function importarFotosDaLoja(db, env, { seco = false, refazer = false } = {}) {
  const semLoja = lojaDesconectada(env);
  if (semLoja) return { ok: false, erro: semLoja };

  let lido;
  try {
    lido = await lerFotosDaLoja(db, env);
  } catch (e) {
    /* Coluna que falta é migração pendente, não loja fora do ar. Sobe para
       o tratador do index.js, que sabe dizer qual arquivo rodar — engolir
       aqui transformaria "falta a migração" em "a loja não respondeu". */
    if (/no such (table|column)/i.test(String((e && e.message) || e))) throw e;
    return { ok: false, erro: e.message || 'A loja não respondeu.' };
  }
  const { pares, orfas } = lido;

  const casadas = [], jaTinham = [];
  for (const p of pares) {
    if (p.nosso.foto_original_key && !refazer) { jaTinham.push({ sku: p.sku, desc: p.desc }); continue; }
    casadas.push({ sku: p.sku, desc: p.desc, url: p.url, temTratada: !!p.nosso.foto_tratada_key });
  }

  if (seco) {
    return {
      ok: true, seco: true,
      resumo: { casadas: casadas.length, orfas: orfas.length, jaTinham: jaTinham.length },
      casadas: casadas.slice(0, 200), orfas: orfas.slice(0, 200),
    };
  }

  const stmts = [];
  const falhasDownload = [];
  for (const c of casadas) {
    const baixada = await baixar(c.url);
    if (!baixada) { falhasDownload.push({ sku: c.sku, url: c.url }); continue; }
    const gravado = await salvarFoto(env, c.sku, 'original', baixada.bytes, baixada.tipo);
    if (gravado.erro) { falhasDownload.push({ sku: c.sku, url: c.url, motivo: gravado.erro }); continue; }
    stmts.push(db.prepare(
      /* A URL vai junto: quando os bytes já são nossos ela deixa de ser o
         que a tela mostra e passa a ser a procedência da imagem. */
      `UPDATE produtos SET foto_original_key = ?, foto_original_tipo = ?, foto_original_tam = ?,
              foto_origem = 'nuvemshop', foto_url = ?, foto_url_em = datetime('now'),
              foto_status = CASE WHEN foto_tratada_key IS NOT NULL THEN ? ELSE ? END,
              foto_erro = NULL, foto_em = datetime('now')
        WHERE sku = ?`
    ).bind(gravado.key, gravado.tipo, gravado.tamanho, c.url, FOTO.PRONTA, FOTO.ORIGINAL, c.sku));
  }
  stmts.push(...stmtsOrfas(db, orfas));
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));

  return {
    ok: true,
    resumo: {
      casadas: casadas.length - falhasDownload.length,
      orfas: orfas.length, jaTinham: jaTinham.length,
      falharam: falhasDownload.length,
    },
    casadas: casadas.slice(0, 200), orfas: orfas.slice(0, 200),
    falhas: falhasDownload.slice(0, 50),
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
 *  forma de sair da fila — o sistema nunca decide isso sozinho.
 *
 *  Adotar também copia os bytes para o R2, pelo mesmo motivo da carga
 *  inicial: a partir daqui a peça é dona da própria imagem. */
export async function adotarFotoOrfa(db, env, { id, sku }) {
  const foto = await db.prepare(`SELECT * FROM fotos_orfas WHERE id = ?`).bind(+id).first();
  if (!foto) return { erro: 'Foto não encontrada' };
  const p = await db.prepare(`SELECT sku FROM produtos WHERE sku = ?`).bind(normSku(sku)).first();
  if (!p) return { erro: `O código ${normSku(sku)} não existe no catálogo` };

  const baixada = await baixar(foto.url);
  if (!baixada) return { erro: 'Não consegui baixar esta imagem agora. Tente de novo em instantes.' };
  const gravado = await salvarFoto(env, p.sku, 'original', baixada.bytes, baixada.tipo);
  if (gravado.erro) return { erro: gravado.erro };

  await db.batch([
    db.prepare(`UPDATE produtos SET foto_original_key=?, foto_original_tipo=?, foto_original_tam=?,
                       foto_origem='nuvemshop', foto_status=?, foto_erro=NULL, foto_em=datetime('now')
                 WHERE sku = ?`)
      .bind(gravado.key, gravado.tipo, gravado.tamanho, FOTO.ORIGINAL, p.sku),
    db.prepare(`DELETE FROM fotos_orfas WHERE id = ?`).bind(+id),
  ]);
  return { ok: true, sku: p.sku };
}

/* ==================================================================== */
/* 2. Foto adicionada aqui — upload direto de bytes                     */
/* ==================================================================== */

/** Grava os bytes enviados pelo navegador como a foto original ou a
 *  tratada de um SKU. É o caminho de quando a Sthefany fotografa a peça e
 *  sobe direto no sistema (ou corrige uma foto tratada à mão).
 *
 *  Trocar a ORIGINAL invalida a tratada existente: o fundo branco é daquela
 *  foto, não da nova. Deixar a antiga ali mandaria a peça errada para a
 *  loja e ninguém notaria — o mesmo cuidado que já existia antes do R2. */
export async function salvarFotoUpload(db, env, sku, versao, bytes, tipo) {
  const p = await db.prepare(
    `SELECT sku, foto_tratada_key FROM produtos WHERE sku = ?`
  ).bind(normSku(sku)).first();
  if (!p) return { erro: 'Produto não encontrado' };
  if (versao !== 'original' && versao !== 'tratada') return { erro: 'Versão inválida' };

  const gravado = await salvarFoto(env, p.sku, versao, bytes, tipo);
  if (gravado.erro) return { erro: gravado.erro };

  if (versao === 'original') {
    if (p.foto_tratada_key) await apagarFoto(env, p.foto_tratada_key);
    await db.prepare(
      `UPDATE produtos SET foto_original_key=?, foto_original_tipo=?, foto_original_tam=?,
              foto_tratada_key=NULL, foto_tratada_tipo=NULL, foto_tratada_tam=NULL,
              foto_status=?, foto_erro=NULL,
              foto_origem=COALESCE(foto_origem,'upload'), foto_em=datetime('now')
        WHERE sku = ?`
    ).bind(gravado.key, gravado.tipo, gravado.tamanho, FOTO.ORIGINAL, p.sku).run();
    return { ok: true, status: FOTO.ORIGINAL };
  }

  await db.prepare(
    `UPDATE produtos SET foto_tratada_key=?, foto_tratada_tipo=?, foto_tratada_tam=?,
            foto_status=?, foto_erro=NULL, foto_em=datetime('now') WHERE sku = ?`
  ).bind(gravado.key, gravado.tipo, gravado.tamanho, FOTO.PRONTA, p.sku).run();
  return { ok: true, status: FOTO.PRONTA };
}

/** Os bytes para a rota que o `<img>` do navegador consulta. */
export async function lerFotoParaServir(db, sku, versao, env) {
  const campo = versao === 'tratada' ? 'foto_tratada_key' : 'foto_original_key';
  const p = await db.prepare(`SELECT ${campo} AS chave FROM produtos WHERE sku = ?`)
    .bind(normSku(sku)).first();
  if (!p || !p.chave) return null;
  return lerFoto(env, p.chave);
}

/** Remove as duas versões — do R2 e do D1. Usado quando a peça mudou de
 *  aparência de verdade e as fotos antigas não servem mais para nada. */
export async function removerFotos(db, env, sku) {
  const p = await db.prepare(
    `SELECT sku, foto_original_key, foto_tratada_key FROM produtos WHERE sku = ?`
  ).bind(normSku(sku)).first();
  if (!p) return { erro: 'Produto não encontrado' };

  await Promise.all([apagarFoto(env, p.foto_original_key), apagarFoto(env, p.foto_tratada_key)]);
  await db.prepare(
    `UPDATE produtos SET foto_original_key=NULL, foto_original_tipo=NULL, foto_original_tam=NULL,
            foto_tratada_key=NULL, foto_tratada_tipo=NULL, foto_tratada_tam=NULL,
            foto_status=?, foto_erro=NULL, foto_em=datetime('now') WHERE sku = ?`
  ).bind(FOTO.SEM, p.sku).run();
  return { ok: true, status: FOTO.SEM };
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
 *  A foto original não é pública — mora no R2, atrás da chave da API —
 *  então o serviço não consegue simplesmente baixar uma URL nossa. Em vez
 *  disso os bytes viajam no corpo da chamada (base64) e voltam do mesmo
 *  jeito. Isso também é o que permite testar o fluxo inteiro sem depender
 *  de rede nenhuma: um servidor de mentira no lugar do serviço de verdade
 *  já prova a ida e a volta.
 *
 *  Enquanto `FOTO_FUNDO_URL` não existir, a peça é marcada como
 *  `fundo_pendente` e a resposta diz exatamente o que falta. Ela NÃO é
 *  marcada como pronta, e nenhuma imagem é inventada: uma foto que o
 *  sistema diz ter e não tem é pior que uma foto faltando, porque a
 *  publicação em lote confiaria nela.
 */
export async function gerarFundoBranco(db, env, sku) {
  const p = await db.prepare(
    `SELECT sku, desc, foto_original_key, foto_original_tipo FROM produtos WHERE sku = ?`
  ).bind(normSku(sku)).first();
  if (!p) return { erro: 'Produto não encontrado' };
  if (!p.foto_original_key) return { erro: 'Esta peça ainda não tem foto original para tratar' };

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
    const original = await lerFoto(env, p.foto_original_key);
    if (!original) throw new Error('a foto original não foi encontrada no armazenamento');
    const bytesOriginais = await new Response(original.corpo).arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bytesOriginais)));

    const resp = await fetch(endereco, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.FOTO_FUNDO_TOKEN ? { Authorization: `Bearer ${env.FOTO_FUNDO_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        sku: p.sku, descricao: p.desc, fundo: 'branco',
        imagemBase64: base64, tipoImagem: original.tipo,
      }),
    });
    if (!resp.ok) throw new Error(`o serviço respondeu ${resp.status}`);
    const corpo = await resp.json();
    const saida = String(corpo.imagemBase64 || '').trim();
    if (!saida) throw new Error('o serviço não devolveu a imagem tratada');
    const tipoSaida = String(corpo.tipo || original.tipo || 'image/jpeg');

    const bytesTratados = Uint8Array.from(atob(saida), c => c.charCodeAt(0)).buffer;
    const gravado = await salvarFoto(env, p.sku, 'tratada', bytesTratados, tipoSaida);
    if (gravado.erro) throw new Error(gravado.erro);

    await db.prepare(
      `UPDATE produtos SET foto_tratada_key=?, foto_tratada_tipo=?, foto_tratada_tam=?,
              foto_status=?, foto_erro=NULL, foto_em=datetime('now') WHERE sku=?`
    ).bind(gravado.key, gravado.tipo, gravado.tamanho, FOTO.PRONTA, p.sku).run();
    return { ok: true, status: FOTO.PRONTA };
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
 *
 *  §24: peça sem preço nunca aparece em `prontos` — ela fica bloqueada
 *  para publicação até alguém definir o preço, mesmo com foto e descrição
 *  perfeitas. `semPreco` existe justamente para deixar isso visível, não
 *  para ser um detalhe menor entre os outros.
 */
export async function pendenciasDePublicacao(db) {
  const r = await db.prepare(`
    SELECT p.sku, p.desc, p.cat, p.preco, p.qtd, p.url_loja,
           p.foto_original_key, p.foto_tratada_key, p.foto_status,
           p.qtd - COALESCE((
             SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
               JOIN maletas m ON m.id = mi.maleta_id
              WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')
           ), 0) AS casa
      FROM produtos p
     WHERE p.status = 'ativo'`).all();

  /* As variações que a peça já tem definidas aqui. Elas viajam junto porque
     publicar um produto com variação e publicar um produto simples são dois
     atos diferentes na Nuvemshop, e quem prepara precisa ver isso ANTES —
     descobrir na hora da publicação que a estrutura não existe é descobrir
     tarde.
     
     O que a tela mostra é o NOME ("Cristal", "n° 17"); o `variante_id` fica
     aqui dentro porque é identidade, não informação de tela. */
  const variacoesPorSku = new Map();
  try {
    for (const v of (await db.prepare(
      `SELECT sku, nome, variante_id FROM produto_variacoes ORDER BY sku, ordem, nome`).all()).results) {
      if (!variacoesPorSku.has(v.sku)) variacoesPorSku.set(v.sku, []);
      variacoesPorSku.get(v.sku).push({ nome: v.nome, temId: !!v.variante_id });
    }
  } catch (e) { /* banco sem a tabela: a lista segue sem a coluna de variações */ }

  const prontos = [], semFoto = [], semFundoBranco = [], semDescricao = [], semCategoria = [], semPreco = [];

  for (const p of r.results) {
    if (p.url_loja) continue;             // já está na loja: não é assunto daqui
    if ((p.casa || 0) <= 0) continue;     // sem peça em casa não há o que anunciar

    const vars = variacoesPorSku.get(p.sku) || [];
    const item = {
      sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco, casa: p.casa,
      qtd: p.qtd,
      fotoStatus: p.foto_status || FOTO.SEM,
      variacoes: vars.map(v => v.nome),
      temVariacao: vars.length > 1,
    };
    const falta = [];
    if (!p.foto_original_key) { falta.push('foto'); semFoto.push(item); }
    else if (!p.foto_tratada_key) { falta.push('fundo_branco'); semFundoBranco.push(item); }
    /* "Descrição" aqui é a descrição comercial. A da etiqueta é curta por
       natureza — quando ela é só o próprio código, não há texto nenhum. */
    if (!p.desc || p.desc.trim() === p.sku) { falta.push('descricao'); semDescricao.push(item); }
    if (!p.cat || p.cat === 'Outros') { falta.push('categoria'); semCategoria.push(item); }
    // §24: sem preço NUNCA é "pronto", ponto — não é uma pendência opcional
    if (p.preco == null) { falta.push('preco'); semPreco.push(item); }

    /* `falta` vai DENTRO do item, e não só implícito na lista em que ele
       caiu: uma peça sem foto e sem preço aparece em duas listas, e em
       qualquer uma delas a pergunta seguinte é "o que mais falta?". Sem
       isto a tela respondia com um clique noutra aba. */
    item.falta = falta;
    item.pronto = falta.length === 0;
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

/* ==================================================================== */
/* 0. O CATÁLOGO DE IMAGENS DA LOJA — lido inteiro, guardado inteiro     */
/* ==================================================================== */

/** Todas as imagens de um catálogo da Nuvemshop, já com a amarração que dá
 *  para provar — e só com ela.
 *
 *  Uma imagem pertence a um código quando:
 *
 *   - a VARIANTE declara `image_id` apontando para ela → a imagem é daquela
 *     variante, e o código é o SKU dela. É o caso do anel dourado e do
 *     prateado, e a amarração é por id, nunca por posição;
 *   - ou o produto inteiro carrega UM código só nas variantes → todas as
 *     imagens dele são daquele código.
 *
 *  Fora desses dois casos, `sku_norm` fica NULL. Não é lacuna: é a recusa
 *  de adivinhar. Um produto da loja que junta dois códigos nossos e tem
 *  três fotos soltas não diz de quem é cada foto, e chutar aqui faria a
 *  vitrine anunciar uma peça mostrando outra.
 */
export function galeriaDoCatalogo(produtosLoja) {
  const linhas = [];
  for (const p of produtosLoja || []) {
    const imagens = (p.images || []).slice()
      .sort((a, b) => (a.position || 0) - (b.position || 0));
    if (!imagens.length) continue;

    const varPorImagem = new Map();          // image_id → variante
    const skus = new Set();
    for (const v of p.variants || []) {
      const sku = normSku(v.sku);
      if (sku) skus.add(sku);
      if (v.image_id != null && !varPorImagem.has(String(v.image_id))) {
        varPorImagem.set(String(v.image_id), v);
      }
    }
    const skuUnico = skus.size === 1 ? [...skus][0] : null;

    imagens.forEach((img, i) => {
      const daVariante = varPorImagem.get(String(img.id));
      const sku = daVariante ? normSku(daVariante.sku) : skuUnico;
      linhas.push({
        imagemId: String(img.id),
        produtoId: String(p.id),
        url: img.src,
        posicao: img.position == null ? i + 1 : img.position,
        /* A principal é a de menor posição — a que a vitrine mostra. Vem
           gravada porque "a primeira da lista" depende de como a lista foi
           lida, e quem exibe não deveria ter de saber disso. */
        principal: i === 0 ? 1 : 0,
        skuNorm: sku || null,
        varianteId: daVariante ? String(daVariante.id) : null,
        produtoNome: texto(p.name),
      });
    });
  }
  return linhas;
}

/** Guarda a galeria lida, e devolve o que mudou.
 *
 *  Reescreve por PRODUTO, não por imagem: assim uma foto apagada na loja
 *  some daqui na mesma rodada, em vez de ficar sendo mostrada para sempre
 *  porque ninguém mandou apagar. É o mesmo contrato de `loja_variantes` —
 *  esta tabela é espelho de lá, e espelho que só cresce mente.
 *
 *  Nada aqui encosta em `produtos`, no R2 ou em `foto_status`. A pergunta
 *  "temos os bytes?" continua sendo outra, e a resposta dela continua
 *  vindo das chaves do R2.
 */
export async function guardarGaleria(db, linhas, { seco = false } = {}) {
  const produtos = [...new Set(linhas.map(l => l.produtoId))];
  const resumo = {
    imagens: linhas.length,
    produtos: produtos.length,
    comCodigo: linhas.filter(l => l.skuNorm).length,
    semCodigo: linhas.filter(l => !l.skuNorm).length,
    deVariante: linhas.filter(l => l.varianteId).length,
  };
  if (seco || !linhas.length) return { ...resumo, gravadas: 0 };

  const stmts = [];
  for (const id of produtos) {
    stmts.push(db.prepare(`DELETE FROM loja_fotos WHERE produto_id = ?`).bind(id));
  }
  for (const l of linhas) {
    stmts.push(db.prepare(
      `INSERT INTO loja_fotos (imagem_id, produto_id, url, posicao, principal, sku_norm, variante_id, lido_em)
       VALUES (?,?,?,?,?,?,?, datetime('now'))
       ON CONFLICT(imagem_id) DO UPDATE SET
         produto_id=excluded.produto_id, url=excluded.url, posicao=excluded.posicao,
         principal=excluded.principal, sku_norm=excluded.sku_norm,
         variante_id=excluded.variante_id, lido_em=excluded.lido_em`
    ).bind(l.imagemId, l.produtoId, l.url, l.posicao, l.principal, l.skuNorm, l.varianteId));
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { ...resumo, gravadas: linhas.length };
}

/** O passo que a rodada de sincronização executa, com o catálogo que ela
 *  JÁ leu — nenhuma segunda chamada à loja.
 *
 *  Nunca derruba a rodada: uma tabela que falta ou uma imagem estranha não
 *  podem impedir o estoque de subir. O que der errado vira linha no relato,
 *  que é como o resto deste sistema anuncia o que decidiu não fazer. */
export async function ingerirFotosDoCatalogo(db, produtosLoja, { seco = false } = {}) {
  try {
    return { ok: true, ...(await guardarGaleria(db, galeriaDoCatalogo(produtosLoja), { seco })) };
  } catch (e) {
    return { ok: false, erro: String((e && e.message) || e) };
  }
}

/** A mesma ingestão, disparada sozinha — a ferramenta administrativa.
 *  A rodada normal já faz isto; esta rota existe para contingência e para
 *  quem quiser conferir antes (`seco: true`). */
export async function sincronizarFotosDaLoja(db, env, { seco = false } = {}) {
  const semLoja = lojaDesconectada(env);
  if (semLoja) return { ok: false, erro: semLoja };
  let produtosLoja;
  try {
    produtosLoja = await new Nuvemshop(env).produtos();
  } catch (e) {
    return { ok: false, erro: (e && e.message) || 'A loja não respondeu.' };
  }
  const linhas = galeriaDoCatalogo(produtosLoja);
  const r = await guardarGaleria(db, linhas, { seco });
  return {
    ok: true, seco,
    resumo: r,
    amostra: linhas.slice(0, 50).map(l => ({
      sku: l.skuNorm, produtoId: l.produtoId, varianteId: l.varianteId,
      posicao: l.posicao, principal: !!l.principal, url: l.url,
    })),
  };
}

/** A galeria de UM código, na ordem da loja. A principal primeiro.
 *  Preserva as múltiplas imagens: a tela operacional mostra a principal,
 *  e quem precisar das outras não tem de abrir a Nuvemshop. */
export async function fotosDoSku(db, sku) {
  const k = normSku(sku);
  const r = await db.prepare(
    `SELECT imagem_id, produto_id, url, posicao, principal, variante_id, lido_em
       FROM loja_fotos WHERE sku_norm = ? ORDER BY principal DESC, posicao`).bind(k).all();
  return {
    sku: k,
    total: r.results.length,
    fotos: r.results.map(f => ({
      imagemId: String(f.imagem_id), produtoId: String(f.produto_id), url: f.url,
      posicao: f.posicao, principal: !!f.principal,
      varianteId: f.variante_id ? String(f.variante_id) : null,
      lidoEm: f.lido_em,
    })),
  };
}
