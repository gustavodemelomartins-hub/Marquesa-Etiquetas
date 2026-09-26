import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData } from '../../domain/formato';
import { hojeISO } from '../../domain/formato';
import { descreverRecorte } from './periodo';
import { buscarAReceber, definirPrazo, estornarRecebimento, receberConta } from './api';
import type { Connection } from '../../services/client';
import type { ContaAReceber, ContasAReceber, PainelFinanceiro, Recorte } from './tipos';

interface Props {
  conexao: Connection;
  dados: ContasAReceber | null;
  erro: unknown;
  recarregar: () => void;
  aoAbrirCliente: (conta: ContaAReceber) => void;
  /** O painel do recorte atual. Entra aqui por UM número: o que ENTROU,
   *  recortado pela data do pagamento. Ele não sai de `contas-receber` —
   *  aquela rota só conhece o que falta — e sem ele a tela responderia
   *  "quanto falta" sem nunca responder "quanto entrou". */
  painel: PainelFinanceiro | null;
  recorte: Recorte;
}

/* Sete colunas, as do protótipo. Cliente é a mais larga porque é por onde
   se procura; "A receber" é a que se lê de relance e fecha a linha junto
   com a situação. */
const COLUNAS = {
  gridTemplateColumns:
    'minmax(0,1.5fr) minmax(0,1.1fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.8fr) minmax(0,.9fr) auto',
};

type Filtro = 'todos' | 'vence-hoje' | 'atraso';

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'vence-hoje', rotulo: 'Vence hoje' },
  { id: 'atraso', rotulo: 'Em atraso' },
];

/** A RECEBER — a lista de trabalho do dinheiro.
 *
 *  A composição é a do protótipo (`docs/ux/03-screens/financeiro/master.html`):
 *  as três datas ditas uma vez no topo, quatro números em dinheiro, a lista
 *  à esquerda e a venda selecionada à direita — e a venda continua
 *  selecionada enquanto se trabalha nela, que é a diferença entre um painel
 *  e um diálogo que tapa a lista a cada clique.
 *
 *  Os dados são os reais. Três fontes entram aqui e o backend diz quais:
 *  compra histórica em aberto, venda do sistema não paga e diferença de
 *  troca de garantia. A resposta carrega `cobertura`, e quando ela não é
 *  completa a tela repete isso em letra em vez de deixar alguém somar um
 *  total pela metade.
 *
 *  Três ações, as três que o backend sustenta: receber, definir o prazo e
 *  corrigir um recebimento lançado errado. Receber é INTEGRAL — em partes
 *  continua sendo a decisão D2, e a tela diz isso. Corrigir vive em
 *  "Recebidas": a conta paga volta a ficar em aberto, com o motivo gravado,
 *  e o recebimento certo entra de novo pela porta de sempre.
 */
export function AReceber({
  conexao, dados, erro, recarregar, aoAbrirCliente, painel, recorte,
}: Props) {
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [falha, setFalha] = useState<{ chave: string; texto: string } | null>(null);
  const [recebendo, setRecebendo] = useState<ContaAReceber | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [modo, setModo] = useState<'abertas' | 'recebidas'>('abertas');
  const [recebidas, setRecebidas] = useState<ContasAReceber | null>(null);
  const [erroRecebidas, setErroRecebidas] = useState<string | null>(null);
  const [corrigindo, setCorrigindo] = useState<ContaAReceber | null>(null);
  const [versaoRecebidas, setVersaoRecebidas] = useState(0);

  /* As recebidas só são lidas quando alguém pede. É a lista de CORREÇÃO,
     não a de trabalho: quem abre A Receber quer saber quem deve. */
  useEffect(() => {
    if (modo !== 'recebidas') return undefined;
    const ctl = new AbortController();
    setErroRecebidas(null);
    buscarAReceber(conexao, 'paga', ctl.signal)
      .then(setRecebidas)
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) {
          setErroRecebidas(e instanceof Error ? e.message : 'Não consegui ler as recebidas.');
        }
      });
    return () => ctl.abort();
  }, [conexao, modo, versaoRecebidas]);

  const hoje = hojeISO();
  const contas = useMemo(
    () => (modo === 'recebidas' ? recebidas?.contas ?? [] : dados?.contas ?? []),
    [dados, recebidas, modo],
  );

  /* Os dois números que o protótipo pede e que `resumo` não traz: eles são
     sobre o VENCIMENTO, e o backend resume por status. Somar aqui é
     leitura da mesma lista que está na tela — nenhuma segunda fonte. */
  const somas = useMemo(() => {
    const abertas = contas.filter((c) => c.cobrancaStatus === 'aberta');
    const somar = (f: (c: ContaAReceber) => boolean) =>
      +abertas.filter(f).reduce((s, c) => s + Number(c.valorReceber || 0), 0).toFixed(2);
    return {
      venceHoje: somar((c) => c.vencimentoEm === hoje),
      venceHojeN: abertas.filter((c) => c.vencimentoEm === hoje).length,
      atraso: somar((c) => c.vencida),
    };
  }, [contas, hoje]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return contas
      .filter((c) => (filtro === 'todos' ? true
        : filtro === 'atraso' ? c.vencida
          : c.vencimentoEm === hoje))
      .filter((c) => !t
        || (c.cliente ?? '').toLowerCase().includes(t)
        || String(c.vendaId ?? '').includes(t)
        || c.origem.toLowerCase().includes(t));
  }, [contas, busca, filtro, hoje]);

  const conta = contas.find((c) => c.chave === selecionada) ?? lista[0] ?? null;

  if (erro) return <section className="mq-card"><ErrorState erro={erro} aoTentarDeNovo={recarregar} /></section>;
  if (!dados) {
    return (
      <section className="mq-card mq-card--pad" aria-busy="true">
        <p className="mq-skel mq-skel--title" />
        <p className="mq-skel mq-skel--line" style={{ marginTop: 14 }} />
        <p className="mq-skel mq-skel--short" style={{ marginTop: 8 }} />
      </section>
    );
  }

  const { resumo, cobertura } = dados;

  async function prazo(alvo: ContaAReceber) {
    const valor = prompt(
      `Vencimento de ${alvo.cliente ?? 'esta conta'} (AAAA-MM-DD, vazio para tirar o prazo):`,
      alvo.vencimentoEm ?? '',
    );
    if (valor === null) return;
    setOcupada(alvo.chave);
    setFalha(null);
    const r = await definirPrazo(conexao, {
      chave: alvo.chave,
      vencimentoEm: valor.trim() || null,
      versaoEsperada: alvo.versao,
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui salvar o prazo.' }));
    setOcupada(null);
    if (r && 'erro' in r && r.erro) setFalha({ chave: alvo.chave, texto: String(r.erro) });
    else recarregar();
  }

  return (
    <>
      {!cobertura.completa && (
        <p className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>{cobertura.porque}</span>
        </p>
      )}

      {/* TRÊS DATAS, ditas uma vez, onde se trabalha com elas. Elas estavam
          só no Resumo, e quem passa o dia nesta aba nunca as lia. */}
      <p className="mq-note mq-note--brand date-key">
        <Icone nome="calendar" />
        <span>
          <b>Três datas, três significados.</b>
          <em className="date-key__item"><i>Venda</i> quando a peça saiu</em>
          <em className="date-key__item">
            <i>Pagamento</i> data efetiva do dinheiro — é ela que conta no faturamento
          </em>
          <em className="date-key__item"><i>Registro</i> quando foi lançado no sistema</em>
        </span>
      </p>

      <div className="mq-kpis">
        <div className={resumo.total > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Saldo em aberto</span>
          <span className="mq-kpi__value"><i>R$</i>{money(resumo.total).replace('R$ ', '')}</span>
          <span className="mq-kpi__foot">
            {resumo.quantidade} {resumo.quantidade === 1 ? 'conta' : 'contas'}
            {resumo.semPrazo > 0 && ` · ${resumo.semPrazo} sem prazo`}
          </span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Vence hoje</span>
          <span className="mq-kpi__value"><i>R$</i>{money(somas.venceHoje).replace('R$ ', '')}</span>
          <span className="mq-kpi__foot">
            {somas.venceHojeN === 0 ? 'nada vence hoje' : 'saldo com vencimento hoje'}
          </span>
        </div>
        <div className={somas.atraso > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Em atraso</span>
          <span className="mq-kpi__value"><i>R$</i>{money(somas.atraso).replace('R$ ', '')}</span>
          <span className="mq-kpi__foot">
            {resumo.vencidas} {resumo.vencidas === 1 ? 'conta vencida' : 'contas vencidas'}
          </span>
        </div>
        <div className="mq-kpi mq-kpi--ok">
          <span className="mq-kpi__label">Recebido</span>
          <span className="mq-kpi__value">
            <i>R$</i>
            {painel ? money(painel.geral.faturamento).replace('R$ ', '') : '—'}
          </span>
          {/* O protótipo diz "no mês". O recorte desta tela é escolhido no
              Resumo e vale para o Financeiro inteiro — mentir o rótulo
              faria o número parecer outro. */}
          <span className="mq-kpi__foot">
            pela data efetiva · {descreverRecorte(recorte).toLowerCase()}
          </span>
        </div>
      </div>

      <div className="mq-grid mq-grid--main">
        <section className="mq-card mq-card--flush">
          <div className="mq-card__head">
            <div>
              <p className="mq-eyebrow">{modo === 'abertas' ? 'Contas abertas' : 'Contas recebidas'}</p>
              <h2 className="mq-title">{modo === 'abertas' ? 'Quem ainda deve' : 'O que já foi recebido'}</h2>
              <p className="mq-lede">
                {modo === 'abertas'
                  ? dados.regra
                  : 'Recebimentos lançados aqui. Um lançamento errado se corrige daqui, com motivo.'}
              </p>
            </div>
            <div className="mq-chipset" role="group" aria-label="Abertas ou recebidas">
              <button type="button" aria-pressed={modo === 'abertas'} onClick={() => setModo('abertas')}>
                Em aberto
              </button>
              <button type="button" aria-pressed={modo === 'recebidas'} onClick={() => setModo('recebidas')}>
                Recebidas
              </button>
            </div>
          </div>
          {modo === 'recebidas' && erroRecebidas && (
            <p className="mq-note mq-note--risk" role="alert"><span>{erroRecebidas}</span></p>
          )}

          <div className="mq-filters">
            <label className="mq-search">
              <Icone nome="search" />
              <input
                className="mq-input"
                type="search"
                placeholder="Buscar cliente ou venda"
                aria-label="Buscar cliente ou venda"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <div className="mq-chipset" role="group" aria-label="Filtrar contas">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filtro === f.id}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
            <span className="mq-filters__count">
              {lista.length} {lista.length === 1 ? 'conta' : 'contas'}
            </span>
          </div>

          {contas.length === 0 && modo === 'recebidas' ? (
            <div className="mq-state">
              <span className="mq-state__icon"><Icone nome="money" /></span>
              <h3>{recebidas ? 'Nenhum recebimento lançado' : 'Carregando recebidas…'}</h3>
              <p>Quando uma conta for recebida aqui, ela aparece nesta lista.</p>
            </div>
          ) : contas.length === 0 ? (
            <div className="mq-state">
              <span className="mq-state__icon"><Icone nome="check" /></span>
              <h3>Nada em aberto</h3>
              <p>Toda compra registrada já foi paga. É o melhor estado possível desta tela.</p>
            </div>
          ) : lista.length === 0 ? (
            <div className="mq-state">
              <span className="mq-state__icon"><Icone nome="search" /></span>
              <h3>Nenhum saldo encontrado</h3>
              <p>Nenhuma conta corresponde à busca ou ao filtro ativo.</p>
            </div>
          ) : (
            <div className="mq-table" role="table" aria-label="Contas a receber">
              <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
                <span>Cliente</span>
                <span>Venda</span>
                <span>Vencimento</span>
                <span>Total</span>
                <span>Recebido</span>
                <span>A receber</span>
                <span>Situação</span>
              </div>
              {lista.map((c) => (
                <div
                  className={c.chave === conta?.chave ? 'mq-tr mq-tr--ativa' : 'mq-tr'}
                  role="row"
                  key={c.chave}
                  style={COLUNAS}
                >
                  <button
                    type="button"
                    className="mq-cell"
                    aria-label={`Abrir ${c.cliente ?? 'conta em aberto'}`}
                    onClick={() => setSelecionada(c.chave)}
                  >
                    <b>{c.cliente ?? 'Cliente não identificada'}</b>
                    <small>
                      {c.origem}
                      {c.clienteAmbiguo && ' · nome ambíguo, sem ficha'}
                    </small>
                  </button>
                  <span className="mq-cell">
                    <b>{c.vendaId ? `Venda #${c.vendaId}` : c.tipo}</b>
                    <small className="mq-date">{fmtData(c.data)}</small>
                  </span>
                  <span className="mq-cell">
                    {c.vencimentoEm ? (
                      <>
                        <b className="mq-date">{fmtData(c.vencimentoEm)}</b>
                        {c.vencida && <small className="mq-money--risk">em atraso</small>}
                      </>
                    ) : (
                      <small>sem prazo</small>
                    )}
                  </span>
                  <span className="mq-cell mq-cell--num"><b className="mq-money">{money(c.valorTotal)}</b></span>
                  <span className="mq-cell mq-cell--num">
                    <b className={c.valorRecebido > 0 ? 'mq-money mq-money--ok' : 'mq-money'}>
                      {money(c.valorRecebido)}
                    </b>
                  </span>
                  <span className="mq-cell mq-cell--num">
                    <b className="mq-money mq-money--risk">{money(c.valorReceber)}</b>
                  </span>
                  <span className="mq-cell">
                    <span className={situacao(c).classe}>{situacao(c).texto}</span>
                    {falha?.chave === c.chave && (
                      <small className="mq-money--risk">{falha.texto}</small>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mq-card__foot">
            <span>Saldo simples · sem parcelas geradas</span>
            <span>{money(resumo.total)} em aberto</span>
          </div>
        </section>

        {/* A VENDA SELECIONADA. Painel, não diálogo: quem cobra abre a
            conta, olha o que já entrou e registra — e a lista continua
            visível para a próxima. */}
        <aside className="mq-card sale-detail">
          {conta ? (
            <>
              <div className="mq-card__head">
                <div>
                  <p className="mq-eyebrow">Venda selecionada</p>
                  <h2 className="mq-title">{conta.cliente ?? 'Cliente não identificada'}</h2>
                  <p className="mq-hint">
                    {conta.vendaId ? `Venda #${conta.vendaId} · ` : ''}{fmtData(conta.data)}
                  </p>
                </div>
                <span className={situacao(conta).classe}>{situacao(conta).texto}</span>
              </div>

              <div className="mq-card__body mq-stack mq-stack--tight">
                <dl className="mq-figures sale-figures">
                  <div><dt>Valor da venda</dt><dd>{money(conta.valorTotal)}</dd></div>
                  <div className="is-ok"><dt>Recebido</dt><dd>{money(conta.valorRecebido)}</dd></div>
                  <div className="is-brand">
                    <dt>A receber</dt><dd>{money(conta.valorReceber)}</dd>
                    <small>Saldo simples</small>
                  </div>
                </dl>

                <div className="sale-receipts">
                  <h3 className="mq-subtitle">Recebimentos da venda</h3>
                  {conta.valorRecebido > 0 && (
                    <article className="recebimento is-ok">
                      <span>Recebido</span>
                      <div>
                        <b>{money(conta.valorRecebido)}</b>
                        <small>{conta.pagaEm ? `data efetiva ${fmtData(conta.pagaEm)}` : 'sem data efetiva registrada'}</small>
                      </div>
                      <em className="mq-status mq-status--ok">Pago</em>
                    </article>
                  )}
                  {conta.valorReceber > 0 && (
                    <article className="recebimento">
                      <span>A receber</span>
                      <div>
                        <b>{money(conta.valorReceber)}</b>
                        <small>
                          {conta.vencimentoEm
                            ? `vencimento ${fmtData(conta.vencimentoEm)}`
                            : 'sem prazo combinado'}
                        </small>
                      </div>
                      <em className={conta.vencida ? 'mq-status mq-status--risk' : 'mq-status'}>
                        {conta.vencida ? 'Em atraso' : 'Pendente'}
                      </em>
                    </article>
                  )}
                </div>

                <div className="mq-btns sale-actions">
                  <button
                    type="button"
                    className="mq-btn mq-btn--primary"
                    disabled={ocupada === conta.chave || conta.valorReceber <= 0}
                    onClick={() => setRecebendo(conta)}
                  >
                    Registrar recebimento
                  </button>
                  <button
                    type="button"
                    className="mq-btn mq-btn--secondary"
                    disabled={ocupada === conta.chave || !conta.podeDefinirPrazo}
                    onClick={() => prazo(conta)}
                  >
                    {conta.vencimentoEm ? 'Mudar o prazo' : 'Definir prazo'}
                  </button>
                  {conta.cobrancaStatus === 'paga' && (
                    <button
                      type="button"
                      className="mq-btn mq-btn--secondary"
                      disabled={ocupada === conta.chave}
                      onClick={() => setCorrigindo(conta)}
                    >
                      Corrigir lançamento
                    </button>
                  )}
                </div>

                <p className="mq-note">
                  <Icone nome="box" />
                  <span>
                    Receber <b>não movimenta estoque</b> e quita a conta inteira.
                    Recebimento lançado errado se corrige em <b>Recebidas</b>: a
                    conta volta a ficar em aberto, com o motivo registrado, e o
                    recebimento certo entra de novo. Receber em partes continua
                    fora do sistema.
                  </span>
                </p>
              </div>
            </>
          ) : (
            <div className="mq-state">
              <span className="mq-state__icon"><Icone nome="money" /></span>
              <h3>Nenhuma conta selecionada</h3>
              <p>Clique numa linha para ver o que já entrou e registrar a entrada.</p>
            </div>
          )}
        </aside>
      </div>

      {corrigindo && (
        <DialogoCorrigir
          conexao={conexao}
          conta={corrigindo}
          aoFechar={() => setCorrigindo(null)}
          aoCorrigido={() => {
            const chave = corrigindo.chave;
            setCorrigindo(null);
            setVersaoRecebidas((v) => v + 1);
            recarregar();
            setModo('abertas');
            setSelecionada(chave);
          }}
        />
      )}

      {recebendo && (
        <DialogoReceber
          conexao={conexao}
          conta={recebendo}
          aoFechar={() => setRecebendo(null)}
          aoRecebido={() => {
            setRecebendo(null);
            recarregar();
          }}
          aoAbrirCliente={aoAbrirCliente}
        />
      )}
    </>
  );
}

/** A situação da conta, em UMA palavra. "Parcial" existe porque a fonte
 *  histórica guarda valor recebido parcial — não porque esta tela receba em
 *  partes, que é outra coisa e não existe. */
function situacao(c: ContaAReceber): { texto: string; classe: string } {
  if (c.cobrancaStatus !== 'aberta') return { texto: 'Pago', classe: 'mq-status mq-status--ok' };
  if (c.vencida) return { texto: 'Em atraso', classe: 'mq-status mq-status--risk' };
  if (c.valorRecebido > 0) return { texto: 'Parcial', classe: 'mq-status mq-status--warn' };
  return { texto: 'A receber', classe: 'mq-status' };
}

/** O diálogo do recebimento. Ele existe por causa de uma data.
 *
 *  Marcar "recebido" sem perguntar QUANDO joga o dinheiro no faturamento de
 *  hoje, e quem recebeu na sexta e lançou na segunda vê o mês errado. A
 *  data vem preenchida com hoje, porque é o caso comum, e é editável,
 *  porque o caso comum não é o único. */
function DialogoReceber({
  conexao, conta, aoFechar, aoRecebido, aoAbrirCliente,
}: {
  conexao: Connection;
  conta: ContaAReceber;
  aoFechar: () => void;
  aoRecebido: () => void;
  aoAbrirCliente: (c: ContaAReceber) => void;
}) {
  const [data, setData] = useState(hojeISO());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    setErro('');
    const r = await receberConta(conexao, {
      chave: conta.chave, pagaEm: data, versaoEsperada: conta.versao,
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar.' }));
    setSalvando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoRecebido();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-modal" role="dialog" aria-modal="true" aria-label="Registrar recebimento">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">Recebimento</p>
            <h2 className="mq-title">
              {conta.clienteId || conta.clienteNorm ? (
                <button type="button" className="mq-btn mq-btn--link" onClick={() => aoAbrirCliente(conta)}>
                  {conta.cliente ?? 'Conta em aberto'}
                </button>
              ) : (conta.cliente ?? 'Conta em aberto')}
            </h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-modal__body">
          <dl className="mq-confirm">
            <dt>Valor a receber</dt>
            <dd>{money(conta.valorReceber)}</dd>
          </dl>

          <label className="mq-field">
            <span>Data em que o dinheiro entrou</span>
            <input
              className="mq-input"
              type="date"
              value={data}
              max={hojeISO()}
              onChange={(e) => setData(e.target.value)}
            />
            <small>
              É esta data que manda no faturamento — não a da venda ({fmtData(conta.data)})
              nem a de hoje.
            </small>
          </label>

          <p className="mq-note mq-note--info">
            <Icone nome="alert" />
            <span>
              O sistema quita a conta inteira. Receber em partes depende de uma
              decisão de negócio que ainda não foi tomada, e não está ligado.
            </span>
          </p>

          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        </div>

        <div className="mq-modal__foot">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="mq-btn mq-btn--primary" disabled={salvando} onClick={confirmar}>
            {salvando ? 'Registrando…' : `Recebi ${money(conta.valorReceber)}`}
          </button>
        </div>
      </div>
    </>
  );
}

/** "Corrigir lançamento". O motivo é obrigatório porque é a única coisa que
 *  explica, meses depois, por que um dinheiro que entrou deixou de ter
 *  entrado. Nada é apagado: a conta volta a ficar em aberto e o lançamento
 *  errado continua no histórico dela. */
function DialogoCorrigir({
  conexao, conta, aoFechar, aoCorrigido,
}: {
  conexao: Connection;
  conta: ContaAReceber;
  aoFechar: () => void;
  aoCorrigido: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const valido = motivo.trim().length >= 3;

  async function confirmar() {
    setSalvando(true);
    setErro('');
    const r = await estornarRecebimento(conexao, {
      chave: conta.chave, motivo: motivo.trim(), versaoEsperada: conta.versao,
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui corrigir.' }));
    setSalvando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoCorrigido();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-modal" role="dialog" aria-modal="true" aria-label="Corrigir lançamento">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">Corrigir lançamento</p>
            <h2 className="mq-title">{conta.cliente ?? 'Conta recebida'}</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-modal__body">
          <dl className="mq-confirm">
            <dt>Recebimento lançado</dt>
            <dd>
              {money(conta.valorRecebido || conta.valorTotal)}
              {conta.pagaEm ? ` em ${fmtData(conta.pagaEm)}` : ''}
            </dd>
          </dl>

          <label className="mq-field">
            <span>Por que este recebimento está errado?</span>
            <textarea
              className="mq-input"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: lançado na cliente errada, pix não caiu"
            />
            <small>O motivo fica registrado junto da conta. Nada é apagado.</small>
          </label>

          <p className="mq-note mq-note--info">
            <Icone nome="alert" />
            <span>
              A conta volta para <b>Em aberto</b> pelo valor inteiro. Se o dinheiro
              entrou em outra data, registre o recebimento de novo com a data certa.
              Estoque não é tocado.
            </span>
          </p>

          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        </div>

        <div className="mq-modal__foot">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
          <button
            type="button"
            className="mq-btn mq-btn--primary"
            disabled={salvando || !valido}
            onClick={confirmar}
          >
            {salvando ? 'Corrigindo…' : 'Voltar a conta para em aberto'}
          </button>
        </div>
      </div>
    </>
  );
}
