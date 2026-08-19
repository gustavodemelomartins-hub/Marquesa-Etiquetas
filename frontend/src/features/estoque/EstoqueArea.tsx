import { useState } from 'react';
import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';
import type { ReconciliationAnalysis } from '../../types/reconciliation';
import { NuvemshopPage } from '../nuvemshop/NuvemshopPage';
import { ReconciliacaoPage } from '../reconciliacao/ReconciliacaoPage';
import { EstoqueTotalPage } from '../estoque-total/EstoqueTotalPage';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

/** Três telas, e Estoque Total é a porta.
 *
 *  "Visão Geral" deixou de ser uma subaba: ela era um lugar separado para
 *  ler números sobre a mesma coisa que Estoque Total já governa. Agora o
 *  painel abre EM CIMA de Estoque Total — quem chega vê o estado do
 *  estoque e as ações que o mudam na mesma tela, sem escolher entre olhar e
 *  agir. */
export type SubRotaEstoque = 'estoque-total' | 'nuvemshop' | 'pendencias';

const ABAS: { rota: SubRotaEstoque; rotulo: string }[] = [
  { rota: 'estoque-total', rotulo: 'Estoque Total' },
  { rota: 'nuvemshop', rotulo: 'Nuvemshop' },
  { rota: 'pendencias', rotulo: 'Pendências' },
];

interface Props {
  conexao: Connection;
  sub: SubRotaEstoque;
  aoNavegarSub: (r: SubRotaEstoque) => void;
  analise: ReconciliationAnalysis | null;
  aoAnalisar: (a: ReconciliationAnalysis) => void;
  estado: AppState | null;
  planejamento: UsoPlanejamento;
  aoVerPlanejamento: () => void;
  aoMudarEstoque: () => void;
}

/** A área "Estoque" — as telas que hoje mexem em quantidade física: a
 *  importação por planilha, a sincronização com a Nuvemshop, e o que está
 *  pendente de revisão.
 *
 *  Nuvemshop e Pendências (reconciliação) não são abas principais do
 *  sistema — a usuária pensa em "Estoque", não nos nomes internos das
 *  peças que o resolvem por baixo. */
export function EstoqueArea({
  conexao,
  sub,
  aoNavegarSub,
  analise,
  aoAnalisar,
  estado,
  planejamento,
  aoVerPlanejamento,
  aoMudarEstoque,
}: Props) {
  const [contagemPendencias] = useState<number | undefined>(
    analise ? analise.itens.length : undefined,
  );

  return (
    <div>
      <div className="filtros" role="tablist" aria-label="Estoque">
        {ABAS.map((a) => (
          <button
            key={a.rota}
            type="button"
            role="tab"
            className="pill"
            aria-pressed={sub === a.rota}
            onClick={() => aoNavegarSub(a.rota)}
          >
            {a.rotulo}
            {a.rota === 'pendencias' && contagemPendencias ? ` (${contagemPendencias})` : ''}
          </button>
        ))}
      </div>

      {sub === 'estoque-total' && (
        <EstoqueTotalPage
          conexao={conexao}
          estado={estado}
          planejamento={planejamento}
          aoVerPlanejamento={aoVerPlanejamento}
          aoMudarEstoque={aoMudarEstoque}
        />
      )}

      {sub === 'nuvemshop' && <NuvemshopPage conexao={conexao} aoAnalisar={aoAnalisar} />}

      {sub === 'pendencias' && (
        <ReconciliacaoPage
          analise={analise}
          aoIrParaNuvemshop={() => aoNavegarSub('nuvemshop')}
        />
      )}
    </div>
  );
}
