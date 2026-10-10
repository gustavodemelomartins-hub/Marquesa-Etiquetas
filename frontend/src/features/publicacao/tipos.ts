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
export type Situacao = 'nao_cadastrado' | 'oculto' | 'pronto' | 'publicado' | 'erro' | 'sem_estoque'
  | 'preparacao' | 'revisao';

/** §64 — `sem_estoque`: oculto sem peça em casa. É ESTADO, não falha: fica
 *  cadastrado, fora da fila de trabalho, e volta sozinho quando entra peça. */
export type SituacaoDaTela = 'nao_cadastrado' | 'oculto' | 'pronto' | 'publicado' | 'erro' | 'sem_estoque';

/** As abas da Preparação. Cada uma é uma pergunta com um dono:
 *  não cadastrado e oculto são preparação (cadastro, foto, texto); pronto é
 *  o clique de quem aprova; publicado é a loja; erro é integração. */
export const SITUACOES: { id: SituacaoDaTela; rotulo: string }[] = [
  { id: 'nao_cadastrado', rotulo: 'Não cadastrados' },
  { id: 'oculto', rotulo: 'Ocultos — em preparação' },
  { id: 'pronto', rotulo: 'Prontos para publicar' },
  { id: 'publicado', rotulo: 'Publicados' },
  { id: 'erro', rotulo: 'Com erro' },
  { id: 'sem_estoque', rotulo: 'Sem peça em casa' },
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
  cadastro: 'Ainda não cadastrado na Nuvemshop',
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
  /** §63 — publicado por aqui em … */
  publicadoEm?: string | null;
  /** §63 — foi publicado por aqui e deixou de estar visível. Oculto que
   *  nunca foi publicado é preparação, não alerta. */
  foraDoArInesperado?: boolean;
  /** §64 — kit/Monte seu Colar: não vira anúncio por este caminho, e isso
   *  não é tarefa de ninguém. */
  naoSeAplica?: string | null;
  /** §64 — a categoria que o sistema aplica sozinho na loja. */
  categoriaLoja?: { id: string; chave: string; regra: string } | null;
  /** §64 — as variações só daqui serão criadas na loja pelo sistema. */
  variacoesAutomaticas?: boolean;
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
  if (s === 'sem_estoque') return 'Sem peça em casa · fora da fila até entrar estoque';
  if (s === 'erro') return ['Com erro', ...p].join(' · ');
  if (i.nuvemshop && !i.nuvemshop.criavel && i.nuvemshop.bloqueios.length) {
    return ['Não cadastrado · precisa de decisão', ...p].join(' · ');
  }
  if (p.length) return p.join(' · ');
  return i.estadoRotulo;
}

export function porSituacao(itens: ItemDaFila[]): Record<SituacaoDaTela, ItemDaFila[]> {
  const mapa: Record<SituacaoDaTela, ItemDaFila[]> = {
    nao_cadastrado: [], oculto: [], pronto: [], publicado: [], erro: [], sem_estoque: [],
  };
  for (const i of itens) mapa[situacaoDaTela(i)].push(i);
  return mapa;
}

/** O checklist do card, em DUAS partes (§64):
 *
 *    CADASTRO        o que a peça precisa ter para ir à loja — ✓ feito,
 *                    ✕ falta, ! conferir, ↻ o sistema está resolvendo
 *                    sozinho (categoria óbvia, variação que falta lá);
 *    DISPONIBILIDADE quantas peças há em casa. Estoque zero é ESTADO, não
 *                    falha: não ganha ✕ nem !, só diz que a peça fica fora
 *                    da fila até entrar estoque.
 *
 *  Cada item lê as MESMAS chaves de pendência que o servidor usa para
 *  classificar a peça e para recusar a publicação (`classificarCatalogo`,
 *  `publicarNaLoja`): um ✓ aqui é um "não falta" lá. */
export type MarcaDoItem = 'ok' | 'falta' | 'aviso' | 'auto';
export interface LinhaDoChecklist { rotulo: string; marca: MarcaDoItem; detalhe?: string }
export const CHECKLIST: { rotulo: string; chaves: string[]; aviso?: boolean }[] = [
  { rotulo: 'Cadastro', chaves: ['sku', 'sku_duplicado', 'nome'] },
  { rotulo: 'Descrição', chaves: ['descricao'] },
  { rotulo: 'SEO', chaves: ['seo'] },
  { rotulo: 'Categoria', chaves: ['categoria'] },
  { rotulo: 'Preço', chaves: ['preco'] },
  { rotulo: 'Variações', chaves: ['variacao', 'variante'], aviso: true },
  { rotulo: 'Foto', chaves: ['foto'] },
];
function pendenciasDaPeca(i: ItemDaFila): Map<string, string> {
  const pend = new Map((i.nuvemshop?.pendencias ?? []).map((x) => [x.chave, x.motivo]));
  for (const k of i.pendencias ?? []) if (!pend.has(k)) pend.set(k, ROTULO_DA_PENDENCIA[k] ?? k);
  return pend;
}
export function checklistDaPeca(i: ItemDaFila): LinhaDoChecklist[] {
  const pend = pendenciasDaPeca(i);
  const ns = i.nuvemshop;
  const naLoja = ns?.naLoja ?? i.presencaNaLoja;
  return CHECKLIST.map((c) => {
    const faltam = c.chaves.filter((k) => pend.has(k));
    const detalhe = faltam.map((k) => pend.get(k)).filter(Boolean).join(' ') || undefined;
    if (c.rotulo === 'Cadastro' && !naLoja) {
      return { rotulo: c.rotulo, marca: 'falta', detalhe: ['Ainda não existe na Nuvemshop.', detalhe].filter(Boolean).join(' ') };
    }
    if (!faltam.length) return { rotulo: c.rotulo, marca: 'ok' };
    if (c.rotulo === 'Categoria' && ns?.categoriaLoja) return { rotulo: c.rotulo, marca: 'auto', detalhe };
    if (c.rotulo === 'Variações' && ns?.variacoesAutomaticas && faltam.every((k) => k === 'variacao')) {
      return { rotulo: c.rotulo, marca: 'auto', detalhe };
    }
    return { rotulo: c.rotulo, marca: c.aviso ? 'aviso' : 'falta', detalhe };
  });
}

/** A disponibilidade, fora do checklist: quantas em casa e o que isso
 *  significa. `aviso` só quando há uma pergunta real (a divisão por
 *  variação); peça sem estoque é `neutro`. */
export interface Disponibilidade { casa: number; marca: 'ok' | 'neutro' | 'aviso'; frase: string }
export function disponibilidadeDaPeca(i: ItemDaFila): Disponibilidade {
  const pend = pendenciasDaPeca(i);
  const casa = Math.max(0, Number(i.casa) || 0);
  if (situacaoDaTela(i) === 'sem_estoque' || (casa <= 0 && situacaoDaTela(i) !== 'publicado')) {
    return { casa, marca: 'neutro', frase: 'Estoque em casa: 0 — fora da fila até entrar estoque.' };
  }
  if (pend.has('estoque_variacao')) {
    return { casa, marca: 'aviso', frase: pend.get('estoque_variacao') || 'Conferir quantidade física por variação.' };
  }
  if (pend.has('estoque')) {
    return { casa, marca: 'neutro', frase: `${casa} em casa · o estoque vai para a loja automaticamente.` };
  }
  return { casa, marca: 'ok', frase: `${casa} em casa` };
}

/** A peça tem foto — pela regra da classificação: na loja (lida na
 *  conferência) para quem já está lá; foto nossa para quem não está. */
export function temFoto(i: ItemDaFila): boolean {
  return !checklistDaPeca(i).some((c) => c.rotulo === 'Foto' && c.marca !== 'ok');
}
export const temPreco = (i: ItemDaFila) => i.preco != null && i.preco > 0;
export const temVariacao = (i: ItemDaFila) => (i.nuvemshop?.variacoes?.length ?? 0) > 1;
/** §64 — "precisa de ação" é de GENTE: o que o sistema resolve sozinho (↻),
 *  a peça sem estoque e o kit não entram. */
export const precisaDeAcao = (i: ItemDaFila) => {
  if (situacaoDaTela(i) === 'sem_estoque' || i.nuvemshop?.naoSeAplica) return false;
  if (checklistDaPeca(i).some((c) => c.marca === 'falta' && !(c.rotulo === 'Cadastro' && i.nuvemshop?.criavel))) return true;
  if (checklistDaPeca(i).some((c) => c.marca === 'aviso') || disponibilidadeDaPeca(i).marca === 'aviso') return true;
  return i.nuvemshop ? !i.nuvemshop.criavel && !i.nuvemshop.naLoja : (i.pendencias ?? []).length > 0;
};

/** Os filtros da Preparação. Poucos, e cada um responde uma pergunta de
 *  quem prepara a loja. */
export const FILTROS: { id: string; rotulo: string; passa: (i: ItemDaFila) => boolean }[] = [
  { id: 'todos', rotulo: 'Todos', passa: () => true },
  { id: 'precisa_acao', rotulo: 'Precisa de ação', passa: precisaDeAcao },
  { id: 'com_foto', rotulo: 'Com foto', passa: temFoto },
  { id: 'sem_foto', rotulo: 'Sem foto', passa: (i) => !temFoto(i) },
  { id: 'com_preco', rotulo: 'Com preço', passa: temPreco },
  { id: 'sem_preco', rotulo: 'Sem preço', passa: (i) => !temPreco(i) },
  { id: 'com_variacao', rotulo: 'Com variação', passa: temVariacao },
];

/** O resumo da confirmação de "Publicar": quantos, quantas peças, quantos
 *  com preço e foto, quantos com pendência que segura a publicação. */
export function resumoDoLote(itens: ItemDaFila[]) {
  return {
    produtos: itens.length,
    pecas: itens.reduce((s, i) => s + Math.max(0, i.casa || 0), 0),
    comPreco: itens.filter(temPreco).length,
    comFoto: itens.filter(temFoto).length,
    criticas: itens.filter((i) => situacaoDaTela(i) !== 'pronto').length,
  };
}

/** §63 — a prévia do anúncio, lida da loja na hora
 *  (`GET /api/nuvemshop/catalogo/:sku/anuncio`). */
export interface AnuncioDaLoja {
  ok: true;
  sku: string;
  produtoId: string;
  lidoEm: string;
  visibilidade: string | null;
  nome: string;
  descricao: string;
  seoTitulo: string;
  seoDescricao: string;
  tags: string[];
  atributos: string[];
  categorias: string[];
  imagens: string[];
  url: string | null;
  variantes: { id: string; sku: string | null; valores: string[]; preco: number | null; estoque: number | null }[];
  faltam: string[];
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
