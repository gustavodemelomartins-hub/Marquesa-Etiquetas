import { describe, expect, it } from 'vitest';
import {
  candidatosDoCodigo, codigoBase, normalizarCodigo, resolverSku,
} from './codigoDaEtiqueta';

/** Estas provas são o contrato entre a etiqueta impressa e o catálogo.
 *
 *  Elas foram escritas a partir de `findProd` do painel clássico
 *  (`src/dashboard.tpl.html`), que é o código que hoje está em produção e
 *  funciona na mão da Sthefany. Divergir dele aqui significaria uma peça
 *  que o painel antigo acha e o novo não. */
describe('o código da etiqueta vira SKU', () => {
  it('normaliza como o backend normaliza', () => {
    expect(normalizarCodigo(' 230076 ')).toBe('230076');
    expect(normalizarCodigo('23 00 76')).toBe('230076');
    expect(normalizarCodigo('ab12')).toBe('AB12');
    expect(normalizarCodigo(null)).toBe('');
    expect(normalizarCodigo(undefined)).toBe('');
  });

  it('tira o sufixo de variação, que a etiqueta traz e o catálogo não', () => {
    expect(codigoBase('230076-17')).toBe('230076');
    expect(codigoBase('230076')).toBe('230076');
    /* Só sufixo NUMÉRICO. "COLAR-AZUL" é um código inteiro, e cortar o
       "-AZUL" inventaria uma peça que não existe. */
    expect(codigoBase('COLAR-AZUL')).toBe('COLAR-AZUL');
  });

  it('oferece os candidatos na ordem, sem repetir', () => {
    expect(candidatosDoCodigo('0230076-17'))
      .toEqual(['0230076-17', '0230076', '230076-17', '230076']);
    /* Um código já limpo produz UM candidato, não quatro iguais. */
    expect(candidatosDoCodigo('230076')).toEqual(['230076']);
    expect(candidatosDoCodigo('  ')).toEqual([]);
  });

  it('acha a peça pelo código como veio', () => {
    expect(resolverSku('230076', new Set(['230076']))).toBe('230076');
  });

  it('acha a peça quando a etiqueta traz o aro e o catálogo não', () => {
    expect(resolverSku('230076-17', new Set(['230076']))).toBe('230076');
  });

  it('acha a etiqueta antiga, impressa com zero à esquerda', () => {
    expect(resolverSku('0230076', new Set(['230076']))).toBe('230076');
  });

  it('devolve o código DO CATÁLOGO, não o que a etiqueta trazia', () => {
    /* É esse que as rotas esperam. Mandar "0230076-17" para
       `POST /inventarios/:id/itens` daria 409 de código inexistente.

       Esta é a prova do quarto candidato: zero à esquerda E sufixo de aro
       na mesma etiqueta. O `findProd` do painel clássico aplica as
       transformações separadamente e não acha esta peça — ver o comentário
       em `candidatosDoCodigo`. */
    expect(resolverSku('0230076-17', new Set(['230076']))).toBe('230076');
  });

  it('prefere o código exato quando os dois existem no catálogo', () => {
    /* Duas peças de verdade, uma delas com um nome que parece sufixo da
       outra. Cortar primeiro entregaria a peça errada — e no inventário
       isso conta a peça errada. */
    const catalogo = new Set(['230076-17', '230076']);
    expect(resolverSku('230076-17', catalogo)).toBe('230076-17');
  });

  it('devolve null em vez de chutar quando nada bate', () => {
    expect(resolverSku('999999', new Set(['230076']))).toBeNull();
    expect(resolverSku('', new Set(['230076']))).toBeNull();
  });

  it('aceita um Map indexado por SKU, não só um Set', () => {
    /* É como a tela do Inventário tem a lista: `Map<sku, Esperado>`.
       Exigir um Set obrigaria a construir um segundo índice a cada quadro
       da câmera — cinco vezes por segundo. */
    const mapa = new Map([['230076', { desc: 'Anel Abaulado' }]]);
    expect(resolverSku('0230076', mapa)).toBe('230076');
  });
});
