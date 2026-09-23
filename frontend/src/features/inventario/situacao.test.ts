import { describe, it, expect } from 'vitest';
import { situacaoDaLinha } from './InventarioArea';

/** A REGRA MAIS CARA DO INVENTÁRIO, presa por teste.
 *
 *  A comparação é sempre contra `esperado` — total menos consignado, que o
 *  servidor calcula em `SQL_ESPERADO` e manda em
 *  `GET /api/inventarios/:id › esperados`. A tela NÃO refaz essa conta.
 *
 *  Enquanto ela comparava contra `produtos.qtd`, uma peça com cinco
 *  unidades das quais três estavam na maleta de uma revendedora aparecia
 *  como FALTANDO 3 quando alguém contava as duas que estavam em casa —
 *  certinho. Este arquivo existe para isso não voltar.
 */
describe('situação de uma linha da contagem', () => {
  it('contou o que se esperava em casa: conferido', () => {
    expect(situacaoDaLinha({ esperado: 2 }, 2).rotulo).toBe('Conferido');
  });

  it('PEÇA NA MALETA NÃO É FALTA: 5 no total, 3 na rua, 2 contadas = conferido', () => {
    /* `esperado` já chega como 5 − 3 = 2. Contar 2 é acerto, e não uma
       falta de 3. */
    expect(situacaoDaLinha({ esperado: 2 }, 2).rotulo).toBe('Conferido');
    expect(situacaoDaLinha({ esperado: 2 }, 2).classe).toContain('mq-status--ok');
  });

  it('contou menos que o esperado em casa: faltando', () => {
    const r = situacaoDaLinha({ esperado: 3 }, 2);
    expect(r.rotulo).toBe('Faltando');
    expect(r.classe).toContain('mq-status--risk');
  });

  it('contou mais que o esperado em casa: sobrando', () => {
    const r = situacaoDaLinha({ esperado: 2 }, 3);
    expect(r.rotulo).toBe('Sobrando');
    expect(r.classe).toContain('mq-status--warn');
  });

  /* D3 — a trava que impede um inventário parado pela metade de zerar meio
     catálogo. Sem contagem NÃO é contagem zero. */
  it('não contado não é zero', () => {
    expect(situacaoDaLinha({ esperado: 4 }, undefined).rotulo).toBe('Não conferido');
    /* E zero CONTADO é um resultado, não a mesma coisa. */
    expect(situacaoDaLinha({ esperado: 4 }, 0).rotulo).toBe('Faltando');
  });

  it('esperado zero e contagem zero batem', () => {
    expect(situacaoDaLinha({ esperado: 0 }, 0).rotulo).toBe('Conferido');
  });
});
