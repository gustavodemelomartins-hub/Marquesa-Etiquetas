import { useEffect, useMemo, useState } from 'react';
import type { Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money } from '../../domain/formato';
import { precisamDeAtencao } from '../../domain/estoque';
import { fotoDaPeca, situacoesDeFoto, type SituacaoDeFoto } from '../../domain/foto';
import { FotoDaPeca } from '../../components/FotoDaPeca';
import { NovoProduto } from '../catalogo/NovoProduto';
import { NO_PAINEL_CLASSICO } from '../../app/modulos';
import { FichaDaPeca, type AbaDaFicha } from './FichaDaPeca';
import { ImportarFotosDaLoja } from './galeria/ImportarFotosDaLoja';
import { lerPlano } from './galeria/api';
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
 *  busca; quem quer olhar, pede mais. É também o que mantém as miniaturas
 *  baixadas num número pequeno — elas carregam só quando aparecem. */
const POR_PAGINA = 60;

export type FiltroSituacao = 'ativo' | 'inativo' | 'arquivado' | 'todos' | 'incompleto';

const FILTROS: { id: FiltroSituacao; rotulo: string }[] = [
  { id: 'ativo', rotulo: 'Ativas' },
  { id: 'incompleto', rotulo: 'Cadastro incompleto' },
  { id: 'inativo', rotulo: 'Inativas' },
  { id: 'arquivado', rotulo: 'Arquivadas' },
  { id: 'todos', rotulo: 'Todas' },
];

/** O que falta, dentro de "Cadastro incompleto". */
type Motivo = '' | 'foto' | 'categoria' | 'preco';

type FiltroFoto = '' | SituacaoDeFoto | 'revisar';
const FILTROS_DE_FOTO: { id: FiltroFoto; rotulo: string }[] = [
  { id: '', rotulo: 'Fotos: todas' },
  { id: 'sem_foto', rotulo: 'Sem foto' },
  { id: 'uma', rotulo: 'Com 1 foto' },
  { id: 'varias', rotulo: 'Com várias fotos' },
  { id: 'importadas', rotulo: 'Fotos importadas da loja' },
  { id: 'so_na_loja', rotulo: 'Foto só na loja (falta copiar)' },
  { id: 'revisar', rotulo: 'Foto da loja precisa revisar' },
  { id: 'fora_da_loja', rotulo: 'Não está na loja online' },
];

type Vista = 'lista' | 'galeria';
const CHAVE_VISTA = 'marquesa_pecas_vista';
function lerVista(): Vista {
  try { return localStorage.getItem(CHAVE_VISTA) === 'galeria' ? 'galeria' : 'lista'; } catch { return 'lista'; }
}
function gravarVista(v: Vista) {
  try { localStorage.setItem(CHAVE_VISTA, v); } catch { /* navegação privada: vale só nesta visita */ }
}

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
  abaDaFicha?: AbaDaFicha;
  aoAbrirPeca?: (sku: string | null, aba?: AbaDaFicha) => void;
  /** `#/estoque/novo` abre o cadastro de peça nova. */
  criando?: boolean;
  aoCriar?: (abrir: boolean) => void;
  /** `#/estoque/importar-fotos` abre a importação em massa. */
  importandoFotos?: boolean;
  aoImportarFotos?: (abrir: boolean) => void;
  filtroInicial?: FiltroSituacao;
}

/** PEÇAS — a lista única do que a Marquesa tem.
 *
 *  Estoque e Catálogo eram dois lugares para a mesma peça: um mostrava
 *  quantidade, o outro nome e preço, e a usuária tinha de saber qual abrir.
 *  Agora é uma lista só, e cada linha abre a FICHA da peça, onde estão os
 *  dois lados — onde ela está e como ela está cadastrada — e a galeria.
 *
 *  Três números por peça, e eles não são o mesmo: EM CASA é o que está
 *  aqui, COM REVENDEDORA é o que saiu em maleta e ainda é nosso, e TOTAL é
 *  a soma. O valor é o do PREÇO cadastrado — o sistema não guarda custo. */
export function PecasArea({
  conexao, estado, carregando, erro, recarregar,
  pecaAberta = null, abaDaFicha = 'geral', aoAbrirPeca, criando = false, aoCriar,
  importandoFotos = false, aoImportarFotos, filtroInicial = 'ativo',
}: Props) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string>('');
  const [situacao, setSituacao] = useState<FiltroSituacao>(filtroInicial);
  const [motivo, setMotivo] = useState<Motivo>('');
  const [filtroFoto, setFiltroFoto] = useState<FiltroFoto>('');
  const [vista, setVista] = useState<Vista>(lerVista);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [paraRevisar, setParaRevisar] = useState<Set<string> | null>(null);
  /* Sem rota (uso isolado, testes), a ficha, o cadastro e a importação
     vivem aqui. */
  const [abertaLocal, setAbertaLocal] = useState<{ sku: string; aba: AbaDaFicha } | null>(null);
  const [criandoLocal, setCriandoLocal] = useState(false);
  const [importandoLocal, setImportandoLocal] = useState(false);
  const aberta = aoAbrirPeca ? pecaAberta : abertaLocal?.sku ?? null;
  const aba = aoAbrirPeca ? abaDaFicha : abertaLocal?.aba ?? 'geral';
  const abrir = (sku: string | null, a: AbaDaFicha = 'geral') => {
    if (aoAbrirPeca) aoAbrirPeca(sku, a);
    else setAbertaLocal(sku ? { sku, aba: a } : null);
  };
  const novo = aoCriar ? criando : criandoLocal;
  const setNovo = aoCriar ?? setCriandoLocal;
  const importando = aoImportarFotos ? importandoFotos : importandoLocal;
  const setImportando = aoImportarFotos ?? setImportandoLocal;

  useEffect(() => { setSituacao(filtroInicial); }, [filtroInicial]);
  useEffect(() => { setLimite(POR_PAGINA); }, [busca, categoria, situacao, motivo, filtroFoto]);
  useEffect(() => { if (situacao !== 'incompleto') setMotivo(''); }, [situacao]);

  /* "Precisa revisar" vem do plano da importação, que o servidor calcula
     sobre o espelho da loja — só é pedido quando alguém escolhe o filtro. */
  useEffect(() => {
    if (filtroFoto !== 'revisar' || paraRevisar) return;
    const ctrl = new AbortController();
    lerPlano(conexao, ctrl.signal)
      .then((p) => setParaRevisar(new Set(p.skusParaRevisar ?? [])))
      .catch(() => setParaRevisar(new Set()));
    return () => ctrl.abort();
  }, [filtroFoto, paraRevisar, conexao]);

  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];

  const categorias = useMemo(
    () => [...new Set(produtos.map((p) => p.cat).filter(Boolean))].sort(),
    [produtos],
  );

  const atencao = useMemo(() => (estado ? precisamDeAtencao(estado) : []), [estado]);
  const faltasPorSku = useMemo(() => new Map(atencao.map((p) => [p.sku, p.falta as string[]])), [atencao]);
  const contagemMotivo = useMemo(() => {
    const c = { foto: 0, categoria: 0, preco: 0 };
    for (const p of atencao) for (const f of p.falta) if (f in c) c[f as keyof typeof c]++;
    return c;
  }, [atencao]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos
      .filter((p) => (situacao === 'todos' ? true
        : situacao === 'incompleto'
          ? faltasPorSku.has(p.sku) && (!motivo || (faltasPorSku.get(p.sku) ?? []).includes(motivo))
          : p.status === situacao))
      .filter((p) => (categoria ? p.cat === categoria : true))
      .filter((p) => {
        if (!filtroFoto) return true;
        if (filtroFoto === 'revisar') return !!paraRevisar?.has(p.sku);
        return situacoesDeFoto(p).has(filtroFoto);
      })
      .filter((p) => !t || p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .sort((a, b) => a.desc.localeCompare(b.desc));
  }, [produtos, busca, categoria, situacao, motivo, filtroFoto, paraRevisar, faltasPorSku]);

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

  /* A FICHA é uma página: ocupa o lugar da lista, e "Peças" volta. */
  if (pecaDaFicha) {
    return (
      <FichaDaPeca
        conexao={conexao}
        peca={pecaDaFicha}
        categorias={categorias}
        aba={aba}
        aoTrocarAba={(a) => abrir(pecaDaFicha.sku, a)}
        aoFechar={() => abrir(null)}
        aoMudar={recarregar}
      />
    );
  }

  const trocarVista = (v: Vista) => { setVista(v); gravarVista(v); };
  const visiveis = lista.slice(0, limite);

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Peças</p>
          <h1 className="mq-display">Peças</h1>
          <p className="mq-lede">
            Toque numa peça para ver as fotos, onde ela está, corrigir o cadastro
            e ver o histórico.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--secondary" onClick={() => setImportando(true)}>
            <Icone nome="cloud" />
            Importar fotos da Nuvemshop
          </button>
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
          className={atencao.length > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}
          onClick={() => setSituacao('incompleto')}
        >
          <span className="mq-kpi__label">Cadastro incompleto</span>
          <span className="mq-kpi__value">{atencao.length}</span>
          <span className="mq-kpi__foot">
            {contagemMotivo.foto} sem foto · {contagemMotivo.categoria} sem categoria · {contagemMotivo.preco} sem preço
          </span>
        </button>
      </div>

      <div className="mq-filters mq-pecas__filtros">
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
        <select
          className="mq-select"
          aria-label="Fotos"
          value={filtroFoto}
          onChange={(e) => setFiltroFoto(e.target.value as FiltroFoto)}
        >
          {FILTROS_DE_FOTO.map((f) => <option key={f.id || 'todas'} value={f.id}>{f.rotulo}</option>)}
        </select>
        <div className="mq-chipset" role="group" aria-label="Situação">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={situacao === f.id} onClick={() => setSituacao(f.id)}>
              {f.rotulo}
            </button>
          ))}
        </div>
        <div className="mq-tabs mq-tabs--pill mq-pecas__vista" role="group" aria-label="Como mostrar">
          <button type="button" aria-selected={vista === 'lista'} onClick={() => trocarVista('lista')}>
            <Icone nome="menu" /> Lista
          </button>
          <button type="button" aria-selected={vista === 'galeria'} onClick={() => trocarVista('galeria')}>
            <Icone nome="image" /> Galeria
          </button>
        </div>
        <span className="mq-filters__count">
          {carregando ? 'carregando…' : `${lista.length} ${lista.length === 1 ? 'peça' : 'peças'}`}
        </span>
      </div>

      {situacao === 'incompleto' && (
        <div className="mq-chipset mq-pecas__motivos" role="group" aria-label="O que falta">
          <button type="button" aria-pressed={motivo === ''} onClick={() => setMotivo('')}>Tudo ({atencao.length})</button>
          <button type="button" aria-pressed={motivo === 'foto'} onClick={() => setMotivo('foto')}>Sem foto ({contagemMotivo.foto})</button>
          <button type="button" aria-pressed={motivo === 'categoria'} onClick={() => setMotivo('categoria')}>Sem categoria ({contagemMotivo.categoria})</button>
          <button type="button" aria-pressed={motivo === 'preco'} onClick={() => setMotivo('preco')}>Sem preço ({contagemMotivo.preco})</button>
        </div>
      )}

      {filtroFoto === 'revisar' && paraRevisar && paraRevisar.size === 0 && (
        <p className="mq-note mq-note--info">
          <Icone nome="alert" />
          <span>
            Nenhuma peça com foto para revisar — ou a loja ainda não foi lida.
            {' '}<button type="button" className="mq-btn mq-btn--link mq-btn--sm" onClick={() => setImportando(true)}>Ler a loja agora</button>
          </span>
        </p>
      )}

      <section className={vista === 'galeria' ? 'mq-pecas-galeria' : 'mq-card mq-card--flush'}>
        {lista.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="box" /></span>
            <h3>Nenhuma peça com esse filtro</h3>
            <p>Tente outro termo, ou escolha "Todas".</p>
          </div>
        ) : vista === 'galeria' ? (
          <ul className="mq-cartoes" aria-label="Peças em galeria">
            {visiveis.map((p) => (
              <li key={p.sku}>
                <button type="button" className="mq-cartao" onClick={() => abrir(p.sku)}>
                  <FotoDaPeca peca={p} alt={p.desc} tamanho="cartao" />
                  <SeloDeFotos peca={p} flutuante />
                  <span className="mq-cartao__corpo">
                    <b>{p.desc}</b>
                    <small className="mq-sku">{p.sku}{p.cat ? ` · ${p.cat}` : ''}</small>
                    <span className="mq-cartao__linha">
                      <span><b className="mq-qty">{p.qtd - p.consignado}</b> em casa · {p.qtd} total</span>
                      <b className="mq-money">{p.preco === null ? 'Sem preço' : money(p.preco)}</b>
                    </span>
                    {(p.status !== 'ativo' || faltasPorSku.has(p.sku)) && (
                      <span className="mq-cartao__alerta">
                        {p.status !== 'ativo' ? p.status : `falta ${(faltasPorSku.get(p.sku) ?? []).map((f) => (f === 'preco' ? 'preço' : f)).join(', ')}`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
            {visiveis.map((p) => (
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
                    {faltasPorSku.has(p.sku) ? ' · cadastro incompleto' : ''}
                    {' '}<SeloDeFotos peca={p} />
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

      {importando && (
        <ImportarFotosDaLoja
          conexao={conexao}
          aoFechar={() => setImportando(false)}
          aoTerminar={() => { setParaRevisar(null); recarregar(); }}
          aoAbrirPeca={(sku) => { setImportando(false); abrir(sku, 'fotos'); }}
        />
      )}
    </>
  );
}

/** Quantas fotos a peça tem — discreto, sem poluir a linha. */
function SeloDeFotos({ peca, flutuante = false }: { peca: ProdutoDoEstado; flutuante?: boolean }) {
  const n = peca.fotosQtd ?? 0;
  const classe = `mq-selo-fotos${flutuante ? ' mq-selo-fotos--flutuante' : ''}`;
  if (n > 0) {
    return (
      <span className={classe} title={`${n} ${n === 1 ? 'foto' : 'fotos'} na galeria`}>
        <Icone nome="camera" /> {n}
      </span>
    );
  }
  if (fotoDaPeca(peca)) {
    return <span className={`${classe} mq-selo-fotos--loja`} title="A foto é da loja online — ainda não foi copiada para cá">
      <Icone nome="cloud" /> loja
    </span>;
  }
  return <span className={`${classe} mq-selo-fotos--sem`}>sem foto</span>;
}
