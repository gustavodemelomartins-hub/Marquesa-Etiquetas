import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { fmtData } from '../../domain/formato';
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado } from '../vendas/tipos';

interface InventarioResumo {
  id: number;
  status: 'aberto' | 'pausado' | 'concluido' | 'cancelado' | string;
  iniciadoEm: string;
  pausadoEm: string | null;
  concluidoEm: string | null;
  divergentes: number;
  pecas: number;
  naoComparaveis: number;
}

interface LinhaContada {
  sku: string;
  desc?: string;
  variacao: string | null;
  contado: number;
  contadoEm: string;
}

interface DetalheInventario {
  id: number;
  status: string;
  iniciadoEm: string;
  pausadoEm: string | null;
  concluidoEm: string | null;
  contagem: LinhaContada[];
  naoIdentificado: unknown[];
  cobertura: { conferidos: number; total: number };
}

interface Props {
  conexao: Connection;
  estado: AppState | null;
  aoMudarEstoque: () => void;
}

/** INVENTÁRIO — contar o que existe de verdade.
 *
 *  A regra que governa a tela inteira, e que o backend aplica:
 *
 *    NÃO CONTADO não é ZERO.
 *
 *  Uma peça que ninguém conferiu é uma incógnita; uma peça conferida e
 *  ausente é um zero, e é um RESULTADO. Tratar as duas como a mesma coisa
 *  zeraria o estoque de tudo o que ficou para amanhã. Por isso contar tem
 *  um caminho e desfazer a contagem tem outro — voltar para "não contado"
 *  não é escrever zero.
 *
 *  Pausar existe pelo mesmo motivo: contagem de loja acontece entre um
 *  atendimento e outro, e um inventário que não pode ser interrompido é um
 *  inventário que ninguém termina.
 */
export function InventarioArea({ conexao, estado, aoMudarEstoque }: Props) {
  const lista = useApi(
    (s) => chamar<InventarioResumo[]>(conexao, 'GET', '/api/inventarios', undefined, { signal: s }),
    [conexao],
  );
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [erroAcao, setErroAcao] = useState('');

  const emAndamento = (lista.dados ?? []).find((i) => i.status === 'aberto' || i.status === 'pausado');
  const idAtual = abertoId ?? emAndamento?.id ?? null;

  async function abrir() {
    setErroAcao('');
    const r = await chamar<{ id?: number; erro?: string }>(conexao, 'POST', '/api/inventarios', {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui abrir.' }));
    if (r && 'erro' in r && r.erro) { setErroAcao(String(r.erro)); return; }
    lista.recarregar();
    if (r && 'id' in r && r.id) setAbertoId(r.id);
  }

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Conferência física</p>
          <h1 className="mq-display">Inventário</h1>
          <p className="mq-lede">
            Contar o que existe de verdade, e comparar com o que o sistema
            acha que existe.
          </p>
        </div>
        {!emAndamento && (
          <div className="mq-pagehead__actions">
            <button type="button" className="mq-btn mq-btn--primary" onClick={abrir}>
              <Icone nome="plus" />
              Abrir inventário
            </button>
          </div>
        )}
      </div>

      <p className="mq-note mq-note--info">
        <Icone nome="alert" />
        <span>
          <b>Não contado não é zero.</b> Peça que ninguém conferiu fica de
          fora da conta; peça conferida e ausente vale zero, e isso é um
          resultado. Dá para pausar e continuar depois sem perder nada.
        </span>
      </p>

      {erroAcao && <p className="mq-note mq-note--risk" role="alert"><span>{erroAcao}</span></p>}
      {lista.erro ? <section className="mq-card"><ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} /></section> : null}

      {idAtual !== null ? (
        <Contagem
          conexao={conexao}
          id={idAtual}
          estado={estado}
          aoMudar={() => { lista.recarregar(); aoMudarEstoque(); }}
          aoSair={() => setAbertoId(null)}
        />
      ) : null}

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div><h2 className="mq-title">Inventários</h2></div>
        </div>
        {(lista.dados ?? []).length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="inventory" /></span>
            <h3>Nenhum inventário ainda</h3>
            <p>Abra um quando for contar a loja. Ele pode ser pausado e retomado.</p>
          </div>
        ) : (
          <div className="mq-list">
            {(lista.dados ?? []).map((i) => (
              <button type="button" className="mq-item" key={i.id} onClick={() => setAbertoId(i.id)}>
                <span className={`mq-item__icon ${i.divergentes ? 'mq-item__icon--warn' : 'mq-item__icon--ok'}`}>
                  <Icone nome="inventory" />
                </span>
                <span className="mq-item__main">
                  <b>Inventário #{i.id}</b>
                  <small>
                    aberto em {fmtData(i.iniciadoEm)}
                    {i.concluidoEm ? ` · concluído em ${fmtData(i.concluidoEm)}` : ''}
                    {i.divergentes ? ` · ${i.divergentes} divergentes` : ''}
                  </small>
                </span>
                <span className="mq-item__side">
                  <span className={`mq-status ${i.status === 'concluido' ? 'mq-status--ok' : i.status === 'pausado' ? 'mq-status--warn' : ''}`}>
                    {i.status}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ───────────────────────────────────────────────────────── a contagem */

function Contagem({
  conexao, id, estado, aoMudar, aoSair,
}: {
  conexao: Connection;
  id: number;
  estado: AppState | null;
  aoMudar: () => void;
  aoSair: () => void;
}) {
  const detalhe = useApi(
    (s) => chamar<DetalheInventario>(conexao, 'GET', `/api/inventarios/${id}`, undefined, { signal: s }),
    [conexao, id],
  );
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];
  const contados = useMemo(
    () => new Map((detalhe.dados?.contagem ?? []).map((c) => [c.sku, c])),
    [detalhe.dados],
  );

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos
      .filter((p) => !t || p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .sort((a, b) => a.desc.localeCompare(b.desc));
  }, [produtos, busca]);

  const status = detalhe.dados?.status ?? 'aberto';
  const pausado = status === 'pausado';
  const encerrado = status === 'concluido' || status === 'cancelado';

  async function acao(caminho: string, corpo?: unknown) {
    setOcupado(caminho);
    setErro('');
    const r = await chamar<{ erro?: string }>(conexao, 'POST', caminho, corpo ?? {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui.' }));
    setOcupado(null);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return false; }
    detalhe.recarregar();
    aoMudar();
    return true;
  }

  async function contar(sku: string, contado: number) {
    setOcupado(sku);
    setErro('');
    const r = await chamar<{ erro?: string }>(conexao, 'POST', `/api/inventarios/${id}/itens`, { sku, contado })
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui gravar a contagem.' }));
    setOcupado(null);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else detalhe.recarregar();
  }

  async function descontar(sku: string) {
    setOcupado(sku);
    setErro('');
    await chamar(conexao, 'DELETE', `/api/inventarios/${id}/itens/${encodeURIComponent(sku)}`)
      .catch(() => null);
    setOcupado(null);
    detalhe.recarregar();
  }

  const cobertura = detalhe.dados?.cobertura;

  return (
    <section className="mq-card mq-card--flush">
      <div className="mq-card__head">
        <div>
          <h2 className="mq-title">Inventário #{id}</h2>
          <p className="mq-lede">
            {cobertura
              ? `${cobertura.conferidos} de ${cobertura.total} códigos conferidos`
              : 'carregando…'}
            {pausado ? ' · pausado' : ''}
          </p>
        </div>
        <div className="mq-btns">
          {!encerrado && !pausado && (
            <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm"
              disabled={!!ocupado} onClick={() => acao(`/api/inventarios/${id}/pausar`)}>
              Pausar
            </button>
          )}
          {pausado && (
            <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm"
              disabled={!!ocupado} onClick={() => acao(`/api/inventarios/${id}/retomar`)}>
              Continuar
            </button>
          )}
          {!encerrado && (
            <button type="button" className="mq-btn mq-btn--primary mq-btn--sm"
              disabled={!!ocupado} onClick={() => acao(`/api/inventarios/${id}/concluir`)}>
              Concluir
            </button>
          )}
          <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" onClick={aoSair}>
            Fechar
          </button>
        </div>
      </div>

      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      {encerrado ? (
        <Resultado conexao={conexao} id={id} aoAplicar={aoMudar} />
      ) : (
        <>
          <div className="mq-filters">
            <label className="mq-search">
              <Icone nome="search" />
              <input
                className="mq-input"
                type="search"
                placeholder="Buscar a peça que está na mão"
                aria-label="Buscar peça para contar"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <span className="mq-filters__count">{lista.length} códigos</span>
          </div>

          <div className="mq-list">
            {lista.map((p) => {
              const c = contados.get(p.sku);
              const divergente = c && c.contado !== p.qtd;
              return (
                <div className="mq-item" key={p.sku}>
                  <span className={`mq-item__icon ${c ? (divergente ? 'mq-item__icon--warn' : 'mq-item__icon--ok') : ''}`}>
                    <Icone nome={c ? (divergente ? 'alert' : 'check') : 'box'} />
                  </span>
                  <span className="mq-item__main">
                    <b>{p.desc}</b>
                    <small>
                      {p.sku} · sistema diz {p.qtd}
                      {c ? ` · contado ${c.contado}` : ' · ainda não contado'}
                      {divergente ? ` · diferença ${c.contado - p.qtd > 0 ? '+' : ''}${c.contado - p.qtd}` : ''}
                    </small>
                  </span>
                  <span className="mq-item__side mq-inv-acoes">
                    <input
                      className="mq-input mq-inv-contagem"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={`Contagem de ${p.desc}`}
                      defaultValue={c ? c.contado : ''}
                      placeholder="—"
                      disabled={pausado || ocupado === p.sku}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === '') return;
                        const n = Number(v);
                        if (Number.isInteger(n) && n >= 0 && (!c || c.contado !== n)) contar(p.sku, n);
                      }}
                    />
                    {c && (
                      <button
                        type="button"
                        className="mq-btn mq-btn--ghost mq-btn--sm"
                        disabled={pausado || ocupado === p.sku}
                        title="Voltar para não contado — que não é zero"
                        onClick={() => descontar(p.sku)}
                      >
                        Desfazer
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────── o resultado */

interface LinhaResultado {
  sku: string;
  desc?: string;
  sistema: number;
  contado: number | null;
  diferenca: number | null;
  comparavel?: boolean;
}

function Resultado({
  conexao, id, aoAplicar,
}: { conexao: Connection; id: number; aoAplicar: () => void }) {
  const r = useApi(
    (s) => chamar<{ itens?: LinhaResultado[]; erro?: string }>(
      conexao, 'GET', `/api/inventarios/${id}/resultado`, undefined, { signal: s },
    ),
    [conexao, id],
  );
  const [erro, setErro] = useState('');
  const [aplicando, setAplicando] = useState(false);

  const itens = r.dados?.itens ?? [];
  const divergentes = itens.filter((i) => i.diferenca !== null && i.diferenca !== 0);

  async function aplicar() {
    if (!confirm(
      `Ajustar o estoque de ${divergentes.length} ${divergentes.length === 1 ? 'peça' : 'peças'}?\n\n`
      + 'Cada ajuste vira um movimento na razão, com o inventário como origem. Nada é apagado.',
    )) return;
    setAplicando(true);
    setErro('');
    const resposta = await chamar<{ erro?: string }>(conexao, 'POST', `/api/inventarios/${id}/aplicar`, {})
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui aplicar.' }));
    setAplicando(false);
    if (resposta && 'erro' in resposta && resposta.erro) setErro(String(resposta.erro));
    else { r.recarregar(); aoAplicar(); }
  }

  return (
    <div className="mq-card__body">
      {r.dados?.erro && <p className="mq-note mq-note--warn"><span>{r.dados.erro}</span></p>}
      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      {itens.length === 0 ? (
        <p className="mq-hint">Sem resultado para mostrar.</p>
      ) : (
        <>
          <p className="mq-lede">
            {divergentes.length === 0
              ? 'Nenhuma divergência: o que foi contado bate com o que o sistema diz.'
              : `${divergentes.length} ${divergentes.length === 1 ? 'peça diverge' : 'peças divergem'} do sistema.`}
          </p>

          <div className="mq-list">
            {itens.map((i) => (
              <div className="mq-item" key={i.sku}>
                <span className={`mq-item__icon ${i.diferenca ? (i.diferenca > 0 ? 'mq-item__icon--info' : 'mq-item__icon--risk') : 'mq-item__icon--ok'}`}>
                  <Icone nome={i.diferenca ? 'alert' : 'check'} />
                </span>
                <span className="mq-item__main">
                  <b>{i.desc ?? i.sku}</b>
                  <small>
                    sistema {i.sistema} ·{' '}
                    {i.contado === null ? 'não contado' : `contado ${i.contado}`}
                  </small>
                </span>
                <span className="mq-item__side">
                  {i.diferenca === null ? (
                    <span className="mq-status">fora da conta</span>
                  ) : (
                    <b className={i.diferenca === 0 ? 'mq-qty' : i.diferenca > 0 ? 'mq-qty mq-money--ok' : 'mq-qty mq-money--risk'}>
                      {i.diferenca > 0 ? '+' : ''}{i.diferenca}
                    </b>
                  )}
                </span>
              </div>
            ))}
          </div>

          {divergentes.length > 0 && (
            <p style={{ marginTop: 16 }}>
              <button type="button" className="mq-btn mq-btn--primary" disabled={aplicando} onClick={aplicar}>
                {aplicando ? 'Ajustando…' : `Ajustar ${divergentes.length} ${divergentes.length === 1 ? 'peça' : 'peças'}`}
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
