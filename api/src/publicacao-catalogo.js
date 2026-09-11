/** Pacote 4 — preparação, prévia e aprovação do catálogo da Nuvemshop.
 *
 * Este módulo para deliberadamente ANTES da escrita externa. Ele organiza o
 * rascunho e registra a aprovação humana, mas não cria produto, não altera
 * preço e não toca no estoque da Nuvemshop. O executor externo só poderá ser
 * ligado depois da confirmação final dos estados/botões (§15 da especificação).
 */
import { gerarFundoBranco, FOTO } from './fotos.js';
import { lerConfig } from './plataforma/config.js';
import { normSku } from './sku.js';
/* O juiz UNICO de completude (Fase 4.5). Este arquivo tinha a sua propria
   `faltasBasicas`, que discordava das outras tres do sistema — em
   particular sobre preco zero e sobre a categoria "Outros". */
import {
  faltasDaPeca, capacidadesDoAmbiente, sentinelasDeCategoria,
} from './catalogo/completude.js';
import { skusComFotoPropria } from './catalogo/galeria.js';

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });
const texto = (v, limite = 5000) => String(v == null ? '' : v).trim().slice(0, limite);

/** Os estados do pipeline. Dois sao CALCULADOS e nunca persistidos
 *  (`FALTA`, `PRONTO`) — quem decide e o juiz de completude, nao a tabela.
 *  Os demais sao gravados, e desde a Fase 4.5 todos tem writer real: os
 *  dois ultimos eram declarados no CHECK e nenhum caminho os escrevia. */
export const ESTADO_PUBLICACAO = {
  FALTA: 'falta_informacao',
  PRONTO: 'pronto_para_preparacao',
  PREPARANDO: 'em_preparacao',
  PREPARADO: 'preparado',
  AGUARDANDO: 'aguardando_aprovacao',
  APROVADO: 'aprovado_para_publicar',
  PUBLICANDO: 'publicando',
  PUBLICADO: 'publicado',
  FALHOU: 'falhou_ao_publicar',
  DESPUBLICADO: 'despublicado',
};

const ROTULOS = {
  [ESTADO_PUBLICACAO.FALTA]: 'Falta informação',
  [ESTADO_PUBLICACAO.PRONTO]: 'Pronto para preparação',
  [ESTADO_PUBLICACAO.PREPARANDO]: 'Em preparação',
  [ESTADO_PUBLICACAO.PREPARADO]: 'Conteúdo preparado',
  [ESTADO_PUBLICACAO.AGUARDANDO]: 'Aguardando aprovação',
  [ESTADO_PUBLICACAO.APROVADO]: 'Aprovado para publicar',
  [ESTADO_PUBLICACAO.PUBLICANDO]: 'Publicando',
  [ESTADO_PUBLICACAO.PUBLICADO]: 'Publicado',
  [ESTADO_PUBLICACAO.FALHOU]: 'Falhou ao publicar',
  [ESTADO_PUBLICACAO.DESPUBLICADO]: 'Despublicado',
};

/* O estado que o banco antigo guardava, traduzido na leitura. A migration
   ja converte as linhas; isto cobre um banco que ainda nao a rodou. */
const ESTADO_LEGADO = { em_preparacao_agente: ESTADO_PUBLICACAO.PREPARANDO };
const traduzir = (e) => ESTADO_LEGADO[e] || e;

/** A impressao digital dos dados aprovados.
 *
 *  E o mecanismo que invalida a aprovacao sozinha quando a peca muda — e
 *  continua sendo, palavra por palavra, o que era antes da Fase 4.5. O
 *  unico acrescimo e a foto APROVADA da galeria propria, que passou a ser
 *  o que vai para a vitrine quando existe. */
function assinatura(p) {
  return JSON.stringify({
    sku: p.sku,
    nome: texto(p.desc, 300),
    categoria: texto(p.cat, 120),
    preco: p.preco == null ? null : Number(p.preco),
    quantidade: Number(p.casa ?? 0),
    foto: p.foto_aprovada_id || p.foto_tratada_key || null,
  });
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
    SELECT p.sku, p.desc, p.cat, p.preco, p.qtd, p.url_loja, p.foto_url, p.produto_id_loja,
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

/** O estado da PECA no pipeline — que e decisao nossa — e nada mais.
 *
 *  Duas mudancas da Fase 4.5, e as duas vem da auditoria:
 *
 *  1. `foto_tratada_key` deixou de ser gate. Antes, sem ela a peca nao saia
 *     de "em preparacao"; como producao nao tem R2 para preenche-la, isso
 *     travava o pipeline inteiro dois passos antes do executor. Agora a
 *     ausencia da foto preparada e BLOQUEIO, e bloqueio nao impede a peca de
 *     esperar aprovacao — impede o ambiente de trabalhar, e diz isso.
 *
 *  2. `publicado` deixou de ser derivado de `url_loja` quando existe estado
 *     gravado. `url_loja` e FATO OBSERVADO da vitrine; o estado e o que nos
 *     decidimos. Enquanto nao houver linha gravada — o caso das 627 pecas
 *     que ja estavam na loja antes desta fase — a observacao continua
 *     valendo como estado, marcada com `estadoObservado`.
 */
const TERMINAIS = [
  ESTADO_PUBLICACAO.PUBLICANDO, ESTADO_PUBLICACAO.PUBLICADO, ESTADO_PUBLICACAO.DESPUBLICADO,
];

function estadoDoItem(p, fluxo, capacidades = {}) {
  const { faltas, bloqueios } = faltasDaPeca(p, capacidades);
  const gravado = traduzir(fluxo?.estado);
  const assinaturaAtual = assinatura(p);
  const aprovacaoVigente = fluxo?.dados_assinatura === assinaturaAtual;

  /* Estado gravado pelo writer de publicacao manda: ele descreve um ato que
     aconteceu do lado de fora, e nenhum calculo daqui pode desfaze-lo. */
  if (TERMINAIS.includes(gravado)) return { estado: gravado, falta: [], bloqueios };

  if (!fluxo && p.url_loja) {
    return { estado: ESTADO_PUBLICACAO.PUBLICADO, falta: [], bloqueios, estadoObservado: true };
  }
  if (faltas.length) return { estado: ESTADO_PUBLICACAO.FALTA, falta: faltas, bloqueios };

  if (gravado === ESTADO_PUBLICACAO.FALHOU && aprovacaoVigente) {
    return { estado: ESTADO_PUBLICACAO.FALHOU, falta: [], bloqueios };
  }
  if (gravado === ESTADO_PUBLICACAO.APROVADO && aprovacaoVigente) {
    return { estado: ESTADO_PUBLICACAO.APROVADO, falta: [], bloqueios };
  }
  if (!rascunhoCompleto(fluxo)) {
    /* Sem rascunho: ou existe tarefa de preparacao aberta (o estado gravado
       diz isso), ou a peca esta apenas esperando alguem comecar. */
    return {
      estado: gravado === ESTADO_PUBLICACAO.PREPARANDO
        ? ESTADO_PUBLICACAO.PREPARANDO : ESTADO_PUBLICACAO.PRONTO,
      falta: [], bloqueios,
    };
  }
  return {
    estado: ESTADO_PUBLICACAO.AGUARDANDO,
    falta: [], bloqueios,
    aprovacaoInvalidada: !!fluxo?.aprovado_em && !aprovacaoVigente,
  };
}

function itemPublico(p, fluxo, capacidades = {}) {
  const calculado = estadoDoItem(p, fluxo, capacidades);
  const bloqueioExterno = fluxo?.preparo_erro
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
    temOriginal: !!p.foto_original_key || !!p.temFotoPropria,
    temTratada: !!p.foto_tratada_key || !!p.temFotoPreparadaPropria,
    /* Três estados, não dois (necessidade de UX 1 da auditoria): foto
       nossa, só o endereço da foto da loja, ou nenhuma. */
    temFotoPropria: !!p.temFotoPropria,
    temEnderecoDaLoja: !!p.foto_url,
    estado: calculado.estado,
    estadoRotulo: ROTULOS[calculado.estado],
    falta: calculado.falta,
    /* O que o AMBIENTE nao consegue fazer, separado do que falta a peca.
       Sao perguntas diferentes e a tela precisa das duas — ver o cabecalho
       de catalogo/completude.js. */
    bloqueios: calculado.bloqueios || [],
    /* Fato lido da vitrine, ao lado da decisao nossa. "A loja mostra" e
       "nos decidimos" nunca mais compartilham um campo. */
    presencaNaLoja: !!p.url_loja,
    /* O id externo, agora direto em `produtos` (D9). O publicador precisa
       dele para ATUALIZAR em vez de criar de novo. */
    produtoIdLoja: p.produto_id_loja || fluxo?.produto_id_loja || null,
    estadoObservado: !!calculado.estadoObservado,
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
export async function listarPublicacoes(db, env) {
  const [produtos, fluxos, sentinelas, galeria] = await Promise.all([
    lerProdutos(db), lerFluxos(db), sentinelasDeCategoria(db), skusComFotoPropria(db),
  ]);
  /* A galeria própria é a camada em que a Marquesa é dona da imagem. Ela
     entra na conta de completude como as outras — se não entrasse, uma peça
     com três fotos nossas continuaria aparecendo como "sem foto", que é
     exatamente o defeito que a galeria existe para corrigir. */
  for (const p of produtos) {
    p.temFotoPropria = galeria.com.has(p.sku);
    p.temFotoPreparadaPropria = galeria.preparadas.has(p.sku);
    p.foto_aprovada_id = galeria.aprovadas.has(p.sku) ? `aprovada:${p.sku}` : null;
  }
  /* As capacidades do ambiente entram na conta porque "o que falta" e "o
     que este servidor nem consegue fazer" sao respostas diferentes. Sem
     `env` — chamada interna, teste puro — nada e bloqueado por
     infraestrutura, que e o comportamento certo para quem so quer saber o
     que a pessoa precisa fazer. */
  const capacidades = env
    ? { ...capacidadesDoAmbiente(lerConfig(env)), sentinelas }
    : { sentinelas };

  const itens = produtos
    .filter((p) => p.url_loja || Number(p.casa ?? 0) > 0 || fluxos.mapa.has(p.sku))
    .map((p) => itemPublico(p, fluxos.mapa.get(p.sku), capacidades));

  const candidatos = itens.filter((x) => !x.urlLoja && x.casa > 0);
  /* As seis listas que a tela legada renderiza. Elas NAO recalculam a regra:
     sao a mesma decisao do juiz unico, so agrupada com os nomes que aquela
     tela conhece. Antes cada uma tinha o seu proprio `if`, e era por isso
     que a mesma peca aparecia pronta numa aba e incompleta na outra. */
  const antigas = { prontos: [], semFoto: [], semFundoBranco: [], semDescricao: [], semCategoria: [], semPreco: [] };
  const PARA_LISTA = {
    foto: 'semFoto', nome: 'semDescricao', categoria: 'semCategoria', preco: 'semPreco',
  };
  for (const x of candidatos) {
    const falta = [];
    for (const f of x.falta) {
      const lista = PARA_LISTA[f];
      if (!lista) continue;                 // `quantidade` nunca cai aqui: candidato ja tem casa > 0
      falta.push(f === 'nome' ? 'descricao' : f);
      antigas[lista].push(x);
    }
    /* Fundo branco e a unica "pendencia" da tela antiga que hoje e
       bloqueio: ela so aparece quando nao ha outra falta, porque cobrar
       tratamento de foto de uma peca que ainda nem tem preco e ruido. */
    if (!falta.length && x.bloqueios.length) antigas.semFundoBranco.push(x);
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

async function itemPorSku(db, sku, env) {
  const lista = await listarPublicacoes(db, env);
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
  /* A foto com fundo branco NAO e mais gate aqui. Ela era, e como producao
     nao tem R2 para produzi-la, nenhuma peca chegava a ter previa — o
     pipeline parava dois passos antes do executor por falta de
     infraestrutura, exibindo isso como pendencia de trabalho humano. O
     estado da imagem continua visivel em `bloqueios`. */
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
  let { item } = await itemPorSku(db, sku, env);
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

  /* A foto com fundo branco é TENTADA, e não mais exigida.

     Antes, se ela não ficasse pronta a função voltava aqui — e como
     produção não tem R2 para produzi-la, nenhuma peça passava deste ponto.
     A preparação de TEXTO não depende da imagem, e travá-la por causa dela
     fazia o pipeline inteiro parar dois passos antes do executor por um
     motivo que não era da peça nem de quem trabalha nela.

     O que não ficou pronto continua registrado e continua aparecendo — como
     bloqueio, ao lado do estado, e não como falta da peça. */
  let bloqueioDaFoto = null;
  if (!item.temTratada) {
    const foto = await gerarFundoBranco(db, env, item.sku);
    if (!foto.ok || foto.pendente) {
      const motivo = foto.erro || foto.detalhe || 'O tratamento da foto ainda não terminou.';
      bloqueioDaFoto = { motivo, proximoPasso: 'Configure o serviço de fundo branco; o texto segue sem ele.' };
      await db.prepare('UPDATE catalogo_publicacoes SET preparo_erro=?, atualizado_em=datetime(\'now\') WHERE sku=?')
        .bind(motivo, item.sku).run();
    }
    item = (await itemPorSku(db, sku, env)).item;
  }

  if (corpo.rascunho) {
    const r = await salvarPreviaPublicacao(db, sku, corpo.rascunho);
    return r.ok ? { ...r, bloqueioExterno: bloqueioDaFoto } : r;
  }

  const preparador = lerConfig(env).catalogo;
  const endereco = texto(preparador.preparadorUrl, 2000);
  if (!endereco) {
    /* Sem serviço configurado, a peça fica EM PREPARAÇÃO esperando um
       executor — que hoje é humano-assistido, lendo
       `GET /api/catalogo/preparacao/tarefas`. Não é erro: é o estado certo
       de uma tarefa aberta que ninguém pegou ainda. */
    const motivo = 'Nenhum serviço automático de preparação está configurado; '
      + 'a peça está na fila para o executor externo.';
    await db.prepare('UPDATE catalogo_publicacoes SET preparo_erro=?, atualizado_em=datetime(\'now\') WHERE sku=?')
      .bind(motivo, item.sku).run();
    return {
      ok: true,
      estado: ESTADO_PUBLICACAO.PREPARANDO,
      bloqueioExterno: bloqueioDaFoto || { motivo, proximoPasso: 'Abra uma tarefa em POST /api/catalogo/preparacao/tarefas ou preencha a prévia manualmente.' },
      escritaNaLoja: false,
    };
  }

  try {
    const resp = await fetch(endereco, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(preparador.preparadorToken ? { Authorization: `Bearer ${preparador.preparadorToken}` } : {}),
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
