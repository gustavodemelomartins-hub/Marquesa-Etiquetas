/** Qual endereço usar para MOSTRAR a foto de uma peça.
 *
 *  `GET /api/state` manda quatro, e eles não são intercambiáveis — a ordem
 *  é a que `api/src/state.js` documenta:
 *
 *    1. `fotoTratadaUrl`   nossos bytes, com fundo branco. Link assinado.
 *    2. `fotoOriginalUrl`  nossos bytes, como chegaram. Link assinado.
 *    3. `fotoUrl`          um endereço que ALGUÉM gravou no cadastro.
 *    4. `fotoLojaUrl`      a imagem que a vitrine publica hoje.
 *
 *  Os dois primeiros são nossos e expiram; os dois últimos são de terceiro
 *  e podem sumir sem aviso. Por isso a ordem, e por isso 3 e 4 são último
 *  recurso: é o que faz a peça que a loja ilustra parar de aparecer vazia
 *  no painel, sem nunca preferir a imagem de fora à nossa.
 *
 *  `null` significa NÃO HÁ IMAGEM — e quem exibe mostra a marca d'água da
 *  categoria, nunca um `<img>` quebrado.
 */
export interface ComFoto {
  fotoTratadaUrl?: string | null;
  fotoOriginalUrl?: string | null;
  fotoUrl?: string | null;
  fotoLojaUrl?: string | null;
}

export function fotoDaPeca(p: ComFoto | null | undefined): string | null {
  if (!p) return null;
  return p.fotoTratadaUrl || p.fotoOriginalUrl || p.fotoUrl || p.fotoLojaUrl || null;
}
