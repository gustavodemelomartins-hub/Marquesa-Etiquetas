import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';
import { EstoqueTotalPage } from '../estoque-total/EstoqueTotalPage';
import { PainelEstoque } from '../estoque-total/PainelEstoque';
import { PecasArea } from './PecasArea';
import { ABAS_DA_FICHA, type AbaDaFicha } from './FichaDaPeca';
import { InventarioArea } from '../inventario/InventarioArea';
import { AnaliseDeSaidas } from '../saidas/AnaliseDeSaidas';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

/** As telas do módulo Peças, e o endereço de cada uma:
 *
 *    #/estoque                 a lista de peças (a porta)
 *    #/estoque/peca:<sku>      a ficha de uma peça (página própria)
 *    #/estoque/peca:<sku>|fotos  a ficha já na aba de fotos (idem as outras abas)
 *    #/estoque/novo            a lista com o cadastro de peça nova aberto
 *    #/estoque/importar-fotos  a lista com a importação de fotos da loja aberta
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
  abaDaFicha: AbaDaFicha;
  criando: boolean;
  incompletas: boolean;
  importandoFotos: boolean;
} {
  const s = sub ?? '';
  const base = { peca: null, abaDaFicha: 'geral' as AbaDaFicha, criando: false, incompletas: false, importandoFotos: false };
  if (s.startsWith('peca:')) {
    /* `peca:<sku>|<aba>`. O separador é a ÚLTIMA barra vertical, e só vale
       se o que vem depois é uma aba conhecida — um SKU com "|" no meio
       continua sendo o SKU inteiro. */
    const resto = s.slice(5);
    const corte = resto.lastIndexOf('|');
    const talvez = corte >= 0 ? resto.slice(corte + 1) : '';
    const abaDaFicha = ABAS_DA_FICHA.find((a) => a.id === talvez)?.id;
    const peca = abaDaFicha ? resto.slice(0, corte) : resto;
    return { ...base, aba: 'pecas', peca: peca || null, abaDaFicha: abaDaFicha ?? 'geral' };
  }
  if (s === 'importar-fotos') return { ...base, aba: 'pecas', importandoFotos: true };
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
          abaDaFicha={rota.abaDaFicha}
          aoAbrirPeca={(sku, aba) => aoNavegar(sku ? (aba && aba !== 'geral' ? `peca:${sku}|${aba}` : `peca:${sku}`) : null)}
          criando={rota.criando}
          aoCriar={(abrir) => aoNavegar(abrir ? 'novo' : null)}
          importandoFotos={rota.importandoFotos}
          aoImportarFotos={(abrir) => aoNavegar(abrir ? 'importar-fotos' : null)}
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
