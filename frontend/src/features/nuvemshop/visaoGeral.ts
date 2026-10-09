/** §63 — LOJA ONLINE › VISÃO GERAL, numa função pura.
 *
 *  A tela responde, nesta ordem, em poucos segundos:
 *
 *    1. a loja está sincronizada?
 *    2. existe algo que exige a MINHA atenção?
 *    3. quantos produtos estão publicados, ocultos e prontos?
 *
 *  Antes de 09/10/2026 a resposta vinha espalhada em dez números de
 *  universos diferentes ("590 publicados", "520 publicados", "373 fora do
 *  ar"…) e em pendências que misturavam o que o robô conserta, o que já
 *  aconteceu e o que é preparação de propósito. Aqui cada número tem UM
 *  universo, dito em `UNIVERSOS`, e a lista de atenção só recebe o que uma
 *  pessoa precisa e consegue resolver hoje:
 *
 *    - oculto que nunca foi publicado é PREPARAÇÃO (§62), não problema;
 *    - venda antiga sem variação é HISTÓRICO (§63), não aparece;
 *    - o que a sincronização acerta sozinha não aparece.
 *
 *  Sem React, sem fetch, sem relógio: o "agora" entra como argumento.
 */
import type { EstoqueOnline, ProblemaDaFila } from '../../services/nuvemshopEstoque';
import type { Tom } from '../../components/StatusBadge';
import type { FilaDePublicacao, ItemDaFila, SituacaoDaTela } from '../publicacao/tipos';
import { situacaoDaTela } from '../publicacao/tipos';
import { saudeDoEstoqueOnline } from './estoqueOnline';

/** O que cada número conta. É o texto do "?" ao lado dele. */
export const UNIVERSOS = {
  publicados: 'Códigos do Marquesa com anúncio VISÍVEL na Nuvemshop.',
  ocultos: 'Códigos cadastrados na Nuvemshop como ocultos (não aparecem nem vendem) e que ainda têm algo a completar.',
  prontos: 'Ocultos com tudo completo — foto, texto, preço, categoria e estoque em dia. Só falta o clique em Publicar.',
  atencao: 'Códigos com algo que só uma pessoa resolve. O que a sincronização acerta sozinha não entra.',
  sincronizados: 'Códigos cujo estoque na loja confere com o estoque em casa — visíveis e ocultos.',
} as const;

export type Destino =
  | { tipo: 'pendencias' }
  | { tipo: 'preparacao'; aba: SituacaoDaTela }
  | { tipo: 'tentar' }
  | { tipo: 'corrigir' }
  | { tipo: 'detalhes' };

export interface ItemDeAtencao {
  chave: string;
  titulo: string;
  /** Quantos códigos. */
  quantidade: number;
  tom: 'critico' | 'atencao';
  /** O que aconteceu? */
  oQueAconteceu: string;
  /** Por que preciso fazer algo? */
  porQue: string;
  /** O que devo fazer? */
  oQueFazer: string;
  acao: { rotulo: string; destino: Destino } | null;
  codigos: { sku: string; nome: string | null }[];
}

export interface StatusDaLoja {
  tom: Tom;
  rotulo: string;
  motivo: string | null;
  ultimaSincronizacaoEm: string | null;
  sincronizados: number;
  aguardando: number;
  erros: number;
  /** A sincronização corrige sozinha o que diverge? */
  autoCorrige: boolean;
}

export interface VisaoGeral {
  status: StatusDaLoja;
  kpis: { publicados: number; ocultos: number; prontos: number; atencao: number } | null;
  atencao: ItemDeAtencao[];
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const codigos = (n: number) => `${n} ${plural(n, 'código', 'códigos')}`;

/** Motivos de revisão da fila (§61), agrupados pela AÇÃO que pedem. */
const MOTIVO_ESTOQUE_VARIACAO = new Set(['sem_reparticao']);
const MOTIVO_MALETA = new Set(['maleta']);
const MOTIVO_DUPLICADO = new Set(['duplicado']);

function unicos(lista: { sku: string; nome: string | null }[]) {
  const vistos = new Map<string, { sku: string; nome: string | null }>();
  for (const c of lista) if (!vistos.has(c.sku)) vistos.set(c.sku, c);
  return [...vistos.values()];
}

const doProblema = (p: ProblemaDaFila) => ({ sku: p.sku, nome: p.desc });
const doItem = (i: ItemDaFila) => ({ sku: i.sku, nome: i.desc || null });

export function statusDaLoja(online: EstoqueOnline, agora: Date): StatusDaLoja {
  const saude = saudeDoEstoqueOnline(online, agora);
  const c = online.contagens ?? {};
  const base = {
    ultimaSincronizacaoEm: online.ultimaSincronizacaoEm ?? null,
    sincronizados: c.sincronizado ?? 0,
    aguardando: c.pendente ?? 0,
    erros: c.erro ?? 0,
    autoCorrige: saude.autoCorrige,
  };
  /* "Precisa de revisão" e "aguardando envio" não são o estado da
     SINCRONIZAÇÃO — ela está de pé e trabalhando. Viram itens de atenção
     (revisão) ou somem (aguardando: sai em minutos). */
  if (saude.autoCorrige) {
    return { ...base, tom: 'positivo', rotulo: 'Sincronização ativa', motivo: null };
  }
  return { ...base, tom: saude.tom, rotulo: saude.rotulo, motivo: saude.motivo };
}

export function montarVisaoGeral(
  online: EstoqueOnline,
  fila: FilaDePublicacao | null,
  agora: Date,
): VisaoGeral {
  const status = statusDaLoja(online, agora);
  const atencao: ItemDeAtencao[] = [];
  const problemas = online.problemas ?? [];

  /* ── 0. a sincronização em si parou (desligada, sem corte, cron mudo) */
  if (!status.autoCorrige && status.erros === 0 && online.migrado !== false) {
    atencao.push({
      chave: 'sincronizacao_parada',
      titulo: status.rotulo,
      quantidade: 0,
      tom: status.tom === 'critico' ? 'critico' : 'atencao',
      oQueAconteceu: status.motivo || status.rotulo,
      porQue: 'Enquanto isso, o que muda no estoque daqui não chega à loja.',
      oQueFazer: 'Veja os detalhes da sincronização. Religar e destravar são ações de emergência.',
      acao: { rotulo: 'Ver detalhes', destino: { tipo: 'detalhes' } },
      codigos: [],
    });
  }

  /* ── 1. a loja recusou o envio */
  const erros = problemas.filter((p) => p.status === 'erro');
  if (erros.length) {
    atencao.push({
      chave: 'erro_sincronizacao',
      titulo: `A loja recusou o estoque de ${codigos(erros.length)}`,
      quantidade: erros.length,
      tom: 'critico',
      oQueAconteceu: 'A Nuvemshop não aceitou o último envio de estoque destes códigos.',
      porQue: 'A loja pode estar mostrando um número diferente do que existe em casa.',
      oQueFazer: 'Tente de novo. Se continuar, o erro exato está nos detalhes da sincronização.',
      acao: { rotulo: 'Tentar de novo', destino: { tipo: 'tentar' } },
      codigos: unicos(erros.map(doProblema)),
    });
  }

  /* ── 2. revisão, separada pela ação que cada motivo pede */
  const revisao = problemas.filter((p) => p.status === 'revisao');
  const porMotivo = (motivos: Set<string>) => revisao.filter((p) => motivos.has(p.motivoRevisao ?? ''));
  const conhecidos = new Set([...MOTIVO_ESTOQUE_VARIACAO, ...MOTIVO_MALETA, ...MOTIVO_DUPLICADO]);

  const semDivisao = porMotivo(MOTIVO_ESTOQUE_VARIACAO);
  if (semDivisao.length) {
    atencao.push({
      chave: 'estoque_variacao',
      titulo: 'Conferir estoque por variação',
      quantidade: semDivisao.length,
      tom: 'atencao',
      oQueAconteceu: `${codigos(semDivisao.length)} ${plural(semDivisao.length, 'tem', 'têm')} peças em casa sem a variação (aro, cor) definida.`,
      porQue: 'Sem saber quantas são de cada variação, o sistema não envia o estoque desses códigos para a loja — e não chuta a divisão.',
      oQueFazer: 'Conte as peças e informe quantas são de cada variação.',
      acao: { rotulo: 'Resolver em Pendências', destino: { tipo: 'pendencias' } },
      codigos: unicos(semDivisao.map(doProblema)),
    });
  }

  const maleta = porMotivo(MOTIVO_MALETA);
  if (maleta.length) {
    atencao.push({
      chave: 'maleta_variacao',
      titulo: 'Peças em maleta sem a variação',
      quantidade: maleta.length,
      tom: 'atencao',
      oQueAconteceu: `${codigos(maleta.length)} ${plural(maleta.length, 'tem', 'têm')} peças com revendedoras, e a maleta não diz qual variação foi.`,
      porQue: 'Sem isso, o sistema não sabe qual variação ficou em casa; o estoque online desses códigos fica parado para não pôr à venda a variação errada.',
      oQueFazer: 'Diga qual variação cada revendedora levou.',
      acao: { rotulo: 'Resolver em Pendências', destino: { tipo: 'pendencias' } },
      codigos: unicos(maleta.map(doProblema)),
    });
  }

  const duplicados = unicos([
    ...porMotivo(MOTIVO_DUPLICADO).map(doProblema),
    ...(online.excecoes ?? []).filter((e) => e.status === 'sku_duplicado' && e.sku)
      .map((e) => ({ sku: String(e.sku), nome: e.produto })),
  ]);
  if (duplicados.length) {
    atencao.push({
      chave: 'duplicado',
      titulo: 'O mesmo código está em dois anúncios',
      quantidade: duplicados.length,
      tom: 'critico',
      oQueAconteceu: `${codigos(duplicados.length)} ${plural(duplicados.length, 'aparece', 'aparecem')} em mais de um produto da Nuvemshop.`,
      porQue: 'O estoque fica dividido entre dois anúncios e a conta nunca fecha. O sistema não decide sozinho qual é o certo.',
      oQueFazer: 'Na Nuvemshop, deixe cada código em um anúncio só.',
      acao: null,
      codigos: duplicados,
    });
  }

  const outros = revisao.filter((p) => !conhecidos.has(p.motivoRevisao ?? ''));
  if (outros.length) {
    atencao.push({
      chave: 'variacao_sem_par',
      titulo: 'Variação que não casa com a loja',
      quantidade: outros.length,
      tom: 'atencao',
      oQueAconteceu: `${codigos(outros.length)} ${plural(outros.length, 'tem', 'têm')} saldo numa variação que não corresponde a nenhuma variante da Nuvemshop.`,
      porQue: 'Pode ser um aro ou cor renomeado lá. Mandar o número para a variante errada tiraria do ar uma peça que existe.',
      oQueFazer: 'Confira as variações do código aqui e na Nuvemshop.',
      acao: { rotulo: 'Resolver em Pendências', destino: { tipo: 'pendencias' } },
      codigos: unicos(outros.map(doProblema)),
    });
  }

  /* ── 3. a última conferência viu número diferente na loja */
  const conf = online.conferencia;
  if (conf && conf.divergentes > 0) {
    const divergentes = unicos((online.divergentes ?? []).map((d) => ({ sku: d.sku, nome: d.produto })));
    atencao.push({
      chave: 'divergencia',
      titulo: 'Estoque diferente na loja',
      quantidade: divergentes.length || conf.divergentes,
      tom: 'atencao',
      oQueAconteceu: `A última conferência achou ${conf.divergentes} ${plural(conf.divergentes, 'variante', 'variantes')} com número diferente do Marquesa.`,
      porQue: 'A loja pode vender peça que não existe, ou deixar de vender peça que existe.',
      oQueFazer: 'Corrija automaticamente: o Marquesa manda o saldo daqui. Código sem divisão segura entre variações fica de fora.',
      acao: { rotulo: 'Corrigir o que é seguro', destino: { tipo: 'corrigir' } },
      codigos: divergentes,
    });
  }

  let kpis: VisaoGeral['kpis'] = null;
  if (fila) {
    const itens = fila.itens ?? [];
    const naSituacao = (s: SituacaoDaTela) => itens.filter((i) => situacaoDaTela(i) === s);

    /* ── 4. peça com estoque que não foi cadastrada: precisa de decisão */
    const decidir = naSituacao('nao_cadastrado').filter((i) => i.nuvemshop && !i.nuvemshop.criavel);
    if (decidir.length) {
      atencao.push({
        chave: 'decidir_cadastro',
        titulo: 'Peças esperando uma decisão para ir à loja',
        quantidade: decidir.length,
        tom: 'atencao',
        oQueAconteceu: `${decidir.length} ${plural(decidir.length, 'peça com estoque não foi cadastrada', 'peças com estoque não foram cadastradas')} na Nuvemshop.`,
        porQue: 'Podem repetir um modelo já anunciado sob outro código, ou têm variação a revisar. Criar sem conferir duplicaria o produto na loja.',
        oQueFazer: 'Abra cada uma na Preparação e decida.',
        acao: { rotulo: 'Ver na Preparação', destino: { tipo: 'preparacao', aba: 'nao_cadastrado' } },
        codigos: decidir.map(doItem),
      });
    }

    /* ── 5. publicado por aqui e fora do ar — só isso é alerta */
    const fora = itens.filter((i) => i.nuvemshop?.foraDoArInesperado);
    if (fora.length) {
      atencao.push({
        chave: 'fora_do_ar',
        titulo: 'Saiu do ar sem ninguém pedir',
        quantidade: fora.length,
        tom: 'critico',
        oQueAconteceu: `${fora.length} ${plural(fora.length, 'produto publicado', 'produtos publicados')} por aqui ${plural(fora.length, 'não está', 'não estão')} mais visível na loja.`,
        porQue: 'Enquanto estiver oculto, não vende.',
        oQueFazer: 'Confira na Preparação; se estiver tudo certo, publique de novo.',
        acao: { rotulo: 'Ver na Preparação', destino: { tipo: 'preparacao', aba: 'oculto' } },
        codigos: fora.map(doItem),
      });
    }

    /* ── 6. erro de cadastro/publicação (o de estoque já está em 1) */
    const jaContados = new Set(erros.map((p) => p.sku));
    const erroCatalogo = naSituacao('erro').filter((i) => !jaContados.has(i.sku));
    if (erroCatalogo.length) {
      atencao.push({
        chave: 'erro_catalogo',
        titulo: 'Erro ao cadastrar ou publicar',
        quantidade: erroCatalogo.length,
        tom: 'critico',
        oQueAconteceu: `${erroCatalogo.length} ${plural(erroCatalogo.length, 'peça', 'peças')} não ${plural(erroCatalogo.length, 'concluiu', 'concluíram')} o cadastro ou a publicação na Nuvemshop.`,
        porQue: 'A peça fica fora da loja até o erro ser resolvido.',
        oQueFazer: 'Veja o erro de cada uma na Preparação.',
        acao: { rotulo: 'Ver na Preparação', destino: { tipo: 'preparacao', aba: 'erro' } },
        codigos: erroCatalogo.map(doItem),
      });
    }

    const distintos = new Set(atencao.flatMap((a) => a.codigos.map((c) => c.sku)));
    const semCodigo = atencao.filter((a) => !a.codigos.length).length;
    kpis = {
      publicados: naSituacao('publicado').length,
      ocultos: naSituacao('oculto').length,
      prontos: naSituacao('pronto').length,
      atencao: distintos.size + semCodigo,
    };
  }

  /* O mais grave primeiro; dentro do mesmo tom, o maior. */
  atencao.sort((a, b) => (a.tom === b.tom ? b.quantidade - a.quantidade : a.tom === 'critico' ? -1 : 1));
  return { status, kpis, atencao };
}
