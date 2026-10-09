import { useMemo, useState } from 'react';
import type { Connection } from '../../services/client';
import type { EstadoRequisicao } from '../../hooks/useApi';
import {
  conferirEstoque, ligarAutomatico, reconciliarDivergencias, sincronizarPendencias,
  tentarDeNovo, type EstoqueOnline,
} from '../../services/nuvemshopEstoque';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import type { FilaDePublicacao, SituacaoDaTela } from '../publicacao/tipos';
import { fmtDataHora } from './SyncStatus';
import { montarVisaoGeral, UNIVERSOS, type ItemDeAtencao } from './visaoGeral';

interface Props {
  conexao: Connection;
  online: EstadoRequisicao<EstoqueOnline>;
  fila: EstadoRequisicao<FilaDePublicacao>;
  aoIrPreparacao: (aba: SituacaoDaTela | null) => void;
  aoIrPendencias: () => void;
  aoMudar: () => void;
}

const TOM_DO_STATUS: Record<string, string> = {
  positivo: 'mq-status--ok', atencao: 'mq-status--warn', critico: 'mq-status--risk', neutro: 'mq-status--open',
};

type Aviso = { tom: 'ok' | 'risk'; texto: string };

/** LOJA ONLINE › VISÃO GERAL (§63).
 *
 *  De cima para baixo: o estado da sincronização numa linha; quatro
 *  números (publicados, ocultos, prontos, atenção); o que precisa de
 *  gente, cada item dizendo o que aconteceu, por que importa e o que
 *  fazer; conferir com a loja (leitura) e, só depois, corrigir (escrita);
 *  e o diagnóstico técnico, fechado.
 *
 *  Nada aqui publica produto. As únicas escritas são as de estoque, e cada
 *  uma diz que é escrita antes do clique. */
export function VisaoGeralArea({ conexao, online, fila, aoIrPreparacao, aoIrPendencias, aoMudar }: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [confirmarCorrecao, setConfirmarCorrecao] = useState(false);
  const [detalhesAbertos, setDetalhesAbertos] = useState(false);

  const visao = useMemo(
    () => (online.dados ? montarVisaoGeral(online.dados, fila.dados, new Date()) : null),
    [online.dados, fila.dados],
  );

  async function agir(chave: string, acao: () => Promise<string>) {
    setOcupado(chave);
    setAviso(null);
    try {
      setAviso({ tom: 'ok', texto: await acao() });
      aoMudar();
    } catch (e) {
      setAviso({ tom: 'risk', texto: e instanceof Error ? e.message : 'Não consegui.' });
    } finally {
      setOcupado(null);
    }
  }

  const corrigir = () => agir('corrigir', async () => {
    setConfirmarCorrecao(false);
    const r = await reconciliarDivergencias(conexao);
    return r.codigos
      ? `${r.codigos} ${r.codigos === 1 ? 'código enviado' : 'códigos enviados'} com o saldo do Marquesa. Os que não têm divisão segura ficaram de fora.`
      : 'Nada a corrigir: não havia diferença na última conferência.';
  });

  if (online.erro) {
    return <section className="mq-card"><ErrorState erro={online.erro} aoTentarDeNovo={online.recarregar} /></section>;
  }
  if (!visao || !online.dados) {
    return (
      <section className="mq-card mq-card--pad" aria-busy="true">
        <p className="mq-skel mq-skel--title" />
        <p className="mq-skel" />
      </section>
    );
  }

  const { status, kpis, atencao } = visao;
  const r = online.dados;
  const conf = r.conferencia ?? null;

  return (
    <>
      {/* ───────────────────────────── 1. a loja está sincronizada? */}
      <section className="mq-card mq-card--pad mq-loja-status" aria-label="Sincronização">
        <span className={`mq-status ${TOM_DO_STATUS[status.tom] ?? 'mq-status--open'}`}>{status.rotulo}</span>
        <span className="mq-loja-status__linha">
          Última sincronização <b>{fmtDataHora(status.ultimaSincronizacaoEm)}</b>
          <span aria-hidden="true"> · </span>
          <span title={UNIVERSOS.sincronizados}><b>{status.sincronizados}</b> códigos sincronizados</span>
          <span aria-hidden="true"> · </span>
          <span className={status.erros ? 'mq-money--risk' : undefined}>
            <b>{status.erros}</b> {status.erros === 1 ? 'erro' : 'erros'}
          </span>
          {status.aguardando > 0 && <> <span aria-hidden="true"> · </span>{status.aguardando} aguardando envio</>}
        </span>
        {status.motivo && <p className="mq-hint">{status.motivo}</p>}
      </section>

      {aviso && (
        <p className={`mq-note ${aviso.tom === 'risk' ? 'mq-note--risk' : 'mq-note--ok'}`} role="status">
          <Icone nome={aviso.tom === 'risk' ? 'alert' : 'check'} />
          <span>{aviso.texto}</span>
        </p>
      )}

      {/* ───────────────────────────── 2. quatro números, quatro universos */}
      {fila.erro ? (
        <section className="mq-card"><ErrorState erro={fila.erro} aoTentarDeNovo={fila.recarregar} /></section>
      ) : !kpis ? (
        <section className="mq-card mq-card--pad" aria-busy="true"><p className="mq-skel" /></section>
      ) : (
        <div className="mq-kpis">
          <button type="button" className="mq-kpi" title={UNIVERSOS.publicados} onClick={() => aoIrPreparacao('publicado')}>
            <span className="mq-kpi__label">Publicados na loja</span>
            <span className="mq-kpi__value">{kpis.publicados}</span>
            <span className="mq-kpi__foot">visíveis na Nuvemshop</span>
          </button>
          <button type="button" className="mq-kpi" title={UNIVERSOS.ocultos} onClick={() => aoIrPreparacao('oculto')}>
            <span className="mq-kpi__label">Ocultos em preparação</span>
            <span className="mq-kpi__value">{kpis.ocultos}</span>
            <span className="mq-kpi__foot">cadastrados, ainda não aparecem</span>
          </button>
          <button type="button" className="mq-kpi mq-kpi--accent" title={UNIVERSOS.prontos} onClick={() => aoIrPreparacao('pronto')}>
            <span className="mq-kpi__label">Prontos para publicar</span>
            <span className="mq-kpi__value">{kpis.prontos}</span>
            <span className="mq-kpi__foot">só falta o seu clique</span>
          </button>
          <a
            className={kpis.atencao ? 'mq-kpi mq-kpi--risk' : 'mq-kpi mq-kpi--ok'}
            href="#atencao"
            title={UNIVERSOS.atencao}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('atencao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <span className="mq-kpi__label">Precisam de atenção</span>
            <span className="mq-kpi__value">{kpis.atencao}</span>
            <span className="mq-kpi__foot">{kpis.atencao ? 'códigos que só você resolve' : 'nada esperando por você'}</span>
          </a>
        </div>
      )}

      {/* ───────────────────────────── 3. precisam da sua atenção */}
      <section className="mq-card mq-card--flush" id="atencao" aria-label="Precisam da sua atenção">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Precisam da sua atenção</h2>
            <p className="mq-lede">Só o que uma pessoa resolve. Peça oculta em preparação não entra aqui.</p>
          </div>
        </div>
        {atencao.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="check" /></span>
            <h3>Nada esperando por você</h3>
            <p>A sincronização dá conta do resto sozinha.</p>
          </div>
        ) : (
          <div className="mq-list">
            {atencao.map((a) => (
              <ItemAtencao
                key={a.chave}
                item={a}
                ocupado={ocupado}
                confirmarCorrecao={confirmarCorrecao}
                aoAcao={() => {
                  const d = a.acao?.destino;
                  if (!d) return;
                  if (d.tipo === 'pendencias') aoIrPendencias();
                  else if (d.tipo === 'preparacao') aoIrPreparacao(d.aba);
                  else if (d.tipo === 'corrigir') setConfirmarCorrecao(true);
                  else if (d.tipo === 'detalhes') setDetalhesAbertos(true);
                }}
                aoConfirmarCorrecao={corrigir}
                aoCancelarCorrecao={() => setConfirmarCorrecao(false)}
                aoTentar={(sku) => agir(`tentar:${sku}`, async () => {
                  const t = await tentarDeNovo(conexao, sku);
                  return t.status === 'sincronizada' || t.status === 'sincronizado'
                    ? `${sku}: a loja aceitou.` : `${sku}: ${t.status}.`;
                })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ───────────────────────────── 4. conferir (lê) → corrigir (escreve) */}
      <section className="mq-card mq-card--pad mq-stack" aria-label="Conferir com a Nuvemshop">
        <div>
          <h2 className="mq-title">Conferir com a Nuvemshop</h2>
          <p className="mq-lede">
            <b>Conferir</b> compara o estoque daqui com o da loja, variante por variante.
            Só lê: <b>não muda nada na Nuvemshop</b>.
          </p>
        </div>
        <p className="mq-hint">
          {conf
            ? <>Última conferência {fmtDataHora(conf.em)}: <b>{conf.iguais}</b> iguais, <b>{conf.divergentes}</b> {conf.divergentes === 1 ? 'diferente' : 'diferentes'}.</>
            : 'Nenhuma conferência registrada ainda.'}
        </p>
        <div className="mq-btns">
          <button
            type="button" className="mq-btn mq-btn--secondary mq-btn--sm" disabled={!!ocupado || !r.conectada}
            onClick={() => agir('conferir', async () => {
              const c = await conferirEstoque(conexao);
              return c.resumo.divergentes
                ? `Encontramos ${c.resumo.divergentes} ${c.resumo.divergentes === 1 ? 'situação' : 'situações'} de estoque diferente. Veja em "Precisam da sua atenção".`
                : `Conferido: ${c.resumo.iguais} iguais, nenhuma diferença.`;
            })}
          >
            {ocupado === 'conferir' ? 'Lendo a loja…' : 'Conferir agora'}
          </button>
          {!!conf && conf.divergentes > 0 && !confirmarCorrecao && (
            <button
              type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={!!ocupado}
              onClick={() => setConfirmarCorrecao(true)}
            >
              Corrigir automaticamente o que é seguro
            </button>
          )}
        </div>
        {confirmarCorrecao && (
          <ConfirmarCorrecao
            quantidade={conf?.divergentes ?? 0}
            ocupado={ocupado === 'corrigir'}
            aoConfirmar={corrigir}
            aoCancelar={() => setConfirmarCorrecao(false)}
          />
        )}
      </section>

      {/* ───────────────────────────── 5. diagnóstico técnico, fechado */}
      <details
        className="mq-card mq-card--pad mq-details"
        open={detalhesAbertos}
        onToggle={(e) => setDetalhesAbertos((e.target as HTMLDetailsElement).open)}
      >
        <summary><b>Ver detalhes da sincronização</b></summary>
        <Diagnostico
          r={r}
          ocupado={ocupado}
          aoSincronizar={() => agir('sincronizar', async () => {
            const x = await sincronizarPendencias(conexao);
            return x.motivo || `${x.sincronizados} sincronizados, ${x.erros} com erro.`;
          })}
          aoAlternar={() => agir('automatico', async () => {
            const x = await ligarAutomatico(conexao, !r.ativo);
            return x.ativo ? 'Sincronização automática ligada.' : 'Sincronização automática desligada.';
          })}
        />
      </details>
    </>
  );
}

function ConfirmarCorrecao({
  quantidade, ocupado, aoConfirmar, aoCancelar,
}: { quantidade: number; ocupado: boolean; aoConfirmar: () => void; aoCancelar: () => void }) {
  return (
    <div className="mq-note mq-note--warn mq-stack" role="alertdialog" aria-label="Confirmar correção">
      <span>
        <b>Isto muda o estoque na Nuvemshop.</b> O Marquesa manda o saldo daqui para
        {' '}{quantidade} {quantidade === 1 ? 'variante diferente' : 'variantes diferentes'}.
        Código com variação sem divisão segura fica de fora, como sempre. Nenhum produto é publicado.
      </span>
      <div className="mq-btns">
        <button type="button" className="mq-btn mq-btn--primary mq-btn--sm" disabled={ocupado} onClick={aoConfirmar}>
          {ocupado ? 'Enviando…' : 'Confirmar: corrigir na loja'}
        </button>
        <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={ocupado} onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function ItemAtencao({
  item, ocupado, confirmarCorrecao, aoAcao, aoTentar, aoConfirmarCorrecao, aoCancelarCorrecao,
}: {
  item: ItemDeAtencao;
  ocupado: string | null;
  confirmarCorrecao: boolean;
  aoAcao: () => void;
  aoTentar: (sku: string) => void;
  aoConfirmarCorrecao: () => void;
  aoCancelarCorrecao: () => void;
}) {
  const tentar = item.acao?.destino.tipo === 'tentar';
  const corrigindo = item.acao?.destino.tipo === 'corrigir' && confirmarCorrecao;
  return (
    <article className="mq-atencao" aria-label={item.titulo}>
      <span className={`mq-item__icon ${item.tom === 'critico' ? 'mq-item__icon--risk' : 'mq-item__icon--warn'}`}>
        <Icone nome="alert" />
      </span>
      <div className="mq-atencao__corpo">
        <div className="mq-atencao__topo">
          <b>{item.titulo}</b>
          {item.quantidade > 0 && <span className="mq-badge">{item.quantidade}</span>}
        </div>
        <p>{item.oQueAconteceu}</p>
        <p className="mq-atencao__porque">{item.porQue}</p>
        <p><b>O que fazer:</b> {item.oQueFazer}</p>
        {item.acao && !tentar && !corrigindo && (
          <div className="mq-btns">
            <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" disabled={!!ocupado} onClick={aoAcao}>
              {item.acao.rotulo}
            </button>
          </div>
        )}
        {corrigindo && (
          <ConfirmarCorrecao
            quantidade={item.quantidade}
            ocupado={ocupado === 'corrigir'}
            aoConfirmar={aoConfirmarCorrecao}
            aoCancelar={aoCancelarCorrecao}
          />
        )}
        {item.codigos.length > 0 && (
          <details className="mq-details" open={tentar}>
            <summary>{tentar ? 'Códigos' : `Ver ${item.codigos.length === 1 ? 'o código' : `os ${item.codigos.length} códigos`}`}</summary>
            <ul className="mq-atencao__codigos">
              {item.codigos.slice(0, 60).map((c) => (
                <li key={c.sku}>
                  <span className="mq-sku">{c.sku}</span> {c.nome ?? ''}
                  {tentar && (
                    <button
                      type="button" className="mq-btn mq-btn--link mq-btn--sm" disabled={!!ocupado}
                      onClick={() => aoTentar(c.sku)}
                    >
                      {ocupado === `tentar:${c.sku}` ? 'Enviando…' : 'Tentar de novo'}
                    </button>
                  )}
                </li>
              ))}
              {item.codigos.length > 60 && <li className="mq-hint">e mais {item.codigos.length - 60}</li>}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

/** O diagnóstico técnico: códigos de motivo, horários, a comparação linha a
 *  linha e as ações de emergência. Útil para auditoria; fechado por padrão. */
function Diagnostico({
  r, ocupado, aoSincronizar, aoAlternar,
}: { r: EstoqueOnline; ocupado: string | null; aoSincronizar: () => void; aoAlternar: () => void }) {
  const c = r.contagens ?? {};
  const rod = r.ultimaRodada;
  return (
    <div className="mq-stack" style={{ marginTop: 'var(--mq-4)' }}>
      <dl className="mq-figures">
        <div><dt>Envio automático</dt><dd>{r.ativo ? 'ligado' : 'desligado'}</dd></div>
        <div><dt>Rodada automática (cron)</dt><dd>{fmtDataHora(r.cronEm ?? null)}</dd></div>
        <div><dt>Corte de pedidos</dt><dd>{fmtDataHora(r.corteEm ?? null)}</dd></div>
        <div>
          <dt>Fila</dt>
          <dd>{Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</dd>
        </div>
        {rod && (
          <div>
            <dt>Última rodada</dt>
            <dd>
              {fmtDataHora(rod.em)} · {rod.origem}{rod.modo ? ` (${rod.modo})` : ''} · {rod.processados} processados,
              {' '}{rod.sincronizados} sincronizados, {rod.erros} erros, {rod.revisao} revisão
            </dd>
          </div>
        )}
        {r.conferencia && (
          <div>
            <dt>Última conferência</dt>
            <dd>
              {fmtDataHora(r.conferencia.em)} · {r.conferencia.produtosNaLoja} produtos e {r.conferencia.variantesNaLoja} variantes
              na loja · {r.conferencia.skusMapeados} códigos mapeados
            </dd>
          </div>
        )}
      </dl>
      {r.freio && <p className="mq-note mq-note--warn"><span>Freio: {r.freio.motivo}</span></p>}

      {(r.problemas ?? []).length > 0 && (
        <TabelaTecnica
          titulo="Fila: códigos fora de “sincronizado”"
          colunas={['SKU', 'Status', 'Motivo', 'Mensagem', 'Tentativas', 'Última tentativa']}
          linhas={(r.problemas ?? []).map((p) => [
            p.sku, p.status, p.motivoRevisao ?? p.acao ?? '—', p.erro ?? '—', String(p.tentativas),
            fmtDataHora(p.ultimaTentativaEm || p.pedidoEm),
          ])}
        />
      )}
      {(r.divergentes ?? []).length > 0 && (
        <TabelaTecnica
          titulo="Conferência: Marquesa × Nuvemshop"
          colunas={['SKU', 'Produto', 'Variante', 'Marquesa', 'Nuvemshop', 'Diferença']}
          linhas={(r.divergentes ?? []).map((d) => [
            d.sku, d.produto ?? '—', d.variante ?? '—', String(d.online ?? '—'), String(d.ns_estoque ?? '—'), String(d.diferenca ?? '—'),
          ])}
        />
      )}
      {(r.excecoes ?? []).length > 0 && (
        <TabelaTecnica
          titulo="Conferência: exceções"
          colunas={['SKU', 'Produto', 'Status', 'Motivo']}
          linhas={(r.excecoes ?? []).map((x) => [x.sku ?? '—', x.produto ?? '—', x.status, x.motivo ?? '—'])}
        />
      )}

      <div className="mq-btns">
        <button type="button" className="mq-btn mq-btn--ghost mq-btn--sm" disabled={!!ocupado} onClick={aoSincronizar}>
          {ocupado === 'sincronizar' ? 'Enviando…' : 'Sincronizar pendências agora'}
        </button>
        <button type="button" className="mq-btn mq-btn--link mq-btn--sm" disabled={!!ocupado} onClick={aoAlternar}>
          {r.ativo ? 'Desligar envio automático (emergência)' : 'Ligar envio automático'}
        </button>
      </div>
      <p className="mq-hint">
        As duas ações acima escrevem estoque na Nuvemshop (ou param de escrever). Nenhuma delas publica produto.
      </p>
    </div>
  );
}

function TabelaTecnica({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: string[][] }) {
  return (
    <section className="mq-stack mq-stack--tight">
      <h3 className="mq-subtitle">{titulo} · {linhas.length}</h3>
      <div className="mq-scroll-x">
        <table className="mq-tecnica">
          <thead><tr>{colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {linhas.slice(0, 200).map((l, i) => (
              <tr key={`${l[0]}-${i}`}>{l.map((v, j) => <td key={j} className={j === 0 ? 'mq-sku' : undefined}>{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
