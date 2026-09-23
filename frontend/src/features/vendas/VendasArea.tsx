import { useCallback, useState } from 'react';
import { PainelVendas } from './PainelVendas';
import { HistoricoVendas } from './HistoricoVendas';
import {
  SeletorDeLancamento, CabecalhoDoLancamento, type TipoDeLancamento,
} from './Lancamentos';
import { NovaVenda } from './NovaVenda';
import { SaidasArea } from '../saidas/SaidasArea';
import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado } from './tipos';

interface Props {
  conexao: Connection;
  /** O segundo segmento da rota. Ele é o que faz recarregar, voltar e
   *  mandar o link por mensagem funcionarem — nenhuma destas cinco telas
   *  mora só na memória do componente. */
  sub: string | null;
  aoNavegar: (sub: string | null) => void;
  estado: AppState | null;
  aoMudarEstoque: () => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
  aoAbrirModulo: (modulo: 'garantias' | 'financeiro') => void;
}

/** As cinco superfícies de Vendas, e o endereço de cada uma:
 *
 *    #/vendas                 PAINEL — como foi o período
 *    #/vendas/lancamentos     as três portas do dia
 *    #/vendas/nova            venda normal (aceita `nova:<id>:<nome>`)
 *    #/vendas/colar           venda normal com a composição já aberta
 *    #/vendas/saida           saída sem faturamento
 *    #/vendas/historico       a lista, venda a venda
 *
 *  A arquitetura é a do protótipo: PAINEL e LANÇAMENTOS são coisas
 *  diferentes, e o que estava no React era só a lista. Quem abre Vendas
 *  quer saber como foi o mês; quem abre Lançamentos está com a cliente na
 *  frente. Uma tela só servia mal às duas.
 */
export type SubRotaVendas = 'painel' | 'lancamentos' | 'nova' | 'colar' | 'saida' | 'historico';

const ABAS: { id: SubRotaVendas; rotulo: string; rota: string | null }[] = [
  { id: 'painel', rotulo: 'Painel', rota: null },
  { id: 'lancamentos', rotulo: 'Lançamentos', rota: 'lancamentos' },
  { id: 'historico', rotulo: 'Histórico', rota: 'historico' },
];

export function lerSubRota(sub: string | null): SubRotaVendas {
  if (!sub) return 'painel';
  if (sub === 'lancamentos') return 'lancamentos';
  if (sub === 'historico') return 'historico';
  if (sub === 'saida') return 'saida';
  if (sub === 'colar') return 'colar';
  if (sub === 'nova' || sub.startsWith('nova:')) return 'nova';
  return 'painel';
}

/** `nova:<id>:<nome>` — o id pode vir vazio quando a ficha foi aberta pelo
 *  histórico da planilha e não existe cadastro. */
export function clienteDaRota(sub: string | null): { id: number | null; nome: string } | null {
  if (!sub?.startsWith('nova:')) return null;
  const resto = sub.slice(5);
  const corte = resto.indexOf(':');
  if (corte === -1) return { id: null, nome: decodeURIComponent(resto) };
  const id = Number(resto.slice(0, corte));
  return {
    id: Number.isSafeInteger(id) && id > 0 ? id : null,
    nome: decodeURIComponent(resto.slice(corte + 1)),
  };
}

export function VendasArea({
  conexao, sub, aoNavegar, estado, aoMudarEstoque, aoAbrirCliente, aoAbrirModulo,
}: Props) {
  const atual = lerSubRota(sub);
  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];

  const irPara = (tipo: TipoDeLancamento) => {
    if (tipo === 'venda') aoNavegar('nova');
    else if (tipo === 'colar') aoNavegar('colar');
    else aoNavegar('saida');
  };

  /* As quatro superfícies de LANÇAMENTO são uma tela só. O endereço muda
     para o link continuar funcionando; o cabeçalho e o seletor, não. */
  const lancando = atual === 'lancamentos' || atual === 'nova'
    || atual === 'colar' || atual === 'saida';

  /* `NovaVenda` avisa quando há carrinho. O `useCallback` é necessário: a
     função entra num `useEffect` lá dentro, e uma identidade nova a cada
     render faria o efeito rodar em laço. */
  const [temRascunho, setTemRascunho] = useState(false);
  const aoMudarRascunho = useCallback((v: boolean) => setTemRascunho(v), []);

  const tipoAtivo: TipoDeLancamento | null =
    atual === 'nova' ? 'venda'
      : atual === 'colar' ? 'colar'
        : atual === 'saida' ? 'saida'
          : null;

  /* As abas ficam visíveis TAMBÉM durante o lançamento, como no protótipo.
     Elas sumiam para proteger o rascunho — e o efeito era que, começada uma
     venda, não havia mais como voltar ao Painel sem descobrir sozinho que o
     botão tinha ido embora. A proteção continua, mas como AVISO: sair com
     carrinho cheio pergunta antes. */
  const sair = (destino: string | null) => {
    if (temRascunho && !confirm(
      'Sair do lançamento? As peças que você já adicionou não foram '
      + 'registradas e serão perdidas.',
    )) return;
    aoNavegar(destino);
  };

  return (
    <>
      <nav className="mq-tabs" aria-label="Vendas">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-selected={a.id === 'lancamentos' ? lancando : atual === a.id}
            onClick={() => sair(a.rota)}
          >
            {a.rotulo}
          </button>
        ))}
      </nav>

      {atual === 'painel' && (
        <PainelVendas
          conexao={conexao}
          aoIrPara={(d) => aoNavegar(d === 'historico' ? 'historico' : 'lancamentos')}
          aoAbrirReparos={() => aoAbrirModulo('garantias')}
          aoAbrirAReceber={() => aoAbrirModulo('financeiro')}
          aoAbrirCliente={aoAbrirCliente}
        />
      )}

      {lancando && (
        <>
          <CabecalhoDoLancamento />
          <SeletorDeLancamento ativo={tipoAtivo} aoEscolher={irPara} />

          {/* A região operacional. Ela é a ÚNICA coisa que troca quando o
              tipo troca — o cabeçalho e o seletor acima continuam onde
              estavam, e é isso que mantém a coerência da tela. */}
          {tipoAtivo === null && (
            <section className="mq-card mq-card--pad mq-card--quiet">
              <p className="mq-lede">
                Escolha acima o que aconteceu. As três tiram peça do estoque;
                só as duas primeiras viram dinheiro.
              </p>
            </section>
          )}

          {(atual === 'nova' || atual === 'colar') && (
            <NovaVenda
              conexao={conexao}
              produtos={produtos}
              clienteInicial={clienteDaRota(sub)}
              abrirColar={atual === 'colar'}
              aoAbrirColar={() => aoNavegar('colar')}
              /* Voltar do composer é voltar para a VENDA, e não para o
                 hub: o carrinho continua lá, e mandar a pessoa para
                 Lançamentos a faria pensar que perdeu tudo. */
              aoFecharColar={() => aoNavegar('nova')}
              aoFechar={() => aoNavegar('lancamentos')}
              aoMudarRascunho={aoMudarRascunho}
              aoRegistrar={() => {
                aoNavegar('historico');
                aoMudarEstoque();
              }}
            />
          )}

          {atual === 'saida' && (
            <SaidasArea
              conexao={conexao}
              estado={estado}
              aoMudarEstoque={aoMudarEstoque}
              embutida
            />
          )}
        </>
      )}

      {atual === 'historico' && (
        <HistoricoVendas
          conexao={conexao}
          aoMudarEstoque={aoMudarEstoque}
          aoAbrirCliente={aoAbrirCliente}
          aoNovaVenda={() => aoNavegar('nova')}
        />
      )}
    </>
  );
}
