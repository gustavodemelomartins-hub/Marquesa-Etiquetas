import type { CSSProperties } from 'react';
import type { AppState } from '../../types/api';
import { Kpi, Kpis } from '../../components/Kpi';
import { Painel } from '../../components/Painel';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money, plural } from '../../domain/formato';
import { totaisEstoque } from '../../domain/estoque';
import { agendaDeAcertos, resumoDasRevendedoras } from '../../domain/maletas';
import { calcularCapacidade } from '../../domain/capacidade';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';
import type { AcertoResumo, AcertosDeMaleta } from './acertos';
import { ListaDeAcertos, ResumoDeAcertos, TopRevendedoras } from './PainelAcertos';

interface Props {
  estado: AppState;
  planejamento: UsoPlanejamento;
  aoAbrirRevendedora: (id: number) => void;
  aoVerSugestoes: () => void;
  aoNovaRevendedora: () => void;
  aoVerTodas: () => void;
  /** `GET /api/analytics/revendedoras` — nulo enquanto carrega. */
  acertos: AcertosDeMaleta | null;
  erroAcertos: string | null;
  aoAbrirAcerto: (a: AcertoResumo) => void;
  aoVerHistorico: () => void;
}

/** A Visão Geral de Revendedoras: a operação de consignação inteira em uma
 *  tela.
 *
 *  O que ela NÃO repete: nada que pertença ao Estoque Total. O total de
 *  peças, o valor do catálogo e a saúde do cadastro moram lá. Aqui só
 *  entram os números sobre o que está fora de casa — e a capacidade, que é
 *  a ponte entre os dois. */
export function VisaoGeralRevendedoras({
  estado,
  planejamento,
  aoAbrirRevendedora,
  aoVerSugestoes,
  aoNovaRevendedora,
  aoVerTodas,
  acertos,
  erroAcertos,
  aoAbrirAcerto,
  aoVerHistorico,
}: Props) {
  const t = totaisEstoque(estado);
  const agenda = agendaDeAcertos(estado);
  /* A parte de baixo desta tela é OPERACIONAL: quem está com mercadoria
     agora. O cadastro inteiro mora em Todas as revendedoras, e o passado
     no Histórico de acertos — o título diz qual das três coisas é esta. */
  const comMaleta = resumoDasRevendedoras(estado).filter((r) => r.maletaAberta);
  const comHistorico = new Set((acertos?.revendedoras ?? []).map((r) => r.revendedoraId));
  const semHistorico = estado.revendedoras.filter((r) => !comHistorico.has(r.id)).map((r) => r.nome);
  const cadastros = new Map(estado.revendedoras.map((r) => [r.id, r]));
  const cap = calcularCapacidade(estado, planejamento.config);
  const atrasadas = agenda.filter((a) => a.situacao.atrasada);
  const proximo = agenda.find((a) => !!a.prazo);
  const proximoPrazo = proximo?.prazo ?? null;

  return (
    <>
      <Kpis>
        <Kpi
          rotulo="Peças com revendedoras"
          valor={t.fora}
          acento="rua"
          nota={
            <>
              de {t.total} {plural(t.total, 'peça no total', 'peças no total')}
            </>
          }
        />
        <Kpi
          rotulo="Valor consignado"
          valor={money(t.valFora)}
          acento="valor"
          compacto
          nota="Preço de envio das peças que estão fora"
        />
        <Kpi
          rotulo="Próximo acerto"
          valor={proximoPrazo ? fmtData(proximoPrazo) : '—'}
          acento="marca"
          nota={
            proximo
              ? proximo.revNome
              : atrasadas.length
                ? `${atrasadas.length} ${plural(atrasadas.length, 'passou', 'passaram')} da data combinada`
                : 'Nenhuma data marcada'
          }
        />
        <Kpi
          rotulo="Cabem mais"
          valor={cap.maletas}
          acento="casa"
          nota={
            <>
              {plural(cap.maletas, 'maleta nova', 'maletas novas')} de {cap.tamanhoAlvo} peças
            </>
          }
        />
      </Kpis>

      <div className="rev-overview-grid">
      <Painel titulo="Agenda de acertos" dica="Quem vem, quando, e com quanto na mão" semPadding>
        {!agenda.length ? (
          <EmptyState
            titulo="Nenhuma maleta na rua"
            descricao="Quando uma maleta for aberta, o acerto dela aparece aqui em ordem de urgência."
          />
        ) : (
          <ul className="agenda">
            {agenda.map((a) => (
              <li key={a.maleta.id}>
                <button type="button" onClick={() => aoAbrirRevendedora(a.revId)}>
                  <span className="quando">
                    <b>{fmtData(a.prazo)}</b>
                    {a.revNome}
                  </span>
                  <span className="stat">
                    Peças<b>{a.pecas}</b>
                  </span>
                  <span className="stat">
                    Valor<b>{money(a.valor)}</b>
                  </span>
                  <span className="espaco" />
                  <StatusBadge tom={a.situacao.tom}>
                    {a.dias === 0 ? 'hoje' : a.situacao.texto}
                  </StatusBadge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Painel>
      <Painel titulo="Capacidade para novas maletas" dica="Planejamento">
        <div className="rev-capacidade-compacta">
          <div className="rev-capacidade-anel" style={{ '--cap-pct': `${cap.emCasa ? Math.round(cap.consignavel / cap.emCasa * 100) : 0}%` } as CSSProperties}><b>{cap.consignavel}</b><span>peças liberadas<br />em casa</span></div>
          <p>{cap.tamanhoAlvo} peças por maleta, deixando {cap.reservaPct}% de cada código em casa.</p>
          <strong>{cap.maletas} {plural(cap.maletas, 'maleta nova', 'maletas novas')}</strong>
          <button type="button" className="btn btn-escrita" onClick={aoVerSugestoes}>Ver sugestões</button>
        </div>
      </Painel>
      </div>

      <Painel
        titulo="Maletas ativas"
        dica="Quem está com mercadoria agora"
        acoes={<button type="button" className="btn btn-leitura btn-sm" onClick={aoVerTodas}>Ver todas as revendedoras</button>}
      >
        {!comMaleta.length ? (
          <EmptyState
            titulo="Nenhuma maleta na rua"
            descricao={estado.revendedoras.length ? 'O cadastro e o histórico de cada revendedora continuam em Todas as revendedoras.' : 'Crie uma aba para cada pessoa que leva maleta.'}
            acoes={estado.revendedoras.length ? undefined : (
              <button type="button" className="btn btn-escrita" onClick={aoNovaRevendedora}>+ Nova revendedora</button>
            )}
          />
        ) : (
          <ul className="cartoes-rev">
            {comMaleta.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => aoAbrirRevendedora(r.id)}>
                  <span className="rev-card-identidade">
                    <span className="rev-card-avatar" aria-hidden="true">{r.nome.split(/\s+/).slice(0, 2).map((n) => n[0]).join('').toUpperCase()}</span>
                    <span><b>{r.nome}</b><small>{[
                      cadastros.get(r.id)?.cidade,
                      r.prazo ? `acerto ${fmtData(r.prazo)}` : null,
                    ].filter(Boolean).join(' · ') || 'Maleta aberta'}</small></span>
                    <StatusBadge tom={r.situacao!.tom}>{`Maleta #${r.maletaAberta!.id}`}</StatusBadge>
                  </span>
                  <strong className="rev-card-resumo">{r.pecas} peças · {money(r.valor)}</strong>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel
        titulo="Histórico de acertos"
        dica="Só acertos concluídos — maleta aberta e acerto cancelado não entram"
        acoes={<button type="button" className="btn btn-leitura btn-sm" onClick={aoVerHistorico}>Ver histórico completo</button>}
        semPadding
      >
        {erroAcertos ? (
          <p className="rev-historico-aviso" role="alert">Não consegui ler os acertos: {erroAcertos}</p>
        ) : !acertos ? (
          <p className="rev-historico-aviso" aria-busy="true">Lendo os acertos…</p>
        ) : (
          <>
            <ResumoDeAcertos totais={acertos.totais} />
            <ListaDeAcertos acertos={acertos.acertos.slice(0, 5)} aoAbrir={aoAbrirAcerto} compacta rotulo="Acertos recentes" />
            {acertos.acertos.length > 5 && (
              <button type="button" className="acertos-mais" onClick={aoVerHistorico}>
                Ver os outros {acertos.acertos.length - 5} {plural(acertos.acertos.length - 5, 'acerto', 'acertos')} ›
              </button>
            )}
          </>
        )}
      </Painel>

      <Painel titulo="Top revendedoras" dica="Desempenho dos ciclos encerrados, ativas e inativas" semPadding>
        {erroAcertos ? (
          <p className="rev-historico-aviso" role="alert">Não consegui ler os acertos: {erroAcertos}</p>
        ) : !acertos ? (
          <p className="rev-historico-aviso" aria-busy="true">Lendo os acertos…</p>
        ) : (
          <TopRevendedoras revendedoras={acertos.revendedoras} aoAbrir={aoAbrirRevendedora} semHistorico={semHistorico} />
        )}
      </Painel>
    </>
  );
}
