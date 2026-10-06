/** O NOME de uma variação — quando dois nomes são a mesma variação.
 *
 *  O caso real (06/10/2026): no cadastro de PROD convivem "n°18" (grau,
 *  vindo da Nuvemshop) e "nº17" (ordinal, digitado aqui). No inventário a
 *  Sthefany digita "23", "nº23", "nº 23" ou "N23" para o mesmo aro. Se cada
 *  grafia virasse uma variação, o anel teria dois "aro 23" e a contagem se
 *  dividiria entre eles sem ninguém perceber.
 *
 *  `chaveDaVariacao` é a identidade: minúsculas, sem espaço, sem o prefixo
 *  de tamanho (nº, n°, N, Aro, Tam., Número) e sem zero à esquerda. Nome de
 *  combinação ("Banho de Ouro 18K · n°18") é normalizado parte por parte.
 *  Ela só COMPARA — o nome gravado continua sendo o que já existe.
 *
 *  `formatarValorNovo` é a grafia de uma variação NOVA: segue a das irmãs
 *  do mesmo atributo ("n°" se elas são "n°18"); sem irmã numérica, o número
 *  puro vira "nº19" — a grafia que o cadastro local já usa — e o resto fica
 *  como ela digitou.
 *
 *  O mesmo par existe na tela (`frontend/src/domain/variacao.ts`); o teste
 *  `src/inventario-v2-reconstrucao-test.mjs` confere os dois com a mesma
 *  tabela de casos.
 */

const PREFIXO_DE_TAMANHO = /^(?:aro|tamanho|tam\.?|n[úu]mero|num\.?|nº|n\.|no\.?|n)\s*º?\s*(?=\d)/;

/** Uma parte só ("n°18", "Aro 18", "Verde"). */
function chaveDaParte(parte) {
  let s = String(parte ?? '').normalize('NFKC').toLowerCase().trim();
  s = s.replace(/[°˚]/g, 'º');
  s = s.replace(PREFIXO_DE_TAMANHO, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/^0+(?=\d)/, '');
  return s;
}

/** A identidade de um nome de variação, para comparar — nunca para gravar. */
export function chaveDaVariacao(nome) {
  return String(nome ?? '')
    .split('·')
    .map(chaveDaParte)
    .filter(Boolean)
    .join('·');
}

/** A grafia de um valor novo, seguindo as irmãs do mesmo atributo.
 *
 *  Só número é reformatado: "19", "nº 19", "N19" viram "nº19" (ou "n°19"
 *  quando é assim que as irmãs estão escritas). Qualquer outra coisa —
 *  "Verde", "Prata 925" — fica como ela digitou, sem espaço sobrando. */
export function formatarValorNovo(entrada, irmas = []) {
  const digitado = String(entrada ?? '').trim().replace(/\s+/g, ' ');
  const chave = chaveDaParte(digitado);
  if (!/^\d+$/.test(chave)) return digitado;
  /* Irmã que é "prefixo curto + número": "n°18", "Aro 16". Um valor como
     "Banho de Ouro 18K" tem número mas não é tamanho, e não serve de modelo. */
  const modelo = irmas.map(String).find((v) => /^\D{0,6}\d{1,3}\D{0,3}$/.test(v.trim()));
  if (modelo) {
    const m = modelo.trim().match(/^(\D*?)(\d+)(\D*)$/);
    return `${m[1]}${chave}${m[3]}`;
  }
  /* Sem irmã para copiar: só o número puro ganha o "nº"; "Aro 20" fica como
     ela escreveu. */
  return /^\d+$/.test(digitado) ? `nº${chave}` : digitado;
}

/** A variante da LOJA e a variação criada AQUI que são o mesmo aro.
 *
 *  O caso real (06/10/2026, código 391471): a Nuvemshop vende o anel com
 *  uma variante só, "Banho de Ouro 18K · n°18". A importação da loja não
 *  grava estrutura de produto com variante única, então no inventário a
 *  Sthefany criou "nº18" e "nº24" aqui. A tela passou a mostrar "Banho de
 *  Ouro 18K · n°18" e "nº18" como duas variações — e a mesma peça física
 *  podia ser contada nas duas.
 *
 *  "Banho de Ouro 18K" é atributo da PEÇA, não dimensão da variação: o valor
 *  é o mesmo em todas as variantes que a loja tem do código. Por isso uma
 *  parte da variante da loja só serve de chave quando todas as OUTRAS partes
 *  são constantes no produto. Num anel vendido em Dourado e Prata, "n°18"
 *  sozinho não identifica nada, e não há equivalência.
 *
 *  Só vale o par único dos dois lados: uma variante da loja que bate com
 *  duas daqui (ou o contrário) é dúvida, e dúvida não se resolve por
 *  semelhança de nome. Esta função só COMPARA — não grava vínculo, não
 *  publica nada. Quem chama ainda exige que a variante da loja não tenha
 *  saldo aqui; com saldo, as duas continuam visíveis.
 *
 *  `loja`: [{ variante_id, nome, valores_json | valores }] — o produto todo.
 *  `locais`: [{ variante_id, nome }] — as daqui sem variante da loja.
 *  Devolve Map(id da variante da loja → id da variação daqui). */
export function equivalenciasLojaLocal(loja = [], locais = []) {
  const partesDe = (v) => {
    let valores = v.valores;
    if (!Array.isArray(valores)) {
      try { valores = JSON.parse(v.valores_json || '[]'); } catch { valores = []; }
    }
    if (Array.isArray(valores) && valores.length) {
      return valores.map((x) => ({ atributo: String(x.atributo ?? ''), chave: chaveDaParte(x.valor) }));
    }
    return String(v.nome ?? '').split('·').map((p, i) => ({ atributo: `#${i}`, chave: chaveDaParte(p) }));
  };
  const todas = loja.map(partesDe);
  const constante = (atributo, chave) =>
    todas.every((ps) => ps.some((p) => p.atributo === atributo && p.chave === chave));

  const chavesDe = loja.map((v, i) => {
    const ps = todas[i].filter((p) => p.chave);
    const ks = new Set([chaveDaVariacao(v.nome)]);
    for (const p of ps) {
      if (ps.every((o) => o === p || constante(o.atributo, o.chave))) ks.add(p.chave);
    }
    ks.delete('');
    return ks;
  });

  const pares = [];
  loja.forEach((v, i) => {
    for (const l of locais) {
      if (chavesDe[i].has(chaveDaVariacao(l.nome))) pares.push([String(v.variante_id), String(l.variante_id)]);
    }
  });
  const conta = (lado, id) => pares.filter((p) => p[lado] === id).length;
  return new Map(pares.filter(([a, b]) => conta(0, a) === 1 && conta(1, b) === 1));
}
