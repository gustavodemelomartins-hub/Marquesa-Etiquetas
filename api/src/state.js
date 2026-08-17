/** Monta o "state" no formato que o dashboard já conhece, agora incluindo
 *  os três saldos do §5.2 (total, consignado, disponível) calculados no
 *  servidor — em vez de cada aparelho fazer a própria conta. */

const FAIXAS_PADRAO = [
  { limite: 800, pct: 0 },
  { limite: 1000, pct: 15 },
  { limite: 1500, pct: 25 },
  { limite: 6000, pct: 30 },
  { limite: 10000, pct: 35 },
  { limite: null, pct: 40 },
];

import { resumoInventario } from './inventario.js';
import { resumoSync } from './sync.js';

export async function montarState(db, env) {
  const [produtosR, revR, maletasR, itensR, configR, lojaR, catR, kitsR] = await Promise.all([
    db.prepare('SELECT * FROM produtos ORDER BY desc').all(),
    db.prepare('SELECT * FROM revendedoras ORDER BY id').all(),
    db.prepare('SELECT * FROM maletas ORDER BY id').all(),
    db.prepare('SELECT * FROM maleta_itens').all(),
    db.prepare('SELECT * FROM config').all(),
    db.prepare('SELECT * FROM loja_snapshot WHERE id = 1').all(),
    db.prepare('SELECT * FROM categorias ORDER BY ordem, nome').all(),
    db.prepare(`SELECT kc.kit_sku, kc.componente_sku, kc.qtd, p.desc
                  FROM kit_componentes kc JOIN produtos p ON p.sku = kc.componente_sku`).all(),
  ]);

  // consignado por SKU: só maletas que ainda não encerraram
  const abertas = new Set(maletasR.results
    .filter(m => m.status === 'aberta' || m.status === 'em_acerto').map(m => m.id));
  const consignado = {};
  const itensPorMaleta = new Map();
  for (const it of itensR.results) {
    if (!itensPorMaleta.has(it.maleta_id)) itensPorMaleta.set(it.maleta_id, {});
    itensPorMaleta.get(it.maleta_id)[it.sku] = it.qtd;
    if (abertas.has(it.maleta_id)) {
      consignado[it.sku] = (consignado[it.sku] || 0) + (it.qtd - (it.devolvida || 0));
    }
  }

  // Kit: agrupa os componentes por kit_sku. O disponível dele não é
  // p.qtd − consignado (isso daria sempre 0, porque um kit nunca tem saldo
  // próprio) — é o mínimo, entre os componentes, de quanto cada um permite
  // montar. Dois kits que compartilham um componente disputam o mesmo
  // número: é o que impede publicar os dois anúncios como "disponível"
  // ao mesmo tempo quando só existe peça física para um.
  const componentesPorKit = new Map();
  for (const k of kitsR.results) {
    if (!componentesPorKit.has(k.kit_sku)) componentesPorKit.set(k.kit_sku, []);
    componentesPorKit.get(k.kit_sku).push({ sku: k.componente_sku, qtd: k.qtd, desc: k.desc });
  }
  const dispBase = new Map(produtosR.results.map(p => [p.sku, p.qtd - (consignado[p.sku] || 0)]));

  const produtos = produtosR.results.map(p => {
    const componentes = componentesPorKit.get(p.sku);
    const disponivel = componentes
      ? Math.min(...componentes.map(c => Math.floor((dispBase.get(c.sku) ?? 0) / c.qtd)))
      : dispBase.get(p.sku);
    return {
      sku: p.sku, desc: p.desc, cat: p.cat,
      preco: p.preco,                       // §24: null = sem preço; o front mostra "Sem preço"
      semPreco: p.preco === null,
      qtd: p.qtd,
      consignado: consignado[p.sku] || 0,
      disponivel,
      status: p.status,
      urlLoja: p.url_loja || undefined,
      estoqueLoja: p.estoque_loja == null ? undefined : p.estoque_loja,
      visivel: p.visivel == null ? null : !!p.visivel,
      nomeLoja: p.nome_loja || undefined,
      componentes: componentes || undefined,   // presença = "isto é um kit"
    };
  });

  const revendedoras = revR.results.map(r => ({
    id: r.id, nome: r.nome, tel: r.tel || '', cidade: r.cidade || '', cpf: r.cpf || '',
    endereco: r.endereco || '', obs: r.obs || '', status: r.status, criadaEm: r.criada_em,
  }));

  const precos = new Map(itensR.results.map(i => [`${i.maleta_id}|${i.sku}`, i.preco_envio]));
  const maletas = maletasR.results.map(m => ({
    id: m.id, revId: m.rev_id, status: m.status,
    abertaEm: m.aberta_em || null, acertoEm: m.acerto_em || null,
    encerradaEm: m.encerrada_em || null, obs: m.obs || undefined,
    itens: itensPorMaleta.get(m.id) || {},
    // §6.1: o preço congelado viaja junto, para a tela somar pelo valor do envio
    precos: Object.fromEntries(Object.keys(itensPorMaleta.get(m.id) || {})
      .map(sku => [sku, precos.get(`${m.id}|${sku}`)])),
    acerto: m.acerto_json ? JSON.parse(m.acerto_json) : undefined,
  }));

  const c = Object.fromEntries(configR.results.map(x => [x.chave, JSON.parse(x.valor)]));
  const config = {
    prazoDias: c.prazoDias ?? 45,
    prataPct: c.prataPct ?? 10,
    inventarioDias: c.inventarioDias ?? 30,
    faixas: c.faixas ?? FAIXAS_PADRAO,
  };

  const inventario = await resumoInventario(db, config.inventarioDias);
  const sync = await resumoSync(db, env || {});

  const l = lojaR.results[0];
  const loja = l ? {
    lidoEm: l.lido_em, produtosNaLoja: l.produtos_na_loja, produtosCasados: l.produtos_casados,
    soNaLoja: l.so_na_loja, codigosCasados: l.codigos_casados,
    duplicados: JSON.parse(l.duplicados_json || '[]'),
    // códigos que na loja são mais de uma variação (tamanho/cor): a
    // sincronização não mexe no estoque deles e a tela precisa dizer isso
    variacoes: c.lojaVariacoes ?? [],
  } : null;

  return {
    v: 2, produtos, revendedoras, maletas, config, loja, inventario, sync,
    categorias: catR.results.map(x => ({ nome: x.nome, ordem: x.ordem, cor: x.cor })),
  };
}

export { FAIXAS_PADRAO };
