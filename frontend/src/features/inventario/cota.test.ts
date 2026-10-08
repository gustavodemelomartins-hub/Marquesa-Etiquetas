import { describe, expect, it } from 'vitest';
import { ApiError } from '../../types/api';
import { comRetentativa, ehCotaDoBanco } from './contagem';

/* 08/10/2026 — o D1 esgotou a cota diária no meio do inventário. Uma
   leitura que bate na cota não pode virar uma rajada de tentativas: cada
   uma lê o banco e piora o dia seguinte. */
const cota = () => new ApiError('O limite diário de leitura do banco (D1) foi atingido nesta conta Cloudflare.', 503,
  { erro: 'O limite diário…', limite: 'd1-leitura-diaria' });

describe('cota do banco esgotada', () => {
  it('reconhece a resposta do servidor', () => {
    expect(ehCotaDoBanco(cota())).toBe(true);
    expect(ehCotaDoBanco(new ApiError('Falha interna', 500, { erro: 'Falha interna' }))).toBe(false);
    expect(ehCotaDoBanco(new ApiError('Sem rede', 0, null))).toBe(false);
    expect(ehCotaDoBanco(null)).toBe(false);
  });

  it('NÃO tenta de novo sozinha quando a cota acabou', async () => {
    let chamadas = 0;
    const esperas: number[] = [];
    await expect(comRetentativa(async () => { chamadas += 1; throw cota(); },
      { dormir: async (ms) => { esperas.push(ms); } })).rejects.toBeInstanceOf(ApiError);
    expect(chamadas).toBe(1);
    expect(esperas).toEqual([]);
  });

  it('continua tentando em falha passageira (5xx comum, rede)', async () => {
    let chamadas = 0;
    const r = await comRetentativa(async () => {
      chamadas += 1;
      if (chamadas < 3) throw new ApiError('Falha interna', 500, { erro: 'Falha interna' });
      return 'ok';
    }, { dormir: async () => undefined });
    expect(r).toBe('ok');
    expect(chamadas).toBe(3);
  });
});
