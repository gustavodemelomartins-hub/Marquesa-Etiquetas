/** Compatibilidade da importação de pedidos do site.
 *
 * Vendas locais não criam mais pedidos na Nuvemshop (decisão operacional de
 * 2026-08-26). Este arquivo conserva somente o reconhecimento de pedidos
 * antigos que eventualmente tenham sido criados pelo sistema antes dessa
 * decisão, para que nunca voltem como uma segunda venda ao serem lidos.
 */

const agoraISO = () => new Date().toISOString();
const externo = id => `nuvemshop:${id}`;

async function marcar(db, id, status, erro = null, externoId = undefined) {
  const campos = ['nuvemshop_status = ?', 'nuvemshop_erro = ?', 'nuvemshop_em = ?'];
  const vals = [status, erro, agoraISO()];
  if (externoId !== undefined) { campos.push('externo_id = ?'); vals.push(externoId); }
  vals.push(id);
  await db.prepare(`UPDATE vendas SET ${campos.join(', ')} WHERE id = ?`).bind(...vals).run();
  return { status, erro, externoId };
}

/** Reconhece um pedido legado criado aqui antes da mudança para stock-only. */
export async function vincularPedidoCriadoAqui(db, pedido) {
  const id = Number(pedido && pedido.extra && pedido.extra.marquesa_venda_id);
  if (!Number.isInteger(id) || id <= 0) return false;
  const venda = await db.prepare(`SELECT id, nuvemshop_status FROM vendas WHERE id=? AND origem<>'site'`).bind(id).first();
  if (!venda) return false;
  if (venda.nuvemshop_status === 'estoque_divergente') {
    await db.prepare(`UPDATE vendas SET externo_id=?, nuvemshop_em=? WHERE id=?`)
      .bind(externo(pedido.id), agoraISO(), id).run();
    return true;
  }
  await marcar(db, id, pedido.status === 'cancelled' ? 'cancelada' : 'sincronizada', null, externo(pedido.id));
  return true;
}
