import type { Connection } from '../../services/client';
import type { ModuloId } from '../../app/modulos';
import type { AppState } from '../../types/api';
import type { ReconciliationAnalysis } from '../../types/reconciliation';
import { NuvemshopPage } from '../nuvemshop/NuvemshopPage';
import { ReconciliacaoPage } from '../reconciliacao/ReconciliacaoPage';
import { EstoqueTotalPage } from '../estoque-total/EstoqueTotalPage';
import { PecasArea } from './PecasArea';
import { InventarioArea } from '../inventario/InventarioArea';
import { AnaliseDeSaidas } from '../saidas/AnaliseDeSaidas';
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

/** As abas do PROTÓTIPO, nesta ordem, com o destino real de cada uma.
 *
 *  Duas delas não são sub-rotas de Estoque: "Cadastro de produtos" é o
 *  módulo Catálogo e "Publicar na loja" é a fila de publicação da
 *  Nuvemshop. No protótipo elas são links para outro documento; aqui são
 *  navegação de módulo. A usuária vê a mesma faixa dos dois lados, que é
 *  o ponto — ela não deveria precisar saber qual das seis mora onde.
 *
 *  "Peças" e "Saiu sem faturar" saíram da faixa: no protótipo a lista de
 *  peças é uma SEÇÃO da Visão geral ("Todos os produtos"), e a saída sem
 *  faturamento é um dos três lançamentos de Vendas. As rotas
 *  `#/estoque/pecas` e `#/estoque/saidas` continuam válidas — link antigo
 *  não quebra —, elas só deixaram de ser porta principal. */
/** Os módulos que a faixa de Estoque alcança. Lista fechada de propósito:
 *  a aba de um módulo é uma decisão de navegação, não um `ModuloId` solto
 *  que qualquer um pode passar daqui. */
type DestinoModulo = Extract<ModuloId, 'catalogo' | 'nuvemshop'>;

type DestinoAba =
  | { tipo: 'sub'; rota: SubRotaEstoque }
  | { tipo: 'modulo'; modulo: DestinoModulo; sub?: string };

interface Aba {
  id: string;
  rotulo: string;
  destino: DestinoAba;
}

const ABAS: Aba[] = [
  { id: 'estoque-total', rotulo: 'Visão geral', destino: { tipo: 'sub', rota: 'estoque-total' } },
  { id: 'catalogo', rotulo: 'Cadastro de produtos', destino: { tipo: 'modulo', modulo: 'catalogo' } },
  { id: 'nuvemshop', rotulo: 'Na loja', destino: { tipo: 'sub', rota: 'nuvemshop' } },
  { id: 'pendencias', rotulo: 'Pendências', destino: { tipo: 'sub', rota: 'pendencias' } },
  { id: 'inventario', rotulo: 'Inventário', destino: { tipo: 'sub', rota: 'inventario' } },
  {
    id: 'publicacao',
    rotulo: 'Publicar na loja',
    destino: { tipo: 'modulo', modulo: 'nuvemshop', sub: 'publicacao' },
  },
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
  /** Sair de Estoque para um módulo — é o que "Cadastro de produtos",
   *  "Publicar na loja" e o KPI "Precisam de atenção" fazem. */
  aoAbrirModulo: (modulo: DestinoModulo, sub?: string | null) => void;
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
  aoAbrirModulo,
  aoMudarEstoque,
  subNuvemshop,
  aoNavegarNuvemshop,
}: Props) {
  /* As contagens da faixa. São as MESMAS do resto da tela — `loja` é o
     retrato da última sincronização e `analise` é a revisão pendente —, e
     por isso a aba nunca pode discordar do conteúdo dela.

     `undefined` significa "ainda não sei", e o badge some. Um "0" ali
     afirmaria que não há nada na loja, e essa afirmação depende de uma
     leitura que pode nunca ter acontecido nesta base. */
  const contagens: Record<string, number | undefined> = {
    nuvemshop: estado?.loja?.lidoEm ? estado.loja.produtosNaLoja : undefined,
    pendencias: analise ? analise.itens.length : undefined,
  };

  /* A aba acesa. Pelo módulo Nuvemshop com `sub=publicacao` quem acende é
     "Publicar na loja", e não "Na loja": são duas telas, e a faixa tem de
     dizer em qual se está. */
  const abaAtiva = sub === 'nuvemshop' && subNuvemshop === 'publicacao' ? 'publicacao' : sub;

  const navegar = (a: Aba) => () => {
    if (a.destino.tipo === 'sub') aoNavegarSub(a.destino.rota);
    else aoAbrirModulo(a.destino.modulo, a.destino.sub ?? null);
  };

  /* Fragmento, e não `<div>`: a faixa de abas precisa ser filha DIRETA do
     `main` para o casco poder encostá-la na barra superior e atravessá-la
     de ponta a ponta, como o protótipo faz. Um invólucro no meio
     transformava a faixa num controle solto dentro da página. */
  return (
    <>
      {/* `.mq-tabs` — a faixa sublinhada do protótipo, com a contagem ao
          lado do rótulo. Era `.filtros`/`.pill`, que desenhava pílulas: a
          mesma navegação com outra aparência, em duas telas do mesmo
          sistema. */}
      <nav className="mq-tabs" role="tablist" aria-label="Estoque">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={abaAtiva === a.id}
            onClick={navegar(a)}
          >
            {a.rotulo}
            {contagens[a.id] !== undefined && contagens[a.id]! > 0 && (
              <span className="mq-badge">{contagens[a.id]}</span>
            )}
          </button>
        ))}
      </nav>

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

      {/* `#/estoque/saidas` é a tela de LEITURA — a "Análise de saídas" do
          protótipo. REGISTRAR uma saída é um lançamento, e mora em
          Vendas › Novo lançamento, junto com as outras duas maneiras de
          uma peça sair do estoque. */}
      {sub === 'saidas' && <AnaliseDeSaidas conexao={conexao} />}

      {sub === 'estoque-total' && (
        <EstoqueTotalPage
          conexao={conexao}
          estado={estado}
          planejamento={planejamento}
          aoVerPlanejamento={aoVerPlanejamento}
          aoConferirEstoque={() => aoNavegarSub('inventario')}
          aoNovoProduto={() => aoAbrirModulo('catalogo')}
          /* Foto, categoria e preço se resolvem no CADASTRO da peça. */
          aoVerPendencias={() => aoAbrirModulo('catalogo')}
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
    </>
  );
}
