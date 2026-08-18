import type { ReactNode } from 'react';

export type Rota = 'nuvemshop' | 'reconciliacao';

interface ItemNav {
  rota: Rota;
  rotulo: string;
  contagem?: number;
}

interface Props {
  rota: Rota;
  aoNavegar: (r: Rota) => void;
  itens: ItemNav[];
  aoDesconectar?: () => void;
  children: ReactNode;
}

/** Casca do app: marca, navegação, conteúdo, rodapé.
 *
 *  Sem biblioteca de rotas: são duas telas, e a URL não precisa mudar
 *  enquanto o app legado ainda for o painel principal. Trocar isso por um
 *  router é barato depois — trocar um router por outro, não. */
export function AppShell({ rota, aoNavegar, itens, aoDesconectar, children }: Props) {
  return (
    <div className="shell">
      <div className="shell-topo">
        <div className="marca">
          Marquesa <span>·</span> Painel
        </div>
        <div className="espaco" />
        {aoDesconectar && (
          <button type="button" className="btn btn-leitura btn-sm" onClick={aoDesconectar}>
            Desconectar
          </button>
        )}
      </div>

      <nav className="nav" aria-label="Seções">
        {itens.map((i) => (
          <button
            key={i.rota}
            type="button"
            className="nav-item"
            aria-current={rota === i.rota ? 'page' : undefined}
            onClick={() => aoNavegar(i.rota)}
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
        Painel novo, em construção. O painel completo continua em{' '}
        <a href="../../dashboard.html">dashboard.html</a> — estoque, maletas,
        revendedoras, vendas e inventário seguem lá.
      </footer>
      </div>
    </div>
  );
}
