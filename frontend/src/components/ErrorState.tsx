import { ApiError } from '../types/api';
import { Icone } from './Icone';

interface Props {
  erro: unknown;
  /** Quando dá para tentar de novo, ofereça. */
  aoTentarDeNovo?: () => void;
}

/** A mensagem vem do servidor quando ele manda uma.
 *
 *  As frases do backend costumam dizer o que FAZER — "o token não tem a
 *  permissão de ler pedidos; gere um token novo, porque ele guarda as
 *  permissões de quando foi criado". Reescrever isso aqui só perderia
 *  informação. */
export function ErrorState({ erro, aoTentarDeNovo }: Props) {
  const mensagem =
    erro instanceof ApiError
      ? erro.message
      : erro instanceof Error
        ? erro.message
        : 'Algo deu errado.';

  const chaveRuim = erro instanceof ApiError && erro.naoAutorizado;

  return (
    <div className="mq-state mq-state--error" role="alert">
      <span className="mq-state__icon"><Icone nome="alert" /></span>
      <h3>{chaveRuim ? 'A chave não foi aceita' : 'Não consegui carregar'}</h3>
      <p>{mensagem}</p>
      {aoTentarDeNovo && (
        <div className="mq-btns">
          <button type="button" className="mq-btn mq-btn--secondary" onClick={aoTentarDeNovo}>
            Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}
