import { useState } from 'react';
import type { Connection } from '../../services/client';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { EscolhaModo } from './EscolhaModo';
import { UploadPlanilha } from './UploadPlanilha';
import { ResumoSessao } from './ResumoSessao';
import { TabelaItensSessao } from './TabelaItensSessao';
import { ConfirmarAplicar } from './ConfirmarAplicar';
import { ResultadoAplicacao } from './ResultadoAplicacao';
import { useSessaoPlanilha } from './useSessaoPlanilha';
import { itensAprovados, itensPendentes } from './itens';
import type { ModoPlanilha } from './tipos';
import type { ResultadoParse } from './parsePlanilha';

type Etapa = 'escolha' | 'upload' | 'revisao' | 'confirmando' | 'resultado';

interface Props {
  conexao: Connection;
}

/** A tela "Estoque Total": duas importações independentes, o mesmo motor
 *  de reconciliação por baixo das duas.
 *
 *  A pessoa não está "importando uma planilha" — está dizendo ao sistema
 *  qual é a referência atual, e o sistema mostra o que seria diferente
 *  antes de tocar em qualquer estoque. Nada escreve antes da etapa
 *  "confirmando". */
export function EstoqueTotalPage({ conexao }: Props) {
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
    if (r) setEtapa('resultado');
  }

  const aprovados = sessao ? itensAprovados(sessao.itens) : [];
  const pendentes = sessao ? itensPendentes(sessao.itens) : [];

  return (
    <>
      <PageHeader
        kicker="Estoque"
        titulo="Estoque Total"
        sub="A planilha de referência da Stéfane, comparada com o que o sistema tem hoje. Nada muda até você aprovar e aplicar."
      />

      {etapa === 'escolha' && <EscolhaModo aoEscolher={escolher} />}

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
