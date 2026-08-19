// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { App } from './App';
import { emCasa, estadoDeTeste, maleta, revendedora } from '../testing/fixtures';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** `GET /api/state` sobe até o App agora. Um `fetch` que nunca responde
 *  deixaria as telas em "carregando" para sempre — este devolve um estado
 *  pequeno e real, no formato de `api/src/state.js`. */
function comEstado() {
  const corpo = estadoDeTeste({
    produtos: [emCasa('C1', 20, { cat: 'Colar', preco: 150 })],
    revendedoras: [revendedora({ id: 1, nome: 'Andreia Souza' })],
    maletas: [maleta({ id: 3, revId: 1, acertoEm: '2026-09-01', itens: { C1: 2 }, precos: { C1: 150 } })],
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
  );
}

/** Prova a arquitetura de navegação: só as quatro áreas que a usuária
 *  pensa no negócio aparecem como abas principais — os nomes internos de
 *  engenharia (Nuvemshop, Reconciliação, Estoque Total, uma revendedora
 *  específica) não competem com elas. */
describe('navegação principal', () => {
  beforeEach(() => {
    localStorage.setItem(
      'marquesa_conexao_v1',
      JSON.stringify({ url: 'http://localhost:8787', key: 'chave-de-teste' }),
    );
  });

  it('mostra só as quatro áreas: Etiqueta, Estoque, Revendedoras, Vendas', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Áreas principais' });
    const abas = nav.querySelectorAll('.nav-item');
    const rotulos = [...abas].map((b) => b.textContent);
    expect(rotulos).toEqual(['Etiqueta', 'Estoque', 'Revendedoras', 'Vendas']);
  });

  it('não usa termos internos como aba principal', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Áreas principais' });
    const texto = nav.textContent ?? '';
    for (const termo of ['Nuvemshop', 'Reconciliação', 'Estoque Total']) {
      expect(texto).not.toContain(termo);
    }
  });

  it('Estoque → Estoque Total continua acessível', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Estoque' }));
    const subAbas = screen.getByRole('tablist', { name: 'Estoque' });
    const rotuloEstoqueTotal = subAbas.querySelector('.pill');
    expect(rotuloEstoqueTotal).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Estoque Total' }));
    expect(await screen.findByText(/Atualizar Estoque Total/)).toBeTruthy();
  });
});

describe('cada área abre na tela certa', () => {
  beforeEach(() => {
    localStorage.setItem(
      'marquesa_conexao_v1',
      JSON.stringify({ url: 'http://localhost:8787', key: 'chave-de-teste' }),
    );
    localStorage.removeItem('marquesa_planejamento_v1');
    comEstado();
  });

  it('Estoque abre direto em Estoque Total — Visão Geral não é mais subaba', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Estoque' }));

    const abas = screen.getByRole('tablist', { name: 'Estoque' });
    const rotulos = [...abas.querySelectorAll('[role="tab"]')].map((b) => b.textContent);
    expect(rotulos).toEqual(['Estoque Total', 'Nuvemshop', 'Pendências']);
    expect(within(abas).getByRole('tab', { name: 'Estoque Total' })).toHaveProperty(
      'ariaPressed',
      'true',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Estoque Total' })).toBeTruthy();
  });

  it('o dashboard do Estoque Total carrega em cima das ações', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Estoque' }));

    const kpis = await screen.findByText('Disponível para Nuvemshop');
    expect(kpis).toBeTruthy();
    const rotulos = [...document.querySelectorAll('.kpis .k-lbl')].map((e) => e.textContent);
    expect(rotulos).toEqual([
      'Estoque total',
      'Em casa',
      'Com revendedoras',
      'Disponível para Nuvemshop',
    ]);
    expect(screen.getByRole('heading', { name: 'Por categoria' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Potencial para consignação' })).toBeTruthy();
    /* E as ações continuam logo abaixo, intactas. */
    expect(screen.getByRole('button', { name: /Atualizar Estoque Total/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Adicionar Peças Novas/ })).toBeTruthy();
  });

  it('Revendedoras abre na Visão Geral', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Revendedoras' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Visão Geral' })).toBeTruthy();
    const abas = screen.getByRole('tablist', { name: 'Revendedoras' });
    expect(within(abas).getByRole('tab', { name: 'Visão Geral' })).toHaveProperty(
      'ariaPressed',
      'true',
    );
  });

  it('"Ver planejamento" no Estoque Total leva para Revendedoras › Visão Geral', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Estoque' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Ver planejamento' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Visão Geral' })).toBeTruthy();
  });
});
