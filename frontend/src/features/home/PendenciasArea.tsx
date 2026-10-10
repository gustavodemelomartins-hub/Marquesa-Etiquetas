import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData, hojeISO } from '../../domain/formato';
import type { ModuloId } from '../../app/modulos';
import type { AppState } from '../../types/api';
import { ResolverPendencia } from './ResolverPendencia';
import { FotosDaLoja } from './FotosDaLoja';

export interface VariacaoPossivel {
  nome: string;
  atributo?: string | null;
  varianteId?: string | null;
  saldo: number;
  estoqueLoja?: number | null;
}

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
  informacaoFaltante?: string | null;
  proximoPasso?: string | null;
  motivo?: string | null;
  acoes?: string[];
  status?: 'aberta' | 'adiada';
  adiadaAte?: string | null;
  /* o que cada tipo precisa para ser resolvido ali mesmo */
  falta?: string[];
  cat?: string | null;
  preco?: number | null;
  variacoesPossiveis?: VariacaoPossivel[];
  vendaId?: number;
  itemId?: string | null;
  maletaId?: number;
  fora?: number;
  identificado?: number;
  fotoOrfaId?: number;
  fotoUrl?: string | null;
  revisaoId?: number;
  candidatoId?: number | null;
  candidato?: string | null;
  candidatoTelefone?: string | null;
  garantiaId?: number;
  operacaoId?: number;
  vendaChave?: string;
}

export interface AguardandoRetorno {
  chave: string; sku: string; produto: string; revendedora: string | null; maletaId: number;
  data: string | null; qtd: number; variacao: string; situacao: string;
}

export interface RespostaPendencias {
  ok: true;
  resumo: { total: number; adiadas: number; porTipo: Record<string, { grupo: string; total: number }> };
  pendencias: Pendencia[];
  /** §67 — peça com revendedora sem variação informada: estado, não tarefa. */
  aguardandoRetorno?: { itens: AguardandoRetorno[]; codigos: number; pecas: number; regra: string };
}

interface Props {
  conexao: Connection;
  estado?: AppState | null;
  aoIr: (modulo: ModuloId, sub?: string) => void;
  aoVoltar: () => void;
  /** Resolver muda estoque e cadastro: o estado compartilhado precisa
   *  reler, senão a ficha e a lista de peças mostram o antes. */
  aoMudarEstado?: () => void;
}

/** Quantas pendências de cada grupo aparecem antes do "ver todas". */
const POR_GRUPO = 8;

const ADIADAS = 'Revisar depois';

const dobrar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

/** Daqui a uma semana — o "revisar depois" mais comum. */
function daquiASete(): string {
  const d = new Date(`${hojeISO()}T12:00:00`);
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** A CENTRAL DE PENDÊNCIAS — o que está parado esperando uma pessoa, e o
 *  botão de resolver em cada linha.
 *
 *  O número do sino e o da Home saem desta mesma lista (`GET /api/pendencias`).
 *  Até 27/09/2026 ela só listava e mandava para o painel clássico; agora
 *  cada tipo abre o formulário dele aqui mesmo (`ResolverPendencia`). A
 *  lista é derivada do estado: resolver faz o caso sumir sozinho. */
export function PendenciasArea({ conexao, estado, aoIr, aoVoltar, aoMudarEstado }: Props) {
  const pend = useApi(
    (s) => chamar<RespostaPendencias>(conexao, 'GET', '/api/pendencias?adiadas=1', undefined, { signal: s }),
    [conexao],
  );
  const [grupoAtivo, setGrupoAtivo] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [resolvendo, setResolvendo] = useState<string | null>(null);
  const [adiando, setAdiando] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [recado, setRecado] = useState('');

  const categorias = useMemo(
    () => [...new Set((estado?.produtos ?? []).map((p) => p.cat).filter(Boolean))].sort(),
    [estado],
  );

  const grupos = useMemo(() => {
    const termo = dobrar(busca.trim());
    const mapa = new Map<string, Pendencia[]>();
    for (const p of pend.dados?.pendencias ?? []) {
      if (termo) {
        const alvo = dobrar([p.sku, p.produto, p.cliente, p.revendedora].filter(Boolean).join(' '));
        if (!alvo.includes(termo)) continue;
      }
      const g = p.status === 'adiada' ? ADIADAS : p.grupo;
      const lista = mapa.get(g) ?? [];
      lista.push(p);
      mapa.set(g, lista);
    }
    return [...mapa.entries()].sort((a, b) => {
      if (a[0] === ADIADAS) return 1;
      if (b[0] === ADIADAS) return -1;
      return b[1].length - a[1].length;
    });
  }, [pend.dados, busca]);

  const total = pend.dados?.pendencias.length ?? 0;
  const abertas = (pend.dados?.pendencias ?? []).filter((p) => p.status !== 'adiada').length;
  const visiveis = grupoAtivo ? grupos.filter(([g]) => g === grupoAtivo) : grupos;

  function resolvido(texto: string) {
    setResolvendo(null);
    setAdiando(null);
    if (texto) setRecado(texto);
    pend.recarregar();
    aoMudarEstado?.();
  }

  async function adiar(chave: string, ate: string) {
    try {
      await chamar(conexao, 'POST', '/api/pendencias/adiar', { chave, ate });
      resolvido(`Volta para a lista em ${fmtData(ate)}`);
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não consegui adiar.');
    }
  }

  async function retomar(chave: string) {
    try {
      await chamar(conexao, 'POST', '/api/pendencias/retomar', { chave });
      resolvido('De volta para a lista');
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não consegui trazer de volta.');
    }
  }

  function mostrar(texto: string) {
    setBusca(texto);
    setGrupoAtivo(null);
    setResolvendo(null);
  }

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Início</p>
          <h1 className="mq-display">Pendências</h1>
          <p className="mq-lede">
            O que está parado esperando uma decisão sua. Toque em Resolver:
            tudo se resolve aqui mesmo.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoVoltar}>
            ← Voltar ao Início
          </button>
        </div>
      </div>

      {recado && (
        <p className="mq-note mq-note--ok" role="status">
          <Icone nome="check" />
          <span>{recado}</span>
          <button type="button" className="mq-btn mq-btn--link mq-btn--sm" onClick={() => setRecado('')}>ok</button>
        </p>
      )}

      {pend.erro ? (
        <section className="mq-card"><ErrorState erro={pend.erro} aoTentarDeNovo={pend.recarregar} /></section>
      ) : !pend.dados ? (
        <section className="mq-card mq-card--pad" aria-busy="true">
          <p className="mq-skel mq-skel--title" />
          <p className="mq-skel mq-skel--line" style={{ marginTop: 14 }} />
        </section>
      ) : total === 0 ? (
        <section className="mq-card">
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="check" /></span>
            <h3>Nada pendente</h3>
            <p>Nenhuma decisão esperando por você agora.</p>
          </div>
        </section>
      ) : (
        <>
          <label className="mq-field mq-pend__busca">
            <span className="mq-sr">Buscar pendência</span>
            <input
              className="mq-input"
              type="search"
              placeholder="Buscar por peça, código, cliente ou revendedora"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>

          <div className="mq-chipset" role="group" aria-label="Tipo de pendência">
            <button type="button" aria-pressed={grupoAtivo === null} onClick={() => setGrupoAtivo(null)}>
              Todas · {abertas}
            </button>
            {grupos.map(([g, itens]) => (
              <button key={g} type="button" aria-pressed={grupoAtivo === g} onClick={() => setGrupoAtivo(g)}>
                {g} · {itens.length}
              </button>
            ))}
          </div>

          {visiveis.length === 0 && (
            <section className="mq-card mq-card--pad"><p className="mq-hint">Nada encontrado com “{busca}”.</p></section>
          )}

          {visiveis.map(([g, itens]) => {
            const todos = abertos[g] || grupoAtivo === g || !!busca.trim();
            return (
              <section className="mq-card mq-card--flush mq-pend__grupo" key={g}>
                <div className="mq-card__head">
                  <div>
                    <h2 className="mq-title">{g}</h2>
                    <p className="mq-lede">
                      {itens.length} {itens.length === 1 ? 'pendência' : 'pendências'}
                      {g === ADIADAS ? ' — voltam sozinhas na data marcada' : ''}
                    </p>
                  </div>
                </div>
                {g === 'Catálogo' && <FotosDaLoja conexao={conexao} aoTerminar={resolvido} />}
                <div className="mq-list">
                  {(todos ? itens : itens.slice(0, POR_GRUPO)).map((p) => (
                    <LinhaDePendencia
                      key={p.chave}
                      p={p}
                      aberta={resolvendo === p.chave}
                      adiando={adiando === p.chave}
                      aoAlternar={() => { setAdiando(null); setResolvendo((c) => (c === p.chave ? null : p.chave)); }}
                      aoAdiar={() => { setResolvendo(null); setAdiando((c) => (c === p.chave ? null : p.chave)); }}
                      aoConfirmarAdiar={(ate) => adiar(p.chave, ate)}
                      aoRetomar={() => retomar(p.chave)}
                    >
                      <ResolverPendencia
                        conexao={conexao}
                        p={p}
                        categorias={categorias}
                        aoResolver={resolvido}
                        aoIr={aoIr}
                        aoBuscar={mostrar}
                      />
                    </LinhaDePendencia>
                  ))}
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
      {(pend.dados?.aguardandoRetorno?.itens.length ?? 0) > 0 && (
        <AguardandoRetornoDeMaleta dados={pend.dados!.aguardandoRetorno!} />
      )}
    </>
  );
}

/** §67 — não é pendência: não conta no sino nem no total, não tem
 *  "Resolver". A variação é conferida quando a maleta voltar. */
function AguardandoRetornoDeMaleta({ dados }: { dados: NonNullable<RespostaPendencias['aguardandoRetorno']> }) {
  const porMaleta = new Map<number, AguardandoRetorno[]>();
  for (const i of dados.itens) porMaleta.set(i.maletaId, [...(porMaleta.get(i.maletaId) ?? []), i]);
  return (
    <details className="mq-card mq-card--flush mq-pend__grupo" aria-label="Aguardando retorno de maleta">
      <summary className="mq-card__head">
        <div>
          <h2 className="mq-title">Aguardando retorno de maleta</h2>
          <p className="mq-lede">
            {dados.pecas} {dados.pecas === 1 ? 'peça' : 'peças'} em {dados.codigos} {dados.codigos === 1 ? 'código' : 'códigos'} com
            revendedoras, sem a variação informada. Não é pendência: a variação é conferida quando a maleta voltar.
          </p>
        </div>
      </summary>
      <div className="mq-list">
        {[...porMaleta.entries()].map(([id, itens]) => itens.map((i) => (
          <div className="mq-list__row" key={i.chave}>
            <div>
              <b>Código {i.sku}</b> · {i.produto}
              <small className="mq-hint"> · {i.qtd} {i.qtd === 1 ? 'peça' : 'peças'} · Variação: {i.variacao} · {i.situacao} · maleta {id}{i.revendedora ? ` (${i.revendedora})` : ''}</small>
            </div>
          </div>
        )))}
      </div>
    </details>
  );
}

function LinhaDePendencia({
  p, aberta, adiando, aoAlternar, aoAdiar, aoConfirmarAdiar, aoRetomar, children,
}: {
  p: Pendencia;
  aberta: boolean;
  adiando: boolean;
  aoAlternar: () => void;
  aoAdiar: () => void;
  aoConfirmarAdiar: (ate: string) => void;
  aoRetomar: () => void;
  children: React.ReactNode;
}) {
  const [ate, setAte] = useState(daquiASete);
  const quem = [p.cliente, p.revendedora].filter(Boolean).join(' · ');
  const adiada = p.status === 'adiada';

  return (
    <div className={`mq-pend__linha${aberta ? ' is-aberta' : ''}`}>
      <div className="mq-item">
        <span className="mq-item__main">
          <b>{p.produto || quem || p.origem || 'Pendência'}{p.sku ? ` · ${p.sku}` : ''}</b>
          <small>{p.explicacao}</small>
          <small>
            {[p.origem, p.produto ? quem : null, p.maletaId ? `maleta ${p.maletaId}` : null,
              p.vendaId ? `venda #${p.vendaId}` : null, p.data ? fmtData(p.data) : null,
              p.valor ? money(p.valor) : null,
              adiada && p.adiadaAte ? `volta em ${fmtData(p.adiadaAte)}` : null].filter(Boolean).join(' · ')}
          </small>
        </span>
        <span className="mq-item__side mq-pend__acao">
          {adiada ? (
            <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={aoRetomar}>
              Voltar para a lista
            </button>
          ) : (
            <>
              <button
                type="button"
                className="mq-btn mq-btn--primary mq-btn--sm"
                aria-expanded={aberta}
                onClick={aoAlternar}
              >
                {aberta ? 'Fechar' : 'Resolver'}
              </button>
              <button type="button" className="mq-btn mq-btn--link mq-btn--sm" aria-expanded={adiando} onClick={aoAdiar}>
                Revisar depois
              </button>
            </>
          )}
        </span>
      </div>
      {adiando && !adiada && (
        <div className="mq-pend__form mq-pend__campos">
          <label className="mq-field">
            <span>Voltar para a lista em</span>
            <input className="mq-input" type="date" min={hojeISO()} value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={!ate} onClick={() => aoConfirmarAdiar(ate)}>
            Revisar depois
          </button>
        </div>
      )}
      {aberta && !adiada && children}
    </div>
  );
}
