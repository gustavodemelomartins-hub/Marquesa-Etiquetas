import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  /** A frase pequena ao lado do título. Explica em linguagem de negócio o
   *  que o painel responde — o painel legado chama de "hint". */
  dica?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  /** Sem respiro interno: para painel que contém tabela ou lista de linhas
   *  que já trazem o próprio espaçamento. */
  semPadding?: boolean;
}

/** Cartão branco com cabeça e corpo — a unidade de composição do painel
 *  legado, portada. Borda fina, canto arredondado, sombra discreta. */
export function Painel({ titulo, dica, acoes, children, semPadding = false }: Props) {
  return (
    <section className="painel">
      <div className="painel-cabeca">
        <h2>{titulo}</h2>
        {dica && <span className="dica">{dica}</span>}
        {acoes && <div className="painel-acoes">{acoes}</div>}
      </div>
      <div className={semPadding ? 'painel-corpo sem-padding' : 'painel-corpo'}>{children}</div>
    </section>
  );
}

/** Duas colunas iguais no desktop, empilhadas no celular. */
export function Colunas({ children }: { children: ReactNode }) {
  return <div className="colunas">{children}</div>;
}
