import { useEffect, useRef } from 'react';

interface Props {
  ocupado: boolean;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}

/** DESCARTAR um inventário que não vai ser terminado.
 *
 *  Usa `POST /api/inventarios/:id/cancelar`: o inventário vira `cancelado`,
 *  continua no histórico e nada do que foi contado chega ao estoque. É o que
 *  libera abrir outro — um inventário pausado bloqueia o seguinte.
 *
 *  O foco entra em "Voltar", e não no botão que descarta: quem abriu isto
 *  sem querer e aperta Enter não perde a contagem. */
export function DialogoDeDescarte({ ocupado, aoConfirmar, aoVoltar }: Props) {
  const voltar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoVoltar(); };
    document.addEventListener('keydown', aoTeclar);
    voltar.current?.focus();
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoVoltar]);

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" tabIndex={-1} onClick={aoVoltar} />
      <div
        className="mq-drawer mq-encerrar"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-descartar"
        aria-describedby="texto-descartar"
      >
        <div className="mq-drawer__head">
          <div>
            <h2 className="mq-title" id="titulo-descartar">Descartar este inventário?</h2>
          </div>
        </div>
        <div className="mq-drawer__body">
          <div id="texto-descartar">
            <p>As contagens realizadas não serão aplicadas ao estoque.</p>
            <p>O inventário continuará disponível no histórico como cancelado.</p>
          </div>
          <div className="mq-btns">
            <button type="button" className="mq-btn mq-btn--ghost" ref={voltar} disabled={ocupado} onClick={aoVoltar}>
              Voltar
            </button>
            <button type="button" className="mq-btn mq-btn--danger" disabled={ocupado} onClick={aoConfirmar}>
              {ocupado ? 'Descartando…' : 'Descartar inventário'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
