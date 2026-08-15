/** Mesma regra do dashboard, portada para rodar no fechamento do acerto no
 *  servidor — para o valor a receber não depender de qual aparelho fechou. */
export function isPrata(desc) {
  return /prata\s*925/i.test(String(desc || ''));
}

export function pctDaFaixa(valor, faixas) {
  for (const f of faixas) {
    if (f.limite === null || valor <= f.limite) return f.pct;
  }
  return faixas[faixas.length - 1].pct;
}

/** vendidos: [{sku, qtd, preco, desc}] — preço e descrição já resolvidos
 *  pelo chamador (o Worker busca no banco antes de calcular). */
export function calcComissao(vendidos, config) {
  let totalVendido = 0, basePrata = 0, baseNormal = 0;
  vendidos.forEach(({ preco, qtd, desc }) => {
    const v = preco * qtd;
    totalVendido += v;
    if (isPrata(desc)) basePrata += v; else baseNormal += v;
  });
  const pct = pctDaFaixa(totalVendido, config.faixas);
  const cPrata = basePrata * (config.prataPct / 100);
  const cNormal = baseNormal * (pct / 100);
  return {
    totalVendido, pct, basePrata, baseNormal,
    comissao: cPrata + cNormal,
    liquido: totalVendido - (cPrata + cNormal),
  };
}
