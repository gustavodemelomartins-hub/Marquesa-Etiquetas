// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PainelDaTroca } from './PainelDaTroca';
import type { Garantia, Troca } from './tipos';
import type { Connection } from '../../services/client';

const conexao = { url: 'https://api.exemplo', key: 'teste' } as Connection;

function mostrar(diferencaStatus: Troca['diferencaStatus']) {
  const garantia = {
    status: 'sem_conserto',
    troca: {
      id: 1, data: '2026-09-22', skuNovo: 'SKU-2', variacaoNova: null,
      produtoNovoNome: 'Peça nova', valorOriginal: 100, valorNovo: 70,
      diferenca: -30, diferencaStatus, diferencaPagaEm: null,
      creditoAoCliente: 30, diferencaValorPago: null, vendaId: 2,
      movimentoId: 3,
    },
  } as unknown as Garantia;
  render(
    <PainelDaTroca conexao={conexao} garantia={garantia} produtos={[]} aoMudar={vi.fn()} />,
  );
}

afterEach(cleanup);

describe('estado do crédito de troca no contrato real', () => {
  it('mostra crédito emitido como lançado no extrato da cliente', () => {
    mostrar('credito_emitido');
    expect(screen.getByText('crédito lançado')).toBeTruthy();
    expect(screen.getByText(/já lançado no extrato da ficha da cliente/)).toBeTruthy();
  });

  it('mantém o crédito pendente separado do saldo lançado', () => {
    mostrar('pendente_regra');
    expect(screen.getByText('crédito pendente')).toBeTruthy();
    expect(screen.getByText(/ainda não foi lançado/)).toBeTruthy();
    expect(screen.queryByText(/já lançado no extrato/)).toBeNull();
  });

  it('não presume que um crédito legado esteja disponível', () => {
    mostrar('credito');
    expect(screen.getByText('crédito anterior')).toBeTruthy();
    expect(screen.getByText(/Confira o extrato/)).toBeTruthy();
  });
});
