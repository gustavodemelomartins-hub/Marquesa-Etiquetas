import { useMemo, useState } from 'react';
import type { AppState } from '../../types/api';
import { Painel } from '../../components/Painel';
import { plural } from '../../domain/formato';
import { ListaDeAcertos, ResumoDeAcertos } from './PainelAcertos';
import {
  FILTRO_INICIAL, PERIODOS_ACERTOS, ROTULO_SITUACAO, filtrarAcertos, totalizar,
  type AcertoResumo, type AcertosDeMaleta, type FiltroAcertos, type FiltroSituacao,
} from './acertos';

/** Revendedoras › Histórico de acertos: todo acerto concluído, de todas as
 *  revendedoras — inclusive as inativas —, com filtro e o acerto inteiro a
 *  um clique. O resumo soma as linhas filtradas, não um número à parte. */
export function HistoricoDeAcertos({
  estado, dados, aoAbrirAcerto,
}: {
  estado: AppState;
  dados: AcertosDeMaleta;
  aoAbrirAcerto: (a: AcertoResumo) => void;
}) {
  const [filtro, setFiltro] = useState<FiltroAcertos>(FILTRO_INICIAL);
  const lista = useMemo(() => filtrarAcertos(dados.acertos, filtro), [dados.acertos, filtro]);
  const totais = totalizar(lista);
  const mudar = (p: Partial<FiltroAcertos>) => setFiltro((f) => ({ ...f, ...p }));

  /* Quem aparece no seletor: toda revendedora com algum acerto, mais as do
     cadastro — uma inativa sem acerto também é resposta ("nenhum"). */
  const pessoas = useMemo(() => {
    const m = new Map<number, { id: number; nome: string; inativa: boolean }>();
    for (const r of estado.revendedoras) m.set(r.id, { id: r.id, nome: r.nome, inativa: r.status === 'inativa' });
    for (const a of dados.acertos) {
      if (!m.has(a.revendedoraId)) m.set(a.revendedoraId, { id: a.revendedoraId, nome: a.revendedora, inativa: a.status === 'inativa' });
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [estado.revendedoras, dados.acertos]);

  const filtrando = filtro.periodo !== 'tudo' || filtro.revendedoraId != null || filtro.situacao !== 'todas' || !!filtro.busca.trim();

  return (
    <Painel
      titulo="Histórico de acertos"
      dica={`${lista.length} de ${dados.acertos.length} ${plural(dados.acertos.length, 'acerto concluído', 'acertos concluídos')}`}
      semPadding
    >
      <div className="acertos-filtros">
        <div className="mq-chipset" role="group" aria-label="Período">
          {PERIODOS_ACERTOS.map((p) => (
            <button key={p.id} type="button" aria-pressed={filtro.periodo === p.id} onClick={() => mudar({ periodo: p.id })}>{p.rotulo}</button>
          ))}
        </div>
        <label>
          <span className="sr-only">Revendedora</span>
          <select aria-label="Revendedora" value={filtro.revendedoraId ?? ''}
            onChange={(e) => mudar({ revendedoraId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Todas as revendedoras</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.inativa ? ' (inativa)' : ''}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Situação</span>
          <select aria-label="Situação" value={filtro.situacao} onChange={(e) => mudar({ situacao: e.target.value as FiltroSituacao })}>
            <option value="todas">Toda situação</option>
            {(Object.keys(ROTULO_SITUACAO) as (keyof typeof ROTULO_SITUACAO)[]).map((s) => (
              <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>
            ))}
          </select>
        </label>
        <label className="acertos-filtros__busca">
          <span className="sr-only">Buscar acerto</span>
          <input type="search" placeholder="Nome, maleta ou data" value={filtro.busca} onChange={(e) => mudar({ busca: e.target.value })} />
        </label>
        {filtrando && <button type="button" className="btn btn-leitura btn-sm" onClick={() => setFiltro(FILTRO_INICIAL)}>Limpar</button>}
      </div>
      <ResumoDeAcertos totais={totais} />
      <ListaDeAcertos acertos={lista} aoAbrir={aoAbrirAcerto} />
      {dados.pendentesRevisao > 0 && (
        <p className="top-rev__nota" role="note">
          {dados.pendentesRevisao} {plural(dados.pendentesRevisao, 'venda histórica aguarda', 'vendas históricas aguardam')} revisão
          e ainda não {plural(dados.pendentesRevisao, 'conta', 'contam')} como acerto.
        </p>
      )}
    </Painel>
  );
}
