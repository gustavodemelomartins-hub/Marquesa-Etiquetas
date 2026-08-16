import { checarChave, respostaNaoAutorizada, json, comCors } from './auth.js';
import { montarState, FAIXAS_PADRAO } from './state.js';
import { calcComissao } from './comissao.js';
import { movimentar, consignadoDoSku, saldosDoSku, conferirEstoque } from './estoque.js';
import {
  abrirInventario, salvarContagem, concluirInventario, ajustarInventario,
  cancelarInventario, detalheInventario, listarInventarios,
} from './inventario.js';
import { sincronizar, historicoSync } from './sync.js';

const hoje = () => new Date().toISOString().slice(0, 10);
const int = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

export default {
  /** O CORS é aplicado uma única vez, na saída — assim nenhuma rota nova
   *  pode esquecer de devolvê-lo. */
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return comCors(new Response(null, { status: 204 }), request, env);
    return comCors(await rotear(request, env), request, env);
  },

  /** Cron da Cloudflare. Roda mesmo sem ninguém com o app aberto — é o que
   *  faz a loja ficar em dia sozinha.
   *
   *  Nunca força: se a rodada bater no freio de segurança, ela para e fica
   *  registrada como pausada, esperando alguém olhar. Um robô que roda de
   *  madrugada é o pior lugar possível para atropelar uma dúvida. */
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(sincronizar(env.DB, env).then(r => {
      if (!r.ok) console.error('sync falhou:', r.erro);
      else if (r.pausado) console.warn('sync pausada:', r.pausado.motivo);
    }));
  },
};

async function rotear(request, env) {
  {
    const url = new URL(request.url);
    const path = url.pathname;
    const met = request.method;

    if (path === '/api/health') return json({ ok: true, hoje: hoje() });
    if (!checarChave(request, env)) return respostaNaoAutorizada();

    const db = env.DB;
    let m;
    try {
      if (path === '/api/state' && met === 'GET') return json(await montarState(db, env));

      // §19 — prova de que o saldo bate com a razão
      if (path === '/api/estoque/conferir' && met === 'GET') {
        const divergentes = await conferirEstoque(db);
        return json({ ok: divergentes.length === 0, divergentes });
      }

      // §18 — "por que o estoque deste SKU mudou?"
      if ((m = path.match(/^\/api\/estoque\/([^/]+)\/movimentos$/)) && met === 'GET') {
        const sku = decodeURIComponent(m[1]);
        const r = await db.prepare(
          `SELECT * FROM movimentos WHERE sku = ? ORDER BY id`).bind(sku).all();
        const saldos = await saldosDoSku(db, sku);
        return json({ sku, saldos, movimentos: r.results });
      }

      if (path === '/api/categorias' && met === 'GET') {
        const r = await db.prepare(`SELECT * FROM categorias ORDER BY ordem, nome`).all();
        return json(r.results);
      }
      if (path === '/api/categorias' && met === 'POST') {
        const { nome, ordem, cor } = await request.json();
        if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
        await db.prepare(
          `INSERT INTO categorias (nome, ordem, cor) VALUES (?, ?, ?)
           ON CONFLICT(nome) DO UPDATE SET ordem = excluded.ordem, cor = excluded.cor`
        ).bind(nome.trim(), ordem ?? 99, cor || null).run();
        return json({ ok: true }, 201);
      }

      if (path === '/api/produtos/importar' && met === 'POST') return await importarProdutos(db, await request.json());
      if (path === '/api/loja/importar' && met === 'POST') return await importarLoja(db, await request.json());

      if ((m = path.match(/^\/api\/produtos\/([^/]+)$/)) && met === 'PATCH') {
        return await editarProduto(db, decodeURIComponent(m[1]), await request.json());
      }
      // §19: entrada de mercadoria e ajuste são MOVIMENTOS, não digitação de saldo
      if ((m = path.match(/^\/api\/produtos\/([^/]+)\/movimento$/)) && met === 'POST') {
        return await lancarMovimento(db, decodeURIComponent(m[1]), await request.json());
      }

      if (path === '/api/revendedoras' && met === 'POST') {
        const { nome, tel, cidade, cpf, endereco, obs } = await request.json();
        if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
        const r = await db.prepare(
          `INSERT INTO revendedoras (nome, tel, cidade, cpf, endereco, obs) VALUES (?,?,?,?,?,?) RETURNING *`
        ).bind(nome.trim(), tel || '', cidade || '', cpf || '', endereco || '', obs || '').first();
        return json(rev(r), 201);
      }
      if ((m = path.match(/^\/api\/revendedoras\/(\d+)$/)) && met === 'PATCH') {
        const id = +m[1];
        const b = await request.json();
        const campos = [], vals = [];
        for (const k of ['nome', 'tel', 'cidade', 'cpf', 'endereco', 'obs', 'status']) {
          if (b[k] !== undefined) { campos.push(`${k} = ?`); vals.push(b[k]); }
        }
        if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
        await db.prepare(`UPDATE revendedoras SET ${campos.join(', ')} WHERE id = ?`).bind(...vals, id).run();
        return json({ ok: true });
      }
      // §28: arquivar, nunca excluir — o histórico de maletas fica de pé
      if ((m = path.match(/^\/api\/revendedoras\/(\d+)\/arquivar$/)) && met === 'POST') {
        const id = +m[1];
        const abertas = await db.prepare(
          `SELECT COUNT(*) AS n FROM maletas WHERE rev_id = ? AND status IN ('aberta','em_acerto')`).bind(id).first();
        if (abertas.n > 0) {
          return json({ erro: `Esta revendedora tem ${abertas.n} maleta(s) em aberto. Encerre ou cancele antes de arquivar.` }, 409);
        }
        await db.prepare(`UPDATE revendedoras SET status = 'inativa' WHERE id = ?`).bind(id).run();
        return json({ ok: true });
      }

      if (path === '/api/maletas' && met === 'POST') {
        const { revId, abertaEm, acertoEm, obs } = await request.json();
        const r = await db.prepare(
          `INSERT INTO maletas (rev_id, status, aberta_em, acerto_em, obs) VALUES (?, 'aberta', ?, ?, ?) RETURNING *`
        ).bind(revId, abertaEm || null, acertoEm || null, obs || null).first();
        return json({ id: r.id, revId: r.rev_id, status: r.status, abertaEm: r.aberta_em, acertoEm: r.acerto_em, itens: {} }, 201);
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)$/)) && met === 'PATCH') {
        const id = +m[1];
        const { abertaEm, acertoEm, status } = await request.json();
        const campos = [], vals = [];
        if (abertaEm !== undefined) { campos.push('aberta_em = ?'); vals.push(abertaEm); }
        if (acertoEm !== undefined) { campos.push('acerto_em = ?'); vals.push(acertoEm); }
        if (status !== undefined) {
          if (!['aberta', 'em_acerto'].includes(status)) {
            return json({ erro: 'Use /acerto para encerrar e /cancelar para cancelar' }, 400);
          }
          campos.push('status = ?'); vals.push(status);
        }
        if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
        await db.prepare(`UPDATE maletas SET ${campos.join(', ')} WHERE id = ?`).bind(...vals, id).run();
        return json({ ok: true });
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)\/itens$/)) && met === 'POST') {
        return await adicionarItens(db, +m[1], await request.json());
      }
      if ((m = path.match(/^\/api\/maletas\/(\d+)\/acerto$/)) && met === 'POST') {
        return await encerrarAcerto(db, +m[1], await request.json());
      }
      // §6.1 + §28: maleta criada por engano é cancelada, não apagada
      if ((m = path.match(/^\/api\/maletas\/(\d+)\/cancelar$/)) && met === 'POST') {
        return await cancelarMaleta(db, +m[1], await request.json().catch(() => ({})));
      }

      if (path === '/api/config' && met === 'PUT') {
        const b = await request.json();
        const stmts = [];
        /* Lista fechada de propósito: o `config` também guarda estado interno
           da sincronização (`syncUltimoPedido`), e deixar a tela escrever
           nele por engano faria o robô reler ou pular pedidos. Só os dois
           limites do freio são ajustáveis daqui. */
        for (const chave of ['prazoDias', 'prataPct', 'inventarioDias', 'faixas',
                             'syncLimiteMudancas', 'syncLimiteZerar']) {
          if (b[chave] !== undefined) {
            stmts.push(db.prepare(
              `INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`
            ).bind(chave, JSON.stringify(b[chave])));
          }
        }
        if (stmts.length) await db.batch(stmts);
        return json({ ok: true });
      }

      if (path === '/api/clientes' && met === 'GET') {
        const busca = (url.searchParams.get('busca') || '').trim();
        const r = busca
          ? await db.prepare(`SELECT * FROM clientes WHERE nome LIKE ? ORDER BY nome LIMIT 20`).bind(`%${busca}%`).all()
          : await db.prepare(`SELECT * FROM clientes ORDER BY nome LIMIT 50`).all();
        return json(r.results.map(c => ({ id: c.id, nome: c.nome, tel: c.tel || '' })));
      }
      if (path === '/api/clientes' && met === 'POST') {
        const { nome, tel } = await request.json();
        if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
        const r = await db.prepare(`INSERT INTO clientes (nome, tel) VALUES (?, ?) RETURNING *`)
          .bind(nome.trim(), tel || '').first();
        return json({ id: r.id, nome: r.nome, tel: r.tel || '' }, 201);
      }

      // -------------------------------------------- sincronização da loja
      if (path === '/api/sync' && met === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(await sincronizar(db, env, { forcar: !!b.forcar, seco: !!b.seco }));
      }
      if (path === '/api/sync' && met === 'GET') return json(await historicoSync(db));

      // ------------------------------------------------------- inventário
      if (path === '/api/inventarios' && met === 'GET') return await listarInventarios(db);
      if (path === '/api/inventarios' && met === 'POST') return await abrirInventario(db);
      if ((m = path.match(/^\/api\/inventarios\/(\d+)$/)) && met === 'GET') {
        return await detalheInventario(db, +m[1]);
      }
      if ((m = path.match(/^\/api\/inventarios\/(\d+)\/contagem$/)) && met === 'PUT') {
        return await salvarContagem(db, +m[1], await request.json());
      }
      if ((m = path.match(/^\/api\/inventarios\/(\d+)\/concluir$/)) && met === 'POST') {
        return await concluirInventario(db, +m[1]);
      }
      if ((m = path.match(/^\/api\/inventarios\/(\d+)\/ajustar$/)) && met === 'POST') {
        return await ajustarInventario(db, +m[1], await request.json());
      }
      if ((m = path.match(/^\/api\/inventarios\/(\d+)\/cancelar$/)) && met === 'POST') {
        return await cancelarInventario(db, +m[1]);
      }

      if (path === '/api/vendas' && met === 'POST') return await registrarVenda(db, await request.json());
      if (path === '/api/vendas' && met === 'GET') {
        return json(await listarVendas(db, url.searchParams.get('data') || hoje()));
      }
      if ((m = path.match(/^\/api\/vendas\/(\d+)\/cancelar$/)) && met === 'POST') {
        return await cancelarVenda(db, +m[1]);
      }

      return json({ erro: 'Rota não encontrada' }, 404);
    } catch (e) {
      return json({ erro: 'Falha interna', detalhe: String((e && e.message) || e) }, 500);
    }
  }
}

const rev = r => ({
  id: r.id, nome: r.nome, tel: r.tel || '', cidade: r.cidade || '', cpf: r.cpf || '',
  endereco: r.endereco || '', obs: r.obs || '', status: r.status, criadaEm: r.criada_em,
});

async function configAtual(db) {
  const r = await db.prepare(`SELECT * FROM config`).all();
  const c = Object.fromEntries(r.results.map(x => [x.chave, JSON.parse(x.valor)]));
  return { prazoDias: c.prazoDias ?? 45, prataPct: c.prataPct ?? 10, faixas: c.faixas ?? FAIXAS_PADRAO };
}

/** §22: a importação não corrige em silêncio — devolve o que estranhou.
 *  §24: preço ausente entra como NULL, nunca como zero. */
async function importarProdutos(db, { produtos }) {
  if (!Array.isArray(produtos) || !produtos.length) return json({ erro: 'Lista vazia' }, 400);

  const existentes = new Map(
    (await db.prepare(`SELECT sku, qtd FROM produtos`).all()).results.map(p => [p.sku, p.qtd])
  );
  const cats = new Set((await db.prepare(`SELECT nome FROM categorias`).all()).results.map(c => c.nome));

  const stmts = [], avisos = [];
  let novos = 0, ajustados = 0;

  for (const p of produtos) {
    const sku = String(p.sku || '').trim();
    if (!sku) { avisos.push({ tipo: 'sku_vazio', detalhe: p.desc || '(sem descrição)' }); continue; }

    const preco = (p.preco === null || p.preco === undefined || p.preco === '' || +p.preco === 0) ? null : +p.preco;
    if (preco === null) avisos.push({ tipo: 'sem_preco', sku, detalhe: p.desc });

    let cat = p.cat || 'Outros';
    if (!cats.has(cat)) { avisos.push({ tipo: 'categoria_desconhecida', sku, detalhe: cat }); cat = 'Outros'; }

    const qtdAlvo = int(p.qtd);

    if (!existentes.has(sku)) {
      stmts.push(db.prepare(
        `INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES (?, ?, ?, ?, 0)`
      ).bind(sku, p.desc || sku, cat, preco));
      if (qtdAlvo !== 0) {
        stmts.push(...movimentar(db, {
          sku, tipo: 'entrada', quantidade: qtdAlvo, origem: 'importacao',
          obs: 'Saldo inicial da importação',
        }));
      }
      novos++;
    } else {
      stmts.push(db.prepare(
        `UPDATE produtos SET desc = ?, cat = ?, preco = ?, atualizado_em = datetime('now') WHERE sku = ?`
      ).bind(p.desc || sku, cat, preco, sku));
      // §19: a planilha traz um saldo-alvo; a diferença vira um AJUSTE rastreável
      const delta = qtdAlvo - existentes.get(sku);
      if (delta !== 0) {
        stmts.push(...movimentar(db, {
          sku, tipo: 'ajuste', quantidade: delta, origem: 'importacao',
          obs: `Importação: planilha diz ${qtdAlvo}, sistema tinha ${existentes.get(sku)}`,
        }));
        ajustados++;
      }
    }
  }

  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, novos, ajustados, avisos });
}

async function editarProduto(db, sku, b) {
  const campos = [], vals = [];
  if (b.desc !== undefined) { campos.push('desc = ?'); vals.push(String(b.desc)); }
  if (b.cat !== undefined) { campos.push('cat = ?'); vals.push(String(b.cat)); }
  if (b.preco !== undefined) { campos.push('preco = ?'); vals.push(b.preco === null ? null : +b.preco); }
  if (b.status !== undefined) { campos.push('status = ?'); vals.push(String(b.status)); }
  if (b.qtd !== undefined) {
    return json({ erro: 'Saldo não se edita direto (§19). Use POST /api/produtos/:sku/movimento' }, 400);
  }
  if (!campos.length) return json({ erro: 'Nada para atualizar' }, 400);
  campos.push("atualizado_em = datetime('now')");
  await db.prepare(`UPDATE produtos SET ${campos.join(', ')} WHERE sku = ?`).bind(...vals, sku).run();
  return json({ ok: true });
}

async function lancarMovimento(db, sku, { tipo, quantidade, obs }) {
  const p = await db.prepare(`SELECT sku FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo` }, 404);
  if (!tipo) return json({ erro: 'Informe o tipo do movimento' }, 400);
  const q = int(quantidade);
  if (q === 0) return json({ erro: 'Quantidade não pode ser zero' }, 400);
  try {
    await db.batch(movimentar(db, { sku, tipo, quantidade: q, origem: 'manual', obs }));
  } catch (e) {
    return json({ erro: String(e.message || e) }, 400);
  }
  return json({ ok: true, saldos: await saldosDoSku(db, sku) });
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
  stmts.push(db.prepare(`UPDATE produtos SET url_loja=NULL, estoque_loja=NULL, visivel=NULL`));
  for (const p of (produtos || [])) {
    stmts.push(db.prepare(`UPDATE produtos SET url_loja=?, estoque_loja=?, visivel=?, nome_loja=? WHERE sku=?`)
      .bind(p.urlLoja, p.estoqueLoja, p.visivel === null ? null : (p.visivel ? 1 : 0), p.nomeLoja || null, p.sku));
  }
  await db.batch(stmts);
  return json({ ok: true, n: (produtos || []).length });
}

/** §6.2 impede enviar mais do que o disponível.
 *  §6.1 congela o preço no envio. */
async function adicionarItens(db, maletaId, { itens }) {
  const entradas = Object.entries(itens || {}).filter(([, q]) => q > 0);
  if (!entradas.length) return json({ erro: 'Nenhum item para adicionar' }, 400);

  const maleta = await db.prepare(`SELECT * FROM maletas WHERE id = ?`).bind(maletaId).first();
  if (!maleta) return json({ erro: 'Maleta não encontrada' }, 404);
  if (maleta.status !== 'aberta') return json({ erro: `Maleta está "${maleta.status}" — só dá para montar enquanto está aberta` }, 409);

  const stmts = [], recusados = [];
  let adicionados = 0;

  for (const [sku, qtd] of entradas) {
    const s = await saldosDoSku(db, sku);
    if (!s) { recusados.push({ sku, motivo: 'não está no catálogo' }); continue; }
    if (qtd > s.disponivel) {
      recusados.push({ sku, desc: s.desc, motivo: `só tem ${s.disponivel} disponível` });
      continue;
    }
    stmts.push(db.prepare(
      `INSERT INTO maleta_itens (maleta_id, sku, qtd, preco_envio) VALUES (?, ?, ?, ?)
       ON CONFLICT(maleta_id, sku) DO UPDATE SET qtd = qtd + excluded.qtd`
    ).bind(maletaId, sku, qtd, s.preco));
    // consignação: não muda o total, mas fica na razão (§18)
    stmts.push(...movimentar(db, {
      sku, tipo: 'consignacao', quantidade: qtd, origem: 'maleta',
      maletaId, revendedoraId: maleta.rev_id, obs: `${qtd} un. para a maleta ${maletaId}`,
    }));
    adicionados++;
  }

  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, adicionados, recusados });
}

/** §7, §8, §9, §13 — conferência, motivo, venda gerada e resumo financeiro. */
async function encerrarAcerto(db, maletaId, { devolvidas, faltas }) {
  const maleta = await db.prepare(`SELECT * FROM maletas WHERE id = ?`).bind(maletaId).first();
  if (!maleta) return json({ erro: 'Maleta não encontrada' }, 404);
  if (!['aberta', 'em_acerto'].includes(maleta.status)) {
    return json({ erro: `Maleta já está "${maleta.status}"` }, 409);
  }

  const itens = (await db.prepare(
    `SELECT mi.sku, mi.qtd, mi.preco_envio, p.desc
       FROM maleta_itens mi JOIN produtos p ON p.sku = mi.sku
      WHERE mi.maleta_id = ?`).bind(maletaId).all()).results;
  const porSku = new Map(itens.map(i => [i.sku, i]));
  const enviadas = itens.reduce((s, i) => s + i.qtd, 0);

  // §24: sem preço não dá para vender nem calcular comissão — para antes de gravar
  const semPreco = [];
  for (const f of (faltas || [])) {
    const item = porSku.get(f.sku);
    if (!item) return json({ erro: `Código ${f.sku} não está nesta maleta` }, 400);
    const vendeAlgo = (f.linhas || []).some(l => l.qtd > 0 && l.destino !== 'ficou');
    if (vendeAlgo && (item.preco_envio === null || item.preco_envio === undefined)) {
      semPreco.push({ sku: f.sku, desc: item.desc });
    }
  }
  if (semPreco.length) {
    return json({
      erro: 'Há peças sem preço entre as não devolvidas. Defina o preço antes de encerrar o acerto.',
      semPreco,
    }, 409);
  }

  const cfg = await configAtual(db);
  const stmts = [];
  const vendidos = [], ficam = {};
  let perdas = 0, baixas = 0;

  const totDev = Object.entries(devolvidas || {}).reduce((s, [, q]) => s + q, 0);
  for (const [sku, q] of Object.entries(devolvidas || {})) {
    if (!(q > 0)) continue;
    stmts.push(db.prepare(`UPDATE maleta_itens SET devolvida = ? WHERE maleta_id = ? AND sku = ?`)
      .bind(q, maletaId, sku));
    stmts.push(...movimentar(db, {
      sku, tipo: 'devolucao', quantidade: q, origem: 'acerto',
      maletaId, revendedoraId: maleta.rev_id, obs: `${q} un. devolvidas no acerto`,
    }));
  }

  const itensVenda = [];
  for (const f of (faltas || [])) {
    const item = porSku.get(f.sku);
    for (const l of (f.linhas || [])) {
      if (!(l.qtd > 0)) continue;
      if (l.destino === 'ficou') { ficam[f.sku] = (ficam[f.sku] || 0) + l.qtd; continue; }
      baixas += l.qtd;
      if (l.destino === 'perdida' || l.destino === 'quebra' || l.destino === 'dano') perdas += l.qtd;
      const tipo = { vendida: 'venda', perdida: 'perda', danificada: 'dano', brinde: 'brinde', troca: 'troca' }[l.destino] || 'venda';
      itensVenda.push({ sku: f.sku, desc: item.desc, qtd: l.qtd, preco: item.preco_envio, motivo: l.destino, tipo });
      if (l.destino === 'vendida') {
        vendidos.push({ qtd: l.qtd, preco: item.preco_envio, desc: item.desc });
      }
    }
  }

  const c = calcComissao(vendidos, cfg);
  const dataAcerto = hoje();

  // §9: as peças identificadas no acerto viram uma VENDA de verdade,
  // na mesma tabela da venda de balcão, marcada com origem='acerto'.
  let vendaId = null;
  if (itensVenda.length) {
    const v = await db.prepare(
      `INSERT INTO vendas (cliente_nome, revendedora_id, maleta_id, origem, data, total)
       VALUES (NULL, ?, ?, 'acerto', ?, ?) RETURNING id`
    ).bind(maleta.rev_id, maletaId, dataAcerto, c.totalVendido).first();
    vendaId = v.id;
    for (const it of itensVenda) {
      stmts.push(db.prepare(
        `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(vendaId, it.sku, it.desc, it.qtd, it.preco || 0, it.motivo));
      stmts.push(...movimentar(db, {
        sku: it.sku, tipo: it.tipo, quantidade: it.qtd, origem: 'acerto',
        maletaId, revendedoraId: maleta.rev_id, vendaId,
        obs: `Acerto da maleta ${maletaId}: ${it.motivo}`,
      }));
    }
  }

  const acerto = {
    enviadas, devolvidas: totDev,
    vendidas: vendidos.reduce((s, v) => s + v.qtd, 0),
    perdas, baixas, vendaId,
    totalVendido: c.totalVendido,
    baseBanhada: c.baseBanhada, pct: c.pct, comissaoBanhada: c.comissaoBanhada,
    basePrata: c.basePrata, pctPrata: c.pctPrata, comissaoPrata: c.comissaoPrata,
    comissao: c.comissao, liquido: c.liquido,
    dias: maleta.aberta_em ? Math.round((Date.now() - new Date(maleta.aberta_em + 'T12:00:00')) / 86400000) : null,
  };

  stmts.push(db.prepare(`UPDATE maletas SET status='encerrada', encerrada_em=?, acerto_json=? WHERE id=?`)
    .bind(dataAcerto, JSON.stringify(acerto), maletaId));

  let novaMaletaId = null;
  if (Object.keys(ficam).length) {
    const nova = await db.prepare(
      `INSERT INTO maletas (rev_id, status, aberta_em, obs) VALUES (?, 'aberta', ?, ?) RETURNING id`
    ).bind(maleta.rev_id, dataAcerto, `Continuação da maleta ${maletaId}`).first();
    novaMaletaId = nova.id;
    for (const [sku, qtd] of Object.entries(ficam)) {
      const item = porSku.get(sku);
      stmts.push(db.prepare(
        `INSERT INTO maleta_itens (maleta_id, sku, qtd, preco_envio) VALUES (?, ?, ?, ?)`
      ).bind(novaMaletaId, sku, qtd, item.preco_envio));
      stmts.push(...movimentar(db, {
        sku, tipo: 'consignacao', quantidade: qtd, origem: 'acerto',
        maletaId: novaMaletaId, revendedoraId: maleta.rev_id,
        obs: `Ficou com a revendedora, seguiu para a maleta ${novaMaletaId}`,
      }));
    }
  }

  await db.batch(stmts);
  return json({ ok: true, acerto, novaMaletaId, vendaId });
}

/** §28: maleta errada é cancelada. As peças voltam a ficar disponíveis
 *  porque a maleta deixa de contar como consignação — e fica o registro. */
async function cancelarMaleta(db, maletaId, { motivo }) {
  const maleta = await db.prepare(`SELECT * FROM maletas WHERE id = ?`).bind(maletaId).first();
  if (!maleta) return json({ erro: 'Maleta não encontrada' }, 404);
  if (maleta.status === 'encerrada') return json({ erro: 'Maleta encerrada não pode ser cancelada' }, 409);
  if (maleta.status === 'cancelada') return json({ erro: 'Maleta já está cancelada' }, 409);

  const itens = (await db.prepare(`SELECT sku, qtd FROM maleta_itens WHERE maleta_id = ?`).bind(maletaId).all()).results;
  const stmts = itens.flatMap(i => movimentar(db, {
    sku: i.sku, tipo: 'devolucao', quantidade: i.qtd, origem: 'cancelamento',
    maletaId, revendedoraId: maleta.rev_id, obs: `Maleta ${maletaId} cancelada${motivo ? ': ' + motivo : ''}`,
  }));
  stmts.push(db.prepare(`UPDATE maletas SET status='cancelada', encerrada_em=?, obs=? WHERE id=?`)
    .bind(hoje(), motivo || 'Cancelada', maletaId));
  await db.batch(stmts);
  return json({ ok: true });
}

/** §24: peça sem preço bloqueia a venda, em vez de vender por R$ 0. */
async function registrarVenda(db, { clienteId, clienteNome, itens }) {
  const entradas = (itens || []).filter(i => i.qtd > 0);
  if (!entradas.length) return json({ erro: 'Nenhum item na venda' }, 400);
  if (!clienteNome || !clienteNome.trim()) return json({ erro: 'Nome da cliente é obrigatório' }, 400);

  const linhas = [];
  for (const { sku, qtd } of entradas) {
    const s = await saldosDoSku(db, sku);
    if (!s) return json({ erro: `Código ${sku} não está no catálogo`, sku }, 400);
    if (s.preco === null || s.preco === undefined) {
      return json({ erro: `${s.desc} está sem preço cadastrado. Defina o preço antes de vender.`, sku }, 409);
    }
    if (qtd > s.disponivel) {
      return json({ erro: `${s.desc}: só tem ${s.disponivel} disponível`, sku }, 409);
    }
    linhas.push({ sku, qtd, preco: s.preco, desc: s.desc });
  }

  const total = linhas.reduce((s, l) => s + l.preco * l.qtd, 0);
  const data = hoje();
  const venda = await db.prepare(
    `INSERT INTO vendas (cliente_id, cliente_nome, origem, data, total) VALUES (?, ?, 'balcao', ?, ?) RETURNING id`
  ).bind(clienteId || null, clienteNome.trim(), data, total).first();

  const stmts = [];
  for (const l of linhas) {
    stmts.push(db.prepare(
      `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo) VALUES (?, ?, ?, ?, ?, 'venda')`
    ).bind(venda.id, l.sku, l.desc, l.qtd, l.preco));
    stmts.push(...movimentar(db, {
      sku: l.sku, tipo: 'venda', quantidade: l.qtd, origem: 'venda',
      vendaId: venda.id, obs: `Venda ${venda.id} · ${clienteNome.trim()}`,
    }));
  }
  await db.batch(stmts);
  return json({ ok: true, id: venda.id, data, total, itens: linhas }, 201);
}

/** §19 e §28: cancelar cria movimentação inversa, não apaga a venda. */
async function cancelarVenda(db, vendaId) {
  const v = await db.prepare(`SELECT * FROM vendas WHERE id = ?`).bind(vendaId).first();
  if (!v) return json({ erro: 'Venda não encontrada' }, 404);
  if (v.cancelada) return json({ erro: 'Venda já está cancelada' }, 409);

  const itens = (await db.prepare(`SELECT * FROM venda_itens WHERE venda_id = ?`).bind(vendaId).all()).results;
  const stmts = itens.map(i => movimentar(db, {
    sku: i.sku, tipo: 'cancelamento', quantidade: +i.qtd, origem: 'cancelamento',
    vendaId, obs: `Estorno da venda ${vendaId}`,
  })).flat();
  stmts.push(db.prepare(`UPDATE vendas SET cancelada = 1 WHERE id = ?`).bind(vendaId));
  await db.batch(stmts);
  return json({ ok: true });
}

async function listarVendas(db, data) {
  const vendas = (await db.prepare(`SELECT * FROM vendas WHERE data = ? ORDER BY id`).bind(data).all()).results;
  const itens = (await db.prepare(
    `SELECT vi.* FROM venda_itens vi JOIN vendas v ON v.id = vi.venda_id WHERE v.data = ?`).bind(data).all()).results;
  const porVenda = new Map();
  for (const it of itens) {
    if (!porVenda.has(it.venda_id)) porVenda.set(it.venda_id, []);
    porVenda.get(it.venda_id).push({ sku: it.sku, desc: it.desc, qtd: it.qtd, preco: it.preco, motivo: it.motivo });
  }
  return vendas.map(v => ({
    id: v.id, origem: v.origem, clienteNome: v.cliente_nome, revendedoraId: v.revendedora_id,
    maletaId: v.maleta_id, data: v.data, total: v.total, cancelada: !!v.cancelada,
    criadaEm: v.criada_em, itens: porVenda.get(v.id) || [],
  }));
}
