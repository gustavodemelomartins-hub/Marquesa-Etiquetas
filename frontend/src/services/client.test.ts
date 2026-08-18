import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chamar, lerConexao, gravarConexao, esquecerConexao } from './client';
import { ApiError } from '../types/api';

const CONEXAO = { url: 'https://api.exemplo', key: 'chave-de-teste' };

/** localStorage de mentira: o ambiente do teste é Node, não navegador. */
function fingirLocalStorage(): Map<string, string> {
  const dados = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
  });
  return dados;
}

function fingirFetch(resposta: Partial<Response> & { json?: () => Promise<unknown> }) {
  const espiao = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({}),
    ...resposta,
  } as Response);
  vi.stubGlobal('fetch', espiao);
  return espiao;
}

afterEach(() => vi.unstubAllGlobals());

describe('conexão guardada', () => {
  beforeEach(() => fingirLocalStorage());

  it('grava e lê no mesmo formato do dashboard legado', () => {
    gravarConexao(CONEXAO);
    /* A chave e o formato têm de ser exatamente os do app antigo: quem já
       está conectado lá precisa chegar aqui conectado. */
    expect(localStorage.getItem('marquesa_conexao_v1')).toBe(
      JSON.stringify(CONEXAO),
    );
    expect(lerConexao()).toEqual(CONEXAO);
  });

  it('tira a barra do fim do endereço', () => {
    gravarConexao({ url: 'https://api.exemplo///', key: 'k' });
    expect(lerConexao()?.url).toBe('https://api.exemplo');
  });

  it('devolve null quando não há nada guardado', () => {
    expect(lerConexao()).toBeNull();
  });

  it('devolve null em vez de quebrar quando o guardado está corrompido', () => {
    localStorage.setItem('marquesa_conexao_v1', 'isto não é json');
    expect(lerConexao()).toBeNull();
  });

  it('devolve null quando falta a chave ou o endereço', () => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url: 'x' }));
    expect(lerConexao()).toBeNull();
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url: '', key: 'k' }));
    expect(lerConexao()).toBeNull();
  });

  it('esquecer apaga', () => {
    gravarConexao(CONEXAO);
    esquecerConexao();
    expect(lerConexao()).toBeNull();
  });
});

describe('chamar', () => {
  it('manda o Bearer em toda chamada', async () => {
    const f = fingirFetch({ json: () => Promise.resolve({ ok: true }) });
    await chamar(CONEXAO, 'GET', '/api/state');

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.exemplo/api/state');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer chave-de-teste',
    );
  });

  it('não manda Content-Type quando não há corpo', async () => {
    const f = fingirFetch({ json: () => Promise.resolve({}) });
    await chamar(CONEXAO, 'GET', '/api/state');
    const [, init] = f.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('serializa o corpo e marca o Content-Type', async () => {
    const f = fingirFetch({ json: () => Promise.resolve({}) });
    await chamar(CONEXAO, 'POST', '/api/sync', { seco: true });
    const [, init] = f.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"seco":true}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('usa a mensagem do servidor no erro — ela costuma dizer o que fazer', async () => {
    fingirFetch({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          erro: 'O token da Nuvemshop não tem a permissão de ler pedidos.',
        }),
    });
    await expect(chamar(CONEXAO, 'GET', '/api/state')).rejects.toThrow(
      'O token da Nuvemshop não tem a permissão de ler pedidos.',
    );
  });

  it('marca 401 como não autorizado', async () => {
    fingirFetch({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ erro: 'Chave de acesso ausente ou incorreta.' }),
    });
    try {
      await chamar(CONEXAO, 'GET', '/api/state');
      expect.unreachable('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).naoAutorizado).toBe(true);
      expect((e as ApiError).status).toBe(401);
    }
  });

  it('erro sem corpo JSON ainda vira ApiError legível', async () => {
    fingirFetch({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.reject(new Error('sem json')),
    });
    await expect(chamar(CONEXAO, 'GET', '/api/state')).rejects.toThrow(
      'Internal Server Error',
    );
  });

  it('falha de rede vira status 0, não se confunde com resposta do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')));
    try {
      await chamar(CONEXAO, 'GET', '/api/state');
      expect.unreachable('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(0);
      expect((e as ApiError).naoAutorizado).toBe(false);
    }
  });

  it('abortar não vira ApiError — trocar de tela não é erro', async () => {
    const abortada = new DOMException('abortado', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortada));
    await expect(chamar(CONEXAO, 'GET', '/api/state')).rejects.toBe(abortada);
  });

  it('resposta 204 sem corpo não quebra', async () => {
    fingirFetch({ ok: true, status: 204, json: () => Promise.reject(new Error('vazio')) });
    await expect(chamar(CONEXAO, 'POST', '/api/x')).resolves.toBeNull();
  });
});
