/** Sincronização com a Nuvemshop.
 *
 *  A ORDEM IMPORTA, e é a decisão mais importante deste arquivo:
 *
 *    1. PUXAR os pedidos novos do site e virar venda aqui
 *    2. só então EMPURRAR o "em casa" para a loja
 *
 *  Invertendo, ou fazendo só o passo 2, o sistema desfaz as próprias
 *  vendas: a Nuvemshop baixa o estoque dela quando alguém compra, nós não
 *  ficamos sabendo, e o empurrão devolveria o número antigo para a loja —
 *  recolocando à venda uma peça que já saiu. Duas mãos ou nenhuma.
 *
 *  Tudo aqui é idempotente. Um cron pode rodar duas vezes, uma rodada pode
 *  morrer no meio, e nada pode duplicar venda nem estoque por causa disso.
 */
import { Nuvemshop, mapearSkus } from './nuvemshop.js';
import { movimentar, saldosDoSku } from './estoque.js';
import { resolverVariantes, saldosDeVariacao } from './variantes.js';

const agoraISO = () => new Date().toISOString();

async function config(db, chave, padrao) {
  const r = await db.prepare(`SELECT valor FROM config WHERE chave = ?`).bind(chave).first();
  if (!r) return padrao;
  try { return JSON.parse(r.valor); } catch (e) { return padrao; }
}

async function gravarConfig(db, chave, valor) {
  await db.prepare(
    `INSERT INTO config (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`
  ).bind(chave, JSON.stringify(valor)).run();
}

/** Roda uma sincronização inteira. `forcar` ignora o freio de segurança —
 *  é o que o botão "aplicar mesmo assim" do dashboard usa. */
export async function sincronizar(db, env, { forcar = false, seco = false } = {}) {
  const loja = new Nuvemshop(env);
  if (!loja.configurada()) {
    return { ok: false, erro: 'A loja não está conectada. Falta o token da Nuvemshop.' };
  }

  /* `seco` grava no INSERT, não é derivado do relato no fim — assim ele
     está certo mesmo enquanto a linha ainda é 'rodando'. É o que permite
     `resumoSync` ignorar rodadas secas sem depender de JSON (TECH_DEBT.md
     item 12). */
  const exec = await db.prepare(
    `INSERT INTO sync_execucoes (iniciado_em, status, seco) VALUES (datetime('now'), 'rodando', ?) RETURNING id`
  ).bind(seco ? 1 : 0).first();

  const relato = {
    id: exec.id, pedidosLidos: 0, vendasCriadas: 0, itensIgnorados: [],
    produtosEnviados: 0, mudancas: [], semEmpurrar: [], semeados: [], naoSemeados: [],
    pausado: null, seco,
  };

  try {
    const produtosLoja = await loja.produtos();
    const { mapa, duplicados } = mapearSkus(produtosLoja);
    relato.duplicadosNaLoja = duplicados;

    await puxarPedidos(db, loja, relato, seco);
    /* Semear antes de empurrar: um código recém-repartido já sai desta
       mesma rodada com o estoque de cada variação no ar, em vez de esperar
       a próxima. */
    await semearVariacoes(db, mapa, relato, seco);
    await empurrarEstoque(db, loja, mapa, relato, { forcar, seco });
    /* Depois de empurrar, e não antes: assim o retrato já nasce com os
       números que a loja passou a ter nesta rodada. */
    await gravarRetratoDaLoja(db, produtosLoja, mapa, relato);

    await db.prepare(
      `UPDATE sync_execucoes SET terminado_em = datetime('now'), status = ?,
              pedidos_lidos = ?, vendas_criadas = ?, produtos_enviados = ?, detalhe_json = ?
        WHERE id = ?`
    ).bind(relato.pausado ? 'pausado' : 'ok', relato.pedidosLidos, relato.vendasCriadas,
           relato.produtosEnviados, JSON.stringify(relato), exec.id).run();

    return { ok: true, ...relato };
  } catch (e) {
    await db.prepare(
      `UPDATE sync_execucoes SET terminado_em = datetime('now'), status = 'erro', detalhe_json = ?
        WHERE id = ?`
    ).bind(JSON.stringify({ ...relato, erro: String(e && e.message || e) }), exec.id).run();
    return { ok: false, erro: String(e && e.message || e), ...relato };
  }
}

/* ------------------------------------------------------ 1. puxar pedidos */

/** Cada pedido do site vira uma venda daqui, com origem 'site'.
 *
 *  A trava contra duplicata é `vendas.externo_id`, com índice único: se a
 *  rodada anterior morreu depois de gravar a venda mas antes de anotar a
 *  data, a próxima tenta de novo e o banco recusa em vez de cobrar a peça
 *  duas vezes. Por isso a data só avança no fim, e com folga para trás. */
async function puxarPedidos(db, loja, relato, seco) {
  const desde = await config(db, 'syncUltimoPedido', null);
  // 6 horas de folga para trás: pedido que demora a aparecer na listagem
  // não pode cair no vão entre uma rodada e outra. A trava de duplicata
  // é que garante que reler não custa nada.
  const janela = desde ? new Date(Date.parse(desde) - 6 * 3600e3).toISOString() : null;

  const pedidos = await loja.pedidos(janela);
  relato.pedidosLidos = pedidos.length;

  const jaTemos = new Set((await db.prepare(
    `SELECT externo_id FROM vendas WHERE externo_id IS NOT NULL`).all())
    .results.map(r => r.externo_id));

  for (const pedido of pedidos) {
    const chave = `nuvemshop:${pedido.id}`;
    if (jaTemos.has(chave)) continue;
    // pedido cancelado no site nunca chega a virar venda aqui
    if (pedido.status === 'cancelled' || pedido.cancelled_at) continue;

    const linhas = [];
    for (const p of pedido.products || []) {
      const sku = String(p.sku || '').trim().toUpperCase();
      const nosso = sku ? await db.prepare(
        `SELECT sku, desc, preco FROM produtos WHERE sku = ?`).bind(sku).first() : null;
      if (!nosso) {
        // §22: o que não deu para casar é anunciado, não engolido
        relato.itensIgnorados.push({ pedido: pedido.number || pedido.id, sku: sku || '(sem SKU)', nome: p.name });
        continue;
      }
      linhas.push({ sku: nosso.sku, desc: nosso.desc, qtd: +p.quantity || 1, preco: +p.price || 0 });
    }
    if (!linhas.length) continue;
    if (seco) { relato.vendasCriadas++; continue; }

    const total = linhas.reduce((s, l) => s + l.preco * l.qtd, 0);
    const data = String(pedido.created_at || agoraISO()).slice(0, 10);
    const cliente = (pedido.customer && pedido.customer.name) || 'Cliente do site';

    const venda = await db.prepare(
      `INSERT INTO vendas (cliente_nome, origem, data, total, externo_id)
       VALUES (?, 'site', ?, ?, ?) RETURNING id`
    ).bind(cliente, data, total, chave).first();

    const stmts = [];
    for (const l of linhas) {
      stmts.push(db.prepare(
        `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo) VALUES (?,?,?,?,?, 'venda')`
      ).bind(venda.id, l.sku, l.desc, l.qtd, l.preco));
      stmts.push(...movimentar(db, {
        sku: l.sku, tipo: 'venda', quantidade: l.qtd, origem: 'site',
        vendaId: venda.id, obs: `Pedido ${pedido.number || pedido.id} da loja`,
      }));
    }
    await db.batch(stmts);
    relato.vendasCriadas++;
  }

  if (!seco && pedidos.length) {
    const maisNovo = pedidos.reduce((a, p) =>
      (!a || String(p.created_at) > a) ? String(p.created_at) : a, null);
    if (maisNovo) await gravarConfig(db, 'syncUltimoPedido', maisNovo);
  } else if (!seco && !desde) {
    await gravarConfig(db, 'syncUltimoPedido', agoraISO());
  }
}

/* --------------------------------------------------- 2. empurrar estoque */

/* --------------------------------------------- 1b. semear as variações */

/** Reparte sozinho, a partir do que a Nuvemshop já tem, o estoque dos
 *  códigos vendidos em mais de uma opção.
 *
 *  Sem isto, ligar as variações criaria trabalho manual: o sistema saberia
 *  que existem 6 anéis e três aros, mas não quantos são de cada — e alguém
 *  teria de contar 56 códigos à mão. A loja já responde isso: ela tem uma
 *  caixinha de estoque por variação, alimentada pelas próprias vendas.
 *
 *  Duas regras seguram o que essa automação pode fazer:
 *
 *  1. **Só semeia código virgem.** Se qualquer peça daquele código já foi
 *     atribuída a uma variação — por repartição, venda ou contagem — a
 *     rodada não encosta nele. Sem isso, toda sincronização desfaria a
 *     correção feita à mão na véspera, que é o pior tipo de bug: o que
 *     acontece de madrugada e desfaz o trabalho de alguém.
 *
 *  2. **Nunca inventa peça.** O total do código continua sendo o nosso
 *     (§19) — a loja é destino do estoque, não fonte. A repartição vai
 *     sendo servida na ordem das variações até o total acabar; o que a
 *     loja disser a mais é ignorado e fica anotado no relatório. O que
 *     sobrar continua "sem variação", que é honesto: existe e ainda não se
 *     sabe de qual é. */
async function semearVariacoes(db, mapa, relato, seco) {
  /* Quem diz quais códigos têm variação é o `mapa` — a leitura da loja
     feita nesta mesma rodada — e não a tabela `produto_variacoes`, que só é
     gravada no fim. Depender dela adiaria a primeira repartição para a
     rodada seguinte, sem motivo. */
  const comVariacao = (await db.prepare(`
    SELECT p.sku, p.qtd,
           (SELECT COUNT(*) FROM movimentos mv
             WHERE mv.sku = p.sku AND mv.variacao IS NOT NULL) AS jaTocado
      FROM produtos p
     WHERE p.status = 'ativo'`).all()).results;

  const stmts = [];
  for (const p of comVariacao) {
    if (p.jaTocado > 0) continue;          // regra 1: código já tem dono
    if (p.qtd <= 0) continue;
    const naLoja = mapa.get(p.sku);
    if (!naLoja || naLoja.variantes.length < 2) continue;

    /* Regra 2: a soma da loja é o ATESTADO de que ela sabe do que fala.
       Bateu com o nosso total, a repartição dela é confiável e entra
       inteira. Não bateu, não se reparte NADA — porque o desencontro não
       diz onde está o erro, e servir na ordem até o total acabar seria
       entupir as primeiras variações e zerar as últimas.

       Isso não é hipótese: o bug anterior escrevia o total do código na
       primeira variação, então a loja está com `[total, resto, resto]` em
       muitos desses códigos. Repartir na ordem reproduziria o bug e ainda
       levaria zero para os outros tamanhos. O freio da rodada pegou
       exatamente esse cenário — 16 produtos que seriam zerados. */
    const somaLoja = naLoja.variantes.reduce((s, v) => s + Math.max(0, v.estoque), 0);
    if (somaLoja !== p.qtd) {
      relato.naoSemeados.push({
        sku: p.sku, total: p.qtd, somaLoja,
        variacoes: naLoja.variantes.map(v => ({ nome: v.nome, estoque: v.estoque })),
      });
      continue;
    }

    const feito = [];
    for (const v of naLoja.variantes) {
      const qtd = Math.max(0, v.estoque);
      if (!qtd) continue;
      feito.push({ nome: v.nome, qtd });
      stmts.push(...movimentar(db, {
        sku: p.sku, variacao: v.nome, varianteId: v.varianteId,
        tipo: 'ajuste', quantidade: qtd, origem: 'variacao',
        obs: `Repartido pela Nuvemshop: "${v.nome}" com ${qtd}`,
      }));
      stmts.push(...movimentar(db, {
        sku: p.sku, tipo: 'ajuste', quantidade: -qtd, origem: 'variacao',
        obs: `Repartido pela Nuvemshop: contrapartida de "${v.nome}"`,
      }));
    }
    if (!feito.length) continue;
    relato.semeados.push({ sku: p.sku, total: p.qtd, variacoes: feito });
  }

  if (seco || !stmts.length) return;
  await db.batch(stmts);
}

/** Manda para a loja o que temos em casa (total menos consignado).
 *
 *  Só toca em código que existe nos DOIS lados. Produto que a loja tem e
 *  nós não conhecemos fica intocado: não saber de um produto não é o mesmo
 *  que saber que ele tem zero. */
async function empurrarEstoque(db, loja, mapa, relato, { forcar, seco }) {
  const normais = (await db.prepare(`
    SELECT p.sku, p.desc, p.qtd,
           p.qtd - COALESCE((
             SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
               JOIN maletas m ON m.id = mi.maleta_id
              WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')
           ), 0) AS casa
      FROM produtos p
     WHERE p.status = 'ativo' AND p.sku NOT IN (SELECT kit_sku FROM kit_componentes)`).all()).results;

  // Kit fica de fora da conta acima: p.qtd dele é sempre 0, então a mesma
  // fórmula diria "casa = 0" mesmo com peça de sobra. O disponível de um
  // kit só existe calculado a partir dos componentes (saldosDoSku já faz
  // isso sozinho), então cada um é resolvido à parte.
  const kitsAtivos = (await db.prepare(`
    SELECT DISTINCT p.sku, p.desc FROM produtos p
      JOIN kit_componentes kc ON kc.kit_sku = p.sku
     WHERE p.status = 'ativo'`).all()).results;
  const kits = [];
  for (const k of kitsAtivos) {
    const s = await saldosDoSku(db, k.sku);
    // `qtd` igual a `casa` de propósito: o consignado de um kit já está
    // embutido no disponível dos componentes, e a subtração lá embaixo
    // ("qtd − casa") precisa dar zero em vez de um número sem sentido.
    kits.push({ sku: k.sku, desc: k.desc, qtd: s.disponivel, casa: s.disponivel });
  }

  /* Saldo de cada variação — a mesma soma que dá o total do código, só
     agrupada mais fino, e agora agrupada pelas DUAS chaves possíveis: o
     nome (histórico) e o variante_id (o que passa a valer). */
  const saldos = await saldosDeVariacao(db);

  const nossos = [...normais, ...kits];
  for (const p of nossos) {
    const naLoja = mapa.get(p.sku);
    if (!naLoja) continue;

    /* Código vendido em mais de uma opção: quem decide se dá para empurrar
       é `resolverVariantes`, e a resposta dele é sim ou não — nunca "mais
       ou menos". O casamento é por `variante_id`, e o que não casar por id
       NÃO é chutado por nome, por posição nem pela primeira variante: o
       código inteiro sai da rodada e entra na revisão.

       Isso não é excesso de zelo. Casar por nome já falhou em produção do
       pior jeito que existe: a conta do total continuava fechando, então
       nenhum freio disparava, cada variante recebia zero, e a peça saía do
       ar sem ninguém ver. Ver docs/SYNC_ENGINE.md § variações. */
    if (naLoja.variantes.length > 1) {
      const r = resolverVariantes(p, naLoja, {
        saldoPorNome: saldos.porNome(p.sku),
        saldoPorVariante: saldos.porVariante(p.sku),
        persistido: saldos.persistido(p.sku),
      });

      if (!r.ok) {
        relato.semEmpurrar.push({
          sku: p.sku, desc: p.desc, casa: Math.max(0, p.casa),
          naLoja: naLoja.estoque, motivo: r.motivo,
          explicacao: r.explicacao, detalhe: r.detalhe,
          // o que varia neste produto, no vocabulário da própria loja
          atributos: naLoja.atributos || [],
          variacoes: naLoja.variantes.map(v => ({
            nome: v.nome, estoque: v.estoque, varianteId: String(v.varianteId),
          })),
        });
        continue;
      }

      for (const a of r.alvos) {
        if (a.para === a.de) continue;
        relato.mudancas.push({
          sku: p.sku, desc: `${p.desc} · ${a.nome}`, de: a.de, para: a.para,
          zera: a.para === 0 && a.de > 0, variacao: a.nome,
          varianteId: a.varianteId, produtoId: a.produtoId, locais: a.locais,
        });
      }
      continue;
    }

    const certo = Math.max(0, p.casa);
    if (certo === naLoja.estoque) continue;
    relato.mudancas.push({
      sku: p.sku, desc: p.desc, de: naLoja.estoque, para: certo,
      zera: certo === 0 && naLoja.estoque > 0,
    });
  }

  if (!relato.mudancas.length) return;

  /* ------------------------------------------------ freio de segurança */
  const limite = await config(db, 'syncLimiteMudancas', 40);
  const zerando = relato.mudancas.filter(m => m.zera).length;
  const limiteZerar = await config(db, 'syncLimiteZerar', 15);

  if (!forcar && (relato.mudancas.length > limite || zerando > limiteZerar)) {
    /* Mudança em massa quase sempre é dado nosso quebrado — uma importação
       que entrou errada, uma maleta lançada em dobro — e não a loja inteira
       tendo se esgotado de uma vez. Nesse caso o certo é parar e perguntar,
       porque empurrar apaga o estoque real da loja e ela para de vender. */
    relato.pausado = {
      motivo: zerando > limiteZerar
        ? `A rodada zeraria ${zerando} produtos na loja (o limite é ${limiteZerar}).`
        : `A rodada mudaria ${relato.mudancas.length} produtos (o limite é ${limite}).`,
      mudancas: relato.mudancas.length, zerando,
    };
    return;
  }

  if (seco) return;

  /* Última trava, à queima-roupa, no ponto exato onde a escrita sai.

     As checagens lá em cima já deveriam ter impedido qualquer mudança sem
     endereço. Esta existe porque "deveriam" não é garantia, e porque o
     preço de um bug aqui não é uma tela errada: é estoque errado numa loja
     que vende de verdade, e ninguém percebe até a peça sumir do ar.

     Um código que a loja publica em mais de uma variante e que chegou até
     aqui sem `varianteId` É o bug antigo, inteiro: o PATCH cairia na
     PRIMEIRA variante levando o total do código. A mudança é DESCARTADA —
     não adiada, não "aplicada com ressalva" — e o código vai para a
     revisão. `relato.mudancas` é reescrito sem ela, para `aplicado: true`
     continuar significando exatamente "isto está na loja". */
  const enderecadas = [], recusadas = [];
  for (const m of relato.mudancas) {
    const alvo = m.varianteId
      ? { produtoId: m.produtoId, varianteId: m.varianteId, locais: m.locais || [] }
      : mapa.get(m.sku);
    const publicado = mapa.get(m.sku);
    const multi = !!publicado && publicado.variantes.length > 1;
    if (!alvo || alvo.produtoId == null || (multi && !m.varianteId)) recusadas.push(m);
    else enderecadas.push({ m, alvo });
  }

  for (const m of recusadas) {
    relato.semEmpurrar.push({
      sku: m.sku, desc: m.desc, casa: m.para, naLoja: m.de,
      motivo: 'variacao_nao_mapeada',
      explicacao: 'A mudança chegou à escrita sem dizer qual variante da loja ela endereça. Nada foi escrito.',
      detalhe: { de: m.de, para: m.para },
    });
  }
  relato.mudancas = enderecadas.map(e => e.m);
  relato.recusadasNaEscrita = recusadas.length;
  if (!relato.mudancas.length) return;

  /* A escrita vai em lotes: um PATCH resolve muitos produtos de uma vez, e
     com 2 requisições por segundo isso é a diferença entre segundos e
     minutos. Produtos com variação repetida são agrupados pelo id do
     produto, que é como a API espera receber. */
  const porProduto = new Map();
  for (const { m, alvo } of enderecadas) {
    if (!porProduto.has(alvo.produtoId)) porProduto.set(alvo.produtoId, { id: alvo.produtoId, variants: [] });
    const variante = { id: alvo.varianteId };
    if (alvo.locais.length) {
      variante.inventory_levels = [{ location_id: alvo.locais[0], stock: m.para }];
    } else {
      variante.stock = m.para;   // loja ainda sem multi-estoque
    }
    porProduto.get(alvo.produtoId).variants.push(variante);
  }

  const todos = [...porProduto.values()];
  for (let i = 0; i < todos.length; i += 25) {
    await loja.atualizarEstoque(todos.slice(i, i + 25));
  }
  relato.produtosEnviados = todos.length;
  relato.aplicado = true;   // as mudanças acima já estão na loja
  await gravarConfig(db, 'syncUltimoEstoque', agoraISO());
}

/* ------------------------------------------- 3. gravar o retrato da loja */

/** A sincronização já leu a loja inteira para fazer o seu trabalho. Esta
 *  função guarda o que ela leu.
 *
 *  Sem isto a aba Loja do dashboard fica mentindo: as colunas `url_loja`,
 *  `estoque_loja` e `visivel` e a tabela `loja_snapshot` só eram escritas
 *  pela importação manual do CSV, então a tela continuava acusando "estoque
 *  errado no site" e "falta subir" com base num arquivo de semanas atrás —
 *  inclusive para produtos que a própria sincronização tinha acabado de
 *  acertar, e mandando gerar CSV para consertar o que já estava consertado.
 *
 *  Guardar o que foi lido é o suficiente: o retrato passa a valer da última
 *  rodada, não da última importação. Rodada que parou no freio ou rodada
 *  seca também gravam — elas não empurraram nada, mas leram a loja de
 *  verdade, e esse retrato é tão válido quanto o outro. */
async function gravarRetratoDaLoja(db, produtosLoja, mapa, relato) {
  /* Onde empurramos, a loja já está com o número novo — `mapa` guarda o
     valor de ANTES do PATCH e ficaria velho por uma rodada inteira.

     Código com variação recebe uma mudança POR variação, então o estoque
     publicado dele é a soma das caixinhas: as que mudaram valem pelo número
     novo, as que não mudaram seguem valendo o que a loja já tinha. */
  const empurrado = new Map();
  const porVariante = new Map();
  if (relato.aplicado) {
    for (const m of relato.mudancas) {
      if (m.varianteId) porVariante.set(String(m.varianteId), m.para);
      else empurrado.set(m.sku, m.para);
    }
    if (porVariante.size) {
      for (const [sku, v] of mapa) {
        if (v.variantes.length < 2) continue;
        if (!v.variantes.some(va => porVariante.has(String(va.varianteId)))) continue;
        empurrado.set(sku, v.variantes.reduce((s, va) => {
          const novo = porVariante.get(String(va.varianteId));
          return s + (novo === undefined ? va.estoque : novo);
        }, 0));
      }
    }
  }

  const nossos = new Set(
    (await db.prepare(`SELECT sku FROM produtos`).all()).results.map(p => p.sku)
  );

  const stmts = [
    /* Produto tirado do ar na Nuvemshop precisa deixar de constar como
       publicado aqui — por isso limpa antes de reescrever, igual à
       importação por arquivo faz. */
    db.prepare(`UPDATE produtos SET url_loja = NULL, estoque_loja = NULL, visivel = NULL`),
  ];

  /* As variações vindas da loja são reescritas do zero a cada rodada: ela é
     a fonte da verdade sobre quais existem, e aro que sumiu de lá não pode
     continuar aparecendo na hora da venda. O saldo não mora aqui — mora nos
     movimentos — então apagar e regravar não perde histórico nenhum.

     As criadas AQUI (origem 'local') ficam. Elas são de produto que ainda
     não está na Nuvemshop: a loja não tem opinião sobre elas, e apagá-las
     seria a rodada da madrugada desfazendo o cadastro que alguém acabou de
     digitar — o pior tipo de bug, o que acontece enquanto ninguém olha.
     Se um dia a loja passar a ter a mesma variação, o ON CONFLICT abaixo a
     promove para 'loja' e ela volta a ser reescrita normalmente. */
  stmts.push(db.prepare(`DELETE FROM produto_variacoes WHERE origem IS NULL OR origem <> 'local'`));

  let casados = 0, soNaLoja = 0;
  const produtosCasados = new Set();
  for (const [sku, v] of mapa) {
    if (!nossos.has(sku)) { soNaLoja++; continue; }
    casados++;
    produtosCasados.add(v.produtoId);

    if (v.variantes.length > 1) {
      v.variantes.forEach((va, i) => {
        stmts.push(db.prepare(
          `INSERT INTO produto_variacoes
             (sku, nome, atributo, variante_id, produto_id, estoque_loja, ordem,
              valores_json, variante_sku, preco, promocional, imagem_url, origem)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'loja')
           ON CONFLICT(sku, nome) DO UPDATE SET
             atributo=excluded.atributo, variante_id=excluded.variante_id,
             produto_id=excluded.produto_id, estoque_loja=excluded.estoque_loja,
             ordem=excluded.ordem, valores_json=excluded.valores_json,
             variante_sku=excluded.variante_sku, preco=excluded.preco,
             promocional=excluded.promocional, imagem_url=excluded.imagem_url,
             origem='loja'`
        ).bind(
          sku, va.nome || `opção ${i + 1}`, (v.atributos || []).join(' · ') || null,
          String(va.varianteId), String(va.produtoId),
          porVariante.has(String(va.varianteId)) ? porVariante.get(String(va.varianteId)) : va.estoque,
          i,
          /* Os atributos em pares, dinâmicos. `atributo` acima continua com
             os nomes concatenados porque é o que a tela legada lê; esta
             coluna é a que sabe QUAL valor é de QUAL atributo, e é a única
             que não quebra num produto que varia por "Banho" e "Pedra". */
          JSON.stringify(va.valores || []),
          va.sku || null,
          va.preco == null ? null : va.preco,
          va.promocional == null ? null : va.promocional,
          va.imagemUrl || null,
        ));
      });
    }
    stmts.push(db.prepare(
      `UPDATE produtos SET url_loja = ?, estoque_loja = ?, visivel = ?, nome_loja = ? WHERE sku = ?`
    ).bind(
      v.url || String(v.produtoId),
      empurrado.has(sku) ? empurrado.get(sku) : v.estoque,
      v.visivel === null ? null : (v.visivel ? 1 : 0),
      v.nome || null,
      sku,
    ));
  }

  stmts.push(db.prepare(
    `INSERT INTO loja_snapshot (id, lido_em, produtos_na_loja, produtos_casados, so_na_loja, codigos_casados, duplicados_json)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET lido_em=excluded.lido_em, produtos_na_loja=excluded.produtos_na_loja,
       produtos_casados=excluded.produtos_casados, so_na_loja=excluded.so_na_loja,
       codigos_casados=excluded.codigos_casados, duplicados_json=excluded.duplicados_json`
  ).bind(
    agoraISO(), produtosLoja.length, produtosCasados.size, soNaLoja, casados,
    JSON.stringify(relato.duplicadosNaLoja || []),
  ));

  await db.batch(stmts);
  relato.retrato = { produtosNaLoja: produtosLoja.length, casados, soNaLoja };

  /* Os códigos que a rodada decidiu não empurrar precisam chegar à tela: um
     código que a sincronização não atualiza e não anuncia é pior do que um
     que ela erra, porque ninguém fica sabendo. Vai no `config` em vez de uma
     coluna nova só para não exigir migração no banco que já está no ar. */
  await gravarConfig(db, 'lojaVariacoes', relato.semEmpurrar || []);
}

/* ------------------------------------------------------------ histórico */

export async function historicoSync(db, limite = 20) {
  const r = await db.prepare(
    `SELECT * FROM sync_execucoes ORDER BY id DESC LIMIT ?`).bind(limite).all();
  return r.results.map(e => ({
    id: e.id, iniciadoEm: e.iniciado_em, terminadoEm: e.terminado_em, status: e.status,
    pedidosLidos: e.pedidos_lidos, vendasCriadas: e.vendas_criadas,
    produtosEnviados: e.produtos_enviados, seco: !!e.seco,
    detalhe: e.detalhe_json ? JSON.parse(e.detalhe_json) : null,
  }));
}

/** A saúde operacional da sincronização vem SEMPRE da última execução REAL
 *  — nunca de uma rodada seca. Uma análise (`{"seco": true}`) bem-sucedida
 *  não pode fazer uma falha real desaparecer da tela: ver TECH_DEBT.md
 *  item 12. `seco` é gravado no INSERT (sync.js › sincronizar), então o
 *  filtro funciona mesmo para uma execução ainda 'rodando' — nenhuma
 *  dependência de `detalhe_json`, que só existe depois que a rodada termina. */
export async function resumoSync(db, env) {
  const loja = new Nuvemshop(env);
  const ultimaReal = await db.prepare(
    `SELECT * FROM sync_execucoes WHERE seco = 0 ORDER BY id DESC LIMIT 1`).first();
  const detalhe = ultimaReal && ultimaReal.detalhe_json ? JSON.parse(ultimaReal.detalhe_json) : {};

  // Separado de propósito: "última análise" e "última sincronização real"
  // são perguntas diferentes, e misturá-las foi exatamente o bug. Uma
  // rodada seca continua sendo gravada e auditável — só não conta para a
  // saúde operacional.
  const ultimaAnalise = await db.prepare(
    `SELECT iniciado_em, terminado_em FROM sync_execucoes WHERE seco = 1 ORDER BY id DESC LIMIT 1`).first();

  return {
    conectada: loja.configurada(),
    ultimaEm: ultimaReal ? (ultimaReal.terminado_em || ultimaReal.iniciado_em) : null,
    ultimoStatus: ultimaReal ? ultimaReal.status : null,
    pausada: ultimaReal && ultimaReal.status === 'pausado' ? detalhe.pausado : null,
    // uma rodada que falhou não pode se parecer com uma que deu certo:
    // a mensagem sobe para a tela poder dizer o que houve
    erro: ultimaReal && ultimaReal.status === 'erro' ? (detalhe.erro || 'Falhou sem dizer o motivo.') : null,
    ultimaId: ultimaReal ? ultimaReal.id : null,
    ultimaAnaliseEm: ultimaAnalise ? (ultimaAnalise.terminado_em || ultimaAnalise.iniciado_em) : null,
  };
}

/* ============================================================ análise seca */

/** "O que aconteceria se eu sincronizasse agora?" — sem escrever nada.
 *
 *  Diferente do `seco` de `sincronizar()`, que abre uma execução, puxa
 *  pedidos e grava o retrato da loja, esta função é uma LEITURA pura: ela
 *  abre a loja, compara com o catálogo e devolve o laudo. Nenhuma linha do
 *  banco muda, nenhum pedido é importado, nenhum PATCH sai.
 *
 *  É o que sustenta a confirmação obrigatória da tela: a pessoa vê o
 *  tamanho exato da mudança antes de autorizar, e o botão que autoriza é
 *  outro (`POST /api/sync`).
 */
export async function analisarSincronizacao(db, env) {
  const loja = new Nuvemshop(env);
  if (!loja.configurada()) {
    return { ok: false, erro: 'A loja não está conectada. Falta o token da Nuvemshop.' };
  }

  const produtosLoja = await loja.produtos();
  const { mapa, duplicados } = mapearSkus(produtosLoja);

  /* O mesmo cálculo que a sincronização de verdade faz. Chamado com
     `seco`, ele monta `mudancas` e `semEmpurrar` e volta antes de escrever
     — inclusive passando pelo freio, cujo veredito também interessa aqui. */
  const relato = { mudancas: [], semEmpurrar: [], pausado: null };
  await empurrarEstoque(db, loja, mapa, relato, { forcar: false, seco: true });

  const nossos = (await db.prepare(`
    SELECT p.sku, p.desc, p.cat, p.preco, p.qtd, p.url_loja,
           p.foto_original_key, p.foto_tratada_key, p.foto_status,
           p.qtd - COALESCE((
             SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
               JOIN maletas m ON m.id = mi.maleta_id
              WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')
           ), 0) AS casa
      FROM produtos p WHERE p.status = 'ativo'`).all()).results;

  const mudandoSku = new Set(relato.mudancas.map(m => m.sku));
  const revisaoSku = new Set(relato.semEmpurrar.map(m => m.sku));

  /* §24 na análise da loja: peça sem preço NUNCA entra em "criar na loja"
     — publicar sem preço não é uma opção que só falta confirmar, é um
     estado bloqueado. Ela fica em `bloqueadosSemPreco`, separada, para não
     ser contada como candidata pronta nem escondida da pessoa. */
  const iguais = [], criarNaLoja = [], bloqueadosSemPreco = [];
  const semFoto = [], semDescricao = [], semCategoria = [];
  for (const p of nossos) {
    const naLoja = mapa.get(p.sku);
    if (!naLoja) {
      /* Só entra em "criar na loja" quem tem peça em casa: cadastrar o que
         não dá para vender é trabalho sem venda do outro lado. */
      if ((p.casa || 0) > 0) {
        const item = { sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco, casa: p.casa,
                       fotoStatus: p.foto_status || 'sem_foto' };
        if (p.preco == null) { bloqueadosSemPreco.push(item); continue; }
        criarNaLoja.push(item);
        if (!p.foto_original_key && !p.foto_tratada_key) semFoto.push(item);
        if (!p.desc || p.desc.trim() === p.sku) semDescricao.push(item);
        if (!p.cat || p.cat === 'Outros') semCategoria.push(item);
      }
      continue;
    }
    if (!mudandoSku.has(p.sku) && !revisaoSku.has(p.sku)) iguais.push({ sku: p.sku, desc: p.desc });
  }

  /* Código que a loja tem e o catálogo não conhece. Não é para criar aqui
     sozinho: pode ser produto aposentado, pode ser código digitado errado
     lá — as duas coisas pedem gente olhando. */
  const nossosSku = new Set(nossos.map(p => p.sku));
  const soNaLoja = [];
  for (const [sku, e] of mapa) {
    if (nossosSku.has(sku)) continue;
    soNaLoja.push({ sku, nome: e.nome, estoqueLoja: e.estoque, url: e.url });
  }

  const mudancas = relato.mudancas;
  const teto = (l) => l.slice(0, 300);

  return {
    ok: true,
    lidoEm: new Date().toISOString(),
    resumo: {
      analisados: nossos.length,
      produtosNaLoja: produtosLoja.length,
      sincronizados: iguais.length,
      estoqueDiferente: mudancas.length,
      zerariam: mudancas.filter(m => m.zera).length,
      criarNaLoja: criarNaLoja.length,
      bloqueadosSemPreco: bloqueadosSemPreco.length,
      soNaLoja: soNaLoja.length,
      semFoto: semFoto.length,
      semDescricao: semDescricao.length,
      semCategoria: semCategoria.length,
      duplicados: duplicados.length,
      revisao: relato.semEmpurrar.length,
    },
    /* O freio já se pronunciou: se a rodada de verdade seria segurada, a
       tela precisa dizer isso ANTES do clique, não depois. */
    freio: relato.pausado,
    estoqueDiferente: teto(mudancas),
    criarNaLoja: teto(criarNaLoja),
    bloqueadosSemPreco: teto(bloqueadosSemPreco),
    soNaLoja: teto(soNaLoja),
    semFoto: teto(semFoto),
    semDescricao: teto(semDescricao),
    semCategoria: teto(semCategoria),
    duplicados,
    revisao: teto(relato.semEmpurrar),
  };
}
