import { describe, expect, it } from 'vitest';
import {
  calcularCapacidade,
  consignaveis,
  elegivelParaMaleta,
  RESERVA_POR_MODO,
  tamanhoAlvoDoHistorico,
  TAMANHO_ALVO_SEM_HISTORICO,
  type ConfigPlanejamento,
} from './capacidade';
import { emCasa, estadoDeTeste, maleta, produto } from '../testing/fixtures';

function cfg(over: Partial<ConfigPlanejamento> = {}): ConfigPlanejamento {
  return { modo: 'equilibrado', tamanhoAlvo: 10, tamanhoAlvoConfirmado: true, ...over };
}

describe('quem pode entrar numa maleta', () => {
  it('kit fica de fora — o backend recusa kit em maleta', () => {
    const kit = produto({
      sku: 'K1',
      qtd: 0,
      disponivel: 5,
      componentes: [{ sku: 'A', qtd: 1, desc: 'A' }],
    });
    expect(elegivelParaMaleta(kit)).toBe(false);
  });

  it('código inativo fica de fora', () => {
    expect(elegivelParaMaleta(produto({ sku: 'X', disponivel: 9, status: 'inativo' }))).toBe(false);
  });

  it('código sem nada disponível fica de fora', () => {
    expect(elegivelParaMaleta(produto({ sku: 'X', qtd: 4, consignado: 4, disponivel: 0 }))).toBe(
      false,
    );
  });

  it('código ativo com peça em casa entra', () => {
    expect(elegivelParaMaleta(emCasa('X', 3))).toBe(true);
  });
});

describe('a reserva é por código, não sobre o total', () => {
  it('guarda a fração configurada de CADA código', () => {
    const estado = estadoDeTeste({ produtos: [emCasa('A', 10), emCasa('B', 10)] });
    const lista = consignaveis(estado, 30);
    expect(lista.map((c) => c.consignavel)).toEqual([7, 7]);
    expect(lista.map((c) => c.reservado)).toEqual([3, 3]);
  });

  it('código com uma peça só não sai — arredondar para cima apagaria o anúncio', () => {
    const estado = estadoDeTeste({ produtos: [emCasa('A', 1)] });
    expect(consignaveis(estado, 30)[0]!.consignavel).toBe(0);
  });

  it('nunca libera mais do que existe em casa, em nenhum modo', () => {
    const estado = estadoDeTeste({
      produtos: [emCasa('A', 7), emCasa('B', 1), emCasa('C', 40)],
    });
    for (const pct of Object.values(RESERVA_POR_MODO)) {
      for (const c of consignaveis(estado, pct)) {
        expect(c.consignavel).toBeLessThanOrEqual(c.emCasa);
        expect(c.consignavel).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('modo conservador nunca libera mais que o agressivo', () => {
    const estado = estadoDeTeste({ produtos: [emCasa('A', 25), emCasa('B', 33)] });
    const cons = consignaveis(estado, RESERVA_POR_MODO.conservador).reduce(
      (s, c) => s + c.consignavel,
      0,
    );
    const agr = consignaveis(estado, RESERVA_POR_MODO.agressivo).reduce(
      (s, c) => s + c.consignavel,
      0,
    );
    expect(cons).toBeLessThanOrEqual(agr);
  });
});

describe('tamanho alvo', () => {
  it('sai da mediana das maletas já montadas', () => {
    const estado = estadoDeTeste({
      maletas: [
        maleta({ id: 1, revId: 1, itens: { A: 20 } }),
        maleta({ id: 2, revId: 1, itens: { A: 30 } }),
        maleta({ id: 3, revId: 2, itens: { A: 100 } }),
      ],
    });
    expect(tamanhoAlvoDoHistorico(estado)).toEqual({ valor: 30, origem: 'historico', amostra: 3 });
  });

  it('maleta cancelada não entra na mediana', () => {
    const estado = estadoDeTeste({
      maletas: [
        maleta({ id: 1, revId: 1, itens: { A: 10 } }),
        maleta({ id: 2, revId: 1, status: 'cancelada', itens: { A: 1000 } }),
        maleta({ id: 3, revId: 1, status: 'encerrada', itens: { A: 20 } }),
      ],
    });
    expect(tamanhoAlvoDoHistorico(estado).valor).toBe(15);
    expect(tamanhoAlvoDoHistorico(estado).amostra).toBe(2);
  });

  it('sem histórico, declara que o número é um valor de partida', () => {
    const r = tamanhoAlvoDoHistorico(estadoDeTeste());
    expect(r.origem).toBe('padrao');
    expect(r.valor).toBe(TAMANHO_ALVO_SEM_HISTORICO);
    expect(r.amostra).toBe(0);
  });
});

describe('capacidade', () => {
  it('a conta fecha: reservado + consignável = em casa', () => {
    const estado = estadoDeTeste({ produtos: [emCasa('A', 10), emCasa('B', 20), emCasa('C', 3)] });
    const c = calcularCapacidade(estado, cfg());
    expect(c.reservado + c.consignavel).toBe(c.emCasa);
  });

  it('nunca propõe mais maletas do que o estoque liberado comporta', () => {
    const estado = estadoDeTeste({
      produtos: [emCasa('A', 10), emCasa('B', 20), emCasa('C', 3), emCasa('D', 1)],
    });
    for (const modo of ['conservador', 'equilibrado', 'agressivo'] as const) {
      for (const alvo of [1, 5, 10, 40, 500]) {
        const c = calcularCapacidade(estado, cfg({ modo, tamanhoAlvo: alvo }));
        expect(c.maletas * c.tamanhoAlvo).toBeLessThanOrEqual(c.consignavel);
        expect(c.consignavel).toBeLessThanOrEqual(c.emCasa);
      }
    }
  });

  it('estoque todo consignado dá capacidade zero', () => {
    const estado = estadoDeTeste({
      produtos: [produto({ sku: 'A', qtd: 10, consignado: 10, disponivel: 0 })],
    });
    const c = calcularCapacidade(estado, cfg());
    expect(c.emCasa).toBe(0);
    expect(c.maletas).toBe(0);
  });

  it('conta separado as peças liberadas que estão sem preço', () => {
    const estado = estadoDeTeste({
      produtos: [emCasa('A', 10), emCasa('B', 10, { preco: null, semPreco: true })],
    });
    const c = calcularCapacidade(estado, cfg());
    expect(c.pecasSemPreco).toBe(7);
  });

  it('kit não infla a capacidade', () => {
    const estado = estadoDeTeste({
      produtos: [
        emCasa('A', 10),
        produto({ sku: 'K', qtd: 0, disponivel: 10, componentes: [{ sku: 'A', qtd: 1, desc: 'A' }] }),
      ],
    });
    expect(calcularCapacidade(estado, cfg()).emCasa).toBe(10);
  });
});
