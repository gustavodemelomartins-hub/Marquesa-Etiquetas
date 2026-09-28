import { useEffect, useMemo, useState } from 'react';
import type { Connection } from '../../services/client';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money } from '../../domain/formato';
import {
  buscarHistorico, ROTULO_SITUACAO, TOM_SITUACAO, type EventoHistorico, type HistoricoDaRevendedora,
} from './acertos';
import { DetalheDoAcerto } from './DetalheDoAcerto';

export type {
  ItemDoAcerto, AcertoHistorico, EventoHistorico, HistoricoDaRevendedora,
} from './acertos';
export { buscarHistorico } from './acertos';

type Filtro = 'todos' | 'acerto' | 'movimento' | 'maleta' | 'ajuste' | 'financeiro';
const FILTROS: { id: Filtro; rotulo: string; grupos: EventoHistorico['grupo'][] }[] = [
  { id: 'todos', rotulo: 'Tudo', grupos: [] },
  { id: 'acerto', rotulo: 'Acertos e vendas', grupos: ['acerto'] },
  { id: 'movimento', rotulo: 'Envio e devolução', grupos: ['envio', 'devolucao'] },
  { id: 'maleta', rotulo: 'Maletas', grupos: ['maleta', 'cadastro'] },
  { id: 'ajuste', rotulo: 'Ajustes e perdas', grupos: ['ajuste'] },
  { id: 'financeiro', rotulo: 'A receber', grupos: ['financeiro'] },
];
type Periodo = 'tudo' | '90d' | '12m';
const PERIODOS: { id: Periodo; rotulo: string; dias: number | null }[] = [
  { id: 'tudo', rotulo: 'Todo o período', dias: null },
  { id: '90d', rotulo: 'Últimos 90 dias', dias: 90 },
  { id: '12m', rotulo: 'Últimos 12 meses', dias: 365 },
];

const TOM: Record<EventoHistorico['grupo'], 'neutro' | 'positivo' | 'atencao' | 'critico'> = {
  cadastro: 'neutro', maleta: 'neutro', envio: 'neutro', devolucao: 'neutro',
  acerto: 'positivo', ajuste: 'atencao', financeiro: 'critico',
};

/** Histórico da revendedora: os acertos (cada um consultável depois) e a
 *  linha do tempo inteira da relação. Uma seção, duas leituras — o acerto
 *  é a pergunta mais comum ("o que vendeu da última vez?") e fica em cima.
 *
 *  `versao` muda quando o estado do app é relido — um acerto que acabou de
 *  fechar, por exemplo. Sem ela o histórico ficava com a leitura de antes:
 *  a aba dizia "Acertos 9" e a ficha, "Nenhum acerto registrado". */
export function HistoricoRevendedora({ conexao, revendedoraId, versao }: {
  conexao: Connection; revendedoraId: number; versao?: unknown;
}) {
  const [dados, setDados] = useState<HistoricoDaRevendedora | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [periodo, setPeriodo] = useState<Periodo>('tudo');
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setDados(null);
    setErro(null);
    buscarHistorico(conexao, revendedoraId, ctl.signal)
      .then(setDados)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setErro(e instanceof Error ? e.message : 'Não consegui ler o histórico.');
      });
    return () => ctl.abort();
  }, [conexao, revendedoraId, versao]);

  const eventos = useMemo(() => {
    if (!dados) return [];
    const f = FILTROS.find((x) => x.id === filtro)!;
    const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? null;
    const corte = dias == null ? null : new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    return dados.eventos
      .filter((e) => !f.grupos.length || f.grupos.includes(e.grupo))
      .filter((e) => !corte || (e.data ?? '') >= corte);
  }, [dados, filtro, periodo]);

  return (
    <section className="painel rev-historico-card" aria-labelledby="rev-historico-titulo">
      <header className="painel-cabeca">
        <div>
          <h2 id="rev-historico-titulo">Histórico da revendedora</h2>
          <p className="dica">Acertos, envios, devoluções e valores — cada linha vem de um registro real.</p>
        </div>
      </header>

      {erro && <p className="rev-historico-aviso" role="alert">{erro}</p>}
      {!dados && !erro && <p className="rev-historico-aviso" aria-busy="true">Lendo o histórico…</p>}

      {dados && (
        <>
          <dl className="rev-historico-resumo">
            <div><dt>Acertos</dt><dd>{dados.resumo.acertos}</dd></div>
            <div><dt>Peças vendidas</dt><dd>{dados.resumo.pecasVendidas}</dd></div>
            <div><dt>Vendido</dt><dd>{money(dados.resumo.vendido)}</dd></div>
            <div><dt>Comissão</dt><dd>{money(dados.resumo.comissao)}</dd></div>
            <div><dt>Líquido Marquesa</dt><dd>{money(dados.resumo.liquido)}</dd></div>
            <div><dt>A receber</dt><dd>{money(dados.resumo.aReceber)}</dd></div>
          </dl>

          <h3 className="rev-historico-sub">Acertos</h3>
          {!dados.acertos.length ? (
            <EmptyState titulo="Nenhum acerto registrado" descricao="Quando um acerto for confirmado, ele fica aqui para ser consultado depois." />
          ) : (
            <div className="rev-acertos" role="table" aria-label="Acertos">
              {dados.acertos.map((a) => (
                <div key={a.id} className="rev-acerto" role="rowgroup">
                  <div className="rev-acerto-linha" role="row">
                    <span role="cell"><b>{a.data ? fmtData(a.data) : 'sem data'}</b>
                      <small>{a.fonte === 'sistema' ? 'Acerto no sistema' : 'Registrado no histórico de vendas'}
                        {a.maletaId ? ` · Maleta #${a.maletaId}` : ''}</small></span>
                    <span role="cell"><small>Enviadas · devolvidas · vendidas</small>
                      <b>{a.enviadas ?? '—'} · {a.devolvidas ?? '—'} · {a.pecasVendidas}</b></span>
                    <span role="cell"><small>Vendido</small><b>{money(a.vendido)}</b></span>
                    <span role="cell"><small>Comissão</small><b>{money(a.comissao)}</b></span>
                    <span role="cell"><small>Líquido</small><b>{money(a.liquido)}</b></span>
                    <StatusBadge tom={TOM_SITUACAO[a.situacaoFinanceira]}>
                      {ROTULO_SITUACAO[a.situacaoFinanceira]}
                    </StatusBadge>
                    <button type="button" className="btn btn-leitura" aria-expanded={aberto === a.id}
                      onClick={() => setAberto(aberto === a.id ? null : a.id)}>
                      {aberto === a.id ? 'Fechar' : 'Ver peças'}
                    </button>
                  </div>
                  {aberto === a.id && (
                    <div className="rev-acerto-detalhe"><DetalheDoAcerto acerto={a} /></div>
                  )}
                </div>
              ))}
            </div>
          )}

          <h3 className="rev-historico-sub">Linha do tempo</h3>
          <div className="rev-historico-filtros">
            <div className="mq-chipset" role="group" aria-label="Tipo de evento">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.rotulo}</button>
              ))}
            </div>
            <label>
              <span className="sr-only">Período</span>
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Período">
                {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
              </select>
            </label>
            <small>{eventos.length} {eventos.length === 1 ? 'evento' : 'eventos'}</small>
          </div>
          {!eventos.length ? (
            <p className="rev-historico-aviso">Nenhum evento neste filtro.</p>
          ) : (
            <ol className="rev-linha-tempo" aria-label="Linha do tempo">
              {eventos.map((e, i) => (
                <li key={`${e.tipo}-${e.quando}-${i}`}>
                  <span className="rev-lt-data">{e.data ? fmtData(e.data) : 'sem data'}</span>
                  <span className="rev-lt-corpo">
                    <b>{e.titulo}{e.maletaId ? ` · Maleta #${e.maletaId}` : ''}</b>
                    {e.detalhe && <small>{e.detalhe}</small>}
                  </span>
                  <span className="rev-lt-num">
                    {e.valor != null ? money(e.valor) : e.pecas != null ? `${e.pecas} peças` : ''}
                  </span>
                  <StatusBadge tom={TOM[e.grupo] ?? 'neutro'}>{rotuloGrupo(e.grupo)}</StatusBadge>
                </li>
              ))}
            </ol>
          )}
          {dados.limites.length > 0 && (
            <ul className="rev-historico-limites">{dados.limites.map((l) => <li key={l}>{l}</li>)}</ul>
          )}
        </>
      )}
    </section>
  );
}

function rotuloGrupo(g: EventoHistorico['grupo']): string {
  return ({
    cadastro: 'Cadastro', maleta: 'Maleta', envio: 'Envio', devolucao: 'Devolução',
    acerto: 'Acerto', ajuste: 'Ajuste', financeiro: 'A receber',
  } as const)[g] ?? g;
}
