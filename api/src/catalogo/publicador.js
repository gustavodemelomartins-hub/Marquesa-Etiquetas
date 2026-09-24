/** Publicar de verdade — e a diferença entre isso e "preparar para publicar".
 *
 *  A auditoria encontrou dois estados declarados no CHECK de
 *  `catalogo_publicacoes` que NENHUM caminho de código escrevia:
 *  `publicado` e `falhou_ao_publicar`. Um leitor do schema concluiria que a
 *  publicação funcionava. Ela não existia: o cliente da Nuvemshop tinha três
 *  operações — ler produtos, ler pedidos, escrever estoque — e
 *  `analisarSincronizacao` produzia uma lista `criarNaLoja` que era
 *  relatório, não comando.
 *
 *  Este arquivo é o writer que faltava. Ele existe para os estados pararem
 *  de mentir, não para ligar a publicação: ela nasce DESLIGADA.
 *
 *  ── Três travas em série, todas fail-closed ─────────────────────────────
 *
 *   1. `NUVEMSHOP_WRITES_ENABLED` — a trava central que já existia, checada
 *      dentro de `nuvemshop.js › chamar`, antes de qualquer fetch sair do
 *      Worker. Em produção ela está "true", porque o empurrão de estoque
 *      depende dela;
 *   2. `NUVEMSHOP_PUBLICACAO_ENABLED` — a trava nova, e ela existe
 *      exatamente porque a primeira está ligada: empurrar estoque para um
 *      produto que já existe e CRIAR um produto na loja são atos de
 *      tamanhos diferentes, e uma trava só não os separa. Não está
 *      declarada em `wrangler.toml`, logo está desligada em todo ambiente;
 *   3. `seco` — por padrão a chamada simula. Publicar de verdade exige
 *      `{"seco": false}` explícito, escrito por alguém.
 *
 *  ── E uma quarta, que é de negócio ──────────────────────────────────────
 *
 *  Só publica o que está `aprovado_para_publicar` com a assinatura VIGENTE.
 *  Se o nome, a categoria, o preço, a quantidade em casa ou a foto aprovada
 *  mudaram depois do "aprovar", a assinatura não bate e a peça volta para a
 *  revisão. Aprovação humana é invariante: nada preparado por agente chega à
 *  vitrine sem alguém ter olhado exatamente aqueles dados.
 */
import { Nuvemshop, NuvemshopEscritaDesativada } from '../nuvemshop.js';
import { lerConfig } from '../plataforma/config.js';
import { ESTADO_PUBLICACAO, listarPublicacoes } from '../publicacao-catalogo.js';
import { normSku } from '../sku.js';

const ERRO = (statusHttp, erro, extra = {}) => ({ ok: false, statusHttp, erro, ...extra });

/** Quantas peças uma rodada de publicação pode criar de uma vez.
 *
 *  O mesmo espírito do freio do empurrão de estoque: um bug que faça a
 *  lista de aprovados inchar não deve despejar o catálogo inteiro na
 *  vitrine antes de alguém ver. Passar do teto não é erro — é uma pausa que
 *  se anuncia e pede confirmação. */
const TETO_POR_RODADA = 20;

/** O motivo pelo qual esta chamada não vai escrever — ou `null`.
 *  Separado do resto porque "não posso" e "não quis" são respostas
 *  diferentes, e a tela precisa distinguir bloqueio de infraestrutura de
 *  uma simulação pedida. */
export function travasDaPublicacao(env) {
  const cfg = lerConfig(env).nuvemshop;
  if (!cfg.loja || !cfg.token) {
    return { trava: 'sem_credencial', motivo: 'A loja não está conectada. Falta o token da Nuvemshop.' };
  }
  if (!cfg.escritaHabilitada) {
    return {
      trava: 'escrita_desativada',
      motivo: 'Escrita na Nuvemshop desativada neste ambiente (NUVEMSHOP_WRITES_ENABLED).',
    };
  }
  if (!cfg.publicacaoHabilitada) {
    return {
      trava: 'publicacao_desativada',
      motivo: 'A publicação de catálogo está desligada (NUVEMSHOP_PUBLICACAO_ENABLED). '
        + 'Preparar e aprovar continuam funcionando; só a escrita externa está travada.',
    };
  }
  return null;
}

/** O corpo do produto como a loja o espera.
 *
 *  Tudo que vai aqui é decisão NOSSA — nome, descrição, preço, categoria.
 *  É o que a Fase 4.5 estabeleceu: a Nuvemshop recebe a versão publicada e
 *  não é fonte de nada disso. */
export function corpoDoProduto(item, rascunho) {
  const corpo = {
    name: { pt: rascunho?.nomeSite || item.desc },
    /* `published: false` na criação, sempre. Criar e publicar em um passo
       só tornaria impossível conferir o que subiu antes de a peça aparecer
       para uma cliente. */
    published: false,
    variants: [{
      sku: item.sku,
      price: item.preco == null ? null : String(item.preco),
      stock: Number(item.casa ?? 0),
    }],
  };
  if (rascunho?.descricaoSite) corpo.description = { pt: rascunho.descricaoSite };
  if (rascunho?.seoTitulo) corpo.seo_title = { pt: rascunho.seoTitulo };
  if (rascunho?.seoDescricao) corpo.seo_description = { pt: rascunho.seoDescricao };
  return corpo;
}

async function itemAprovado(db, env, sku) {
  const lista = await listarPublicacoes(db, env);
  const item = lista.itens.find((x) => x.sku === normSku(sku));
  if (!item) return { erro: ERRO(404, 'Produto não encontrado na fila de publicação.') };
  if (item.estado !== ESTADO_PUBLICACAO.APROVADO) {
    return {
      erro: ERRO(409, 'Só uma peça aprovada, com a aprovação vigente, pode ser publicada.', {
        estado: item.estado,
        faltam: item.falta,
        aprovacaoInvalidada: item.aprovacaoInvalidada,
        explicacao: item.aprovacaoInvalidada
          ? 'Os dados mudaram depois da aprovação. Revise a prévia e aprove de novo.'
          : undefined,
      }),
    };
  }
  return { item };
}

/** Publica UMA peça. Simula por padrão.
 *
 *  A ordem dos estados não é decorativa: `publicando` é gravado ANTES da
 *  chamada externa. Se o Worker morrer no meio, a peça fica visivelmente
 *  parada em "publicando" em vez de voltar a parecer aprovada — e "parada
 *  num estado que pede atenção" é muito melhor que "pronta para tentar de
 *  novo" quando ninguém sabe se o produto foi criado lá.
 */
export async function publicarPeca(db, env, sku, { seco = true, publicarNaVitrine = false } = {}) {
  const { item, erro } = await itemAprovado(db, env, sku);
  if (erro) return erro;

  const trava = travasDaPublicacao(env);
  const rascunho = item.rascunho;

  if (seco || trava) {
    return {
      ok: true, seco: true, escritaNaLoja: false,
      sku: item.sku, estado: item.estado,
      /* O ensaio mostra o corpo EXATO que subiria. Um dry-run que resume é
         um dry-run em que ninguém confia. */
      enviaria: corpoDoProduto(item, rascunho),
      trava: trava ? trava.trava : null,
      motivo: trava ? trava.motivo : 'Simulação: chame com {"seco": false} para publicar de verdade.',
    };
  }

  const loja = new Nuvemshop(env);
  await db.prepare(`
    UPDATE catalogo_publicacoes SET estado = ?, publicando_em = datetime('now'),
           publicacao_erro = NULL, atualizado_em = datetime('now') WHERE sku = ?`
  ).bind(ESTADO_PUBLICACAO.PUBLICANDO, item.sku).run();

  try {
    const jaTem = item.presencaNaLoja || item.produtoIdLoja;
    const produto = jaTem && item.produtoIdLoja
      ? await loja.atualizarProduto(item.produtoIdLoja, corpoDoProduto(item, rascunho))
      : await loja.criarProduto(corpoDoProduto(item, rascunho));

    const produtoId = produto && produto.id != null ? String(produto.id) : null;
    if (publicarNaVitrine && produtoId) await loja.publicarProduto(produtoId);

    await db.batch([
      db.prepare(`
        UPDATE catalogo_publicacoes SET estado = ?, publicado_em = datetime('now'),
               produto_id_loja = ?, publicacao_erro = NULL, atualizado_em = datetime('now')
         WHERE sku = ?`).bind(ESTADO_PUBLICACAO.PUBLICADO, produtoId, item.sku),
      db.prepare(`UPDATE produtos SET produto_id_loja = ?, autoridade = 'marquesa' WHERE sku = ?`)
        .bind(produtoId, item.sku),
    ]);

    return {
      ok: true, seco: false, escritaNaLoja: true,
      sku: item.sku, estado: ESTADO_PUBLICACAO.PUBLICADO,
      produtoIdLoja: produtoId,
      /* Criado não é o mesmo que visível. Dizer os dois evita a leitura
         errada mais provável: "publiquei, então está no ar". */
      visivelNaVitrine: !!publicarNaVitrine,
    };
  } catch (e) {
    const motivo = e instanceof NuvemshopEscritaDesativada
      ? 'A escrita na Nuvemshop foi recusada antes de sair do Worker.'
      : String((e && e.message) || e);
    await db.prepare(`
      UPDATE catalogo_publicacoes SET estado = ?, publicacao_erro = ?,
             tentativas = tentativas + 1, atualizado_em = datetime('now') WHERE sku = ?`
    ).bind(ESTADO_PUBLICACAO.FALHOU, motivo.slice(0, 2000), item.sku).run();
    return ERRO(502, motivo, {
      sku: item.sku, estado: ESTADO_PUBLICACAO.FALHOU,
      proximoPasso: 'Corrija a causa e use POST /api/catalogo/publicacao/:sku/repetir.',
    });
  }
}

/** Tirar do ar — o ato que não existia.
 *
 *  Arquivar aqui nunca tirou a peça da vitrine: a sincronização apenas
 *  parava de empurrar estoque para ela (`WHERE status='ativo'`), deixando o
 *  número congelado no ar. Agora existe um ato com nome, e ele é
 *  DELIBERADO: arquivar continua não despublicando sozinho, porque decidir
 *  isso automaticamente é decisão comercial pendente (§ 15 do desenho). */
export async function despublicarPeca(db, env, sku, { seco = true, motivo } = {}) {
  const k = normSku(sku);
  const p = await db.prepare(
    `SELECT sku, produto_id_loja, url_loja FROM produtos WHERE sku = ?`).bind(k).first();
  if (!p) return ERRO(404, `Código ${sku} não está no catálogo.`);
  if (!p.produto_id_loja && !p.url_loja) {
    return ERRO(409, `${p.sku} não consta na loja — não há o que despublicar.`);
  }
  if (!p.produto_id_loja) {
    return ERRO(409, `${p.sku} aparece na loja mas o id externo dele não é conhecido aqui.`, {
      proximoPasso: 'Rode uma sincronização para o espelho gravar o id do produto.',
    });
  }

  const trava = travasDaPublicacao(env);
  if (seco || trava) {
    return {
      ok: true, seco: true, escritaNaLoja: false, sku: p.sku,
      faria: { despublicar: String(p.produto_id_loja) },
      trava: trava ? trava.trava : null,
      motivo: trava ? trava.motivo : 'Simulação: chame com {"seco": false} para tirar do ar de verdade.',
    };
  }

  try {
    await new Nuvemshop(env).despublicarProduto(String(p.produto_id_loja));
  } catch (e) {
    return ERRO(502, String((e && e.message) || e), { sku: p.sku });
  }

  await db.prepare(`
    INSERT INTO catalogo_publicacoes (sku, estado, despublicado_em, despublicado_por, atualizado_em)
    VALUES (?, ?, datetime('now'), ?, datetime('now'))
    ON CONFLICT(sku) DO UPDATE SET estado = excluded.estado,
      despublicado_em = excluded.despublicado_em, despublicado_por = excluded.despublicado_por,
      atualizado_em = excluded.atualizado_em`
  ).bind(k, ESTADO_PUBLICACAO.DESPUBLICADO, String(motivo || 'operador').slice(0, 200)).run();

  return { ok: true, seco: false, escritaNaLoja: true, sku: p.sku, estado: ESTADO_PUBLICACAO.DESPUBLICADO };
}

/** A rodada: o que subiria agora, e o freio.
 *
 *  Como o empurrão de estoque, ela prefere parar e perguntar a fazer muito
 *  de uma vez. */
export async function publicarAprovadas(db, env, { seco = true, teto = TETO_POR_RODADA, forcar = false } = {}) {
  const lista = await listarPublicacoes(db, env);
  const aprovadas = lista.itens.filter((x) => x.estado === ESTADO_PUBLICACAO.APROVADO);
  const trava = travasDaPublicacao(env);

  if (!forcar && aprovadas.length > teto) {
    return {
      ok: true, pausado: true, escritaNaLoja: false,
      aprovadas: aprovadas.length, teto,
      motivo: `${aprovadas.length} peças aprovadas de uma vez passam do teto de ${teto}. `
        + 'Confirme com {"forcar": true} depois de conferir a lista.',
      itens: aprovadas.map((x) => ({ sku: x.sku, nome: x.desc })),
    };
  }

  const resultados = [];
  for (const a of aprovadas) {
    resultados.push(await publicarPeca(db, env, a.sku, { seco }));
    /* Uma falha não derruba a rodada: ela vira linha no relatório e a
       próxima peça segue. O estado dela ficou gravado como
       `falhou_ao_publicar`, que é onde a pessoa vai procurar. */
  }

  return {
    ok: true,
    seco: seco || !!trava,
    escritaNaLoja: !seco && !trava,
    trava: trava ? trava.trava : null,
    motivo: trava ? trava.motivo : null,
    aprovadas: aprovadas.length,
    publicadas: resultados.filter((r) => r.ok && r.escritaNaLoja).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  };
}

/** Preço local × preço da loja — MEDIDO, não julgado.
 *
 *  A política comercial não está fechada: pode haver preço base, preço
 *  promocional, preço específico da loja e divergência acidental, e as
 *  quatro produziriam o mesmo número aqui. Declarar "diferente = erro"
 *  seria tomar por conta própria uma decisão de negócio que ninguém tomou —
 *  e o custo de errar isso é uma correção automática mexendo no preço de
 *  venda de uma peça real.
 *
 *  Então esta função conta e mostra. Não alarma, não corrige, não sugere.
 *  Quando a política existir, ela terá o número para decidir. */
export async function divergenciasDePreco(db) {
  const { results } = await db.prepare(`
    SELECT p.sku, p.desc, p.preco AS preco_local,
           v.preco AS preco_loja, v.promocional, v.nome AS variacao
      FROM produtos p
      JOIN produto_variacoes v ON v.sku = p.sku
     WHERE p.status = 'ativo' AND p.preco IS NOT NULL AND v.preco IS NOT NULL
       AND ABS(p.preco - v.preco) > 0.005
     ORDER BY ABS(p.preco - v.preco) DESC
     LIMIT 500`).all();

  const itens = (results ?? []).map((r) => ({
    sku: r.sku, nome: r.desc, variacao: r.variacao,
    precoLocal: Number(r.preco_local),
    precoLoja: Number(r.preco_loja),
    promocionalLoja: r.promocional == null ? null : Number(r.promocional),
    diferenca: Math.round((Number(r.preco_loja) - Number(r.preco_local)) * 100) / 100,
  }));

  return {
    ok: true,
    total: itens.length,
    itens,
    /* A resposta carrega a própria ressalva, para nenhuma tela apresentar
       isto como lista de erros a corrigir. */
    politica: 'pendente',
    aviso: 'Diferença de preço NÃO é declarada erro: promoção, preço específico da loja '
      + 'e divergência acidental produzem o mesmo número. A política comercial ainda '
      + 'não foi decidida — ver § 11 e § 15 de docs/domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md.',
  };
}
