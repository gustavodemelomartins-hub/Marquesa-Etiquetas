import { describe, it, expect } from 'vitest';
import { resumirSaidas, intervaloDoAtalho } from './analise';
import type { SaidaSemFaturamento } from './tipos';

const saida = (p: Partial<SaidaSemFaturamento>): SaidaSemFaturamento => ({
  id: 1, tipo: 'brinde', tipoRotulo: 'Brinde', sentido: 'saida',
  data: '2026-09-20', sku: '100001', produto: 'Anel', variacao: null,
  varianteId: null, qtd: 1, motivo: null, observacao: null, movimentoId: 1,
  estoqueRefletido: true, origemUsuario: null, inventarioId: null,
  estornada: false, estornoEm: null, estornoMotivo: null,
  origemRegistro: 'manual', historicoItemId: null,
  criadoEm: '2026-09-20 10:00:00', atualizadoEm: null,
  ...p,
});

describe('resumo da análise de saídas', () => {
  it('conta peças por motivo, e a estornada fica fora da conta', () => {
    const r = resumirSaidas([
      saida({ id: 1, tipo: 'brinde', qtd: 2 }),
      saida({ id: 2, tipo: 'sorteio', qtd: 3 }),
      saida({ id: 3, tipo: 'brinde', qtd: 5, estornada: true }),
    ]);
    expect(r.pecasRetiradas).toBe(5);
    expect(r.pecasEstornadas).toBe(5);
    expect(r.lancamentos).toBe(2);
    expect(r.porMotivo.find((m) => m.tipo === 'brinde')!.pecas).toBe(2);
    expect(r.porMotivo.find((m) => m.tipo === 'sorteio')!.pecas).toBe(3);
  });

  /* `entrada` é a SOBRA de uma contagem — peça que voltou. Somá-la como
     saída esconderia a sobra, que é o fato mais interessante ali. */
  it('a entrada de perda subtrai, em vez de somar', () => {
    const r = resumirSaidas([
      saida({ id: 1, tipo: 'perda', qtd: 4 }),
      saida({ id: 2, tipo: 'perda', qtd: 1, sentido: 'entrada' }),
    ]);
    expect(r.porMotivo.find((m) => m.tipo === 'perda')!.pecas).toBe(3);
    expect(r.pecasRetiradas).toBe(3);
  });

  /* A REGRA que esta tela existe para não violar: não há coluna de custo
     em lugar nenhum, e `produtos.preco` é preço de VENDA. Um custo
     calculado aqui faria uma peça dada de brinde "custar" o que ela teria
     rendido. `null` é a resposta; zero seria uma afirmação. */
  it('custo é null, nunca zero, e o número de registros sem custo é dito', () => {
    const r = resumirSaidas([saida({ id: 1, qtd: 2 }), saida({ id: 2, qtd: 1 })]);
    expect(r.custoLiquido).toBeNull();
    expect(r.custoEstornado).toBeNull();
    expect(r.custoDasSaidas).toBeNull();
    expect(r.custoPorPeca).toBeNull();
    expect(r.porMotivo.every((m) => m.custo === null)).toBe(true);
    expect(r.semCusto).toBe(2);
  });

  it('sem saída nenhuma não há "maior motivo"', () => {
    expect(resumirSaidas([]).maiorMotivo).toBeNull();
    /* E com tudo estornado também não: não sobrou peça retirada. */
    expect(resumirSaidas([saida({ estornada: true })]).maiorMotivo).toBeNull();
  });

  it('o maior motivo é o de mais peças, não o de mais lançamentos', () => {
    const r = resumirSaidas([
      saida({ id: 1, tipo: 'brinde', qtd: 1 }),
      saida({ id: 2, tipo: 'brinde', qtd: 1 }),
      saida({ id: 3, tipo: 'sorteio', qtd: 9 }),
    ]);
    expect(r.maiorMotivo!.tipo).toBe('sorteio');
  });
});

describe('recorte de período', () => {
  it('"tudo" não manda data nenhuma ao servidor', () => {
    expect(intervaloDoAtalho('tudo')).toEqual({ de: null, ate: null });
  });

  it('7 e 30 dias contam para trás a partir de hoje', () => {
    const hoje = new Date('2026-09-23T12:00:00Z');
    expect(intervaloDoAtalho('7d', hoje)).toEqual({ de: '2026-09-16', ate: '2026-09-23' });
    expect(intervaloDoAtalho('30d', hoje)).toEqual({ de: '2026-08-24', ate: '2026-09-23' });
  });
});
