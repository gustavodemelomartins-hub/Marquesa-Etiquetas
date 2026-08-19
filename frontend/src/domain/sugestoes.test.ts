import { describe, expect, it } from 'vitest';
import { gerarSugestoes, pesosDaRevendedora, pesosHistoricosDeConsignacao } from './sugestoes';
import { consignaveis, RESERVA_POR_MODO, type ConfigPlanejamento } from './capacidade';
import { emCasa, estadoDeTeste, maleta, produto } from '../testing/fixtures';

function cfg(over: Partial<ConfigPlanejamento> = {}): ConfigPlanejamento {
  return { modo: 'equilibrado', tamanhoAlvo: 10, tamanhoAlvoConfirmado: true, ...over };
}

const catalogo = [
  emCasa('C1', 20, { cat: 'Colar', preco: 150 }),
  emCasa('C2', 10, { cat: 'Colar', preco: 90 }),
  emCasa('B1', 30, { cat: 'Brinco', preco: 60 }),
  emCasa('A1', 6, { cat: 'Anel', preco: 400 }),
];

describe('as três propostas', () => {
  it('vêm sempre em três, com as três estratégias', () => {
    const s = gerarSugestoes(estadoDeTeste({ produtos: catalogo }), cfg());
    expect(s).toHaveLength(3);
    expect(s.map((x) => x.estrategia)).toEqual(['equilibrada', 'giro', 'premium']);
  });

  it('nenhum item passa do que a reserva liberou daquele código', () => {
    const estado = estadoDeTeste({ produtos: catalogo });
    for (const modo of ['conservador', 'equilibrado', 'agressivo'] as const) {
      const limites = new Map(
        consignaveis(estado, RESERVA_POR_MODO[modo]).map((c) => [c.produto.sku, c.consignavel]),
      );
      for (const s of gerarSugestoes(estado, cfg({ modo, tamanhoAlvo: 25 }))) {
        for (const i of s.itens) {
          expect(i.qtd).toBeGreaterThan(0);
          expect(i.qtd).toBeLessThanOrEqual(limites.get(i.sku) ?? 0);
        }
      }
    }
  });

  it('nunca sugere quantidade que não existe, nem com alvo absurdo', () => {
    const estado = estadoDeTeste({ produtos: catalogo });
    const totalLiberado = consignaveis(estado, RESERVA_POR_MODO.equilibrado).reduce(
      (s, c) => s + (c.produto.preco === null ? 0 : c.consignavel),
      0,
    );
    for (const s of gerarSugestoes(estado, cfg({ tamanhoAlvo: 9999 }))) {
      expect(s.pecas).toBeLessThanOrEqual(totalLiberado);
      expect(s.atingiuAlvo).toBe(false);
    }
  });

  it('respeita a reserva: o que fica em casa nunca cai abaixo dela', () => {
    const estado = estadoDeTeste({ produtos: catalogo });
    for (const s of gerarSugestoes(estado, cfg({ tamanhoAlvo: 9999 }))) {
      expect(s.emCasaDepois).toBeGreaterThanOrEqual(s.reservaMinima);
    }
  });

  it('peça sem preço fica fora de todas as propostas (§24)', () => {
    const estado = estadoDeTeste({
      produtos: [...catalogo, emCasa('SP', 50, { cat: 'Colar', preco: null, semPreco: true })],
    });
    for (const s of gerarSugestoes(estado, cfg({ tamanhoAlvo: 40 }))) {
      expect(s.itens.some((i) => i.sku === 'SP')).toBe(false);
    }
  });

  it('kit fica fora — o backend recusaria', () => {
    const estado = estadoDeTeste({
      produtos: [
        ...catalogo,
        produto({
          sku: 'KIT',
          qtd: 0,
          disponivel: 20,
          preco: 500,
          componentes: [{ sku: 'C1', qtd: 1, desc: 'C1' }],
        }),
      ],
    });
    for (const s of gerarSugestoes(estado, cfg({ tamanhoAlvo: 30 }))) {
      expect(s.itens.some((i) => i.sku === 'KIT')).toBe(false);
    }
  });

  it('a composição por categoria soma o total de peças', () => {
    for (const s of gerarSugestoes(estadoDeTeste({ produtos: catalogo }), cfg())) {
      expect(s.porCategoria.reduce((t, c) => t + c.qtd, 0)).toBe(s.pecas);
    }
  });

  it('Premium começa pela peça mais cara disponível', () => {
    const s = gerarSugestoes(estadoDeTeste({ produtos: catalogo }), cfg({ tamanhoAlvo: 4 })).find(
      (x) => x.estrategia === 'premium',
    )!;
    expect(s.itens.map((i) => i.sku)).toEqual(['A1']);
    expect(s.pecas).toBe(4);
  });

  it('estoque vazio devolve três propostas vazias, não um erro', () => {
    for (const s of gerarSugestoes(estadoDeTeste(), cfg())) {
      expect(s.pecas).toBe(0);
      expect(s.itens).toEqual([]);
    }
  });
});

describe('pesos de categoria — o insumo da personalização', () => {
  const estado = estadoDeTeste({
    produtos: catalogo,
    maletas: [
      maleta({ id: 1, revId: 1, itens: { C1: 5, B1: 1 } }),
      maleta({ id: 2, revId: 2, itens: { A1: 3 } }),
      maleta({ id: 3, revId: 1, status: 'cancelada', itens: { B1: 900 } }),
    ],
  });

  it('somam o histórico de consignação, ignorando maleta cancelada', () => {
    expect(pesosHistoricosDeConsignacao(estado)).toEqual({ Colar: 5, Brinco: 1, Anel: 3 });
  });

  it('por revendedora, contam só as maletas dela', () => {
    expect(pesosDaRevendedora(estado, 1)).toEqual({ Colar: 5, Brinco: 1 });
    expect(pesosDaRevendedora(estado, 2)).toEqual({ Anel: 3 });
  });

  it('pesos informados mudam a composição da Equilibrada', () => {
    const so = gerarSugestoes(estado, cfg({ tamanhoAlvo: 6 }), {
      pesosPorCategoria: { Anel: 1 },
    }).find((x) => x.estrategia === 'equilibrada')!;
    /* Anel só tem 4 peças liberadas (6 menos 30%); o resto vem de quem
       tem, sem inventar peça de Anel que não existe. */
    expect(so.itens.filter((i) => i.cat === 'Anel').reduce((t, i) => t + i.qtd, 0)).toBe(4);
    expect(so.pecas).toBe(6);
  });
});
