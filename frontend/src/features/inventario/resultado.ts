import { chamar, type Connection } from '../../services/client';

/** O RESULTADO do inventário, como `api/src/inventario.js › relatorio()`
 *  realmente responde.
 *
 *  O adaptador anterior lia `{ itens: [{ sistema, diferenca }] }`. Nenhum
 *  desses três nomes existe na resposta, e o efeito era duplo e silencioso:
 *
 *    · `r.dados.itens` era `undefined`, então a tela de resultado dizia
 *      "Sem resultado para mostrar" em TODO inventário concluído — a
 *      contagem inteira ficava invisível na V2;
 *    · o botão de aplicar mandava `POST /aplicar {}`, e
 *      `aplicarInventario(db, id, { itens })` filtra `(itens || [])`, o que
 *      dá lista vazia: nenhum ajuste era feito, e a tela relatava sucesso.
 *
 *  O contrato real separa as linhas por SITUAÇÃO, e a separação é a regra:
 *
 *    faltando       contou menos do que o sistema diz  (`dif < 0`)
 *    sobrando       contou mais                        (`dif > 0`)
 *    naoConferido   NÃO FOI CONTADO. D3 — não contado não é zero, e o
 *                   servidor RECUSA aplicar diferença sobre ele.
 *    naoComparavel  contado sem identidade suficiente (variação não dita).
 *                   D5 — bloqueia o código inteiro, e diz por quê.
 *
 *  Misturar as quatro numa lista só com um número de "diferença" é
 *  exatamente o que faria "não contado" virar "faltando tudo".
 */

export interface LinhaDeDiferenca {
  sku: string;
  desc: string;
  cat: string | null;
  preco: number | null;
  variacao: string | null;
  varianteId: string | null;
  contado: number;
  esperado: number;
  /** Negativo falta, positivo sobra. Nunca nulo nestas duas listas. */
  dif: number;
  /** O mesmo que `dif`: o que o servidor sugere corrigir. */
  sugestao: number;
  /** O que MEXEU entre a contagem e o fechamento. */
  deltaPos: number;
  aviso: string | null;
  valor: number;
  /** Já corrigido neste inventário. Estorno devolve para `false` (D12). */
  aplicado: boolean;
  saidaId: number | null;
}

export interface LinhaNaoConferida {
  sku: string;
  desc: string;
  cat: string | null;
  variacao: string | null;
  esperado: number;
}

export interface LinhaNaoComparavel {
  sku: string;
  desc: string;
  cat: string | null;
  variacao: string | null;
  naoIdentificado: boolean;
  contado: number;
  motivo: string;
}

export interface ResultadoDoInventario {
  ok: true;
  id: number;
  concluidoEm: string;
  cobertura: { conferidos: number; total: number };
  /** Quantas linhas bateram exatamente. */
  conferido: number;
  conferidos: number;
  pecasContadas: number;
  faltando: LinhaDeDiferenca[];
  sobrando: LinhaDeDiferenca[];
  naoConferido: LinhaNaoConferida[];
  naoComparavel: LinhaNaoComparavel[];
  desconhecidos: unknown[];
}

/** 409 quando o inventário ainda não foi concluído — é resposta esperada,
 *  não defeito, e a tela a mostra como aviso. */
export interface ResultadoIndisponivel {
  ok?: false;
  erro: string;
  status?: string;
}

export function buscarResultado(
  conexao: Connection, id: number, sinal?: AbortSignal,
): Promise<ResultadoDoInventario | ResultadoIndisponivel> {
  return chamar(conexao, 'GET', `/api/inventarios/${id}/resultado`, undefined, { signal: sinal });
}

export const temResultado = (
  r: ResultadoDoInventario | ResultadoIndisponivel | null,
): r is ResultadoDoInventario => !!r && (r as ResultadoDoInventario).ok === true;

/** O que `POST /api/inventarios/:id/aplicar` espera.
 *
 *  A QUANTIDADE não viaja: ela já foi decidida no fechamento, e mandar um
 *  número novo daqui deixaria a tela reabrir a comparação (§8). O que a
 *  tela escolhe é QUAIS linhas corrigir — e a variação viaja junto porque
 *  duas variações do mesmo código com diferença, sem dizer qual, é
 *  exatamente "não sei qual aro saiu", e o servidor recusa. */
export interface PedidoDeAjuste {
  sku: string;
  variacao?: string | null;
  observacao?: string;
}

export interface RespostaDoAjuste {
  ok?: boolean;
  erro?: string;
  sku?: string;
  motivo?: string;
  variacoes?: { variacao: string | null; dif: number }[];
  aplicados?: unknown[];
  [k: string]: unknown;
}

export function aplicarAjustes(
  conexao: Connection, id: number, itens: PedidoDeAjuste[],
): Promise<RespostaDoAjuste> {
  return chamar(conexao, 'POST', `/api/inventarios/${id}/aplicar`, { itens });
}

export const pedidoDaLinha = (l: LinhaDeDiferenca): PedidoDeAjuste => ({
  sku: l.sku,
  ...(l.variacao ? { variacao: l.variacao } : {}),
});

/** As linhas que AINDA podem ser corrigidas. Uma já aplicada e não
 *  estornada é recusada pelo índice do banco — filtrar aqui evita mandar um
 *  lote que o servidor vai recusar inteiro por causa de uma linha. */
export const aplicaveis = (r: ResultadoDoInventario): LinhaDeDiferenca[] =>
  [...r.faltando, ...r.sobrando].filter((l) => !l.aplicado);
