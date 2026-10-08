/** §61 — Estoque online: Marquesa → Nuvemshop, código por código.
 *
 *  O QUE ESTE ARQUIVO RESOLVE
 *
 *  Até 08/10/2026 cada venda daqui relia o catálogo inteiro da loja e o
 *  catálogo inteiro daqui, calculava a diferença de TODOS os códigos e
 *  empurrava tudo de uma vez. Como a soma das diferenças antigas passava do
 *  freio ("zeraria 60 produtos"), a rodada parava — e nenhuma venda chegava
 *  à loja. O cron estava desligado desde o go-live. Resultado: a Nuvemshop
 *  não acompanhava nada.
 *
 *  O DESENHO
 *
 *    movimento de estoque (qualquer um: venda, brinde, maleta, ajuste,
 *    inventário, acerto, cancelamento...)
 *        │  gatilho do banco, NA MESMA TRANSAÇÃO do movimento
 *        ▼
 *    nuvemshop_fila  — uma linha por código (outbox), com `versao`
 *        │  logo depois da operação (mesma requisição) ou pelo cron
 *        ▼
 *    processarFila — lê SÓ os códigos pendentes, calcula o saldo ABSOLUTO
 *    em casa por variante e manda `stock = N` para a loja
 *        │
 *        ▼
 *    sincronizado · erro (com nova tentativa marcada) · revisão (humana)
 *
 *  As garantias, e de onde cada uma vem:
 *
 *  - Nada se perde: o evento nasce no banco junto com o movimento (gatilho
 *    `trg_mov_fila`), não num passo depois que pode não acontecer.
 *  - Nada se duplica: a loja recebe o SALDO, nunca "−1". Mandar duas vezes
 *    dá o mesmo número. A venda e o movimento não são tocados aqui.
 *  - A venda não depende da loja: a fila é processada depois do batch da
 *    venda; se a Nuvemshop cair, a linha fica `erro` com a próxima tentativa
 *    marcada, e a venda já está gravada.
 *  - Duas rodadas ao mesmo tempo não pegam o mesmo código: `travado_ate` é
 *    um arrendamento (lease) gravado por UPDATE atômico; e `versao` impede
 *    que uma rodada lenta marque como sincronizado um código que mudou de
 *    novo enquanto ela trabalhava.
 *  - Incremental: uma venda de um código lê aquele código. O caminho em
 *    lote (catálogo inteiro) só existe quando a fila acumulou muitos, e na
 *    conferência administrativa.
 *  - Desligável: `config.nuvemshopSyncAtivo` (kill switch). Desligado, a fila
 *    continua ACUMULANDO — religar entrega o que ficou parado.
 */
import { Nuvemshop, mapearSkus, catalogoDeVariantes } from './nuvemshop.js';
import { decidirEstoqueDoSku, puxarPedidos, corteDePedidos } from './sync.js';
import { saldosDeVariacao } from './variantes.js';
import { saldosDoSku } from './estoque.js';
import { consultarEmLotes, parametros } from './plataforma/d1.js';
import { normSku } from './sku.js';
import { chamadasD1 } from './d1-metrica.js';

const agoraISO = () => new Date().toISOString();
const emMs = (iso) => { const t = Date.parse(String(iso || '')); return Number.isNaN(t) ? null : t; };

/** A chave do kill switch. Ausente vale DESLIGADO (fail-closed): um banco
 *  recém-migrado não começa a escrever na loja sozinho. */
export const CHAVE_ATIVO = 'nuvemshopSyncAtivo';

/** Quantos códigos o caminho incremental atende numa rodada. Cada produto
 *  custa um GET na loja (2 por segundo); acima disto, ler o catálogo inteiro
 *  (3–4 GETs de 200) sai mais barato que um GET por produto. */
export const LIMITE_INCREMENTAL = 12;

/** Quantas vezes uma falha da LOJA é tentada de novo sozinha, e com que
 *  espera (minutos). Depois da última, a linha para em `erro` sem próxima
 *  tentativa e espera alguém apertar "Tentar novamente" — retry infinito é
 *  como um erro permanente vira ruído permanente. */
export const ESPERAS_MIN = [1, 5, 15, 30, 60, 180, 360, 720];
export const MAX_TENTATIVAS = ESPERAS_MIN.length;

/** Por quanto tempo uma rodada segura os códigos que pegou. Se ela morrer no
 *  meio, outra pode pegá-los depois disto. */
const ARRENDAMENTO_MS = 5 * 60 * 1000;

/** Mais que isto de consultas ao D1 na requisição, e o envio fica para o
 *  cron: o plano Free recusa a 51ª consulta da mesma invocação (§60). */
const TETO_CONSULTAS_NA_REQUISICAO = 30;

async function config(db, chave, padrao) {
  const r = await db.prepare('SELECT valor FROM config WHERE chave = ?').bind(chave).first();
  if (!r) return padrao;
  try { return JSON.parse(r.valor); } catch { return padrao; }
}

/** `config.valor` é JSON sempre — texto cru derruba /api/state. */
function gravarConfigStmt(db, chave, valor) {
  return db.prepare(
    `INSERT INTO config (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
  ).bind(chave, JSON.stringify(valor));
}

export async function syncAtivo(db) {
  return (await config(db, CHAVE_ATIVO, false)) === true;
}

/** Banco sem a migration de §61 continua funcionando: só não há fila. */
async function temFila(db) {
  try {
    await db.prepare('SELECT 1 FROM nuvemshop_fila LIMIT 1').first();
    return true;
  } catch { return false; }
}

/* ======================================================================== */
/* 1. ENFILEIRAR                                                             */
/* ======================================================================== */

/** O mesmo UPSERT do gatilho, para os caminhos que precisam pedir um envio
 *  sem mexer em estoque (nova tentativa, reconciliação administrativa). */
export function enfileirarStmt(db, sku, motivo) {
  return db.prepare(
    `INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
     VALUES (?, 'pendente', ?, 1, ?, 0)
     ON CONFLICT(sku) DO UPDATE SET
       status = 'pendente', motivo = excluded.motivo,
       versao = nuvemshop_fila.versao + 1, pedido_em = excluded.pedido_em,
       tentativas = 0, proxima_em = NULL`,
  ).bind(String(sku), motivo || null, agoraISO());
}

/* ======================================================================== */
/* 2. O ESTADO LOCAL DE UM CONJUNTO DE CÓDIGOS                              */
/* ======================================================================== */

const SQL_CASA = `p.qtd - COALESCE((
     SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
       JOIN maletas m ON m.id = mi.maleta_id
      WHERE mi.sku = p.sku AND m.status IN ('aberta','em_acerto')
   ), 0)`;

/** Produto, "em casa" e o que for preciso para decidir. Com `skus`, lê só
 *  esses (caminho incremental); sem, lê o catálogo ativo (lote). */
async function lerLocais(db, skus) {
  const colunas = `p.sku, p.desc, p.qtd, p.status, p.produto_id_loja,
                   ${SQL_CASA} AS casa,
                   EXISTS (SELECT 1 FROM kit_componentes kc WHERE kc.kit_sku = p.sku) AS eh_kit`;
  const linhasP = skus
    ? await consultarEmLotes(db, skus, (qs) => `SELECT ${colunas} FROM produtos p WHERE p.sku IN (${qs})`)
    : (await db.prepare(`SELECT ${colunas} FROM produtos p WHERE p.status = 'ativo'`).all()).results || [];

  /* Monte seu Colar (§42): a configuração comercial não tem saldo próprio.
     Tabela opcional — banco antigo segue sem ela. */
  let montagens = new Set();
  try {
    const r = (await db.prepare(
      'SELECT sku_comercial FROM personalizacao_modelos WHERE sku_comercial IS NOT NULL').all()).results || [];
    montagens = new Set(r.map((x) => String(x.sku_comercial)));
  } catch { /* sem a tabela, sem montagem */ }

  const locais = new Map();
  for (const p of linhasP) {
    let qtd = Number(p.qtd || 0);
    let casa = Number(p.casa || 0);
    if (p.eh_kit || montagens.has(String(p.sku))) {
      /* O disponível de kit e de montagem só existe calculado a partir das
         peças. `qtd = casa` faz a conta de consignado dar zero, como na
         rodada completa. Raro (zero kits em produção em 08/10/2026). */
      const s = await saldosDoSku(db, p.sku);
      qtd = casa = s ? Number(s.disponivel || 0) : 0;
    }
    locais.set(String(p.sku), {
      sku: String(p.sku), desc: p.desc, qtd, casa,
      ativo: p.status === 'ativo',
      produtoIdLoja: p.produto_id_loja == null ? null : String(p.produto_id_loja),
    });
  }
  return locais;
}

/** Em quais produtos da loja cada código aparece, pelo espelho
 *  `loja_variantes` e por `produtos.produto_id_loja`. Mais de um produto é
 *  cadastro duplicado — e o GET dos dois deixa `mapearSkus` dizer isso. */
async function produtosDaLojaPara(db, locais) {
  const porSku = new Map();
  for (const l of locais.values()) {
    porSku.set(l.sku, new Set(l.produtoIdLoja ? [l.produtoIdLoja] : []));
  }
  const normParaSku = new Map([...locais.keys()].map((s) => [normSku(s), s]));
  try {
    const rs = await consultarEmLotes(db, [...normParaSku.keys()],
      (qs) => `SELECT sku_norm, produto_id FROM loja_variantes WHERE sku_norm IN (${qs})`);
    for (const r of rs) {
      const sku = normParaSku.get(r.sku_norm);
      if (sku && r.produto_id != null) porSku.get(sku).add(String(r.produto_id));
    }
  } catch { /* espelho ausente: fica o produto_id_loja */ }
  return porSku;
}

/* ======================================================================== */
/* 3. PROCESSAR A FILA                                                       */
/* ======================================================================== */

const FILTRO_DEVIDO = `travado_ate IS NULL OR travado_ate < ?`;
const DEVIDO = `((status = 'pendente' AND (proxima_em IS NULL OR proxima_em <= ?))
                 OR (status = 'erro' AND proxima_em IS NOT NULL AND proxima_em <= ?))
                AND (${FILTRO_DEVIDO})`;
/* O gesto humano ("Sincronizar pendências", "Tentar novamente") não espera
   o fim da espera marcada, e pega também o que já tinha desistido. Os dois
   `?` existem só para o bind ter a mesma forma do DEVIDO. */
const DEVIDO_AGORA = `(status IN ('pendente','erro') AND ? IS NOT NULL AND ? IS NOT NULL)
                AND (${FILTRO_DEVIDO})`;

/** Pega os códigos devidos com um UPDATE atômico. Quem não aparece no
 *  RETURNING está com outra rodada — e fica com ela. */
async function reservar(db, { skus, limite, agora, ate, ignorarEspera = false }) {
  if (skus && !skus.length) return [];
  const filtro = skus ? `AND sku IN (${parametros(skus.length)})` : '';
  const r = await db.prepare(
    `UPDATE nuvemshop_fila SET travado_ate = ?, ultima_tentativa_em = ?
      WHERE sku IN (SELECT sku FROM nuvemshop_fila
                     WHERE ${ignorarEspera ? DEVIDO_AGORA : DEVIDO} ${filtro}
                     ORDER BY pedido_em LIMIT ?)
      RETURNING sku, versao, status, tentativas, enviado_json`,
  ).bind(ate, agora, agora, agora, agora, ...(skus || []), limite).all();
  return r.results || [];
}

async function contarDevidos(db, agora, ignorarEspera = false) {
  const r = await db.prepare(
    `SELECT COUNT(*) AS n FROM nuvemshop_fila WHERE ${ignorarEspera ? DEVIDO_AGORA : DEVIDO}`,
  ).bind(agora, agora, agora).first();
  return Number(r && r.n || 0);
}

function esperaDe(tentativas) {
  const i = Math.min(Math.max(1, tentativas), ESPERAS_MIN.length) - 1;
  return ESPERAS_MIN[i] * 60 * 1000;
}

function erroLegivel(e) {
  /* A mensagem de `nuvemshop.js › explicarErro` já é uma frase para gente.
     Nada de token, cabeçalho ou corpo de requisição sai daqui. */
  const m = String((e && e.message) || e || 'Falha sem mensagem.');
  return m.replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 400);
}

/** O coração. Processa os códigos devidos e devolve o que fez.
 *
 *  Opções:
 *    skus       só estes códigos (venda, maleta). Sem, os devidos da fila.
 *    puxar      puxar pedidos do site ANTES de empurrar (§5.1). O cron puxa;
 *               a requisição da venda não, e por isso usa `cautela`.
 *    cautela    se a loja tem MENOS do que o último saldo que mandamos e o
 *               nosso número é maior que o dela, pode haver venda do site
 *               ainda não importada: adia para o cron, que puxa antes.
 *    forcar     ignora o freio do caminho em lote (ato humano confirmado).
 *    origem     rótulo para o log ('venda', 'requisicao', 'cron', 'manual').
 */
export async function processarFila(db, env, opcoes = {}) {
  const {
    skus = null, puxar = false, cautela = false, forcar = false,
    origem = 'manual', limite = null, contador = null, ignorarEspera = false,
  } = opcoes;
  const inicio = Date.now();
  const relato = {
    origem, em: agoraISO(), modo: null,
    processados: 0, sincronizados: 0, iguais: 0, enviados: 0,
    erros: 0, revisao: 0, semAnuncio: 0, adiados: 0, chamadasLoja: 0,
    pedidos: null, freio: null, desligado: false, motivo: null,
    resultados: [],
  };

  if (!(await temFila(db))) { relato.motivo = 'sem_migracao'; return relato; }
  if (!(await syncAtivo(db))) {
    relato.desligado = true;
    relato.motivo = 'A sincronização automática está desligada (kill switch). A fila continua guardando o que mudou.';
    return relato;
  }
  const loja = new Nuvemshop(env);
  if (!loja.configurada()) { relato.motivo = 'A loja não está conectada.'; return relato; }
  if (!loja.escritaHabilitada) {
    relato.motivo = 'NUVEMSHOP_WRITES_ENABLED não está "true" neste ambiente: nada é escrito na loja.';
    return relato;
  }

  /* §5.1 — puxar ANTES de empurrar. Sem corte de pedidos não se puxa nada:
     sem corte, a primeira leitura importaria o histórico inteiro da loja e
     baixaria estoque já contado (memória do go-live). */
  if (puxar) {
    const corte = await corteDePedidos(db);
    if (!corte) {
      relato.motivo = 'Falta o corte de pedidos (config.syncCorteEm): sem ele, puxar pedidos importaria o histórico inteiro. Nada foi enviado.';
      return relato;
    }
    const rp = {
      pedidosLidos: 0, vendasCriadas: 0, itensIgnorados: [],
      pedidosNaoPagos: [], pedidosSemEstadoDePagamento: [], pedidosNaoCobraveis: [],
      pedidosParciais: [], pedidosExigindoPolitica: [], pagamentosAtualizados: [],
      pedidosAntesDoCorte: [],
    };
    try {
      await puxarPedidos(db, loja, rp, false, { limiteNovos: 8 });
      relato.chamadasLoja++;
      relato.pedidos = {
        lidos: rp.pedidosLidos, vendasCriadas: rp.vendasCriadas,
        restantes: !!rp.pedidosRestantes,
        itensIgnorados: rp.itensIgnorados.slice(0, 20),
        antesDoCorte: rp.pedidosAntesDoCorte.slice(0, 20),
        pagamentosAtualizados: rp.pagamentosAtualizados.length,
      };
    } catch (e) {
      /* Sem a leitura de pedidos não se empurra: empurrar poderia devolver à
         venda uma peça que o site acabou de vender. A rodada para inteira e
         diz por quê; a fila fica como estava. */
      relato.motivo = 'Não consegui ler os pedidos do site: ' + erroLegivel(e) + ' Nada foi enviado.';
      relato.erroPedidos = true;
      return relato;
    }
  }

  const agora = agoraISO();
  const ate = new Date(Date.now() + ARRENDAMENTO_MS).toISOString();
  const devidos = skus ? null : await contarDevidos(db, agora, ignorarEspera);
  const emLote = !skus && devidos > LIMITE_INCREMENTAL;
  relato.modo = emLote ? 'lote' : 'incremental';
  const reservados = await reservar(db, {
    skus: skus ? [...new Set(skus.map(String))] : null,
    limite: limite || (emLote ? 2000 : LIMITE_INCREMENTAL), agora, ate, ignorarEspera,
  });
  relato.processados = reservados.length;
  /* O que a leitura de pedidos decidiu NÃO importar (anterior ao corte,
     item sem cadastro) fica anotado para a tela, mesmo quando a fila está
     vazia — §22: o que o sistema decide não fazer é anunciado. */
  const atencao = relato.pedidos && (relato.pedidos.antesDoCorte.length || relato.pedidos.itensIgnorados.length)
    ? { em: relato.em, antesDoCorte: relato.pedidos.antesDoCorte, itensIgnorados: relato.pedidos.itensIgnorados }
    : null;
  if (!reservados.length) {
    if (atencao) await db.batch([gravarConfigStmt(db, 'nuvemshopPedidosAtencao', atencao)]);
    relato.ms = Date.now() - inicio;
    return relato;
  }

  const filaPorSku = new Map(reservados.map((r) => [String(r.sku), r]));
  const stmts = [];
  const concluir = (sku, campos) => {
    const r = filaPorSku.get(sku);
    stmts.push(...marcar(db, sku, r, campos));
    relato.resultados.push({ sku, ...campos.publico });
  };

  try {
    const locais = await lerLocais(db, emLote ? null : [...filaPorSku.keys()]);
    /* Código que saiu do catálogo ou não está ativo: nada a mandar. */
    for (const sku of filaPorSku.keys()) {
      const l = locais.get(sku);
      if (!l || !l.ativo) {
        concluir(sku, { status: 'ignorado', erro: l ? 'Peça inativa: não se publica estoque.' : 'Código fora do catálogo.', publico: { status: 'ignorado' } });
        relato.semAnuncio++;
      }
    }
    const ativos = [...filaPorSku.keys()].filter((s) => locais.get(s) && locais.get(s).ativo);

    /* ---- o lado da loja ---- */
    let produtosLoja = [];
    let falhaLeitura = null;
    if (emLote) {
      try { produtosLoja = await loja.produtos(); relato.chamadasLoja += 4; } catch (e) { falhaLeitura = e; }
    } else {
      const porSku = await produtosDaLojaPara(db, new Map(ativos.map((s) => [s, locais.get(s)])));
      const ids = new Set();
      for (const s of ativos) for (const id of porSku.get(s) || []) ids.add(id);
      for (const id of ids) {
        try {
          produtosLoja.push(await loja.produto(id));
          relato.chamadasLoja++;
        } catch (e) {
          relato.chamadasLoja++;
          /* Produto apagado na loja responde 404: não é falha de rede, é
             anúncio que deixou de existir. Os outros erros param o código. */
          if (e && e.status === 404) continue;
          falhaLeitura = e;
          break;
        }
      }
    }
    if (falhaLeitura) throw falhaLeitura;

    const { mapa } = mapearSkus(produtosLoja);
    const saldos = await saldosDeVariacao(db, emLote ? null : ativos);

    const mudancas = [];          // { sku, m }
    const paraEnviar = new Map(); // sku -> [{ varianteId, para }]
    const estadoLoja = new Map(); // sku -> { total, porVariante }
    for (const sku of ativos) {
      const l = locais.get(sku);
      const naLoja = mapa.get(normSku(sku));
      if (!naLoja) {
        concluir(sku, {
          status: 'ignorado', erro: 'Sem anúncio na Nuvemshop: a peça ainda não foi publicada (Preparação para Nuvemshop).',
          publico: { status: 'sem_anuncio' },
        });
        relato.semAnuncio++;
        continue;
      }
      const d = decidirEstoqueDoSku(l, naLoja, saldos);
      if (d.semEmpurrar) {
        concluir(sku, {
          status: 'revisao', erro: d.semEmpurrar.explicacao || d.semEmpurrar.motivo,
          resultado: { motivo: d.semEmpurrar.motivo, casa: l.casa, naLoja: naLoja.estoque },
          publico: { status: 'revisao', motivo: d.semEmpurrar.motivo },
        });
        relato.revisao++;
        continue;
      }
      /* Os alvos completos (também os iguais), para o registro de "o que a
         loja tem agora" e para a cautela abaixo. */
      const alvos = naLoja.variantes.length > 1
        ? naLoja.variantes.map((v) => {
            const m = d.mudancas.find((x) => String(x.varianteId) === String(v.varianteId));
            return { varianteId: String(v.varianteId), de: v.estoque, para: m ? m.para : v.estoque };
          })
        : [{ varianteId: String(naLoja.varianteId), de: naLoja.estoque, para: Math.max(0, l.casa) }];

      if (cautela) {
        const anterior = lerEnviado(filaPorSku.get(sku).enviado_json);
        const suspeita = alvos.find((a) => anterior.has(a.varianteId)
          && a.de < anterior.get(a.varianteId) && a.para > a.de);
        if (suspeita) {
          /* A loja tem menos do que mandamos da última vez, e nós temos mais
             do que ela: pode ser venda do site que ainda não entrou aqui.
             Empurrar agora devolveria a peça à venda. Fica para o cron, que
             puxa os pedidos antes de empurrar. */
          stmts.push(db.prepare('UPDATE nuvemshop_fila SET travado_ate = NULL WHERE sku = ?').bind(sku));
          relato.adiados++;
          relato.resultados.push({ sku, status: 'adiado', motivo: 'loja_abaixo_do_ultimo_envio' });
          continue;
        }
      }

      estadoLoja.set(sku, alvos);
      if (!d.mudancas.length) {
        concluir(sku, {
          status: 'sincronizado', enviado: alvos, resultado: { igual: true },
          publico: { status: 'sincronizado', igual: true },
        });
        relato.iguais++;
        relato.sincronizados++;
        continue;
      }
      for (const m of d.mudancas) mudancas.push({ sku, m });
      paraEnviar.set(sku, alvos);
    }

    /* ---- freio do caminho em lote ---- */
    if (emLote && mudancas.length && !forcar) {
      const limiteMud = await config(db, 'syncLimiteMudancas', 40);
      const limiteZerar = await config(db, 'syncLimiteZerar', 15);
      const skusMudando = new Set(mudancas.map((x) => x.sku));
      const zerando = mudancas.filter((x) => x.m.zera).length;
      if (skusMudando.size > limiteMud || zerando > limiteZerar) {
        relato.freio = {
          motivo: zerando > limiteZerar
            ? `O envio zeraria ${zerando} variantes na loja (o limite é ${limiteZerar}).`
            : `O envio mudaria ${skusMudando.size} produtos (o limite é ${limiteMud}).`,
          mudancas: skusMudando.size, zerando, em: agoraISO(),
        };
        /* Ninguém sai da fila: os códigos voltam a pendente e esperam
           "Sincronizar pendências" (que confirma) — o cron nunca força. */
        for (const sku of skusMudando) {
          stmts.push(db.prepare('UPDATE nuvemshop_fila SET travado_ate = NULL WHERE sku = ?').bind(sku));
        }
        stmts.push(gravarConfigStmt(db, 'nuvemshopFreio', relato.freio));
        mudancas.length = 0;
        paraEnviar.clear();
      }
    }

    /* ---- a escrita: saldo absoluto, agrupado por produto ---- */
    const porProduto = new Map();
    for (const { sku, m } of mudancas) {
      const pid = m.produtoId;
      if (pid == null || m.varianteId == null) {
        concluir(sku, { status: 'revisao', erro: 'A mudança não diz qual variante da loja ela endereça. Nada foi escrito.', publico: { status: 'revisao' } });
        relato.revisao++;
        paraEnviar.delete(sku);
        continue;
      }
      if (!porProduto.has(String(pid))) porProduto.set(String(pid), { id: pid, variants: [], skus: new Set() });
      const p = porProduto.get(String(pid));
      const variante = { id: m.varianteId };
      if (m.locais && m.locais.length) variante.inventory_levels = [{ location_id: m.locais[0], stock: m.para }];
      else variante.stock = m.para;
      p.variants.push(variante);
      p.skus.add(sku);
    }

    const lotes = [...porProduto.values()];
    const falhou = new Map();   // sku -> erro
    for (let i = 0; i < lotes.length; i += 25) {
      const lote = lotes.slice(i, i + 25);
      try {
        await loja.atualizarEstoque(lote.map(({ id, variants }) => ({ id, variants })));
        relato.chamadasLoja++;
        relato.enviados += lote.reduce((s, p) => s + p.variants.length, 0);
      } catch (e) {
        relato.chamadasLoja++;
        for (const p of lote) for (const sku of p.skus) falhou.set(sku, e);
      }
    }

    for (const [sku, alvos] of paraEnviar) {
      if (falhou.has(sku)) {
        const r = filaPorSku.get(sku);
        const tentativas = Number(r.tentativas || 0) + 1;
        const desistiu = tentativas >= MAX_TENTATIVAS;
        concluir(sku, {
          status: 'erro', erro: erroLegivel(falhou.get(sku)), tentativas,
          proxima: desistiu ? null : new Date(Date.now() + esperaDe(tentativas)).toISOString(),
          publico: { status: 'erro' },
        });
        relato.erros++;
        continue;
      }
      concluir(sku, {
        status: 'sincronizado', enviado: alvos,
        resultado: { de: alvos.reduce((s, a) => s + a.de, 0), para: alvos.reduce((s, a) => s + a.para, 0) },
        publico: { status: 'sincronizado', de: alvos.reduce((s, a) => s + a.de, 0), para: alvos.reduce((s, a) => s + a.para, 0) },
      });
      relato.sincronizados++;
    }

    /* O retrato do que a loja tem agora, para a tela não acusar diferença
       que acabou de ser corrigida. Só os códigos desta rodada. */
    for (const [sku, alvos] of estadoLoja) {
      if (falhou.has(sku)) continue;
      const total = alvos.reduce((s, a) => s + a.para, 0);
      stmts.push(db.prepare('UPDATE produtos SET estoque_loja = ? WHERE sku = ?').bind(total, sku));
      for (const a of alvos) {
        stmts.push(db.prepare('UPDATE loja_variantes SET estoque = ? WHERE variante_id = ?').bind(a.para, a.varianteId));
        stmts.push(db.prepare('UPDATE produto_variacoes SET estoque_loja = ? WHERE variante_id = ?').bind(a.para, a.varianteId));
      }
    }
  } catch (e) {
    /* Falha de leitura da loja (ou qualquer outra antes da escrita): todos os
       códigos reservados e ainda sem desfecho voltam com nova tentativa. */
    const msg = erroLegivel(e);
    relato.motivo = msg;
    const decididos = new Set(relato.resultados.map((r) => r.sku));
    for (const [sku, r] of filaPorSku) {
      if (decididos.has(sku)) continue;
      const tentativas = Number(r.tentativas || 0) + 1;
      const desistiu = tentativas >= MAX_TENTATIVAS;
      concluir(sku, {
        status: 'erro', erro: msg, tentativas,
        proxima: desistiu ? null : new Date(Date.now() + esperaDe(tentativas)).toISOString(),
        publico: { status: 'erro' },
      });
      relato.erros++;
    }
  }

  stmts.push(gravarConfigStmt(db, 'nuvemshopUltimaRodada', resumoDaRodada(relato)));
  if (atencao) stmts.push(gravarConfigStmt(db, 'nuvemshopPedidosAtencao', atencao));
  if (relato.sincronizados > 0 && !relato.freio) {
    stmts.push(db.prepare(`DELETE FROM config WHERE chave = 'nuvemshopFreio'`));
  }
  if (stmts.length) {
    for (let i = 0; i < stmts.length; i += 400) await db.batch(stmts.slice(i, i + 400));
  }
  /* Depois do batch, porque ela lê o desfecho que ele acabou de gravar. */
  if (relato.sincronizados > 0) {
    const reg = await regularizarVendasStmt(db).run();
    relato.vendasRegularizadas = Number(reg && reg.meta && reg.meta.changes || 0);
  }
  relato.ms = Date.now() - inicio;
  if (contador) relato.chamadasD1 = chamadasD1(contador);
  return relato;
}

function lerEnviado(json) {
  const m = new Map();
  try { for (const a of JSON.parse(json || '[]')) m.set(String(a.varianteId), Number(a.para)); } catch { /* vazio */ }
  return m;
}

/** O desfecho de um código. `versao` decide: se o código mudou de novo
 *  enquanto esta rodada trabalhava, ele NÃO vira sincronizado — continua
 *  pendente, e a próxima rodada manda o saldo novo. O arrendamento é
 *  devolvido nos dois casos. */
function marcar(db, sku, reservado, c) {
  const agora = agoraISO();
  const versao = Number(reservado && reservado.versao);
  const stmts = [];
  if (c.status === 'sincronizado') {
    stmts.push(db.prepare(
      `UPDATE nuvemshop_fila SET status = 'sincronizado', sincronizado_em = ?, enviado_json = ?,
              resultado_json = ?, ultimo_erro = NULL, tentativas = 0, proxima_em = NULL
        WHERE sku = ? AND versao = ?`,
    ).bind(agora, JSON.stringify(c.enviado || []), JSON.stringify(c.resultado || null), sku, versao));
  } else if (c.status === 'erro') {
    stmts.push(db.prepare(
      `UPDATE nuvemshop_fila SET status = 'erro', ultimo_erro = ?, tentativas = ?, proxima_em = ?
        WHERE sku = ? AND versao = ?`,
    ).bind(c.erro || null, c.tentativas || 1, c.proxima || null, sku, versao));
    /* Mudou de novo durante a rodada: a falha vale para o saldo VELHO; o
       novo continua pendente, mas a tentativa conta. */
    stmts.push(db.prepare(
      `UPDATE nuvemshop_fila SET ultimo_erro = ?, proxima_em = ?
        WHERE sku = ? AND versao <> ?`,
    ).bind(c.erro || null, c.proxima || null, sku, versao));
  } else {
    stmts.push(db.prepare(
      `UPDATE nuvemshop_fila SET status = ?, ultimo_erro = ?, resultado_json = ?, tentativas = 0, proxima_em = NULL
        WHERE sku = ? AND versao = ?`,
    ).bind(c.status, c.erro || null, JSON.stringify(c.resultado || null), sku, versao));
  }
  stmts.push(db.prepare('UPDATE nuvemshop_fila SET travado_ate = NULL WHERE sku = ?').bind(sku));
  return stmts;
}

/** Vendas daqui que esperavam a loja e cujos códigos já estão todos
 *  sincronizados (ou não têm anúncio) passam a `sincronizada`. Lê só as
 *  vendas que estão esperando — nunca a tabela inteira. */
function regularizarVendasStmt(db) {
  return db.prepare(
    `UPDATE vendas SET nuvemshop_status = 'sincronizada', nuvemshop_erro = NULL, nuvemshop_em = ?
      WHERE cancelada = 0 AND origem <> 'site'
        AND nuvemshop_status IN ('nao_enviada','pendente','sincronizando','erro','revisao')
        AND EXISTS (SELECT 1 FROM movimentos mv WHERE mv.venda_id = vendas.id
                    UNION SELECT 1 FROM venda_itens vi WHERE vi.venda_id = vendas.id)
        AND NOT EXISTS (
          SELECT 1 FROM (SELECT sku FROM venda_itens WHERE venda_id = vendas.id
                         UNION SELECT sku FROM movimentos WHERE venda_id = vendas.id) x
            LEFT JOIN nuvemshop_fila f ON f.sku = x.sku
           WHERE f.sku IS NULL OR f.status NOT IN ('sincronizado','ignorado'))`,
  ).bind(agoraISO());
}

function resumoDaRodada(r) {
  return {
    em: r.em, origem: r.origem, modo: r.modo, ms: r.ms ?? null,
    processados: r.processados, sincronizados: r.sincronizados, iguais: r.iguais,
    enviados: r.enviados, erros: r.erros, revisao: r.revisao, semAnuncio: r.semAnuncio,
    adiados: r.adiados, chamadasLoja: r.chamadasLoja, freio: r.freio,
    vendasRegularizadas: r.vendasRegularizadas || 0,
    pedidos: r.pedidos, motivo: r.motivo,
  };
}

/* ======================================================================== */
/* 4. OS CAMINHOS QUE CHAMAM A FILA                                          */
/* ======================================================================== */

/** Depois de uma operação que mudou estoque NA REQUISIÇÃO: só os códigos
 *  dela, sem puxar pedidos, com cautela. Nunca lança: a operação local já
 *  está gravada, e o que não der fica para o cron. */
export async function sincronizarCodigos(db, env, skus, {
  origem = 'operacao', contador = null, reenfileirar = false,
} = {}) {
  try {
    if (contador && chamadasD1(contador) > TETO_CONSULTAS_NA_REQUISICAO) {
      return { status: 'pendente', motivo: 'Fica para a próxima rodada automática (requisição já pesada no D1).' };
    }
    const lista = [...new Set((skus || []).filter(Boolean).map(String))];
    if (!lista.length) return { status: 'nao_aplicavel' };
    /* Pedido explícito ("tentar de novo" de uma venda): o código volta a
       pendente agora, sem esperar o fim da espera de uma falha anterior. */
    if (reenfileirar && await temFila(db)) {
      await db.batch(lista.map((s) => enfileirarStmt(db, s, origem)));
    }
    const r = await processarFila(db, env, { skus: lista, cautela: true, origem, contador });
    return {
      ...statusDosCodigos(r, lista), relato: resumoDaRodada(r),
      vendasRegularizadas: r.vendasRegularizadas || 0,
    };
  } catch (e) {
    return { status: 'pendente', erro: erroLegivel(e) };
  }
}

function statusDosCodigos(r, lista) {
  if (r.desligado) return { status: 'pendente', motivo: r.motivo };
  if (r.motivo && !r.processados) return { status: 'pendente', motivo: r.motivo };
  const st = new Map(r.resultados.map((x) => [x.sku, x.status]));
  const todos = lista.map((s) => st.get(s));
  if (todos.some((s) => s === 'erro')) return { status: 'erro', erro: r.motivo || 'A Nuvemshop não aceitou o envio; nova tentativa marcada.' };
  if (todos.some((s) => s === 'revisao')) return { status: 'revisao' };
  if (todos.every((s) => s === 'sincronizado' || s === 'ignorado' || s === 'sem_anuncio')) return { status: 'sincronizada' };
  return { status: 'pendente' };
}

/** O cron. Puxa pedidos, processa a fila, e uma vez por dia confere a loja
 *  inteira (sem escrever nada fora da fila). Pedidos administrativos feitos
 *  pela tela ou pelo banco (`config.nuvemshopPedidoAdmin`) entram aqui. */
export async function executarCron(db, env, { cron = '' } = {}) {
  const saida = { cron };
  if (!(await temFila(db))) return { ...saida, motivo: 'sem_migracao' };
  const pedido = await config(db, 'nuvemshopPedidoAdmin', null);
  if (pedido) {
    await db.prepare(`DELETE FROM config WHERE chave = 'nuvemshopPedidoAdmin'`).run();
    /* Uma ação por invocação: conferir (lê a loja inteira) e reconciliar
       (lê de novo e escreve) juntos passariam perto do teto de 50 chamadas
       ao D1 do plano Free. Reconciliar usa a ÚLTIMA conferência gravada. */
    if (pedido.acao === 'conferir') {
      saida.conferencia = resumoConferencia(await conferirLoja(db, env, { gravarEspelho: true }));
      await db.batch([gravarConfigStmt(db, 'nuvemshopCronEm', agoraISO())]);
      return saida;
    }
    if (pedido.acao === 'reconciliar') {
      saida.reconciliacao = await reconciliarDivergencias(db, env, { forcar: true, origem: 'cron-admin' });
      await db.batch([gravarConfigStmt(db, 'nuvemshopCronEm', agoraISO())]);
      return saida;
    }
  }
  const diario = /^0 9 \* \* \*$/.test(String(cron).trim());
  saida.fila = resumoDaRodada(await processarFila(db, env, { puxar: true, origem: 'cron' }));
  if (diario) {
    const c = await conferirLoja(db, env, { gravarEspelho: true });
    saida.conferencia = resumoConferencia(c);
    /* Auto-cura diária, COM freio: divergência pequena volta para a fila;
       divergência em massa fica anunciada e espera gente. */
    if (c.ok && await syncAtivo(db)) {
      const div = c.linhas.filter((x) => x.status === 'divergente');
      const skusDiv = [...new Set(div.map((x) => x.sku))];
      const limiteMud = await config(db, 'syncLimiteMudancas', 40);
      if (skusDiv.length && skusDiv.length <= limiteMud) {
        await db.batch(skusDiv.map((s) => enfileirarStmt(db, s, 'conferencia_diaria')));
        saida.autoCura = skusDiv.length;
      } else if (skusDiv.length) {
        saida.autoCura = 0;
        await db.batch([gravarConfigStmt(db, 'nuvemshopFreio', {
          motivo: `A conferência diária achou ${skusDiv.length} códigos divergentes (o limite automático é ${limiteMud}). Revise e reconcilie pela tela.`,
          mudancas: skusDiv.length, zerando: null, em: agoraISO(),
        })]);
      }
    }
  }
  await db.batch([gravarConfigStmt(db, 'nuvemshopCronEm', agoraISO())]);
  return saida;
}

/** Depois de qualquer requisição que escreveu: se ela pôs código na fila, o
 *  envio sai logo, em segundo plano (`ctx.waitUntil`). Duas consultas quando
 *  não há nada a fazer. */
export async function processarAposRequisicao(db, env, inicioIso, contador = null) {
  try {
    if (contador && chamadasD1(contador) > TETO_CONSULTAS_NA_REQUISICAO) return null;
    if (!(await temFila(db))) return null;
    const r = await db.prepare(
      `SELECT sku FROM nuvemshop_fila
        WHERE status = 'pendente' AND pedido_em >= ? AND (travado_ate IS NULL OR travado_ate < ?)
        LIMIT ?`,
    ).bind(inicioIso, agoraISO(), LIMITE_INCREMENTAL).all();
    const skus = (r.results || []).map((x) => x.sku);
    if (!skus.length) return null;
    return await processarFila(db, env, { skus, cautela: true, origem: 'requisicao', contador });
  } catch (e) {
    console.error('[nuvemshop-fila] após requisição:', erroLegivel(e));
    return null;
  }
}

/* ======================================================================== */
/* 5. CONFERÊNCIA (leitura) E RECONCILIAÇÃO (escrita pela fila)             */
/* ======================================================================== */

const texto = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return String(v.pt || v.pt_BR || Object.values(v)[0] || '');
};
const semHtml = (s) => texto(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Compara a loja inteira com o Marquesa, variante por variante, e grava o
 *  retrato em `nuvemshop_conferencia`. NÃO escreve na loja. Também anota,
 *  por produto, o conteúdo que a loja tem (descrição, SEO, imagens) — é o
 *  que a Preparação para Nuvemshop usa para dizer "falta SEO" sem adivinhar.
 *
 *  `gravarEspelho` atualiza também `produtos.produto_id_loja`/`url_loja`/
 *  `estoque_loja` e `loja_variantes` — o mapeamento que o caminho
 *  incremental usa para saber qual produto ler. */
export async function conferirLoja(db, env, { gravar = true, gravarEspelho = false } = {}) {
  const loja = new Nuvemshop(env);
  if (!loja.configurada()) return { ok: false, erro: 'A loja não está conectada.' };
  const produtosLoja = await loja.produtos();
  const { mapa, duplicados } = mapearSkus(produtosLoja);
  const variantes = catalogoDeVariantes(produtosLoja);
  const conteudo = new Map(produtosLoja.map((p) => [String(p.id), {
    descricao: semHtml(p.description).length > 0,
    seoTitulo: texto(p.seo_title).trim().length > 0,
    seoDescricao: texto(p.seo_description).trim().length > 0,
    imagens: Array.isArray(p.images) ? p.images.length : 0,
    publicado: p.published == null ? null : !!p.published,
  }]));

  const locais = await lerLocais(db, null);
  const saldos = await saldosDeVariacao(db);
  const fila = new Map();
  try {
    for (const r of (await db.prepare(
      `SELECT sku, status, ultimo_erro FROM nuvemshop_fila WHERE status IN ('erro','revisao','pendente')`).all()).results || []) {
      fila.set(String(r.sku), r);
    }
  } catch { /* sem fila */ }

  const em = agoraISO();
  const linhas = [];
  const normLocais = new Map([...locais.values()].map((l) => [normSku(l.sku), l]));
  const dup = new Set(duplicados);
  const linha = (o) => linhas.push({
    sku: null, produto: null, variante: null, nsProdutoId: null, nsVarianteId: null, nsSku: null,
    emCasa: null, consignado: null, online: null, nsEstoque: null, diferenca: null,
    status: 'ok', motivo: null, publicado: null, ...o,
  });

  /* Variantes da loja sem SKU, ou com SKU que não conhecemos. */
  for (const v of variantes) {
    const n = normSku(v.sku);
    const c = conteudo.get(String(v.produtoId)) || {};
    if (!n) {
      linha({
        produto: v.produtoNome, variante: v.nome || null, nsProdutoId: String(v.produtoId),
        nsVarianteId: String(v.varianteId), nsEstoque: v.estoque, status: 'sem_sku',
        motivo: 'Variante sem SKU na Nuvemshop: não dá para endereçar estoque.', publicado: c.publicado ?? null,
      });
      continue;
    }
    if (!normLocais.has(n)) {
      linha({
        sku: v.sku, produto: v.produtoNome, variante: v.nome || null, nsProdutoId: String(v.produtoId),
        nsVarianteId: String(v.varianteId), nsSku: v.sku, nsEstoque: v.estoque, status: 'so_nuvemshop',
        motivo: 'SKU existe na loja e não existe no catálogo do Marquesa (ou está inativo): não é tocado.',
        publicado: c.publicado ?? null,
      });
    }
  }

  for (const l of locais.values()) {
    if (!l.ativo) continue;
    const n = normSku(l.sku);
    const naLoja = mapa.get(n);
    const consignado = Math.max(0, l.qtd - l.casa);
    const base = { sku: l.sku, produto: l.desc, emCasa: l.casa, consignado };
    if (!naLoja) {
      if (l.produtoIdLoja) {
        linha({ ...base, nsProdutoId: l.produtoIdLoja, online: Math.max(0, l.casa), status: 'sem_mapeamento',
          motivo: 'O Marquesa guardava um anúncio para este código, mas ele não apareceu na leitura da loja.' });
      } else if (l.casa > 0) {
        linha({ ...base, online: Math.max(0, l.casa), status: 'aguardando_preparacao',
          motivo: 'Tem peça em casa e ainda não tem anúncio: Preparação para Nuvemshop.' });
      } else if (l.qtd > 0) {
        linha({ ...base, online: 0, status: 'so_sistema', motivo: 'Só existe no Marquesa (peças em maleta, nenhuma em casa).' });
      }
      continue;
    }
    const c = conteudo.get(String(naLoja.produtoId)) || {};
    if (dup.has(n)) {
      for (const v of naLoja.variantes) {
        linha({ ...base, variante: v.nome || null, nsProdutoId: String(v.produtoId), nsVarianteId: String(v.varianteId),
          nsSku: v.sku, nsEstoque: v.estoque, status: 'sku_duplicado',
          motivo: 'O mesmo SKU está em mais de um produto da loja. Corrigir o cadastro na Nuvemshop.', publicado: c.publicado ?? null });
      }
      continue;
    }
    const d = decidirEstoqueDoSku(l, naLoja, saldos);
    const naFila = fila.get(l.sku);
    if (d.semEmpurrar) {
      const status = d.semEmpurrar.motivo === 'sku_ausente' ? 'sem_sku' : 'variante_sem_mapeamento';
      for (const v of naLoja.variantes) {
        linha({ ...base, variante: v.nome || null, nsProdutoId: String(v.produtoId), nsVarianteId: String(v.varianteId),
          nsSku: v.sku, nsEstoque: v.estoque, status,
          motivo: `${d.semEmpurrar.explicacao || d.semEmpurrar.motivo} (${d.semEmpurrar.motivo})`, publicado: c.publicado ?? null });
      }
      continue;
    }
    const porVid = new Map(d.mudancas.map((m) => [String(m.varianteId), m]));
    const vars = naLoja.variantes.length > 1 ? naLoja.variantes
      : [{ ...naLoja.variantes[0], varianteId: naLoja.varianteId, produtoId: naLoja.produtoId, estoque: naLoja.estoque }];
    for (const v of vars) {
      const m = porVid.get(String(v.varianteId));
      const online = m ? m.para : (naLoja.variantes.length > 1 ? v.estoque : Math.max(0, l.casa));
      const diferenca = online - v.estoque;
      let status = diferenca === 0 ? 'ok' : 'divergente';
      let motivo = null;
      if (naFila && naFila.status === 'erro') { status = 'erro_integracao'; motivo = naFila.ultimo_erro || 'Falha no último envio.'; }
      linha({ ...base, variante: v.nome || null, nsProdutoId: String(v.produtoId), nsVarianteId: String(v.varianteId),
        nsSku: v.sku, online, nsEstoque: v.estoque, diferenca, status, motivo, publicado: c.publicado ?? null });
    }
  }

  const resumo = { em, produtosNaLoja: produtosLoja.length, variantesNaLoja: variantes.length, porStatus: {} };
  for (const x of linhas) resumo.porStatus[x.status] = (resumo.porStatus[x.status] || 0) + 1;
  const mapeaveis = linhas.filter((x) => x.status === 'ok' || x.status === 'divergente' || x.status === 'erro_integracao');
  resumo.variantesMapeadas = mapeaveis.length;
  resumo.skusMapeados = new Set(mapeaveis.map((x) => x.sku)).size;
  resumo.iguais = linhas.filter((x) => x.status === 'ok').length;
  resumo.divergentes = linhas.filter((x) => x.status === 'divergente').length;

  if (gravar) {
    const stmts = [db.prepare('DELETE FROM nuvemshop_conferencia')];
    for (const x of linhas) {
      const c = x.nsProdutoId ? conteudo.get(String(x.nsProdutoId)) : null;
      stmts.push(db.prepare(
        `INSERT INTO nuvemshop_conferencia
           (sku, produto, variante, ns_produto_id, ns_variante_id, ns_sku, em_casa, consignado,
            online, ns_estoque, diferenca, status, motivo, publicado,
            ns_tem_descricao, ns_tem_seo_titulo, ns_tem_seo_descricao, ns_imagens, conferido_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        x.sku, x.produto, x.variante, x.nsProdutoId, x.nsVarianteId, x.nsSku,
        x.emCasa, x.consignado, x.online, x.nsEstoque, x.diferenca, x.status, x.motivo,
        x.publicado == null ? null : (x.publicado ? 1 : 0),
        c ? (c.descricao ? 1 : 0) : null, c ? (c.seoTitulo ? 1 : 0) : null,
        c ? (c.seoDescricao ? 1 : 0) : null, c ? c.imagens : null, em,
      ));
    }
    stmts.push(gravarConfigStmt(db, 'nuvemshopConferencia', resumo));
    if (gravarEspelho) {
      /* O mapeamento que o caminho incremental usa. Só as linhas que
         mudaram: reescrever 600 produtos por conferência seria escrita à toa. */
      const atuais = new Map(((await db.prepare(
        'SELECT sku, produto_id_loja, url_loja, visivel, nome_loja FROM produtos').all()).results || [])
        .map((p) => [normSku(p.sku), p]));
      for (const [n, e] of mapa) {
        const p = atuais.get(n);
        if (!p) continue;
        const pid = e.produtoId == null ? null : String(e.produtoId);
        const url = e.url || pid;
        const vis = e.visivel === null ? null : (e.visivel ? 1 : 0);
        if (String(p.produto_id_loja ?? '') === String(pid ?? '') && String(p.url_loja ?? '') === String(url ?? '')
          && String(p.visivel ?? '') === String(vis ?? '') && String(p.nome_loja ?? '') === String(e.nome || '')) continue;
        stmts.push(db.prepare(
          'UPDATE produtos SET produto_id_loja = ?, url_loja = ?, visivel = ?, nome_loja = ? WHERE sku = ?',
        ).bind(pid, url, vis, e.nome || null, p.sku));
      }
      for (const v of variantes) {
        stmts.push(db.prepare(
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
          JSON.stringify(v.valores || []), v.nome || null, v.estoque == null ? null : v.estoque,
          v.preco, v.promocional, v.imagemUrl, JSON.stringify(v.locais || []), v.produtoNome,
          v.produtoUrl, v.produtoVisivel == null ? null : (v.produtoVisivel ? 1 : 0), v.posicao, em));
      }
      /* Para o estoque_loja da tela: o que a loja tem agora, por código. */
      for (const [n, e] of mapa) {
        const p = atuais.get(n);
        if (p) stmts.push(db.prepare('UPDATE produtos SET estoque_loja = ? WHERE sku = ?').bind(e.estoque, p.sku));
      }
      if (variantes.length) stmts.push(db.prepare('DELETE FROM loja_variantes WHERE lido_em < ?').bind(em));
    }
    for (let i = 0; i < stmts.length; i += 400) await db.batch(stmts.slice(i, i + 400));
  }
  return { ok: true, resumo, linhas };
}

export function resumoConferencia(c) {
  if (!c || !c.ok) return c;
  return c.resumo;
}

/** "Reconciliar divergências": a última conferência diz quem diverge; cada
 *  um vai para a fila e é enviado com o saldo ABSOLUTO calculado na hora do
 *  envio (não o da conferência — entre uma e outra pode ter havido venda). */
export async function reconciliarDivergencias(db, env, { seco = false, forcar = true, origem = 'manual' } = {}) {
  const r = (await db.prepare(
    `SELECT DISTINCT sku FROM nuvemshop_conferencia WHERE status IN ('divergente','erro_integracao') AND sku IS NOT NULL`,
  ).all()).results || [];
  const skus = r.map((x) => String(x.sku));
  if (seco) return { ok: true, seco: true, codigos: skus.length, skus: skus.slice(0, 300) };
  if (!skus.length) return { ok: true, codigos: 0, rodadas: [] };
  for (let i = 0; i < skus.length; i += 200) {
    await db.batch(skus.slice(i, i + 200).map((s) => enfileirarStmt(db, s, 'reconciliacao')));
  }
  /* Em lote: um GET do catálogo e PATCH de 25 produtos por vez. */
  const rodada = await processarFila(db, env, { puxar: true, forcar, origem });
  return { ok: true, codigos: skus.length, rodada: resumoDaRodada(rodada) };
}

/** "Tentar novamente" de um código: volta para pendente, zera a contagem e
 *  manda agora. */
export async function tentarDeNovo(db, env, sku) {
  await db.batch([enfileirarStmt(db, sku, 'tentativa_manual')]);
  const r = await processarFila(db, env, { skus: [String(sku)], cautela: true, origem: 'manual' });
  return { ok: true, ...statusDosCodigos(r, [String(sku)]), relato: resumoDaRodada(r) };
}

/* ======================================================================== */
/* 6. O QUE A TELA MOSTRA                                                    */
/* ======================================================================== */

export async function resumoEstoqueOnline(db, env) {
  if (!(await temFila(db))) return { ok: true, migrado: false };
  const loja = new Nuvemshop(env);
  const contagens = {};
  for (const r of (await db.prepare(
    'SELECT status, COUNT(*) AS n FROM nuvemshop_fila GROUP BY status').all()).results || []) {
    contagens[r.status] = Number(r.n);
  }
  const ultima = await db.prepare('SELECT MAX(sincronizado_em) AS em FROM nuvemshop_fila').first();
  const problemas = ((await db.prepare(
    `SELECT f.sku, f.status, f.motivo, f.ultimo_erro, f.tentativas, f.proxima_em, f.ultima_tentativa_em,
            f.pedido_em, p.desc
       FROM nuvemshop_fila f LEFT JOIN produtos p ON p.sku = f.sku
      WHERE f.status IN ('erro','revisao','pendente')
      ORDER BY CASE f.status WHEN 'erro' THEN 0 WHEN 'revisao' THEN 1 ELSE 2 END, f.pedido_em
      LIMIT 200`).all()).results || []).map((r) => ({
    sku: r.sku, desc: r.desc || null, status: r.status, acao: r.motivo || null,
    erro: r.ultimo_erro || null, tentativas: Number(r.tentativas || 0),
    proximaEm: r.proxima_em || null, ultimaTentativaEm: r.ultima_tentativa_em || null,
    pedidoEm: r.pedido_em,
  }));
  const conferencia = await config(db, 'nuvemshopConferencia', null);
  let divergentes = [];
  let excecoes = [];
  try {
    divergentes = (await db.prepare(
      `SELECT sku, produto, variante, ns_variante_id, em_casa, consignado, online, ns_estoque, diferenca, status
         FROM nuvemshop_conferencia WHERE status IN ('divergente','erro_integracao')
        ORDER BY ABS(diferenca) DESC LIMIT 300`).all()).results || [];
    excecoes = (await db.prepare(
      `SELECT sku, produto, variante, ns_produto_id, ns_variante_id, ns_estoque, em_casa, status, motivo
         FROM nuvemshop_conferencia
        WHERE status IN ('sem_sku','sku_duplicado','sem_mapeamento','variante_sem_mapeamento','so_nuvemshop')
        ORDER BY status, sku LIMIT 300`).all()).results || [];
  } catch { /* sem conferência ainda */ }

  return {
    ok: true, migrado: true,
    conectada: loja.configurada(),
    escritaHabilitada: !!loja.escritaHabilitada,
    ativo: await syncAtivo(db),
    corteEm: await config(db, 'syncCorteEm', null),
    contagens,
    ultimaSincronizacaoEm: ultima && ultima.em ? ultima.em : null,
    ultimaRodada: await config(db, 'nuvemshopUltimaRodada', null),
    cronEm: await config(db, 'nuvemshopCronEm', null),
    freio: await config(db, 'nuvemshopFreio', null),
    pedidosAtencao: await config(db, 'nuvemshopPedidosAtencao', null),
    problemas, conferencia, divergentes, excecoes,
  };
}

export async function ligarSync(db, ativo) {
  await db.batch([gravarConfigStmt(db, CHAVE_ATIVO, !!ativo)]);
  return { ok: true, ativo: !!ativo };
}

/** Uso interno de teste: o SQL do "devido", para provar que o índice serve. */
export const _sql = { DEVIDO };
