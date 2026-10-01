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

/** O menu simplificado de 27/09/2026: oito destinos e Configurações, em
 *  quatro grupos, organizados pelo que a usuária FAZ.
 *
 *  A versão anterior provava treze módulos, três deles levando a telas "Em
 *  desenvolvimento", e Estoque/Catálogo/Nuvemshop se misturando. A
 *  Sthefany achou o sistema confuso, e a auditoria mostrou por quê. Este
 *  arquivo prova a regra NOVA; a antiga não vale mais. */
describe('navegação principal', () => {
  beforeEach(() => {
    localStorage.setItem(
      'marquesa_conexao_v1',
      JSON.stringify({ url: 'http://localhost:8787', key: 'chave-de-teste' }),
    );
  });

  it('mostra os módulos do menu, nos quatro grupos', () => {
    render(<App />);
    const rotulos = [...railDe().querySelectorAll('.mq-rail__item')].map((b) =>
      (b.querySelector('span')?.textContent ?? '').trim());
    expect(rotulos).toEqual([
      'Início', 'Vendas', 'Clientes', 'Financeiro',
      'Peças', 'Loja online',
      'Revendedoras', 'Garantias',
      'Configurações',
    ]);
    const grupos = [...railDe().querySelectorAll('.mq-rail__group')].map((g) => g.textContent);
    expect(grupos).toEqual(['Dia a dia', 'Peças', 'Rede', 'Sistema']);
  });

  it('nenhum item do menu leva a uma tela "Em desenvolvimento"', () => {
    render(<App />);
    expect(railDe().querySelectorAll('.mq-rail__item--pendente')).toHaveLength(0);
    for (const item of [...railDe().querySelectorAll('.mq-rail__item')]) {
      fireEvent.click(item as HTMLElement);
      expect(screen.queryByText('Em desenvolvimento')).toBeNull();
    }
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
    expect(onde?.textContent).toContain('Início');
    expect(onde?.textContent).toContain('Dia a dia');

    irNoTrilho(/Revendedoras/);
    expect(document.querySelector('.mq-topbar__where')?.textContent).toContain('Rede');
  });

  /* Link salvo antes da mudança continua levando ao lugar certo. */
  it('endereços antigos caem na tela que os substituiu', () => {
    history.replaceState(null, '', '#/catalogo');
    render(<App />);
    expect(location.hash).toBe('#/estoque');
    cleanup();

    history.replaceState(null, '', '#/notificacoes');
    render(<App />);
    expect(location.hash).toBe('#/home/pendencias');
    cleanup();

    history.replaceState(null, '', '#/estoque/pendencias');
    render(<App />);
    expect(location.hash).toBe('#/nuvemshop');
  });

  it('o sino abre a lista de pendências', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Pendências/ }));
    expect(location.hash).toBe('#/home/pendencias');
    expect(screen.getByRole('heading', { level: 1, name: 'Pendências' })).toBeTruthy();
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
    expect(screen.getByText(/mesmo acesso/i)).toBeTruthy();
  });

  it('Peças tem quatro abas, todas do próprio módulo', async () => {
    render(<App />);
    irNoTrilho(/^Peças$/);
    const abas = screen.getByRole('tablist', { name: 'Peças' });
    expect(abas.classList.contains('mq-tabs')).toBe(true);
    expect([...abas.querySelectorAll('[role="tab"]')].map((b) => b.textContent))
      .toEqual(['Peças', 'Resumo', 'Entrada de peças', 'Inventário']);

    /* A importação por planilha tem aba própria agora. */
    fireEvent.click(screen.getByRole('tab', { name: 'Entrada de peças' }));
    expect(await screen.findByText('Por planilha')).toBeTruthy();
    /* E trocar de aba não tira ninguém do módulo. */
    expect(location.hash.startsWith('#/estoque')).toBe(true);
    expect(document.querySelector('.mq-topbar__where')?.textContent).toContain('Peças');
  });

  it('Loja online é um item próprio do menu, sem as abas de Peças', () => {
    comEstado();
    render(<App />);
    irNoTrilho(/Loja online/);
    const loja = [...railDe().querySelectorAll('.mq-rail__item')]
      .find((b) => b.textContent?.includes('Loja online'));
    expect(loja?.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('tablist', { name: 'Peças' })).toBeNull();
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

  it('Peças abre na lista, com a ficha a um toque', async () => {
    render(<App />);
    irNoTrilho(/^Peças$/);
    expect(screen.getByRole('heading', { level: 1, name: 'Peças' })).toBeTruthy();
    const abas = screen.getByRole('tablist', { name: 'Peças' });
    expect(within(abas).getByRole('tab', { name: 'Peças' })).toHaveProperty('ariaSelected', 'true');

    fireEvent.click(await screen.findByRole('button', { name: /C1/ }));
    expect(location.hash).toBe('#/estoque/peca%3AC1');
    /* Desde 29/09/2026 a ficha é uma PÁGINA (não mais uma gaveta), com
       cabeçalho e cinco abas. */
    const ficha = screen.getByRole('article', { name: 'Ficha da peça C1' });
    expect(within(ficha).getAllByText('Em casa').length).toBeGreaterThan(0);
    expect(within(ficha).getAllByRole('button', { name: 'Editar dados' }).length).toBeGreaterThan(0);
    expect(within(ficha).getByRole('button', { name: 'Variações' })).toBeTruthy();
    const secoes = within(ficha).getByRole('tablist', { name: 'Seções da peça' });
    expect(within(secoes).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(
      ['Visão geral', 'Fotos', 'Estoque', 'Histórico', 'Loja online'],
    );
    fireEvent.click(within(secoes).getByRole('tab', { name: /Fotos/ }));
    expect(location.hash).toBe('#/estoque/peca%3AC1%7Cfotos');
    expect(await screen.findByRole('button', { name: /Buscar fotos na loja online/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Adicionar fotos/ })).toBeTruthy();

    /* "Peças" volta para a lista. */
    fireEvent.click(within(ficha).getByRole('button', { name: /Peças/ }));
    expect(location.hash).toBe('#/estoque');
    expect(screen.getByRole('heading', { level: 1, name: 'Peças' })).toBeTruthy();
  });

  it('a importação de fotos da Nuvemshop está na cara, no topo de Peças', async () => {
    render(<App />);
    irNoTrilho(/^Peças$/);
    fireEvent.click(await screen.findByRole('button', { name: /Importar fotos da Nuvemshop/ }));
    expect(location.hash).toBe('#/estoque/importar-fotos');
    expect(await screen.findByRole('dialog', { name: 'Importar fotos da Nuvemshop' })).toBeTruthy();
  });

  it('o Resumo traz os números do estoque, sem a lista inteira embaixo', async () => {
    render(<App />);
    irNoTrilho(/^Peças$/);
    fireEvent.click(screen.getByRole('tab', { name: 'Resumo' }));

    expect(await screen.findByText('Cadastro incompleto')).toBeTruthy();
    const rotulos = [...document.querySelectorAll('.mq-kpi__label')].map((e) => e.textContent);
    expect(rotulos).toEqual([
      'Valor de referência',
      'Peças em estoque',
      'Em casa',
      'Com revendedoras',
      'Cadastro incompleto',
    ]);
    expect(screen.getByRole('heading', { name: 'Onde está o patrimônio' })).toBeTruthy();
    expect(screen.queryByText('Todos os produtos')).toBeNull();
  });

  /** O NÚMERO que nunca pode virar zero por engano. "Anunciadas na loja"
   *  só aparece quando a loja FOI lida; sem retrato, a tela diz que não
   *  sabe em vez de afirmar que não há nada anunciado. */
  it('sem retrato da loja, o patrimônio não afirma zero anunciados', async () => {
    history.replaceState(null, '', '#/estoque/resumo');
    render(<App />);
    await screen.findByText('Cadastro incompleto');
    expect(screen.getByText('loja ainda não lida')).toBeTruthy();
  });

  it('Revendedoras abre na Visão Geral', async () => {
    render(<App />);
    irNoTrilho(/Revendedoras/);

    expect(await screen.findByRole('heading', { level: 1, name: 'Revendedoras' })).toBeTruthy();
    const abas = screen.getByRole('tablist', { name: 'Revendedoras' });
    expect(within(abas).getByRole('tab', { name: 'Visão geral' })).toHaveProperty(
      'ariaSelected',
      'true',
    );
  });

  it('"Ver planejamento" no Resumo leva para Revendedoras › Planejamento', async () => {
    history.replaceState(null, '', '#/estoque/resumo');
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver planejamento' }));
    const abas = await screen.findByRole('tablist', { name: 'Revendedoras' });
    expect(within(abas).getByRole('tab', { name: 'Planejamento' })).toHaveProperty('ariaSelected', 'true');
  });

  /* A aba da revendedora era um `useState` no App: recarregar em cima da
     ficha de alguém devolvia a Visão Geral, o voltar do navegador saía do
     módulo inteiro, e não havia link para mandar. */
  it('a ficha da revendedora sobrevive ao recarregar e ao voltar', async () => {
    render(<App />);
    irNoTrilho(/Revendedoras/);

    const abas = await screen.findByRole('tablist', { name: 'Revendedoras' });
    fireEvent.click(within(abas).getByRole('tab', { name: /^Revendedoras/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Andreia Souza/ }));
    expect(location.hash).toBe('#/revendedoras/1');

    /* Recarregar = montar do zero com o mesmo endereço. */
    cleanup();
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Andreia Souza' })).toBeTruthy();
  });

  /* Um endereço apontando para alguém que não existe mais não pode virar
     tela vazia: ele volta para a Visão Geral. */
  it('ficha de revendedora inexistente cai na Visão Geral', async () => {
    history.replaceState(null, '', '#/revendedoras/9999');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Revendedoras' })).toBeTruthy();
  });
});
