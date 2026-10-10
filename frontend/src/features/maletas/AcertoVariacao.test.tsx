// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcertoMaletaFluxo } from './AcertoMaletaFluxo';
import type { Connection } from '../../services/client';
import type { Variant } from '../../types/api';
import { emCasa, estadoDeTeste, maleta, revendedora } from '../../testing/fixtures';
import { semVariacaoNaMaleta } from '../../domain/maletas';

vi.mock('./api');
import * as api from './api';

afterEach(() => { cleanup(); vi.resetAllMocks(); });

const conexao: Connection = { url: 'http://api.local', key: 'chave' };
const aro = (nome: string, varianteId: string): Variant =>
  ({ nome, atributo: 'Tamanho', varianteId, estoqueLoja: null, qtd: 1 } as unknown as Variant);
const anel = emCasa('A1', 4, { cat: 'Anel', preco: 79, variacoes: [aro('nº18', '9001'), aro('nº24', '9002')] });
const liso = emCasa('L1', 2, { cat: 'Colar', preco: 50 });
const m = maleta({ id: 3, revId: 1, itens: { A1: 2, L1: 1 }, precos: { A1: 79, L1: 50 } });
const estado = estadoDeTeste({ produtos: [anel, liso], revendedoras: [revendedora({ id: 1, nome: 'Luciana' })], maletas: [m] });

describe('§67 — variação não informada na maleta', () => {
  it('conta só código com variação, e só o que a maleta não sabe', () => {
    expect(semVariacaoNaMaleta(m, 'A1', anel)).toBe(2);
    expect(semVariacaoNaMaleta(m, 'L1', liso)).toBe(0);
    expect(semVariacaoNaMaleta({ ...m, variacoes: { A1: [{ variacao: 'nº18', qtd: 1 }] } }, 'A1', anel)).toBe(1);
  });

  it('no acerto, a peça que VOLTOU tem a variação perguntada; sem fechar, não grava', async () => {
    vi.mocked(api.encerrarAcerto).mockResolvedValue({
      ok: true, vendaId: null, novaMaletaId: null,
      acerto: { enviadas: 3, devolvidas: 3, vendidas: 0, perdas: 0, baixas: 0, totalVendido: 0, comissao: 0, liquido: 0 },
    } as never);
    render(<AcertoMaletaFluxo aberto conexao={conexao} estado={estado} maleta={m} revendedora={estado.revendedoras[0]!}
      aoFechar={() => {}} aoConcluir={() => {}} />);
    const painel = screen.getByRole('dialog', { name: 'Acerto da maleta 3' });
    expect(within(painel).queryByText(/sem variação informada/)).toBeNull();

    fireEvent.change(within(painel).getByLabelText('Devolvidas de A1'), { target: { value: '2' } });
    fireEvent.change(within(painel).getByLabelText('Devolvidas de L1'), { target: { value: '1' } });
    expect(within(painel).getByText(/2 unidades do código A1 nesta maleta sem variação informada/)).toBeTruthy();
    expect(within(painel).queryByLabelText(/Devolvidas de L1 na variação/)).toBeNull();
    expect(within(painel).getByRole('button', { name: 'Revisar acerto' })).toHaveProperty('disabled', true);

    fireEvent.change(within(painel).getByLabelText('Devolvidas de A1 na variação nº24'), { target: { value: '2' } });
    expect(within(painel).getByRole('button', { name: 'Revisar acerto' })).toHaveProperty('disabled', false);
    fireEvent.click(within(painel).getByRole('button', { name: 'Revisar acerto' }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Confirmar e encerrar maleta' }));
    await waitFor(() => expect(api.encerrarAcerto).toHaveBeenCalledWith(conexao, 3, {
      devolvidas: { A1: 2, L1: 1 }, faltas: [],
      variacoes: { A1: [{ variacao: 'nº24', varianteId: '9002', qtd: 2 }] },
    }));
  });

  it('o que NÃO voltou não é perguntado: venda sem variação continua sem variação', async () => {
    render(<AcertoMaletaFluxo aberto conexao={conexao} estado={estado} maleta={m} revendedora={estado.revendedoras[0]!}
      aoFechar={() => {}} aoConcluir={() => {}} />);
    const painel = screen.getByRole('dialog', { name: 'Acerto da maleta 3' });
    expect(within(painel).queryByLabelText(/na variação/)).toBeNull();
    expect(within(painel).getByRole('button', { name: 'Revisar acerto' })).toHaveProperty('disabled', false);
  });
});
