/** Monta o "state" inteiro no mesmo formato que o dashboard já conhece —
 *  para o front-end trocar localStorage por fetch() sem reescrever as
 *  telas, só a camada que lê e grava. */

const FAIXAS_PADRAO = [
  { limite: 800, pct: 0 },
  { limite: 1000, pct: 15 },
  { limite: 1500, pct: 25 },
  { limite: 6000, pct: 30 },
  { limite: 10000, pct: 35 },
  { limite: null, pct: 40 },
];

export async function montarState(db) {
  const [produtosR, revR, maletasR, itensR, configR, lojaR] = await Promise.all([
    db.prepare('SELECT * FROM produtos ORDER BY desc').all(),
    db.prepare('SELECT * FROM revendedoras ORDER BY id').all(),
    db.prepare('SELECT * FROM maletas ORDER BY id').all(),
    db.prepare('SELECT * FROM maleta_itens').all(),
    db.prepare('SELECT * FROM config').all(),
    db.prepare('SELECT * FROM loja_snapshot WHERE id = 1').all(),
  ]);

  const itensPorMaleta = new Map();
  for (const it of itensR.results) {
    if (!itensPorMaleta.has(it.maleta_id)) itensPorMaleta.set(it.maleta_id, {});
    itensPorMaleta.get(it.maleta_id)[it.sku] = it.qtd;
  }

  const produtos = produtosR.results.map(p => ({
    sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco, qtd: p.qtd,
    urlLoja: p.url_loja || undefined,
    estoqueLoja: p.estoque_loja == null ? undefined : p.estoque_loja,
    visivel: p.visivel == null ? null : !!p.visivel,
    nomeLoja: p.nome_loja || undefined,
  }));

  const revendedoras = revR.results.map(r => ({
    id: r.id, nome: r.nome, tel: r.tel || '', cidade: r.cidade || '',
    cpf: r.cpf || '', criadaEm: r.criada_em,
  }));

  const maletas = maletasR.results.map(m => ({
    id: m.id, revId: m.rev_id, status: m.status,
    abertaEm: m.aberta_em || null, acertoEm: m.acerto_em || null,
    fechadaEm: m.fechada_em || null, obs: m.obs || undefined,
    itens: itensPorMaleta.get(m.id) || {},
    acerto: m.acerto_json ? JSON.parse(m.acerto_json) : undefined,
  }));

  const configRows = Object.fromEntries(configR.results.map(c => [c.chave, JSON.parse(c.valor)]));
  const config = {
    prazoDias: configRows.prazoDias ?? 45,
    prataPct: configRows.prataPct ?? 10,
    faixas: configRows.faixas ?? FAIXAS_PADRAO,
  };

  const lojaRow = lojaR.results[0];
  const loja = lojaRow ? {
    lidoEm: lojaRow.lido_em,
    produtosNaLoja: lojaRow.produtos_na_loja,
    produtosCasados: lojaRow.produtos_casados,
    soNaLoja: lojaRow.so_na_loja,
    codigosCasados: lojaRow.codigos_casados,
    duplicados: JSON.parse(lojaRow.duplicados_json || '[]'),
  } : null;

  return { v: 1, produtos, revendedoras, maletas, config, loja };
}

export { FAIXAS_PADRAO };
