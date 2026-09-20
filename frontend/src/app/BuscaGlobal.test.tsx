// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuscaGlobal } from './BuscaGlobal';
import type { AppState } from '../types/api';

const conexao = { url: 'https://api.exemplo', key: 'chave-de-teste' };

/** O mínimo de `GET /api/state` que a busca local lê. O resto do estado não
 *  participa — e inventá-lo aqui só faria o teste quebrar quando um campo
 *  que ele não usa mudar de nome. */
const estado = {
  produtos: [
    {
      sku: '214299', desc: 'Pingente Filho Verde', cat: 'Pingente',
      preco: 89, semPreco: false, qtd: 4, consignado: 1, disponivel: 3,
      status: 'ativo', visivel: true,
    },
  ],
  revendedoras: [
    { id: 9, nome: 'Vitória Campos', tel: '14999990000', cidade: 'Bauru', cpf: '', endereco: '', obs: '', status: 'ativa', criadaEm: '2026-01-01' },
  ],
} as unknown as AppState;

function respostaDe(corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/** Responde cada rota pelo que ela É, e não pela ordem da chamada: as duas
 *  buscas saem em paralelo, e amarrar o teste à ordem o faria falhar por um
 *  motivo que não é o comportamento testado. */
function fetchDe({ clientes = [], vendas = [] }: { clientes?: unknown[]; vendas?: unknown[] }) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('/api/clientes')) return respostaDe(clientes);
    if (String(url).includes('/api/vendas/lista')) return respostaDe({ itens: vendas });
    return respostaDe({});
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CAMPO = 'Buscar cliente, peça, venda ou revendedora';

describe('busca global', () => {
  it('acha cliente, venda, peça e revendedora, e navega DENTRO da V2', async () => {
    vi.stubGlobal('fetch', fetchDe({
      clientes: [{ id: 42, nome: 'Vitória Nunes', tel: '14999990000', cidade: 'Bauru' }],
      vendas: [{
        fonte: 'operacional', id: 'v:1058', venda_id: 1058, referencia: '1058',
        data: '2026-09-05', cliente: 'Vitória Nunes', cliente_norm: 'vitoria nunes',
        sku: '214299', produto: 'Pingente', qtd: 1, valor: 89, venda_valor: 89,
        pago: 0, cancelada: 0,
      }],
    }));

    const aoNavegar = vi.fn();
    render(<BuscaGlobal conexao={conexao} estado={estado} aoNavegar={aoNavegar} />);
    fireEvent.change(screen.getByRole('combobox', { name: CAMPO }), { target: { value: 'vitoria' } });

    /* Cliente e revendedora casam pelo nome; a venda, pela busca do servidor. */
    const cliente = await screen.findByRole('option', { name: /Cliente · Bauru/ });
    await screen.findByRole('option', { name: /Revendedora/ });
    await screen.findByRole('option', { name: /Venda/ });

    /* NADA é link: um `href` para dashboard.html tiraria a usuária da V2, e
       era exatamente isso que a busca fazia antes. */
    for (const o of screen.getAllByRole('option')) {
      expect(o.tagName).toBe('BUTTON');
      expect(o.getAttribute('href')).toBeNull();
    }

    fireEvent.click(cliente);
    expect(aoNavegar).toHaveBeenCalledWith({ modulo: 'clientes', sub: '42' });
  });

  it('acha a peça pelo SKU sem pedir nada ao servidor além das duas buscas', async () => {
    const fetchMock = fetchDe({});
    vi.stubGlobal('fetch', fetchMock);

    const aoNavegar = vi.fn();
    render(<BuscaGlobal conexao={conexao} estado={estado} aoNavegar={aoNavegar} />);
    fireEvent.change(screen.getByRole('combobox', { name: CAMPO }), { target: { value: '214299' } });

    const peca = await screen.findByRole('option', { name: /Pingente Filho Verde/ });
    fireEvent.click(peca);
    expect(aoNavegar).toHaveBeenCalledWith({ modulo: 'estoque', sub: 'pecas' });
  });

  it('não consulta antes de dois caracteres e anda pelo teclado', async () => {
    vi.stubGlobal('fetch', fetchDe({
      clientes: [{ id: 7, nome: 'Ana Lima', tel: '', cidade: '' }],
    }));

    render(<BuscaGlobal conexao={conexao} estado={null} aoNavegar={vi.fn()} />);
    const campo = screen.getByRole('combobox', { name: CAMPO });
    fireEvent.change(campo, { target: { value: 'a' } });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: 'an' } });
    const achado = await screen.findByRole('option', { name: /Ana Lima/ });
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    await waitFor(() => expect(achado.getAttribute('aria-selected')).toBe('true'));
  });

  it('diz o que ela NÃO alcança em vez de deixar procurar em silêncio', async () => {
    vi.stubGlobal('fetch', fetchDe({
      clientes: [{ id: 7, nome: 'Ana Lima', tel: '', cidade: '' }],
    }));

    render(<BuscaGlobal conexao={conexao} estado={null} aoNavegar={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: CAMPO }), { target: { value: 'ana' } });

    await screen.findByRole('option', { name: /Ana Lima/ });
    expect(screen.getByText(/Garantia, maleta, inventário e conta a receber/)).toBeTruthy();
  });
});
