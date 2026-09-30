import { describe, it, expect } from 'vitest';
import { agrupar } from './api';
import type { ItemDaLista } from './tipos';

const item = (extra: Partial<ItemDaLista> = {}): ItemDaLista => ({
  fonte: 'historico', id: 'h1', venda_id: null, venda_historica_id: 7, referencia: 'H7',
  data: '2026-09-19', cliente: 'Elizama Meira', cliente_norm: 'elizama meira', sku: '100101',
  produto: 'Colar', qtd: 1, valor: 504, canal: 'Maleta', observacao: null, pago: 0, cancelada: 0,
  origem: 'planilha', venda_valor: 504, venda_recebido: 0,
  financeiro: { valorVenda: 50400, valorRecebido: 0, valorAReceber: 50400, statusPagamento: 'nao_paga', indeterminado: [] },
  ...extra,
});

describe('agrupar vendas: dinheiro na mesma unidade', () => {
  /* O defeito de 29/09/2026: "R$ 504,00 · a receber R$ 50.400,00". O bloco
     `financeiro` vem em centavos e o valor da venda em reais. */
  it('a receber sai em reais, igual ao valor da venda', () => {
    const [v] = agrupar([item()]);
    expect(v!.valor).toBe(504);
    expect(v!.aReceber).toBe(504);
    expect(v!.recebido).toBe(0);
  });

  it('pagamento parcial: 504 − 100 = 404', () => {
    const [v] = agrupar([item({ venda_recebido: 100, financeiro: { valorVenda: 50400, valorRecebido: 10000, valorAReceber: 40400, statusPagamento: 'parcial', indeterminado: [] } })]);
    expect(v!.aReceber).toBe(404);
  });

  it('recebimento desconhecido continua desconhecido — não vira zero', () => {
    const [v] = agrupar([item({ financeiro: { valorVenda: 50400, valorRecebido: null, valorAReceber: null, statusPagamento: 'nao_paga', indeterminado: ['valorRecebido'] } })]);
    expect(v!.aReceber).toBeNull();
    expect(v!.indeterminado).toEqual(['valorRecebido']);
  });
});
