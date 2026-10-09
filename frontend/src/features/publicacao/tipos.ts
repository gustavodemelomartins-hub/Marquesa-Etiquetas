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
  /** §61 — onde a peça está na Preparação para Nuvemshop. */
  situacao?: Situacao;
  /** §61 — tudo o que falta, numa lista só: cadastro, texto do site, o que
   *  a loja tem (pela última conferência) e problemas de integração. */
  pendencias?: string[];
  /** §61 — para peça publicada: o estoque dela na loja está em dia? */
  sincronizacao?: 'sincronizado' | 'pendente' | 'divergente' | 'erro' | 'revisao' | null;
  erroSincronizacao?: string | null;
  /** §62 — a peça no catálogo da Nuvemshop (oculta, visível, o que falta). */
  nuvemshop?: InfoNuvemshop;
}

/* ════════════════════════ §61/§62 — Preparação para Nuvemshop */

/** As cinco perguntas operacionais (§62). `preparacao` e `revisao` só
 *  aparecem quando o servidor ainda não tem a classificação do catálogo
 *  oculto (banco sem a migration) — e caem em "não cadastrados"/"ocultos". */
export type Situacao = 'nao_cadastrado' | 'oculto' | 'pronto' | 'publicado' | 'erro'
  | 'preparacao' | 'revisao';

export type SituacaoDaTela = 'nao_cadastrado' | 'oculto' | 'pronto' | 'publicado' | 'erro';

/** As abas da Preparação. Cada uma é uma pergunta com um dono:
 *  não cadastrado e oculto são preparação (cadastro, foto, texto); pronto é
 *  o clique de quem aprova; publicado é a loja; erro é integração. */
export const SITUACOES: { id: SituacaoDaTela; rotulo: string }[] = [
  { id: 'nao_cadastrado', rotulo: 'Não cadastrados' },
  { id: 'oculto', rotulo: 'Ocultos — em preparação' },
  { id: 'pronto', rotulo: 'Prontos para publicar' },
  { id: 'publicado', rotulo: 'Publicados' },
  { id: 'erro', rotulo: 'Com erro' },
];

/** Os filtros por pendência. */
export const FILTROS_DE_PENDENCIA: { id: string; rotulo: string; chaves: string[] }[] = [
  { id: 'todos', rotulo: 'Todos', chaves: [] },
  { id: 'foto', rotulo: 'Falta foto', chaves: ['foto'] },
  { id: 'descricao', rotulo: 'Falta descrição', chaves: ['descricao', 'nome'] },
  { id: 'seo', rotulo: 'Falta SEO', chaves: ['seo'] },
  { id: 'preco', rotulo: 'Falta preço', chaves: ['preco'] },
  { id: 'variacao', rotulo: 'Revisar variação', chaves: ['variacao', 'variante', 'sku', 'sku_duplicado'] },
  { id: 'estoque_variacao', rotulo: 'Conferir estoque da variação', chaves: ['estoque_variacao', 'estoque'] },
  { id: 'sem_estoque', rotulo: 'Sem peça em casa', chaves: ['sem_estoque'] },
  { id: 'categoria', rotulo: 'Falta categoria', chaves: ['categoria'] },
  { id: 'erro', rotulo: 'Erro', chaves: ['erro'] },
];

export const ROTULO_DA_PENDENCIA: Record<string, string> = {
  foto: 'Falta foto',
  nome: 'Falta nome',
  descricao: 'Falta descrição',
  seo: 'Falta SEO',
  categoria: 'Falta categoria',
  preco: 'Falta preço',
  variacao: 'Revisar variação',
  estoque_variacao: 'Conferir estoque da variação',
  estoque: 'Estoque ainda não confirmado na loja',
  link_direto: 'Comprável pelo link direto (não listado)',
  sem_estoque: 'Sem peça em casa',
  sku: 'Variante sem SKU',
  sku_duplicado: 'SKU duplicado',
  variante: 'Variante incompleta',
  erro: 'Erro de integração',
};

const ROTULO_DA_SINCRONIZACAO: Record<string, string> = {
  sincronizado: 'Estoque sincronizado',
  pendente: 'Estoque aguardando envio',
  divergente: 'Estoque divergente',
  erro: 'Erro ao enviar estoque',
  revisao: 'Estoque em revisão',
};

/** O que a classificação do catálogo oculto diz da peça (§62). */
export interface InfoNuvemshop {
  situacao: SituacaoDaTela;
  naLoja: boolean;
  visibilidade: 'hidden' | 'unlisted' | 'visible' | null;
  produtoId: string | null;
  /** Peça sem anúncio: o sistema pode criá-la oculta sozinho? */
  criavel: boolean;
  /** Por que NÃO será criada sozinha (mesmo modelo já anunciado, variação a
   *  revisar, kit...). Decisão de gente. */
  bloqueios: string[];
  pendencias: { chave: string; motivo: string }[];
  variacoes: { nome: string; estoque: number }[];
  variacoesSoAqui: string[];
  texto: {
    descricao: string | null; seoTitulo: string | null; seoDescricao: string | null;
    origem: string | null; precisaInformacao: string | null;
  } | null;
  estoque: string | null;
  sincronizadoEm: string | null;
  ultimoErro: string | null;
  fotoNaLoja: boolean | null;
  textoNaLoja: { descricao: boolean; seo: boolean } | null;
  estadoCatalogo: string | null;
  origemCatalogo: string | null;
}

/** A situação da peça como a TELA a agrupa. */
export function situacaoDaTela(i: ItemDaFila): SituacaoDaTela {
  const s = i.nuvemshop?.situacao ?? i.situacao;
  if (s === 'preparacao') return 'nao_cadastrado';
  if (s === 'revisao') return 'oculto';
  return (s ?? 'nao_cadastrado') as SituacaoDaTela;
}

/** A frase da linha: onde a peça está e o que falta. */
export function fraseDaPeca(i: ItemDaFila): string {
  const p = (i.pendencias ?? []).map((k) => ROTULO_DA_PENDENCIA[k] ?? k);
  const s = situacaoDaTela(i);
  if (s === 'publicado') {
    const sinc = i.sincronizacao ? ROTULO_DA_SINCRONIZACAO[i.sincronizacao] : null;
    return ['Publicado', sinc, ...p].filter(Boolean).join(' · ');
  }
  if (s === 'pronto') return 'Pronto para ficar visível';
  if (s === 'oculto') return ['Oculto na Nuvemshop', ...p].join(' · ');
  if (s === 'erro') return ['Com erro', ...p].join(' · ');
  if (i.nuvemshop && !i.nuvemshop.criavel && i.nuvemshop.bloqueios.length) {
    return ['Não cadastrado · precisa de decisão', ...p].join(' · ');
  }
  if (p.length) return p.join(' · ');
  return i.estadoRotulo;
}

export function porSituacao(itens: ItemDaFila[]): Record<SituacaoDaTela, ItemDaFila[]> {
  const mapa: Record<SituacaoDaTela, ItemDaFila[]> = {
    nao_cadastrado: [], oculto: [], pronto: [], publicado: [], erro: [],
  };
  for (const i of itens) mapa[situacaoDaTela(i)].push(i);
  return mapa;
}

/** O checklist do card: ✓ feito, ✕ falta, ⚠ precisa conferir. */
export type MarcaDoItem = 'ok' | 'falta' | 'aviso';
export function checklistDaPeca(i: ItemDaFila): { rotulo: string; marca: MarcaDoItem; detalhe?: string }[] {
  const pend = new Map((i.nuvemshop?.pendencias ?? []).map((x) => [x.chave, x.motivo]));
  for (const k of i.pendencias ?? []) if (!pend.has(k)) pend.set(k, ROTULO_DA_PENDENCIA[k] ?? k);
  const naLoja = i.nuvemshop?.naLoja ?? i.presencaNaLoja;
  const marca = (chaves: string[], aviso = false): MarcaDoItem =>
    (chaves.some((k) => pend.has(k)) ? (aviso ? 'aviso' : 'falta') : 'ok');
  const det = (chaves: string[]) => chaves.map((k) => pend.get(k)).filter(Boolean).join(' ') || undefined;
  return [
    { rotulo: 'Cadastro', marca: naLoja ? 'ok' : 'falta', detalhe: naLoja ? undefined : 'Ainda não existe na Nuvemshop.' },
    { rotulo: 'SKU', marca: marca(['sku', 'sku_duplicado']), detalhe: det(['sku', 'sku_duplicado']) },
    { rotulo: 'Descrição', marca: marca(['descricao', 'nome']), detalhe: det(['descricao', 'nome']) },
    { rotulo: 'SEO', marca: marca(['seo']), detalhe: det(['seo']) },
    { rotulo: 'Preço', marca: marca(['preco']), detalhe: det(['preco']) },
    { rotulo: 'Estoque', marca: marca(['estoque_variacao', 'estoque', 'sem_estoque'], true), detalhe: det(['estoque_variacao', 'estoque', 'sem_estoque']) },
    { rotulo: 'Foto', marca: marca(['foto']), detalhe: det(['foto']) },
    { rotulo: 'Categoria', marca: marca(['categoria']), detalhe: det(['categoria']) },
    { rotulo: 'Variação', marca: marca(['variacao', 'variante'], true), detalhe: det(['variacao', 'variante']) },
  ];
}

export const ROTULO_DA_VISIBILIDADE: Record<string, string> = {
  hidden: 'OCULTO',
  unlisted: 'NÃO LISTADO',
  visible: 'VISÍVEL',
};

export interface FilaDePublicacao {
  ok: true;
  migrado: boolean;
  /** O PRÓPRIO SERVIDOR diz que a escrita na loja está desligada. A tela
   *  repete a palavra dele em vez de afirmar por conta própria. */
  escritaNaLojaHabilitada: boolean;
  decisaoPendente: string;
  /** §62 — o kill switch do catálogo oculto. */
  catalogoAtivo?: boolean;
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
