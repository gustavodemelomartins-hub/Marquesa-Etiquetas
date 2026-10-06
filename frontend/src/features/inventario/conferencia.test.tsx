// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../../services/client';
import { efeitoDaLeitura, type Leitura, type LinhaContada } from './contagem';

vi.mock('../../components/scanner/leitorDeEtiqueta', () => ({
  temCamera: () => false,
  montarLeitor: async () => async () => null,
  criarBipe: () => () => {},
}));

import { InventarioArea } from './InventarioArea';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

interface Chamada { metodo: string; caminho: string; corpo: Record<string, unknown> | null }

/** O inventário #1 (id técnico 42) em miniatura: a contagem por leitura,
 *  com a mesma conta da tela. */
function servidor(opcoes: { pausado?: boolean; falhar503?: number } = {}) {
  const chamadas: Chamada[] = [];
  const contagem = new Map<string, LinhaContada[]>();
  let status = opcoes.pausado ? 'pausado' : 'aberto';
  let falhas = opcoes.falhar503 ?? 0;
  const esperados = [
    { sku: '256359', desc: 'Anel Inspiração Cartier', cat: 'Anel', total: 7, consignado: 1, esperado: 6,
      revendedoras: [{ nome: 'Evelyn Veiga', qtd: 1, maletaId: 17, variacoes: [] }],
      variacoes: [
        { nome: 'nº18', varianteId: 'local:a18', cadastro: 0, comRevendedoras: 0, esperado: null },
        { nome: 'nº21', varianteId: 'local:a21', cadastro: 0, comRevendedoras: 0, esperado: null },
        { nome: 'nº23', varianteId: 'local:a23', cadastro: 0, comRevendedoras: 0, esperado: null },
      ],
      razaoPorVariacao: false,
      naoInformada: { cadastro: 7, comRevendedoras: 1, esperado: null } },
    { sku: '347801', desc: 'Colar Coração', cat: 'Colar', total: 4, consignado: 0, esperado: 4, revendedoras: [] },
    { sku: '127513', desc: 'Brinco Palito', cat: 'Brinco', total: 3, consignado: 2, esperado: 1,
      revendedoras: [{ nome: 'Bruna Follei', qtd: 2, maletaId: 9, variacoes: [] }] },
  ];
  const detalhe = () => ({
    id: 42, numero: 1, status, iniciadoEm: '2026-10-05T18:34:05Z', pausadoEm: null, concluidoEm: null,
    contagem: [...contagem].flatMap(([sku, ls]) => ls.map((l) => ({
      sku, variacao: l.variacao || null, contado: l.contado, contadoEm: '2026-10-05T18:40:00Z' }))),
    cobertura: { conferidos: contagem.size, total: esperados.length },
    esperados,
    eventos: [],
  });

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    const caminho = String(url).replace('http://api.local', '').split('?')[0]!;
    const corpo = init?.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ metodo, caminho, corpo });
    const json = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });

    if (caminho === '/api/inventarios' && metodo === 'GET') {
      return json([{ id: 42, numero: 1, status, iniciadoEm: '2026-10-05T18:34:05Z', pausadoEm: null,
        concluidoEm: null, divergentes: 0, pecas: 0 }]);
    }
    if (caminho === '/api/inventarios/42' && metodo === 'GET') return json(detalhe());
    if (caminho === '/api/inventarios/42/leituras' && metodo === 'POST') {
      if (falhas > 0) { falhas -= 1; return json({ erro: 'instável' }, 503); }
      const l = corpo as unknown as Leitura;
      const ref = esperados.find((e) => e.sku === l.sku);
      const linhas = efeitoDaLeitura(l, contagem.get(l.sku) ?? [], ref);
      if (l.gesto === 'limpar') contagem.delete(l.sku); else contagem.set(l.sku, linhas);
      return json({ ok: true, sku: l.sku, linhas: contagem.get(l.sku) ?? [] });
    }
    if (caminho === '/api/inventarios/42/variacoes' && metodo === 'POST') {
      return json({ ok: true, criadas: [{ nome: `nº${corpo?.valor}`, varianteId: 'local:nova' }] }, 201);
    }
    if (caminho === '/api/inventarios/42/retomar') { status = 'aberto'; return json({ ok: true }); }
    if (caminho === '/api/inventarios/42/pausar') { status = 'pausado'; return json({ ok: true }); }
    if (caminho === '/api/inventarios/42/balanco') {
      return json({
        numero: 1,
        totais: { codigosEsperados: 3, pecasEsperadas: 11, codigosConferidos: 2, pecasConferidas: 8,
          naoConferidos: 1, pecasNaoConferidas: 1 },
        impacto: { reduzem: 1, pecasAMenos: 1, aumentam: 0, pecasAMais: 0, precisamVariacao: 0, naoConferidos: 1 },
        faltando: [{ sku: '256359', desc: 'Anel Inspiração Cartier', cat: 'Anel', contado: 5, esperado: 6, dif: -1,
          aviso: null, modo: 'codigo', variacoes: [{ nome: 'nº21', contado: 2, esperado: null }, { nome: 'nº23', contado: 2, esperado: null }],
          naoInformada: { contado: 1 }, distribuicaoContada: [{ nome: 'nº21', varianteId: 'local:a21', qtd: 2 }] }],
        sobrando: [],
        naoConferido: [{ sku: '127513', desc: 'Brinco Palito', cat: 'Brinco', esperado: 1 }],
        conferidosItens: [{ sku: '347801', desc: 'Colar Coração', cat: 'Colar', contado: 4, esperado: 4, aviso: null }],
        motivos: [
          { id: 'contagem_fisica', rotulo: 'Contagem física', sentido: 'ambos', classe: 'ajuste', explica: '' },
          { id: 'perda', rotulo: 'Perda confirmada', sentido: 'saida', classe: 'perda', explica: '' },
        ],
      });
    }
    if (caminho === '/api/inventarios/42/concluir') { status = 'concluido'; return json({ ok: true }); }
    if (caminho === '/api/inventarios/42/aplicar') return json({ ok: true, aplicados: [] });
    if (caminho === '/api/inventarios/42/variacoes/guardar') return json({ ok: true });
    if (caminho === '/api/inventarios/42/resultado') return json({ erro: 'carregando' }, 409);
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

const campo = () => screen.getByLabelText('Bipe a peça ou procure por código, nome ou variação') as HTMLInputElement;
const pronto = async () => {
  await waitFor(() => expect(campo().disabled).toBe(false), { timeout: 3000 });
};
const bipar = (codigo: string) => {
  fireEvent.change(campo(), { target: { value: codigo } });
  fireEvent.keyDown(campo(), { key: 'Enter' });
};
const leituras = (chamadas: Chamada[]) =>
  chamadas.filter((c) => c.caminho === '/api/inventarios/42/leituras').map((c) => c.corpo!);
const peca = () => screen.getByRole('region', { name: 'Peça em conferência' });
const numero = (rotulo: string) =>
  within(within(peca()).getByLabelText('Quantidades')).getByText(rotulo).nextSibling?.textContent;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('a conferência — um bipe é uma unidade', () => {
  it('mostra o número visível (#1), nunca o id técnico', async () => {
    servidor();
    abrir();
    await pronto();
    expect(screen.getByRole('heading', { name: 'Inventário #1' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/#42/);
  });

  it('um bipe = 1 unidade: Estoque 4 · Em casa 4 · Conferido 1 · Faltando 3', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('347801');
    await waitFor(() => expect(leituras(chamadas)).toHaveLength(1));
    expect(leituras(chamadas)[0]).toMatchObject({ sku: '347801', gesto: 'bipe' });
    expect(leituras(chamadas)[0]!.leituraId).toBeTruthy();
    expect(numero('Estoque total')).toBe('4');
    expect(numero('Em casa')).toBe('4');
    expect(numero('Conferido')).toBe('1');
    expect(numero('Faltando')).toBe('3');
    expect(screen.getByRole('status').textContent).toMatch(/1 unidade conferida · Colar Coração · 1 de 4/);
    expect(campo().value).toBe('');
  });

  it('segundo bipe acidental logo em seguida: NÃO soma, pergunta', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('347801');
    bipar('347801');
    await screen.findByText(/Essa peça acabou de ser lida\./);
    await waitFor(() => expect(leituras(chamadas)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Foi engano' }));
    expect(screen.queryByText(/Essa peça acabou de ser lida\./)).toBeNull();
    expect(leituras(chamadas)).toHaveLength(1);
    expect(numero('Conferido')).toBe('1');
  });

  it('segundo bipe legítimo: "Contar outra unidade" soma a segunda peça igual', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('347801');
    bipar('347801');
    fireEvent.click(await screen.findByRole('button', { name: 'Contar outra unidade' }));
    await waitFor(() => expect(leituras(chamadas)).toHaveLength(2));
    expect(numero('Conferido')).toBe('2');
  });

  it('o mesmo código depois da janela de repetição conta direto (duas peças iguais)', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    let agora = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => agora);
    bipar('347801');
    agora += 5_000;
    bipar('347801');
    await waitFor(() => expect(leituras(chamadas)).toHaveLength(2));
    expect(screen.queryByText(/Essa peça acabou de ser lida\./)).toBeNull();
  });

  it('variação: o bipe fica "sem variação", tocar no nº23 move a peça; + soma outra do mesmo aro', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('256359');
    await screen.findByText(/1 peça sem variação\./);
    fireEvent.click(within(peca()).getByRole('button', { name: 'nº23' }));
    await waitFor(() => expect(leituras(chamadas).at(-1)).toMatchObject({ gesto: 'mover', de: '', para: 'nº23' }));
    fireEvent.click(within(peca()).getByRole('button', { name: 'Contar mais uma — Conferido em nº23' }));
    await waitFor(() => expect(leituras(chamadas).at(-1)).toMatchObject({ gesto: 'mais', variacao: 'nº23' }));
    await waitFor(() => expect((within(peca()).getByLabelText('Conferido em nº23') as HTMLInputElement).value).toBe('2'));
    expect(numero('Conferido')).toBe('2');
  });

  it('criar variação no inventário: Variação 19, quantidade 1, salva sem sair da tela', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('256359');
    fireEvent.click(await within(peca()).findByRole('button', { name: /Criar variação/ }));
    fireEvent.change(within(peca()).getByLabelText('Variação'), { target: { value: '19' } });
    fireEvent.click(within(peca()).getByRole('button', { name: 'Salvar e continuar' }));
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/inventarios/42/variacoes')).toBe(true));
    const pedido = chamadas.find((c) => c.caminho === '/api/inventarios/42/variacoes')!.corpo!;
    expect(pedido).toMatchObject({ sku: '256359', valor: '19', quantidade: 1 });
  });

  it('variação que já existe ("N23" com nº23): avisa, não cria, e oferece contar nela', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('256359');
    fireEvent.click(await within(peca()).findByRole('button', { name: /Criar variação/ }));
    fireEvent.change(within(peca()).getByLabelText('Variação'), { target: { value: 'N23' } });
    expect(within(peca()).getAllByText(/Essa variação já existe: nº23\./).length).toBeGreaterThan(0);
    fireEvent.click(within(peca()).getByRole('button', { name: 'Salvar e continuar' }));
    expect(chamadas.some((c) => c.caminho === '/api/inventarios/42/variacoes')).toBe(false);
    fireEvent.click(within(peca()).getByRole('button', { name: 'Contar uma em nº23' }));
    await waitFor(() => expect(leituras(chamadas).at(-1)).toMatchObject({ gesto: 'mover', para: 'nº23' }));
  });

  it('peça com revendedora sem variação conhecida: diz "variação não informada" e não escolhe por ela', async () => {
    servidor();
    abrir();
    await pronto();
    bipar('256359');
    const fora = within(peca()).getByRole('region', { name: 'Com revendedoras' });
    expect(fora.textContent).toMatch(/Evelyn · 1 peça · variação não informada/);
    expect(within(fora).getByRole('button', { name: 'Identificar variação' })).toBeTruthy();
  });

  it('não conferidas: a lista mostra o que falta passar, e tocar abre a peça', async () => {
    servidor();
    abrir();
    await pronto();
    const lista = screen.getByRole('region', { name: 'Lista do inventário' });
    fireEvent.click(within(lista).getByRole('button', { name: /Brinco Palito, código 127513: Não conferida/ }));
    expect(within(peca()).getByText('Brinco Palito')).toBeTruthy();
    expect(numero('Com revendedoras')).toBe('2');
    expect(numero('Em casa')).toBe('1');
  });

  it('busca manual por nome: abre a peça sem contar', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('coração');
    expect(within(peca()).getByText('Colar Coração')).toBeTruthy();
    expect(leituras(chamadas)).toHaveLength(0);
  });

  it('"Estão todas aqui" confere o esperado de uma vez', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    bipar('347801');
    fireEvent.click(within(peca()).getByRole('button', { name: /Estão todas aqui \(4\)/ }));
    await waitFor(() => expect(leituras(chamadas).at(-1)).toMatchObject({ gesto: 'todas' }));
    await waitFor(() => expect(numero('Conferido')).toBe('4'));
    expect(numero('Faltando')).toBe('—');
  });

  it('rede instável: a leitura tenta de novo sozinha e não se perde', async () => {
    const { contagem } = servidor({ falhar503: 1 });
    abrir();
    await pronto();
    bipar('347801');
    await waitFor(() => expect(contagem.get('347801')?.[0]?.contado).toBe(1), { timeout: 4000 });
  });

  it('pausado: o campo não aceita leitura e "Continuar conferindo" retoma', async () => {
    const { chamadas } = servidor({ pausado: true });
    abrir();
    await screen.findByText(/Tudo o que você conferiu está guardado/);
    expect(campo().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar conferindo' }));
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/inventarios/42/retomar')).toBe(true));
  });

  it('balanço: mostra o impacto antes de finalizar e finaliza com "Contagem física", sem perda', async () => {
    const { chamadas } = servidor();
    abrir();
    await pronto();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar e finalizar' }));
    await screen.findByRole('heading', { name: 'Balanço do inventário #1' });
    const impacto = screen.getByRole('region', { name: 'O que vai acontecer' });
    expect(impacto.textContent).toMatch(/1 peça terá o estoque reduzido/);
    expect(impacto.textContent).toMatch(/1 peça não conferida continua como está/);
    expect(impacto.textContent).toMatch(/Nenhuma diferença vira perda/);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar inventário' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar e ajustar o estoque' }));
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/inventarios/42/variacoes/guardar')).toBe(true));
    const ordem = chamadas.map((c) => c.caminho).filter((c) => /concluir|aplicar|guardar/.test(c));
    expect(ordem).toEqual(['/api/inventarios/42/concluir', '/api/inventarios/42/aplicar', '/api/inventarios/42/variacoes/guardar']);
    const aplicar = chamadas.find((c) => c.caminho === '/api/inventarios/42/aplicar')!.corpo!;
    expect(aplicar.itens).toEqual([{ sku: '256359', motivo: 'Contagem física', motivoId: 'contagem_fisica' }]);
  });

  it('nenhuma informação técnica na tela', async () => {
    servidor();
    abrir();
    await pronto();
    bipar('256359');
    await screen.findByText(/1 peça sem variação\./);
    const texto = document.body.textContent ?? '';
    for (const proibido of [/local:/, /variante/i, /nao_/, /_id\b/, /painel clássico/i, /\/api\//, /undefined/, /\bnull\b/, /#42/]) {
      expect(texto).not.toMatch(proibido);
    }
  });
});
