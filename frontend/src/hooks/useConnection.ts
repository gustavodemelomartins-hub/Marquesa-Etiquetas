import { useCallback, useState } from 'react';
import {
  esquecerConexao,
  gravarConexao,
  lerConexao,
  type Connection,
} from '../services/client';

/** A conexão com o Worker: endereço e chave.
 *
 *  Compartilhada com o dashboard legado pela MESMA chave de localStorage —
 *  quem já conectou lá, chega aqui conectado. */
export function useConnection() {
  const [conexao, setConexao] = useState<Connection | null>(() => lerConexao());

  const conectar = useCallback((c: Connection) => {
    const limpa: Connection = { url: c.url.replace(/\/+$/, ''), key: c.key };
    gravarConexao(limpa);
    setConexao(limpa);
  }, []);

  const desconectar = useCallback(() => {
    esquecerConexao();
    setConexao(null);
  }, []);

  return { conexao, conectar, desconectar };
}
