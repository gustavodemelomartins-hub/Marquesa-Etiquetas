import { describe, expect, it } from 'vitest';
import {
  aplicaveis, motivosDaLinha, pedidoDaLinha, temResultado,
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
  conferidosItens: [
    {
      sku: '100200', desc: 'Anel Abaulado', cat: 'Anel', variacao: null,
      contado: 5, esperado: 5, aviso: null,
    },
  ],
  pecasContadas: 41,
  faltando: [
    {
      sku: '214299', desc: 'Pingente Filho Verde', cat: 'Pingente', preco: 89,
      variacao: null, varianteId: null,
      contado: 2, esperado: 4, dif: -2, sugestao: -2,
      deltaPos: 0, aviso: null, valor: 178, aplicado: false, saidaId: null,
      motivoAplicado: null, declarado: false, motivo: null,
    },
    {
      sku: '185126', desc: 'Argola Borboleta', cat: 'Argola', preco: 79,
      variacao: 'Aro 12', varianteId: '99',
      contado: 1, esperado: 2, dif: -1, sugestao: -1,
      deltaPos: -1, aviso: 'mexeu depois que você contou: 1 saída',
      valor: 79, aplicado: true, saidaId: 501,
      motivoAplicado: 'Saiu sem lançamento', declarado: false, motivo: null,
    },
  ],
  sobrando: [
    {
      sku: '996655', desc: 'Colar Cordão Baiano', cat: 'Colar', preco: 139,
      variacao: null, varianteId: null,
      contado: 5, esperado: 3, dif: 2, sugestao: 2,
      deltaPos: 0, aviso: null, valor: 278, aplicado: false, saidaId: null,
      motivoAplicado: null, declarado: false, motivo: null,
    },
  ],
  naoConferido: [
    {
      sku: '392441', desc: 'Colar Coração Vazado', cat: 'Colar', variacao: null,
      esperado: 7, motivo: null,
    },
  ],
  naoComparavel: [
    {
      sku: '881420', desc: 'Brinco Gota Cravejada', cat: 'Brinco', variacao: null,
      naoIdentificado: true, contado: 3,
      motivo: '3 peças contadas sem dizer qual variação.',
    },
  ],
  desconhecidos: [],
  contagemCompleta: false,
  motivos: [
    { id: 'nao_encontrada', rotulo: 'Não encontrada na casa', sentido: 'saida', explica: '' },
    { id: 'entrou_sem_lancar', rotulo: 'Entrou sem lançamento', sentido: 'entrada', explica: '' },
    { id: 'erro_de_contagem', rotulo: 'Erro de contagem anterior', sentido: 'ambos', explica: '' },
    { id: 'outro', rotulo: 'Outro', sentido: 'ambos', explica: '', livre: true },
  ],
  conciliacao: {
    divergencias: 3, resolvidas: 1, pendentes: 2,
    bloqueadas: 1, naoConferidos: 1, conciliado: false,
  },
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
  it('o pedido de ajuste leva o código, a variação e o MOTIVO — nenhuma quantidade', () => {
    expect(pedidoDaLinha(RESPOSTA.faltando[0] as LinhaDeDiferenca, 'Não encontrada na casa'))
      .toEqual({ sku: '214299', motivo: 'Não encontrada na casa' });
    expect(pedidoDaLinha(RESPOSTA.faltando[1] as LinhaDeDiferenca, 'Quebrada ou danificada'))
      .toEqual({ sku: '185126', variacao: 'Aro 12', motivo: 'Quebrada ou danificada' });
    for (const l of [...RESPOSTA.faltando, ...RESPOSTA.sobrando]) {
      const pedido = pedidoDaLinha(l, 'Erro de contagem anterior');
      expect(pedido).not.toHaveProperty('qtd');
      expect(pedido).not.toHaveProperty('contado');
    }
  });

  /* O MOTIVO não é um enfeite do frontend: a lista vem do servidor, dentro
     da resposta, e ele RECUSA aplicar sem um. Uma lista escrita aqui
     divergiria da dele na primeira mudança, e "quantas peças perdi por
     saída sem lançamento" voltaria a depender da grafia de quem digitou. */
  it('a lista de motivos vem do servidor, e não é escrita na tela', () => {
    expect(RESPOSTA.motivos.length).toBeGreaterThan(0);
    expect(RESPOSTA.motivos.map((m) => m.id)).toContain('outro');
  });

  /* Um motivo de sobra oferecido numa falta seria um caminho que não
     explica nada: "entrou sem lançamento" para uma peça que sumiu. */
  it('cada lado da diferença recebe só os motivos que fazem sentido nele', () => {
    const naFalta = motivosDaLinha(RESPOSTA.motivos, -2).map((m) => m.id);
    expect(naFalta).toContain('nao_encontrada');
    expect(naFalta).not.toContain('entrou_sem_lancar');

    const naSobra = motivosDaLinha(RESPOSTA.motivos, 2).map((m) => m.id);
    expect(naSobra).toContain('entrou_sem_lancar');
    expect(naSobra).not.toContain('nao_encontrada');

    /* `ambos` aparece nos dois — erro de contagem e "Outro". */
    for (const lista of [naFalta, naSobra]) {
      expect(lista).toContain('erro_de_contagem');
      expect(lista).toContain('outro');
    }
  });

  /* A CONCILIAÇÃO responde "posso concluir isto agora?" sem obrigar a tela
     a refazer a conta — e `bloqueadas` fica FORA de `pendentes` porque um
     código não comparável espera uma variação, não uma decisão de estoque. */
  it('a conciliação diz quanto falta decidir, e separa o que está bloqueado', () => {
    const c = RESPOSTA.conciliacao;
    expect(c.resolvidas + c.pendentes).toBe(c.divergencias);
    expect(c.conciliado).toBe(false);
    expect(c.bloqueadas).toBe(RESPOSTA.naoComparavel.length);
  });
});
