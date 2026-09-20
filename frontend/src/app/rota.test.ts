import { describe, it, expect } from 'vitest';
import { lerRota, escreverRota } from './rota';

describe('o endereço da tela', () => {
  it('lê módulo e segundo segmento', () => {
    expect(lerRota('#/clientes')).toEqual({ modulo: 'clientes', sub: null });
    expect(lerRota('#/clientes/7')).toEqual({ modulo: 'clientes', sub: '7' });
    expect(lerRota('#/financeiro/a-receber')).toEqual({ modulo: 'financeiro', sub: 'a-receber' });
  });

  it('módulo desconhecido cai no padrão em vez de deixar a tela vazia', () => {
    expect(lerRota('#/inexistente').modulo).toBe('home');
    expect(lerRota('').modulo).toBe('home');
    expect(lerRota('#').modulo).toBe('home');
  });

  /* Nome de cliente com acento ou barra vai para a URL e volta inteiro — é
     assim que a ficha aberta pelo histórico da planilha é endereçável. */
  it('o segundo segmento sobrevive à ida e volta', () => {
    const endereco = escreverRota({ modulo: 'clientes', sub: 'vitória/prado' });
    expect(lerRota(endereco).sub).toBe('vitória/prado');
  });

  it('escreve sem segundo segmento quando não há', () => {
    expect(escreverRota({ modulo: 'estoque', sub: null })).toBe('#/estoque');
  });
});
