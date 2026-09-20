/** ANALYTICS — a fonte ÚNICA dos contratos de `/api/analytics/*` no React.
 *
 *  Antes desta folha, `features/financeiro/tipos.ts` era o único lugar que
 *  descrevia `/api/analytics/painel`, e Vendas — que faz as MESMAS perguntas
 *  sobre o MESMO recorte — não tinha de onde ler. Duas cópias do mesmo
 *  contrato divergem no dia em que uma delas acompanha o backend e a outra
 *  não, e a divergência aparece como número diferente em duas telas do mesmo
 *  sistema. Por isso o contrato mora aqui, e Financeiro reexporta daqui.
 *
 *  Nenhuma rota abaixo escreve. Analytics lê de todo domínio e não manda em
 *  nenhum — quem corrige número é o dono do dado.
 *
 *  As rotas, como o Worker realmente as expõe (`api/src/http/routes/analytics.js`):
 *
 *    GET /api/analytics/painel      o agregado: tudo do mesmo recorte
 *    GET /api/analytics/vendas      visão geral (faturamento, ticket, composição)
 *    GET /api/analytics/evolucao    a série por mês/dia
 *    GET /api/analytics/produtos    ranking de peças
 *    GET /api/analytics/categorias  ranking de categorias
 *    GET /api/analytics/origem      canais e origens
 *    GET /api/analytics/clientes    ranking de clientes
 *    GET /api/analytics/mes         o resumo de UM mês (AAAA-MM)
 *    GET /api/analytics/crm         relacionamento
 *    GET /api/analytics/revendedoras acertos de maleta
 */
import { chamar, type Connection } from '../services/client';

/* ───────────────────────────────────────────────────────────── recorte */

/** Os presets que `faixaDePeriodo` aceita. Qualquer outro valor o backend
 *  trata como `tudo` — por isso a tela nunca inventa um sexto. */
export type Periodo = '7d' | '30d' | '90d' | '12m' | 'tudo';

export interface Recorte {
  periodo: Periodo;
  /** Intervalo livre. Quando os DOIS existem, eles vencem o preset — é
   *  assim que o backend decide (`recorteDaUrl`), e meia faixa é 400. */
  de: string | null;
  ate: string | null;
}

/* Os presets por extenso, o padrão e a validação do intervalo moram em
   `domain/periodo.ts` — este arquivo descreve o CONTRATO, aquele descreve a
   pergunta. Separá-los é o que permite ao Financeiro abrir em 30 dias e ao
   Painel de Vendas em 12 meses sem duas cópias da mesma tabela de rótulos. */

export function comRecorte(base: string, r: Recorte): string {
  const q = new URLSearchParams();
  if (r.de && r.ate) {
    q.set('de', r.de);
    q.set('ate', r.ate);
  } else {
    q.set('periodo', r.periodo);
  }
  return `${base}?${q}`;
}

/* ─────────────────────────────────────────────────────────── contratos */

export interface TicketMedio {
  valor: number | null;
  vendasElegiveis: number;
  faturamentoElegivel: number;
  /** A régua, em letra. O backend a manda porque ela não é óbvia. */
  regra: string;
}

export interface FaixaDoPeriodo {
  de: string | null;
  ate: string | null;
  periodo: string;
}

export interface GeralDoPainel {
  periodo: FaixaDoPeriodo;
  /** Recortado pela DATA DO PAGAMENTO. */
  faturamento: number;
  /** Recortadas pela DATA DA VENDA. */
  vendas: number;
  pecas: number;
  clientes: number;
  skus: number;
  clientesNovos: number | null;
  aReceber: number;
  receitaDiferencaTroca: number;
  valorMedioPorItem: number | null;
  intervalo: { de: string | null; ate: string | null };
  ticketMedio: TicketMedio;
  composicao: {
    vendasHistoricas: number;
    vendasSistema: number;
    ajustes: number;
    vendasSemData: number;
    faturamentoDeVendas: number;
    faturamentoDeDiferencaTroca: number;
    trocasComDiferencaPaga: number;
    regraAgrupamento: string;
    regraFaturamento: string;
  };
}

export interface PontoDaEvolucao {
  /** `2026-09` na granularidade de mês, `2026-09-05` na de dia. */
  chave: string;
  faturamento: number;
  pecas: number;
  vendas: number;
}

export interface Evolucao {
  periodo: FaixaDoPeriodo;
  granularidade: string;
  pontos: PontoDaEvolucao[];
}

export interface ProdutoDoRanking {
  sku: string;
  nomeHistorico: string | null;
  nomeAtual: string | null;
  renomeado: boolean;
  noCatalogo: boolean;
  categoria: string | null;
  temFoto: boolean;
  fotoUrl: string | null;
  pecas: number;
  faturamento: number;
  participacao: number;
}

export interface RankingDeProdutos {
  periodo: FaixaDoPeriodo;
  por: string;
  produtos: ProdutoDoRanking[];
}

export interface CategoriaDoRanking {
  categoria: string;
  pecas: number;
  faturamento: number;
  participacao: number;
  participacaoFaturamento: number;
}

export interface RankingDeCategorias {
  periodo: FaixaDoPeriodo;
  totalPecas: number;
  totalFaturamento: number;
  categorias: CategoriaDoRanking[];
}

export interface CanalDaOrigem {
  canal: string;
  vendas: number;
  pecas: number;
  faturamento: number;
  clientes: number;
  participacao: number;
}

export interface OrigemClassificada {
  origem: string | null;
  /** O backend CONTA e NOMEIA o que ainda não tem vocabulário comum, em vez
   *  de deixar a fatia sumir. A tela repete isso. */
  indeterminado: boolean;
  vendas: number;
  pecas: number;
  faturamento: number;
  clientes: number;
  participacao?: number;
}

export interface PorOrigem {
  periodo: FaixaDoPeriodo;
  totalFaturamento: number;
  canais: CanalDaOrigem[];
  origens: OrigemClassificada[];
}

export interface ClienteDoRanking {
  nome: string;
  norm: string | null;
  clienteId?: number | null;
  faturamento: number;
  vendas: number;
  pecas: number;
}

export interface RankingDeClientes {
  periodo: FaixaDoPeriodo;
  clientes: ClienteDoRanking[];
}

export interface ContaAReceber {
  /** `historico:12`, `venda:6` ou `troca:3`. A tela devolve a chave, não o id. */
  chave: string;
  tipo: 'historico' | 'venda' | 'troca';
  id: number;
  /** 5.3c — a mesma palavra para as três fontes; volta na escrita. */
  versao: number;
  vendaId: number | null;
  data: string;
  clienteId: number | null;
  clienteNorm: string | null;
  cliente: string | null;
  /** §2 — a venda em que o sistema se recusou a escolher entre homônimas. */
  clienteAmbiguo: boolean;
  origem: string;
  observacao: string | null;
  valorTotal: number;
  valorRecebido: number;
  valorReceber: number;
  vencimentoEm: string | null;
  vencida: boolean;
  pagaEm: string | null;
  cobrancaStatus: string;
  podeDefinirPrazo: boolean;
}

export interface ContasAReceber {
  ok: true;
  /** A resposta RECUSA alegar completude quando não a tem. */
  cobertura: {
    completa: boolean;
    fontes: Record<string, string>;
    porque: string | null;
  };
  resumo: {
    quantidade: number;
    total: number;
    totalCentavos: number;
    vencidas: number;
    semPrazo: number;
    porTipo: Record<string, { quantidade: number; total: number }>;
  };
  contas: ContaAReceber[];
  regra: string;
}

export interface PecaEmReparo {
  id?: number;
  cliente?: string | null;
  produto?: string | null;
  sku?: string | null;
  status?: string;
  prazoEm?: string | null;
  diasRestantes?: number | null;
  atrasada?: boolean;
  [k: string]: unknown;
}

/** O agregado de `/api/analytics/painel`. Uma requisição, todos os blocos do
 *  MESMO recorte — é o que impede o cartão de discordar do gráfico ao lado. */
export interface PainelAnalytics {
  periodo: FaixaDoPeriodo;
  geral: GeralDoPainel;
  evolucao: Evolucao;
  categorias: RankingDeCategorias;
  produtos: RankingDeProdutos;
  origem: PorOrigem;
  topClientes: ClienteDoRanking[];
  mesAtual: {
    mes: string;
    faturamento: number;
    vendas: number;
    pecas: number;
    aReceber: number;
    contasAReceber: number;
  };
  pecasEmReparo: {
    total: number;
    atrasadas: number;
    consideraFeriados?: boolean;
    itens: PecaEmReparo[];
  };
  /** §30 — o que saiu do estoque e NÃO é venda. É o número que explica a
   *  diferença entre "saiu" e "foi vendido". */
  saidasSemFaturamento: {
    mes: string;
    porTipo: Record<string, { pecas: number; lancamentos: number }>;
    pecas: number;
    regra: string;
  };
  contasReceber: ContasAReceber;
  insights: {
    categoriaCampea: { nome: string; pecas: number; participacao: number } | null;
    canalCampeao: { nome: string; faturamento: number; participacao: number } | null;
    melhorMes: { chave: string; faturamento: number; pecas: number; vendas: number } | null;
    ticketMedio: number | null;
    clientesNovos: number | null;
    pecaCampea: {
      sku: string; nome: string; pecas: number; faturamento: number; temFoto: boolean;
    } | null;
    clienteCampea: {
      nome: string; norm: string | null; faturamento: number; vendas: number; pecas: number;
    } | null;
  };
}

/** `/api/analytics/mes` — o resumo de UMA barra do gráfico.
 *
 *  Faturamento é recortado pela data do PAGAMENTO; vendas, peças e clientes,
 *  pela data da VENDA. A diferença entre os dois é dita pelo backend, não
 *  conciliada — e a tela repete a frase em vez de esconder. */
export interface VendaDoMes {
  chave: string;
  fonte: string;
  id: number;
  data: string;
  cliente: string;
  clienteId: number | null;
  norm: string | null;
  pecas: number;
  valor: number;
  recebido: number;
  aReceber: number;
  status: string;
  canal: string | null;
  contexto: string | null;
  observacao: string | null;
  dataFaturamento: string | null;
  /** A compra é deste mês e o dinheiro não entrou em mês nenhum ainda. */
  aindaNaoPaga: boolean;
  /** Entrou, mas em OUTRO mês. Está no cartão de vendas daqui e no de
   *  faturamento de lá — as duas coisas são verdadeiras ao mesmo tempo. */
  faturaEmOutroMes: boolean;
  itens: {
    sku: string;
    nome: string;
    categoria: string | null;
    qtd: number;
    valor: number | null;
    variacao: string | null;
    descontoRotulo: string | null;
    observacao: string | null;
  }[];
}

export interface ResumoDoMes {
  ok: boolean;
  erro?: string;
  mes: string;
  rotulo: string;
  periodo: { de: string; ate: string };
  /** Cada cartão vem com a REGRA dele. O backend a manda porque os quatro
   *  não usam o mesmo recorte, e sem a frase eles pareceriam discordar. */
  cards: {
    faturamento: { valor: number; vendas: number; regra: string };
    vendas: { total: number; regra: string };
    pecas: { total: number; regra: string };
    clientesAtendidos: { total: number; regra: string };
  };
  categorias: { categoria: string; pecas: number; valor: number; participacao: number }[];
  totalPecasCategorias: number;
  vendas: VendaDoMes[];
  /** §9 — compras de outros meses cujo pagamento entrou neste. Somam no
   *  faturamento e NÃO somam em vendas nem em peças. */
  faturamentoDeOutrosMeses: {
    valor: number;
    vendas: number;
    detalhe: { data: string; cliente: string | null; valor: number; pagoEm: string | null }[];
    regra: string;
  };
  regra: string;
}

/* ────────────────────────────────────────────────────────────── buscas */

export function buscarPainelAnalytics(
  conexao: Connection, recorte: Recorte, sinal?: AbortSignal,
): Promise<PainelAnalytics> {
  return chamar(conexao, 'GET', comRecorte('/api/analytics/painel', recorte), undefined, { signal: sinal });
}

export function buscarVisaoGeral(
  conexao: Connection, recorte: Recorte, sinal?: AbortSignal,
): Promise<GeralDoPainel> {
  return chamar(conexao, 'GET', comRecorte('/api/analytics/vendas', recorte), undefined, { signal: sinal });
}

export function buscarEvolucao(
  conexao: Connection, recorte: Recorte,
  granularidade: 'mes' | 'dia' = 'mes', sinal?: AbortSignal,
): Promise<Evolucao> {
  const base = comRecorte('/api/analytics/evolucao', recorte);
  return chamar(conexao, 'GET', `${base}&granularidade=${granularidade}`, undefined, { signal: sinal });
}

export function buscarProdutos(
  conexao: Connection, recorte: Recorte,
  { por = 'faturamento', limite = 20 }: { por?: 'faturamento' | 'quantidade'; limite?: number } = {},
  sinal?: AbortSignal,
): Promise<RankingDeProdutos> {
  const base = comRecorte('/api/analytics/produtos', recorte);
  return chamar(conexao, 'GET', `${base}&por=${por}&limite=${limite}`, undefined, { signal: sinal });
}

export function buscarCategorias(
  conexao: Connection, recorte: Recorte, sinal?: AbortSignal,
): Promise<RankingDeCategorias> {
  return chamar(conexao, 'GET', comRecorte('/api/analytics/categorias', recorte), undefined, { signal: sinal });
}

export function buscarOrigem(
  conexao: Connection, recorte: Recorte, sinal?: AbortSignal,
): Promise<PorOrigem> {
  return chamar(conexao, 'GET', comRecorte('/api/analytics/origem', recorte), undefined, { signal: sinal });
}

export function buscarClientesRanking(
  conexao: Connection, recorte: Recorte,
  { ordem = 'faturamento', limite = 50 }: { ordem?: string; limite?: number } = {},
  sinal?: AbortSignal,
): Promise<RankingDeClientes> {
  const base = comRecorte('/api/analytics/clientes', recorte);
  return chamar(conexao, 'GET', `${base}&ordem=${ordem}&limite=${limite}`, undefined, { signal: sinal });
}

/** `mes` é `AAAA-MM`. Mês inválido é 400 com o motivo — não `tudo`. */
export function buscarResumoDoMes(
  conexao: Connection, mes: string, sinal?: AbortSignal,
): Promise<ResumoDoMes> {
  return chamar(conexao, 'GET', `/api/analytics/mes?mes=${encodeURIComponent(mes)}`, undefined, { signal: sinal });
}
