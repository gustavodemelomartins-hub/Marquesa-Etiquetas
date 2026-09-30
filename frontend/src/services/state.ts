/** Leitura do estado inteiro do sistema.
 *
 *  `GET /api/state` devolve tudo de uma vez — produtos, revendedoras,
 *  maletas, configuração, retrato da loja, inventário e sincronização. É
 *  assim que o dashboard legado funciona, e manter o mesmo contrato é o que
 *  permite os dois frontends conviverem sem o backend saber da diferença.
 */
import type { AppState } from '../types/api';
import { chamar, enderecoDaFoto, type Connection } from './client';

/* Os campos de foto que o servidor manda como CAMINHO assinado. Viram
   endereço completo aqui, uma vez, para nenhuma tela precisar lembrar. */
const CAMPOS_DE_FOTO = ['fotoTratadaUrl', 'fotoOriginalUrl', 'fotoGaleriaUrl', 'fotoMiniUrl'] as const;

export async function buscarEstado(
  conexao: Connection,
  signal?: AbortSignal,
): Promise<AppState> {
  const estado = await chamar<AppState>(conexao, 'GET', '/api/state', undefined, signal ? { signal } : {});
  for (const p of (estado?.produtos ?? []) as unknown as Record<string, unknown>[]) {
    for (const campo of CAMPOS_DE_FOTO) {
      const v = p[campo];
      if (typeof v === 'string') p[campo] = enderecoDaFoto(conexao, v);
    }
  }
  return estado;
}
