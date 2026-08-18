import { afterEach, describe, expect, it, vi } from 'vitest';
import { analisar, historico } from './sync';

const CONEXAO = { url: 'https://api.exemplo', key: 'k' };

function fingirFetch() {
  const espiao = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({ ok: true, mudancas: [] }),
  } as unknown as Response);
  vi.stubGlobal('fetch', espiao);
  return espiao;
}

afterEach(() => vi.unstubAllGlobals());

describe('camada de sincronização', () => {
  it('analisar SEMPRE manda seco:true — este frontend não escreve na loja', async () => {
    const f = fingirFetch();
    await analisar(CONEXAO);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.exemplo/api/sync');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ seco: true });
  });

  it('analisar NUNCA manda forcar — pular o freio exige decisão humana', async () => {
    const f = fingirFetch();
    await analisar(CONEXAO);
    const [, init] = f.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).not.toContain('forcar');
  });

  it('histórico é leitura', async () => {
    const f = fingirFetch();
    await historico(CONEXAO);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.exemplo/api/sync');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });
});
