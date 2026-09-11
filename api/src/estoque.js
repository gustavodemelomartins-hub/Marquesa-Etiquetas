/** §19 — "Nunca alterar o saldo simplesmente digitando um novo número.
 *  O saldo deve resultar das movimentações."
 *
 *  Toda mudança de estoque passa por aqui. A função devolve os statements
 *  para o chamador executar em batch: grava o movimento E ajusta o saldo
 *  materializado na mesma transação, para os dois nunca se separarem.
 *
 *  Invariante que /api/estoque/conferir prova a qualquer momento:
 *      produtos.qtd == SUM(movimentos.qtd)   para todo SKU
 */

/** Efeito assinado no estoque TOTAL por tipo de movimento.
 *  Consignação e devolução de maleta valem 0: a peça continua sendo da
 *  Marquesa, só mudou de lugar (§5.3 — "consignação não é venda"). */
const EFEITO = {
  entrada: +1,
  ajuste: 0,          // o sinal vem no próprio valor informado
  consignacao: 0,
  devolucao: 0,
  venda: -1,
  perda: -1,
  quebra: -1,
  dano: -1,
  furto: -1,
  brinde: -1,
  sorteio: -1,
  /* §30: retirada pessoal. Sai do estoque exatamente como um brinde sai —
     o que muda não é o efeito, é o que a saída SIGNIFICA: ela não é venda,
     não tem cliente e não entra em faturamento nenhum. Existe como tipo
     próprio para a movimentação da peça dizer por que ela saiu. */
  uso_proprio: -1,
  troca: -1,
  nota_credito: -1,
  venda_conjunto: -1,
  cancelamento: 0,    // idem ajuste: sinal explícito
};

/** Os tipos que representam saída SEM faturamento (§30). Nenhum deles é
 *  venda; nenhum deles pode aparecer numa soma de dinheiro. Está aqui, e
 *  não espalhado em cada consulta, para a lista ter um dono só. */
export const TIPOS_SEM_FATURAMENTO = new Set(['brinde', 'uso_proprio', 'perda', 'sorteio']);

export function efeitoDe(tipo, quantidade) {
  const sinal = EFEITO[tipo];
  if (sinal === undefined) throw new Error(`Tipo de movimento desconhecido: ${tipo}`);
  if (tipo === 'ajuste' || tipo === 'cancelamento') return quantidade; // já vem assinado
  return sinal * Math.abs(quantidade);
}

/** Monta os statements de um movimento. Não executa — quem chama junta
 *  tudo num db.batch() para a gravação ser atômica. */
export function movimentar(db, { sku, tipo, quantidade, origem, maletaId, revendedoraId, vendaId, obs, variacao, varianteId, reconciliacaoItemId }) {
  const efeito = efeitoDe(tipo, quantidade);
  const stmts = [
    db.prepare(
      /* `variante_id` anda ao lado de `variacao`, não no lugar dela: o NOME
         continua sendo o que fecha a invariante e o que a tela mostra; o id
         é o que casa com a caixinha da loja quando a loja renomeia o valor.
         Quem não sabe o id grava NULL, e NULL aqui significa exatamente
         "não sei" — a sincronização lê isso como motivo para NÃO escrever
         naquele código, nunca como permissão para escolher uma variante. */
      `INSERT INTO movimentos (sku, variacao, variante_id, tipo, qtd, origem, maleta_id, revendedora_id, venda_id, obs, reconciliacao_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(sku, variacao || null, varianteId == null || varianteId === '' ? null : String(varianteId), tipo, efeito, origem || null, maletaId || null, revendedoraId || null, vendaId || null, obs || null, reconciliacaoItemId || null),
  ];
  if (efeito !== 0) {
    stmts.push(db.prepare(
      `UPDATE produtos SET qtd = qtd + ?, atualizado_em = datetime('now') WHERE sku = ?`
    ).bind(efeito, sku));
  }
  return stmts;
}

/** Quanto de um SKU está em maletas que ainda não encerraram.
 *  "Cancelada" e "encerrada" não contam — a peça voltou ou nunca saiu. */
export async function consignadoDoSku(db, sku) {
  const r = await db.prepare(
    `SELECT COALESCE(SUM(mi.qtd - mi.devolvida), 0) AS fora
       FROM maleta_itens mi
       JOIN maletas m ON m.id = mi.maleta_id
      WHERE mi.sku = ? AND m.status IN ('aberta', 'em_acerto')`
  ).bind(sku).first();
  return r.fora;
}

/** total, consignado e disponível de um SKU — os três saldos do §5.2.
 *  Kit passa por aqui igual a qualquer produto: quem chama não precisa
 *  saber que é um kit, só ler o `disponivel` que volta. */
export async function saldosDoSku(db, sku) {
  const p = await db.prepare(`SELECT sku, desc, preco, qtd FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return null;
  const montagem = await saldosDaConfiguracao(db, sku, p);
  if (montagem) return montagem;
  const kit = await saldosDoKit(db, sku, p);
  if (kit) return kit;
  const consignado = await consignadoDoSku(db, sku);
  return { ...p, consignado, disponivel: p.qtd - consignado };
}

/** Os dois jeitos de um SKU não ter saldo próprio: kit e configuração
 *  montável. Existe como função porque três lugares precisam recusar os
 *  dois — maleta, troca de garantia e inventário —, e três cópias da
 *  condição viram duas cópias na primeira vez que alguém esquecer uma. */
export const semSaldoProprio = (s) => !!(s && (s.componentes || s.montagem));

/** ----------------------------------------------- configurações montáveis
 *  §42 — Monte seu Colar. Uma configuração comercial (o "Colar Casal") é
 *  identidade de venda, não peça: ela tem SKU, nome, preço e foto, e NÃO
 *  tem saldo físico próprio. Contá-la como estoque somaria uma segunda vez
 *  as mesmas venezianas e pingentes que já estão contados.
 *
 *  A diferença para um kit é a composição: o kit nomeia SKUs fixos, e a
 *  configuração declara SLOTS TIPADOS — "duas peças do grupo Menino" —,
 *  preenchidos na venda com as cores que existirem.
 *
 *      disponível(configuração) = min(
 *          disponível(veneziana),
 *          para cada grupo G com k slots:  floor( Σ disponível(G) / k )
 *      )
 *
 *  A soma dentro do grupo, e não o mínimo, porque repetir a mesma cor é
 *  permitido (decisão de 2026-09-10): dois pingentes azuis montam um "Dois
 *  Meninos" tanto quanto um azul e um verde.
 */
export async function configuracaoDoSku(db, sku) {
  /* Sem filtrar por `ativo`: uma configuração desativada continua sendo
     configuração. Filtrar aqui faria o SKU voltar a ser lido como produto
     comum e o saldo legado dele virar estoque vendável — exatamente a dupla
     contagem que este caminho existe para impedir. */
  const m = await db.prepare(
    `SELECT id, slug, nome, base_sku_padrao, preco_sugerido, ativo
       FROM personalizacao_modelos
      WHERE sku_comercial = ? LIMIT 1`
  ).bind(sku).first();
  if (!m) return null;
  const slots = (await db.prepare(
    `SELECT grupo, qtd, ordem FROM personalizacao_slots WHERE modelo_id = ? ORDER BY ordem, grupo`
  ).bind(m.id).all()).results || [];
  const opcoes = (await db.prepare(
    `SELECT componente_sku, grupo FROM personalizacao_opcoes
      WHERE modelo_id = ? AND ativo = 1 ORDER BY ordem, id`
  ).bind(m.id).all()).results || [];
  return {
    id: Number(m.id), slug: m.slug, nome: m.nome,
    ativo: !!m.ativo,
    skuComercial: sku,
    baseSku: m.base_sku_padrao,
    preco: m.preco_sugerido == null ? null : Number(m.preco_sugerido),
    slots: slots.map((s) => ({ grupo: s.grupo, qtd: Number(s.qtd), ordem: Number(s.ordem) })),
    opcoes: opcoes.map((o) => ({ componenteSku: o.componente_sku, grupo: o.grupo })),
  };
}

/** Quantas montagens os componentes sustentam. `disponivelDe` existe para o
 *  chamador poder descontar o que OUTRAS linhas do mesmo carrinho já
 *  reservaram — validar contra o banco aprovaria as duas, porque o banco só
 *  muda no batch, lá no fim. */
export async function montagensPossiveis(db, cfg, disponivelDe = null) {
  const saldo = async (sku) => {
    const s = await saldosDoSku(db, sku);
    const bruto = s ? s.disponivel : 0;
    return disponivelDe ? disponivelDe(sku, bruto) : bruto;
  };
  /* Configuração sem base ou sem slots é cadastro pela metade. Zero é a
     resposta honesta: ela não pode ser montada, e devolver o saldo da base
     diria que dá para vender um colar sem pingente nenhum. */
  if (!cfg.baseSku || !cfg.slots.length) return 0;
  let limite = await saldo(cfg.baseSku);
  for (const slot of cfg.slots) {
    const elegiveis = cfg.opcoes.filter((o) => o.grupo === slot.grupo);
    let soma = 0;
    for (const o of elegiveis) soma += Math.max(0, await saldo(o.componenteSku));
    limite = Math.min(limite, Math.floor(soma / slot.qtd));
  }
  return Math.max(0, limite);
}

/** O saldo de uma configuração: `qtd` e `consignado` são SEMPRE 0, porque
 *  ela não é peça. `produtos.qtd` é deliberadamente ignorado — um saldo
 *  legado ali é resíduo a reconciliar, nunca estoque a vender. */
export async function saldosDaConfiguracao(db, sku, produto) {
  const cfg = await configuracaoDoSku(db, sku);
  if (!cfg) return null;
  return {
    sku, desc: produto.desc, preco: produto.preco,
    qtd: 0, consignado: 0,
    disponivel: cfg.ativo ? await montagensPossiveis(db, cfg) : 0,
    montagem: cfg,
  };
}

/** ------------------------------------------------------------------ kits
 *  Um kit é um SKU montado a partir de outros. Ele nunca tem saldo próprio:
 *  o disponível dele é sempre CALCULADO, nunca lido de produtos.qtd.
 *
 *  disponivel(kit) = mínimo, entre os componentes, de
 *                     floor(disponível do componente / qtd necessária)
 *
 *  É esse mínimo compartilhado que impede vender dois anúncios que usam a
 *  mesma peça física: se o componente comum acaba, os dois caem juntos.
 */

export async function componentesDoKit(db, kitSku) {
  const r = await db.prepare(
    `SELECT kc.componente_sku AS sku, kc.qtd, p.desc, p.preco
       FROM kit_componentes kc JOIN produtos p ON p.sku = kc.componente_sku
      WHERE kc.kit_sku = ?`
  ).bind(kitSku).all();
  return r.results;
}

export async function ehKit(db, sku) {
  const r = await db.prepare(`SELECT 1 FROM kit_componentes WHERE kit_sku = ? LIMIT 1`).bind(sku).first();
  return !!r;
}

/** total/consignado não fazem sentido para um kit — só o disponível, que é
 *  o que decide se dá para vender. Kit não vai para maleta (ver §28 do
 *  REGRAS.md), então não existe "consignado" dele. */
export async function saldosDoKit(db, sku, produto) {
  const componentes = await componentesDoKit(db, sku);
  if (!componentes.length) return null;
  let disponivel = Infinity;
  for (const c of componentes) {
    const sc = await saldosDoSku(db, c.sku);
    const dc = sc ? Math.floor(sc.disponivel / c.qtd) : 0;
    disponivel = Math.min(disponivel, dc);
  }
  return { sku, desc: produto.desc, preco: produto.preco, qtd: 0, consignado: 0, disponivel, componentes };
}

/** Kit vendido vira movimento nos COMPONENTES, não nele mesmo — ele não tem
 *  saldo para mexer. `obs` carrega o SKU do kit para o histórico do
 *  componente explicar de onde veio a baixa (§18). */
export async function movimentarKit(db, { kitSku, tipo, quantidade, origem, vendaId, obs }) {
  const componentes = await componentesDoKit(db, kitSku);
  const stmts = [];
  for (const c of componentes) {
    stmts.push(...movimentar(db, {
      sku: c.sku, tipo, quantidade: quantidade * c.qtd, origem: origem || 'kit',
      vendaId, obs: `${obs || ''} (kit ${kitSku})`.trim(),
    }));
  }
  return stmts;
}

/** §19 na prática: confere se o saldo materializado bate com a razão. */
export async function conferirEstoque(db) {
  const r = await db.prepare(
    `SELECT p.sku, p.qtd AS saldo, COALESCE(m.soma, 0) AS soma_movimentos
       FROM produtos p
       LEFT JOIN (SELECT sku, SUM(qtd) AS soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
      WHERE p.qtd <> COALESCE(m.soma, 0)`
  ).all();
  return r.results;
}
