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

interface Props {
  estado: AppState;
  planejamento: UsoPlanejamento;
  aoAbrirRevendedora: (id: number) => void;
  aoVerSugestoes: () => void;
  aoNovaRevendedora: () => void;
  aoVerTodas: () => void;
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
}: Props) {
  const t = totaisEstoque(estado);
  const agenda = agendaDeAcertos(estado);
  const resumo = resumoDasRevendedoras(estado);
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
              {plural(cap.maletas, 'maleta nova', 'maletas novas')} de {cap.tamanhoAlvo} peças ·
              premissa configurável
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
          <p>Premissa atual: {cap.tamanhoAlvo} peças por maleta, com reserva de {cap.reservaPct}% por código.</p>
          <strong>{cap.maletas} {plural(cap.maletas, 'maleta nova', 'maletas novas')}</strong>
          <button type="button" className="btn btn-escrita" onClick={aoVerSugestoes}>Ver sugestões</button>
        </div>
      </Painel>
      </div>

        <Painel
          titulo="Revendedoras"
          dica="Abra uma pessoa para ver a maleta e o histórico"
          acoes={<button type="button" className="btn btn-leitura btn-sm" onClick={aoVerTodas}>Ver todas</button>}
        >
          {!resumo.length ? (
            <EmptyState
              titulo="Nenhuma revendedora ainda"
              descricao="Crie uma aba para cada pessoa que leva maleta."
              acoes={
                <button type="button" className="btn btn-escrita" onClick={aoNovaRevendedora}>
                  + Nova revendedora
                </button>
              }
            />
          ) : (
            <ul className="cartoes-rev">
              {resumo.slice(0, 3).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => aoAbrirRevendedora(r.id)}>
                    <span className="nome">{r.nome}</span>
                    <span className="meta">
                      {r.maletaAberta
                        ? r.prazo
                          ? `Acerto marcado para ${fmtData(r.prazo)}`
                          : 'Maleta aberta, sem data marcada'
                        : r.maletasFechadas
                          ? `${r.maletasFechadas} ${plural(r.maletasFechadas, 'maleta fechada', 'maletas fechadas')}`
                          : 'Sem maleta aberta'}
                    </span>
                    {r.maletaAberta ? (
                      <>
                        <span className="linha">
                          <span className="stat">
                            Peças<b>{r.pecas}</b>
                          </span>
                          <span className="stat">
                            Valor<b>{money(r.valor)}</b>
                          </span>
                        </span>
                        <span className="selo-linha">
                          <StatusBadge tom={r.situacao!.tom}>{r.situacao!.texto}</StatusBadge>
                        </span>
                      </>
                    ) : (
                      <span className="selo-linha">
                        <StatusBadge tom="neutro">Sem maleta</StatusBadge>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Painel>
    </>
  );
}
