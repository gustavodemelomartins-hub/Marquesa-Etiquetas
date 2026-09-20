/* O logo oficial da Marquesa — a ÚNICA fonte dele em todo o React.
 *
 *  O arquivo canônico é `brand/logo.webp`, na raiz do repositório: o mesmo
 *  que o painel clássico usa há anos e o único asset de marca versionado
 *  aqui. Ele é importado, não referenciado por caminho: o Vite o carrega
 *  para dentro do bundle com hash no nome, então ele funciona igual em
 *  `/v2/`, em `/painel-novo/`, no `vite dev` e no `dist` servido da raiz —
 *  os quatro lugares onde um caminho relativo escrito à mão já quebrou.
 *
 *  Nenhum componente deve escrever `<img src=".../logo.webp">` por conta
 *  própria. Era isso que produzia um logo certo numa tela e um quadrado
 *  vazio na outra. Quem precisa da marca importa daqui.
 */
import logoOficial from '../../../brand/logo.webp';

/** A URL empacotada, para os raros casos que precisam do endereço cru
 *  (og:image, favicon dinâmico) em vez do elemento. */
export { logoOficial };

interface Props {
  /** `claro` para superfície escura — o trilho bordô, o rodapé da marca.
   *
   *  O arquivo é traço PRETO sobre transparência (RGBA 320x128, chunk
   *  ALPH). Sobre o bordô ele some, e era exatamente esse o defeito do
   *  preview anterior. `brightness(0) invert(1)` leva qualquer cor do
   *  traço a branco puro e deixa a transparência intacta — funciona
   *  porque o desenho é monocromático. */
  tom?: 'claro' | 'escuro';
  /** Altura em px. A largura acompanha pela proporção 320x128 (2,5:1). */
  altura?: number;
  className?: string;
}

const PROPORCAO = 320 / 128;

export function LogoMarquesa({ tom = 'escuro', altura = 30, className }: Props) {
  const classes = ['mq-logo'];
  if (tom === 'claro') classes.push('mq-logo--claro');
  if (className) classes.push(className);

  return (
    <img
      className={classes.join(' ')}
      src={logoOficial}
      alt="Marquesa Semijóias"
      height={altura}
      width={Math.round(altura * PROPORCAO)}
      decoding="async"
    />
  );
}
