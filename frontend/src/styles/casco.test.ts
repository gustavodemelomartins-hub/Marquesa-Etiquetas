import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** O contrato responsivo do CASCO.
 *
 *  Pelo mesmo motivo de `responsivo.test.ts`: jsdom não aplica media query,
 *  então o que se prova aqui é o contrato escrito, não o pixel. A aparência
 *  real continua sendo conferida em navegador — as cinco larguras de
 *  referência da V2 são 320, 390, 768, 1024 e 1440.
 *
 *  As três formas do casco, e por que cada uma existe:
 *    ≥ 1181  trilho inteiro — cabe rótulo ao lado do ícone.
 *    901–1180 trilho mínimo — ainda há um lado esquerdo, mas não para texto.
 *    ≤ 900   gaveta + barra inferior — não há lado esquerdo; o polegar manda.
 */
const css = readFileSync(fileURLToPath(new URL('./shell.css', import.meta.url)), 'utf8');

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

describe('o casco muda de forma nas três larguras', () => {
  const mini = blocoDaMedia('1180px');
  const telefone = blocoDaMedia('900px');

  it('no trilho mínimo o rótulo some e a marca recortada entra no lugar do logo', () => {
    expect(mini).toContain('--mq-rail: var(--mq-rail-mini)');
    expect(mini).toMatch(/\.mq-rail__item span\s*\{\s*display:\s*none/);
    expect(mini).toMatch(/\.mq-rail__logo\s*\{\s*display:\s*none/);
    expect(mini).toMatch(/\.mq-rail__marca\s*\{\s*display:\s*block/);
  });

  it('no telefone o trilho vira gaveta e a barra inferior aparece', () => {
    expect(telefone).toContain('transform: translateX(-100%)');
    expect(telefone).toMatch(/\.mq-rail\.is-open\s*\{\s*transform:\s*none/);
    expect(telefone).toMatch(/\.mq-bottomnav\s*\{[^}]*display:\s*grid/);
    expect(telefone).toMatch(/\.mq-burger\s*\{\s*display:\s*grid/);
  });

  it('o conteúdo deixa de ter trilho à esquerda e ganha espaço para a barra', () => {
    expect(telefone).toContain('padding-left: 0');
    expect(telefone).toContain('env(safe-area-inset-bottom)');
  });

  /* A cortina DO MENU só faz sentido onde a gaveta existe; acima disso ela
     vira um retângulo invisível comendo cliques. A cortina de um diálogo é
     outra coisa e existe em qualquer largura — por isso o modificador, e
     por isso a regra tem de citá-lo, e não a classe base. */
  it('só a cortina do menu some acima da largura da gaveta', () => {
    expect(css).toMatch(/@media \(min-width: 901px\)[^}]*\.mq-scrim--menu\s*\{\s*display:\s*none\s*!important/);
    expect(css).not.toMatch(/@media \(min-width: 901px\)[^}]*\.mq-scrim\s*\{\s*display:\s*none/);
  });

  /* Diálogo e gaveta ficam ACIMA da cortina. Abaixo dela, eles aparecem
     inteiros e não recebem um clique sequer. */
  it('diálogo e gaveta ficam acima da cortina', () => {
    const z = (sel: string) => {
      const m = css.match(new RegExp(`\\${sel}\\s*\\{[^}]*z-index:\\s*(\\d+)`));
      return m ? Number(m[1]) : 0;
    };
    expect(z('.mq-modal')).toBeGreaterThan(z('.mq-scrim'));
    expect(z('.mq-drawer')).toBeGreaterThan(z('.mq-scrim'));
  });

  /* O trilho é fixo: sem largura reservada, o conteúdo nasce por baixo dele
     e a primeira coluna de toda tabela do produto fica escondida. */
  it('o conteúdo reserva a largura do trilho no desktop', () => {
    expect(css).toMatch(/\.mq-shell\s*\{[^}]*padding-left:\s*var\(--mq-rail\)/);
  });
});
