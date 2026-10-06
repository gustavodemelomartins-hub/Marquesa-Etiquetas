/** O NOME de uma variação — quando dois nomes são a mesma variação.
 *
 *  Espelho de `api/src/variacao-nome.js`. A tela usa para não oferecer
 *  "criar nº23" quando o anel já tem "n°23", e para achar a variação que a
 *  Sthefany digitou ("23", "N23", "nº 23"). Quem decide continua sendo o
 *  servidor; aqui é só para a tela não convidar ao erro.
 *  `src/inventario-v2-reconstrucao-test.mjs` e `variacao.test.ts` conferem
 *  os dois lados com a mesma tabela de casos.
 */

const PREFIXO_DE_TAMANHO = /^(?:aro|tamanho|tam\.?|n[úu]mero|num\.?|nº|n\.|no\.?|n)\s*º?\s*(?=\d)/;

function chaveDaParte(parte: string): string {
  let s = String(parte ?? '').normalize('NFKC').toLowerCase().trim();
  s = s.replace(/[°˚]/g, 'º');
  s = s.replace(PREFIXO_DE_TAMANHO, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/^0+(?=\d)/, '');
  return s;
}

/** A identidade de um nome de variação, para comparar — nunca para gravar. */
export function chaveDaVariacao(nome: string | null | undefined): string {
  return String(nome ?? '')
    .split('·')
    .map(chaveDaParte)
    .filter(Boolean)
    .join('·');
}

/** A variação cadastrada que corresponde ao que ela digitou, ou `null`.
 *  Num nome de combinação ("Banho de Ouro 18K · n°18") basta a última parte
 *  bater — é ela que a Sthefany diz ("18"). */
export function acharVariacao<T extends { nome: string }>(lista: T[], digitado: string): T | null {
  const k = chaveDaVariacao(digitado);
  if (!k) return null;
  return lista.find((v) => chaveDaVariacao(v.nome) === k)
    ?? lista.find((v) => chaveDaVariacao(v.nome).split('·').pop() === k)
    ?? null;
}
