import { describe, expect, it } from 'vitest';
import {
  SEM_CATEGORIA, TODAS, caminhoDaEvolucao, evolucaoDaSessao, fatiaSelecionada,
  filtrarPorCategoria, progressoDaContagem,
  type ContadoDaContagem, type EsperadoDaContagem,
} from './progresso';

/** O PROGRESSO DA CONFERÊNCIA, provado sem tela.
 *
 *  O defeito que este arquivo existe para impedir é um só, e é de
 *  SIGNIFICADO, não de aritmética:
 *
 *      durante a contagem, "não conferido" não pode virar "faltando".
 *
 *  Uma barra que medisse "peças encontradas ÷ peças esperadas" começaria em
 *  0% e subiria devagar, e o vazio ao lado dela pareceria perda. Depois de
 *  vinte minutos a tela estaria dizendo "você perdeu 94% do estoque" — falso,
 *  e assustador. A medida certa é COBERTURA: quantos códigos já foram
 *  visitados. Ela nunca passa de 100% e não fala sobre estoque nenhum.
 */

const ESPERADOS: EsperadoDaContagem[] = [
  { sku: '1', desc: 'Brinco Argola', cat: 'Brinco', esperado: 4 },
  { sku: '2', desc: 'Brinco Gota', cat: 'Brinco', esperado: 2 },
  { sku: '3', desc: 'Brinco Pérola', cat: 'Brinco', esperado: 6 },
  { sku: '4', desc: 'Anel Abaulado', cat: 'Anel', esperado: 3 },
  { sku: '5', desc: 'Anel Solitário', cat: 'Anel', esperado: 5 },
  { sku: '6', desc: 'Colar Veneziana', cat: 'Colar', esperado: 7 },
  { sku: '7', desc: 'Peça Órfã', cat: null, esperado: 1 },
];

const contagem = (linhas: [string, number, string?][]): Map<string, ContadoDaContagem> =>
  new Map(linhas.map(([sku, contado, em]) => [
    sku, { sku, contado, contadoEm: em ?? '2026-09-24T10:00:00Z' },
  ]));

describe('progresso da conferência', () => {
  it('sem nenhum bipe, o progresso é zero e NADA é falta', () => {
    const p = progressoDaContagem(ESPERADOS, new Map());
    expect(p.total.pct).toBe(0);
    expect(p.total.visitados).toBe(0);
    expect(p.total.codigos).toBe(7);
    /* O que o sistema diz haver continua sendo dito — é o tamanho da
       prateleira. O que NÃO existe em lugar nenhum é um número de "faltando"
       derivado de ninguém ter contado ainda. */
    expect(p.total.pecasEsperadas).toBe(28);
    expect(p.total.pecasContadas).toBe(0);
    expect(Object.keys(p.total)).not.toContain('faltando');
  });

  it('cada bipe move o progresso, e a conta é de CÓDIGOS percorridos', () => {
    const um = progressoDaContagem(ESPERADOS, contagem([['1', 4]]));
    expect(um.total.visitados).toBe(1);
    expect(um.total.pct).toBe(14); // 1/7

    const tres = progressoDaContagem(ESPERADOS, contagem([['1', 4], ['4', 3], ['6', 7]]));
    expect(tres.total.visitados).toBe(3);
    expect(tres.total.pct).toBe(43); // 3/7
    expect(tres.total.pecasContadas).toBe(14);
  });

  /* Contar MENOS do que o sistema diz é um resultado legítimo da contagem, e
     não pode derrubar o progresso: ela percorreu aquele código do mesmo
     jeito. Medir progresso em peças faria toda diferença parecer trabalho
     que não foi feito. */
  it('contar menos que o esperado não atrasa o progresso — o código foi visitado', () => {
    const p = progressoDaContagem(ESPERADOS, contagem([['1', 1], ['4', 0]]));
    expect(p.total.visitados).toBe(2);
    expect(p.total.pct).toBe(29); // 2/7, independente de terem batido
  });

  /* D2 — "conferi, não tem nenhuma" é um resultado, não a ausência de um.
     Tratar o zero como não visitado apagaria a única resposta que a contagem
     tem para uma prateleira vazia. */
  it('contado ZERO conta como visitado', () => {
    const p = progressoDaContagem(ESPERADOS, contagem([['2', 0]]));
    expect(p.total.visitados).toBe(1);
    expect(p.total.pecasContadas).toBe(0);
  });

  it('nunca passa de 100%, mesmo contando mais peças do que o sistema diz', () => {
    const tudo = ESPERADOS.map((e) => [e.sku, e.esperado + 10] as [string, number]);
    const p = progressoDaContagem(ESPERADOS, contagem(tudo));
    expect(p.total.pct).toBe(100);
    expect(p.total.pecasContadas).toBeGreaterThan(p.total.pecasEsperadas);
  });

  /* ── os agrupamentos ─────────────────────────────────────────────── */

  it('bipar em categorias diferentes agrupa cada uma na sua', () => {
    const p = progressoDaContagem(ESPERADOS, contagem([['1', 4], ['2', 2], ['4', 3]]));

    const brinco = p.categorias.find((f) => f.cat === 'Brinco')!;
    expect(brinco.codigos).toBe(3);
    expect(brinco.visitados).toBe(2);
    expect(brinco.pct).toBe(67);
    expect(brinco.pecasContadas).toBe(6);

    const anel = p.categorias.find((f) => f.cat === 'Anel')!;
    expect(anel.codigos).toBe(2);
    expect(anel.visitados).toBe(1);
    expect(anel.pct).toBe(50);

    const colar = p.categorias.find((f) => f.cat === 'Colar')!;
    expect(colar.visitados).toBe(0);
    expect(colar.pct).toBe(0);

    /* A soma das fatias é o total — um agrupamento que não fecha estaria
       contando alguma peça duas vezes ou nenhuma. */
    expect(p.categorias.reduce((s, f) => s + f.codigos, 0)).toBe(p.total.codigos);
    expect(p.categorias.reduce((s, f) => s + f.visitados, 0)).toBe(p.total.visitados);
    expect(p.categorias.reduce((s, f) => s + f.pecasContadas, 0)).toBe(p.total.pecasContadas);
  });

  /* As categorias saem de `produtos.cat`, que vem dentro de `esperados` —
     nunca de uma lista escrita na tela. Uma constante erraria no dia em que
     a Sthefany criasse "Tornozeleira". */
  it('as categorias vêm dos dados, e peça sem categoria ganha um nome e vai para o fim', () => {
    const p = progressoDaContagem(ESPERADOS, new Map());
    expect(p.categorias.map((f) => f.cat)).toEqual(['Brinco', 'Anel', 'Colar', SEM_CATEGORIA]);
    /* Maior primeiro: quem abre a tela quer ver onde está o grosso do
       trabalho, e o buraco de cadastro não disputa o topo. */
    expect(p.categorias[0]!.codigos).toBe(3);
    expect(p.categorias.at(-1)!.cat).toBe(SEM_CATEGORIA);
  });

  it('uma categoria nova no catálogo aparece sozinha, sem ninguém cadastrar nada', () => {
    const comNova = [...ESPERADOS, { sku: '8', desc: 'Tornozeleira', cat: 'Tornozeleira', esperado: 2 }];
    const p = progressoDaContagem(comNova, new Map());
    expect(p.categorias.map((f) => f.cat)).toContain('Tornozeleira');
  });

  /* ── o filtro ────────────────────────────────────────────────────── */

  it('o filtro recorta os números para a categoria escolhida', () => {
    const p = progressoDaContagem(ESPERADOS, contagem([['1', 4], ['2', 2], ['4', 3]]));

    expect(fatiaSelecionada(p, TODAS).pct).toBe(43); // 3 de 7
    expect(fatiaSelecionada(p, 'Brinco').pct).toBe(67); // 2 de 3
    expect(fatiaSelecionada(p, 'Anel').pct).toBe(50); // 1 de 2
    expect(fatiaSelecionada(p, 'Colar').pct).toBe(0);
    /* Categoria que não existe cai no total em vez de quebrar a tela. */
    expect(fatiaSelecionada(p, 'Inexistente')).toBe(p.total);
  });

  it('a lista da contagem segue o mesmo filtro', () => {
    expect(filtrarPorCategoria(ESPERADOS, TODAS)).toHaveLength(7);
    expect(filtrarPorCategoria(ESPERADOS, 'Brinco').map((e) => e.sku)).toEqual(['1', '2', '3']);
    expect(filtrarPorCategoria(ESPERADOS, SEM_CATEGORIA).map((e) => e.sku)).toEqual(['7']);
  });

  /* ── pausar e retomar ────────────────────────────────────────────── */

  /* A contagem está no BANCO desde o primeiro bipe (D1): pausar não mexe
     nela. O progresso é derivado dessa mesma contagem, então ele tem de ser
     idêntico antes e depois — um número que mudasse ao pausar faria a pessoa
     achar que perdeu trabalho. */
  it('pausar e retomar não mexem no progresso: ele é derivado da contagem gravada', () => {
    const contados = contagem([['1', 4], ['4', 3], ['7', 1]]);
    const antes = progressoDaContagem(ESPERADOS, contados);
    const depois = progressoDaContagem(ESPERADOS, new Map(contados));
    expect(depois).toEqual(antes);
    expect(depois.total.pct).toBe(43);
  });

  /* ── a evolução da sessão ────────────────────────────────────────── */

  it('com menos de dois momentos distintos não existe curva', () => {
    expect(evolucaoDaSessao([])).toEqual([]);
    expect(evolucaoDaSessao([{ sku: '1', contado: 3, contadoEm: '2026-09-24T10:00:00Z' }])).toEqual([]);
    /* Dois bipes no MESMO instante também não desenham nada: um eixo sem
       largura não é um gráfico. */
    expect(evolucaoDaSessao([
      { sku: '1', contado: 3, contadoEm: '2026-09-24T10:00:00Z' },
      { sku: '2', contado: 1, contadoEm: '2026-09-24T10:00:00Z' },
    ])).toEqual([]);
  });

  it('a curva é ACUMULADA e termina no total de peças contadas', () => {
    const pontos = evolucaoDaSessao([
      { sku: '1', contado: 4, contadoEm: '2026-09-24T10:00:00Z' },
      { sku: '2', contado: 2, contadoEm: '2026-09-24T10:30:00Z' },
      { sku: '3', contado: 6, contadoEm: '2026-09-24T11:00:00Z' },
    ], 4);

    expect(pontos).toHaveLength(4);
    /* Nunca desce: uma curva que sobe e desce pareceria problema quando é só
       o ritmo de quem atendeu uma cliente no meio da contagem. */
    for (let i = 1; i < pontos.length; i += 1) {
      expect(pontos[i]!.acumulado).toBeGreaterThanOrEqual(pontos[i - 1]!.acumulado);
    }
    expect(pontos.at(-1)!.acumulado).toBe(12);
  });

  it('o caminho da sparkline sai em coordenadas 0–100 e não cresce sem limite', () => {
    const pontos = evolucaoDaSessao([
      { sku: '1', contado: 4, contadoEm: '2026-09-24T10:00:00Z' },
      { sku: '2', contado: 8, contadoEm: '2026-09-24T11:00:00Z' },
    ], 3);
    const d = caminhoDaEvolucao(pontos);
    expect(d.startsWith('M')).toBe(true);
    for (const n of d.match(/-?\d+\.\d+/g) ?? []) {
      expect(Number(n)).toBeGreaterThanOrEqual(0);
      expect(Number(n)).toBeLessThanOrEqual(100);
    }
    expect(caminhoDaEvolucao([])).toBe('');
  });
});
