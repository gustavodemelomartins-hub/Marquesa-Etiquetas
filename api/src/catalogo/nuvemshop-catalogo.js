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
 *  com 0 e a peça não publica. Não muda nome, URL, preço ou imagem de
 *  produto que já existia na loja. O enriquecimento editorial dos ocultos
 *  criados aqui usa journal próprio. Não publica sozinho.
 */
import { Nuvemshop, mapearSkus, visibilidadeDe, catalogoDeVariantes } from '../nuvemshop.js';
import { lerConfig } from '../plataforma/config.js';
import { normSku } from '../sku.js';
import { lerFoto } from '../fotos-storage.js';
import { gerarTextoDoSite, normalizar, REGRA_TEXTO } from './texto-site.js';
import { enriquecerProduto, MARCA_CANONICA, CUIDADOS_HTML, REGRA_ENRIQUECIMENTO, categoriaComprovada, fatosDoProduto, tagsEquivalentes } from './enriquecimento.js';
import { categoriasEquivalentes, lerSeoOcupado } from './enriquecimento-fluxo.js';
import { chaveDaVariacao, equivalenciasLojaLocal, formatarValorNovo, valoresParecidos } from '../variacao-nome.js';
import { categoriaCanonica, normalizarAtributos, tipoDoValor } from './taxonomia.js';
import { chaveDoModelo, identidadeDaBase, skusRelacionados, suspeitasDeDuplicidade } from './duplicidade.js';

export { chaveDoModelo };

export const CHAVE_CATALOGO_ATIVO = 'nuvemshopCatalogoAtivo';
export const CHAVE_MAPA_CATEGORIAS = 'nuvemshopCategoriasMapa';
export const LOTE_PADRAO = 20;
export const LOTE_MAXIMO = 24;
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
const todas = async (db, sql, args = []) => (await db.prepare(sql).bind(...args).all()).results || [];

/** Tudo que a classificação precisa, em poucas consultas (o plano Free do
 *  D1 recusa a 51ª consulta da mesma invocação — §60).
 *
 *  §63 — `skus` restringe a leitura aos códigos pedidos. Publicar UM
 *  produto não precisa do catálogo inteiro: com "Publicar todos os
 *  prontos" a mesma rota roda dezenas de vezes seguidas, e reler ~10 mil
 *  linhas a cada uma gastaria a cota diária do D1 (que é da conta, DEV e
 *  PROD juntos). O que só serve a peça SEM anúncio (nomes de modelo,
 *  nomes repetidos) fica parcial nesse modo — e é por isso que ele só é
 *  usado para peça que já está na loja. */
export async function lerBase(db, { skus = null } = {}) {
  const lista = Array.isArray(skus) && skus.length ? [...new Set(skus.map(String))] : null;
  const marcas = lista ? lista.map(() => '?').join(',') : '';
  const e = (col) => (lista ? ` AND ${col} IN (${marcas})` : '');
  const A = lista || [];
  const AN = lista ? lista.map((x) => normSku(x)) : [];
  const [produtos, montagens, variacoes, nomeados, maletaVar, loja, catalogo, fotos, fila, conf, rascunhos, mapaCat] = await Promise.all([
    todas(db, `SELECT p.sku, p.desc, p.cat, p.preco, p.qtd, p.status, p.produto_id_loja, p.url_loja,
                      p.visivel, p.visibilidade_loja, p.foto_url, p.foto_original_key, p.foto_tratada_key,
                      ${SQL_CASA} AS casa,
                      EXISTS (SELECT 1 FROM kit_componentes kc WHERE kc.kit_sku = p.sku) AS eh_kit
                 FROM produtos p WHERE p.status = 'ativo'${e('p.sku')}`, A),
    tentar(() => todas(db, 'SELECT sku_comercial FROM personalizacao_modelos WHERE sku_comercial IS NOT NULL'), []),
    todas(db, `SELECT sku, nome, atributo, variante_id, produto_id, valores_json, origem, ordem FROM produto_variacoes
                WHERE 1 = 1${e('sku')} ORDER BY sku, ordem`, A),
    todas(db, `SELECT sku, variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
                WHERE (variacao IS NOT NULL OR variante_id IS NOT NULL)${e('sku')} GROUP BY sku, variacao, variante_id`, A),
    tentar(() => todas(db, `SELECT mv.sku, mv.variacao, mv.variante_id, SUM(mv.qtd) AS qtd
                FROM maleta_item_variacoes mv JOIN maletas m ON m.id = mv.maleta_id
               WHERE m.status IN ('aberta','em_acerto')${e('mv.sku')} GROUP BY mv.sku, mv.variacao, mv.variante_id`, A), []),
    tentar(() => todas(db, `SELECT variante_id, produto_id, sku, sku_norm, nome, valores_json, estoque,
                                   preco, locais_json, produto_nome, produto_url, produto_visivel
                              FROM loja_variantes WHERE 1 = 1${e('sku_norm')} ORDER BY produto_id, posicao`, AN), []),
    tentar(() => todas(db, `SELECT * FROM nuvemshop_catalogo WHERE 1 = 1${e('sku')}`, A), []),
    tentar(() => todas(db, `SELECT id, sku, principal, ordem, original_key, original_tipo, preparada_key,
                                   preparada_tipo, arquivo_nome, imagem_id_loja, url_externa, conteudo_hash
                              FROM produto_fotos WHERE removida_em IS NULL${e('sku')}
                             ORDER BY sku, principal DESC, ordem`, A), []),
    tentar(() => todas(db, `SELECT sku, status, motivo, ultimo_erro, resultado_json, sincronizado_em FROM nuvemshop_fila
                              WHERE 1 = 1${e('sku')}`, A), []),
    tentar(() => todas(db, `SELECT sku,
              MIN(ns_tem_descricao) AS descricao,
              MIN(ns_tem_seo_titulo) AS seo_titulo,
              MIN(ns_tem_seo_descricao) AS seo_descricao,
              MIN(ns_imagens) AS imagens,
              MAX(ns_categorias) AS categorias,
              GROUP_CONCAT(DISTINCT status) AS status,
              GROUP_CONCAT(DISTINCT motivo) AS motivos,
              MAX(conferido_em) AS conferido_em
         FROM nuvemshop_conferencia WHERE sku IS NOT NULL${e('sku')} GROUP BY sku`, A), []),
    tentar(() => todas(db, `SELECT sku, nome_site, descricao_site, seo_titulo, seo_descricao FROM catalogo_publicacoes
                              WHERE 1 = 1${e('sku')}`, A), []),
    config(db, CHAVE_MAPA_CATEGORIAS, null),
  ]);

  /* §66 — a duplicidade compara cada código com TODOS os outros (publicado,
     oculto, sem anúncio). Na leitura parcial (publicar um código) a base só
     tem aquele código; então lê o mínimo do catálogo inteiro — nome,
     categoria, preço, anúncio — e a origem do cadastro e as fotos só dos
     códigos que podem ser o gêmeo dele. */
  let identidade = null;
  let entradas = [];
  if (lista) {
    const [leves, lojaLeve] = await Promise.all([
      todas(db, `SELECT sku, desc, cat, preco, qtd, produto_id_loja, visibilidade_loja, visivel
                   FROM produtos WHERE status = 'ativo'`),
      tentar(() => todas(db, `SELECT sku_norm, produto_id, produto_nome, nome, valores_json, produto_visivel
                                FROM loja_variantes`), []),
    ]);
    identidade = { produtos: leves, loja: lojaLeve, entradas: new Map(), fotos: new Map() };
    const rel = skusRelacionados(identidade, lista);
    const mr = rel.map(() => '?').join(',');
    const [ents, hashes] = await Promise.all([
      tentar(() => todas(db, sqlEntradas(` AND sku IN (${mr})`), rel), []),
      tentar(() => todas(db, `SELECT sku, conteudo_hash FROM produto_fotos
                                WHERE removida_em IS NULL AND conteudo_hash IS NOT NULL AND sku IN (${mr})`, rel), []),
    ]);
    for (const r of ents) identidade.entradas.set(String(r.sku), r);
    for (const r of hashes) {
      if (!identidade.fotos.has(String(r.sku))) identidade.fotos.set(String(r.sku), new Set());
      identidade.fotos.get(String(r.sku)).add(r.conteudo_hash);
    }
  } else {
    entradas = await tentar(() => todas(db, sqlEntradas('')), []);
  }

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
    entradas: new Map(entradas.map((r) => [String(r.sku), r])),
    identidade,
  };
}

/** A primeira entrada de cada código: a origem do cadastro (o lote). */
const sqlEntradas = (filtro) => `SELECT m.sku, m.obs, m.criado_em AS em FROM movimentos m
   JOIN (SELECT sku, MIN(id) AS id FROM movimentos WHERE tipo = 'entrada'${filtro} GROUP BY sku) x ON x.id = m.id`;

/* ======================================================================== */
/* 2. A CLASSIFICAÇÃO                                                        */
/* ======================================================================== */

/** Valores exatos comprovam Cor no payload novo. Valores compostos ou
 *  misturados com medidas continuam exigindo confirmação de significado. */
const COR = /^(azul|cristal|vermelh[oa]|verde|pink|rosa|roxo|lil[aá]s|marsala|preto|branco|amarelo|incolor|colorid[oa]|dourado|prateado|turquesa|laranja)\b/i;

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

  let estruturas = locais.map((l) => valoresDe(l));
  const brutos = estruturas[0].map((x) => x.atributo);
  if (estruturas.some((e) => e.map((x) => x.atributo).join('|') !== brutos.join('|'))) {
    return { bloqueio: 'As variações deste código não têm os mesmos atributos. Revise em Peças › Variações.' };
  }
  /* §64 — "Tamanho = Azul" não bloqueia mais: o atributo que o valor
     contradiz é corrigido aqui (e no cadastro, pela rodada automática). O
     bloqueio abaixo só sobra quando a correção esbarra num nome já usado. */
  const atributos = normalizarAtributos(brutos.map((a, i) => ({ nome: a, valores: estruturas.map((e) => e[i].valor) })))
    .atributos.map((a) => a.nome);
  estruturas = estruturas.map((e) => e.map((x, i) => ({ atributo: atributos[i], valor: x.valor })));
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
  let gerado = gerarTextoDoSite({ nome: p.desc, sku: p.sku, nomesIguais });
  let factual = false;
  if (!gerado.ok && nomesIguais > 0 && /mesmo nome/.test(gerado.motivo || '')) {
    // Homônimo impede decidir identidade; não impede descrever fatos conhecidos.
    // A criação compara SEO com a loja. O preview não possui essa ocupação real.
    const enriquecido = enriquecerProduto({ name: { pt: p.desc }, sku: p.sku, variants: [{ sku: p.sku }] }, {
      cadastro: p, novo: true, marcaCanonica: MARCA_CANONICA, cuidadosHtml: CUIDADOS_HTML,
    });
    const descricao = texto(enriquecido.patch.description);
    if (descricao) {
      gerado = { ok: true, descricao, seoTitulo: null, seoDescricao: null };
      factual = true;
    }
  }
  const escolhe = (humano, campo) => (String(humano || '').trim() ? String(humano).trim() : (gerado.ok ? gerado[campo] : null));
  const descricao = escolhe(r?.descricao_site, 'descricao');
  const seoTitulo = escolhe(r?.seo_titulo, 'seoTitulo');
  const seoDescricao = escolhe(r?.seo_descricao, 'seoDescricao');
  return {
    descricao: descricao && !/^</.test(descricao) ? `<p>${descricao.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : descricao,
    seoTitulo,
    seoDescricao,
    origem: r && (r.descricao_site || r.seo_titulo) ? 'rascunho' : (gerado.ok ? (factual ? REGRA_ENRIQUECIMENTO : REGRA_TEXTO) : null),
    precisaInformacao: gerado.ok
      ? (factual && !(seoTitulo && seoDescricao) ? 'Aguarda comparação com o SEO existente na loja para garantir textos únicos.' : null)
      : gerado.motivo,
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
  /* §66 — "mesmo modelo?" vale para TODO código: sem anúncio, oculto novo,
     oculto antigo, publicado. Os dados decidem; nome igual só pergunta. */
  const duplicidades = suspeitasDeDuplicidade(identidadeDaBase(base));
  /* §64 — o plano das variações que faltam no anúncio, por código: a tela
     diz "o sistema cria" ou o motivo exato de não criar. */
  const planosVariante = new Map();
  for (const pl of planoDeVariantesFaltantes(base)) {
    if (!planosVariante.has(pl.sku)) planosVariante.set(pl.sku, []);
    planosVariante.get(pl.sku).push(pl);
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
      /* Kit não é pendência: não há o que uma pessoa faça aqui. É estado —
         anunciado na peça, fora da lista de decisões (§64). */
      if (eKit) {
        bloqueios.push('Kit e Monte seu Colar não viram anúncio por este caminho: o disponível deles é calculado das peças.');
        item.naoSeAplica = 'kit';
      }
      if (normalizar(p.desc) === normalizar(sku) || !String(p.desc || '').trim()) {
        bloqueios.push('Falta o nome comercial (o nome é só o código).');
        add('nome', 'Falta o nome comercial (o nome é só o código).');
      }
      const dup = duplicidades.get(sku) || null;
      item.duplicidade = dup;
      if (dup?.decidir) {
        bloqueios.push(dup.motivo);
        add('duplicidade', dup.motivo);
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
      const cc = categoriaCanonica(p, base.mapaCategorias);
      item.categoriaLoja = cc.id ? { id: cc.id, chave: cc.chave, regra: cc.regra } : null;
      if (base.mapaCategorias && !cc.id) add('categoria', cc.motivo);
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
    const cc = categoriaCanonica(p, base.mapaCategorias);
    const temCategoria = conf && conf.categorias != null
      ? Number(conf.categorias) > 0
      : (conteudo?.categorias != null ? Number(conteudo.categorias) > 0
        : (base.mapaCategorias ? !!cc.id : null));
    item.fotoNaLoja = temFoto;
    item.textoNaLoja = { descricao: temDescricao, seo: temSeo };
    if (!temFoto) add('foto', temFotoPropria(p, base) ? 'A foto daqui ainda não subiu para a loja.' : 'Falta foto.');
    if (!temDescricao) add('descricao', 'O anúncio está sem descrição.');
    if (!temSeo) add('seo', 'O anúncio está sem título ou meta description de SEO.');
    if (!precoOk) add('preco', 'Sem preço comercial válido.');
    /* §64 — categoria óbvia não é pergunta: o sistema aplica na loja
       (`preencherCategorias`). Só a ambígua fica para gente. */
    if (temCategoria === false) {
      item.categoriaLoja = cc.id ? { id: cc.id, chave: cc.chave, regra: cc.regra } : null;
      add('categoria', cc.id
        ? `Sem categoria na loja: o sistema aplica "${cc.chave}" automaticamente (${cc.regra}).`
        : cc.motivo);
    }

    const sincronia = fila?.status || null;
    /* §66 — o estado atual comprovado vence o retrato antigo. A conferência
       geral roda uma vez por dia; a fila registra cada envio. Se a fila diz
       `sincronizado` DEPOIS da conferência, o envio mapeou cada variante (a
       fila só chega a `sincronizado` quando a decisão não teve impedimento)
       e nenhum movimento veio depois (movimento reabre a fila na mesma
       transação, gatilho de §61). A conferência seguinte continua podendo
       achar divergência nova. */
    const confVencida = sincronia === 'sincronizado' && !!fila?.sincronizado_em && !!conf?.conferido_em
      && String(fila.sincronizado_em) > String(conf.conferido_em);
    item.conferenciaVencida = confVencida && statusConf.includes('variante_sem_mapeamento');
    if (sincronia === 'revisao' || (statusConf.includes('variante_sem_mapeamento') && !confVencida)) {
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
      /* §64 — variação que existe aqui e falta no anúncio é criada pelo
         sistema; só o que o plano não consegue montar vira pergunta. */
      const planos = planosVariante.get(sku) || [];
      const travadas = faltam.map((l) => ({ l, pl: planos.find((x) => x.nomeDaqui === l.nome) }))
        .filter((x) => !x.pl || x.pl.bloqueio);
      if (faltam.length) {
        add('variacao', travadas.length
          ? `Variação só no Marquesa: ${travadas.map((x) => `${x.l.nome} (${x.pl?.bloqueio || 'não dá para montá-la no anúncio'})`).join('; ')}.`
          : `Variação só no Marquesa: ${faltam.map((l) => l.nome).join(', ')} — o sistema cria na loja automaticamente.`);
      }
      item.variacoesSoAqui = faltam.map((l) => l.nome);
      item.variacoesAutomaticas = faltam.length > 0 && travadas.length === 0;
      /* §66 — par por UNICIDADE é equivalência operacional: deixa o
         estoque andar, não reescreve nenhum dos dois valores e se desfaz
         sozinho quando aparecer outra variante (ver equivalenciasLojaLocal). */
      if (eq.porUnicidade) {
        item.equivalenciasOperacionais = [...eq.entries()].map(([vLoja, vAqui]) => ({
          loja: naLoja.find((v) => String(v.variante_id) === vLoja)?.nome || null,
          daqui: locais.find((l) => String(l.variante_id) === vAqui)?.nome || null,
          regra: 'unicidade', bloqueia: false,
        }));
      }
    }
    /* §66 — o gêmeo de outro código: oculto com suspeita real não fica
       pronto nem entra no lote. Sem peça em casa ele já está fora da fila;
       a suspeita fica como informação até voltar estoque. */
    const dup = duplicidades.get(sku) || null;
    item.duplicidade = dup;
    if (dup?.decidir && visibilidade !== 'visible' && casa > 0) add('duplicidade', dup.motivo);
    if (statusConf.includes('sku_duplicado')) add('variacao', 'O mesmo SKU está em mais de um produto da loja.');
    if (statusConf.includes('sem_sku')) add('variacao', 'Variante sem SKU na loja.');

    const erro = linha?.estado === 'erro' || sincronia === 'erro' || statusConf.includes('erro_integracao');
    if (visibilidade === 'unlisted') add('link_direto', 'Está "não listado": some da vitrine mas é comprável pelo link direto.');
    /* §64 — oculto sem peça em casa é ESTADO, não falha: fica cadastrado,
       fora da fila (situação `sem_estoque`), e volta sozinho quando entra
       peça. Não é "pronto" (publicar mostraria a peça esgotada) e não é
       nada que alguém precise consertar. */
    const semPeca = visibilidade !== 'visible' && casa <= 0;
    /* §63 — "fora do ar" só é alerta quando ALGUÉM o publicou por aqui e
       ele deixou de estar visível. Oculto que nunca foi publicado é peça em
       preparação, de propósito: não é problema, é o §62 funcionando. */
    item.publicadoEm = linha?.publicado_em || null;
    item.foraDoArInesperado = !!linha?.publicado_em && visibilidade !== 'visible';
    if (erro) item.situacao = 'erro';
    else if (visibilidade === 'visible') item.situacao = 'publicado';
    else if (semPeca) item.situacao = 'sem_estoque';
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
export function corpoDoProdutoOculto(item, { localDeEstoque = null, categoriaId = null, categorias = [], seoTitulosOcupados = [], seoDescricoesOcupadas = [] } = {}) {
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
  if (item.texto?.origem === REGRA_TEXTO) {
    // Texto ainda não publicado: uma colisão com anúncio real autoriza a
    // alternativa editorial, mantendo SEO humano intacto.
    if (new Set([...seoTitulosOcupados].map(normalizar)).has(normalizar(texto(corpo.seo_title)))) delete corpo.seo_title;
    if (new Set([...seoDescricoesOcupadas].map(normalizar)).has(normalizar(texto(corpo.seo_description)))) delete corpo.seo_description;
  }
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
  const proposta = enriquecerProduto(corpo, { cadastro: { sku: item.sku, desc: item.nome, cat: item.categoria },
    marcaCanonica: MARCA_CANONICA, cuidadosHtml: CUIDADOS_HTML, categorias, novo: true,
    substituirTextoGerado: item.texto?.origem === REGRA_TEXTO, seoTitulosOcupados, seoDescricoesOcupadas });
  Object.assign(corpo, proposta.patch);
  return corpo;
}

function confereCriado(produto, corpo, sku) {
  const problemas = [];
  if (!produto || produto.id == null) problemas.push('a loja não devolveu o id do produto');
  const vs = (produto && produto.variants) || [];
  if (vs.length !== corpo.variants.length) problemas.push(`a loja devolveu ${vs.length} variante(s), eram ${corpo.variants.length}`);
  if (vs.some((v) => normSku(v.sku) !== normSku(sku))) problemas.push('SKU da variante diferente do código');
  for (const campo of ['name', 'description', 'seo_title', 'seo_description', 'brand']) {
    if (corpo[campo] != null && texto(produto?.[campo]) !== texto(corpo[campo])) problemas.push(`${campo} não confirmado na releitura`);
  }
  if (corpo.tags != null && !tagsEquivalentes(corpo.tags, produto?.tags)) problemas.push('tags não confirmadas na releitura');
  if (!categoriasEquivalentes(corpo.categories || [], produto?.categories || [])) problemas.push('categorias não confirmadas na releitura');
  for (let i = 0; i < Math.min(vs.length, corpo.variants.length); i++) {
    const esperado = corpo.variants[i], lido = vs[i];
    if ((lido.values || []).map(texto).join('|') !== (esperado.values || []).map(texto).join('|')) problemas.push(`valores da variante ${i + 1} não confirmados`);
    if (esperado.price != null && Number(lido.price) !== Number(esperado.price)) problemas.push(`preço da variante ${i + 1} não confirmado`);
    if (estoqueDaVariante(lido) !== estoqueDaVariante(esperado)) problemas.push(`estoque da variante ${i + 1} não confirmado`);
  }
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
  const preservar = (p) => Object.fromEntries(['name', 'handle', 'description', 'seo_title', 'seo_description']
    .filter((k) => Object.hasOwn(p || {}, k)).map((k) => [k, p[k]]));
  await loja.atualizarProduto(produtoId, { ...preservar(visto), visibility: 'hidden' });
  let relido = await loja.produto(produtoId);
  if (visibilidadeDe(relido) === 'hidden') return 'hidden';
  /* Loja que não conhece `visibility`: `published: false` ao menos tira
     da vitrine (pode ficar unlisted — por isso a rodada para de qualquer
     jeito). */
  await loja.atualizarProduto(produtoId, { ...preservar(relido), published: false });
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

/** Mapa nome normalizado → id da categoria da loja (raízes pelo nome,
 *  subcategorias como "pai/filho"). QUAL categoria uma peça recebe não é
 *  decidido aqui: é `taxonomia.js › categoriaCanonica`, com a regra escrita
 *  ("Argola é brinco na loja") — nunca por semelhança de nome. */
export function mapearCategorias(categoriasLoja) {
  const mapa = {};
  const lista = categoriasLoja || [];
  const nomePorId = new Map(lista.map((c) => [String(c.id), normalizar(texto(c.name))]));
  for (const c of lista) {
    const raiz = c.parent == null || Number(c.parent) === 0;
    const k = normalizar(texto(c.name));
    if (!k) continue;
    if (raiz) {
      if (mapa[k] == null) mapa[k] = String(c.id);
      continue;
    }
    /* §64 — subcategoria entra como "pai/filho" ("prata 925/conjuntos"),
       nunca pelo nome solto: "Anel" de Prata 925 não é a raiz "Anel". */
    const pai = nomePorId.get(String(c.parent));
    if (pai && mapa[`${pai}/${k}`] == null) mapa[`${pai}/${k}`] = String(c.id);
  }
  for (const tipo of ['Argola', 'Brinco', 'Brincos', 'Colar', 'Pulseira', 'Anel', 'Pingente', 'Conjunto']) {
    const c = categoriaComprovada(fatosDoProduto({ name: { pt: tipo } }), categoriasLoja || []);
    if (c && mapa[normalizar(tipo)] == null) mapa[normalizar(tipo)] = String(c.id);
  }
  return mapa;
}

/** Busca na loja o produto que tem uma variante com este SKU — `null` se
 *  não houver. É a deduplicação feita AGORA, um código por vez, logo antes
 *  do POST: o espelho pode estar velho (cadastro à mão no painel da loja,
 *  Worker que morreu entre o POST e a gravação). */
export async function buscarPorSku(loja, sku) {
  let p;
  try {
    p = await loja.chamar(`/products/sku/${encodeURIComponent(sku)}`);
  } catch (e) {
    if (e && e.status === 404) return null;
    throw e;
  }
  if (!p || Array.isArray(p) || p.id == null) return null;
  return (p.variants || []).some((v) => normSku(v.sku) === normSku(sku)) ? p : null;
}

/** A rodada de criação. `seco` (padrão) classifica e devolve o corpo EXATO
 *  de cada POST, sem escrever. Sem `seco`, cria no máximo `limite` produtos.
 *
 *  Antes de cada POST a loja é consultada PELO SKU: código que já está lá é
 *  ADOTADO (vínculo gravado), nunca criado de novo. Isso cobre o Worker que
 *  morreu entre o POST e a gravação — a próxima rodada encontra o produto e
 *  só registra.
 *
 *  A loja inteira NÃO é lida aqui. Com ~900 produtos, as 5 páginas de JSON
 *  estouravam os 10 ms de CPU do plano Free (`exceededCpu` em 09/10 08:20):
 *  a invocação morria depois de reservar o lote. Uma consulta por SKU custa
 *  uma subrequisição a mais por peça e quase nada de CPU. */
export async function criarOcultos(db, env, { limite = LOTE_PADRAO, seco = true, skus = null, loja: lojaDada = null } = {}) {
  const trava = await travasDoCatalogo(db, env);
  const relato = {
    ok: true, seco: seco || !!trava, trava: trava ? trava.trava : null, motivo: trava ? trava.motivo : null,
    adotados: 0, criados: 0, erros: 0, ignorados: 0, chamadasLoja: 0, itens: [],
  };
  const loja = lojaDada || new Nuvemshop(env);
  if (!loja.configurada()) return { ...relato, ok: false, erro: 'A loja não está conectada.' };

  const base = await lerBase(db);
  /* A hierarquia atual é relida: nova categoria comercial não deve ficar
     inacessível por causa de um mapa antigo gravado antes dela existir. */
  let mapaCategorias = base.mapaCategorias;
  let mapaNovo = false;
  let categorias = [];
  try {
    categorias = await loja.categorias(); relato.chamadasLoja++;
    const atual = mapearCategorias(categorias);
    mapaNovo = JSON.stringify(atual) !== JSON.stringify(mapaCategorias);
    mapaCategorias = atual;
  } catch { mapaCategorias = mapaCategorias || {}; }
  base.mapaCategorias = mapaCategorias;
  const { itens } = classificarCatalogo(base);

  const filtro = Array.isArray(skus) && skus.length ? new Set(skus.map((s) => normSku(s))) : null;
  const agora = agoraISO();
  const candidatos = itens.filter((x) => x.situacao !== 'publicado' && !x.naLoja && x.criavel
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

  const corpos = [];
  const titulosDoLote = new Set(), metasDoLote = new Set();
  for (const item of lote) {
    let ocupados;
    try { ocupados = await lerSeoOcupado(loja, item.nome); relato.chamadasLoja++; }
    catch (e) {
      relato.erros++; relato.ok = false;
      relato.itens.push({ sku: item.sku, erro: frase(e) });
      continue; // Não cria cadastro mínimo quando a consulta editorial falha.
    }
    const corpo = corpoDoProdutoOculto(item, { localDeEstoque: base.localDeEstoque,
      categoriaId: item.categoriaLoja?.id || null, categorias,
      seoTitulosOcupados: [...ocupados.seoTitulosOcupados, ...titulosDoLote],
      seoDescricoesOcupadas: [...ocupados.seoDescricoesOcupadas, ...metasDoLote] });
    titulosDoLote.add(texto(corpo.seo_title)); metasDoLote.add(texto(corpo.seo_description));
    corpos.push({ item, corpo });
  }

  if (seco || trava) {
    relato.criaveis = candidatos.length;
    relato.itens = corpos.map(({ item, corpo }) => ({ sku: item.sku, nome: item.nome, enviaria: corpo, pendencias: item.pendencias.map((p) => p.chave) }));
    relato.mapaCategorias = mapaCategorias;
    return relato;
  }
  if (mapaNovo) await db.batch([gravarConfigStmt(db, CHAVE_MAPA_CATEGORIAS, mapaCategorias)]);
  if (!corpos.length) return relato;

  /* A consulta por SKU precisa provar que funciona antes de valer como
     deduplicação: um código que o espelho diz estar na loja TEM de ser
     achado. Se não for, a rodada não cria nada — sem dedup confiável, criar
     é arriscar o segundo anúncio do mesmo código. */
  const conhecido = base.produtos.find((p) => p.produto_id_loja && base.lojaPorSku.has(normSku(p.sku)));
  if (conhecido) {
    const prova = await buscarPorSku(loja, conhecido.sku);
    relato.chamadasLoja++;
    if (!prova) {
      relato.interrompido = `A consulta por SKU não achou ${conhecido.sku}, que está na loja. Sem deduplicação confiável, nada foi criado.`;
      return relato;
    }
  }

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
  // Guarda o corpo proposto antes de qualquer POST, inclusive quando a
  // invocação morrer entre a criação remota e a gravação do vínculo.
  await db.batch(corpos.filter(({ item }) => reservados.has(item.sku)).map(({ item, corpo }) => db.prepare(
    `UPDATE nuvemshop_catalogo SET conteudo_json=? WHERE sku=? AND estado='criando' AND travado_ate=?`)
    .bind(JSON.stringify({ descricao: texto(corpo.description), seoTitulo: texto(corpo.seo_title),
      seoDescricao: texto(corpo.seo_description), regra: REGRA_ENRIQUECIMENTO, corpo }), item.sku, token)));

  const stmts = [];
  let parar = null;
  for (const { item, corpo } of corpos) {
    if (!reservados.has(item.sku)) continue;
    if (parar) { stmts.push(soltarStmt(db, item.sku)); continue; }
    try {
      const existente = await buscarPorSku(loja, item.sku);
      relato.chamadasLoja++;
      if (existente) {
        const vis = visibilidadeDe(existente);
        const eraNosso = base.catalogo.get(item.sku)?.estado === 'criando';
        stmts.push(...vincularStmts(db, item.sku, existente, {
          estado: vis === 'visible' ? 'visivel' : 'oculto', origem: eraNosso ? 'criado' : 'adotado',
        }));
        /* A reserva acima já gravou origem 'criado'; quem estava lá antes de
           nós é 'adotado'. */
        stmts.push(db.prepare('UPDATE nuvemshop_catalogo SET origem = ? WHERE sku = ?')
          .bind(eraNosso ? 'criado' : 'adotado', item.sku));
        relato.adotados++;
        relato.itens.push({ sku: item.sku, acao: 'adotado', produtoId: String(existente.id), visibilidade: vis });
        continue;
      }
      const criado = await loja.criarProduto(corpo);
      relato.chamadasLoja++;
      let produto = criado?.id != null ? await loja.produto(criado.id) : criado;
      if (criado?.id != null) relato.chamadasLoja++;
      const problemas = confereCriado(produto, corpo, item.sku);
      let vis = visibilidadeDe(produto);
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
        conteudo: corpo.description || corpo.seo_title
          ? { descricao: texto(corpo.description), seoTitulo: texto(corpo.seo_title), seoDescricao: texto(corpo.seo_description), categorias: (produto.categories || []).length, regra: REGRA_ENRIQUECIMENTO }
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
/* 4. VARIANTE QUE FALTA NUM ANÚNCIO QUE JÁ EXISTE — §64                     */
/* ======================================================================== */

/** As partes de uma variante da loja: [{ atributo, valor }], na ordem dos
 *  atributos do produto. */
const partesDaLoja = (v) => valoresDe(v);

/** A variante NOVA, montada na estrutura do anúncio. Para cada atributo da
 *  loja, nesta ordem:
 *
 *    1. o valor daqui que é do mesmo TIPO (aro com aro, cor com cor) — com a
 *       grafia das irmãs ("nº24" vira "n°24" quando elas são "n°18");
 *    2. senão, o valor que TODAS as irmãs têm igual ("Banho de Ouro 18k" no
 *       anel vendido só em ouro) — é atributo da peça, não da variação;
 *    3. senão, não há como saber: o plano para, com o motivo.
 *
 *  Todo valor daqui tem de ser usado exatamente uma vez. */
function montarValores(locaisValores, naLoja) {
  const atributosLoja = partesDaLoja(naLoja[0]).map((x) => x.atributo);
  if (!atributosLoja.length || atributosLoja.every((a) => !a)) {
    return { bloqueio: 'o anúncio não tem atributo de variação (é de opção única)' };
  }
  const usados = new Set();
  const saida = [];
  for (const [i, atributo] of atributosLoja.entries()) {
    const irmas = naLoja.map((v) => (partesDaLoja(v)[i] || {}).valor).filter(Boolean);
    const tiposIrmas = new Set(irmas.map(tipoDoValor));
    const tipoIrmas = tiposIrmas.size === 1 ? [...tiposIrmas][0] : null;
    const j = locaisValores.findIndex((x, k) => !usados.has(k) && tipoIrmas && tipoDoValor(x.valor) === tipoIrmas);
    if (j >= 0) {
      usados.add(j);
      saida.push({ atributo, valor: formatarValorNovo(locaisValores[j].valor, irmas) });
      continue;
    }
    const unicos = [...new Set(irmas.map((x) => chaveDaVariacao(x)))];
    if (irmas.length === naLoja.length && unicos.length === 1) {
      saida.push({ atributo, valor: irmas[0] });
      continue;
    }
    return { bloqueio: `não dá para saber o valor de "${atributo}" da variação nova` };
  }
  if (usados.size !== locaisValores.length) {
    return { bloqueio: `o anúncio não tem atributo para ${locaisValores.filter((_, k) => !usados.has(k)).map((x) => `"${x.valor}"`).join(', ')}` };
  }
  return { valores: saida };
}

/** As variações criadas aqui que o anúncio ainda não tem — e, para cada
 *  uma, a variante exata que a loja receberia, ou o motivo de não criar.
 *
 *  §64 mudou a regra. Antes só se criava em anúncio de 2+ variantes já em
 *  revisão; o anel de variante única ficava com "Variação só no Marquesa"
 *  como pendência para sempre. Agora:
 *
 *   - IDENTIDADE e QUANTIDADE são separadas. A variante nasce com estoque 0
 *     (nunca `null`, que na Nuvemshop é estoque infinito); o saldo dela vai
 *     pela fila (§61) só quando a divisão é conhecida. Sem divisão, o código
 *     fica em revisão e a única pergunta é "quantas de cada?".
 *   - equivalências primeiro: nº19, n°19, Nº 19, 19 e Aro 19 são o mesmo
 *     valor (`chaveDaVariacao`); "nº19" NUNCA é "n°21".
 *   - as variações daqui que já correspondem a uma variante da loja (par
 *     único, `equivalenciasLojaLocal`) são LIGADAS a ela no mesmo ato. Sem
 *     isso, o anúncio de variante única virava multivariante e o saldo da
 *     variação equivalente perdia o endereço.
 *   - preço: o comum das irmãs; sem ele, o preço daqui; sem nenhum, não cria.
 */
export function planoDeVariantesFaltantes(base) {
  const planos = [];
  for (const [sku, linhas] of base.variacoes) {
    const locais = linhas.filter((l) => l.origem === 'local');
    if (!locais.length) continue;
    const naLoja = base.lojaPorSku.get(normSku(sku)) || [];
    if (!naLoja.length) continue;
    const pids = new Set(naLoja.map((v) => String(v.produto_id)));
    if (pids.size !== 1) continue;
    const eq = equivalenciasLojaLocal(naLoja, locais);
    const pareadas = new Map([...eq.entries()].map(([vLoja, vAqui]) => [String(vAqui), String(vLoja)]));
    const chavesLoja = new Set();
    for (const v of naLoja) {
      chavesLoja.add(chaveDaVariacao(v.nome));
      const ps = partesDaLoja(v);
      /* parte que identifica a variante sozinha: as outras são constantes */
      for (const [i, p] of ps.entries()) {
        const outrasConstantes = ps.every((o, k) => k === i
          || naLoja.every((w) => chaveDaVariacao((partesDaLoja(w)[k] || {}).valor) === chaveDaVariacao(o.valor)));
        if (outrasConstantes) chavesLoja.add(chaveDaVariacao(p.valor));
      }
    }
    const precos = new Set(naLoja.map((v) => (v.preco == null ? 'null' : Number(v.preco).toFixed(2))));
    const produto = base.produtos.find((p) => String(p.sku) === String(sku));
    const precoDaqui = produto && Number(produto.preco) > 0 ? Number(produto.preco).toFixed(2) : null;
    const preco = precos.size === 1 && !precos.has('null') ? [...precos][0] : precoDaqui;
    /* O par por unicidade não é ligado (gravado): é operacional (§66). */
    const ligar = eq.porUnicidade ? [] : locais.filter((l) => pareadas.has(String(l.variante_id)))
      .map((l) => ({ nome: l.nome, varianteId: pareadas.get(String(l.variante_id)) }));

    for (const l of locais) {
      if (pareadas.has(String(l.variante_id))) continue;
      if (chavesLoja.has(chaveDaVariacao(l.nome))) continue;    // já existe lá, escrita de outro jeito
      const brutos = valoresDe(l);
      const normal = normalizarAtributos(brutos.map((x) => ({ nome: x.atributo, valores: [x.valor] }))).atributos;
      const valoresDaqui = brutos.map((x, i) => ({ atributo: normal[i].nome, valor: x.valor }));
      const montado = montarValores(valoresDaqui, naLoja);
      const motivo = [];
      if (montado.bloqueio) motivo.push(montado.bloqueio);
      if (!preco) motivo.push('não há preço nem nas outras variantes nem no cadastro');
      /* §66 — "Verde" ao lado de "Verde Esmeralda" pode ser a mesma cor
         escrita de outro jeito. Criar seria inventar uma variação; a dúvida
         é de gente (é o que reabre a equivalência por unicidade quando o
         anúncio ganha uma segunda variante). */
      const parecida = naLoja.find((v) => valoresParecidos(l.nome, v.nome));
      if (parecida) motivo.push(`"${l.nome}" pode ser a variação "${parecida.nome}" que a loja já tem — confirme se é a mesma`);
      const nomeNovo = montado.valores ? montado.valores.map((x) => x.valor).join(' · ') : null;
      if (nomeNovo && naLoja.some((v) => chaveDaVariacao(v.nome) === chaveDaVariacao(nomeNovo))) continue;
      const usados = (base.nomeados.get(sku) || []).some((r) => r.variacao === l.nome)
        || (base.maletaVar.get(sku) || []).some((r) => r.variacao === l.nome);
      planos.push({
        sku, produtoId: [...pids][0], nomeDaqui: l.nome,
        nomeNovo, valores: montado.valores || null, preco,
        atributos: partesDaLoja(naLoja[0]).map((x) => x.atributo),
        /* o nome daqui só segue a grafia da loja quando nenhum movimento ou
           maleta o usa (renomear desligaria o saldo do balde dele) e quando
           a estrutura daqui é a mesma do anúncio — "nº24" de um atributo só
           não vira "Banho · n°24" de dois ao lado de irmãs de um. */
        renomeia: !usados && valoresDaqui.map((x) => x.atributo).join('|')
          === partesDaLoja(naLoja[0]).map((x) => x.atributo).join('|'),
        ligar, local: base.localDeEstoque,
        bloqueio: motivo.length ? motivo.join('; ') : null,
      });
    }
  }
  return planos;
}

/** Cria na loja as variantes do plano (no máximo `limite`), uma por vez,
 *  cada uma com releitura antes e depois:
 *
 *    antes   a variante pode ter sido criada à mão desde o espelho — se
 *            existe, só liga;
 *    depois  tem de existir EXATAMENTE uma variante com aquele valor, todas
 *            com o SKU do código; duplicata é anunciada como erro (nada é
 *            apagado na loja).
 *
 *  A variante nasce com estoque 0; o código vai para a fila, que manda o
 *  saldo de cada variação quando ele é conhecido. */
export async function criarVariantesFaltantes(db, env, { seco = true, limite = 20, loja: lojaDada = null } = {}) {
  const trava = await travasDoCatalogo(db, env);
  const base = await lerBase(db);
  const planos = planoDeVariantesFaltantes(base);
  const relato = {
    ok: true, seco: seco || !!trava, trava: trava ? trava.trava : null, planos,
    criadas: 0, ligadas: 0, erros: 0, chamadasLoja: 0, itens: [],
  };
  if (seco || trava) return relato;
  const loja = lojaDada || new Nuvemshop(env);
  const stmts = [];
  const porProduto = new Map();
  for (const pl of planos.filter((x) => !x.bloqueio).slice(0, limite)) {
    if (!porProduto.has(pl.produtoId)) porProduto.set(pl.produtoId, []);
    porProduto.get(pl.produtoId).push(pl);
  }
  for (const [produtoId, lista] of porProduto) {
    try {
      let atual = await loja.produto(produtoId);
      relato.chamadasLoja++;
      const nomesAtributos = (atual.attributes || []).map(texto);
      if (nomesAtributos.join('|') !== lista[0].atributos.join('|')) {
        throw new Error(`os atributos do anúncio mudaram (${nomesAtributos.join(' · ') || 'nenhum'}); nada foi criado`);
      }
      const nomeDe = (v) => (v.values || []).map(texto).join(' · ');
      const novos = [];
      for (const pl of lista) {
        if ((atual.variants || []).some((v) => normSku(v.sku) !== normSku(pl.sku))) {
          throw new Error('o anúncio tem variante com outro SKU; nada foi criado');
        }
        let v = (atual.variants || []).find((x) => chaveDaVariacao(nomeDe(x)) === chaveDaVariacao(pl.nomeNovo));
        if (!v) {
          v = await loja.criarVariante(produtoId, {
            values: pl.valores.map((x) => ({ pt: x.valor })), sku: pl.sku, price: pl.preco,
            ...(pl.local ? { inventory_levels: [{ location_id: pl.local, stock: 0 }] } : { stock: 0 }),
          });
          relato.chamadasLoja++;
          novos.push(pl);
        }
        pl.varianteId = String(v.id);
      }
      /* A prova: relida, a loja tem cada valor UMA vez e o SKU de todas é o
         código. */
      atual = await loja.produto(produtoId);
      relato.chamadasLoja++;
      const contagem = new Map();
      for (const v of atual.variants || []) {
        const k = chaveDaVariacao(nomeDe(v));
        contagem.set(k, (contagem.get(k) || 0) + 1);
      }
      const duplicadas = [...contagem.entries()].filter(([, n]) => n > 1).map(([k]) => k);
      const outroSku = (atual.variants || []).filter((v) => normSku(v.sku) !== normSku(lista[0].sku));
      const sumiu = lista.filter((pl) => !(atual.variants || []).some((v) => String(v.id) === pl.varianteId));
      if (duplicadas.length || outroSku.length || sumiu.length) {
        throw new Error(`a releitura não confirmou: ${[duplicadas.length ? `valor repetido (${duplicadas.join(', ')})` : '',
          outroSku.length ? 'variante com outro SKU' : '', sumiu.length ? 'variante criada não apareceu' : ''].filter(Boolean).join('; ')}`);
      }
      const sku = lista[0].sku;
      const ligados = new Set();
      const ligar = (nome, vid) => {
        if (ligados.has(nome)) return;
        ligados.add(nome);
        stmts.push(db.prepare(
          `UPDATE produto_variacoes SET variante_id = ?, produto_id = ?, origem = 'loja', variante_sku = ?
            WHERE sku = ? AND nome = ?`).bind(vid, produtoId, sku, sku, nome));
        stmts.push(db.prepare(`UPDATE maleta_item_variacoes SET variante_id = ? WHERE sku = ? AND variacao = ?`)
          .bind(vid, sku, nome));
      };
      for (const pl of lista) {
        if (pl.renomeia && pl.nomeNovo !== pl.nomeDaqui) {
          stmts.push(db.prepare(
            `UPDATE produto_variacoes SET nome = ?, valores_json = ?, variante_id = ?, produto_id = ?, origem = 'loja', variante_sku = ?
              WHERE sku = ? AND nome = ?`).bind(pl.nomeNovo, JSON.stringify(pl.valores), pl.varianteId, produtoId, sku, sku, pl.nomeDaqui));
          ligados.add(pl.nomeDaqui);
        } else {
          ligar(pl.nomeDaqui, pl.varianteId);
        }
        relato.itens.push({ sku, acao: novos.includes(pl) ? 'criada' : 'ja_existia', varianteId: pl.varianteId, nome: pl.nomeNovo });
        if (novos.includes(pl)) relato.criadas++;
      }
      for (const l of lista[0].ligar) {
        ligar(l.nome, l.varianteId);
        relato.ligadas++;
      }
      stmts.push(enfileirarStmt(db, sku, 'variante_criada'));
      stmts.push(...espelhoStmts(db, atual));
    } catch (e) {
      relato.erros++;
      for (const pl of lista) relato.itens.push({ sku: pl.sku, acao: 'erro', nome: pl.nomeNovo, erro: frase(e) });
    }
  }
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  return relato;
}

/* ======================================================================== */
/* 4b. CATEGORIA ÓBVIA — §64                                                 */
/* ======================================================================== */

/** O mapa de categorias com as subcategorias ("prata 925/conjuntos"). O
 *  gravado antes de §64 só tinha raízes; sem uma chave com "/", relê. */
async function mapaCompleto(db, loja, base, relato) {
  const atual = base.mapaCategorias;
  if (atual && Object.keys(atual).some((k) => k.includes('/'))) return atual;
  const mapa = mapearCategorias(await loja.categorias());
  relato.chamadasLoja++;
  await db.batch([gravarConfigStmt(db, CHAVE_MAPA_CATEGORIAS, mapa)]);
  return mapa;
}

/** Aplica na loja a categoria canônica (`taxonomia.js`) dos anúncios que
 *  estão SEM categoria nenhuma. Só preenche o vazio: produto com qualquer
 *  categoria — mesmo uma que pareça errada — não é tocado. Releitura antes
 *  (a loja pode ter ganhado categoria à mão) e depois (a prova). */
export async function preencherCategorias(db, env, { seco = true, limite = 5, loja: lojaDada = null } = {}) {
  const trava = await travasDoCatalogo(db, env);
  const relato = { ok: true, seco: seco || !!trava, trava: trava ? trava.trava : null, aplicadas: 0, jaTinham: 0, erros: 0, chamadasLoja: 0, itens: [] };
  const loja = lojaDada || new Nuvemshop(env);
  const base = await lerBase(db);
  if (!relato.seco) {
    if (!loja.configurada()) return { ...relato, ok: false, erro: 'A loja não está conectada.' };
    base.mapaCategorias = await mapaCompleto(db, loja, base, relato);
  }
  const { itens } = classificarCatalogo(base);
  const alvos = itens.filter((x) => x.naLoja && x.produtoId && x.categoriaLoja?.id
    && x.pendencias.some((p) => p.chave === 'categoria'));
  relato.pendentes = alvos.length;
  if (relato.seco) {
    relato.itens = alvos.map((x) => ({ sku: x.sku, categoria: x.categoriaLoja.chave, regra: x.categoriaLoja.regra }));
    return relato;
  }
  const stmts = [];
  for (const x of alvos.slice(0, limite)) {
    try {
      const antes = await loja.produto(x.produtoId);
      relato.chamadasLoja++;
      const ids = (p) => (p.categories || []).map((c) => String(c && typeof c === 'object' ? c.id : c));
      if (ids(antes).length) {
        relato.jaTinham++;
        relato.itens.push({ sku: x.sku, acao: 'ja_tinha', categorias: ids(antes) });
      } else {
        await loja.atualizarProduto(x.produtoId, { categories: [Number(x.categoriaLoja.id) || x.categoriaLoja.id] });
        relato.chamadasLoja++;
        const depois = await loja.produto(x.produtoId);
        relato.chamadasLoja++;
        if (!ids(depois).includes(String(x.categoriaLoja.id))) throw new Error('a releitura não mostrou a categoria');
        relato.aplicadas++;
        relato.itens.push({ sku: x.sku, acao: 'aplicada', categoria: x.categoriaLoja.chave });
      }
      stmts.push(db.prepare('UPDATE nuvemshop_conferencia SET ns_categorias = 1 WHERE sku = ?').bind(x.sku));
    } catch (e) {
      relato.erros++;
      relato.itens.push({ sku: x.sku, acao: 'erro', erro: frase(e) });
    }
  }
  if (stmts.length) await db.batch(stmts);
  return relato;
}

/* ======================================================================== */
/* 4c. ATRIBUTO QUE CONTRADIZ O VALOR (no cadastro daqui) — §64              */
/* ======================================================================== */

/** "Tamanho = Azul" gravado aqui vira "Cor = Azul". Só variação de origem
 *  local (a da loja espelha o que a loja tem). O NOME da variação — que é
 *  o que os movimentos e as maletas guardam — não muda: só o atributo. */
export async function normalizarAtributosLocais(db, { seco = true } = {}) {
  const linhas = (await db.prepare(
    `SELECT sku, nome, atributo, valores_json FROM produto_variacoes WHERE origem = 'local' ORDER BY sku, ordem`).all()).results || [];
  const porSku = new Map();
  for (const l of linhas) {
    if (!porSku.has(l.sku)) porSku.set(l.sku, []);
    porSku.get(l.sku).push(l);
  }
  const trocas = [];
  const stmts = [];
  for (const [sku, ls] of porSku) {
    const estruturas = ls.map(valoresDe);
    const nomes = estruturas[0].map((x) => x.atributo);
    if (estruturas.some((e) => e.map((x) => x.atributo).join('|') !== nomes.join('|'))) continue;
    const r = normalizarAtributos(nomes.map((a, i) => ({ nome: a, valores: estruturas.map((e) => e[i].valor) })));
    if (!r.trocas.length) continue;
    const novos = r.atributos.map((a) => a.nome);
    trocas.push({ sku, trocas: r.trocas.map((t) => ({ de: t.de, para: t.para, valores: t.valores })) });
    for (const [i, l] of ls.entries()) {
      const valores = estruturas[i].map((x, k) => ({ atributo: novos[k], valor: x.valor }));
      stmts.push(db.prepare(`UPDATE produto_variacoes SET atributo = ?, valores_json = ? WHERE sku = ? AND nome = ? AND origem = 'local'`)
        .bind(novos.join(' · '), JSON.stringify(valores), sku, l.nome));
    }
  }
  if (!seco && stmts.length) for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  return { ok: true, seco, corrigidos: trocas.length, trocas };
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
     erro de envio) também seguram a publicação. Lidas AGORA e só deste
     código (§63): no lote, cada item é revalidado na hora dele. */
  const base = await lerBase(db, { skus: [p.sku] });
  const item = classificarCatalogo(base).itens.find((x) => x.sku === String(p.sku));
  const pendLocais = (item?.pendencias || []).map((x) => x.chave)
    .filter((c) => ['estoque_variacao', 'variacao', 'estoque', 'preco', 'duplicidade'].includes(c));
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
    // O gesto permanece exclusivamente humano. Pass-through só protege o
    // conteúdo aprovado de APIs que limpam idiomas omitidos no PUT.
    const preservar = Object.fromEntries(['name', 'handle', 'description', 'seo_title', 'seo_description']
      .filter((k) => Object.hasOwn(produto, k)).map((k) => [k, produto[k]]));
    await loja.atualizarProduto(p.produto_id_loja, { ...preservar, visibility: 'visible' });
    const relido = await loja.produto(p.produto_id_loja);
    const vis = visibilidadeDe(relido);
    if (vis !== 'visible') throw new Error(`a loja respondeu ${vis || 'sem visibilidade'} depois da troca`);
    for (const [campo, valor] of Object.entries(preservar)) {
      if (JSON.stringify(relido[campo]) !== JSON.stringify(valor)) throw new Error(`a publicação não preservou ${campo}`);
    }
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

/** §63 — A PRÉVIA do anúncio: o que a loja tem hoje para este código,
 *  lido na hora (uma chamada, só leitura). Para a conferência antes de
 *  publicar — nome, preço, estoque, categoria, variação, descrição, SEO,
 *  tags, atributos, fotos. Não escreve nada, nem aqui nem lá; não passa
 *  pelas travas de escrita, só pela credencial. */
export async function lerAnuncio(db, env, sku, { loja: lojaDada = null } = {}) {
  const k = normSku(sku);
  const p = await db.prepare(`SELECT sku, desc, produto_id_loja FROM produtos WHERE sku = ? AND status = 'ativo'`).bind(k).first();
  if (!p) return ERRO(404, `Código ${sku} não está ativo no catálogo.`);
  if (!p.produto_id_loja) return ERRO(409, 'Esta peça ainda não está cadastrada na Nuvemshop.', { naLoja: false });
  const loja = lojaDada || new Nuvemshop(env);
  if (!lojaDada && !loja.configurada()) return ERRO(409, 'A loja não está conectada. Falta o token da Nuvemshop.');
  let produto;
  try { produto = await loja.produto(p.produto_id_loja); } catch (e) { return ERRO(502, frase(e)); }
  const tags = Array.isArray(produto.tags) ? produto.tags.map(texto) : String(texto(produto.tags) || '')
    .split(',').map((x) => x.trim()).filter(Boolean);
  return {
    ok: true,
    sku: p.sku,
    produtoId: String(p.produto_id_loja),
    lidoEm: agoraISO(),
    visibilidade: visibilidadeDe(produto),
    nome: texto(produto.name),
    descricao: texto(produto.description),
    seoTitulo: texto(produto.seo_title),
    seoDescricao: texto(produto.seo_description),
    tags,
    atributos: (produto.attributes || []).map(texto),
    categorias: (produto.categories || []).map((c) => texto(c.name) || String(c.id)),
    imagens: (produto.images || []).map((i) => i.src).filter(Boolean),
    url: texto(produto.canonical_url) || null,
    variantes: (produto.variants || []).map((v) => ({
      id: String(v.id),
      sku: v.sku || null,
      valores: (v.values || []).map(texto),
      preco: Number(v.promotional_price || v.price) > 0 ? Number(v.promotional_price || v.price) : null,
      estoque: Number.isFinite(estoqueDaVariante(v)) ? estoqueDaVariante(v) : null,
    })),
    faltam: faltasNoAnuncio(produto),
  };
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
