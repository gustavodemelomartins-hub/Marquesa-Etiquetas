// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../../services/client';

const proximoCodigo = { valor: null as string | null };

vi.mock('../../components/scanner/leitorDeEtiqueta', () => ({
  temCamera: () => true,
  montarLeitor: async () => async () => proximoCodigo.valor,
  criarBipe: () => () => {},
}));

import { InventarioArea } from './InventarioArea';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

interface Chamada { metodo: string; caminho: string; corpo: Record<string, unknown> | null }

/** O servidor do inventário, em miniatura — e com a MESMA regra que
 *  importa: `POST /itens` grava um valor ABSOLUTO. É contra ele que se
 *  prova que a bipada soma um em vez de gravar sempre 1. */
function servidor(opcoes: { comVariacao?: string[]; recusar?: string } = {}) {
  const chamadas: Chamada[] = [];
  const contagem = new Map<string, number>();

  const esperados = [
    { sku: '230076', desc: 'Anel Abaulado', cat: 'Anel', preco: 99, total: 5, consignado: 2, esperado: 3 },
    { sku: '347801', desc: 'Colar Coração', cat: 'Colar', preco: 69, total: 4, consignado: 0, esperado: 4 },
    { sku: '310928', desc: 'Anel Solitário', cat: 'Anel', preco: 129, total: 9, consignado: 0, esperado: 9 },
  ];

  const detalhe = () => ({
    id: 42, status: 'aberto', iniciadoEm: '2026-09-24T09:00:00Z',
    pausadoEm: null, concluidoEm: null,
    contagem: [...contagem].map(([sku, contado]) => ({
      sku, variacao: null, contado, contadoEm: '2026-09-24T09:10:00Z',
    })),
    naoIdentificado: [],
    cobertura: { conferidos: contagem.size, total: esperados.length },
    esperados,
  });

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const caminho = String(url).replace('http://api.local', '').split('?')[0] ?? '';
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ metodo, caminho, corpo });

    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), {
      status, headers: { 'Content-Type': 'application/json' },
    });

    if (caminho === '/api/inventarios' && metodo === 'GET') {
      return json([{
        id: 42, status: 'aberto', iniciadoEm: '2026-09-24T09:00:00Z',
        pausadoEm: null, concluidoEm: null, divergentes: 0, pecas: 0, naoComparaveis: 0,
      }]);
    }
    if (caminho === '/api/inventarios/42' && metodo === 'GET') return json(detalhe());

    if (caminho === '/api/inventarios/42/itens' && metodo === 'POST') {
      const sku = String(corpo?.sku ?? '');
      if (opcoes.recusar && sku === opcoes.recusar) {
        return json({ erro: `Código ${sku} não está no catálogo.`, sku, desconhecido: true }, 409);
      }
      if (opcoes.comVariacao?.includes(sku) && !corpo?.variacao) {
        return json({
          erro: 'Anel Solitário tem variação cadastrada. Diga qual você contou.',
          sku,
          variacoes: [{ nome: 'Aro 16', varianteId: 'local:1' }, { nome: 'Aro 17', varianteId: 'local:2' }],
        }, 409);
      }
      contagem.set(sku, Number(corpo?.contado ?? 0));
      return json({ ok: true });
    }
    return json({});
  }));

  return { chamadas, contagem };
}

function abrir() {
  render(
    <InventarioArea
      conexao={conexao}
      estado={{ inventario: { abertoId: 42, diasDesde: 3, vencido: false } } as never}
      aoMudarEstoque={() => {}}
    />,
  );
}

const gravacoes = (chamadas: Chamada[]) =>
  chamadas.filter((c) => c.caminho === '/api/inventarios/42/itens' && c.metodo === 'POST');

beforeEach(() => {
  proximoCodigo.valor = null;
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, value: 640 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, value: 480 });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
  const track = { stop: vi.fn(), kind: 'video' };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] } as unknown as MediaStream)) },
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** A BIPAGEM ALIMENTA O INVENTÁRIO QUE JÁ ESTÁ ABERTO.
 *
 *  Nenhuma prova aqui é sobre a câmera — são todas sobre o que chega ao
 *  servidor. O risco desta integração não é a lente: é gravar o número
 *  errado, gravar pela rota errada, ou abrir um segundo inventário. */
describe('conferir o estoque pela câmera', () => {
  it('abre a câmera de dentro da contagem, sem sair da tela', async () => {
    servidor();
    abrir();

    const botao = await screen.findByRole('button', { name: /Abrir câmera/ }, { timeout: 3000 });
    fireEvent.click(botao);
    expect(await screen.findByRole('region', { name: 'Leitor de etiquetas' })).toBeTruthy();
    /* A lista continua ali embaixo: a câmera é uma entrada a mais, não
       outra tela. */
    expect(screen.getByRole('table', { name: 'Itens contados' })).toBeTruthy();
  });

  it('cada bipada SOMA UMA unidade à linha — não grava sempre 1', async () => {
    const { chamadas, contagem } = servidor();
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir câmera/ }, { timeout: 3000 }));
    await screen.findByRole('region', { name: 'Leitor de etiquetas' });

    /* Primeira unidade. */
    proximoCodigo.valor = '230076';
    await waitFor(() => expect(contagem.get('230076')).toBe(1), { timeout: 4000 });

    /* SEGUNDA unidade da MESMA peça — a razão inteira de a bipada somar em
       vez de afirmar. Vem por digitação para não depender da janela de
       antirrepique, que tem prova própria. */
    proximoCodigo.valor = null;
    fireEvent.change(screen.getByLabelText('Código da etiqueta'), { target: { value: '230076' } });
    fireEvent.click(screen.getByRole('button', { name: 'Contar' }));
    await waitFor(() => expect(contagem.get('230076')).toBe(2), { timeout: 4000 });

    const enviados = gravacoes(chamadas).map((c) => c.corpo?.contado);
    expect(enviados).toEqual([1, 2]);
  });

  it('bipar outra peça conta a outra peça, e não mexe na primeira', async () => {
    const { contagem } = servidor();
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir câmera/ }, { timeout: 3000 }));
    await screen.findByRole('region', { name: 'Leitor de etiquetas' });

    proximoCodigo.valor = '230076';
    await waitFor(() => expect(contagem.get('230076')).toBe(1), { timeout: 4000 });
    proximoCodigo.valor = '347801';
    await waitFor(() => expect(contagem.get('347801')).toBe(1), { timeout: 4000 });
    expect(contagem.get('230076')).toBe(1);
  });

  it('grava pela MESMA rota do "+" da lista, e não abre inventário novo', async () => {
    const { chamadas } = servidor();
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir câmera/ }, { timeout: 3000 }));
    await screen.findByRole('region', { name: 'Leitor de etiquetas' });

    proximoCodigo.valor = '230076';
    await waitFor(() => expect(gravacoes(chamadas).length).toBe(1), { timeout: 4000 });

    /* Nenhum POST em /api/inventarios: a bipada alimenta o inventário
       aberto, e não cria um paralelo. */
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/api/inventarios')).toBe(false);
    /* E nenhuma escrita pela rota em lote do painel clássico, que APAGA a
       contagem inteira antes de reescrevê-la. */
    expect(chamadas.some((c) => c.caminho === '/api/inventarios/42/contagem')).toBe(false);
  });

  it('SKU inexistente é aviso, e a contagem segue', async () => {
    const { chamadas, contagem } = servidor({ recusar: '999999' });
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir câmera/ }, { timeout: 3000 }));
    await screen.findByRole('region', { name: 'Leitor de etiquetas' });

    fireEvent.change(screen.getByLabelText('Código da etiqueta'), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Contar' }));
    await waitFor(() => expect(gravacoes(chamadas).length).toBe(1), { timeout: 4000 });
    expect(await screen.findByText(/não está no catálogo/, {}, { timeout: 3000 })).toBeTruthy();

    /* Não bloqueou: a peça seguinte conta normalmente. */
    proximoCodigo.valor = '230076';
    await waitFor(() => expect(contagem.get('230076')).toBe(1), { timeout: 4000 });
  });

  it('peça com variação abre a pergunta e PAUSA a leitura, sem contar no escuro', async () => {
    const { contagem } = servidor({ comVariacao: ['310928'] });
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir câmera/ }, { timeout: 3000 }));
    await screen.findByRole('region', { name: 'Leitor de etiquetas' });

    proximoCodigo.valor = '310928';
    /* O 409 do servidor vira PERGUNTA — a mesma que o `+` da lista abre. */
    expect(await screen.findByText(/tem variação/, {}, { timeout: 4000 })).toBeTruthy();
    /* E nada foi contado: o sistema não escolhe o aro por conta própria. */
    expect(contagem.get('310928')).toBeUndefined();
  });

  it('fechar a câmera não perde a contagem já gravada', async () => {
    const { contagem } = servidor();
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir câmera/ }, { timeout: 3000 }));
    await screen.findByRole('region', { name: 'Leitor de etiquetas' });

    proximoCodigo.valor = '230076';
    await waitFor(() => expect(contagem.get('230076')).toBe(1), { timeout: 4000 });

    fireEvent.click(screen.getByRole('button', { name: /Desligar a câmera/ }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Leitor de etiquetas' })).toBeNull());

    /* Reabrir continua o MESMO inventário, com o que já foi contado — cada
       bipada gravou na hora, e não num rascunho em memória. */
    fireEvent.click(screen.getByRole('button', { name: /Abrir câmera/ }));
    await screen.findByRole('region', { name: 'Leitor de etiquetas' });
    proximoCodigo.valor = null;
    fireEvent.change(screen.getByLabelText('Código da etiqueta'), { target: { value: '230076' } });
    fireEvent.click(screen.getByRole('button', { name: 'Contar' }));
    await waitFor(() => expect(contagem.get('230076')).toBe(2), { timeout: 4000 });
  });

  it('inventário pausado não oferece a câmera', async () => {
    const chamadas: Chamada[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const caminho = String(url).replace('http://api.local', '').split('?')[0] ?? '';
      chamadas.push({ metodo: init?.method ?? 'GET', caminho, corpo: null });
      const json = (c: unknown) => new Response(JSON.stringify(c), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
      if (caminho === '/api/inventarios') {
        return json([{
          id: 42, status: 'pausado', iniciadoEm: '2026-09-24T09:00:00Z',
          pausadoEm: '2026-09-24T11:00:00Z', concluidoEm: null,
          divergentes: 0, pecas: 0, naoComparaveis: 0,
        }]);
      }
      if (caminho === '/api/inventarios/42') {
        return json({
          id: 42, status: 'pausado', iniciadoEm: '2026-09-24T09:00:00Z',
          pausadoEm: '2026-09-24T11:00:00Z', concluidoEm: null,
          contagem: [], naoIdentificado: [],
          cobertura: { conferidos: 0, total: 1 }, esperados: [],
        });
      }
      return json({});
    }));
    abrir();

    /* Pausado nada conta — e um botão de câmera ali seria um convite a
       bipar peça que não vai ser gravada. */
    expect(await screen.findByText(/Pausado\./, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Abrir câmera/ })).toBeNull();
  });
});
