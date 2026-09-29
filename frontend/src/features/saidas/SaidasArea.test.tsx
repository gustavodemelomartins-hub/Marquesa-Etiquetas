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
      qtd: 2, motivo: 'Brinde VIP', observacao: null, movimentoId: 77, estoqueRefletido: true,
      origemUsuario: null, origemRegistro: 'manual', historicoItemId: null,
      precoUnit: 89, precoFonte: 'lancamento', valorTotal: 178, custoUnit: null, custoTotal: null,
      precoAtual: 99, custoAtual: null },
    { ...base, id: 2, tipo: 'uso_proprio', tipoRotulo: 'Uso próprio', data: '2025-09-24', sku: '234199', produto: 'Anel',
      qtd: 1, motivo: 'Maleta', observacao: 'Planilha de vendas, Nº 809', movimentoId: null, estoqueRefletido: false,
      origemUsuario: 'reconciliacao-2026-09-26', origemRegistro: 'migracao_historico', historicoItemId: 9,
      precoUnit: null, valorTotal: null, custoUnit: null, custoTotal: null, precoAtual: 109, custoAtual: null },
  ],
  resumo: { brinde: 1, uso_proprio: 1, perda: 0, sorteio: 0, total: 2, estornadas: 0 },
  legado: [{
    reclassificacaoId: 5, tipo: 'uso_proprio', tipoRotulo: 'Uso próprio', data: null, sku: '431593', produto: 'Brinco',
    qtd: 1, valorPlanilha: null, pessoa: 'Sthefany Marques', observacao: null, motivo: 'retirada',
    linhaPlanilha: '147', historicoItemId: 10, decididoEm: '2026-09-26', decididoPor: null, porque: 'sem data na planilha',
  }],
};

function abrir(embutida = false) {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(resposta), { status: 200 }));
  vi.stubGlobal('fetch', f);
  render(<SaidasArea conexao={conexao} estado={null} aoMudarEstoque={() => {}} embutida={embutida} />);
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

/* QA 29/09/2026 — o formulário ficava no FIM da página; o valor de cada
   saída não aparecia; e não havia como completar o que faltava. */
describe('Saídas sem faturamento — operação e valor', () => {
  it('em Nova venda, o botão Registrar saída está no topo e abre a gaveta', async () => {
    abrir(true);
    const botoes = await screen.findAllByRole('button', { name: /Registrar saída/ });
    const topo = botoes[0]!;
    const tabela = await screen.findByRole('table', { name: 'Saídas sem faturamento' });
    // o botão vem ANTES da lista no documento
    expect(topo.compareDocumentPosition(tabela) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(topo);
    expect(await screen.findByRole('dialog', { name: 'Registrar saída sem faturamento' })).toBeTruthy();
  });

  it('mostra o valor gravado e diz quando ele não foi informado', async () => {
    abrir();
    const tabela = await screen.findByRole('table', { name: 'Saídas sem faturamento' });
    expect(within(tabela).getByText('R$ 178,00')).toBeTruthy();
    expect(within(tabela).getByText(/R\$ 89,00 cada · gravado no lançamento/)).toBeTruthy();
    expect(within(tabela).getByText('valor não informado')).toBeTruthy();
    expect(within(tabela).getAllByText('custo não informado').length).toBe(2);
    expect(within(tabela).queryByText('R$ 0,00')).toBeNull();
  });

  it('completar o valor exige motivo e manda só o que mudou', async () => {
    const f = abrir();
    const tabela = await screen.findByRole('table', { name: 'Saídas sem faturamento' });
    fireEvent.click(within(tabela).getAllByRole('button', { name: 'Informar valor' })[1]!);
    const gaveta = await screen.findByRole('dialog', { name: 'Valor da saída' });
    const salvar = within(gaveta).getByRole('button', { name: 'Salvar valor' }) as HTMLButtonElement;
    fireEvent.change(within(gaveta).getByLabelText('Custo unitário'), { target: { value: '32,50' } });
    expect(salvar.disabled).toBe(true);
    fireEvent.change(within(gaveta).getByPlaceholderText(/nota de compra/), { target: { value: 'nota da compra' } });
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('/api/saidas/2/valor'))).toBe(true));
    const chamada = f.mock.calls.find(([u]) => String(u).includes('/api/saidas/2/valor'))!;
    expect(chamada[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(chamada[1]?.body))).toEqual({ custoUnit: 32.5, motivo: 'nota da compra', tambemNaPeca: true });
  });
});
