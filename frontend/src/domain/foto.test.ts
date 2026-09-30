import { describe, it, expect } from 'vitest';
import { fotoDaPeca, miniaturaDaFoto, miniaturaDaPeca, situacoesDeFoto } from './foto';

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

describe('a galeria própria (29/09/2026)', () => {
  it('a principal escolhida vence qualquer outra fonte', () => {
    expect(fotoDaPeca({
      fotoGaleriaUrl: 'https://api/api/galeria/f1/original?sig=x',
      fotoTratadaUrl: '/t', fotoLojaUrl: 'https://cdn/y.jpg',
    })).toBe('https://api/api/galeria/f1/original?sig=x');
  });

  it('a miniatura da galeria é o objeto pequeno nosso, não a CDN', () => {
    expect(miniaturaDaPeca({ fotoGaleriaUrl: 'g', fotoMiniUrl: 'm' })).toBe('m');
    expect(miniaturaDaPeca({ fotoGaleriaUrl: 'g' })).toBe('g');
    expect(miniaturaDaPeca({ fotoLojaUrl: 'https://acdn.nuvemshop.com.br/a-1024-1024.jpg' }))
      .toBe('https://acdn.nuvemshop.com.br/a-240-0.jpg');
    expect(miniaturaDaPeca({})).toBeNull();
  });

  it('classifica as situações que a lista filtra', () => {
    expect([...situacoesDeFoto({})]).toEqual(['sem_foto']);
    expect([...situacoesDeFoto({ fotoGaleriaUrl: 'g', fotosQtd: 1 })]).toEqual(['uma']);
    const varias = situacoesDeFoto({ fotoGaleriaUrl: 'g', fotosQtd: 4, fotosDaLoja: 4, naLoja: true });
    expect(varias.has('varias') && varias.has('importadas')).toBe(true);
    expect(situacoesDeFoto({ fotoUrl: 'https://cdn/x.jpg', fotosQtd: 0 }).has('so_na_loja')).toBe(true);
    expect(situacoesDeFoto({ naLoja: false }).has('fora_da_loja')).toBe(true);
    expect(situacoesDeFoto({ naLoja: null }).has('fora_da_loja')).toBe(false);
  });
});
