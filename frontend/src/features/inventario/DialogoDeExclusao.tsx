import { useEffect, useRef } from 'react';

interface Props {
  /** "Inventário #1" — o número da tela, nunca o id técnico. */
  nome: string;
  ocupado: boolean;
  erro: string;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}

/** EXCLUIR um inventário que não mexeu em estoque (§53, 05/10/2026).
 *
 *  Só aparece para o inventário que o servidor marca como `excluivel`:
 *  cancelado ou concluído, sem NENHUMA diferença aplicada. O que já alterou
 *  o estoque não tem esse botão — o histórico das peças depende dele.
 *
 *  O foco entra em "Voltar", como no descarte: Enter sem querer não apaga. */
export function DialogoDeExclusao({ nome, ocupado, erro, aoConfirmar, aoVoltar }: Props) {
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
        aria-labelledby="titulo-excluir"
        aria-describedby="texto-excluir"
      >
        <div className="mq-drawer__head">
          <div>
            <h2 className="mq-title" id="titulo-excluir">Excluir definitivamente o {nome.toLowerCase()}?</h2>
          </div>
        </div>
        <div className="mq-drawer__body">
          <div id="texto-excluir">
            <p>Nenhuma movimentação de estoque foi aplicada por este inventário.</p>
            <p>
              As leituras dele serão apagadas e ele sai do histórico. Variações criadas
              durante a conferência continuam no cadastro das peças.
            </p>
          </div>
          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
          <div className="mq-btns">
            <button type="button" className="mq-btn mq-btn--ghost" ref={voltar} disabled={ocupado} onClick={aoVoltar}>
              Voltar
            </button>
            <button type="button" className="mq-btn mq-btn--danger" disabled={ocupado} onClick={aoConfirmar}>
              {ocupado ? 'Excluindo…' : 'Excluir inventário'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
