// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App';

afterEach(cleanup);

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
