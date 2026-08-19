import { useState } from 'react';
import type { ReconciliationAnalysis } from '../types/reconciliation';
import { useConnection } from '../hooks/useConnection';
import { AppShell, type AreaPrincipal } from './AppShell';
import { ConnectionForm } from './ConnectionForm';
import { AreaPendente } from './AreaPendente';
import { EstoqueArea, type SubRotaEstoque } from '../features/estoque/EstoqueArea';

export function App() {
  const { conexao, conectar, desconectar } = useConnection();
  const [area, setArea] = useState<AreaPrincipal>('estoque');
  const [subEstoque, setSubEstoque] = useState<SubRotaEstoque>('visao-geral');
  /* A análise é cara — lê a loja inteira a 2 requisições por segundo. Ela
     sobe até aqui para Nuvemshop e Pendências (dentro de Estoque)
     compartilharem o mesmo resultado em vez de cada uma pedir o seu. */
  const [analise, setAnalise] = useState<ReconciliationAnalysis | null>(null);

  if (!conexao) {
    return (
      <div className="shell">
        <div className="shell-topo">
          <div className="marca">
            Marquesa <span>·</span> Painel
          </div>
        </div>
        <main className="conteudo">
          <ConnectionForm aoConectar={conectar} />
        </main>
      </div>
    );
  }

  return (
    <AppShell
      area={area}
      aoNavegar={setArea}
      aoDesconectar={() => {
        setAnalise(null);
        desconectar();
      }}
      itens={[
        { area: 'etiqueta', rotulo: 'Etiqueta' },
        { area: 'estoque', rotulo: 'Estoque' },
        { area: 'revendedoras', rotulo: 'Revendedoras' },
        { area: 'vendas', rotulo: 'Vendas' },
      ]}
    >
      {area === 'etiqueta' && (
        <AreaPendente
          titulo="Etiqueta"
          descricao="Geração e impressão de etiquetas seguem no painel clássico por enquanto."
        />
      )}

      {area === 'estoque' && (
        <EstoqueArea
          conexao={conexao}
          sub={subEstoque}
          aoNavegarSub={setSubEstoque}
          analise={analise}
          aoAnalisar={setAnalise}
        />
      )}

      {area === 'revendedoras' && (
        <AreaPendente
          titulo="Revendedoras"
          descricao="Lista de revendedoras, maletas e acertos seguem no painel clássico por enquanto."
        />
      )}

      {area === 'vendas' && (
        <AreaPendente
          titulo="Vendas"
          descricao="Registros de vendas, clientes e histórico seguem no painel clássico por enquanto."
        />
      )}
    </AppShell>
  );
}
