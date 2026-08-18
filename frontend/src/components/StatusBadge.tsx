/** Quatro tons, e só quatro. Um tom mais forte só entra quando a
 *  consequência é mais forte — ver styles/tokens.css. */
export type Tom = 'neutro' | 'positivo' | 'atencao' | 'critico';

interface Props {
  tom: Tom;
  children: React.ReactNode;
  /** Bolinha à esquerda. Para estado contínuo (conectada, no ar). */
  ponto?: boolean;
}

export function StatusBadge({ tom, children, ponto = false }: Props) {
  return (
    <span className="selo" data-tom={tom}>
      {ponto && <span className="ponto" aria-hidden="true" />}
      {children}
    </span>
  );
}
