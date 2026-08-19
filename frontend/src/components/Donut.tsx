import { useState } from 'react';
import { pctTexto, plural } from '../domain/formato';

export interface FatiaDonut {
  cat: string;
  qtd: number;
  cor: string;
}

interface Props {
  dados: FatiaDonut[];
  /** O que os números do centro são: "no total", "em casa", "na rua". */
  legendaCentro?: string;
  /** Frase de vazio. Um gráfico sem dados não é erro. */
  textoVazio?: string;
}

const S = 230;
const CX = S / 2;
const CY = S / 2;
const R_OUT = S / 2 - 26;
const R_IN = R_OUT * 0.58;
/** 2px de respiro entre fatias — a mesma folga do painel legado. */
const PAD = 2 / R_OUT / 2;

function arco(rOut: number, rIn: number, a0: number, a1: number): string {
  const p = (r: number, a: number): [number, number] => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  const [x1, y1] = p(rOut, a0);
  const [x2, y2] = p(rOut, a1);
  const [x3, y3] = p(rIn, a1);
  const [x4, y4] = p(rIn, a0);
  return `M${x1} ${y1}A${rOut} ${rOut} 0 ${grande} 1 ${x2} ${y2}L${x3} ${y3}A${rIn} ${rIn} 0 ${grande} 0 ${x4} ${y4}Z`;
}

/** A rosca por categoria do painel legado, em SVG puro.
 *
 *  Nada externo carrega: nenhuma biblioteca de gráfico entra no bundle por
 *  causa de um donut de nove fatias, e o desenho continua funcionando
 *  offline igual ao resto do app.
 *
 *  Rótulo direto só nas fatias com 12% ou mais — abaixo disso o nome vaza
 *  para fora do anel, e a legenda ao lado resolve melhor. */
export function Donut({ dados, legendaCentro, textoVazio }: Props) {
  const [aceso, setAceso] = useState<number | null>(null);
  const total = dados.reduce((s, d) => s + d.qtd, 0);

  if (!total) {
    return (
      <div className="estado">
        <h3>Nada para mostrar</h3>
        <p>{textoVazio || 'Sem peças nesta visão.'}</p>
      </div>
    );
  }

  let ang = -Math.PI / 2;
  const fatias = dados.map((d, i) => {
    const frac = d.qtd / total;
    const a0 = ang;
    const a1 = ang + frac * Math.PI * 2;
    ang = a1;
    return {
      ...d,
      i,
      frac,
      d: arco(R_OUT, R_IN, Math.min(a0 + PAD, a1), Math.max(a1 - PAD, a0)),
      meio: (a0 + a1) / 2,
    };
  });

  return (
    <div className="grafico">
      <div className={aceso === null ? 'donut' : 'donut com-foco'}>
        <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Peças por categoria">
          <g>
            {fatias.map((f) => (
              <path
                key={f.cat}
                className={aceso === f.i ? 'fatia acesa' : 'fatia'}
                d={f.d}
                fill={f.cor}
                onMouseEnter={() => setAceso(f.i)}
                onMouseLeave={() => setAceso(null)}
              >
                <title>{`${f.cat}: ${f.qtd} ${plural(f.qtd, 'peça', 'peças')} · ${pctTexto(f.qtd, total)}`}</title>
              </path>
            ))}
          </g>
          <g aria-hidden="true">
            {fatias
              .filter((f) => f.frac >= 0.12)
              .map((f) => {
                const rl = (R_OUT + R_IN) / 2;
                const lx = (CX + rl * Math.cos(f.meio)).toFixed(1);
                const ly = (CY + rl * Math.sin(f.meio)).toFixed(1);
                return (
                  <text key={f.cat} className="rotulo-fatia" x={lx} y={ly} textAnchor="middle" fill="#fff">
                    <tspan x={lx} dy="-1">
                      {f.cat}
                    </tspan>
                    <tspan x={lx} dy="11" fill="rgba(255,255,255,.82)">
                      {Math.round(f.frac * 100)}%
                    </tspan>
                  </text>
                );
              })}
          </g>
        </svg>
        <div className="donut-centro">
          <div className="dc-num">{total}</div>
          <div className="dc-lbl">peças {legendaCentro || ''}</div>
        </div>
      </div>

      <ul className="legenda">
        {fatias.map((f) => (
          <li
            key={f.cat}
            className={aceso === f.i ? 'aceso' : undefined}
            onMouseEnter={() => setAceso(f.i)}
            onMouseLeave={() => setAceso(null)}
          >
            <span className="ponto" style={{ background: f.cor }} aria-hidden="true" />
            <span className="nome">{f.cat}</span>
            <span className="valor">
              <b>{f.qtd}</b> · {pctTexto(f.qtd, total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
