interface Props {
  /** Diga o que está acontecendo. "Carregando…" não informa nada, e a
   *  leitura da loja inteira demora de verdade — 2 requisições por segundo. */
  children?: React.ReactNode;
}

export function LoadingState({ children = 'Carregando…' }: Props) {
  return (
    <p className="carregando" role="status" aria-live="polite">
      {children}
    </p>
  );
}
