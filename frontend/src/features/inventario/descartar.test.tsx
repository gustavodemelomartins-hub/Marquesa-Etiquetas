// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../../services/client';

vi.mock('../../components/scanner/leitorDeEtiqueta', () => ({
  temCamera: () => false,
  montarLeitor: async () => async () => null,
  criarBipe: () => () => {},
}));

import { InventarioArea } from './InventarioArea';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

interface Chamada { metodo: string; caminho: string }

/** O servidor do inventário com a MESMA regra de status da API
 *  (`api/src/inventario.js`): pausar/retomar/cancelar só valem para
 *  `aberto`, e cancelar não apaga — o inventário segue na lista. */
function servidor(inicial: { status: 'aberto' | 'concluido' | 'cancelado'; pausado?: boolean }) {
  const chamadas: Chamada[] = [];
  const inv = {
    id: 7,
    numero: 1,
    status: inicial.status as string,
    pausadoEm: inicial.pausado ? '2026-09-30 18:00:00' : null as string | null,
    iniciadoEm: '2026-09-28 10:00:00',
    concluidoEm: inicial.status === 'aberto' ? null : '2026-09-30 19:00:00' as string | null,
  };
  let proximoId = 8;
  const novos: { id: number; iniciadoEm: string }[] = [];
  const visivel = () => (inv.status === 'aberto' && inv.pausadoEm ? 'pausado' : inv.status);

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const caminho = String(url).replace('http://api.local', '').split('?')[0] ?? '';
    chamadas.push({ metodo, caminho });
    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), {
      status, headers: { 'Content-Type': 'application/json' },
    });
    const emAndamento = inv.status === 'aberto' || novos.length > 0;

    if (caminho === '/api/inventarios' && metodo === 'GET') {
      return json([
        ...novos.map((n) => ({
          id: n.id, numero: n.id - 6, status: 'aberto', iniciadoEm: n.iniciadoEm, pausadoEm: null,
          concluidoEm: null, divergentes: 0, pecas: 0, naoComparaveis: 0,
        })),
        {
          id: inv.id, numero: inv.numero, status: visivel(), iniciadoEm: inv.iniciadoEm, pausadoEm: inv.pausadoEm,
          concluidoEm: inv.concluidoEm, divergentes: 0, pecas: 0, naoComparaveis: 0,
        },
      ]);
    }
    if (caminho === '/api/inventarios' && metodo === 'POST') {
      if (emAndamento) return json({ erro: 'Já existe um inventário em andamento.' }, 409);
      const n = { id: proximoId++, iniciadoEm: '2026-10-02 09:00:00' };
      novos.push(n);
      return json({ id: n.id, numero: n.id - 6, iniciadoEm: n.iniciadoEm, status: 'aberto' }, 201);
    }
    const m = /^\/api\/inventarios\/(\d+)(?:\/(\w+))?$/.exec(caminho);
    if (m && Number(m[1]) === inv.id) {
      const acao = m[2];
      if (!acao && metodo === 'GET') {
        return json({
          id: inv.id, numero: inv.numero, status: visivel(), iniciadoEm: inv.iniciadoEm, pausadoEm: inv.pausadoEm,
          concluidoEm: inv.concluidoEm,
          contagem: [{ sku: '230076', variacao: null, contado: 2, contadoEm: '2026-09-30 17:00:00' }],
          naoIdentificado: [],
          cobertura: { conferidos: 1, total: 2 },
          esperados: inv.status === 'aberto' ? [
            { sku: '230076', desc: 'Anel Abaulado', cat: 'Anel', preco: 99, total: 3, consignado: 0, esperado: 3 },
            { sku: '347801', desc: 'Colar Coração', cat: 'Colar', preco: 69, total: 4, consignado: 0, esperado: 4 },
          ] : undefined,
        });
      }
      if (metodo === 'POST' && ['pausar', 'retomar', 'cancelar'].includes(acao ?? '')) {
        if (inv.status !== 'aberto') return json({ erro: 'Só dá para cancelar um inventário em andamento' }, 409);
        if (acao === 'pausar') inv.pausadoEm = '2026-10-02 10:00:00';
        if (acao === 'retomar') inv.pausadoEm = null;
        if (acao === 'cancelar') { inv.status = 'cancelado'; inv.concluidoEm = '2026-10-02 10:05:00'; }
        return json({ ok: true });
      }
      if (acao === 'resultado') return json({ erro: 'sem resultado no teste' }, 409);
    }
    if (m) {
      return json({
        id: Number(m[1]), numero: Number(m[1]) - 6, status: 'aberto', iniciadoEm: '2026-10-02 09:00:00', pausadoEm: null,
        concluidoEm: null, contagem: [], naoIdentificado: [], cobertura: { conferidos: 0, total: 0 }, esperados: [],
      });
    }
    return json({});
  }));

  return { chamadas, inv };
}

const renderizar = () =>
  render(<InventarioArea conexao={conexao} estado={null} aoMudarEstoque={() => {}} />);

const escritas = (chamadas: Chamada[]) => chamadas.filter((c) => c.metodo !== 'GET');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Inventário pausado: continuar, concluir ou descartar', () => {
  it('mostra o número visível, "Pausado", a data de início e as ações', async () => {
    servidor({ status: 'aberto', pausado: true });
    renderizar();
    await screen.findByRole('button', { name: 'Continuar conferindo' });

    const cartao = screen.getByRole('heading', { name: 'Inventário #1' }).closest('section')!;
    expect(within(cartao).getByText('Pausado')).toBeTruthy();
    expect(within(cartao).getByText(/aberto em 28\/09/)).toBeTruthy();
    expect(within(cartao).getByRole('button', { name: 'Continuar conferindo' })).toBeTruthy();
    expect(within(cartao).getByRole('button', { name: 'Revisar e finalizar' })).toBeTruthy();
    expect(within(cartao).getByRole('button', { name: 'Descartar inventário' })).toBeTruthy();
  });

  it('abrir → pausar → continuar: retoma pela rota de retomar, sem cancelar', async () => {
    const { chamadas, inv } = servidor({ status: 'aberto' });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar conferindo' }));
    await screen.findByRole('button', { name: 'Pausar' });

    expect(escritas(chamadas).map((c) => c.caminho)).toEqual([
      '/api/inventarios/7/pausar',
      '/api/inventarios/7/retomar',
    ]);
    expect(inv.status).toBe('aberto');
    expect(inv.pausadoEm).toBeNull();
  });

  it('Descartar abre a confirmação com o texto combinado', async () => {
    servidor({ status: 'aberto', pausado: true });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar inventário' }));

    const dialogo = await screen.findByRole('alertdialog', { name: 'Descartar este inventário?' });
    expect(within(dialogo).getByText('As contagens realizadas não serão aplicadas ao estoque.')).toBeTruthy();
    expect(within(dialogo).getByText('O inventário continuará disponível no histórico como cancelado.')).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Voltar' })).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Descartar inventário' })).toBeTruthy();
    /* O foco começa no gesto seguro. */
    expect(document.activeElement).toBe(within(dialogo).getByRole('button', { name: 'Voltar' }));
  });

  it('abrir a confirmação → Voltar: nada é escrito e o inventário segue pausado', async () => {
    const { chamadas, inv } = servidor({ status: 'aberto', pausado: true });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar inventário' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(escritas(chamadas)).toHaveLength(0);
    expect(inv.status).toBe('aberto');
    expect(screen.getByRole('heading', { name: 'Inventário #1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar conferindo' })).toBeTruthy();
  });

  it('Esc também volta sem descartar', async () => {
    const { chamadas } = servidor({ status: 'aberto', pausado: true });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar inventário' }));
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(escritas(chamadas)).toHaveLength(0);
  });

  it('abrir → pausar → descartar: vira cancelado, fica no histórico e libera um novo', async () => {
    const { chamadas, inv } = servidor({ status: 'aberto', pausado: true });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar inventário' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar inventário' }));

    /* A única escrita é a rota que já existia — sem rota nova, sem ajuste. */
    await waitFor(() => expect(escritas(chamadas).map((c) => c.caminho))
      .toEqual(['/api/inventarios/7/cancelar']));
    expect(inv.status).toBe('cancelado');
    expect(chamadas.some((c) => /ajustar|aplicar|concluir/.test(c.caminho))).toBe(false);

    /* A contagem sai da tela, o histórico guarda o #7 como Cancelado e
       "Abrir inventário" volta. */
    const abrir = await screen.findByRole('button', { name: /Abrir inventário/ });
    expect(screen.queryByRole('heading', { name: 'Inventário #1' })).toBeNull();
    const historico = screen.getByRole('heading', { name: 'Histórico de inventários' }).closest('section')!;
    /* A linha do histórico (não mais um botão só: ela também pode levar
       "Excluir", §53). */
    const linha = within(historico).getByText('Inventário #1').closest<HTMLElement>('.mq-item')!;
    expect(within(linha).getByText('Descartado')).toBeTruthy();
    expect(within(linha).getByText(/descartado em/)).toBeTruthy();

    fireEvent.click(abrir);
    await waitFor(() => expect(escritas(chamadas).map((c) => c.caminho))
      .toEqual(['/api/inventarios/7/cancelar', '/api/inventarios']));
    await screen.findByRole('heading', { name: 'Inventário #2' });
  });
});

describe('Inventário encerrado não oferece descarte', () => {
  it('descartado, aberto pelo histórico: diz Descartado e não oferece Descartar, finalizar nem ajuste', async () => {
    servidor({ status: 'cancelado' });
    renderizar();
    fireEvent.click(await screen.findByText('Inventário #1'));
    await screen.findByText(/as contagens não mudaram o estoque/);
    const cartao = screen.getByRole('heading', { name: 'Inventário #1' }).closest('section')!;
    expect(within(cartao).getByText('Descartado')).toBeTruthy();
    expect(within(cartao).queryByRole('button', { name: /Descartar/ })).toBeNull();
    expect(within(cartao).queryByRole('button', { name: /finalizar/i })).toBeNull();
    expect(screen.queryByText(/Finalizado/)).toBeNull();
    expect(screen.getByRole('button', { name: /Abrir inventário/ })).toBeTruthy();
  });

  it('finalizado, aberto pelo histórico: vai para a revisão, sem Descartar', async () => {
    servidor({ status: 'concluido' });
    renderizar();
    fireEvent.click(await screen.findByText('Inventário #1'));
    await screen.findByText('Finalizado');
    expect(screen.getByRole('heading', { name: 'Inventário #1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Descartar/ })).toBeNull();
  });
});
