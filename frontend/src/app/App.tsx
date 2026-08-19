import { useState } from 'react';
import type { ReconciliationAnalysis } from '../types/reconciliation';
import { useConnection } from '../hooks/useConnection';
import { AppShell, type AreaPrincipal } from './AppShell';
import { ConnectionForm } from './ConnectionForm';
import { AreaPendente } from './AreaPendente';
import { EstoqueArea, type SubRotaEstoque } from '../features/estoque/EstoqueArea';
import {
  RevendedorasArea,
  type SubRotaRevendedoras,
} from '../features/revendedoras/RevendedorasArea';
import type { Connection } from '../services/client';
import { useEstado } from '../hooks/useEstado';
import { usePlanejamento } from '../hooks/usePlanejamento';

export function App() {
  const { conexao, conectar, desconectar } = useConnection();

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

  /* Componente separado porque os hooks de leitura precisam de uma conexão
     que já existe — e um hook não pode nascer depois de um `return`. */
  return <AppConectado conexao={conexao} aoDesconectar={desconectar} />;
}

function AppConectado({
  conexao,
  aoDesconectar,
}: {
  conexao: Connection;
  aoDesconectar: () => void;
}) {
  const [area, setArea] = useState<AreaPrincipal>('estoque');
  const [subEstoque, setSubEstoque] = useState<SubRotaEstoque>('estoque-total');
  const [subRev, setSubRev] = useState<SubRotaRevendedoras>('visao-geral');
  /* A análise é cara — lê a loja inteira a 2 requisições por segundo. Ela
     sobe até aqui para Nuvemshop e Pendências (dentro de Estoque)
     compartilharem o mesmo resultado em vez de cada uma pedir o seu. */
  const [analise, setAnalise] = useState<ReconciliationAnalysis | null>(null);

  /* `GET /api/state` também sobe: Estoque e Revendedoras contam as MESMAS
     peças, e duas leituras independentes podem discordar. */
  const estado = useEstado(conexao);
  const planejamento = usePlanejamento(estado.dados);

  return (
    <AppShell
      area={area}
      aoNavegar={setArea}
      aoDesconectar={() => {
        setAnalise(null);
        aoDesconectar();
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
          estado={estado.dados}
          planejamento={planejamento}
          aoVerPlanejamento={() => {
            setSubRev('visao-geral');
            setArea('revendedoras');
          }}
          aoMudarEstoque={estado.recarregar}
        />
      )}

      {area === 'revendedoras' && (
        <RevendedorasArea
          conexao={conexao}
          estado={estado.dados}
          carregando={estado.carregando}
          erro={estado.erro}
          recarregar={estado.recarregar}
          planejamento={planejamento}
          sub={subRev}
          aoNavegarSub={setSubRev}
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
