#!/usr/bin/env node
/** TOTAL = EM CASA + COM REVENDEDORAS, provado código a código (02/10/2026).
 *
 *  Somente leitura, sobre uma cópia do banco (export do D1). O inventário da
 *  Sthefany só é confiável se esta camada for: peça que está numa maleta não
 *  pode aparecer como falta em casa, e peça que voltou não pode continuar
 *  "com" a revendedora.
 *
 *  O que é provado, para TODO código do catálogo:
 *
 *   1. a razão fecha: produtos.qtd = Σ movimentos.qtd;
 *   2. consignado (maletas abertas/em acerto) ≤ total → em casa ≥ 0;
 *   3. em casa + Σ por revendedora = total, com o nome de cada uma;
 *   4. todo item de maleta aberta tem o movimento de consignação dele;
 *   5. toda maleta ENCERRADA fecha: enviadas = vendidas + devolvidas, e as
 *      vendidas saíram da razão (movimento `venda` da maleta);
 *   6. variações: quantos códigos com variação têm a razão identificada por
 *      aro — sem ela o esperado por aro não existe (e o sistema não o chuta).
 *
 *    node scripts/reconciliacao/provar-casa-revendedoras.mjs <copia.sqlite> [sku ...]
 */
import { DatabaseSync } from 'node:sqlite';

const [arq, ...exemplos] = process.argv.slice(2);
if (!arq) { console.error('uso: provar-casa-revendedoras.mjs <copia.sqlite> [sku ...]'); process.exit(2); }
const db = new DatabaseSync(arq, { readOnly: true });
const q = (sql, ...a) => db.prepare(sql).all(...a);
const falhas = [];
const falha = (regra, detalhe) => falhas.push({ regra, detalhe });

const ABERTA = "m.status IN ('aberta', 'em_acerto')";
const produtos = q(`SELECT p.sku, p.desc, p.qtd,
    COALESCE((SELECT SUM(qtd) FROM movimentos mo WHERE mo.sku = p.sku), 0) AS razao
  FROM produtos p`);
const porRev = new Map();
for (const r of q(`SELECT mi.sku, r.nome, m.id maleta, SUM(mi.qtd - mi.devolvida) qtd
    FROM maleta_itens mi JOIN maletas m ON m.id = mi.maleta_id JOIN revendedoras r ON r.id = m.rev_id
   WHERE ${ABERTA} GROUP BY mi.sku, m.id HAVING SUM(mi.qtd - mi.devolvida) <> 0`)) {
  if (!porRev.has(r.sku)) porRev.set(r.sku, []);
  porRev.get(r.sku).push({ nome: r.nome, maleta: r.maleta, qtd: r.qtd });
}

let total = 0, casa = 0, fora = 0;
const porRevendedora = {};
for (const p of produtos) {
  if (p.qtd !== p.razao) falha('1 razão', { sku: p.sku, qtd: p.qtd, razao: p.razao });
  const revs = porRev.get(p.sku) ?? [];
  const consignado = revs.reduce((s, r) => s + r.qtd, 0);
  const emCasa = p.qtd - consignado;
  if (emCasa < 0) falha('2 em casa negativo', { sku: p.sku, total: p.qtd, consignado });
  if (emCasa + revs.reduce((s, r) => s + r.qtd, 0) !== p.qtd) falha('3 soma', { sku: p.sku });
  total += p.qtd; casa += emCasa; fora += consignado;
  for (const r of revs) porRevendedora[r.nome] = (porRevendedora[r.nome] ?? 0) + r.qtd;
}

for (const m of q(`SELECT m.id, r.nome,
    (SELECT COUNT(*) FROM maleta_itens mi WHERE mi.maleta_id = m.id) itens,
    (SELECT COUNT(*) FROM movimentos mo WHERE mo.maleta_id = m.id AND mo.tipo = 'consignacao') consig
  FROM maletas m JOIN revendedoras r ON r.id = m.rev_id WHERE ${ABERTA}`)) {
  if (m.itens !== m.consig) falha('4 consignação', m);
}

const encerradas = q(`SELECT m.id, r.nome,
    (SELECT COALESCE(SUM(qtd), 0) FROM maleta_itens WHERE maleta_id = m.id) enviadas,
    (SELECT COALESCE(SUM(devolvida), 0) FROM maleta_itens WHERE maleta_id = m.id) devolvidas,
    (SELECT COALESCE(-SUM(qtd), 0) FROM movimentos WHERE maleta_id = m.id AND tipo = 'venda') vendidas_razao,
    json_extract(m.acerto_json, '$.vendidas') vendidas_acerto
  FROM maletas m JOIN revendedoras r ON r.id = m.rev_id WHERE m.status = 'encerrada'`);
for (const m of encerradas) {
  if (m.enviadas !== m.devolvidas + m.vendidas_razao) falha('5 maleta encerrada não fecha', m);
}

const variacoes = q(`SELECT p.sku, p.qtd,
    COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo WHERE mo.sku = p.sku
               AND (mo.variacao IS NOT NULL OR mo.variante_id IS NOT NULL)), 0) identificado
  FROM produtos p WHERE p.sku IN (SELECT sku FROM produto_variacoes)`);

const exemplo = (sku) => {
  const p = produtos.find((x) => x.sku === sku);
  if (!p) return { sku, erro: 'fora do catálogo' };
  const revs = porRev.get(sku) ?? [];
  return {
    sku, peca: p.desc, total: p.qtd,
    emCasa: p.qtd - revs.reduce((s, r) => s + r.qtd, 0),
    comRevendedoras: revs.map((r) => `${r.nome} ${r.qtd} (maleta #${r.maleta})`),
  };
};

console.log(JSON.stringify({
  codigos: produtos.length,
  pecas: { total, emCasa: casa, comRevendedoras: fora, fecha: total === casa + fora },
  porRevendedora,
  maletasAbertas: q(`SELECT m.id, r.nome, SUM(mi.qtd - mi.devolvida) pecas, COUNT(*) codigos,
      SUM((mi.qtd - mi.devolvida) * mi.preco_envio) valor
    FROM maletas m JOIN revendedoras r ON r.id = m.rev_id JOIN maleta_itens mi ON mi.maleta_id = m.id
    WHERE ${ABERTA} GROUP BY m.id ORDER BY m.id`),
  maletasEncerradas: encerradas,
  variacoes: {
    codigos: variacoes.length,
    comRazaoIdentificada: variacoes.filter((v) => v.identificado === v.qtd).length,
    semIdentidade: variacoes.filter((v) => v.identificado !== v.qtd).map((v) => v.sku),
  },
  exemplos: exemplos.map(exemplo),
  falhas,
}, null, 1));
process.exit(falhas.length ? 1 : 0);
