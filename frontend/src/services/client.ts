/** O único lugar que fala com o Worker.
 *
 *  Nenhum componente chama `fetch` direto. Aqui moram: endereço, chave,
 *  JSON, erro e tipagem da resposta.
 *
 *  A autenticação é a MESMA do dashboard legado, de propósito: a chave e o
 *  endereço saem da mesma chave de localStorage, no mesmo formato. Quem já
 *  está conectado no app antigo abre este e já está conectado. Trocar isso
 *  é outra etapa — ver docs/SECURITY.md.
 */
import { ApiError } from '../types/api';

/** Mesma chave do dashboard legado (`CONN_KEY` em src/dashboard.tpl.html). */
const CHAVE_CONEXAO = 'marquesa_conexao_v1';

export interface Connection {
  /** Sem barra no fim. */
  url: string;
  key: string;
}

/** Lê a conexão guardada neste navegador. `null` quando não há. */
export function lerConexao(): Connection | null {
  try {
    const bruto = localStorage.getItem(CHAVE_CONEXAO);
    if (!bruto) return null;
    const c: unknown = JSON.parse(bruto);
    if (!c || typeof c !== 'object') return null;
    const { url, key } = c as Partial<Connection>;
    if (typeof url !== 'string' || typeof key !== 'string' || !url || !key) return null;
    return { url: url.replace(/\/+$/, ''), key };
  } catch {
    /* localStorage bloqueado (navegação privada em alguns navegadores) não
       pode derrubar o app — ele só passa a pedir a conexão de novo. */
    return null;
  }
}

export function gravarConexao(c: Connection): void {
  try {
    localStorage.setItem(CHAVE_CONEXAO, JSON.stringify(c));
  } catch {
    /* idem */
  }
}

export function esquecerConexao(): void {
  try {
    localStorage.removeItem(CHAVE_CONEXAO);
  } catch {
    /* idem */
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Opcoes {
  /** Aborta a chamada — usado quando o componente desmonta. */
  signal?: AbortSignal;
}

/** Chamada crua. Devolve o JSON já tipado, ou lança `ApiError`.
 *
 *  A mensagem do erro vem do próprio servidor (`{erro: "..."}`) quando ele
 *  manda uma: as frases do backend costumam dizer o que FAZER — "o token
 *  não tem a permissão de ler pedidos, gere um token novo" — e reescrevê-las
 *  aqui só perderia informação. */
export async function chamar<T>(
  conexao: Connection,
  metodo: Metodo,
  caminho: string,
  corpo?: unknown,
  opcoes: Opcoes = {},
): Promise<T> {
  const cabecalhos: Record<string, string> = {
    Authorization: `Bearer ${conexao.key}`,
  };
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

  let resposta: Response;
  try {
    resposta = await fetch(conexao.url + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      ...(opcoes.signal ? { signal: opcoes.signal } : {}),
    });
  } catch (e) {
    /* Falha de rede não tem status. Distinguir isso de um 500 importa: uma
       é "a internet caiu", a outra é "o servidor recusou". */
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(
      'Não consegui falar com o servidor. Confira o endereço e a conexão.',
      0,
      null,
    );
  }

  let json: unknown = null;
  try {
    json = await resposta.json();
  } catch {
    /* 204 e respostas vazias caem aqui, e isso é normal. */
  }

  if (!resposta.ok) {
    const doServidor =
      json && typeof json === 'object' && 'erro' in json
        ? String((json as { erro: unknown }).erro)
        : '';
    throw new ApiError(
      doServidor || resposta.statusText || `O servidor respondeu ${resposta.status}.`,
      resposta.status,
      json,
    );
  }

  return json as T;
}

/** Sonda pública: existe uma API neste endereço?
 *
 *  Não leva a chave de propósito — `/api/health` fica fora da checagem, e é
 *  o que permite distinguir "endereço errado" de "chave errada" na tela de
 *  conexão. */
export async function verificarEndereco(url: string): Promise<boolean> {
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/api/health');
    if (!r.ok) return false;
    const j: unknown = await r.json();
    return !!(j && typeof j === 'object' && (j as { ok?: unknown }).ok === true);
  } catch {
    return false;
  }
}
