/** O relato de uma rodada de sincronização.
 *
 *  Fonte: `api/src/sync.js › sincronizar`, o objeto `relato`. É o mesmo
 *  formato para rodada seca, rodada pausada e rodada aplicada — o que muda
 *  são os campos preenchidos.
 */
import type { UnpushedCode } from './api';

/** Uma mudança de estoque que a rodada faria na loja.
 *
 *  Quando o código é vendido em mais de uma opção, vem UMA mudança por
 *  variação, e `varianteId` diz qual caixinha. Sem variação, `varianteId`
 *  não vem e o alvo é o código inteiro. */
export interface SyncChange {
  sku: string;
  /** No caso de variação, vem como "Descrição · 45cm". */
  desc: string;
  /** O que a loja mostra hoje. */
  de: number;
  /** O que a rodada mandaria. */
  para: number;
  /** `true` quando isto tiraria o produto do ar: ia para 0 tendo estoque. */
  zera: boolean;

  /* Só em mudança de variação. */
  varianteId?: string | number;
  produtoId?: string | number;
  locais?: Array<string | number>;
}

/** Item de pedido do site que não casou com nenhum código do catálogo.
 *  §22: é anunciado, não engolido — houve uma venda de verdade que o
 *  sistema não registrou. */
export interface UnmatchedOrderItem {
  /** Número do pedido na loja. */
  pedido: string | number;
  /** O SKU do pedido, ou "(sem SKU)". */
  sku: string;
  nome?: string;
}

/** Código que a rodada repartiu sozinha entre as variações, lendo a loja. */
export interface SeededCode {
  sku: string;
  total: number;
  variacoes: Array<{ nome: string; qtd: number }>;
}

/** Código que a rodada RECUSOU repartir porque a soma da loja não bate com
 *  o nosso total. O desencontro não diz onde está o erro, então não se
 *  reparte nada e mostram-se os dois números. */
export interface UnseededCode {
  sku: string;
  /** O nosso total. */
  total: number;
  /** A soma das caixinhas da loja. */
  somaLoja: number;
  variacoes: Array<{ nome: string; estoque: number }>;
}

/** O retrato que a rodada gravou da loja. */
export interface SyncPortrait {
  produtosNaLoja: number;
  casados: number;
  soNaLoja: number;
}

/** O relato inteiro. Numa rodada seca, `aplicado` não vem e
 *  `produtosEnviados` é 0 — ela leu tudo e não escreveu na loja. */
export interface SyncReport {
  ok: boolean;
  /** Id da linha em `sync_execucoes`. */
  id?: number;
  erro?: string;

  pedidosLidos: number;
  /** Numa rodada seca, conta as vendas que SERIAM criadas. */
  vendasCriadas: number;
  itensIgnorados: UnmatchedOrderItem[];

  produtosEnviados: number;
  mudancas: SyncChange[];
  semEmpurrar: UnpushedCode[];
  semeados: SeededCode[];
  naoSemeados: UnseededCode[];

  /** Preenchido quando o freio segurou a rodada. */
  pausado: {
    motivo: string;
    mudancas: number;
    zerando: number;
  } | null;

  /** `true` na rodada seca: leu e calculou, não escreveu na loja. */
  seco: boolean;
  /** Só existe quando a rodada de fato escreveu. */
  aplicado?: boolean;

  duplicadosNaLoja?: string[];
  retrato?: SyncPortrait;
}

/** Uma rodada no histórico — `GET /api/sync`. */
export interface SyncRun {
  id: number;
  iniciadoEm: string | null;
  terminadoEm: string | null;
  status: 'rodando' | 'ok' | 'pausado' | 'erro' | null;
  pedidosLidos: number | null;
  vendasCriadas: number | null;
  produtosEnviados: number | null;
  detalhe: SyncReport | null;
}
