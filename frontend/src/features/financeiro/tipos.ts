/** Os contratos do Financeiro, como o backend REALMENTE responde.
 *
 *  Cada campo saiu de uma chamada ao Worker, não de leitura de código: as
 *  formas abaixo foram conferidas contra `/api/analytics/painel`,
 *  `/api/contas-receber`, `/api/financeiro/conferir`, `/api/credito/conferir`,
 *  `/api/vendas/lancamentos`, `/api/vendas/dia` e `/api/saidas`.
 *
 *  UMA FONTE POR CONTRATO. O que Financeiro compartilha com outra tela mora
 *  onde as duas alcançam, e é REEXPORTADO daqui para o código que já o
 *  importava não precisar mudar de endereço:
 *
 *    `/api/analytics/*`  → `domain/analytics.ts`   (Vendas faz as mesmas
 *                          perguntas, sobre o mesmo recorte)
 *    `/api/saidas`       → `features/saidas/tipos.ts`
 *
 *  Duas descrições do mesmo JSON divergem no dia em que só uma acompanha o
 *  backend, e a divergência aparece como número diferente em duas telas do
 *  mesmo sistema.
 */
export type {
  Periodo, Recorte, TicketMedio, GeralDoPainel, PontoDaEvolucao,
  ContaAReceber, ContasAReceber,
  PainelAnalytics as PainelFinanceiro,
} from '../../domain/analytics';
export type {
  SaidaSemFaturamento, Saidas, ResumoDeSaidas, TipoDeSaida,
} from '../saidas/tipos';

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

export interface ConferenciaCredito {
  ok: boolean;
  negativos?: { clienteId: number; nome: string; saldoCentavos: number }[];
  [k: string]: unknown;
}
