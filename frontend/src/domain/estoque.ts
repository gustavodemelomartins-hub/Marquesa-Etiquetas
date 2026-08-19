/** As contas de estoque da Visão Geral, portadas do painel legado.
 *
 *  Nenhuma delas inventa número: todas leem `GET /api/state`, onde o
 *  servidor já entregou `qtd` (total), `consignado` (em maleta aberta) e
 *  `disponivel` (o que sobra em casa). Recalcular o disponível aqui é
 *  exatamente o que quebrava kit no painel legado — kit tem `qtd` 0 e um
 *  `disponivel` que vem dos componentes. */
import type { AppState, Product } from '../types/api';
import { corDaCategoria, ordemDasCategorias } from './categorias';
import { maletasAbertas } from './maletas';

/** Quanto de cada SKU está fora, somando todas as maletas abertas.
 *
 *  Sai das maletas e não de `produto.consignado` de propósito: a mesma
 *  função serve para achar código que está na rua e sumiu do catálogo,
 *  que por definição não tem produto para consultar. */
export function comRevMap(estado: AppState): Record<string, number> {
  const m: Record<string, number> = {};
  for (const mal of maletasAbertas(estado.maletas)) {
    for (const [sku, q] of Object.entries(mal.itens || {})) {
      m[sku] = (m[sku] || 0) + (Number(q) || 0);
    }
  }
  return m;
}

export interface TotaisEstoque {
  /** Peças no total: em casa + na rua. */
  total: number;
  /** Peças com revendedoras (maletas abertas ou em acerto). */
  fora: number;
  /** total − fora. É isto que pode estar anunciado na Nuvemshop. */
  casa: number;
  valTotal: number;
  valFora: number;
  valCasa: number;
  /** Quantos códigos distintos existem no catálogo. */
  codigos: number;
}

/** Os quatro números do topo. Mesma regra do legado, inclusive o `max()`:
 *  uma peça que está na mão de alguém existe, mesmo que o cadastro diga
 *  que não — sem ele o total ficaria menor que a soma das maletas. */
export function totaisEstoque(estado: AppState): TotaisEstoque {
  const rev = comRevMap(estado);
  let total = 0;
  let fora = 0;
  let valTotal = 0;
  let valFora = 0;
  const vistos = new Set<string>();

  for (const p of estado.produtos) {
    const f = rev[p.sku] || 0;
    const q = Math.max(p.qtd || 0, f);
    vistos.add(p.sku);
    total += q;
    fora += f;
    valTotal += q * (p.preco || 0);
    valFora += f * (p.preco || 0);
  }

  /* Peças numa maleta que sumiram do catálogo não podem ser ignoradas: são
     peças físicas na mão de alguém. Sem preço para somar, entram só na
     contagem. */
  for (const [sku, q] of Object.entries(rev)) {
    if (!vistos.has(sku)) {
      total += q;
      fora += q;
    }
  }

  return {
    total,
    fora,
    casa: total - fora,
    valTotal,
    valFora,
    valCasa: valTotal - valFora,
    codigos: estado.produtos.length,
  };
}

export type EscopoCategoria = 'total' | 'casa' | 'fora';

export interface FatiaCategoria {
  cat: string;
  qtd: number;
  cor: string;
}

/** A composição do estoque por categoria, nos três escopos do gráfico
 *  legado. A mesma regra do `max()` acima, para o gráfico e os KPIs nunca
 *  discordarem. */
export function porCategoria(estado: AppState, escopo: EscopoCategoria): FatiaCategoria[] {
  const rev = comRevMap(estado);
  const acc: Record<string, number> = {};

  for (const p of estado.produtos) {
    const fora = rev[p.sku] || 0;
    const tot = Math.max(p.qtd || 0, fora);
    const q = escopo === 'total' ? tot : escopo === 'casa' ? tot - fora : fora;
    if (q > 0) {
      const c = p.cat || 'Outros';
      acc[c] = (acc[c] || 0) + q;
    }
  }

  const nomes = [...new Set([...ordemDasCategorias(estado), ...Object.keys(acc)])];
  return nomes
    .map((c) => ({ cat: c, qtd: acc[c] || 0, cor: corDaCategoria(estado.categorias, c) }))
    .filter((d) => d.qtd > 0);
}

export interface Inconsistencia {
  sku: string;
  desc: string;
  /** Peças na rua. */
  fora: number;
  /** Peças que o cadastro reconhece. */
  cadastro: number;
}

/** Códigos com mais peças na rua do que o cadastro reconhece.
 *
 *  Nos arquivos da Marquesa isto acontece com os SKUs de sufixo (120029-2 e
 *  companhia), cujo código-base nunca entrou na planilha de estoque. Não é
 *  o sistema que está errado: é uma peça física sem lugar no cadastro, e
 *  por isso aparece como pendência em vez de ser corrigida sozinha. */
export function inconsistencias(estado: AppState): Inconsistencia[] {
  const rev = comRevMap(estado);
  const idx = new Map(estado.produtos.map((p) => [p.sku, p]));
  const out: Inconsistencia[] = [];
  for (const [sku, fora] of Object.entries(rev)) {
    const p = idx.get(sku);
    const cad = p ? p.qtd || 0 : 0;
    if (fora > cad) {
      out.push({ sku, desc: p ? p.desc : '(fora do catálogo)', fora, cadastro: cad });
    }
  }
  return out.sort((a, b) => b.fora - b.cadastro - (a.fora - a.cadastro));
}

/** Quantos códigos ainda não têm preço. §24: sem preço não dá para vender
 *  nem calcular comissão, então a peça existe mas trava o acerto. */
export function semPreco(estado: AppState): Product[] {
  return estado.produtos.filter((p) => p.preco === null && (p.qtd || 0) > 0);
}
