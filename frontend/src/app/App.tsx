import { useState } from 'react';
import type { ReconciliationAnalysis } from '../types/reconciliation';
import { useConnection } from '../hooks/useConnection';
import { AppShell } from './AppShell';
import type { ModuloId } from './modulos';
import { ConnectionForm } from './ConnectionForm';
import { AreaPendente } from './AreaPendente';
import { ClientesArea } from '../features/clientes/ClientesArea';
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
      <div className="mq-entrada">
        <div className="mq-entrada__marca">
          Marquesa <small>Sistema</small>
        </div>
        <ConnectionForm aoConectar={conectar} />
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
  const [modulo, setModulo] = useState<ModuloId>('estoque');
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

  /* Nuvemshop é módulo de primeiro nível no trilho E aba dentro de Estoque,
     porque é assim que se chega nela pelos dois caminhos reais: pelo menu,
     quando o assunto é publicar; pela aba, quando já se está olhando peça.
     São duas PORTAS, não duas telas — e estas duas funções existem para
     que o trilho e a faixa de abas nunca discordem sobre onde se está. */
  const navegar = (m: ModuloId) => {
    setModulo(m);
    if (m === 'nuvemshop') setSubEstoque('nuvemshop');
    if (m === 'estoque' && subEstoque === 'nuvemshop') setSubEstoque('estoque-total');
  };
  const navegarSubEstoque = (r: SubRotaEstoque) => {
    setSubEstoque(r);
    setModulo(r === 'nuvemshop' ? 'nuvemshop' : 'estoque');
  };

  const emEstoque = modulo === 'estoque' || modulo === 'nuvemshop';

  return (
    <AppShell
      conexao={conexao}
      modulo={modulo}
      aoNavegar={navegar}
      contagens={analise?.itens.length ? { estoque: analise.itens.length } : undefined}
      aoDesconectar={() => {
        setAnalise(null);
        aoDesconectar();
      }}
    >
      {modulo === 'clientes' && <ClientesArea conexao={conexao} />}

      {emEstoque && (
        <EstoqueArea
          conexao={conexao}
          sub={subEstoque}
          aoNavegarSub={navegarSubEstoque}
          analise={analise}
          aoAnalisar={setAnalise}
          estado={estado.dados}
          planejamento={planejamento}
          aoVerPlanejamento={() => {
            setSubRev('visao-geral');
            setModulo('revendedoras');
          }}
          aoMudarEstoque={estado.recarregar}
        />
      )}

      {modulo === 'revendedoras' && (
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

      {modulo !== 'clientes' && !emEstoque && modulo !== 'revendedoras' && (
        <AreaPendente modulo={modulo} />
      )}
    </AppShell>
  );
}
