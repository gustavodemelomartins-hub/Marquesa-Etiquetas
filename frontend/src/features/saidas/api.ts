import { chamar, type Connection } from '../../services/client';
import type { NovaSaida, Saidas } from './tipos';

/** O ÚNICO adaptador de Saídas sem faturamento. As rotas que existem:
 *
 *    GET  /api/saidas?de=&ate=&tipo=&estornadas=&limite=&offset=
 *    POST /api/saidas                    registra (e movimenta o estoque)
 *    POST /api/saidas/:id/estornar       desfaz, com motivo
 */

export interface FiltroDeSaidas {
  de?: string | null;
  ate?: string | null;
  tipo?: string | null;
  /** O padrão do backend MOSTRA a estornada, marcada. Quem quer o recorte
   *  elegível pede — mesma porta de `/api/vendas/lista?canceladas=nao`. */
  incluirEstornadas?: boolean;
  limite?: number;
  /** Código, nome da peça, motivo ou observação. */
  busca?: string | null;
}

export function listarSaidas(
  conexao: Connection, filtro: FiltroDeSaidas = {}, sinal?: AbortSignal,
): Promise<Saidas> {
  const q = new URLSearchParams({ limite: String(filtro.limite ?? 200) });
  if (filtro.de) q.set('de', filtro.de);
  if (filtro.ate) q.set('ate', filtro.ate);
  if (filtro.tipo) q.set('tipo', filtro.tipo);
  if (filtro.incluirEstornadas === false) q.set('estornadas', 'nao');
  if (filtro.busca && filtro.busca.trim()) q.set('busca', filtro.busca.trim());
  return chamar(conexao, 'GET', `/api/saidas?${q}`, undefined, { signal: sinal });
}

export function registrarSaida(
  conexao: Connection, corpo: NovaSaida,
): Promise<{ ok?: boolean; erro?: string; id?: number }> {
  return chamar(conexao, 'POST', '/api/saidas', corpo);
}

/** Desfaz a saída. O movimento inverso é gravado por `ajuste` — a saída
 *  original CONTINUA no histórico, marcada, porque ela aconteceu. */
export function estornarSaida(
  conexao: Connection, id: number, motivo: string,
): Promise<{ ok?: boolean; erro?: string }> {
  return chamar(conexao, 'POST', `/api/saidas/${id}/estornar`, { motivo });
}
