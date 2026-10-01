import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone, type NomeIcone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData, moneyNumero } from '../../domain/formato';
import { buscarPainel } from '../financeiro/api';
import type { ModuloId } from '../../app/modulos';
import type { PainelFinanceiro } from '../financeiro/tipos';
import type { RespostaPendencias as Pendencias } from './PendenciasArea';

interface Props {
  conexao: Connection;
  aoIr: (modulo: ModuloId, sub?: string) => void;
  /** Mantido para quem já passa; o Início não lista mais clientes — o
   *  ranking de quem mais comprou mora no Financeiro. */
  aoAbrirCliente?: (chave: { id: number } | { norm: string }) => void;
}

/** INÍCIO — o que precisa de mim hoje.
 *
 *  A tela abre pelas quatro coisas que mais se faz (vender, receber, a peça
 *  que voltou, montar maleta) e depois pelo que PRECISA DE UMA PESSOA. Os
 *  gráficos saíram daqui: "Entrou por mês" e "Quem mais trouxe" repetiam o
 *  Financeiro, e quem chega de manhã não quer um gráfico, quer saber o que
 *  está parado esperando por ela.
 */
export function HomeArea({ conexao, aoIr }: Props) {
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
          <h1 className="mq-display">Início</h1>
        </div>
      </div>

      <nav className="mq-atalhos" aria-label="Ações rápidas">
        <button type="button" className="mq-atalho mq-atalho--primario" onClick={() => aoIr('vendas', 'nova')}>
          <Icone nome="plus" />
          Nova venda
        </button>
        <button type="button" className="mq-atalho" onClick={() => aoIr('financeiro', 'a-receber')}>
          <Icone nome="money" />
          Receber pagamento
        </button>
        <button type="button" className="mq-atalho" onClick={() => aoIr('garantias', 'nova')}>
          <Icone nome="shield" />
          A peça voltou
        </button>
        <button type="button" className="mq-atalho" onClick={() => aoIr('revendedoras', 'nova-maleta')}>
          <Icone nome="bag" />
          Nova maleta
        </button>
      </nav>

      {/* ─────────────────────────────── o que precisa de uma pessoa */}
      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Precisa da sua atenção</h2>
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
            detalhe="defina quando cobrar"
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
            titulo={`${pend.dados?.resumo.total} ${pend.dados?.resumo.total === 1 ? 'pendência para revisar' : 'pendências para revisar'}`}
            detalhe={Object.values(pend.dados?.resumo.porTipo ?? {})
              .map((t) => `${t.grupo}: ${t.total}`).join(' · ')}
            aoIr={() => aoIr('home', 'pendencias')}
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
              <span className="mq-kpi__value"><i>R$</i>{moneyNumero(p.geral.faturamento)}</span>
              <span className="mq-kpi__foot">pagamentos recebidos</span>
            </div>
            {/* O mesmo número de Financeiro › A receber: todas as contas em
                aberto. Era `geral.aReceber`, que é só das vendas do período,
                ao lado de uma contagem de TODAS as contas (01/10/2026). */}
            <div className={(contas?.resumo.total ?? 0) > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
              <span className="mq-kpi__label">Falta receber</span>
              <span className="mq-kpi__value"><i>R$</i>{contas ? moneyNumero(contas.resumo.total) : '—'}</span>
              <span className="mq-kpi__foot">{contas?.resumo.quantidade ?? 0} contas em aberto</span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Vendas</span>
              <span className="mq-kpi__value">{p.geral.vendas}</span>
              <span className="mq-kpi__foot">{p.geral.pecas} peças</span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Saiu sem faturar</span>
              <span className="mq-kpi__value">{p.saidasSemFaturamento.pecas}</span>
              <span className="mq-kpi__foot">brinde, uso próprio, perda e sorteio no mês</span>
            </div>
          </div>

          {reparos && reparos.itens.length > 0 && (
            <section className="mq-card mq-card--flush">
              <div className="mq-card__head">
                <div>
                  <h2 className="mq-title">Peças em reparo</h2>
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
