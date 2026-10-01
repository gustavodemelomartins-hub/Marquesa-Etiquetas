import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { fmtData, money, plural } from '../../domain/formato';
import {
  ROTULO_SITUACAO, TOM_SITUACAO, giroDoCiclo, pct,
  type AcertoResumo, type DesempenhoRevendedora,
} from './acertos';

/** Os três números que respondem "quanto a consignação rendeu": vendido,
 *  o que ficou com as revendedoras e o que ficou para a Marquesa. Uma faixa
 *  só, não três cartões — é um resumo da lista logo abaixo. */
export function ResumoDeAcertos({ totais }: {
  totais: { acertos: number; pecas: number; vendido: number; comissao: number; liquido: number };
}) {
  return (
    <dl className="acertos-resumo" aria-label="Resumo dos acertos">
      <div><dt>Vendido em acertos</dt><dd>{money(totais.vendido)}</dd>
        <small>{totais.acertos} {plural(totais.acertos, 'acerto', 'acertos')} · {totais.pecas} {plural(totais.pecas, 'peça vendida', 'peças vendidas')}</small></div>
      <div><dt>Comissão das revendedoras</dt><dd>{money(totais.comissao)}</dd>
        <small>{totais.vendido ? `${Math.round(totais.comissao / totais.vendido * 100)}% do vendido` : '—'}</small></div>
      <div className="acertos-resumo__destaque"><dt>Líquido Marquesa</dt><dd>{money(totais.liquido)}</dd>
        <small>o que ficou para a casa</small></div>
    </dl>
  );
}

/** A lista dos acertos concluídos. Tabela no computador, cartão no
 *  telefone — o mesmo elemento, reorganizado pelo CSS. Cada linha abre o
 *  acerto inteiro. */
export function ListaDeAcertos({
  acertos, aoAbrir, compacta = false, rotulo = 'Acertos',
}: {
  acertos: AcertoResumo[];
  aoAbrir: (a: AcertoResumo) => void;
  compacta?: boolean;
  rotulo?: string;
}) {
  if (!acertos.length) {
    return <EmptyState titulo="Nenhum acerto neste recorte" descricao="Mude o período ou limpe os filtros para ver os acertos anteriores." />;
  }
  return (
    <div className="acertos-caixa">
    <div className={compacta ? 'acertos-lista acertos-lista--compacta' : 'acertos-lista'} role="table" aria-label={rotulo}>
      <div className="acertos-lista__linha acertos-lista__cabeca" role="row">
        <span role="columnheader">Data</span>
        <span role="columnheader">Revendedora</span>
        <span role="columnheader">Maleta</span>
        <span role="columnheader" className="num">Vendidas</span>
        <span role="columnheader" className="num">Devolvidas</span>
        <span role="columnheader" className="num">Vendido</span>
        <span role="columnheader" className="num">Comissão</span>
        <span role="columnheader" className="num">Líquido</span>
        <span role="columnheader">Situação</span>
      </div>
      {acertos.map((a) => (
        <button
          type="button" role="row" key={a.id} className="acertos-lista__linha"
          aria-label={`Acerto de ${a.revendedora} em ${a.data ? fmtData(a.data) : 'data desconhecida'}`}
          onClick={() => aoAbrir(a)}
        >
          <span role="cell" className="acertos-lista__data">{a.data ? fmtData(a.data) : 'sem data'}</span>
          <span role="cell" className="acertos-lista__quem">
            <b>{a.revendedora}</b>
            {a.status === 'inativa' && <StatusBadge tom="neutro">Inativa</StatusBadge>}
          </span>
          <span role="cell" data-rotulo="Maleta">{a.maletaId ? `#${a.maletaId}` : <small title="Acerto anterior ao sistema: a maleta não está registrada">—</small>}</span>
          <span role="cell" className="num" data-rotulo="Vendidas">
            {a.pecas}{giroDoCiclo(a) != null && <small> · {pct(giroDoCiclo(a))}</small>}
          </span>
          <span role="cell" className="num" data-rotulo="Devolvidas">{a.devolvidas ?? '—'}</span>
          <span role="cell" className="num forte" data-rotulo="Vendido">{money(a.vendido)}</span>
          <span role="cell" className="num" data-rotulo="Comissão">{money(a.comissao)}</span>
          <span role="cell" className="num" data-rotulo="Líquido">{money(a.liquido)}</span>
          <span role="cell" className="acertos-lista__situacao">
            <StatusBadge tom={TOM_SITUACAO[a.situacaoFinanceira]}>{ROTULO_SITUACAO[a.situacaoFinanceira]}</StatusBadge>
          </span>
        </button>
      ))}
    </div>
    </div>
  );
}

/** Top revendedoras — REGRAS §19: sai dos ciclos ENCERRADOS, nunca do
 *  valor da maleta de hoje. Inativa entra: ela vendeu, e o histórico dela
 *  continua sendo desempenho real. Quem nunca fechou ciclo não entra, e a
 *  tela diz isso. */
export function TopRevendedoras({
  revendedoras, aoAbrir, semHistorico,
}: {
  revendedoras: DesempenhoRevendedora[];
  aoAbrir: (id: number) => void;
  /** Nomes de quem tem cadastro e nenhum acerto fechado. */
  semHistorico: string[];
}) {
  if (!revendedoras.length) {
    return <EmptyState titulo="Ainda não há acerto fechado" descricao="O ranking aparece depois do primeiro acerto concluído." />;
  }
  return (
    <div className="acertos-caixa">
      <ol className="top-rev" aria-label="Top revendedoras">
        <li className="top-rev__linha top-rev__cabeca" aria-hidden="true">
          <span>#</span><span>Revendedora</span>
          <span className="num">Vendido</span><span className="num">Peças</span>
          <span className="num">Ciclos</span><span className="num">Ticket</span>
          <span className="num">Giro</span><span className="num">Comissão</span>
          <span className="num">Líquido</span><span>Último acerto</span>
        </li>
        {revendedoras.map((r, i) => (
          <li key={r.revendedoraId}>
            <button type="button" className="top-rev__linha" onClick={() => aoAbrir(r.revendedoraId)}
              aria-label={`${r.nome}: ${money(r.vendido)} vendidos em ${r.acertos} ${plural(r.acertos, 'acerto', 'acertos')}`}>
              <span className="top-rev__pos">{i + 1}</span>
              <span className="top-rev__quem">
                <b>{r.nome}</b>
                <StatusBadge tom={r.status === 'inativa' ? 'neutro' : 'positivo'}>{r.status === 'inativa' ? 'Inativa' : 'Ativa'}</StatusBadge>
              </span>
              <span className="num forte" data-rotulo="Vendido">{money(r.vendido)}</span>
              <span className="num" data-rotulo="Peças">{r.pecas}</span>
              <span className="num" data-rotulo="Ciclos">{r.acertos}</span>
              <span className="num" data-rotulo="Ticket">{r.ticket == null ? '—' : money(r.ticket)}</span>
              <span className="num" data-rotulo="Giro"
                title={r.giro == null
                  ? `Giro indisponível: ${r.ciclosSemEnvio} ${plural(r.ciclosSemEnvio, 'ciclo não tem', 'ciclos não têm')} maleta registrada`
                  : `Das ${r.enviadas} peças enviadas, ${r.pecas} venderam`}>
                {pct(r.giro)}
              </span>
              <span className="num" data-rotulo="Comissão">{money(r.comissao)}</span>
              <span className="num" data-rotulo="Líquido">{money(r.liquido)}</span>
              <span data-rotulo="Último acerto">{r.ultimo ? fmtData(r.ultimo) : '—'}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="top-rev__nota">
        Giro = vendidas ÷ enviadas; aparece quando todas as maletas foram registradas no sistema.
        {semHistorico.length > 0 && <> Sem acerto fechado ainda: {semHistorico.join(', ')}.</>}
      </p>
    </div>
  );
}
