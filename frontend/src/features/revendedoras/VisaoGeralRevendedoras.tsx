import type { AppState } from '../../types/api';
import { Kpi, Kpis } from '../../components/Kpi';
import { Colunas, Painel } from '../../components/Painel';
import { Donut } from '../../components/Donut';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money, plural } from '../../domain/formato';
import { porCategoria, totaisEstoque } from '../../domain/estoque';
import { agendaDeAcertos, resumoDasRevendedoras } from '../../domain/maletas';
import { calcularCapacidade } from '../../domain/capacidade';
import { CapacidadeMaletas } from '../maletas/CapacidadeMaletas';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';

interface Props {
  estado: AppState;
  planejamento: UsoPlanejamento;
  aoAbrirRevendedora: (id: number) => void;
  aoVerSugestoes: () => void;
  aoCriarMaleta: () => void;
  aoNovaRevendedora: () => void;
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
  aoCriarMaleta,
  aoNovaRevendedora,
}: Props) {
  const t = totaisEstoque(estado);
  const agenda = agendaDeAcertos(estado);
  const resumo = resumoDasRevendedoras(estado);
  const cap = calcularCapacidade(estado, planejamento.config);
  const atrasadas = agenda.filter((a) => a.situacao.atrasada);

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
          rotulo="Valor na rua"
          valor={money(t.valFora)}
          acento="valor"
          compacto
          nota="Preço de envio das peças que estão fora"
        />
        <Kpi
          rotulo="Maletas abertas"
          valor={agenda.length}
          acento="marca"
          nota={
            atrasadas.length
              ? `${atrasadas.length} ${plural(atrasadas.length, 'passou', 'passaram')} da data combinada`
              : 'Nenhuma passou da data combinada'
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

      <Painel
        titulo="Agenda de acertos"
        dica="Quem vem, quando, e com quanto na mão"
        semPadding
      >
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

      <CapacidadeMaletas
        estado={estado}
        planejamento={planejamento}
        aoVerSugestoes={aoVerSugestoes}
        aoCriarMaleta={aoCriarMaleta}
      />

      <Colunas>
        <Painel titulo="Por categoria, na rua" dica="O que está com as revendedoras agora">
          <Donut
            dados={porCategoria(estado, 'fora')}
            legendaCentro="na rua"
            textoVazio="Nenhuma peça está com revendedoras no momento."
          />
        </Painel>

        <Painel
          titulo="Revendedoras"
          dica="Toque em uma para abrir a maleta dela"
          acoes={
            <button type="button" className="btn btn-leitura btn-sm" onClick={aoNovaRevendedora}>
              + Nova
            </button>
          }
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
              {resumo.map((r) => (
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
      </Colunas>
    </>
  );
}
