// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { RegistrosAntigos } from './RegistrosAntigos';
import type { SaidaLegada } from './tipos';

afterEach(cleanup);

const linha = (extra: Partial<SaidaLegada>): SaidaLegada => ({
  reclassificacaoId: 1, tipo: 'brinde', tipoRotulo: 'Brinde', data: '2026-05-10', sku: '450475',
  produto: 'Brinco Baby de Morangos', qtd: 1, valorPlanilha: 49, pessoa: 'Sthefany Marques',
  observacao: 'Presente Cecilia · Maleta', motivo: 'confirmação humana', linhaPlanilha: '1076',
  historicoItemId: 3793, decididoEm: '2026-10-02 14:00:00', decididoPor: 'x', porque: 'código fora do catálogo',
  ...extra,
});

describe('Registros antigos sem saída', () => {
  it('mostra motivo, peça, origem e o valor que a planilha registrava', () => {
    render(<RegistrosAntigos legado={[linha({})]} />);
    const l = screen.getByRole('list', { name: 'Registros antigos sem saída' });
    expect(within(l).getByText('Brinde')).toBeTruthy();
    expect(within(l).getByText(/R\$\s*49,00 na planilha/)).toBeTruthy();
    expect(within(l).getByText(/Sthefany Marques/)).toBeTruthy();
    expect(within(l).getByText('Presente Cecilia · Maleta')).toBeTruthy();
  });

  it('respeita o período; sem data só aparece sem período', () => {
    const legado = [
      linha({ reclassificacaoId: 1, data: '2026-05-10' }),
      linha({ reclassificacaoId: 2, data: '2024-11-07', produto: 'Berloque Patas', tipo: 'uso_proprio', tipoRotulo: 'Uso próprio' }),
      linha({ reclassificacaoId: 3, data: null, produto: 'Sem data' }),
    ];
    const { rerender } = render(<RegistrosAntigos legado={legado} de="2026-01-01" ate="2026-12-31" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    rerender(<RegistrosAntigos legado={legado} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Uso próprio')).toBeTruthy();
  });

  it('nada no período → não desenha a seção', () => {
    render(<RegistrosAntigos legado={[linha({ data: '2024-01-01' })]} de="2026-09-01" ate="2026-10-01" />);
    expect(screen.queryByRole('list', { name: 'Registros antigos sem saída' })).toBeNull();
  });
});
