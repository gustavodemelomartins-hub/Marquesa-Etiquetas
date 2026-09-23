import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { money, fmtData, hojeISO, plural } from '../../domain/formato';
import { criarCliente, listarClientes } from '../clientes/api';
import { useApi } from '../../hooks/useApi';
import { registrarVenda } from './api';
import { MonteSeuColar } from './MonteSeuColar';
import { descricaoDaComposicao, type ComposicaoDoColar } from './colar';
import {
  corpoDaVenda, descontoDoCarrinho, impedimentos, linhaDoProduto,
  pecasDaVenda, pecasDoCarrinho, temDesconto, totalDaLinha, totalDaVenda,
  type LinhaDoCarrinho,
} from './carrinho';
import type { Connection } from '../../services/client';
import type { ProdutoDoEstado } from './tipos';

interface Props {
  conexao: Connection;
  produtos: ProdutoDoEstado[];
  /** Quando a venda vem da ficha de uma cliente, ela já chega escolhida. */
  clienteInicial?: { id: number | null; nome: string } | null;
  /** `colar` abre a composição por cima do passo 1 — é o destino de
   *  `#/vendas/colar`, e por estar no endereço ele sobrevive ao recarregar.
   *
   *  Ele é PROPRIEDADE e não estado: enquanto era `useState(abrirColar)`, o
   *  valor inicial só valia na montagem, e o componente não remonta ao ir de
   *  `#/vendas/colar` para `#/vendas/nova` — as duas rotas renderizam este
   *  mesmo elemento. O resultado era a venda normal continuar mostrando o
   *  composer do colar, com a URL dizendo outra coisa. */
  abrirColar?: boolean;
  aoAbrirColar?: () => void;
  /** Fechar o composer é NAVEGAR, não mudar estado local. É isto que mantém
   *  a URL e a tela dizendo a mesma coisa. */
  aoFecharColar?: () => void;
  aoFechar: () => void;
  /** Avisa o pai quando há carrinho. As abas de Vendas continuam visíveis
   *  durante o lançamento — como no protótipo — e sair delas com peças já
   *  adicionadas precisa perguntar antes. */
  aoMudarRascunho?: (tem: boolean) => void;
  aoRegistrar: (id: number) => void;
}

type Passo = 'itens' | 'cliente' | 'pagamento';

/** VENDA NORMAL — o balcão, nos três passos do protótipo.
 *
 *  1. ITENS      o que levou (peças avulsas e/ou composições)
 *  2. CLIENTE    para quem, e em que dia a venda aconteceu
 *  3. PAGAMENTO  o que entrou, quando, e o que ficou pendente
 *
 *  Os passos abrem e fecham; nenhum deles esconde o outro. No balcão a
 *  pessoa está com a cliente na frente, e um assistente que tranca o passo
 *  anterior obriga a desfazer três telas para conferir um preço.
 *
 *  AS TRÊS DATAS SÃO TRÊS. A venda pode ser de 10/09 (§28), o pagamento de
 *  12/09 (§29/§30), e o registro de hoje — `movimentos.criado_em` guarda o
 *  terceiro sozinho. Fundi-las num "agora" é o defeito que a V2 veio
 *  consertar, e por isso os dois campos aparecem separados, sempre.
 *
 *  O QUE O PROTÓTIPO DESENHA E O BACKEND NÃO ACEITA está dito na tela, não
 *  simulado: canal por venda e recebimento em partes. Ver `LIMITES`.
 */
export function NovaVenda({
  conexao, produtos, clienteInicial, abrirColar = false,
  aoAbrirColar, aoFecharColar, aoFechar, aoRegistrar, aoMudarRascunho,
}: Props) {
  const hoje = hojeISO();
  const [passo, setPasso] = useState<Passo>(clienteInicial ? 'itens' : 'itens');
  const [clienteId, setClienteId] = useState<number | null>(clienteInicial?.id ?? null);
  const [clienteNome, setClienteNome] = useState(clienteInicial?.nome ?? '');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [cadastrando, setCadastrando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaDoCarrinho[]>([]);
  const [composicoes, setComposicoes] = useState<ComposicaoDoColar[]>([]);
  const [buscaPeca, setBuscaPeca] = useState('');
  const [data, setData] = useState(hoje);
  const [pago, setPago] = useState(true);
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [observacao, setObservacao] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState('');

  const clientes = useApi(
    (s) => (buscaCliente.trim().length >= 2 ? listarClientes(conexao, buscaCliente, s) : Promise.resolve([])),
    [conexao, buscaCliente],
  );

  const achados = useMemo(() => {
    const t = buscaPeca.trim().toLowerCase();
    if (!t) return [];
    return produtos
      .filter((p) => p.status === 'ativo')
      .filter((p) => p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .slice(0, 8);
  }, [produtos, buscaPeca]);

  const erros = impedimentos(linhas, clienteNome, data, hoje, composicoes);
  const total = totalDaVenda(linhas, composicoes);
  const desconto = descontoDoCarrinho(linhas);
  const pecas = pecasDaVenda(linhas, composicoes);
  const recebido = pago ? total : 0;
  const aReceber = Math.round((total - recebido) * 100) / 100;

  function mudar(sku: string, mudanca: Partial<LinhaDoCarrinho>) {
    setLinhas((atual) => atual.map((l) => (l.sku === sku ? { ...l, ...mudanca } : l)));
  }

  function acrescentar(p: ProdutoDoEstado) {
    setBuscaPeca('');
    setLinhas((atual) => {
      const existe = atual.find((l) => l.sku === p.sku);
      if (existe) return atual.map((l) => (l.sku === p.sku ? { ...l, qtd: l.qtd + 1 } : l));
      return [...atual, linhaDoProduto(p)];
    });
  }

  async function registrar() {
    setEnviando(true);
    setRecusa('');
    const corpo = corpoDaVenda({
      linhas, composicoes, clienteId, clienteNome, data, pago,
      dataPagamento: pago ? dataPagamento : null,
      observacao,
    });
    const r = await registrarVenda(conexao, corpo)
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar a venda.' }));
    setEnviando(false);
    if (r && 'erro' in r && r.erro) { setRevisando(false); setRecusa(String(r.erro)); return; }
    if (r && 'id' in r && typeof r.id === 'number') aoRegistrar(r.id);
    else aoFechar();
  }

  /* O carrinho NÃO é perdido ao entrar e sair do composer: este componente
     continua montado, e só o que ele mostra muda. Uma composição adicionada
     volta para a venda que já estava sendo feita. */
  const fecharColar = () => aoFecharColar?.();

  /* O pai precisa saber que há rascunho para poder AVISAR antes de uma
     navegação que o perderia — as abas voltaram a ficar visíveis durante o
     lançamento, como no protótipo, e sair delas com carrinho cheio não
     pode ser silencioso. */
  useEffect(() => { aoMudarRascunho?.(pecas > 0); }, [pecas, aoMudarRascunho]);
  useEffect(() => () => { aoMudarRascunho?.(false); }, [aoMudarRascunho]);

  if (abrirColar) {
    return (
      <MonteSeuColar
        conexao={conexao}
        aoCancelar={fecharColar}
        aoAdicionar={(c) => {
          setComposicoes((a) => [...a, c]);
          fecharColar();
        }}
      />
    );
  }

  return (
    <>
      {/* Sem `mq-pagehead` aqui: quem desenha "Operação do dia · Novo
          lançamento" é `VendasArea`, uma vez só, acima do seletor dos três
          modos. Dois cabeçalhos na mesma tela dizendo a mesma coisa era o
          que fazia a venda parecer outra página. */}
      <ol className="mq-steps" aria-label="Passos da venda">
        {(['itens', 'cliente', 'pagamento'] as Passo[]).map((p, i) => {
          const feito = p === 'itens' ? pecas > 0
            : p === 'cliente' ? !!clienteNome.trim()
              : erros.length === 0;
          return (
            <li key={p} className={`mq-step${passo === p ? ' is-current' : feito ? ' is-done' : ''}`}>
              <span className="mq-step__dot">{feito && passo !== p ? <Icone nome="check" /> : i + 1}</span>
              <span className="mq-step__label">
                {p === 'itens' ? 'Itens' : p === 'cliente' ? 'Cliente' : 'Pagamento'}
              </span>
            </li>
          );
        })}
      </ol>

      {/* ═══════════════════════════════════════════════════ 1 · itens */}
      <PainelDoPasso
        indice={1}
        titulo="Itens da venda"
        sub="Leia a etiqueta ou busque por nome e SKU."
        resumo={`${pecas} ${plural(pecas, 'peça', 'peças')}`}
        aberto={passo === 'itens'}
        aoAlternar={() => setPasso(passo === 'itens' ? 'cliente' : 'itens')}
      >
        <div className="mq-row">
          <label className="mq-search">
            <Icone nome="search" />
            <input
              className="mq-input"
              type="search"
              placeholder="Digite o nome ou o código da peça"
              aria-label="Buscar peça"
              value={buscaPeca}
              onChange={(e) => setBuscaPeca(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="mq-btn mq-btn--secondary"
            onClick={() => aoAbrirColar?.()}
          >
            <Icone nome="star" />
            Monte seu Colar
          </button>
        </div>

        {achados.length > 0 && (
          <div className="mq-list">
            {achados.map((p) => (
              <button
                type="button"
                className="mq-item"
                key={p.sku}
                disabled={p.disponivel <= 0 || p.semPreco}
                onClick={() => acrescentar(p)}
              >
                <span className="mq-item__main">
                  <b>{p.desc}</b>
                  <small>
                    {p.sku} · {p.disponivel} disponível
                    {p.semPreco ? ' · sem preço cadastrado' : ''}
                  </small>
                </span>
                <span className="mq-item__side">
                  <b className="mq-money">{p.preco === null ? '—' : money(p.preco)}</b>
                </span>
              </button>
            ))}
          </div>
        )}

        {composicoes.map((c, i) => (
          <div className="mq-item" key={`${c.skuComercial}-${i}`}>
            <span className="mq-item__icon mq-item__icon--brand"><Icone nome="star" /></span>
            <span className="mq-item__main">
              <b>{descricaoDaComposicao(c)}</b>
              <small>
                SKU {c.skuComercial} · corrente {c.baseNome ?? c.baseSku} incluída ·
                {' '}{c.componentes.length} {plural(c.componentes.length, 'pingente', 'pingentes')}
              </small>
            </span>
            <span className="mq-item__side">
              <b className="mq-money">{money(c.preco)}</b>
              <button
                type="button"
                className="mq-btn mq-btn--ghost mq-btn--sm"
                aria-label="Tirar composição"
                onClick={() => setComposicoes((a) => a.filter((_, k) => k !== i))}
              >
                <Icone nome="close" />
              </button>
            </span>
          </div>
        ))}

        {linhas.length === 0 && composicoes.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="sale" /></span>
            <h3>A venda ainda está vazia</h3>
            <p>Busque uma peça para começar, ou monte um colar.</p>
          </div>
        ) : (
          <div className="mq-list">
            {linhas.map((l) => (
              <div className="mq-venda-linha" key={l.sku}>
                <div className="mq-venda-linha__topo">
                  <span className="mq-cell">
                    <b>{l.desc}</b>
                    <small>{l.sku} · {l.disponivel} disponível</small>
                  </span>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost mq-btn--sm"
                    aria-label={`Tirar ${l.desc}`}
                    onClick={() => setLinhas((a) => a.filter((x) => x.sku !== l.sku))}
                  >
                    <Icone nome="close" />
                  </button>
                </div>

                <div className="mq-venda-linha__campos">
                  <label className="mq-field">
                    <span>Quantidade</span>
                    <input
                      className="mq-input"
                      type="number"
                      min={1}
                      max={l.disponivel}
                      inputMode="numeric"
                      value={l.qtd}
                      onChange={(e) => mudar(l.sku, { qtd: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </label>
                  <label className="mq-field">
                    <span>Preço cobrado</span>
                    <span className="mq-money-input">
                      <input
                        className="mq-input"
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={l.preco}
                        onChange={(e) => mudar(l.sku, { preco: Number(e.target.value) })}
                      />
                    </span>
                    <small>tabela {money(l.precoTabela)}</small>
                  </label>
                  <span className="mq-field">
                    <span>Total</span>
                    <b className="mq-money mq-money--lg">{money(totalDaLinha(l))}</b>
                  </span>
                </div>

                {temDesconto(l) && (
                  <label className="mq-field">
                    <span>Motivo do preço diferente</span>
                    <input
                      className="mq-input"
                      placeholder='ex.: "Grupo VIP", "peça com marca"'
                      value={l.descontoRotulo}
                      onChange={(e) => mudar(l.sku, { descontoRotulo: e.target.value })}
                    />
                    <small>
                      Sem motivo, um desconto é indistinguível de erro de
                      digitação — e o backend recusa.
                    </small>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mq-row mq-row--end">
          <button
            type="button"
            className="mq-btn mq-btn--primary"
            disabled={pecas === 0}
            onClick={() => setPasso('cliente')}
          >
            Continuar para cliente
          </button>
        </div>
      </PainelDoPasso>

      {/* ════════════════════════════════════════════════ 2 · cliente */}
      <PainelDoPasso
        indice={2}
        titulo="Cliente da venda"
        sub="Quem comprou e em que dia a venda aconteceu."
        resumo={clienteNome || 'Não selecionada'}
        aberto={passo === 'cliente'}
        aoAlternar={() => setPasso(passo === 'cliente' ? 'pagamento' : 'cliente')}
      >
        {clienteNome ? (
          <p className="mq-chips">
            <span className="mq-chip mq-chip--brand">
              {clienteNome}
              {clienteId ? '' : ' · sem cadastro'}
              <button type="button" aria-label="Trocar cliente" onClick={() => {
                setClienteNome('');
                setClienteId(null);
              }}>×</button>
            </span>
          </p>
        ) : (
          <>
            <div className="mq-row">
              <label className="mq-search">
                <Icone nome="search" />
                <input
                  className="mq-input"
                  type="search"
                  placeholder="Nome, telefone ou CPF"
                  aria-label="Buscar cliente"
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                />
              </label>
              <button type="button" className="mq-btn mq-btn--secondary" onClick={() => setCadastrando(true)}>
                <Icone nome="plus" />
                Nova cliente
              </button>
            </div>

            {(clientes.dados ?? []).length > 0 && (
              <div className="mq-list">
                {(clientes.dados ?? []).map((c) => (
                  <button
                    type="button"
                    className="mq-item"
                    key={c.id}
                    onClick={() => {
                      setClienteId(c.id);
                      setClienteNome(c.nome);
                      setBuscaCliente('');
                    }}
                  >
                    <span className="mq-item__main">
                      <b>{c.nome}</b>
                      <small>{[c.tel, c.cidade].filter(Boolean).join(' · ') || 'sem telefone'}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {buscaCliente.trim().length >= 2 && (clientes.dados ?? []).length === 0 && !clientes.carregando && (
              <p className="mq-note mq-note--info">
                <Icone nome="alert" />
                <span>
                  Ninguém com esse nome. Você pode vender assim mesmo — o nome
                  fica gravado na venda e o cadastro pode vir depois.
                  <button
                    type="button"
                    className="mq-btn mq-btn--link"
                    onClick={() => { setClienteNome(buscaCliente.trim()); setBuscaCliente(''); }}
                  >
                    Vender para &quot;{buscaCliente.trim()}&quot;
                  </button>
                </span>
              </p>
            )}
          </>
        )}

        <div className="mq-grid mq-grid--2">
          <label className="mq-field">
            <span>Data da venda</span>
            <input
              className="mq-input"
              type="date"
              value={data}
              max={hoje}
              onChange={(e) => setData(e.target.value)}
            />
            <small>quando a peça saiu — pode ser de ontem</small>
          </label>
          <div className="mq-field">
            <span>Local ou canal</span>
            <p className="mq-hint">
              <b>Balcão.</b> O registro de venda do sistema grava sempre
              <code> origem = &apos;balcao&apos;</code>; canal por venda ainda
              não é aceito por <code>POST /api/vendas</code>. O canal que
              aparece no histórico vem da planilha importada. Anote o local na
              observação se ele importar para esta venda.
            </p>
          </div>
        </div>

        <div className="mq-row mq-row--end">
          <button type="button" className="mq-btn mq-btn--primary" onClick={() => setPasso('pagamento')}>
            Continuar para pagamento
          </button>
        </div>
      </PainelDoPasso>

      {/* ═════════════════════════════════════════════ 3 · pagamento */}
      <PainelDoPasso
        indice={3}
        titulo="Pagamento"
        sub="Registre o que entrou e o que ficou pendente."
        resumo={pago ? `Pago em ${fmtData(dataPagamento)}` : 'Fica a receber'}
        aberto={passo === 'pagamento'}
        aoAlternar={() => setPasso('pagamento')}
      >
        <dl className="mq-figures">
          <div><dt>Valor da venda</dt><dd>{money(total)}</dd>
            <small>{pecas} {plural(pecas, 'peça', 'peças')}</small></div>
          <div className="is-ok"><dt>Valor recebido</dt><dd>{money(recebido)}</dd>
            <small>dinheiro confirmado</small></div>
          <div className={aReceber > 0 ? 'is-risk' : ''}><dt>Valor a receber</dt><dd>{money(aReceber)}</dd>
            <small>saldo cobrável</small></div>
        </dl>

        <div className="mq-grid mq-grid--2">
          <label className="mq-field">
            <span>Situação</span>
            <select
              className="mq-select"
              value={pago ? 'paga' : 'aberta'}
              onChange={(e) => setPago(e.target.value === 'paga')}
            >
              <option value="paga">Já foi paga</option>
              <option value="aberta">Fica a receber</option>
            </select>
          </label>

          {pago && (
            <label className="mq-field">
              <span>Data efetiva do pagamento</span>
              <input
                className="mq-input"
                type="date"
                value={dataPagamento}
                max={hoje}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
              <small>
                quando o dinheiro entrou — é esta data que manda no
                faturamento, e ela pode não ser a da venda
              </small>
            </label>
          )}
        </div>

        <p className="mq-note mq-note--info">
          <Icone nome="alert" />
          <span>
            <b>Um recebimento, não vários.</b> O protótipo prevê uma tabela de
            pagamentos; o backend quita a venda por INTEIRO
            (<code>POST /api/vendas/:id/pagamento</code>) e recebimento em
            partes é a decisão D2, ainda fechada. Registrar dois pagamentos
            aqui seria simular uma capacidade que o servidor não tem.
          </span>
        </p>

        <label className="mq-field">
          <span>Observação da venda <small>opcional</small></span>
          <textarea
            className="mq-textarea"
            placeholder="ex.: atendimento no grupo VIP"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </label>
      </PainelDoPasso>

      {erros.length > 0 && (
        <div className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>{erros.map((e) => <span key={e} style={{ display: 'block' }}>{e}</span>)}</span>
        </div>
      )}

      {recusa && (
        <p className="mq-note mq-note--risk" role="alert">
          <Icone nome="alert" />
          <span>{recusa}</span>
        </p>
      )}

      <footer className="mq-venda-rodape">
        <b>{pecas} {plural(pecas, 'peça', 'peças')}</b>
        <span className="mq-spread">
          <span>Subtotal <b className="mq-money">{money(total + desconto)}</b></span>
          {desconto > 0 && <span>Desconto <b className="mq-money">{money(desconto)}</b></span>}
          <span>Total <b className="mq-money mq-money--lg">{money(total)}</b></span>
        </span>
        <button
          type="button"
          className="mq-btn mq-btn--primary mq-btn--lg"
          disabled={erros.length > 0}
          onClick={() => setRevisando(true)}
        >
          <Icone nome="check" />
          Finalizar venda
        </button>
      </footer>

      {revisando && (
        <Revisao
          clienteNome={clienteNome}
          clienteId={clienteId}
          data={data}
          dataPagamento={pago ? dataPagamento : null}
          linhas={linhas}
          composicoes={composicoes}
          total={total}
          desconto={desconto}
          recebido={recebido}
          aReceber={aReceber}
          observacao={observacao}
          enviando={enviando}
          aoVoltar={() => setRevisando(false)}
          aoConfirmar={registrar}
        />
      )}

      {cadastrando && (
        <CadastroRapido
          conexao={conexao}
          aoFechar={() => setCadastrando(false)}
          aoCriar={(c) => {
            setClienteId(c.id);
            setClienteNome(c.nome);
            setCadastrando(false);
            setBuscaCliente('');
          }}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════ o passo dobrável */

function PainelDoPasso({
  indice, titulo, sub, resumo, aberto, aoAlternar, children,
}: {
  indice: number;
  titulo: string;
  sub: string;
  resumo: string;
  aberto: boolean;
  aoAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={aberto ? 'mq-card mq-passo is-open' : 'mq-card mq-passo'}>
      <button type="button" className="mq-passo__cabeca" aria-expanded={aberto} onClick={aoAlternar}>
        <span className="mq-badge mq-badge--brand">{indice}</span>
        <span className="mq-item__main">
          <b>{titulo}</b>
          <small>{sub}</small>
        </span>
        <span className="mq-item__side"><b>{resumo}</b></span>
        <Icone nome="chevron" />
      </button>
      {aberto && <div className="mq-card__body mq-stack">{children}</div>}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════ a revisão */

function Revisao({
  clienteNome, clienteId, data, dataPagamento, linhas, composicoes,
  total, desconto, recebido, aReceber, observacao, enviando, aoVoltar, aoConfirmar,
}: {
  clienteNome: string;
  clienteId: number | null;
  data: string;
  dataPagamento: string | null;
  linhas: LinhaDoCarrinho[];
  composicoes: ComposicaoDoColar[];
  total: number;
  desconto: number;
  recebido: number;
  aReceber: number;
  observacao: string;
  enviando: boolean;
  aoVoltar: () => void;
  aoConfirmar: () => void;
}) {
  const pecas = pecasDoCarrinho(linhas) + composicoes.length;
  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoVoltar} />
      <div className="mq-modal mq-modal--wide" role="dialog" aria-modal="true" aria-label="Revisão final">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">Revisão final</p>
            <h2 className="mq-title">Confira antes de confirmar</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoVoltar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-modal__body mq-stack">
          <dl className="mq-figures">
            <div>
              <dt>Cliente</dt>
              <dd>{clienteNome || 'Não informada'}</dd>
              <small>{clienteId ? `cadastro #${clienteId}` : 'sem cadastro — o nome fica na venda'}</small>
            </div>
            <div>
              <dt>Data da venda</dt>
              <dd>{fmtData(data)}</dd>
              <small>quando a peça saiu</small>
            </div>
            <div>
              <dt>Data do pagamento</dt>
              <dd>{dataPagamento ? fmtData(dataPagamento) : '—'}</dd>
              <small>{dataPagamento ? 'quando o dinheiro entrou' : 'fica a receber'}</small>
            </div>
            <div>
              <dt>Registro</dt>
              <dd>{fmtData(hojeISO())}</dd>
              <small>hoje — guardado pelo servidor, não editável</small>
            </div>
          </dl>

          <section>
            <h3 className="mq-subtitle">Itens · {pecas} {plural(pecas, 'peça', 'peças')}</h3>
            <dl className="mq-dl">
              {linhas.map((l) => (
                <div key={l.sku}>
                  <dt>
                    {l.qtd}× {l.desc}
                    {temDesconto(l) ? ` · ${l.descontoRotulo}` : ''}
                  </dt>
                  <dd>{money(totalDaLinha(l))}</dd>
                </div>
              ))}
              {composicoes.map((c, i) => (
                <div key={`${c.skuComercial}-${i}`}>
                  <dt>{descricaoDaComposicao(c)}</dt>
                  <dd>{money(c.preco)}</dd>
                </div>
              ))}
            </dl>
          </section>

          {observacao.trim() && (
            <section>
              <h3 className="mq-subtitle">Observação</h3>
              <p className="mq-lede">{observacao}</p>
            </section>
          )}

          <dl className="mq-dl">
            <div><dt>Preço de tabela</dt><dd>{money(total + desconto)}</dd></div>
            {desconto > 0 && <div><dt>Desconto</dt><dd>−{money(desconto)}</dd></div>}
            <div><dt>Total</dt><dd><b className="mq-money mq-money--lg">{money(total)}</b></dd></div>
            <div><dt>Recebido</dt><dd>{money(recebido)}</dd></div>
            <div><dt>A receber</dt><dd>{money(aReceber)}</dd></div>
          </dl>
        </div>

        <div className="mq-modal__foot">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoVoltar}>
            Voltar e revisar
          </button>
          <button
            type="button"
            className="mq-btn mq-btn--primary"
            disabled={enviando}
            onClick={aoConfirmar}
          >
            {enviando ? 'Registrando…' : `Confirmar venda de ${money(total)}`}
          </button>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════ cadastro rápido */

function CadastroRapido({
  conexao, aoFechar, aoCriar,
}: {
  conexao: Connection;
  aoFechar: () => void;
  aoCriar: (c: { id: number; nome: string }) => void;
}) {
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    if (!nome.trim()) { setErro('Diga o nome da cliente.'); return; }
    setEnviando(true);
    setErro('');
    const r = await criarCliente(conexao, { nome, tel })
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui cadastrar.' }));
    setEnviando(false);
    if (r && 'erro' in r) { setErro(String(r.erro)); return; }
    aoCriar({ id: r.id, nome: r.nome });
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-modal" role="dialog" aria-modal="true" aria-label="Cadastro rápido de cliente">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">Cadastro rápido</p>
            <h2 className="mq-title">Nova cliente</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>
        <div className="mq-modal__body mq-stack">
          <label className="mq-field">
            <span>Nome</span>
            <input className="mq-input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </label>
          <label className="mq-field">
            <span>WhatsApp <small>opcional</small></span>
            <input
              className="mq-input"
              type="tel"
              placeholder="(19) 9 0000-0000"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
            />
          </label>
          <p className="mq-hint">
            O cadastro completo — e-mail, CPF, cidade, observações — fica na
            ficha da cliente. Aqui só o que o balcão precisa para não parar.
          </p>
          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        </div>
        <div className="mq-modal__foot">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="mq-btn mq-btn--primary" disabled={enviando} onClick={salvar}>
            {enviando ? 'Salvando…' : 'Usar nesta venda'}
          </button>
        </div>
      </div>
    </>
  );
}
