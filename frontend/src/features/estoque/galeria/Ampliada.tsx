import { useEffect, useRef } from 'react';
import { Icone } from '../../../components/Icone';
import { ORIGEM, type FotoDaGaleria } from './api';

interface Props {
  fotos: FotoDaGaleria[];
  indice: number;
  titulo: string;
  aoMudar: (indice: number) => void;
  aoFechar: () => void;
}

/** A FOTO AMPLIADA — a imagem grande, sobre fundo escuro, para conferir o
 *  detalhe da peça (o fecho, a pedra, o banho).
 *
 *  Navega pelas setas do teclado, pelos botões e, no celular, deslizando
 *  o dedo para o lado. Carrega só a foto da vez: as outras vêm quando
 *  alguém vai até elas. */
export function Ampliada({ fotos, indice, titulo, aoMudar, aoFechar }: Props) {
  const foto = fotos[indice];
  const toque = useRef<number | null>(null);
  const anterior = () => aoMudar((indice - 1 + fotos.length) % fotos.length);
  const proxima = () => aoMudar((indice + 1) % fotos.length);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); aoFechar(); }
      else if (e.key === 'ArrowLeft') anterior();
      else if (e.key === 'ArrowRight') proxima();
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => document.removeEventListener('keydown', aoTeclar, true);
  });

  if (!foto) return null;
  const varias = fotos.length > 1;

  return (
    <div
      className="mq-ampliada"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${indice + 1} de ${fotos.length} — ${titulo}`}
      onTouchStart={(e) => { toque.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const inicio = toque.current;
        toque.current = null;
        const fim = e.changedTouches[0]?.clientX;
        if (inicio == null || fim == null || !varias) return;
        if (fim - inicio > 50) anterior();
        else if (inicio - fim > 50) proxima();
      }}
    >
      <div className="mq-ampliada__topo">
        <span>
          <b>{titulo}</b>
          <small>
            {indice + 1} de {fotos.length}
            {foto.principal ? ' · principal' : ''}
            {foto.variacao ? ` · variação ${foto.variacao}` : ''}
            {' · '}{ORIGEM[foto.origem] ?? foto.origem}
          </small>
        </span>
        <button type="button" className="mq-ampliada__fechar" aria-label="Fechar a foto ampliada" onClick={aoFechar}>
          <Icone nome="close" />
        </button>
      </div>

      <div className="mq-ampliada__palco" onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
        {foto.urlGrande
          ? <img src={foto.urlGrande} alt={`${titulo}, foto ${indice + 1}`} decoding="async" />
          : <span className="mq-ampliada__vazia">Esta foto não tem imagem gravada.</span>}
      </div>

      {varias && (
        <>
          <button type="button" className="mq-ampliada__seta mq-ampliada__seta--antes" aria-label="Foto anterior" onClick={anterior}>
            <Icone nome="chevron" />
          </button>
          <button type="button" className="mq-ampliada__seta mq-ampliada__seta--depois" aria-label="Próxima foto" onClick={proxima}>
            <Icone nome="chevron" />
          </button>
        </>
      )}
    </div>
  );
}
