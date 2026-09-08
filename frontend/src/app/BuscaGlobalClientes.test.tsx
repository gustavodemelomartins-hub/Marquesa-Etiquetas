// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuscaGlobalClientes } from './BuscaGlobalClientes';

const conexao = { url: 'https://api.exemplo', key: 'chave-de-teste' };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('busca global de clientes', () => {
  it('busca por termo e abre a ficha por id no painel legado', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([{ id: 42, nome: 'Vitória Nunes', tel: '14999990000', cidade: 'Bauru' }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<BuscaGlobalClientes conexao={conexao} />);
    const campo = screen.getByRole('combobox', { name: 'Buscar cliente por nome ou telefone' });
    fireEvent.change(campo, { target: { value: 'vitoria' } });

    const resultado = await screen.findByRole('option', { name: /Vitória Nunes/ });
    expect(resultado.getAttribute('href')).toBe('../../dashboard.html?clienteId=42');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.exemplo/api/clientes?limite=8&busca=vitoria',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('não consulta antes de dois caracteres e permite escolher pelo teclado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify([{ id: 7, nome: 'Ana Lima', tel: '', cidade: '' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })),
    );

    render(<BuscaGlobalClientes conexao={conexao} />);
    const campo = screen.getByRole('combobox', { name: 'Buscar cliente por nome ou telefone' });
    fireEvent.change(campo, { target: { value: 'a' } });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: 'an' } });
    const resultado = await screen.findByRole('option', { name: 'Ana Lima' });
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    await waitFor(() => expect(resultado.getAttribute('aria-selected')).toBe('true'));
  });
});
