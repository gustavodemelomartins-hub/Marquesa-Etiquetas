import { useCallback, useState } from 'react';
import type { AppState } from '../types/api';
import {
  tamanhoAlvoDoHistorico,
  type ConfigPlanejamento,
  type ModoPlanejamento,
  type OrigemTamanhoAlvo,
} from '../domain/capacidade';
import { gravarPlanejamento, lerPlanejamento } from '../features/maletas/planejamento';

export interface UsoPlanejamento {
  config: ConfigPlanejamento;
  /** De onde veio o tamanho alvo PADRÃO — mesmo quando ele foi editado, a
   *  tela precisa poder dizer qual era a referência do histórico. */
  origemAlvo: OrigemTamanhoAlvo;
  definirModo: (m: ModoPlanejamento) => void;
  definirTamanhoAlvo: (n: number) => void;
  /** Volta para a mediana do histórico. */
  restaurarPadrao: () => void;
}

/** A configuração de planejamento, com o padrão derivado do histórico real.
 *
 *  O padrão não é uma constante: é a mediana das maletas que a Marquesa já
 *  montou. Só quando não existe maleta nenhuma é que entra um número
 *  arbitrário — e aí `origemAlvo.origem` vale 'padrao' e a tela avisa. */
export function usePlanejamento(estado: AppState | null): UsoPlanejamento {
  const origemAlvo: OrigemTamanhoAlvo = estado
    ? tamanhoAlvoDoHistorico(estado)
    : { valor: 0, origem: 'padrao', amostra: 0 };

  const [guardado, setGuardado] = useState<ConfigPlanejamento | null>(() => lerPlanejamento());

  const config: ConfigPlanejamento = guardado ?? {
    modo: 'equilibrado',
    tamanhoAlvo: origemAlvo.valor || 1,
    tamanhoAlvoConfirmado: false,
  };

  const salvar = useCallback((c: ConfigPlanejamento) => {
    gravarPlanejamento(c);
    setGuardado(c);
  }, []);

  const definirModo = useCallback(
    (modo: ModoPlanejamento) => salvar({ ...config, modo }),
    [config, salvar],
  );

  const definirTamanhoAlvo = useCallback(
    (n: number) =>
      salvar({ ...config, tamanhoAlvo: Math.max(1, Math.round(n)), tamanhoAlvoConfirmado: true }),
    [config, salvar],
  );

  const restaurarPadrao = useCallback(
    () =>
      salvar({
        ...config,
        tamanhoAlvo: origemAlvo.valor || 1,
        tamanhoAlvoConfirmado: false,
      }),
    [config, origemAlvo.valor, salvar],
  );

  return { config, origemAlvo, definirModo, definirTamanhoAlvo, restaurarPadrao };
}
