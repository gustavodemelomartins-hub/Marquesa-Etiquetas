import { useState } from 'react';
import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { EscolhaModo } from './EscolhaModo';
import { UploadPlanilha } from './UploadPlanilha';
import { ResumoSessao } from './ResumoSessao';
import { TabelaItensSessao } from './TabelaItensSessao';
import { ConfirmarAplicar } from './ConfirmarAplicar';
import { ResultadoAplicacao } from './ResultadoAplicacao';
import { PainelEstoque } from './PainelEstoque';
import { PecasArea } from '../estoque/PecasArea';
import { InventarioArea } from '../inventario/InventarioArea';
import { useSessaoPlanilha } from './useSessaoPlanilha';
import { itensAprovados, itensPendentes } from './itens';
import type { ModoPlanilha } from './tipos';
import type { ResultadoParse } from './parsePlanilha';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

type Etapa = 'escolha' | 'upload' | 'revisao' | 'confirmando' | 'resultado';

interface Props {
  conexao: Connection;
  /** `GET /api/state`, buscado uma vez no `App` e compartilhado. `null`
   *  enquanto carrega ou quando a leitura falhou — o painel some, e o
   *  fluxo de importação abaixo continua funcionando sem ele. */
  estado: AppState | null;
  planejamento: UsoPlanejamento;
  /** Leva para Revendedoras › Visão Geral. */
  aoVerPlanejamento: () => void;
  /** As duas ações do cabeçalho do protótipo e a saída do KPI de
   *  pendências. Quem navega é `EstoqueArea`. */
  aoConferirEstoque: () => void;
  aoNovoProduto: () => void;
  aoVerPendencias: () => void;
  /** Aplicar estoque muda produtos — o estado compartilhado precisa ser
   *  relido, senão o painel do topo passa a mentir. */
  aoMudarEstoque: () => void;
}

/** A tela "Estoque Total": duas importações independentes, o mesmo motor
 *  de reconciliação por baixo das duas.
 *
 *  A pessoa não está "importando uma planilha" — está dizendo ao sistema
 *  qual é a referência atual, e o sistema mostra o que seria diferente
 *  antes de tocar em qualquer estoque. Nada escreve antes da etapa
 *  "confirmando". */
export function EstoqueTotalPage({
  conexao,
  estado,
  planejamento,
  aoVerPlanejamento,
  aoConferirEstoque,
  aoNovoProduto,
  aoVerPendencias,
  aoMudarEstoque,
}: Props) {
  const [etapa, setEtapa] = useState<Etapa>('escolha');
  const [modo, setModo] = useState<ModoPlanilha>('estoque-total');
  const [decidindoId, setDecidindoId] = useState<number | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');

  const { sessao, carregando, erro, resultadoAplicar, analisar, decidir, aplicar, cancelar, reiniciar } =
    useSessaoPlanilha(conexao, modo);

  function irParaEscolha() {
    reiniciar();
    setEtapa('escolha');
  }

  function escolher(m: ModoPlanilha) {
    setModo(m);
    setEtapa('upload');
  }

  async function aoAnalisar(resultado: ResultadoParse) {
    setNomeArquivo(resultado.nomeArquivo);
    const s = await analisar(resultado.produtos);
    if (s) setEtapa('revisao');
  }

  async function aoDecidir(itemId: number, aprovar: boolean) {
    setDecidindoId(itemId);
    await decidir(itemId, aprovar);
    setDecidindoId(null);
  }

  async function aoCancelarRevisao() {
    await cancelar();
    irParaEscolha();
  }

  async function aoConfirmarAplicar() {
    const r = await aplicar();
    if (r) {
      setEtapa('resultado');
      aoMudarEstoque();
    }
  }

  const aprovados = sessao ? itensAprovados(sessao.itens) : [];
  const pendentes = sessao ? itensPendentes(sessao.itens) : [];

  return (
    <>
      {/* Na etapa de escolha quem manda no cabeçalho é a VISÃO GERAL, com
          o `mq-pagehead` do protótipo. O antigo `PageHeader` chamava esta
          tela de "Estoque Total" — o nome do importador — e fazia a porta
          do módulo parecer uma tela de importação de planilha. A
          importação continua aqui, logo abaixo, como o que ela é: uma
          ação sobre o estoque, não a identidade dele. */}
      {etapa === 'escolha' && estado && (
        <PainelEstoque
          estado={estado}
          planejamento={planejamento}
          aoVerPlanejamento={aoVerPlanejamento}
          aoConferirEstoque={aoConferirEstoque}
          aoNovoProduto={aoNovoProduto}
          aoVerPendencias={aoVerPendencias}
        />
      )}

      {/* "CONFERÊNCIA FÍSICA · INVENTÁRIO" — a posição é a do protótipo:
          entre a distribuição do patrimônio e o catálogo físico, no mesmo
          documento. O inventário deixou de ser um lugar aonde se vai e
          voltou a ser uma coisa que se faz de dentro do Estoque.

          A aba "Inventário" e a rota `#/estoque/inventario` continuam
          existindo e renderizam O MESMO componente em tela cheia. */}
      {etapa === 'escolha' && (
        <InventarioArea
          conexao={conexao}
          estado={estado}
          aoMudarEstoque={aoMudarEstoque}
          embutida
        />
      )}

      {/* "TODOS OS PRODUTOS" — no protótipo esta tabela é uma SEÇÃO da
          Visão geral, e não uma aba à parte. Embutida, ela não repete os
          KPIs nem a nota sobre custo que o painel acima já deu. A rota
          `#/estoque/pecas` continua válida para quem tiver o link. */}
      {etapa === 'escolha' && (
        <section className="mq-card mq-card--flush">
          <div className="mq-card__head">
            <div>
              <p className="mq-eyebrow">Catálogo físico</p>
              <h2 className="mq-title">Todos os produtos</h2>
              <p className="mq-lede">
                A foto sempre aparece primeiro. Clique numa linha para abrir a
                razão da peça, movimento a movimento.
              </p>
            </div>
          </div>
          <PecasArea
            conexao={conexao}
            estado={estado}
            carregando={!estado}
            erro={null}
            recarregar={aoMudarEstoque}
            embutida
          />
        </section>
      )}

      {etapa === 'escolha' && (
        <section className="mq-card">
          <div className="mq-card__head">
            <div>
              <p className="mq-eyebrow">Referência de estoque</p>
              <h2 className="mq-title">Atualizar Estoque Total</h2>
              <p className="mq-lede">
                A planilha de referência da Stéfane, comparada com o que o
                sistema tem hoje. Nada muda até você aprovar e aplicar.
              </p>
            </div>
          </div>
          <div className="mq-card__body">
            <EscolhaModo aoEscolher={escolher} />
          </div>
        </section>
      )}

      {/* Fora da escolha, a tela É o importador — e aí ela se apresenta
          como tal. */}
      {etapa !== 'escolha' && (
        <PageHeader
          kicker="Estoque"
          titulo="Atualizar Estoque Total"
          sub="A planilha de referência da Stéfane, comparada com o que o sistema tem hoje. Nada muda até você aprovar e aplicar."
        />
      )}

      {etapa === 'upload' && (
        <UploadPlanilha modo={modo} aoAnalisar={aoAnalisar} analisando={carregando} aoVoltar={irParaEscolha} />
      )}

      {!!erro && <ErrorState erro={erro} />}

      {etapa === 'revisao' && sessao && (
        <>
          <ResumoSessao modo={modo} nomeArquivo={nomeArquivo} resumo={sessao.resumo!} />
          <TabelaItensSessao itens={sessao.itens} aoDecidir={aoDecidir} decidindoId={decidindoId} />
          <div className="acoes" style={{ marginTop: 'var(--r5)' }}>
            <button type="button" className="btn btn-leitura" onClick={aoCancelarRevisao}>
              Cancelar análise
            </button>
            <button
              type="button"
              className="btn btn-escrita"
              disabled={!aprovados.length}
              title={
                !aprovados.length
                  ? 'Aprove pelo menos um item antes de continuar.'
                  : pendentes.length
                    ? `Ainda há ${pendentes.length} item(ns) aguardando decisão — eles ficam de fora desta aplicação.`
                    : undefined
              }
              onClick={() => setEtapa('confirmando')}
            >
              Revisar e aplicar ({aprovados.length})
            </button>
          </div>
        </>
      )}

      {etapa === 'confirmando' && sessao && (
        <ConfirmarAplicar
          modo={modo}
          aprovados={aprovados}
          aplicando={carregando}
          aoVoltar={() => setEtapa('revisao')}
          aoConfirmar={aoConfirmarAplicar}
        />
      )}

      {etapa === 'confirmando' && carregando && <LoadingState>Aplicando…</LoadingState>}

      {etapa === 'resultado' && resultadoAplicar && (
        <ResultadoAplicacao resultado={resultadoAplicar} aoNovaAnalise={irParaEscolha} />
      )}
    </>
  );
}
