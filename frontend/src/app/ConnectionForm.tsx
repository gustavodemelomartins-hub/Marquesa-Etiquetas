import { useState, type FormEvent } from 'react';
import { verificarEndereco, type Connection } from '../services/client';
import { buscarEstado } from '../services/state';
import { ApiError } from '../types/api';

interface Props {
  aoConectar: (c: Connection) => void;
  /** Sugestão vinda de uma conexão anterior, quando existir. */
  urlInicial?: string;
}

/** A tela de conexão. Mesmo contrato do dashboard legado: endereço + chave,
 *  guardados neste navegador.
 *
 *  Duas checagens separadas, de propósito — a diferença entre elas é a
 *  diferença entre "o endereço está errado" e "a chave está errada", e
 *  juntar as duas produz a mensagem inútil que o app legado dá hoje. */
export function ConnectionForm({
  aoConectar,
  urlInicial = import.meta.env.VITE_API_URL ?? '',
}: Props) {
  const [url, setUrl] = useState(urlInicial);
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState('');
  const [tentando, setTentando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const endereco = url.trim().replace(/\/+$/, '');
    const key = chave.trim();

    if (!endereco || !key) {
      setErro('Preencha o endereço e a chave.');
      return;
    }

    setTentando(true);
    setErro('');
    try {
      /* 1. o endereço responde? `/api/health` não pede chave. */
      if (!(await verificarEndereco(endereco))) {
        setErro('Não encontrei a API neste endereço.');
        return;
      }
      /* 2. a chave é aceita? Só agora um 401 significa o que parece. */
      const conexao: Connection = { url: endereco, key };
      await buscarEstado(conexao);
      aoConectar(conexao);
    } catch (e) {
      setErro(
        e instanceof ApiError && e.naoAutorizado
          ? 'Chave incorreta.'
          : e instanceof Error
            ? e.message
            : 'Não consegui conectar.',
      );
    } finally {
      setTentando(false);
    }
  }

  return (
    <div className="conexao">
      <div className="cartao" style={{ padding: 'var(--r5)' }}>
        <h2 style={{ marginBottom: 'var(--r2)' }}>Conectar ao servidor</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 'var(--r4)' }}>
          O endereço do Worker e a chave de acesso. Ficam guardados só neste
          aparelho — os mesmos que o painel atual usa.
        </p>

        <form onSubmit={enviar} noValidate>
          <div className="campo">
            <label htmlFor="cx-url">Endereço da API</label>
            <input
              id="cx-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://marquesa-api.exemplo.workers.dev"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="cx-key">Chave de acesso</label>
            <input
              id="cx-key"
              type="password"
              autoComplete="current-password"
              placeholder="A senha definida na Cloudflare"
              value={chave}
              onChange={(e) => setChave(e.target.value)}
            />
          </div>

          <p className="erro-form" role="alert">
            {erro}
          </p>

          <button type="submit" className="btn btn-analise" disabled={tentando}>
            {tentando ? 'Conectando…' : 'Conectar'}
          </button>
        </form>
      </div>
    </div>
  );
}
