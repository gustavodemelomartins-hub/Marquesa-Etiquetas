// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { GaleriaDaPeca } from './GaleriaDaPeca';
import { mover } from './api';

const conexao = { url: 'http://api.test', key: 'k' };

const foto = (id: string, ordem: number, extra: Record<string, unknown> = {}) => ({
  id, sku: 'COLAR1', ordem, principal: false, origem: 'nuvemshop', arquivo: null, estado: 'publicada',
  temMiniatura: true, urlExterna: `https://acdn.nuvemshop.com.br/${id}.jpg`, imagemIdLoja: `L${id}`,
  produtoIdLoja: '200', varianteIdLoja: null, posicaoLoja: ordem + 1, variacao: null,
  arquivoR2: `produtos/COLAR1/${id}/original`, tipo: 'image/jpeg', tamanho: 120000, largura: 1024, altura: 1024,
  erro: null, criadoEm: '2026-09-29 12:00:00',
  urlGrande: `/api/galeria/${id}/original?exp=1&sig=a`, urlMiniatura: `/api/galeria/${id}/miniatura?exp=1&sig=a`,
  ...extra,
});

let fotos: ReturnType<typeof foto>[];
let chamadas: { metodo: string; url: string; corpo: unknown }[];
let respostaLoja: Record<string, unknown>;

function servidor() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const metodo = (init.method || 'GET').toUpperCase();
    const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null;
    chamadas.push({ metodo, url, corpo });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/galeria') && metodo === 'GET') {
      return json({ ok: true, sku: 'COLAR1', total: fotos.length, principal: fotos.find((f) => f.principal) ?? null, fotos, removidas: 0 });
    }
    if (url.endsWith('/galeria/principal')) {
      const id = (corpo as { fotoId: string }).fotoId;
      fotos = [...fotos.filter((f) => f.id === id), ...fotos.filter((f) => f.id !== id)]
        .map((f, i) => ({ ...f, ordem: i, principal: f.id === id }));
      return json({ ok: true });
    }
    if (url.endsWith('/galeria/ordem')) {
      const ordem = (corpo as { ordem: string[] }).ordem;
      fotos = ordem.map((id, i) => ({ ...fotos.find((f) => f.id === id)!, ordem: i }));
      return json({ ok: true, ordem });
    }
    if (metodo === 'DELETE') {
      const id = url.split('/').pop()!;
      fotos = fotos.filter((f) => f.id !== id);
      return json({ ok: true, detalhe: 'A cópia foi apagada daqui.' });
    }
    if (url.endsWith('/galeria') && metodo === 'POST') {
      const novo = `u${fotos.length + 1}`;
      fotos = [...fotos, foto(novo, fotos.length, { origem: 'upload' })];
      return json({ ok: true, fotoId: novo }, 201);
    }
    if (url.endsWith('/miniatura')) return json({ ok: true });
    if (url.endsWith('/importar-da-loja')) return json(respostaLoja);
    return json({ ok: false, erro: 'rota inesperada' }, 404);
  }));
}

beforeEach(() => {
  chamadas = [];
  fotos = [foto('a', 0, { principal: true }), foto('b', 1), foto('c', 2, { variacao: '16', varianteIdLoja: '3100' })];
  respostaLoja = { ok: true, encontrado: false, anuncios: [], fotos: [], revisar: [], avisos: [], detalhe: 'Não encontrei o código COLAR1 na loja online.' };
  servidor();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const tira = () => screen.getByRole('list', { name: 'Ordem das fotos' });
const miniaturas = () => within(tira()).getAllByRole('button');
const nth = (i: number) => miniaturas()[i]!;

describe('galeria da peça', () => {
  it('mostra TODAS as fotos, com a principal marcada e o endereço completo da API', async () => {
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={() => {}} />);
    await waitFor(() => expect(miniaturas()).toHaveLength(3));
    expect(nth(0).getAttribute('aria-label')).toBe('Foto 1, principal');
    const img = nth(0).querySelector('img')!;
    expect(img.getAttribute('src')).toBe('http://api.test/api/galeria/a/miniatura?exp=1&sig=a');
    expect(screen.getByText(/3 fotos · 3 da loja online/)).toBeTruthy();
  });

  it('definir como principal grava e relê do servidor', async () => {
    const aoMudar = vi.fn();
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={aoMudar} />);
    await waitFor(() => expect(miniaturas()).toHaveLength(3));
    fireEvent.click(nth(1));
    fireEvent.click(screen.getByRole('button', { name: /Definir como principal/ }));
    await waitFor(() => expect(nth(0).getAttribute('aria-label')).toBe('Foto 1, principal'));
    expect(chamadas.find((c) => c.url.endsWith('/principal'))?.corpo).toEqual({ fotoId: 'b' });
    await waitFor(() => expect(within(tira()).getAllByRole("button")[0]!.querySelector('img')!.getAttribute('src')).toContain('/b/'));
    expect(aoMudar).toHaveBeenCalled();
  });

  it('avisa o topo da ficha a cada leitura — a principal nova e a contagem, sem esperar o estado geral', async () => {
    const aoLer = vi.fn();
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={() => {}} aoLer={aoLer} />);
    await waitFor(() => expect(aoLer).toHaveBeenCalled());
    expect(aoLer.mock.lastCall![0].fotos).toHaveLength(3);
    fireEvent.click(nth(1));
    fireEvent.click(screen.getByRole('button', { name: /Definir como principal/ }));
    await waitFor(() => expect(aoLer.mock.lastCall![0].fotos.find((f: { principal: boolean }) => f.principal).id).toBe('b'));
  });

  it('os botões de ordem (o jeito do celular) movem e persistem', async () => {
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={() => {}} />);
    await waitFor(() => expect(miniaturas()).toHaveLength(3));
    fireEvent.click(nth(2));
    fireEvent.click(screen.getByRole('button', { name: 'Para o início' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/ordem'))).toBe(true));
    expect(chamadas.find((c) => c.url.endsWith('/ordem'))?.corpo).toEqual({ ordem: ['c', 'a', 'b'] });
    await waitFor(() => expect(nth(0).querySelector('img')!.getAttribute('src')).toContain('/c/'));
    /* a principal continua a mesma */
    expect(nth(1).getAttribute('aria-label')).toBe('Foto 2, principal');
  });

  it('remover pede confirmação e explica o que acontece na loja', async () => {
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={() => {}} />);
    await waitFor(() => expect(miniaturas()).toHaveLength(3));
    fireEvent.click(nth(1));
    fireEvent.click(screen.getByRole('button', { name: /Remover/ }));
    expect(screen.getByText(/Na loja online nada muda/)).toBeTruthy();
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' }).at(-1)!);
    await waitFor(() => expect(miniaturas()).toHaveLength(2));
    expect(chamadas.find((c) => c.metodo === 'DELETE')?.url).toBe('http://api.test/api/galeria/b');
  });

  it('adicionar várias fotos de uma vez manda cada uma e diz quantas entraram', async () => {
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={() => {}} />);
    await waitFor(() => expect(miniaturas()).toHaveLength(3));
    const entrada = screen.getByLabelText('Escolher fotos para COLAR1') as HTMLInputElement;
    const arquivos = [new File(['x'], 'frente.jpg', { type: 'image/jpeg' }), new File(['y'], 'lado.jpg', { type: 'image/jpeg' })];
    fireEvent.change(entrada, { target: { files: arquivos } });
    await waitFor(() => expect(screen.getByText('2 fotos adicionadas no fim da galeria.')).toBeTruthy());
    const posts = chamadas.filter((c) => c.metodo === 'POST' && c.url.endsWith('/galeria'));
    expect(posts).toHaveLength(2);
    await waitFor(() => expect(miniaturas()).toHaveLength(5));
  });

  it('filtra por variação quando alguma foto é de uma variação', async () => {
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={() => {}} />);
    await waitFor(() => expect(miniaturas()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: '16 (1)' }));
    expect(miniaturas()).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Para o início' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('buscar na loja: mostra a prévia antes, e importa só com o segundo toque', async () => {
    respostaLoja = {
      ok: true, encontrado: true, seco: true,
      anuncios: [{ id: '200', nome: 'Colar três fotos', fotos: 4, url: null }],
      fotos: [{ imagemId: '9', produtoId: '200', url: 'https://acdn.nuvemshop.com.br/n-1024-1024.jpg', posicao: 4, sku: 'COLAR1', via: 'sku', varianteId: null, variacao: null, situacao: 'nova' }],
      revisar: [], avisos: [], resumo: { novas: 1, jaImportadas: 3, removidas: 0, paraRevisar: 0 },
    };
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={() => {}} />);
    await waitFor(() => expect(miniaturas()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: /Buscar fotos na loja online/ }));
    expect(await screen.findByText(/1 foto nova para trazer/)).toBeTruthy();
    expect(screen.getByText(/3 já estão na galeria/)).toBeTruthy();
    expect(chamadas.filter((c) => c.url.endsWith('/importar-da-loja')).map((c) => c.corpo)).toEqual([{ seco: true, ignorar: [] }]);

    respostaLoja = { ...respostaLoja, seco: false, importacao: { ok: true, importadas: 1, jaExistiam: 0, duplicadas: 0, falharam: 0, falhas: [], restantes: 0, total: 1 } };
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 foto' }));
    expect(await screen.findByText(/1 foto importada da loja online/)).toBeTruthy();
    expect(chamadas.filter((c) => c.url.endsWith('/importar-da-loja')).at(-1)?.corpo).toEqual({ seco: false, ignorar: [] });
  });

  it('peça sem foto: convida a importar ou adicionar, sem imagem quebrada', async () => {
    fotos = [];
    render(<GaleriaDaPeca conexao={conexao} sku="COLAR1" desc="Colar" aoMudar={() => {}} />);
    expect(await screen.findByText('Esta peça ainda não tem foto')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Buscar fotos na loja online/ }));
    expect(await screen.findByText('Não encontrei o código COLAR1 na loja online.')).toBeTruthy();
  });
});

describe('mover', () => {
  it('leva o item para a posição pedida e mantém a ordem relativa do resto', () => {
    expect(mover(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(mover(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(mover(['a', 'b'], 1, 9)).toEqual(['a', 'b'].slice(0, 1).concat('b'));
    const igual = ['a'];
    expect(mover(igual, 0, 0)).toBe(igual);
  });
});
