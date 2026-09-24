import { useMemo, useState } from 'react';
import type { AppState } from '../../types/api';
import { EmptyState } from '../../components/EmptyState';
import { Painel } from '../../components/Painel';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money, plural } from '../../domain/formato';
import { resumoDasRevendedoras } from '../../domain/maletas';

export function TodasRevendedoras({ estado, aoAbrir }: { estado: AppState; aoAbrir: (id: number) => void }) {
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => resumoDasRevendedoras(estado).filter((r) =>
    !busca.trim() || r.nome.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')),
  ), [estado, busca]);
  return <Painel titulo="Todas as revendedoras" dica={`${lista.length} ${plural(lista.length, 'pessoa', 'pessoas')}`} semPadding>
    <div className="rev-lista-busca"><label><span className="sr-only">Buscar revendedora</span><input type="search" placeholder="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} /></label></div>
    {!lista.length ? <EmptyState titulo="Nenhuma revendedora encontrada" /> : <div className="mq-table rev-lista">
      <div className="mq-tr mq-tr--head rev-lista__linha"><span>Revendedora</span><span>Maleta atual</span><span>Peças</span><span>Valor</span><span>Próximo acerto</span><span /></div>
      {lista.map((r) => <button type="button" className="mq-tr rev-lista__linha" key={r.id} onClick={() => aoAbrir(r.id)}>
        <span className="mq-cell"><b>{r.nome}</b><small>{r.maletasFechadas} {plural(r.maletasFechadas, 'maleta fechada', 'maletas fechadas')}</small></span>
        <span className="mq-cell">{r.maletaAberta ? <StatusBadge tom={r.situacao?.tom ?? 'neutro'}>Maleta aberta</StatusBadge> : <StatusBadge tom="neutro">Sem maleta</StatusBadge>}</span>
        <span className="mq-cell mq-cell--num"><b>{r.pecas}</b></span><span className="mq-cell mq-cell--num"><b>{money(r.valor)}</b></span>
        <span className="mq-cell"><b>{r.prazo ? fmtData(r.prazo) : '—'}</b><small>{r.situacao?.texto ?? 'Nenhuma data marcada'}</small></span><span className="mq-tr__chev">›</span>
      </button>)}
    </div>}
  </Painel>;
}
