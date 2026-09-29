import { useState } from 'react';
import { Icone } from '../../components/Icone';
import { fmtData, money, plural } from '../../domain/formato';
import type { Connection } from '../../services/client';
import { completarValorSaida } from './api';
import type { SaidaSemFaturamento } from './tipos';

/** Completar o VALOR de uma saída já lançada — preço de venda e/ou custo.
 *
 *  É uma edição financeira retroativa, então três coisas são obrigatórias e
 *  ditas na tela: de onde veio o número (motivo), que o valor anterior fica
 *  guardado, e que estoque nenhum muda. O preço de hoje da peça aparece como
 *  SUGESTÃO, nunca preenchido sozinho: o preço de hoje não prova o preço de
 *  uma saída de abril. */
export function ValorDaSaida({
  conexao, saida, aoFechar, aoSalvar,
}: {
  conexao: Connection;
  saida: SaidaSemFaturamento;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const inicial = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));
  const [preco, setPreco] = useState(inicial(saida.precoUnit));
  const [custo, setCusto] = useState(inicial(saida.custoUnit));
  const [motivo, setMotivo] = useState('');
  const [naPeca, setNaPeca] = useState(saida.custoAtual == null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const numero = (t: string) => (t.trim() === '' ? null : Number(t.replace(/\./g, '').replace(',', '.')));
  const p = numero(preco);
  const c = numero(custo);
  const invalido = (n: number | null) => n !== null && (!Number.isFinite(n) || n < 0);
  const mudouPreco = p !== (saida.precoUnit ?? null);
  const mudouCusto = c !== (saida.custoUnit ?? null);

  const problemas: string[] = [];
  if (invalido(p)) problemas.push('O preço precisa ser um valor em reais.');
  if (p === 0) problemas.push('Preço 0 não é valor — deixe em branco se não se sabe.');
  if (invalido(c)) problemas.push('O custo precisa ser um valor em reais.');
  if (!mudouPreco && !mudouCusto) problemas.push('Nada mudou.');
  if (motivo.trim().length < 3) problemas.push('Diga de onde veio o valor.');

  async function salvar() {
    setSalvando(true);
    setErro('');
    const r = await completarValorSaida(conexao, saida.id, {
      ...(mudouPreco ? { precoUnit: p } : {}),
      ...(mudouCusto ? { custoUnit: c } : {}),
      motivo: motivo.trim(),
      tambemNaPeca: mudouCusto && c != null && naPeca,
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui salvar.' }));
    setSalvando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoSalvar();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer" role="dialog" aria-modal="true" aria-label="Valor da saída">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Saiu sem faturar</p>
            <h2 className="mq-title">Valor da saída</h2>
            <p className="mq-hint">
              {saida.produto ?? saida.sku} · {saida.sku} · {fmtData(saida.data)} · {saida.qtd} {plural(saida.qtd, 'peça', 'peças')}
            </p>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>
        <div className="mq-drawer__body">
      <div className="mq-stack">
        <div className="mq-grid mq-grid--2">
          <label className="mq-field">
            <span>Preço de venda (cada)</span>
            <span className="mq-money-input">
              <input className="mq-input" inputMode="decimal" value={preco} placeholder="não informado"
                aria-label="Preço de venda unitário" onChange={(e) => setPreco(e.target.value)} />
            </span>
            {saida.precoAtual != null && saida.precoUnit == null && (
              <button type="button" className="mq-btn mq-btn--link mq-btn--sm"
                onClick={() => setPreco(String(saida.precoAtual).replace('.', ','))}>
                usar o preço de hoje ({money(saida.precoAtual)})
              </button>
            )}
          </label>
          <label className="mq-field">
            <span>Custo (cada)</span>
            <span className="mq-money-input">
              <input className="mq-input" inputMode="decimal" value={custo} placeholder="não informado"
                aria-label="Custo unitário" onChange={(e) => setCusto(e.target.value)} />
            </span>
            {saida.custoAtual != null && saida.custoUnit == null && (
              <button type="button" className="mq-btn mq-btn--link mq-btn--sm"
                onClick={() => setCusto(String(saida.custoAtual).replace('.', ','))}>
                usar o custo cadastrado ({money(saida.custoAtual)})
              </button>
            )}
          </label>
        </div>

        {(p != null && !invalido(p)) || (c != null && !invalido(c)) ? (
          <dl className="mq-dl">
            {p != null && !invalido(p) && (
              <div><dt>Deixou de vender</dt><dd className="mq-money">{money(p * saida.qtd)}</dd></div>
            )}
            {c != null && !invalido(c) && (
              <div><dt>Perdido a custo</dt><dd className="mq-money">{money(c * saida.qtd)}</dd></div>
            )}
          </dl>
        ) : null}

        <label className="mq-field">
          <span>De onde veio o valor</span>
          <input className="mq-input" maxLength={200} value={motivo}
            placeholder='ex.: "nota de compra de março", "preço da etiqueta"'
            onChange={(e) => setMotivo(e.target.value)} />
        </label>

        {mudouCusto && c != null && (
          <label className="mq-check">
            <input type="checkbox" checked={naPeca} onChange={(e) => setNaPeca(e.target.checked)} />
            <span>Usar este custo também como custo da peça (as próximas saídas já nascem com ele)</span>
          </label>
        )}

        <p className="mq-hint">
          O valor anterior fica guardado no histórico da saída, com este motivo. Nenhuma peça entra ou
          sai do estoque.
        </p>

        {problemas.length > 0 && !(problemas.length === 1 && problemas[0] === 'Nada mudou.' && !motivo) && (
          <p className="mq-note mq-note--warn"><span>{problemas.join(' ')}</span></p>
        )}
        {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--primary" disabled={salvando || problemas.length > 0} onClick={salvar}>
            {salvando ? 'Salvando…' : 'Salvar valor'}
          </button>
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
        </div>
      </div>
        </div>
      </div>
    </>
  );
}
