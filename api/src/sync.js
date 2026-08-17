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

  const exec = await db.prepare(
    `INSERT INTO sync_execucoes (iniciado_em, status) VALUES (datetime('now'), 'rodando') RETURNING id`
  ).first();

  const relato = {
    id: exec.id, pedidosLidos: 0, vendasCriadas: 0, itensIgnorados: [],
    produtosEnviados: 0, mudancas: [], pausado: null, seco,
  };

  try {
    const produtosLoja = await loja.produtos();
    const { mapa, duplicados } = mapearSkus(produtosLoja);
    relato.duplicadosNaLoja = duplicados;

    await puxarPedidos(db, loja, relato, seco);
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

/** Manda para a loja o que temos em casa (total menos consignado).
 *
 *  Só toca em código que existe nos DOIS lados. Produto que a loja tem e
 *  nós não conhecemos fica intocado: não saber de um produto não é o mesmo
 *  que saber que ele tem zero. */
async function empurrarEstoque(db, loja, mapa, relato, { forcar, seco }) {
  const normais = (await db.prepare(`
    SELECT p.sku, p.desc,
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
    kits.push({ sku: k.sku, desc: k.desc, casa: s.disponivel });
  }

  const nossos = [...normais, ...kits];
  for (const p of nossos) {
    const naLoja = mapa.get(p.sku);
    if (!naLoja) continue;
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

  /* A escrita vai em lotes: um PATCH resolve muitos produtos de uma vez, e
     com 2 requisições por segundo isso é a diferença entre segundos e
     minutos. Produtos com variação repetida são agrupados pelo id do
     produto, que é como a API espera receber. */
  const porProduto = new Map();
  for (const m of relato.mudancas) {
    const alvo = mapa.get(m.sku);
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
     valor de ANTES do PATCH e ficaria velho por uma rodada inteira. */
  const empurrado = new Map();
  if (relato.aplicado) for (const m of relato.mudancas) empurrado.set(m.sku, m.para);

  const nossos = new Set(
    (await db.prepare(`SELECT sku FROM produtos`).all()).results.map(p => p.sku)
  );

  const stmts = [
    /* Produto tirado do ar na Nuvemshop precisa deixar de constar como
       publicado aqui — por isso limpa antes de reescrever, igual à
       importação por arquivo faz. */
    db.prepare(`UPDATE produtos SET url_loja = NULL, estoque_loja = NULL, visivel = NULL`),
  ];

  let casados = 0, soNaLoja = 0;
  const produtosCasados = new Set();
  for (const [sku, v] of mapa) {
    if (!nossos.has(sku)) { soNaLoja++; continue; }
    casados++;
    produtosCasados.add(v.produtoId);
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
}

/* ------------------------------------------------------------ histórico */

export async function historicoSync(db, limite = 20) {
  const r = await db.prepare(
    `SELECT * FROM sync_execucoes ORDER BY id DESC LIMIT ?`).bind(limite).all();
  return r.results.map(e => ({
    id: e.id, iniciadoEm: e.iniciado_em, terminadoEm: e.terminado_em, status: e.status,
    pedidosLidos: e.pedidos_lidos, vendasCriadas: e.vendas_criadas,
    produtosEnviados: e.produtos_enviados,
    detalhe: e.detalhe_json ? JSON.parse(e.detalhe_json) : null,
  }));
}

export async function resumoSync(db, env) {
  const loja = new Nuvemshop(env);
  const ultima = await db.prepare(
    `SELECT * FROM sync_execucoes ORDER BY id DESC LIMIT 1`).first();
  const detalhe = ultima && ultima.detalhe_json ? JSON.parse(ultima.detalhe_json) : {};
  return {
    conectada: loja.configurada(),
    ultimaEm: ultima ? (ultima.terminado_em || ultima.iniciado_em) : null,
    ultimoStatus: ultima ? ultima.status : null,
    pausada: ultima && ultima.status === 'pausado' ? detalhe.pausado : null,
    // uma rodada que falhou não pode se parecer com uma que deu certo:
    // a mensagem sobe para a tela poder dizer o que houve
    erro: ultima && ultima.status === 'erro' ? (detalhe.erro || 'Falhou sem dizer o motivo.') : null,
    ultimaId: ultima ? ultima.id : null,
  };
}
