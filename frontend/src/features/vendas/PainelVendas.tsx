import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { FiltroPeriodo } from '../../components/FiltroPeriodo';
import { money, fmtData, plural } from '../../domain/formato';
import {
  buscarPainelAnalytics, buscarProdutos, buscarResumoDoMes,
  type PainelAnalytics, type PontoDaEvolucao, type Recorte,
} from '../../domain/analytics';
import { descreverRecorte } from '../../domain/periodo';
import { escalaDeVendas, rotuloDaBarra, rotuloDaEscala } from './graficoVendas';
import type { Connection } from '../../services/client';

/** O que o backend NÃO calcula, e por isso a tela não mostra.
 *
 *  §19 — `painel()` recusa comparar com o período anterior ("+18% vs. o mês
 *  passado") porque a comparação não está implementada, e um percentual
 *  inventado é pior do que um cartão a menos. O protótipo desenha uma seta
 *  de tendência ao lado do faturamento do mês; aqui ela não aparece, e o
 *  lugar dela diz por quê. Isto NÃO é um buraco a preencher no frontend:
 *  preencher exigiria somar o período anterior, que é conta do servidor.
 */
const SEM_TENDENCIA = 'sem comparação com o período anterior';

interface Props {
  conexao: Connection;
  /** Abrir o histórico completo, os reparos, a ficha de uma cliente. */
  aoIrPara: (destino: 'historico' | 'lancamentos') => void;
  aoAbrirReparos: () => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
  aoAbrirAReceber: () => void;
}

type Visao = 'detalhe' | 'mes';

/** PAINEL DE VENDAS — quanto entrou no período, quanto falta receber, e o
 *  que sustenta o resultado.
 *
 *  Uma requisição (`/api/analytics/painel`) traz TODOS os blocos do MESMO
 *  recorte. É de propósito: pedir cada bloco por conta própria faria o
 *  cartão de cima e a tabela de baixo responderem sobre janelas diferentes,
 *  e o cabeçalho diria "1 a 15 de agosto" enquanto o gráfico somava o ano.
 *
 *  NENHUM indicador desta tela é calculado aqui. Quando o servidor devolve
 *  `null`, a tela escreve "—" e explica; ela nunca transforma ausência em
 *  zero, porque zero é uma afirmação sobre o negócio e ausência não é.
 */
export function PainelVendas({
  conexao, aoIrPara, aoAbrirReparos, aoAbrirCliente, aoAbrirAReceber,
}: Props) {
  /* O protótipo abre o Painel de Vendas em 12 MESES, e não nos 30 dias do
     Financeiro: a pergunta aqui é "como o ano está indo", e um recorte de um
     mês faz o gráfico de evolução nascer com uma barra só. */
  const [recorte, setRecorte] = useState<Recorte>({ periodo: '12m', de: null, ate: null });
  const [visao, setVisao] = useState<Visao>('detalhe');
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [listaCompleta, setListaCompleta] = useState(false);

  const painel = useApi(
    (s) => buscarPainelAnalytics(conexao, recorte, s),
    [conexao, recorte.periodo, recorte.de, recorte.ate],
  );

  /* O ranking do agregado vem com 5 linhas, por QUANTIDADE — é o que o
     cartão-resumo precisa. "Ver lista completa" é outra pergunta, e por
     isso é outra requisição, disparada por quem clicou e não pelo render. */
  const ranking = useApi(
    (s) => (listaCompleta
      ? buscarProdutos(conexao, recorte, { por: 'faturamento', limite: 20 }, s)
      : Promise.resolve(null)),
    [conexao, recorte.periodo, recorte.de, recorte.ate, listaCompleta],
  );

  const d = painel.dados;
  const pontos = d?.evolucao.pontos ?? [];
  /* O mês selecionado é o da barra clicada; sem clique, o último do gráfico.
     Uma seleção que não existe mais depois de trocar o período volta para o
     último ponto em vez de pedir um mês fora do recorte. */
  const mes = mesEscolhido && pontos.some((p) => p.chave === mesEscolhido)
    ? mesEscolhido
    : (pontos.length ? String(pontos[pontos.length - 1]?.chave) : null);

  const resumoMes = useApi(
    (s) => (visao === 'mes' && mes && /^\d{4}-\d{2}$/.test(mes)
      ? buscarResumoDoMes(conexao, mes, s)
      : Promise.resolve(null)),
    [conexao, visao, mes],
  );

  if (painel.erro) {
    return (
      <>
        <Cabeca recorte={recorte} aoMudar={setRecorte} aoIrPara={aoIrPara} />
        <ErrorState erro={painel.erro} aoTentarDeNovo={painel.recarregar} />
      </>
    );
  }

  return (
    <>
      <Cabeca recorte={recorte} aoMudar={setRecorte} aoIrPara={aoIrPara} />

      {!d ? <LoadingState /> : (
        <>
          <CartoesDeTopo d={d} aoAbrirAReceber={aoAbrirAReceber} />

          {d.pecasEmReparo.total > 0 && (
            <button type="button" className="mq-note mq-note--warn mq-note--acionavel" onClick={aoAbrirReparos}>
              <Icone nome="repair" />
              <span>
                <b>Reparos</b>{' '}
                {d.pecasEmReparo.total} {plural(d.pecasEmReparo.total, 'ativo', 'ativos')}
                {d.pecasEmReparo.atrasadas > 0
                  ? `, ${d.pecasEmReparo.atrasadas} ${plural(d.pecasEmReparo.atrasadas, 'atrasada', 'atrasadas')}`
                  : ''}
              </span>
              <Icone nome="chevron" />
            </button>
          )}

          <GraficoDeEvolucao
            pontos={pontos}
            selecionado={mes}
            aoSelecionar={(chave) => { setMesEscolhido(chave); setVisao('mes'); }}
            recorte={recorte}
          />

          <section className="mq-card mq-sales-details">
            <div className="mq-card__head">
              <div>
                <h2 className="mq-title">Informações do período</h2>
                <p className="mq-lede">
                  <span className="mq-chip mq-chip--soft">{descreverRecorte(recorte)}</span>{' '}
                  {visao === 'mes' && mes ? `seleção ativa: ${mes}` : 'todos os blocos do mesmo recorte'}
                </p>
              </div>
              <div className="mq-tabs mq-tabs--pill" role="group" aria-label="Visão do período">
                <button type="button" aria-selected={visao === 'detalhe'} onClick={() => setVisao('detalhe')}>
                  Análise detalhada
                </button>
                <button type="button" aria-selected={visao === 'mes'} onClick={() => setVisao('mes')}>
                  Evolução por mês
                </button>
              </div>
            </div>

            <div className="mq-card__body">
              {visao === 'detalhe' ? (
                <AnaliseDetalhada
                  d={d}
                  completa={listaCompleta}
                  produtosCompletos={ranking.dados?.produtos ?? null}
                  carregandoCompleta={listaCompleta && ranking.carregando}
                  aoAlternarLista={() => setListaCompleta((v) => !v)}
                />
              ) : (
                <EvolucaoPorMes
                  mes={mes}
                  resumo={resumoMes.dados}
                  carregando={resumoMes.carregando}
                  erro={resumoMes.erro}
                  aoAbrirCliente={aoAbrirCliente}
                />
              )}
            </div>
          </section>

          <TopClientes clientes={d.topClientes} aoAbrirCliente={aoAbrirCliente} />
          <SaidasDoMes d={d} />
        </>
      )}
    </>
  );
}

/* ═════════════════════════════════════════════════════════════ cabeçalho */

function Cabeca({
  recorte, aoMudar, aoIrPara,
}: {
  recorte: Recorte;
  aoMudar: (r: Recorte) => void;
  aoIrPara: (d: 'historico' | 'lancamentos') => void;
}) {
  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Operação comercial</p>
          <h1 className="mq-display">Painel de vendas</h1>
          <p className="mq-lede">
            Quanto entrou no período, quanto ainda falta receber e o que sustenta
            o resultado.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={() => aoIrPara('historico')}>
            Histórico
          </button>
          <button type="button" className="mq-btn mq-btn--primary" onClick={() => aoIrPara('lancamentos')}>
            <Icone nome="plus" />
            Novo lançamento
          </button>
        </div>
      </div>
      <FiltroPeriodo recorte={recorte} aoMudar={aoMudar} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════ cartões de topo */

function CartoesDeTopo({ d, aoAbrirAReceber }: { d: PainelAnalytics; aoAbrirAReceber: () => void }) {
  const g = d.geral;
  return (
    <div className="mq-kpis">
      <div className="mq-kpi mq-kpi--accent">
        <span className="mq-kpi__label">Faturamento recebido no período</span>
        <span className="mq-kpi__value">{money(g.faturamento)}</span>
        <span className="mq-kpi__foot">
          pela data efetiva dos recebimentos · {SEM_TENDENCIA}
        </span>
      </div>

      <div className="mq-kpi">
        <span className="mq-kpi__label">Neste mês</span>
        <span className="mq-kpi__value">{money(d.mesAtual.faturamento)}</span>
        <span className="mq-kpi__foot">
          {d.mesAtual.vendas} {plural(d.mesAtual.vendas, 'venda', 'vendas')} ·{' '}
          {d.mesAtual.pecas} {plural(d.mesAtual.pecas, 'peça', 'peças')} em {d.mesAtual.mes}
        </span>
      </div>

      <button type="button" className="mq-kpi mq-kpi--risk mq-kpi--acionavel" onClick={aoAbrirAReceber}>
        <span className="mq-kpi__label">A receber em {d.mesAtual.mes}</span>
        <span className="mq-kpi__value">{money(d.mesAtual.aReceber)}</span>
        <span className="mq-kpi__foot">
          {d.mesAtual.contasAReceber}{' '}
          {plural(d.mesAtual.contasAReceber, 'conta com vencimento no mês', 'contas com vencimento no mês')}
          {' · '}ver recebimentos
        </span>
      </button>

      <div className="mq-kpi">
        <span className="mq-kpi__label">Ticket médio</span>
        <span className="mq-kpi__value">
          {g.ticketMedio.valor === null ? '—' : money(g.ticketMedio.valor)}
        </span>
        <span className="mq-kpi__foot">
          {g.ticketMedio.valor === null
            ? 'nenhuma venda elegível no recorte — o servidor recusa dividir por zero'
            : `${g.ticketMedio.vendasElegiveis} ${plural(g.ticketMedio.vendasElegiveis, 'venda elegível', 'vendas elegíveis')}`}
        </span>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ o gráfico */

function GraficoDeEvolucao({
  pontos, selecionado, aoSelecionar, recorte,
}: {
  pontos: PontoDaEvolucao[];
  selecionado: string | null;
  aoSelecionar: (chave: string) => void;
  recorte: Recorte;
}) {
  const escala = useMemo(
    () => escalaDeVendas(pontos.map((p) => p.faturamento)),
    [pontos],
  );

  return (
    <section className="mq-card">
      <div className="mq-card__head">
        <div>
          <h2 className="mq-title">Desempenho de vendas</h2>
          <p className="mq-lede">{descreverRecorte(recorte)} · faturamento pela data do pagamento</p>
        </div>
        <div className="mq-legend"><span><i />Faturamento</span></div>
      </div>
      <div className="mq-card__body">
        {pontos.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="sale" /></span>
            <h3>Nada neste recorte</h3>
            <p>Nenhuma venda com pagamento registrado no período escolhido.</p>
          </div>
        ) : (
          <div className="mq-chart" role="group" aria-label="Faturamento por mês">
            <div className="mq-chart__scroll">
              <div className="mq-chart__plot">
                <div className="mq-chart__grid" aria-hidden="true">
                  {escala.marcas.map((marca) => (
                    <i key={marca} style={{ top: `${((escala.teto - marca) / (escala.teto - escala.piso)) * 100}%` }} />
                  ))}
                </div>
                <div className="mq-chart__columns">
                  {pontos.map((p) => {
                    const barra = escala.barra(p.faturamento);
                    const valor = barra ? money(p.faturamento) : 'valor indisponível';
                    return (
                      <button
                        key={p.chave}
                        type="button"
                        className={p.chave === selecionado ? 'mq-chart__col is-peak' : 'mq-chart__col'}
                        aria-pressed={p.chave === selecionado}
                        aria-label={`${p.chave}: ${valor} · ${p.vendas} ${plural(p.vendas, 'venda', 'vendas')}`}
                        onClick={() => aoSelecionar(p.chave)}
                        title={`${p.chave}: ${valor} · ${p.vendas} ${plural(p.vendas, 'venda', 'vendas')}`}
                      >
                        <span className="mq-chart__track" aria-hidden="true">
                          {barra && <i className={barra.negativa ? 'mq-chart__bar is-negative' : 'mq-chart__bar'} style={{ top: `${barra.topo}%`, height: `${barra.altura}%` }} />}
                        </span>
                        <span className="mq-chart__key">{rotuloDaBarra(p.chave)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mq-chart__axis" aria-hidden="true">
              {escala.marcas.map((marca) => (
                <span key={marca} style={{ top: `${((escala.teto - marca) / (escala.teto - escala.piso)) * 100}%` }}>{rotuloDaEscala(marca)}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════ análise detalhada */

function AnaliseDetalhada({
  d, completa, produtosCompletos, carregandoCompleta, aoAlternarLista,
}: {
  d: PainelAnalytics;
  completa: boolean;
  produtosCompletos: PainelAnalytics['produtos']['produtos'] | null;
  carregandoCompleta: boolean;
  aoAlternarLista: () => void;
}) {
  const produtos = completa && produtosCompletos ? produtosCompletos : d.produtos.produtos;
  const cats = d.categorias.categorias;
  const tetoCat = Math.max(1, ...cats.map((c) => c.pecas));

  return (
    <div className="mq-grid mq-grid--main">
      <div>
        <div className="mq-spread">
          <h3 className="mq-subtitle">Produtos mais vendidos</h3>
          <button
            type="button"
            className="mq-btn mq-btn--link mq-btn--sm"
            aria-expanded={completa}
            onClick={aoAlternarLista}
          >
            {completa ? 'Ver só o resumo' : 'Ver lista completa'}
          </button>
        </div>

        {carregandoCompleta ? <LoadingState /> : produtos.length === 0 ? (
          <p className="mq-hint">Nenhuma peça vendida no recorte.</p>
        ) : (
          <div className="mq-scroll-x" tabIndex={0} aria-label="Tabela de produtos, deslize para ver as colunas">
            <div className="mq-table mq-table--scroll" role="table" aria-label="Produtos mais vendidos">
              <div className="mq-tr mq-tr--head" role="row" style={COL_PRODUTO}>
                <span>#</span><span>Produto</span><span>Categoria</span>
                <span>Peças</span><span>Valor vendido</span><span>Participação</span>
              </div>
              {produtos.map((p, i) => (
                <div className="mq-tr" role="row" key={p.sku} style={COL_PRODUTO}>
                  <span className="mq-cell mq-cell--center"><b>{i + 1}</b></span>
                  <span className="mq-cell">
                    <b>{p.nomeAtual ?? p.nomeHistorico ?? p.sku}</b>
                    <small className="mq-sku">
                      SKU {p.sku}
                      {p.renomeado ? ` · antes: ${p.nomeHistorico}` : ''}
                      {!p.noCatalogo ? ' · fora do catálogo' : ''}
                    </small>
                  </span>
                  <span className="mq-cell">
                    <span className="mq-chip mq-chip--soft">{p.categoria ?? 'sem categoria'}</span>
                  </span>
                  <span className="mq-cell mq-cell--num" data-label="Peças"><b>{p.pecas}</b></span>
                  <span className="mq-cell mq-cell--num" data-label="Valor vendido"><b className="mq-money">{money(p.faturamento)}</b></span>
                  <span className="mq-cell mq-cell--num" data-label="Participação"><b>{p.participacao}%</b></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="mq-stack">
        <section>
          <h3 className="mq-subtitle">Categorias mais vendidas</h3>
          {cats.length === 0 ? <p className="mq-hint">Nada no recorte.</p> : (
            <div className="mq-bars">
              {cats.slice(0, 6).map((c) => (
                <div className="mq-bars__row" key={c.categoria}>
                  <span>{c.categoria}</span>
                  <i className="mq-meter"><i style={{ width: `${(c.pecas / tetoCat) * 100}%` }} /></i>
                  <b>{c.pecas} <small>{plural(c.pecas, 'peça', 'peças')}</small></b>
                </div>
              ))}
            </div>
          )}
          <p className="mq-hint">Participação por PEÇAS — é o que a barra desenha.</p>
        </section>

        <section>
          <h3 className="mq-subtitle">Origem das vendas</h3>
          {d.origem.canais.length === 0 ? <p className="mq-hint">Nada no recorte.</p> : (
            <dl className="mq-dl">
              {d.origem.canais.slice(0, 6).map((c) => (
                <div key={c.canal}>
                  <dt>{c.canal}</dt>
                  <dd>{c.participacao}% · {money(c.faturamento)}</dd>
                </div>
              ))}
            </dl>
          )}
          {d.origem.origens.some((o) => o.indeterminado) && (
            <p className="mq-hint">
              Parte do faturamento ainda não tem origem classificada. O servidor
              a conta e a nomeia em vez de deixar a fatia sumir.
            </p>
          )}
        </section>
      </aside>

      <section className="mq-sales-composition">
          <h3 className="mq-subtitle">Composição</h3>
          <dl className="mq-figures">
            <div>
              <dt>Vendas</dt>
              <dd>{d.geral.vendas}</dd>
              <small>{d.geral.composicao.vendasSistema} no sistema · {d.geral.composicao.vendasHistoricas} da planilha</small>
            </div>
            <div>
              <dt>Peças</dt>
              <dd>{d.geral.pecas}</dd>
            </div>
            <div>
              <dt>Clientes</dt>
              <dd>{d.geral.clientes}</dd>
              <small>
                {d.geral.clientesNovos === null ? 'novas: indisponível' : `${d.geral.clientesNovos} novas`}
              </small>
            </div>
            <div className="is-risk">
              <dt>A receber</dt>
              <dd>{money(d.geral.aReceber)}</dd>
              <small>vendido no recorte e ainda não recebido</small>
            </div>
          </dl>
          <p className="mq-hint">{d.geral.composicao.regraFaturamento}</p>
      </section>
    </div>
  );
}

const COL_PRODUTO = {
  gridTemplateColumns: '32px minmax(0,2fr) minmax(0,1fr) 64px minmax(0,1fr) 92px',
};

/* ════════════════════════════════════════════════════════ evolução por mês */

function EvolucaoPorMes({
  mes, resumo, carregando, erro, aoAbrirCliente,
}: {
  mes: string | null;
  resumo: import('../../domain/analytics').ResumoDoMes | null;
  carregando: boolean;
  erro: unknown;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}) {
  if (!mes) return <p className="mq-hint">Escolha uma barra do gráfico para ver o mês.</p>;
  if (carregando) return <LoadingState />;
  if (erro) return <ErrorState erro={erro} />;
  if (!resumo || resumo.ok === false) {
    return <p className="mq-note mq-note--warn"><span>{resumo?.erro ?? 'Mês indisponível.'}</span></p>;
  }

  const tetoCat = Math.max(1, ...resumo.categorias.map((c) => c.pecas));

  return (
    <div className="mq-stack">
      <dl className="mq-figures">
        <div className="is-brand">
          <dt>Faturamento</dt>
          <dd>{money(resumo.cards.faturamento.valor)}</dd>
          <small>{resumo.cards.faturamento.regra}</small>
        </div>
        <div>
          <dt>Vendas</dt>
          <dd>{resumo.cards.vendas.total}</dd>
          <small>{resumo.cards.vendas.regra}</small>
        </div>
        <div>
          <dt>Peças vendidas</dt>
          <dd>{resumo.cards.pecas.total}</dd>
          <small>{resumo.cards.pecas.regra}</small>
        </div>
        <div>
          <dt>Clientes atendidas</dt>
          <dd>{resumo.cards.clientesAtendidos.total}</dd>
          <small>{resumo.cards.clientesAtendidos.regra}</small>
        </div>
      </dl>

      <div className="mq-grid mq-grid--2">
        <section>
          <h3 className="mq-subtitle">Categorias mais vendidas em {resumo.rotulo}</h3>
          {resumo.categorias.length === 0 ? <p className="mq-hint">Nenhuma peça no mês.</p> : (
            <div className="mq-bars">
              {resumo.categorias.slice(0, 8).map((c) => (
                <div className="mq-bars__row" key={c.categoria}>
                  <span>{c.categoria}</span>
                  <i className="mq-meter"><i style={{ width: `${(c.pecas / tetoCat) * 100}%` }} /></i>
                  <b>{c.pecas}</b>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mq-subtitle">O que este mês tem e a lista não mostra</h3>
          <dl className="mq-dl">
            <div>
              <dt>Faturamento de outros meses</dt>
              <dd>{money(resumo.faturamentoDeOutrosMeses.valor)}</dd>
            </div>
            <div>
              <dt>Compras que ele representa</dt>
              <dd>{resumo.faturamentoDeOutrosMeses.vendas}</dd>
            </div>
          </dl>
          <p className="mq-hint">{resumo.faturamentoDeOutrosMeses.regra}</p>
        </section>
      </div>

      <section>
        <h3 className="mq-subtitle">Vendas de {resumo.rotulo}</h3>
        {resumo.vendas.length === 0 ? <p className="mq-hint">Nenhuma venda registrada no mês.</p> : (
          <div className="mq-scroll-x" tabIndex={0} aria-label="Tabela de vendas, deslize para ver as colunas">
            <div className="mq-table mq-table--scroll" role="table" aria-label={`Vendas de ${resumo.rotulo}`}>
              <div className="mq-tr mq-tr--head" role="row" style={COL_MES}>
                <span>Data</span><span>Cliente</span><span>Peças</span>
                <span>Valor</span><span>Recebimento</span>
              </div>
              {resumo.vendas.map((v) => (
                <div className="mq-tr" role="row" key={v.chave} style={COL_MES}>
                  <span className="mq-cell"><b className="mq-date">{fmtData(v.data)}</b>
                    <small>{v.canal ?? v.fonte}</small>
                  </span>
                  <span className="mq-cell">
                    <button
                      type="button"
                      className="mq-btn mq-btn--link"
                      onClick={() => aoAbrirCliente(
                        v.clienteId ? { id: v.clienteId } : { norm: v.norm ?? '' },
                      )}
                    >
                      {v.cliente}
                    </button>
                  </span>
                  <span className="mq-cell mq-cell--num" data-label="Peças"><b>{v.pecas}</b></span>
                  <span className="mq-cell mq-cell--num" data-label="Valor"><b className="mq-money">{money(v.valor)}</b></span>
                  <span className="mq-cell">
                    {v.aindaNaoPaga ? (
                      <><span className="mq-status mq-status--risk">a receber</span>
                        <small>{money(v.aReceber)}</small></>
                    ) : v.faturaEmOutroMes ? (
                      <><span className="mq-status mq-status--info">pago em outro mês</span>
                        <small>{fmtData(v.dataFaturamento)}</small></>
                    ) : (
                      <span className="mq-status mq-status--ok">pago</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mq-hint">{resumo.regra}</p>
      </section>
    </div>
  );
}

const COL_MES = {
  gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr) 64px minmax(0,1fr) minmax(0,1fr)',
};

/* ═══════════════════════════════════════════════════════════ top clientes */

function TopClientes({
  clientes, aoAbrirCliente,
}: {
  clientes: PainelAnalytics['topClientes'];
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}) {
  if (!clientes.length) return null;
  return (
    <section className="mq-card mq-card--flush">
      <div className="mq-card__head">
        <div>
          <h2 className="mq-title">Clientes do período</h2>
          <p className="mq-lede">Ordenadas por faturamento, no mesmo recorte dos cartões.</p>
        </div>
      </div>
      <div className="mq-list">
        {clientes.map((c) => (
          <button
            type="button"
            className="mq-item"
            key={c.norm ?? c.nome}
            onClick={() => aoAbrirCliente(
              c.clienteId ? { id: c.clienteId } : { norm: c.norm ?? '' },
            )}
          >
            <span className="mq-item__icon mq-item__icon--brand"><Icone nome="person" /></span>
            <span className="mq-item__main">
              <b>{c.nome}</b>
              <small>{c.vendas} {plural(c.vendas, 'venda', 'vendas')} · {c.pecas} {plural(c.pecas, 'peça', 'peças')}</small>
            </span>
            <span className="mq-item__side"><b className="mq-money">{money(c.faturamento)}</b></span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════ saídas sem faturamento */

function SaidasDoMes({ d }: { d: PainelAnalytics }) {
  const tipos = Object.entries(d.saidasSemFaturamento.porTipo);
  if (!tipos.length) return null;
  return (
    <section className="mq-card mq-card--pad mq-card--quiet">
      <h2 className="mq-title">Saiu sem faturar em {d.saidasSemFaturamento.mes}</h2>
      <dl className="mq-figures">
        {tipos.map(([tipo, v]) => (
          <div key={tipo}>
            <dt>{tipo.replace('_', ' ')}</dt>
            <dd>{v.pecas}</dd>
            <small>{v.lancamentos} {plural(v.lancamentos, 'lançamento', 'lançamentos')}</small>
          </div>
        ))}
        <div>
          <dt>Total</dt>
          <dd>{d.saidasSemFaturamento.pecas}</dd>
          <small>peças</small>
        </div>
      </dl>
      <p className="mq-hint">{d.saidasSemFaturamento.regra}</p>
    </section>
  );
}
