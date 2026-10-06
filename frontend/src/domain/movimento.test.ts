import { describe, expect, it } from 'vitest';
import { detalheDoMovimento, rotuloDoMovimento } from './movimento';
import { acharVariacao, chaveDaVariacao } from './variacao';

describe('o histórico da peça em palavras de gente', () => {
  it('nomeia o movimento sem enum', () => {
    expect(rotuloDoMovimento('ajuste', 'inventario')).toBe('Ajuste de inventário');
    expect(rotuloDoMovimento('ajuste', 'ajuste')).toBe('Ajuste de estoque');
    expect(rotuloDoMovimento('consignacao', 'maleta')).toBe('Enviada em maleta');
    expect(rotuloDoMovimento('uso_proprio', null)).toBe('Uso próprio');
    expect(rotuloDoMovimento('qualquer_coisa', null)).toBe('Qualquer coisa');
  });

  it('desmonta a observação do ajuste de inventário', () => {
    expect(detalheDoMovimento('Ajuste de inventário #1 · Contagem física · contado 4, sistema dizia 5 (05/10/2026)'))
      .toBe('Inventário #1 · Contado fisicamente: 4 · Sistema esperava: 5 · Motivo: Contagem física');
    expect(detalheDoMovimento('Ajuste de inventário #3 · contado 2, sistema dizia 1'))
      .toBe('Inventário #3 · Contado fisicamente: 2 · Sistema esperava: 1');
    expect(detalheDoMovimento('Inventário #1: variações contadas: contrapartida de "nº23"'))
      .toBe('Ajuste entre variações (o total não muda)');
    expect(detalheDoMovimento(null)).toBeNull();
  });
});

/* A MESMA tabela de `src/inventario-v2-reconstrucao-test.mjs`: tela e
   servidor tratam as grafias do mesmo jeito. */
describe('o nome da variação', () => {
  it('"23", "nº23", "nº 23", "N23", "n°23", "Aro 23" e "023" são a mesma variação', () => {
    for (const g of ['23', 'nº23', 'nº 23', 'N23', 'n°23', 'Aro 23', '023', 'Tam. 23', 'no 23']) {
      expect(chaveDaVariacao(g)).toBe('23');
    }
    expect(chaveDaVariacao('Banho de Ouro 18K · n°18')).toBe(chaveDaVariacao('Banho de Ouro 18k · nº 18'));
    expect(chaveDaVariacao('Verde')).toBe('verde');
  });

  it('acha a variação cadastrada pelo que ela digitou, inclusive em combinação', () => {
    const lista = [{ nome: 'nº21' }, { nome: 'Banho de Ouro 18K · n°18' }];
    expect(acharVariacao(lista, 'N21')?.nome).toBe('nº21');
    expect(acharVariacao(lista, '18')?.nome).toBe('Banho de Ouro 18K · n°18');
    expect(acharVariacao(lista, '19')).toBeNull();
  });
});
