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
