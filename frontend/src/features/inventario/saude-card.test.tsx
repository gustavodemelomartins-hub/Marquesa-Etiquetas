// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../../services/client';
import type { AppState } from '../../types/api';

vi.mock('../../components/scanner/leitorDeEtiqueta', () => ({
  temCamera: () => false,
  montarLeitor: async () => async () => null,
  criarBipe: () => () => {},
}));

import { InventarioArea } from './InventarioArea';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function servidor(lista: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(lista), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
}
const estadoCom = (inventario: Record<string, unknown>) => ({ inventario } as unknown as AppState);
const card = () => screen.getByText('Saúde do estoque').closest('article')!;

/* 03/10/2026 — ícone verde ao lado de "Conferência vencida". */
describe('card "Saúde do estoque"', () => {
  it('sem inventário real concluído (histórico zerado): primeira conferência pendente, não saudável', async () => {
    servidor([]);
    render(<InventarioArea conexao={conexao} aoMudarEstoque={() => {}}
      estado={estadoCom({ abertoId: null, ultimoId: null, ultimoEm: null, diasDesde: null, prazoDias: 45, vencido: true })} />);
    await screen.findByText('Nenhum inventário ainda');
    expect(card().getAttribute('data-saude')).toBe('atencao');
    expect(card().textContent).toContain('Primeira conferência pendente');
    expect(card().textContent).not.toContain('Conferência vencida');
    expect(card().querySelector('.context-icon.success')).toBeNull();
    expect(card().querySelector('.context-icon.warn')).not.toBeNull();
  });

  it('vencida: alerta (risco), nunca aparência positiva', async () => {
    servidor([{ id: 8, status: 'concluido', iniciadoEm: '2026-08-14 12:00:00', pausadoEm: null,
      concluidoEm: '2026-08-14 15:00:00', divergentes: 0, pecas: 10, naoComparaveis: 0 }]);
    render(<InventarioArea conexao={conexao} aoMudarEstoque={() => {}}
      estado={estadoCom({ ultimoId: 8, ultimoEm: '2026-08-14', diasDesde: 50, prazoDias: 45, vencido: true })} />);
    await waitFor(() => expect(card().textContent).toContain('Conferência vencida'));
    expect(card().getAttribute('data-saude')).toBe('vencida');
    expect(card().classList.contains('inventory-context--vencida')).toBe(true);
    expect(card().querySelector('.context-icon.success')).toBeNull();
    expect(card().querySelector('.context-icon.risk')).not.toBeNull();
  });

  it('depois de um inventário válido: saudável, com a data real dele', async () => {
    servidor([{ id: 8, status: 'concluido', iniciadoEm: '2026-09-30 12:00:00', pausadoEm: null,
      concluidoEm: '2026-09-30 15:00:00', divergentes: 0, pecas: 10, naoComparaveis: 0 }]);
    render(<InventarioArea conexao={conexao} aoMudarEstoque={() => {}}
      estado={estadoCom({ ultimoId: 8, ultimoEm: '2026-09-30', diasDesde: 3, prazoDias: 45, vencido: false })} />);
    await waitFor(() => expect(card().textContent).toContain('Estoque conferido'));
    expect(card().getAttribute('data-saude')).toBe('ok');
    expect(card().textContent).toContain('Última em 30/09/2026 · há 3 dias');
    expect(card().querySelector('.context-icon.success')).not.toBeNull();
  });
});
