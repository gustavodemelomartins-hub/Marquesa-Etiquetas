// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

interface Chamada { metodo: string; caminho: string; corpo: Record<string, unknown> | null; busca: string }

/** O servidor do inventário em miniatura, com a regra do "bipou e marcha":
 *  `faltando` é convertido em contado contra o esperado que ELE sabe. */
function servidor(opcoes: { falhar500?: number; recusar?: string; pausado?: boolean } = {}) {
  const chamadas: Chamada[] = [];
  const contagem = new Map<string, { contado: number; faltando: number | null; variacao: string }>();
  let falhas = opcoes.falhar500 ?? 0;
  const variacoes310928 = [
    { nome: 'Aro 16', varianteId: 'v16', esperado: 2 },
    { nome: 'Aro 18', varianteId: 'v18', esperado: 1 },
  ];
  const esperados = [
    { sku: '230076', desc: 'Anel Abaulado', cat: 'Anel', preco: 99, total: 5, consignado: 2, esperado: 3,
      revendedoras: [{ nome: 'Evelyn Veiga', qtd: 2, maletaId: 17 }] },
    { sku: '347801', desc: 'Colar Coração', cat: 'Colar', preco: 69, total: 4, consignado: 0, esperado: 4, revendedoras: [] },
    { sku: '310928', desc: 'Anel Solitário', cat: 'Anel', preco: 129, total: 7, consignado: 4, esperado: 3,
      revendedoras: [], variacoes: variacoes310928, variacaoComIdentidade: true },
    { sku: '400001', desc: 'Argola Lisa', cat: 'Brinco', preco: 49, total: 1, consignado: 1, esperado: 0, revendedoras: [] },
  ];
  const detalhe = () => ({
    id: 42, status: opcoes.pausado ? 'pausado' : 'aberto', iniciadoEm: '2026-10-02T09:00:00Z',
    pausadoEm: opcoes.pausado ? '2026-10-02T10:00:00Z' : null, concluidoEm: null,
    contagem: [...contagem].map(([k, c]) => ({
      sku: k.split('|')[0], variacao: c.variacao || null, contado: c.contado, faltando: c.faltando,
      contadoEm: '2026-10-02T09:10:00Z',
    })),
    naoIdentificado: [],
    cobertura: { conferidos: new Set([...contagem.keys()].map((k) => k.split('|')[0])).size, total: esperados.length },
    esperados,
    eventos: [],
  });

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const [caminho, busca = ''] = String(url).replace('http://api.local', '').split('?') as [string, string?];
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ metodo, caminho, corpo, busca });
    const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), {
      status, headers: { 'Content-Type': 'application/json' },
    });

    if (caminho === '/api/inventarios' && metodo === 'GET') {
      return json([{ id: 42, status: opcoes.pausado ? 'pausado' : 'aberto', iniciadoEm: '2026-10-02T09:00:00Z',
        pausadoEm: null, concluidoEm: null, divergentes: 0, pecas: 0, naoComparaveis: 0 }]);
    }
    if (caminho === '/api/inventarios/42' && metodo === 'GET') return json(detalhe());
    if (caminho === '/api/inventarios/42/itens' && metodo === 'POST') {
      if (falhas > 0) { falhas -= 1; return json({ erro: 'instável' }, 503); }
      const sku = String(corpo?.sku ?? '');
      if (opcoes.recusar === sku) return json({ erro: `Código ${sku} recusado.` }, 409);
      const ref = esperados.find((e) => e.sku === sku)!;
      const variacao = String(corpo?.variacao ?? '');
      const esp = variacao ? ref.variacoes?.find((v) => v.nome === variacao)?.esperado ?? null : ref.esperado;
      const faltando = corpo?.faltando == null ? null : Number(corpo.faltando);
      const contado = faltando == null ? Number(corpo?.contado) : (esp ?? 0) - faltando;
      contagem.set(`${sku}|${variacao}`, { contado, faltando, variacao });
      return json({ ok: true, sku, contado, esperado: faltando == null ? null : esp, faltando });
    }
    if (caminho.startsWith('/api/inventarios/42/itens/') && metodo === 'DELETE') {
      const sku = decodeURIComponent(caminho.split('/').pop() ?? '');
      const variacao = new URLSearchParams(busca).get('variacao') ?? '';
      contagem.delete(`${sku}|${variacao}`);
      return json({ ok: true });
    }
    if (caminho === '/api/inventarios/42/variacoes' && metodo === 'POST') {
      return json({ ok: true, criadas: [{ nome: String(corpo?.valor), varianteId: 'local:x' }] }, 201);
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
const leitor = () => screen.getByLabelText('Bipar peça') as HTMLInputElement;
const noResumo = (rotulo: string) =>
  within(screen.getByLabelText('Resumo da conferência')).getByText(rotulo).nextSibling;
/** O leitor habilita quando a lista do inventário chega. */
const pronto = async () => {
  await screen.findByLabelText('Bipar peça', {}, { timeout: 3000 });
  await waitFor(() => expect(leitor().disabled).toBe(false));
};
/** O leitor de código de barras é um teclado: digita o código e manda Enter. */
const bipar = (codigo: string) => {
  fireEvent.change(leitor(), { target: { value: codigo } });
  fireEvent.keyDown(leitor(), { key: 'Enter' });
};

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

describe('bipou e marcha — o leitor da Sthefany', () => {
  it('A — um bipe confere a referência: manda faltando 0, nunca "contado 1"', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('230076');
    await waitFor(() => expect(gravacoes(chamadas)).toHaveLength(1));
    expect(gravacoes(chamadas)[0]!.corpo).toMatchObject({ sku: '230076', faltando: 0 });
    expect(gravacoes(chamadas)[0]!.corpo).not.toHaveProperty('contado');
    const ultima = screen.getByRole('region', { name: 'Última peça' });
    expect(within(ultima).getByText('Anel Abaulado')).toBeTruthy();
    expect(within(ultima).getByText('3')).toBeTruthy();
    expect(within(ultima).getByText(/Evelyn 2/)).toBeTruthy();
  });

  it('o campo limpa a cada leitura e o foco fica nele — o bipe seguinte não gruda no anterior', async () => {
    servidor();
    abrir();
    await pronto();
    bipar('263571');
    expect(leitor().value).toBe('');
    expect(document.activeElement).toBe(leitor());
  });

  it('E — dois códigos seguidos, sem clique entre eles, são dois conferidos', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('230076');
    bipar('347801');
    await waitFor(() => expect(gravacoes(chamadas).map((c) => c.corpo?.sku)).toEqual(['230076', '347801']));
    expect(noResumo('Conferidos')?.textContent).toBe('2');
  });

  it('C — bipar o mesmo código de novo não grava nada: "Já conferido"', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('230076');
    bipar('230076');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Já conferido/));
    expect(gravacoes(chamadas)).toHaveLength(1);
  });

  it('B + F — falta digitada no campo Faltando: Enter grava e devolve o foco ao leitor', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('347801');
    const falta = screen.getByLabelText('Faltando') as HTMLInputElement;
    expect(falta.value).toBe('0');
    fireEvent.focus(falta);
    fireEvent.change(falta, { target: { value: '2' } });
    fireEvent.keyDown(falta, { key: 'Enter' });
    await waitFor(() => expect(gravacoes(chamadas).at(-1)!.corpo).toMatchObject({ sku: '347801', faltando: 2 }));
    expect(document.activeElement).toBe(leitor());
    expect(noResumo('Com falta')?.textContent).toMatch(/^1 · 2 peças/);
  });

  it('"2 + Enter" no próprio leitor é a falta da última peça', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('347801');
    bipar('2');
    await waitFor(() => expect(gravacoes(chamadas).at(-1)!.corpo).toMatchObject({ sku: '347801', faltando: 2 }));
    expect(gravacoes(chamadas)).toHaveLength(2);
  });

  it('D — o que não foi bipado fica pendente, e não vira falta', async () => {
    servidor();
    abrir();
    await pronto();
    bipar('347801');
    await waitFor(() => expect(noResumo('Pendentes')?.textContent).toBe('3'));
    expect(noResumo('Com falta')?.textContent).toBe('0');
  });

  it('código fora da lista avisa, não grava e o leitor segue pronto', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('999999');
    expect(screen.getByRole('status').textContent).toMatch(/999999 não está na lista/);
    expect(gravacoes(chamadas)).toHaveLength(0);
    expect(leitor().value).toBe('');
    bipar('230076');
    await waitFor(() => expect(gravacoes(chamadas)).toHaveLength(1));
  });

  it('tecla digitada com o foco solto (depois de um clique) volta para o leitor', async () => {
    servidor();
    abrir();
    await pronto();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    /* A primeira tecla é a que se perderia: ela volta para o leitor. As
       seguintes já caem nele direto. */
    fireEvent.keyDown(document, { key: '3' });
    expect(document.activeElement).toBe(leitor());
    expect(leitor().value).toBe('3');
  });

  it('peça que não era esperada em casa entra como 1 encontrada, sem perguntar nada', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('400001');
    await waitFor(() => expect(gravacoes(chamadas)[0]!.corpo).toMatchObject({ sku: '400001', contado: 1 }));
    expect(screen.getByLabelText('Encontradas')).toBeTruthy();
  });

  it('rede instável: a gravação tenta de novo sozinha e não se perde', async () => {
    const { contagem } = servidor({ falhar500: 2 });
    abrir();
    await pronto();
    bipar('230076');
    await waitFor(() => expect(contagem.get('230076|')?.contado).toBe(3), { timeout: 6000 });
    expect(screen.queryByText('Não salvos')).toBeNull();
  }, 10000);

  it('recusa do servidor fica visível como "não salvo" e trava o encerramento', async () => {
    servidor({ recusar: '230076' });
    abrir();
    await pronto();
    bipar('230076');
    await waitFor(() => expect(screen.getByText('Não salvos')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Concluir$/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/ainda não foi salva/)).toBeTruthy();
    expect((within(dialogo).getByRole('button', { name: /Encerrar parcial/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('K — escolher o aro troca a conferência do código pela do aro, com o esperado dele', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('310928');
    await waitFor(() => expect(gravacoes(chamadas)[0]!.corpo).toMatchObject({ sku: '310928', codigoInteiro: true, faltando: 0 }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Aro 16' } });
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'DELETE' && c.busca === 'variacao=')).toBe(true));
    await waitFor(() => expect(gravacoes(chamadas).at(-1)!.corpo).toMatchObject({ sku: '310928', variacao: 'Aro 16', faltando: 0 }));
    expect(document.activeElement).toBe(leitor());
  });

  it('L — "+ Adicionar variação" cria, confere a peça na variação nova e volta ao leitor', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('310928');
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar variação' }));
    fireEvent.change(screen.getByLabelText('Nova variação'), { target: { value: 'Aro 20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/inventarios/42/variacoes'
      && c.corpo?.valor === 'Aro 20')).toBe(true));
    await waitFor(() => expect(gravacoes(chamadas).at(-1)!.corpo).toMatchObject({ sku: '310928', variacao: 'Aro 20', contado: 1 }));
    await waitFor(() => expect(document.activeElement).toBe(leitor()));
  });

  it('pausado: o leitor não aceita leitura', async () => {
    servidor({ pausado: true });
    abrir();
    expect(await screen.findByText(/Pausado\./, {}, { timeout: 3000 })).toBeTruthy();
    expect(leitor().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Abrir câmera/ })).toBeNull();
  });
});

describe('a câmera segue a mesma regra', () => {
  it('uma leitura da câmera confere a referência (faltando 0), e a mesma etiqueta de novo não soma', async () => {
    const { chamadas } = servidor();
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Abrir câmera/ }, { timeout: 3000 }));
    await screen.findByRole('region', { name: 'Leitor de etiquetas' });
    proximoCodigo.valor = '230076';
    await waitFor(() => expect(gravacoes(chamadas)).toHaveLength(1), { timeout: 4000 });
    expect(gravacoes(chamadas)[0]!.corpo).toMatchObject({ sku: '230076', faltando: 0 });
    proximoCodigo.valor = null;
    fireEvent.change(screen.getByLabelText('Código da etiqueta'), { target: { value: '230076' } });
    fireEvent.click(screen.getByRole('button', { name: 'Contar' }));
    await waitFor(() => expect(screen.getAllByRole('status').some((el) => /Já conferido/.test(el.textContent ?? ''))).toBe(true));
    expect(gravacoes(chamadas)).toHaveLength(1);
    expect(chamadas.some((c) => c.metodo === 'POST' && c.caminho === '/api/inventarios')).toBe(false);
  });
});
