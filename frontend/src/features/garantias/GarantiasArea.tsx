import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData, hojeISO } from '../../domain/formato';
import type { GarantiaDoPerfil } from '../clientes/tipos';

/** A garantia como o backend a projeta, com o relógio já calculado. */
export interface Garantia extends GarantiaDoPerfil {
  origemFonte: string;
  vendaItemId: string | null;
  /** 5.2b — `ambiguo` e `sem_match` são as garantias que o backfill se
   *  recusou a adivinhar. A tela precisa poder dizer isso. */
  vendaItemVinculo: string | null;
  garantiaAnteriorId: number | null;
  reabertura: { deGarantiaId: number; diasUteisDesdeAEntrega: number | null } | null;
  clienteId: number | null;
  clienteNome: string | null;
  clienteNomeNorm: string | null;
  valorPagoOriginal: number | null;
  previsaoRetorno: string | null;
  prazoDiasUteis: number | null;
  diasUteisDecorridos: number | null;
  diasUteisRestantes: number | null;
  atrasado: boolean;
  atrasoDiasUteis: number;
  relogioParado: boolean;
  eventos: {
    id: number; tipo: string; data: string; statusNovo: string | null;
    statusRotulo: string | null; observacao: string | null;
  }[];
}

const STATUS: { id: string; rotulo: string }[] = [
  { id: 'em_reparo', rotulo: 'Em reparo' },
  { id: 'reparada', rotulo: 'Reparada · aguardando entrega' },
  { id: 'sem_conserto', rotulo: 'Sem conserto · troca autorizada' },
  { id: 'devolvida', rotulo: 'Peça devolvida' },
  { id: 'concluida', rotulo: 'Concluída' },
  { id: 'cancelada', rotulo: 'Cancelada' },
];
const PENDENTES = ['em_reparo', 'reparada', 'sem_conserto'];
const ENCERRADOS = ['devolvida', 'concluida', 'cancelada'];

interface Props {
  conexao: Connection;
  sub: string | null;
  aoNavegar: (sub: string | null) => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}

/** GARANTIAS, REPAROS E TROCAS — o que está em andamento e o que espera
 *  uma ação nossa.
 *
 *  O relógio vem pronto do backend: dias ÚTEIS, feriado cadastrado não
 *  conta, e ele PARA quando o caso encerra. A tela não recalcula nada —
 *  duas contas de prazo é como as duas discordam.
 *
 *  5.4e — de estado terminal não se sai. Se a peça voltou, o caminho é um
 *  atendimento novo ligado ao anterior, e não trocar o status do caso
 *  antigo, que apagaria a história.
 */
export function GarantiasArea({ conexao, sub, aoNavegar, aoAbrirCliente }: Props) {
  const filtro = sub && STATUS.some((s) => s.id === sub) ? sub : (sub === 'todas' ? null : 'pendentes');
  const [aberta, setAberta] = useState<number | null>(null);

  const lista = useApi(
    (s) => chamar<{ garantias: Garantia[] }>(
      conexao, 'GET',
      `/api/garantias?limite=200${filtro && filtro !== 'pendentes' ? `&status=${filtro}` : ''}`,
      undefined, { signal: s },
    ),
    [conexao, filtro],
  );

  const garantias = useMemo(() => {
    const todas = lista.dados?.garantias ?? [];
    return filtro === 'pendentes' ? todas.filter((g) => g.pendente) : todas;
  }, [lista.dados, filtro]);

  const atrasadas = garantias.filter((g) => g.atrasado).length;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Pós-venda</p>
          <h1 className="mq-display">Garantias e reparos</h1>
          <p className="mq-lede">
            O que está em andamento e o que espera uma ação nossa. O prazo é
            em dias úteis, e ele para quando o caso encerra.
          </p>
        </div>
      </div>

      <div className="mq-kpis">
        <div className="mq-kpi">
          <span className="mq-kpi__label">Em andamento</span>
          <span className="mq-kpi__value">{garantias.filter((g) => g.pendente).length}</span>
          <span className="mq-kpi__foot">casos que ainda pedem alguma coisa</span>
        </div>
        <div className={atrasadas ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Atrasadas</span>
          <span className="mq-kpi__value">{atrasadas}</span>
          <span className="mq-kpi__foot">passaram do prazo combinado</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Trocas com crédito</span>
          <span className="mq-kpi__value">
            {garantias.filter((g) => g.troca && g.troca.creditoAoCliente > 0).length}
          </span>
          <span className="mq-kpi__foot">peça mais barata virou crédito da cliente</span>
        </div>
      </div>

      <div className="mq-filters">
        <div className="mq-chipset" role="group" aria-label="Situação">
          <button type="button" aria-pressed={filtro === 'pendentes'} onClick={() => aoNavegar(null)}>
            Em andamento
          </button>
          <button type="button" aria-pressed={filtro === null} onClick={() => aoNavegar('todas')}>
            Todas
          </button>
          {STATUS.map((s) => (
            <button key={s.id} type="button" aria-pressed={filtro === s.id} onClick={() => aoNavegar(s.id)}>
              {s.rotulo.split(' · ')[0]}
            </button>
          ))}
        </div>
        <span className="mq-filters__count">
          {lista.carregando ? 'carregando…' : `${garantias.length} ${garantias.length === 1 ? 'caso' : 'casos'}`}
        </span>
      </div>

      <section className="mq-card mq-card--flush">
        {lista.erro ? (
          <ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} />
        ) : garantias.length === 0 && !lista.carregando ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="shield" /></span>
            <h3>Nenhum caso aqui</h3>
            <p>Peça que volta por defeito, reparo ou troca aparece nesta lista com o prazo correndo.</p>
          </div>
        ) : (
          <div className="mq-list">
            {garantias.map((g) => (
              <button type="button" className="mq-item" key={g.id} onClick={() => setAberta(g.id)}>
                <span className={`mq-item__icon ${g.atrasado ? 'mq-item__icon--risk' : g.pendente ? 'mq-item__icon--warn' : 'mq-item__icon--ok'}`}>
                  <Icone nome={g.troca ? 'swap' : 'shield'} />
                </span>
                <span className="mq-item__main">
                  <b>{g.produtoNome ?? g.sku}{g.variacao ? ` · ${g.variacao}` : ''}</b>
                  <small>
                    {g.clienteNome ?? 'cliente não identificada'} · {g.motivo} · entrou {fmtData(g.dataEntrada)}
                    {g.pendente && g.diasUteisRestantes !== null
                      ? (g.atrasado
                        ? ` · ${g.atrasoDiasUteis} dias úteis de atraso`
                        : ` · faltam ${g.diasUteisRestantes} dias úteis`)
                      : ''}
                  </small>
                </span>
                <span className="mq-item__side">
                  {g.troca && g.troca.creditoAoCliente > 0 && (
                    <span className="mq-chip mq-chip--brand">crédito {money(g.troca.creditoAoCliente)}</span>
                  )}
                  <span className={`mq-status ${g.atrasado ? 'mq-status--risk' : g.pendente ? 'mq-status--warn' : 'mq-status--ok'}`}>
                    {g.statusRotulo}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {aberta !== null && (
        <Caso
          conexao={conexao}
          id={aberta}
          aoFechar={() => setAberta(null)}
          aoMudar={lista.recarregar}
          aoAbrirCliente={aoAbrirCliente}
        />
      )}
    </>
  );
}

/* ───────────────────────────────────────────────────────────── o caso */

function Caso({
  conexao, id, aoFechar, aoMudar, aoAbrirCliente,
}: {
  conexao: Connection;
  id: number;
  aoFechar: () => void;
  aoMudar: () => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}) {
  const caso = useApi(
    (s) => chamar<Garantia>(conexao, 'GET', `/api/garantias/${id}`, undefined, { signal: s }),
    [conexao, id],
  );
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const g = caso.dados;
  const encerrado = g ? ENCERRADOS.includes(g.status) : false;

  async function mudarStatus(status: string) {
    const observacao = prompt(`Observação para "${STATUS.find((s) => s.id === status)?.rotulo}" (opcional):`, '');
    if (observacao === null) return;
    setOcupado(true);
    setErro('');
    const r = await chamar<{ erro?: string }>(conexao, 'POST', `/api/garantias/${id}/status`, {
      status, observacao: observacao.trim() || undefined, data: hojeISO(),
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui mudar o status.' }));
    setOcupado(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else { caso.recarregar(); aoMudar(); }
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer mq-drawer--larga" role="dialog" aria-modal="true" aria-label={`Garantia ${id}`}>
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Caso #{id}</p>
            <h2 className="mq-title">{g?.produtoNome ?? g?.sku ?? 'Garantia'}</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body">
          {caso.erro ? <ErrorState erro={caso.erro} aoTentarDeNovo={caso.recarregar} /> : null}
          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

          {g && (
            <>
              <p className="mq-chips">
                <span className={`mq-status ${g.atrasado ? 'mq-status--risk' : g.pendente ? 'mq-status--warn' : 'mq-status--ok'}`}>
                  {g.statusRotulo}
                </span>
                {g.relogioParado && <span className="mq-chip mq-chip--soft">relógio parado</span>}
                {g.vendaItemVinculo && g.vendaItemVinculo !== 'direto' && (
                  <span className="mq-chip">vínculo {g.vendaItemVinculo}</span>
                )}
              </p>

              {g.vendaItemVinculo === 'ambiguo' || g.vendaItemVinculo === 'sem_match' ? (
                <p className="mq-note mq-note--warn">
                  <Icone nome="alert" />
                  <span>
                    <b>LEGACY_RECONCILIATION_REQUIRED.</b> Esta garantia não tem
                    ponteiro para a linha da venda: o backfill encontrou{' '}
                    {g.vendaItemVinculo === 'ambiguo' ? 'mais de uma candidata' : 'nenhuma candidata'}{' '}
                    e se recusou a adivinhar qual peça voltou. Resolver isso é
                    gente olhando, não automático.
                  </span>
                </p>
              ) : null}

              <dl className="mq-dl">
                <div>
                  <dt>Cliente</dt>
                  <dd>
                    {g.clienteId || g.clienteNomeNorm ? (
                      <button
                        type="button"
                        className="mq-btn mq-btn--link"
                        onClick={() => aoAbrirCliente(
                          g.clienteId ? { id: g.clienteId } : { norm: g.clienteNomeNorm ?? '' },
                        )}
                      >
                        {g.clienteNome}
                      </button>
                    ) : (g.clienteNome ?? '—')}
                  </dd>
                </div>
                <div><dt>Peça</dt><dd>{g.sku}{g.variacao ? ` · ${g.variacao}` : ''}</dd></div>
                <div><dt>Motivo</dt><dd>{g.motivo}</dd></div>
                <div><dt>Data da venda</dt><dd className="mq-date">{fmtData(g.dataVenda)}</dd></div>
                <div><dt>Entrou em</dt><dd className="mq-date">{fmtData(g.dataEntrada)}</dd></div>
                <div>
                  <dt>Valor pago na época</dt>
                  <dd className="mq-money">{g.valorPagoOriginal === null ? '—' : money(g.valorPagoOriginal)}</dd>
                </div>
                <div>
                  <dt>Prazo</dt>
                  <dd>
                    {g.prazoDiasUteis ?? '—'} dias úteis
                    {g.previsaoRetorno ? ` · até ${fmtData(g.previsaoRetorno)}` : ''}
                  </dd>
                </div>
                {g.pendente && (
                  <div>
                    <dt>{g.atrasado ? 'Atraso' : 'Faltam'}</dt>
                    <dd className={g.atrasado ? 'mq-money--risk' : ''}>
                      {g.atrasado ? g.atrasoDiasUteis : g.diasUteisRestantes} dias úteis
                    </dd>
                  </div>
                )}
              </dl>

              {g.troca && (
                <section className="mq-card mq-card--pad mq-card--tint">
                  <h3 className="mq-subtitle">A troca</h3>
                  <dl className="mq-dl">
                    <div><dt>Peça nova</dt><dd>{g.troca.produtoNovoNome ?? g.troca.skuNovo}</dd></div>
                    <div><dt>Valor original</dt><dd className="mq-money">{money(g.troca.valorOriginal)}</dd></div>
                    <div><dt>Valor novo</dt><dd className="mq-money">{money(g.troca.valorNovo)}</dd></div>
                    <div>
                      <dt>Diferença</dt>
                      <dd className={g.troca.diferenca < 0 ? 'mq-money mq-money--ok' : 'mq-money'}>
                        {money(g.troca.diferenca)}
                      </dd>
                    </div>
                    {g.troca.creditoAoCliente > 0 && (
                      <div>
                        <dt>Virou crédito da cliente</dt>
                        <dd className="mq-money mq-money--ok">{money(g.troca.creditoAoCliente)}</dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              {!encerrado && (
                <div className="mq-btns">
                  {STATUS.filter((s) => s.id !== g.status).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={ENCERRADOS.includes(s.id) ? 'mq-btn mq-btn--secondary mq-btn--sm' : 'mq-btn mq-btn--ghost mq-btn--sm'}
                      disabled={ocupado}
                      onClick={() => mudarStatus(s.id)}
                    >
                      {s.rotulo}
                    </button>
                  ))}
                </div>
              )}

              {encerrado && (
                <p className="mq-note mq-note--info">
                  <Icone nome="alert" />
                  <span>
                    Este caso terminou, e de estado terminal não se sai. Se a
                    peça voltou, o caminho é um atendimento novo, ligado a
                    este — trocar o status daqui apagaria a história.
                  </span>
                </p>
              )}

              <section>
                <h3 className="mq-subtitle">O que aconteceu</h3>
                <div className="mq-timeline">
                  {(g.eventos ?? []).slice().reverse().map((e) => (
                    <div className="mq-timeline__row" key={e.id}>
                      <span className="mq-timeline__dot"><Icone nome="clock" /></span>
                      <span className="mq-timeline__body">
                        <b>{e.statusRotulo ?? e.tipo}</b>
                        <small>
                          {fmtData(e.data)}
                          {e.observacao ? ` · ${e.observacao}` : ''}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export { PENDENTES };
