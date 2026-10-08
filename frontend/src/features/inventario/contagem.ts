/** A CONTAGEM — as regras da tela de inventário, puras (06/10/2026).
 *
 *  O modelo que a Sthefany entende é o da planilha dela: código, descrição,
 *  estoque total, revendedoras, físico (em casa), falta. A tela mostra
 *  exatamente isso, por peça:
 *
 *      Estoque total 7 · Com revendedoras 1 · Em casa 6 · Conferido 5 · Faltando 1
 *
 *  E um bipe é UMA unidade conferida. O jeito anterior ("um bipe confere a
 *  referência inteira") aparecia como "✓ 6 em casa" depois de um bipe só, e
 *  ela entendeu que a máquina tinha contado várias peças.
 *
 *  Três regras que moram aqui e que a tela não pode quebrar:
 *
 *   · NÃO CONFERIDO não é FALTANDO. Peça que ninguém olhou não tem falta;
 *     ela é "não conferida", e só vira falta pelo gesto dela;
 *   · o mesmo código bipado de novo, sem outro no meio, não soma sozinho
 *     (`pedeConfirmacaoDoBipe`, sem prazo) — mas duas peças iguais
 *     existem, então somar a segunda é UM toque;
 *   · o número DIGITADO é o total conferido da linha, nunca "mais X", e
 *     substituir uma contagem pede confirmação (`planoDaDigitacao`);
 *   · variação que ninguém disse fica "não informada" — nunca é escolhida
 *     pela tela.
 *
 *  Nada aqui fala com o servidor nem com o React.
 */
import { chaveDaVariacao } from '../../domain/variacao';

export const SEM_CATEGORIA = 'Sem categoria';

export interface VariacaoDoEsperado {
  nome: string;
  varianteId: string | null;
  /** Saldo desta variação na razão (inclui o que está em maleta). */
  cadastro?: number;
  /** Quantas desta variação as maletas abertas têm identificadas. */
  comRevendedoras?: number;
  /** Esperado EM CASA desta variação. `null` quando a razão do código não
   *  separa por variação — aí só o código tem esperado. */
  esperado: number | null;
}

export interface RevendedoraDoEsperado {
  nome: string;
  maletaId?: number;
  qtd: number;
  /** A variação das peças daquela maleta, quando alguém a disse. */
  variacoes?: { nome: string; qtd: number }[];
}

/** Uma peça do inventário, como `GET /api/inventarios/:id › esperados`. */
export interface EsperadoDoInventario {
  sku: string;
  desc: string;
  cat: string | null;
  preco?: number | null;
  /** Estoque total do código. */
  total: number;
  /** Com revendedoras (maletas abertas). */
  consignado: number;
  /** Em casa = total − com revendedoras. */
  esperado: number;
  revendedoras?: RevendedoraDoEsperado[];
  variacoes?: VariacaoDoEsperado[];
  razaoPorVariacao?: boolean;
  naoInformada?: { cadastro: number; comRevendedoras: number; esperado: number | null };
}

/** Uma linha contada: '' é "variação não informada" (ou a peça sem variação). */
export interface LinhaContada {
  variacao: string;
  contado: number;
}

export type Situacao = 'nao_conferido' | 'conferido' | 'faltando' | 'sobrando';

export interface EstadoDoCodigo {
  situacao: Situacao;
  /** Peças conferidas (soma das linhas). `null` = não conferido. */
  conferido: number | null;
  faltando: number;
  sobrando: number;
  /** Conferido por variação; '' = não informada. */
  porVariacao: Map<string, number>;
}

export function estadoDoCodigo(ref: Pick<EsperadoDoInventario, 'esperado'>, linhas?: LinhaContada[]): EstadoDoCodigo {
  const porVariacao = new Map((linhas ?? []).map((l) => [l.variacao, l.contado]));
  if (!linhas || !linhas.length) {
    return { situacao: 'nao_conferido', conferido: null, faltando: 0, sobrando: 0, porVariacao };
  }
  const conferido = linhas.reduce((s, l) => s + l.contado, 0);
  const esperado = Math.max(0, ref.esperado);
  const faltando = Math.max(0, esperado - conferido);
  const sobrando = Math.max(0, conferido - esperado);
  const situacao: Situacao = faltando ? 'faltando' : sobrando ? 'sobrando' : 'conferido';
  return { situacao, conferido, faltando, sobrando, porVariacao };
}

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  nao_conferido: 'Não conferida',
  conferido: 'Tudo certo',
  faltando: 'Faltando',
  sobrando: 'Sobrando',
};

/** As peças que fazem parte da conferência: as esperadas em casa, mais as
 *  que ela contou mesmo sem o sistema esperar (sobra). Peça toda com
 *  revendedora e não contada não é trabalho da casa. */
export function pecasDoInventario(
  esperados: EsperadoDoInventario[], contagem: Map<string, LinhaContada[]>,
): EsperadoDoInventario[] {
  return esperados.filter((p) => p.esperado > 0 || (contagem.get(p.sku)?.length ?? 0) > 0);
}

export const categoriaDe = (p: { cat: string | null }) => (p.cat ?? '').trim() || SEM_CATEGORIA;

export interface ResumoDoInventario {
  pecasEsperadas: number;
  pecasConferidas: number;
  codigos: number;
  conferidos: number;
  certos: number;
  comFalta: number;
  comSobra: number;
  naoConferidos: number;
  pecasFaltando: number;
  pecasSobrando: number;
  categorias: { cat: string; codigos: number; conferidos: number; certos: number }[];
}

export function resumoDoInventario(
  esperados: EsperadoDoInventario[], contagem: Map<string, LinhaContada[]>,
): ResumoDoInventario {
  const r: ResumoDoInventario = {
    pecasEsperadas: 0, pecasConferidas: 0, codigos: 0, conferidos: 0, certos: 0,
    comFalta: 0, comSobra: 0, naoConferidos: 0, pecasFaltando: 0, pecasSobrando: 0, categorias: [],
  };
  const porCat = new Map<string, ResumoDoInventario['categorias'][number]>();
  for (const p of pecasDoInventario(esperados, contagem)) {
    const e = estadoDoCodigo(p, contagem.get(p.sku));
    const cat = categoriaDe(p);
    let c = porCat.get(cat);
    if (!c) { c = { cat, codigos: 0, conferidos: 0, certos: 0 }; porCat.set(cat, c); }
    c.codigos += 1;
    r.codigos += 1;
    r.pecasEsperadas += Math.max(0, p.esperado);
    if (e.situacao === 'nao_conferido') { r.naoConferidos += 1; continue; }
    c.conferidos += 1;
    r.conferidos += 1;
    r.pecasConferidas += e.conferido ?? 0;
    if (e.situacao === 'conferido') { r.certos += 1; c.certos += 1; }
    if (e.situacao === 'faltando') { r.comFalta += 1; r.pecasFaltando += e.faltando; }
    if (e.situacao === 'sobrando') { r.comSobra += 1; r.pecasSobrando += e.sobrando; }
  }
  r.categorias = [...porCat.values()].sort((a, b) => {
    if ((a.cat === SEM_CATEGORIA) !== (b.cat === SEM_CATEGORIA)) return a.cat === SEM_CATEGORIA ? 1 : -1;
    return a.cat.localeCompare(b.cat, 'pt');
  });
  return r;
}

/* ─────────────────────────────────────────────── o bipe repetido sem querer */

/** Até quanto tempo uma segunda leitura do MESMO código é PROVAVELMENTE o
 *  leitor que disparou duas vezes. Só muda a frase da pergunta — não é a
 *  trava. A câmera ainda descarta a mesma etiqueta por 1,8 s em silêncio
 *  (`LeitorDeEtiquetas`). */
export const JANELA_DE_REPETICAO_MS = 4000;

export interface UltimaLeitura { sku: string; em: number }

/** O MESMO código lido de novo, sem outro código no meio, numa peça que já
 *  tem conferência? Então a tela NÃO soma: pergunta (06/10/2026, §59).
 *
 *  Não há prazo. Até esta data a pergunta só vinha em 4 s, e a Sthefany,
 *  que bipa, olha a ficha e bipa de novo a mesma peça 10 s depois, contava
 *  a mesma peça duas vezes sem saber. Duas peças iguais existem — somar a
 *  segunda continua sendo UM toque ("Contar outra unidade").
 *
 *  Peça que voltou a "não conferida" (desfeita) ou ficou em zero conta no
 *  primeiro bipe: não há o que repetir. */
export function pedeConfirmacaoDoBipe(
  anterior: UltimaLeitura | null, sku: string, conferidoAgora: number | null,
): boolean {
  return !!anterior && anterior.sku === sku && (conferidoAgora ?? 0) > 0;
}

/** A repetição foi tão rápida que deve ser o leitor disparando duas vezes —
 *  muda só a frase do aviso. */
export function pareceRebote(anterior: UltimaLeitura | null, agora: number, janela = JANELA_DE_REPETICAO_MS): boolean {
  return !!anterior && agora - anterior.em >= 0 && agora - anterior.em < janela;
}

/* ─────────────────────────────────────── o número digitado (planilha) */

/** O que acontece quando ela DIGITA um número numa linha da peça.
 *
 *  O número digitado é a QUANTIDADE TOTAL CONFERIDA daquela linha — nunca
 *  "mais X". 2 bipados + 5 digitados = 5, nunca 7 (06/10/2026, §59). E
 *  como 2 → 5 também apaga uma contagem, ela confirma antes:
 *
 *   · `igual`       — o número já é o conferido: nada a gravar;
 *   · `direto`      — nada conferido que possa ser a mesma peça: grava;
 *   · `substituir`  — havia contagem: "Substituir 2 por 5?";
 *   · `semVariacao` — peça com variação e peças bipadas SEM variação: elas
 *                     podem ser deste aro (estão entre as 5) ou de outro.
 *                     Quem diz é ela — a tela nunca escolhe (regra 2).
 *
 *  Outra variação já contada (nº18: 2, digita nº23: 3) não pergunta: são
 *  peças diferentes. */
export type PlanoDaDigitacao =
  | { tipo: 'igual' }
  | { tipo: 'direto' }
  | { tipo: 'substituir'; antes: number; depois: number; totalAntes: number; totalDepois: number }
  | {
    tipo: 'semVariacao'; antes: number; depois: number; totalAntes: number;
    /** Peças bipadas sem variação. */
    naoInformadas: number;
    /** Quantas delas entram no número digitado, se forem deste aro. */
    entram: number;
    /** O total da peça se forem deste aro / se forem de outro. */
    totalSeForem: number; totalSeNaoForem: number;
  };

export function planoDaDigitacao(linhas: LinhaContada[] | undefined, variacao: string, n: number): PlanoDaDigitacao {
  const m = new Map((linhas ?? []).map((l) => [l.variacao, l.contado]));
  const antes = m.get(variacao) ?? 0;
  if (n === antes) return { tipo: 'igual' };
  const totalAntes = [...m.values()].reduce((s, q) => s + q, 0);
  const totalDepois = totalAntes - antes + n;
  const naoInformadas = variacao === '' ? 0 : (m.get('') ?? 0);
  const entram = Math.min(naoInformadas, Math.max(0, n - antes));
  if (entram > 0) {
    return {
      tipo: 'semVariacao', antes, depois: n, totalAntes, naoInformadas, entram,
      totalSeForem: totalDepois - entram, totalSeNaoForem: totalDepois,
    };
  }
  /* "Variação não informada" digitada numa peça que já tem aros contados:
     pode ser a mesma peça, contada pelo aro. */
  const outrasNaPeca = variacao === '' ? totalAntes - antes : 0;
  if (antes > 0 || outrasNaPeca > 0) return { tipo: 'substituir', antes, depois: n, totalAntes, totalDepois };
  return { tipo: 'direto' };
}

/* ───────────────────────────────────────────────────── as leituras */

export type Gesto = 'bipe' | 'mais' | 'menos' | 'definir' | 'todas' | 'nenhuma' | 'mover' | 'limpar';

/** O corpo de `POST /api/inventarios/:id/leituras`. */
export interface Leitura {
  leituraId: string;
  sku: string;
  gesto: Gesto;
  variacao?: string;
  quantidade?: number;
  de?: string;
  para?: string;
  /** Só em `definir` numa variação: as peças bipadas sem variação estão
   *  entre as digitadas — passam para esta variação em vez de somar. */
  naoInformadas?: boolean;
}

export function novaLeituraId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch { /* sem crypto */ }
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** O que uma leitura faz com as linhas de um código — o mesmo cálculo do
 *  servidor (`registrarLeitura`), para a tela mostrar o número na hora, sem
 *  esperar a rede. Quando o servidor responde, as linhas dele valem. */
export function efeitoDaLeitura(
  leitura: Leitura, linhas: LinhaContada[], ref: Pick<EsperadoDoInventario, 'esperado'> | undefined,
): LinhaContada[] {
  const m = new Map(linhas.map((l) => [l.variacao, l.contado]));
  const v = leitura.variacao ?? '';
  const soma = (k: string, d: number) => m.set(k, Math.max(0, (m.get(k) ?? 0) + d));
  switch (leitura.gesto) {
    case 'bipe': case 'mais': soma(v, 1); break;
    case 'menos': soma(v, -1); break;
    case 'definir': {
      const n = Math.max(0, leitura.quantidade ?? 0);
      if (leitura.naoInformadas && v !== '') {
        const entram = Math.min(m.get('') ?? 0, Math.max(0, n - (m.get(v) ?? 0)));
        if (entram > 0) soma('', -entram);
      }
      m.set(v, n);
      break;
    }
    case 'mover': {
      const q = leitura.quantidade ?? 1;
      soma(leitura.de ?? '', -q); soma(leitura.para ?? '', q); break;
    }
    case 'todas': {
      const outras = [...m.entries()].filter(([k]) => k !== '').reduce((s, [, n]) => s + n, 0);
      m.set('', Math.max(0, (ref?.esperado ?? 0) - outras)); break;
    }
    case 'nenhuma': for (const k of m.keys()) m.set(k, 0); if (!m.has('')) m.set('', 0); break;
    case 'limpar': m.clear(); break;
    default: break;
  }
  return [...m.entries()].map(([variacao, contado]) => ({ variacao, contado }))
    .sort((a, b) => a.variacao.localeCompare(b.variacao, 'pt'));
}

/* ───────────────────────────────────────────────────── a busca manual */

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Procurar uma peça sem o leitor: por código, por nome ou por variação.
 *  Código exato primeiro, depois o que começa pelo que ela digitou. */
export function buscarNoInventario(
  esperados: EsperadoDoInventario[], termo: string, limite = 12,
): EsperadoDoInventario[] {
  const t = semAcento(termo.trim());
  if (!t) return [];
  const palavras = t.split(/\s+/).filter(Boolean);
  const chave = chaveDaVariacao(termo);
  const pontos = (p: EsperadoDoInventario): number => {
    const sku = p.sku.toLowerCase();
    if (sku === t) return 100;
    if (sku.startsWith(t)) return 80;
    const desc = semAcento(p.desc);
    if (palavras.every((w) => desc.includes(w))) return desc.startsWith(palavras[0] ?? '') ? 60 : 50;
    if (sku.includes(t)) return 40;
    if (chave && (p.variacoes ?? []).some((v) => chaveDaVariacao(v.nome).split('·').pop() === chave
      || chaveDaVariacao(v.nome) === chave)) return 30;
    return 0;
  };
  return esperados
    .map((p) => ({ p, n: pontos(p) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.p.desc.localeCompare(b.p.desc, 'pt'))
    .slice(0, limite)
    .map((x) => x.p);
}

/** O banco atingiu o limite diário de leitura do D1 (a conta inteira, até
 *  00:00 UTC = 21h de Brasília). O servidor diz isso em `limite`. Tentar de
 *  novo em segundos só gasta a cota de amanhã e não salva nada. */
export function ehCotaDoBanco(e: unknown): boolean {
  const err = e as { status?: number; corpo?: { limite?: unknown } } | null;
  return Boolean(err && err.status === 503 && err.corpo && err.corpo.limite === 'd1-leitura-diaria');
}

/** Uma gravação que NÃO PODE se perder em silêncio. Falha de rede (status
 *  0 ou ausente) e erro do servidor (5xx) tentam de novo, esperando mais a
 *  cada vez; recusa (4xx) é resposta e volta para a tela. A leitura leva o
 *  próprio id, então repetir é seguro: o servidor não soma duas vezes.
 *  Cota do banco esgotada (08/10/2026) não é passageira: não repete — a
 *  leitura fica guardada no aparelho até ela pedir. */
export async function comRetentativa<T>(
  fazer: () => Promise<T>,
  { tentativas = 4, esperaMs = 600, dormir = (ms: number) => new Promise((r) => setTimeout(r, ms)) }:
    { tentativas?: number; esperaMs?: number; dormir?: (ms: number) => Promise<unknown> } = {},
): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i += 1) {
    try {
      return await fazer();
    } catch (e) {
      ultimo = e;
      const status = (e as { status?: number })?.status;
      const passageiro = (status === undefined || status === 0 || status >= 500) && !ehCotaDoBanco(e);
      if (!passageiro || i === tentativas - 1) throw e;
      await dormir(esperaMs * 2 ** i);
    }
  }
  throw ultimo;
}
