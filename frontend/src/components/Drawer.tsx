import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  aberto: boolean;
  titulo: string;
  sub?: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  /** 'largo' para conteúdo com tabela de revisão. */
  largura?: 'normal' | 'largo';
}

/** Painel lateral para o que NÃO cabe na primeira tela.
 *
 *  A regra de densidade do painel: a Visão Geral mostra a decisão, e o
 *  material de apoio — as três propostas inteiras, a tabela de peças —
 *  fica atrás de um clique. Uma tela que mostra tudo não mostra nada.
 *
 *  Esc fecha, o foco entra ao abrir e o fundo trava a rolagem. */
export function Drawer({ aberto, titulo, sub, aoFechar, children, rodape, largura = 'normal' }: Props) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    painel.current?.focus();
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className="drawer-fundo" onClick={aoFechar}>
      <div
        className="drawer"
        data-largura={largura}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        ref={painel}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-topo">
          <div>
            <h2>{titulo}</h2>
            {sub && <p className="sub">{sub}</p>}
          </div>
          <button type="button" className="btn btn-leitura btn-sm" onClick={aoFechar}>
            Fechar
          </button>
        </header>
        <div className="drawer-corpo">{children}</div>
        {rodape && <footer className="drawer-rodape">{rodape}</footer>}
      </div>
    </div>
  );
}
