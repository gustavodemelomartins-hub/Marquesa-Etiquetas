import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData, hojeISO, plural } from '../../domain/formato';
import { agrupar, cancelarVenda, listarVendas, pagarVenda } from './api';
import type { Connection } from '../../services/client';
import type { VendaAgrupada } from './tipos';

interface Props {
  conexao: Connection;
  aoMudarEstoque: () => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
  aoNovaVenda: () => void;
}

const COLUNAS = {
  gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) auto',
};

/** HISTÓRICO DE VENDAS — a lista, com a venda reconstruída.
 *
 *  `/api/vendas/lista` é uma visão de ITEM: a tela agrupa as linhas pela
 *  referência, que é como o backend as amarra. Agrupar é factual; somar
 *  entre vendas não seria, e não é feito.
 *
 *  Separado do Painel de propósito: o Painel responde "como foi o período" e
 *  esta lista responde "o que aconteceu com ESTA venda". Misturar as duas
 *  fazia a tela de Vendas ser uma tabela e nada mais.
 */
export function HistoricoVendas({
  conexao, aoMudarEstoque, aoAbrirCliente, aoNovaVenda,
}: Props) {
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [incluirCanceladas, setIncluirCanceladas] = useState(true);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<{ chave: string; texto: string } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca), 280);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useApi(
    (s) => listarVendas(conexao, { busca: buscaAtiva, incluirCanceladas }, s),
    [conexao, buscaAtiva, incluirCanceladas],
  );

  const vendas = useMemo(() => agrupar(lista.dados?.itens ?? []), [lista.dados]);

  async function marcarPaga(v: VendaAgrupada) {
    if (!v.id) return;
    /* §30 — a data EFETIVA do pagamento, não a de hoje. Sem ela, quem vendeu
       em 10/09 e recebeu em 12/09 vê o dinheiro entrar no dia do clique. */
    const data = prompt('Em que dia o dinheiro entrou? (AAAA-MM-DD)', hojeISO());
    if (!data) return;
    setOcupada(v.chave);
    setRecusa(null);
    const r = await pagarVenda(conexao, v.id, data.trim())
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar.' }));
    setOcupada(null);
    if (r && 'erro' in r && r.erro) setRecusa({ chave: v.chave, texto: String(r.erro) });
    else lista.recarregar();
  }

  async function cancelar(v: VendaAgrupada) {
    if (!v.id) return;
    if (!confirm(
      `Cancelar a venda de ${fmtData(v.data)} para ${v.cliente ?? 'cliente sem nome'}?\n\n`
      + 'A peça volta para o estoque e a venda continua no histórico, marcada como cancelada.',
    )) return;
    setOcupada(v.chave);
    setRecusa(null);
    const r = await cancelarVenda(conexao, v.id)
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui cancelar.' }));
    setOcupada(null);
    if (r && 'erro' in r && r.erro) setRecusa({ chave: v.chave, texto: String(r.erro) });
    else { lista.recarregar(); aoMudarEstoque(); }
  }

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Operação</p>
          <h1 className="mq-display">Histórico de vendas</h1>
          <p className="mq-lede">
            O que foi vendido, para quem, e o que ainda falta receber.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--primary" onClick={aoNovaVenda}>
            <Icone nome="plus" />
            Nova venda
          </button>
        </div>
      </div>

      <div className="mq-filters">
        <label className="mq-search">
          <Icone nome="search" />
          <input
            className="mq-input"
            type="search"
            placeholder="Buscar por cliente, peça ou código"
            aria-label="Buscar venda"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <div className="mq-chipset" role="group" aria-label="Canceladas">
          <button type="button" aria-pressed={incluirCanceladas} onClick={() => setIncluirCanceladas(true)}>
            Todas
          </button>
          <button type="button" aria-pressed={!incluirCanceladas} onClick={() => setIncluirCanceladas(false)}>
            Sem canceladas
          </button>
        </div>
        <span className="mq-filters__count">
          {lista.carregando ? 'buscando…' : `${vendas.length} ${plural(vendas.length, 'venda', 'vendas')}`}
        </span>
      </div>

      <section className="mq-card mq-card--flush">
        {lista.erro ? (
          <ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} />
        ) : vendas.length === 0 && !lista.carregando ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="sale" /></span>
            <h3>{buscaAtiva ? 'Nenhuma venda com esse termo' : 'Nenhuma venda registrada'}</h3>
            <p>Registre a primeira e ela aparece aqui, na ficha da cliente e no financeiro.</p>
          </div>
        ) : (
          <div className="mq-scroll-x">
            <div className="mq-table" role="table" aria-label="Vendas">
              <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
                <span>Data da venda</span>
                <span>Cliente e peças</span>
                <span>Valor</span>
                <span>Situação</span>
                <span>Ações</span>
              </div>
              {vendas.map((v) => (
                <div key={v.chave}>
                  <div className="mq-tr" role="row" style={COLUNAS}>
                    <span className="mq-cell">
                      <b className="mq-date">{fmtData(v.data)}</b>
                      <small>
                        {v.fonte === 'historico' ? 'planilha' : `venda #${v.referencia}`}
                        {v.canal ? ` · ${v.canal}` : ''}
                      </small>
                    </span>
                    <span className="mq-cell">
                      {v.clienteNorm || v.cliente ? (
                        <button
                          type="button"
                          className="mq-btn mq-btn--link"
                          onClick={() => aoAbrirCliente({ norm: v.clienteNorm ?? '' })}
                        >
                          {v.cliente ?? 'Cliente não identificada'}
                        </button>
                      ) : <b>Cliente não identificada</b>}
                      <button
                        type="button"
                        className="mq-btn mq-btn--link mq-btn--sm"
                        aria-expanded={aberta === v.chave}
                        onClick={() => setAberta(aberta === v.chave ? null : v.chave)}
                      >
                        {v.pecas} {plural(v.pecas, 'peça', 'peças')} · ver itens
                      </button>
                    </span>
                    <span className="mq-cell mq-cell--num">
                      <b className="mq-money">{money(v.valor)}</b>
                      {v.indeterminado.length > 0 && <small>recebido indeterminado</small>}
                    </span>
                    <span className="mq-cell">
                      {v.cancelada ? (
                        <span className="mq-status">cancelada</span>
                      ) : v.pago ? (
                        <span className="mq-status mq-status--ok">paga</span>
                      ) : (
                        <>
                          <span className="mq-status mq-status--risk">a receber</span>
                          {v.aReceber !== null && <small>{money(v.aReceber)}</small>}
                        </>
                      )}
                    </span>
                    <span className="mq-cell">
                      {v.fonte === 'operacional' && !v.cancelada && (
                        <span className="mq-btns">
                          {!v.pago && (
                            <button
                              type="button"
                              className="mq-btn mq-btn--primary mq-btn--sm"
                              disabled={ocupada === v.chave}
                              onClick={() => marcarPaga(v)}
                            >
                              Recebi
                            </button>
                          )}
                          <button
                            type="button"
                            className="mq-btn mq-btn--ghost mq-btn--sm"
                            disabled={ocupada === v.chave}
                            onClick={() => cancelar(v)}
                          >
                            Cancelar
                          </button>
                        </span>
                      )}
                      {recusa?.chave === v.chave && <small className="mq-money--risk">{recusa.texto}</small>}
                    </span>
                  </div>

                  {aberta === v.chave && (
                    <div className="mq-card__body mq-card__body--flush">
                      <dl className="mq-dl">
                        {v.itens.map((i) => (
                          <div key={i.id}>
                            <dt>{i.produto ?? i.sku} <small className="mq-sku">{i.sku}</small></dt>
                            <dd>{i.qtd} × {money(i.valor)}</dd>
                          </div>
                        ))}
                      </dl>
                      {v.indeterminado.length > 0 && (
                        <p className="mq-hint">
                          O servidor declarou indeterminado: {v.indeterminado.join(', ')}.
                          A tela repete em vez de mostrar zero.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
