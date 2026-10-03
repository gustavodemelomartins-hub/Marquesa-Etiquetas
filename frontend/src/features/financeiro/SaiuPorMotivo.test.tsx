// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceiroArea } from './FinanceiroArea';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const saida = (id: number, tipo: string, produto: string, extra = {}) => ({
  id, tipo, tipoRotulo: tipo, sentido: 'saida', data: '2026-06-27', sku: String(100000 + id), produto,
  variacao: null, qtd: 1, motivo: produto, observacao: null, estornada: false, estoqueRefletido: false,
  origemRegistro: 'migracao_historico', historicoItemId: id, precoUnit: 79, custoUnit: null,
  precoFonte: 'planilha', custoFonte: null, criadoEm: '2026-10-02', ...extra,
});
const legado = (id: number, tipo: string, produto: string) => ({
  reclassificacaoId: id, tipo, tipoRotulo: tipo, data: null, sku: String(900000 + id), produto, qtd: 1,
  valorPlanilha: null, pessoa: 'Sthefany Marques', observacao: `Presente ${produto}`, motivo: 'x',
  linhaPlanilha: String(id), historicoItemId: id, decididoEm: null, decididoPor: null, porque: 'sem data na planilha',
  custoInformado: 2.56,
});

function servidor() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const caminho = String(url).replace('http://api.local', '').split('?')[0];
    /* O período é do servidor: `de` corta as saídas como a rota de verdade. */
    const de = new URL(String(url)).searchParams.get('de');
    const noPeriodo = (x: { data: string }) => !de || x.data >= de;
    const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (caminho === '/api/saidas') {
      return json({
        ok: true,
        saidas: [
          saida(1, 'brinde', 'Pulseira Fita'),
          saida(2, 'brinde', 'Brinco Três Zircônias'),
          saida(3, 'uso_proprio', 'Anel Pai Nosso'),
          saida(4, 'perda', 'Brinco Gota Dupla', { precoUnit: null }),
        ].filter(noPeriodo),
        resumo: { brinde: 2, uso_proprio: 1, perda: 1, sorteio: 0, total: 4, estornadas: 0,
          valor: { custo: 0, venda: 237, semCusto: 4, semPreco: 1, pecasSemCusto: 4, pecasSemPreco: 1 } },
        limite: 1000, offset: 0,
        legado: [legado(10, 'brinde', 'Vó'), legado(11, 'uso_proprio', 'Gustavo')],
      });
    }
    if (caminho === '/api/contas-receber') return json({ contas: [], resumo: { quantidade: 0, total: 0 } });
    return json({});
  }));
}

describe('Saiu sem faturar — navegar pelo motivo', () => {
  it('a tela principal mostra os motivos (com os registros antigos somados) e não a lista inteira', async () => {
    servidor();
    render(<FinanceiroArea conexao={{ url: 'http://api.local', key: 'k' }} sub="saidas~tudo" aoNavegar={() => {}} aoAbrirCliente={() => {}} />);
    const motivos = await screen.findByRole('heading', { name: 'Por motivo' }, { timeout: 3000 });
    const secao = motivos.closest('section')!;
    const brinde = within(secao).getByRole('button', { name: /Brinde/ });
    expect(brinde.textContent).toMatch(/3 peças/);
    expect(within(secao).getByRole('button', { name: /Uso próprio/ }).textContent).toMatch(/2 peças/);
    /* A lista gigante não está na tela principal. */
    expect(screen.queryByText('Pulseira Fita')).toBeNull();
    expect(screen.queryByText('Peças que saíram sem virar venda')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Registros antigos sem saída' })).toBeNull();
  });

  it('clicar em Brinde mostra só os brindes; voltar devolve os motivos', async () => {
    servidor();
    render(<FinanceiroArea conexao={{ url: 'http://api.local', key: 'k' }} sub="saidas~tudo" aoNavegar={() => {}} aoAbrirCliente={() => {}} />);
    const motivos = await screen.findByRole('heading', { name: 'Por motivo' }, { timeout: 3000 });
    fireEvent.click(within(motivos.closest('section')!).getByRole('button', { name: /Brinde/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Brinde' })).toBeTruthy());
    expect(screen.getAllByText('Pulseira Fita').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Brinco Três Zircônias').length).toBeGreaterThan(0);
    expect(screen.queryByText('Anel Pai Nosso')).toBeNull();
    expect(screen.queryByText('Brinco Gota Dupla')).toBeNull();
    const antigos = screen.getByRole('list', { name: 'Registros antigos sem saída' });
    expect(within(antigos).getByText('Presente Vó')).toBeTruthy();
    expect(within(antigos).queryByText('Presente Gustavo')).toBeNull();
    expect(within(antigos).getByText(/custo R\$\s*2,56/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Todos os motivos/ }));
    expect(await screen.findByRole('heading', { name: 'Por motivo' })).toBeTruthy();
  });

  it('clicar em Diferença de inventário mostra só as perdas', async () => {
    servidor();
    render(<FinanceiroArea conexao={{ url: 'http://api.local', key: 'k' }} sub="saidas~tudo" aoNavegar={() => {}} aoAbrirCliente={() => {}} />);
    const motivos = await screen.findByRole('heading', { name: 'Por motivo' }, { timeout: 3000 });
    const botoes = within(motivos.closest('section')!).getAllByRole('button');
    const perda = botoes.find((b) => !/Brinde|Uso próprio/.test(b.textContent ?? ''))!;
    fireEvent.click(perda);
    await waitFor(() => expect(screen.getAllByText('Brinco Gota Dupla').length).toBeGreaterThan(0));
    expect(screen.queryByText('Pulseira Fita')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Registros antigos sem saída' })).toBeNull();
  });
});

/* 03/10/2026 — Saiu sem faturar abria nos 30 dias padrão e, sem saída
   recente, a Sthefany via "Nenhuma saída neste período" com o histórico
   inteiro classificado. Agora a aba abre em Tudo. */
describe('Saiu sem faturar abre em Tudo', () => {
  const props = { conexao: { url: 'http://api.local', key: 'k' }, aoAbrirCliente: () => {} };
  const periodo = (nome: string) => within(screen.getByRole('group', { name: 'Período' }))
    .getByRole('button', { name: new RegExp(`^${nome}$`) });

  it('sem período na URL: Tudo marcado e os motivos aparecem de imediato', async () => {
    servidor();
    render(<FinanceiroArea {...props} sub="saidas" aoNavegar={() => {}} />);
    const motivos = await screen.findByRole('heading', { name: 'Por motivo' }, { timeout: 3000 });
    expect(within(motivos.closest('section')!).getByRole('button', { name: /Brinde/ }).textContent).toMatch(/3 peças/);
    expect(periodo('Tudo').getAttribute('aria-pressed')).toBe('true');
    expect(periodo('30 dias').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Nenhuma saída neste período')).toBeNull();
  });

  it('trocar para 30 dias continua funcionando (e vai para a URL)', async () => {
    servidor();
    const aoNavegar = vi.fn();
    const { rerender } = render(<FinanceiroArea {...props} sub="saidas" aoNavegar={aoNavegar} />);
    await screen.findByRole('heading', { name: 'Por motivo' }, { timeout: 3000 });
    fireEvent.click(periodo('30 dias'));
    expect(aoNavegar).toHaveBeenLastCalledWith('saidas~30d');
    rerender(<FinanceiroArea {...props} sub="saidas~30d" aoNavegar={aoNavegar} />);
    await screen.findByText('Nenhuma saída neste período');
    expect(periodo('30 dias').getAttribute('aria-pressed')).toBe('true');
  });

  it('as outras abas continuam no padrão de 30 dias; período não escolhido não viaja', async () => {
    servidor();
    const aoNavegar = vi.fn();
    const { rerender } = render(<FinanceiroArea {...props} sub="a-receber" aoNavegar={aoNavegar} />);
    expect(periodo('30 dias').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Saiu sem faturar/ }));
    expect(aoNavegar).toHaveBeenLastCalledWith('saidas');
    rerender(<FinanceiroArea {...props} sub="saidas" aoNavegar={aoNavegar} />);
    await screen.findByRole('heading', { name: 'Por motivo' }, { timeout: 3000 });
    expect(periodo('Tudo').getAttribute('aria-pressed')).toBe('true');
  });

  it('período escolhido viaja entre abas', async () => {
    servidor();
    const aoNavegar = vi.fn();
    render(<FinanceiroArea {...props} sub="a-receber~90d" aoNavegar={aoNavegar} />);
    fireEvent.click(screen.getByRole('button', { name: /Saiu sem faturar/ }));
    expect(aoNavegar).toHaveBeenLastCalledWith('saidas~90d');
  });

  it('intervalo livre na URL é lido inteiro', async () => {
    servidor();
    render(<FinanceiroArea {...props} sub="saidas~2026-06-01~2026-06-30" aoNavegar={() => {}} />);
    await screen.findByRole('heading', { name: 'Por motivo' }, { timeout: 3000 });
    expect(screen.getByRole('group', { name: 'Período' }).querySelector('[aria-pressed="true"]')?.textContent).not.toBe('Tudo');
  });
});
