import { useState } from 'react';
import { Icone } from '../../components/Icone';
import { PERIODOS, ROTULOS, intervaloValido } from './periodo';
import type { Recorte } from './tipos';

interface Props {
  recorte: Recorte;
  aoMudar: (r: Recorte) => void;
}

/** O filtro de período, em duas camadas: os cinco atalhos que resolvem
 *  quase todo dia, e o intervalo livre para quando a pergunta é de um mês
 *  fechado. O intervalo só é aceito inteiro — meia data ignorada em
 *  silêncio faria o cartão responder sobre outro recorte sem avisar. */
export function FiltroPeriodo({ recorte, aoMudar }: Props) {
  const livre = intervaloValido(recorte.de, recorte.ate);
  const [aberto, setAberto] = useState(livre);
  const [de, setDe] = useState(recorte.de ?? '');
  const [ate, setAte] = useState(recorte.ate ?? '');

  return (
    <div className="mq-filters">
      <div className="mq-chipset" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={!livre && recorte.periodo === p}
            onClick={() => {
              setAberto(false);
              aoMudar({ periodo: p, de: null, ate: null });
            }}
          >
            {ROTULOS[p]}
          </button>
        ))}
        <button type="button" aria-pressed={livre} onClick={() => setAberto((v) => !v)}>
          Intervalo
        </button>
      </div>

      {aberto && (
        <div className="mq-filters__livre">
          <label className="mq-field">
            <span>De</span>
            <input className="mq-input" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="mq-field">
            <span>Até</span>
            <input className="mq-input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <button
            type="button"
            className="mq-btn mq-btn--secondary mq-btn--sm"
            disabled={!intervaloValido(de || null, ate || null)}
            onClick={() => aoMudar({ periodo: 'tudo', de, ate })}
          >
            <Icone nome="filter" />
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
