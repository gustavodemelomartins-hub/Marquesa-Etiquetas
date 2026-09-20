import { useState } from 'react';
import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';
import type { ReconciliationAnalysis } from '../../types/reconciliation';
import { NuvemshopPage } from '../nuvemshop/NuvemshopPage';
import { ReconciliacaoPage } from '../reconciliacao/ReconciliacaoPage';
import { EstoqueTotalPage } from '../estoque-total/EstoqueTotalPage';
import { PecasArea } from './PecasArea';
import { InventarioArea } from '../inventario/InventarioArea';
import { SaidasArea } from '../saidas/SaidasArea';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

/** Três telas, e Estoque Total é a porta.
 *
 *  "Visão Geral" deixou de ser uma subaba: ela era um lugar separado para
 *  ler números sobre a mesma coisa que Estoque Total já governa. Agora o
 *  painel abre EM CIMA de Estoque Total — quem chega vê o estado do
 *  estoque e as ações que o mudam na mesma tela, sem escolher entre olhar e
 *  agir. */
export type SubRotaEstoque =
  | 'estoque-total' | 'pecas' | 'inventario' | 'saidas' | 'nuvemshop' | 'pendencias';

const ABAS: { rota: SubRotaEstoque; rotulo: string }[] = [
  { rota: 'estoque-total', rotulo: 'Estoque Total' },
  /* As peças e a contagem entram AQUI, e não em módulos próprios: quem abre
     Estoque quer saber onde está o patrimônio, e "onde está" se responde
     olhando a peça e conferindo o que existe de verdade. */
  { rota: 'pecas', rotulo: 'Peças' },
  { rota: 'inventario', rotulo: 'Inventário' },
  { rota: 'saidas', rotulo: 'Saiu sem faturar' },
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
  /** A sub-rota DENTRO da Nuvemshop (`publicacao`). Ela desce até aqui
   *  porque Nuvemshop é módulo de primeiro nível no trilho E aba de
   *  Estoque: são duas PORTAS para a mesma tela, e o endereço tem de
   *  funcionar pelas duas. */
  subNuvemshop?: string | null;
  aoNavegarNuvemshop?: (sub: string | null) => void;
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
  subNuvemshop,
  aoNavegarNuvemshop,
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

      {sub === 'pecas' && (
        <PecasArea
          conexao={conexao}
          estado={estado}
          carregando={!estado}
          erro={null}
          recarregar={aoMudarEstoque}
        />
      )}

      {sub === 'inventario' && (
        <InventarioArea conexao={conexao} estado={estado} aoMudarEstoque={aoMudarEstoque} />
      )}

      {sub === 'saidas' && (
        <SaidasArea conexao={conexao} estado={estado} aoMudarEstoque={aoMudarEstoque} />
      )}

      {sub === 'estoque-total' && (
        <EstoqueTotalPage
          conexao={conexao}
          estado={estado}
          planejamento={planejamento}
          aoVerPlanejamento={aoVerPlanejamento}
          aoMudarEstoque={aoMudarEstoque}
        />
      )}

      {sub === 'nuvemshop' && (
        <NuvemshopPage
          conexao={conexao}
          aoAnalisar={aoAnalisar}
          sub={subNuvemshop ?? null}
          aoNavegarSub={aoNavegarNuvemshop}
        />
      )}

      {sub === 'pendencias' && (
        <ReconciliacaoPage
          analise={analise}
          aoIrParaNuvemshop={() => aoNavegarSub('nuvemshop')}
        />
      )}
    </div>
  );
}
