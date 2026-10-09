/** Variações: o que a loja tem, o que nós sabemos, e o que fazer quando os
 *  dois não se encontram.
 *
 *  O problema que este arquivo existe para resolver, dito sem rodeio: a
 *  planilha física da Marquesa tem UM número por código. A Nuvemshop tem
 *  UMA CAIXINHA DE ESTOQUE POR VARIANTE. Comparar um com o outro é comparar
 *  coisas diferentes, e foi assim que o estoque da loja já foi bagunçado
 *  antes — o total do código inteiro acabou escrito dentro da primeira
 *  variante, e as outras ficaram com o número velho ou com zero.
 *
 *  A regra que vale daqui para a frente é uma só:
 *
 *      Se a loja tem mais de uma variante e nós não sabemos exatamente
 *      quanto pertence a cada `variant_id`, NÃO SE ESCREVE NADA.
 *
 *  Não se divide, não se duplica, não se joga tudo na primeira, não se casa
 *  por posição, não se adivinha. O produto entra na lista de revisão e
 *  espera uma pessoa.
 *
 *  E o casamento final é por `variante_id` PERSISTIDO — nunca por nome. O
 *  nome ("16", "Dourado · 16") é dado da loja: ela renomeia um valor, troca
 *  a ordem dos atributos, e o nome muda sozinho de madrugada. O id não.
 *  Casar por nome parecia funcionar e falhava do pior jeito possível: a
 *  conta do total continuava fechando, cada variante recebia zero, e a peça
 *  saía do ar.
 */
import { catalogoDeVariantes } from './nuvemshop.js';
import { movimentar } from './estoque.js';

export { normSku } from './sku.js';
import { normSku } from './sku.js';
import { equivalenciasLojaLocal } from './variacao-nome.js';
import { consultarEmLotes } from './plataforma/d1.js';

function parseJson(s, padrao) {
  try { const v = JSON.parse(s); return v == null ? padrao : v; } catch (e) { return padrao; }
}

/* ==================================================================== */
/* 1. IMPORTAR A ESTRUTURA INTEIRA DA LOJA                              */
/* ==================================================================== */

/** Percorre o catálogo REAL da Nuvemshop inteiro e guarda, por variante:
 *  product_id, variant_id, SKU, atributos e seus valores, estoque, preço,
 *  imagem própria e o produto pai.
 *
 *  É leitura pura dos dois lados: só chama GET na loja e só escreve na
 *  tabela-espelho daqui. Nenhum estoque, preço ou cadastro é tocado por
 *  esta função — de propósito. Saber o que existe lá e decidir o que fazer
 *  com isso são dois atos diferentes, e juntá-los é como o estoque foi
 *  bagunçado da outra vez.
 *
 *  A tabela não é esvaziada antes: cada linha é gravada com o carimbo desta
 *  rodada e, no fim, some o que não foi visto. Assim o espelho nunca fica
 *  vazio no meio do caminho se a rodada morrer — ele fica velho, que é bem
 *  melhor que ficar mentindo que a loja não tem nada. */
export async function importarVariantesDaLoja(db, loja, { seco = false } = {}) {
  if (!loja.configurada()) {
    return { ok: false, erro: 'A loja não está conectada. Falta o token da Nuvemshop.' };
  }

  const produtos = await loja.produtos();
  return salvarVariantesDaLoja(db, produtos, { seco });
}

/** Mesma gravação acima, mas reaproveitando o catálogo que a sincronização
 * inteira já leu. Evita uma segunda paginação só para manter o espelho de
 * variant_id atualizado antes da próxima venda presencial. */
export async function salvarVariantesDaLoja(db, produtos, { seco = false } = {}) {
  const linhas = catalogoDeVariantes(produtos);

  const nossos = new Set(
    (await db.prepare(`SELECT sku FROM produtos`).all()).results.map(p => normSku(p.sku))
  );

  const resumo = {
    produtosNaLoja: produtos.length,
    variantes: linhas.length,
    comSku: 0, semSku: 0, casadas: 0, soNaLoja: 0,
    produtosComVariacao: 0, produtosVarianteUnica: 0,
    // O vocabulário REAL da loja, contado: "Tamanho": 42, "Banho": 7. Não há
    // lista fixa nossa de atributos, e este número é a prova disso.
    atributos: {},
    seco,
  };

  const porProduto = new Map();
  for (const l of linhas) {
    const k = String(l.produtoId);
    porProduto.set(k, (porProduto.get(k) || 0) + 1);
    const sn = normSku(l.sku);
    if (sn) resumo.comSku++; else resumo.semSku++;
    if (sn && nossos.has(sn)) resumo.casadas++; else resumo.soNaLoja++;
    for (const v of l.valores) resumo.atributos[v.atributo] = (resumo.atributos[v.atributo] || 0) + 1;
  }
  for (const n of porProduto.values()) {
    if (n > 1) resumo.produtosComVariacao++; else resumo.produtosVarianteUnica++;
  }

  if (seco) return { ok: true, ...resumo, aplicado: false };

  const carimbo = new Date().toISOString();
  const stmts = linhas.map(l => db.prepare(
    `INSERT INTO loja_variantes
       (variante_id, produto_id, sku, sku_norm, valores_json, nome, estoque,
        preco, promocional, imagem_url, locais_json, produto_nome, produto_url,
        produto_visivel, posicao, lido_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(variante_id) DO UPDATE SET
       produto_id=excluded.produto_id, sku=excluded.sku, sku_norm=excluded.sku_norm,
       valores_json=excluded.valores_json, nome=excluded.nome, estoque=excluded.estoque,
       preco=excluded.preco, promocional=excluded.promocional,
       imagem_url=excluded.imagem_url, locais_json=excluded.locais_json,
       produto_nome=excluded.produto_nome, produto_url=excluded.produto_url,
       produto_visivel=excluded.produto_visivel, posicao=excluded.posicao,
       lido_em=excluded.lido_em`
  ).bind(
    String(l.varianteId), String(l.produtoId),
    l.sku || null, normSku(l.sku) || null,
    JSON.stringify(l.valores), l.nome || null,
    l.estoque == null ? null : l.estoque,
    l.preco, l.promocional, l.imagemUrl,
    JSON.stringify(l.locais || []),
    l.produtoNome, l.produtoUrl,
    l.produtoVisivel === null || l.produtoVisivel === undefined ? null : (l.produtoVisivel ? 1 : 0),
    l.posicao, carimbo,
  ));

  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));

  /* Variante que sumiu da loja sai do espelho — mas só DEPOIS de tudo que
     veio ter entrado, e só se alguma coisa entrou. Rodada que não leu nada
     (loja fora do ar devolvendo lista vazia) não apaga o espelho inteiro. */
  let removidas = 0;
  if (linhas.length) {
    const r = await db.prepare(`DELETE FROM loja_variantes WHERE lido_em < ?`).bind(carimbo).run();
    removidas = (r.meta && r.meta.changes) || 0;
  }

  return { ok: true, ...resumo, aplicado: true, removidas, lidoEm: carimbo };
}

/* ==================================================================== */
/* 2. O CASAMENTO — por variante_id, ou não há casamento                */
/* ==================================================================== */

/** Motivos pelos quais um código NÃO pode ser empurrado para a loja.
 *  Cada um é uma coisa que o sistema decidiu não fazer, e nenhuma é
 *  engolida: todas aparecem na revisão com os dois números. */
export const IMPEDIMENTOS = {
  duplicado: 'O mesmo código está em mais de um produto da loja. Não há como dividir estoque entre dois anúncios.',
  maleta: 'Há peças deste código em maleta aberta, e a maleta ainda não sabe qual variação saiu.',
  sem_reparticao: 'O estoque daqui ainda não está repartido entre as variações. Falta dizer quanto é de cada uma.',
  variacao_nao_mapeada: 'Há saldo em variação que não corresponde a nenhuma variante da loja. Não dá para saber qual caixinha ela é.',
  sem_variante_id: 'A loja não informou o id de alguma variante deste produto.',
};

/** Decide, para UM código, se dá para empurrar — e, se der, quanto vai em
 *  cada `variante_id`.
 *
 *  Devolve `{ ok: true, alvos: [...] }` ou `{ ok: false, motivo, detalhe }`.
 *  Nunca devolve "mais ou menos", e nunca devolve alvo parcial: ou o
 *  produto inteiro está mapeado, ou não se escreve nada dele.
 *
 *  @param p                 { sku, qtd, casa }
 *  @param naLoja            a entrada de `mapearSkus` para este SKU
 *  @param saldoPorNome      Map(nome → saldo), de `movimentos.variacao`
 *  @param saldoPorVariante  Map(varianteId → saldo), de `movimentos.variante_id`
 *  @param persistido        Map(nome → variante_id), de `produto_variacoes`
 */
export function resolverVariantes(p, naLoja, {
  saldoPorNome = new Map(), saldoPorVariante = new Map(), persistido = new Map(),
  consignadoPorVariacao = new Map(),
} = {}) {
  const recusa = (motivo, detalhe) => ({ ok: false, motivo, explicacao: IMPEDIMENTOS[motivo], detalhe });
  const consignado = p.qtd - p.casa;

  if (naLoja.produtos.size > 1) return recusa('duplicado', { produtos: [...naLoja.produtos].map(String) });
  /* §42 — a maleta agora PODE saber qual variação levou.
   *
   *  A recusa continua sendo a resposta certa quando ninguém disse: peça
   *  fora de casa e sem identidade é exatamente o caso em que adivinhar
   *  colocaria a variação errada à venda. O que mudou é existir um caminho
   *  para responder — `maleta_item_variacoes`, preenchida em Pendências —
   *  e a recusa passa a dizer QUANTO já foi identificado e quanto falta,
   *  em vez de só apontar que há peça fora.
   *
   *  Identificar não movimenta estoque: a peça saiu quando a maleta abriu,
   *  e dizer qual aro era não a faz sair de novo (§8.4 do pacote). */
  const identificado = [...consignadoPorVariacao.values()].reduce((s, q) => s + Number(q || 0), 0);
  if (consignado > identificado) {
    return recusa('maleta', {
      consignado, identificado, faltaIdentificar: consignado - identificado,
      porVariacao: [...consignadoPorVariacao.entries()].map(([chave, qtd]) => ({ chave, qtd })),
    });
  }

  // Índice da loja pela identidade estável. Variante sem id é uma loja que
  // não respondeu direito — e sem id não existe casamento possível.
  const porId = new Map();
  for (const v of naLoja.variantes) {
    if (v.varianteId == null || v.varianteId === '') return recusa('sem_variante_id', {});
    porId.set(String(v.varianteId), v);
  }

  /* Cada balde de saldo local vira uma tentativa de casamento. A ordem de
     preferência não é gosto: é o quanto cada pista é confiável.

       1. `movimentos.variante_id` — o movimento diz de qual caixinha ele
          era. É fato, não interpretação.
       2. `produto_variacoes.variante_id` para aquele nome — o id que a
          sincronização persistiu da última vez que leu a loja.
       3. nada. E "nada" NÃO vira "a primeira", nem "a de mesmo nome por
          coincidência". Vira bloqueio. */
  const destino = new Map();     // varianteId → saldo
  const naoMapeadas = [];
  let atribuido = 0;

  /* SOMA, não substitui, e nunca acusa ambiguidade por isso.
     O mesmo aro chega por dois caminhos o tempo todo e é normal: a
     repartição gravou "16" COM o id da variante, e a venda de balcão do
     mesmo aro gravou só o nome "16". São dois baldes da mesma caixinha, e
     tratar o segundo como conflito travaria todo código que já vendeu. */
  const somar = (vid, saldo) => destino.set(vid, (destino.get(vid) || 0) + saldo);

  for (const [vid, saldo] of saldoPorVariante) {
    atribuido += saldo;
    if (!porId.has(String(vid))) {
      if (saldo === 0) continue;
      naoMapeadas.push({ chave: String(vid), por: 'variante_id', saldo });
      continue;
    }
    somar(String(vid), saldo);
  }

  for (const [nome, saldo] of saldoPorNome) {
    atribuido += saldo;
    const vid = persistido.get(nome);
    if (vid == null || !porId.has(String(vid))) {
      /* Saldo zero numa variação que a loja não tem mais não é problema:
         não há peça nenhuma para endereçar errado. Segue sem bloquear. */
      if (saldo === 0) continue;
      naoMapeadas.push({ chave: nome, por: 'nome', saldo, idPersistido: vid == null ? null : String(vid) });
      continue;
    }
    somar(String(vid), saldo);
  }

  /* A ordem destas duas recusas importa para quem lê o relatório. Saldo que
     não casa com variante nenhuma é o problema MAIS específico e o mais
     perigoso — pode ser um valor renomeado na loja, e nesse caso as peças
     estão numa caixinha que estamos prestes a diminuir. Ele vem primeiro;
     "falta repartir" é o diagnóstico genérico. */
  if (naoMapeadas.length) {
    return recusa('variacao_nao_mapeada', {
      variacoes: naoMapeadas,
      naLoja: naLoja.variantes.map(v => ({
        varianteId: String(v.varianteId), nome: v.nome, estoque: v.estoque,
      })),
    });
  }

  /* Repartição pela metade não empurra: se sobram peças sem variação, as
     caixinhas somadas dariam menos do que existe aqui e a diferença sairia
     do ar como se a peça não existisse. */
  if (!(atribuido === p.qtd && p.qtd > 0)) {
    return recusa('sem_reparticao', { total: p.qtd, atribuido });
  }

  /* `varianteId` e `produtoId` saem daqui COM O TIPO QUE A LOJA MANDOU —
     número, quase sempre. Eles voltam para a Nuvemshop dentro do PATCH, e
     a API compara id por identidade: mandar "801" onde ela espera 801 não
     dá erro nenhum, ela só não encontra a variante e o estoque fica como
     estava. Falha silenciosa, do tipo que só aparece quando alguém for
     conferir a loja na mão.

     Comparação e chave de mapa continuam usando String() — ali o tipo
     atrapalharia pelo motivo oposto. */
  /* §61 — o saldo de cada caixinha é o TOTAL daquela variação (consignação
     vale 0 na razão), e a loja vende o que está EM CASA. Quando a maleta já
     disse qual variação levou, essa peça sai da caixinha dela. Antes este
     desconto não existia: com a maleta inteiramente identificada, a loja
     recebia o total da variação, inclusive a peça que estava na revendedora.

     A chave da maleta é `COALESCE(variante_id, variacao)`. Um id que a loja
     conhece vale direto; um nome passa pelo id persistido. O que não casar
     com caixinha nenhuma NÃO é chutado: o código inteiro volta para revisão,
     como qualquer outra peça sem endereço. */
  const foraPorVariante = new Map();
  for (const [chave, qtd] of consignadoPorVariacao) {
    const q = Number(qtd || 0);
    if (!q) continue;
    let vid = porId.has(String(chave)) ? String(chave) : null;
    if (vid == null) {
      const persistida = persistido.get(String(chave));
      if (persistida != null && porId.has(String(persistida))) vid = String(persistida);
    }
    if (vid == null) {
      return recusa('maleta', {
        consignado, identificado, faltaIdentificar: 0,
        semCaixinha: [{ chave: String(chave), qtd: q }],
      });
    }
    foraPorVariante.set(vid, (foraPorVariante.get(vid) || 0) + q);
  }

  const alvos = naLoja.variantes.map(v => ({
    varianteId: v.varianteId, produtoId: v.produtoId,
    locais: v.locais || [], nome: v.nome, de: v.estoque,
    para: Math.max(0, (destino.get(String(v.varianteId)) || 0)
      - (foraPorVariante.get(String(v.varianteId)) || 0)),
  }));
  return { ok: true, alvos };
}

/* ==================================================================== */
/* 3. OS SALDOS LOCAIS, AGRUPADOS COMO O CASAMENTO PRECISA              */
/* ==================================================================== */

/** Lê a razão contábil uma vez e devolve os três mapas que
 *  `resolverVariantes` consome. Uma consulta para o catálogo inteiro: o
 *  empurrão percorre centenas de códigos e não pode consultar por código.
 *
 *  Repare que os saldos saem de `movimentos`, não de tabela paralela: a
 *  invariante §19 continua sendo a única contabilidade que existe, e o
 *  saldo de uma variação é a mesma soma com um filtro a mais. */
export async function saldosDeVariacao(db, skus = null) {
  const porNome = new Map(), porVariante = new Map();

  /* §61 — `skus` restringe a leitura aos códigos pedidos. A sincronização
     incremental (uma venda, um código) não pode reler a razão inteira: foi
     esse tipo de leitura que estourou a cota do D1 no inventário (§60).
     Sem `skus`, a leitura é a de sempre, para a rodada completa. Os índices
     `idx_mov_sku` e `idx_variacoes_sku` atendem o filtro. */
  const filtro = Array.isArray(skus);
  const lista = filtro ? [...new Set(skus.map(String))] : [];
  const ler = async (sqlTodos, sqlFiltrado) => {
    if (!filtro) return (await db.prepare(sqlTodos).all()).results || [];
    if (!lista.length) return [];
    return consultarEmLotes(db, lista, sqlFiltrado);
  };

  for (const r of await ler(
    `SELECT sku, variacao, variante_id, SUM(qtd) AS saldo
       FROM movimentos
      WHERE variacao IS NOT NULL OR variante_id IS NOT NULL
      GROUP BY sku, variacao, variante_id`,
    (qs) => `SELECT sku, variacao, variante_id, SUM(qtd) AS saldo
       FROM movimentos
      WHERE sku IN (${qs}) AND (variacao IS NOT NULL OR variante_id IS NOT NULL)
      GROUP BY sku, variacao, variante_id`)) {
    /* §62 — `local:…` é a identidade de uma variação criada AQUI; a loja
       não a conhece. O saldo dela é endereçado pelo NOME, que o vínculo
       (`produto_variacoes.variante_id`, gravado quando a variação é criada
       na loja) traduz para o id de lá. Sem vínculo, o nome não casa e o
       código fica em revisão — exatamente como ficava pelo id local. */
    const idLocal = r.variante_id && String(r.variante_id).startsWith('local:') && r.variacao != null;
    const alvo = r.variante_id && !idLocal ? porVariante : porNome;
    const chave = r.variante_id && !idLocal ? String(r.variante_id) : r.variacao;
    if (!alvo.has(r.sku)) alvo.set(r.sku, new Map());
    const m = alvo.get(r.sku);
    m.set(chave, (m.get(chave) || 0) + r.saldo);
  }

  const persistido = new Map();
  for (const r of await ler(
    `SELECT sku, nome, variante_id FROM produto_variacoes WHERE variante_id IS NOT NULL`,
    (qs) => `SELECT sku, nome, variante_id FROM produto_variacoes
              WHERE sku IN (${qs}) AND variante_id IS NOT NULL`)) {
    if (!persistido.has(r.sku)) persistido.set(r.sku, new Map());
    persistido.get(r.sku).set(r.nome, String(r.variante_id));
  }

  /* §42 — quanto de cada variação está numa maleta ABERTA, quando alguém já
     disse. Tabela nova (`maleta_item_variacoes`); banco que ainda não rodou
     a migration devolve vazio, e o comportamento volta a ser o de antes:
     nenhuma peça consignada identificada, e o freio da maleta segura. */
  const consignado = new Map();
  try {
    for (const r of await ler(
      `SELECT mv.sku, COALESCE(mv.variante_id, mv.variacao) AS chave, SUM(mv.qtd) AS qtd
         FROM maleta_item_variacoes mv
         JOIN maletas m ON m.id = mv.maleta_id
        WHERE m.status IN ('aberta','em_acerto')
        GROUP BY mv.sku, chave`,
      (qs) => `SELECT mv.sku, COALESCE(mv.variante_id, mv.variacao) AS chave, SUM(mv.qtd) AS qtd
         FROM maleta_item_variacoes mv
         JOIN maletas m ON m.id = mv.maleta_id
        WHERE mv.sku IN (${qs}) AND m.status IN ('aberta','em_acerto')
        GROUP BY mv.sku, chave`)) {
      if (!consignado.has(r.sku)) consignado.set(r.sku, new Map());
      const m = consignado.get(r.sku);
      m.set(String(r.chave), (m.get(String(r.chave)) || 0) + Number(r.qtd || 0));
    }
  } catch (e) { /* migration pendente: segue sem nenhuma identificada */ }

  const vazio = new Map();
  return {
    porNome: (sku) => porNome.get(sku) || vazio,
    porVariante: (sku) => porVariante.get(sku) || vazio,
    persistido: (sku) => persistido.get(sku) || vazio,
    consignado: (sku) => consignado.get(sku) || vazio,
  };
}

/* ==================================================================== */
/* 4. A LISTA DE REVISÃO                                                */
/* ==================================================================== */

/** "Precisa de revisão — variações não mapeadas".
 *
 *  Lê o espelho da loja e o saldo daqui e devolve os códigos que a
 *  sincronização não vai escrever, com os dois números lado a lado. É de
 *  leitura: não conserta nada, não propõe número, não escolhe quem está
 *  certo. Mostrar os dois e parar é a resposta honesta quando o desencontro
 *  não diz onde está o erro. */
export async function variacoesParaRevisao(db) {
  const linhas = (await db.prepare(`
    SELECT sku_norm AS sku, produto_id, variante_id, nome, estoque,
           valores_json, imagem_url, preco
      FROM loja_variantes
     WHERE sku_norm IS NOT NULL
     ORDER BY sku_norm, posicao`).all()).results;

  const porSku = new Map();
  for (const l of linhas) {
    if (!porSku.has(l.sku)) porSku.set(l.sku, []);
    porSku.get(l.sku).push(l);
  }

  /* §34 — a mesma pergunta, agrupada uma vez em vez de uma por produto.
     A subconsulta correlacionada que estava aqui varria `maleta_itens`
     inteira para CADA produto ativo: medido em banco do tamanho da
     produção (772 produtos, 382 peças em maleta), esta rota lia 298.032
     linhas do D1 — mais do que todo o resto do painel somado.
     Agregar antes e casar depois lê cada tabela uma vez só. O índice
     `idx_maleta_itens_sku` (migracao-pos-golive-1.sql) resolve o mesmo
     problema pelo outro lado; os dois juntos é o que faz a rota custar
     ~4 mil linhas com ou sem a migration aplicada. */
  const produtos = new Map();
  for (const p of (await db.prepare(`
    WITH fora AS (
      SELECT mi.sku AS sku, SUM(mi.qtd - mi.devolvida) AS consignado
        FROM maleta_itens mi
        JOIN maletas m ON m.id = mi.maleta_id
       WHERE m.status IN ('aberta','em_acerto')
       GROUP BY mi.sku
    )
    SELECT p.sku, p.desc, p.qtd, p.qtd - COALESCE(f.consignado, 0) AS casa
      FROM produtos p
      LEFT JOIN fora f ON f.sku = p.sku
     WHERE p.status = 'ativo'`).all()).results) {
    produtos.set(normSku(p.sku), p);
  }

  const saldos = await saldosDeVariacao(db);

  const revisao = [];
  for (const [sku, vars] of porSku) {
    if (vars.length < 2) continue;                 // sem variação, sem ambiguidade
    const p = produtos.get(sku);
    if (!p) continue;                              // só na loja: outro assunto

    const naLoja = {
      produtos: new Set(vars.map(v => String(v.produto_id))),
      variantes: vars.map(v => ({
        varianteId: String(v.variante_id), produtoId: String(v.produto_id),
        nome: v.nome, estoque: v.estoque == null ? 0 : v.estoque, locais: [],
      })),
    };

    const r = resolverVariantes(p, naLoja, {
      saldoPorNome: saldos.porNome(p.sku),
      saldoPorVariante: saldos.porVariante(p.sku),
      persistido: saldos.persistido(p.sku),
      consignadoPorVariacao: saldos.consignado(p.sku),
    });
    if (r.ok) continue;

    revisao.push({
      sku: p.sku, desc: p.desc, total: p.qtd, casa: p.casa,
      motivo: r.motivo, explicacao: r.explicacao, detalhe: r.detalhe,
      somaLoja: vars.reduce((s, v) => s + (v.estoque || 0), 0),
      variantes: vars.map(v => ({
        varianteId: String(v.variante_id), nome: v.nome, estoque: v.estoque,
        valores: parseJson(v.valores_json, []), preco: v.preco, imagemUrl: v.imagem_url,
      })),
    });
  }

  return {
    total: revisao.length,
    porMotivo: revisao.reduce((a, r) => { a[r.motivo] = (a[r.motivo] || 0) + 1; return a; }, {}),
    itens: revisao,
  };
}

/** As variações de um código, do jeito que a loja declara — para a tela de
 *  cadastro poder IMPORTAR a estrutura de atributos e valores em vez de
 *  obrigar alguém a redigitar o que a loja já sabe. */
export async function variantesDoSku(db, sku) {
  const k = normSku(sku);
  const rs = (await db.prepare(
    `SELECT variante_id, produto_id, sku, nome, estoque, preco, promocional,
            imagem_url, valores_json, posicao
       FROM loja_variantes WHERE sku_norm = ? ORDER BY posicao`).bind(k).all()).results;

  /* Os atributos saem dos próprios valores lidos, na ordem em que aparecem.
     Nada de lista fixa: se a loja vende por "Banho" e "Pedra", é isso que
     a tela oferece. */
  const atributos = [];
  for (const r of rs) {
    for (const v of parseJson(r.valores_json, [])) {
      let a = atributos.find(x => x.nome === v.atributo);
      if (!a) { a = { nome: v.atributo, valores: [] }; atributos.push(a); }
      if (!a.valores.includes(v.valor)) a.valores.push(v.valor);
    }
  }

  return {
    sku: k,
    temVariacao: rs.length > 1,
    atributos,
    variantes: rs.map(r => ({
      varianteId: String(r.variante_id), produtoId: String(r.produto_id),
      sku: r.sku, nome: r.nome, estoque: r.estoque,
      preco: r.preco, promocional: r.promocional, imagemUrl: r.imagem_url,
      valores: parseJson(r.valores_json, []), posicao: r.posicao,
    })),
  };
}

/* ==================================================================== */
/* 5. DISTRIBUIR O ESTOQUE ENTRE AS VARIANTES — por variant_id          */
/* ==================================================================== */

/** Variantes da loja que a distribuição parcial trata como a MESMA variação
 *  de uma daqui (`equivalenciasLojaLocal`), com a trava que a função pura não
 *  pode cobrar: a variante da loja não tem saldo nem peça em maleta aberta.
 *  Com saldo, as duas continuam distintas — escolher qual das duas é a peça
 *  seria chutar (regra 2). */
async function dobrasDaLoja(db, k, naLoja, daqui, soDaqui) {
  const mapeadas = new Set(daqui.map((v) => String(v.variante_id)));
  const candidatas = naLoja.filter((v) => !mapeadas.has(String(v.variante_id)));
  if (!candidatas.length) return new Map();
  const baldes = (await db.prepare(
    `SELECT variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
      WHERE sku = ? AND (variacao IS NOT NULL OR variante_id IS NOT NULL)
      GROUP BY variacao, variante_id`).bind(k).all()).results;
  let naMaleta = [];
  try {
    naMaleta = (await db.prepare(
      `SELECT mv.variacao, mv.variante_id FROM maleta_item_variacoes mv
         JOIN maletas m ON m.id = mv.maleta_id
        WHERE mv.sku = ? AND m.status IN ('aberta', 'em_acerto')`).bind(k).all()).results ?? [];
  } catch { /* banco sem a tabela: nenhuma consignação identificada */ }
  const livres = candidatas.filter((v) => {
    const vid = String(v.variante_id);
    const saldo = baldes
      .filter((b) => (b.variante_id ? String(b.variante_id) === vid : b.variacao === v.nome))
      .reduce((s, b) => s + Number(b.saldo || 0), 0);
    return !saldo && !naMaleta.some((c) => String(c.variante_id) === vid || c.variacao === v.nome);
  });
  return equivalenciasLojaLocal(livres, soDaqui);
}

/** A operação que tira um produto de `sem_reparticao`.
 *
 *  Recebe quanto vai em cada `variant_id` e grava. Três coisas a separam do
 *  `repartir` antigo, e as três importam:
 *
 *  1. **A chave é o `variant_id`, não o nome.** A tela mostra "Cristal",
 *     "n° 17" — nome é para gente ler. O que viaja e o que fica gravado é o
 *     id. A loja pode renomear "Cristal" amanhã e nada aqui quebra.
 *  2. **A soma tem de fechar EXATAMENTE com o estoque do produto.** Não é
 *     preferência: repartir e corrigir o total são atos diferentes (§19).
 *     Sobrar ou faltar peça significa que alguém está tentando consertar o
 *     total por dentro da repartição, e a resposta certa é recusar e mostrar
 *     os dois números — nunca escolher sozinho quem está certo.
 *  3. **Nada é inferido.** Não existe "distribuir igualmente" nem "usar a
 *     loja" aqui dentro. A tela tem um botão que PREENCHE o formulário com
 *     os números da loja, e ele não chega a esta função: o que chega é o
 *     que a pessoa confirmou.
 *
 *  Cada remanejo vira DOIS movimentos que se anulam no total — sai de "sem
 *  variação", entra na variação. Assim `produtos.qtd == SUM(movimentos.qtd)`
 *  continua valendo e o histórico mostra a repartição, em vez de um número
 *  que mudou sozinho.
 *
 *  ------------------------------------------------------------------
 *  `ajustarTotal: true` — a exceção pedida por "Editar peça"
 *
 *  Pendências continua estrito: lá a pergunta é "como se reparte ESTE
 *  total?", e sobrar ou faltar peça é sinal de que o total está errado.
 *  Em "Editar peça" a pergunta é outra — "quantas de cada eu tenho?" — e
 *  o total do código é CONSEQUÊNCIA da soma, não um número digitado antes.
 *
 *  Quando quem chama passa `ajustarTotal: true`, a diferença não é engolida
 *  nem sobrescrita: ela vira um movimento de `ajuste` explícito em "sem
 *  variação", com obs dizendo de quanto para quanto e por quê, ANTES da
 *  repartição. Depois dele o total já é a soma, e a repartição segue exata,
 *  igual ao caminho de sempre. §19 continua valendo caractere por caractere:
 *  nenhum saldo foi digitado, todo número tem um movimento que o explica.
 *
 *  Sem a flag, o comportamento é o de antes — 409 com os dois números.
 *
 *  ------------------------------------------------------------------
 *  `parcial: true` — a distribuição CONHECIDA (06/10/2026, V2)
 *
 *  A Sthefany não sabe o aro de todas as peças: uma está com a revendedora
 *  e ninguém anotou qual. Exigir soma == total a obrigava a inventar o aro
 *  dela para conseguir salvar. Com `parcial`, a soma pode ficar ABAIXO do
 *  total: o que não foi distribuído continua em "variação não informada"
 *  (o balde sem variação), que é a verdade. Acima do total continua
 *  recusado — isso é ajuste de estoque, não distribuição.
 *
 *  E duas travas que a distribuição parcial cobra, porque é a tela dela:
 *   · uma variação não pode ficar com menos do que a maleta já tem dela
 *     (a peça identificada na maleta existe);
 *   · o que está com revendedoras SEM variação identificada fica em "não
 *     informada" — distribuir tudo seria atribuir um aro a essa peça.
 */
export async function distribuirVariantes(db, sku, {
  distribuicao, obs, ajustarTotal = false, motivo, parcial = false,
} = {}) {
  const k = normSku(sku);
  const p = await db.prepare(
    `SELECT sku, desc, qtd FROM produtos WHERE sku = ?`).bind(k).first();
  if (!p) return { erro: `Código ${sku} não está no catálogo`, status: 404 };

  if (!Array.isArray(distribuicao) || !distribuicao.length) {
    return { erro: 'Nada para distribuir', status: 400 };
  }

  /* Contra QUEM a distribuição é conferida. Duas fontes, nesta ordem:

     1. `loja_variantes` — o que a Nuvemshop tem hoje. É a fonte quando o
        produto está publicado, e é ela que faz mandar um id inexistente
        virar erro em vez de virar linha órfã.
     2. `produto_variacoes` com origem 'local' — o produto ainda não está na
        loja, e as variações foram criadas aqui. Elas têm id também
        (`local:…`), porque nome não é identidade nem quando é o único
        nome que existe: alguém corrige "Dourdo" para "Dourado" e o saldo
        não pode ir junto para o lixo. */
  let naLoja = (await db.prepare(
    `SELECT variante_id, nome, estoque, valores_json
       FROM loja_variantes WHERE sku_norm = ? ORDER BY posicao`).bind(k).all()).results;
  let fonte = 'loja';

  /* Uma variação só já é distribuível no modo parcial: o anel de aro único
     cadastrado tem "nº18 → 1" e o resto "não informada". */
  const minimo = parcial ? 1 : 2;
  /* Variantes da loja que são o mesmo aro de uma variação daqui — ver
     `equivalenciasLojaLocal`. A tela não as mostra como linha própria; um
     zero vindo delas (tela aberta antes desta versão) é ignorado. */
  let dobradas = new Map();
  if (parcial) {
    /* O ESTOQUE FÍSICO NÃO DEPENDE DA LOJA (06/10/2026, código 391471).
       Antes, a conferência era contra UMA fonte: a loja, ou — se ela
       tivesse menos de duas variantes — o cadastro daqui. A tela mostra as
       duas juntas, então o anel com uma variante na Nuvemshop e aros
       criados aqui no inventário mandava o id da loja junto com os daqui,
       e salvar era recusado com "a variante … não existe na loja". Agora
       vale a UNIÃO: variante da loja e variação daqui são ambas destino
       legítimo de peça física. Nada é publicado e nenhum vínculo é criado. */
    const daqui = (await db.prepare(
      `SELECT variante_id, nome, NULL AS estoque, valores_json
         FROM produto_variacoes WHERE sku = ? AND variante_id IS NOT NULL
         ORDER BY ordem, nome`).bind(k).all()).results;
    const idsDaLoja = new Set(naLoja.map((v) => String(v.variante_id)));
    const soDaqui = daqui.filter((v) => !idsDaLoja.has(String(v.variante_id)));
    if (soDaqui.length) {
      dobradas = await dobrasDaLoja(db, k, naLoja, daqui, soDaqui);
      naLoja = [...naLoja.filter((v) => !dobradas.has(String(v.variante_id))), ...soDaqui];
      fonte = idsDaLoja.size > dobradas.size ? 'mista' : 'local';
    }
  } else if (naLoja.length < 2) {
    const locais = (await db.prepare(
      `SELECT variante_id, nome, NULL AS estoque, valores_json
         FROM produto_variacoes WHERE sku = ? AND variante_id IS NOT NULL
         ORDER BY ordem, nome`).bind(k).all()).results;
    if (locais.length >= minimo) { naLoja = locais; fonte = 'local'; }
  }

  if (naLoja.length < minimo) {
    return {
      erro: parcial
        ? 'Esta peça ainda não tem variação. Adicione a variação antes de dizer quantas tem.'
        : `${sku} não tem variações para distribuir. ` +
          `Se ele existe na Nuvemshop, importe a estrutura antes; se é peça só daqui, ` +
          `defina as variações primeiro.`,
      status: 400,
    };
  }
  const porId = new Map(naLoja.map(v => [String(v.variante_id), v]));

  const alvo = new Map();
  for (const item of distribuicao) {
    const vid = String(item.varianteId ?? item.variante_id ?? '');
    if (vid && dobradas.has(vid)) {
      if (Math.trunc(Number(item.qtd)) === 0) continue;
      return {
        erro: 'A tela estava desatualizada. Feche e abra as variações de novo — nada foi salvo.',
        status: 409,
      };
    }
    if (!vid || !porId.has(vid)) {
      /* No modo parcial quem lê é a Sthefany: o id vai num campo à parte,
         nunca na frase. */
      return {
        erro: parcial
          ? 'Uma das variações mudou enquanto a tela estava aberta. Feche e abra as variações de novo — nada foi salvo.'
          : `A variante ${vid || '(vazia)'} não existe na loja para ${sku}.`,
        status: 400, varianteDesconhecida: vid || null,
      };
    }
    if (alvo.has(vid)) {
      return {
        erro: parcial
          ? `"${porId.get(vid).nome}" apareceu duas vezes. Feche e abra as variações de novo — nada foi salvo.`
          : `A variante ${vid} veio duas vezes na distribuição.`,
        status: 400,
      };
    }
    const n = Math.trunc(Number(item.qtd));
    if (!Number.isFinite(n) || n < 0) {
      return { erro: `Quantidade inválida em "${porId.get(vid).nome}".`, status: 400 };
    }
    alvo.set(vid, n);
  }

  /* Variante da loja que a tela não mandou vale ZERO — e isso é explícito,
     não omissão: quem confirmou o formulário viu todas as linhas. Deixar
     "não mandou" significar "mantém como estava" faria a soma fechar na
     tela e não fechar no banco. */
  for (const v of naLoja) if (!alvo.has(String(v.variante_id))) alvo.set(String(v.variante_id), 0);

  const soma = [...alvo.values()].reduce((s, n) => s + n, 0);
  if (parcial) {
    if (soma > p.qtd) {
      return {
        status: 409,
        erro: `As variações somam ${soma}, e o código tem ${p.qtd} no total. `
          + 'Para mudar o total, use Ajustar estoque.',
        soma, total: p.qtd,
      };
    }
    const travas = await travasDaConsignacao(db, k, naLoja, alvo);
    const naoInformadaDepois = p.qtd - soma;
    const t = travas.porVariacao[0];
    if (t) {
      return {
        status: 409,
        erro: `${t.nome} tem ${t.naMaleta} com revendedora${t.naMaleta === 1 ? '' : 's'} — `
          + `não dá para deixar ${t.alvo}.`,
        soma, total: p.qtd,
      };
    }
    if (naoInformadaDepois < travas.semVariacao) {
      return {
        status: 409,
        erro: `${travas.semVariacao} ${travas.semVariacao === 1 ? 'peça está' : 'peças estão'} com revendedora `
          + 'sem variação informada. Deixe pelo menos '
          + `${travas.semVariacao} em "variação não informada" até ela ser identificada.`,
        soma, total: p.qtd, consignadoSemVariacao: travas.semVariacao,
      };
    }
  }
  const deltaTotal = parcial ? 0 : soma - p.qtd;
  if (deltaTotal !== 0 && !ajustarTotal) {
    return {
      status: 409,
      erro: `A soma das variações dá ${soma}, e o estoque de ${sku} é ${p.qtd}. ` +
            `Distribuir não muda o total — se o total é que está errado, ajuste primeiro e distribua depois.`,
      soma, total: p.qtd, diferenca: deltaTotal,
    };
  }

  /* O saldo de HOJE, pelas duas chaves, para calcular o delta de cada
     variante. Mesma leitura que a sincronização faz — se divergisse, esta
     rota "resolveria" algo que ela continuaria recusando. */
  const baldes = (await db.prepare(
    `SELECT variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
      WHERE sku = ? AND (variacao IS NOT NULL OR variante_id IS NOT NULL)
      GROUP BY variacao, variante_id`).bind(k).all()).results;

  const persistido = new Map((await db.prepare(
    `SELECT nome, variante_id FROM produto_variacoes WHERE sku = ? AND variante_id IS NOT NULL`)
    .bind(k).all()).results.map(r => [r.nome, String(r.variante_id)]));

  /* id da variante → o nome que ELA tem AQUI. A loja pode estar mostrando
     outro: nome é dado dela e muda sozinho, id é identidade. Tudo o que
     esta função grava — movimento e estrutura — usa o nome daqui, para o
     saldo antigo (que casa por nome quando o movimento não tem id) não se
     desligar do balde dele por causa de uma edição na vitrine. */
  const nomeLocalPorId = new Map();
  for (const [nome, vid] of persistido) nomeLocalPorId.set(String(vid), nome);

  const atual = new Map();      // varianteId → saldo de hoje
  const orfaos = [];            // saldo que não casa com variante nenhuma
  for (const b of baldes) {
    if (!b.saldo) continue;
    const vid = b.variante_id ? String(b.variante_id) : persistido.get(b.variacao);
    if (vid && porId.has(vid)) atual.set(vid, (atual.get(vid) || 0) + b.saldo);
    else orfaos.push(b);
  }

  const stmts = [];
  const razao = obs || `Distribuição confirmada na tela para ${sku}`;
  const feito = [];

  /* O total passa a ser a soma — e passa por MOVIMENTO, nunca por UPDATE
     no saldo. O ajuste entra em "sem variação" (variacao e variante_id
     nulos) porque é dali que a repartição logo abaixo vai tirar as peças
     para servir cada variante. Fazer o contrário — ajustar dentro de uma
     variante — esconderia a correção do total dentro da divisão, que é
     exatamente a mistura que §19 proíbe. */
  let totalAjustado = null;
  if (deltaTotal !== 0) {
    totalAjustado = { de: p.qtd, para: soma, delta: deltaTotal };
    stmts.push(...movimentar(db, {
      sku: k, tipo: 'ajuste', quantidade: deltaTotal, origem: 'variacao',
      obs: motivo
        || `${razao}: o total de ${sku} passa de ${p.qtd} para ${soma}, `
           + `porque é a soma das quantidades confirmadas por variação`,
    }));
  }

  /* Saldo preso numa variante que não existe mais volta para "sem variação"
     ANTES de servir as novas — senão o delta partiria de um número que
     inclui peça que ninguém vai reencontrar. */
  for (const b of orfaos) {
    const rotulo = b.variacao || b.variante_id;
    stmts.push(...movimentar(db, {
      sku: k, variacao: b.variacao, varianteId: b.variante_id,
      tipo: 'ajuste', quantidade: -b.saldo, origem: 'variacao',
      obs: `${razao}: "${rotulo}" não existe mais na loja e volta a ficar sem variação`,
    }));
    stmts.push(...movimentar(db, {
      sku: k, tipo: 'ajuste', quantidade: b.saldo, origem: 'variacao',
      obs: `${razao}: contrapartida de "${rotulo}"`,
    }));
  }

  for (const v of naLoja) {
    const vid = String(v.variante_id);
    const delta = (alvo.get(vid) || 0) - (atual.get(vid) || 0);
    if (!delta) continue;
    const nome = nomeLocalPorId.get(vid) || v.nome;
    feito.push({ varianteId: vid, nome, de: atual.get(vid) || 0, para: alvo.get(vid) || 0 });
    // entra (ou sai) da variante...
    stmts.push(...movimentar(db, {
      sku: k, variacao: nome, varianteId: vid,
      tipo: 'ajuste', quantidade: delta, origem: 'variacao',
      obs: `${razao}: "${nome}" passa a ter ${alvo.get(vid) || 0}`,
    }));
    // ...e sai (ou entra) de "sem variação", para o total não se mexer
    stmts.push(...movimentar(db, {
      sku: k, tipo: 'ajuste', quantidade: -delta, origem: 'variacao',
      obs: `${razao}: contrapartida de "${nome}"`,
    }));
  }

  /* Quando a fonte é a loja, a confirmação também é quem passa a mandar em
     quais variações este código tem. Sem isto, um código cuja estrutura
     nunca foi gravada em `produto_variacoes` continuaria invisível para a
     sincronização mesmo depois de distribuído.

     Quando a fonte é local, as linhas já são as de `produto_variacoes` —
     reescrevê-las aqui só arriscaria trocar a origem por engano. */
  /* Mista (loja + daqui, só no modo parcial): as linhas da loja NÃO são
     copiadas para `produto_variacoes`. Copiar uma variante de dois
     atributos ("Banho · n°18") ao lado de "nº24" faria a próxima variação
     criada aqui recombinar a estrutura inteira. O saldo continua achável:
     o movimento leva o `variante_id` da loja. */
  if (fonte === 'loja') {
    /* O NOME gravado é o que JÁ existe aqui para aquele `variante_id`, não
       o que a loja mostra hoje.
       
       Sem isto, a loja renomear "Verde" para "Verde Água" fazia esta rotina
       tentar INSERIR uma segunda linha com o mesmo `variante_id` — e o
       índice único `idx_variacoes_variante` recusava com erro 500, ou seja:
       a peça ficava impossível de repartir porque alguém mexeu no nome do
       outro lado. (O `ON CONFLICT(sku, nome)` não pega esse caso: o
       conflito é no id, não no par sku+nome.)
       
       Manter o nome daqui não é teimosia. `movimentos.variacao` guarda o
       nome que valia na hora do movimento, e a leitura de saldo casa por
       nome quando o movimento antigo não tem id. Renomear a linha em
       silêncio desligaria esses movimentos do balde deles — peça física
       sumindo do lugar certo por causa de uma edição na vitrine. */
    for (const [i, v] of naLoja.entries()) {
      const vid = String(v.variante_id);
      const nome = nomeLocalPorId.get(vid) || v.nome;
      stmts.push(db.prepare(
        `INSERT INTO produto_variacoes (sku, nome, variante_id, estoque_loja, ordem, valores_json, origem)
         VALUES (?,?,?,?,?,?,'loja')
         ON CONFLICT(sku, nome) DO UPDATE SET
           variante_id=excluded.variante_id, estoque_loja=excluded.estoque_loja,
           ordem=excluded.ordem, valores_json=excluded.valores_json, origem='loja'`
      ).bind(k, nome, vid, v.estoque, i, v.valores_json || '[]'));
    }
  }

  if (stmts.length) await db.batch(stmts);

  return {
    ok: true, sku: p.sku, total: soma, totalAnterior: p.qtd,
    totalAjustado,
    mudou: feito,
    orfaosDevolvidos: orfaos.map(b => ({ nome: b.variacao, saldo: b.saldo })),
    jaEstava: feito.length === 0 && orfaos.length === 0 && !totalAjustado,
  };
}

/** O que as maletas abertas já dizem sobre as variações de um código, contra
 *  uma distribuição pedida: as variações que ficariam abaixo do que a maleta
 *  tem delas, e quantas peças da maleta não têm variação identificada. */
async function travasDaConsignacao(db, sku, variantes, alvo) {
  const consignado = Number((await db.prepare(
    `SELECT COALESCE(SUM(mi.qtd - mi.devolvida), 0) AS n FROM maleta_itens mi
       JOIN maletas m ON m.id = mi.maleta_id
      WHERE mi.sku = ? AND m.status IN ('aberta', 'em_acerto')`).bind(sku).first())?.n ?? 0);
  let naMaleta = [];
  try {
    naMaleta = (await db.prepare(
      `SELECT mv.variacao, mv.variante_id, SUM(mv.qtd) AS qtd FROM maleta_item_variacoes mv
         JOIN maletas m ON m.id = mv.maleta_id
        WHERE mv.sku = ? AND m.status IN ('aberta', 'em_acerto')
        GROUP BY mv.variacao, mv.variante_id`).bind(sku).all()).results ?? [];
  } catch { /* banco sem a tabela: nada identificado */ }
  const porVariacao = [];
  let identificado = 0;
  for (const v of variantes) {
    const vid = String(v.variante_id);
    const n = naMaleta
      .filter((c) => (c.variante_id != null ? String(c.variante_id) === vid : c.variacao === v.nome))
      .reduce((s, c) => s + Number(c.qtd || 0), 0);
    identificado += n;
    if (n > (alvo.get(vid) || 0)) porVariacao.push({ nome: v.nome, naMaleta: n, alvo: alvo.get(vid) || 0 });
  }
  return { porVariacao, semVariacao: Math.max(0, consignado - identificado) };
}

/* ==================================================================== */
/* 5. RECONCILIAÇÃO DE VARIAÇÕES — LEITURA PURA                         */
/* ==================================================================== */

/** §42.6 — a comparação das TRÊS fontes, sem escrever em lugar nenhum.
 *
 *  Depois de resolver pendências, a pergunta que sobra é: o que ainda não
 *  bate? Ela tem três respostas possíveis, e confundi-las é o que faz
 *  alguém escrever na loja quando devia perguntar:
 *
 *    RESOLVIDO          nós sabemos qual variação é qual, e o número da loja
 *                       já é o nosso. Nada a fazer.
 *    PENDENTE_HUMANO    falta uma decisão de gente: peça em maleta sem
 *                       variação identificada, estoque não repartido,
 *                       variação que a loja não conhece. NÃO é divergência
 *                       de número — é falta de informação, e escrever aqui
 *                       colocaria a variação errada à venda.
 *    DIVERGENCIA_REAL   nós sabemos qual é qual, e o número da loja está
 *                       diferente do nosso. Isto sim é para empurrar — e o
 *                       empurrão é `POST /api/sync`, com autorização, nunca
 *                       daqui.
 *
 *  Esta função não chama a Nuvemshop: ela lê o ESPELHO (`loja_variantes`),
 *  que a sincronização mantém. Ler a loja é outro ato, e misturar os dois é
 *  como o estoque já foi bagunçado antes.
 */
export async function reconciliarVariacoes(db) {
  const linhas = (await db.prepare(`
    SELECT sku_norm AS sku, produto_id, variante_id, nome, estoque, valores_json, posicao
      FROM loja_variantes
     WHERE sku_norm IS NOT NULL
     ORDER BY sku_norm, posicao`).all()).results;

  const porSku = new Map();
  for (const l of linhas) {
    if (!porSku.has(l.sku)) porSku.set(l.sku, []);
    porSku.get(l.sku).push(l);
  }

  const produtos = new Map();
  for (const p of (await db.prepare(`
    WITH fora AS (
      SELECT mi.sku AS sku, SUM(mi.qtd - mi.devolvida) AS consignado
        FROM maleta_itens mi JOIN maletas m ON m.id = mi.maleta_id
       WHERE m.status IN ('aberta','em_acerto')
       GROUP BY mi.sku
    )
    SELECT p.sku, p.desc, p.qtd, p.qtd - COALESCE(f.consignado, 0) AS casa
      FROM produtos p LEFT JOIN fora f ON f.sku = p.sku
     WHERE p.status = 'ativo'`).all()).results) {
    produtos.set(normSku(p.sku), p);
  }

  /* As variações CADASTRADAS aqui — a terceira fonte. É contra ela que se
     mede "a Sthefany já cadastrou todas as que possui". */
  const cadastradas = new Map();
  for (const v of (await db.prepare(
    `SELECT sku, nome, variante_id FROM produto_variacoes ORDER BY sku, ordem, nome`).all()).results) {
    const k = normSku(v.sku);
    if (!cadastradas.has(k)) cadastradas.set(k, []);
    cadastradas.get(k).push({
      nome: v.nome, varianteId: v.variante_id == null ? null : String(v.variante_id),
    });
  }

  const saldos = await saldosDeVariacao(db);
  const resolvidos = [];
  const pendentes = [];
  const divergentes = [];
  const soNaLoja = [];

  for (const [sku, vars] of porSku) {
    const p = produtos.get(sku);
    if (!p) { soNaLoja.push({ sku, variantes: vars.length }); continue; }
    if (vars.length < 2) continue;                 // sem variação, outro assunto

    const naLoja = {
      produtos: new Set(vars.map((v) => String(v.produto_id))),
      variantes: vars.map((v) => ({
        varianteId: String(v.variante_id), produtoId: String(v.produto_id),
        nome: v.nome, estoque: v.estoque == null ? 0 : v.estoque, locais: [],
      })),
    };

    const r = resolverVariantes(p, naLoja, {
      saldoPorNome: saldos.porNome(p.sku),
      saldoPorVariante: saldos.porVariante(p.sku),
      persistido: saldos.persistido(p.sku),
      consignadoPorVariacao: saldos.consignado(p.sku),
    });

    const base = {
      sku: p.sku,
      produto: p.desc,
      total: p.qtd,
      casa: p.casa,
      cadastradas: cadastradas.get(sku) ?? [],
      naLoja: vars.map((v) => ({
        varianteId: String(v.variante_id), nome: v.nome,
        estoque: v.estoque == null ? null : Number(v.estoque),
      })),
    };

    if (!r.ok) {
      pendentes.push({
        ...base,
        classe: 'PENDENTE_HUMANO',
        motivo: r.motivo,
        explicacao: r.explicacao,
        detalhe: r.detalhe ?? null,
        /* O que fazer, dito por extenso — a lista existe para ser agida,
           não para ser contemplada. */
        caminho: r.motivo === 'maleta'
          ? 'Pendências › Central: diga qual variação está na maleta.'
          : r.motivo === 'sem_reparticao'
            ? 'Pendências › Variações: reparta o estoque entre as variações.'
            : r.motivo === 'variacao_nao_mapeada'
              ? 'Confira se a loja renomeou um valor; remapeie a variação antes de sincronizar.'
              : r.motivo === 'duplicado'
                ? 'O mesmo código está em dois anúncios da loja. Escolha um.'
                : 'A loja não informou o id de alguma variante — releia o catálogo dela.',
      });
      continue;
    }

    /* Sabemos qual é qual. Falta ver se o número já é o mesmo. */
    const difere = r.alvos.filter((a) => Number(a.de ?? 0) !== Number(a.para ?? 0));
    if (!difere.length) {
      resolvidos.push({ ...base, classe: 'RESOLVIDO' });
    } else {
      divergentes.push({
        ...base,
        classe: 'DIVERGENCIA_REAL',
        diferencas: difere.map((a) => ({
          varianteId: String(a.varianteId), nome: a.nome,
          naLoja: Number(a.de ?? 0), aqui: Number(a.para ?? 0),
          delta: Number(a.para ?? 0) - Number(a.de ?? 0),
        })),
        caminho: 'Isto é para empurrar. Rode POST /api/sync {"seco": true} para conferir '
          + 'o relatório e só então autorize a escrita.',
      });
    }
  }

  return {
    ok: true,
    lidoEm: new Date().toISOString(),
    somenteLeitura: true,
    resumo: {
      codigos: resolvidos.length + pendentes.length + divergentes.length,
      resolvidos: resolvidos.length,
      pendenteHumano: pendentes.length,
      divergenciaReal: divergentes.length,
      soNaLoja: soNaLoja.length,
      pecasEmDivergencia: divergentes.reduce(
        (s, d) => s + d.diferencas.reduce((t, x) => t + Math.abs(x.delta), 0), 0),
    },
    resolvidos,
    pendenteHumano: pendentes,
    divergenciaReal: divergentes,
    soNaLoja,
    regra: 'Leitura pura: nada é escrito aqui, nem no banco nem na Nuvemshop. '
      + 'PENDENTE_HUMANO é falta de informação e não vira escrita; DIVERGENCIA_REAL '
      + 'é número diferente e só sai daqui por POST /api/sync, com autorização.',
  };
}
