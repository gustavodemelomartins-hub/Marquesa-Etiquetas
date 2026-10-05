import { useEffect, useId, useRef, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { FotoDaPeca } from '../../components/FotoDaPeca';
import { fotoDaPeca } from '../../domain/foto';
import { money, fmtData, hojeISO } from '../../domain/formato';
import { PainelDaTroca } from './PainelDaTroca';
import { ENCERRADOS, type Garantia } from './tipos';
import { acoesDoCaso, mostraTroca, rotuloDoEvento, type AcaoDoCaso } from './reparo';
import type { ProdutoDoEstado } from '../vendas/tipos';

interface Props {
  conexao: Connection;
  id: number;
  /** Todo o catálogo de `GET /api/state` — a troca escolhe a peça nova nele. */
  produtos: ProdutoDoEstado[];
  /** A peça do caso nesse catálogo, já achada (`produtoDaGarantia`). */
  produtoDe: (sku: string | null | undefined) => ProdutoDoEstado | null;
  aoFechar: () => void;
  /** O caso mudou: quem abriu relê a sua lista. */
  aoMudar: () => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}

/** O CASO — a ÚNICA tela de detalhe de um reparo/garantia da V2.
 *
 *  Início, ficha da cliente (Garantias e trocas) e a lista de Garantias abrem
 *  ESTE componente, pelo mesmo `useCasosDeReparo().abrir(id)`. Antes ele
 *  morava dentro da lista de Garantias, e as outras duas portas não abriam
 *  nada.
 *
 *  Gaveta à direita no computador, folha de baixo no telefone — a mesma
 *  `.mq-drawer` do resto do sistema, que já respeita a área segura.
 *
 *  O relógio vem pronto do backend (dias úteis, para quando o caso encerra);
 *  a tela não recalcula prazo. */
export function CasoDeReparo({
  conexao, id, produtos, produtoDe, aoFechar, aoMudar, aoAbrirCliente,
}: Props) {
  const caso = useApi(
    (s) => chamar<Garantia>(conexao, 'GET', `/api/garantias/${id}`, undefined, { signal: s }),
    [conexao, id],
  );
  const titulo = useId();
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => { fechar.current?.focus(); }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aoFechar]);

  const g = caso.dados;
  const peca = g ? produtoDe(g.sku) : null;
  const encerrado = g ? ENCERRADOS.includes(g.status) : false;
  const tom = !g ? '' : g.atrasado ? 'risk' : g.pendente ? 'warn' : 'ok';

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" tabIndex={-1} onClick={aoFechar} />
      <div className="mq-drawer mq-drawer--larga caso" role="dialog" aria-modal="true" aria-labelledby={titulo}>
        <div className="mq-drawer__head">
          <p className="mq-eyebrow caso__numero">Caso #{id}</p>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar} ref={fechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body caso__body">
          {caso.erro ? <ErrorState erro={caso.erro} aoTentarDeNovo={caso.recarregar} /> : null}
          {!g && !caso.erro && (
            <div aria-busy="true">
              <p className="mq-skel mq-skel--title" />
              <p className="mq-skel mq-skel--line" />
            </div>
          )}

          {g && (
            <>
              <header className="caso__peca">
                {peca && fotoDaPeca(peca)
                  ? <FotoDaPeca peca={peca} alt={g.produtoNome ?? g.sku} />
                  : (
                    <span className={`mq-item__icon mq-item__icon--${tom} caso__icone`} aria-hidden="true">
                      <Icone nome={g.troca ? 'swap' : 'repair'} />
                    </span>
                  )}
                <div className="caso__quem">
                  <h2 className="caso__nome" id={titulo}>
                    {g.produtoNome ?? g.sku}
                    {g.variacao ? <span className="caso__variacao"> · {g.variacao}</span> : null}
                  </h2>
                  {g.clienteId || g.clienteNomeNorm ? (
                    <button
                      type="button"
                      className="mq-btn mq-btn--link caso__cliente"
                      onClick={() => {
                        aoFechar();
                        aoAbrirCliente(g.clienteId ? { id: g.clienteId } : { norm: g.clienteNomeNorm ?? '' });
                      }}
                    >
                      {g.clienteNome}
                    </button>
                  ) : (
                    <span className="caso__cliente caso__cliente--sem">{g.clienteNome ?? 'Cliente não identificada'}</span>
                  )}
                  <p className="mq-chips">
                    <span className={`mq-status mq-status--${tom}`}>{g.statusRotulo}</span>
                    {g.troca && g.troca.creditoAoCliente > 0 && (
                      <span className="mq-chip mq-chip--brand">crédito {money(g.troca.creditoAoCliente)}</span>
                    )}
                  </p>
                </div>
              </header>

              {/* 5.2b — as garantias que o backfill se recusou a adivinhar.
                  Isto é o que importa dizer; o identificador do vínculo
                  (`nao_se_aplica`, `direto`…) nunca vai para a tela. */}
              {(g.vendaItemVinculo === 'ambiguo' || g.vendaItemVinculo === 'sem_match') && (
                <p className="mq-note mq-note--warn">
                  <Icone nome="alert" />
                  <span>
                    <b>Não sabemos de qual compra esta peça veio</b>{' '}
                    ({g.vendaItemVinculo === 'ambiguo' ? 'há mais de uma possível' : 'nenhuma compra encontrada'}).
                    Confira com a cliente antes de trocar.
                  </span>
                </p>
              )}

              <Prazo g={g} encerrado={encerrado} />

              <section className="caso__secao" aria-label="Informações">
                <h3 className="mq-subtitle">Informações</h3>
                <dl className="mq-dl">
                  <div><dt>Peça</dt><dd>{g.sku}{g.variacao ? ` · ${g.variacao}` : ''}</dd></div>
                  <div><dt>Motivo</dt><dd>{g.motivo}</dd></div>
                  {g.dataVenda && <div><dt>Comprada em</dt><dd className="mq-date">{fmtData(g.dataVenda)}</dd></div>}
                  {g.valorPagoOriginal !== null && (
                    <div><dt>Valor pago</dt><dd className="mq-money">{money(g.valorPagoOriginal)}</dd></div>
                  )}
                  {g.vendaId && <div><dt>Venda</dt><dd>#{g.vendaId}</dd></div>}
                  {g.observacao && <div><dt>Observação</dt><dd className="caso__obs">{g.observacao}</dd></div>}
                </dl>
              </section>

              {/* Sem conserto e ainda sem troca: a TROCA é o próximo passo,
                  então ela vem antes dos status. */}
              {g.status === 'sem_conserto' && !g.troca && (
                <PainelDaTroca
                  conexao={conexao}
                  garantia={g}
                  produtos={produtos}
                  aoMudar={() => { caso.recarregar(); aoMudar(); }}
                />
              )}

              {encerrado ? (
                <p className="mq-note mq-note--info">
                  <Icone nome="check" />
                  <span>
                    Atendimento encerrado{g.encerradaEm ? ` em ${fmtData(g.encerradaEm)}` : ''}. Se a peça
                    voltou de novo, abra um atendimento novo.
                  </span>
                </p>
              ) : (
                <AcoesDoCasoView
                  conexao={conexao}
                  g={g}
                  aoMudou={() => { caso.recarregar(); aoMudar(); }}
                />
              )}

              {mostraTroca(g) && !(g.status === 'sem_conserto' && !g.troca) && (
                <PainelDaTroca
                  conexao={conexao}
                  garantia={g}
                  produtos={produtos}
                  aoMudar={() => { caso.recarregar(); aoMudar(); }}
                />
              )}

              {(g.eventos ?? []).length > 0 && (
                <section className="caso__secao" aria-label="Histórico">
                  <h3 className="mq-subtitle">Histórico</h3>
                  <div className="mq-timeline">
                    {(g.eventos ?? []).slice().reverse().map((e) => (
                      <div className="mq-timeline__row" key={e.id}>
                        <span className="mq-timeline__dot"><Icone nome="clock" /></span>
                        <span className="mq-timeline__body">
                          <b>{rotuloDoEvento(e)}</b>
                          <small>
                            {fmtData(e.data)}
                            {e.observacao ? ` · ${e.observacao}` : ''}
                          </small>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────────────────────────────────────────── o prazo */

/** Os três números do relógio, no mesmo bloco de números de "A receber".
 *  Caso encerrado não tem "faltam": tem a data em que encerrou. */
function Prazo({ g, encerrado }: { g: Garantia; encerrado: boolean }) {
  return (
    <dl className="mq-figures caso__prazo">
      <div>
        <dt>Entrada</dt>
        <dd>{fmtData(g.dataEntrada)}</dd>
      </div>
      <div>
        <dt>Prazo</dt>
        <dd>{g.previsaoRetorno ? fmtData(g.previsaoRetorno) : '—'}</dd>
        {g.prazoDiasUteis ? <small>{g.prazoDiasUteis} dias úteis</small> : null}
      </div>
      {encerrado ? (
        <div className="is-ok">
          <dt>Encerrado</dt>
          <dd>{g.encerradaEm ? fmtData(g.encerradaEm) : '—'}</dd>
        </div>
      ) : g.atrasado ? (
        <div className="is-risk">
          <dt>Atraso</dt>
          <dd>{g.atrasoDiasUteis} {g.atrasoDiasUteis === 1 ? 'dia útil' : 'dias úteis'}</dd>
        </div>
      ) : g.diasUteisRestantes !== null ? (
        <div className="is-brand">
          <dt>Faltam</dt>
          <dd>{g.diasUteisRestantes} {g.diasUteisRestantes === 1 ? 'dia útil' : 'dias úteis'}</dd>
          {g.relogioParado ? <small>prazo parado</small> : null}
        </div>
      ) : null}
    </dl>
  );
}

/* ───────────────────────────────────────────────────────────── as ações */

/** Uma principal, as secundárias empilhadas, e a destrutiva separada e por
 *  último. Toda mudança passa por uma confirmação aqui mesmo (com
 *  observação opcional) — no lugar do `prompt()` do navegador, que no
 *  iPhone cobria a tela e não dizia o que ia acontecer. */
function AcoesDoCasoView({ conexao, g, aoMudou }: {
  conexao: Connection;
  g: Garantia;
  aoMudou: () => void;
}) {
  const { principal, secundarias, destrutiva } = acoesDoCaso(g);
  const [confirmando, setConfirmando] = useState<AcaoDoCaso | null>(null);
  const [observacao, setObservacao] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  if (!principal && !secundarias.length && !destrutiva) return null;

  async function confirmar(a: AcaoDoCaso) {
    setOcupado(true);
    setErro('');
    const r = await chamar<{ erro?: string }>(conexao, 'POST', `/api/garantias/${g.id}/status`, {
      status: a.status, observacao: observacao.trim() || undefined, data: hojeISO(),
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui mudar a situação.' }));
    setOcupado(false);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return; }
    setConfirmando(null);
    setObservacao('');
    aoMudou();
  }

  if (confirmando) {
    const perigo = confirmando.status === 'cancelada';
    const encerra = ENCERRADOS.includes(confirmando.status);
    return (
      <section className={`caso__confirma${perigo ? ' caso__confirma--perigo' : ''}`} aria-label="Confirmar">
        <h3 className="mq-subtitle">
          {perigo ? 'Cancelar este caso?' : <>Marcar como <b>{confirmando.rotulo}</b>?</>}
        </h3>
        {encerra && (
          <p className="mq-hint">
            {perigo
              ? 'O caso fica registrado como cancelado e não volta a andar. Use só se ele foi aberto por engano.'
              : 'Isto encerra o caso. Se a peça voltar, abre-se um atendimento novo ligado a este.'}
          </p>
        )}
        <label className="mq-field">
          <span className="mq-label">Observação (opcional)</span>
          <textarea
            className="mq-input caso__textarea"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={perigo ? 'Por que foi cancelado' : 'O que foi feito, com quem ficou a peça…'}
          />
        </label>
        {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        <div className="caso__botoes">
          <button
            type="button"
            className={`mq-btn ${perigo ? 'mq-btn--danger' : 'mq-btn--primary'}`}
            disabled={ocupado}
            onClick={() => confirmar(confirmando)}
          >
            {ocupado ? 'Salvando…' : perigo ? 'Cancelar caso' : 'Confirmar'}
          </button>
          <button
            type="button"
            className="mq-btn mq-btn--ghost"
            disabled={ocupado}
            onClick={() => { setConfirmando(null); setErro(''); }}
          >
            Voltar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="caso__secao caso__acoes" aria-label="Ações">
      <h3 className="mq-subtitle">Ações</h3>
      {principal && (
        <button type="button" className="mq-btn mq-btn--primary mq-btn--lg caso__principal" onClick={() => setConfirmando(principal)}>
          {principal.rotulo}
        </button>
      )}
      {secundarias.length > 0 && (
        <div className="mq-list caso__outras">
          {secundarias.map((a) => (
            <button type="button" className="mq-item" key={a.status} onClick={() => setConfirmando(a)}>
              <span className="mq-item__main">
                <b>{a.rotulo}</b>
                {a.ajuda && <small>{a.ajuda}</small>}
              </span>
              <span className="mq-item__side"><Icone nome="chevron" /></span>
            </button>
          ))}
        </div>
      )}
      {destrutiva && (
        <button type="button" className="mq-btn mq-btn--danger caso__cancelar" onClick={() => setConfirmando(destrutiva)}>
          {destrutiva.rotulo}
        </button>
      )}
    </section>
  );
}
