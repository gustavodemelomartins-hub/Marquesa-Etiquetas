import { describe, expect, it } from 'vitest';
import { efeitoDaLeitura, pareceRebote, pedeConfirmacaoDoBipe, planoDaDigitacao, type LinhaContada } from './contagem';

/** §59 — a mesma peça nunca é contada duas vezes em silêncio. As regras
 *  puras: o bipe repetido e o número digitado. */

const L = (o: Record<string, number>): LinhaContada[] => Object.entries(o).map(([variacao, contado]) => ({ variacao, contado }));
const comoMapa = (ls: LinhaContada[]) => Object.fromEntries(ls.map((l) => [l.variacao, l.contado]));

describe('pedeConfirmacaoDoBipe — o mesmo código de novo, sem outro no meio', () => {
  const ant = { sku: '256359', em: 1_000 };
  it('mesmo código, peça já conferida: pergunta — 1 s, 20 s ou 1 h depois', () => {
    expect(pedeConfirmacaoDoBipe(ant, '256359', 1)).toBe(true);
    expect(pareceRebote(ant, 2_000)).toBe(true);
    expect(pareceRebote(ant, 21_000)).toBe(false);
    expect(pareceRebote(ant, 3_601_000)).toBe(false);
  });
  it('outro código no meio: não pergunta', () => {
    expect(pedeConfirmacaoDoBipe({ sku: '347801', em: 1_000 }, '256359', 1)).toBe(false);
  });
  it('primeira leitura, ou peça que voltou a zero/não conferida: conta direto', () => {
    expect(pedeConfirmacaoDoBipe(null, '256359', 3)).toBe(false);
    expect(pedeConfirmacaoDoBipe(ant, '256359', 0)).toBe(false);
    expect(pedeConfirmacaoDoBipe(ant, '256359', null)).toBe(false);
  });
});

describe('planoDaDigitacao — o número digitado é o TOTAL da linha', () => {
  it('peça não conferida: define direto', () => {
    expect(planoDaDigitacao(undefined, '', 5)).toEqual({ tipo: 'direto' });
  });
  it('2 conferidas, digita 5: substituir 2 → 5 (nunca 7)', () => {
    expect(planoDaDigitacao(L({ '': 2 }), '', 5)).toEqual({ tipo: 'substituir', antes: 2, depois: 5, totalAntes: 2, totalDepois: 5 });
  });
  it('mesmo valor: nada', () => {
    expect(planoDaDigitacao(L({ '': 5 }), '', 5)).toEqual({ tipo: 'igual' });
  });
  it('menos (5 → 3): substituir, não bloqueia', () => {
    expect(planoDaDigitacao(L({ '': 5 }), '', 3)).toMatchObject({ tipo: 'substituir', antes: 5, depois: 3 });
  });
  it('nº23 com 2, digita 3: substituir 2 → 3', () => {
    expect(planoDaDigitacao(L({ 'nº23': 2 }), 'nº23', 3)).toMatchObject({ tipo: 'substituir', antes: 2, depois: 3, totalDepois: 3 });
  });
  it('2 bipadas sem variação, digita 5 no nº23: pergunta se são do nº23 (5) ou de outra (7)', () => {
    expect(planoDaDigitacao(L({ '': 2 }), 'nº23', 5)).toEqual({
      tipo: 'semVariacao', antes: 0, depois: 5, totalAntes: 2, naoInformadas: 2, entram: 2, totalSeForem: 5, totalSeNaoForem: 7,
    });
  });
  it('7 sem variação, digita 5 no nº23: só 5 podem entrar', () => {
    expect(planoDaDigitacao(L({ '': 7 }), 'nº23', 5)).toMatchObject({ entram: 5, totalSeForem: 7, totalSeNaoForem: 12 });
  });
  it('outra variação já contada (nº18: 2), digita nº23: 3 — peças diferentes, direto', () => {
    expect(planoDaDigitacao(L({ 'nº18': 2 }), 'nº23', 3)).toEqual({ tipo: 'direto' });
  });
  it('"sem variação" digitado numa peça com aros contados: pergunta (pode ser a mesma peça)', () => {
    expect(planoDaDigitacao(L({ 'nº23': 2 }), '', 5)).toMatchObject({ tipo: 'substituir', antes: 0, totalAntes: 2, totalDepois: 7 });
  });
});

describe('efeitoDaLeitura — definir com as não informadas (o mesmo cálculo do servidor)', () => {
  it('2 sem variação + definir nº23 = 5 incluindo as bipadas: nº23 5, sem variação 0', () => {
    const r = efeitoDaLeitura({ leituraId: 'x', sku: 's', gesto: 'definir', variacao: 'nº23', quantidade: 5, naoInformadas: true },
      L({ '': 2 }), { esperado: 6 });
    expect(comoMapa(r)).toEqual({ '': 0, 'nº23': 5 });
  });
  it('sem a marca, definir não mexe nas sem variação', () => {
    const r = efeitoDaLeitura({ leituraId: 'x', sku: 's', gesto: 'definir', variacao: 'nº23', quantidade: 5 }, L({ '': 2 }), { esperado: 6 });
    expect(comoMapa(r)).toEqual({ '': 2, 'nº23': 5 });
  });
  it('definir é absoluto: 2 + definir 5 = 5', () => {
    const r = efeitoDaLeitura({ leituraId: 'x', sku: 's', gesto: 'definir', quantidade: 5 }, L({ '': 2 }), { esperado: 6 });
    expect(comoMapa(r)).toEqual({ '': 5 });
  });
});
