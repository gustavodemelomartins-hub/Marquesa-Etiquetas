import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData, hojeISO } from '../../domain/formato';
import { FiltroPeriodo } from './FiltroPeriodo';
import { AReceber } from './AReceber';
import {
  buscarAReceber, buscarLancamentos, buscarPainel, buscarSaidas,
  buscarVendasDoDia, conferirCredito, conferirFinanceiro,
} from './api';
import { descreverRecorte, recorteDaSub, subDoRecorte } from './periodo';
import type { Connection } from '../../services/client';
import type { ContaAReceber, PainelFinanceiro, Recorte } from './tipos';

type Aba = 'resumo' | 'a-receber' | 'recebimentos' | 'saidas' | 'conferencia';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'a-receber', rotulo: 'A receber' },
  { id: 'recebimentos', rotulo: 'Recebimentos' },
  { id: 'saidas', rotulo: 'Saiu sem faturar' },
  { id: 'conferencia', rotulo: 'Conferência' },
];

interface Props {
  conexao: Connection;
  /** O endereço da tela: a aba, ou a aba e o recorte. */
  sub: string | null;
  aoNavegar: (sub: string) => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}

/** FINANCEIRO — quanto entrou, e quanto ainda falta receber.
 *
 *  As duas perguntas são diferentes e respondidas por datas diferentes, e
 *  essa é a espinha do módulo inteiro:
 *
 *    quanto ENTROU   recortado pela data do PAGAMENTO
 *    quanto VENDEU   recortado pela data da VENDA
 *
 *  Um cartão que soma os dois pela mesma data está errado em silêncio, e
 *  era assim que o painel antigo fazia. Aqui cada bloco diz por qual data
 *  ele foi cortado.
 */
export function FinanceiroArea({ conexao, sub, aoNavegar, aoAbrirCliente }: Props) {
  const [aba, recorteDaUrl] = lerSub(sub);
  const [recorte, setRecorte] = useState<Recorte>(recorteDaUrl);

  const painel = useApi((s) => buscarPainel(conexao, recorte, s), [conexao, chaveDoRecorte(recorte)]);
  const aReceber = useApi((s) => buscarAReceber(conexao, 'aberta', s), [conexao]);

  const irPara = (destino: Aba) => aoNavegar(`${destino}~${subDoRecorte(recorte)}`);
  const trocarRecorte = (r: Recorte) => {
    setRecorte(r);
    aoNavegar(`${aba}~${subDoRecorte(r)}`);
  };

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Dinheiro</p>
          <h1 className="mq-display">Financeiro</h1>
          <p className="mq-lede">
            Quanto entrou e quanto ainda falta receber — dois números, duas
            datas, e a tela nunca os confunde.
          </p>
        </div>
        <div className="mq-pagehead__meta">{descreverRecorte(recorte)}</div>
      </div>

      <FiltroPeriodo recorte={recorte} aoMudar={trocarRecorte} />

      <nav className="mq-tabs" aria-label="Seções do financeiro">
        {ABAS.map((a) => (
          <button key={a.id} type="button" aria-selected={aba === a.id} onClick={() => irPara(a.id)}>
            {a.rotulo}
            {a.id === 'a-receber' && aReceber.dados && aReceber.dados.resumo.quantidade > 0 && (
              <span className="mq-badge mq-badge--brand">{aReceber.dados.resumo.quantidade}</span>
            )}
          </button>
        ))}
      </nav>

      {aba === 'resumo' && (
        <Resumo estado={painel} recorte={recorte} aoAbrirCliente={aoAbrirCliente} />
      )}
      {aba === 'a-receber' && (
        <AReceber
          conexao={conexao}
          dados={aReceber.dados}
          erro={aReceber.erro}
          recarregar={() => { aReceber.recarregar(); painel.recarregar(); }}
          aoAbrirCliente={(c: ContaAReceber) => aoAbrirCliente(
            c.clienteId ? { id: c.clienteId } : { norm: c.clienteNorm ?? '' },
          )}
        />
      )}
      {aba === 'recebimentos' && <Recebimentos conexao={conexao} />}
      {aba === 'saidas' && <SaiuSemFaturar conexao={conexao} painel={painel.dados} />}
      {aba === 'conferencia' && <Conferencia conexao={conexao} />}
    </>
  );
}

function lerSub(sub: string | null): [Aba, Recorte] {
  const [abaCrua, recorteCru] = String(sub ?? '').split('~');
  const aba = ABAS.find((a) => a.id === abaCrua)?.id ?? 'resumo';
  return [aba, recorteDaSub(recorteCru ?? null)];
}

const chaveDoRecorte = (r: Recorte) => `${r.periodo}|${r.de ?? ''}|${r.ate ?? ''}`;

/* ──────────────────────────────────────────────────────────────── resumo */

function Resumo({
  estado, recorte, aoAbrirCliente,
}: {
  estado: { dados: PainelFinanceiro | null; erro: unknown; recarregar: () => void };
  recorte: Recorte;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}) {
  if (estado.erro) {
    return <section className="mq-card"><ErrorState erro={estado.erro} aoTentarDeNovo={estado.recarregar} /></section>;
  }
  if (!estado.dados) {
    return (
      <section className="mq-card mq-card--pad" aria-busy="true">
        <p className="mq-skel mq-skel--title" />
        <p className="mq-skel mq-skel--line" style={{ marginTop: 14 }} />
      </section>
    );
  }

  const p = estado.dados;
  const g = p.geral;
  const pontos = p.evolucao.pontos ?? [];
  const maior = Math.max(1, ...pontos.map((x) => x.faturamento));

  return (
    <>
      <div className="mq-kpis">
        <div className="mq-kpi mq-kpi--ok">
          <span className="mq-kpi__label">Entrou</span>
          <span className="mq-kpi__value"><i>R$</i>{money(g.faturamento).replace('R$ ', '')}</span>
          <span className="mq-kpi__foot">pela data do pagamento</span>
        </div>
        <div className={g.aReceber > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Falta receber</span>
          <span className="mq-kpi__value"><i>R$</i>{money(g.aReceber).replace('R$ ', '')}</span>
          <span className="mq-kpi__foot">total em aberto, de todo o histórico</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Vendas</span>
          <span className="mq-kpi__value">{g.vendas}</span>
          <span className="mq-kpi__foot">
            {g.pecas} {g.pecas === 1 ? 'peça' : 'peças'} · pela data da venda
          </span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Ticket médio</span>
          <span className="mq-kpi__value">
            {g.ticketMedio.valor === null ? '—' : <><i>R$</i>{money(g.ticketMedio.valor).replace('R$ ', '')}</>}
          </span>
          <span className="mq-kpi__foot">{g.ticketMedio.vendasElegiveis} vendas elegíveis</span>
        </div>
      </div>

      <p className="mq-note mq-note--info">
        <Icone nome="alert" />
        <span>
          <b>Três datas, três significados.</b> A data da <b>venda</b> é quando a
          peça saiu, e é ela que conta vendas, peças e clientes. A do{' '}
          <b>pagamento</b> é quando o dinheiro entrou, e é ela que manda no
          faturamento. A do <b>registro</b> é quando alguém lançou no sistema —
          ela não recorta nada, é auditoria. Por isso "entrou" e "vendas" podem
          discordar no mesmo período, e isso não é erro.
        </span>
      </p>

      <div className="mq-grid mq-grid--main">
        <section className="mq-card mq-card--flush">
          <div className="mq-card__head">
            <div>
              <h2 className="mq-title">Entrou por mês</h2>
              <p className="mq-lede">Recortado pela data do pagamento, {descreverRecorte(recorte)}.</p>
            </div>
          </div>
          <div className="mq-card__body">
            {pontos.length === 0 ? (
              <p className="mq-hint">Sem movimento no período.</p>
            ) : (
              <div className="mq-bars">
                {pontos.map((x) => (
                  <div className="mq-bars__row" key={x.chave}>
                    <span className="mq-date">{x.chave}</span>
                    <span className="mq-meter">
                      <i style={{ width: `${Math.round((x.faturamento / maior) * 100)}%` }} />
                    </span>
                    <b className="mq-money">{money(x.faturamento)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="mq-stack">
          <section className="mq-card mq-card--pad">
            <h2 className="mq-subtitle">Mês corrente</h2>
            <dl className="mq-dl">
              <div><dt>Entrou</dt><dd className="mq-money mq-money--ok">{money(p.mesAtual.faturamento)}</dd></div>
              <div><dt>Vendas</dt><dd>{p.mesAtual.vendas}</dd></div>
              <div><dt>Peças</dt><dd>{p.mesAtual.pecas}</dd></div>
              <div>
                <dt>Vence neste mês</dt>
                <dd className="mq-money">{money(p.mesAtual.aReceber)}</dd>
              </div>
            </dl>
            <p className="mq-hint" style={{ marginTop: 10 }}>
              Conta sem prazo não é atribuída a mês nenhum — ela continua no
              total geral e na lista de trabalho.
            </p>
          </section>

          {p.topClientes.length > 0 && (
            <section className="mq-card mq-card--flush">
              <div className="mq-card__head">
                <div><h2 className="mq-subtitle">Quem mais trouxe</h2></div>
              </div>
              <div className="mq-list">
                {p.topClientes.slice(0, 5).map((c) => (
                  <button
                    type="button"
                    className="mq-item"
                    key={c.norm ?? c.nome}
                    onClick={() => aoAbrirCliente(c.norm ? { norm: c.norm } : { id: 0 })}
                  >
                    <span className="mq-item__main">
                      <b>{c.nome}</b>
                      <small>{c.vendas} {c.vendas === 1 ? 'compra' : 'compras'}</small>
                    </span>
                    <span className="mq-item__side">
                      <b className="mq-money">{money(c.faturamento)}</b>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="mq-card mq-card--pad">
            <h2 className="mq-subtitle">Como estes números são feitos</h2>
            <p className="mq-hint">{g.composicao.regraFaturamento}</p>
            <p className="mq-hint" style={{ marginTop: 8 }}>{g.ticketMedio.regra}</p>
          </section>
        </aside>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────── recebimentos */

function Recebimentos({ conexao }: { conexao: Connection }) {
  const [data, setData] = useState(hojeISO());
  const lanc = useApi((s) => buscarLancamentos(conexao, data, s), [conexao, data]);
  const dia = useApi((s) => buscarVendasDoDia(conexao, data, s), [conexao, data]);

  return (
    <>
      <div className="mq-filters">
        <label className="mq-field">
          <span>Dia</span>
          <input className="mq-input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <span className="mq-filters__count">o fechamento de um dia, como ele foi</span>
      </div>

      {lanc.erro ? <section className="mq-card"><ErrorState erro={lanc.erro} aoTentarDeNovo={lanc.recarregar} /></section> : null}

      {lanc.dados && (
        <>
          <div className="mq-kpis">
            <div className="mq-kpi mq-kpi--ok">
              <span className="mq-kpi__label">Entrou no dia</span>
              <span className="mq-kpi__value"><i>R$</i>{money(lanc.dados.recebidoNoDia).replace('R$ ', '')}</span>
              <span className="mq-kpi__foot">pagamentos com esta data efetiva</span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Vendido no dia</span>
              <span className="mq-kpi__value"><i>R$</i>{money(lanc.dados.vendidoNoDia.valor).replace('R$ ', '')}</span>
              <span className="mq-kpi__foot">
                {lanc.dados.vendidoNoDia.vendas} {lanc.dados.vendidoNoDia.vendas === 1 ? 'venda' : 'vendas'}
              </span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Ficou a receber</span>
              <span className="mq-kpi__value"><i>R$</i>{money(lanc.dados.aReceberDoDia.valor).replace('R$ ', '')}</span>
              <span className="mq-kpi__foot">vendas do dia que saíram não pagas</span>
            </div>
          </div>

          <p className="mq-note mq-note--info">
            <Icone nome="alert" />
            <span>{lanc.dados.regra}</span>
          </p>
        </>
      )}

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Linhas do dia</h2>
            <p className="mq-lede">O que saiu, para quem, e se já foi pago.</p>
          </div>
        </div>
        {dia.dados && dia.dados.itens.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="calendar" /></span>
            <h3>Nenhuma venda neste dia</h3>
            <p>Se entrou dinheiro hoje de uma venda antiga, ele aparece em "Entrou no dia" acima.</p>
          </div>
        ) : (
          <div className="mq-list">
            {(dia.dados?.itens ?? []).map((i, n) => (
              <div className="mq-item" key={`${i.venda_id}-${i.sku}-${n}`}>
                <span className={`mq-item__icon ${i.pago ? 'mq-item__icon--ok' : 'mq-item__icon--warn'}`}>
                  <Icone nome={i.pago ? 'money' : 'receipt'} />
                </span>
                <span className="mq-item__main">
                  <b>{i.produto ?? i.sku}</b>
                  <small>
                    {i.cliente ?? 'sem cliente'} · {i.qtd}× · {i.canal ?? 'balcão'}
                  </small>
                </span>
                <span className="mq-item__side">
                  <b className={i.pago ? 'mq-money mq-money--ok' : 'mq-money'}>{money(i.valor)}</b>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ───────────────────────────────────────────────── saiu sem faturar */

function SaiuSemFaturar({
  conexao, painel,
}: {
  conexao: Connection;
  painel: PainelFinanceiro | null;
}) {
  const saidas = useApi((s) => buscarSaidas(conexao, s), [conexao]);

  return (
    <>
      {painel && (
        <p className="mq-note mq-note--info">
          <Icone nome="alert" />
          <span>{painel.saidasSemFaturamento.regra}</span>
        </p>
      )}

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Peças que saíram sem virar venda</h2>
            <p className="mq-lede">
              É este número que explica a diferença entre o que saiu do estoque
              e o que foi faturado — sem ele, a diferença vira suspeita de furo.
            </p>
          </div>
        </div>

        {saidas.erro ? <ErrorState erro={saidas.erro} aoTentarDeNovo={saidas.recarregar} /> : null}

        {saidas.dados && saidas.dados.saidas.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="box" /></span>
            <h3>Nenhuma saída registrada</h3>
            <p>Brinde, uso próprio, perda e sorteio aparecem aqui quando forem lançados.</p>
          </div>
        ) : (
          <div className="mq-list">
            {(saidas.dados?.saidas ?? []).map((s) => (
              <div className="mq-item" key={s.id}>
                <span className="mq-item__icon mq-item__icon--warn"><Icone nome="box" /></span>
                <span className="mq-item__main">
                  <b>{s.produto ?? s.sku}</b>
                  <small>{s.tipo} · {fmtData(s.data)} · {s.motivo ?? 'sem motivo registrado'}</small>
                </span>
                <span className="mq-item__side">
                  <b className="mq-qty">{s.qtd}</b>
                  {s.estornada ? <span className="mq-status">estornada</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ────────────────────────────────────────────────────── conferência */

function Conferencia({ conexao }: { conexao: Connection }) {
  const fin = useApi((s) => conferirFinanceiro(conexao, s), [conexao]);
  const cred = useApi((s) => conferirCredito(conexao, s), [conexao]);

  const checagens = useMemo(() => fin.dados?.checagens ?? [], [fin.dados]);
  const quebradas = checagens.filter((c) => (c.divergentes ?? []).length > 0);

  return (
    <>
      <p className="mq-note mq-note--info">
        <Icone nome="alert" />
        <span>
          O SQLite não aplica invariante agregada, então ela é <b>medida</b>, não
          prometida. Esta tela mostra a medição — e ela mede, não conserta:
          consertar exigiria decidir quem pagou quanto.
        </span>
      </p>

      <div className="mq-kpis">
        <div className={quebradas.length ? 'mq-kpi mq-kpi--risk' : 'mq-kpi mq-kpi--ok'}>
          <span className="mq-kpi__label">Razão do dinheiro</span>
          <span className="mq-kpi__value">{fin.dados ? String(quebradas.length || 'ok') : '—'}</span>
          <span className="mq-kpi__foot">
            {quebradas.length ? 'invariantes divergindo' : `${checagens.length} invariantes conferidas`}
          </span>
        </div>
        <div className={cred.dados && cred.dados.ok === false ? 'mq-kpi mq-kpi--risk' : 'mq-kpi mq-kpi--ok'}>
          <span className="mq-kpi__label">Razão do crédito</span>
          <span className="mq-kpi__value">{cred.dados ? (cred.dados.ok ? 'ok' : 'atenção') : '—'}</span>
          <span className="mq-kpi__foot">saldo por cliente nunca é negativo</span>
        </div>
      </div>

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div><h2 className="mq-title">As invariantes, uma a uma</h2></div>
        </div>
        {fin.erro ? <ErrorState erro={fin.erro} aoTentarDeNovo={fin.recarregar} /> : null}
        <div className="mq-list">
          {checagens.map((c) => {
            const n = (c.divergentes ?? []).length;
            return (
              <div className="mq-item" key={c.id}>
                <span className={`mq-item__icon ${n ? 'mq-item__icon--risk' : 'mq-item__icon--ok'}`}>
                  <Icone nome={n ? 'alert' : 'check'} />
                </span>
                <span className="mq-item__main">
                  <b>{c.invariante}</b>
                  <small>{c.origem} · {c.id}</small>
                </span>
                <span className="mq-item__side">
                  <span className={n ? 'mq-status mq-status--risk' : 'mq-status mq-status--ok'}>
                    {n ? `${n} divergente${n > 1 ? 's' : ''}` : 'em dia'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
