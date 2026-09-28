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
  codigosComerciais: [
    { sku: '326660', desc: 'Colar Casal Banho de Ouro 18k', preco: 129, status: 'ativo', modelo: null },
    { sku: '364945', desc: 'Colar Filhas Duas Meninas Banho de Ouro 18k', preco: 129, status: 'ativo', modelo: null },
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
  it('combinação sem modelo: sugere o código do catálogo, cadastra e vai para a venda', async () => {
    modelos = [];
    const aoAdicionar = vi.fn();
    render(<MonteSeuColar conexao={conexao} aoAdicionar={aoAdicionar} aoCancelar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mais Menino Azul' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mais Menina Rosa Claro' }));

    /* Pingente sem estoque não soma. */
    expect((screen.getByRole('button', { name: 'Mais Menino Verde' }) as HTMLButtonElement).disabled).toBe(true);

    expect(await screen.findByText(/ainda não tem modelo/)).toBeTruthy();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('326660');
    expect((screen.getByLabelText('Preço do colar') as HTMLInputElement).value).toBe('129');

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e adicionar à venda' }));
    await waitFor(() => expect(aoAdicionar).toHaveBeenCalledTimes(1));
    expect(posts[0]).toEqual({
      caminho: '/api/personalizacao/modelos/na-venda',
      corpo: { nome: 'Colar Casal Banho de Ouro 18k', preco: 129, contagem: { Menino: 1, Menina: 1 }, skuComercial: '326660' },
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

  it('código novo: pede para gerar, com o nome sugerido', async () => {
    modelos = [];
    render(<MonteSeuColar conexao={conexao} aoAdicionar={() => {}} aoCancelar={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mais Menino Azul' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mais Menino Azul' }));
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'novo' } });
    expect((screen.getByDisplayValue('Colar Filhos Dois Meninos Banho de Ouro 18k'))).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Preço do colar'), { target: { value: '149' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e adicionar à venda' }));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0]?.corpo).toEqual({
      nome: 'Colar Filhos Dois Meninos Banho de Ouro 18k', preco: 149, contagem: { Menino: 2, Menina: 0 }, gerarCodigo: true,
    });
  });
});
