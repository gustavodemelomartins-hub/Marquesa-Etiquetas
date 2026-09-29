import { describe, it, expect } from 'vitest';
import { dataDigitada, money, moneyNumero, qtdTexto, pct } from './formato';

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

/* 29/09/2026 — um formato de dinheiro para o sistema inteiro. Antes o
   centavo zero sumia ("R$ 8.378") ao lado de valores com centavo
   ("R$ 3.140,55"), na mesma tela de Revendedoras. */
describe('dinheiro, quantidade e percentual', () => {
  it('dinheiro sempre com centavos, no padrão brasileiro', () => {
    expect(money(8378)).toBe('R$ 8.378,00');
    expect(money(3140.55)).toBe('R$ 3.140,55');
    expect(money(11984)).toBe('R$ 11.984,00');
    expect(money(0)).toBe('R$ 0,00');
    expect(money(-12)).toBe('-R$ 12,00');
    expect(money(-0.001)).toBe('R$ 0,00');
    expect(money(null)).toBe('R$ 0,00');
    expect(money(0.1 + 0.2)).toBe('R$ 0,30');
  });
  it('o número sem o símbolo mantém o sinal', () => {
    expect(moneyNumero(8378)).toBe('8.378,00');
    expect(moneyNumero(-12.5)).toBe('-12,50');
  });
  it('quantidade é inteiro com milhar', () => {
    expect(qtdTexto(825)).toBe('825');
    expect(qtdTexto(2244)).toBe('2.244');
  });
  it('percentual com no máximo uma casa', () => {
    expect(pct(40)).toBe('40%');
    expect(pct(12.54)).toBe('12,5%');
  });
});
