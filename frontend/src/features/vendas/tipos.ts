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

/** Uma venda, montada agrupando as linhas que compartilham a referência. */
export interface VendaAgrupada {
  chave: string;
  fonte: 'operacional' | 'historico';
  id: number | null;
  referencia: string;
  data: string;
  cliente: string | null;
  clienteNorm: string | null;
  canal: string | null;
  pago: boolean;
  cancelada: boolean;
  pecas: number;
  valor: number;
  recebido: number | null;
  aReceber: number | null;
  /** Quando o backend não sabe um número, ele diz. A tela repete em vez de
   *  mostrar zero. */
  indeterminado: string[];
  itens: ItemDaLista[];
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
