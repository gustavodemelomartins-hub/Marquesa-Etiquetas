/** Propostas de composição para uma maleta nova.
 *
 *  Três estratégias, cada uma com a origem do critério declarada na própria
 *  proposta. Nenhuma delas usa modelo, aprendizado ou heurística oculta:
 *  são três ordenações diferentes sobre o MESMO conjunto de peças que a
 *  reserva liberou (ver `capacidade.ts`).
 *
 *  Duas garantias, testadas:
 *    · nenhum item passa de `produto.disponivel` menos a reserva;
 *    · o total de uma proposta nunca passa do que existe liberado.
 *
 *  Sobre "giro rápido": o giro REAL por peça exigiria vendas agregadas por
 *  SKU, e `GET /api/state` não traz isso — `maleta.acerto` só guarda os
 *  totais do acerto, e `GET /api/vendas` responde um dia por vez. Então a
 *  estratégia usa o que existe de verdade: a frequência com que cada
 *  categoria SAI em maleta, somando o histórico de consignação. A proposta
 *  diz isso na cara, em `base`. Trocar por giro de venda de verdade é
 *  acrescentar um endpoint, não reescrever isto.
 *
 *  Personalização por revendedora (fase seguinte): `pesosPorCategoria` é o
 *  ponto de entrada. `pesosDaRevendedora` já calcula, com dado real, o que
 *  cada pessoa costuma levar. Basta passar esse peso para gerar uma
 *  proposta específica para ela — nenhuma outra parte precisa mudar.
 */
import type { AppState, Product } from '../types/api';
import { corDaCategoria } from './categorias';
import { consignaveis, RESERVA_POR_MODO, type ConfigPlanejamento } from './capacidade';
import type { FatiaCategoria } from './estoque';

export type EstrategiaSugestao = 'equilibrada' | 'giro' | 'premium';

export interface ItemSugerido {
  sku: string;
  desc: string;
  cat: string;
  qtd: number;
  preco: number | null;
  /** Quanto existe em casa deste código hoje. Contexto para a revisão. */
  emCasa: number;
  /** Quanto a reserva liberou deste código. `qtd` nunca passa disto. */
  limite: number;
}

export interface Sugestao {
  estrategia: EstrategiaSugestao;
  nome: string;
  /** Uma frase: o que esta proposta prioriza. */
  explicacao: string;
  /** De qual dado real o critério saiu. */
  base: string;
  itens: ItemSugerido[];
  pecas: number;
  valor: number;
  porCategoria: FatiaCategoria[];
  /** Peças em casa (elegíveis) antes e depois desta maleta sair. */
  emCasaAntes: number;
  emCasaDepois: number;
  /** Peças que a reserva mantém em casa em qualquer cenário. */
  reservaMinima: number;
  alvo: number;
  /** `false` quando o estoque liberado não chegou ao alvo. */
  atingiuAlvo: boolean;
}

export interface OpcoesSugestao {
  /** Sobrescreve o tamanho alvo da configuração. */
  alvo?: number;
  /** Pesos por categoria para a estratégia "equilibrada". É por aqui que a
   *  personalização por revendedora entra depois. */
  pesosPorCategoria?: Record<string, number>;
}

/** Quanto cada categoria representa no que já saiu em maleta.
 *
 *  Dado real de `state.maletas` — todas as não canceladas, incluindo as
 *  encerradas. Vazio quando não há histórico. */
export function pesosHistoricosDeConsignacao(estado: AppState): Record<string, number> {
  const cat = new Map(estado.produtos.map((p) => [p.sku, p.cat || 'Outros']));
  const acc: Record<string, number> = {};
  for (const m of estado.maletas) {
    if (m.status === 'cancelada') continue;
    for (const [sku, q] of Object.entries(m.itens || {})) {
      const c = cat.get(sku) || 'Outros';
      acc[c] = (acc[c] || 0) + (Number(q) || 0);
    }
  }
  return acc;
}

/** O mesmo, restrito a uma revendedora. Já usa dado real; é o insumo da
 *  personalização individual sem nenhum modelo no meio. */
export function pesosDaRevendedora(estado: AppState, revId: number): Record<string, number> {
  const cat = new Map(estado.produtos.map((p) => [p.sku, p.cat || 'Outros']));
  const acc: Record<string, number> = {};
  for (const m of estado.maletas) {
    if (m.status === 'cancelada' || m.revId !== revId) continue;
    for (const [sku, q] of Object.entries(m.itens || {})) {
      const c = cat.get(sku) || 'Outros';
      acc[c] = (acc[c] || 0) + (Number(q) || 0);
    }
  }
  return acc;
}

interface Disponivel {
  produto: Product;
  cat: string;
  emCasa: number;
  limite: number;
}

/** O conjunto de onde toda proposta tira peça: o que a reserva liberou,
 *  menos os códigos sem preço.
 *
 *  §24: peça sem preço bloqueia o encerramento do acerto. Mandar uma na
 *  maleta é criar um impedimento futuro em silêncio, então elas ficam fora
 *  e a tela informa quantas peças isso representa. */
function conjunto(estado: AppState, reservaPct: number): Disponivel[] {
  return consignaveis(estado, reservaPct)
    .filter((c) => c.consignavel > 0 && c.produto.preco !== null)
    .map((c) => ({
      produto: c.produto,
      cat: c.produto.cat || 'Outros',
      emCasa: c.emCasa,
      limite: c.consignavel,
    }));
}

/** Reparte `alvo` peças entre categorias na proporção dos pesos, pelo
 *  método do maior resto — a soma das cotas fecha exatamente em `alvo`,
 *  sem sobra por arredondamento. */
function cotasPorCategoria(pesos: Record<string, number>, alvo: number): Record<string, number> {
  const pares = Object.entries(pesos).filter(([, peso]) => peso > 0);
  const soma = pares.reduce((s, [, peso]) => s + peso, 0);
  if (!soma || !pares.length) return {};

  const exatas = pares.map(([cat, peso]) => ({ cat, exata: (peso / soma) * alvo }));
  const cotas: Record<string, number> = {};
  let distribuido = 0;
  for (const e of exatas) {
    const piso = Math.floor(e.exata);
    cotas[e.cat] = piso;
    distribuido += piso;
  }
  const restos = [...exatas]
    .map((e) => ({ cat: e.cat, resto: e.exata - Math.floor(e.exata) }))
    .sort((a, b) => b.resto - a.resto);
  for (let i = 0; distribuido < alvo && i < restos.length; i++) {
    const cat = restos[i]!.cat;
    cotas[cat] = (cotas[cat] ?? 0) + 1;
    distribuido += 1;
  }
  return cotas;
}

/** Tira peças de uma categoria, uma por código de cada vez.
 *
 *  Round-robin em vez de esvaziar o código mais cheio primeiro: uma maleta
 *  com 12 códigos diferentes vende melhor que uma com 3 códigos repetidos,
 *  e o custo de espalhar é zero. */
function tirarDaCategoria(
  itens: Disponivel[],
  quantas: number,
  jaTirado: Map<string, number>,
): number {
  const ordenados = [...itens].sort(
    (a, b) => b.limite - a.limite || a.produto.sku.localeCompare(b.produto.sku),
  );
  let restante = quantas;
  let mexeu = true;
  while (restante > 0 && mexeu) {
    mexeu = false;
    for (const d of ordenados) {
      if (restante <= 0) break;
      const atual = jaTirado.get(d.produto.sku) || 0;
      if (atual >= d.limite) continue;
      jaTirado.set(d.produto.sku, atual + 1);
      restante -= 1;
      mexeu = true;
    }
  }
  return quantas - restante;
}

/** Monta uma proposta a partir de uma repartição por categoria. */
function montarPorPesos(
  pool: Disponivel[],
  pesos: Record<string, number>,
  alvo: number,
): Map<string, number> {
  const porCat = new Map<string, Disponivel[]>();
  for (const d of pool) {
    if (!porCat.has(d.cat)) porCat.set(d.cat, []);
    porCat.get(d.cat)!.push(d);
  }

  const tirado = new Map<string, number>();
  const cotas = cotasPorCategoria(pesos, alvo);
  let total = 0;

  for (const [cat, cota] of Object.entries(cotas)) {
    const itens = porCat.get(cat);
    if (!itens || cota <= 0) continue;
    total += tirarDaCategoria(itens, cota, tirado);
  }

  /* Categoria que acabou antes da cota devolve o saldo: as peças que
     faltam vêm de quem ainda tem, na ordem do peso. Sem isto a proposta
     ficaria menor que o alvo tendo estoque de sobra ao lado. */
  if (total < alvo) {
    const ordemPeso = Object.keys(pesos).sort((a, b) => (pesos[b] || 0) - (pesos[a] || 0));
    const todas = [...new Set([...ordemPeso, ...porCat.keys()])];
    for (const cat of todas) {
      if (total >= alvo) break;
      const itens = porCat.get(cat);
      if (!itens) continue;
      total += tirarDaCategoria(itens, alvo - total, tirado);
    }
  }

  return tirado;
}

/** Premium: a peça mais cara primeiro, sem cota por categoria. */
function montarPorPreco(pool: Disponivel[], alvo: number): Map<string, number> {
  const ordenados = [...pool].sort(
    (a, b) =>
      (b.produto.preco || 0) - (a.produto.preco || 0) ||
      a.produto.sku.localeCompare(b.produto.sku),
  );
  const tirado = new Map<string, number>();
  let restante = alvo;
  for (const d of ordenados) {
    if (restante <= 0) break;
    const q = Math.min(d.limite, restante);
    if (q > 0) {
      tirado.set(d.produto.sku, q);
      restante -= q;
    }
  }
  return tirado;
}

function finalizar(
  estado: AppState,
  pool: Disponivel[],
  tirado: Map<string, number>,
  meta: { estrategia: EstrategiaSugestao; nome: string; explicacao: string; base: string },
  alvo: number,
  reservaPct: number,
): Sugestao {
  const porSku = new Map(pool.map((d) => [d.produto.sku, d]));
  const itens: ItemSugerido[] = [];
  for (const [sku, qtd] of tirado) {
    if (qtd <= 0) continue;
    const d = porSku.get(sku);
    if (!d) continue;
    /* Trava final: mesmo que a montagem errasse, nada sai daqui acima do
       limite que a reserva permitiu. */
    const q = Math.min(qtd, d.limite);
    if (q <= 0) continue;
    itens.push({
      sku,
      desc: d.produto.desc,
      cat: d.cat,
      qtd: q,
      preco: d.produto.preco,
      emCasa: d.emCasa,
      limite: d.limite,
    });
  }
  itens.sort((a, b) => a.cat.localeCompare(b.cat) || a.sku.localeCompare(b.sku));

  const pecas = itens.reduce((s, i) => s + i.qtd, 0);
  const valor = itens.reduce((s, i) => s + i.qtd * (i.preco || 0), 0);

  const acc: Record<string, number> = {};
  for (const i of itens) acc[i.cat] = (acc[i.cat] || 0) + i.qtd;
  const porCategoria = Object.entries(acc)
    .map(([cat, qtd]) => ({ cat, qtd, cor: corDaCategoria(estado.categorias, cat) }))
    .sort((a, b) => b.qtd - a.qtd);

  const todos = consignaveis(estado, reservaPct);
  const emCasaAntes = todos.reduce((s, c) => s + c.emCasa, 0);
  const reservaMinima = todos.reduce((s, c) => s + c.reservado, 0);

  return {
    ...meta,
    itens,
    pecas,
    valor,
    porCategoria,
    emCasaAntes,
    emCasaDepois: emCasaAntes - pecas,
    reservaMinima,
    alvo,
    atingiuAlvo: pecas >= alvo,
  };
}

/** As três propostas. Nunca mais de três — a Visão Geral não é catálogo de
 *  opções, é um lugar de decidir. */
export function gerarSugestoes(
  estado: AppState,
  config: ConfigPlanejamento,
  opcoes: OpcoesSugestao = {},
): Sugestao[] {
  const reservaPct = RESERVA_POR_MODO[config.modo];
  const pool = conjunto(estado, reservaPct);
  const alvo = Math.max(1, Math.round(opcoes.alvo ?? config.tamanhoAlvo));

  const pesosDoEstoque: Record<string, number> = {};
  for (const d of pool) pesosDoEstoque[d.cat] = (pesosDoEstoque[d.cat] || 0) + d.limite;

  const historico = pesosHistoricosDeConsignacao(estado);
  const temHistorico = Object.values(historico).some((n) => n > 0);

  const pesosEquilibrada = opcoes.pesosPorCategoria ?? pesosDoEstoque;

  return [
    finalizar(
      estado,
      pool,
      montarPorPesos(pool, pesosEquilibrada, alvo),
      {
        estrategia: 'equilibrada',
        nome: 'Equilibrada',
        explicacao: 'Espelha a composição do que você tem em casa hoje.',
        base: opcoes.pesosPorCategoria
          ? 'Pesos por categoria informados para esta revendedora.'
          : 'Distribuição por categoria do estoque disponível em casa.',
      },
      alvo,
      reservaPct,
    ),
    finalizar(
      estado,
      pool,
      montarPorPesos(pool, temHistorico ? historico : pesosDoEstoque, alvo),
      {
        estrategia: 'giro',
        nome: 'Giro rápido',
        explicacao: 'Puxa para as categorias que mais saem em maleta.',
        base: temHistorico
          ? 'Histórico de consignação: o que já foi para maleta, por categoria. A venda por peça ainda não é exposta pela API.'
          : 'Sem histórico de maleta ainda — esta proposta repete a Equilibrada até existirem maletas para ler.',
      },
      alvo,
      reservaPct,
    ),
    finalizar(
      estado,
      pool,
      montarPorPreco(pool, alvo),
      {
        estrategia: 'premium',
        nome: 'Premium',
        explicacao: 'Prioriza as peças de maior preço de venda.',
        base: 'Preço de catálogo das peças disponíveis. Peças sem preço (§24) ficam fora de todas as propostas.',
      },
      alvo,
      reservaPct,
    ),
  ];
}
