/** §64 — "Quantas são de cada variação?" — quando o INVENTÁRIO já respondeu.
 *
 *  O inventário #1 (06–08/10/2026) bipou cada peça com a variação dela:
 *  "334079 nº17", "334079 nº17", "334079 nº14"… A conferência fechou por
 *  CÓDIGO (5 contadas, 5 esperadas), e a divisão contada ficou só no
 *  registro da contagem — o saldo continuou "sem variação". Resultado: 8
 *  códigos em "Conferir estoque por variação" perguntando a uma pessoa um
 *  número que ela já tinha dado, peça por peça, dois dias antes.
 *
 *  Aqui o sistema usa essa resposta — e só quando ela PROVA a divisão:
 *
 *    1. a contagem é do último inventário concluído, o código fechou
 *       conferido (contado = esperado) e nenhuma peça foi bipada sem
 *       variação;
 *    2. nenhum movimento do código depois do fim do inventário — venda,
 *       entrada, maleta (consignação e devolução também são movimento);
 *    3. contado por variação + o que as maletas abertas já identificaram =
 *       o total do código, exatamente. Peça em maleta sem variação
 *       identificada impede: aí a pergunta "qual a revendedora levou?" é
 *       real, e continua sendo dela;
 *    4. cada variação contada corresponde a UMA variação cadastrada (aqui
 *       ou na loja), pela mesma chave de sempre (`chaveDaVariacao`).
 *
 *  Passando, a repartição é gravada pelo MESMO caminho da tela
 *  (`distribuirVariantes`, modo parcial): dois movimentos que se anulam no
 *  total por variação, com a origem escrita na observação. Nenhum total
 *  muda, nenhuma venda é tocada. Falhando qualquer item, nada é escrito
 *  para aquele código — e o motivo vai no relato.
 */
import { distribuirVariantes } from '../variantes.js';
import { chaveDaVariacao, equivalenciasLojaLocal } from '../variacao-nome.js';
import { normSku } from '../sku.js';

const todas = async (db, sql, args = []) => (await db.prepare(sql).bind(...args).all()).results || [];

function enfileirarStmt(db, sku, motivo) {
  return db.prepare(
    `INSERT INTO nuvemshop_fila (sku, status, motivo, versao, pedido_em, tentativas)
     VALUES (?, 'pendente', ?, 1, ?, 0)
     ON CONFLICT(sku) DO UPDATE SET
       status = 'pendente', motivo = excluded.motivo,
       versao = nuvemshop_fila.versao + 1, pedido_em = excluded.pedido_em,
       tentativas = 0, proxima_em = NULL`,
  ).bind(String(sku), motivo || null, new Date().toISOString());
}

/** A prova, para cada código candidato — sem escrever nada. Poucas
 *  consultas para todos juntos (teto de 50 por invocação no D1 Free). */
export async function provasDoInventario(db, { skus = null } = {}) {
  let inv;
  try {
    inv = await db.prepare(
      `SELECT id, numero, concluido_em FROM inventarios WHERE status = 'concluido' AND concluido_em IS NOT NULL
        ORDER BY concluido_em DESC LIMIT 1`).first();
  } catch { return { inventario: null, provas: [] }; }
  if (!inv) return { inventario: null, provas: [] };

  /* Candidato: tem saldo sem variação E foi contado por variação. */
  const semVariacao = new Map((await todas(db,
    `SELECT sku, SUM(qtd) AS s FROM movimentos WHERE variacao IS NULL AND variante_id IS NULL
      GROUP BY sku HAVING SUM(qtd) <> 0`)).map((r) => [String(r.sku), Number(r.s)]));
  const contagem = await todas(db,
    `SELECT sku, variacao, SUM(contado) AS contado FROM inventario_contagem WHERE inventario_id = ?
      GROUP BY sku, variacao`, [inv.id]);
  const porSku = new Map();
  for (const r of contagem) {
    const k = String(r.sku);
    if (!porSku.has(k)) porSku.set(k, []);
    porSku.get(k).push(r);
  }
  const filtro = Array.isArray(skus) && skus.length ? new Set(skus.map((s) => normSku(s))) : null;
  const candidatos = [...porSku.keys()].filter((k) => semVariacao.has(k)
    && porSku.get(k).some((r) => r.variacao && Number(r.contado) > 0) && (!filtro || filtro.has(k)));
  if (!candidatos.length) return { inventario: inv, provas: [] };

  const marcas = candidatos.map(() => '?').join(',');
  const [produtos, resultados, depois, consignado, identificado, loja, locais] = await Promise.all([
    todas(db, `SELECT sku, desc, qtd FROM produtos WHERE sku IN (${marcas})`, candidatos),
    todas(db, `SELECT sku, contado, esperado, situacao FROM inventario_resultado
                WHERE inventario_id = ? AND variacao = '' AND sku IN (${marcas})`, [inv.id, ...candidatos]),
    todas(db, `SELECT sku, COUNT(*) AS n FROM movimentos WHERE criado_em > ? AND sku IN (${marcas}) GROUP BY sku`,
      [inv.concluido_em, ...candidatos]),
    todas(db, `SELECT mi.sku, COALESCE(SUM(mi.qtd - mi.devolvida), 0) AS n FROM maleta_itens mi
                 JOIN maletas m ON m.id = mi.maleta_id
                WHERE m.status IN ('aberta','em_acerto') AND mi.sku IN (${marcas}) GROUP BY mi.sku`, candidatos),
    todas(db, `SELECT mv.sku, mv.variacao, mv.variante_id, SUM(mv.qtd) AS n FROM maleta_item_variacoes mv
                 JOIN maletas m ON m.id = mv.maleta_id
                WHERE m.status IN ('aberta','em_acerto') AND mv.sku IN (${marcas}) GROUP BY mv.sku, mv.variacao, mv.variante_id`, candidatos)
      .catch(() => []),
    todas(db, `SELECT sku_norm AS sku, variante_id, nome FROM loja_variantes WHERE sku_norm IN (${marcas})`, candidatos),
    todas(db, `SELECT sku, nome, variante_id, origem FROM produto_variacoes WHERE variante_id IS NOT NULL AND sku IN (${marcas})`, candidatos),
  ]);
  const um = (linhas) => new Map(linhas.map((r) => [String(r.sku), r]));
  const varios = (linhas) => {
    const m = new Map();
    for (const r of linhas) { const k = String(r.sku); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  };
  const P = um(produtos), R = um(resultados), D = um(depois), C = um(consignado);
  const I = varios(identificado), L = varios(loja), V = varios(locais);

  const provas = candidatos.map((sku) => {
    const p = P.get(sku);
    const recusa = (motivo) => ({ sku, desc: p?.desc ?? null, prova: false, motivo });
    if (!p) return recusa('o código não existe mais');
    const res = R.get(sku);
    const linhas = porSku.get(sku);
    const bipadasSemVariacao = linhas.filter((r) => !r.variacao).reduce((s, r) => s + Number(r.contado || 0), 0);
    const porVariacao = linhas.filter((r) => r.variacao && Number(r.contado) > 0);
    const contado = porVariacao.reduce((s, r) => s + Number(r.contado), 0);
    if (!res || res.situacao !== 'conferido' || Number(res.contado) !== Number(res.esperado)) {
      return recusa('o código não fechou conferido no inventário');
    }
    if (bipadasSemVariacao > 0) return recusa('houve peça bipada sem variação');
    if (contado !== Number(res.contado)) return recusa('a contagem por variação não soma o contado do código');
    if (Number(D.get(sku)?.n || 0) > 0) return recusa('o código teve movimento depois do inventário');

    /* Destinos possíveis: variações daqui e variantes da loja. A daqui vem
       primeiro — é nela que a tela dobra a variante equivalente da loja. */
    const destinos = [
      ...(V.get(sku) || []).map((v) => ({ id: String(v.variante_id), nome: v.nome, daqui: true })),
      ...(L.get(sku) || []).map((v) => ({ id: String(v.variante_id), nome: v.nome, daqui: false })),
    ];
    const vistos = new Set();
    const unicos = destinos.filter((d) => (vistos.has(d.id) ? false : vistos.add(d.id)));
    const destinoDe = (nome) => {
      const k = chaveDaVariacao(nome);
      const daqui = unicos.filter((d) => d.daqui && chaveDaVariacao(d.nome) === k);
      if (daqui.length === 1) return daqui[0];
      if (daqui.length > 1) return null;
      const lojas = unicos.filter((d) => !d.daqui && chaveDaVariacao(d.nome) === k);
      return lojas.length === 1 ? lojas[0] : null;
    };

    const alvo = new Map();   // id → { nome, qtd }
    for (const r of porVariacao) {
      const d = destinoDe(r.variacao);
      if (!d) return recusa(`a variação contada "${r.variacao}" não corresponde a uma única variação cadastrada`);
      const a = alvo.get(d.id) || { nome: d.nome, qtd: 0, casa: 0, maleta: 0 };
      a.qtd += Number(r.contado); a.casa += Number(r.contado);
      alvo.set(d.id, a);
    }
    const fora = Number(C.get(sku)?.n || 0);
    let identificadas = 0;
    for (const m of I.get(sku) || []) {
      const d = (m.variante_id && unicos.find((x) => x.id === String(m.variante_id))) || destinoDe(m.variacao);
      if (!d) return recusa('uma peça de maleta está identificada numa variação que não existe mais');
      const a = alvo.get(d.id) || { nome: d.nome, qtd: 0, casa: 0, maleta: 0 };
      a.qtd += Number(m.n); a.maleta += Number(m.n);
      alvo.set(d.id, a);
      identificadas += Number(m.n);
    }
    if (fora > identificadas) {
      return recusa(`${fora - identificadas} peça(s) em maleta sem variação identificada`);
    }
    const soma = [...alvo.values()].reduce((s, a) => s + a.qtd, 0);
    if (soma !== Number(p.qtd)) return recusa(`a contagem (${soma}) não fecha com o total do código (${p.qtd})`);
    /* Anúncio de variante ÚNICA: hoje ele recebe o total do código. Depois
       de repartir, recebe o saldo da variação equivalente a ele — e se
       nenhuma variação contada for ela, o código sairia da sincronização.
       Repartir não pode piorar o que funciona. */
    const daLoja = L.get(sku) || [];
    if (daLoja.length === 1) {
      const unica = daLoja[0];
      const alvos = [...alvo.entries()].map(([id, a]) => ({ variante_id: id, nome: a.nome }));
      const eq = equivalenciasLojaLocal([unica], alvos.filter((a) => a.variante_id !== String(unica.variante_id)));
      if (!alvo.has(String(unica.variante_id)) && !eq.has(String(unica.variante_id))) {
        return recusa(`a variante única da loja ("${unica.nome}") não corresponde a nenhuma variação contada`);
      }
    }
    return {
      sku, desc: p.desc, prova: true, total: Number(p.qtd),
      distribuicao: [...alvo.entries()].map(([varianteId, a]) => ({ varianteId, nome: a.nome, qtd: a.qtd, casa: a.casa, maleta: a.maleta })),
    };
  });
  return { inventario: inv, provas };
}

/** §66 — QUANTAS PEÇAS DE CADA VARIAÇÃO ESTÃO EM CASA, pelo inventário.
 *
 *  Não é a repartição do código (essa exige saber também o que está nas
 *  maletas). É só o que está EM CASA — que é o que a loja vende. O
 *  inventário bipou cada peça de casa com a variação dela; se nada se moveu
 *  depois, a casa de cada variação é exatamente o que foi contado, e a
 *  variação que não apareceu na contagem tem ZERO em casa. Peça de maleta
 *  sem variação identificada não muda isso: ela não está em casa.
 *
 *  O caso real (10/10/2026): 17 códigos publicados com a maleta sem dizer a
 *  variação ficavam em revisão — e a loja seguia com o número antigo. O
 *  218178 tinha 1 peça em casa (nº18, bipada) e a loja vendia n°20 = 3 e
 *  n°17 = 1.
 *
 *  Prova, por código: último inventário concluído; fechou conferido
 *  (contado = esperado); nenhuma peça bipada sem variação; nenhum movimento
 *  depois do fim — fora a própria repartição pelo inventário, que soma zero
 *  em casa. A soma contada = casa de AGORA é conferida por quem usa.
 *  Devolve Map(sku → { inventario, total, contado: [{ variacao, variante_id, contado }] }). */
export async function casaPeloInventario(db, skus = null) {
  const pedidos = Array.isArray(skus) ? [...new Set(skus.map(String))] : null;
  if (pedidos && !pedidos.length) return new Map();
  /* Lista longa demais para um IN (o D1 limita os parâmetros): lê tudo e
     filtra no fim. */
  const lista = pedidos && pedidos.length <= 80 ? pedidos : null;
  let inv;
  try {
    inv = await db.prepare(
      `SELECT id, numero, concluido_em FROM inventarios WHERE status = 'concluido' AND concluido_em IS NOT NULL
        ORDER BY concluido_em DESC LIMIT 1`).first();
  } catch { return new Map(); }
  if (!inv) return new Map();
  const marcas = lista ? lista.map(() => '?').join(',') : '';
  const f = (col) => (lista ? ` AND ${col} IN (${marcas})` : '');
  const A = lista || [];
  let contagem, resultados, depois;
  try {
    [contagem, resultados, depois] = await Promise.all([
      todas(db, `SELECT sku, variacao, variante_id, SUM(contado) AS contado FROM inventario_contagem
                  WHERE inventario_id = ?${f('sku')} GROUP BY sku, variacao, variante_id`, [inv.id, ...A]),
      todas(db, `SELECT sku, contado, esperado, situacao FROM inventario_resultado
                  WHERE inventario_id = ? AND variacao = ''${f('sku')}`, [inv.id, ...A]),
      todas(db, `SELECT sku, COUNT(*) AS n FROM movimentos
                  WHERE criado_em > ?${f('sku')}
                    AND NOT (tipo = 'ajuste' AND COALESCE(obs, '') LIKE 'Inventário #% a bipagem por variação provou%')
                  GROUP BY sku`, [inv.concluido_em, ...A]),
    ]);
  } catch { return new Map(); }
  const R = new Map(resultados.map((r) => [String(r.sku), r]));
  const D = new Set(depois.filter((r) => Number(r.n) > 0).map((r) => String(r.sku)));
  const porSku = new Map();
  for (const r of contagem) {
    const k = String(r.sku);
    if (!porSku.has(k)) porSku.set(k, []);
    porSku.get(k).push(r);
  }
  const saida = new Map();
  for (const [sku, linhas] of porSku) {
    const res = R.get(sku);
    if (!res || res.situacao !== 'conferido' || Number(res.contado) !== Number(res.esperado)) continue;
    if (D.has(sku)) continue;
    if (linhas.some((r) => !r.variacao && !r.variante_id && Number(r.contado) > 0)) continue;
    const contado = linhas.filter((r) => (r.variacao || r.variante_id) && Number(r.contado) > 0)
      .map((r) => ({ variacao: r.variacao, variante_id: r.variante_id == null ? null : String(r.variante_id), contado: Number(r.contado) }));
    const total = contado.reduce((s, r) => s + r.contado, 0);
    if (total !== Number(res.contado)) continue;
    if (pedidos && !pedidos.includes(sku)) continue;
    saida.set(sku, { inventario: { id: inv.id, numero: inv.numero, concluidoEm: inv.concluido_em }, total, contado });
  }
  return saida;
}

/** Grava a repartição provada (no máximo `limite` códigos por chamada). */
export async function repartirPeloInventario(db, { seco = true, limite = 4, skus = null } = {}) {
  const { inventario, provas } = await provasDoInventario(db, { skus });
  const relato = {
    ok: true, seco, inventario: inventario ? { id: inventario.id, numero: inventario.numero, concluidoEm: inventario.concluido_em } : null,
    provados: provas.filter((x) => x.prova).length, recusados: provas.filter((x) => !x.prova).length,
    repartidos: 0, erros: 0, itens: [],
  };
  if (seco) {
    relato.itens = provas.map((x) => ({ ...x, acao: x.prova ? 'provado' : 'recusado', erro: x.prova ? undefined : x.motivo }));
    return relato;
  }
  const stmts = [];
  for (const x of provas.filter((y) => y.prova).slice(0, limite)) {
    const lista = x.distribuicao.map((d) => `${d.nome} ${d.qtd}`).join(', ');
    const r = await distribuirVariantes(db, x.sku, {
      parcial: true,
      distribuicao: x.distribuicao.map((d) => ({ varianteId: d.varianteId, qtd: d.qtd })),
      obs: `Inventário #${inventario.numero ?? inventario.id} (concluído em ${String(inventario.concluido_em).slice(0, 16)}): `
        + `a bipagem por variação provou a divisão — ${lista}`,
    });
    if (r.ok) {
      relato.repartidos++;
      stmts.push(enfileirarStmt(db, x.sku, 'reparticao_inventario'));
      relato.itens.push({ sku: x.sku, acao: 'repartido', distribuicao: x.distribuicao, mudou: r.mudou });
    } else {
      relato.erros++;
      relato.itens.push({ sku: x.sku, acao: 'erro', erro: r.erro });
    }
  }
  if (stmts.length) await db.batch(stmts);
  return relato;
}

