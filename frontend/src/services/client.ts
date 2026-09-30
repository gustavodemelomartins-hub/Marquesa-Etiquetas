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

/** Envia um ARQUIVO como corpo cru — a rota de foto recebe os bytes, sem
 *  envelope JSON (`PUT /api/produtos/:sku/foto/:versao`). O resto do
 *  contrato é o de `chamar`: JSON de volta, `ApiError` na recusa. */
export async function enviarArquivo<T>(
  conexao: Connection,
  caminho: string,
  arquivo: Blob,
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(conexao.url + caminho, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${conexao.key}`,
        'Content-Type': arquivo.type || 'application/octet-stream',
      },
      body: arquivo,
    });
  } catch {
    throw new ApiError('Não consegui falar com o servidor. Confira a conexão.', 0, null);
  }
  let json: unknown = null;
  try { json = await resposta.json(); } catch { /* vazio */ }
  if (!resposta.ok) {
    const doServidor = json && typeof json === 'object' && 'erro' in json
      ? String((json as { erro: unknown }).erro) : '';
    throw new ApiError(doServidor || `O servidor respondeu ${resposta.status}.`, resposta.status, json);
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

/** Envia BYTES com método e cabeçalhos à escolha — a galeria recebe a foto
 *  por `POST` e diz o nome do arquivo e as dimensões em cabeçalhos. Mesmo
 *  contrato de `enviarArquivo`: JSON de volta, `ApiError` na recusa. */
export async function enviarBytes<T>(
  conexao: Connection,
  metodo: 'POST' | 'PUT',
  caminho: string,
  arquivo: Blob,
  cabecalhos: Record<string, string> = {},
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(conexao.url + caminho, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${conexao.key}`,
        'Content-Type': arquivo.type || 'application/octet-stream',
        ...cabecalhos,
      },
      body: arquivo,
    });
  } catch {
    throw new ApiError('Não consegui falar com o servidor. Confira a conexão.', 0, null);
  }
  let json: unknown = null;
  try { json = await resposta.json(); } catch { /* vazio */ }
  if (!resposta.ok) {
    const doServidor = json && typeof json === 'object' && 'erro' in json
      ? String((json as { erro: unknown }).erro) : '';
    throw new ApiError(doServidor || `O servidor respondeu ${resposta.status}.`, resposta.status, json);
  }
  return json as T;
}

/** Um endereço de FOTO pronto para o `<img src>`.
 *
 *  Os links assinados das nossas fotos (`/api/galeria/...`,
 *  `/api/produtos/.../foto/...`) vêm do servidor como CAMINHO, e a V2 é
 *  publicada noutro domínio (Pages). Sem o endereço da API na frente, o
 *  navegador pedia a foto ao Pages, levava 404 e a peça aparecia sem foto.
 *  Endereço completo (a CDN da loja) volta intocado. */
export function enderecoDaFoto(conexao: Connection | null | undefined, url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//') && conexao?.url) return conexao.url + url;
  return url;
}
