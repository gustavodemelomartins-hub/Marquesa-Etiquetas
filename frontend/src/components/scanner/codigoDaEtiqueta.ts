/** O QUE A ETIQUETA CARREGA, e como isso vira um SKU.
 *
 *  A etiqueta impressa pelo módulo de Etiquetas é um **CODE128 cujo
 *  conteúdo é o SKU cru** — sem prefixo, sem sufixo, sem dígito de
 *  aplicação. Isso é verificável na fonte: `src/dashboard.tpl.html`
 *  desenha `JsBarcode(svg, code, {format:'CODE128', displayValue:false})`
 *  onde `code` é `p.sku`, e imprime o mesmo texto embaixo em `.l-sku`.
 *
 *  Então "decodificar" e "resolver" são duas coisas, e só a segunda é
 *  interessante: o leitor devolve uma string, e alguém precisa dizer a
 *  qual peça do catálogo ela corresponde. As três tentativas abaixo foram
 *  portadas de `findProd` do painel clássico, uma a uma, com o motivo de
 *  cada uma — elas existem porque o catálogo real tem etiquetas antigas
 *  circulando, e recusar uma peça de verdade porque o código dela foi
 *  impresso em 2023 é o pior resultado possível numa conferência física.
 *
 *  Este arquivo é PURO de propósito: não toca câmera, não toca rede, não
 *  toca React. É o que permite prová-lo sem navegador, e é a peça que
 *  Revendedoras vai reusar sem herdar nada da tela do Inventário.
 */

/** A mesma normalização do backend (`api/src/sku.js › normSku`) e do
 *  painel clássico. Repetida aqui de propósito: o leitor devolve o que a
 *  câmera viu, e comparar "230076 " com "230076" não pode depender de uma
 *  ida ao servidor. */
export function normalizarCodigo(bruto: string | null | undefined): string {
  return String(bruto ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

/** Tira o sufixo de variação: `230076-17` → `230076`.
 *
 *  Etiqueta de peça com aro traz o aro no código impresso, e o catálogo
 *  guarda o código base com as variações à parte. Sem isto, bipar um anel
 *  aro 17 não acharia peça nenhuma. */
export function codigoBase(bruto: string | null | undefined): string {
  return normalizarCodigo(bruto).replace(/-\d+$/, '');
}

/** Os códigos a tentar, na ordem, para uma leitura.
 *
 *  A ordem importa e não é arbitrária:
 *
 *   1. o código como veio — o caso de 99% das etiquetas;
 *   2. sem o sufixo de variação — a etiqueta diz o aro, o catálogo não;
 *   3. sem zeros à esquerda — etiquetas antigas foram impressas com
 *      `0230076` quando o gerador ainda preenchia até sete dígitos;
 *   4. sem os dois — ver abaixo.
 *
 *  O QUARTO CANDIDATO É UMA CORREÇÃO, e vale dizer por quê.
 *
 *  `findProd` do painel clássico aplica as três transformações de forma
 *  INDEPENDENTE: tenta o código cru, tenta sem sufixo, tenta sem zeros. Uma
 *  etiqueta antiga de peça com aro — `0230076-17`, que tem os dois defeitos
 *  ao mesmo tempo — não resolve por nenhum dos três caminhos, e hoje, em
 *  produção, ela simplesmente não é encontrada.
 *
 *  Isso não foi inventado aqui: apareceu numa prova escrita para descrever
 *  o comportamento esperado, que falhou contra a regra portada. A correção
 *  é a menor possível e não pode mudar nenhuma resolução que já funciona:
 *  o candidato entra por ÚLTIMO, e os anteriores são tentados na ordem de
 *  sempre. Ele só alcança leituras que antes não achavam peça nenhuma.
 *
 *  O painel clássico continua com o buraco. Corrigi-lo lá é mexer em
 *  módulo legado estável em produção, e não era o pedido desta rodada —
 *  fica registrado em docs/domains/SCANNER_ETIQUETAS.md.
 *
 *  Duplicatas saem: tentar o mesmo código quatro vezes não acha nada novo e
 *  faria a busca parecer mais esperta do que é.
 */
export function candidatosDoCodigo(bruto: string | null | undefined): string[] {
  const c = normalizarCodigo(bruto);
  if (!c) return [];
  const semZeros = c.replace(/^0+/, '');
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const candidato of [c, codigoBase(c), semZeros, codigoBase(semZeros)]) {
    if (candidato && !vistos.has(candidato)) { vistos.add(candidato); saida.push(candidato); }
  }
  return saida;
}

/** Acha, num conjunto de códigos conhecidos, a que peça a leitura se
 *  refere. Devolve o código DO CATÁLOGO, não o que a etiqueta trazia —
 *  é ele que as rotas esperam.
 *
 *  `conhecidos` é qualquer coisa com `has`: um `Set<string>` ou um `Map`
 *  indexado por SKU. Quem chama decide de onde vem a lista, e é por isso
 *  que esta função não sabe o que é `produtos` nem o que é `esperados` —
 *  o Inventário passa a lista do que se espera em casa, e Revendedoras vai
 *  passar a da maleta. */
export function resolverSku(
  bruto: string | null | undefined,
  conhecidos: { has(sku: string): boolean },
): string | null {
  for (const candidato of candidatosDoCodigo(bruto)) {
    if (conhecidos.has(candidato)) return candidato;
  }
  return null;
}
