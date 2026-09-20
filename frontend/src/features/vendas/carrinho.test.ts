import { describe, it, expect } from 'vitest';
import {
  corpoDaVenda, descontoDoCarrinho, impedimentos, linhaDoProduto,
  totalDaLinha, totalDoCarrinho, type LinhaDoCarrinho,
} from './carrinho';
import type { ProdutoDoEstado } from './tipos';

const produto = (p: Partial<ProdutoDoEstado> = {}): ProdutoDoEstado => ({
  sku: '100101', desc: 'Colar Lua Cheia', cat: 'Colar', preco: 189, semPreco: false,
  qtd: 40, consignado: 0, disponivel: 40, status: 'ativo', fotoStatus: null, ...p,
});

const linha = (p: Partial<LinhaDoCarrinho> = {}): LinhaDoCarrinho => ({
  ...linhaDoProduto(produto()), ...p,
});

const HOJE = '2026-09-20';

describe('as contas do carrinho', () => {
  it('total da linha é preço cobrado vezes quantidade, não o de tabela', () => {
    expect(totalDaLinha(linha({ preco: 150, qtd: 2 }))).toBe(300);
  });

  it('o desconto é derivado dos dois preços, nunca digitado', () => {
    expect(descontoDoCarrinho([linha({ preco: 150, qtd: 2 })])).toBe(78);
    expect(descontoDoCarrinho([linha()])).toBe(0);
  });

  it('centavos não escapam pela soma', () => {
    const l = linha({ precoTabela: 0.1, preco: 0.1, qtd: 3 });
    expect(totalDoCarrinho([l])).toBe(0.3);
  });
});

describe('o que impede a venda de ser registrada', () => {
  it('carrinho válido não tem impedimento', () => {
    expect(impedimentos([linha()], 'Vitória', HOJE, HOJE)).toEqual([]);
  });

  it('sem cliente e sem peça, as duas coisas são ditas', () => {
    const e = impedimentos([], '', HOJE, HOJE);
    expect(e).toContain('Diga para quem é esta venda.');
    expect(e).toContain('A venda está sem nenhuma peça.');
  });

  /* §28 — a venda pode ser de ontem. De amanhã, não. */
  it('venda no futuro é recusada', () => {
    const e = impedimentos([linha()], 'Vitória', '2026-09-21', HOJE);
    expect(e.some((x) => x.includes('ainda não chegou'))).toBe(true);
  });

  it('não vende mais do que está disponível', () => {
    const e = impedimentos([linha({ qtd: 41, disponivel: 40 })], 'Vitória', HOJE, HOJE);
    expect(e.some((x) => x.includes('só tem 40 disponível'))).toBe(true);
  });

  /* O caso que uma linha sozinha não pega: duas linhas da mesma peça, cada
     uma dentro do limite, somando acima dele. */
  it('duas linhas da mesma peça somam contra o mesmo saldo', () => {
    const e = impedimentos(
      [linha({ qtd: 30, disponivel: 40 }), linha({ qtd: 30, disponivel: 40 })],
      'Vitória', HOJE, HOJE,
    );
    expect(e.some((x) => x.includes('as linhas somam 60'))).toBe(true);
  });

  /* §24 — preço NULL não é zero, e peça sem preço não é vendável. */
  it('peça sem preço cadastrado não passa', () => {
    const e = impedimentos([linha({ precoTabela: 0, preco: 0 })], 'Vitória', HOJE, HOJE);
    expect(e.some((x) => x.includes('sem preço cadastrado'))).toBe(true);
  });

  /* A regra que transforma desconto em informação. */
  it('preço diferente do de tabela exige motivo', () => {
    const semMotivo = impedimentos([linha({ preco: 150 })], 'Vitória', HOJE, HOJE);
    expect(semMotivo.some((x) => x.includes('motivo do preço diferente'))).toBe(true);

    const comMotivo = impedimentos(
      [linha({ preco: 150, descontoRotulo: 'Grupo VIP' })], 'Vitória', HOJE, HOJE,
    );
    expect(comMotivo).toEqual([]);
  });
});

describe('o corpo que sobe para o backend', () => {
  it('manda só os campos que a rota aceita', () => {
    const c = corpoDaVenda({
      linhas: [linha({ qtd: 2 })],
      clienteId: 7, clienteNome: 'Vitória Prado', data: '2026-09-10',
      pago: true, dataPagamento: '2026-09-12', observacao: '  ',
    });
    expect(c).toEqual({
      clienteId: 7,
      clienteNome: 'Vitória Prado',
      data: '2026-09-10',
      pago: true,
      dataPagamento: '2026-09-12',
      itens: [{ sku: '100101', qtd: 2, preco: 189 }],
    });
  });

  /* §30 — a data do pagamento só existe quando houve pagamento. Mandá-la
     numa venda a receber seria afirmar um fato que não aconteceu. */
  it('venda a receber não leva data de pagamento', () => {
    const c = corpoDaVenda({
      linhas: [linha()], clienteId: null, clienteNome: 'Bruna',
      data: '2026-09-10', pago: false, dataPagamento: '2026-09-12', observacao: '',
    });
    expect('dataPagamento' in c).toBe(false);
    expect('clienteId' in c).toBe(false);
  });

  it('o motivo do desconto viaja junto com o preço diferente', () => {
    const c = corpoDaVenda({
      linhas: [linha({ preco: 150, descontoRotulo: ' Grupo VIP ' })],
      clienteId: null, clienteNome: 'Bruna', data: '2026-09-10',
      pago: false, dataPagamento: null, observacao: '',
    });
    expect(c.itens[0]).toEqual({ sku: '100101', qtd: 1, preco: 150, descontoRotulo: 'Grupo VIP' });
  });
});
