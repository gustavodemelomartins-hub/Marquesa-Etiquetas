import { useState } from 'react';
import { Icone } from '../../components/Icone';
import { ErrorState } from '../../components/ErrorState';
import { money, fmtData } from '../../domain/formato';
import { hojeISO } from '../../domain/formato';
import { definirPrazo, receberConta } from './api';
import type { Connection } from '../../services/client';
import type { ContaAReceber, ContasAReceber } from './tipos';

interface Props {
  conexao: Connection;
  dados: ContasAReceber | null;
  erro: unknown;
  recarregar: () => void;
  aoAbrirCliente: (conta: ContaAReceber) => void;
}

const COLUNAS = {
  gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto',
};

/** A RECEBER — a lista de trabalho do dinheiro.
 *
 *  Três fontes entram aqui e o backend diz quais: compra histórica em
 *  aberto, venda do sistema não paga e diferença de troca de garantia. A
 *  resposta carrega `cobertura`, e quando ela não é completa a tela repete
 *  isso em letra em vez de deixar alguém somar um total pela metade.
 *
 *  Duas ações, e só as duas que o backend sustenta hoje: definir o prazo e
 *  receber. Receber é INTEGRAL — o núcleo quita a conta inteira. Receber em
 *  partes é a decisão D2, que continua fechada, e está dito na tela.
 */
export function AReceber({ conexao, dados, erro, recarregar, aoAbrirCliente }: Props) {
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [falha, setFalha] = useState<{ chave: string; texto: string } | null>(null);
  const [recebendo, setRecebendo] = useState<ContaAReceber | null>(null);

  if (erro) return <section className="mq-card"><ErrorState erro={erro} aoTentarDeNovo={recarregar} /></section>;
  if (!dados) {
    return (
      <section className="mq-card mq-card--pad" aria-busy="true">
        <p className="mq-skel mq-skel--title" />
        <p className="mq-skel mq-skel--line" style={{ marginTop: 14 }} />
        <p className="mq-skel mq-skel--short" style={{ marginTop: 8 }} />
      </section>
    );
  }

  const { resumo, contas, cobertura } = dados;

  async function prazo(conta: ContaAReceber) {
    const valor = prompt(
      `Vencimento de ${conta.cliente ?? 'esta conta'} (AAAA-MM-DD, vazio para tirar o prazo):`,
      conta.vencimentoEm ?? '',
    );
    if (valor === null) return;
    setOcupada(conta.chave);
    setFalha(null);
    const r = await definirPrazo(conexao, {
      chave: conta.chave,
      vencimentoEm: valor.trim() || null,
      versaoEsperada: conta.versao,
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui salvar o prazo.' }));
    setOcupada(null);
    if (r && 'erro' in r && r.erro) setFalha({ chave: conta.chave, texto: String(r.erro) });
    else recarregar();
  }

  return (
    <>
      {!cobertura.completa && (
        <p className="mq-note mq-note--warn">
          <Icone nome="alert" />
          <span>{cobertura.porque}</span>
        </p>
      )}

      <div className="mq-kpis">
        <div className={resumo.total > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Em aberto</span>
          <span className="mq-kpi__value"><i>R$</i>{money(resumo.total).replace('R$ ', '')}</span>
          <span className="mq-kpi__foot">
            {resumo.quantidade} {resumo.quantidade === 1 ? 'conta' : 'contas'}
          </span>
        </div>
        <div className={resumo.vencidas > 0 ? 'mq-kpi mq-kpi--risk' : 'mq-kpi'}>
          <span className="mq-kpi__label">Vencidas</span>
          <span className="mq-kpi__value">{resumo.vencidas}</span>
          <span className="mq-kpi__foot">passaram do prazo combinado</span>
        </div>
        <div className="mq-kpi">
          <span className="mq-kpi__label">Sem prazo</span>
          <span className="mq-kpi__value">{resumo.semPrazo}</span>
          <span className="mq-kpi__foot">ninguém sabe quando cobrar</span>
        </div>
      </div>

      <section className="mq-card mq-card--flush">
        <div className="mq-card__head">
          <div>
            <h2 className="mq-title">Contas em aberto</h2>
            <p className="mq-lede">{dados.regra}</p>
          </div>
        </div>

        {contas.length === 0 ? (
          <div className="mq-state">
            <span className="mq-state__icon"><Icone nome="check" /></span>
            <h3>Nada em aberto</h3>
            <p>Toda compra registrada já foi paga. É o melhor estado possível desta tela.</p>
          </div>
        ) : (
          <div className="mq-table" role="table" aria-label="Contas a receber">
            <div className="mq-tr mq-tr--head" role="row" style={COLUNAS}>
              <span>Cliente</span>
              <span>Data da venda</span>
              <span>Vencimento</span>
              <span>A receber</span>
              <span>Ações</span>
            </div>
            {contas.map((c) => (
              <div className="mq-tr" role="row" key={c.chave} style={COLUNAS}>
                <span className="mq-cell">
                  {c.clienteId || c.clienteNorm ? (
                    <button type="button" className="mq-btn mq-btn--link" onClick={() => aoAbrirCliente(c)}>
                      {c.cliente ?? 'Cliente não identificada'}
                    </button>
                  ) : (
                    <b>{c.cliente ?? 'Cliente não identificada'}</b>
                  )}
                  <small>
                    {c.origem}
                    {c.clienteAmbiguo && ' · nome ambíguo, sem ficha'}
                  </small>
                </span>
                <span className="mq-cell">
                  <b className="mq-date">{fmtData(c.data)}</b>
                  {c.valorRecebido > 0 && <small>já entrou {money(c.valorRecebido)}</small>}
                </span>
                <span className="mq-cell">
                  {c.vencimentoEm ? (
                    <>
                      <b className="mq-date">{fmtData(c.vencimentoEm)}</b>
                      {c.vencida && <small className="mq-status mq-status--risk">vencida</small>}
                    </>
                  ) : (
                    <small>sem prazo</small>
                  )}
                </span>
                <span className="mq-cell mq-cell--num">
                  <b className="mq-money mq-money--risk">{money(c.valorReceber)}</b>
                  {c.valorTotal !== c.valorReceber && <small>de {money(c.valorTotal)}</small>}
                </span>
                <span className="mq-cell">
                  <span className="mq-btns">
                    <button
                      type="button"
                      className="mq-btn mq-btn--primary mq-btn--sm"
                      disabled={ocupada === c.chave}
                      onClick={() => setRecebendo(c)}
                    >
                      Receber
                    </button>
                    {c.podeDefinirPrazo && (
                      <button
                        type="button"
                        className="mq-btn mq-btn--ghost mq-btn--sm"
                        disabled={ocupada === c.chave}
                        onClick={() => prazo(c)}
                      >
                        Prazo
                      </button>
                    )}
                  </span>
                  {falha?.chave === c.chave && (
                    <small className="mq-money--risk">{falha.texto}</small>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {recebendo && (
        <DialogoReceber
          conexao={conexao}
          conta={recebendo}
          aoFechar={() => setRecebendo(null)}
          aoRecebido={() => {
            setRecebendo(null);
            recarregar();
          }}
        />
      )}
    </>
  );
}

/** O diálogo do recebimento. Ele existe por causa de uma data.
 *
 *  Marcar "recebido" sem perguntar QUANDO joga o dinheiro no faturamento de
 *  hoje, e quem recebeu na sexta e lançou na segunda vê o mês errado. A
 *  data vem preenchida com hoje, porque é o caso comum, e é editável,
 *  porque o caso comum não é o único. */
function DialogoReceber({
  conexao, conta, aoFechar, aoRecebido,
}: {
  conexao: Connection;
  conta: ContaAReceber;
  aoFechar: () => void;
  aoRecebido: () => void;
}) {
  const [data, setData] = useState(hojeISO());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    setErro('');
    const r = await receberConta(conexao, {
      chave: conta.chave, pagaEm: data, versaoEsperada: conta.versao,
    }).catch((e: unknown) => ({ erro: e instanceof Error ? e.message : 'Não consegui registrar.' }));
    setSalvando(false);
    if (r && 'erro' in r && r.erro) setErro(String(r.erro));
    else aoRecebido();
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Fechar" onClick={aoFechar} />
      <div className="mq-modal" role="dialog" aria-modal="true" aria-label="Registrar recebimento">
        <div className="mq-modal__head">
          <div>
            <p className="mq-eyebrow">Recebimento</p>
            <h2 className="mq-title">{conta.cliente ?? 'Conta em aberto'}</h2>
          </div>
          <button type="button" className="mq-modal__close" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="close" />
          </button>
        </div>

        <div className="mq-modal__body">
          <dl className="mq-confirm">
            <dt>Valor a receber</dt>
            <dd>{money(conta.valorReceber)}</dd>
          </dl>

          <label className="mq-field">
            <span>Data em que o dinheiro entrou</span>
            <input
              className="mq-input"
              type="date"
              value={data}
              max={hojeISO()}
              onChange={(e) => setData(e.target.value)}
            />
            <small>
              É esta data que manda no faturamento — não a da venda ({fmtData(conta.data)})
              nem a de hoje.
            </small>
          </label>

          <p className="mq-note mq-note--info">
            <Icone nome="alert" />
            <span>
              O sistema quita a conta inteira. Receber em partes depende de uma
              decisão de negócio que ainda não foi tomada, e não está ligado.
            </span>
          </p>

          {erro && <p className="mq-note mq-note--risk" role="alert"><span>{erro}</span></p>}
        </div>

        <div className="mq-modal__foot">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="mq-btn mq-btn--primary" disabled={salvando} onClick={confirmar}>
            {salvando ? 'Registrando…' : `Recebi ${money(conta.valorReceber)}`}
          </button>
        </div>
      </div>
    </>
  );
}
