import { describe, expect, it } from 'vitest';
import { baseSku, normSku } from './normalizarSku';

describe('normSku', () => {
  it('remove espaço nas pontas', () => {
    expect(normSku('  120029  ')).toBe('120029');
  });

  it('remove espaço interno e sobe para maiúsculas', () => {
    expect(normSku('ab 12')).toBe('AB12');
  });

  it('null e undefined viram string vazia', () => {
    expect(normSku(null)).toBe('');
    expect(normSku(undefined)).toBe('');
  });

  it('número também normaliza (célula de planilha pode vir como number)', () => {
    expect(normSku(120029)).toBe('120029');
  });
});

describe('baseSku', () => {
  it('sem sufixo, fica igual', () => {
    expect(baseSku('120029')).toBe('120029');
  });

  it('remove sufixo de remessa "-2"', () => {
    expect(baseSku('120029-2')).toBe('120029');
  });

  it('remove sufixo de dois dígitos "-23"', () => {
    expect(baseSku('120029-23')).toBe('120029');
  });

  it('remove espaço e sufixo juntos', () => {
    expect(baseSku('  120029-2  ')).toBe('120029');
  });

  it('só remove o ÚLTIMO grupo -dígitos, não os do meio do código', () => {
    expect(baseSku('AB-1-2')).toBe('AB-1');
  });

  it('sufixo não numérico não é removido (não é remessa)', () => {
    expect(baseSku('120029-P')).toBe('120029-P');
  });

  it('vazio continua vazio', () => {
    expect(baseSku('')).toBe('');
    expect(baseSku(null)).toBe('');
  });
});
