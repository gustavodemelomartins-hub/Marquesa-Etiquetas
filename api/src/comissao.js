/** Comissão conforme §11, §12 e §32 do documento de contexto.
 *
 *  A regra que o documento fixa, e que difere da versão anterior deste
 *  arquivo: a FAIXA é escolhida pelo total vendido em peças BANHADAS.
 *  A Prata 925 tem 10% fixos e NÃO entra nessa conta — nem no valor que
 *  define a faixa, nem no percentual aplicado.
 *
 *  Importa porque a prata empurrava o total para a faixa de cima e
 *  encarecia a comissão das banhadas: numa maleta com R$ 5.900 em
 *  banhadas e R$ 500 em prata, a diferença é de R$ 295. */

export function isPrata(desc) {
  return /prata\s*925/i.test(String(desc || ''));
}

export function pctDaFaixa(valorBanhadas, faixas) {
  for (const f of faixas) {
    if (f.limite === null || valorBanhadas <= f.limite) return f.pct;
  }
  return faixas[faixas.length - 1].pct;
}

/** vendidos: [{qtd, preco, desc}] — preço já resolvido pelo chamador
 *  (o Worker usa o preço CONGELADO no envio da maleta, §6.1). */
export function calcComissao(vendidos, config) {
  let basePrata = 0, baseBanhada = 0;
  for (const { preco, qtd, desc } of vendidos) {
    const v = (preco || 0) * qtd;
    if (isPrata(desc)) basePrata += v; else baseBanhada += v;
  }

  // a faixa olha SÓ para as banhadas
  const pct = pctDaFaixa(baseBanhada, config.faixas);
  const comissaoBanhada = baseBanhada * (pct / 100);
  const comissaoPrata = basePrata * (config.prataPct / 100);
  const totalVendido = basePrata + baseBanhada;
  const comissao = comissaoBanhada + comissaoPrata;

  return {
    totalVendido,
    baseBanhada, pct, comissaoBanhada,
    basePrata, pctPrata: config.prataPct, comissaoPrata,
    comissao,
    liquido: totalVendido - comissao,
  };
}
