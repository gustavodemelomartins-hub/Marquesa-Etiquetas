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
  troca: -1,
  nota_credito: -1,
  venda_conjunto: -1,
  cancelamento: 0,    // idem ajuste: sinal explícito
};

export function efeitoDe(tipo, quantidade) {
  const sinal = EFEITO[tipo];
  if (sinal === undefined) throw new Error(`Tipo de movimento desconhecido: ${tipo}`);
  if (tipo === 'ajuste' || tipo === 'cancelamento') return quantidade; // já vem assinado
  return sinal * Math.abs(quantidade);
}

/** Monta os statements de um movimento. Não executa — quem chama junta
 *  tudo num db.batch() para a gravação ser atômica. */
export function movimentar(db, { sku, tipo, quantidade, origem, maletaId, revendedoraId, vendaId, obs, variacao, reconciliacaoItemId }) {
  const efeito = efeitoDe(tipo, quantidade);
  const stmts = [
    db.prepare(
      `INSERT INTO movimentos (sku, variacao, tipo, qtd, origem, maleta_id, revendedora_id, venda_id, obs, reconciliacao_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(sku, variacao || null, tipo, efeito, origem || null, maletaId || null, revendedoraId || null, vendaId || null, obs || null, reconciliacaoItemId || null),
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
  const kit = await saldosDoKit(db, sku, p);
  if (kit) return kit;
  const consignado = await consignadoDoSku(db, sku);
  return { ...p, consignado, disponivel: p.qtd - consignado };
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
