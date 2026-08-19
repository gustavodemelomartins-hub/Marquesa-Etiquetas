import { useCallback } from 'react';
import type { AppState } from '../types/api';
import type { Connection } from '../services/client';
import { buscarEstado } from '../services/state';
import { useApi, type EstadoRequisicao } from './useApi';

/** `GET /api/state` uma vez, compartilhado.
 *
 *  Estoque Total e Revendedoras leem os MESMOS produtos e as MESMAS
 *  maletas. Duas buscas independentes dariam duas respostas capazes de
 *  discordar entre si num intervalo de segundos — e, num sistema em que o
 *  número na tela representa peça física, dois números diferentes para a
 *  mesma pergunta é pior que um número velho. A busca sobe para o `App` e
 *  desce por props. */
export function useEstado(conexao: Connection): EstadoRequisicao<AppState> {
  const buscar = useCallback(
    (signal: AbortSignal) => buscarEstado(conexao, signal),
    [conexao],
  );
  return useApi<AppState>(buscar, [conexao.url, conexao.key]);
}
