import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData } from '../../domain/formato';
import { fotoDaPeca } from '../../domain/foto';
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado } from '../vendas/tipos';

interface Movimento {
  id: number;
  sku: string;
  variacao: string | null;
  tipo: string;
  qtd: number;
  origem: string | null;
  venda_id: number | null;
  maleta_id: number | null;
  obs: string | null;
  criado_em: string;
}

interface RazaoDoSku {
  sku: string;
  saldos: { desc: string; preco: number | null; qtd: number; consignado: number; disponivel: number };
  movimentos: Movimento[];
}

/* As colunas de `docs/ux/03-screens/estoque/master.html › products-table`,
   nesta ordem. A FOTO é a primeira — regra do projeto para qualquer
   listagem de estoque, e no protótipo ela é o que identifica a peça antes
   do nome. */
const COLUNAS = {
  gridTemplateColumns:
    '44px minmax(0,2.2fr) minmax(0,.9fr) 64px 72px 74px 68px minmax(0,1fr)',
};

interface Props {
  conexao: Connection;
  estado: AppState | null;
  carregando: boolean;
  erro: unknown;
  recarregar: () => void;
  /** EMBUTIDA na Visão geral, que é onde o protótipo a põe ("Todos os
   *  produtos"). Nesse modo ela não desenha os próprios KPIs nem a nota
   *  sobre custo: quem está acima dela já disse as duas coisas, e repetir
   *  faria a mesma tela responder duas vezes à mesma pergunta. */
  embutida?: boolean;
}

/** AS PEÇAS — onde está o patrimônio.
 *
 *  O saldo mostrado aqui é o que a RAZÃO diz, não um campo digitado:
 *  `produtos.qtd` só muda por um movimento, e é por isso que toda linha
 *  abre num extrato. A pergunta "por que tem 54 e não 56" tem resposta, e
 *  ela está a um toque.
 *
 *  Três números, e eles não são o mesmo: TOTAL é tudo o que existe, EM CASA
 *  é o que está aqui, COM REVENDEDORA é o que saiu em maleta e ainda é
 *  nosso. Vender o que está na maleta de alguém é como o estoque fica
 *  negativo, e por isso o número que o balcão usa é o disponível.
 *
 *  §D6 — NÃO existe custo confiável no sistema. O valor mostrado é o do
 *  PREÇO CADASTRADO, que é um fato do catálogo, e está rotulado como tal.
 *  Chamar isso de patrimônio seria inventar margem.
 */
export function PecasArea({
  conexao, estado, carregando, erro, recarregar, embutida = false,
}: Props) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string>('');
  const [aberta, setAberta] = useState<string | null>(null);

  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];

  const categorias = useMemo(
    () => [...new Set(produtos.map((p) => p.cat).filter(Boolean))].sort(),
    [produtos],
  );

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos
      .filter((p) => (categoria ? p.cat === categoria : true))
      .filter((p) => !t || p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .sort((a, b) => a.desc.localeCompare(b.desc));
  }, [produtos, busca, categoria]);

  const totais = useMemo(() => lista.reduce(
    (s, p) => ({
      pecas: s.pecas + p.qtd,
      emCasa: s.emCasa + (p.qtd - p.consignado),
      consignado: s.consignado + p.consignado,
      referencia: s.referencia + (p.preco ?? 0) * p.qtd,
      semPreco: s.semPreco + (p.semPreco ? 1 : 0),
    }),
    { pecas: 0, emCasa: 0, consignado: 0, referencia: 0, semPreco: 0 },
  ), [lista]);

  if (erro) return <section className="mq-card"><ErrorState erro={erro} aoTentarDeNovo={recarregar} /></section>;

  return (
    <>
      {!embutida && (
      <div className="mq-kpis">
        <div className="mq-kpi">
          <span className="mq-kpi__label">Peças</span>
          <span className="mq-kpi__value">{totais.pecas}</span>
          <span className="mq-kpi__foot">{lista.length} códigos</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Em casa</span>
          <span className="mq-kpi__value">{totais.emCasa}</span>
          <span className="mq-kpi__foot">aqui, prontas para vender</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Com revendedoras</span>
          <span className="mq-kpi__value">{totais.consignado}</span>
          <span className="mq-kpi__foot">na rua, e ainda nossas</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Valor de referência</span>
          <span className="mq-kpi__value"><i>R$</i>{money(totais.referencia).replace('R$ ', '')}</span>
          <span className="mq-kpi__foot">
            pelo preço cadastrado — não é custo
            {totais.semPreco > 0 ? `, e ${totais.semPreco} sem preço` : ''}
          </span>
        </div>
      </div>
      )}

      {!embutida && (
        <p className="mq-note mq-note--info">
          <Icone nome="alert" />
          <span>
            <b>Este valor não é patrimônio.</b> Ele é a soma do preço de venda
            cadastrado, que é um fato do catálogo. O sistema não guarda custo
            histórico confiável, e inventar um transformaria margem em chute.
          </span>
        </p>
      )}

      <div className="mq-filters">
        <label className="mq-search">
          <Icone nome="search" />
          <input
            className="mq-input"
            type="search"
            placeholder="Buscar por código ou nome"
            aria-label="Buscar peça"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <select
          className="mq-select"
          aria-label="Categoria"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="mq-filters__count">
          {carregando ? 'carregando…' : `${lista.length} ${lista.length === 1 ? 'peça' : 'peças'}`}
        </span>
      </div>

      <section className="mq-card mq-card--flush">
        {lista.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="box" /></span>
            <h3>Nenhuma peça com esse filtro</h3>
            <p>Tente outro termo, ou limpe a categoria.</p>
          </div>
        ) : (
          <div className="mq-table" role="table" aria-label="Peças">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
              <span aria-label="Foto" />
              <span>Produto</span>
              <span>Categoria</span>
              <span className="mq-cell--num">Total</span>
              <span className="mq-cell--num">Em casa</span>
              <span className="mq-cell--num">Revend.</span>
              <span className="mq-cell--num">Na loja</span>
              <span className="mq-cell--num">Valor ref.</span>
            </div>
            {lista.map((p) => (
              <button
                type="button"
                className="mq-tr"
                key={p.sku}
                style={COLUNAS}
                onClick={() => setAberta(p.sku)}
              >
                {/* A FOTO primeiro — regra do projeto para qualquer
                    listagem de estoque, e no protótipo é o que identifica
                    a peça antes do nome. Sem imagem, o losango da marca:
                    um `<img>` quebrado é pior que um vazio desenhado. */}
                <span className="mq-thumb" aria-hidden="true">
                  {fotoDaPeca(p) ? <img src={fotoDaPeca(p)!} alt="" loading="lazy" /> : '◇'}
                </span>
                <span className="mq-cell">
                  <b>{p.desc}</b>
                  <small className="mq-sku">SKU {p.sku}</small>
                </span>
                <span className="mq-cell">
                  {p.cat ? (
                    <em className="mq-chip mq-chip--soft">{p.cat}</em>
                  ) : (
                    <small className="mq-sku">sem categoria</small>
                  )}
                </span>
                <span className="mq-cell mq-cell--num" data-label="Total">
                  <b className="mq-qty">{p.qtd}</b>
                  {p.status !== 'ativo' && <small>{p.status}</small>}
                </span>
                <span className="mq-cell mq-cell--num" data-label="Em casa">
                  <b className="mq-qty">{p.qtd - p.consignado}</b>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Revendedoras">
                  <b className="mq-qty">{p.consignado}</b>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Na loja">
                  {/* `estoqueLoja` só existe depois de uma sincronização.
                      Sem ela, a coluna diz que não sabe — e não "0", que
                      afirmaria que a loja não anuncia esta peça. */}
                  {p.estoqueLoja == null
                    ? <small className="mq-sku">—</small>
                    : <b className="mq-qty">{p.estoqueLoja}</b>}
                </span>
                <span className="mq-cell mq-cell--num" data-label="Valor de referência">
                  <b className="mq-money">{p.preco === null ? '—' : money(p.preco)}</b>
                  {p.semPreco && <small>sem preço</small>}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {aberta && <Razao conexao={conexao} sku={aberta} aoFechar={() => setAberta(null)} />}
    </>
  );
}

/** O extrato de uma peça: a razão contábil dela, movimento a movimento.
 *
 *  É esta gaveta que responde "por que o saldo é este". Cada linha diz o
 *  que aconteceu, quanto mudou e de onde veio — e a soma delas É o saldo,
 *  por construção. */
function Razao({ conexao, sku, aoFechar }: { conexao: Connection; sku: string; aoFechar: () => void }) {
  const razao = useApi(
    (s) => chamar<RazaoDoSku>(conexao, 'GET', `/api/estoque/${encodeURIComponent(sku)}/movimentos`, undefined, { signal: s }),
    [conexao, sku],
  );

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const soma = (razao.dados?.movimentos ?? []).reduce((s, m) => s + Number(m.qtd), 0);
  const fecha = razao.dados ? soma === razao.dados.saldos.qtd : true;

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer" role="dialog" aria-modal="true" aria-label={`Movimentos de ${sku}`}>
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">{sku}</p>
            <h2 className="mq-title">{razao.dados?.saldos.desc ?? 'Movimentos'}</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body">
          {razao.erro ? <ErrorState erro={razao.erro} aoTentarDeNovo={razao.recarregar} /> : null}

          {razao.dados && (
            <>
              <dl className="mq-dl">
                <div><dt>Total</dt><dd className="mq-qty">{razao.dados.saldos.qtd}</dd></div>
                <div><dt>Com revendedoras</dt><dd className="mq-qty">{razao.dados.saldos.consignado}</dd></div>
                <div><dt>Disponível para vender</dt><dd className="mq-qty">{razao.dados.saldos.disponivel}</dd></div>
                <div>
                  <dt>Preço cadastrado</dt>
                  <dd className="mq-money">
                    {razao.dados.saldos.preco === null ? '—' : money(razao.dados.saldos.preco)}
                  </dd>
                </div>
              </dl>

              <p className={fecha ? 'mq-note mq-note--ok' : 'mq-note mq-note--risk'}>
                <Icone nome={fecha ? 'check' : 'alert'} />
                <span>
                  {fecha
                    ? `Os ${razao.dados.movimentos.length} movimentos somam ${soma}, que é o saldo. A razão fecha.`
                    : `Os movimentos somam ${soma}, e o saldo diz ${razao.dados.saldos.qtd}. Isto é um defeito, não um estado.`}
                </span>
              </p>

              <div className="mq-timeline">
                {razao.dados.movimentos.slice().reverse().map((m) => (
                  <div className="mq-timeline__row" key={m.id}>
                    <span className="mq-timeline__dot">
                      <Icone nome={m.qtd < 0 ? 'sale' : 'box'} />
                    </span>
                    <span className="mq-timeline__body">
                      <b>
                        {m.tipo} {m.qtd > 0 ? '+' : ''}{m.qtd}
                        {m.variacao ? ` · ${m.variacao}` : ''}
                      </b>
                      <small>
                        {fmtData(m.criado_em)} · {m.origem ?? 'sem origem'}
                        {m.venda_id ? ` · venda #${m.venda_id}` : ''}
                        {m.maleta_id ? ` · maleta #${m.maleta_id}` : ''}
                        {m.obs ? ` · ${m.obs}` : ''}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
