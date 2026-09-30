import { useEffect, useState } from 'react';
import { fotoDaPeca, miniaturaDaPeca, type ComFoto } from '../domain/foto';

interface Props {
  peca: ComFoto | null | undefined;
  /** O nome da peça, para o `alt` de quem não vê a imagem. */
  alt?: string;
  /** `cartao`: a foto ocupa o cartão inteiro da vista em galeria. */
  tamanho?: 'lista' | 'cartao';
}

/** A MINIATURA de uma peça — o único lugar do React que monta imagem de
 *  produto, como `fotoImg()` é o único do painel legado.
 *
 *  Dois cuidados que o legado aprendeu na prática e que não podem se
 *  perder na travessia:
 *
 *  1. **Pede a miniatura, não a imagem inteira.** A da galeria é um objeto
 *     pequeno nosso no R2; a da loja é a da CDN (`miniaturaDaFoto`).
 *  2. **Erro tem dois degraus.** Primeiro tenta a imagem grande — a
 *     miniatura pode não existir. Se ela também falhar, desiste e desenha o
 *     losango da marca. O que nunca aparece é o ícone de imagem quebrada do
 *     navegador: um vazio desenhado diz "esta peça não tem foto"; um ícone
 *     quebrado diz "este sistema está com defeito".
 */
export function FotoDaPeca({ peca, alt = '', tamanho = 'lista' }: Props) {
  const cheia = fotoDaPeca(peca);
  const mini = miniaturaDaPeca(peca);
  const [src, setSrc] = useState<string | null>(mini);
  const [desistiu, setDesistiu] = useState(false);

  /* A principal mudou (alguém escolheu outra, ou a importação trouxe a
     primeira): a miniatura acompanha, e uma desistência antiga não vale
     para a foto nova. */
  useEffect(() => { setSrc(mini); setDesistiu(false); }, [mini]);

  const classe = tamanho === 'cartao' ? 'mq-thumb mq-thumb--cartao' : 'mq-thumb';
  if (!cheia || desistiu || !src) {
    return <span className={`${classe} mq-thumb--empty`} aria-hidden="true">◇</span>;
  }

  return (
    <span className={classe}>
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
