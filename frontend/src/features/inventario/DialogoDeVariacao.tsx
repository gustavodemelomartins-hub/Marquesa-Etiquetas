import { useEffect, useRef, useState } from 'react';

export interface VariacaoOferecida {
  nome: string;
  varianteId: string | null;
}

export interface PedidoDeVariacao {
  sku: string;
  desc: string;
  contado: number;
  variacoes: VariacaoOferecida[];
}

export type EscolhaDaVariacao =
  | { tipo: 'variacao'; variacao: string; varianteId: string | null }
  | { tipo: 'nao-sei' };

interface Props {
  pedido: PedidoDeVariacao;
  aoConfirmar: (e: EscolhaDaVariacao) => void;
  aoCancelar: () => void;
}

/** "QUAL VARIAÇÃO VOCÊ ESTÁ CONTANDO?" — o diálogo do protótipo.
 *
 *  Ele existe porque o servidor recusa, com 409, contar um código que tem
 *  variação cadastrada sem dizer qual: escrever estoque sem saber de qual
 *  aro a peça é seria chutar a distribuição de uma variante, que é a
 *  segunda regra do projeto. A recusa está certa; o que faltava era a tela
 *  ter como responder.
 *
 *  São 27 códigos de 790 no catálogo — 3,4% deles, e 124 peças. Pouco no
 *  total, e o suficiente para travar a contagem toda vez que um deles cai
 *  na mão de quem está contando.
 *
 *  "NÃO SEI A VARIAÇÃO" é resposta válida, e não uma desistência: ela
 *  registra uma pendência, bloqueia o código inteiro para ajuste e não
 *  vira movimento nenhum (§4.4/D5). É o caminho honesto para a peça cuja
 *  etiqueta apagou — melhor que escolher um aro no chute para a tela
 *  parar de reclamar.
 */
export function DialogoDeVariacao({ pedido, aoConfirmar, aoCancelar }: Props) {
  const [escolha, setEscolha] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoCancelar(); };
    document.addEventListener('keydown', aoTeclar);
    /* O foco entra no diálogo: quem bipou a etiqueta está com as duas mãos
       ocupadas e responde pelo teclado. */
    caixa.current?.querySelector('input')?.focus();
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoCancelar]);

  function confirmar() {
    if (escolha === null) return;
    if (escolha === '__nao_sei__') { aoConfirmar({ tipo: 'nao-sei' }); return; }
    const v = pedido.variacoes.find((x) => (x.varianteId ?? x.nome) === escolha);
    if (!v) return;
    aoConfirmar({ tipo: 'variacao', variacao: v.nome, varianteId: v.varianteId });
  }

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Cancelar" onClick={aoCancelar} />
      <div
        className="mq-drawer mq-variacao"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-variacao"
        ref={caixa}
      >
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Identidade da peça</p>
            <h2 className="mq-title" id="titulo-variacao">Qual variação você está contando?</h2>
          </div>
          <button type="button" className="mq-iconbtn" aria-label="Cancelar" onClick={aoCancelar}>
            ×
          </button>
        </div>

        <div className="mq-drawer__body">
          <p className="mq-lede">
            O código <b>{pedido.sku}</b> ({pedido.desc}) tem{' '}
            {pedido.variacoes.length} variações. Você contou{' '}
            <b>{pedido.contado}</b> {pedido.contado === 1 ? 'peça' : 'peças'} — de qual delas?
          </p>

          <fieldset className="mq-fieldset mq-variacao__opcoes">
            <legend>Selecione a variação</legend>
            {pedido.variacoes.map((v) => {
              const valor = v.varianteId ?? v.nome;
              return (
                <label className="mq-variacao__opcao" key={valor}>
                  <input
                    type="radio"
                    name="variacao"
                    value={valor}
                    checked={escolha === valor}
                    onChange={() => setEscolha(valor)}
                  />
                  <span>{v.nome}</span>
                </label>
              );
            })}

            <label className="mq-variacao__opcao mq-variacao__opcao--duvida">
              <input
                type="radio"
                name="variacao"
                value="__nao_sei__"
                checked={escolha === '__nao_sei__'}
                onChange={() => setEscolha('__nao_sei__')}
              />
              <span>
                <b>Não sei a variação</b>
                <small>
                  Registra uma pendência e bloqueia este código para ajuste. Não
                  vira movimento nenhum — é melhor que escolher um aro no chute.
                </small>
              </span>
            </label>
          </fieldset>
        </div>

        <div className="mq-drawer__foot mq-btns">
          <button type="button" className="mq-btn mq-btn--ghost" onClick={aoCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            className="mq-btn mq-btn--primary"
            disabled={escolha === null}
            onClick={confirmar}
          >
            Confirmar variação
          </button>
        </div>
      </div>
    </>
  );
}
