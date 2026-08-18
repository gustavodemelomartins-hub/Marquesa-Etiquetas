import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}

/** Vazio não é erro. Estas telas explicam o que fazer, não pedem desculpa. */
export function EmptyState({ titulo, descricao, acoes }: Props) {
  return (
    <div className="estado">
      <h3>{titulo}</h3>
      {descricao && <p>{descricao}</p>}
      {acoes && <div className="acoes">{acoes}</div>}
    </div>
  );
}
