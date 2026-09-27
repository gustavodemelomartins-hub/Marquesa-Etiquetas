import { useMemo, useState } from 'react';
import type { AppState } from '../../types/api';
import { EmptyState } from '../../components/EmptyState';
import { Painel } from '../../components/Painel';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money, plural } from '../../domain/formato';
import { resumoDasRevendedoras } from '../../domain/maletas';
import type { AcertosDeMaleta } from './acertos';

type FiltroStatus = 'todas' | 'ativas' | 'inativas' | 'com-maleta';

/** Todas as revendedoras — o cadastro inteiro, inclusive quem está inativa.
 *
 *  Dois estados que a tela nunca mistura:
 *    ATIVA / INATIVA  → o relacionamento (cadastro)
 *    MALETA ABERTA    → há consignação em andamento agora
 *  Uma ativa pode estar sem maleta; uma inativa nunca é escondida só porque
 *  não tem maleta — ela tem histórico, acertos e comissão. */
export function TodasRevendedoras({
  estado, acertos, aoAbrir,
}: {
  estado: AppState;
  acertos: AcertosDeMaleta | null;
  aoAbrir: (id: number) => void;
}) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroStatus>('todas');
  const todas = useMemo(() => resumoDasRevendedoras(estado, undefined, { incluirInativas: true }), [estado]);
  const historico = useMemo(
    () => new Map((acertos?.revendedoras ?? []).map((r) => [r.revendedoraId, r])),
    [acertos],
  );
  const conta = {
    todas: todas.length,
    ativas: todas.filter((r) => r.status !== 'inativa').length,
    inativas: todas.filter((r) => r.status === 'inativa').length,
    'com-maleta': todas.filter((r) => r.maletaAberta).length,
  };
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const lista = todas
    .filter((r) => filtro === 'todas'
      || (filtro === 'ativas' && r.status !== 'inativa')
      || (filtro === 'inativas' && r.status === 'inativa')
      || (filtro === 'com-maleta' && !!r.maletaAberta))
    .filter((r) => !termo || r.nome.toLocaleLowerCase('pt-BR').includes(termo))
    /* Ativas primeiro, e dentro de cada grupo quem vendeu mais: a lista é
       cadastro, mas a ordem ajuda a achar quem importa. */
    .sort((a, b) => Number(a.status === 'inativa') - Number(b.status === 'inativa')
      || (historico.get(b.id)?.vendido ?? 0) - (historico.get(a.id)?.vendido ?? 0)
      || a.nome.localeCompare(b.nome, 'pt-BR'));

  const FILTROS: { id: FiltroStatus; rotulo: string }[] = [
    { id: 'todas', rotulo: 'Todas' }, { id: 'ativas', rotulo: 'Ativas' },
    { id: 'inativas', rotulo: 'Inativas' }, { id: 'com-maleta', rotulo: 'Com maleta' },
  ];

  return <Painel titulo="Todas as revendedoras" dica={`${lista.length} ${plural(lista.length, 'pessoa', 'pessoas')}`} semPadding>
    <div className="rev-lista-busca">
      <div className="mq-chipset" role="group" aria-label="Situação do cadastro">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.rotulo} <span className="mq-badge mq-badge--quiet">{conta[f.id]}</span>
          </button>
        ))}
      </div>
      <label><span className="sr-only">Buscar revendedora</span><input type="search" placeholder="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
    </div>
    {!lista.length ? <EmptyState titulo="Nenhuma revendedora encontrada" descricao={filtro === 'todas' ? undefined : 'Troque o filtro para ver as outras.'} /> : <div className="mq-table rev-lista">
      <div className="mq-tr mq-tr--head rev-lista__linha"><span>Revendedora</span><span>Situação</span><span>Maleta atual</span><span>Próximo acerto</span><span>Acertos</span><span>Vendido</span><span /></div>
      {lista.map((r) => {
        const h = historico.get(r.id);
        const cidade = estado.revendedoras.find((x) => x.id === r.id)?.cidade;
        return <button type="button" className="mq-tr rev-lista__linha" key={r.id} onClick={() => aoAbrir(r.id)}>
          <span className="mq-cell"><b>{r.nome}</b><small>{cidade || '—'}</small></span>
          <span className="mq-cell rev-lista__selos">
            <StatusBadge tom={r.status === 'inativa' ? 'neutro' : 'positivo'}>{r.status === 'inativa' ? 'Inativa' : 'Ativa'}</StatusBadge>
            {r.maletaAberta && <StatusBadge tom={r.situacao?.tom ?? 'neutro'}>Maleta aberta</StatusBadge>}
          </span>
          <span className="mq-cell" data-rotulo="Maleta atual">{r.maletaAberta
            ? <><b>#{r.maletaAberta.id} · {r.pecas} peças</b><small>{money(r.valor)}</small></>
            : <small>Nenhuma maleta ativa</small>}</span>
          <span className="mq-cell" data-rotulo="Próximo acerto">{r.maletaAberta
            ? <><b>{r.prazo ? fmtData(r.prazo) : '—'}</b><small>{r.situacao?.texto ?? 'Nenhuma data marcada'}</small></>
            : <small>—</small>}</span>
          <span className="mq-cell" data-rotulo="Acertos">{h
            ? <><b>{h.acertos} {plural(h.acertos, 'acerto', 'acertos')} · {h.pecas} peças</b><small>último em {h.ultimo ? fmtData(h.ultimo) : '—'}</small></>
            : <small>{acertos ? 'Nenhum acerto fechado' : '…'}</small>}</span>
          <span className="mq-cell mq-cell--num" data-rotulo="Vendido">{h ? <><b>{money(h.vendido)}</b><small>líquido {money(h.liquido)}</small></> : <small>—</small>}</span>
          <span className="mq-tr__chev">›</span>
        </button>;
      })}
    </div>}
  </Painel>;
}
