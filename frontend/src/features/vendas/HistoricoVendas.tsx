import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData, hojeISO, plural } from '../../domain/formato';
import { cancelarVenda, listarVendasFeitas, pagarVenda, paraTela } from './api';
import type { Connection } from '../../services/client';
import type { VendaFeita } from './tipos';

interface Props {
  conexao: Connection;
  aoMudarEstoque: () => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
  aoAbrirAReceber: () => void;
}

const COLUNAS = {
  gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1.6fr) minmax(0,.9fr) minmax(0,1fr) 20px',
};

const POR_PAGINA = 50;

/** VENDAS FEITAS — uma linha é uma VENDA; as peças ficam atrás de um clique.
 *
 *  A lista vem pronta do servidor (`GET /api/vendas/feitas`): ele é quem sabe
 *  quais peças pertencem a qual venda. Até 01/10/2026 esta tela agrupava a
 *  lista de itens pela `referencia`, que nas vendas da planilha é o Nº da
 *  linha — e a compra de 5 peças por R$ 504,00 aparecia 5 vezes. */
export function HistoricoVendas({
  conexao, aoMudarEstoque, aoAbrirCliente, aoAbrirAReceber,
}: Props) {
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [incluirCanceladas, setIncluirCanceladas] = useState(true);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [aberta, setAberta] = useState<VendaFeita | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setBuscaAtiva(busca); setLimite(POR_PAGINA); }, 280);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useApi(
    (s) => listarVendasFeitas(conexao, { busca: buscaAtiva, incluirCanceladas, limite }, s),
    [conexao, buscaAtiva, incluirCanceladas, limite],
  );

  const vendas = useMemo(() => (lista.dados?.vendas ?? []).map(paraTela), [lista.dados]);
  const total = lista.dados?.total ?? 0;

  /* Depois de receber ou cancelar, a venda aberta passa a ser a versão nova
     que veio do servidor — nunca um remendo feito aqui. */
  useEffect(() => {
    if (!aberta) return;
    const nova = vendas.find((v) => v.chave === aberta.chave);
    if (nova && nova !== aberta) setAberta(nova);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendas]);

  return (
    <>
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
          <button type="button" aria-pressed={incluirCanceladas} onClick={() => { setIncluirCanceladas(true); setLimite(POR_PAGINA); }}>
            Todas
          </button>
          <button type="button" aria-pressed={!incluirCanceladas} onClick={() => { setIncluirCanceladas(false); setLimite(POR_PAGINA); }}>
            Sem canceladas
          </button>
        </div>
        <span className="mq-filters__count">
          {lista.carregando && !lista.dados ? 'buscando…' : `${total} ${plural(total, 'venda', 'vendas')}`}
        </span>
      </div>

      <section className="mq-card mq-card--flush">
        {lista.erro ? (
          <ErrorState erro={lista.erro} aoTentarDeNovo={lista.recarregar} />
        ) : vendas.length === 0 && !lista.carregando ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="sale" /></span>
            <h3>{buscaAtiva ? 'Nenhuma venda com esse termo' : 'Nenhuma venda registrada'}</h3>
          </div>
        ) : (
          <div className="mq-table" role="table" aria-label="Vendas">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
              <span>Data</span>
              <span>Cliente</span>
              <span className="mq-th--num">Valor</span>
              <span>Situação</span>
              <span />
            </div>
            {vendas.map((v) => (
              <button
                key={v.chave}
                type="button"
                className="mq-tr"
                role="row"
                style={COLUNAS}
                aria-label={`Venda de ${fmtData(v.data)} para ${v.cliente ?? 'cliente não identificada'}`}
                onClick={() => setAberta(v)}
              >
                <span className="mq-cell">
                  <b className="mq-date">{v.data ? fmtData(v.data) : 'sem data'}</b>
                </span>
                <span className="mq-cell">
                  <b>{v.cliente ?? 'Cliente não identificada'}</b>
                  <small>{v.pecas} {plural(v.pecas, 'peça', 'peças')} · ver itens</small>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Valor">
                  <b className="mq-money">{v.valor === null ? '—' : money(v.valor)}</b>
                </span>
                <span className="mq-cell mq-cell--canto">
                  <Situacao venda={v} />
                </span>
                <Icone nome="chevron" className="mq-ico mq-tr__chev" />
              </button>
            ))}
          </div>
        )}
        {vendas.length < total && !lista.erro && (
          <div className="mq-card__foot">
            <button
              type="button"
              className="mq-btn mq-btn--ghost"
              disabled={lista.carregando}
              onClick={() => setLimite((n) => n + POR_PAGINA)}
            >
              {lista.carregando ? 'Carregando…' : `Mostrar mais (${vendas.length} de ${total})`}
            </button>
          </div>
        )}
      </section>

      {aberta && (
        <DetalheDaVenda
          conexao={conexao}
          venda={aberta}
          aoFechar={() => setAberta(null)}
          aoMudou={(estoque) => { lista.recarregar(); if (estoque) aoMudarEstoque(); }}
          aoAbrirCliente={(c) => { setAberta(null); aoAbrirCliente(c); }}
          aoAbrirAReceber={() => { setAberta(null); aoAbrirAReceber(); }}
        />
      )}
    </>
  );
}

function Situacao({ venda: v }: { venda: VendaFeita }) {
  if (v.situacao === 'cancelada') return <span className="mq-status">cancelada</span>;
  if (v.situacao === 'paga') return <span className="mq-status mq-status--ok">paga</span>;
  if (v.situacao === 'sem_informacao') return <span className="mq-status">sem informação</span>;
  return (
    <>
      <span className="mq-status mq-status--risk">a receber</span>
      {v.situacao === 'parcial' && v.aReceber !== null && <small>falta {money(v.aReceber)}</small>}
    </>
  );
}

/** A venda aberta: as peças, o dinheiro e o que dá para fazer com ela. */
function DetalheDaVenda({
  conexao, venda: v, aoFechar, aoMudou, aoAbrirCliente, aoAbrirAReceber,
}: {
  conexao: Connection;
  venda: VendaFeita;
  aoFechar: () => void;
  aoMudou: (mexeuNoEstoque: boolean) => void;
  aoAbrirCliente: (chave: { id: number } | { norm: string }) => void;
  aoAbrirAReceber: () => void;
}) {
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [ocupada, setOcupada] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const doSistema = v.fonte === 'operacional' && v.id !== null;
  const emAberto = v.situacao === 'a_receber' || v.situacao === 'parcial';

  async function receber() {
    if (!v.id) return;
    setOcupada(true);
    setErro('');
    const r = await pagarVenda(conexao, v.id, dataPagamento)
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar.' }));
    setOcupada(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoMudou(false);
  }

  async function cancelar() {
    if (!v.id) return;
    if (!confirm(
      `Cancelar a venda de ${fmtData(v.data)} para ${v.cliente ?? 'cliente sem nome'}?\n\n`
      + 'As peças voltam para o estoque e a venda fica marcada como cancelada.',
    )) return;
    setOcupada(true);
    setErro('');
    const r = await cancelarVenda(conexao, v.id)
      .catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui cancelar.' }));
    setOcupada(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoMudou(true);
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-modal mq-modal--wide" role="dialog" aria-modal="true" aria-label="Detalhe da venda">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">
              Venda de {v.data ? fmtData(v.data) : 'data desconhecida'}
              {v.canal ? ` · ${v.canal}` : ''}
            </p>
            <h2 className="mq-title">
              {v.clienteNorm ? (
                <button
                  type="button"
                  className="mq-btn mq-btn--link"
                  onClick={() => aoAbrirCliente({ norm: v.clienteNorm ?? '' })}
                >
                  {v.cliente ?? 'Cliente não identificada'}
                </button>
              ) : (v.cliente ?? 'Cliente não identificada')}
            </h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-modal__body">
          <div className="mq-table" role="table" aria-label="Peças da venda">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS_ITENS}>
              <span>Peça</span>
              <span className="mq-th--num">Qtd</span>
              <span className="mq-th--num">Preço</span>
              <span className="mq-th--num">Subtotal</span>
            </div>
            {v.itens.map((i) => (
              <div key={String(i.id)} className="mq-tr" role="row" style={COLUNAS_ITENS}>
                <span className="mq-cell">
                  <b>{i.produto ?? i.sku}</b>
                  <small>
                    <span className="mq-sku">{i.sku}</span>
                    {i.descontoValor ? ` · desconto ${money(i.descontoValor)}` : ''}
                    {i.descontoRotulo ? ` (${i.descontoRotulo})` : ''}
                  </small>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Qtd">{i.qtd}</span>
                <span className="mq-cell mq-cell--num" data-label="Preço">
                  {i.precoUnit === null ? '—' : money(i.precoUnit)}
                </span>
                <span className="mq-cell mq-cell--num" data-label="Subtotal">
                  <b>{i.valor === null ? '—' : money(i.valor)}</b>
                </span>
              </div>
            ))}
          </div>

          <dl className="mq-dl">
            <div><dt>Total da venda</dt><dd>{v.valor === null ? 'não informado' : money(v.valor)}</dd></div>
            <div><dt>Recebido</dt><dd>{v.recebido === null ? 'não informado' : money(v.recebido)}</dd></div>
            <div><dt>A receber</dt><dd>{v.aReceber === null ? 'não informado' : money(v.aReceber)}</dd></div>
            <div><dt>Situação</dt><dd><Situacao venda={v} /></dd></div>
          </dl>

          {doSistema && emAberto && (
            <label className="mq-field">
              <span>Data em que o dinheiro entrou</span>
              <input
                className="mq-input"
                type="date"
                value={dataPagamento}
                max={hojeISO()}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </label>
          )}

          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

          <p className="mq-hint">
            {v.fonte === 'historico'
              ? `Venda da planilha antiga.${emAberto && !v.emAReceber ? ' Ainda não está em A receber.' : ''}`
              : `Venda nº ${v.id} registrada no sistema.`}
          </p>
        </div>

        <div className="mq-modal__foot">
          {doSistema && !v.cancelada && (
            <button type="button" className="mq-btn mq-btn--ghost" disabled={ocupada} onClick={cancelar}>
              Cancelar venda
            </button>
          )}
          {doSistema && emAberto && (
            <button type="button" className="mq-btn mq-btn--primary" disabled={ocupada} onClick={receber}>
              {ocupada ? 'Registrando…' : `Recebi ${v.aReceber !== null ? money(v.aReceber) : ''}`.trim()}
            </button>
          )}
          {!doSistema && emAberto && v.emAReceber && (
            <button type="button" className="mq-btn mq-btn--primary" onClick={aoAbrirAReceber}>
              Ir para A receber
            </button>
          )}
          {(!emAberto || (!doSistema && !v.emAReceber)) && (
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Fechar</button>
          )}
        </div>
      </div>
    </>
  );
}

const COLUNAS_ITENS = {
  gridTemplateColumns: 'minmax(0,2fr) minmax(0,.4fr) minmax(0,.9fr) minmax(0,.9fr)',
};
