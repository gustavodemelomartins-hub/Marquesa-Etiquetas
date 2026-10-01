import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, hojeISO, moneyNumero, plural, qtdTexto } from '../../domain/formato';
import { intervaloDoRecorte } from '../../domain/periodo';
import { listarSaidas } from '../saidas/api';
import { TabelaDeSaidas } from '../saidas/TabelaDeSaidas';
import { ValorDaSaida } from '../saidas/ValorDaSaida';
import { TIPOS_DE_SAIDA, type SaidaSemFaturamento } from '../saidas/tipos';
import { FiltroPeriodo } from '../../components/FiltroPeriodo';
import { AReceber } from './AReceber';
import {
  buscarAReceber, buscarLancamentos, buscarPainel,
  buscarVendasDoDia, conferirCredito, conferirFinanceiro,
} from './api';
import { descreverRecorte, recorteDaSub, subDoRecorte } from './periodo';
import type { Connection } from '../../services/client';
import type { ContaAReceber, PainelFinanceiro, Recorte } from './tipos';

type Aba = 'resumo' | 'a-receber' | 'recebimentos' | 'saidas';

/* "A receber" é a porta: é o que se abre o Financeiro para FAZER (cobrar,
   registrar um pagamento). A "Conferência" das contas do sistema saiu
   daqui em 27/09/2026 e foi para Configurações › Avançado — é verificação
   técnica, não tarefa do dia. `#/financeiro/conferencia` cai em A receber. */
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'a-receber', rotulo: 'A receber' },
  { id: 'recebimentos', rotulo: 'Recebido' },
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'saidas', rotulo: 'Saiu sem faturar' },
];

interface Props {
  conexao: Connection;
  /** O endereço da tela: a aba, ou a aba e o recorte. */
  sub: string | null;
  aoNavegar: (sub: string) => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
  /** Custo digitado aqui muda o cadastro da peça: o estado compartilhado
   *  (ficha, lista de Peças) precisa reler. */
  aoMudarEstado?: () => void;
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
export function FinanceiroArea({ conexao, sub, aoNavegar, aoAbrirCliente, aoMudarEstado }: Props) {
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
          <p className="mq-lede">Quanto falta receber e quanto já entrou.</p>
        </div>
        {aba !== 'recebimentos' && <div className="mq-pagehead__meta">{descreverRecorte(recorte)}</div>}
      </div>

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

      {/* O período não vale para "Recebido", que é lido dia a dia. */}
      {aba !== 'recebimentos' && <FiltroPeriodo recorte={recorte} aoMudar={trocarRecorte} />}

      {aba === 'resumo' && (
        <Resumo estado={painel} aoAbrirCliente={aoAbrirCliente} />
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
          /* "Recebido" é o único número desta aba que não sai de
             `contas-receber`: aquela rota só sabe o que FALTA. */
          painel={painel.dados}
          recorte={recorte}
        />
      )}
      {aba === 'recebimentos' && <Recebimentos conexao={conexao} />}
      {aba === 'saidas' && (
        <SaiuSemFaturar conexao={conexao} recorte={recorte} aoMudarEstado={aoMudarEstado} />
      )}
    </>
  );
}

function lerSub(sub: string | null): [Aba, Recorte] {
  const [abaCrua, recorteCru] = String(sub ?? '').split('~');
  const aba = ABAS.find((a) => a.id === abaCrua)?.id ?? 'a-receber';
  return [aba, recorteDaSub(recorteCru ?? null)];
}

const chaveDoRecorte = (r: Recorte) => `${r.periodo}|${r.de ?? ''}|${r.ate ?? ''}`;

/* ──────────────────────────────────────────────────────────────── resumo */

function Resumo({
  estado, aoAbrirCliente,
}: {
  estado: { dados: PainelFinanceiro | null; erro: unknown; recarregar: () => void };
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
          <span className="mq-kpi__value"><i>R$</i>{moneyNumero(g.faturamento)}</span>
          <span className="mq-kpi__foot">recebido no período</span>
        </div>
        <div className={g.aReceber > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Falta receber</span>
          <span className="mq-kpi__value"><i>R$</i>{moneyNumero(g.aReceber)}</span>
          <span className="mq-kpi__foot">de todas as vendas</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Vendas</span>
          <span className="mq-kpi__value">{g.vendas}</span>
          <span className="mq-kpi__foot">
            {g.pecas} {g.pecas === 1 ? 'peça' : 'peças'}
          </span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Ticket médio</span>
          <span className="mq-kpi__value">
            {g.ticketMedio.valor === null ? '—' : <><i>R$</i>{moneyNumero(g.ticketMedio.valor)}</>}
          </span>
          <span className="mq-kpi__foot">por venda paga</span>
        </div>
      </div>

      {/* "Entrou" é cortado pela data do PAGAMENTO; vendas e peças, pela data
          da VENDA. Os dois podem discordar no mesmo período e isso não é erro
          (REGRAS §30). Até 01/10/2026 isso era um parágrafo na tela; a
          usuária precisa do número, a explicação mora aqui e em REGRAS. */}
      <div className="mq-grid mq-grid--main">
        <section className="mq-card mq-card--flush">
          <div className="mq-card__head">
            <div>
              <h2 className="mq-title">Entrou por mês</h2>
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
      </div>

      {lanc.erro ? <section className="mq-card"><ErrorState erro={lanc.erro} aoTentarDeNovo={lanc.recarregar} /></section> : null}

      {lanc.dados && (
        <>
          <div className="mq-kpis">
            <div className="mq-kpi mq-kpi--ok">
              <span className="mq-kpi__label">Entrou no dia</span>
              <span className="mq-kpi__value"><i>R$</i>{moneyNumero(lanc.dados.recebidoNoDia)}</span>
              <span className="mq-kpi__foot">pagamentos recebidos neste dia</span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Vendido no dia</span>
              <span className="mq-kpi__value"><i>R$</i>{moneyNumero(lanc.dados.vendidoNoDia.valor)}</span>
              <span className="mq-kpi__foot">
                {lanc.dados.vendidoNoDia.vendas} {lanc.dados.vendidoNoDia.vendas === 1 ? 'venda' : 'vendas'}
              </span>
            </div>
            <div className="mq-kpi">
              <span className="mq-kpi__label">Ficou a receber</span>
              <span className="mq-kpi__value"><i>R$</i>{moneyNumero(lanc.dados.aReceberDoDia.valor)}</span>
              <span className="mq-kpi__foot">vendas do dia ainda não pagas</span>
            </div>
          </div>
        </>
      )}

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Peças vendidas no dia</h2>
          </div>
        </div>
        {dia.dados && dia.dados.itens.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="calendar" /></span>
            <h3>Nenhuma venda neste dia</h3>
            <p>Pagamento de venda antiga recebido neste dia entra em "Entrou no dia".</p>
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

/** As perguntas desta aba, na ordem em que a tela responde: quantas peças
 *  saíram sem faturar no período, quanto isso seria de venda, quanto custou,
 *  quanto ainda está sem valor, por qual motivo, e quais foram as peças.
 *
 *  Nada daqui entra no faturamento — é a outra metade da conta. Os valores
 *  são os GRAVADOS em cada saída (§46, 29/09/2026); o que não tem valor é
 *  contado à parte e dito, nunca somado como zero. */
function SaiuSemFaturar({
  conexao, recorte, aoMudarEstado,
}: {
  conexao: Connection;
  recorte: Recorte;
  aoMudarEstado?: () => void;
}) {
  const { de, ate } = intervaloDoRecorte(recorte);
  const saidas = useApi(
    (s) => listarSaidas(conexao, { limite: 1000, de, ate }, s),
    [conexao, de, ate],
  );
  const [completando, setCompletando] = useState<SaidaSemFaturamento | null>(null);
  const valor = saidas.dados?.resumo.valor;
  const pecas = saidas.dados?.resumo.total ?? 0;
  const lista = saidas.dados?.saidas ?? [];

  const porMotivo = useMemo(() => {
    const m = new Map<string, { rotulo: string; pecas: number; venda: number; custo: number; semValor: number; semCusto: number }>();
    for (const t of TIPOS_DE_SAIDA) m.set(t.id, { rotulo: t.rotuloLongo, pecas: 0, venda: 0, custo: 0, semValor: 0, semCusto: 0 });
    for (const s of lista) {
      if (s.estornada) continue;
      const g = m.get(s.tipo);
      if (!g) continue;
      const n = s.sentido === 'entrada' ? -s.qtd : s.qtd;
      g.pecas += n;
      if (s.precoUnit == null) g.semValor += n; else g.venda += s.precoUnit * n;
      if (s.custoUnit == null) g.semCusto += n; else g.custo += s.custoUnit * n;
    }
    return [...m.values()].filter((g) => g.pecas !== 0);
  }, [lista]);

  const pecasSemValor = valor?.pecasSemPreco ?? 0;
  const pecasSemCusto = valor?.pecasSemCusto ?? 0;

  return (
    <>
      {saidas.erro ? <ErrorState erro={saidas.erro} aoTentarDeNovo={saidas.recarregar} /> : null}

      <div className="mq-kpis">
        <div className="mq-kpi">
          <span className="mq-kpi__label">Peças que saíram</span>
          <span className="mq-kpi__value">{qtdTexto(pecas)}</span>
          <span className="mq-kpi__foot">brinde, uso próprio, perda e sorteio</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Deixou de vender</span>
          <span className="mq-kpi__value"><i>R$</i>{moneyNumero(valor?.venda ?? 0)}</span>
          <span className="mq-kpi__foot">
            {pecasSemValor
              ? `${qtdTexto(pecasSemValor)} ${plural(pecasSemValor, 'peça', 'peças')} sem valor — total incompleto`
              : 'pelo preço de venda'}
          </span>
        </div>
        <div className="mq-kpi mq-kpi--risk">
          <span className="mq-kpi__label">Perdido (a preço de custo)</span>
          {valor && pecas > 0 && pecasSemCusto === pecas ? (
            <span className="mq-kpi__value mq-kpi__value--vazio">custo não informado</span>
          ) : (
            <span className="mq-kpi__value"><i>R$</i>{moneyNumero(valor?.custo ?? 0)}</span>
          )}
          <span className="mq-kpi__foot">
            {pecasSemCusto
              ? `${qtdTexto(pecasSemCusto)} de ${qtdTexto(pecas)} ${plural(pecas, 'peça', 'peças')} sem custo`
              : 'o que foi pago nas peças'}
          </span>
        </div>
        <div className={pecasSemCusto + pecasSemValor > 0 ? 'mq-kpi mq-kpi--accent' : 'mq-kpi mq-kpi--ok'}>
          <span className="mq-kpi__label">Falta completar</span>
          <span className="mq-kpi__value">
            {qtdTexto(lista.filter((s) => !s.estornada && (s.precoUnit == null || s.custoUnit == null)).length)}
          </span>
          <span className="mq-kpi__foot">lançamentos sem valor ou sem custo</span>
        </div>
      </div>

      {porMotivo.length > 0 && (
        <section className="mq-card mq-card--flush" aria-labelledby="saidas-por-motivo">
          <div className="mq-card__head">
            <div>
              <h2 className="mq-title" id="saidas-por-motivo">Por motivo</h2>
            </div>
          </div>
          <ul className="saidas-motivos">
            <li className="saidas-motivos__head" aria-hidden="true">
              <span>Motivo</span><span>Peças</span><span>Deixou de vender</span><span>A custo</span>
            </li>
            {porMotivo.map((g) => (
              <li key={g.rotulo}>
                <span><b>{g.rotulo}</b></span>
                <span>{qtdTexto(g.pecas)} {plural(g.pecas, 'peça', 'peças')}</span>
                <span className="mq-money">
                  {money(g.venda)}{g.semValor ? <small> · {qtdTexto(g.semValor)} sem valor</small> : null}
                </span>
                <span className="mq-money">
                  {g.semCusto === g.pecas ? <small>custo não informado</small> : money(g.custo)}
                  {g.semCusto && g.semCusto !== g.pecas ? <small> · {qtdTexto(g.semCusto)} sem custo</small> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Peças que saíram sem virar venda</h2>
            <p className="mq-lede">Sem valor ou sem custo? Toque em “Informar valor”.</p>
          </div>
        </div>

        {saidas.dados && lista.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="box" /></span>
            <h3>Nenhuma saída neste período</h3>
            <p>Lance em Vendas › Saída sem faturamento.</p>
          </div>
        ) : (
          <TabelaDeSaidas saidas={lista} aoCompletar={setCompletando} />
        )}
      </section>

      {completando && (
        <ValorDaSaida
          conexao={conexao}
          saida={completando}
          aoFechar={() => setCompletando(null)}
          aoSalvar={() => { setCompletando(null); saidas.recarregar(); aoMudarEstado?.(); }}
        />
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────── conferência */

/** A conferência das contas do sistema. Mora em Configurações › Avançado. */
export function Conferencia({ conexao }: { conexao: Connection }) {
  const fin = useApi((s) => conferirFinanceiro(conexao, s), [conexao]);
  const cred = useApi((s) => conferirCredito(conexao, s), [conexao]);

  const checagens = useMemo(() => fin.dados?.checagens ?? [], [fin.dados]);
  const quebradas = checagens.filter((c) => (c.divergentes ?? []).length > 0);

  return (
    <>
      <p className="mq-note mq-note--info">
        <Icone nome="alert" />
        <span>
          Só confere, não corrige nada. Se aparecer diferença, não lance nada
          por cima: avise quem cuida do sistema.
        </span>
      </p>

      <div className="mq-kpis">
        <div className={quebradas.length ? 'mq-kpi mq-kpi--risk' : 'mq-kpi mq-kpi--ok'}>
          <span className="mq-kpi__label">Razão do dinheiro</span>
          <span className="mq-kpi__value">{fin.dados ? String(quebradas.length || 'ok') : '—'}</span>
          <span className="mq-kpi__foot">
            {quebradas.length ? 'conferências com diferença' : `${checagens.length} conferências em dia`}
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
          <div><h2 className="mq-title">Cada conferência</h2></div>
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
