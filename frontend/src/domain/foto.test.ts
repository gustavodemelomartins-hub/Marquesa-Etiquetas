import { describe, it, expect } from 'vitest';
import { fotoDaPeca, miniaturaDaFoto } from './foto';

describe('qual foto mostrar', () => {
  /* A ordem é a mesma do painel legado (`resolveFotoPrincipal`). As duas
     telas discordarem sobre qual é "a" foto da peça seria pior que
     nenhuma das duas mostrar foto. */
  it('prefere a NOSSA imagem tratada a qualquer outra', () => {
    expect(fotoDaPeca({
      fotoTratadaUrl: '/api/produtos/1/foto/tratada?sig=a',
      fotoOriginalUrl: '/api/produtos/1/foto/original?sig=b',
      fotoUrl: 'https://exemplo/x.jpg',
      fotoLojaUrl: 'https://cdn/y.jpg',
    })).toBe('/api/produtos/1/foto/tratada?sig=a');
  });

  it('cai para a original quando não há tratada', () => {
    expect(fotoDaPeca({ fotoOriginalUrl: '/o', fotoUrl: 'https://x' })).toBe('/o');
  });

  it('a imagem da vitrine é o ÚLTIMO recurso, nunca o primeiro', () => {
    expect(fotoDaPeca({ fotoLojaUrl: 'https://cdn/y.jpg' })).toBe('https://cdn/y.jpg');
    expect(fotoDaPeca({ fotoUrl: 'https://g/x.jpg', fotoLojaUrl: 'https://cdn/y.jpg' }))
      .toBe('https://g/x.jpg');
  });

  it('sem nenhuma, devolve null — e quem exibe desenha o vazio', () => {
    expect(fotoDaPeca({})).toBeNull();
    expect(fotoDaPeca(null)).toBeNull();
    expect(fotoDaPeca({ fotoTratadaUrl: null, fotoLojaUrl: '' })).toBeNull();
  });
});

describe('miniatura da CDN', () => {
  /* A CDN aceita UM par de tamanho, não dois: `-1024-1024-240-0.jpg`
     responde 403. O par antigo tem de SAIR antes de o novo entrar — foi
     esse o bug que o legado documentou, e ele custava uma imagem de
     1024px por peça mais um 403 no console. */
  it('troca o par de tamanho em vez de anexar outro', () => {
    expect(miniaturaDaFoto(
      'https://dcdn-us.mitiendanube.com/stores/005/produtos/abc-1024-1024.jpg',
    )).toBe('https://dcdn-us.mitiendanube.com/stores/005/produtos/abc-240-0.jpg');
  });

  it('funciona também quando não havia tamanho no endereço', () => {
    expect(miniaturaDaFoto('https://dcdn-us.mitiendanube.com/x/foto.png'))
      .toBe('https://dcdn-us.mitiendanube.com/x/foto-240-0.png');
  });

  it('preserva a query que vier depois da extensão', () => {
    expect(miniaturaDaFoto('https://cdn.tiendanube.com/a-800-800.jpg?v=3'))
      .toBe('https://cdn.tiendanube.com/a-240-0.jpg?v=3');
  });

  /* Link assinado NOSSO tem assinatura sobre o caminho: mexer nele o
     invalidaria, e a foto que temos sumiria em favor da que não temos. */
  it('não toca em endereço que não é da CDN', () => {
    const assinado = '/api/produtos/998877/foto/tratada?exp=123&sig=abc';
    expect(miniaturaDaFoto(assinado)).toBe(assinado);
    expect(miniaturaDaFoto('https://outro.dominio/foto-1024-1024.jpg'))
      .toBe('https://outro.dominio/foto-1024-1024.jpg');
  });

  it('null continua null', () => {
    expect(miniaturaDaFoto(null)).toBeNull();
  });
});
