import { useState } from 'react';
import { chamar, type Connection } from '../../services/client';
import type { ProdutoDoEstado } from '../vendas/tipos';

const STATUS = ['ativo', 'inativo', 'arquivado'];

interface Props {
  conexao: Connection;
  peca: ProdutoDoEstado;
  categorias: string[];
  aoCancelar: () => void;
  aoSalvar: () => void;
}

/** Os dados de cadastro da peça: nome, categoria, preço e situação.
 *
 *  Quantidade NÃO está aqui, e de propósito: o saldo só muda por movimento
 *  (venda, maleta, inventário), nunca por digitação. Preço vazio é "sem
 *  preço", e não zero — peça sem preço não vende e não sobe para a loja.
 *
 *  Morava dentro do Catálogo, numa gaveta só dele. Agora é uma parte da
 *  ficha da peça, que junta cadastro e estoque num lugar só. */
export function EditarPeca({ conexao, peca, categorias, aoCancelar, aoSalvar }: Props) {
  const [desc, setDesc] = useState(peca.desc);
  const [cat, setCat] = useState(peca.cat);
  const [preco, setPreco] = useState(peca.preco === null ? '' : String(peca.preco));
  const [custo, setCusto] = useState(peca.custo == null ? '' : String(peca.custo));
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
    const custoNovo = custo.trim() === '' ? null : Number(custo);
    if (custoNovo !== (peca.custo ?? null)) corpo.custo = custoNovo;

    if (Object.keys(corpo).length === 0) { aoCancelar(); return; }

    const r = await chamar<{ erro?: string }>(
      conexao, 'PATCH', `/api/produtos/${encodeURIComponent(peca.sku)}`, corpo,
    ).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui salvar.' }));
    setSalvando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoSalvar();
  }

  /* A categoria atual entra na lista mesmo que nenhuma outra peça a use —
     senão o select mostraria outra categoria e salvaria a troca sem querer. */
  const opcoes = categorias.includes(cat) || !cat ? categorias : [cat, ...categorias];

  return (
    <div className="mq-stack" aria-label="Editar dados da peça">
      <label className="mq-field">
        <span>Nome</span>
        <input className="mq-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>

      <div className="mq-grid mq-grid--2">
        <label className="mq-field">
          <span>Categoria</span>
          <select className="mq-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {!cat && <option value="">Sem categoria</option>}
            {opcoes.map((c) => <option key={c} value={c}>{c}</option>)}
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
          <small>deixe vazio se a peça ainda não tem preço — assim ela não é vendida</small>
        </label>
      </div>

      <label className="mq-field">
        <span>Preço de custo</span>
        <span className="mq-money-input">
          <input
            className="mq-input"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
            aria-label="Preço de custo"
          />
        </span>
        <small>quanto você pagou nesta peça — só você vê. É ele que mostra quanto se perdeu em brinde e perda</small>
      </label>

      <label className="mq-field">
        <span>Situação</span>
        <select className="mq-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <p className="mq-hint">
        A quantidade não se digita: ela muda sozinha com vendas, maletas e
        inventário. Para corrigir uma contagem, use a aba Inventário.
      </p>

      {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

      <div className="mq-btns">
        <button type="button" className="mq-btn mq-btn--primary" disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="mq-btn mq-btn--ghost" onClick={aoCancelar}>Cancelar</button>
      </div>
    </div>
  );
}
