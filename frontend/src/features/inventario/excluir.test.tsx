// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../../services/client';

vi.mock('../../components/scanner/leitorDeEtiqueta', () => ({
  temCamera: () => false,
  montarLeitor: async () => async () => null,
  criarBipe: () => () => {},
}));

import { InventarioArea } from './InventarioArea';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** §53 — o servidor marca `excluivel`; a tela só oferece o botão onde ele
 *  aceitaria. #1 (id 8) descartado sem efeito, #2 (id 9) finalizado com ajuste aplicado. */
function servidor() {
  const chamadas: { metodo: string; caminho: string }[] = [];
  let lista = [
    { id: 9, numero: 2, status: 'concluido', iniciadoEm: '2026-10-05 10:00:00', pausadoEm: null, concluidoEm: '2026-10-05 12:00:00',
      divergentes: 2, pecas: 30, naoComparaveis: 0, excluivel: false, alterouEstoque: true },
    { id: 8, numero: 1, status: 'cancelado', iniciadoEm: '2026-10-04 21:58:46', pausadoEm: null, concluidoEm: '2026-10-04 22:05:31',
      divergentes: 0, pecas: 15, naoComparaveis: 0, excluivel: true, alterouEstoque: false },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const caminho = String(url).replace('http://api.local', '').split('?')[0] ?? '';
    chamadas.push({ metodo, caminho });
    const json = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (caminho === '/api/inventarios' && metodo === 'GET') return json(lista);
    if (caminho === '/api/inventarios/8' && metodo === 'DELETE') {
      lista = lista.filter((i) => i.id !== 8);
      return json({ ok: true, id: 8, excluido: true, leituras: 4,
        variacoesMantidas: [{ sku: '256359', variacao: 'Banho de Ouro 18K · nº23' }] });
    }
    return json({ erro: `rota inesperada ${metodo} ${caminho}` }, 404);
  }));
  return chamadas;
}

describe('Excluir inventário', () => {
  it('só o inventário sem efeito no estoque tem "Excluir"; confirmar apaga e avisa', async () => {
    const chamadas = servidor();
    render(<InventarioArea conexao={conexao} estado={null} aoMudarEstoque={() => {}} />);

    await screen.findByText('Inventário #1');
    expect(screen.queryByRole('button', { name: 'Excluir o inventário #2' })).toBeNull();
    expect(screen.getByText(/ajustes aplicados no estoque/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir o inventário #1' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText('Excluir definitivamente o inventário #1?')).toBeTruthy();
    expect(within(dialogo).getByText('Nenhuma movimentação de estoque foi aplicada por este inventário.')).toBeTruthy();
    /* O foco começa em Voltar: Enter sem querer não apaga. */
    expect(document.activeElement?.textContent).toBe('Voltar');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir inventário' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'DELETE' && c.caminho === '/api/inventarios/8')).toBe(true));
    expect(await screen.findByText(/Inventário #1 excluído. Nenhum estoque foi alterado./)).toBeTruthy();
    expect(screen.getByText(/continua no cadastro/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Inventário #1')).toBeNull());
    expect(screen.getByText('Inventário #2')).toBeTruthy();
  });

  it('Voltar não exclui nada', async () => {
    const chamadas = servidor();
    render(<InventarioArea conexao={conexao} estado={null} aoMudarEstoque={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir o inventário #1' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
    expect(screen.getByText('Inventário #1')).toBeTruthy();
  });
});
