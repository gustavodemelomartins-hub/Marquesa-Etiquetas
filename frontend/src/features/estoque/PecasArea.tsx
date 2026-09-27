import { useEffect, useMemo, useState } from 'react';
import type { Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money } from '../../domain/formato';
import { precisamDeAtencao } from '../../domain/estoque';
import { FotoDaPeca } from '../../components/FotoDaPeca';
import { NovoProduto } from '../catalogo/NovoProduto';
import { NO_PAINEL_CLASSICO } from '../../app/modulos';
import { FichaDaPeca } from './FichaDaPeca';
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado } from '../vendas/tipos';

/* A FOTO é a primeira coluna — regra do projeto para qualquer listagem de
   estoque: a peça se reconhece pela imagem antes do código. */
const COLUNAS = {
  gridTemplateColumns:
    '44px minmax(0,2.2fr) minmax(0,.9fr) 64px 72px 74px 68px minmax(0,1fr)',
};

/** Quantas linhas aparecem antes do "Mostrar mais". A lista inteira tem
 *  quase mil peças: desenhar todas de uma vez fazia a página ter cem telas
 *  de altura, e no telefone mais de trezentas. Quem procura uma peça usa a
 *  busca; quem quer olhar, pede mais. */
const POR_PAGINA = 60;

export type FiltroSituacao = 'ativo' | 'inativo' | 'arquivado' | 'todos' | 'incompleto';

const FILTROS: { id: FiltroSituacao; rotulo: string }[] = [
  { id: 'ativo', rotulo: 'Ativas' },
  { id: 'incompleto', rotulo: 'Cadastro incompleto' },
  { id: 'inativo', rotulo: 'Inativas' },
  { id: 'arquivado', rotulo: 'Arquivadas' },
  { id: 'todos', rotulo: 'Todas' },
];

interface Props {
  conexao: Connection;
  estado: AppState | null;
  carregando: boolean;
  erro: unknown;
  recarregar: () => void;
  /** A peça cuja ficha está aberta. Mora no endereço (`#/estoque/peca:<sku>`)
   *  para a busca do topo poder abrir a ficha, e o voltar do navegador
   *  fechá-la. */
  pecaAberta?: string | null;
  aoAbrirPeca?: (sku: string | null) => void;
  /** `#/estoque/novo` abre o cadastro de peça nova. */
  criando?: boolean;
  aoCriar?: (abrir: boolean) => void;
  filtroInicial?: FiltroSituacao;
}

/** PEÇAS — a lista única do que a Marquesa tem.
 *
 *  Estoque e Catálogo eram dois lugares para a mesma peça: um mostrava
 *  quantidade, o outro nome e preço, e a usuária tinha de saber qual abrir.
 *  Agora é uma lista só, e cada linha abre a FICHA da peça, onde estão os
 *  dois lados — onde ela está e como ela está cadastrada.
 *
 *  Três números por peça, e eles não são o mesmo: EM CASA é o que está
 *  aqui, COM REVENDEDORA é o que saiu em maleta e ainda é nosso, e TOTAL é
 *  a soma. O valor é o do PREÇO cadastrado — o sistema não guarda custo. */
export function PecasArea({
  conexao, estado, carregando, erro, recarregar,
  pecaAberta = null, aoAbrirPeca, criando = false, aoCriar, filtroInicial = 'ativo',
}: Props) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string>('');
  const [situacao, setSituacao] = useState<FiltroSituacao>(filtroInicial);
  const [limite, setLimite] = useState(POR_PAGINA);
  /* Sem rota (uso isolado, testes), a ficha e o cadastro vivem aqui. */
  const [abertaLocal, setAbertaLocal] = useState<string | null>(null);
  const [criandoLocal, setCriandoLocal] = useState(false);
  const aberta = aoAbrirPeca ? pecaAberta : abertaLocal;
  const abrir = aoAbrirPeca ?? setAbertaLocal;
  const novo = aoCriar ? criando : criandoLocal;
  const setNovo = aoCriar ?? setCriandoLocal;

  useEffect(() => { setSituacao(filtroInicial); }, [filtroInicial]);
  useEffect(() => { setLimite(POR_PAGINA); }, [busca, categoria, situacao]);

  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];

  const categorias = useMemo(
    () => [...new Set(produtos.map((p) => p.cat).filter(Boolean))].sort(),
    [produtos],
  );

  const incompletas = useMemo(
    () => new Set(estado ? precisamDeAtencao(estado).map((p) => p.sku) : []),
    [estado],
  );

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos
      .filter((p) => (situacao === 'todos' ? true
        : situacao === 'incompleto' ? incompletas.has(p.sku)
          : p.status === situacao))
      .filter((p) => (categoria ? p.cat === categoria : true))
      .filter((p) => !t || p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .sort((a, b) => a.desc.localeCompare(b.desc));
  }, [produtos, busca, categoria, situacao, incompletas]);

  /* Os números do topo são do estoque INTEIRO, não do filtro: "quantas
     peças eu tenho" não muda porque a lista está mostrando só anéis. */
  const totais = useMemo(() => produtos.reduce(
    (s, p) => ({
      pecas: s.pecas + p.qtd,
      emCasa: s.emCasa + (p.qtd - p.consignado),
      consignado: s.consignado + p.consignado,
    }),
    { pecas: 0, emCasa: 0, consignado: 0 },
  ), [produtos]);

  const pecaDaFicha = aberta ? produtos.find((p) => p.sku === aberta) ?? null : null;

  if (erro) return <section className="mq-card"><ErrorState erro={erro} aoTentarDeNovo={recarregar} /></section>;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Peças</p>
          <h1 className="mq-display">Peças</h1>
          <p className="mq-lede">
            Toque numa peça para ver onde ela está, corrigir o cadastro e ver o
            histórico.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <a className="mq-btn mq-btn--secondary" href={NO_PAINEL_CLASSICO}>
            <Icone nome="label" />
            Imprimir etiquetas
          </a>
          <button type="button" className="mq-btn mq-btn--primary" onClick={() => setNovo(true)}>
            <Icone nome="plus" />
            Novo produto
          </button>
        </div>
      </div>

      <div className="mq-kpis">
        <div className="mq-kpi">
          <span className="mq-kpi__label">Peças</span>
          <span className="mq-kpi__value">{totais.pecas.toLocaleString('pt-BR')}</span>
          <span className="mq-kpi__foot">{produtos.length} códigos</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Em casa</span>
          <span className="mq-kpi__value">{totais.emCasa.toLocaleString('pt-BR')}</span>
          <span className="mq-kpi__foot">aqui, prontas para vender</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Com revendedoras</span>
          <span className="mq-kpi__value">{totais.consignado.toLocaleString('pt-BR')}</span>
          <span className="mq-kpi__foot">nas maletas, e ainda nossas</span>
        </div>
        <button
          type="button"
          className={incompletas.size > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}
          onClick={() => setSituacao('incompleto')}
        >
          <span className="mq-kpi__label">Cadastro incompleto</span>
          <span className="mq-kpi__value">{incompletas.size}</span>
          <span className="mq-kpi__foot">sem foto, categoria ou preço</span>
        </button>
      </div>

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
        <div className="mq-chipset" role="group" aria-label="Situação">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={situacao === f.id} onClick={() => setSituacao(f.id)}>
              {f.rotulo}
            </button>
          ))}
        </div>
        <span className="mq-filters__count">
          {carregando ? 'carregando…' : `${lista.length} ${lista.length === 1 ? 'peça' : 'peças'}`}
        </span>
      </div>

      <section className="mq-card mq-card--flush">
        {lista.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="box" /></span>
            <h3>Nenhuma peça com esse filtro</h3>
            <p>Tente outro termo, ou escolha "Todas".</p>
          </div>
        ) : (
          <div className="mq-table mq-table--pecas" role="table" aria-label="Peças">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
              <span aria-label="Foto" />
              <span>Peça</span>
              <span>Categoria</span>
              <span className="mq-cell--num">Total</span>
              <span className="mq-cell--num">Em casa</span>
              <span className="mq-cell--num">Revend.</span>
              <span className="mq-cell--num">Na loja</span>
              <span className="mq-cell--num">Preço</span>
            </div>
            {lista.slice(0, limite).map((p) => (
              <button
                type="button"
                className="mq-tr"
                key={p.sku}
                style={COLUNAS}
                onClick={() => abrir(p.sku)}
              >
                <FotoDaPeca peca={p} alt={p.desc} />
                <span className="mq-cell">
                  <b>{p.desc}</b>
                  <small className="mq-sku">
                    {p.sku}
                    {p.status !== 'ativo' ? ` · ${p.status}` : ''}
                    {incompletas.has(p.sku) ? ' · cadastro incompleto' : ''}
                  </small>
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
                </span>
                <span className="mq-cell mq-cell--num" data-label="Em casa">
                  <b className="mq-qty">{p.qtd - p.consignado}</b>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Revendedoras">
                  <b className="mq-qty">{p.consignado}</b>
                </span>
                <span className="mq-cell mq-cell--num" data-label="Na loja">
                  {/* Sem uma sincronização, a coluna diz que não sabe — e
                      não "0", que afirmaria que a loja não anuncia a peça. */}
                  {p.estoqueLoja == null
                    ? <small className="mq-sku">—</small>
                    : <b className="mq-qty">{p.estoqueLoja}</b>}
                </span>
                <span className="mq-cell mq-cell--num" data-label="Preço">
                  <b className="mq-money">{p.preco === null ? '—' : money(p.preco)}</b>
                  {p.semPreco && <small>sem preço</small>}
                </span>
              </button>
            ))}
          </div>
        )}
        {lista.length > limite && (
          <div className="mq-row mq-row--center" style={{ padding: 'var(--mq-4)' }}>
            <button type="button" className="mq-btn mq-btn--secondary" onClick={() => setLimite((n) => n + POR_PAGINA * 2)}>
              Mostrar mais ({lista.length - limite} restantes)
            </button>
          </div>
        )}
      </section>

      {pecaDaFicha && (
        <FichaDaPeca
          conexao={conexao}
          peca={pecaDaFicha}
          categorias={categorias}
          aoFechar={() => abrir(null)}
          aoMudar={recarregar}
        />
      )}

      {aberta && !pecaDaFicha && estado && (
        <p className="mq-note mq-note--warn" role="alert">
          <Icone nome="alert" />
          <span>Não achei a peça {aberta}. Ela pode ter sido excluída — use a busca.</span>
        </p>
      )}

      {novo && (
        <NovoProduto
          conexao={conexao}
          categorias={categorias}
          aoCancelar={() => setNovo(false)}
          aoCriado={(sku) => {
            setNovo(false);
            /* Volta para a lista COM a peça recém-criada à vista. */
            setBusca(sku);
            setSituacao('todos');
            recarregar();
          }}
        />
      )}
    </>
  );
}
