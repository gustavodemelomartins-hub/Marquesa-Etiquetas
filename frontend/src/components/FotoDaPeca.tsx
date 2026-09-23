import { useState } from 'react';
import { fotoDaPeca, miniaturaDaFoto, type ComFoto } from '../domain/foto';

interface Props {
  peca: ComFoto | null | undefined;
  /** O nome da peça, para o `alt` de quem não vê a imagem. */
  alt?: string;
}

/** A MINIATURA de uma peça — o único lugar do React que monta imagem de
 *  produto, como `fotoImg()` é o único do painel legado.
 *
 *  Dois cuidados que o legado aprendeu na prática e que não podem se
 *  perder na travessia:
 *
 *  1. **Pede a miniatura da CDN, não a imagem inteira.** Ver
 *     `miniaturaDaFoto`.
 *  2. **Erro tem dois degraus.** Primeiro tenta o endereço cru — a
 *     miniatura `-240-0` pode não existir para aquela imagem. Se ele
 *     também falhar, desiste e desenha o losango da marca. O que nunca
 *     aparece é o ícone de imagem quebrada do navegador: um vazio
 *     desenhado diz "esta peça não tem foto"; um ícone quebrado diz "este
 *     sistema está com defeito".
 */
export function FotoDaPeca({ peca, alt = '' }: Props) {
  const cheia = fotoDaPeca(peca);
  const [src, setSrc] = useState<string | null>(miniaturaDaFoto(cheia));
  const [desistiu, setDesistiu] = useState(false);

  if (!cheia || desistiu || !src) {
    return <span className="mq-thumb" aria-hidden="true">◇</span>;
  }

  return (
    <span className="mq-thumb">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src !== cheia) setSrc(cheia);
          else setDesistiu(true);
        }}
      />
    </span>
  );
}
