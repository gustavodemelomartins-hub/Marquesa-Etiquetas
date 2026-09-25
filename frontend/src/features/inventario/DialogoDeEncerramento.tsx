import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { plural } from '../../domain/formato';

export interface ResumoDoEncerramento {
  conferido: number;
  faltando: number;
  sobrando: number;
  naoConferido: number;
  pecasContadas: number;
}

/** O que a pessoa escolheu. `contagemCompleta` é a única coisa que viaja
 *  para o servidor — e é a afirmação inteira. */
export type EscolhaDoEncerramento = { contagemCompleta: boolean };

interface Props {
  resumo: ResumoDoEncerramento;
  ocupado: boolean;
  aoConfirmar: (e: EscolhaDoEncerramento) => void;
  aoCancelar: () => void;
}

/** FINALIZAR A CONTAGEM — a pergunta que faltava.
 *
 *  Antes, finalizar era um `confirm()` do navegador com um parágrafo dentro.
 *  Ele avisava que os não conferidos continuariam incógnitas e encerrava o
 *  assunto. O aviso estava certo e o fluxo estava incompleto: quem terminou
 *  de conferir a loja INTEIRA não tinha como dizer isso, e 659 códigos
 *  ficavam sem resolução, sem divergência e sem caminho nenhum.
 *
 *  ── As três saídas, e por que são três ─────────────────────────────────
 *
 *   1. **Continuar conferindo.** Nada acontece. É a saída padrão, e é para
 *      onde vai o clique errado — o `Esc`, o clique no fundo e o botão de
 *      fechar levam todos aqui;
 *
 *   2. **Encerrar só com o que conferi.** Congela o retrato do jeito de
 *      sempre: o que ninguém bipou continua incógnita e não vira diferença.
 *      É o caso real de quem contou só a gaveta dos brincos hoje;
 *
 *   3. **Terminei de conferir tudo.** A afirmação. Só ela transforma uma
 *      peça que o sistema tem e ela não achou em divergência candidata —
 *      e mesmo assim nenhum movimento é aplicado: a resolução é a etapa
 *      seguinte, item a item, com motivo obrigatório.
 *
 *  ── O guardrail ────────────────────────────────────────────────────────
 *
 *  A terceira saída é a mais cara da tela: ela é a diferença entre "659
 *  incógnitas" e "659 faltas para investigar". Por isso ela não é o botão
 *  primário, repete o número em voz alta e, acima de trinta códigos, exige
 *  um segundo gesto — marcar a caixa de confirmação. Um clique acidental em
 *  "Finalizar" não pode declarar o estoque inteiro conferido.
 *
 *  Não é um `confirm()` porque `confirm()` não tem três saídas, não sabe
 *  dizer um número em negrito e não sabe exigir um segundo gesto.
 */
export function DialogoDeEncerramento({ resumo, ocupado, aoConfirmar, aoCancelar }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const [cienteDoRisco, setCiente] = useState(false);

  const pendentes = resumo.naoConferido;
  const tudoConferido = pendentes === 0;
  /* Acima deste tamanho a declaração deixa de ser "faltaram três" e passa a
     ser "declarei meio catálogo": aí ela pede o segundo gesto. Trinta é o
     tamanho de uma gaveta esquecida, não o de um catálogo. */
  const exigeSegundoGesto = pendentes > 30;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoCancelar(); };
    document.addEventListener('keydown', aoTeclar);
    caixa.current?.querySelector('button')?.focus();
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoCancelar]);

  return (
    <>
      <button type="button" className="mq-scrim" aria-label="Continuar conferindo" onClick={aoCancelar} />
      <div
        className="mq-drawer mq-encerrar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-encerrar"
        ref={caixa}
      >
        <div className="mq-drawer__head">
          <div>
            <p className="mq-eyebrow">Encerrar a contagem</p>
            <h2 className="mq-title" id="titulo-encerrar">
              {tudoConferido
                ? 'Tudo conferido. Podemos congelar o retrato?'
                : 'Você terminou de conferir todo o estoque?'}
            </h2>
          </div>
          {/* O rótulo diz o que o gesto FAZ, e não repete o do botão de
              baixo: dois controles com o mesmo nome acessível na mesma
              caixa deixam quem navega por leitor de tela sem saber qual é
              qual. */}
          <button type="button" className="mq-iconbtn" aria-label="Voltar para a contagem" onClick={aoCancelar}>
            ×
          </button>
        </div>

        <div className="mq-drawer__body">
          <dl className="mq-figures">
            <div className="is-ok">
              <dt>Bateram</dt>
              <dd>{resumo.conferido}</dd>
            </div>
            <div className={resumo.faltando ? 'is-risk' : ''}>
              <dt>Faltando</dt>
              <dd>{resumo.faltando}</dd>
            </div>
            <div className={resumo.sobrando ? 'is-brand' : ''}>
              <dt>Sobrando</dt>
              <dd>{resumo.sobrando}</dd>
            </div>
            <div>
              <dt>Peças contadas</dt>
              <dd>{resumo.pecasContadas.toLocaleString('pt-BR')}</dd>
            </div>
          </dl>

          {tudoConferido ? (
            <p className="mq-note mq-note--ok">
              <Icone nome="check" />
              <span>
                Todos os códigos esperados receberam um bipe. Encerrar congela
                o retrato e <b>não altera estoque nenhum</b> — as diferenças
                vão para a revisão, uma a uma.
              </span>
            </p>
          ) : (
            <>
              <p className="mq-note mq-note--warn">
                <Icone nome="alert" />
                <span>
                  Existem <b>{pendentes.toLocaleString('pt-BR')}</b>{' '}
                  {plural(pendentes, 'código que ainda não recebeu nenhum bipe',
                    'códigos que ainda não receberam nenhum bipe')}.
                </span>
              </p>
              <p className="mq-lede">
                O que acontece com eles depende da sua resposta — e é por isso
                que o sistema pergunta em vez de decidir.
              </p>
            </>
          )}
        </div>

        {tudoConferido ? (
          <div className="mq-drawer__foot mq-btns">
            <button type="button" className="mq-btn mq-btn--ghost" onClick={aoCancelar}>
              Continuar conferindo
            </button>
            <button
              type="button"
              className="mq-btn mq-btn--primary"
              disabled={ocupado}
              onClick={() => aoConfirmar({ contagemCompleta: true })}
            >
              {ocupado ? 'Encerrando…' : 'Encerrar e revisar'}
            </button>
          </div>
        ) : (
          /* As duas saídas com consequência, desenhadas como ESCOLHAS e não
             como botões empilhados: elas fazem coisas diferentes com 659
             códigos, e um par "Cancelar / OK" não teria como dizer isso. */
          <div className="mq-drawer__body encerrar-opcoes">
            <section className="encerrar-opcao">
              <div>
                <b>Encerrar com o que já conferi</b>
                <p>
                  Os {pendentes.toLocaleString('pt-BR')} códigos sem bipe
                  continuam <b>não conferidos</b>. Nenhum zero é criado,
                  nenhuma divergência é inventada — é o inventário parcial de
                  sempre.
                </p>
              </div>
              <button
                type="button"
                className="mq-btn mq-btn--secondary"
                disabled={ocupado}
                onClick={() => aoConfirmar({ contagemCompleta: false })}
              >
                Encerrar parcial
              </button>
            </section>

            <section className="encerrar-opcao encerrar-opcao--forte">
              <div>
                <b>Terminei de conferir tudo</b>
                <p>
                  Você está afirmando que olhou fisicamente todo o estoque
                  deste inventário. Os {pendentes.toLocaleString('pt-BR')}{' '}
                  códigos sem bipe viram <b>divergências para investigar</b>.
                  Nenhum ajuste é aplicado agora: cada um precisa de um motivo
                  na revisão.
                </p>
                {exigeSegundoGesto && (
                  <label className="encerrar-ciente">
                    <input
                      type="checkbox"
                      checked={cienteDoRisco}
                      onChange={(e) => setCiente(e.target.checked)}
                    />
                    <span>
                      Confirmo que procurei os{' '}
                      {pendentes.toLocaleString('pt-BR')} códigos e não os
                      encontrei em casa.
                    </span>
                  </label>
                )}
              </div>
              <button
                type="button"
                className="mq-btn mq-btn--danger"
                disabled={ocupado || (exigeSegundoGesto && !cienteDoRisco)}
                onClick={() => aoConfirmar({ contagemCompleta: true })}
              >
                {ocupado ? 'Encerrando…' : 'Sim, terminei a contagem'}
              </button>
            </section>

            <button type="button" className="mq-btn mq-btn--ghost mq-btn--block" onClick={aoCancelar}>
              Continuar conferindo
            </button>
          </div>
        )}
      </div>
    </>
  );
}
