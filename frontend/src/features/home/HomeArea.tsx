import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone, type NomeIcone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData } from '../../domain/formato';
import { buscarPainel } from '../financeiro/api';
import type { ModuloId } from '../../app/modulos';
import type { PainelFinanceiro } from '../financeiro/tipos';

interface Pendencia {
  chave: string;
  tipo: string;
  sku: string | null;
  produto: string | null;
  origem: string;
  informacaoFaltante: string | null;
  efeito: string | null;
  proximoPasso: string | null;
  explicacao: string | null;
}

interface Pendencias {
  ok: true;
  resumo: { total: number; adiadas: number; porTipo: Record<string, { grupo: string; total: number }> };
  pendencias: Pendencia[];
}

interface Props {
  conexao: Connection;
  aoIr: (modulo: ModuloId, sub?: string) => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}

/** HOME — como está a operação hoje.
 *
 *  A tela abre pelo que PRECISA DE UMA PESSOA, não pelo que é bonito de
 *  mostrar. O painel antigo abria por gráficos; quem chega de manhã não
 *  quer um gráfico, quer saber o que está parado esperando por ela.
 *
 *  Por isso a ordem é: o que trava dinheiro ou peça → os números do mês →
 *  o que aconteceu. E cada bloco leva ao módulo onde a coisa se resolve.
 */
export function HomeArea({ conexao, aoIr, aoAbrirCliente }: Props) {
  const painel = useApi(
    (s) => buscarPainel(conexao, { periodo: '30d', de: null, ate: null }, s),
    [conexao],
  );
  const pend = useApi(
    (s) => chamar<Pendencias>(conexao, 'GET', '/api/pendencias', undefined, { signal: s }),
    [conexao],
  );

  if (painel.erro) {
    return <section className="mq-card"><ErrorState erro={painel.erro} aoTentarDeNovo={painel.recarregar} /></section>;
  }

  const p: PainelFinanceiro | null = painel.dados;
  const contas = p?.contasReceber;
  const vencidas = (contas?.contas ?? []).filter((c) => c.vencida);
  const reparos = p?.pecasEmReparo;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Hoje</p>
          <h1 className="mq-display">Como está a operação</h1>
          <p className="mq-lede">
            O que precisa de você primeiro, e depois os números dos últimos
            30 dias.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--primary" onClick={() => aoIr('vendas', 'nova')}>
            <Icone nome="plus" />
            Nova venda
          </button>
        </div>
      </div>

      {/* ─────────────────────────────── o que precisa de uma pessoa */}
      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Precisa da sua atenção</h2>
            <p className="mq-lede">Nada aqui se resolve sozinho.</p>
          </div>
        </div>
        <div className="mq-list">
          <Atencao
            quando={vencidas.length > 0}
            tom="risk"
            icone="receipt"
            titulo={`${vencidas.length} ${vencidas.length === 1 ? 'conta vencida' : 'contas vencidas'}`}
            detalhe={`${money(vencidas.reduce((s, c) => s + c.valorReceber, 0))} passaram do prazo combinado`}
            aoIr={() => aoIr('financeiro', 'a-receber~tudo')}
          />
          <Atencao
            quando={(reparos?.atrasadas ?? 0) > 0}
            tom="risk"
            icone="shield"
            titulo={`${reparos?.atrasadas} ${reparos?.atrasadas === 1 ? 'garantia atrasada' : 'garantias atrasadas'}`}
            detalhe="passaram do prazo de reparo combinado com a cliente"
            aoIr={() => aoIr('garantias')}
          />
          <Atencao
            quando={(contas?.resumo.semPrazo ?? 0) > 0}
            tom="warn"
            icone="calendar"
            titulo={`${contas?.resumo.semPrazo} ${contas?.resumo.semPrazo === 1 ? 'conta sem prazo' : 'contas sem prazo'}`}
            detalhe="ninguém sabe quando cobrar — sem data, elas não entram em mês nenhum"
            aoIr={() => aoIr('financeiro', 'a-receber~tudo')}
          />
          <Atencao
            quando={(reparos?.total ?? 0) > 0}
            tom="warn"
            icone="repair"
            titulo={`${reparos?.total} ${reparos?.total === 1 ? 'peça em reparo' : 'peças em reparo'}`}
            detalhe="casos abertos, dentro do prazo"
            aoIr={() => aoIr('garantias')}
          />
          <Atencao
            quando={(pend.dados?.resumo.total ?? 0) > 0}
            tom="info"
            icone="cloud"
            titulo={`${pend.dados?.resumo.total} pendências de catálogo e loja`}
            detalhe={Object.values(pend.dados?.resumo.porTipo ?? {})
              .map((t) => `${t.grupo}: ${t.total}`).join(' · ')}
            aoIr={() => aoIr('estoque', 'pendencias')}
          />

          {vencidas.length === 0
            && (reparos?.total ?? 0) === 0
            && (contas?.resumo.semPrazo ?? 0) === 0
            && (pend.dados?.resumo.total ?? 0) === 0
            && !painel.carregando && (
            <div className="mq-state">
              <span className="mq-state__icon"><Icone nome="check" /></span>
              <h3>Nada parado</h3>
              <p>Nenhuma conta vencida, nenhuma peça em reparo, nenhuma pendência de catálogo.</p>
            </div>
          )}
        </div>
      </section>

      {/* ─────────────────────────────────────── os números do mês */}
      {p && (
        <>
          <div className="mq-kpis">
            <div className="mq-kpi mq-kpi--ok">
              <span className="mq-kpi__label">Entrou em 30 dias</span>
              <span className="mq-kpi__value"><i>R$</i>{money(p.geral.faturamento).replace('R$ ', '')}</span>
              <span className="mq-kpi__foot">pela data do pagamento</span>
            </div>
            <div className={p.geral.aReceber > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
              <span className="mq-kpi__label">Falta receber</span>
              <span className="mq-kpi__value"><i>R$</i>{money(p.geral.aReceber).replace('R$ ', '')}</span>
              <span className="mq-kpi__foot">{contas?.resumo.quantidade ?? 0} contas em aberto</span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Vendas</span>
              <span className="mq-kpi__value">{p.geral.vendas}</span>
              <span className="mq-kpi__foot">{p.geral.pecas} peças · pela data da venda</span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Saiu sem faturar</span>
              <span className="mq-kpi__value">{p.saidasSemFaturamento.pecas}</span>
              <span className="mq-kpi__foot">brinde, uso próprio, perda e sorteio no mês</span>
            </div>
          </div>

          <div className="mq-grid mq-grid--main">
            <section className="mq-card mq-card--flush">
              <div className="mq-card__head">
                <div>
                  <h2 className="mq-title">Entrou por mês</h2>
                  <p className="mq-lede">Recortado pela data do pagamento.</p>
                </div>
                <button type="button" className="mq-btn mq-btn--link" onClick={() => aoIr('financeiro')}>
                  Ver financeiro
                </button>
              </div>
              <div className="mq-card__body">
                {p.evolucao.pontos.length === 0 ? (
                  <p className="mq-hint">Sem movimento no período.</p>
                ) : (
                  <div className="mq-bars">
                    {p.evolucao.pontos.map((x) => {
                      const maior = Math.max(1, ...p.evolucao.pontos.map((y) => y.faturamento));
                      return (
                        <div className="mq-bars__row" key={x.chave}>
                          <span className="mq-date">{x.chave}</span>
                          <span className="mq-meter">
                            <i style={{ width: `${Math.round((x.faturamento / maior) * 100)}%` }} />
                          </span>
                          <b className="mq-money">{money(x.faturamento)}</b>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <aside className="mq-stack">
              {p.topClientes.length > 0 && (
                <section className="mq-card mq-card--flush">
                  <div className="mq-card__head"><div><h2 className="mq-subtitle">Quem mais trouxe</h2></div></div>
                  <div className="mq-list">
                    {p.topClientes.slice(0, 4).map((c) => (
                      <button
                        type="button"
                        className="mq-item"
                        key={c.norm ?? c.nome}
                        onClick={() => c.norm && aoAbrirCliente({ norm: c.norm })}
                      >
                        <span className="mq-item__main">
                          <b>{c.nome}</b>
                          <small>{c.vendas} {c.vendas === 1 ? 'compra' : 'compras'}</small>
                        </span>
                        <span className="mq-item__side"><b className="mq-money">{money(c.faturamento)}</b></span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="mq-card mq-card--pad">
                <h2 className="mq-subtitle">Atalhos</h2>
                <div className="mq-btns">
                  <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={() => aoIr('clientes')}>
                    Clientes
                  </button>
                  <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={() => aoIr('estoque', 'pecas')}>
                    Peças
                  </button>
                  <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={() => aoIr('estoque', 'inventario')}>
                    Inventário
                  </button>
                  <button type="button" className="mq-btn mq-btn--secondary mq-btn--sm" onClick={() => aoIr('revendedoras')}>
                    Revendedoras
                  </button>
                </div>
              </section>
            </aside>
          </div>

          {reparos && reparos.itens.length > 0 && (
            <section className="mq-card mq-card--flush">
              <div className="mq-card__head">
                <div>
                  <h2 className="mq-title">Peças em reparo</h2>
                  <p className="mq-lede">Só o que ainda pede alguma coisa de alguém.</p>
                </div>
                <button type="button" className="mq-btn mq-btn--link" onClick={() => aoIr('garantias')}>
                  Ver todas
                </button>
              </div>
              <div className="mq-list">
                {(reparos.itens as { id: number; produtoNome: string | null; sku: string; clienteNome: string | null; dataEntrada: string; atrasado: boolean; statusRotulo: string }[])
                  .slice(0, 5).map((g) => (
                    <div className="mq-item" key={g.id}>
                      <span className={`mq-item__icon ${g.atrasado ? 'mq-item__icon--risk' : 'mq-item__icon--warn'}`}>
                        <Icone nome="repair" />
                      </span>
                      <span className="mq-item__main">
                        <b>{g.produtoNome ?? g.sku}</b>
                        <small>{g.clienteNome ?? 'cliente não identificada'} · entrou {fmtData(g.dataEntrada)}</small>
                      </span>
                      <span className="mq-item__side">
                        <span className={g.atrasado ? 'mq-status mq-status--risk' : 'mq-status mq-status--warn'}>
                          {g.statusRotulo}
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Atencao({
  quando, tom, icone, titulo, detalhe, aoIr,
}: {
  quando: boolean;
  tom: 'risk' | 'warn' | 'info';
  icone: NomeIcone;
  titulo: string;
  detalhe: string;
  aoIr: () => void;
}) {
  if (!quando) return null;
  return (
    <button type="button" className="mq-item" onClick={aoIr}>
      <span className={`mq-item__icon mq-item__icon--${tom}`}><Icone nome={icone} /></span>
      <span className="mq-item__main">
        <b>{titulo}</b>
        <small>{detalhe}</small>
      </span>
      <span className="mq-item__side"><Icone nome="chevron" /></span>
    </button>
  );
}
