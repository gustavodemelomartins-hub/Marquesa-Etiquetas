import { useMemo } from 'react';
import type { Connection } from '../../services/client';
import { buscarEstado } from '../../services/state';
import { analisar } from '../../services/sync';
import { useApi, useAcao } from '../../hooks/useApi';
import { PageHeader } from '../../components/PageHeader';
import { MetricCard } from '../../components/MetricCard';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { SyncStatus } from './SyncStatus';
import { PendenciasList } from './PendenciasList';
import { montarPanorama } from './panorama';
import { diagnosticarSync } from './saude';
import { analisarRelato } from '../reconciliacao/classificar';
import { ReconciliationSummary } from '../reconciliacao/ReconciliationSummary';
import { ReconciliationTable } from '../reconciliacao/ReconciliationTable';

interface Props {
  conexao: Connection;
  /** Deixa a análise disponível para a aba de reconciliação, sem
   *  rebuscá-la: ler a loja inteira custa caro. */
  aoAnalisar: (a: ReturnType<typeof analisarRelato>) => void;
}

/** A tela da Nuvemshop.
 *
 *  A hierarquia é ESTADO → VISÃO GERAL → PENDÊNCIAS → AÇÃO, e ela existe
 *  para resolver um problema concreto do painel legado: lá tudo chega como
 *  aviso, na mesma severidade, misturando o que o robô conserta sozinho com
 *  o que só uma pessoa resolve.
 *
 *  Nada nesta tela escreve. O único botão que fala com a Nuvemshop é
 *  "Analisar sincronização", e ele usa a rodada SECA que o backend já tem:
 *  lê a loja inteira, calcula o que mudaria, e não toca no estoque de lá. */
export function NuvemshopPage({ conexao, aoAnalisar }: Props) {
  const estado = useApi((signal) => buscarEstado(conexao, signal), [conexao]);

  const analise = useAcao(async () => {
    const relato = await analisar(conexao);
    const a = analisarRelato(relato, new Date().toISOString());
    aoAnalisar(a);
    return a;
  });

  const panorama = useMemo(
    () => (estado.dados ? montarPanorama(estado.dados) : null),
    [estado.dados],
  );

  /* O "agora" entra como valor, não é lido lá dentro: assim o diagnóstico
     continua sendo função pura e testável sem congelar relógio. Recalcula
     quando o estado chega — que é quando a resposta pode mudar. */
  const diagnostico = useMemo(
    () => (estado.dados ? diagnosticarSync(estado.dados.sync, new Date()) : null),
    [estado.dados],
  );

  if (estado.carregando && !estado.dados) {
    return (
      <>
        <PageHeader kicker="Integração" titulo="Nuvemshop" />
        <LoadingState>Lendo o estado do sistema…</LoadingState>
      </>
    );
  }

  if (estado.erro) {
    return (
      <>
        <PageHeader kicker="Integração" titulo="Nuvemshop" />
        <ErrorState erro={estado.erro} aoTentarDeNovo={estado.recarregar} />
      </>
    );
  }

  if (!estado.dados || !panorama || !diagnostico) return null;

  const { sync } = estado.dados;

  return (
    <>
      <PageHeader
        kicker="Integração"
        titulo="Nuvemshop"
        sub="O que a loja publica hoje, o que diverge do estoque daqui, e o que só uma pessoa resolve."
        acoes={
          <button
            type="button"
            className="btn btn-analise"
            onClick={() => void analise.disparar()}
            disabled={analise.rodando || !sync.conectada}
            title={
              sync.conectada
                ? 'Lê a loja inteira e calcula o que mudaria. Não escreve nada.'
                : 'Conecte a loja antes'
            }
          >
            {analise.rodando ? 'Analisando…' : 'Analisar sincronização'}
          </button>
        }
      />

      {/* --------------------------------------------------- ESTADO */}
      <SyncStatus sync={sync} lidoEm={panorama.lidoEm} diagnostico={diagnostico} />

      {/* --------------------------------------------- VISÃO GERAL */}
      <section className="secao">
        <h2 className="secao-titulo">Visão geral</h2>
        <div className="grade">
          <MetricCard
            rotulo="Produtos publicados"
            valor={panorama.produtos}
            nota={
              panorama.soNaLoja
                ? `${panorama.naLoja.length} códigos meus · ${panorama.soNaLoja} que não conheço`
                : `${panorama.naLoja.length} códigos meus`
            }
          />
          <MetricCard
            rotulo="Estoque divergente"
            valor={panorama.desatualizados.length}
            /* O mesmo número muda de gravidade conforme exista ou não uma
               próxima rodada para acertá-lo. Anunciar "a próxima rodada
               acerta" com a sincronização parada seria a tela mentindo. */
            tom={
              !panorama.desatualizados.length
                ? 'positivo'
                : !diagnostico.autoCorrige
                  ? 'critico'
                  : 'atencao'
            }
            nota={
              !panorama.desatualizados.length
                ? 'A loja está em dia'
                : diagnostico.autoCorrige
                  ? 'A próxima rodada acerta sozinha'
                  : 'Ninguém vai acertar: veja as pendências'
            }
          />
          <MetricCard
            rotulo="Aguardando cadastro"
            valor={panorama.faltaSubir.length}
            tom={panorama.faltaSubir.length ? 'atencao' : 'neutro'}
            nota="Tem peça em casa, não existe na loja"
          />
          <MetricCard
            rotulo="Peças à venda"
            valor={panorama.pecasPublicadas}
            nota={`em ${panorama.naLoja.length} códigos`}
          />
        </div>
      </section>

      {/* ----------------------------------------------- PENDÊNCIAS */}
      <section className="secao">
        <h2 className="secao-titulo">Pendências</h2>
        <PendenciasList panorama={panorama} diagnostico={diagnostico} />
      </section>

      {/* ------------------------------------------- ANÁLISE (leitura) */}
      <section className="secao">
        <h2 className="secao-titulo">Análise da sincronização</h2>

        {/* `erro` é `unknown`: sem o `!!`, o TypeScript não aceita o
            resultado como algo que o React saiba desenhar. */}
        {!!analise.erro && (
          <ErrorState erro={analise.erro} aoTentarDeNovo={() => void analise.disparar()} />
        )}

        {analise.rodando && (
          <LoadingState>
            Lendo a loja inteira. Demora — são 2 requisições por segundo, e nada
            está sendo escrito lá.
          </LoadingState>
        )}

        {!analise.rodando && !analise.erro && !analise.dados && (
          <div className="aviso" data-tom="neutro">
            <b>Nenhuma análise nesta sessão.</b>
            <div className="corpo">
              &quot;Analisar sincronização&quot; roda a mesma leitura que o robô faz
              de madrugada, em modo seco: ela lê a loja, calcula o que mudaria e{' '}
              <strong>não escreve nada na Nuvemshop</strong>. Aplicar as mudanças
              ainda é feito pelo painel atual.
            </div>
          </div>
        )}

        {analise.dados && (
          <>
            <ReconciliationSummary analise={analise.dados} />
            <ReconciliationTable itens={analise.dados.itens} />
          </>
        )}
      </section>
    </>
  );
}
