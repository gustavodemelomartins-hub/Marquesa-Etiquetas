// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../../services/client';

vi.mock('../../components/scanner/leitorDeEtiqueta', () => ({
  temCamera: () => false,
  montarLeitor: async () => async () => null,
  criarBipe: () => () => {},
}));

import { InventarioArea } from './InventarioArea';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

interface Chamada { metodo: string; caminho: string; corpo: Record<string, unknown> | null }

/** O ESPERADO do cenário: três categorias, sete códigos, e três deles nunca
 *  bipados — o retrato de quem parou no meio. */
const ESPERADOS = [
  { sku: '500001', desc: 'Colar Bate', cat: 'Colar', preco: 89, total: 3, consignado: 0, esperado: 3 },
  { sku: '500002', desc: 'Brinco Falta', cat: 'Brinco', preco: 49, total: 3, consignado: 0, esperado: 3 },
  { sku: '500003', desc: 'Anel Some', cat: 'Anel', preco: 129, total: 3, consignado: 0, esperado: 3 },
  { sku: '500004', desc: 'Pulseira Sobra', cat: 'Pulseira', preco: 59, total: 1, consignado: 0, esperado: 1 },
  { sku: '500005', desc: 'Colar Na Maleta', cat: 'Colar', preco: 99, total: 4, consignado: 4, esperado: 0 },
  { sku: '500006', desc: 'Brinco Parado', cat: 'Brinco', preco: 39, total: 2, consignado: 0, esperado: 2 },
  { sku: '500007', desc: 'Anel Parado', cat: 'Anel', preco: 149, total: 5, consignado: 0, esperado: 5 },
];

/** O servidor em miniatura. Ele guarda o CORPO de `/concluir`, que é a única
 *  coisa que importa nas provas de encerramento: é lá que viaja — ou não —
 *  a declaração de que a conferência terminou. */
function servidor(opcoes: { concluido?: boolean; resultado?: unknown } = {}) {
  const chamadas: Chamada[] = [];
  const contagem = new Map<string, number>([
    ['500001', 3], ['500002', 2], ['500004', 2],
  ]);
  let status = opcoes.concluido ? 'concluido' : 'aberto';

  const detalhe = () => ({
    id: 42, status, iniciadoEm: '2026-09-24T09:00:00Z',
    pausadoEm: null, concluidoEm: null,
    contagem: [...contagem].map(([sku, contado], i) => ({
      sku, variacao: null, contado,
      contadoEm: `2026-09-24T${String(10 + i).padStart(2, '0')}:00:00Z`,
    })),
    naoIdentificado: [],
    cobertura: { conferidos: contagem.size, total: ESPERADOS.length },
    esperados: status === 'aberto' ? ESPERADOS : [],
  });

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const caminho = String(url).replace('http://api.local', '').split('?')[0] ?? '';
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ metodo, caminho, corpo });

    const json = (c: unknown, s = 200) => new Response(JSON.stringify(c), {
      status: s, headers: { 'Content-Type': 'application/json' },
    });

    if (caminho === '/api/inventarios' && metodo === 'GET') {
      return json([{
        id: 42, numero: 1, status, iniciadoEm: '2026-09-24T09:00:00Z',
        pausadoEm: null, concluidoEm: null, divergentes: 0, pecas: 7, naoComparaveis: 0,
      }]);
    }
    if (caminho === '/api/inventarios/42' && metodo === 'GET') return json(detalhe());
    if (caminho === '/api/inventarios/42/concluir' && metodo === 'POST') {
      status = 'concluido';
      return json({ ok: true });
    }
    if (caminho === '/api/inventarios/42/resultado' && metodo === 'GET') {
      if (status !== 'concluido') {
        return json({ erro: 'Este inventário ainda não foi concluído', status }, 409);
      }
      return json(opcoes.resultado ?? RESULTADO_DECLARADO);
    }
    if (caminho === '/api/inventarios/42/aplicar' && metodo === 'POST') return json({ ok: true, aplicados: [] });
    return json({});
  }));

  return { chamadas };
}

const MOTIVOS = [
  { id: 'nao_encontrada', rotulo: 'Não encontrada na casa', sentido: 'saida' as const, explica: '', classe: 'ajuste' as const },
  { id: 'entrou_sem_lancar', rotulo: 'Entrou sem lançamento', sentido: 'entrada' as const, explica: '', classe: 'ajuste' as const },
  { id: 'erro_de_contagem', rotulo: 'Erro de contagem anterior', sentido: 'ambos' as const, explica: '', classe: 'ajuste' as const },
  { id: 'perda', rotulo: 'Perda confirmada', sentido: 'saida' as const, explica: '', classe: 'perda' as const },
  { id: 'outro', rotulo: 'Outro', sentido: 'ambos' as const, explica: '', livre: true, classe: 'ajuste' as const },
];

/** O retrato de um inventário fechado COM a declaração: os dois códigos
 *  nunca bipados viraram falta, e a linha diz que o zero foi declarado. */
const RESULTADO_DECLARADO = {
  ok: true, id: 42, concluidoEm: '2026-09-24',
  cobertura: { conferidos: 3, total: 7 },
  conferido: 1, conferidos: 1,
  conferidosItens: [{
    sku: '500001', desc: 'Colar Bate', cat: 'Colar', variacao: null,
    contado: 3, esperado: 3, aviso: null,
  }],
  pecasContadas: 7,
  faltando: [
    {
      sku: '500002', desc: 'Brinco Falta', cat: 'Brinco', preco: 49,
      variacao: null, varianteId: null, contado: 2, esperado: 3, dif: -1, sugestao: -1,
      deltaPos: 0, aviso: null, valor: 49, aplicado: false, saidaId: null,
      motivoAplicado: null, declarado: false, motivo: null,
    },
    {
      sku: '500003', desc: 'Anel Some', cat: 'Anel', preco: 129,
      variacao: null, varianteId: null, contado: 0, esperado: 3, dif: -3, sugestao: -3,
      deltaPos: 0, aviso: null, valor: 387, aplicado: false, saidaId: null,
      motivoAplicado: null, declarado: true,
      motivo: 'Não foi bipada, e a contagem foi declarada completa.',
    },
  ],
  sobrando: [
    {
      sku: '500004', desc: 'Pulseira Sobra', cat: 'Pulseira', preco: 59,
      variacao: null, varianteId: null, contado: 2, esperado: 1, dif: 1, sugestao: 1,
      deltaPos: 0, aviso: null, valor: 59, aplicado: false, saidaId: null,
      motivoAplicado: null, declarado: false, motivo: null,
    },
  ],
  naoConferido: [],
  naoComparavel: [],
  desconhecidos: [],
  contagemCompleta: true,
  motivos: MOTIVOS,
  conciliacao: {
    divergencias: 3, resolvidas: 0, pendentes: 3,
    bloqueadas: 0, naoConferidos: 0, conciliado: false,
  },
};

/** E o retrato de quem encerrou SEM declarar: nada virou falta. */
const RESULTADO_PARCIAL = {
  ...RESULTADO_DECLARADO,
  faltando: [RESULTADO_DECLARADO.faltando[0]],
  naoConferido: [
    { sku: '500003', desc: 'Anel Some', cat: 'Anel', variacao: null, esperado: 3, motivo: null },
    { sku: '500006', desc: 'Brinco Parado', cat: 'Brinco', variacao: null, esperado: 2, motivo: null },
    { sku: '500007', desc: 'Anel Parado', cat: 'Anel', variacao: null, esperado: 5, motivo: null },
  ],
  contagemCompleta: false,
  conciliacao: {
    divergencias: 2, resolvidas: 0, pendentes: 2,
    bloqueadas: 0, naoConferidos: 3, conciliado: false,
  },
};

/** Um inventário CONCLUÍDO não abre sozinho: ele não está "em andamento",
 *  e a tela não pode escolher por ninguém qual dos inventários antigos
 *  mostrar. Quem o abre é o clique no histórico — e é esse o caminho que
 *  a pessoa faz. */
const abrirRevisao = async () => {
  render(<InventarioArea conexao={conexao} estado={null} aoMudarEstoque={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /Inventário #1/ }));
  await screen.findByText('Finalizado');
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('a revisão do inventário', () => {
  it('abre pela conciliação: quanto falta decidir', async () => {
    servidor({ concluido: true });
    await abrirRevisao();

    expect(await screen.findByText(/0 de 3 divergências resolvidas/)).toBeTruthy();
    expect(screen.getByText(/Faltam 3 decisões sua/)).toBeTruthy();
  });

  /* O que está certo fica resumido e recolhido; o que está errado fica na
     frente. É a regra inteira da reorganização. */
  it('o que bateu fica recolhido, e o que precisa de ação fica aberto', async () => {
    servidor({ concluido: true });
    await abrirRevisao();

    const resumo = await screen.findByText(/peças? conferidas? sem diferença/);
    expect(resumo.closest('details')!.open).toBe(false);

    /* As listas que pedem decisão não estão atrás de um clique. */
    expect(screen.getByText(/^Faltando · 4 peças$/)).toBeTruthy();
    expect(screen.getByText(/^Sobrando · 1 peça$/)).toBeTruthy();
  });

  /* A diferença de uma peça que NINGUÉM bipou tem outra história da de uma
     peça contada a menos, e a linha precisa dizer qual é qual. */
  it('a falta declarada se identifica como declarada', async () => {
    servidor({ concluido: true });
    await abrirRevisao();

    await screen.findByText(/Anel Some/);
    expect(screen.getByText(/não foi bipada — virou diferença/)).toBeTruthy();
    expect(screen.getByText(/A conferência foi declarada completa/)).toBeTruthy();
  });

  it('não deixa resolver nada sem motivo, e o motivo viaja na chamada', async () => {
    const { chamadas } = servidor({ concluido: true });
    await abrirRevisao();

    await screen.findByText(/Anel Some/);
    const resolver = screen.getByRole('button', { name: /^Resolver / });
    /* Nada marcado: não há o que resolver. */
    expect((resolver as HTMLButtonElement).disabled).toBe(true);

    /* Marcar uma linha sem motivo NÃO destrava o botão — e a barra diz
       quantas estão sem. */
    fireEvent.click(screen.getByLabelText('Resolver Anel Some'));
    await waitFor(() => expect(screen.getByText(/1 sem motivo/)).toBeTruthy());
    expect((screen.getByRole('button', { name: /^Resolver / }) as HTMLButtonElement).disabled).toBe(true);

    /* Com o motivo escolhido, o botão libera. */
    fireEvent.change(screen.getByLabelText('Motivo da diferença de Anel Some'), {
      target: { value: 'nao_encontrada' },
    });
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /^Resolver / }) as HTMLButtonElement).disabled).toBe(false);
    });

    /* §55 — a linha diz o que a escolha vira: ajuste, não perda. */
    expect(screen.getByText('Vira ajuste de inventário — não é perda.')).toBeTruthy();

    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /^Resolver / }));
    expect(String(confirmar.mock.calls[0]?.[0])).toMatch(/Nenhuma é registrada como perda/);

    await waitFor(() => {
      const c = chamadas.find((x) => x.caminho.endsWith('/aplicar'));
      expect(c).toBeTruthy();
      /* O RÓTULO viaja — é ele que entra na razão — e o id junto, porque é
         o id que decide ajuste × perda (§55). Nenhuma quantidade vai junto:
         ela já foi decidida no fechamento. */
      expect(c!.corpo).toEqual({
        itens: [{ sku: '500003', motivo: 'Não encontrada na casa', motivoId: 'nao_encontrada' }],
      });
    });
  });

  /* Com centenas de itens, abrir um por um seria a tarde inteira. */
  it('o motivo em lote preenche as selecionadas, respeitando o lado da diferença', async () => {
    servidor({ concluido: true });
    await abrirRevisao();

    await screen.findByText(/Anel Some/);
    fireEvent.click(screen.getByLabelText('Resolver Anel Some'));
    fireEvent.click(screen.getByLabelText('Resolver Brinco Falta'));
    fireEvent.click(screen.getByLabelText('Resolver Pulseira Sobra'));

    fireEvent.change(
      screen.getByLabelText('Aplicar um motivo a todas as selecionadas'),
      { target: { value: 'nao_encontrada' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar aos selecionados' }));

    await waitFor(() => {
      /* As duas FALTAS receberam o motivo de saída… */
      expect((screen.getByLabelText('Motivo da diferença de Anel Some') as HTMLSelectElement).value)
        .toBe('nao_encontrada');
      expect((screen.getByLabelText('Motivo da diferença de Brinco Falta') as HTMLSelectElement).value)
        .toBe('nao_encontrada');
    });
    /* …e a SOBRA não: "não encontrada na casa" não explica peça que sobrou. */
    expect((screen.getByLabelText('Motivo da diferença de Pulseira Sobra') as HTMLSelectElement).value)
      .toBe('');
    /* Ela continua marcada e sem motivo, e a barra cobra isso. */
    expect(screen.getByText(/1 sem motivo/)).toBeTruthy();
  });

  it('cada lado da diferença só recebe os motivos que explicam aquele lado', async () => {
    servidor({ concluido: true });
    await abrirRevisao();

    await screen.findByText(/Anel Some/);
    const naFalta = screen.getByLabelText('Motivo da diferença de Anel Some');
    const naSobra = screen.getByLabelText('Motivo da diferença de Pulseira Sobra');

    expect(within(naFalta).queryByText('Não encontrada na casa')).toBeTruthy();
    expect(within(naFalta).queryByText('Entrou sem lançamento')).toBeNull();
    expect(within(naSobra).queryByText('Entrou sem lançamento')).toBeTruthy();
    expect(within(naSobra).queryByText('Não encontrada na casa')).toBeNull();
  });

  /* Encerrar sem declarar continua sendo um final legítimo, e a revisão tem
     de dizer por que aqueles códigos não viraram nada. */
  it('sem a declaração, os não conferidos aparecem e continuam fora da conciliação', async () => {
    servidor({ concluido: true, resultado: RESULTADO_PARCIAL });
    await abrirRevisao();

    expect(await screen.findByText(/3 peças sem conferência/)).toBeTruthy();
    expect(screen.queryByText(/A conferência foi declarada completa/)).toBeNull();
    /* Duas divergências — não cinco. Os três sem bipe não entraram. */
    expect(screen.getByText(/0 de 2 divergências resolvidas/)).toBeTruthy();
    expect(screen.queryByLabelText('Resolver Anel Parado')).toBeNull();
  });

  /* §57 — peça com variação, contada com peça sem variação, num código cuja
     razão separa por aro: ajustar pede que ELA diga de qual variação é. */
  it('a diferença que pede a variação só é resolvida quando ela diz qual é', async () => {
    const comAro = {
      ...RESULTADO_PARCIAL,
      faltando: [{
        ...RESULTADO_DECLARADO.faltando[0], sku: '600001', desc: 'Anel Solitário', declarado: false,
        precisaVariacao: true, variacoes: [{ nome: 'n°16', contado: 2, esperado: 2 }, { nome: 'n°18', contado: 0, esperado: 2 }],
        naoInformada: { contado: 1 },
      }],
      conciliacao: { divergencias: 1, resolvidas: 0, pendentes: 1, bloqueadas: 0, naoConferidos: 3, conciliado: false },
    };
    const { chamadas } = servidor({ concluido: true, resultado: comAro });
    await abrirRevisao();
    await screen.findByText(/Anel Solitário/);
    expect(screen.getByText(/n°16 2 · sem variação 1/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Resolver Anel Solitário'));
    fireEvent.change(screen.getByLabelText('Motivo da diferença de Anel Solitário'), { target: { value: 'nao_encontrada' } });
    await waitFor(() => expect(screen.getByText(/1 sem a variação/)).toBeTruthy());
    expect((screen.getByRole('button', { name: /^Resolver / }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Variação da diferença de Anel Solitário'), { target: { value: 'n°18' } });
    await waitFor(() => expect((screen.getByRole('button', { name: /^Resolver / }) as HTMLButtonElement).disabled).toBe(false));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /^Resolver / }));
    await waitFor(() => {
      const c = chamadas.find((x) => x.caminho.endsWith('/aplicar'));
      expect(c!.corpo).toEqual({ itens: [{ sku: '600001', motivo: 'Não encontrada na casa', motivoId: 'nao_encontrada', destino: 'n°18' }] });
    });
  });
});
