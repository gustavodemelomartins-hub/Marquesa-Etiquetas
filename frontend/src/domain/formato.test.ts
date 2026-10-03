import { describe, it, expect } from 'vitest';
import { dataDigitada, fmtData, money, moneyNumero, qtdTexto, pct } from './formato';

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

/* 03/10/2026 — inventário aberto em 02/10 às 21h aparecia como 03/10. O
   servidor grava o instante em UTC (`datetime('now')`: "2026-10-03
   00:00:00"); cortar os 10 primeiros caracteres mostrava o dia de Greenwich.
   A data que a operação vive é a de America/Sao_Paulo. */
describe('fmtData: dia civil × instante', () => {
  it('dia civil (AAAA-MM-DD) é mostrado como veio, sem fuso nenhum', () => {
    expect(fmtData('2026-08-19')).toBe('19/08/2026');
    expect(fmtData('2026-10-02')).toBe('02/10/2026');
  });

  it('02/10/2026 21:00 em São Paulo (00:00 UTC do dia 3) é 02/10', () => {
    expect(fmtData('2026-10-03 00:00:00')).toBe('02/10/2026');
    expect(fmtData('2026-10-03T00:00:00.000Z')).toBe('02/10/2026');
    expect(fmtData('2026-10-02T21:00:00-03:00')).toBe('02/10/2026');
  });

  it('perto da meia-noite de São Paulo', () => {
    expect(fmtData('2026-10-03 02:59:59')).toBe('02/10/2026'); // 23:59:59 SP
    expect(fmtData('2026-10-03 03:00:00')).toBe('03/10/2026'); // 00:00:00 SP
    expect(fmtData('2026-10-03 03:00:01')).toBe('03/10/2026');
  });

  it('de manhã cedo e à tarde o dia UTC e o de São Paulo coincidem', () => {
    expect(fmtData('2026-10-02 15:14:20')).toBe('02/10/2026');
    expect(fmtData('2026-08-22 07:57:15')).toBe('22/08/2026');
  });

  it('vazio é travessão; o que não é data volta como veio', () => {
    expect(fmtData(null)).toBe('—');
    expect(fmtData('')).toBe('—');
    expect(fmtData('sem data')).toBe('sem data');
  });
});
