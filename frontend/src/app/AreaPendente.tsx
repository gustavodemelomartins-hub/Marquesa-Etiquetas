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
  return (
    <>
      <div className="mq-pagehead">
        <div className="mq-pagehead__text">
          <p className="mq-eyebrow">{m.rotulo} · em desenvolvimento</p>
          <h1 className="mq-display">{m.pergunta ?? m.rotulo}</h1>
          <p className="mq-lede">
            É esta a pergunta que {m.rotulo} responde. A tela em React ainda não
            foi construída — até lá, a tarefa continua inteira no painel clássico.
          </p>
        </div>
      </div>

      <section className="mq-card">
        <div className="mq-state">
          <span className="mq-state__icon"><Icone nome={m.icone} /></span>
          <h3>Em desenvolvimento</h3>
          <p>
            Nada se perdeu: {m.rotulo} funciona hoje no painel clássico, com os
            mesmos dados. Este lugar no menu existe para que ele não seja
            procurado em outro canto quando chegar aqui.
          </p>
          <p>
            <a className="mq-btn mq-btn--primary" href={NO_PAINEL_CLASSICO}>
              Abrir no painel clássico
              <Icone nome="arrow" />
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
