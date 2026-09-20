/** O recorte mora em `domain/periodo.ts` desde que Vendas passou a fazer a
 *  MESMA pergunta ao mesmo `/api/analytics/*`. Este arquivo continua aqui só
 *  para o código do Financeiro não precisar mudar de endereço. */
export {
  ROTULOS, PERIODOS, RECORTE_PADRAO,
  intervaloValido, descreverRecorte, recorteDaSub, subDoRecorte,
} from '../../domain/periodo';
