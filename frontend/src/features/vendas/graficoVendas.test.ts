import { describe, expect, it } from 'vitest';
import { escalaDeVendas, rotuloDaBarra } from './graficoVendas';

describe('escala do desempenho de vendas', () => {
  it('parte do zero e mantém barras positivas e negativas em lados opostos', () => {
    const escala = escalaDeVendas([200, -100, 0]);
    expect(escala.marcas).toContain(0);
    const positivo = escala.barra(200)!;
    const negativo = escala.barra(-100)!;
    expect(positivo.topo + positivo.altura).toBeCloseTo(escala.posicaoZero);
    expect(negativo.topo).toBeCloseTo(escala.posicaoZero);
    expect(negativo.negativa).toBe(true);
    expect(escala.barra(Number.NaN)).toBeNull();
  });

  it('mantém zero na base e abre uma escala legível sem vendas', () => {
    const escala = escalaDeVendas([0, 0]);
    expect(escala.piso).toBe(0);
    expect(escala.teto).toBeGreaterThan(0);
    expect(escala.barra(0)?.altura).toBe(0);
  });

  it('abrevia somente o rótulo, sem alterar a chave da API', () => {
    expect(rotuloDaBarra('2026-09')).toBe('set 26');
    expect(rotuloDaBarra('2026-09-05')).toBe('05/09');
  });
});
