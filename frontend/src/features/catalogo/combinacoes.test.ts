import { describe, expect, it } from 'vitest';
import { combinar } from './combinacoes';

/** O nome da combinação é IDENTIDADE: é por ele que a divisão de quantidade
 *  encontra a variação que o servidor acabou de gravar. Se esta função e
 *  `api/src/produtos.js › combinar` divergirem em um espaço, a peça nasce
 *  com a estrutura certa e a quantidade em lugar nenhum. */
describe('combinar atributos', () => {
  it('nomeia a combinação com os valores separados por " · "', () => {
    const r = combinar([{ nome: 'Aro', valores: '16, 17' }]);
    expect(r.combinacoes.map((c) => c.nome)).toEqual(['16', '17']);
  });

  it('faz o produto cartesiano na ordem dos atributos', () => {
    const r = combinar([
      { nome: 'Banho', valores: 'Ouro, Prata' },
      { nome: 'Aro', valores: '16, 17' },
    ]);
    expect(r.combinacoes.map((c) => c.nome)).toEqual([
      'Ouro · 16', 'Ouro · 17', 'Prata · 16', 'Prata · 17',
    ]);
  });

  it('conta valor repetido uma vez só', () => {
    const r = combinar([{ nome: 'Aro', valores: '16, 16, 17' }]);
    expect(r.combinacoes).toHaveLength(2);
  });

  it('ignora atributo sem nome e atributo sem valor', () => {
    expect(combinar([{ nome: '', valores: '16, 17' }]).combinacoes).toEqual([]);
    expect(combinar([{ nome: 'Aro', valores: '   ' }]).combinacoes).toEqual([]);
    expect(combinar([{ nome: 'Aro', valores: ',,' }]).combinacoes).toEqual([]);
  });

  it('não produz combinação nenhuma sem atributo — e não uma combinação vazia', () => {
    /* Uma combinação de nome "" passaria pela contagem e viraria uma
       variação sem nome no banco. Nada é melhor do que isso. */
    const r = combinar([]);
    expect(r.combinacoes).toEqual([]);
    expect(r.atributos).toEqual([]);
  });

  it('devolve os atributos já limpos, para mandar ao servidor', () => {
    const r = combinar([{ nome: '  Aro  ', valores: ' 16 , 17 ' }]);
    expect(r.atributos).toEqual([{ nome: 'Aro', valores: ['16', '17'] }]);
  });
});
