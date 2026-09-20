import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData, hojeISO } from '../../domain/formato';
import { agrupar, cancelarVenda, listarVendas, pagarVenda } from './api';
import { NovaVenda } from './NovaVenda';
import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado, VendaAgrupada } from './tipos';

interface Props {
  conexao: Connection;
  /** `nova` abre o balcão direto — é o destino de "Nova venda para esta
   *  cliente", e por estar no endereço ele sobrevive a um recarregamento. */
  sub: string | null;
  aoNavegar: (sub: string | null) => void;
  estado: AppState | null;
  aoMudarEstoque: () => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
}

const COLUNAS = {
  gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) auto',
};

/** VENDAS — o que foi vendido, para quem, e o que falta receber.
 *
 *  A lista vem de `/api/vendas/lista`, que é uma visão de ITEM: a tela
 *  agrupa as linhas pela referência da venda, que é como o backend as
 *  amarra. Agrupar é factual; somar entre vendas não seria, e não é feito.
 */
export function VendasArea({
  conexao, sub, aoNavegar, estado, aoMudarEstoque, aoAbrirCliente,
}: Props) {
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [incluirCanceladas, setIncluirCanceladas] = useState(true);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<{ chave: string; texto: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca), 280);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useApi(
    (s) => listarVendas(conexao, { busca: buscaAtiva, incluirCanceladas }, s),
    [conexao, buscaAtiva, incluirCanceladas],
  );

  const vendas = useMemo(() => agrupar(lista.dados?.itens ?? []), [lista.dados]);
  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];

  const abrindoNova = sub === 'nova' || !!sub?.startsWith('nova:');
  /* `nova:<id>:<nome>` — o id pode vir vazio quando a ficha foi aberta pelo
     histórico da planilha e não existe cadastro. */
  const clienteInicial = (() => {
    if (!sub?.startsWith('nova:')) return null;
    const resto = sub.slice(5);
    const corte = resto.indexOf(':');
    if (corte === -1) return { id: null, nome: decodeURIComponent(resto) };
    const id = Number(resto.slice(0, corte));
    return {
      id: Number.isSafeInteger(id) && id > 0 ? id : null,
      nome: decodeURIComponent(resto.slice(corte + 1)),
    };
  })();

  async function marcarPaga(v: VendaAgrupada) {
    if (!v.id) return;
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
          <h1 className="mq-display">Vendas</h1>
          <p className="mq-lede">
            O que foi vendido, para quem, e o que ainda falta receber.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--primary" onClick={() => aoNavegar('nova')}>
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
          {lista.carregando ? 'buscando…' : `${vendas.length} ${vendas.length === 1 ? 'venda' : 'vendas'}`}
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
          <div className="mq-table" role="table" aria-label="Vendas">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
              <span>Data da venda</span>
              <span>Cliente e peças</span>
              <span>Valor</span>
              <span>Situação</span>
              <span>Ações</span>
            </div>
            {vendas.map((v) => (
              <div className="mq-tr" role="row" key={v.chave} style={COLUNAS}>
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
                  <small>
                    {v.pecas} {v.pecas === 1 ? 'peça' : 'peças'} ·{' '}
                    {v.itens.map((i) => i.produto ?? i.sku).slice(0, 3).join(', ')}
                    {v.itens.length > 3 ? '…' : ''}
                  </small>
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
            ))}
          </div>
        )}
      </section>

      {abrindoNova && (
        <NovaVenda
          conexao={conexao}
          produtos={produtos}
          clienteInicial={clienteInicial}
          aoFechar={() => aoNavegar(null)}
          aoRegistrar={() => {
            aoNavegar(null);
            lista.recarregar();
            aoMudarEstoque();
          }}
        />
      )}
    </>
  );
}
