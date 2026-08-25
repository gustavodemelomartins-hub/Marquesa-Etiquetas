import { Nuvemshop } from './nuvemshop.js';

const agoraISO = () => new Date().toISOString();
const externo = id => `nuvemshop:${id}`;

function idDoExterno(valor) {
  const m = /^nuvemshop:(\d+)$/.exec(String(valor || ''));
  return m ? m[1] : null;
}

async function marcar(db, id, status, erro = null, externoId = undefined) {
  const campos = ['nuvemshop_status = ?', 'nuvemshop_erro = ?', 'nuvemshop_em = ?'];
  const vals = [status, erro, agoraISO()];
  if (externoId !== undefined) { campos.push('externo_id = ?'); vals.push(externoId); }
  vals.push(id);
  await db.prepare(`UPDATE vendas SET ${campos.join(', ')} WHERE id = ?`).bind(...vals).run();
  return { status, erro, externoId };
}

async function itensParaPedido(db, vendaId) {
  const itens = (await db.prepare(`
    SELECT vi.sku, vi.qtd, vi.preco, vi.motivo, vi.variante_id,
           lv.variante_id AS variante_salva, lv.locais_json
      FROM venda_itens vi
      LEFT JOIN loja_variantes lv ON lv.variante_id = vi.variante_id
     WHERE vi.venda_id = ? AND vi.motivo IN ('venda', 'vendida')
  `).bind(vendaId).all()).results;

  if (!itens.length) return { erro: 'Esta baixa não contém item vendido para registrar como pedido.' };

  const agrupados = new Map();
  const locais = new Set();
  for (const item of itens) {
    let varianteId = item.variante_id && item.variante_salva ? String(item.variante_id) : null;
    let localJson = item.locais_json;
    if (!varianteId) {
      const candidatos = (await db.prepare(
        `SELECT variante_id, locais_json FROM loja_variantes WHERE sku_norm = ? ORDER BY posicao`
      ).bind(item.sku).all()).results;
      if (!candidatos.length) {
        return { erro: `${item.sku} ainda não tem anúncio/variant_id conhecido na Nuvemshop.` };
      }
      if (candidatos.length > 1) {
        return { erro: `${item.sku} tem mais de uma variação. Escolha a variação vendida antes de reenviar.` };
      }
      varianteId = String(candidatos[0].variante_id);
      localJson = candidatos[0].locais_json;
    }

    let idsLocais = [];
    try { idsLocais = JSON.parse(localJson || '[]') || []; } catch { idsLocais = []; }
    for (const id of idsLocais) if (id) locais.add(String(id));

    const atual = agrupados.get(varianteId) || { variant_id: Number(varianteId), quantity: 0, price: +item.preco || 0 };
    atual.quantity += +item.qtd || 0;
    agrupados.set(varianteId, atual);
  }

  if (locais.size > 1) {
    return { erro: 'Os itens desta venda pertencem a locais de estoque diferentes na Nuvemshop; nada foi criado.' };
  }
  return { produtos: [...agrupados.values()], locationId: [...locais][0] || null };
}

async function pedidoJaCriado(loja, venda) {
  const desdeMs = Date.parse(venda.criada_em || agoraISO()) - 24 * 3600e3;
  const pedidos = await loja.pedidos(new Date(desdeMs).toISOString());
  return pedidos.find(p => String(p.extra && p.extra.marquesa_venda_id || '') === String(venda.id)) || null;
}

function naoReservadas(pedido) {
  return (pedido.products || []).reduce(
    (total, item) => total + Math.max(0, Number(item.issues && item.issues.unclaimed_stock) || 0), 0,
  );
}

async function registrarResultadoDoPedido(db, vendaId, pedido, { recuperado = false } = {}) {
  const faltaram = naoReservadas(pedido);
  if (faltaram > 0) {
    const erro = `O pedido foi criado, mas a Nuvemshop não conseguiu reservar ${faltaram} unidade(s) por falta de estoque. Revise a pendência; não será enviado novamente.`;
    await marcar(db, vendaId, 'estoque_divergente', erro, externo(pedido.id));
    return { status: 'estoque_divergente', erro, pedidoId: String(pedido.id), faltaram, recuperado };
  }
  await marcar(db, vendaId, 'sincronizada', null, externo(pedido.id));
  return { status: 'sincronizada', pedidoId: String(pedido.id), recuperado };
}

/**
 * Espelha uma venda local como pedido pago da Nuvemshop. Balcão usa
 * `inventory_behaviour: claim` para reservar/baixar as variantes; acerto usa
 * `bypass`, pois a unidade já saiu do online quando entrou na maleta.
 * O marcador em `extra` permite reencontrar o pedido depois de timeout, antes
 * de qualquer retry criar outro.
 */
export async function espelharVendaNaNuvemshop(db, env, vendaId, { loja = new Nuvemshop(env) } = {}) {
  const venda = await db.prepare(`SELECT * FROM vendas WHERE id = ?`).bind(vendaId).first();
  if (!venda) return { status: 'erro', erro: 'Venda não encontrada.' };
  if (venda.origem === 'site') return { status: 'nao_aplicavel' };
  if (venda.cancelada) return cancelarVendaNaNuvemshop(db, env, vendaId, { loja });

  const jaVinculado = idDoExterno(venda.externo_id);
  if (jaVinculado) {
    await marcar(db, vendaId, 'sincronizada', null, venda.externo_id);
    return { status: 'sincronizada', pedidoId: jaVinculado, recuperado: true };
  }

  // Uma chamada por vez. Se o Worker morrer durante o POST, o estado fica
  // retomável depois de cinco minutos e o marcador externo evita duplicata.
  const posse = await db.prepare(`
    UPDATE vendas SET nuvemshop_status='sincronizando', nuvemshop_em=?
     WHERE id=? AND (
       nuvemshop_status IN ('pendente','erro','nao_enviada') OR
       (nuvemshop_status='sincronizando' AND datetime(nuvemshop_em) < datetime('now','-5 minutes'))
     ) RETURNING id
  `).bind(agoraISO(), vendaId).first();
  if (!posse) {
    const atual = await db.prepare(`SELECT nuvemshop_status, nuvemshop_erro, externo_id FROM vendas WHERE id=?`).bind(vendaId).first();
    return { status: atual.nuvemshop_status, erro: atual.nuvemshop_erro, externoId: atual.externo_id };
  }

  try {
    const encontrado = await pedidoJaCriado(loja, venda);
    if (encontrado) {
      return registrarResultadoDoPedido(db, vendaId, encontrado, { recuperado: true });
    }

    const preparados = await itensParaPedido(db, vendaId);
    if (preparados.erro) {
      // Isto não é indisponibilidade temporária: falta uma decisão humana
      // (variant_id, anúncio ou local). Separar de `erro` impede o cron de
      // insistir para sempre ou, pior, escolher uma variação por aproximação.
      await marcar(db, vendaId, 'revisao', preparados.erro);
      return { status: 'revisao', erro: preparados.erro };
    }

    const nome = String(venda.cliente_nome || `Acerto da maleta ${venda.maleta_id || ''}`).trim() || 'Não informado';
    const endereco = {
      first_name: nome, last_name: '—', address: 'Não informado', number: 0,
      city: 'Não informado', province: 'Não informado', zipcode: '00000000', country: 'BR',
    };
    const corpo = {
      gateway: 'offline', payment_status: 'paid', status: 'open',
      // Balcão vende uma peça que estava disponível em casa: a loja precisa
      // reservar/baixar. Acerto vende uma peça que já estava fora do online
      // desde que entrou na maleta: o pedido registra a venda, mas `claim`
      // descontaria a mesma unidade duas vezes.
      inventory_behaviour: venda.origem === 'acerto' ? 'bypass' : 'claim',
      products: preparados.produtos,
      customer: { name: nome, email: 'email@naoinformado.com' },
      billing_address: endereco, shipping_address: endereco,
      shipping_pickup_type: 'pickup', shipping: 'not-provided',
      shipping_option: 'Venda presencial', shipping_cost_customer: 0,
      send_confirmation_email: false, send_fulfillment_email: false,
      note: `Venda presencial registrada no sistema Marquesa #${venda.id}`,
      extra: { marquesa_venda_id: String(venda.id), origem: String(venda.origem) },
      ...(preparados.locationId ? { location_id: preparados.locationId } : {}),
    };
    const pedido = await loja.criarPedido(corpo);
    const resultado = await registrarResultadoDoPedido(db, vendaId, pedido);
    return { ...resultado, criado: true };
  } catch (e) {
    const erro = String(e && e.message || e).slice(0, 500);
    await marcar(db, vendaId, 'erro', erro);
    return { status: 'erro', erro };
  }
}

export async function cancelarVendaNaNuvemshop(db, env, vendaId, { loja = new Nuvemshop(env) } = {}) {
  const venda = await db.prepare(`SELECT * FROM vendas WHERE id = ?`).bind(vendaId).first();
  if (!venda) return { status: 'erro', erro: 'Venda não encontrada.' };
  const pedidoId = idDoExterno(venda.externo_id);
  if (!pedidoId) {
    await marcar(db, vendaId, 'cancelada_local', null);
    return { status: 'cancelada_local' };
  }
  try {
    const pedido = await loja.pedido(pedidoId);
    if (pedido.status !== 'cancelled') {
      await loja.cancelarPedido(pedidoId, { reason: 'other', email: false, restock: true });
    }
    await marcar(db, vendaId, 'cancelada', null, venda.externo_id);
    return { status: 'cancelada', pedidoId };
  } catch (e) {
    const erro = String(e && e.message || e).slice(0, 500);
    await marcar(db, vendaId, 'cancelamento_pendente', erro, venda.externo_id);
    return { status: 'cancelamento_pendente', erro, pedidoId };
  }
}

/**
 * Segunda camada do envio automático. A criação da venda já tenta na hora;
 * esta rotina retoma somente falhas técnicas e execuções interrompidas.
 * Pendência de decisão (`revisao`) e falta de estoque confirmada na loja
 * (`estoque_divergente`) ficam de fora deliberadamente.
 */
export async function sincronizarVendasPendentes(db, env, { loja = new Nuvemshop(env), limite = 10 } = {}) {
  const max = Math.max(1, Math.min(50, Number(limite) || 10));
  const vendas = (await db.prepare(`
    SELECT id, cancelada
      FROM vendas
     WHERE origem <> 'site' AND (
       (cancelada = 0 AND nuvemshop_status IN ('pendente','erro','nao_enviada')) OR
       (cancelada = 0 AND nuvemshop_status = 'sincronizando'
          AND datetime(nuvemshop_em) < datetime('now','-5 minutes')) OR
       (cancelada = 1 AND nuvemshop_status = 'cancelamento_pendente')
     )
     ORDER BY id
     LIMIT ?
  `).bind(max).all()).results;

  const resultados = [];
  for (const venda of vendas) {
    const resultado = venda.cancelada
      ? await cancelarVendaNaNuvemshop(db, env, venda.id, { loja })
      : await espelharVendaNaNuvemshop(db, env, venda.id, { loja });
    resultados.push({ vendaId: venda.id, ...resultado });
  }

  return {
    tentadas: resultados.length,
    sincronizadas: resultados.filter(r => ['sincronizada','cancelada','cancelada_local'].includes(r.status)).length,
    revisao: resultados.filter(r => r.status === 'revisao').length,
    falhas: resultados.filter(r => ['erro','cancelamento_pendente'].includes(r.status)).length,
    resultados,
  };
}

/** Chamado pela importação de pedidos para reconhecer o pedido que nasceu
 * daqui antes de tratá-lo como uma nova venda do site. */
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
