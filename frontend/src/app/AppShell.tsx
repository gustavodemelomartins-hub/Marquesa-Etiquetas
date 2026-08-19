import type { ReactNode } from 'react';
import { DevBadge } from './DevBadge';

/** As quatro áreas principais do sistema — como a usuária pensa no negócio,
 *  não como o código foi implementado. Nuvemshop, reconciliação,
 *  importações, maletas e acertos são funcionalidades DENTRO destas
 *  áreas, nunca abas de primeiro nível. */
export type AreaPrincipal = 'etiqueta' | 'estoque' | 'revendedoras' | 'vendas';

interface ItemNav {
  area: AreaPrincipal;
  rotulo: string;
  contagem?: number;
}

interface Props {
  area: AreaPrincipal;
  aoNavegar: (a: AreaPrincipal) => void;
  itens: ItemNav[];
  aoDesconectar?: () => void;
  children: ReactNode;
}

/** Casca do app: marca, navegação, conteúdo, rodapé.
 *
 *  Sem biblioteca de rotas: são duas telas, e a URL não precisa mudar
 *  enquanto o app legado ainda for o painel principal. Trocar isso por um
 *  router é barato depois — trocar um router por outro, não. */
export function AppShell({ area, aoNavegar, itens, aoDesconectar, children }: Props) {
  return (
    <div className="shell">
      <div className="shell-topo">
        <div className="marca">
          Marquesa <span>·</span> Painel
        </div>
        <DevBadge />
        <div className="espaco" />
        {aoDesconectar && (
          <button type="button" className="btn btn-leitura btn-sm" onClick={aoDesconectar}>
            Desconectar
          </button>
        )}
      </div>

      <nav className="nav" aria-label="Áreas principais">
        {itens.map((i) => (
          <button
            key={i.area}
            type="button"
            className="nav-item"
            aria-current={area === i.area ? 'page' : undefined}
            onClick={() => aoNavegar(i.area)}
          >
            {i.rotulo}
            {i.contagem !== undefined && i.contagem > 0 && (
              <span className="conta">{i.contagem}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="conteudo">{children}</main>

      <div className="rodape-faixa">
      <footer className="rodape">
        Painel novo, em construção. Etiquetas, vendas, inventário, acerto de
        maleta e o cadastro completo de produtos seguem em{' '}
        <a href="../../dashboard.html">dashboard.html</a>.
      </footer>
      </div>
    </div>
  );
}
