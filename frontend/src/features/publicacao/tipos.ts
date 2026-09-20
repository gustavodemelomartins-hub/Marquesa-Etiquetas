/** FILA DE PUBLICAÇÃO — o contrato de `publicacao-catalogo.js`.
 *
 *  Uma peça atravessa o funil inteiro antes de existir na loja, e cada
 *  degrau responde uma pergunta diferente:
 *
 *    falta_informacao       falta preço, foto, nome ou categoria — trabalho
 *                           de gente, e a lista `falta` diz o quê
 *    pronto_para_preparacao nada falta; a preparação pode começar
 *    em_preparacao          o preparador está trabalhando
 *    preparado              texto e imagem prontos
 *    aguardando_aprovacao   a prévia existe e pede um olho humano
 *    aprovado_para_publicar alguém aprovou
 *    publicando             a escrita está em curso
 *    publicado              está na loja
 *    falhou_ao_publicar     tentou e não deu; `erroPublicacao` diz por quê
 *    despublicado           saiu da loja
 *
 *  `bloqueios` NÃO é `falta`, e a diferença é o que impede a tela de culpar
 *  a pessoa errada: `falta` é o que a PEÇA não tem, `bloqueios` é o que este
 *  SERVIDOR não consegue fazer — R2 ausente, preparador não configurado.
 */

export const ESTADOS = {
  FALTA: 'falta_informacao',
  PRONTO: 'pronto_para_preparacao',
  PREPARANDO: 'em_preparacao',
  PREPARADO: 'preparado',
  AGUARDANDO: 'aguardando_aprovacao',
  APROVADO: 'aprovado_para_publicar',
  PUBLICANDO: 'publicando',
  PUBLICADO: 'publicado',
  FALHOU: 'falhou_ao_publicar',
  DESPUBLICADO: 'despublicado',
} as const;

export type EstadoDaPublicacao = typeof ESTADOS[keyof typeof ESTADOS];

/** Os cinco degraus que o protótipo desenha, e o mapa de cada estado do
 *  servidor para um deles. Cinco degraus são o que cabe numa tela; dez
 *  estados são o que o servidor precisa para não perder informação, e
 *  mostrar os dez faria a barra de progresso virar uma lista. */
export const DEGRAUS = [
  { id: 'preparar', rotulo: 'Preparar' },
  { id: 'revisar', rotulo: 'Revisar' },
  { id: 'aprovar', rotulo: 'Aprovar' },
  { id: 'publicando', rotulo: 'Publicando' },
  { id: 'publicado', rotulo: 'Publicado' },
] as const;

export type Degrau = typeof DEGRAUS[number]['id'];

export function degrauDoEstado(estado: string): Degrau {
  switch (estado) {
    case ESTADOS.FALTA:
    case ESTADOS.PRONTO:
    case ESTADOS.PREPARANDO:
      return 'preparar';
    case ESTADOS.PREPARADO:
    case ESTADOS.AGUARDANDO:
      return 'revisar';
    case ESTADOS.APROVADO:
      return 'aprovar';
    case ESTADOS.PUBLICANDO:
    case ESTADOS.FALHOU:
      return 'publicando';
    case ESTADOS.PUBLICADO:
      return 'publicado';
    default:
      /* `despublicado` volta ao começo de propósito: a peça saiu da loja e o
         caminho de volta é o mesmo caminho de ida. */
      return 'preparar';
  }
}

/** O que falta, em português. O servidor manda a palavra-chave; o rótulo é
 *  da tela, e só dela — traduzir no servidor obrigaria o painel clássico e a
 *  V2 a concordarem sobre texto de interface. */
export const ROTULO_DA_FALTA: Record<string, string> = {
  foto: 'sem foto',
  nome: 'sem nome de site',
  descricao: 'sem descrição',
  categoria: 'sem categoria',
  preco: 'sem preço',
  quantidade: 'sem peça em casa',
};

export interface RascunhoDoSite {
  nomeSite: string;
  descricaoSite: string;
  seoTitulo: string;
  seoDescricao: string;
}

export interface ItemDaFila {
  sku: string;
  desc: string;
  cat: string | null;
  preco: number | null;
  /** Peças EM CASA. É o que pode ir para a loja — o que está em maleta não. */
  casa: number;
  qtd: number;
  fotoStatus: string;
  temOriginal: boolean;
  temTratada: boolean;
  /** Três estados, não dois: foto nossa, só o endereço da foto da loja, ou
   *  nenhuma. Uma peça com foto só na loja não é uma peça com foto. */
  temFotoPropria: boolean;
  temEnderecoDaLoja: boolean;
  estado: EstadoDaPublicacao;
  estadoRotulo: string;
  /** O que a PEÇA não tem. Trabalho de gente. */
  falta: string[];
  /** O que este SERVIDOR não consegue fazer. Trabalho de infraestrutura. */
  bloqueios: { motivo?: string; proximoPasso?: string; [k: string]: unknown }[];
  /** Fato lido da vitrine, ao lado da decisão nossa. "A loja mostra" e "nós
   *  decidimos" nunca compartilham um campo. */
  presencaNaLoja: boolean;
  produtoIdLoja: string | null;
  estadoObservado: boolean;
  pronto: boolean;
  /** A aprovação caiu porque o dado mudou depois dela. */
  aprovacaoInvalidada: boolean;
  bloqueioExterno: { motivo: string; proximoPasso: string } | null;
  erroPublicacao: string | null;
  tentativas: number;
  rascunho: RascunhoDoSite | null;
  aprovadoEm: string | null;
  aprovadoPor: string | null;
  publicadoEm: string | null;
  urlLoja: string | null;
  dadosAssinaturaAtual: string | null;
}

export interface FilaDePublicacao {
  ok: true;
  migrado: boolean;
  /** O PRÓPRIO SERVIDOR diz que a escrita na loja está desligada. A tela
   *  repete a palavra dele em vez de afirmar por conta própria. */
  escritaNaLojaHabilitada: boolean;
  decisaoPendente: string;
  resumo: {
    prontos: number;
    pecasProntas: number;
    valorPronto: number;
    semFoto: number;
    semFundoBranco: number;
    semDescricao: number;
    semCategoria: number;
    semPreco: number;
    valorParado: number;
    estados: Record<string, number>;
  };
  itens: ItemDaFila[];
  prontos: ItemDaFila[];
  semFoto: ItemDaFila[];
  semFundoBranco: ItemDaFila[];
  semDescricao: ItemDaFila[];
  semCategoria: ItemDaFila[];
  semPreco: ItemDaFila[];
  [k: string]: unknown;
}

/** Quantas peças em cada degrau. É o cabeçalho do funil, e ele conta os
 *  ITENS — não as listas legadas, que se sobrepõem: a mesma peça sem foto E
 *  sem preço aparece nas duas. */
export function porDegrau(itens: ItemDaFila[]): Record<Degrau, ItemDaFila[]> {
  const mapa: Record<Degrau, ItemDaFila[]> = {
    preparar: [], revisar: [], aprovar: [], publicando: [], publicado: [],
  };
  for (const i of itens) mapa[degrauDoEstado(i.estado)].push(i);
  return mapa;
}
