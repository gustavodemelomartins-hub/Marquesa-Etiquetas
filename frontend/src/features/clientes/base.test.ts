import { describe, it, expect } from 'vitest';
import { contarEstados, haQuanto, recorrentes, topCompradoras } from './base';
import type { ClienteDaBase } from './tipos';

const c = (extra: Partial<ClienteDaBase>): ClienteDaBase => ({
  norm: 'x', nome: 'X', identificada: true, clienteId: 1, vendas: 1, pecas: 1,
  faturamento: 0, comprado: 0, ticketMedio: null, primeiraCompra: null, ultimaCompra: null,
  recorrente: false, estado: 'ativa', diasSemComprar: 1, frequenciaDias: null, ...extra,
});

describe('Visão geral de clientes', () => {
  it('Top: por quanto COMPROU, pago ou não — a compra de R$ 504 em aberto conta', () => {
    const top = topCompradoras([
      c({ norm: 'a', comprado: 100, faturamento: 100 }),
      c({ norm: 'eli', comprado: 504, faturamento: 0 }),
      c({ norm: 'z', comprado: 0 }),
    ]);
    expect(top.map((x) => x.norm)).toEqual(['eli', 'a']);
  });

  it('Top: cliente sem nome não entra no ranking', () => {
    expect(topCompradoras([c({ identificada: false, comprado: 9999 })])).toEqual([]);
  });

  it('recorrentes: só o estado que o servidor deu, quem compra mais vezes primeiro', () => {
    const r = recorrentes([
      c({ norm: 'a', estado: 'recorrente', vendas: 2 }),
      c({ norm: 'b', estado: 'recorrente', vendas: 7 }),
      c({ norm: 'c', estado: 'em risco', vendas: 9 }),
    ]);
    expect(r.map((x) => x.norm)).toEqual(['b', 'a']);
  });

  it('conta os estados sem inventar categoria', () => {
    expect(contarEstados([
      c({ estado: 'recorrente' }), c({ estado: 'inativa' }), c({ estado: 'inativa' }),
      c({ estado: 'sem histórico' }), c({ estado: 'em risco', identificada: false }),
    ])).toEqual({ recorrente: 1, ativa: 0, 'em risco': 0, inativa: 2 });
  });

  it('diz há quanto tempo em palavras', () => {
    expect(haQuanto(0)).toBe('hoje');
    expect(haQuanto(1)).toBe('ontem');
    expect(haQuanto(45)).toBe('há 45 dias');
    expect(haQuanto(200)).toBe('há 7 meses');
    expect(haQuanto(800)).toBe('há 2 anos');
    expect(haQuanto(null)).toBe('—');
  });
});
