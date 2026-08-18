/** Sincronização com a Nuvemshop — SÓ LEITURA nesta fase.
 *
 *  `analisar()` é a rodada seca que já existe no backend: ela lê a loja
 *  inteira, calcula o que mudaria e **não escreve na Nuvemshop**. É a base
 *  honesta do botão "Analisar sincronização".
 *
 *  O que esta camada NÃO faz, de propósito:
 *    - não chama `POST /api/sync` sem `seco`;
 *    - não chama com `forcar: true`;
 *    - não aplica nada.
 *
 *  Escrever na loja é operação de Classe C (docs/SECURITY.md) e vai
 *  acontecer pelo motor de reconciliação, com aprovação item a item — ver
 *  docs/ROADMAP_RECONCILIATION.md.
 */
import type { SyncReport, SyncRun } from '../types/sync';
import { chamar, type Connection } from './client';

/** Rodada SECA. Lê a loja, calcula o diff, grava o retrato e o histórico,
 *  e não toca no estoque da Nuvemshop.
 *
 *  Ela demora: lê a loja inteira, respeitando 2 requisições por segundo. A
 *  tela precisa mostrar isso, não fingir que é instantâneo. */
export function analisar(conexao: Connection, signal?: AbortSignal): Promise<SyncReport> {
  return chamar<SyncReport>(
    conexao,
    'POST',
    '/api/sync',
    { seco: true },
    signal ? { signal } : {},
  );
}

/** Histórico das últimas rodadas. */
export function historico(conexao: Connection, signal?: AbortSignal): Promise<SyncRun[]> {
  return chamar<SyncRun[]>(conexao, 'GET', '/api/sync', undefined, signal ? { signal } : {});
}
