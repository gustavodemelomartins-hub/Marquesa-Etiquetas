import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';
import { EstoqueTotalPage } from '../estoque-total/EstoqueTotalPage';
import { PainelEstoque } from '../estoque-total/PainelEstoque';
import { PecasArea } from './PecasArea';
import { InventarioArea } from '../inventario/InventarioArea';
import { AnaliseDeSaidas } from '../saidas/AnaliseDeSaidas';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

/** As telas do módulo Peças, e o endereço de cada uma:
 *
 *    #/estoque                 a lista de peças (a porta)
 *    #/estoque/peca:<sku>      a lista com a ficha de uma peça aberta
 *    #/estoque/novo            a lista com o cadastro de peça nova aberto
 *    #/estoque/incompletas     a lista filtrada no cadastro incompleto
 *    #/estoque/resumo          onde está o patrimônio
 *    #/estoque/entrada         peça nova, uma a uma ou por planilha
 *    #/estoque/inventario      a contagem física
 *    #/estoque/saidas          análise do que saiu sem faturar (sem aba)
 *
 *  Até 27/09/2026 este módulo se chamava Estoque e tinha seis abas, duas
 *  das quais pulavam para OUTROS módulos (Catálogo e Nuvemshop) e levavam
 *  as abas junto. Agora são quatro, todas daqui: a loja online é um item
 *  próprio do menu, e o cadastro da peça mora na ficha dela. */
export type SubRotaEstoque = 'pecas' | 'resumo' | 'entrada' | 'inventario' | 'saidas';

const ABAS: { id: SubRotaEstoque; rotulo: string; rota: string | null }[] = [
  { id: 'pecas', rotulo: 'Peças', rota: null },
  { id: 'resumo', rotulo: 'Resumo', rota: 'resumo' },
  { id: 'entrada', rotulo: 'Entrada de peças', rota: 'entrada' },
  { id: 'inventario', rotulo: 'Inventário', rota: 'inventario' },
];

/** Lê o segundo segmento do endereço. Os nomes antigos continuam valendo
 *  para link mandado antes da mudança não quebrar. */
export function lerSubEstoque(sub: string | null): {
  aba: SubRotaEstoque;
  peca: string | null;
  criando: boolean;
  incompletas: boolean;
} {
  const s = sub ?? '';
  const base = { peca: null, criando: false, incompletas: false };
  if (s.startsWith('peca:')) return { ...base, aba: 'pecas', peca: s.slice(5) || null };
  if (s === 'novo') return { ...base, aba: 'pecas', criando: true };
  if (s === 'incompletas') return { ...base, aba: 'pecas', incompletas: true };
  if (s === 'resumo' || s === 'estoque-total') return { ...base, aba: 'resumo' };
  if (s === 'entrada') return { ...base, aba: 'entrada' };
  if (s === 'inventario') return { ...base, aba: 'inventario' };
  if (s === 'saidas') return { ...base, aba: 'saidas' };
  return { ...base, aba: 'pecas' };
}

interface Props {
  conexao: Connection;
  /** O segundo segmento do endereço, cru. */
  sub: string | null;
  aoNavegar: (sub: string | null) => void;
  estado: AppState | null;
  planejamento: UsoPlanejamento;
  aoVerPlanejamento: () => void;
  aoMudarEstoque: () => void;
}

/** PEÇAS — onde está cada peça, como ela se chama e quanto custa. */
export function EstoqueArea({
  conexao, sub, aoNavegar, estado, planejamento, aoVerPlanejamento, aoMudarEstoque,
}: Props) {
  const rota = lerSubEstoque(sub);

  /* Fragmento, e não `<div>`: a faixa de abas precisa ser filha DIRETA do
     `main` para o casco poder encostá-la na barra superior. */
  return (
    <>
      <nav className="mq-tabs" role="tablist" aria-label="Peças">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={rota.aba === a.id}
            onClick={() => aoNavegar(a.rota)}
          >
            {a.rotulo}
          </button>
        ))}
      </nav>

      {rota.aba === 'pecas' && (
        <PecasArea
          conexao={conexao}
          estado={estado}
          carregando={!estado}
          erro={null}
          recarregar={aoMudarEstoque}
          pecaAberta={rota.peca}
          aoAbrirPeca={(sku) => aoNavegar(sku ? `peca:${sku}` : null)}
          criando={rota.criando}
          aoCriar={(abrir) => aoNavegar(abrir ? 'novo' : null)}
          filtroInicial={rota.incompletas ? 'incompleto' : 'ativo'}
        />
      )}

      {rota.aba === 'resumo' && estado && (
        <PainelEstoque
          estado={estado}
          planejamento={planejamento}
          aoVerPlanejamento={aoVerPlanejamento}
          aoConferirEstoque={() => aoNavegar('inventario')}
          aoNovoProduto={() => aoNavegar('novo')}
          aoVerPendencias={() => aoNavegar('incompletas')}
        />
      )}

      {rota.aba === 'entrada' && (
        <EstoqueTotalPage
          conexao={conexao}
          estado={estado}
          aoNovoProduto={() => aoNavegar('novo')}
          aoMudarEstoque={aoMudarEstoque}
        />
      )}

      {rota.aba === 'inventario' && (
        <InventarioArea conexao={conexao} estado={estado} aoMudarEstoque={aoMudarEstoque} />
      )}

      {rota.aba === 'saidas' && <AnaliseDeSaidas conexao={conexao} />}
    </>
  );
}
