// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendenciasArea, type Pendencia } from './PendenciasArea';
import type { Connection } from '../../services/client';

const conexao: Connection = { url: 'http://api.local', key: 'chave' };

interface Chamada { metodo: string; caminho: string; corpo: unknown }
let chamadas: Chamada[] = [];
let lista: Pendencia[] = [];

function responder(dados: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
    const caminho = url.replace(conexao.url, '');
    const metodo = init.method ?? 'GET';
    const corpo = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    chamadas.push({ metodo, caminho, corpo });
    if (metodo === 'GET' && caminho.startsWith('/api/pendencias')) {
      return responder({ ok: true, resumo: { total: lista.length, adiadas: 0, porTipo: {} }, pendencias: lista });
    }
    /* Resolver: o caso some da lista, porque ela é derivada do estado. */
    lista = [];
    return responder({ ok: true, resumo: 'feito' });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const base = (over: Partial<Pendencia>): Pendencia => ({
  chave: 'x', tipo: 'maleta', grupo: 'Maletas', status: 'aberta', ...over,
});

function abrir() {
  return render(<PendenciasArea conexao={conexao} aoIr={() => {}} aoVoltar={() => {}} />);
}

describe('a central de pendências resolve na própria linha', () => {
  it('maleta sem variação: diz quantas de cada e grava pela rota da maleta', async () => {
    lista = [base({
      chave: 'maleta_variacao:15:132721', sku: '132721', produto: 'Brinco Libélula',
      motivo: 'variacao_da_maleta', maletaId: 15, revendedora: 'Luciana Souza', qtd: 1, fora: 1,
      explicacao: '1 peça saiu nesta maleta e não tem variação identificada.',
      variacoesPossiveis: [
        { nome: 'Cristal', varianteId: '1', saldo: 2 },
        { nome: 'Rosa', varianteId: '2', saldo: 1 },
      ],
    })];
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolver' }));
    fireEvent.change(screen.getByLabelText('Quantas Rosa'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar \(1 de 1\)/ }));
    await waitFor(() => expect(screen.getByText('Nada pendente')).toBeTruthy());
    const post = chamadas.find((c) => c.metodo === 'POST');
    expect(post?.caminho).toBe('/api/pendencias/variacao/maleta');
    expect(post?.corpo).toEqual({ maletaId: 15, sku: '132721', distribuicao: [{ variacao: 'Rosa', qtd: 1 }] });
    expect(screen.getByRole('status').textContent).toContain('variações da maleta registradas');
  });

  it('venda sem variação: escolhe uma e grava pela rota da venda', async () => {
    lista = [base({
      chave: 'venda_variacao:5:abc', tipo: 'venda', grupo: 'Vendas', sku: '346802',
      produto: 'Anel Infinito', motivo: 'variacao_da_venda', vendaId: 5, itemId: 'abc', qtd: 1,
      variacoesPossiveis: [{ nome: 'Aro 16', saldo: 1 }, { nome: 'Aro 18', saldo: 0 }],
    })];
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolver' }));
    fireEvent.click(screen.getByLabelText('Aro 18'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar variação' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST')).toBe(true));
    expect(chamadas.find((c) => c.metodo === 'POST')?.corpo)
      .toEqual({ vendaId: 5, sku: '346802', itemId: 'abc', variacao: 'Aro 18' });
  });

  it('repartir o estoque: só salva quando a soma fecha', async () => {
    lista = [base({
      chave: 'variacao:191620', tipo: 'variacao', grupo: 'Variações', sku: '191620', produto: 'Brinco Corações',
      motivo: 'sem_reparticao', qtd: 3,
      variacoesPossiveis: [{ nome: 'Cristal', varianteId: '10', saldo: 0 }, { nome: 'Rosa', varianteId: '11', saldo: 0 }],
    })];
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolver' }));
    fireEvent.change(screen.getByLabelText('Quantas Cristal'), { target: { value: '2' } });
    const botao = screen.getByRole('button', { name: /A soma dá 2, precisa dar 3/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Quantas Rosa'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar a repartição' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST')).toBe(true));
    const post = chamadas.find((c) => c.metodo === 'POST');
    expect(post?.caminho).toBe('/api/produtos/191620/variacoes/distribuir');
    expect(post?.corpo).toEqual({ distribuicao: [{ varianteId: '10', qtd: 2 }, { varianteId: '11', qtd: 1 }] });
  });

  it('cadastro incompleto: o preço se digita ali, e a foto sobe ali', async () => {
    lista = [base({
      chave: 'publicacao:326084', tipo: 'catalogo', grupo: 'Catálogo', sku: '326084',
      produto: 'Anel Abaulado', motivo: 'falta_informacao', falta: ['preco', 'foto'],
      explicacao: 'Falta preço, foto original.',
    })];
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolver' }));
    expect(screen.getByRole('button', { name: 'Subir foto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Preço de 326084'), { target: { value: '89.90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'PATCH')).toBe(true));
    const patch = chamadas.find((c) => c.metodo === 'PATCH');
    expect(patch?.caminho).toBe('/api/produtos/326084');
    expect(patch?.corpo).toEqual({ preco: 89.9 });
  });

  it('vínculo de cliente: a pessoa decide se é a mesma', async () => {
    lista = [base({
      chave: 'cliente:9', tipo: 'cliente', grupo: 'Clientes', cliente: 'Maria A. Lima', qtd: 3,
      motivo: 'vinculo_em_duvida', revisaoId: 9, candidatoId: 42, candidato: 'Maria Aparecida Lima',
    })];
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolver' }));
    fireEvent.click(screen.getByRole('button', { name: 'É a mesma pessoa' }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === 'POST')).toBe(true));
    const post = chamadas.find((c) => c.metodo === 'POST');
    expect(post?.caminho).toBe('/api/clientes/revisao/9');
    expect(post?.corpo).toEqual({ decisao: 'vincular', clienteId: 42 });
  });

  it('revisar depois pede a data e grava o adiamento', async () => {
    lista = [base({ chave: 'nuvemshop:26', tipo: 'nuvemshop', grupo: 'Nuvemshop', vendaId: 26, motivo: 'erro' })];
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar depois' }));
    fireEvent.change(screen.getByLabelText('Voltar para a lista em'), { target: { value: '2099-01-10' } });
    const botoes = screen.getAllByRole('button', { name: 'Revisar depois' });
    fireEvent.click(botoes[botoes.length - 1] as HTMLElement);
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/pendencias/adiar')).toBe(true));
    expect(chamadas.find((c) => c.caminho === '/api/pendencias/adiar')?.corpo)
      .toEqual({ chave: 'nuvemshop:26', ate: '2099-01-10' });
  });

  it('o aviso de variação que vem da maleta leva à pendência da maleta', async () => {
    lista = [
      base({ chave: 'variacao:122809', tipo: 'variacao', grupo: 'Variações', sku: '122809', produto: 'Brinco Quadrado', motivo: 'maleta' }),
      base({ chave: 'maleta_variacao:3:122809', sku: '122809', produto: 'Brinco Quadrado', motivo: 'variacao_da_maleta', maletaId: 3 }),
      base({ chave: 'maleta_variacao:3:999', sku: '999', produto: 'Outra peça', motivo: 'variacao_da_maleta', maletaId: 3 }),
    ];
    abrir();
    await screen.findByText('Outra peça · 999');
    const resolver = screen.getAllByRole('button', { name: 'Resolver' });
    fireEvent.click(resolver[resolver.length - 1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar a pendência da maleta' }));
    expect((screen.getByPlaceholderText(/Buscar por peça/) as HTMLInputElement).value).toBe('122809');
    expect(screen.queryByText('Outra peça · 999')).toBeNull();
  });
});
