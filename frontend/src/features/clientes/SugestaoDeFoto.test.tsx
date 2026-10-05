// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AvatarCliente } from '../../components/AvatarCliente';
import { SugestaoDeFoto, explicarBusca } from './SugestaoDeFoto';
import type { Connection } from '../../services/client';

const conexao: Connection = { url: 'http://api.local', key: 'k' };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const resp = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const SUG = (id: number, user: string, restantes = 0, aviso: string | null = null) => ({
  sugestao: { candidatoId: id, username: user, nome: 'Kamila Pereira', foto: 'https://x.cdninstagram.com/a.jpg', score: 0.95, motivo: 'nome_completo' },
  restantes, aviso,
});

describe('AvatarCliente — a mesma lógica em toda tela', () => {
  it('sem foto: iniciais, sem <img>, sem botão', () => {
    const { container } = render(<AvatarCliente nome="Kamila Pereira" conexao={conexao} />);
    expect(container.textContent).toBe('KP');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('com foto confirmada: <img> resolvido contra a API', () => {
    const { container } = render(<AvatarCliente nome="Kamila Pereira" avatarUrl="/api/clientes/1/avatar?exp=1&sig=a" conexao={conexao} />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('http://api.local/api/clientes/1/avatar?exp=1&sig=a');
  });

  it('a foto que falha se retira e sobram as iniciais (nunca ícone quebrado)', () => {
    const { container } = render(<AvatarCliente nome="Kamila Pereira" avatarUrl="/api/x" conexao={conexao} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('KP');
  });

  it('sugestão pendente: marca de sugestão só enquanto não há foto', () => {
    const { container, rerender } = render(<AvatarCliente nome="Kamila Pereira" sugestao conexao={conexao} />);
    expect(container.querySelector('.mq-avatar--sug')).not.toBeNull();
    rerender(<AvatarCliente nome="Kamila Pereira" sugestao avatarUrl="/api/x" conexao={conexao} />);
    expect(container.querySelector('.mq-avatar--sug')).toBeNull();
  });

  it('com aoClicar vira botão acessível', () => {
    const f = vi.fn();
    render(<AvatarCliente nome="Kamila Pereira" sugestao conexao={conexao} aoClicar={f} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sugestão de foto para Kamila Pereira' }));
    expect(f).toHaveBeenCalled();
  });
});

describe('SugestaoDeFoto — É ela / Não é ela / Próxima', () => {
  function montar(fetchMock: ReturnType<typeof vi.fn>, extra: Partial<Parameters<typeof SugestaoDeFoto>[0]> = {}) {
    vi.stubGlobal('fetch', fetchMock);
    const aoFechar = vi.fn(); const aoMudar = vi.fn();
    render(<SugestaoDeFoto conexao={conexao} clienteId={7} nome="Kamila Pereira" aoFechar={aoFechar} aoMudar={aoMudar} {...extra} />);
    return { aoFechar, aoMudar };
  }

  it('mostra @usuário e nome encontrado, com as três ações quando há outra sugestão', async () => {
    montar(vi.fn(async () => resp(SUG(1, 'kamila.pereira', 1))));
    expect(await screen.findByText('@kamila.pereira')).toBeTruthy();
    expect(screen.getAllByText('Kamila Pereira').length).toBeGreaterThan(0);
    for (const t of ['É ela', 'Não é ela', 'Próxima sugestão']) expect(screen.getByRole('button', { name: t })).toBeTruthy();
  });

  it('sem outras sugestões, não há "Próxima"', async () => {
    montar(vi.fn(async () => resp(SUG(1, 'kamila.pereira', 0))));
    await screen.findByText('@kamila.pereira');
    expect(screen.queryByRole('button', { name: 'Próxima sugestão' })).toBeNull();
  });

  it('avisa homônimo antes de confirmar', async () => {
    montar(vi.fn(async () => resp(SUG(1, 'kamila.pereira', 0, 'Há outra cliente cadastrada com este mesmo nome — confira antes de confirmar.'))));
    expect(await screen.findByText(/mesmo nome/)).toBeTruthy();
  });

  it('"Próxima sugestão" pede depois da atual, sem recusar ninguém', async () => {
    const f = vi.fn(async (u: string, _init?: RequestInit) => resp(u.includes('depoisDe=1') ? SUG(2, 'outra.kamila') : SUG(1, 'kamila.pereira', 1)));
    montar(f);
    fireEvent.click(await screen.findByRole('button', { name: 'Próxima sugestão' }));
    expect(await screen.findByText('@outra.kamila')).toBeTruthy();
    expect(f.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('"Não é ela" recusa e carrega a próxima', async () => {
    let lidas = 0;
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === 'POST') return resp({ ok: true });
      lidas += 1;
      return resp(lidas === 1 ? SUG(1, 'kamila.pereira', 1) : SUG(2, 'outra.kamila'));
    });
    montar(f);
    fireEvent.click(await screen.findByRole('button', { name: 'Não é ela' }));
    expect(await screen.findByText('@outra.kamila')).toBeTruthy();
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(String(post[0])).toContain('/api/clientes/7/avatar/decidir');
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ candidatoId: 1, acao: 'recusar' });
  });

  it('recusar a última relê a ficha e explica, sem fechar sozinho', async () => {
    let lidas = 0;
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === 'POST') return resp({ ok: true });
      lidas += 1;
      return resp(lidas === 1 ? SUG(1, 'kamila.pereira')
        : { sugestao: null, restantes: 0, busca: { status: 'feita', em: '2026-10-05 12:00:00' } });
    });
    const { aoFechar, aoMudar } = montar(f);
    fireEvent.click(await screen.findByRole('button', { name: 'Não é ela' }));
    expect(await screen.findByText(/já foram recusadas/)).toBeTruthy();
    expect(aoMudar).toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Buscar de novo' })).toBeTruthy();
  });

  it('sem sugestão nenhuma: diz que nunca buscou e "Buscar foto" pede a busca', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === 'POST'
      ? resp({ ok: true, status: 'pedida', pedidaEm: '2026-10-05 12:00:00' })
      : resp({ sugestao: null, restantes: 0, busca: null })));
    montar(f);
    expect(await screen.findByText(/Ainda não procuramos/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar foto' }));
    expect(await screen.findByText(/Busca pedida/)).toBeTruthy();
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(String(post[0])).toContain('/api/clientes/7/avatar/buscar');
    // pedida: não oferece pedir de novo
    expect(screen.queryByRole('button', { name: /Buscar/ })).toBeNull();
  });

  it('o status cru da busca nunca aparece', () => {
    for (const st of ['pedida', 'feita', 'sem_resultado', 'erro', 'ignorada', 'qualquer_outro']) {
      const t = explicarBusca({ status: st, em: '2026-10-05 12:00:00' });
      expect(t).not.toMatch(/_/);
      expect(t).not.toContain(st === 'qualquer_outro' ? st : '§');
    }
    expect(explicarBusca(null)).toMatch(/Ainda não procuramos/);
  });

  it('"É ela" confirma, relê a ficha e fecha', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === 'POST' ? resp({ ok: true }) : resp(SUG(1, 'kamila.pereira'))));
    const { aoFechar, aoMudar } = montar(f);
    fireEvent.click(await screen.findByRole('button', { name: 'É ela' }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(aoMudar).toHaveBeenCalled();
    const post = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ candidatoId: 1, acao: 'confirmar' });
  });

  it('falha ao baixar a foto: o erro aparece e NADA fecha nem confirma', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === 'POST'
      ? resp({ erro: 'A foto sugerida não está mais disponível. Rode a busca de novo.' }, 502)
      : resp(SUG(1, 'kamila.pereira'))));
    const { aoFechar, aoMudar } = montar(f);
    fireEvent.click(await screen.findByRole('button', { name: 'É ela' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/não está mais disponível/);
    expect(aoFechar).not.toHaveBeenCalled();
    expect(aoMudar).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'É ela' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('R2 ausente (503): mensagem clara, sugestão segue pendente', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === 'POST'
      ? resp({ erro: 'Upload e edição de foto exigem R2, que não está habilitado nesta conta Cloudflare ainda.' }, 503)
      : resp(SUG(1, 'kamila.pereira'))));
    montar(f);
    fireEvent.click(await screen.findByRole('button', { name: 'É ela' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/R2/);
  });

  it('foto confirmada: oferece remover e não busca sugestão', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => resp({ ok: true }, init?.method === 'DELETE' ? 200 : 200));
    const { aoFechar, aoMudar } = montar(f, { avatarUrl: '/api/clientes/7/avatar?exp=1&sig=a' });
    expect(f).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remover foto' }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(aoMudar).toHaveBeenCalled();
    expect(f.mock.calls[0]![1]).toMatchObject({ method: 'DELETE' });
  });
});
