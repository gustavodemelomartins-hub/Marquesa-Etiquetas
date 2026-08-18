import { useState } from 'react';
import type { ReconciliationAnalysis } from '../types/reconciliation';
import { useConnection } from '../hooks/useConnection';
import { AppShell, type Rota } from './AppShell';
import { ConnectionForm } from './ConnectionForm';
import { NuvemshopPage } from '../features/nuvemshop/NuvemshopPage';
import { ReconciliacaoPage } from '../features/reconciliacao/ReconciliacaoPage';

export function App() {
  const { conexao, conectar, desconectar } = useConnection();
  const [rota, setRota] = useState<Rota>('nuvemshop');
  /* A análise é cara — lê a loja inteira a 2 requisições por segundo. Ela
     sobe até aqui para as duas telas compartilharem o mesmo resultado em
     vez de cada uma pedir o seu. */
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
      rota={rota}
      aoNavegar={setRota}
      aoDesconectar={() => {
        setAnalise(null);
        desconectar();
      }}
      itens={[
        { rota: 'nuvemshop', rotulo: 'Nuvemshop' },
        {
          rota: 'reconciliacao',
          rotulo: 'Reconciliação',
          ...(analise ? { contagem: analise.itens.length } : {}),
        },
      ]}
    >
      {rota === 'nuvemshop' ? (
        <NuvemshopPage conexao={conexao} aoAnalisar={setAnalise} />
      ) : (
        <ReconciliacaoPage analise={analise} aoIrParaNuvemshop={() => setRota('nuvemshop')} />
      )}
    </AppShell>
  );
}
