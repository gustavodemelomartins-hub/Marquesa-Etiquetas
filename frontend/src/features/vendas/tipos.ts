/** Os contratos de Vendas, como o backend realmente responde. */

/** Um produto como `GET /api/state` o devolve. É esta a fonte do seletor
 *  de peças: ela já traz `disponivel`, que é o saldo menos o consignado —
 *  e vender o que está na maleta de alguém é como o estoque fica negativo. */
export interface ProdutoDoEstado {
  sku: string;
  desc: string;
  cat: string;
  /** §24 — NULL quando não há preço. Nunca 0 por omissão. */
  preco: number | null;
  semPreco: boolean;
  /** §46 — custo de referência, digitado. `null`/ausente = não informado. */
  custo?: number | null;
  qtd: number;
  consignado: number;
  disponivel: number;
  status: string;
  /** Quanto a LOJA mostra deste código. `undefined`/`null` = nunca houve
   *  sincronização que o dissesse — e isso não é zero. */
  estoqueLoja?: number | null;
  fotoStatus: string | null;
  /* Os quatro endereços da foto, na ordem de precedência que `state.js`
     documenta. Os dois primeiros são links ASSINADOS e temporários para
     os bytes no R2; os dois últimos são endereços de terceiro. Ver
     `domain/foto.ts › fotoDaPeca`. */
  fotoTratadaUrl?: string | null;
  fotoOriginalUrl?: string | null;
  fotoUrl?: string | null;
  fotoLojaUrl?: string | null;
  /* A GALERIA própria (29/09/2026): a principal ESCOLHIDA, como endereço
     completo (`services/state.ts` resolve), e as contagens dos filtros. */
  fotoGaleriaUrl?: string | null;
  fotoMiniUrl?: string | null;
  /** Fotos na galeria daqui (R2). */
  fotosQtd?: number;
  /** Quantas delas vieram da loja online. */
  fotosDaLoja?: number;
  /** Quantas fotos a loja online tem deste código (pelo espelho). */
  fotosNaLoja?: number;
  /** O código aparece em algum anúncio da loja? `null` = não se sabe ainda. */
  naLoja?: boolean | null;
  /* O retrato da loja, quando houve leitura. */
  urlLoja?: string;
  visivel?: boolean | null;
  nomeLoja?: string;
  variacoes?: { nome: string; atributo?: string | null; varianteId?: string | null; estoqueLoja?: number | null; qtd: number }[];
  semVariacao?: number;
}

/** Uma linha de `GET /api/vendas/lista` — o nível do ITEM, não da venda.
 *  A tela agrupa por `venda_id` para mostrar a venda, e diz que agrupou. */
export interface ItemDaLista {
  fonte: 'operacional' | 'historico';
  id: string;
  venda_id: number | null;
  venda_historica_id: number | null;
  referencia: string;
  data: string;
  cliente: string | null;
  cliente_norm: string | null;
  sku: string;
  produto: string | null;
  qtd: number;
  valor: number;
  canal: string | null;
  observacao: string | null;
  pago: number;
  cancelada: number;
  origem: string | null;
  venda_valor: number | null;
  venda_recebido: number | null;
  /** A chave da VENDA (`H<id>` planilha, `V<id>` sistema). `referencia`, do
   *  lado da planilha, é o Nº da LINHA — agrupar por ela multiplicava a venda. */
  venda_chave?: string;
  /** Em CENTAVOS INTEIROS. */
  financeiro: {
    valorVenda: number;
    valorRecebido: number | null;
    valorAReceber: number | null;
    statusPagamento: string;
    indeterminado: string[];
  } | null;
}

export interface ListaDeVendas {
  itens: ItemDaLista[];
  limite: number;
  offset: number;
}

/** O resumo financeiro da venda, como o servidor o manda: CENTAVOS. */
export interface FinanceiroDaVenda {
  valorVenda: number | null;
  valorRecebido: number | null;
  valorAReceber: number | null;
  statusPagamento: 'paga' | 'nao_paga' | 'parcial' | 'indefinida' | string;
  indeterminado: string[];
}

/** Uma peça dentro da venda — `GET /api/vendas/feitas`, `vendas[].itens[]`.
 *  Dinheiro em REAIS, como está gravado na linha. */
export interface ItemDaVenda {
  id: string | number;
  sku: string;
  produto: string | null;
  qtd: number;
  /** Preço cobrado por peça. `null` = a planilha não disse. */
  precoUnit: number | null;
  /** Total da linha (qtd × preço cobrado). */
  valor: number | null;
  descontoValor: number | null;
  descontoRotulo: string | null;
  observacao: string | null;
  /** Nº da linha na planilha antiga; `null` para venda do sistema. */
  linhaPlanilha: string | null;
}

/** Uma VENDA — uma linha da lista "Vendas feitas". */
export interface VendaFeitaApi {
  chave: string;
  fonte: 'operacional' | 'historico';
  id: number | null;
  data: string | null;
  cliente: string | null;
  clienteNorm: string | null;
  canal: string | null;
  cancelada: boolean;
  /** Tem conta aberta em Financeiro › A receber. */
  emAReceber?: boolean;
  pecas: number;
  financeiro: FinanceiroDaVenda;
  itens: ItemDaVenda[];
}

export interface ListaDeVendasFeitas {
  vendas: VendaFeitaApi[];
  total: number;
  limite: number;
  offset: number;
}

/** A venda pronta para a tela: dinheiro em REAIS, situação decidida. */
export interface VendaFeita {
  chave: string;
  fonte: 'operacional' | 'historico';
  id: number | null;
  data: string | null;
  cliente: string | null;
  clienteNorm: string | null;
  canal: string | null;
  cancelada: boolean;
  emAReceber: boolean;
  pecas: number;
  valor: number | null;
  recebido: number | null;
  aReceber: number | null;
  situacao: 'paga' | 'a_receber' | 'parcial' | 'cancelada' | 'sem_informacao';
  itens: ItemDaVenda[];
}

export interface RespostaDaVenda {
  ok?: boolean;
  id?: number;
  erro?: string;
  sku?: string;
  total?: number;
  pago?: boolean;
  dataPagamento?: string | null;
}
