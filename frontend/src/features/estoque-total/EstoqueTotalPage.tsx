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
import { Icone } from '../../components/Icone';
import { useSessaoPlanilha } from './useSessaoPlanilha';
import { itensAprovados, itensPendentes } from './itens';
import type { ModoPlanilha } from './tipos';
import type { ResultadoParse } from './parsePlanilha';

type Etapa = 'escolha' | 'upload' | 'revisao' | 'confirmando' | 'resultado';

interface Props {
  conexao: Connection;
  /** `GET /api/state`, buscado uma vez no `App` e compartilhado. */
  estado: AppState | null;
  /** Abre o cadastro de UMA peça, em Peças. */
  aoNovoProduto: () => void;
  /** Aplicar estoque muda produtos — o estado compartilhado precisa ser
   *  relido, senão o painel do topo passa a mentir. */
  aoMudarEstoque: () => void;
}

/** ENTRADA DE PEÇAS — os dois jeitos de peça entrar no sistema: uma a uma
 *  ("Novo produto") ou em lote, por planilha. As duas importações por
 *  planilha usam o mesmo motor de reconciliação por baixo.
 *
 *  Até 27/09/2026 esta tela ficava no FIM da Visão geral do Estoque,
 *  depois da lista inteira de quase mil peças — na prática, ninguém chegava
 *  nela. Agora ela é uma aba própria de Peças.
 *
 *  A pessoa não está "importando uma planilha" — está dizendo ao sistema
 *  qual é a referência atual, e o sistema mostra o que seria diferente
 *  antes de tocar em qualquer estoque. Nada escreve antes da etapa
 *  "confirmando". */
export function EstoqueTotalPage({
  conexao,
  aoNovoProduto,
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
      {etapa === 'escolha' && (
        <>
          <div className="mq-pagehead">
            <div className="mq-pagehead__text">
              <p className="mq-eyebrow">Peças</p>
              <h1 className="mq-display">Entrada de peças</h1>
              <p className="mq-lede">
                Cadastre uma peça nova, ou atualize muitas de uma vez por
                planilha. Nada muda no estoque antes de você conferir.
              </p>
            </div>
          </div>

          <section className="mq-card mq-card--pad">
            <div className="mq-row">
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 className="mq-title">Uma peça</h2>
                <p className="mq-lede">Código, nome, preço e a quantidade que você tem hoje.</p>
              </div>
              <button type="button" className="mq-btn mq-btn--primary" onClick={aoNovoProduto}>
                <Icone nome="plus" />
                Novo produto
              </button>
            </div>
          </section>
        </>
      )}

      {etapa === 'escolha' && (
        <section className="mq-card">
          <div className="mq-card__head">
            <div>
              <p className="mq-eyebrow">Muitas peças</p>
              <h2 className="mq-title">Por planilha</h2>
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
          kicker="Entrada de peças"
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
