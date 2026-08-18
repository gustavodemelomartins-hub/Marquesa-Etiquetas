/** Leitura do estado inteiro do sistema.
 *
 *  `GET /api/state` devolve tudo de uma vez — produtos, revendedoras,
 *  maletas, configuração, retrato da loja, inventário e sincronização. É
 *  assim que o dashboard legado funciona, e manter o mesmo contrato é o que
 *  permite os dois frontends conviverem sem o backend saber da diferença.
 */
import type { AppState } from '../types/api';
import { chamar, type Connection } from './client';

export function buscarEstado(
  conexao: Connection,
  signal?: AbortSignal,
): Promise<AppState> {
  return chamar<AppState>(conexao, 'GET', '/api/state', undefined, signal ? { signal } : {});
}
