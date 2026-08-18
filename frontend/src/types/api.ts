/** Contratos do backend, derivados do código REAL — não do nome das
 *  entidades.
 *
 *  Fonte de cada tipo:
 *    AppState          api/src/state.js › montarState  (GET /api/state)
 *    Product           o mesmo, no `.map` de produtos
 *    SyncSummary       api/src/sync.js › resumoSync
 *    SyncReport        api/src/sync.js › sincronizar   (POST /api/sync)
 *
 *  Quando o backend mudar, este arquivo muda junto. Ele é a fronteira: é
 *  aqui que "o que o servidor manda" vira "o que o TypeScript sabe".
 */

/* ------------------------------------------------------------- produto */

/** Uma variação de um código: o aro do anel, o comprimento da corrente.
 *  A etiqueta é a mesma nas duas — quem distingue é ela, na hora. */
export interface Variant {
  /** "16", "45cm", "Ródio" — o que diferencia esta variação das irmãs. */
  nome: string;
  /** Como a LOJA chama a dimensão que varia: "Tamanho", "Comprimento".
   *  Não é lista fixa nossa: cada produto da Nuvemshop declara a sua. */
  atributo: string | null;
  /** Id da variação na Nuvemshop, usado para endereçar a caixinha certa. */
  varianteId: string;
  /** Quanto a loja mostra nesta variação. */
  estoqueLoja: number | null;
  /** Quanto existe aqui — a mesma soma de `movimentos`, com um filtro a mais. */
  qtd: number;
}

/** Componente de um kit. Presença de `componentes` num produto é o que
 *  significa "isto é um kit". */
export interface KitComponent {
  sku: string;
  qtd: number;
  desc: string;
}

export interface Product {
  sku: string;
  desc: string;
  cat: string;
  /** §24: `null` significa SEM PREÇO, nunca R$ 0. A venda fica bloqueada. */
  preco: number | null;
  semPreco: boolean;
  /** Estoque TOTAL. Inclui o que está em maleta. */
  qtd: number;
  /** Em maletas ainda não encerradas. */
  consignado: number;
  /** total − consignado. Para kit, é o mínimo entre os componentes. */
  disponivel: number;
  status: 'ativo' | 'inativo';

  /* --- retrato da loja, reescrito a cada rodada de sincronização --- */
  urlLoja?: string;
  estoqueLoja?: number;
  visivel: boolean | null;
  nomeLoja?: string;

  /** Presença = é um kit. Kit nunca tem saldo próprio. */
  componentes?: KitComponent[];
  /** Presença = este código é vendido em mais de uma opção. */
  variacoes?: Variant[];
  /** Quanto do total ainda não foi atribuído a nenhuma variação. */
  semVariacao?: number;
}

/* -------------------------------------------------------- revendedoras */

export interface Reseller {
  id: number;
  nome: string;
  tel: string;
  cidade: string;
  cpf: string;
  endereco: string;
  obs: string;
  status: 'ativa' | 'inativa';
  criadaEm: string;
}

/* -------------------------------------------------------------- maleta */

export type SuitcaseStatus = 'aberta' | 'em_acerto' | 'encerrada' | 'cancelada';

export interface Suitcase {
  id: number;
  revId: number;
  status: SuitcaseStatus;
  abertaEm: string | null;
  acertoEm: string | null;
  encerradaEm: string | null;
  obs?: string;
  /** SKU → quantidade enviada. */
  itens: Record<string, number>;
  /** §6.1: o preço congelado no momento do envio. `null` = peça sem preço. */
  precos: Record<string, number | null>;
  acerto?: unknown;
}

/* ------------------------------------------------------------ inventário */

/** `api/src/inventario.js › resumoInventario`. Os campos exatos variam com
 *  o estado; a tela nova só precisa saber se há um aberto. */
export interface InventorySummary {
  abertoId?: number | null;
  [campo: string]: unknown;
}

/* ------------------------------------------------------------------ loja */

/** Um código que a sincronização decidiu NÃO empurrar, e por quê.
 *  Vem de `config.lojaVariacoes`, gravado por `sync.js`. */
export interface UnpushedCode {
  sku: string;
  desc: string;
  /** Quanto existe em casa (total − consignado). */
  casa: number;
  /** Quanto a loja mostra, somando as variações. */
  naLoja: number;
  motivo: UnpushedReason;
  /** Como a loja chama o que varia neste produto. */
  atributos: string[];
  variacoes: Array<{ nome: string; estoque: number }>;
}

/** Os três impedimentos, e nenhum deles é bug:
 *   duplicado      mesmo código em dois anúncios — não há como dividir
 *   maleta         a maleta não sabe qual variação saiu
 *   sem_reparticao repartição pela metade tiraria peça do ar */
export type UnpushedReason = 'duplicado' | 'maleta' | 'sem_reparticao';

/** O retrato da loja da ÚLTIMA rodada — não do último CSV. */
export interface StoreSnapshot {
  lidoEm: string | null;
  produtosNaLoja: number;
  /** Produtos (não códigos) da loja que casaram com o catálogo. */
  produtosCasados: number;
  soNaLoja: number;
  codigosCasados: number;
  /** SKUs em produtos DIFERENTES — cadastro duplicado de verdade. */
  duplicados: string[];
  variacoes: UnpushedCode[];
}

/* -------------------------------------------------------------- sync */

/** Por que a rodada parou sozinha em vez de aplicar. */
export interface SyncPause {
  motivo: string;
  mudancas: number;
  zerando: number;
}

/** `resumoSync` — o que `GET /api/state` traz sobre a sincronização. */
export interface SyncSummary {
  conectada: boolean;
  ultimaEm: string | null;
  ultimoStatus: 'rodando' | 'ok' | 'pausado' | 'erro' | null;
  pausada: SyncPause | null;
  erro: string | null;
  ultimaId: number | null;
}

/* ------------------------------------------------------------ config */

export interface CommissionTier {
  limite: number | null;
  pct: number;
}

export interface AppConfig {
  prazoDias: number;
  prataPct: number;
  inventarioDias: number;
  faixas: CommissionTier[];
}

export interface Category {
  nome: string;
  ordem: number;
  cor: string | null;
}

/* ---------------------------------------------------------- o estado */

/** O que `GET /api/state` devolve inteiro. `v` é 2 hoje. */
export interface AppState {
  v: number;
  produtos: Product[];
  revendedoras: Reseller[];
  maletas: Suitcase[];
  config: AppConfig;
  loja: StoreSnapshot | null;
  inventario: InventorySummary;
  sync: SyncSummary;
  categorias: Category[];
}

/* -------------------------------------------------------------- erro */

/** Erro vindo da API, com o que o servidor disse. O backend responde
 *  `{ erro: "..." }` e é essa frase que a tela mostra — ela costuma dizer o
 *  que FAZER, não só o que houve. */
export class ApiError extends Error {
  readonly status: number;
  readonly corpo: unknown;

  constructor(mensagem: string, status: number, corpo: unknown) {
    super(mensagem);
    this.name = 'ApiError';
    this.status = status;
    this.corpo = corpo;
  }

  /** 401 = chave errada ou ausente. Vale uma mensagem própria na tela. */
  get naoAutorizado(): boolean {
    return this.status === 401;
  }
}
