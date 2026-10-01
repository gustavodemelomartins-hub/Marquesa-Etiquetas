// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonteSeuColar, nomeSugerido } from './MonteSeuColar';
import type { Connection } from '../../services/client';
import type { ModeloDeColar } from './colar';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

const CARDAPIO = {
  ok: true,
  base: { sku: '444032', desc: 'Colar Veneziana 45cm + extensor', preco: 74, disponivel: 10 },
  grupos: [
    { grupo: 'Menino', itens: [
      { sku: '251551', rotulo: 'Menino Azul', desc: 'Colar Menino Azul', preco: 119, disponivel: 2, indisponivel: null },
      { sku: '329494', rotulo: 'Menino Verde', desc: 'Colar Menino Verde', preco: 119, disponivel: 0, indisponivel: 'sem peça em estoque' },
    ] },
    { grupo: 'Menina', itens: [
      { sku: '263236', rotulo: 'Menina Rosa Claro', desc: 'Pingente Menina Rosa', preco: 119, disponivel: 5, indisponivel: null },
    ] },
  ],
  configuracoes: [
    { sku: '326660', nome: 'Colar Casal', preco: 129, slots: [{ grupo: 'Menino', qtd: 1 }, { grupo: 'Menina', qtd: 1 }], noCatalogo: true, modelo: null },
    { sku: '311066', nome: 'Colar Filhos Dois Meninos', preco: 129, slots: [{ grupo: 'Menino', qtd: 2 }], noCatalogo: false, modelo: null },
    { sku: '314161', nome: 'Colar Filhos Dois Meninos e Uma Menina', preco: 159, slots: [{ grupo: 'Menino', qtd: 2 }, { grupo: 'Menina', qtd: 1 }], noCatalogo: true, modelo: null },
  ],
  codigosComerciais: [
    { sku: '366066', desc: 'Colar Filhos Três Meninos Banho de Ouro 18k', preco: 159, status: 'ativo', modelo: null },
  ],
  regra: '',
};

function modeloCasal(): ModeloDeColar {
  const opcao = (id: number, sku: string, rotulo: string, grupo: string) => ({
    id, componenteSku: sku, componenteNome: rotulo, variacao: null, varianteId: null, rotulo, grupo,
    preco: 119, disponivel: 5, indisponivel: null,
  });
  return {
    id: 7, slug: 'casal', nome: 'Colar Casal Banho de Ouro 18k', skuComercial: '326660',
    slotsMin: 2, slotsMax: 2, slotTipos: ['Menino', 'Menina'],
    slots: [{ grupo: 'Menino', qtd: 1 }, { grupo: 'Menina', qtd: 1 }],
    composicaoLivre: false, baseSkuPadrao: '444032', baseNome: 'Veneziana', baseDisponivel: 10,
    disponivel: 2, precoSugerido: 129, ativo: true, obs: null,
    opcoes: [opcao(1, '251551', 'Menino Azul', 'Menino'), opcao(2, '263236', 'Menina Rosa Claro', 'Menina')],
  };
}

let modelos: ModeloDeColar[] = [];
let posts: { caminho: string; corpo: unknown }[] = [];

beforeEach(() => {
  posts = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
    const caminho = url.replace(conexao.url, '');
    const json = (d: unknown) => Promise.resolve(new Response(JSON.stringify(d), { status: 200 }));
    if (caminho === '/api/personalizacao/componentes') return json(CARDAPIO);
    if (caminho === '/api/personalizacao/modelos') return json({ ok: true, modelos, regra: '' });
    posts.push({ caminho, corpo: JSON.parse(String(init.body)) });
    const m = modeloCasal();
    modelos = [m];
    return json({ ok: true, modelo: m, criado: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('o nome sugerido segue o padrão do catálogo', () => {
  it.each([
    [{ Menino: 1, Menina: 1 }, 'Colar Casal Banho de Ouro 18k'],
    [{ Menina: 2 }, 'Colar Filhas Duas Meninas Banho de Ouro 18k'],
    [{ Menino: 3 }, 'Colar Filhos Três Meninos Banho de Ouro 18k'],
    [{ Menino: 2, Menina: 1 }, 'Colar Filhos Dois Meninos e Uma Menina Banho de Ouro 18k'],
    [{ Menino: 1, Menina: 2 }, 'Colar Filhos Duas Meninas e Um Menino Banho de Ouro 18k'],
    [{ Menina: 1 }, 'Colar Menina Banho de Ouro 18k'],
  ])('%j → %s', (contagem, nome) => {
    expect(nomeSugerido(contagem)).toBe(nome);
  });
});

describe('Monte seu Colar: o modelo nasce na venda', () => {
  it('combinação oficial sem modelo: código e preço fixos, cadastra e vai para a venda', async () => {
    modelos = [];
    const aoAdicionar = vi.fn();
    render(<MonteSeuColar conexao={conexao} aoAdicionar={aoAdicionar} aoCancelar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mais Menino Azul' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mais Menina Rosa Claro' }));

    /* Pingente sem estoque não soma. */
    expect((screen.getByRole('button', { name: 'Mais Menino Verde' }) as HTMLButtonElement).disabled).toBe(true);

    expect(await screen.findByText(/Código e preço fixos/)).toBeTruthy();
    expect(screen.getByText('Colar Casal · 326660')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Adicionar à venda · R\$\s?129,00/ }));
    await waitFor(() => expect(aoAdicionar).toHaveBeenCalledTimes(1));
    expect(posts[0]).toEqual({
      caminho: '/api/personalizacao/modelos/na-venda',
      corpo: { nome: 'Colar Casal', preco: 129, contagem: { Menino: 1, Menina: 1 }, skuComercial: '326660' },
    });
    const composicao = aoAdicionar.mock.calls[0]?.[0];
    expect(composicao.skuComercial).toBe('326660');
    expect(composicao.preco).toBe(129);
    expect(composicao.componentes.map((c: { componenteSku: string }) => c.componenteSku)).toEqual(['251551', '263236']);
  });

  it('combinação que já tem modelo: mostra o modelo e adiciona direto', async () => {
    modelos = [modeloCasal()];
    const aoAdicionar = vi.fn();
    render(<MonteSeuColar conexao={conexao} aoAdicionar={aoAdicionar} aoCancelar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mais Menino Azul' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mais Menina Rosa Claro' }));
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar à venda · R\$\s?129/ }));
    expect(aoAdicionar).toHaveBeenCalledTimes(1);
    expect(posts).toEqual([]);
  });

  it('dois meninos é o 311066 a R$ 129 — nunca o 314161 de três pingentes', async () => {
    modelos = [];
    render(<MonteSeuColar conexao={conexao} aoAdicionar={() => {}} aoCancelar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mais Menino Azul' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mais Menino Azul' }));
    expect(await screen.findByText('Colar Filhos Dois Meninos · 311066')).toBeTruthy();
    expect(screen.queryByText(/314161/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar à venda · R\$\s?129,00/ }));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0]?.corpo).toEqual({
      nome: 'Colar Filhos Dois Meninos', preco: 129, contagem: { Menino: 2, Menina: 0 }, skuComercial: '311066',
    });
  });

  it('combinação sem configuração oficial: começa em código novo, sem adivinhar pelo nome', async () => {
    modelos = [];
    render(<MonteSeuColar conexao={conexao} aoAdicionar={() => {}} aoCancelar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mais Menino Azul' }));
    expect((await screen.findByRole('combobox') as HTMLSelectElement).value).toBe('novo');
    expect(screen.getByDisplayValue('Colar Menino Banho de Ouro 18k')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Preço do colar'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e adicionar à venda' }));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0]?.corpo).toEqual({
      nome: 'Colar Menino Banho de Ouro 18k', preco: 99, contagem: { Menino: 1, Menina: 0 }, gerarCodigo: true,
    });
  });

  it('o cardápio mostra pingente e SKU, não o nome confuso do catálogo', async () => {
    render(<MonteSeuColar conexao={conexao} aoAdicionar={() => {}} aoCancelar={() => {}} />);
    expect(await screen.findByText('Pingente Menino Azul')).toBeTruthy();
    expect(screen.getByText('SKU 251551')).toBeTruthy();
    expect(screen.queryByText(/Colar Menino Azul ·/)).toBeNull();
  });
});
