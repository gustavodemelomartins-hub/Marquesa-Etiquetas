import { describe, expect, it } from 'vitest';
import {
  aplicaveis, pedidoDaLinha, temResultado,
  type LinhaDeDiferenca, type ResultadoDoInventario,
} from './resultado';

/** Uma resposta REAL de `GET /api/inventarios/:id/resultado`, montada campo a
 *  campo a partir de `api/src/inventario.js › relatorio()`.
 *
 *  O ponto deste arquivo é travar o formato. O adaptador anterior lia
 *  `{ itens: [{ sistema, diferenca }] }` — três nomes que a resposta nunca
 *  teve — e o erro era invisível das duas pontas: a tela mostrava "sem
 *  resultado" com naturalidade, e o botão de ajustar mandava uma lista vazia
 *  que o servidor aceitava sem reclamar. Nenhum teste olhava para o contrato,
 *  e por isso ele pôde divergir em silêncio.
 */
const RESPOSTA: ResultadoDoInventario = {
  ok: true,
  id: 12,
  concluidoEm: '2026-09-18',
  cobertura: { conferidos: 6, total: 9 },
  conferido: 3,
  conferidos: 3,
  pecasContadas: 41,
  faltando: [
    {
      sku: '214299', desc: 'Pingente Filho Verde', cat: 'Pingente', preco: 89,
      variacao: null, varianteId: null,
      contado: 2, esperado: 4, dif: -2, sugestao: -2,
      deltaPos: 0, aviso: null, valor: 178, aplicado: false, saidaId: null,
    },
    {
      sku: '185126', desc: 'Argola Borboleta', cat: 'Argola', preco: 79,
      variacao: 'Aro 12', varianteId: '99',
      contado: 1, esperado: 2, dif: -1, sugestao: -1,
      deltaPos: -1, aviso: 'mexeu depois que você contou: 1 saída',
      valor: 79, aplicado: true, saidaId: 501,
    },
  ],
  sobrando: [
    {
      sku: '996655', desc: 'Colar Cordão Baiano', cat: 'Colar', preco: 139,
      variacao: null, varianteId: null,
      contado: 5, esperado: 3, dif: 2, sugestao: 2,
      deltaPos: 0, aviso: null, valor: 278, aplicado: false, saidaId: null,
    },
  ],
  naoConferido: [
    { sku: '392441', desc: 'Colar Coração Vazado', cat: 'Colar', variacao: null, esperado: 7 },
  ],
  naoComparavel: [
    {
      sku: '881420', desc: 'Brinco Gota Cravejada', cat: 'Brinco', variacao: null,
      naoIdentificado: true, contado: 3,
      motivo: '3 peças contadas sem dizer qual variação.',
    },
  ],
  desconhecidos: [],
};

describe('o resultado do inventário', () => {
  it('reconhece a resposta concluída, e a recusa de 409 como recusa', () => {
    expect(temResultado(RESPOSTA)).toBe(true);
    expect(temResultado({ erro: 'Este inventário ainda não foi concluído' })).toBe(false);
    expect(temResultado(null)).toBe(false);
  });

  /* O defeito que este arquivo existe para impedir: ler um campo que a
     resposta não tem devolve `undefined`, e `undefined` some na tela sem
     parecer erro. */
  it('as linhas vêm em `faltando` e `sobrando`, nunca num campo `itens`', () => {
    expect('itens' in RESPOSTA).toBe(false);
    const linha = RESPOSTA.faltando[0] as LinhaDeDiferenca;
    expect(linha.esperado).toBe(4);
    expect(linha.dif).toBe(-2);
    /* `sistema` e `diferenca` eram os nomes do adaptador antigo. */
    expect((linha as unknown as Record<string, unknown>).sistema).toBeUndefined();
    expect((linha as unknown as Record<string, unknown>).diferenca).toBeUndefined();
  });

  it('só as linhas ainda não corrigidas são aplicáveis', () => {
    const podem = aplicaveis(RESPOSTA);
    expect(podem.map((l) => l.sku)).toEqual(['214299', '996655']);
    /* A linha já aplicada fica de fora: mandá-la faria o servidor recusar o
       lote INTEIRO por causa dela. */
    expect(podem.some((l) => l.aplicado)).toBe(false);
  });

  /* Não contado não é zero (D3), e contado sem identidade não é comparável
     (D5). Nenhum dos dois pode entrar num lote de correção — e nenhum deles
     mora em `faltando`/`sobrando`, que é o que os mantém separados. */
  it('não conferido e não comparável ficam fora do que se pode corrigir', () => {
    const skus = aplicaveis(RESPOSTA).map((l) => l.sku);
    expect(skus).not.toContain('392441');
    expect(skus).not.toContain('881420');
    expect(RESPOSTA.naoConferido[0]?.esperado).toBe(7);
    expect(RESPOSTA.naoComparavel[0]?.naoIdentificado).toBe(true);
  });

  /* A quantidade NÃO viaja: ela foi decidida no fechamento, e mandar um
     número novo deixaria a tela reabrir a comparação. A variação viaja
     quando existe — sem ela, duas variações do mesmo código com diferença
     são recusadas com 409, que é a regra 2 do CLAUDE.md aplicada. */
  it('o pedido de ajuste leva o código e a variação, e nenhuma quantidade', () => {
    expect(pedidoDaLinha(RESPOSTA.faltando[0] as LinhaDeDiferenca)).toEqual({ sku: '214299' });
    expect(pedidoDaLinha(RESPOSTA.faltando[1] as LinhaDeDiferenca))
      .toEqual({ sku: '185126', variacao: 'Aro 12' });
    for (const l of [...RESPOSTA.faltando, ...RESPOSTA.sobrando]) {
      expect(pedidoDaLinha(l)).not.toHaveProperty('qtd');
      expect(pedidoDaLinha(l)).not.toHaveProperty('contado');
    }
  });
});
