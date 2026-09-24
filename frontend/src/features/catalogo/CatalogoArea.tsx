import { useMemo, useState } from 'react';
import { chamar, type Connection } from '../../services/client';
import { Icone } from '../../components/Icone';
import { PainelDeVariacoes } from './PainelDeVariacoes';
import { NovoProduto } from './NovoProduto';
import { FotoDaPeca } from '../../components/FotoDaPeca';
import { money } from '../../domain/formato';
import type { AppState } from '../../types/api';
import type { ProdutoDoEstado } from '../vendas/tipos';

/* A FOTO É A PRIMEIRA COLUNA. Não é estética: quem confere o catálogo
   reconhece a peça pela imagem antes de ler o código, e uma tabela de
   semijoia sem foto obriga a abrir cada linha para saber do que se trata. */
const COLUNAS = {
  gridTemplateColumns: 'auto minmax(0,2fr) minmax(0,1fr) minmax(0,.7fr) minmax(0,1fr) minmax(0,1fr) auto',
};
const STATUS = ['ativo', 'inativo', 'arquivado'];

interface Props {
  conexao: Connection;
  estado: AppState | null;
  aoMudar: () => void;
  /** `#/catalogo/novo` abre o formulário de cadastro. O endereço existe
   *  para que "Novo produto" no Estoque seja UMA navegação, e não um
   *  estado que só quem já está nesta tela consegue alcançar. */
  sub?: string | null;
  aoNavegar?: (sub: string | null) => void;
}

/** CATÁLOGO — como a peça se chama, quanto custa e onde ela aparece.
 *
 *  Catálogo é o CADASTRO; Estoque é a quantidade. A separação não é
 *  burocracia: saldo não se edita aqui, nem em lugar nenhum por digitação
 *  (§19) — ele muda por movimento, e o backend recusa qualquer tentativa
 *  de escrever `qtd` direto. É por isso que esta tela não tem campo de
 *  quantidade.
 *
 *  §24 — preço NULL é "sem preço", e não zero. Peça sem preço não é
 *  vendável e não sobe para a loja; a tela mostra isso como um estado, não
 *  como um zero que se soma sem perceber.
 */
export function CatalogoArea({ conexao, estado, aoMudar, sub = null, aoNavegar }: Props) {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('ativo');
  const [editando, setEditando] = useState<ProdutoDoEstado | null>(null);
  const criando = sub === 'novo';
  const abrirNovo = () => (aoNavegar ? aoNavegar('novo') : undefined);
  const fecharNovo = () => (aoNavegar ? aoNavegar(null) : undefined);
  const [vendoVariacoes, setVendoVariacoes] = useState<string | null>(null);

  const produtos = (estado?.produtos ?? []) as unknown as ProdutoDoEstado[];
  const categorias = useMemo(
    () => [...new Set(produtos.map((p) => p.cat).filter(Boolean))].sort(),
    [produtos],
  );

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos
      .filter((p) => (status === 'todos' ? true : p.status === status))
      .filter((p) => !t || p.sku.toLowerCase().includes(t) || p.desc.toLowerCase().includes(t))
      .sort((a, b) => a.desc.localeCompare(b.desc));
  }, [produtos, busca, status]);

  const semPreco = produtos.filter((p) => p.semPreco).length;
  const semFoto = produtos.filter((p) => p.fotoStatus === 'sem_foto').length;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Produto</p>
          <h1 className="mq-display">Catálogo</h1>
          <p className="mq-lede">
            Como a peça se chama, quanto custa e onde ela aparece. Quantidade
            é outra coisa, e mora no Estoque.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--primary" onClick={abrirNovo}>
            <Icone nome="plus" />
            Novo produto
          </button>
        </div>
      </div>

      <div className="mq-kpis">
        <div className="mq-kpi">
          <span className="mq-kpi__label">Códigos</span>
          <span className="mq-kpi__value">{produtos.length}</span>
          <span className="mq-kpi__foot">{categorias.length} categorias</span>
        </div>
        <div className={semPreco ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Sem preço</span>
          <span className="mq-kpi__value">{semPreco}</span>
          <span className="mq-kpi__foot">não vendem e não sobem para a loja</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Sem foto</span>
          <span className="mq-kpi__value">{semFoto}</span>
          <span className="mq-kpi__foot">a foto trava a publicação na Nuvemshop</span>
        </div>
      </div>

      <div className="mq-filters">
        <label className="mq-search">
          <Icone nome="search" />
          <input
            className="mq-input"
            type="search"
            placeholder="Buscar por código ou nome"
            aria-label="Buscar no catálogo"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <div className="mq-chipset" role="group" aria-label="Status">
          {['ativo', 'inativo', 'arquivado', 'todos'].map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <span className="mq-filters__count">{lista.length} peças</span>
      </div>

      <section className="mq-card mq-card--flush">
        {lista.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="tag" /></span>
            <h3>Nenhuma peça com esse filtro</h3>
            <p>
              Peças novas entram uma a uma por "Novo produto", ou em lote pela
              importação de planilha, em Estoque.
            </p>
          </div>
        ) : (
          <div className="mq-table" role="table" aria-label="Catálogo">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
              <span aria-label="Foto" />
              <span>Peça</span>
              <span>Categoria</span>
              <span>Quantidade</span>
              <span>Preço</span>
              <span>Situação</span>
              <span>Variações</span>
            </div>
            {lista.map((p) => (
              <div className="mq-tr" role="row" key={p.sku} style={COLUNAS}>
                <span className="mq-cell mq-cell--foto">
                  <FotoDaPeca peca={p} alt={p.desc} />
                </span>
                <button type="button" className="mq-cell" onClick={() => setEditando(p)}>
                  <b>{p.desc}</b>
                  <small>{p.sku}</small>
                </button>
                <span className="mq-cell"><b>{p.cat}</b></span>
                <span className="mq-cell mq-cell--num" data-label="Quantidade">
                  <b>{p.qtd}</b>
                  {/* O que está em maleta é da loja e não está aqui. Dizer só
                      o total esconde a diferença entre "tenho 9" e "tenho 9,
                      mas 3 estão na rua". */}
                  {p.consignado > 0 && <small>{p.consignado} em maleta</small>}
                </span>
                <span className="mq-cell mq-cell--num" data-label="Preço">
                  <b className="mq-money">{p.preco === null ? '—' : money(p.preco)}</b>
                  {p.semPreco && <small>sem preço</small>}
                </span>
                <span className="mq-cell">
                  <span className={p.status === 'ativo' ? 'mq-status mq-status--ok' : 'mq-status'}>
                    {p.status}
                  </span>
                  {p.fotoStatus === 'sem_foto' && <small>sem foto</small>}
                </span>
                <span className="mq-cell">
                  <button
                    type="button"
                    className="mq-btn mq-btn--link mq-btn--sm"
                    onClick={() => setVendoVariacoes(p.sku)}
                  >
                    Ver variações
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {vendoVariacoes && (
        <PainelDeVariacoes
          conexao={conexao}
          sku={vendoVariacoes}
          aoFechar={() => setVendoVariacoes(null)}
          aoMudarEstoque={aoMudar}
        />
      )}

      {criando && (
        <NovoProduto
          conexao={conexao}
          categorias={categorias}
          aoCancelar={fecharNovo}
          aoCriado={(sku) => {
            fecharNovo();
            /* Volta para a lista COM a peça recém-criada à vista. Criar
               algo e cair numa lista de 800 linhas onde ele pode estar em
               qualquer lugar é o mesmo que não ter criado. */
            setBusca(sku);
            setStatus('todos');
            aoMudar();
          }}
        />
      )}

      {editando && (
        <EditarPeca
          conexao={conexao}
          peca={editando}
          categorias={categorias}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); aoMudar(); }}
        />
      )}
    </>
  );
}

function EditarPeca({
  conexao, peca, categorias, aoFechar, aoSalvar,
}: {
  conexao: Connection;
  peca: ProdutoDoEstado;
  categorias: string[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [desc, setDesc] = useState(peca.desc);
  const [cat, setCat] = useState(peca.cat);
  const [preco, setPreco] = useState(peca.preco === null ? '' : String(peca.preco));
  const [status, setStatus] = useState(peca.status);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    setErro('');
    const corpo: Record<string, unknown> = {};
    if (desc !== peca.desc) corpo.desc = desc;
    if (cat !== peca.cat) corpo.cat = cat;
    if (status !== peca.status) corpo.status = status;
    const precoNovo = preco.trim() === '' ? null : Number(preco);
    if (precoNovo !== peca.preco) corpo.preco = precoNovo;

    if (Object.keys(corpo).length === 0) { aoFechar(); return; }

    const r = await chamar<{ erro?: string; categoriasDisponiveis?: string[] }>(
      conexao, 'PATCH', `/api/produtos/${encodeURIComponent(peca.sku)}`, corpo,
    ).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui salvar.' }));
    setSalvando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoSalvar();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer" role="dialog" aria-modal="true" aria-label={`Editar ${peca.sku}`}>
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">{peca.sku}</p>
            <h2 className="mq-title">Editar peça</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body">
          <label className="mq-field">
            <span>Nome</span>
            <input className="mq-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>

          <div className="mq-grid mq-grid--2">
            <label className="mq-field">
              <span>Categoria</span>
              <select className="mq-select" value={cat} onChange={(e) => setCat(e.target.value)}>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="mq-field">
              <span>Preço</span>
              <span className="mq-money-input">
                <input
                  className="mq-input"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                />
              </span>
              <small>vazio significa SEM preço — e sem preço a peça não vende</small>
            </label>
          </div>

          <label className="mq-field">
            <span>Situação</span>
            <select className="mq-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <dl className="mq-dl">
            <div><dt>Em estoque</dt><dd className="mq-qty">{peca.qtd}</dd></div>
            <div><dt>Com revendedoras</dt><dd className="mq-qty">{peca.consignado}</dd></div>
          </dl>
          <p className="mq-hint">
            Saldo não se edita por digitação: ele muda por movimento, e o
            backend recusa qualquer tentativa de escrevê-lo direto. Para
            corrigir uma quantidade, use o inventário.
          </p>

          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

          <div className="mq-btns">
            <button type="button" className="mq-btn mq-btn--primary" disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
          </div>
        </div>
      </div>
    </>
  );
}
