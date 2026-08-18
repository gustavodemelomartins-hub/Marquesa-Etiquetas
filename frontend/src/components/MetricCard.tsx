import type { Tom } from './StatusBadge';

interface Props {
  rotulo: string;
  valor: number | string;
  nota?: string;
  /** Só use tom quando o número em si for a notícia. Um painel em que tudo
   *  é colorido não destaca nada. */
  tom?: Tom;
}

export function MetricCard({ rotulo, valor, nota, tom = 'neutro' }: Props) {
  return (
    <div className="metric" data-tom={tom}>
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {nota && <div className="nota">{nota}</div>}
    </div>
  );
}
