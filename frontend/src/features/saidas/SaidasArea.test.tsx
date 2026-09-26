// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaidasArea } from './SaidasArea';
import type { Saidas } from './tipos';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const conexao = { url: 'http://api.local', key: 'chave' };

const base = {
  sentido: 'saida' as const, variacao: null, varianteId: null, inventarioId: null,
  estornada: false, estornoEm: null, estornoMotivo: null, atualizadoEm: null, criadoEm: '2026-09-26',
};
const resposta: Saidas = {
  ok: true,
  saidas: [
    { ...base, id: 1, tipo: 'brinde', tipoRotulo: 'Brinde', data: '2026-09-20', sku: '444444', produto: 'Colar',
      qtd: 1, motivo: 'Brinde VIP', observacao: null, movimentoId: 77, estoqueRefletido: true,
      origemUsuario: null, origemRegistro: 'manual', historicoItemId: null },
    { ...base, id: 2, tipo: 'uso_proprio', tipoRotulo: 'Uso próprio', data: '2025-09-24', sku: '234199', produto: 'Anel',
      qtd: 1, motivo: 'Maleta', observacao: 'Planilha de vendas, Nº 809', movimentoId: null, estoqueRefletido: false,
      origemUsuario: 'reconciliacao-2026-09-26', origemRegistro: 'migracao_historico', historicoItemId: 9 },
  ],
  resumo: { brinde: 1, uso_proprio: 1, perda: 0, sorteio: 0, total: 2, estornadas: 0 },
  legado: [{
    reclassificacaoId: 5, tipo: 'uso_proprio', tipoRotulo: 'Uso próprio', data: null, sku: '431593', produto: 'Brinco',
    qtd: 1, valorPlanilha: null, pessoa: 'Sthefany Marques', observacao: null, motivo: 'retirada',
    linhaPlanilha: '147', historicoItemId: 10, decididoEm: '2026-09-26', decididoPor: null, porque: 'sem data na planilha',
  }],
};

function abrir() {
  const f = vi.fn(async (_url: string) => new Response(JSON.stringify(resposta), { status: 200 }));
  vi.stubGlobal('fetch', f);
  render(<SaidasArea conexao={conexao} estado={null} aoMudarEstoque={() => {}} />);
  return f;
}

describe('Saídas sem faturamento — histórico', () => {
  it('diz de onde cada saída veio', async () => {
    abrir();
    const tabela = await screen.findByRole('table', { name: 'Saídas sem faturamento' });
    expect(within(tabela).getByText(/Lançada no sistema/)).toBeTruthy();
    expect(within(tabela).getByText(/movimento #77/)).toBeTruthy();
    expect(within(tabela).getByText(/Planilha de vendas antiga · por reconciliacao-2026-09-26/)).toBeTruthy();
    expect(within(tabela).getByText(/só classifica — não baixou estoque/)).toBeTruthy();
  });

  it('o registro antigo sem data não some', async () => {
    abrir();
    const legado = await screen.findByRole('list', { name: 'Registros antigos sem saída' });
    expect(within(legado).getByText('sem data na planilha')).toBeTruthy();
    expect(within(legado).getByText(/planilha Nº 147/)).toBeTruthy();
  });

  it('busca e período vão ao servidor', async () => {
    const f = abrir();
    await screen.findByRole('table', { name: 'Saídas sem faturamento' });
    fireEvent.change(screen.getByLabelText('Buscar saída'), { target: { value: '444444' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } });
    await waitFor(() => {
      const ultima = String(f.mock.calls.at(-1)?.[0]);
      expect(ultima).toContain('busca=444444');
      expect(ultima).toContain('de=2026-09-01');
    });
  });
});
