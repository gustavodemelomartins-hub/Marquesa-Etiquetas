/** Inventário — a conferência física do que está em casa.
 *
 *  Princípio que manda aqui: **o inventário não corrige nada sozinho.**
 *  Ele conta, compara e mostra a diferença. Transformar a diferença em
 *  saldo é um segundo ato, explícito, um código de cada vez — e mesmo
 *  esse ato vira movimentação (§19), nunca digitação de saldo.
 *
 *  O motivo é prático, não burocrático: uma peça "faltando" quase nunca
 *  sumiu. Ela está na bolsa, foi para a maleta sem lançar, ou a etiqueta
 *  não leu. Se o sistema zerasse o saldo por conta própria, o erro de
 *  contagem viraria a nova verdade e ninguém saberia disso depois.
 */
import { json } from './auth.js';
import { movimentar } from './estoque.js';

/** O que se espera encontrar em casa: total menos o que está com as
 *  revendedoras. É o mesmo "disponível" do §5.2 — peça consignada não
 *  está em casa e não pode ser cobrada da contagem. */
const SQL_ESPERADO = `
  SELECT p.sku, p.desc, p.cat, p.preco,
         p.qtd - COALESCE((
           SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
             JOIN maletas m ON m.id = mi.maleta_id
            WHERE mi.sku = p.sku AND m.status IN ('aberta', 'em_acerto')
         ), 0) AS esperado
    FROM produtos p`;

export async function abrirInventario(db) {
  const aberto = await db.prepare(
    `SELECT id FROM inventarios WHERE status = 'aberto' ORDER BY id DESC LIMIT 1`).first();
  if (aberto) {
    return json({ erro: 'Já existe um inventário em andamento.', id: aberto.id }, 409);
  }
  const r = await db.prepare(
    `INSERT INTO inventarios (status) VALUES ('aberto') RETURNING id, iniciado_em`).first();
  return json({ id: r.id, iniciadoEm: r.iniciado_em, status: 'aberto' }, 201);
}

/** Guarda o que já foi bipado, para a contagem sobreviver a fechar o
 *  navegador, acabar a bateria ou trocar de aparelho no meio.
 *
 *  Substitui a contagem inteira em vez de somar: assim reenviar o mesmo
 *  lote duas vezes (rede ruim, botão clicado de novo) não dobra nada. */
export async function salvarContagem(db, id, { contados, desconhecidos }) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') return json({ erro: 'Este inventário já foi fechado' }, 409);

  const catalogo = new Set((await db.prepare(`SELECT sku FROM produtos`).all()).results.map(p => p.sku));
  const stmts = [db.prepare(`DELETE FROM inventario_itens WHERE inventario_id = ?`).bind(id)];
  const fora = new Set(desconhecidos || []);

  for (const [sku, qtd] of Object.entries(contados || {})) {
    if (!(qtd > 0)) continue;
    // um código que não está no catálogo não pode entrar na razão de
    // estoque — vai para a lista de avisos, que a tela mostra à parte
    if (!catalogo.has(sku)) { fora.add(sku); continue; }
    stmts.push(db.prepare(
      `INSERT INTO inventario_itens (inventario_id, sku, contado) VALUES (?, ?, ?)`
    ).bind(id, sku, qtd));
  }
  stmts.push(db.prepare(`UPDATE inventarios SET desconhecidos_json = ? WHERE id = ?`)
    .bind(JSON.stringify([...fora]), id));

  await db.batch(stmts);
  return json({ ok: true, codigos: stmts.length - 2 });
}

/** Fecha a contagem e devolve a comparação.
 *
 *  O esperado é CONGELADO aqui, do mesmo jeito que a maleta congela o
 *  preço do envio (§6.1): sem isso, abrir um inventário de três meses
 *  atrás mostraria a diferença contra o estoque de hoje, e um inventário
 *  que muda de resultado depois de fechado não prova nada. */
export async function concluirInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') return json({ erro: 'Este inventário já foi fechado' }, 409);

  const produtos = (await db.prepare(SQL_ESPERADO).all()).results;
  const contados = new Map((await db.prepare(
    `SELECT sku, contado FROM inventario_itens WHERE inventario_id = ?`).bind(id).all())
    .results.map(r => [r.sku, r.contado]));

  const stmts = [db.prepare(`DELETE FROM inventario_itens WHERE inventario_id = ?`).bind(id)];
  const faltando = [], sobrando = [];
  let conferidos = 0, pecasContadas = 0;

  for (const p of produtos) {
    const contado = contados.get(p.sku) || 0;
    const esperado = p.esperado;
    if (!contado && !esperado) continue;   // nem tinha nem apareceu: fora do relatório

    stmts.push(db.prepare(
      `INSERT INTO inventario_itens (inventario_id, sku, contado, esperado) VALUES (?, ?, ?, ?)`
    ).bind(id, p.sku, contado, esperado));

    pecasContadas += contado;
    const dif = contado - esperado;
    if (dif === 0) { conferidos++; continue; }
    // `sugestao` é o ajuste que faria o saldo bater com a contagem.
    // É sugestão mesmo: só vira movimento se ela confirmar em /ajustar.
    const linha = {
      sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco,
      contado, esperado, dif, sugestao: dif,
      valor: (p.preco || 0) * Math.abs(dif),
    };
    (dif < 0 ? faltando : sobrando).push(linha);
  }

  stmts.push(db.prepare(
    `UPDATE inventarios SET status = 'concluido', concluido_em = datetime('now') WHERE id = ?`).bind(id));
  await db.batch(stmts);

  const ordena = (a, b) => b.valor - a.valor || a.desc.localeCompare(b.desc, 'pt');
  return json({
    ok: true, id,
    concluidoEm: new Date().toISOString().slice(0, 10),
    conferidos, pecasContadas,
    faltando: faltando.sort(ordena),
    sobrando: sobrando.sort(ordena),
    desconhecidos: JSON.parse(inv.desconhecidos_json || '[]'),
  });
}

/** Aplica só os ajustes que ela escolheu, um movimento por código.
 *  §19: o saldo muda porque houve uma movimentação registrada, com data,
 *  motivo e origem — não porque alguém digitou um número novo. */
export async function ajustarInventario(db, id, { itens }) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'concluido') {
    return json({ erro: 'Só dá para ajustar depois de concluir a contagem' }, 409);
  }
  const pedidos = (itens || []).filter(i => i && i.sku && Number.isInteger(i.qtd) && i.qtd !== 0);
  if (!pedidos.length) return json({ erro: 'Nenhum ajuste informado' }, 400);

  const linhas = new Map((await db.prepare(
    `SELECT sku, contado, esperado, ajustado FROM inventario_itens WHERE inventario_id = ?`)
    .bind(id).all()).results.map(r => [r.sku, r]));

  const data = String(inv.concluido_em || '').slice(0, 10).split('-').reverse().join('/');
  const stmts = [];
  const aplicados = [];

  for (const { sku, qtd } of pedidos) {
    const l = linhas.get(sku);
    if (!l) return json({ erro: `${sku} não faz parte deste inventário`, sku }, 400);
    if (l.ajustado) return json({ erro: `${sku} já foi ajustado neste inventário`, sku }, 409);

    stmts.push(...movimentar(db, {
      sku, tipo: 'ajuste', quantidade: qtd, origem: 'inventario',
      obs: `Inventário de ${data}: contado ${l.contado}, sistema dizia ${l.esperado}`,
    }));
    stmts.push(db.prepare(
      `UPDATE inventario_itens SET ajustado = 1 WHERE inventario_id = ? AND sku = ?`).bind(id, sku));
    aplicados.push({ sku, qtd });
  }

  await db.batch(stmts);
  return json({ ok: true, aplicados });
}

/** §28: um inventário abandonado no meio é cancelado, não apagado —
 *  saber que uma contagem foi começada e largada também é informação. */
export async function cancelarInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') return json({ erro: 'Só dá para cancelar um inventário em andamento' }, 409);
  await db.prepare(
    `UPDATE inventarios SET status = 'cancelado', concluido_em = datetime('now') WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

export async function detalheInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  const itens = (await db.prepare(
    `SELECT ii.*, p.desc, p.cat, p.preco FROM inventario_itens ii
       JOIN produtos p ON p.sku = ii.sku
      WHERE ii.inventario_id = ? ORDER BY p.desc`).bind(id).all()).results;

  return json({
    id: inv.id, status: inv.status,
    iniciadoEm: inv.iniciado_em, concluidoEm: inv.concluido_em,
    desconhecidos: JSON.parse(inv.desconhecidos_json || '[]'),
    itens: itens.map(i => ({
      sku: i.sku, desc: i.desc, cat: i.cat, preco: i.preco,
      contado: i.contado, esperado: i.esperado,
      dif: i.esperado === null ? null : i.contado - i.esperado,
      ajustado: !!i.ajustado,
    })),
  });
}

export async function listarInventarios(db, limite = 20) {
  const r = await db.prepare(
    `SELECT i.*,
            (SELECT COUNT(*) FROM inventario_itens x
              WHERE x.inventario_id = i.id AND x.esperado IS NOT NULL AND x.contado <> x.esperado) AS divergentes,
            (SELECT COALESCE(SUM(contado), 0) FROM inventario_itens x WHERE x.inventario_id = i.id) AS pecas
       FROM inventarios i ORDER BY i.id DESC LIMIT ?`).bind(limite).all();
  return json(r.results.map(i => ({
    id: i.id, status: i.status, iniciadoEm: i.iniciado_em, concluidoEm: i.concluido_em,
    divergentes: i.divergentes, pecas: i.pecas,
  })));
}

/** O que o dashboard precisa saber sem pedir a lista inteira: tem contagem
 *  aberta agora? quando foi a última? já venceu o prazo? */
export async function resumoInventario(db, prazoDias) {
  const [aberto, ultimo] = await Promise.all([
    db.prepare(`SELECT id, iniciado_em FROM inventarios WHERE status = 'aberto' ORDER BY id DESC LIMIT 1`).first(),
    db.prepare(`SELECT id, concluido_em FROM inventarios WHERE status = 'concluido' ORDER BY id DESC LIMIT 1`).first(),
  ]);

  let diasDesde = null;
  if (ultimo && ultimo.concluido_em) {
    const ms = Date.now() - Date.parse(ultimo.concluido_em.replace(' ', 'T') + 'Z');
    diasDesde = Math.max(0, Math.floor(ms / 86400000));
  }
  return {
    abertoId: aberto ? aberto.id : null,
    abertoEm: aberto ? aberto.iniciado_em : null,
    ultimoId: ultimo ? ultimo.id : null,
    ultimoEm: ultimo ? String(ultimo.concluido_em).slice(0, 10) : null,
    diasDesde,
    prazoDias,
    // nunca contou ainda também é "vencido": é o estado que mais precisa
    // aparecer, e não o que menos
    vencido: diasDesde === null || diasDesde >= prazoDias,
  };
}
