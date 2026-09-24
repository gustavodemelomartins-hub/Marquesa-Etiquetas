import { useState } from 'react';
import type { AppState } from '../../types/api';
import type { Connection } from '../../services/client';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { pesosDaRevendedora, type Sugestao } from '../../domain/sugestoes';
import { SugestoesDrawer } from '../maletas/SugestoesDrawer';
import { CriarMaletaFluxo } from '../maletas/CriarMaletaFluxo';
import { VisaoGeralRevendedoras } from './VisaoGeralRevendedoras';
import { RevendedoraPage } from './RevendedoraPage';
import { NovaRevendedora } from './NovaRevendedora';
import { TodasRevendedoras } from './TodasRevendedoras';
import { ConfiguracoesRevendedoras } from './ConfiguracoesRevendedoras';
import { AcertoMaletaFluxo } from '../maletas/AcertoMaletaFluxo';
import { maletaAbertaDe } from '../../domain/maletas';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

/** 'visao-geral' ou o id de uma revendedora. Os nomes das abas vêm do
 *  banco — nenhum nome de pessoa aparece escrito no código. */
export type SubRotaRevendedoras = 'visao-geral' | 'todas' | 'configuracoes' | number;

interface Props {
  conexao: Connection;
  estado: AppState | null;
  carregando: boolean;
  erro: unknown;
  recarregar: () => void;
  planejamento: UsoPlanejamento;
  sub: SubRotaRevendedoras;
  aoNavegarSub: (r: SubRotaRevendedoras) => void;
}

/** A área "Revendedoras": a Visão Geral primeiro, e uma aba por pessoa.
 *
 *  Planejar maleta é a atividade central desta área, então é aqui que o
 *  módulo de maletas vive inteiro — capacidade, sugestões e criação.
 *  Estoque Total mostra só o resumo e manda para cá. */
export function RevendedorasArea({
  conexao,
  estado,
  carregando,
  erro,
  recarregar,
  planejamento,
  sub,
  aoNavegarSub,
}: Props) {
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [novaAberta, setNovaAberta] = useState(false);
  const [criando, setCriando] = useState(false);
  const [sugestaoEscolhida, setSugestaoEscolhida] = useState<Sugestao | null>(null);
  const [acertoAberto, setAcertoAberto] = useState(false);

  if (erro) return <ErrorState erro={erro} aoTentarDeNovo={recarregar} />;
  if (!estado) return <LoadingState>Lendo estoque, maletas e revendedoras…</LoadingState>;

  const ativas = estado.revendedoras.filter((r) => r.status !== 'inativa');
  const atual = typeof sub === 'number' ? ativas.find((r) => r.id === sub) : null;
  /* Uma aba que aponta para alguém arquivada (ou removida entre duas
     leituras) volta para a Visão Geral em vez de mostrar tela vazia. */
  const rota: SubRotaRevendedoras = typeof sub === 'number' && !atual ? 'visao-geral' : sub;

  function abrirCriacao(s: Sugestao | null) {
    setSugestaoEscolhida(s);
    setSugestoesAbertas(false);
    setCriando(true);
  }

  const revendedoraDoFluxo = typeof rota === 'number' ? rota : null;
  const pesos =
    revendedoraDoFluxo !== null ? pesosDaRevendedora(estado, revendedoraDoFluxo) : undefined;
  const temPesos = pesos && Object.values(pesos).some((n) => n > 0);

  return (
    <div>
      <nav className="mq-tabs" role="tablist" aria-label="Revendedoras">
        <button
          type="button"
          role="tab"
          aria-selected={rota === 'visao-geral'}
          onClick={() => aoNavegarSub('visao-geral')}
        >
          Visão geral
        </button>
        <button type="button" role="tab" aria-selected={rota === 'todas'} onClick={() => aoNavegarSub('todas')}>
          Todas as revendedoras <span className="mq-badge">{ativas.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={rota === 'configuracoes'} onClick={() => aoNavegarSub('configuracoes')}>Configurações</button>
      </nav>

      {carregando && <LoadingState>Atualizando…</LoadingState>}

      {rota === 'visao-geral' && (
        <>
          <PageHeader
            kicker="Consignação"
            titulo="Revendedoras"
            sub="Maletas na rua, agenda de acertos e capacidade para novos envios."
            acoes={<><button type="button" className="btn btn-leitura" onClick={() => setNovaAberta(true)}>Nova revendedora</button><button type="button" className="btn btn-escrita" onClick={() => abrirCriacao(null)}>+ Criar maleta</button></>}
          />
          <VisaoGeralRevendedoras
            estado={estado}
            planejamento={planejamento}
            aoAbrirRevendedora={aoNavegarSub}
            aoVerSugestoes={() => setSugestoesAbertas(true)}
            aoNovaRevendedora={() => setNovaAberta(true)}
            aoVerTodas={() => aoNavegarSub('todas')}
          />
        </>
      )}

      {rota === 'todas' && <><PageHeader kicker="Consignação" titulo="Todas as revendedoras" sub="Maleta atual, próximo acerto e histórico de cada pessoa." acoes={<><button type="button" className="btn btn-leitura" onClick={() => setNovaAberta(true)}>Nova revendedora</button><button type="button" className="btn btn-escrita" onClick={() => abrirCriacao(null)}>+ Criar maleta</button></>} /><TodasRevendedoras estado={estado} aoAbrir={aoNavegarSub} /></>}

      {rota === 'configuracoes' && <><PageHeader kicker="Consignação" titulo="Configurações" sub="Premissas transparentes para capacidade e montagem de maletas." /><ConfiguracoesRevendedoras estado={estado} planejamento={planejamento} aoVerSugestoes={() => setSugestoesAbertas(true)} aoCriarMaleta={() => abrirCriacao(null)} /></>}

      {typeof rota === 'number' && atual && (
        <>
          <button type="button" className="voltar-link" onClick={() => aoNavegarSub('todas')}>← Todas as revendedoras</button>
          <PageHeader
            kicker="Revendedora"
            titulo={atual.nome}
            sub={[atual.cidade, atual.tel].filter(Boolean).join(' · ') || undefined}
            acoes={
              <button type="button" className="btn btn-escrita btn-sm" onClick={() => abrirCriacao(null)}>
                + Criar maleta
              </button>
            }
          />
          <RevendedoraPage
            estado={estado}
            revendedora={atual}
            aoCriarMaleta={() => abrirCriacao(null)}
            aoFazerAcerto={() => setAcertoAberto(true)}
          />
        </>
      )}

      {typeof rota === 'number' && !atual && (
        <EmptyState
          titulo="Esta revendedora não está mais ativa"
          descricao="Ela pode ter sido arquivada. O histórico de maletas dela continua no painel clássico."
        />
      )}

      <SugestoesDrawer
        aberto={sugestoesAbertas}
        estado={estado}
        config={planejamento.config}
        {...(temPesos ? { pesosPorCategoria: pesos } : {})}
        aoFechar={() => setSugestoesAbertas(false)}
        aoCriarDaSugestao={abrirCriacao}
      />

      <CriarMaletaFluxo
        aberto={criando}
        estado={estado}
        conexao={conexao}
        config={planejamento.config}
        sugestaoInicial={sugestaoEscolhida}
        revendedoraInicial={revendedoraDoFluxo}
        aoFechar={() => {
          setCriando(false);
          setSugestaoEscolhida(null);
        }}
        aoConcluir={recarregar}
      />

      <NovaRevendedora
        aberto={novaAberta}
        conexao={conexao}
        aoFechar={() => setNovaAberta(false)}
        aoCriar={(id) => {
          setNovaAberta(false);
          recarregar();
          aoNavegarSub(id);
        }}
      />

      {typeof rota === 'number' && atual && <AcertoMaletaFluxo
        key={`${rota}-${acertoAberto ? 'aberto' : 'fechado'}`}
        aberto={acertoAberto}
        conexao={conexao}
        estado={estado}
        maleta={maletaAbertaDe(estado, atual.id)}
        revendedora={atual}
        aoFechar={() => setAcertoAberto(false)}
        aoConcluir={recarregar}
      />}
    </div>
  );
}
