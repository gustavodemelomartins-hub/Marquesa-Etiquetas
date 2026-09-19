import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './Icone';

interface Props {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  icone?: NomeIcone;
}

/** Vazio não é erro. Estas telas explicam o que fazer, não pedem desculpa. */
export function EmptyState({ titulo, descricao, acoes, icone = 'box' }: Props) {
  return (
    <div className="mq-state">
      <span className="mq-state__icon"><Icone nome={icone} /></span>
      <h3>{titulo}</h3>
      {descricao && <p>{descricao}</p>}
      {acoes && <div className="mq-btns">{acoes}</div>}
    </div>
  );
}
