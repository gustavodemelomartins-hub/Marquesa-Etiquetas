import { useState } from 'react';
import type { Connection } from '../../services/client';
import type { ReconciliationAnalysis } from '../../types/reconciliation';
import { EmptyState } from '../../components/EmptyState';
import { NuvemshopPage } from '../nuvemshop/NuvemshopPage';
import { ReconciliacaoPage } from '../reconciliacao/ReconciliacaoPage';
import { EstoqueTotalPage } from '../estoque-total/EstoqueTotalPage';

export type SubRotaEstoque = 'visao-geral' | 'estoque-total' | 'nuvemshop' | 'pendencias';

const ABAS: { rota: SubRotaEstoque; rotulo: string }[] = [
  { rota: 'visao-geral', rotulo: 'Visão Geral' },
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
}

/** A área "Estoque" — contêiner das telas que hoje mexem em quantidade
 *  física: visão geral, importação por planilha (Estoque Total), a
 *  sincronização com a Nuvemshop, e o que está pendente de revisão.
 *
 *  Nuvemshop e Pendências (reconciliação) deixaram de ser abas principais
 *  do sistema — a usuária pensa em "Estoque", não nos nomes internos das
 *  peças que o resolvem por baixo. */
export function EstoqueArea({ conexao, sub, aoNavegarSub, analise, aoAnalisar }: Props) {
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

      {sub === 'visao-geral' && (
        <EmptyState
          titulo="Visão geral do estoque"
          descricao="Um resumo consolidado de tudo isto ainda não existe nesta tela nova. Por enquanto, use Estoque Total para atualizar quantidades por planilha, ou Nuvemshop para conferir a loja."
        />
      )}

      {sub === 'estoque-total' && <EstoqueTotalPage conexao={conexao} />}

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
