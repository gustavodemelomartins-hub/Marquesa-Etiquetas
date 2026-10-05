import { useEffect, useRef, useState } from 'react';
import type { Connection } from '../../services/client';
import { ApiError } from '../../types/api';
import type { ProdutoDoEstado } from '../vendas/tipos';
import { MOTIVOS_DE_AJUSTE, ajustarEstoque, previaDoAjuste } from './ajuste';

interface Props {
  conexao: Connection;
  peca: ProdutoDoEstado;
  aoFechar: () => void;
  /** Gravou: o estado compartilhado precisa recarregar o saldo. */
  aoAjustar: (resumo: string) => void;
}

/** AJUSTAR ESTOQUE (§54) — "a quantidade certa é N, por este motivo".
 *
 *  Não é um campo que sobrescreve o saldo: a tela mostra a quantidade
 *  atual, pede a correta e o motivo, e mostra a diferença e onde ela cai
 *  (em casa) ANTES de gravar. O servidor grava um movimento `ajuste` — o
 *  histórico da peça passa a dizer "de 8 para 7, correção de cadastro".
 *
 *  Peça com revendedora não deixa o total ficar abaixo do que está na
 *  maleta: aquela peça existe, e o caminho dela é o acerto. */
export function AjustarEstoque({ conexao, peca, aoFechar, aoAjustar }: Props) {
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [variacao, setVariacao] = useState('');
  const [variacoesDoServidor, setVariacoesDoServidor] = useState<{ nome: string; saldo: number }[] | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && !salvando) aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    campo.current?.focus();
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar, salvando]);

  /* Variação: só quando o histórico SEPARA por aro (algum aro com saldo).
     Sem isso o ajuste vale para o código inteiro — escolher um aro seria
     chutar de qual aro a peça saiu (regra 2). O servidor confere de novo e,
     se discordar, devolve os aros com saldo dentro da recusa. */
  const identificadas = variacoesDoServidor
    ?? (peca.variacoes ?? []).filter((v) => v.qtd !== 0).map((v) => ({ nome: v.nome, saldo: v.qtd }));
  const pedeVariacao = identificadas.length > 0;

  const previa = previaDoAjuste(peca.qtd, peca.consignado, texto, motivo, observacao);
  const bloqueio = previa.bloqueio ?? (pedeVariacao && !variacao ? 'Escolha em qual variação está a diferença.' : null);

  async function confirmar() {
    if (bloqueio || previa.para === null) return;
    setSalvando(true);
    setErro('');
    try {
      const r = await ajustarEstoque(conexao, peca.sku, {
        quantidadeAtual: peca.qtd,
        quantidadeCorreta: previa.para,
        motivo,
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
        ...(pedeVariacao && variacao ? { variacao } : {}),
      });
      setSalvando(false);
      if (r && r.erro) { setErro(r.erro); return; }
      aoAjustar(`Estoque de ${peca.sku} ajustado: ${peca.qtd} → ${previa.para}. O motivo está no histórico da peça.`);
    } catch (e) {
      setSalvando(false);
      const corpo = e instanceof ApiError ? e.corpo as { variacoes?: { nome: string; saldo: number }[] } | null : null;
      if (corpo && Array.isArray(corpo.variacoes)) setVariacoesDoServidor(corpo.variacoes);
      setErro(e instanceof Error ? e.message : 'Não consegui ajustar o estoque.');
    }
  }

  const sinal = previa.diferenca > 0 ? '+' : '';

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" tabIndex={-1} onClick={() => { if (!salvando) aoFechar(); }} />
      <div className="mq-drawer ajuste-estoque" role="dialog" aria-modal="true" aria-labelledby="titulo-ajuste">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">SKU {peca.sku}</p>
            <h2 className="mq-title" id="titulo-ajuste">Ajustar estoque</h2>
            <p className="mq-hint">{peca.desc}</p>
          </div>
        </div>
        <div className="mq-drawer__body mq-stack">
          <dl className="mq-dl ajuste-estoque__atual">
            <div><dt>Quantidade atual (total)</dt><dd className="mq-qty">{peca.qtd}</dd></div>
            <div><dt>Em casa</dt><dd className="mq-qty">{previa.emCasaAntes}</dd></div>
            <div><dt>Com revendedoras</dt><dd className="mq-qty">{peca.consignado}</dd></div>
          </dl>

          <label className="mq-field">
            <span>Quantidade correta (total)</span>
            <input
              ref={campo}
              className="mq-input"
              type="number"
              min={peca.consignado}
              step={1}
              inputMode="numeric"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-describedby="ajuste-diferenca"
            />
            <small>o total que existe de verdade: em casa + com revendedoras</small>
          </label>

          {pedeVariacao && (
            <label className="mq-field">
              <span>Em qual variação</span>
              <select className="mq-select" value={variacao} onChange={(e) => setVariacao(e.target.value)}>
                <option value="">Escolha…</option>
                {identificadas.map((v) => (
                  <option key={v.nome} value={v.nome}>{v.nome} (hoje {v.saldo})</option>
                ))}
              </select>
            </label>
          )}

          <label className="mq-field">
            <span>Motivo</span>
            <select className="mq-select" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Escolha o motivo…</option>
              {MOTIVOS_DE_AJUSTE.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
            </select>
          </label>

          <label className="mq-field">
            <span>Observação {motivo === 'outro' ? '(obrigatória)' : '(opcional)'}</span>
            <textarea
              className="mq-textarea"
              maxLength={300}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="ex.: comprei 7; uma foi contada duas vezes"
            />
          </label>

          <p className={`mq-note ${previa.para === null || previa.diferenca === 0 ? 'mq-note--info' : previa.diferenca < 0 ? 'mq-note--warn' : 'mq-note--ok'}`}
            id="ajuste-diferenca" aria-live="polite">
            <span>
              {previa.para === null || previa.diferenca === 0
                ? 'A diferença aparece aqui quando você digitar a quantidade correta.'
                : <>Diferença: <b>{sinal}{previa.diferenca}</b> · total {peca.qtd} → {previa.para} · em casa {previa.emCasaAntes} → {previa.emCasaDepois}.
                  {' '}Vira um movimento de ajuste no histórico, com o motivo.</>}
            </span>
          </p>

          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
          {!erro && bloqueio && texto.trim() !== '' && (
            <p className="mq-hint" role="status">{bloqueio}</p>
          )}

          <div className="mq-btns">
            <button type="button" className="mq-btn mq-btn--ghost" disabled={salvando} onClick={aoFechar}>Cancelar</button>
            <button type="button" className="mq-btn mq-btn--primary" disabled={salvando || !!bloqueio} onClick={confirmar}>
              {salvando ? 'Ajustando…' : 'Confirmar ajuste'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
