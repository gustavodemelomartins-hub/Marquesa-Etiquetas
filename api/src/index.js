import { checarChave, respostaNaoAutorizada, json, corsPreflight } from './auth.js';
import { montarState } from './state.js';
import { calcComissao } from './comissao.js';

const hoje = () => new Date().toISOString().slice(0, 10);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsPreflight();

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/health') return json({ ok: true, hoje: hoje() });

    if (!checarChave(request, env)) return respostaNaoAutorizada();

    const db = env.DB;
    try {
      // ---------- leitura completa ----------
      if (path === '/api/state' && request.method === 'GET') {
        return json(await montarState(db));
      }

      // ---------- produtos ----------
      if (path === '/api/produtos/importar' && request.method === 'POST') {
        return await importarProdutos(db, await request.json());
      }
      let m;
      if ((m = path.match(/^\/api\/produtos\/([^/]+)$/)) && request.method === 'PATCH') {
        const sku = decodeURIComponent(m[1]);
        const { qtd, desc, preco, cat } = await request.json();
        const campos = [], valores = [];
        if (qtd !== undefined) { campos.push('qtd = ?'); valores.push(int(qtd)); }
        if (desc !== undefined) { campos.push('desc = ?'); valores.push(String(desc)); }
        if (preco !== undefined) { campos.push('preco = ?'); valores.push(num(preco)); }
        if (cat !== undefined) { campos.push('cat = ?'); valores.push(String(cat)); }
        if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
        campos.push("atualizado_em = datetime('now')");
        await db.prepare(`UPDATE produtos SET ${campos.join(', ')} WHERE sku = ?`)
          .bind(...valores, sku).run();
        return json({ ok: true });
      }

      // ---------- retrato da Nuvemshop ----------
      if (path === '/api/loja/importar' && request.method === 'POST') {
        return await importarLoja(db, await request.json());
      }

      // ---------- revendedoras ----------
      if (path === '/api/revendedoras' && request.method === 'POST') {
        const { nome, tel, cidade, cpf } = await request.json();
        if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
        const r = await db.prepare(
          `INSERT INTO revendedoras (nome, tel, cidade, cpf) VALUES (?, ?, ?, ?) RETURNING *`
        ).bind(nome.trim(), tel || '', cidade || '', cpf || '').first();
        return json(linhaRevendedora(r), 201);
      }
      if ((m = path.match(/^\/api\/revendedoras\/(\d+)$/)) && request.method === 'PATCH') {
        const id = +m[1];
        const { nome, tel, cidade, cpf } = await request.json();
        await db.prepare(`UPDATE revendedoras SET nome=?, tel=?, cidade=?, cpf=? WHERE id=?`)
          .bind(nome, tel || '', cidade || '', cpf || '', id).run();
        return json({ ok: true });
      }
      if ((m = path.match(/^\/api\/revendedoras\/(\d+)$/)) && request.method === 'DELETE') {
        const id = +m[1];
        await db.prepare(`DELETE FROM revendedoras WHERE id=?`).bind(id).run();
        return json({ ok: true });
      }

      // ---------- maletas ----------
      if (path === '/api/maletas' && request.method === 'POST') {
        const { revId, abertaEm, acertoEm, obs } = await request.json();
        const r = await db.prepare(
          `INSERT INTO maletas (rev_id, status, aberta_em, acerto_em, obs) VALUES (?, 'aberta', ?, ?, ?) RETURNING *`
        ).bind(revId, abertaEm || null, acertoEm || null, obs || null).first();
        return json({ id: r.id, revId: r.rev_id, status: r.status, abertaEm: r.aberta_em, acertoEm: r.acerto_em, itens: {} }, 201);
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)$/)) && request.method === 'PATCH') {
        const id = +m[1];
        const { abertaEm, acertoEm } = await request.json();
        const campos = [], valores = [];
        if (abertaEm !== undefined) { campos.push('aberta_em = ?'); valores.push(abertaEm); }
        if (acertoEm !== undefined) { campos.push('acerto_em = ?'); valores.push(acertoEm); }
        if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
        await db.prepare(`UPDATE maletas SET ${campos.join(', ')} WHERE id = ?`).bind(...valores, id).run();
        return json({ ok: true });
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)\/itens$/)) && request.method === 'POST') {
        return await adicionarItensMaleta(db, +m[1], await request.json());
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)\/acerto$/)) && request.method === 'POST') {
        return await fecharAcerto(db, +m[1], await request.json());
      }

      // ---------- config ----------
      if (path === '/api/config' && request.method === 'PUT') {
        const body = await request.json();
        const stmts = [];
        for (const chave of ['prazoDias', 'prataPct', 'faixas']) {
          if (body[chave] !== undefined) {
            stmts.push(db.prepare(
              `INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`
            ).bind(chave, JSON.stringify(body[chave])));
          }
        }
        if (stmts.length) await db.batch(stmts);
        return json({ ok: true });
      }

      // ---------- clientes ----------
      if (path === '/api/clientes' && request.method === 'GET') {
        const busca = (url.searchParams.get('busca') || '').trim();
        const rows = busca
          ? await db.prepare(`SELECT * FROM clientes WHERE nome LIKE ? ORDER BY nome LIMIT 20`).bind(`%${busca}%`).all()
          : await db.prepare(`SELECT * FROM clientes ORDER BY nome LIMIT 50`).all();
        return json(rows.results.map(c => ({ id: c.id, nome: c.nome, tel: c.tel || '' })));
      }
      if (path === '/api/clientes' && request.method === 'POST') {
        const { nome, tel } = await request.json();
        if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
        const r = await db.prepare(`INSERT INTO clientes (nome, tel) VALUES (?, ?) RETURNING *`)
          .bind(nome.trim(), tel || '').first();
        return json({ id: r.id, nome: r.nome, tel: r.tel || '' }, 201);
      }

      // ---------- vendas ----------
      if (path === '/api/vendas' && request.method === 'POST') {
        return await registrarVenda(db, await request.json());
      }
      if (path === '/api/vendas' && request.method === 'GET') {
        const data = url.searchParams.get('data') || hoje();
        return json(await listarVendasDoDia(db, data));
      }

      return json({ erro: 'Rota não encontrada' }, 404);
    } catch (e) {
      return json({ erro: 'Falha interna', detalhe: String(e && e.message || e) }, 500);
    }
  },
};

function int(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function num(v) { const n = +v; return isNaN(n) ? 0 : n; }
function linhaRevendedora(r) {
  return { id: r.id, nome: r.nome, tel: r.tel || '', cidade: r.cidade || '', cpf: r.cpf || '', criadaEm: r.criada_em };
}

async function importarProdutos(db, { produtos }) {
  if (!Array.isArray(produtos) || !produtos.length) return json({ erro: 'Lista vazia' }, 400);
  const stmts = produtos.map(p => db.prepare(
    `INSERT INTO produtos (sku, desc, cat, preco, qtd, atualizado_em) VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(sku) DO UPDATE SET desc=excluded.desc, cat=excluded.cat, preco=excluded.preco, qtd=excluded.qtd, atualizado_em=datetime('now')`
  ).bind(p.sku, p.desc, p.cat, p.preco, p.qtd));
  await db.batch(stmts);
  return json({ ok: true, n: produtos.length });
}

async function importarLoja(db, { snapshot, produtos }) {
  const stmts = [];
  if (snapshot) {
    stmts.push(db.prepare(
      `INSERT INTO loja_snapshot (id, lido_em, produtos_na_loja, produtos_casados, so_na_loja, codigos_casados, duplicados_json)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET lido_em=excluded.lido_em, produtos_na_loja=excluded.produtos_na_loja,
         produtos_casados=excluded.produtos_casados, so_na_loja=excluded.so_na_loja,
         codigos_casados=excluded.codigos_casados, duplicados_json=excluded.duplicados_json`
    ).bind(snapshot.lidoEm, snapshot.produtosNaLoja, snapshot.produtosCasados, snapshot.soNaLoja,
      snapshot.codigosCasados, JSON.stringify(snapshot.duplicados || [])));
  }
  // limpa a marca de quem saiu da loja desde o último export, igual à versão client-side
  stmts.push(db.prepare(`UPDATE produtos SET url_loja=NULL, estoque_loja=NULL, visivel=NULL`));
  for (const p of (produtos || [])) {
    stmts.push(db.prepare(
      `UPDATE produtos SET url_loja=?, estoque_loja=?, visivel=?, nome_loja=? WHERE sku=?`
    ).bind(p.urlLoja, p.estoqueLoja, p.visivel === null ? null : (p.visivel ? 1 : 0), p.nomeLoja || null, p.sku));
  }
  await db.batch(stmts);
  return json({ ok: true, n: (produtos || []).length });
}

/** Soma dos itens de um SKU em todas as maletas ABERTAS — usado para
 *  calcular quanto está "em casa" antes de aceitar uma bipagem ou venda. */
async function foraDoSku(db, sku) {
  const r = await db.prepare(
    `SELECT COALESCE(SUM(mi.qtd), 0) AS fora
     FROM maleta_itens mi JOIN maletas m ON m.id = mi.maleta_id AND m.status = 'aberta'
     WHERE mi.sku = ?`
  ).bind(sku).first();
  return r.fora;
}

async function adicionarItensMaleta(db, maletaId, { itens }) {
  const entradas = Object.entries(itens || {}).filter(([, q]) => q > 0);
  if (!entradas.length) return json({ erro: 'Nenhum item para adicionar' }, 400);

  const maleta = await db.prepare(`SELECT * FROM maletas WHERE id = ?`).bind(maletaId).first();
  if (!maleta) return json({ erro: 'Maleta não encontrada' }, 404);
  if (maleta.status !== 'aberta') return json({ erro: 'Maleta já está fechada' }, 409);

  const stmts = [];
  const recusados = [];
  for (const [sku, qtd] of entradas) {
    const p = await db.prepare(`SELECT qtd, desc FROM produtos WHERE sku = ?`).bind(sku).first();
    if (!p) { recusados.push({ sku, motivo: 'não está no catálogo' }); continue; }
    const fora = await foraDoSku(db, sku);
    const casa = p.qtd - fora;
    if (qtd > casa) { recusados.push({ sku, motivo: `só tem ${casa} em casa`, desc: p.desc }); continue; }
    stmts.push(db.prepare(
      `INSERT INTO maleta_itens (maleta_id, sku, qtd) VALUES (?, ?, ?)
       ON CONFLICT(maleta_id, sku) DO UPDATE SET qtd = qtd + excluded.qtd`
    ).bind(maletaId, sku, qtd));
  }
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, adicionados: stmts.length, recusados });
}

async function fecharAcerto(db, maletaId, { devolvidas, faltas }) {
  const maleta = await db.prepare(`SELECT * FROM maletas WHERE id = ?`).bind(maletaId).first();
  if (!maleta) return json({ erro: 'Maleta não encontrada' }, 404);
  if (maleta.status !== 'aberta') return json({ erro: 'Maleta já está fechada' }, 409);

  const itensR = await db.prepare(`SELECT sku, qtd FROM maleta_itens WHERE maleta_id = ?`).bind(maletaId).all();
  const enviadas = itensR.results.reduce((s, i) => s + i.qtd, 0);
  const totDev = Object.values(devolvidas || {}).reduce((s, q) => s + q, 0);

  const vendidos = [], ficam = {};
  let baixas = 0, perdas = 0;
  const configR = await db.prepare(`SELECT * FROM config`).all();
  const configRows = Object.fromEntries(configR.results.map(c => [c.chave, JSON.parse(c.valor)]));
  const config = {
    prataPct: configRows.prataPct ?? 10,
    faixas: configRows.faixas ?? [
      { limite: 800, pct: 0 }, { limite: 1000, pct: 15 }, { limite: 1500, pct: 25 },
      { limite: 6000, pct: 30 }, { limite: 10000, pct: 35 }, { limite: null, pct: 40 },
    ],
  };

  const stmts = [];
  for (const f of (faltas || [])) {
    for (const l of (f.linhas || [])) {
      if (!(l.qtd > 0)) continue;
      if (l.destino === 'ficou') { ficam[f.sku] = (ficam[f.sku] || 0) + l.qtd; continue; }
      // decremento condicional: se o estoque já mudou por outra via, a linha falha sem quebrar o resto
      const r = await db.prepare(`UPDATE produtos SET qtd = MAX(0, qtd - ?) WHERE sku = ? AND qtd >= 0`)
        .bind(l.qtd, f.sku).run();
      baixas += l.qtd;
      if (l.destino === 'vendida') {
        const p = await db.prepare(`SELECT preco, desc FROM produtos WHERE sku = ?`).bind(f.sku).first();
        if (p) vendidos.push({ sku: f.sku, qtd: l.qtd, preco: p.preco, desc: p.desc });
      }
      if (l.destino === 'perdida' || l.destino === 'danificada') perdas += l.qtd;
    }
  }

  const c = calcComissao(vendidos, config);
  const fechadaEm = hoje();
  const acertoJson = JSON.stringify({
    enviadas, devolvidas: totDev,
    vendidas: vendidos.reduce((s, v) => s + v.qtd, 0),
    perdas, baixas,
    totalVendido: c.totalVendido, pct: c.pct, comissao: c.comissao, liquido: c.liquido,
    dias: maleta.aberta_em ? Math.round((Date.now() - new Date(maleta.aberta_em + 'T12:00:00')) / 86400000) : null,
  });

  stmts.push(db.prepare(`UPDATE maletas SET status='fechada', fechada_em=?, acerto_json=? WHERE id=?`)
    .bind(fechadaEm, acertoJson, maletaId));

  let novaMaletaId = null;
  if (Object.keys(ficam).length) {
    const nova = await db.prepare(
      `INSERT INTO maletas (rev_id, status, aberta_em, acerto_em, obs) VALUES (?, 'aberta', ?, NULL, ?) RETURNING id`
    ).bind(maleta.rev_id, fechadaEm, `Continuação da maleta ${maletaId}`).first();
    novaMaletaId = nova.id;
    for (const [sku, qtd] of Object.entries(ficam)) {
      stmts.push(db.prepare(`INSERT INTO maleta_itens (maleta_id, sku, qtd) VALUES (?, ?, ?)`).bind(novaMaletaId, sku, qtd));
    }
  }
  await db.batch(stmts);

  return json({ ok: true, acerto: JSON.parse(acertoJson), novaMaletaId });
}

async function registrarVenda(db, { clienteId, clienteNome, itens }) {
  const entradas = (itens || []).filter(i => i.qtd > 0);
  if (!entradas.length) return json({ erro: 'Nenhum item na venda' }, 400);
  if (!clienteNome || !clienteNome.trim()) return json({ erro: 'Nome da cliente é obrigatório' }, 400);

  const linhas = [];
  for (const { sku, qtd } of entradas) {
    const p = await db.prepare(`SELECT desc, preco, qtd FROM produtos WHERE sku = ?`).bind(sku).first();
    if (!p) return json({ erro: `Código ${sku} não está no catálogo` }, 400);
    const fora = await foraDoSku(db, sku);
    const casa = p.qtd - fora;
    if (qtd > casa) return json({ erro: `${p.desc}: só tem ${casa} em casa`, sku }, 409);
    linhas.push({ sku, qtd, preco: p.preco, desc: p.desc });
  }

  const total = linhas.reduce((s, l) => s + l.preco * l.qtd, 0);
  const dataVenda = hoje();

  const venda = await db.prepare(
    `INSERT INTO vendas (cliente_id, cliente_nome, data, total) VALUES (?, ?, ?, ?) RETURNING id`
  ).bind(clienteId || null, clienteNome.trim(), dataVenda, total).first();

  const stmts = linhas.map(l => db.prepare(
    `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (?, ?, ?, ?, ?)`
  ).bind(venda.id, l.sku, l.desc, l.qtd, l.preco));
  for (const l of linhas) {
    stmts.push(db.prepare(`UPDATE produtos SET qtd = MAX(0, qtd - ?) WHERE sku = ?`).bind(l.qtd, l.sku));
  }
  await db.batch(stmts);

  return json({ ok: true, id: venda.id, data: dataVenda, total, itens: linhas }, 201);
}

async function listarVendasDoDia(db, data) {
  const vendasR = await db.prepare(`SELECT * FROM vendas WHERE data = ? ORDER BY id`).bind(data).all();
  const itensR = await db.prepare(
    `SELECT vi.* FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id WHERE v.data = ?`
  ).bind(data).all();
  const itensPorVenda = new Map();
  for (const it of itensR.results) {
    if (!itensPorVenda.has(it.venda_id)) itensPorVenda.set(it.venda_id, []);
    itensPorVenda.get(it.venda_id).push({ sku: it.sku, desc: it.desc, qtd: it.qtd, preco: it.preco });
  }
  return vendasR.results.map(v => ({
    id: v.id, clienteNome: v.cliente_nome, data: v.data, total: v.total,
    criadaEm: v.criada_em, itens: itensPorVenda.get(v.id) || [],
  }));
}
