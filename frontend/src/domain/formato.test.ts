import { describe, it, expect } from 'vitest';
import { dataDigitada } from './formato';

/* QA 28/09/2026 — "Recebi" pedia a data em AAAA-MM-DD e recusava
   "28/09/2026", que é como a data é escrita no Brasil. */
describe('a data como a pessoa digita', () => {
  it('dia/mês/ano vira ISO', () => {
    expect(dataDigitada('28/09/2026')).toBe('2026-09-28');
    expect(dataDigitada(' 8/9/2026 ')).toBe('2026-09-08');
    expect(dataDigitada('28-09-2026')).toBe('2026-09-28');
    expect(dataDigitada('28.09.26')).toBe('2026-09-28');
  });

  it('ISO continua ISO', () => {
    expect(dataDigitada('2026-09-28')).toBe('2026-09-28');
  });

  it('o que não reconhece volta como veio, para o servidor recusar com a frase dele', () => {
    expect(dataDigitada('ontem')).toBe('ontem');
    expect(dataDigitada('')).toBe('');
  });
});
