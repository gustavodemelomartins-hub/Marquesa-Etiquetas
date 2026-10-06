import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { acharVariacao } from '../../domain/variacao';
import {
  adicionarVariacao, buscarEstrutura, distribuir, impedimentosDaDistribuicao, legendaDaLoja,
  mensagemParaPessoa, somaDistribuida,
} from './variacoes';
import type { Connection } from '../../services/client';

interface Props {
  conexao: Connection;
  sku: string;
  aoFechar: () => void;
  aoMudarEstoque: () => void;
}

/** VARIAÇÕES DA PEÇA — refeita em 06/10/2026.
 *
 *  A tela antiga mostrava "soma das variações" contra "total do código" e
 *  só deixava salvar quando as duas batiam. Mas a Sthefany não sabe o aro de
 *  todas as peças — uma está com a revendedora e ninguém anotou — e para
 *  fechar a conta ela teria de inventar um número. Agora:
 *
 *    Total 7 · Com revendedoras 1 · Em casa 6
 *    nº21 → 2 · nº23 → 2 · nº18 → 1
 *    Variação ainda não informada → 2
 *
 *  O que não foi dito fica "não informado" — nunca é distribuído pela tela
 *  (regra 2). Salvar não muda o total (para isso existe Ajustar estoque).
 *  E criar variação é aqui mesmo, sem outra tela. */
export function PainelDeVariacoes({ conexao, sku, aoFechar, aoMudarEstoque }: Props) {
  const estrutura = useApi((s) => buscarEstrutura(conexao, sku, s), [conexao, sku]);
  const [rascunho, setRascunho] = useState<Record<string, number> | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [nova, setNova] = useState('');
  const [criando, setCriando] = useState(false);

  const e = estrutura.dados;
  const distribuicao = useMemo(() => {
    if (rascunho) return rascunho;
    const base: Record<string, number> = {};
    for (const v of e?.variacoes ?? []) if (v.varianteId) base[v.varianteId] = v.saldo;
    return base;
  }, [rascunho, e]);

  const problemas = e ? impedimentosDaDistribuicao(e, distribuicao) : [];
  const soma = somaDistribuida(distribuicao);
  const naoInformada = e ? e.qtd - soma : 0;
  const mudou = !!rascunho;
  const existente = e && nova.trim() ? acharVariacao(e.variacoes, nova) : null;

  function mudar(vid: string, qtd: number) {
    setAviso('');
    setRascunho({ ...distribuicao, [vid]: Math.max(0, Math.trunc(qtd) || 0) });
  }

  async function salvar() {
    if (!e) return;
    setEnviando(true);
    setErro('');
    const r = await distribuir(conexao, sku, {
      distribuicao: Object.entries(distribuicao).map(([varianteId, qtd]) => ({ varianteId, qtd })),
      obs: 'Variações conferidas na ficha da peça',
      parcial: true,
    }).catch((x: unknown) => ({ erro: x instanceof Error ? x.message : 'Não consegui salvar.' }));
    setEnviando(false);
    if (r && 'erro' in r && r.erro) {
      setErro(mensagemParaPessoa(String(r.erro),
        'Não consegui salvar as variações. Feche e abra de novo — nada foi alterado.'));
      return;
    }
    setRascunho(null);
    setAviso('Variações salvas. O total da peça não mudou.');
    estrutura.recarregar();
    aoMudarEstoque();
  }

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    const v = nova.trim();
    if (!v || existente) return;
    setCriando(true);
    setErro('');
    const r = await adicionarVariacao(conexao, sku, v)
      .catch((x: unknown) => {
        const corpo = (x as { corpo?: { existente?: string } }).corpo;
        return { erro: corpo?.existente ? `Essa variação já existe: ${corpo.existente}.` : (x instanceof Error ? x.message : 'Não consegui criar.') };
      });
    setCriando(false);
    if (r && 'erro' in r && r.erro) {
      setErro(mensagemParaPessoa(String(r.erro), 'Não consegui criar a variação. Tente de novo.'));
      return;
    }
    setNova('');
    setAviso(`Variação ${('valor' in r && r.valor) || v} criada. Ela já aparece em vendas, maletas e no inventário.`);
    setRascunho(null);
    estrutura.recarregar();
    aoMudarEstoque();
  }

  const emCasa = e ? e.qtd - (e.consignado ?? 0) : 0;

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer mq-drawer--larga" role="dialog" aria-modal="true" aria-label="Variações da peça">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Estoque</p>
            <h2 className="mq-title">Variações da peça</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-drawer__body mq-stack">
          {estrutura.erro ? (
            <ErrorState erro={estrutura.erro} aoTentarDeNovo={estrutura.recarregar} />
          ) : !e ? <LoadingState /> : e.erro ? (
            <p className="mq-note mq-note--warn"><span>{e.erro}</span></p>
          ) : (
            <>
              <div>
                <b>{e.desc}</b>
                <p className="mq-lede">Código {e.sku}{e.cat ? ` · ${e.cat}` : ''}</p>
              </div>

              <dl className="var-numeros" aria-label="Quantidades da peça">
                <div><dt>Total da peça</dt><dd>{e.qtd}</dd></div>
                <div><dt>Com revendedoras</dt><dd>{e.consignado || '—'}</dd></div>
                <div className="is-casa"><dt>Em casa</dt><dd>{emCasa}</dd></div>
              </dl>

              {!e.temVariacao ? (
                <p className="mq-hint">Esta peça ainda não tem variação. Se ela tem aro, cor ou tamanho, adicione abaixo.</p>
              ) : (
                <section className="var-dist" aria-label="Distribuição conhecida">
                  <h3 className="mq-subtitle">Quantas de cada variação</h3>
                  <p className="mq-hint">
                    Conte o total de cada variação — em casa e com revendedoras. O que você
                    não souber fica em "variação ainda não informada".
                  </p>
                  <ul className="var-dist__lista">
                    {e.variacoes.map((v) => {
                      const vid = v.varianteId;
                      const fora = (v.comRevendedoras ?? 0) > 0 ? `${v.comRevendedoras} com revendedora` : '';
                      return (
                        <li key={vid ?? v.nome}>
                          <span className="var-dist__nome">
                            <b>{v.nome}</b>
                            <small>{[fora, legendaDaLoja(v)].filter(Boolean).join(' · ')}</small>
                          </span>
                          {vid ? (
                            <input
                              className="mq-input var-dist__qtd"
                              type="number"
                              min={0}
                              inputMode="numeric"
                              aria-label={`Quantidade de ${v.nome}`}
                              value={distribuicao[vid] ?? 0}
                              onFocus={(ev) => ev.currentTarget.select()}
                              onChange={(ev) => mudar(vid, Number(ev.target.value))}
                            />
                          ) : <small className="mq-hint">cadastro incompleto</small>}
                        </li>
                      );
                    })}
                    <li className={`var-dist__resto${naoInformada < 0 ? ' is-risco' : ''}`}>
                      <span className="var-dist__nome">
                        <b>Variação ainda não informada</b>
                        <small>
                          {(e.consignadoSemVariacao ?? 0) > 0
                            ? `inclui ${e.consignadoSemVariacao} com revendedora sem variação conhecida`
                            : 'peças cuja variação ninguém disse ainda'}
                        </small>
                      </span>
                      <b className="var-dist__qtd-fixa" aria-label="Variação ainda não informada">{naoInformada}</b>
                    </li>
                  </ul>
                </section>
              )}

              <form className="var-nova" onSubmit={criar} aria-label="Adicionar variação">
                <label className="mq-field">
                  <span>Adicionar variação</span>
                  <input className="mq-input" value={nova} placeholder="ex.: 19, nº 19, Verde"
                    onChange={(ev) => { setNova(ev.target.value); setErro(''); }} />
                </label>
                <button type="submit" className="mq-btn mq-btn--secondary" disabled={criando || !nova.trim() || !!existente}>
                  <Icone nome="plus" /> {criando ? 'Criando…' : 'Adicionar'}
                </button>
              </form>
              {existente && (
                <p className="mq-note mq-note--warn" role="status"><Icone nome="alert" /><span>Essa variação já existe: {existente.nome}.</span></p>
              )}

              {problemas.length > 0 && (
                <div className="mq-note mq-note--warn">
                  <Icone nome="alert" />
                  <span>{problemas.map((x) => <span key={x} style={{ display: 'block' }}>{x}</span>)}</span>
                </div>
              )}
              {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
              {aviso && <p className="mq-note mq-note--ok" role="status"><Icone nome="check" /><span>{aviso}</span></p>}

              {e.temVariacao && (
                <div className="mq-btns">
                  <button type="button" className="mq-btn mq-btn--primary"
                    disabled={enviando || !mudou || problemas.length > 0} onClick={salvar}>
                    {enviando ? 'Salvando…' : 'Salvar variações'}
                  </button>
                  <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Fechar</button>
                </div>
              )}
              <p className="mq-hint">
                Salvar não muda o total da peça ({e.qtd}). Para mudar a quantidade, use
                Ajustar estoque. Cada mudança fica no histórico da peça.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
