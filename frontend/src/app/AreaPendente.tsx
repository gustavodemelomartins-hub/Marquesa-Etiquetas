import { Icone } from '../components/Icone';
import { NO_PAINEL_CLASSICO, acharModulo, type ModuloId } from './modulos';

interface Props {
  modulo: ModuloId;
}

/** A tela de um módulo que já tem lugar no trilho mas ainda não tem tela
 *  própria em React.
 *
 *  Ela é honesta de propósito e diz três coisas, nesta ordem: qual é a
 *  pergunta que este módulo vai responder, que ele ainda não foi migrado, e
 *  onde a tarefa se resolve HOJE. O que ela não faz é desenhar caixas
 *  vazias com números falsos — uma tela que finge estar pronta custa mais
 *  caro do que uma que assume que não está. */
export function AreaPendente({ modulo }: Props) {
  const m = acharModulo(modulo);
  const existeNoClassico = modulo === 'etiquetas';
  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">{m.rotulo} · em desenvolvimento</p>
          <h1 className="mq-display">{m.pergunta ?? m.rotulo}</h1>
          <p className="mq-lede">
            {existeNoClassico
              ? 'A impressão de etiquetas ainda funciona no painel clássico. Estamos trazendo esse fluxo para a V2.'
              : 'Este módulo está em construção. Os dados operacionais existentes continuam nas telas da V2.'}
          </p>
        </div>
      </div>

      <section className="mq-card">
        <div className="mq-state">
          <span className="mq-state__icon"><Icone nome={m.icone} /></span>
          <h3>Em desenvolvimento</h3>
          <p>
            {existeNoClassico
              ? 'Prepare e imprima as etiquetas no painel clássico enquanto a versão conectada ao catálogo é construída.'
              : modulo === 'agenda'
                ? 'Prazos e vencimentos já aparecem nas áreas de Maletas, Financeiro e Garantias. A visão de agenda ainda será construída.'
                : 'Os alertas operacionais já aparecem nas áreas correspondentes. A central de notificações ainda será construída.'}
          </p>
          {existeNoClassico && (
            <p>
              <a className="mq-btn mq-btn--primary" href={NO_PAINEL_CLASSICO}>
                Abrir no painel clássico
                <Icone nome="arrow" />
              </a>
            </p>
          )}
        </div>
      </section>
    </>
  );
}
