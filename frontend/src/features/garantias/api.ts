import { chamar, type Connection } from '../../services/client';
import type { Garantia } from './tipos';

/** GARANTIAS, REPAROS E TROCAS — o adaptador único (Fase 5.4).
 *
 *  As rotas que existem no Worker, e todas são chamadas por esta tela:
 *
 *    GET   /api/garantias?status=&limite=       a lista
 *    GET   /api/garantias/:id                   o caso, com eventos
 *    GET   /api/garantias/pendentes             o que ainda pede ação
 *    GET   /api/garantias/vinculos              os casos sem ponteiro firme
 *    POST  /api/garantias                       ABRIR
 *    POST  /api/garantias/:id/status            mudar status
 *    POST  /api/garantias/:id/troca             registrar a troca
 *    POST  /api/garantias/:id/troca/pagar       a diferença entrou
 *    POST  /api/garantias/:id/troca/estornar    desfazer a troca
 *    POST  /api/garantias/:id/reabrir           atendimento novo, ligado
 *    POST  /api/garantias/:id/corrigir-status   corrigir sem apagar
 */

export interface Recusa {
  erro?: string;
  statusHttp?: number;
  /** 409 de ambiguidade: "encontrei demais", com as candidatas para a tela
   *  poder perguntar em vez de escolher por conta própria. */
  candidatas?: CandidataDeItem[];
  vendaCancelada?: boolean;
  trocaId?: number;
  encerradaEm?: string | null;
}

export interface CandidataDeItem {
  vendaItemId: number | string;
  variacao: string | null;
  varianteId: string | null;
  qtd: number;
  precoPago: number;
  descontoRotulo: string | null;
}

export function listarGarantias(
  conexao: Connection, status: string | null, sinal?: AbortSignal,
): Promise<{ garantias: Garantia[] }> {
  const q = new URLSearchParams({ limite: '200' });
  if (status && status !== 'pendentes') q.set('status', status);
  return chamar(conexao, 'GET', `/api/garantias?${q}`, undefined, { signal: sinal });
}

export function lerGarantia(
  conexao: Connection, id: number, sinal?: AbortSignal,
): Promise<Garantia> {
  return chamar(conexao, 'GET', `/api/garantias/${id}`, undefined, { signal: sinal });
}

/* ──────────────────────────────────────────────────────────────── abrir */

/** O que `abrirGarantia` aceita para dizer QUAL peça voltou.
 *
 *  Uma das três, e não uma mistura:
 *
 *    vendaItemId       a linha exata da venda do sistema. É o caminho bom:
 *                      desde 5.2b a linha tem identidade, e duas unidades
 *                      iguais na mesma compra deixaram de ser a mesma coisa.
 *    vendaId + sku     sem a linha. O servidor procura, e se achar mais de
 *                      uma candidata devolve 409 COM as candidatas em vez de
 *                      escolher — é a regra 2 do CLAUDE.md.
 *    historicoItemId   a peça veio da planilha importada.
 *
 *  `/api/vendas/lista` já devolve o `id` de cada linha, e ele É o
 *  `venda_item_id` do lado operacional e o `historico_item_id` do lado da
 *  planilha — `fonte` diz qual. Por isso a busca da venda é o caminho
 *  natural para abrir um caso, e nenhuma rota nova foi precisa.
 */
export interface NovaGarantia {
  motivo: string;
  dataEntrada?: string;
  prazoDiasUteis?: number;
  vendaItemId?: string | number;
  vendaId?: number;
  sku?: string;
  varianteId?: string | null;
  historicoItemId?: number;
  observacao?: string;
}

export function abrirGarantia(
  conexao: Connection, corpo: NovaGarantia,
): Promise<{ ok?: boolean; id?: number } & Recusa> {
  return chamar(conexao, 'POST', '/api/garantias', corpo);
}

export function mudarStatus(
  conexao: Connection, id: number,
  corpo: { status: string; observacao?: string; data?: string },
): Promise<{ ok?: boolean } & Recusa> {
  return chamar(conexao, 'POST', `/api/garantias/${id}/status`, corpo);
}

/* ──────────────────────────────────────────────────────────────── troca */

/** A troca leva a peça NOVA, e o servidor calcula a diferença.
 *
 *  O que a tela NÃO faz, e é deliberado:
 *
 *   · não calcula a diferença — quem a calcula é quem conhece o valor pago
 *     original, e ele mora na garantia;
 *   · não decide o sinal. Peça nova mais cara é `a_receber` da cliente;
 *     mais barata é CRÉDITO DELA, e o servidor recusa "receber" um crédito.
 */
export interface NovaTroca {
  skuNovo: string;
  variacao?: string | null;
  varianteId?: string | null;
  data?: string;
  observacao?: string;
  /** O preço cobrado pela peça nova, quando diferente do de tabela. */
  precoNovo?: number;
}

export interface RespostaDaTroca extends Recusa {
  ok?: boolean;
  trocaId?: number;
  diferenca?: number;
  diferencaStatus?: 'nenhuma' | 'a_receber' | 'credito' | 'paga';
  vendaId?: number | null;
}

export function registrarTroca(
  conexao: Connection, id: number, corpo: NovaTroca,
): Promise<RespostaDaTroca> {
  return chamar(conexao, 'POST', `/api/garantias/${id}/troca`, corpo);
}

/** A diferença entrou. `pagaEm` é a DATA EFETIVA — mesma regra de §30, e
 *  pagamento PARCIAL é recusado pelo servidor: a diferença é um valor único
 *  e pequeno, e aceitar outro valor criaria um saldo que ninguém acompanha. */
export function pagarDiferenca(
  conexao: Connection, id: number, pagaEm: string,
): Promise<{ ok?: boolean } & Recusa> {
  return chamar(conexao, 'POST', `/api/garantias/${id}/troca/pagar`, { pagaEm });
}

/** Desfaz a troca: devolve a peça nova ao estoque e CANCELA o registro
 *  comercial dela (§28 — cancela, não apaga). O servidor recusa estornar
 *  uma diferença já paga: isso deixaria o dinheiro sem origem. */
export function estornarTroca(
  conexao: Connection, id: number, motivo: string,
): Promise<{ ok?: boolean } & Recusa> {
  return chamar(conexao, 'POST', `/api/garantias/${id}/troca/estornar`, { motivo });
}

/* ────────────────────────────────────────────────────────────── vínculos */

export interface CasoSemVinculo {
  garantiaId: number;
  /** `ambiguo` (achou demais) ou `sem_match` (não achou). */
  motivo: string;
  vendaId: number | null;
  sku: string;
  variacao: string | null;
  varianteId: string | null;
  produtoNome: string | null;
  clienteNome: string | null;
  dataEntrada: string;
  status: string;
  valorPagoOriginal: number | null;
  candidatas: CandidataDeItem[];
}

export interface Vinculos {
  ok: true;
  porVinculo: Record<string, number>;
  ambiguas: number;
  semMatch: number;
  resolvidas: number;
  naoSeAplica: number;
  casos: CasoSemVinculo[];
  [k: string]: unknown;
}

export function buscarVinculos(
  conexao: Connection, sinal?: AbortSignal,
): Promise<Vinculos> {
  return chamar(conexao, 'GET', '/api/garantias/vinculos?limite=200', undefined, { signal: sinal });
}

/** A frase do servidor, quando ela existe. Uma recusa de negócio costuma
 *  dizer o que FAZER, e reescrevê-la aqui só perderia informação. */
export function motivoDaRecusa(e: unknown, padrao: string): string {
  if (e instanceof Error && e.message) return e.message;
  const corpo = (e as { corpo?: { erro?: string } })?.corpo;
  return corpo?.erro ?? padrao;
}
