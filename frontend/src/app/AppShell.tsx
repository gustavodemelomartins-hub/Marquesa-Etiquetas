import type { ReactNode } from 'react';
import { DevBadge } from './DevBadge';
import { BuscaGlobalClientes } from './BuscaGlobalClientes';
import type { Connection } from '../services/client';

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
  conexao: Connection;
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
export function AppShell({ conexao, area, aoNavegar, itens, aoDesconectar, children }: Props) {
  return (
    <div className="shell">
      <header className="shell-cabecalho">
        <div className="shell-topo">
          <div className="shell-identidade">
            <div className="marca">
              Marquesa <span>·</span> Painel
            </div>
            <DevBadge />
          </div>
          <div className="shell-utilidades">
            <BuscaGlobalClientes conexao={conexao} />
            <div
              className="perfil-placeholder"
              aria-label="Perfil do usuário, disponível em breve"
              title="Perfis e permissões serão implementados em uma etapa futura"
            >
              <span className="perfil-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </span>
              <span className="perfil-texto">
                Perfil<small>Em breve</small>
              </span>
            </div>
            {aoDesconectar && (
              <button type="button" className="btn btn-leitura btn-sm" onClick={aoDesconectar}>
                Desconectar
              </button>
            )}
          </div>
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
      </header>

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
