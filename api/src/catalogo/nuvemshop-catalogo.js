/** Catálogo oculto na Nuvemshop — §62.
 *
 *  "Cadastrar na Nuvemshop" e "tornar visível na loja" passam a ser dois
 *  atos. O primeiro é do sistema: peça com estrutura segura nasce na loja
 *  com `visibility = hidden` — tem id, variantes, SKU, estoque, texto; não
 *  aparece e não é comprável (a URL dela responde 404). O segundo é da
 *  pessoa: só um clique em "Publicar na Nuvemshop" troca hidden → visible,
 *  e só depois de conferir tudo de novo na própria loja.
 *
 *  Por que `hidden` e nunca `unlisted`: unlisted some da vitrine mas
 *  continua comprável pelo link direto. Peça incompleta não pode ser
 *  comprável de jeito nenhum.
 *
 *  ── Travas, todas fail-closed ───────────────────────────────────────────
 *
 *   1. `NUVEMSHOP_WRITES_ENABLED` — a trava central de `nuvemshop.js`;
 *   2. `config.nuvemshopCatalogoAtivo` — o kill switch DESTE caminho, no
 *      banco (ausente = desligado). Desligado, nada é criado, nenhum texto
 *      ou foto sobe e ninguém publica; o estoque (§61) segue sem mudança;
 *   3. a criação é sempre `hidden`, e a resposta da loja é CONFERIDA: se ela
 *      disser outra coisa, o produto é escondido de novo na hora, a rodada
 *      para e o kill switch desliga.
 *
 *  ── O que este arquivo NÃO faz ──────────────────────────────────────────
 *
 *  Não inventa preço (sem preço válido a variante vai sem preço, e a peça
 *  não publica). Não reparte estoque: variação sem saldo conhecido nasce
 *  com 0 e a peça não publica. Não muda nome, URL, preço, imagem, texto ou
 *  categoria de produto que já existia na loja. Não publica sozinho.
 */
import { Nuvemshop, mapearSkus, visibilidadeDe, catalogoDeVariantes } from '../nuvemshop.js';
import { lerConfig } from '../plataforma/config.js';
import { normSku } from '../sku.js';
import { lerFoto } from '../fotos-storage.js';
import { gerarTextoDoSite, normalizar, REGRA_TEXTO } from './texto-site.js';
import { chaveDaVariacao, equivalenciasLojaLocal, formatarValorNovo } from '../variacao-nome.js';

export const CHAVE_CATALOGO_ATIVO = 'nuvemshopCatalogoAtivo';
export const CHAVE_MAPA_CATEGORIAS = 'nuvemshopCategoriasMapa';
export const LOTE_PADRAO = 20;
export const LOTE_MAXIMO = 40;
export const MAX_TENTATIVAS = 5;
const ARRENDAMENTO_MS = 10 * 60 * 1000;

const agoraISO = () => new Date().toISOString();
const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });
const texto = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return String(v.pt || v.pt_BR || Object.values(v)[0] || '');
};
const semHtml = (s) => texto(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const json = (s, padrao) => { try { return s ? JSON.parse(s) : padrao; } catch { return padrao; } };
const frase = (e) => String((e && e.message) || e || 'erro desconhecido')
  .replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 500);

async function config(db, chave, padrao) {
  try {
    const r = await db.prepare('SELECT valor FROM config WHERE chave = ?').bind(chave).first();
    if (!r) return padrao;
    return JSON.parse(r.valor);
  } catch { return padrao; }
}
function gravarConfigStmt(db, chave, valor) {
  return db.prepare(
    `INSERT INTO config (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
  ).bind(chave, JSON.stringify(valor));
}
/** O mesmo UPSERT do gatilho de §61 — escrito aqui para este módulo não
 *  depender de `nuvemshop-estoque.js` (que depende dele). */
function enfileirarStmt(db, sku, motivo) {
  return db.prepare(
    `INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
     VALUES (?, 'pendente', ?, 1, ?, 0)
     ON CONFLICT(sku) DO UPDATE SET
       status = 'pendente', motivo = excluded.motivo,
       versao = nuvemshop_fila.versao + 1, pedido_em = excluded.pedido_em,
       tentativas = 0, proxima_em = NULL`,
  ).bind(String(sku), motivo || null, agoraISO());
}

export async function catalogoAtivo(db) {
  return (await config(db, CHAVE_CATALOGO_ATIVO, false)) === true;
}

export async function ligarCatalogo(db, ativo) {
  await db.batch([gravarConfigStmt(db, CHAVE_CATALOGO_ATIVO, !!ativo)]);
  return { ok: true, ativo: !!ativo };
}

/** Por que esta chamada não vai escrever na loja — ou `null`. */
export async function travasDoCatalogo(db, env) {
  const cfg = lerConfig(env).nuvemshop;
  if (!cfg.loja || !cfg.token) return { trava: 'sem_credencial', motivo: 'A loja não está conectada. Falta o token da Nuvemshop.' };
  if (!cfg.escritaHabilitada) {
    return { trava: 'escrita_desativada', motivo: 'Escrita na Nuvemshop desativada neste ambiente (NUVEMSHOP_WRITES_ENABLED).' };
  }
  if (!(await catalogoAtivo(db))) {
    return {
      trava: 'catalogo_desligado',
      motivo: 'O cadastro automático na Nuvemshop está desligado (config.nuvemshopCatalogoAtivo).',
    };
  }
  return null;
}

/* ======================================================================== */
/* 1. A LEITURA                                                              */
/* ======================================================================== */

const SQL_CASA = `p.qtd - COALESCE((
     SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
       JOIN maletas m ON m.id = mi.maleta_id
      WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')
   ), 0)`;

const tentar = async (fn, padrao) => { try { return await fn(); } catch { return padrao; } };
const todas = async (db, sql) => (await db.prepare(sql).all()).results || [];

/** Tudo que a classificação precisa, em poucas consultas (o plano Free do
 *  D1 recusa a 51ª consulta da mesma invocação — §60). */
export async function lerBase(db) {
  const [produtos, montagens, variacoes, nomeados, maletaVar, loja, catalogo, fotos, fila, conf, rascunhos, mapaCat] = await Promise.all([
    todas(db, `SELECT p.sku, p.desc, p.cat, p.preco, p.qtd, p.status, p.produto_id_loja, p.url_loja,
                      p.visivel, p.visibilidade_loja, p.foto_url, p.foto_original_key, p.foto_tratada_key,
                      ${SQL_CASA} AS casa,
                      EXISTS (SELECT 1 FROM kit_componentes kc WHERE kc.kit_sku = p.sku) AS eh_kit
                 FROM produtos p WHERE p.status = 'ativo'`),
    tentar(() => todas(db, 'SELECT sku_comercial FROM personalizacao_modelos WHERE sku_comercial IS NOT NULL'), []),
    todas(db, 'SELECT sku, nome, atributo, variante_id, produto_id, valores_json, origem, ordem FROM produto_variacoes ORDER BY sku, ordem'),
    todas(db, `SELECT sku, variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
                WHERE variacao IS NOT NULL OR variante_id IS NOT NULL GROUP BY sku, variacao, variante_id`),
    tentar(() => todas(db, `SELECT mv.sku, mv.variacao, mv.variante_id, SUM(mv.qtd) AS qtd
                FROM maleta_item_variacoes mv JOIN maletas m ON m.id = mv.maleta_id
               WHERE m.status IN ('aberta','em_acerto') GROUP BY mv.sku, mv.variacao, mv.variante_id`), []),
    tentar(() => todas(db, `SELECT variante_id, produto_id, sku, sku_norm, nome, valores_json, estoque,
                                   preco, locais_json, produto_nome, produto_url, produto_visivel
                              FROM loja_variantes ORDER BY produto_id, posicao`), []),
    tentar(() => todas(db, 'SELECT * FROM nuvemshop_catalogo'), []),
    tentar(() => todas(db, `SELECT id, sku, principal, ordem, original_key, original_tipo, preparada_key,
                                   preparada_tipo, arquivo_nome, imagem_id_loja, url_externa
                              FROM produto_fotos WHERE removida_em IS NULL
                             ORDER BY sku, principal DESC, ordem`), []),
    tentar(() => todas(db, 'SELECT sku, status, motivo, ultimo_erro, resultado_json, sincronizado_em FROM nuvemshop_fila'), []),
    tentar(() => todas(db, `SELECT sku,
              MIN(ns_tem_descricao) AS descricao,
              MIN(ns_tem_seo_titulo) AS seo_titulo,
              MIN(ns_tem_seo_descricao) AS seo_descricao,
              MIN(ns_imagens) AS imagens,
              MAX(ns_categorias) AS categorias,
              GROUP_CONCAT(DISTINCT status) AS status,
              GROUP_CONCAT(DISTINCT motivo) AS motivos,
              MAX(conferido_em) AS conferido_em
         FROM nuvemshop_conferencia WHERE sku IS NOT NULL GROUP BY sku`), []),
    tentar(() => todas(db, 'SELECT sku, nome_site, descricao_site, seo_titulo, seo_descricao FROM catalogo_publicacoes'), []),
    config(db, CHAVE_MAPA_CATEGORIAS, null),
  ]);

  const porSku = (linhas, chave = 'sku') => {
    const m = new Map();
    for (const r of linhas) {
      const k = String(r[chave]);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const lojaPorSku = new Map();
  const nomesDaLoja = new Map();     // produto_id -> { nome, skus:Set }
  let local = null;
  for (const v of loja) {
    if (v.sku_norm) {
      if (!lojaPorSku.has(v.sku_norm)) lojaPorSku.set(v.sku_norm, []);
      lojaPorSku.get(v.sku_norm).push(v);
    }
    const pid = String(v.produto_id);
    if (!nomesDaLoja.has(pid)) nomesDaLoja.set(pid, { nome: v.produto_nome || '', skus: new Set() });
    if (v.sku_norm) nomesDaLoja.get(pid).skus.add(v.sku_norm);
    if (!local) local = (json(v.locais_json, [])[0]) || null;
  }
  return {
    produtos,
    montagens: new Set(montagens.map((x) => String(x.sku_comercial))),
    variacoes: porSku(variacoes),
    nomeados: porSku(nomeados),
    maletaVar: porSku(maletaVar),
    lojaPorSku,
    nomesDaLoja,
    localDeEstoque: local,
    catalogo: new Map(catalogo.map((r) => [String(r.sku), r])),
    fotos: porSku(fotos),
    fila: new Map(fila.map((r) => [String(r.sku), r])),
    conf: new Map(conf.map((r) => [String(r.sku), r])),
    rascunhos: new Map(rascunhos.map((r) => [String(r.sku), r])),
    mapaCategorias: mapaCat && typeof mapaCat === 'object' ? mapaCat : null,
  };
}

/* ======================================================================== */
/* 2. A CLASSIFICAÇÃO                                                        */
/* ======================================================================== */

/** Cor escrita num atributo que se chama "Tamanho" — o que a tela de
 *  variações gravava por padrão em brinco infantil. Mandar "Tamanho: Azul"
 *  para a loja seria publicar um cadastro errado; a pessoa confirma antes. */
const COR = /^(azul|cristal|vermelh[oa]|verde|pink|rosa|roxo|lil[aá]s|marsala|preto|branco|amarelo|incolor|colorid[oa]|dourado|prateado|turquesa|laranja)\b/i;

/** Nome do produto sem o aro e sem a família, para achar o MESMO modelo já
 *  anunciado sob outro código (334078 "… nº27 …" é o aro 27 do 334079, que
 *  a loja já tem como variante). */
export function chaveDoModelo(nome) {
  return normalizar(nome)
    .replace(/\bn\s*[º°o.]?\s*\d{1,2}\b/g, ' ')
    .replace(/^(anel|aneis|brinco|brincos|colar|pulseira)\s+/, '')
    .replace(/\s+/g, ' ').trim();
}

function valoresDe(linha) {
  const v = json(linha.valores_json, null);
  if (Array.isArray(v) && v.length) return v.map((x) => ({ atributo: String(x.atributo || ''), valor: String(x.valor || '') }));
  return [{ atributo: String(linha.atributo || 'Variação'), valor: String(linha.nome || '') }];
}

/** Variações daqui de um código SEM anúncio: a estrutura que subiria, e
 *  quanto de cada uma — ou o motivo de não subir. */
function planoDeVariacoes(p, base) {
  const locais = (base.variacoes.get(p.sku) || []).filter((v) => v.origem === 'local' || !v.origem);
  if (!locais.length) return { variacoes: [], bloqueio: null, estoqueIncerto: false };

  const estruturas = locais.map((l) => valoresDe(l));
  const atributos = estruturas[0].map((x) => x.atributo);
  if (estruturas.some((e) => e.map((x) => x.atributo).join('|') !== atributos.join('|'))) {
    return { bloqueio: 'As variações deste código não têm os mesmos atributos. Revise em Peças › Variações.' };
  }
  if (atributos.some((a) => /tamanho/i.test(a)) && estruturas.some((e) => e.some((x) => /tamanho/i.test(x.atributo) && COR.test(x.valor.trim())))) {
    return { bloqueio: 'Variação com cor gravada no atributo "Tamanho". Confirme o atributo certo (ex.: Cor) antes de criar na loja.' };
  }
  const chaves = locais.map((l) => chaveDaVariacao(l.nome));
  if (new Set(chaves).size !== chaves.length) return { bloqueio: 'Duas variações daqui são o mesmo valor escrito de jeitos diferentes.' };

  const nomeados = base.nomeados.get(p.sku) || [];
  const totalNomeado = nomeados.reduce((s, r) => s + Number(r.saldo || 0), 0);
  const consignado = Math.max(0, Number(p.qtd) - Number(p.casa));
  const maleta = base.maletaVar.get(p.sku) || [];
  const identificado = maleta.reduce((s, r) => s + Number(r.qtd || 0), 0);
  const saldoDe = (nome) => nomeados.filter((r) => r.variacao != null && chaveDaVariacao(r.variacao) === chaveDaVariacao(nome))
    .reduce((s, r) => s + Number(r.saldo || 0), 0);
  const foraDe = (nome) => maleta.filter((r) => r.variacao != null && chaveDaVariacao(r.variacao) === chaveDaVariacao(nome))
    .reduce((s, r) => s + Number(r.qtd || 0), 0);

  let estoqueIncerto = false;
  const variacoes = locais.map((l, i) => {
    let estoque;
    if (locais.length === 1 && totalNomeado === 0) {
      /* Uma variação só: todas as peças do código são ela. */
      estoque = Math.max(0, Number(p.casa));
    } else if (Number(p.qtd) === totalNomeado && consignado <= identificado) {
      estoque = Math.max(0, saldoDe(l.nome) - foraDe(l.nome));
    } else {
      estoque = 0;
      estoqueIncerto = true;
    }
    return { nome: l.nome, valores: estruturas[i], estoque };
  });
  return { variacoes, atributos, bloqueio: null, estoqueIncerto };
}

/** O texto que subiria: o rascunho escrito por gente vence o gerado. */
function textoDaPeca(p, base, nomesIguais) {
  const r = base.rascunhos.get(p.sku);
  const gerado = gerarTextoDoSite({ nome: p.desc, sku: p.sku, nomesIguais });
  const escolhe = (humano, campo) => (String(humano || '').trim() ? String(humano).trim() : (gerado.ok ? gerado[campo] : null));
  const descricao = escolhe(r?.descricao_site, 'descricao');
  return {
    descricao: descricao && !/^</.test(descricao) ? `<p>${descricao.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : descricao,
    seoTitulo: escolhe(r?.seo_titulo, 'seoTitulo'),
    seoDescricao: escolhe(r?.seo_descricao, 'seoDescricao'),
    origem: r && (r.descricao_site || r.seo_titulo) ? 'rascunho' : (gerado.ok ? REGRA_TEXTO : null),
    precisaInformacao: gerado.ok ? null : gerado.motivo,
  };
}

function temFotoPropria(p, base) {
  return (base.fotos.get(p.sku) || []).some((f) => f.original_key || f.preparada_key);
}

/** A situação de cada peça ativa na Nuvemshop, numa linha só.
 *
 *    nao_cadastrado  a loja não tem o código
 *    oculto          existe na loja e não está visível (hidden ou unlisted)
 *                    — e falta alguma coisa para publicar
 *    pronto          existe oculto e cumpre todos os requisitos
 *    publicado       visible na loja
 *    erro            criação, publicação ou envio de estoque falhou
 */
export function classificarCatalogo(base) {
  const nomesModelo = new Map();
  for (const [pid, info] of base.nomesDaLoja) {
    const k = chaveDoModelo(info.nome);
    if (!k) continue;
    if (!nomesModelo.has(k)) nomesModelo.set(k, []);
    nomesModelo.get(k).push({ produtoId: pid, skus: [...info.skus] });
  }
  const contaNomes = new Map();
  for (const p of base.produtos) {
    const k = normalizar(p.desc);
    contaNomes.set(k, (contaNomes.get(k) || 0) + 1);
  }
  for (const info of base.nomesDaLoja.values()) {
    const k = normalizar(info.nome);
    contaNomes.set(k, (contaNomes.get(k) || 0) + 1);
  }

  const itens = [];
  for (const p of base.produtos) {
    const sku = String(p.sku);
    const n = normSku(sku);
    const naLoja = base.lojaPorSku.get(n) || [];
    const linha = base.catalogo.get(sku) || null;
    const fila = base.fila.get(sku) || null;
    const conf = base.conf.get(sku) || null;
    const qtd = Number(p.qtd || 0);
    const casa = Number(p.casa || 0);
    const produtoId = p.produto_id_loja || linha?.produto_id || (naLoja[0] ? String(naLoja[0].produto_id) : null);
    const existe = !!produtoId || naLoja.length > 0;
    if (!existe && qtd <= 0) continue;   // sem peça e sem anúncio: nada a preparar

    const pend = [];
    const bloqueios = [];
    const add = (chave, motivo) => { if (!pend.some((x) => x.chave === chave)) pend.push({ chave, motivo }); };

    const preco = Number(p.preco);
    const precoOk = Number.isFinite(preco) && preco > 0;
    let visibilidade = p.visibilidade_loja || linha?.visibilidade || null;
    if (!visibilidade && existe && Number(p.visivel) === 1) visibilidade = 'visible';
    /* Sem leitura nenhuma da visibilidade (banco antigo, antes da primeira
       conferência): vale a observação de sempre — anúncio com URL na loja e
       sem marca de oculto era tratado como publicado. */
    if (!visibilidade && existe && p.visivel == null && p.url_loja && !linha) visibilidade = 'visible';
    const eKit = !!p.eh_kit || base.montagens.has(sku);

    let item = {
      sku, nome: p.desc, categoria: p.cat, preco: precoOk ? preco : null, casa, qtd,
      naLoja: existe, produtoId, visibilidade,
      estadoCatalogo: linha?.estado || null,
      origemCatalogo: linha?.origem || null,
      criavel: false, bloqueios, pendencias: pend,
      variacoes: [], texto: null,
      estoque: fila ? fila.status : null,
      ultimoErro: linha?.estado === 'erro' ? linha.ultimo_erro : (fila?.status === 'erro' ? fila.ultimo_erro : null),
      sincronizadoEm: fila?.sincronizado_em || null,
      fotoNaLoja: null, textoNaLoja: null,
    };

    if (!existe) {
      /* ── peça que a loja ainda não tem ─────────────────────────────── */
      if (eKit) bloqueios.push('Kit e Monte seu Colar não viram anúncio por este caminho: o disponível deles é calculado das peças.');
      if (normalizar(p.desc) === normalizar(sku) || !String(p.desc || '').trim()) {
        bloqueios.push('Falta o nome comercial (o nome é só o código).');
        add('nome', 'Falta o nome comercial (o nome é só o código).');
      }
      const modelo = nomesModelo.get(chaveDoModelo(p.desc));
      if (modelo && modelo.length) {
        bloqueios.push(`Pode ser o mesmo modelo já anunciado sob ${modelo.flatMap((m) => m.skus).join(', ') || 'outro código'}. Confirme antes de criar outro anúncio.`);
      }
      const plano = planoDeVariacoes(p, base);
      if (plano.bloqueio) bloqueios.push(plano.bloqueio);
      item.variacoes = plano.variacoes || [];
      item.atributos = plano.atributos || [];
      if (plano.estoqueIncerto) add('estoque_variacao', 'Variação aguardando conferência de estoque: o saldo daqui não diz quanto é de cada uma.');
      if (plano.bloqueio) add('variacao', plano.bloqueio);

      const t = textoDaPeca(p, base, Math.max(0, (contaNomes.get(normalizar(p.desc)) || 1) - 1));
      item.texto = t;
      if (!t.descricao) add('descricao', t.precisaInformacao || 'Falta descrição.');
      if (!t.seoTitulo || !t.seoDescricao) add('seo', t.precisaInformacao || 'Falta SEO.');
      if (!precoOk) add('preco', 'Sem preço comercial válido: cria oculto sem preço; não publica.');
      if (!temFotoPropria(p, base)) add('foto', 'Falta foto.');
      const catId = base.mapaCategorias ? base.mapaCategorias[normalizar(p.cat)] : undefined;
      if (base.mapaCategorias && !catId) add('categoria', `A categoria "${p.cat}" não existe com o mesmo nome na loja.`);
      item.criavel = bloqueios.length === 0;
      item.situacao = 'nao_cadastrado';
      if (linha?.estado === 'erro') item.situacao = 'erro';
      itens.push(item);
      continue;
    }

    /* ── peça que existe na loja ─────────────────────────────────────── */
    const conteudo = json(linha?.conteudo_json, null);
    const statusConf = String(conf?.status || '').split(',');
    const motivosConf = String(conf?.motivos || '');
    /* A conferência sabe o que o anúncio tem; antes da primeira conferência
       depois de criado (NULL), vale o que este caminho enviou. */
    const sabe = (x) => conf && conf[x] != null;
    const temDescricao = sabe('descricao') ? Number(conf.descricao) === 1 : !!conteudo?.descricao;
    const temSeo = sabe('seo_titulo') && sabe('seo_descricao')
      ? (Number(conf.seo_titulo) === 1 && Number(conf.seo_descricao) === 1)
      : !!(conteudo?.seoTitulo && conteudo?.seoDescricao);
    const temFoto = sabe('imagens') ? Number(conf.imagens) > 0 : !!linha?.foto_id_loja;
    const temCategoria = conf && conf.categorias != null
      ? Number(conf.categorias) > 0
      : (base.mapaCategorias ? !!base.mapaCategorias[normalizar(p.cat)] : null);
    item.fotoNaLoja = temFoto;
    item.textoNaLoja = { descricao: temDescricao, seo: temSeo };
    if (!temFoto) add('foto', temFotoPropria(p, base) ? 'A foto daqui ainda não subiu para a loja.' : 'Falta foto.');
    if (!temDescricao) add('descricao', 'O anúncio está sem descrição.');
    if (!temSeo) add('seo', 'O anúncio está sem título ou meta description de SEO.');
    if (!precoOk) add('preco', 'Sem preço comercial válido.');
    if (temCategoria === false) add('categoria', 'O anúncio está sem categoria na loja.');

    const sincronia = fila?.status || null;
    if (sincronia === 'revisao' || statusConf.includes('variante_sem_mapeamento')) {
      const motivo = String(fila?.ultimo_erro || motivosConf || '');
      add('estoque_variacao', /maleta/i.test(motivo)
        ? 'Maleta sem variação definida: falta dizer qual variação a revendedora levou.'
        : 'Variação aguardando conferência de estoque: falta repartir o saldo entre as variações.');
    }
    /* Variações criadas aqui sem par na loja: a peça física existe, o
       anúncio não tem a opção. */
    const locais = (base.variacoes.get(sku) || []).filter((v) => v.origem === 'local');
    if (locais.length && naLoja.length) {
      const eq = equivalenciasLojaLocal(naLoja, locais);
      const pareadas = new Set([...eq.values()].map(String));
      const faltam = locais.filter((l) => !pareadas.has(String(l.variante_id))
        && !naLoja.some((v) => chaveDaVariacao(v.nome) === chaveDaVariacao(l.nome)));
      if (faltam.length) add('variacao', `Variação só no Marquesa: ${faltam.map((l) => l.nome).join(', ')}.`);
      item.variacoesSoAqui = faltam.map((l) => l.nome);
    }
    if (statusConf.includes('sku_duplicado')) add('variacao', 'O mesmo SKU está em mais de um produto da loja.');
    if (statusConf.includes('sem_sku')) add('variacao', 'Variante sem SKU na loja.');

    const erro = linha?.estado === 'erro' || sincronia === 'erro' || statusConf.includes('erro_integracao');
    if (visibilidade === 'unlisted') add('link_direto', 'Está "não listado": some da vitrine mas é comprável pelo link direto.');
    if (erro) item.situacao = 'erro';
    else if (visibilidade === 'visible') item.situacao = 'publicado';
    else if (pend.filter((x) => x.chave !== 'link_direto').length === 0 && sincronia === 'sincronizado') item.situacao = 'pronto';
    else item.situacao = 'oculto';
    if (item.situacao === 'oculto' && sincronia !== 'sincronizado' && !pend.some((x) => x.chave.startsWith('estoque'))) {
      add('estoque', sincronia === 'pendente' ? 'Estoque aguardando o primeiro envio.' : 'Estoque ainda não confirmado na loja.');
    }
    itens.push(item);
  }

  const resumo = { porSituacao: {}, pendencias: {}, criaveis: 0, bloqueados: 0 };
  for (const x of itens) {
    resumo.porSituacao[x.situacao] = (resumo.porSituacao[x.situacao] || 0) + 1;
    for (const p of x.pendencias) resumo.pendencias[p.chave] = (resumo.pendencias[p.chave] || 0) + 1;
    if (x.situacao === 'nao_cadastrado') { if (x.criavel) resumo.criaveis++; else resumo.bloqueados++; }
  }
  return { itens, resumo };
}

/* ======================================================================== */
/* 3. CRIAR OCULTO                                                           */
/* ======================================================================== */

/** O corpo do POST /products. Tudo que vai aqui é dado nosso; nada é
 *  inventado: sem preço válido a variante vai SEM preço (a loja trata como
 *  "consultar" e o produto oculto não é comprável de qualquer forma). */
export function corpoDoProdutoOculto(item, { localDeEstoque = null, categoriaId = null } = {}) {
  const estoqueDe = (n) => (localDeEstoque
    ? { inventory_levels: [{ location_id: localDeEstoque, stock: Math.max(0, Number(n) || 0) }] }
    : { stock: Math.max(0, Number(n) || 0) });
  const preco = item.preco != null && Number(item.preco) > 0 ? { price: Number(item.preco).toFixed(2) } : {};
  const corpo = {
    name: { pt: String(item.nome).trim() },
    visibility: 'hidden',
  };
  if (item.texto?.descricao) corpo.description = { pt: item.texto.descricao };
  if (item.texto?.seoTitulo) corpo.seo_title = { pt: item.texto.seoTitulo };
  if (item.texto?.seoDescricao) corpo.seo_description = { pt: item.texto.seoDescricao };
  if (categoriaId) corpo.categories = [Number(categoriaId) || categoriaId];
  if (item.variacoes && item.variacoes.length) {
    corpo.attributes = item.atributos.map((a) => ({ pt: a }));
    corpo.variants = item.variacoes.map((v) => ({
      sku: item.sku, ...preco,
      values: v.valores.map((x) => ({ pt: x.valor })),
      ...estoqueDe(v.estoque),
    }));
  } else {
    corpo.variants = [{ sku: item.sku, ...preco, ...estoqueDe(item.casa) }];
  }
  return corpo;
}

function confereCriado(produto, corpo, sku) {
  const problemas = [];
  if (!produto || produto.id == null) problemas.push('a loja não devolveu o id do produto');
  const vs = (produto && produto.variants) || [];
  if (vs.length !== corpo.variants.length) problemas.push(`a loja devolveu ${vs.length} variante(s), eram ${corpo.variants.length}`);
  if (vs.some((v) => normSku(v.sku) !== normSku(sku))) problemas.push('SKU da variante diferente do código');
  return problemas;
}

function estoqueDaVariante(v) {
  if (Array.isArray(v.inventory_levels) && v.inventory_levels.length) {
    return v.inventory_levels.reduce((s, n) => s + (n.stock == null ? NaN : Number(n.stock)), 0);
  }
  return v.stock == null || v.stock === '' ? NaN : Number(v.stock);
}

/** Garante hidden. Devolve a visibilidade final confirmada pela leitura. */
async function garantirOculto(loja, produtoId, visto) {
  if (visibilidadeDe(visto) === 'hidden') return 'hidden';
  await loja.atualizarProduto(produtoId, { visibility: 'hidden' });
  let relido = await loja.produto(produtoId);
  if (visibilidadeDe(relido) === 'hidden') return 'hidden';
  /* Loja que não conhece `visibility`: `published: false` ao menos tira
     da vitrine (pode ficar unlisted — por isso a rodada para de qualquer
     jeito). */
  await loja.atualizarProduto(produtoId, { published: false });
  relido = await loja.produto(produtoId);
  return visibilidadeDe(relido) || (relido && relido.published === false ? 'nao_publicado' : null);
}

/** Linhas do espelho `loja_variantes` para um produto recém-lido. */
function espelhoStmts(db, produto) {
  const em = agoraISO();
  return catalogoDeVariantes([produto]).map((v) => db.prepare(
    `INSERT INTO loja_variantes (variante_id, produto_id, sku, sku_norm, valores_json, nome, estoque,
       preco, promocional, imagem_url, locais_json, produto_nome, produto_url, produto_visivel, posicao, lido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(variante_id) DO UPDATE SET produto_id=excluded.produto_id, sku=excluded.sku,
       sku_norm=excluded.sku_norm, valores_json=excluded.valores_json, nome=excluded.nome,
       estoque=excluded.estoque, preco=excluded.preco, promocional=excluded.promocional,
       imagem_url=excluded.imagem_url, locais_json=excluded.locais_json,
       produto_nome=excluded.produto_nome, produto_url=excluded.produto_url,
       produto_visivel=excluded.produto_visivel, posicao=excluded.posicao, lido_em=excluded.lido_em`,
  ).bind(String(v.varianteId), String(v.produtoId), v.sku || null, normSku(v.sku) || null,
    JSON.stringify(v.valores || []), v.nome || null, Number.isFinite(v.estoque) ? v.estoque : null,
    v.preco, v.promocional, v.imagemUrl, JSON.stringify(v.locais || []), v.produtoNome,
    v.produtoUrl, v.produtoVisivel == null ? null : (v.produtoVisivel ? 1 : 0), v.posicao, em));
}

/** Liga o código ao anúncio: `produto_id_loja` (o gatilho de §61 põe o
 *  código na fila de estoque), o espelho e a linha do catálogo. */
function vincularStmts(db, sku, produto, { estado, origem, conteudo = null, variacoesLigadas = [] }) {
  const em = agoraISO();
  const pid = String(produto.id);
  const vis = visibilidadeDe(produto);
  const stmts = [
    db.prepare(
      `INSERT INTO nuvemshop_catalogo (sku, estado, origem, produto_id, visibilidade, variantes_json,
         conteudo_json, conteudo_enviado_em, tentativas, ultimo_erro, travado_ate, criado_em, atualizado_em)
       VALUES (?,?,?,?,?,?,?,?,0,NULL,NULL,?,?)
       ON CONFLICT(sku) DO UPDATE SET estado=excluded.estado, origem=COALESCE(nuvemshop_catalogo.origem, excluded.origem),
         produto_id=excluded.produto_id, visibilidade=excluded.visibilidade, variantes_json=excluded.variantes_json,
         conteudo_json=COALESCE(excluded.conteudo_json, nuvemshop_catalogo.conteudo_json),
         conteudo_enviado_em=COALESCE(excluded.conteudo_enviado_em, nuvemshop_catalogo.conteudo_enviado_em),
         tentativas=0, ultimo_erro=NULL, travado_ate=NULL,
         criado_em=COALESCE(nuvemshop_catalogo.criado_em, excluded.criado_em), atualizado_em=excluded.atualizado_em`,
    ).bind(sku, estado, origem, pid, vis,
      JSON.stringify((produto.variants || []).map((v) => ({ varianteId: String(v.id), sku: v.sku, valores: (v.values || []).map(texto) }))),
      conteudo ? JSON.stringify(conteudo) : null, conteudo ? em : null, em, em),
    db.prepare(
      `UPDATE produtos SET produto_id_loja = ?, url_loja = ?, visivel = ?, visibilidade_loja = ?, nome_loja = ?
        WHERE sku = ?`,
    ).bind(pid, texto(produto.handle) || pid, vis === 'visible' ? 1 : 0, vis, texto(produto.name) || null, sku),
    ...espelhoStmts(db, produto),
  ];
  for (const l of variacoesLigadas) {
    stmts.push(db.prepare(
      `UPDATE produto_variacoes SET variante_id = ?, produto_id = ?, origem = 'loja', variante_sku = ?
        WHERE sku = ? AND nome = ?`).bind(l.varianteId, pid, sku, sku, l.nome));
    stmts.push(db.prepare(
      `UPDATE maleta_item_variacoes SET variante_id = ? WHERE sku = ? AND variacao = ?`).bind(l.varianteId, sku, l.nome));
  }
  return stmts;
}

/** Mapa categoria daqui → id da categoria da loja, SÓ por nome igual
 *  (sem acento e sem caixa), e só categoria raiz. Não há mapa por
 *  semelhança: "Argola" não vira "Brincos" por palpite. */
export function mapearCategorias(categoriasLoja) {
  const mapa = {};
  for (const c of categoriasLoja || []) {
    const raiz = c.parent == null || Number(c.parent) === 0;
    if (!raiz) continue;
    const k = normalizar(texto(c.name));
    if (k && mapa[k] == null) mapa[k] = String(c.id);
  }
  return mapa;
}

/** A rodada de criação. `seco` (padrão) lê tudo e devolve o corpo EXATO de
 *  cada POST, sem escrever. Sem `seco`, cria no máximo `limite` produtos.
 *
 *  Antes de qualquer POST a loja inteira é lida (4 páginas): código que já
 *  está lá é ADOTADO (vínculo gravado), nunca criado de novo. Isso cobre o
 *  Worker que morreu entre o POST e a gravação — a próxima rodada encontra
 *  o produto e só registra. */
export async function criarOcultos(db, env, { limite = LOTE_PADRAO, seco = true, skus = null, loja: lojaDada = null } = {}) {
  const trava = await travasDoCatalogo(db, env);
  const relato = {
    ok: true, seco: seco || !!trava, trava: trava ? trava.trava : null, motivo: trava ? trava.motivo : null,
    lidos: 0, adotados: 0, criados: 0, erros: 0, ignorados: 0, chamadasLoja: 0, itens: [],
  };
  const loja = lojaDada || new Nuvemshop(env);
  if (!loja.configurada()) return { ...relato, ok: false, erro: 'A loja não está conectada.' };

  const produtosLoja = await loja.produtos();
  relato.chamadasLoja += Math.max(1, Math.ceil(produtosLoja.length / 200));
  let categoriasLoja = [];
  try { categoriasLoja = await loja.categorias(); relato.chamadasLoja++; } catch { categoriasLoja = []; }
  const mapaCategorias = mapearCategorias(categoriasLoja);

  const { mapa, duplicados } = mapearSkus(produtosLoja);
  const base = await lerBase(db);
  base.mapaCategorias = mapaCategorias;
  /* O espelho pode estar velho: o que a leitura FRESCA da loja diz manda
     na deduplicação. */
  for (const p of produtosLoja) {
    for (const v of p.variants || []) {
      const k = normSku(v.sku);
      if (k && !base.lojaPorSku.has(k)) base.lojaPorSku.set(k, [{ produto_id: String(p.id), sku_norm: k, nome: '', valores_json: '[]' }]);
    }
    const pid = String(p.id);
    if (!base.nomesDaLoja.has(pid)) {
      base.nomesDaLoja.set(pid, { nome: texto(p.name), skus: new Set((p.variants || []).map((v) => normSku(v.sku)).filter(Boolean)) });
    }
  }
  if (!base.localDeEstoque) {
    for (const p of produtosLoja) {
      const l = (p.variants || []).flatMap((v) => (v.inventory_levels || []).map((n) => n.location_id))[0];
      if (l) { base.localDeEstoque = l; break; }
    }
  }
  const { itens } = classificarCatalogo(base);
  relato.lidos = produtosLoja.length;

  /* 1. Adotar: código ativo cujo SKU a loja tem, mas que aqui não está
        ligado (ou ficou em "criando"). */
  const adotar = [];
  for (const p of base.produtos) {
    const k = normSku(p.sku);
    const e = mapa.get(k);
    if (!e || duplicados.includes(k)) continue;
    const linha = base.catalogo.get(String(p.sku));
    const precisa = !p.produto_id_loja || String(p.produto_id_loja) !== String(e.produtoId)
      || (linha && linha.estado === 'criando');
    if (!precisa) continue;
    const produto = produtosLoja.find((x) => String(x.id) === String(e.produtoId));
    if (produto) adotar.push({ sku: String(p.sku), produto, criando: linha?.estado === 'criando' });
  }

  const filtro = Array.isArray(skus) && skus.length ? new Set(skus.map((s) => normSku(s))) : null;
  const agora = agoraISO();
  const candidatos = itens.filter((x) => x.situacao !== 'publicado' && !x.naLoja && x.criavel
    && !mapa.has(normSku(x.sku))
    && (!filtro || filtro.has(normSku(x.sku)))
    && (() => {
      const l = base.catalogo.get(x.sku);
      if (!l) return true;
      if (l.estado === 'erro') return Number(l.tentativas || 0) < MAX_TENTATIVAS;
      if (l.estado === 'criando') return !l.travado_ate || l.travado_ate < agora;
      return false;
    })());
  relato.ignorados = itens.filter((x) => x.situacao === 'nao_cadastrado' && !x.criavel).length;
  const lote = candidatos.slice(0, Math.max(0, Math.min(Number(limite) || LOTE_PADRAO, LOTE_MAXIMO)));

  const corpos = lote.map((x) => ({
    item: x,
    corpo: corpoDoProdutoOculto(x, { localDeEstoque: base.localDeEstoque, categoriaId: mapaCategorias[normalizar(x.categoria)] || null }),
  }));

  if (seco || trava) {
    relato.adotariam = adotar.map((a) => ({ sku: a.sku, produtoId: String(a.produto.id), visibilidade: visibilidadeDe(a.produto) }));
    relato.criaveis = candidatos.length;
    relato.itens = corpos.map(({ item, corpo }) => ({ sku: item.sku, nome: item.nome, enviaria: corpo, pendencias: item.pendencias.map((p) => p.chave) }));
    relato.mapaCategorias = mapaCategorias;
    return relato;
  }

  /* Adoções gravadas primeiro: elas tiram da lista de criação quem já
     existe, e não chamam a loja. */
  const stmtsAdocao = [gravarConfigStmt(db, CHAVE_MAPA_CATEGORIAS, mapaCategorias)];
  for (const a of adotar) {
    const vis = visibilidadeDe(a.produto);
    stmtsAdocao.push(...vincularStmts(db, a.sku, a.produto, {
      estado: vis === 'visible' ? 'visivel' : 'oculto', origem: a.criando ? 'criado' : 'adotado',
    }));
    relato.adotados++;
    relato.itens.push({ sku: a.sku, acao: 'adotado', produtoId: String(a.produto.id), visibilidade: vis });
  }
  for (let i = 0; i < stmtsAdocao.length; i += 200) await db.batch(stmtsAdocao.slice(i, i + 200));

  if (!corpos.length) return relato;

  /* 2. Reservar o lote. Quem não ficar com a reserva é de outra rodada. */
  const token = `${new Date(Date.now() + ARRENDAMENTO_MS).toISOString()}#${Math.random().toString(36).slice(2, 8)}`;
  await db.batch(corpos.map(({ item }) => db.prepare(
    `INSERT INTO nuvemshop_catalogo (sku, estado, origem, tentativas, travado_ate, pedido_em, atualizado_em)
     VALUES (?, 'criando', 'criado', 0, ?, ?, ?)
     ON CONFLICT(sku) DO UPDATE SET estado = 'criando', travado_ate = excluded.travado_ate,
       pedido_em = excluded.pedido_em, atualizado_em = excluded.atualizado_em
     WHERE (nuvemshop_catalogo.estado = 'erro' AND nuvemshop_catalogo.tentativas < ${MAX_TENTATIVAS})
        OR (nuvemshop_catalogo.estado = 'criando'
            AND (nuvemshop_catalogo.travado_ate IS NULL OR nuvemshop_catalogo.travado_ate < ?))`,
  ).bind(item.sku, token, agora, agora, agora)));
  const reservados = new Set(((await db.prepare(
    `SELECT sku FROM nuvemshop_catalogo WHERE estado = 'criando' AND travado_ate = ?`).bind(token).all()).results || [])
    .map((r) => String(r.sku)));

  const stmts = [];
  let parar = null;
  for (const { item, corpo } of corpos) {
    if (!reservados.has(item.sku)) continue;
    if (parar) { stmts.push(soltarStmt(db, item.sku)); continue; }
    try {
      const criado = await loja.criarProduto(corpo);
      relato.chamadasLoja++;
      const problemas = confereCriado(criado, corpo, item.sku);
      let produto = criado;
      let vis = visibilidadeDe(criado);
      if (criado && criado.id != null && vis !== 'hidden') {
        /* A loja não confirmou hidden. Esconder JÁ, reler, e parar tudo. */
        const respondeu = vis;
        vis = await garantirOculto(loja, criado.id, criado);
        relato.chamadasLoja += 4;
        produto = await loja.produto(criado.id);
        relato.chamadasLoja++;
        /* A rodada para MESMO que a correção tenha funcionado: a loja criou
           sem respeitar hidden, e o próximo produto também nasceria visível
           por alguns segundos. Alguém precisa olhar antes de religar. */
        parar = `A loja não confirmou visibility=hidden para ${item.sku} (respondeu ${respondeu || 'sem o campo'}; `
          + `depois da correção: ${vis || 'desconhecida'}). Rodada interrompida e cadastro automático desligado.`;
        problemas.push(parar);
      }
      if (problemas.length || !produto || produto.id == null) {
        const erro = problemas.join('; ') || 'resposta inesperada da loja';
        if (produto && produto.id != null) {
          /* Existe lá: o vínculo é gravado de qualquer jeito (para nunca
             criar de novo), com o estado de erro para alguém olhar. */
          stmts.push(...vincularStmts(db, item.sku, produto, { estado: 'erro', origem: 'criado' }));
          stmts.push(db.prepare(`UPDATE nuvemshop_catalogo SET estado='erro', ultimo_erro=?, tentativas=${MAX_TENTATIVAS} WHERE sku=?`)
            .bind(erro.slice(0, 500), item.sku));
        } else {
          stmts.push(erroStmt(db, item.sku, erro));
        }
        relato.erros++;
        relato.itens.push({ sku: item.sku, acao: 'erro', erro });
        continue;
      }
      const ligadas = (item.variacoes.length > 1)
        ? item.variacoes.map((v, i) => ({ nome: v.nome, varianteId: String(produto.variants[i].id) }))
        : [];
      const estoques = (produto.variants || []).map(estoqueDaVariante);
      stmts.push(...vincularStmts(db, item.sku, produto, {
        estado: 'oculto', origem: 'criado',
        conteudo: item.texto?.descricao || item.texto?.seoTitulo
          ? { descricao: item.texto.descricao, seoTitulo: item.texto.seoTitulo, seoDescricao: item.texto.seoDescricao, regra: item.texto.origem }
          : null,
        variacoesLigadas: ligadas,
      }));
      relato.criados++;
      relato.itens.push({
        sku: item.sku, acao: 'criado', produtoId: String(produto.id), visibilidade: vis,
        variantes: (produto.variants || []).map((v) => String(v.id)), estoques,
      });
    } catch (e) {
      relato.chamadasLoja++;
      stmts.push(erroStmt(db, item.sku, frase(e)));
      relato.erros++;
      relato.itens.push({ sku: item.sku, acao: 'erro', erro: frase(e) });
      /* 401/403/429 persistentes e queda da loja param a rodada: insistir
         só gastaria tentativas de todo o lote. 422 é do produto e segue. */
      if (e && (e.status === 401 || e.status === 403 || e.status >= 500)) parar = frase(e);
    }
  }
  if (parar && /hidden/.test(parar)) stmts.push(gravarConfigStmt(db, CHAVE_CATALOGO_ATIVO, false));
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  if (parar) relato.interrompido = parar;
  return relato;
}

function erroStmt(db, sku, erro) {
  return db.prepare(
    `UPDATE nuvemshop_catalogo SET estado = 'erro', ultimo_erro = ?, tentativas = tentativas + 1,
            travado_ate = NULL, atualizado_em = ? WHERE sku = ?`).bind(String(erro).slice(0, 500), agoraISO(), sku);
}
function soltarStmt(db, sku) {
  return db.prepare(
    `UPDATE nuvemshop_catalogo SET estado = 'erro', ultimo_erro = 'Rodada interrompida antes deste código.',
            travado_ate = NULL, atualizado_em = ? WHERE sku = ? AND estado = 'criando'`).bind(agoraISO(), sku);
}

/* ======================================================================== */
/* 4. VARIANTE QUE FALTA NUM ANÚNCIO QUE JÁ EXISTE                           */
/* ======================================================================== */

/** As variações criadas aqui que o anúncio ainda não tem — e se dá para
 *  criá-las lá SEM mexer no que já sincroniza.
 *
 *  Só quando TUDO vale:
 *   - o anúncio já tem 2+ variantes (anúncio de variante única ganharia uma
 *     segunda e o código inteiro sairia do envio de estoque — §61 — até
 *     alguém repartir; é intervenção, não automação);
 *   - o código já está em revisão na fila (não sincroniza hoje), então
 *     criar a opção não tira de circulação um número que estava certo;
 *   - os atributos da variação daqui são exatamente os do anúncio.
 *
 *  A variante nasce com estoque 0 e o PREÇO comum das irmãs (se elas não
 *  têm um preço comum, não cria). O valor segue a grafia das irmãs
 *  ("nº17" → "n°17" quando elas são "n°22"), e a variação daqui passa a ter
 *  o mesmo nome e o id da loja — desde que nenhum movimento ou maleta use o
 *  nome antigo. */
export function planoDeVariantesFaltantes(base) {
  const planos = [];
  for (const [sku, linhas] of base.variacoes) {
    const locais = linhas.filter((l) => l.origem === 'local');
    if (!locais.length) continue;
    const n = normSku(sku);
    const naLoja = base.lojaPorSku.get(n) || [];
    if (naLoja.length < 2) continue;
    const pids = new Set(naLoja.map((v) => String(v.produto_id)));
    if (pids.size !== 1) continue;
    const fila = base.fila.get(sku);
    if (!fila || fila.status !== 'revisao') continue;
    const eq = equivalenciasLojaLocal(naLoja, locais);
    const pareadas = new Set([...eq.values()].map(String));
    const atributosLoja = valoresDe(naLoja[0]).map((x) => x.atributo);
    const precos = new Set(naLoja.map((v) => (v.preco == null ? 'null' : Number(v.preco).toFixed(2))));
    for (const l of locais) {
      if (pareadas.has(String(l.variante_id))) continue;
      if (naLoja.some((v) => chaveDaVariacao(v.nome) === chaveDaVariacao(l.nome))) continue;
      const valores = valoresDe(l);
      const motivo = [];
      if (valores.map((x) => x.atributo).join('|') !== atributosLoja.join('|')) motivo.push(`atributos diferentes do anúncio (${atributosLoja.join(' · ')})`);
      if (precos.size !== 1 || precos.has('null')) motivo.push('as variantes do anúncio não têm um preço comum');
      const usados = (base.nomeados.get(sku) || []).some((r) => r.variacao === l.nome)
        || (base.maletaVar.get(sku) || []).some((r) => r.variacao === l.nome);
      const formatados = valores.map((x, i) => {
        const irmas = naLoja.map((v) => (valoresDe(v)[i] || {}).valor).filter(Boolean);
        return { atributo: x.atributo, valor: usados ? x.valor : formatarValorNovo(x.valor, irmas) };
      });
      planos.push({
        sku, produtoId: [...pids][0], nomeDaqui: l.nome,
        nomeNovo: formatados.map((x) => x.valor).join(' · '),
        valores: formatados, preco: precos.size === 1 ? [...precos][0] : null,
        renomeia: !usados, local: base.localDeEstoque,
        bloqueio: motivo.length ? motivo.join('; ') : null,
      });
    }
  }
  return planos;
}

export async function criarVariantesFaltantes(db, env, { seco = true, limite = 20, loja: lojaDada = null } = {}) {
  const trava = await travasDoCatalogo(db, env);
  const base = await lerBase(db);
  const planos = planoDeVariantesFaltantes(base);
  const relato = { ok: true, seco: seco || !!trava, trava: trava ? trava.trava : null, planos, criadas: 0, erros: 0, chamadasLoja: 0, itens: [] };
  if (seco || trava) return relato;
  const loja = lojaDada || new Nuvemshop(env);
  const stmts = [];
  for (const pl of planos.filter((x) => !x.bloqueio).slice(0, limite)) {
    try {
      /* Releitura do anúncio antes de escrever: a variante pode ter sido
         criada à mão desde o espelho. */
      const atual = await loja.produto(pl.produtoId);
      relato.chamadasLoja++;
      const ja = (atual.variants || []).find((v) => chaveDaVariacao((v.values || []).map(texto).join(' · ')) === chaveDaVariacao(pl.nomeNovo));
      const criada = ja || await loja.criarVariante(pl.produtoId, {
        values: pl.valores.map((x) => ({ pt: x.valor })), sku: pl.sku, price: pl.preco,
        ...(pl.local ? { inventory_levels: [{ location_id: pl.local, stock: 0 }] } : { stock: 0 }),
      });
      if (!ja) relato.chamadasLoja++;
      const vid = String(criada.id);
      if (pl.renomeia && pl.nomeNovo !== pl.nomeDaqui) {
        stmts.push(db.prepare(
          `UPDATE produto_variacoes SET nome = ?, valores_json = ?, variante_id = ?, produto_id = ?, origem = 'loja', variante_sku = ?
            WHERE sku = ? AND nome = ?`).bind(pl.nomeNovo, JSON.stringify(pl.valores), vid, pl.produtoId, pl.sku, pl.sku, pl.nomeDaqui));
      } else {
        stmts.push(db.prepare(
          `UPDATE produto_variacoes SET variante_id = ?, produto_id = ?, origem = 'loja', variante_sku = ?
            WHERE sku = ? AND nome = ?`).bind(vid, pl.produtoId, pl.sku, pl.sku, pl.nomeDaqui));
        stmts.push(db.prepare(`UPDATE maleta_item_variacoes SET variante_id = ? WHERE sku = ? AND variacao = ?`)
          .bind(vid, pl.sku, pl.nomeDaqui));
      }
      stmts.push(enfileirarStmt(db, pl.sku, 'variante_criada'));
      const relido = await loja.produto(pl.produtoId);
      relato.chamadasLoja++;
      stmts.push(...espelhoStmts(db, relido));
      relato.criadas += ja ? 0 : 1;
      relato.itens.push({ sku: pl.sku, acao: ja ? 'ja_existia' : 'criada', varianteId: vid, nome: pl.nomeNovo });
    } catch (e) {
      relato.erros++;
      relato.itens.push({ sku: pl.sku, acao: 'erro', nome: pl.nomeNovo, erro: frase(e) });
    }
  }
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  return relato;
}

/* ======================================================================== */
/* 5. FOTO QUE ENTROU DEPOIS                                                 */
/* ======================================================================== */

function base64De(bytes) {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Sobe a foto principal daqui para o anúncio OCULTO que ainda não tem
 *  nenhuma. Não mexe em visibilidade: foto chegando não publica nada. */
export async function enviarFotosPendentes(db, env, { limite = 3, seco = true, loja: lojaDada = null } = {}) {
  const trava = await travasDoCatalogo(db, env);
  const base = await lerBase(db);
  const alvos = [];
  for (const [sku, l] of base.catalogo) {
    if (l.estado !== 'oculto' || !l.produto_id || l.foto_enviada_em) continue;
    const conf = base.conf.get(sku);
    if (conf && conf.imagens != null && Number(conf.imagens) > 0) continue;
    const f = (base.fotos.get(sku) || []).find((x) => x.preparada_key || x.original_key);
    if (f) alvos.push({ sku, produtoId: l.produto_id, foto: f });
  }
  const relato = { ok: true, seco: seco || !!trava || !env.FOTOS, trava: trava ? trava.trava : (env.FOTOS ? null : 'sem_r2'), pendentes: alvos.length, enviadas: 0, erros: 0, itens: [] };
  if (relato.seco) { relato.itens = alvos.map((a) => ({ sku: a.sku, foto: a.foto.id })); return relato; }
  const loja = lojaDada || new Nuvemshop(env);
  const stmts = [];
  for (const a of alvos.slice(0, limite)) {
    try {
      const chave = a.foto.preparada_key || a.foto.original_key;
      const obj = await lerFoto(env, chave);
      if (!obj) throw new Error('a foto não está no armazenamento');
      const bytes = await new Response(obj.corpo).arrayBuffer();
      const tipo = (a.foto.preparada_key ? a.foto.preparada_tipo : a.foto.original_tipo) || obj.tipo || 'image/jpeg';
      const ext = /png/.test(tipo) ? 'png' : /webp/.test(tipo) ? 'webp' : 'jpg';
      const img = await loja.enviarImagem(a.produtoId, { base64: base64De(bytes), filename: `${a.sku}.${ext}`, position: 1 });
      const em = agoraISO();
      stmts.push(db.prepare(`UPDATE nuvemshop_catalogo SET foto_enviada_em = ?, foto_id_loja = ?, atualizado_em = ? WHERE sku = ?`)
        .bind(em, img && img.id != null ? String(img.id) : null, em, a.sku));
      stmts.push(db.prepare(`UPDATE produto_fotos SET imagem_id_loja = ?, produto_id_loja = ?, posicao_loja = 1 WHERE id = ? AND imagem_id_loja IS NULL`)
        .bind(img && img.id != null ? String(img.id) : null, a.produtoId, a.foto.id));
      relato.enviadas++;
      relato.itens.push({ sku: a.sku, acao: 'enviada', imagemId: img && img.id });
    } catch (e) {
      relato.erros++;
      relato.itens.push({ sku: a.sku, acao: 'erro', erro: frase(e) });
    }
  }
  if (stmts.length) await db.batch(stmts);
  return relato;
}

/* ======================================================================== */
/* 6. PUBLICAR — o único caminho hidden → visible, e ele é humano            */
/* ======================================================================== */

/** O que falta no anúncio, lido AGORA da loja — não do espelho. */
export function faltasNoAnuncio(produto) {
  const faltam = [];
  const vs = produto.variants || [];
  if (!(produto.images || []).length) faltam.push('foto');
  if (!texto(produto.name).trim()) faltam.push('nome');
  if (!semHtml(produto.description)) faltam.push('descricao');
  if (!texto(produto.seo_title).trim() || !texto(produto.seo_description).trim()) faltam.push('seo');
  if (!vs.length || vs.some((v) => !String(v.sku || '').trim())) faltam.push('sku');
  if (vs.some((v) => !(Number(v.promotional_price || v.price) > 0))) faltam.push('preco');
  if (vs.some((v) => !Number.isFinite(estoqueDaVariante(v)))) faltam.push('estoque');
  if (!(produto.categories || []).length) faltam.push('categoria');
  return faltam;
}

export async function publicarNaLoja(db, env, sku, { por = 'operador', loja: lojaDada = null } = {}) {
  const k = normSku(sku);
  const trava = await travasDoCatalogo(db, env);
  if (trava) return ERRO(409, trava.motivo, { trava: trava.trava });
  const p = await db.prepare(`SELECT sku, desc, preco, produto_id_loja FROM produtos WHERE sku = ? AND status = 'ativo'`).bind(k).first();
  if (!p) return ERRO(404, `Código ${sku} não está ativo no catálogo.`);
  if (!p.produto_id_loja) return ERRO(409, 'Esta peça ainda não está cadastrada na Nuvemshop.', { faltam: ['cadastro'] });

  /* As pendências daqui (estoque da variação, variação só no Marquesa,
     erro de envio) também seguram a publicação. */
  const base = await lerBase(db);
  const item = classificarCatalogo(base).itens.find((x) => x.sku === String(p.sku));
  const pendLocais = (item?.pendencias || []).map((x) => x.chave)
    .filter((c) => ['estoque_variacao', 'variacao', 'estoque', 'preco'].includes(c));
  const fila = base.fila.get(String(p.sku));
  if (!fila || fila.status !== 'sincronizado') pendLocais.push('estoque');
  if (!(Number(p.preco) > 0)) pendLocais.push('preco');

  const loja = lojaDada || new Nuvemshop(env);
  let produto;
  try { produto = await loja.produto(p.produto_id_loja); } catch (e) { return ERRO(502, frase(e)); }
  const visAntes = visibilidadeDe(produto);
  if (visAntes === 'visible') return ERRO(409, 'Este anúncio já está visível na loja.', { visibilidade: visAntes });
  if ((produto.variants || []).some((v) => normSku(v.sku) !== k)) pendLocais.push('sku');
  const faltam = [...new Set([...faltasNoAnuncio(produto), ...pendLocais])];
  if (faltam.length) {
    return ERRO(409, 'Ainda falta coisa para publicar. Nada foi mudado na loja.', { faltam, visibilidade: visAntes });
  }

  const em = agoraISO();
  await db.prepare(
    `INSERT INTO nuvemshop_catalogo (sku, estado, origem, produto_id, visibilidade, atualizado_em)
     VALUES (?, 'publicando', 'adotado', ?, ?, ?)
     ON CONFLICT(sku) DO UPDATE SET estado = 'publicando', ultimo_erro = NULL, atualizado_em = excluded.atualizado_em`,
  ).bind(p.sku, String(p.produto_id_loja), visAntes, em).run();
  try {
    await loja.atualizarProduto(p.produto_id_loja, { visibility: 'visible' });
    const relido = await loja.produto(p.produto_id_loja);
    const vis = visibilidadeDe(relido);
    if (vis !== 'visible') throw new Error(`a loja respondeu ${vis || 'sem visibilidade'} depois da troca`);
    await db.batch([
      db.prepare(`UPDATE nuvemshop_catalogo SET estado = 'visivel', visibilidade = 'visible', publicado_em = ?,
                    publicado_por = ?, atualizado_em = ? WHERE sku = ?`).bind(em, String(por).slice(0, 120), em, p.sku),
      db.prepare(`UPDATE produtos SET visibilidade_loja = 'visible', visivel = 1 WHERE sku = ?`).bind(p.sku),
    ]);
    return { ok: true, sku: p.sku, produtoId: String(p.produto_id_loja), visibilidade: 'visible', confirmadoPelaLoja: true };
  } catch (e) {
    await db.prepare(`UPDATE nuvemshop_catalogo SET estado = 'erro', ultimo_erro = ?, atualizado_em = ? WHERE sku = ?`)
      .bind(`Falhou ao publicar: ${frase(e)}`.slice(0, 500), agoraISO(), p.sku).run();
    return ERRO(502, `Não consegui confirmar a publicação: ${frase(e)}`, { sku: p.sku });
  }
}

/* ======================================================================== */
/* 7. A CONFERÊNCIA ATUALIZA O QUE A LOJA DIZ                                */
/* ======================================================================== */

/** Para as linhas do catálogo: visibilidade lida agora e o estado que ela
 *  implica. Publicação feita à mão no painel da Nuvemshop aparece aqui como
 *  `visivel`; anúncio apagado lá vira `erro` com o motivo. Só o que mudou. */
export async function atualizarCatalogoDaLeitura(db, produtosLoja) {
  if (!produtosLoja || !produtosLoja.length) return 0;
  let linhas;
  try { linhas = (await db.prepare('SELECT sku, estado, produto_id, visibilidade FROM nuvemshop_catalogo').all()).results || []; } catch { return 0; }
  if (!linhas.length) return 0;
  const porId = new Map(produtosLoja.map((p) => [String(p.id), p]));
  const em = agoraISO();
  const stmts = [];
  for (const l of linhas) {
    if (!l.produto_id || l.estado === 'criando' || l.estado === 'publicando') continue;
    const p = porId.get(String(l.produto_id));
    if (!p) {
      if (l.estado !== 'erro') {
        stmts.push(db.prepare(`UPDATE nuvemshop_catalogo SET estado='erro', ultimo_erro=?, atualizado_em=? WHERE sku=?`)
          .bind('O anúncio não apareceu na leitura da loja (apagado lá?).', em, l.sku));
      }
      continue;
    }
    const vis = visibilidadeDe(p);
    const estado = vis === 'visible' ? 'visivel' : (l.estado === 'erro' ? 'erro' : 'oculto');
    if (vis === l.visibilidade && estado === l.estado) continue;
    stmts.push(db.prepare(`UPDATE nuvemshop_catalogo SET visibilidade=?, estado=?, atualizado_em=? WHERE sku=?`)
      .bind(vis, estado, em, l.sku));
  }
  if (stmts.length) await db.batch(stmts);
  return stmts.length;
}
