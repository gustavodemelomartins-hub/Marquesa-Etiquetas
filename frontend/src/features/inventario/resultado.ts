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
  /** O rótulo com que a diferença FOI resolvida, relido da saída. `null`
   *  enquanto ela não foi resolvida — e de novo `null` depois de um estorno,
   *  porque a resolução deixou de valer. */
  motivoAplicado: string | null;
  /** O zero desta linha veio de uma DECLARAÇÃO, não de um bipe: ninguém a
   *  contou, e a pessoa afirmou no fechamento ter terminado a conferência.
   *  Os dois casos têm `contado: 0` e significam gestos diferentes. */
  declarado: boolean;
  /** Por extenso, quando a linha precisa se explicar — hoje só nas
   *  declaradas. */
  motivo: string | null;
}

export interface LinhaNaoConferida {
  sku: string;
  desc: string;
  cat: string | null;
  variacao: string | null;
  esperado: number;
  /** Preenchido só quando a contagem FOI declarada completa e este código
   *  ficou de fora mesmo assim — é a recusa do servidor dita em voz alta,
   *  em vez de a linha sumir da lista sem explicação. */
  motivo: string | null;
}

/** Uma linha que BATEU. Não pede decisão nenhuma, e por isso a revisão a
 *  mantém recolhida — mas existir é a diferença entre "642 códigos OK" ser
 *  um resumo e ser uma afirmação que ninguém pode conferir. */
export interface LinhaConferida {
  sku: string;
  desc: string;
  cat: string | null;
  variacao: string | null;
  contado: number;
  esperado: number;
  aviso: string | null;
}

/** UM MOTIVO de diferença, como o servidor o define
 *  (`api/src/inventario.js › MOTIVOS_DE_DIFERENCA`).
 *
 *  A lista NÃO é escrita aqui. Ela vem dentro do resultado porque
 *  `saidas_sem_faturamento.motivo` é um rótulo agrupável, e duas listas —
 *  uma no servidor e outra na tela — divergiriam na primeira mudança,
 *  transformando "quantas peças perdi por saída sem lançamento" numa
 *  pergunta sem resposta. */
export interface MotivoDeDiferenca {
  id: string;
  rotulo: string;
  /** Em qual das duas listas ele aparece. `ambos` vale para as duas. */
  sentido: 'saida' | 'entrada' | 'ambos';
  explica: string;
  /** `true` no "Outro": o texto que ela escrever VIRA o rótulo. */
  livre?: boolean;
}

/** Quanto da conciliação já foi feito. Derivado no servidor a partir do que
 *  está aplicado — não existe coluna `conciliado`, e não precisa existir. */
export interface Conciliacao {
  divergencias: number;
  resolvidas: number;
  pendentes: number;
  /** Não comparáveis: esperam uma variação, não uma decisão de estoque. */
  bloqueadas: number;
  naoConferidos: number;
  conciliado: boolean;
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
  /** A lista de quem bateu. Campo novo; o número antigo continua ao lado. */
  conferidosItens: LinhaConferida[];
  pecasContadas: number;
  faltando: LinhaDeDiferenca[];
  sobrando: LinhaDeDiferenca[];
  naoConferido: LinhaNaoConferida[];
  naoComparavel: LinhaNaoComparavel[];
  desconhecidos: unknown[];
  /** A pessoa AFIRMOU, no fechamento, ter conferido todo o estoque deste
   *  inventário. É o que explica um faltante que ninguém bipou. */
  contagemCompleta: boolean;
  motivos: MotivoDeDiferenca[];
  conciliacao: Conciliacao;
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
  /** OBRIGATÓRIO nesta rota. Uma baixa de estoque sem explicação é
   *  indistinguível de erro de lançamento seis meses depois — a mesma regra
   *  que §27 e §30 já aplicam ao desconto e à saída. O servidor recusa sem
   *  ele, e devolve a lista de motivos dentro da recusa. */
  motivo: string;
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

export const pedidoDaLinha = (l: LinhaDeDiferenca, motivo: string): PedidoDeAjuste => ({
  sku: l.sku,
  motivo,
  ...(l.variacao ? { variacao: l.variacao } : {}),
});

/** Os motivos que fazem sentido para ESTA linha. Oferecer um motivo de
 *  sobra numa falta seria um caminho que não explica nada. */
export const motivosDaLinha = (
  motivos: MotivoDeDiferenca[], dif: number,
): MotivoDeDiferenca[] => {
  const sentido = dif < 0 ? 'saida' : 'entrada';
  return motivos.filter((m) => m.sentido === sentido || m.sentido === 'ambos');
};

/** As linhas que AINDA podem ser corrigidas. Uma já aplicada e não
 *  estornada é recusada pelo índice do banco — filtrar aqui evita mandar um
 *  lote que o servidor vai recusar inteiro por causa de uma linha. */
export const aplicaveis = (r: ResultadoDoInventario): LinhaDeDiferenca[] =>
  [...r.faltando, ...r.sobrando].filter((l) => !l.aplicado);
