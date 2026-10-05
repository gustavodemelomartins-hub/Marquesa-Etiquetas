// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../../services/client';
import type { ProdutoDoEstado } from '../vendas/tipos';
import { AjustarEstoque } from './AjustarEstoque';
import { previaDoAjuste } from './ajuste';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

/** O anel do caso real (05/10/2026): 8 no sistema, 1 com a Luciana, e ela
 *  comprou 7. Só os campos que a tela lê. */
const ANEL = {
  sku: '256359', desc: 'Anel Inspiração Cartier Banho de Ouro 18k', cat: 'Anel', preco: 89,
  qtd: 8, consignado: 1, disponivel: 7, status: 'ativo',
  variacoes: [{ nome: 'n°17', qtd: 0 }, { nome: 'n°21', qtd: 0 }],
} as unknown as ProdutoDoEstado;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function servidor(resposta: (corpo: Record<string, unknown>) => [unknown, number]) {
  const chamadas: { caminho: string; corpo: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const caminho = String(url).replace('http://api.local', '');
    const corpo = init?.body ? JSON.parse(String(init.body)) : {};
    chamadas.push({ caminho, corpo });
    const [c, s] = resposta(corpo);
    return new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });
  }));
  return chamadas;
}

describe('previaDoAjuste', () => {
  it('calcula a diferença e o que fica em casa', () => {
    const p = previaDoAjuste(8, 1, '7', 'correcao_cadastro', '');
    expect([p.para, p.diferenca, p.emCasaAntes, p.emCasaDepois, p.bloqueio]).toEqual([7, -1, 7, 6, null]);
  });
  it('bloqueia o que o servidor recusaria', () => {
    expect(previaDoAjuste(8, 1, '', 'x', '').bloqueio).toMatch(/Digite/);
    expect(previaDoAjuste(8, 1, '6.5', 'x', '').bloqueio).toMatch(/inteiro/);
    expect(previaDoAjuste(8, 1, '-1', 'x', '').bloqueio).toMatch(/inteiro/);
    expect(previaDoAjuste(8, 1, '8', 'x', '').bloqueio).toMatch(/igual/);
    expect(previaDoAjuste(8, 2, '1', 'x', '').bloqueio).toMatch(/2 peças estão com revendedoras/);
    expect(previaDoAjuste(8, 1, '7', '', '').bloqueio).toMatch(/motivo/);
    expect(previaDoAjuste(8, 1, '7', 'outro', '  ').bloqueio).toMatch(/Outro/);
    expect(previaDoAjuste(8, 1, '7', 'outro', 'achei').bloqueio).toBeNull();
  });
});

describe('AjustarEstoque', () => {
  it('mostra a diferença antes de gravar e manda a quantidade certa com o motivo', async () => {
    const chamadas = servidor(() => [{ ok: true, de: 8, para: 7, diferenca: -1 }, 200]);
    const aoAjustar = vi.fn();
    render(<AjustarEstoque conexao={conexao} peca={ANEL} aoFechar={() => {}} aoAjustar={aoAjustar} />);

    expect(screen.getByText('Quantidade atual (total)')).toBeTruthy();
    const confirmar = screen.getByRole('button', { name: 'Confirmar ajuste' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Quantidade correta/), { target: { value: '7' } });
    expect(screen.getByText(/total 8 → 7 · em casa 7 → 6/)).toBeTruthy();
    expect(confirmar.disabled).toBe(true); // falta o motivo

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'correcao_cadastro' } });
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: 'comprei 7' } });
    /* Razão sem saldo por aro: a tela NÃO pede variação (regra 2). */
    expect(screen.queryByLabelText('Em qual variação')).toBeNull();
    expect(confirmar.disabled).toBe(false);
    fireEvent.click(confirmar);

    await waitFor(() => expect(aoAjustar).toHaveBeenCalled());
    expect(chamadas[0]!.caminho).toBe('/api/produtos/256359/ajustar-estoque');
    expect(chamadas[0]!.corpo).toEqual({
      quantidadeAtual: 8, quantidadeCorreta: 7, motivo: 'correcao_cadastro', observacao: 'comprei 7',
    });
    expect(String(aoAjustar.mock.calls[0]![0])).toMatch(/8 → 7/);
  });

  it('não deixa o total ficar abaixo do que está com revendedoras', () => {
    servidor(() => [{}, 200]);
    render(<AjustarEstoque conexao={conexao} peca={ANEL} aoFechar={() => {}} aoAjustar={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Quantidade correta/), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'contagem_fisica' } });
    expect(screen.getByText(/1 peça está com revendedoras/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Confirmar ajuste' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('código com saldo por aro pede a variação; a recusa do servidor aparece e traz os aros', async () => {
    const comAro = { ...ANEL, variacoes: [{ nome: 'Aro 16', qtd: 2 }, { nome: 'Aro 18', qtd: 6 }] } as unknown as ProdutoDoEstado;
    const chamadas = servidor((c) => (c.variacao === 'Aro 18'
      ? [{ ok: true }, 200]
      : [{ erro: 'Diga em qual variação está a diferença.', variacoes: [{ nome: 'Aro 18', saldo: 6 }] }, 409]));
    const aoAjustar = vi.fn();
    render(<AjustarEstoque conexao={conexao} peca={comAro} aoFechar={() => {}} aoAjustar={aoAjustar} />);
    fireEvent.change(screen.getByLabelText(/Quantidade correta/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'contagem_fisica' } });
    const confirmar = screen.getByRole('button', { name: 'Confirmar ajuste' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Em qual variação'), { target: { value: 'Aro 18' } });
    expect(confirmar.disabled).toBe(false);
    fireEvent.click(confirmar);
    await waitFor(() => expect(aoAjustar).toHaveBeenCalled());
    expect(chamadas[0]!.corpo.variacao).toBe('Aro 18');
  });

  it('a recusa do servidor (saldo mudou) aparece e não fecha a tela', async () => {
    servidor(() => [{ erro: 'O estoque de 256359 mudou enquanto você ajustava: era 8, agora é 7.' }, 409]);
    const aoAjustar = vi.fn();
    render(<AjustarEstoque conexao={conexao} peca={ANEL} aoFechar={() => {}} aoAjustar={aoAjustar} />);
    fireEvent.change(screen.getByLabelText(/Quantidade correta/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'correcao_cadastro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' }));
    expect(await screen.findByText(/mudou enquanto você ajustava/)).toBeTruthy();
    expect(aoAjustar).not.toHaveBeenCalled();
  });
});
