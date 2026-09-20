import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { plural } from '../../domain/formato';
import {
  buscarEstrutura, distribuir, impedimentosDaDistribuicao, somaDistribuida,
} from './variacoes';
import type { Connection } from '../../services/client';

interface Props {
  conexao: Connection;
  sku: string;
  aoFechar: () => void;
  aoMudarEstoque: () => void;
}

/** VARIAÇÕES DA PEÇA — onde a regra 2 do CLAUDE.md vira tela.
 *
 *  *Nunca chute a distribuição de uma variante.* Esta tela existe para tornar
 *  a dúvida VISÍVEL, e não para resolvê-la sozinha: quando há saldo no código
 *  e nenhuma variação, ela mostra o número parado e diz o que ele significa,
 *  em vez de repartir por igual — repartir por igual é o chute.
 *
 *  Os dois números NUNCA compartilham uma coluna:
 *
 *    saldo        o que a NOSSA razão diz. Manda no físico.
 *    estoqueLoja  o que a Nuvemshop mostra. É destino, não fonte da verdade
 *                 (regra 4) — e quando os dois discordam, a tela mostra os
 *                 dois em vez de escolher um.
 */
export function PainelDeVariacoes({ conexao, sku, aoFechar, aoMudarEstoque }: Props) {
  const estrutura = useApi((s) => buscarEstrutura(conexao, sku, s), [conexao, sku]);
  const [rascunho, setRascunho] = useState<Record<string, number> | null>(null);
  const [ajustarTotal, setAjustarTotal] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const e = estrutura.dados;

  /* O rascunho nasce do que JÁ está distribuído — não de zeros. Começar do
     zero convidaria a redigitar tudo, e redigitar é onde se erra. */
  const distribuicao = useMemo(() => {
    if (rascunho) return rascunho;
    const base: Record<string, number> = {};
    for (const v of e?.variacoes ?? []) if (v.varianteId) base[v.varianteId] = v.saldo;
    return base;
  }, [rascunho, e]);

  const problemas = e ? impedimentosDaDistribuicao(e, distribuicao, ajustarTotal, motivo) : [];
  const soma = somaDistribuida(distribuicao);

  function mudar(vid: string, qtd: number) {
    setRascunho({ ...distribuicao, [vid]: Math.max(0, Math.trunc(qtd) || 0) });
  }

  async function aplicar() {
    if (!e) return;
    setEnviando(true);
    setErro('');
    const r = await distribuir(conexao, sku, {
      distribuicao: Object.entries(distribuicao).map(([varianteId, qtd]) => ({ varianteId, qtd })),
      ...(obs.trim() ? { obs: obs.trim() } : {}),
      ...(ajustarTotal ? { ajustarTotal: true, motivo: motivo.trim() } : {}),
    }).catch((x: unknown) => ({ erro: x instanceof Error ? x.message : 'Não consegui distribuir.' }));
    setEnviando(false);
    if (r && 'erro' in r && r.erro) { setErro(String(r.erro)); return; }
    setRascunho(null);
    setAjustarTotal(false);
    setMotivo('');
    estrutura.recarregar();
    aoMudarEstoque();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-drawer mq-drawer--larga" role="dialog" aria-modal="true" aria-label="Variações da peça">
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Catálogo</p>
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
                <p className="mq-lede">
                  <span className="mq-sku">{e.sku}</span>
                  {e.cat ? ` · ${e.cat}` : ''} · {e.qtd} {plural(e.qtd, 'peça', 'peças')} no código
                </p>
              </div>

              {!e.temVariacao ? (
                <div className="mq-state">
                  <span className="mq-state__icon"><Icone nome="box" /></span>
                  <h3>Esta peça não tem variação</h3>
                  <p>
                    O saldo do código é o saldo dela. Variações vêm da Nuvemshop
                    (importando a estrutura) ou são definidas aqui — e defini-las
                    reescreve saldo, então esse caminho continua no painel
                    clássico.
                  </p>
                </div>
              ) : (
                <>
                  {e.saldoSemVariacao > 0 && (
                    <p className="mq-note mq-note--warn">
                      <Icone nome="alert" />
                      <span>
                        <b>
                          {e.saldoSemVariacao} {plural(e.saldoSemVariacao, 'peça está', 'peças estão')} no
                          código e em variação nenhuma.
                        </b>{' '}
                        Ninguém sabe qual peça física está aí. O sistema não
                        reparte por igual de propósito — repartir por igual é o
                        chute que a regra 2 proíbe. Distribua abaixo, olhando as
                        peças.
                      </span>
                    </p>
                  )}

                  {e.atributos.length > 0 && (
                    <p className="mq-chips">
                      {e.atributos.map((a) => (
                        <span className="mq-chip mq-chip--soft" key={a.nome}>
                          {a.nome}: {a.valores.join(', ')}
                        </span>
                      ))}
                    </p>
                  )}

                  <div className="mq-scroll-x">
                    <div className="mq-table" role="table" aria-label="Variações">
                      <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
                        <span>Variação</span>
                        <span>Nossa razão</span>
                        <span>A loja diz</span>
                        <span>Distribuir</span>
                      </div>
                      {e.variacoes.map((v) => {
                        const vid = v.varianteId;
                        const divergente = v.estoqueLoja != null && v.estoqueLoja !== v.saldo;
                        return (
                          <div className="mq-tr" role="row" key={vid ?? v.nome} style={COLUNAS}>
                            <span className="mq-cell">
                              <b>{v.nome}</b>
                              <small>
                                {v.daLoja
                                  ? (v.mapeada ? 'na loja e no cadastro' : 'só na loja — variação órfã')
                                  : 'só no cadastro daqui'}
                                {vid ? ` · ${vid}` : ''}
                              </small>
                            </span>
                            <span className="mq-cell mq-cell--num"><b className="mq-qty">{v.saldo}</b></span>
                            <span className="mq-cell mq-cell--num">
                              <b className={divergente ? 'mq-qty mq-money--risk' : 'mq-qty'}>
                                {v.estoqueLoja == null ? '—' : v.estoqueLoja}
                              </b>
                              {divergente && <small>diverge</small>}
                            </span>
                            <span className="mq-cell mq-cell--num">
                              {vid ? (
                                <input
                                  className="mq-input mq-inv-contagem"
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  aria-label={`Quantidade de ${v.nome}`}
                                  value={distribuicao[vid] ?? 0}
                                  onChange={(ev) => mudar(vid, Number(ev.target.value))}
                                />
                              ) : <small>sem id</small>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <dl className="mq-dl">
                    <div>
                      <dt>Soma das variações</dt>
                      <dd className={soma === e.qtd ? '' : 'mq-money--risk'}>{soma}</dd>
                    </div>
                    <div>
                      <dt>Total do código</dt>
                      <dd>{e.qtd}</dd>
                    </div>
                  </dl>

                  <label className="mq-field">
                    <span>Observação do movimento <small>opcional</small></span>
                    <input
                      className="mq-input"
                      placeholder="ex.: conferido na gaveta"
                      value={obs}
                      onChange={(ev) => setObs(ev.target.value)}
                    />
                  </label>

                  {soma !== e.qtd && (
                    <>
                      <label className="mq-field">
                        <span>
                          <input
                            type="checkbox"
                            checked={ajustarTotal}
                            onChange={(ev) => setAjustarTotal(ev.target.checked)}
                          />
                          {' '}Isto é um ajuste: mudar o total do código para {soma}
                        </span>
                      </label>
                      {ajustarTotal && (
                        <label className="mq-field">
                          <span>Por quê</span>
                          <input
                            className="mq-input"
                            placeholder='ex.: "achei duas na caixa da vitrine"'
                            value={motivo}
                            onChange={(ev) => setMotivo(ev.target.value)}
                          />
                          <small>
                            Sem motivo, um ajuste é indistinguível de erro de
                            digitação — e ele mexe em peça física.
                          </small>
                        </label>
                      )}
                    </>
                  )}

                  {problemas.length > 0 && (
                    <div className="mq-note mq-note--warn">
                      <Icone nome="alert" />
                      <span>{problemas.map((x) => <span key={x} style={{ display: 'block' }}>{x}</span>)}</span>
                    </div>
                  )}
                  {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}

                  <div className="mq-btns">
                    <button
                      type="button"
                      className="mq-btn mq-btn--primary"
                      disabled={enviando || problemas.length > 0}
                      onClick={aplicar}
                    >
                      {enviando ? 'Distribuindo…' : 'Distribuir'}
                    </button>
                    <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>
                      Fechar
                    </button>
                  </div>

                  <p className="mq-hint">
                    Cada mudança vira um movimento na razão, com a variação
                    dita. Redefinir a ESTRUTURA — criar ou apagar variações — é
                    outra operação: ela reescreve saldo e pode desvincular a
                    peça da Nuvemshop, e continua no painel clássico.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const COLUNAS = {
  gridTemplateColumns: 'minmax(0,2fr) 100px 100px 110px',
};
