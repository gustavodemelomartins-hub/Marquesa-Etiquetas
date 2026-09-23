import { describe, it, expect } from 'vitest';
import { iniciaisDe, rotuloDoPerfil, INICIAIS_PADRAO } from './iniciais';

describe('iniciais do avatar', () => {
  it('nome e sobrenome viram duas letras', () => {
    expect(iniciaisDe('Sthefany Marques')).toBe('SM');
  });

  it('o sobrenome é o ÚLTIMO, não o segundo', () => {
    expect(iniciaisDe('Ana Victoria Barbosa Marques')).toBe('AM');
  });

  it('partícula não conta como sobrenome', () => {
    expect(iniciaisDe('Maria da Silva')).toBe('MS');
    expect(iniciaisDe('Joyce de Oliveira')).toBe('JO');
  });

  it('nome único devolve uma letra só, e não a mesma duas vezes', () => {
    expect(iniciaisDe('Sthefany')).toBe('S');
  });

  it('espaço a mais não cria inicial vazia', () => {
    expect(iniciaisDe('  Gislene   Marques  ')).toBe('GM');
  });

  /* A regra que importa: sem nome, o avatar mostra a MARCA. Nunca uma
     pessoa inventada, e nunca um círculo vazio. */
  it('sem nome, mostra a marca', () => {
    expect(iniciaisDe(null)).toBe(INICIAIS_PADRAO);
    expect(iniciaisDe(undefined)).toBe(INICIAIS_PADRAO);
    expect(iniciaisDe('')).toBe(INICIAIS_PADRAO);
    expect(iniciaisDe('   ')).toBe(INICIAIS_PADRAO);
  });

  it('o rótulo acessível não afirma identidade que não existe', () => {
    expect(rotuloDoPerfil('Sthefany Marques')).toBe('Perfil de Sthefany Marques');
    expect(rotuloDoPerfil(null)).toBe('Perfil — ninguém identificado');
  });
});
