/** A sincronização está de pé o bastante para consertar sozinha o que
 *  estiver divergente?
 *
 *  Esta pergunta existe por causa de uma decisão da tela: "estoque
 *  divergente" não entra em Pendências, porque a rodada seguinte resolve.
 *  Só que essa frase tem uma condição escondida — **existir rodada
 *  seguinte**. Se a loja não está conectada, se a última rodada falhou, se
 *  o freio pausou, ou se faz um dia e meio que nenhuma roda, então ninguém
 *  vai consertar nada e a divergência passa a ser trabalho de gente.
 *
 *  Tudo aqui sai de `resumoSync` (api/src/sync.js), que o `GET /api/state`
 *  já entrega. Nenhum campo novo foi inventado.
 *
 *  Função pura: recebe o resumo e o instante, devolve o diagnóstico.
 */
import type { SyncSummary } from '../../types/api';
import { horasDesde } from '../../services/datas';

export type EstadoSync =
  | 'saudavel'
  | 'desconectada'
  | 'nunca_rodou'
  | 'erro'
  | 'pausada'
  | 'travada'
  | 'atrasada';

export interface DiagnosticoSync {
  estado: EstadoSync;
  /** A pergunta que a tela faz: dá para confiar que a próxima rodada
   *  conserta a divergência sozinha? */
  autoCorrige: boolean;
  rotulo: string;
  motivo: string;
}

/** Duas rodadas por dia — cron `0 9,21 * * *` UTC, que é 06:00 e 18:00 em
 *  Brasília (api/wrangler.toml). Doze horas entre uma e outra.
 *
 *  26 h é um ciclo inteiro perdido mais duas horas de folga. Abaixo disso,
 *  estar sem rodar não prova nada: às 17h59 a última rodada legítima é a
 *  das 06:00 e faz quase doze horas. Acima disso, duas rodadas seguidas
 *  não aconteceram, e isso já não é o calendário — é um problema. */
export const LIMITE_ATRASO_H = 26;

/** Uma rodada leva segundos. O status `rodando` é gravado ANTES do trabalho
 *  e só vira `ok`/`erro` no fim; se o Worker morre no meio (limite de CPU,
 *  deploy no instante errado), a linha fica `rodando` para sempre.
 *
 *  Uma hora presa nesse estado não é uma rodada demorada. É uma que morreu. */
export const LIMITE_TRAVADA_H = 1;

/** A ordem importa: do mais específico para o mais genérico. Uma rodada
 *  pausada há dois dias é "pausada", não "atrasada" — o motivo verdadeiro
 *  é o freio, e é ele que a pessoa precisa resolver. */
export function diagnosticarSync(sync: SyncSummary, agora: Date): DiagnosticoSync {
  if (!sync.conectada) {
    return {
      estado: 'desconectada',
      autoCorrige: false,
      rotulo: 'Loja não conectada',
      motivo:
        'Falta o token da Nuvemshop nos Secrets do Worker. Sem ele não existe rodada nenhuma, nem automática nem manual — nada que estiver divergente se resolve sozinho, e a atualização continua sendo por arquivo.',
    };
  }

  if (sync.ultimoStatus === 'erro') {
    return {
      estado: 'erro',
      autoCorrige: false,
      rotulo: 'Última rodada falhou',
      motivo:
        sync.erro ??
        'A última rodada terminou em erro e não disse o motivo. Nada foi empurrado para a loja.',
    };
  }

  if (sync.ultimoStatus === 'pausado') {
    return {
      estado: 'pausada',
      autoCorrige: false,
      rotulo: 'Pausada pelo freio de segurança',
      /* O detalhe que muda tudo: o cron NUNCA força. A rodada automática vai
         bater no mesmo freio amanhã, e no dia seguinte, até alguém olhar. */
      motivo: `${sync.pausada?.motivo ?? 'A rodada parou no freio de segurança.'} A rodada automática não força — ela vai parar no mesmo ponto até alguém revisar.`,
    };
  }

  if (sync.ultimoStatus === null || sync.ultimaEm === null) {
    return {
      estado: 'nunca_rodou',
      autoCorrige: false,
      rotulo: 'Nenhuma rodada registrada',
      motivo:
        'A loja está conectada, mas nenhuma sincronização terminou até agora. Nada prova que a próxima vai acontecer.',
    };
  }

  const horas = horasDesde(sync.ultimaEm, agora);

  if (sync.ultimoStatus === 'rodando') {
    if (horas !== null && horas > LIMITE_TRAVADA_H) {
      return {
        estado: 'travada',
        autoCorrige: false,
        rotulo: 'Rodada presa no meio',
        motivo: `Uma rodada começou há ${formatarEspera(horas)} e nunca terminou. Uma sincronização leva segundos — esta morreu antes de gravar o resultado.`,
      };
    }
    return {
      estado: 'saudavel',
      autoCorrige: true,
      rotulo: 'Sincronizando agora',
      motivo: 'Uma rodada está em andamento neste momento.',
    };
  }

  if (horas !== null && horas > LIMITE_ATRASO_H) {
    return {
      estado: 'atrasada',
      autoCorrige: false,
      rotulo: 'Sem rodar há tempo demais',
      motivo: `A última sincronização terminou há ${formatarEspera(horas)}. São duas por dia — a essa altura pelo menos duas foram perdidas.`,
    };
  }

  return {
    estado: 'saudavel',
    autoCorrige: true,
    rotulo: 'Sincronizando normalmente',
    motivo: 'A última rodada terminou bem e a próxima está no horário.',
  };
}

function formatarEspera(horas: number): string {
  if (horas < 2) return 'mais de uma hora';
  if (horas < 48) return `${Math.floor(horas)} horas`;
  return `${Math.floor(horas / 24)} dias`;
}
