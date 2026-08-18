interface Props {
  de: number | string | null;
  para: number | string | null;
  /** Rótulos dos dois lados, quando ajudam a entender de onde vem cada
   *  número. Sem eles, vira "2 → 4" sem contexto. */
  rotuloDe?: string;
  rotuloPara?: string;
  /** `linha` cabe numa célula de tabela; `bloco` explica com mais espaço. */
  formato?: 'linha' | 'bloco';
}

function numero(v: number | string | null): number | null {
  return typeof v === 'number' ? v : null;
}

/** Mostra o que está hoje e o que aconteceria. Qualquer pessoa precisa
 *  entender sem legenda. */
export function DiffView({
  de,
  para,
  rotuloDe = 'Hoje na loja',
  rotuloPara = 'Passaria a mostrar',
  formato = 'linha',
}: Props) {
  const a = numero(de);
  const b = numero(para);
  const delta = a !== null && b !== null ? b - a : null;
  const sentido = delta === null || delta === 0 ? 'igual' : delta > 0 ? 'sobe' : 'desce';

  const texto = (v: number | string | null): string =>
    v === null || v === undefined ? '—' : String(v);

  if (formato === 'bloco') {
    return (
      <dl className="diff-linhas">
        <dt>{rotuloDe}</dt>
        <dd>{texto(de)}</dd>
        <dt>{rotuloPara}</dt>
        <dd>
          <span className="diff" data-sentido={sentido}>
            <span className="para">{texto(para)}</span>
            {delta !== null && delta !== 0 && (
              <span className="delta">
                ({delta > 0 ? '+' : ''}
                {delta})
              </span>
            )}
          </span>
        </dd>
      </dl>
    );
  }

  return (
    <span className="diff" data-sentido={sentido}>
      <span className="de">{texto(de)}</span>
      <span className="seta" aria-hidden="true">
        →
      </span>
      <span className="para">{texto(para)}</span>
      {delta !== null && delta !== 0 && (
        <span className="delta">
          ({delta > 0 ? '+' : ''}
          {delta})
        </span>
      )}
      {/* O leitor de tela recebe a frase inteira, não a seta. */}
      <span className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>
        {`de ${texto(de)} para ${texto(para)}`}
      </span>
    </span>
  );
}
