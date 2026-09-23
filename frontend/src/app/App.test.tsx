// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { App } from './App';
import { emCasa, estadoDeTeste, maleta, revendedora } from '../testing/fixtures';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* O endereço agora é estado do app, e o jsdom o carrega de um teste para o
   outro. Zerar aqui é o equivalente a abrir uma aba nova. */
beforeEach(() => {
  history.replaceState(null, '', '/');
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

const railDe = () => screen.getByRole('navigation', { name: 'Módulos do sistema' });
/* Sempre pelo trilho: no telefone os mesmos destinos existem também na
   barra inferior, e uma busca global acharia os dois. */
const irNoTrilho = (nome: RegExp) =>
  fireEvent.click(within(railDe()).getByRole('button', { name: nome }));

/** A arquitetura de navegação V2: treze módulos, quatro grupos, um casco.
 *
 *  A versão anterior provava o contrário — que só quatro áreas apareciam e
 *  que "Nuvemshop" não podia ser destino de primeiro nível. Essa regra foi
 *  substituída pelo desenho V2, onde o produto inteiro é visível no trilho
 *  e o que ainda não migrou aparece marcado em vez de escondido. Este
 *  arquivo prova a regra NOVA; a antiga não vale mais. */
describe('navegação principal', () => {
  beforeEach(() => {
    localStorage.setItem(
      'marquesa_conexao_v1',
      JSON.stringify({ url: 'http://localhost:8787', key: 'chave-de-teste' }),
    );
  });

  it('mostra os treze módulos, nos quatro grupos da V2', () => {
    render(<App />);
    const rotulos = [...railDe().querySelectorAll('.mq-rail__item')].map((b) =>
      (b.querySelector('span')?.textContent ?? '').trim());
    expect(rotulos).toEqual([
      'Home', 'Vendas', 'Clientes', 'Financeiro',
      'Estoque', 'Catálogo', 'Etiquetas', 'Nuvemshop',
      'Revendedoras', 'Garantias e reparos',
      'Agenda', 'Notificações', 'Configurações',
    ]);
    const grupos = [...railDe().querySelectorAll('.mq-rail__group')].map((g) => g.textContent);
    expect(grupos).toEqual(['Operação', 'Produto', 'Rede', 'Sistema']);
  });

  it('existe UM casco, e nenhuma tela desenha outro cabeçalho', () => {
    render(<App />);
    expect(document.querySelectorAll('.mq-topbar')).toHaveLength(1);
    expect(document.querySelectorAll('.mq-rail')).toHaveLength(1);
    expect(screen.getAllByRole('navigation', { name: 'Módulos do sistema' })).toHaveLength(1);
  });

  it('a barra superior diz sempre ONDE ESTOU', () => {
    render(<App />);
    const onde = document.querySelector('.mq-topbar__where');
    expect(onde?.textContent).toContain('Home');
    expect(onde?.textContent).toContain('Operação');

    irNoTrilho(/Revendedoras/);
    expect(document.querySelector('.mq-topbar__where')?.textContent).toContain('Rede');
  });

  it('módulo ainda não migrado aparece marcado, não escondido', () => {
    render(<App />);
    const agenda = [...railDe().querySelectorAll('.mq-rail__item')]
      .find((b) => b.textContent?.includes('Agenda'));
    expect(agenda?.className).toContain('mq-rail__item--pendente');

    fireEvent.click(agenda as HTMLElement);
    expect(screen.getByRole('heading', { level: 1 }).textContent)
      .toBe('O que vence, acerta ou fecha nos próximos dias?');
    expect(screen.getByText('Em desenvolvimento')).toBeTruthy();
  });

  /* O endereço é o estado: recarregar volta para a mesma tela, e o voltar
     do navegador desfaz a navegação em vez de sair do app. */
  it('a tela vive na URL', () => {
    render(<App />);
    expect(location.hash).toBe('#/home');
    irNoTrilho(/Financeiro/);
    expect(location.hash.startsWith('#/financeiro')).toBe(true);
  });

  it('reserva o cabeçalho para busca e perfil sem fingir autenticação', () => {
    render(<App />);
    expect(screen.getByRole('combobox', {
      name: 'Buscar cliente, peça, venda ou revendedora',
    })).toBeTruthy();
    /* O avatar do protótipo, com as iniciais. Sem `config.operadorNome`
       gravado ele mostra a MARCA — "MQ" — e o rótulo diz que ninguém foi
       identificado. Um avatar com nome de gente aqui seria inventar um
       usuário que o servidor não tem. */
    const avatar = screen.getByLabelText('Perfil — ninguém identificado');
    expect(avatar.textContent).toBe('MQ');
  });

  it('o avatar guarda o Desconectar, e diz que não há perfis por pessoa', async () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('Perfil — ninguém identificado'));
    expect(screen.getByRole('menuitem', { name: /Configurações/ })).toBeTruthy();
    expect(screen.getByText(/a autenticação é uma chave só/i)).toBeTruthy();
  });

  it('Estoque → Estoque Total continua acessível', async () => {
    render(<App />);

    irNoTrilho(/^Estoque$/);
    const subAbas = screen.getByRole('tablist', { name: 'Estoque' });
    expect(subAbas.querySelector('.pill')).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Estoque Total' }));
    expect(await screen.findByText(/Atualizar Estoque Total/)).toBeTruthy();
  });

  /** Duas PORTAS para a mesma tela, e elas não podem discordar sobre onde
   *  se está: pelo trilho ou pela aba, o resultado é o mesmo lugar. */
  it('Nuvemshop acende no trilho quando aberta pela aba de Estoque', () => {
    comEstado();
    render(<App />);
    irNoTrilho(/^Estoque$/);
    fireEvent.click(screen.getByRole('tab', { name: 'Nuvemshop' }));

    const nuvem = [...railDe().querySelectorAll('.mq-rail__item')]
      .find((b) => b.textContent?.includes('Nuvemshop'));
    expect(nuvem?.getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('.mq-topbar__where')?.textContent).toContain('Nuvemshop');
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
    irNoTrilho(/^Estoque$/);

    const abas = screen.getByRole('tablist', { name: 'Estoque' });
    const rotulos = [...abas.querySelectorAll('[role="tab"]')].map((b) => b.textContent);
    expect(rotulos).toEqual(['Estoque Total', 'Peças', 'Inventário', 'Saiu sem faturar', 'Nuvemshop', 'Pendências']);
    expect(within(abas).getByRole('tab', { name: 'Estoque Total' })).toHaveProperty(
      'ariaPressed',
      'true',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Estoque Total' })).toBeTruthy();
  });

  it('o dashboard do Estoque Total carrega em cima das ações', async () => {
    render(<App />);
    irNoTrilho(/^Estoque$/);

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
    irNoTrilho(/Revendedoras/);

    expect(await screen.findByRole('heading', { level: 1, name: 'Visão Geral' })).toBeTruthy();
    const abas = screen.getByRole('tablist', { name: 'Revendedoras' });
    expect(within(abas).getByRole('tab', { name: 'Visão Geral' })).toHaveProperty(
      'ariaPressed',
      'true',
    );
  });

  it('"Ver planejamento" no Estoque Total leva para Revendedoras › Visão Geral', async () => {
    render(<App />);
    irNoTrilho(/^Estoque$/);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver planejamento' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Visão Geral' })).toBeTruthy();
  });

  /* A aba da revendedora era um `useState` no App: recarregar em cima da
     ficha de alguém devolvia a Visão Geral, o voltar do navegador saía do
     módulo inteiro, e não havia link para mandar. */
  it('a ficha da revendedora sobrevive ao recarregar e ao voltar', async () => {
    render(<App />);
    irNoTrilho(/Revendedoras/);

    const abas = await screen.findByRole('tablist', { name: 'Revendedoras' });
    fireEvent.click(within(abas).getByRole('tab', { name: /Andreia/ }));
    expect(location.hash).toBe('#/revendedoras/1');

    /* Recarregar = montar do zero com o mesmo endereço. */
    cleanup();
    render(<App />);
    const depois = await screen.findByRole('tablist', { name: 'Revendedoras' });
    expect(within(depois).getByRole('tab', { name: /Andreia/ }))
      .toHaveProperty('ariaPressed', 'true');
  });

  /* Um endereço apontando para alguém que não existe mais não pode virar
     tela vazia: ele volta para a Visão Geral. */
  it('ficha de revendedora inexistente cai na Visão Geral', async () => {
    history.replaceState(null, '', '#/revendedoras/9999');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Visão Geral' })).toBeTruthy();
  });
});
