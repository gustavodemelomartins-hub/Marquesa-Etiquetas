import { sincronizarCodigos } from './nuvemshop-estoque.js';

const agoraISO = () => new Date().toISOString();

async function marcar(db, id, status, erro = null) {
  await db.prepare(`
    UPDATE vendas
       SET nuvemshop_status=?, nuvemshop_erro=?, nuvemshop_em=?
     WHERE id=?
  `).bind(status, erro, agoraISO(), id).run();
  return { status, erro };
}

/** Publica o saldo físico atual dos códigos de uma venda/acerto/cancelamento.
 *
 * §61 — incremental. Até 08/10/2026 este caminho relia o catálogo inteiro
 * da loja e o daqui e empurrava TODOS os códigos; a soma das diferenças
 * antigas batia no freio e nenhuma venda chegava à loja. Agora ele manda só
 * os códigos que a venda tocou, pelo mesmo motor da fila
 * (`nuvemshop-estoque.js`), e a escrita continua absoluta (`em casa` por
 * variant_id), nunca "menos N": duas tentativas levam ao mesmo estoque.
 *
 * A venda já está gravada quando isto roda. Se a loja não responder, o
 * código fica na fila com a próxima tentativa marcada e a venda segue
 * válida — `status: 'pendente'` ou `'erro'` aqui nunca desfaz nada.
 */
export async function atualizarEstoqueDaVenda(db, env, vendaId) {
  const venda = await db.prepare(`SELECT id, origem, cancelada FROM vendas WHERE id=?`).bind(vendaId).first();
  if (!venda) return { status: 'erro', erro: 'Venda não encontrada.' };
  if (venda.origem === 'site') return { status: 'nao_aplicavel' };

  /* Em produto montado, `venda_itens` guarda o SKU comercial, enquanto os
     SKUs que realmente mudaram estão nos movimentos. A união preserva a
     venda comum e inclui base/componentes sem criar regra paralela. */
  const itens = (await db.prepare(`
    SELECT sku FROM venda_itens WHERE venda_id=?
    UNION
    SELECT sku FROM movimentos WHERE venda_id=?
  `).bind(vendaId, vendaId).all()).results || [];
  const skus = itens.map((i) => String(i.sku));

  const r = await sincronizarCodigos(db, env, skus, {
    origem: venda.cancelada ? 'cancelamento' : 'venda', reenfileirar: true,
  });
  const status = r.status === 'sincronizada' && venda.cancelada ? 'cancelada_local' : r.status;
  const gravavel = ['sincronizada', 'cancelada_local', 'pendente', 'erro', 'revisao'].includes(status)
    ? status : 'pendente';
  await marcar(db, vendaId, gravavel, r.erro || r.motivo || null);
  return {
    status: gravavel,
    modo: 'incremental',
    erro: r.erro || null,
    motivo: r.motivo || null,
    enviados: r.relato ? r.relato.enviados : 0,
    vendasRegularizadas: r.vendasRegularizadas || 0,
  };
}
