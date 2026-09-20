import { useMemo, useState } from 'react';
import { Icone } from '../../components/Icone';
import { money, fmtData, hojeISO } from '../../domain/formato';
import { listarClientes } from '../clientes/api';
import { useApi } from '../../hooks/useApi';
import { registrarVenda } from './api';
import {
  corpoDaVenda, descontoDoCarrinho, impedimentos, linhaDoProduto,
  pecasDoCarrinho, temDesconto, totalDaLinha, totalDoCarrinho,
  type LinhaDoCarrinho,
} from './carrinho';
import type { Connection } from '../../services/client';
import type { ProdutoDoEstado } from './tipos';

interface Props {
  conexao: Connection;
  produtos: ProdutoDoEstado[];
  /** Quando a venda vem da ficha de uma cliente, ela já chega escolhida. */
  clienteInicial?: { id: number | null; nome: string } | null;
  aoFechar: () => void;
  aoRegistrar: (id: number) => void;
}

/** NOVA VENDA — o balcão.
 *
 *  Uma tela só, em três blocos que se leem de cima para baixo: para quem,
 *  o que levou, e como fechou. Não é um assistente de vários passos de
 *  propósito: no balcão a pessoa está com a cliente na frente, e voltar um
 *  passo para conferir um preço é pior do que ver tudo junto.
 *
 *  As duas datas aparecem separadas porque são duas: a venda pode ser de
 *  ontem (§28) e o pagamento pode ter sido em outro dia (§30). Fundi-las
 *  num "agora" é o defeito que a V2 veio consertar.
 */
export function NovaVenda({ conexao, produtos, clienteInicial, aoFechar, aoRegistrar }: Props) {
  const hoje = hojeISO();
  const [clienteId, setClienteId] = useState<number | null>(clienteInicial?.id ?? null);
  const [clienteNome, setClienteNome] = useState(clienteInicial?.nome ?? '');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [linhas, setLinhas] = useState<LinhaDoCarrinho[]>([]);
  const [buscaPeca, setBuscaPeca] = useState('');
  const [data, setData] = useState(hoje);
  const [pago, setPago] = useState(true);
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [observacao, setObservacao] = useState('');
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

  const erros = impedimentos(linhas, clienteNome, data, hoje);
  const total = totalDoCarrinho(linhas);
  const desconto = descontoDoCarrinho(linhas);

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
      linhas, clienteId, clienteNome, data, pago,
      dataPagamento: pago ? dataPagamento : null,
      observacao,
    });
    const r = await registrarVenda(conexao, corpo)
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar a venda.' }));
    setEnviando(false);
    if (r && 'erro' in r && r.erro) { setRecusa(String(r.erro)); return; }
    if (r && 'id' in r && typeof r.id === 'number') aoRegistrar(r.id);
    else aoFechar();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer mq-drawer--larga" role="dialog" aria-modal="true" aria-label="Nova venda">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Balcão</p>
            <h2 className="mq-title">Nova venda</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body">
          {/* ─────────────────────────────────────────── para quem */}
          <section className="mq-stack mq-stack--tight">
            <h3 className="mq-subtitle">Para quem</h3>
            {clienteNome ? (
              <p className="mq-chips">
                <span className="mq-chip mq-chip--brand">
                  {clienteNome}
                  {clienteId ? null : ' · sem cadastro'}
                  <button type="button" aria-label="Trocar cliente" onClick={() => {
                    setClienteNome('');
                    setClienteId(null);
                  }}>×</button>
                </span>
              </p>
            ) : (
              <>
                <label className="mq-search">
                  <Icone nome="search" />
                  <input
                    className="mq-input"
                    type="search"
                    placeholder="Buscar cliente por nome ou telefone"
                    aria-label="Buscar cliente"
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                  />
                </label>
                {(clientes.dados ?? []).length > 0 && (
                  <div className="mq-list mq-list--compacta">
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
                        Vender para "{buscaCliente.trim()}"
                      </button>
                    </span>
                  </p>
                )}
              </>
            )}
          </section>

          {/* ─────────────────────────────────────────── o que levou */}
          <section className="mq-stack mq-stack--tight">
            <h3 className="mq-subtitle">O que levou</h3>
            <label className="mq-search">
              <Icone nome="search" />
              <input
                className="mq-input"
                type="search"
                placeholder="Buscar peça por código ou nome"
                aria-label="Buscar peça"
                value={buscaPeca}
                onChange={(e) => setBuscaPeca(e.target.value)}
              />
            </label>

            {achados.length > 0 && (
              <div className="mq-list mq-list--compacta">
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

            {linhas.length === 0 ? (
              <p className="mq-hint">Nenhuma peça ainda.</p>
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
          </section>

          {/* ─────────────────────────────────────────── como fechou */}
          <section className="mq-stack mq-stack--tight">
            <h3 className="mq-subtitle">Como fechou</h3>

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
                <small>quando a peça saiu</small>
              </label>

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
            </div>

            {pago && (
              <label className="mq-field">
                <span>Data do pagamento</span>
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

            <label className="mq-field">
              <span>Observação</span>
              <input
                className="mq-input"
                placeholder="opcional"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </label>
          </section>

          {/* ─────────────────────────────────────────── a revisão */}
          <dl className="mq-confirm">
            <div>
              <dt>{pecasDoCarrinho(linhas)} {pecasDoCarrinho(linhas) === 1 ? 'peça' : 'peças'}</dt>
              <dd>{money(total)}</dd>
            </div>
            {desconto > 0 && (
              <div>
                <dt>Desconto dado</dt>
                <dd>{money(desconto)}</dd>
              </div>
            )}
            <div>
              <dt>{pago ? `Pago em ${fmtData(dataPagamento)}` : 'Fica a receber'}</dt>
              <dd>{pago ? money(total) : money(0)}</dd>
            </div>
          </dl>

          {erros.length > 0 && (
            <div className="mq-note mq-note--warn">
              <Icone nome="alert" />
              <span>
                {erros.map((e) => <span key={e} style={{ display: 'block' }}>{e}</span>)}
              </span>
            </div>
          )}

          {recusa && (
            <p className="mq-note mq-note--risk" role="alert">
              <Icone nome="alert" />
              <span>{recusa}</span>
            </p>
          )}

          <div className="mq-btns">
            <button
              type="button"
              className="mq-btn mq-btn--primary mq-btn--lg"
              disabled={enviando || erros.length > 0}
              onClick={registrar}
            >
              {enviando ? 'Registrando…' : `Registrar venda de ${money(total)}`}
            </button>
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
