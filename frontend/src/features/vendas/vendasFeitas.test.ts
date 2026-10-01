import { describe, it, expect } from 'vitest';
import { paraTela } from './api';
import type { VendaFeitaApi, ItemDaVenda } from './tipos';

const peca = (sku: string, valor: number, linha: string): ItemDaVenda => ({
  id: linha, sku, produto: `Peça ${sku}`, qtd: 1, precoUnit: valor, valor,
  descontoValor: null, descontoRotulo: null, observacao: null, linhaPlanilha: linha,
});

/* O caso real de 01/10/2026: Elizama Meira, 19/09/2026, cinco peças numa
   compra de R$ 504,00 (105 + 62 + 89 + 119 + 129), não paga. */
const elizama = (extra: Partial<VendaFeitaApi> = {}): VendaFeitaApi => ({
  chave: 'H2144', fonte: 'historico', id: 2144, data: '2026-09-19',
  cliente: 'Elizama Meira', clienteNorm: 'elizama meira', canal: 'Maleta',
  cancelada: false, pecas: 5,
  financeiro: {
    valorVenda: 50400, valorRecebido: 0, valorAReceber: 50400,
    statusPagamento: 'nao_paga', indeterminado: [],
  },
  itens: [
    peca('316411', 105, '1404'), peca('101665', 62, '1405'), peca('301665', 89, '1406'),
    peca('562583', 119, '1407'), peca('446425', 129, '1408'),
  ],
  ...extra,
});

describe('vendas feitas: uma linha é uma venda', () => {
  it('a compra de 5 peças é UMA venda de R$ 504,00, com as 5 peças dentro', () => {
    const v = paraTela(elizama());
    expect(v.valor).toBe(504);
    expect(v.pecas).toBe(5);
    expect(v.itens).toHaveLength(5);
    expect(v.itens.reduce((s, i) => s + (i.valor ?? 0), 0)).toBe(504);
    expect(v.situacao).toBe('a_receber');
    expect(v.aReceber).toBe(504);
  });

  it('dinheiro sai em reais, nunca em centavos', () => {
    const v = paraTela(elizama());
    expect(v.recebido).toBe(0);
    expect(v.aReceber).not.toBe(50400);
  });

  it('pagamento parcial: 504 − 100 = 404', () => {
    const v = paraTela(elizama({
      financeiro: { valorVenda: 50400, valorRecebido: 10000, valorAReceber: 40400, statusPagamento: 'parcial', indeterminado: [] },
    }));
    expect(v.situacao).toBe('parcial');
    expect(v.recebido).toBe(100);
    expect(v.aReceber).toBe(404);
  });

  it('recebida depois pelo Financeiro: a venda aparece paga', () => {
    const v = paraTela(elizama({
      financeiro: { valorVenda: 50400, valorRecebido: 50400, valorAReceber: 0, statusPagamento: 'paga', indeterminado: [] },
    }));
    expect(v.situacao).toBe('paga');
    expect(v.aReceber).toBe(0);
  });

  it('recebimento desconhecido continua desconhecido — não vira zero', () => {
    const v = paraTela(elizama({
      financeiro: { valorVenda: 50400, valorRecebido: null, valorAReceber: null, statusPagamento: 'indefinida', indeterminado: ['valorRecebido'] },
    }));
    expect(v.recebido).toBeNull();
    expect(v.aReceber).toBeNull();
    expect(v.situacao).toBe('sem_informacao');
  });

  it('cancelada prevalece sobre qualquer situação de pagamento', () => {
    expect(paraTela(elizama({ cancelada: true })).situacao).toBe('cancelada');
  });
});
