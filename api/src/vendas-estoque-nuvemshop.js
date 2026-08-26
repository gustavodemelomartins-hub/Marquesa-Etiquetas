import { sincronizarSomenteEstoque } from './sync.js';

const agoraISO = () => new Date().toISOString();

async function marcar(db, id, status, erro = null) {
  await db.prepare(`
    UPDATE vendas
       SET nuvemshop_status=?, nuvemshop_erro=?, nuvemshop_em=?
     WHERE id=?
  `).bind(status, erro, agoraISO(), id).run();
  return { status, erro };
}

async function regularizarPendentesSeguros(db, bloqueios) {
  const linhas = (await db.prepare(`
    SELECT v.id, vi.sku
      FROM vendas v
      LEFT JOIN venda_itens vi ON vi.venda_id = v.id
     WHERE v.origem <> 'site'
       AND v.cancelada = 0
       AND v.nuvemshop_status IN ('nao_enviada','pendente','sincronizando','erro','revisao')
     ORDER BY v.id
  `).all()).results || [];
  const porVenda = new Map();
  for (const linha of linhas) {
    if (!porVenda.has(linha.id)) porVenda.set(linha.id, new Set());
    if (linha.sku != null) porVenda.get(linha.id).add(String(linha.sku));
  }

  const porSku = new Map((bloqueios || []).map(i => [String(i.sku), i]));
  let sincronizadas = 0;
  for (const [id, skus] of porVenda) {
    const impedimentos = [...skus].map(sku => porSku.get(sku)).filter(Boolean);
    if (!impedimentos.length) {
      await marcar(db, id, 'sincronizada', null);
      sincronizadas++;
      continue;
    }
    const erro = impedimentos
      .map(i => `${i.sku}: ${i.explicacao || i.motivo}`)
      .join(' · ')
      .slice(0, 500);
    await marcar(db, id, 'revisao', erro);
  }
  return sincronizadas;
}

/** Publica o saldo físico atual depois de uma venda/acerto/cancelamento.
 *
 * A escrita é absoluta (`em casa` por variant_id), nunca "menos N". Isso
 * torna retry seguro: duas tentativas levam ao mesmo estoque. Nenhum pedido
 * é criado na Nuvemshop por este caminho.
 */
export async function atualizarEstoqueDaVenda(db, env, vendaId, { forcar = false } = {}) {
  const venda = await db.prepare(`SELECT * FROM vendas WHERE id=?`).bind(vendaId).first();
  if (!venda) return { status: 'erro', erro: 'Venda não encontrada.' };
  if (venda.origem === 'site') return { status: 'nao_aplicavel' };

  await marcar(db, vendaId, 'sincronizando', null);
  const resultado = await sincronizarSomenteEstoque(db, env, { forcar });

  if (!resultado.ok) {
    const erro = String(resultado.erro || 'Não foi possível atualizar o estoque na Nuvemshop.').slice(0, 500);
    await marcar(db, vendaId, 'erro', erro);
    return { status: 'erro', erro };
  }
  if (resultado.pausado) {
    const erro = String(resultado.pausado.motivo || 'A atualização parou no freio de segurança.').slice(0, 500);
    await marcar(db, vendaId, 'erro', erro);
    return { status: 'erro', erro, pausado: resultado.pausado };
  }

  const itens = (await db.prepare(`SELECT DISTINCT sku FROM venda_itens WHERE venda_id=?`).bind(vendaId).all()).results;
  const skus = new Set(itens.map(i => String(i.sku)));
  const bloqueios = (resultado.semEmpurrar || []).filter(i => skus.has(String(i.sku)));
  if (bloqueios.length) {
    const erro = bloqueios.map(i => `${i.sku}: ${i.explicacao || i.motivo}`).join(' · ').slice(0, 500);
    await marcar(db, vendaId, 'revisao', erro);
    return { status: 'revisao', erro, bloqueios };
  }

  const status = venda.cancelada ? 'cancelada_local' : 'sincronizada';
  let vendasRegularizadas = 0;
  if (venda.cancelada) await marcar(db, vendaId, status, null);
  else vendasRegularizadas = await regularizarPendentesSeguros(db, resultado.semEmpurrar);
  return {
    status,
    modo: 'somente_estoque',
    produtosAtualizados: Number(resultado.produtosEnviados || 0),
    alteracoes: (resultado.mudancas || []).length,
    vendasRegularizadas,
  };
}
