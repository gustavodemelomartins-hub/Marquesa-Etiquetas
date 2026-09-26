import { useEffect, useMemo, useState } from 'react';
import { chamar, type Connection } from '../../services/client';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money } from '../../domain/formato';

/** A resposta de `GET /api/revendedoras/:id/historico`. Tudo aqui é leitura
 *  das tabelas que registram cada fato — nenhum número é somado na tela que
 *  o backend não tenha somado da mesma fonte da Visão geral. */
export interface ItemDoAcerto { sku: string; desc: string | null; qtd: number; valor?: number; destino?: string }
export interface AcertoHistorico {
  id: string;
  fonte: 'documento' | 'sistema';
  data: string | null;
  maletaId: number | null;
  enviadas: number | null;
  devolvidas: number | null;
  pecasVendidas: number;
  vendido: number;
  comissao: number;
  liquido: number;
  situacaoFinanceira: 'paga' | 'a_receber';
  conferidoPor: string | null;
  vendaId?: number | null;
  vendaChave?: string | null;
  linhasPlanilha?: string[] | null;
  itensVendidos: ItemDoAcerto[];
  itensDevolvidos: ItemDoAcerto[];
}
export interface EventoHistorico {
  quando: string | null;
  data: string | null;
  tipo: string;
  grupo: 'cadastro' | 'maleta' | 'envio' | 'devolucao' | 'acerto' | 'ajuste' | 'financeiro';
  titulo: string;
  detalhe?: string | null;
  pecas?: number;
  valor?: number;
  maletaId?: number | null;
  acertoId?: string;
}
export interface HistoricoDaRevendedora {
  ok: boolean;
  resumo: {
    acertos: number; pecasVendidas: number; vendido: number; comissao: number; liquido: number;
    aReceber: number; maletas: number; maletasAbertas: number; pecasComEla: number;
  };
  acertos: AcertoHistorico[];
  eventos: EventoHistorico[];
  limites: string[];
}

export function buscarHistorico(conexao: Connection, id: number, sinal?: AbortSignal) {
  return chamar<HistoricoDaRevendedora>(conexao, 'GET', `/api/revendedoras/${id}/historico`, undefined, { signal: sinal });
}

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
 *  é a pergunta mais comum ("o que vendeu da última vez?") e fica em cima. */
export function HistoricoRevendedora({ conexao, revendedoraId }: { conexao: Connection; revendedoraId: number }) {
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
  }, [conexao, revendedoraId]);

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
                    <StatusBadge tom={a.situacaoFinanceira === 'paga' ? 'positivo' : 'atencao'}>
                      {a.situacaoFinanceira === 'paga' ? 'Pago' : 'A receber'}
                    </StatusBadge>
                    <button type="button" className="btn btn-leitura" aria-expanded={aberto === a.id}
                      onClick={() => setAberto(aberto === a.id ? null : a.id)}>
                      {aberto === a.id ? 'Fechar' : 'Ver peças'}
                    </button>
                  </div>
                  {aberto === a.id && (
                    <div className="rev-acerto-detalhe">
                      <div>
                        <h4>Vendidas ({a.itensVendidos.reduce((s, i) => s + i.qtd, 0)})</h4>
                        <ul>{a.itensVendidos.map((i) => (
                          <li key={`v${i.sku}${i.destino ?? ''}`}><b>{i.sku}</b> {i.desc ?? ''} × {i.qtd}
                            {i.valor != null ? ` · ${money(i.valor)}` : ''}{i.destino && i.destino !== 'vendida' ? ` · ${i.destino}` : ''}</li>
                        ))}</ul>
                      </div>
                      <div>
                        <h4>Devolvidas ({a.itensDevolvidos.reduce((s, i) => s + i.qtd, 0)})</h4>
                        {a.itensDevolvidos.length ? (
                          <ul>{a.itensDevolvidos.map((i) => <li key={`d${i.sku}`}><b>{i.sku}</b> {i.desc ?? ''} × {i.qtd}</li>)}</ul>
                        ) : <p className="dica">{a.maletaId ? 'Nenhuma peça devolvida.' : 'Acerto anterior ao sistema: a maleta dele não está registrada aqui.'}</p>}
                      </div>
                      <p className="dica rev-acerto-origem">
                        {a.vendaId ? `Venda #${a.vendaId} gerada pelo acerto. ` : ''}
                        {a.linhasPlanilha?.length ? `Linhas da planilha de vendas: ${a.linhasPlanilha.join(', ')}. ` : ''}
                        Conferido por: {a.conferidoPor ?? 'não registrado (o sistema ainda não tem usuários)'}.
                      </p>
                    </div>
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
