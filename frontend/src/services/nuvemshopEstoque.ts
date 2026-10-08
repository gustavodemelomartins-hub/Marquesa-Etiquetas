/** §61 — Estoque online: a fila que leva o saldo do Marquesa para a
 *  Nuvemshop, código por código. Contrato de `api/src/nuvemshop-estoque.js`.
 *
 *    GET  /api/nuvemshop/estoque                saúde, fila, última conferência
 *    POST /api/nuvemshop/estoque/conferir       lê a loja e compara (não escreve nela)
 *    POST /api/nuvemshop/estoque/reconciliar    manda o saldo do Marquesa às divergências
 *    POST /api/nuvemshop/estoque/sincronizar    "Sincronizar pendências" — a fila, agora
 *    POST /api/nuvemshop/estoque/:sku/tentar    "Tentar novamente" de um código
 *    PUT  /api/nuvemshop/estoque/automatico     kill switch
 */
import { chamar, type Connection } from './client';

export type StatusFila = 'pendente' | 'sincronizado' | 'erro' | 'revisao' | 'ignorado';

export interface ProblemaDaFila {
  sku: string;
  desc: string | null;
  status: StatusFila;
  /** O que pediu o envio: tipo do movimento ("venda", "brinde"...). */
  acao: string | null;
  erro: string | null;
  tentativas: number;
  proximaEm: string | null;
  ultimaTentativaEm: string | null;
  pedidoEm: string;
}

export interface RodadaDaFila {
  em: string;
  origem: string;
  modo: 'incremental' | 'lote' | null;
  processados: number;
  sincronizados: number;
  erros: number;
  revisao: number;
  enviados: number;
  motivo: string | null;
}

export interface ResumoConferencia {
  em: string;
  produtosNaLoja: number;
  variantesNaLoja: number;
  variantesMapeadas: number;
  skusMapeados: number;
  iguais: number;
  divergentes: number;
  porStatus: Record<string, number>;
}

export interface LinhaDivergente {
  sku: string;
  produto: string | null;
  variante: string | null;
  ns_variante_id: string | null;
  em_casa: number | null;
  consignado: number | null;
  online: number | null;
  ns_estoque: number | null;
  diferenca: number | null;
  status: string;
}

export interface LinhaExcecao {
  sku: string | null;
  produto: string | null;
  variante: string | null;
  ns_produto_id: string | null;
  ns_variante_id: string | null;
  ns_estoque: number | null;
  em_casa: number | null;
  status: string;
  motivo: string | null;
}

export interface EstoqueOnline {
  ok: boolean;
  migrado: boolean;
  conectada?: boolean;
  escritaHabilitada?: boolean;
  ativo?: boolean;
  corteEm?: string | null;
  contagens?: Partial<Record<StatusFila, number>>;
  ultimaSincronizacaoEm?: string | null;
  ultimaRodada?: RodadaDaFila | null;
  cronEm?: string | null;
  freio?: { motivo: string; mudancas: number; zerando: number | null; em: string } | null;
  pedidosAtencao?: { em: string; antesDoCorte: unknown[]; itensIgnorados: unknown[] } | null;
  problemas?: ProblemaDaFila[];
  conferencia?: ResumoConferencia | null;
  divergentes?: LinhaDivergente[];
  excecoes?: LinhaExcecao[];
}

export function buscarEstoqueOnline(conexao: Connection, signal?: AbortSignal): Promise<EstoqueOnline> {
  return chamar(conexao, 'GET', '/api/nuvemshop/estoque', undefined, signal ? { signal } : {});
}

export function conferirEstoque(conexao: Connection): Promise<{ ok: boolean; resumo: ResumoConferencia }> {
  return chamar(conexao, 'POST', '/api/nuvemshop/estoque/conferir', {});
}

export function reconciliarDivergencias(conexao: Connection): Promise<{ ok: boolean; codigos: number }> {
  return chamar(conexao, 'POST', '/api/nuvemshop/estoque/reconciliar', {});
}

export function sincronizarPendencias(conexao: Connection): Promise<RodadaDaFila> {
  return chamar(conexao, 'POST', '/api/nuvemshop/estoque/sincronizar', {});
}

export function tentarDeNovo(conexao: Connection, sku: string): Promise<{ ok: boolean; status: string }> {
  return chamar(conexao, 'POST', `/api/nuvemshop/estoque/${encodeURIComponent(sku)}/tentar`, {});
}

export function ligarAutomatico(conexao: Connection, ativo: boolean): Promise<{ ok: boolean; ativo: boolean }> {
  return chamar(conexao, 'PUT', '/api/nuvemshop/estoque/automatico', { ativo });
}
