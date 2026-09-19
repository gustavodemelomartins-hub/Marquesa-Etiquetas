/** Os contratos de Clientes, como o backend REALMENTE responde.
 *
 *  Nada aqui foi inventado: cada campo sai de `api/src/clientes.js`,
 *  `api/src/analytics.js` (`perfilCliente`), `api/src/credito.js`
 *  (`saldoDeCredito`) e da projeção pública de `api/src/garantias.js`.
 *  Onde o backend manda `null`, o tipo diz `null` — um opcional silencioso
 *  aqui vira, três telas adiante, um "R$ 0" que não é zero, é ausência.
 */

export interface ClienteLista {
  id: number;
  nome: string;
  /** Vem sempre, string vazia quando não há. */
  tel: string;
  /** Existe porque duas "Camila" só se distinguem por algo além do nome. */
  cidade: string;
}

export interface CadastroCliente {
  id: number;
  nome: string;
  tel: string | null;
  email: string | null;
  instagram: string | null;
  cidade: string | null;
  cpf: string | null;
  nascimento: string | null;
  obs: string | null;
  nome_norm: string | null;
}

/** O que a cliente compra, em quantidade. */
export interface Contagem {
  valor: string;
  qtd: number;
}

export interface ItemDaVenda {
  sku: string;
  nome: string | null;
  qtd: number;
  preco: number;
  variacao?: string | null;
}

export interface VendaDoPerfil {
  fonte: 'operacional' | 'historico';
  id: number;
  /** A data da VENDA. Não é a do pagamento nem a do cadastro. */
  data: string;
  pecas: number;
  /** O que foi COBRADO. */
  valor: number;
  /** O que entrou. */
  valorRecebido: number;
  /** O que falta. */
  valorReceber: number;
  status: string | null;
  cobrancaStatus: string | null;
  vencimentoEm: string | null;
  /** A data do PAGAMENTO. §30: informável, e diferente da data da venda. */
  pagaEm: string | null;
  canal: string | null;
  contexto: string | null;
  observacao: string | null;
  itens: ItemDaVenda[];
  personalizacoes?: unknown;
}

export interface GarantiaDoPerfil {
  id: number;
  status: string;
  statusRotulo: string;
  pendente: boolean;
  vendaId: number | null;
  sku: string;
  variacao: string | null;
  produtoNome: string | null;
  dataVenda: string | null;
  dataEntrada: string;
  motivo: string;
  observacao: string | null;
  encerradaEm: string | null;
  prazoEm?: string | null;
  atrasado?: boolean;
  diasUteisRestantes?: number | null;
  troca: {
    id: number;
    data: string;
    skuNovo: string;
    produtoNovoNome: string | null;
    valorOriginal: number;
    valorNovo: number;
    diferenca: number;
    diferencaStatus: string;
    creditoAoCliente: number;
  } | null;
}

export interface ResumoPerfil {
  /** §38 — os três, separados e ditos por nome. */
  comprou: number;
  pago: number;
  emAberto: number;
  faturamento: number;
  pecas: number;
  vendas: number;
  ticketMedio: number | null;
  ticketMedioRecebido: number | null;
  gastoMedioPorPeca: number | null;
  regraFinanceira: string;
  primeiraCompra: string | null;
  ultimaCompra: string | null;
  estado: 'sem histórico' | 'ativa' | 'recorrente' | 'em risco' | 'inativa';
  diasSemComprar: number | null;
  frequenciaDias: number | null;
  itensLancados: number;
  vendasSistema: number;
}

export interface PerfilCliente {
  ok: true;
  cadastro: CadastroCliente | null;
  clienteId: number | null;
  norm: string | null;
  /** §2 — nome não é identidade. */
  homonimos: number;
  nomeAmbiguo: boolean;
  aviso: string | null;
  nomeExibicao: string;
  resumo: ResumoPerfil;
  canalPreferido: string | null;
  categoriasPreferidas: Contagem[];
  produtosPreferidos: Contagem[];
  contextos: Contagem[];
  vendas: VendaDoPerfil[];
  totalItens: number;
  correcoes: unknown[];
  garantias: GarantiaDoPerfil[];
  garantiasPendentes: GarantiaDoPerfil[];
}

export interface MovimentoCredito {
  id: number;
  tipo: 'credito' | 'consumo' | 'estorno' | 'ajuste';
  valorCentavos: number;
  origem: string;
  origemId: number | null;
  vendaId: number | null;
  motivo: string | null;
  criadoEm: string;
}

export interface CreditoCliente {
  ok: true;
  cliente: { id: number; nome: string };
  moeda: 'centavos';
  saldoCentavos: number;
  geradoCentavos: number;
  consumidoCentavos: number;
  estornadoCentavos: number;
  ajusteLiquidoCentavos: number;
  saldoNegativo: boolean;
  extrato: MovimentoCredito[];
  extratoCompleto: boolean;
  regra: string;
}

/** O que o formulário de cadastro edita. Os campos que o backend aceita em
 *  `POST /api/clientes` e `PATCH /api/clientes/:id`, e só eles. */
export interface DadosCadastro {
  nome: string;
  tel: string;
  email: string;
  instagram: string;
  cidade: string;
  cpf: string;
  nascimento: string;
  obs: string;
}
