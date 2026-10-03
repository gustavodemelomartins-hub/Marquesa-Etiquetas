// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ladosComMais, ligarAbasRolaveis } from './abasRolaveis';

describe('para que lado a faixa ainda tem o que mostrar', () => {
  it('cabendo inteira, nenhum lado', () => {
    expect(ladosComMais({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toBe('');
  });
  it('no começo, só à direita', () => {
    expect(ladosComMais({ scrollLeft: 0, scrollWidth: 500, clientWidth: 358 })).toBe('dir');
  });
  it('no meio, dos dois lados', () => {
    expect(ladosComMais({ scrollLeft: 60, scrollWidth: 500, clientWidth: 358 })).toBe('esq dir');
  });
  it('no fim, só à esquerda', () => {
    expect(ladosComMais({ scrollLeft: 142, scrollWidth: 500, clientWidth: 358 })).toBe('esq');
  });
});

/* jsdom não tem layout: a largura é fingida no próprio elemento. */
function faixa(larguraTotal: number, visivel: number): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'mq-tabs';
  Object.defineProperty(nav, 'scrollWidth', { value: larguraTotal });
  Object.defineProperty(nav, 'clientWidth', { value: visivel });
  return nav;
}
const quadro = () => new Promise((ok) => requestAnimationFrame(() => ok(null)));

describe('o casco marca as faixas que rolam', () => {
  let desligar: (() => void) | null = null;
  afterEach(() => { desligar?.(); document.body.innerHTML = ''; });

  it('a faixa que não cabe ganha data-rola, a que cabe não', async () => {
    const raiz = document.createElement('main');
    const larga = faixa(520, 358);
    const curta = faixa(200, 358);
    raiz.append(larga, curta);
    document.body.append(raiz);
    desligar = ligarAbasRolaveis(raiz);
    await quadro();
    expect(larga.dataset.rola).toBe('dir');
    expect(curta.dataset.rola).toBeUndefined();
  });

  it('uma faixa que aparece depois também é marcada', async () => {
    const raiz = document.createElement('main');
    document.body.append(raiz);
    desligar = ligarAbasRolaveis(raiz);
    const nova = faixa(600, 358);
    raiz.append(nova);
    await quadro();
    await quadro();
    expect(nova.dataset.rola).toBe('dir');
  });
});
