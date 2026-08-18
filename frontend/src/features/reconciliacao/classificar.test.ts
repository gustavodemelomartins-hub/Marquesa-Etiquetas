import { describe, expect, it } from 'vitest';
import { analisarRelato, classificarEstoque } from './classificar';
import type { SyncReport } from '../../types/sync';

function relato(p: Partial<SyncReport> = {}): SyncReport {
  return {
    ok: true,
    pedidosLidos: 0,
    vendasCriadas: 0,
    itensIgnorados: [],
    produtosEnviados: 0,
    mudancas: [],
    semEmpurrar: [],
    semeados: [],
    naoSemeados: [],
    pausado: null,
    seco: true,
    ...p,
  };
}

describe('classificarEstoque', () => {
  it('zerar um produto que estava vendendo é sempre perigoso', () => {
    const r = classificarEstoque(3, 0);
    expect(r.risco).toBe('perigoso');
    expect(r.motivo).toContain('Tira o produto do ar');
  });

  it('produto que já estava em zero e continua em zero não é perigoso', () => {
    expect(classificarEstoque(0, 0).risco).toBe('trivial');
  });

  it('tirar muitas peças do ar de uma vez é perigoso mesmo sem zerar', () => {
    expect(classificarEstoque(9, 2).risco).toBe('perigoso');
    expect(classificarEstoque(9, 2).motivo).toContain('7 peças');
  });

  it('diferença de uma peça é rotina, nos dois sentidos', () => {
    expect(classificarEstoque(4, 5).risco).toBe('trivial');
    expect(classificarEstoque(5, 4).risco).toBe('trivial');
  });

  it('a assimetria é deliberada: colocar 4 confere, tirar 4 confere, tirar 5 é perigoso', () => {
    /* Tirar do ar é pior que colocar: a peça deixa de vender e ninguém
       fica sabendo. Colocar demais vira um pedido cancelado. */
    expect(classificarEstoque(1, 5).risco).toBe('confere');
    expect(classificarEstoque(6, 2).risco).toBe('confere');
    expect(classificarEstoque(7, 2).risco).toBe('perigoso');
  });

  it('o motivo diz os dois números, não só o rótulo', () => {
    expect(classificarEstoque(1, 4).motivo).toContain('1 → 4');
  });
});

describe('analisarRelato', () => {
  const EM = '2026-08-18T09:00:00.000Z';

  it('converte cada mudança da rodada seca em uma linha do diff', () => {
    const a = analisarRelato(
      relato({
        mudancas: [
          { sku: 'A', desc: 'Colar', de: 2, para: 4, zera: false },
          { sku: 'B', desc: 'Anel', de: 3, para: 0, zera: true },
        ],
      }),
      EM,
    );
    expect(a.itens).toHaveLength(2);
    expect(a.resumo.total).toBe(2);
    expect(a.resumo.zerando).toBe(1);
    expect(a.simulado).toBe(false);
  });

  it('ordena por atenção: o perigoso vem antes do trivial', () => {
    const a = analisarRelato(
      relato({
        mudancas: [
          { sku: 'TRIVIAL', desc: 'x', de: 4, para: 5, zera: false },
          { sku: 'PERIGO', desc: 'y', de: 8, para: 0, zera: true },
          { sku: 'CONFERE', desc: 'z', de: 1, para: 4, zera: false },
        ],
      }),
      EM,
    );
    expect(a.itens.map((i) => i.sku)).toEqual(['PERIGO', 'CONFERE', 'TRIVIAL']);
  });

  it('dentro do mesmo risco, a mudança maior vem primeiro', () => {
    const a = analisarRelato(
      relato({
        mudancas: [
          { sku: 'MENOR', desc: 'x', de: 10, para: 0, zera: true },
          { sku: 'MAIOR', desc: 'y', de: 40, para: 0, zera: true },
        ],
      }),
      EM,
    );
    expect(a.itens.map((i) => i.sku)).toEqual(['MAIOR', 'MENOR']);
  });

  it('extrai o nome da variação de mudanças que têm varianteId', () => {
    const a = analisarRelato(
      relato({
        mudancas: [
          { sku: 'ANEL', desc: 'Anel Solitário · 16', de: 2, para: 1, zera: false, varianteId: 'v1' },
          { sku: 'COLAR', desc: 'Colar Simples', de: 2, para: 1, zera: false },
        ],
      }),
      EM,
    );
    const anel = a.itens.find((i) => i.sku === 'ANEL');
    const colar = a.itens.find((i) => i.sku === 'COLAR');
    expect(anel?.variacao).toBe('16');
    expect(colar?.variacao).toBeNull();
    /* O id precisa distinguir variações do mesmo código. */
    expect(anel?.id).toBe('ANEL|16|estoque_loja');
    expect(colar?.id).toBe('COLAR||estoque_loja');
  });

  it('duas variações do mesmo código geram ids diferentes', () => {
    const a = analisarRelato(
      relato({
        mudancas: [
          { sku: 'X', desc: 'Anel · 16', de: 1, para: 2, zera: false, varianteId: 'a' },
          { sku: 'X', desc: 'Anel · 18', de: 1, para: 3, zera: false, varianteId: 'b' },
        ],
      }),
      EM,
    );
    const ids = new Set(a.itens.map((i) => i.id));
    expect(ids.size).toBe(2);
  });

  it('conta por risco', () => {
    const a = analisarRelato(
      relato({
        mudancas: [
          { sku: 'A', desc: 'a', de: 5, para: 0, zera: true },
          { sku: 'B', desc: 'b', de: 1, para: 2, zera: false },
          { sku: 'C', desc: 'c', de: 2, para: 3, zera: false },
        ],
      }),
      EM,
    );
    expect(a.resumo.porRisco.perigoso).toBe(1);
    expect(a.resumo.porRisco.trivial).toBe(2);
    expect(a.resumo.porRisco.confere).toBe(0);
  });

  it('separa as pendências por motivo, sem misturar', () => {
    const a = analisarRelato(
      relato({
        semEmpurrar: [
          { sku: 'D', desc: 'd', casa: 1, naLoja: 2, motivo: 'duplicado', atributos: [], variacoes: [] },
          { sku: 'M', desc: 'm', casa: 1, naLoja: 2, motivo: 'maleta', atributos: [], variacoes: [] },
          { sku: 'S', desc: 's', casa: 1, naLoja: 2, motivo: 'sem_reparticao', atributos: [], variacoes: [] },
        ],
      }),
      EM,
    );
    const tipos = a.resumo.pendencias.map((p) => p.tipo);
    expect(tipos).toContain('duplicado');
    expect(tipos).toContain('maleta');
    expect(tipos).toContain('variacao_sem_reparticao');
    expect(a.resumo.pendencias.every((p) => p.quantidade === 1)).toBe(true);
  });

  it('anuncia venda do site que não casou com o catálogo', () => {
    const a = analisarRelato(
      relato({
        itensIgnorados: [
          { pedido: 1234, sku: 'FANTASMA', nome: 'Colar X' },
          { pedido: 1235, sku: 'FANTASMA', nome: 'Colar X' },
        ],
      }),
      EM,
    );
    const p = a.resumo.pendencias.find((x) => x.tipo === 'pedido_sem_sku');
    expect(p?.quantidade).toBe(2);
    /* Os SKUs saem sem repetir — é uma lista de códigos, não de itens. */
    expect(p?.skus).toEqual(['FANTASMA']);
  });

  it('anuncia código que a loja discorda do nosso total', () => {
    const a = analisarRelato(
      relato({
        naoSemeados: [
          { sku: 'X', total: 6, somaLoja: 9, variacoes: [{ nome: '16', estoque: 9 }] },
        ],
      }),
      EM,
    );
    expect(a.resumo.pendencias.some((p) => p.tipo === 'variacao_soma_nao_bate')).toBe(true);
  });

  it('relato vazio não é erro: é a loja em dia', () => {
    const a = analisarRelato(relato(), EM);
    expect(a.itens).toHaveLength(0);
    expect(a.resumo.pendencias).toHaveLength(0);
    expect(a.resumo.zerando).toBe(0);
  });

  it('não inventa data: usa a que recebeu', () => {
    expect(analisarRelato(relato(), EM).resumo.em).toBe(EM);
  });
});
