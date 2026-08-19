import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Responsividade em CSS não se prova renderizando: jsdom não aplica media
 *  query, e um teste que "passa" sem aplicar nada é pior que nenhum. O que
 *  dá para provar aqui é o contrato: toda grade de largura fixa que este
 *  arquivo cria tem um ponto de quebra que a desmonta.
 *
 *  A aparência real continua sendo conferida num navegador de verdade —
 *  ver docs/TESTING.md. */
const css = readFileSync(fileURLToPath(new URL('./painel.css', import.meta.url)), 'utf8');

function blocoDaMedia(largura: string): string {
  const i = css.indexOf(`@media (max-width: ${largura})`);
  expect(i, `falta o ponto de quebra em ${largura}`).toBeGreaterThan(-1);
  const abre = css.indexOf('{', i);
  let nivel = 0;
  for (let j = abre; j < css.length; j++) {
    if (css[j] === '{') nivel++;
    else if (css[j] === '}' && --nivel === 0) return css.slice(abre, j);
  }
  throw new Error(`bloco @media ${largura} não fecha`);
}

describe('as grades do painel se desmontam em tela estreita', () => {
  const tablet = blocoDaMedia('1000px');
  const celular = blocoDaMedia('640px');

  it('os KPIs saem de quatro colunas para duas e depois para uma', () => {
    expect(css).toContain('grid-template-columns: repeat(4, 1fr)');
    expect(tablet).toContain('.kpis { grid-template-columns: repeat(2, 1fr); }');
    expect(celular).toContain('.kpis { grid-template-columns: 1fr; }');
  });

  it('as duas colunas de painel viram uma', () => {
    expect(tablet).toContain('.colunas { grid-template-columns: 1fr; }');
  });

  it('os controles de capacidade empilham', () => {
    expect(tablet).toContain('.cap-controles { grid-template-columns: 1fr; }');
  });

  it('a legenda da rosca e as sugestões viram coluna única no celular', () => {
    expect(celular).toContain('.legenda { grid-template-columns: 1fr; }');
    expect(celular).toContain('.sugestoes { grid-template-columns: 1fr; }');
  });

  it('o drawer nunca passa da largura da tela', () => {
    expect(css).toContain('width: min(560px, 100%)');
    expect(css).toContain("width: min(920px, 100%)");
  });

  it('as grades de cartão se adaptam sozinhas, sem ponto de quebra', () => {
    expect(css).toContain('repeat(auto-fill, minmax(230px, 1fr))');
    expect(css).toContain('repeat(auto-fit, minmax(280px, 1fr))');
  });
});
