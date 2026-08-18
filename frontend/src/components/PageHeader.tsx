import type { ReactNode } from 'react';

interface Props {
  /** Rótulo pequeno acima do título. Situa sem competir. */
  kicker?: string;
  titulo: string;
  /** Uma frase. Se precisar de duas, provavelmente a tela faz duas coisas. */
  sub?: string;
  acoes?: ReactNode;
}

export function PageHeader({ kicker, titulo, sub, acoes }: Props) {
  return (
    <header className="page-header">
      <div className="linha">
        <div>
          {kicker && <div className="kicker">{kicker}</div>}
          <h1>{titulo}</h1>
        </div>
        {acoes && <div className="acoes">{acoes}</div>}
      </div>
      {sub && <p className="sub">{sub}</p>}
    </header>
  );
}
