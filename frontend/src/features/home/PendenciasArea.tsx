import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData } from '../../domain/formato';
import { NO_PAINEL_CLASSICO, type ModuloId } from '../../app/modulos';

export interface Pendencia {
  chave: string;
  tipo: string;
  grupo: string;
  sku?: string | null;
  produto?: string | null;
  cliente?: string | null;
  revendedora?: string | null;
  origem?: string | null;
  data?: string | null;
  valor?: number | null;
  qtd?: number | null;
  explicacao?: string | null;
  proximoPasso?: string | null;
  motivo?: string | null;
}

export interface RespostaPendencias {
  ok: true;
  resumo: { total: number; adiadas: number; porTipo: Record<string, { grupo: string; total: number }> };
  pendencias: Pendencia[];
}

interface Props {
  conexao: Connection;
  aoIr: (modulo: ModuloId, sub?: string) => void;
  aoVoltar: () => void;
}

/** Quantas pendências de cada grupo aparecem antes do "ver todas". */
const POR_GRUPO = 8;

/** Onde cada pendência se resolve. Só leva para a V2 o que a V2 resolve de
 *  verdade; o resto vai para o painel clássico, que tem a central com os
 *  botões de resolver — e a tela diz isso em vez de fingir. */
function destino(p: Pendencia): { rotulo: string; modulo?: ModuloId; sub?: string; classico?: boolean } {
  /* Falta preço, foto ou categoria: isso se corrige na FICHA da peça, não
     na fila de publicação. */
  if (p.chave.startsWith('publicacao:') && p.motivo === 'falta_informacao' && p.sku) {
    return { rotulo: 'Abrir peça', modulo: 'estoque', sub: `peca:${p.sku}` };
  }
  if (p.chave.startsWith('publicacao:')) return { rotulo: 'Abrir publicação', modulo: 'nuvemshop', sub: 'publicacao' };
  if (p.tipo === 'catalogo' && p.sku && !p.chave.startsWith('foto_orfa:') && !p.chave.startsWith('cadastro:')) {
    return { rotulo: 'Abrir peça', modulo: 'estoque', sub: `peca:${p.sku}` };
  }
  if (p.tipo === 'garantia') return { rotulo: 'Abrir garantias', modulo: 'garantias' };
  return { rotulo: 'Resolver no painel clássico', classico: true };
}

/** A CENTRAL DE PENDÊNCIAS — o que está parado esperando uma pessoa.
 *
 *  O número do sino e o da Home saem desta mesma lista (`GET /api/pendencias`).
 *  Antes, o sino levava a uma tela "Em desenvolvimento" e a Home levava à
 *  reconciliação da Nuvemshop, que é outra coisa: o mesmo número tinha três
 *  destinos diferentes e nenhum deles mostrava as pendências. */
export function PendenciasArea({ conexao, aoIr, aoVoltar }: Props) {
  const pend = useApi(
    (s) => chamar<RespostaPendencias>(conexao, 'GET', '/api/pendencias', undefined, { signal: s }),
    [conexao],
  );
  const [grupoAtivo, setGrupoAtivo] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const grupos = useMemo(() => {
    const mapa = new Map<string, Pendencia[]>();
    for (const p of pend.dados?.pendencias ?? []) {
      const g = mapa.get(p.grupo) ?? [];
      g.push(p);
      mapa.set(p.grupo, g);
    }
    return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [pend.dados]);

  const visiveis = grupoAtivo ? grupos.filter(([g]) => g === grupoAtivo) : grupos;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Início</p>
          <h1 className="mq-display">Pendências</h1>
          <p className="mq-lede">
            O que está parado esperando uma decisão. Nada aqui se resolve
            sozinho.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoVoltar}>
            ← Voltar ao Início
          </button>
        </div>
      </div>

      {pend.erro ? (
        <section className="mq-card"><ErrorState erro={pend.erro} aoTentarDeNovo={pend.recarregar} /></section>
      ) : !pend.dados ? (
        <section className="mq-card mq-card--pad" aria-busy="true">
          <p className="mq-skel mq-skel--title" />
          <p className="mq-skel mq-skel--line" style={{ marginTop: 14 }} />
        </section>
      ) : pend.dados.pendencias.length === 0 ? (
        <section className="mq-card">
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="check" /></span>
            <h3>Nada pendente</h3>
            <p>Nenhuma decisão esperando por você agora.</p>
          </div>
        </section>
      ) : (
        <>
          <div className="mq-chipset" role="group" aria-label="Tipo de pendência">
            <button type="button" aria-pressed={grupoAtivo === null} onClick={() => setGrupoAtivo(null)}>
              Todas · {pend.dados.pendencias.length}
            </button>
            {grupos.map(([g, itens]) => (
              <button key={g} type="button" aria-pressed={grupoAtivo === g} onClick={() => setGrupoAtivo(g)}>
                {g} · {itens.length}
              </button>
            ))}
          </div>

          {visiveis.map(([g, itens]) => {
            const todos = abertos[g] || grupoAtivo === g;
            return (
              <section className="mq-card mq-card--flush mq-pend__grupo" key={g}>
                <div className="mq-card__head">
                  <div>
                    <h2 className="mq-title">{g}</h2>
                    <p className="mq-lede">{itens.length} {itens.length === 1 ? 'pendência' : 'pendências'}</p>
                  </div>
                </div>
                <div className="mq-list">
                  {(todos ? itens : itens.slice(0, POR_GRUPO)).map((p) => {
                    const d = destino(p);
                    const quem = [p.cliente, p.revendedora].filter(Boolean).join(' · ');
                    return (
                      <div className="mq-item" key={p.chave}>
                        <span className="mq-item__main">
                          <b>{p.produto || quem || p.origem || 'Pendência'}{p.sku ? ` · ${p.sku}` : ''}</b>
                          <small>
                            {p.explicacao}
                            {p.proximoPasso ? ` ${p.proximoPasso}` : ''}
                          </small>
                          <small>
                            {[p.origem, p.produto ? quem : null, p.data ? fmtData(p.data) : null,
                              p.valor ? money(p.valor) : null].filter(Boolean).join(' · ')}
                          </small>
                        </span>
                        <span className="mq-item__side mq-pend__acao">
                          {d.classico ? (
                            <a className="mq-btn mq-btn--link mq-btn--sm" href={NO_PAINEL_CLASSICO}>{d.rotulo}</a>
                          ) : (
                            <button
                              type="button"
                              className="mq-btn mq-btn--link mq-btn--sm"
                              onClick={() => d.modulo && aoIr(d.modulo, d.sub)}
                            >
                              {d.rotulo}
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {!todos && itens.length > POR_GRUPO && (
                  <div className="mq-row mq-row--center" style={{ padding: 'var(--mq-4)' }}>
                    <button
                      type="button"
                      className="mq-btn mq-btn--secondary mq-btn--sm"
                      onClick={() => setAbertos((a) => ({ ...a, [g]: true }))}
                    >
                      Ver todas as {itens.length}
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
