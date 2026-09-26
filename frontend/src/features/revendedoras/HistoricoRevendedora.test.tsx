// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoricoRevendedora, type HistoricoDaRevendedora } from './HistoricoRevendedora';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const conexao = { url: 'http://api.local', key: 'chave' };

const resposta: HistoricoDaRevendedora = {
  ok: true,
  resumo: { acertos: 1, pecasVendidas: 15, vendido: 1335, comissao: 333.75, liquido: 1001.25, aReceber: 0, maletas: 2, maletasAbertas: 1, pecasComEla: 92 },
  acertos: [{
    id: 'historico:61', fonte: 'documento', data: '2026-09-22', maletaId: 12, enviadas: 94, devolvidas: 79,
    pecasVendidas: 15, vendido: 1335, comissao: 333.75, liquido: 1001.25, situacaoFinanceira: 'paga',
    conferidoPor: null, vendaChave: 'bruna follei|2026-09-22', linhasPlanilha: ['1422', '1423'],
    itensVendidos: [{ sku: '429300', desc: 'Colar', qtd: 1, valor: 59.25 }],
    itensDevolvidos: [{ sku: '566355', desc: 'Colar Chave', qtd: 1 }],
  }],
  eventos: [
    { quando: '2026-09-26 14:48', data: '2026-09-26', tipo: 'consignacao', grupo: 'envio', titulo: 'Envio de peças', pecas: 92, maletaId: 16 },
    { quando: '2026-09-22', data: '2026-09-22', tipo: 'acerto_documental', grupo: 'acerto', titulo: 'Acerto (registrado no histórico de vendas)', pecas: 15, valor: 1001.25, maletaId: 12 },
    { quando: '2026-08-20', data: '2026-08-20', tipo: 'cadastro', grupo: 'cadastro', titulo: 'Cadastro no sistema' },
  ],
  limites: ['Quem conferiu cada acerto não é registrado: o sistema ainda não tem usuários (D4).'],
};

function abrir() {
  const fetchFalso = vi.fn(async () => new Response(JSON.stringify(resposta), { status: 200 }));
  vi.stubGlobal('fetch', fetchFalso);
  render(<HistoricoRevendedora conexao={conexao} revendedoraId={4} />);
  return fetchFalso;
}

describe('Histórico da revendedora', () => {
  it('lê a rota real da revendedora', async () => {
    const f = abrir();
    await screen.findByText('Acertos e vendas');
    expect(String(f.mock.calls[0][0])).toBe('http://api.local/api/revendedoras/4/historico');
  });

  it('mostra o acerto e abre as peças vendidas e devolvidas', async () => {
    abrir();
    const tabela = await screen.findByRole('table', { name: 'Acertos' });
    expect(within(tabela).getByText(/Maleta #12/)).toBeTruthy();
    expect(within(tabela).getByText('94 · 79 · 15')).toBeTruthy();
    fireEvent.click(within(tabela).getByRole('button', { name: 'Ver peças' }));
    expect(within(tabela).getByText('Vendidas (1)')).toBeTruthy();
    expect(within(tabela).getByText('Devolvidas (1)')).toBeTruthy();
    expect(within(tabela).getByText(/Linhas da planilha de vendas: 1422, 1423/)).toBeTruthy();
    expect(within(tabela).getByText(/não registrado/)).toBeTruthy();
  });

  it('a linha do tempo filtra por tipo sem perder a ordem', async () => {
    abrir();
    const lista = await screen.findByRole('list', { name: 'Linha do tempo' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Envio e devolução' }));
    const filtrada = screen.getByRole('list', { name: 'Linha do tempo' });
    expect(within(filtrada).getAllByRole('listitem')).toHaveLength(1);
    expect(within(filtrada).getByText(/Envio de peças/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }));
    const itens = within(screen.getByRole('list', { name: 'Linha do tempo' })).getAllByRole('listitem');
    expect(itens[0].textContent).toMatch(/Envio/);
    expect(itens[2].textContent).toMatch(/Cadastro/);
  });

  it('diz o que o sistema não sabe', async () => {
    abrir();
    expect(await screen.findByText(/não tem usuários/)).toBeTruthy();
  });
});
