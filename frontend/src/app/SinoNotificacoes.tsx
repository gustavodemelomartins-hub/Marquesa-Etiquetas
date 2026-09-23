import { useApi } from '../hooks/useApi';
import { chamar, type Connection } from '../services/client';
import { Icone } from '../components/Icone';

/** `GET /api/pendencias` › `resumo`. É a única contagem do servidor que
 *  significa "alguém precisa olhar isto" — e por isso é ela que o sino
 *  mostra. */
interface ResumoPendencias {
  resumo: { total: number; adiadas: number };
}

interface Props {
  conexao: Connection;
  aoAbrir: () => void;
}

/** O SINO do cabeçalho, com o badge numérico do protótipo.
 *
 *  O número é REAL: vem de `GET /api/pendencias`, a mesma leitura que a
 *  Home usa em "Precisa da sua atenção". Não existe rota de notificação no
 *  Worker — nada no schema guarda "lida" ou "descartada" — então o sino
 *  NÃO finge ser uma caixa de entrada. Ele conta o que está parado
 *  esperando uma pessoa, que é a única coisa que o servidor sabe dizer.
 *
 *  Sem badge quando o total é zero: um "0" permanente treina a pessoa a
 *  ignorar o sino, e aí o dia em que houver algo ela também ignora.
 */
export function SinoNotificacoes({ conexao, aoAbrir }: Props) {
  const pend = useApi(
    (s) => chamar<ResumoPendencias>(conexao, 'GET', '/api/pendencias', undefined, { signal: s }),
    [conexao],
  );

  /* Erro de leitura não vira zero: zero é uma AFIRMAÇÃO ("nada pendente"),
     e não sabemos disso. Sem número, o sino continua abrindo a tela. */
  const total = pend.erro ? null : (pend.dados?.resumo?.total ?? null);
  const temBadge = total !== null && total > 0;

  return (
    <button
      type="button"
      className="mq-iconbtn"
      aria-label={
        temBadge
          ? `Notificações — ${total} ${total === 1 ? 'pendência' : 'pendências'}`
          : 'Notificações'
      }
      onClick={aoAbrir}
    >
      <Icone nome="bell" />
      {temBadge && (
        <span className="mq-iconbtn__dot" aria-hidden="true">
          {total > 99 ? '99+' : total}
        </span>
      )}
    </button>
  );
}
