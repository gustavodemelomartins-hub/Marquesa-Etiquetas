import { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { Icone } from '../../components/Icone';
import { LoadingState } from '../../components/LoadingState';
import { money, plural } from '../../domain/formato';
import {
  composicaoDe, descricaoDaComposicao, faltaPorGrupo, impedimentosDaComposicao,
  lerRecusa, listarModelosDeColar,
  type ComposicaoDoColar, type EscolhaDeComponente, type ModeloDeColar,
} from './colar';
import type { Connection } from '../../services/client';

interface Props {
  conexao: Connection;
  aoAdicionar: (c: ComposicaoDoColar) => void;
  aoCancelar: () => void;
}

/** MONTE SEU COLAR — a composição, do jeito que a cliente a escolhe.
 *
 *  Três passos, os mesmos do protótipo: quantas peças de cada grupo, qual
 *  cor em cada posição, e a conferência do conjunto. A corrente aparece
 *  presa no alto porque ela NÃO é escolha — está na configuração, sai em
 *  toda montagem, e desenhá-la como opção faria alguém tentar trocá-la e
 *  receber uma recusa que ela não entenderia.
 *
 *  Quando `PERSONALIZACAO_ATIVA=false`, a tela CONTINUA visível e a operação
 *  fica bloqueada, com o texto do próprio servidor. Ela existe para ser
 *  conferida antes de ser ligada — e ligar em silêncio venderia uma
 *  composição que o registro recusa.
 */
export function MonteSeuColar({ conexao, aoAdicionar, aoCancelar }: Props) {
  const modelos = useApi((s) => listarModelosDeColar(conexao, s), [conexao]);
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [escolhas, setEscolhas] = useState<EscolhaDeComponente[]>([]);
  const [observacao, setObservacao] = useState('');

  const lista = modelos.dados?.modelos ?? [];
  const modelo = useMemo(
    () => lista.find((m) => m.id === modeloId) ?? (lista.length === 1 ? lista[0] ?? null : null),
    [lista, modeloId],
  );

  const recusa = lerRecusa(modelos.erro);

  function mudarQtd(o: ModeloDeColar['opcoes'][number], delta: number) {
    setEscolhas((atual) => {
      const i = atual.findIndex((e) => e.opcaoId === o.id);
      if (i === -1) {
        if (delta <= 0) return atual;
        return [...atual, {
          opcaoId: o.id,
          componenteSku: o.componenteSku,
          rotulo: o.rotulo,
          grupo: o.grupo,
          variacao: o.variacao,
          varianteId: o.varianteId,
          qtd: delta,
        }];
      }
      const nova = Math.max(0, (atual[i] as EscolhaDeComponente).qtd + delta);
      if (nova === 0) return atual.filter((_, k) => k !== i);
      return atual.map((e, k) => (k === i ? { ...e, qtd: nova } : e));
    });
  }

  const problemas = impedimentosDaComposicao(modelo, escolhas);
  const faltas = modelo ? faltaPorGrupo(modelo, escolhas) : [];
  const pronto = !!modelo && problemas.length === 0 && !recusa?.desativada;

  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">Composição rápida</p>
          <h1 className="mq-display">Monte seu Colar</h1>
          <p className="mq-lede">
            Escolha as peças, confira o conjunto e adicione à venda. A corrente
            entra automaticamente.
          </p>
        </div>
        <div className="mq-pagehead__actions">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoCancelar}>Voltar</button>
        </div>
      </div>

      {recusa?.desativada && (
        <div className="mq-note mq-note--warn" role="alert">
          <Icone nome="alert" />
          <span>
            <b>Operação bloqueada.</b> {recusa.mensagem} A tela continua aqui
            para ser conferida; nenhuma composição pode ser registrada
            enquanto <code>PERSONALIZACAO_ATIVA</code> estiver desligada, e o
            servidor recusaria o registro do mesmo jeito.
          </span>
        </div>
      )}

      {recusa && !recusa.desativada && (
        <div className="mq-note mq-note--risk" role="alert">
          <Icone nome="alert" />
          <span>{recusa.mensagem}</span>
        </div>
      )}

      {modelos.carregando && <LoadingState />}

      {!modelos.carregando && !recusa && lista.length === 0 && (
        <div className="mq-state">
          <span className="mq-state__icon"><Icone nome="star" /></span>
          <h3>Nenhuma configuração cadastrada</h3>
          <p>{modelos.dados?.regra}</p>
        </div>
      )}

      {lista.length > 1 && (
        <div className="mq-chipset" role="group" aria-label="Configuração">
          {lista.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={modelo?.id === m.id}
              onClick={() => { setModeloId(m.id); setEscolhas([]); }}
            >
              {m.nome}
            </button>
          ))}
        </div>
      )}

      {modelo && (
        <>
          <section className="mq-card mq-card--pad">
            <div className="mq-item">
              <span className="mq-item__icon mq-item__icon--ok"><Icone nome="check" /></span>
              <span className="mq-item__main">
                <b>Corrente incluída automaticamente</b>
                <small>
                  {modelo.baseNome ?? modelo.baseSkuPadrao ?? 'sem corrente cadastrada'}
                  {modelo.baseSkuPadrao ? ` · SKU ${modelo.baseSkuPadrao}` : ''}
                  {modelo.baseDisponivel != null ? ` · ${modelo.baseDisponivel} em estoque` : ''}
                </small>
              </span>
              <span className="mq-item__side"><b className="mq-qty">1 un.</b></span>
            </div>
            <p className="mq-hint">
              A corrente não é escolha: ela está na configuração e sai em toda
              montagem. {modelo.disponivel} {plural(modelo.disponivel, 'montagem possível', 'montagens possíveis')} com
              o estoque de agora — o SKU comercial não tem saldo próprio.
            </p>
          </section>

          {modelo.slots.map((slot, i) => {
            const opcoes = modelo.opcoes.filter((o) => o.grupo === slot.grupo);
            const f = faltas.find((x) => x.grupo === slot.grupo);
            return (
              <section className="mq-card mq-card--pad" key={slot.grupo}>
                <div className="mq-spread">
                  <h2 className="mq-title">
                    <span className="mq-badge mq-badge--brand">{i + 1}</span> {slot.grupo}
                  </h2>
                  <span className={f && f.falta === 0 ? 'mq-status mq-status--ok' : 'mq-status mq-status--warn'}>
                    {f?.escolhido ?? 0} de {slot.qtd}
                  </span>
                </div>
                <p className="mq-lede">
                  Esta configuração leva {slot.qtd} {plural(slot.qtd, 'peça', 'peças')} deste
                  grupo. Repetir a mesma opção é permitido.
                </p>

                {opcoes.length === 0 ? (
                  <p className="mq-hint">Nenhuma opção cadastrada para {slot.grupo}.</p>
                ) : (
                  <div className="mq-grid mq-grid--3">
                    {opcoes.map((o) => {
                      const escolhida = escolhas.find((e) => e.opcaoId === o.id);
                      const qtd = escolhida?.qtd ?? 0;
                      const bloqueada = !!o.indisponivel;
                      return (
                        <div className={bloqueada ? 'mq-card mq-card--pad mq-card--quiet' : 'mq-card mq-card--pad'} key={o.id}>
                          <b>{o.rotulo}</b>
                          <small className="mq-sku">
                            {o.componenteNome} · {o.componenteSku}
                          </small>
                          <small className={bloqueada ? 'mq-money--risk' : 'mq-muted'}>
                            {o.indisponivel ?? `${o.disponivel} ${plural(o.disponivel, 'disponível', 'disponíveis')}`}
                          </small>
                          <div className="mq-btns">
                            <button
                              type="button"
                              className="mq-btn mq-btn--ghost mq-btn--sm"
                              aria-label={`Menos ${o.rotulo}`}
                              disabled={qtd === 0}
                              onClick={() => mudarQtd(o, -1)}
                            >−</button>
                            <output className="mq-qty" aria-label={`Quantidade de ${o.rotulo}`}>{qtd}</output>
                            <button
                              type="button"
                              className="mq-btn mq-btn--secondary mq-btn--sm"
                              aria-label={`Mais ${o.rotulo}`}
                              disabled={bloqueada || qtd >= o.disponivel}
                              onClick={() => mudarQtd(o, 1)}
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          <section className="mq-card mq-card--pad">
            <h2 className="mq-title">
              <span className="mq-badge mq-badge--brand">{modelo.slots.length + 1}</span> Confira o conjunto
            </h2>

            <dl className="mq-dl">
              <div>
                <dt>Peça comercial</dt>
                <dd>{modelo.nome}{modelo.skuComercial ? ` · SKU ${modelo.skuComercial}` : ''}</dd>
              </div>
              <div>
                <dt>Composição</dt>
                <dd>
                  {escolhas.length === 0
                    ? '—'
                    : escolhas.map((e) => `${e.qtd}× ${e.rotulo}`).join(', ')}
                </dd>
              </div>
              <div>
                <dt>Preço da configuração</dt>
                <dd>{modelo.precoSugerido == null ? '—' : money(modelo.precoSugerido)}</dd>
              </div>
            </dl>

            <p className="mq-hint">
              O preço é da configuração, não a soma das peças — e o servidor
              recusa um valor diferente. Por isso não há preço final editável
              aqui: um campo que sempre volta recusado é pior que campo nenhum.
            </p>

            <label className="mq-field">
              <span>Observação da composição <small>opcional</small></span>
              <input
                className="mq-input"
                maxLength={120}
                placeholder="ex.: presente, embalar separado"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </label>

            {problemas.length > 0 && (
              <div className="mq-note mq-note--warn">
                <Icone nome="alert" />
                <span>{problemas.map((p) => <span key={p} style={{ display: 'block' }}>{p}</span>)}</span>
              </div>
            )}

            <div className="mq-btns">
              <button
                type="button"
                className="mq-btn mq-btn--primary"
                disabled={!pronto}
                onClick={() => {
                  if (!modelo) return;
                  aoAdicionar(composicaoDe(modelo, escolhas, observacao));
                }}
              >
                Adicionar à venda
                {modelo.precoSugerido != null ? ` · ${money(modelo.precoSugerido)}` : ''}
              </button>
              <button type="button" className="mq-btn mq-btn--ghost" onClick={aoCancelar}>Cancelar</button>
            </div>

            {pronto && (
              <p className="mq-hint">
                Vai para a venda como: <b>{descricaoDaComposicao(composicaoDe(modelo, escolhas, observacao))}</b>
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
