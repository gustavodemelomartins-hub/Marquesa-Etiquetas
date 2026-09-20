/** Os contratos do Financeiro, como o backend REALMENTE responde.
 *
 *  Cada campo saiu de uma chamada ao Worker, não de leitura de código: as
 *  formas abaixo foram conferidas contra `/api/analytics/painel`,
 *  `/api/contas-receber`, `/api/financeiro/conferir`, `/api/credito/conferir`,
 *  `/api/vendas/lancamentos`, `/api/vendas/dia` e `/api/saidas`.
 */

/** Os cinco recortes que `faixaDePeriodo` aceita, mais o intervalo livre. */
export type Periodo = '7d' | '30d' | '90d' | '12m' | 'tudo';

export interface Recorte {
  periodo: Periodo;
  de: string | null;
  ate: string | null;
}

export interface TicketMedio {
  valor: number | null;
  vendasElegiveis: number;
  faturamentoElegivel: number;
  /** A régua, em letra. O backend a manda porque ela não é óbvia. */
  regra: string;
}

export interface GeralDoPainel {
  periodo: { de: string | null; ate: string | null; periodo: string };
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
  chave: string;
  faturamento: number;
  pecas: number;
  vendas: number;
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

export interface PainelFinanceiro {
  periodo: { de: string | null; ate: string | null; periodo: string };
  geral: GeralDoPainel;
  evolucao: { pontos: PontoDaEvolucao[] };
  categorias: { categorias: { categoria: string; pecas: number; participacao: number }[] };
  produtos: { produtos: { sku: string; nomeAtual: string | null; nomeHistorico: string | null; pecas: number; faturamento: number }[] };
  origem: { canais: { canal: string; faturamento: number; participacao: number }[] };
  topClientes: { nome: string; norm: string | null; faturamento: number; vendas: number }[];
  mesAtual: {
    mes: string;
    faturamento: number;
    vendas: number;
    pecas: number;
    aReceber: number;
    contasAReceber: number;
  };
  pecasEmReparo: { total: number; atrasadas: number; itens: unknown[] };
  /** §30 — o que saiu do estoque e NÃO é venda. É o número que explica a
   *  diferença entre "saiu" e "foi vendido". */
  saidasSemFaturamento: {
    mes: string;
    porTipo: Record<string, { pecas: number; lancamentos: number }>;
    pecas: number;
    regra: string;
  };
  contasReceber: ContasAReceber;
}

export interface Checagem {
  id: string;
  origem: string;
  invariante: string;
  divergentes: unknown[];
}

export interface Conferencia {
  ok: boolean;
  total: number;
  checagens: Checagem[];
}

export interface LancamentosDoDia {
  ok: true;
  data: string;
  vendidoNoDia: { valor: number; pecas: number; vendas: number; formula: string };
  balcao: { valor: number; vendas: number; pecas: number };
  acerto: {
    bruto: number; comissao: number; liquido: number; pecas: number;
    acertos: number; exato: boolean;
  };
  aReceberDoDia: { valor: number; vendas: number };
  /** O dinheiro que ENTROU no dia — recortado pela data do pagamento. */
  recebidoNoDia: number;
  semFaturamento: number;
  movimentacoes: number;
  regra: string;
}

export interface ItemDoDia {
  fonte: string;
  venda_id: number | null;
  data: string;
  cliente: string | null;
  sku: string;
  produto: string | null;
  qtd: number;
  valor: number;
  canal: string | null;
  pago: number;
}

export interface VendasDoDia {
  ok: true;
  data: string;
  itens: ItemDoDia[];
  resumo: {
    linhas: number;
    vendas: number;
    pecasVendidas: number;
    valorVendido: number;
    recebidoNoDia: number;
    semFaturamento: number;
  };
}

export interface SaidaSemFaturamento {
  id: number;
  data: string;
  tipo: string;
  sku: string;
  produto: string | null;
  qtd: number;
  sentido: string;
  motivo: string | null;
  estornada: number;
}

export interface Saidas {
  ok: true;
  saidas: SaidaSemFaturamento[];
  resumo: Record<string, number>;
}

export interface ConferenciaCredito {
  ok: boolean;
  negativos?: { clienteId: number; nome: string; saldoCentavos: number }[];
  [k: string]: unknown;
}
