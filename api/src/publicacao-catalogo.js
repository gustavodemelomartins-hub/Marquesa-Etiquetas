/** Pacote 4 — preparação, prévia e aprovação do catálogo da Nuvemshop.
 *
 * Este módulo para deliberadamente ANTES da escrita externa. Ele organiza o
 * rascunho e registra a aprovação humana, mas não cria produto, não altera
 * preço e não toca no estoque da Nuvemshop. O executor externo só poderá ser
 * ligado depois da confirmação final dos estados/botões (§15 da especificação).
 */
import { gerarFundoBranco, FOTO } from './fotos.js';

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });
const normSku = (v) => String(v == null ? '' : v).trim().toUpperCase();
const texto = (v, limite = 5000) => String(v == null ? '' : v).trim().slice(0, limite);

export const ESTADO_PUBLICACAO = {
  FALTA: 'falta_informacao',
  PREPARANDO: 'em_preparacao_agente',
  AGUARDANDO: 'aguardando_aprovacao',
  APROVADO: 'aprovado_para_publicar',
  PUBLICADO: 'publicado',
  FALHOU: 'falhou_ao_publicar',
};

const ROTULOS = {
  [ESTADO_PUBLICACAO.FALTA]: 'Falta informação',
  [ESTADO_PUBLICACAO.PREPARANDO]: 'Em preparação pelo agente',
  [ESTADO_PUBLICACAO.AGUARDANDO]: 'Aguardando aprovação',
  [ESTADO_PUBLICACAO.APROVADO]: 'Aprovado para publicar',
  [ESTADO_PUBLICACAO.PUBLICADO]: 'Publicado',
  [ESTADO_PUBLICACAO.FALHOU]: 'Falhou ao publicar',
};

function assinatura(p) {
  return JSON.stringify({
    sku: p.sku,
    nome: texto(p.desc, 300),
    categoria: texto(p.cat, 120),
    preco: p.preco == null ? null : Number(p.preco),
    quantidade: Number(p.casa ?? 0),
    foto: p.foto_tratada_key || null,
  });
}

function faltasBasicas(p) {
  const faltas = [];
  if (!texto(p.sku)) faltas.push('codigo');
  if (!texto(p.desc) || normSku(p.desc) === normSku(p.sku)) faltas.push('nome');
  if (!texto(p.cat) || p.cat === 'Outros') faltas.push('categoria');
  if (p.preco == null || Number(p.preco) <= 0) faltas.push('preco');
  if (Number(p.casa ?? 0) <= 0) faltas.push('quantidade');
  if (!p.foto_original_key && !p.foto_tratada_key) faltas.push('foto');
  return faltas;
}

function rascunhoCompleto(f) {
  return !!(texto(f?.nome_site) && texto(f?.descricao_site)
    && texto(f?.seo_titulo) && texto(f?.seo_descricao));
}

async function lerFluxos(db) {
  try {
    const { results } = await db.prepare('SELECT * FROM catalogo_publicacoes').all();
    return { migrado: true, mapa: new Map((results ?? []).map((x) => [x.sku, x])) };
  } catch {
    return { migrado: false, mapa: new Map() };
  }
}

async function lerProdutos(db) {
  const { results } = await db.prepare(`
    SELECT p.sku, p.desc, p.cat, p.preco, p.qtd, p.url_loja,
           p.foto_original_key, p.foto_tratada_key, p.foto_status, p.foto_erro,
           p.qtd - COALESCE((
             SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
               JOIN maletas m ON m.id = mi.maleta_id
              WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')
           ), 0) AS casa
      FROM produtos p
     WHERE p.status = 'ativo'
     ORDER BY p.desc, p.sku`).all();
  return results ?? [];
}

function estadoDoItem(p, fluxo) {
  const falta = faltasBasicas(p);
  if (p.url_loja) return { estado: ESTADO_PUBLICACAO.PUBLICADO, falta: [] };
  if (falta.length) return { estado: ESTADO_PUBLICACAO.FALTA, falta };
  if (!p.foto_tratada_key || !rascunhoCompleto(fluxo)) {
    return { estado: ESTADO_PUBLICACAO.PREPARANDO, falta: p.foto_tratada_key ? [] : ['fundo_branco'] };
  }
  const assinaturaAtual = assinatura(p);
  const aprovacaoVigente = fluxo?.dados_assinatura === assinaturaAtual;
  if (fluxo?.estado === ESTADO_PUBLICACAO.FALHOU && aprovacaoVigente) {
    return { estado: ESTADO_PUBLICACAO.FALHOU, falta: [] };
  }
  if (fluxo?.estado === ESTADO_PUBLICACAO.APROVADO && aprovacaoVigente) {
    return { estado: ESTADO_PUBLICACAO.APROVADO, falta: [] };
  }
  return {
    estado: ESTADO_PUBLICACAO.AGUARDANDO,
    falta: [],
    aprovacaoInvalidada: !!fluxo?.aprovado_em && !aprovacaoVigente,
  };
}

function itemPublico(p, fluxo) {
  const calculado = estadoDoItem(p, fluxo);
  const bloqueioExterno = calculado.estado === ESTADO_PUBLICACAO.PREPARANDO && fluxo?.preparo_erro
    ? {
        motivo: fluxo.preparo_erro,
        proximoPasso: 'Configure o preparador do catálogo ou preencha a prévia manualmente.',
      }
    : null;
  return {
    sku: p.sku,
    desc: p.desc,
    cat: p.cat,
    preco: p.preco == null ? null : Number(p.preco),
    casa: Number(p.casa ?? 0),
    qtd: Number(p.qtd ?? 0),
    fotoStatus: p.foto_status || FOTO.SEM,
    temOriginal: !!p.foto_original_key,
    temTratada: !!p.foto_tratada_key,
    estado: calculado.estado,
    estadoRotulo: ROTULOS[calculado.estado],
    falta: calculado.falta,
    pronto: calculado.estado === ESTADO_PUBLICACAO.AGUARDANDO
      || calculado.estado === ESTADO_PUBLICACAO.APROVADO,
    aprovacaoInvalidada: !!calculado.aprovacaoInvalidada,
    bloqueioExterno,
    erroPublicacao: fluxo?.publicacao_erro || null,
    tentativas: Number(fluxo?.tentativas ?? 0),
    rascunho: rascunhoCompleto(fluxo) ? {
      nomeSite: fluxo.nome_site,
      descricaoSite: fluxo.descricao_site,
      seoTitulo: fluxo.seo_titulo,
      seoDescricao: fluxo.seo_descricao,
    } : null,
    aprovadoEm: fluxo?.aprovado_em || null,
    aprovadoPor: fluxo?.aprovado_por || null,
    publicadoEm: fluxo?.publicado_em || null,
    urlLoja: p.url_loja || null,
    dadosAssinaturaAtual: assinatura(p),
  };
}

/** Lista compatível com a tela antiga e, em `itens`, expõe a máquina de
 * estados completa do Pacote 4. Bancos ainda sem a migration continuam em
 * leitura; apenas preparar/aprovar fica indisponível. */
export async function listarPublicacoes(db) {
  const [produtos, fluxos] = await Promise.all([lerProdutos(db), lerFluxos(db)]);
  const itens = produtos
    .filter((p) => p.url_loja || Number(p.casa ?? 0) > 0 || fluxos.mapa.has(p.sku))
    .map((p) => itemPublico(p, fluxos.mapa.get(p.sku)));

  const candidatos = itens.filter((x) => !x.urlLoja && x.casa > 0);
  const antigas = { prontos: [], semFoto: [], semFundoBranco: [], semDescricao: [], semCategoria: [], semPreco: [] };
  for (const x of candidatos) {
    const falta = [];
    if (!x.temOriginal && !x.temTratada) { falta.push('foto'); antigas.semFoto.push(x); }
    else if (!x.temTratada) { falta.push('fundo_branco'); antigas.semFundoBranco.push(x); }
    if (!texto(x.desc) || normSku(x.desc) === normSku(x.sku)) { falta.push('descricao'); antigas.semDescricao.push(x); }
    if (!texto(x.cat) || x.cat === 'Outros') { falta.push('categoria'); antigas.semCategoria.push(x); }
    if (x.preco == null || x.preco <= 0) { falta.push('preco'); antigas.semPreco.push(x); }
    x.faltaLegada = falta;
    if (!falta.length) antigas.prontos.push(x);
  }
  const valor = (lista) => lista.reduce((s, p) => s + p.casa * (p.preco || 0), 0);
  const ordena = (lista) => lista.slice().sort((a, b) => (b.casa * (b.preco || 0)) - (a.casa * (a.preco || 0)))
    .map((x) => ({ ...x, falta: x.faltaLegada ?? x.falta, pronto: !(x.faltaLegada ?? []).length }));
  const estados = {};
  for (const x of itens) estados[x.estado] = (estados[x.estado] || 0) + 1;
  const bloqueadosUnicos = candidatos.filter((x) => x.estado === ESTADO_PUBLICACAO.FALTA
    || x.estado === ESTADO_PUBLICACAO.PREPARANDO);

  return {
    ok: true,
    migrado: fluxos.migrado,
    escritaNaLojaHabilitada: false,
    decisaoPendente: 'Confirme os estados e botões finais antes de permitir escrita automática na Nuvemshop.',
    resumo: {
      prontos: antigas.prontos.length,
      pecasProntas: antigas.prontos.reduce((s, p) => s + p.casa, 0),
      valorPronto: valor(antigas.prontos),
      semFoto: antigas.semFoto.length,
      semFundoBranco: antigas.semFundoBranco.length,
      semDescricao: antigas.semDescricao.length,
      semCategoria: antigas.semCategoria.length,
      semPreco: antigas.semPreco.length,
      valorParado: valor(bloqueadosUnicos),
      estados,
    },
    itens,
    prontos: ordena(antigas.prontos).slice(0, 500),
    semFoto: ordena(antigas.semFoto).slice(0, 500),
    semFundoBranco: ordena(antigas.semFundoBranco).slice(0, 500),
    semDescricao: ordena(antigas.semDescricao).slice(0, 500),
    semCategoria: ordena(antigas.semCategoria).slice(0, 500),
    semPreco: ordena(antigas.semPreco).slice(0, 500),
  };
}

async function itemPorSku(db, sku) {
  const lista = await listarPublicacoes(db);
  return { lista, item: lista.itens.find((x) => x.sku === normSku(sku)) || null };
}

async function exigirTabela(db) {
  try {
    await db.prepare('SELECT sku FROM catalogo_publicacoes LIMIT 1').first();
    return null;
  } catch {
    return ERRO(503, 'O fluxo de publicação ainda não foi preparado neste banco.', {
      proximoPasso: 'Aplique api/migracao-publicacao-catalogo.sql neste ambiente antes de preparar produtos.',
    });
  }
}

async function gravarRascunho(db, p, rascunho, preparoErro = null) {
  const nomeSite = texto(rascunho.nomeSite || p.desc, 300);
  const descricaoSite = texto(rascunho.descricaoSite, 5000);
  const seoTitulo = texto(rascunho.seoTitulo, 300);
  const seoDescricao = texto(rascunho.seoDescricao, 500);
  if (!descricaoSite || !seoTitulo || !seoDescricao) {
    return ERRO(400, 'A prévia precisa de descrição do site, título SEO e descrição SEO.');
  }
  /* O nome comercial é a entrada humana do cadastro. O preparador não pode
     renomear a peça silenciosamente. */
  if (normSku(nomeSite) !== normSku(p.desc)) {
    return ERRO(409, 'O nome da prévia deve ser o Nome da peça informado no cadastro.', { nomeEsperado: p.desc });
  }
  await db.prepare(`
    INSERT INTO catalogo_publicacoes
      (sku, estado, nome_site, descricao_site, seo_titulo, seo_descricao,
       dados_assinatura, preparo_erro, preparado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(sku) DO UPDATE SET
      estado=excluded.estado, nome_site=excluded.nome_site,
      descricao_site=excluded.descricao_site, seo_titulo=excluded.seo_titulo,
      seo_descricao=excluded.seo_descricao, dados_assinatura=excluded.dados_assinatura,
      preparo_erro=excluded.preparo_erro, preparado_em=excluded.preparado_em,
      aprovado_em=NULL, aprovado_por=NULL, atualizado_em=excluded.atualizado_em`).bind(
    p.sku, ESTADO_PUBLICACAO.AGUARDANDO, nomeSite, descricaoSite, seoTitulo,
    seoDescricao, p.dadosAssinaturaAtual, preparoErro,
  ).run();
  return { ok: true };
}

export async function salvarPreviaPublicacao(db, sku, corpo = {}) {
  const faltaTabela = await exigirTabela(db);
  if (faltaTabela) return faltaTabela;
  const { item } = await itemPorSku(db, sku);
  if (!item) return ERRO(404, 'Produto não encontrado na fila de publicação.');
  if (item.estado === ESTADO_PUBLICACAO.FALTA) {
    return ERRO(409, 'Complete as informações obrigatórias antes da prévia.', { faltam: item.falta });
  }
  if (!item.temTratada) {
    return ERRO(409, 'A foto com fundo branco precisa estar pronta antes da prévia.', { faltam: ['fundo_branco'] });
  }
  const p = {
    sku: item.sku, desc: item.desc, cat: item.cat, preco: item.preco,
    casa: item.casa, dadosAssinaturaAtual: item.dadosAssinaturaAtual,
  };
  const salvo = await gravarRascunho(db, p, corpo);
  if (!salvo.ok) return salvo;
  const atualizado = (await itemPorSku(db, sku)).item;
  return { ok: true, item: atualizado, escritaNaLoja: false };
}

/** Dispara a preparação. Tratamento de foto e geração de texto são serviços
 * configuráveis; ausência de integração vira bloqueio explícito, nunca falso
 * sucesso. Também aceita `rascunho` em testes/callback autenticado do agente. */
export async function prepararPublicacao(db, env, sku, corpo = {}) {
  const faltaTabela = await exigirTabela(db);
  if (faltaTabela) return faltaTabela;
  let { item } = await itemPorSku(db, sku);
  if (!item) return ERRO(404, 'Produto não encontrado na fila de publicação.');
  if (item.estado === ESTADO_PUBLICACAO.FALTA) {
    return ERRO(409, 'Ainda faltam informações para iniciar a preparação.', { faltam: item.falta });
  }

  await db.prepare(`
    INSERT INTO catalogo_publicacoes (sku, estado, preparo_erro, atualizado_em)
    VALUES (?, ?, NULL, datetime('now'))
    ON CONFLICT(sku) DO UPDATE SET estado=excluded.estado, preparo_erro=NULL,
      aprovado_em=NULL, aprovado_por=NULL, atualizado_em=excluded.atualizado_em`).bind(
    item.sku, ESTADO_PUBLICACAO.PREPARANDO,
  ).run();

  if (!item.temTratada) {
    const foto = await gerarFundoBranco(db, env, item.sku);
    if (!foto.ok || foto.pendente) {
      const motivo = foto.erro || foto.detalhe || 'O tratamento da foto ainda não terminou.';
      await db.prepare('UPDATE catalogo_publicacoes SET preparo_erro=?, atualizado_em=datetime(\'now\') WHERE sku=?')
        .bind(motivo, item.sku).run();
      return {
        ok: true,
        estado: ESTADO_PUBLICACAO.PREPARANDO,
        bloqueioExterno: { motivo, proximoPasso: 'Configure o serviço de fundo branco e tente preparar novamente.' },
        escritaNaLoja: false,
      };
    }
    item = (await itemPorSku(db, sku)).item;
  }

  if (corpo.rascunho) return salvarPreviaPublicacao(db, sku, corpo.rascunho);

  const endereco = texto(env.PREPARADOR_CATALOGO_URL, 2000);
  if (!endereco) {
    const motivo = 'O serviço do agente de catálogo não está configurado (falta PREPARADOR_CATALOGO_URL).';
    await db.prepare('UPDATE catalogo_publicacoes SET preparo_erro=?, atualizado_em=datetime(\'now\') WHERE sku=?')
      .bind(motivo, item.sku).run();
    return {
      ok: true,
      estado: ESTADO_PUBLICACAO.PREPARANDO,
      bloqueioExterno: { motivo, proximoPasso: 'Configure o serviço ou preencha a prévia manualmente.' },
      escritaNaLoja: false,
    };
  }

  try {
    const resp = await fetch(endereco, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.PREPARADOR_CATALOGO_TOKEN ? { Authorization: `Bearer ${env.PREPARADOR_CATALOGO_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        sku: item.sku, nome: item.desc, categoria: item.cat,
        preco: item.preco, quantidade: item.casa, fotoComFundoBranco: true,
      }),
    });
    if (!resp.ok) throw new Error(`o serviço respondeu ${resp.status}`);
    const rascunho = await resp.json();
    const salvo = await salvarPreviaPublicacao(db, sku, { ...rascunho, nomeSite: item.desc });
    if (!salvo.ok) throw new Error(salvo.erro);
    return salvo;
  } catch (e) {
    const motivo = `O agente não concluiu a preparação: ${String(e?.message || e)}`;
    await db.prepare('UPDATE catalogo_publicacoes SET preparo_erro=?, atualizado_em=datetime(\'now\') WHERE sku=?')
      .bind(motivo, item.sku).run();
    return ERRO(502, motivo, {
      estado: ESTADO_PUBLICACAO.PREPARANDO,
      proximoPasso: 'Corrija a integração e tente novamente; nenhum dado foi enviado à Nuvemshop.',
    });
  }
}

export async function aprovarPublicacao(db, sku, { aprovadoPor = 'operador' } = {}) {
  const faltaTabela = await exigirTabela(db);
  if (faltaTabela) return faltaTabela;
  const { item } = await itemPorSku(db, sku);
  if (!item) return ERRO(404, 'Produto não encontrado na fila de publicação.');
  if (item.estado !== ESTADO_PUBLICACAO.AGUARDANDO || !item.rascunho) {
    return ERRO(409, 'Somente uma prévia completa, com todos os gates válidos, pode ser aprovada.', {
      estado: item.estado, faltam: item.falta,
    });
  }
  await db.prepare(`UPDATE catalogo_publicacoes
    SET estado=?, dados_assinatura=?, aprovado_em=datetime('now'), aprovado_por=?,
        publicacao_erro=NULL, atualizado_em=datetime('now') WHERE sku=?`).bind(
    ESTADO_PUBLICACAO.APROVADO, item.dadosAssinaturaAtual,
    texto(aprovadoPor, 120) || 'operador', item.sku,
  ).run();
  return {
    ok: true,
    item: (await itemPorSku(db, sku)).item,
    escritaNaLoja: false,
    aviso: 'Aprovação registrada. A publicação automática continua desabilitada.',
  };
}

export async function reabrirPublicacao(db, sku) {
  const faltaTabela = await exigirTabela(db);
  if (faltaTabela) return faltaTabela;
  const fluxo = await db.prepare('SELECT estado FROM catalogo_publicacoes WHERE sku=?').bind(normSku(sku)).first();
  if (!fluxo) return ERRO(404, 'Este produto ainda não tem prévia.');
  await db.prepare(`UPDATE catalogo_publicacoes SET estado=?, aprovado_em=NULL,
    aprovado_por=NULL, publicacao_erro=NULL, atualizado_em=datetime('now') WHERE sku=?`).bind(
    ESTADO_PUBLICACAO.AGUARDANDO, normSku(sku),
  ).run();
  return { ok: true, item: (await itemPorSku(db, sku)).item, escritaNaLoja: false };
}

/** Retry seguro de uma falha futura: preserva a aprovação apenas quando a
 * assinatura dos dados continua idêntica. Ainda não executa a escrita. */
export async function repetirPublicacao(db, sku) {
  const faltaTabela = await exigirTabela(db);
  if (faltaTabela) return faltaTabela;
  const fluxo = await db.prepare('SELECT * FROM catalogo_publicacoes WHERE sku=?').bind(normSku(sku)).first();
  const { item } = await itemPorSku(db, sku);
  if (!fluxo || !item || fluxo.estado !== ESTADO_PUBLICACAO.FALHOU) {
    return ERRO(409, 'Somente uma publicação que falhou pode ser preparada para nova tentativa.');
  }
  if (fluxo.dados_assinatura !== item.dadosAssinaturaAtual) {
    return ERRO(409, 'Os dados mudaram depois da aprovação. Revise a prévia e aprove novamente.');
  }
  await db.prepare(`UPDATE catalogo_publicacoes SET estado=?, publicacao_erro=NULL,
    tentativas=tentativas+1, atualizado_em=datetime('now') WHERE sku=?`).bind(
    ESTADO_PUBLICACAO.APROVADO, item.sku,
  ).run();
  return {
    ok: true, item: (await itemPorSku(db, sku)).item, escritaNaLoja: false,
    aviso: 'Nova tentativa preparada; a escrita automática continua desabilitada.',
  };
}
