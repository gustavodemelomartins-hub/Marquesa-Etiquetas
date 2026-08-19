// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevendedorasArea, type SubRotaRevendedoras } from './RevendedorasArea';
import type { Connection } from '../../services/client';
import type { UsoPlanejamento } from '../../hooks/usePlanejamento';
import { emCasa, estadoDeTeste, maleta, revendedora } from '../../testing/fixtures';

vi.mock('../maletas/api');
import * as api from '../maletas/api';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

const planejamento: UsoPlanejamento = {
  config: { modo: 'equilibrado', tamanhoAlvo: 8, tamanhoAlvoConfirmado: true },
  origemAlvo: { valor: 8, origem: 'historico', amostra: 2 },
  definirModo: () => {},
  definirTamanhoAlvo: () => {},
  restaurarPadrao: () => {},
};

const estado = estadoDeTeste({
  produtos: [
    emCasa('C1', 20, { cat: 'Colar', preco: 150 }),
    emCasa('B1', 30, { cat: 'Brinco', preco: 60 }),
  ],
  revendedoras: [
    revendedora({ id: 1, nome: 'Andreia Souza', cidade: 'Bauru' }),
    revendedora({ id: 2, nome: 'Graciele' }),
    revendedora({ id: 3, nome: 'Bruna', status: 'inativa' }),
  ],
  maletas: [maleta({ id: 7, revId: 1, acertoEm: '2026-09-01', itens: { C1: 3 }, precos: { C1: 150 } })],
});

/** A navegação de subaba mora no `App`; aqui ela é simulada para o teste
 *  poder clicar numa aba e ver a tela mudar de verdade. */
function Area({ inicial = 'visao-geral' as SubRotaRevendedoras }) {
  const [sub, setSub] = useState<SubRotaRevendedoras>(inicial);
  return (
    <RevendedorasArea
      conexao={conexao}
      estado={estado}
      carregando={false}
      erro={null}
      recarregar={() => {}}
      planejamento={planejamento}
      sub={sub}
      aoNavegarSub={setSub}
    />
  );
}

describe('navegação de Revendedoras', () => {
  it('abre na Visão Geral', () => {
    render(<Area />);
    const abas = screen.getByRole('tablist', { name: 'Revendedoras' });
    expect(within(abas).getByRole('tab', { name: 'Visão Geral' })).toHaveProperty(
      'ariaPressed',
      'true',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Visão Geral' })).toBeTruthy();
  });

  it('os nomes das abas vêm dos dados, não do código', () => {
    render(<Area />);
    const abas = screen.getByRole('tablist', { name: 'Revendedoras' });
    const rotulos = [...abas.querySelectorAll('[role="tab"]')].map((b) => b.textContent);
    expect(rotulos).toEqual(['Visão Geral', 'Andreia', 'Graciele']);
  });

  it('revendedora arquivada não vira aba', () => {
    render(<Area />);
    expect(screen.queryByRole('tab', { name: 'Bruna' })).toBeNull();
  });

  it('cada revendedora continua acessível pela aba dela', () => {
    render(<Area />);
    fireEvent.click(screen.getByRole('tab', { name: 'Andreia' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Andreia Souza' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Maleta 7' })).toBeTruthy();
  });

  it('a Visão Geral mostra a agenda de acertos e a capacidade', () => {
    render(<Area />);
    expect(screen.getByRole('heading', { name: 'Agenda de acertos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Capacidade para novas maletas' })).toBeTruthy();
  });
});

describe('sugestões', () => {
  it('ficam fora da primeira tela, atrás de "Ver sugestões"', () => {
    render(<Area />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver sugestões' }));
    const painel = screen.getByRole('dialog', { name: 'Sugestões de maleta' });
    expect(within(painel).getByRole('heading', { name: 'Equilibrada' })).toBeTruthy();
    expect(within(painel).getByRole('heading', { name: 'Giro rápido' })).toBeTruthy();
    expect(within(painel).getByRole('heading', { name: 'Premium' })).toBeTruthy();
  });

  it('mostra no máximo três propostas', () => {
    render(<Area />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver sugestões' }));
    const painel = screen.getByRole('dialog', { name: 'Sugestões de maleta' });
    expect(painel.querySelectorAll('.sugestao')).toHaveLength(3);
  });
});

describe('criar maleta exige confirmação', () => {
  it('clicar em "+ Criar maleta" não cria nada — abre a sequência', () => {
    render(<Area />);
    fireEvent.click(screen.getByRole('button', { name: '+ Criar maleta' }));
    expect(api.criarMaleta).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Criar maleta' })).toBeTruthy();
    expect(screen.getByText(/nada é gravado até você confirmar/)).toBeTruthy();
  });

  it('a criação só acontece depois de escolher, revisar e confirmar', async () => {
    vi.mocked(api.criarMaleta).mockResolvedValue({
      id: 99,
      revId: 2,
      status: 'aberta',
      abertaEm: '2026-08-19',
      acertoEm: null,
      itens: {},
    });
    vi.mocked(api.adicionarItens).mockResolvedValue({ ok: true, adicionados: 2, recusados: [] });

    render(<Area />);
    fireEvent.click(screen.getByRole('button', { name: '+ Criar maleta' }));
    const painel = screen.getByRole('dialog', { name: 'Criar maleta' });

    fireEvent.click(within(painel).getByRole('button', { name: /Graciele/ }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Gerar sugestão' }));

    /* Etapa de revisão: as peças estão na tela e nada foi gravado. */
    expect(within(painel).getByRole('heading', { name: 'Revise as peças' })).toBeTruthy();
    expect(api.criarMaleta).not.toHaveBeenCalled();

    fireEvent.click(within(painel).getByRole('button', { name: 'Revisar e confirmar' }));
    expect(within(painel).getByText('Isto grava.')).toBeTruthy();
    expect(api.criarMaleta).not.toHaveBeenCalled();

    fireEvent.click(within(painel).getByRole('button', { name: /Criar maleta para Graciele/ }));
    await waitFor(() => expect(api.criarMaleta).toHaveBeenCalledTimes(1));
    expect(api.adicionarItens).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Maleta 99 criada' })).toBeTruthy();
  });

  it('nenhuma quantidade enviada passa do que a reserva liberou', async () => {
    vi.mocked(api.criarMaleta).mockResolvedValue({
      id: 100,
      revId: 2,
      status: 'aberta',
      abertaEm: '2026-08-19',
      acertoEm: null,
      itens: {},
    });
    vi.mocked(api.adicionarItens).mockResolvedValue({ ok: true, adicionados: 2, recusados: [] });

    render(<Area />);
    fireEvent.click(screen.getByRole('button', { name: '+ Criar maleta' }));
    const painel = screen.getByRole('dialog', { name: 'Criar maleta' });
    fireEvent.click(within(painel).getByRole('button', { name: /Graciele/ }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Continuar' }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Gerar sugestão' }));

    /* Tentar levar mais do que existe: o campo trava no limite da linha. */
    const campo = within(painel).getByLabelText('Quantidade de C1') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '9999' } });

    fireEvent.click(within(painel).getByRole('button', { name: 'Revisar e confirmar' }));
    fireEvent.click(within(painel).getByRole('button', { name: /Criar maleta para Graciele/ }));

    await waitFor(() => expect(api.adicionarItens).toHaveBeenCalledTimes(1));
    const enviados = vi.mocked(api.adicionarItens).mock.calls[0]![2];
    /* 20 em casa, 30% de reserva → no máximo 14 do C1. */
    expect(enviados.C1).toBeLessThanOrEqual(14);
    for (const [, qtd] of Object.entries(enviados)) expect(qtd).toBeGreaterThan(0);
  });
});
