import type { ReactNode } from 'react';

/** O acento vertical à esquerda. Quatro papéis, os mesmos do painel legado:
 *  rosé é o número principal, verde é o que está em casa, âmbar é o que
 *  está na rua, bordô é dinheiro. */
export type AcentoKpi = 'marca' | 'casa' | 'rua' | 'valor';

interface Props {
  rotulo: string;
  valor: ReactNode;
  /** Uma linha. Diz o que o número significa, não o que ele é. */
  nota?: ReactNode;
  acento?: AcentoKpi;
  /** Número comprido (dinheiro) cabe melhor um corpo menor. */
  compacto?: boolean;
}

/** O número grande da Marquesa: serifada, bordô, com um traço de cor à
 *  esquerda. É o elemento mais reconhecível do painel antigo e o que faz o
 *  painel novo parecer o mesmo produto. */
export function Kpi({ rotulo, valor, nota, acento = 'marca', compacto = false }: Props) {
  return (
    <div className="kpi" data-acento={acento}>
      <div className="k-lbl">{rotulo}</div>
      <div className={compacto ? 'k-num compacto' : 'k-num'}>{valor}</div>
      {nota && <div className="k-sub">{nota}</div>}
    </div>
  );
}

/** A fileira de KPIs. Quatro no desktop, dois no tablet, um no celular. */
export function Kpis({ children }: { children: ReactNode }) {
  return <div className="kpis">{children}</div>;
}
