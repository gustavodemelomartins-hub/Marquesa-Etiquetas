// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { ClientesArea } from './ClientesArea';
import type { Connection } from '../../services/client';

const conexao: Connection = { url: 'http://localhost:8787', key: 'k' };

function Area({ inicio }: { inicio: string | null }) {
  const [sub, setSub] = useState<string | null>(inicio);
  return (
    <>
      <span data-testid="rota">{sub ?? ''}</span>
      <ClientesArea conexao={conexao} sub={sub} aoNavegar={setSub} aoNovaVenda={() => {}} />
    </>
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const perfil = (arquivada: boolean) => ({
  ok: true,
  cadastro: {
    id: 7, nome: 'Rita Sumida', tel: null, email: null, instagram: null, cidade: null, cpf: null,
    nascimento: null, obs: null, nome_norm: 'rita sumida',
    arquivada_em: arquivada ? '2026-10-02 10:00:00' : null, arquivada_motivo: null,
  },
  clienteId: 7, norm: 'rita sumida', homonimos: 1, nomeAmbiguo: false, aviso: null,
  nomeExibicao: 'Rita Sumida',
  resumo: {
    comprou: 224, pago: 224, emAberto: 0, faturamento: 224, pecas: 2, vendas: 2,
    ticketMedio: 112, ticketMedioRecebido: 112, gastoMedioPorPeca: 112, regraFinanceira: '',
    primeiraCompra: '2025-03-02', ultimaCompra: '2025-06-10', estado: 'inativa',
    diasSemComprar: 480, frequenciaDias: null, itensLancados: 2, vendasSistema: 0,
  },
  canalPreferido: null, categoriasPreferidas: [], produtosPreferidos: [], contextos: [],
  vendas: [], totalItens: 2, correcoes: [], garantias: [], garantiasPendentes: [],
});

/** Backend em miniatura com o estado do cadastro: arquivar e reativar mudam
 *  o que a ficha relê; excluir só passa sem dependência. */
function backend({ arquivada = false, dependencias = [] as { chave: string; rotulo: string; n: number }[] } = {}) {
  const chamadas: { metodo: string; url: string }[] = [];
  const estado = { arquivada, excluida: false };
  vi.stubGlobal('fetch', vi.fn(async (entrada: string, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? 'GET';
    chamadas.push({ metodo, url });
    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), {
      status, headers: { 'Content-Type': 'application/json' },
    });
    if (url.includes('/api/clientes/perfil')) return json(perfil(estado.arquivada));
    if (url.endsWith('/api/clientes/7/dependencias')) {
      return json({ id: 7, nome: 'Rita Sumida', arquivada: estado.arquivada, podeExcluir: !dependencias.length, dependencias });
    }
    if (url.endsWith('/api/clientes/7/arquivar')) { estado.arquivada = true; return json({ ok: true }); }
    if (url.endsWith('/api/clientes/7/reativar')) { estado.arquivada = false; return json({ ok: true }); }
    if (url.endsWith('/api/clientes/7') && metodo === 'DELETE') {
      if (dependencias.length) return json({ erro: 'tem histórico' }, 409);
      estado.excluida = true;
      return json({ ok: true });
    }
    if (url.includes('/api/clientes?')) {
      return json(url.includes('arquivadas=sim')
        ? [{ id: 7, nome: 'Rita Sumida', tel: '', cidade: '', arquivada: true }]
        : [{ id: 8, nome: 'Camila Reis', tel: '', cidade: '' }]);
    }
    if (url.includes('/api/analytics/crm')) return json({ todos: [], reativacao: [], kpis: {}, saudeBase: { total: 0, grupos: [] } });
    return json({});
  }));
  return { chamadas, estado };
}

const abrirMenu = async () => fireEvent.click(await screen.findByRole('button', { name: 'Mais ações' }));
const escritas = (c: { metodo: string; url: string }[]) => c.filter((x) => x.metodo !== 'GET');

describe('Ficha: ações de cadastro discretas', () => {
  it('o "•••" guarda Editar, Arquivar e Excluir — nenhum botão destrutivo à vista', async () => {
    backend();
    render(<Area inicio="7" />);
    await screen.findByRole('heading', { name: 'Rita Sumida' });
    expect(screen.queryByRole('button', { name: /Excluir/ })).toBeNull();
    await abrirMenu();
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Editar dados', 'Arquivar', 'Excluir']);
  });

  it('Arquivar pede confirmação; Voltar não escreve nada', async () => {
    const { chamadas } = backend();
    render(<Area inicio="7" />);
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Arquivar' }));
    const d = await screen.findByRole('alertdialog', { name: 'Arquivar Rita Sumida?' });
    expect(d.textContent).toContain('histórico continuam guardados');
    fireEvent.click(within(d).getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(escritas(chamadas)).toHaveLength(0);
  });

  it('arquivar → a ficha diz "Arquivada" e o menu passa a oferecer Reativar', async () => {
    const { chamadas } = backend();
    render(<Area inicio="7" />);
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Arquivar' }));
    const d = await screen.findByRole('alertdialog');
    fireEvent.click(within(d).getByRole('button', { name: 'Arquivar' }));
    await screen.findByText('Arquivada');
    expect(escritas(chamadas).map((c) => c.url)).toEqual(['http://localhost:8787/api/clientes/7/arquivar']);
    await abrirMenu();
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Editar dados', 'Reativar']);
  });

  it('arquivada → Reativar volta a ativa', async () => {
    const { chamadas } = backend({ arquivada: true });
    render(<Area inicio="7" />);
    await screen.findByText('Arquivada');
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reativar' }));
    await waitFor(() => expect(screen.queryByText('Arquivada')).toBeNull());
    expect(escritas(chamadas).map((c) => c.url)).toEqual(['http://localhost:8787/api/clientes/7/reativar']);
  });

  it('Excluir com histórico NÃO exclui: diz o histórico e oferece arquivar', async () => {
    const { chamadas } = backend({ dependencias: [{ chave: 'historico', rotulo: 'compras da planilha', n: 2 }] });
    render(<Area inicio="7" />);
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    const d = await screen.findByRole('alertdialog', { name: 'Esta cliente tem histórico' });
    expect(d.textContent).toContain('2 compras na planilha');
    expect(within(d).queryByRole('button', { name: /Excluir/ })).toBeNull();
    expect(within(d).getByRole('button', { name: 'Arquivar' })).toBeTruthy();
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
  });

  it('Excluir sem histórico confirma, apaga e volta para a lista', async () => {
    const { chamadas, estado } = backend();
    render(<Area inicio="7" />);
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    const d = await screen.findByRole('alertdialog', { name: 'Excluir Rita Sumida?' });
    expect(d.textContent).toContain('apagado definitivamente');
    fireEvent.click(within(d).getByRole('button', { name: 'Excluir cliente' }));
    await waitFor(() => expect(estado.excluida).toBe(true));
    expect(escritas(chamadas)).toEqual([{ metodo: 'DELETE', url: 'http://localhost:8787/api/clientes/7' }]);
    await waitFor(() => expect(screen.getByTestId('rota').textContent).toBe('todos'));
  });
});

describe('Lista: arquivadas fora da lista padrão', () => {
  it('a lista padrão não pede arquivadas; "Arquivadas" mostra só elas', async () => {
    const { chamadas } = backend();
    render(<Area inicio="todos" />);
    expect(await screen.findByText('Camila Reis')).toBeTruthy();
    expect(screen.queryByText('Rita Sumida')).toBeNull();
    expect(chamadas.some((c) => c.url.includes('arquivadas='))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Arquivadas' }));
    expect(await screen.findByText('Rita Sumida')).toBeTruthy();
    expect(screen.getByText('arquivada')).toBeTruthy();
    expect(chamadas.some((c) => c.url.includes('arquivadas=sim'))).toBe(true);
  });
});
