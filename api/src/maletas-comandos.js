/** Consignacao: o que uma maleta faz com estoque, comissao e dinheiro.
 *
 *  Veio inteiro do despachante, sem mudanca de comportamento. Ainda devolve
 *  `Response`; separar decisao de formatacao e trabalho da Fase 6, que trata
 *  revendedoras, maletas e comissao.
 *
 *  As regras que moram aqui e nao podem mudar por refatoracao: consignar e
 *  devolver tem efeito ZERO no estoque total (EST-03), preco e congelado no
 *  envio (6.1), nao se envia mais do que o disponivel (6.2), o acerto gera
 *  venda com comissao por faixa e o cancelamento lanca contrapartida em vez
 *  de apagar (28). O empurrao de saldo para a loja acontece depois de a
 *  transacao local ter fechado, e o resultado dele faz parte da resposta. */
import { json } from './auth.js';
import { movimentar, saldosDoSku, semSaldoProprio } from './estoque.js';
import { calcComissao } from './comissao.js';
import { sincronizarSomenteEstoque } from './sync.js';
import { atualizarEstoqueDaVenda } from './vendas-estoque-nuvemshop.js';
import { FAIXAS_PADRAO } from './state.js';
import { novoVendaItemId } from './venda-item-id.js';

/* Copia deliberada do helper do despachante: uma linha vale menos que um
   modulo de utilidades criado antes de haver terceiro caso. */
const hoje = () => new Date().toISOString().slice(0, 10);

const rev = r => ({
  id: r.id, nome: r.nome, tel: r.tel || '', cidade: r.cidade || '', cpf: r.cpf || '',
  endereco: r.endereco || '', obs: r.obs || '', status: r.status, criadaEm: r.criada_em,
});

export async function configAtual(db) {
  const r = await db.prepare(`SELECT * FROM config`).all();
  const c = Object.fromEntries(r.results.map(x => [x.chave, JSON.parse(x.valor)]));
  return { prazoDias: c.prazoDias ?? 45, prataPct: c.prataPct ?? 10, faixas: c.faixas ?? FAIXAS_PADRAO };
}

export async function publicarEstoqueDaOperacao(db, env) {
  const r = await sincronizarSomenteEstoque(db, env);
  if (!r.ok) return { status: 'erro', erro: r.erro };
  if (r.pausado) return { status: 'erro', erro: r.pausado.motivo, pausado: r.pausado };
  if ((r.semEmpurrar || []).length) {
    return { status: 'revisao', bloqueios: r.semEmpurrar, produtosAtualizados: r.produtosEnviados || 0 };
  }
  return {
    status: 'sincronizada', modo: 'somente_estoque',
    produtosAtualizados: r.produtosEnviados || 0, alteracoes: (r.mudancas || []).length,
  };
}

/** §6.2 impede enviar mais do que o disponível.
 *  §6.1 congela o preço no envio. */
export async function adicionarItens(db, env, maletaId, { itens }) {
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
    // Kit não reserva os componentes ao entrar na maleta (a consignação tem
    // efeito 0 no saldo, e o disponível do kit vem só dos componentes) —
    // deixar entrar deixaria o mesmo componente "disponível" duas vezes.
    // Melhor recusar com uma explicação do que consignar errado em silêncio.
    if (semSaldoProprio(s)) {
      recusados.push({
        sku, desc: s.desc,
        motivo: s.montagem
          ? 'é uma configuração montável — a maleta leva as peças, não a montagem'
          : 'é uma peça montada (kit) — venda direto, ainda não vai para maleta',
      });
      continue;
    }
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
  const nuvemshop = adicionados ? await publicarEstoqueDaOperacao(db, env) : { status: 'nao_aplicavel' };
  return json({ ok: true, adicionados, recusados, nuvemshop });
}

const DESTINOS_ACERTO = new Set([
  'vendida', 'perdida', 'quebra', 'dano', 'danificada', 'brinde', 'troca', 'ficou',
]);

/** Nenhuma peça pode sumir nem ser contabilizada duas vezes no acerto.
 *  Valida o documento inteiro antes de qualquer INSERT ou movimento. */
export function validarDistribuicaoAcerto(itens, devolvidas, faltas) {
  if (!devolvidas || typeof devolvidas !== 'object' || Array.isArray(devolvidas)) {
    return 'Informe as quantidades devolvidas por código.';
  }
  if (!Array.isArray(faltas)) return 'Informe o destino das peças não devolvidas.';
  const porSku = new Map(itens.map(i => [i.sku, Number(i.qtd)]));
  if (!porSku.size) return 'Esta maleta está vazia.';
  const destinados = new Map();
  const vistos = new Set();
  for (const [sku, qtd] of Object.entries(devolvidas)) {
    if (!porSku.has(sku)) return 'Código ' + sku + ' não está nesta maleta.';
    if (!Number.isInteger(qtd) || qtd < 0 || qtd > porSku.get(sku)) {
      return 'Quantidade devolvida inválida para ' + sku + '.';
    }
  }
  for (const falta of faltas) {
    const sku = falta?.sku;
    if (!porSku.has(sku)) return 'Código ' + String(sku) + ' não está nesta maleta.';
    if (vistos.has(sku)) return 'Código ' + sku + ' aparece mais de uma vez no acerto.';
    vistos.add(sku);
    if (!Array.isArray(falta.linhas) || !falta.linhas.length) {
      return 'Informe o destino das peças de ' + sku + '.';
    }
    let total = 0;
    for (const linha of falta.linhas) {
      if (!Number.isInteger(linha?.qtd) || linha.qtd <= 0
          || !DESTINOS_ACERTO.has(linha.destino)) {
        return 'Quantidade ou destino inválido para ' + sku + '.';
      }
      total += linha.qtd;
    }
    destinados.set(sku, total);
  }
  for (const [sku, qtd] of porSku) {
    if ((devolvidas[sku] || 0) + (destinados.get(sku) || 0) !== qtd) {
      return 'Confira ' + sku + ': devolvidas e destinadas devem somar ' + qtd + '.';
    }
  }
  return null;
}

/** §7, §8, §9, §13 — conferência, motivo, venda gerada e resumo financeiro. */
export async function encerrarAcerto(db, env, maletaId, { devolvidas, faltas }) {
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
  const distribuicaoInvalida = validarDistribuicaoAcerto(itens, devolvidas, faltas);
  if (distribuicaoInvalida) return json({ erro: distribuicaoInvalida }, 400);

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
      if (['perdida', 'quebra', 'dano', 'danificada'].includes(l.destino)) perdas += l.qtd;
      const tipo = { vendida: 'venda', perdida: 'perda', quebra: 'quebra', dano: 'dano', danificada: 'dano', brinde: 'brinde', troca: 'troca' }[l.destino];
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
    /* `externo_id` já é protegido por índice UNIQUE. A identidade estável
       fecha a janela de dois cliques/retries criarem duas vendas para a
       mesma maleta. Se uma queda dura acontecer depois do INSERT e antes do
       batch, a venda órfã fica exposta como conflito para revisão; uma nova
       venda nunca é criada silenciosamente por cima dela. */
    const chaveAcerto = `acerto:maleta:${maletaId}`;
    let v = await db.prepare(
      `SELECT v.id,
              (SELECT COUNT(*) FROM venda_itens vi WHERE vi.venda_id = v.id) AS itens,
              (SELECT COUNT(*) FROM movimentos mv WHERE mv.venda_id = v.id) AS movimentos
         FROM vendas v WHERE v.externo_id = ? LIMIT 1`
    ).bind(chaveAcerto).first();
    if (v) return json({
      erro: Number(v.itens) > 0 || Number(v.movimentos) > 0
        ? 'Este acerto já possui gravações. Atualize a tela antes de tentar novamente.'
        : 'Há um acerto interrompido para esta maleta. Nenhuma nova venda foi criada; revise antes de continuar.',
    }, 409);
    try {
      v = await db.prepare(
        `INSERT INTO vendas (cliente_nome, revendedora_id, maleta_id, origem, data, total,
                             externo_id, nuvemshop_status)
         VALUES (NULL, ?, ?, 'acerto', ?, ?, ?, 'pendente') RETURNING id, 0 AS itens, 0 AS movimentos`
      ).bind(maleta.rev_id, maletaId, dataAcerto, c.totalVendido, chaveAcerto).first();
    } catch (erro) {
      if (/unique|externo/i.test(String(erro))) {
        return json({ erro: 'Este acerto já está sendo processado. Atualize a tela.' }, 409);
      }
      throw erro;
    }
    vendaId = v.id;
    for (const it of itensVenda) {
      stmts.push(db.prepare(
        `INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(vendaId, it.sku, it.desc, it.qtd, it.preco || 0, it.motivo, novoVendaItemId()));
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

  try {
    await db.batch(stmts);
  } catch (erro) {
    /* O batch é atômico. Estes dois INSERTs precisaram ocorrer antes dele
       para obter seus ids; se o batch recusar, removemos somente os
       registros ainda órfãos. Um crash duro continua visível como conflito
       na próxima tentativa, em vez de produzir uma segunda venda. */
    if (novaMaletaId) await db.prepare(
      `DELETE FROM maletas WHERE id=? AND NOT EXISTS
       (SELECT 1 FROM maleta_itens WHERE maleta_id=?)`
    ).bind(novaMaletaId, novaMaletaId).run();
    if (vendaId) await db.prepare(
      `DELETE FROM vendas WHERE id=? AND externo_id=?
         AND NOT EXISTS (SELECT 1 FROM venda_itens WHERE venda_id=?)
         AND NOT EXISTS (SELECT 1 FROM movimentos WHERE venda_id=?)`
    ).bind(vendaId, `acerto:maleta:${maletaId}`, vendaId, vendaId).run();
    throw erro;
  }
  // Mesmo um acerto sem venda pode devolver todas as peças para casa e,
  // portanto, precisa aumentar o estoque online imediatamente.
  const nuvemshop = vendaId
    ? await atualizarEstoqueDaVenda(db, env, vendaId)
    : await publicarEstoqueDaOperacao(db, env);
  return json({ ok: true, acerto, novaMaletaId, vendaId, nuvemshop });
}

/** §28: maleta errada é cancelada. As peças voltam a ficar disponíveis
 *  porque a maleta deixa de contar como consignação — e fica o registro. */
export async function cancelarMaleta(db, env, maletaId, { motivo }) {
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
  const nuvemshop = itens.length ? await publicarEstoqueDaOperacao(db, env) : { status: 'nao_aplicavel' };
  return json({ ok: true, nuvemshop });
}

export async function criarRevendedora(db, request) {
  const { nome, tel, cidade, cpf, endereco, obs } = await request.json();
  if (!nome || !nome.trim()) return json({ erro: 'Nome é obrigatório' }, 400);
  const r = await db.prepare(
    `INSERT INTO revendedoras (nome, tel, cidade, cpf, endereco, obs) VALUES (?,?,?,?,?,?) RETURNING *`
  ).bind(nome.trim(), tel || '', cidade || '', cpf || '', endereco || '', obs || '').first();
  return json(rev(r), 201);
}

export async function atualizarRevendedora(db, id, request) {
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
export async function arquivarRevendedora(db, id) {
  const abertas = await db.prepare(
    `SELECT COUNT(*) AS n FROM maletas WHERE rev_id = ? AND status IN ('aberta','em_acerto')`).bind(id).first();
  if (abertas.n > 0) {
    return json({ erro: `Esta revendedora tem ${abertas.n} maleta(s) em aberto. Encerre ou cancele antes de arquivar.` }, 409);
  }
  await db.prepare(`UPDATE revendedoras SET status = 'inativa' WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

export async function criarMaleta(db, request) {
  const { revId, abertaEm, acertoEm, obs } = await request.json();
  const r = await db.prepare(
    `INSERT INTO maletas (rev_id, status, aberta_em, acerto_em, obs) VALUES (?, 'aberta', ?, ?, ?) RETURNING *`
  ).bind(revId, abertaEm || null, acertoEm || null, obs || null).first();
  return json({ id: r.id, revId: r.rev_id, status: r.status, abertaEm: r.aberta_em, acertoEm: r.acerto_em, itens: {} }, 201);
}

export async function atualizarMaleta(db, id, request) {
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
