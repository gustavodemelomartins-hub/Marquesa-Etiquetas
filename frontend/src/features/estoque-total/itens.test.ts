import { describe, expect, it } from 'vitest';
import { contarFiltro, ehConflito, filtrarItens, itensAprovados, itensPendentes, precisaRevisaoManual } from './itens';
import type { ItemSessao } from './tipos';

function item(parcial: Partial<ItemSessao>): ItemSessao {
  return {
    id: 1,
    sku: 'X',
    variacao: null,
    descricao: 'Peça',
    tipo: 'ajuste_qtd',
    de: '4',
    para: '7',
    risco: 'confere',
    motivo: null,
    status: 'pendente',
    erro: null,
    dados: null,
    ...parcial,
  };
}

describe('ehConflito', () => {
  it('ajuste_qtd com dados.conflito = total_menor_que_consignado é conflito', () => {
    const i = item({ dados: { conflito: 'total_menor_que_consignado', consignadoNaAnalise: 3 } });
    expect(ehConflito(i)).toBe(true);
  });

  it('ajuste_qtd normal, sem dados, não é conflito', () => {
    expect(ehConflito(item({}))).toBe(false);
  });

  it('produto_novo nunca é conflito de consignação (é outro tipo)', () => {
    const i = item({ tipo: 'produto_novo', dados: { conflito: 'total_menor_que_consignado' } as never });
    expect(ehConflito(i)).toBe(false);
  });
});

describe('filtrarItens', () => {
  const itens: ItemSessao[] = [
    item({ id: 1, tipo: 'ajuste_qtd' }),
    item({ id: 2, tipo: 'ajuste_qtd', dados: { conflito: 'total_menor_que_consignado' } }),
    item({ id: 3, tipo: 'produto_novo', de: null, para: '5' }),
    item({ id: 4, status: 'rejeitado' }),
    item({ id: 5, status: 'aplicado' }),
    item({ id: 6, status: 'obsoleto' }),
    item({ id: 7, status: 'erro' }),
  ];

  it('todos devolve tudo', () => {
    expect(filtrarItens(itens, 'todos')).toHaveLength(7);
  });

  it('alteracoes pega ajuste_qtd sem conflito, de qualquer status — é um filtro por tipo, não por decisão', () => {
    const r = filtrarItens(itens, 'alteracoes');
    expect(r.map((i) => i.id)).toEqual([1, 4, 5, 6, 7]);
  });

  it('alteracoes exclui o item em conflito e o produto_novo', () => {
    const r = filtrarItens(itens, 'alteracoes');
    expect(r.map((i) => i.id)).not.toContain(2);
    expect(r.map((i) => i.id)).not.toContain(3);
  });

  it('novos pega só produto_novo', () => {
    expect(filtrarItens(itens, 'novos').map((i) => i.id)).toEqual([3]);
  });

  it('conflitos pega só o item com dados.conflito', () => {
    expect(filtrarItens(itens, 'conflitos').map((i) => i.id)).toEqual([2]);
  });

  it('rejeitados/aplicados/obsoletos/erros filtram por status', () => {
    expect(filtrarItens(itens, 'rejeitados').map((i) => i.id)).toEqual([4]);
    expect(filtrarItens(itens, 'aplicados').map((i) => i.id)).toEqual([5]);
    expect(filtrarItens(itens, 'obsoletos').map((i) => i.id)).toEqual([6]);
    expect(filtrarItens(itens, 'erros').map((i) => i.id)).toEqual([7]);
  });

  it('contarFiltro é o tamanho de filtrarItens', () => {
    expect(contarFiltro(itens, 'alteracoes')).toBe(5);
    expect(contarFiltro(itens, 'conflitos')).toBe(1);
  });
});

describe('itensPendentes / itensAprovados', () => {
  it('separa por status', () => {
    const itens = [item({ id: 1, status: 'pendente' }), item({ id: 2, status: 'aprovado' }), item({ id: 3, status: 'rejeitado' })];
    expect(itensPendentes(itens).map((i) => i.id)).toEqual([1]);
    expect(itensAprovados(itens).map((i) => i.id)).toEqual([2]);
  });
});

describe('precisaRevisaoManual', () => {
  it('conflito sempre precisa', () => {
    expect(precisaRevisaoManual(item({ dados: { conflito: 'total_menor_que_consignado' } }))).toBe(true);
  });

  it('risco perigoso ou desconhecido precisa, mesmo sem conflito', () => {
    expect(precisaRevisaoManual(item({ risco: 'perigoso' }))).toBe(true);
    expect(precisaRevisaoManual(item({ risco: 'desconhecido' }))).toBe(true);
  });

  it('trivial/confere sem conflito não precisa', () => {
    expect(precisaRevisaoManual(item({ risco: 'trivial' }))).toBe(false);
    expect(precisaRevisaoManual(item({ risco: 'confere' }))).toBe(false);
  });
});
