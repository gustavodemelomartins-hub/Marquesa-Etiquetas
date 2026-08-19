/** Estado de uma sessão de reconciliação por planilha (Estoque Total ou
 *  Produtos Novos) na tela. Fino de propósito: toda a REGRA fica no
 *  backend (motor de reconciliação); aqui só se guarda o que a API já
 *  devolveu e se refaz a leitura depois de cada decisão. */
import { useCallback, useState } from 'react';
import type { Connection } from '../../services/client';
import {
  analisarEstoqueTotal,
  analisarProdutosNovos,
  aplicarSessao as aplicarSessaoApi,
  aprovarItem,
  cancelarSessao as cancelarSessaoApi,
  obterSessao,
  rejeitarItem,
} from './api';
import type { ModoPlanilha, ProdutoPlanilha, RespostaAplicar, SessaoReconciliacao } from './tipos';

export function useSessaoPlanilha(conexao: Connection, modo: ModoPlanilha) {
  const [sessao, setSessao] = useState<SessaoReconciliacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);
  const [resultadoAplicar, setResultadoAplicar] = useState<RespostaAplicar | null>(null);

  const analisar = useCallback(
    async (produtos: ProdutoPlanilha[]) => {
      setCarregando(true);
      setErro(null);
      try {
        const s =
          modo === 'estoque-total'
            ? await analisarEstoqueTotal(conexao, produtos)
            : await analisarProdutosNovos(conexao, produtos);
        setSessao(s);
        return s;
      } catch (e) {
        setErro(e);
        return null;
      } finally {
        setCarregando(false);
      }
    },
    [conexao, modo],
  );

  const recarregar = useCallback(async () => {
    if (!sessao) return;
    try {
      setSessao(await obterSessao(conexao, sessao.id));
    } catch (e) {
      setErro(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conexao, sessao?.id]);

  const decidir = useCallback(
    async (itemId: number, aprovar: boolean) => {
      if (!sessao) return;
      setErro(null);
      try {
        if (aprovar) await aprovarItem(conexao, sessao.id, itemId);
        else await rejeitarItem(conexao, sessao.id, itemId);
        setSessao(await obterSessao(conexao, sessao.id));
      } catch (e) {
        setErro(e);
      }
    },
    [conexao, sessao],
  );

  const aplicar = useCallback(async () => {
    if (!sessao) return null;
    setCarregando(true);
    setErro(null);
    try {
      const r = await aplicarSessaoApi(conexao, sessao.id);
      setResultadoAplicar(r);
      setSessao(await obterSessao(conexao, sessao.id));
      return r;
    } catch (e) {
      setErro(e);
      return null;
    } finally {
      setCarregando(false);
    }
  }, [conexao, sessao]);

  const cancelar = useCallback(async () => {
    if (!sessao) return;
    try {
      await cancelarSessaoApi(conexao, sessao.id);
    } catch {
      /* melhor esforço: se a sessão já saiu de "revisao" (por exemplo, o
         Apply já rodou noutra aba), cancelar não faz sentido mais — e a
         tela vai reiniciar de qualquer forma. */
    }
  }, [conexao, sessao]);

  const reiniciar = useCallback(() => {
    setSessao(null);
    setErro(null);
    setResultadoAplicar(null);
  }, []);

  return {
    sessao,
    carregando,
    erro,
    resultadoAplicar,
    analisar,
    recarregar,
    decidir,
    aplicar,
    cancelar,
    reiniciar,
  };
}
