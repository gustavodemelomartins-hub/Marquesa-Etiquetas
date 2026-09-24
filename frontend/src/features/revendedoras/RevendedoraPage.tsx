import { useMemo, useState, type CSSProperties } from 'react';
import type { AppState, Reseller, Suitcase } from '../../types/api';
import { Kpi, Kpis } from '../../components/Kpi';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtData, money } from '../../domain/formato';
import { corDaCategoria } from '../../domain/categorias';
import {
  maletaAbertaDe, maletaEncerrada, precoEnvio, prazoDe,
  qtdMaleta, situacaoMaleta, valMaleta,
} from '../../domain/maletas';

interface Props {
  estado: AppState;
  revendedora: Reseller;
  aoCriarMaleta: () => void;
  aoAdicionarItens: () => void;
  aoFazerAcerto: () => void;
}

interface Acerto {
  enviadas?: number;
  vendidas?: number;
  totalVendido?: number;
  comissao?: number;
}

/** Perfil operacional da revendedora. A composição acompanha o protótipo,
 * enquanto números, preços e estados continuam vindo do domínio real. */
export function RevendedoraPage({
  estado, revendedora, aoCriarMaleta, aoAdicionarItens, aoFazerAcerto,
}: Props) {
  const [busca, setBusca] = useState('');
  const produtos = useMemo(() => new Map(estado.produtos.map((p) => [p.sku, p])), [estado.produtos]);
  const aberta = maletaAbertaDe(estado, revendedora.id);
  const fechadas = estado.maletas
    .filter((m) => m.revId === revendedora.id && maletaEncerrada(m))
    .sort((a, b) => (b.encerradaEm || '').localeCompare(a.encerradaEm || ''));
  const situacao = aberta ? situacaoMaleta(aberta, estado.config.prazoDias) : null;
  const pecas = aberta ? qtdMaleta(aberta) : 0;
  const valor = aberta ? valMaleta(aberta, produtos) : 0;

  const linhas = aberta
    ? Object.entries(aberta.itens).map(([sku, qtd]) => {
        const p = produtos.get(sku);
        return {
          sku, qtd, desc: p?.desc || '(fora do catálogo)', cat: p?.cat || 'Outros',
          preco: precoEnvio(aberta, sku, produtos),
        };
      }).sort((a, b) => a.cat.localeCompare(b.cat) || a.sku.localeCompare(b.sku))
    : [];
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const linhasVisiveis = termo
    ? linhas.filter((l) => `${l.sku} ${l.desc} ${l.cat}`.toLocaleLowerCase('pt-BR').includes(termo))
    : linhas;

  const porCategoria = new Map<string, number>();
  for (const linha of linhas) porCategoria.set(linha.cat, (porCategoria.get(linha.cat) || 0) + linha.qtd);
  const categorias = [...porCategoria]
    .map(([cat, qtd]) => ({ cat, qtd, pct: pecas ? Math.round((qtd / pecas) * 100) : 0 }))
    .sort((a, b) => b.qtd - a.qtd || a.cat.localeCompare(b.cat));
  const maiorCategoria = categorias[0]?.qtd || 1;

  return <>
    <Kpis>
      <Kpi rotulo="Peças com ela" valor={pecas} acento="rua" nota={aberta ? `Maleta #${aberta.id}` : 'Nenhuma maleta aberta'} />
      <Kpi rotulo="Valor na mão" valor={money(valor)} acento="valor" compacto nota="Preço do envio" />
      <Kpi rotulo="Acerto" valor={aberta ? fmtData(prazoDe(aberta, estado.config.prazoDias)) : '—'} acento="marca" compacto nota={situacao?.texto || 'Sem maleta na rua'} />
      <Kpi rotulo="Maletas fechadas" valor={fechadas.length} acento="casa" nota="Histórico de acertos" />
    </Kpis>

    {!aberta ? (
      <EmptyState
        titulo={`${revendedora.nome} não está com nenhuma maleta`}
        descricao="Monte uma nova maleta com as peças disponíveis no estoque de casa."
        acoes={<button type="button" className="btn btn-escrita" onClick={aoCriarMaleta}>+ Criar maleta</button>}
      />
    ) : (
      <div className="rev-profile-grid">
        <section className="painel rev-maleta-card" aria-labelledby="rev-maleta-titulo">
          <header className="rev-maleta-cabeca">
            <div>
              <span className="rev-eyebrow">{aberta.status === 'em_acerto' ? 'Maleta em acerto' : 'Maleta em aberto'}</span>
              <h2 id="rev-maleta-titulo">Maleta #{aberta.id}</h2>
              <p>Preços preservados desde o envio em {fmtData(aberta.abertaEm)}</p>
            </div>
            {situacao && <StatusBadge tom={situacao.tom}>{situacao.texto}</StatusBadge>}
          </header>

          {linhas.length > 7 && <label className="rev-maleta-busca">
            <span className="sr-only">Buscar item da maleta</span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, peça ou categoria" />
            <small>{linhasVisiveis.length} de {linhas.length} códigos</small>
          </label>}

          <div className="rev-maleta-lista" tabIndex={linhas.length > 7 ? 0 : undefined}>
            {!linhasVisiveis.length ? <p className="rev-maleta-vazia">Nenhuma peça corresponde à busca.</p> : linhasVisiveis.map((linha) => (
              <div className="rev-maleta-item" key={linha.sku}>
                <span className="rev-maleta-icone" aria-hidden="true">◇</span>
                <span className="rev-maleta-produto">
                  <b>{linha.sku} · {linha.desc}</b>
                  <small>Preço no envio: {linha.preco === null ? 'sem preço' : money(linha.preco)} · {linha.cat}</small>
                </span>
                <strong>× {linha.qtd}</strong>
                <span className="rev-maleta-valor">{linha.preco === null ? '—' : money(linha.qtd * linha.preco)}</span>
              </div>
            ))}
          </div>

          <footer className="rev-maleta-acoes">
            <span>{pecas} peças · {linhas.length} códigos</span>
            {aberta.status === 'aberta' && <button type="button" className="btn btn-leitura" onClick={aoAdicionarItens}>Adicionar itens</button>}
            <button type="button" className="btn btn-escrita" onClick={aoFazerAcerto}>Fazer acerto</button>
          </footer>
        </section>

        <aside className="painel rev-mix-card" aria-labelledby="rev-mix-titulo">
          <header><span className="rev-eyebrow">Distribuição</span><h2 id="rev-mix-titulo">Mix da maleta</h2></header>
          <div className="rev-mix-total"><b>{pecas}</b><span>peças</span></div>
          <ul className="rev-mix-lista">
            {categorias.map((categoria) => (
              <li key={categoria.cat} style={{ '--mix-cor': corDaCategoria(estado.categorias, categoria.cat) } as CSSProperties}>
                <div><span>{categoria.cat}</span><b>{categoria.qtd}</b><small>{categoria.pct}%</small></div>
                <span className="rev-mix-barra"><i style={{ width: `${Math.max(5, Math.round((categoria.qtd / maiorCategoria) * 100))}%` }} /></span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    )}

    <section className="painel rev-historico-card" aria-labelledby="rev-historico-titulo">
      <header className="painel-cabeca"><div><h2 id="rev-historico-titulo">Histórico de maletas</h2><p className="dica">Acertos encerrados e valores efetivos</p></div></header>
      {!fechadas.length ? <EmptyState titulo="Nenhuma maleta encerrada ainda" /> : (
        <div className="rev-historico-tabela" role="table" aria-label="Histórico de maletas">
          {fechadas.map((maleta) => <LinhaHistorico key={maleta.id} maleta={maleta} />)}
        </div>
      )}
    </section>
  </>;
}

function LinhaHistorico({ maleta }: { maleta: Suitcase }) {
  const acerto = (maleta.acerto ?? null) as Acerto | null;
  return <div className="rev-historico-linha" role="row">
    <span><b>Maleta #{maleta.id}</b><small>Fechada em {fmtData(maleta.encerradaEm)}</small></span>
    <span><small>Enviadas</small><b>{acerto?.enviadas ?? '—'}</b></span>
    <span><small>Vendidas</small><b>{acerto?.vendidas ?? '—'}</b></span>
    <span><small>Vendido</small><b>{acerto?.totalVendido === undefined ? '—' : money(acerto.totalVendido)}</b></span>
    <span><small>Comissão</small><b>{acerto?.comissao === undefined ? '—' : money(acerto.comissao)}</b></span>
    <StatusBadge tom="positivo">Encerrada</StatusBadge>
  </div>;
}
