import { useCallback, useEffect, useRef, useState } from 'react';

export interface EstadoRequisicao<T> {
  dados: T | null;
  carregando: boolean;
  erro: unknown;
  /** Roda de novo. Útil no botão "tentar de novo". */
  recarregar: () => void;
}

/** Busca automática quando as dependências mudam.
 *
 *  Aborta ao desmontar: uma resposta que chega depois do componente sair da
 *  tela não pode escrever num estado que não existe mais. */
export function useApi<T>(
  buscar: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): EstadoRequisicao<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<unknown>(null);
  const [gatilho, setGatilho] = useState(0);

  /* A função muda de identidade a cada render; guardá-la numa ref evita
     rebuscar sem motivo, sem obrigar quem chama a memoizar. */
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;

  useEffect(() => {
    const ctrl = new AbortController();
    let vivo = true;

    setCarregando(true);
    setErro(null);

    buscarRef
      .current(ctrl.signal)
      .then((r) => {
        if (!vivo) return;
        setDados(r);
        setCarregando(false);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        /* Abortar é o comportamento normal ao trocar de tela, não erro. */
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setErro(e);
        setCarregando(false);
      });

    return () => {
      vivo = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, gatilho]);

  const recarregar = useCallback(() => setGatilho((n) => n + 1), []);

  return { dados, carregando, erro, recarregar };
}

/** Chamada disparada por uma AÇÃO, não pelo render.
 *
 *  Separada de `useApi` de propósito: analisar a sincronização lê a loja
 *  inteira e demora — isso não pode acontecer só porque alguém abriu a
 *  tela. Quem decide é a pessoa, clicando. */
export function useAcao<T, A extends unknown[]>(
  executar: (...args: A) => Promise<T>,
) {
  const [dados, setDados] = useState<T | null>(null);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  const executarRef = useRef(executar);
  executarRef.current = executar;

  const disparar = useCallback(async (...args: A) => {
    setRodando(true);
    setErro(null);
    try {
      const r = await executarRef.current(...args);
      setDados(r);
      return r;
    } catch (e) {
      setErro(e);
      return null;
    } finally {
      setRodando(false);
    }
  }, []);

  const limpar = useCallback(() => {
    setDados(null);
    setErro(null);
  }, []);

  return { dados, rodando, erro, disparar, limpar };
}
