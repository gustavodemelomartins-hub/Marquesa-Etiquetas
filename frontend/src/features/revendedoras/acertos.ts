import { chamar, type Connection } from '../../services/client';
import { hojeISO } from '../../domain/formato';

/** A resposta de `GET /api/analytics/revendedoras` — `analytics.js ›
 *  acertosDeMaleta`. É a MESMA leitura que a ficha de cada revendedora usa
 *  (`/api/revendedoras/:id/historico`), então o total da Visão geral, a
 *  linha do Histórico e a ficha não conseguem discordar.
 *
 *  Só entra acerto concluído: documento da maleta (histórico de vendas) ou
 *  maleta encerrada pelo sistema com `acerto_json`. Maleta aberta, acerto
 *  em andamento e acerto cancelado não existem nesta lista. */
export type SituacaoFinanceira = 'paga' | 'parcial' | 'a_receber' | 'sem_venda' | 'desconhecida';

export interface AcertoResumo {
  id: string;
  data: string | null;
  revendedoraId: number;
  revendedora: string;
  status: 'ativa' | 'inativa' | string;
  pecas: number;
  vendido: number;
  comissao: number;
  liquido: number;
  fonte: string;
  maletaId: number | null;
  enviadas: number | null;
  devolvidas: number | null;
  vendaId: number | null;
  vendaChave: string | null;
  situacaoFinanceira: SituacaoFinanceira;
}

export interface DesempenhoRevendedora {
  revendedoraId: number;
  nome: string;
  status: 'ativa' | 'inativa' | string;
  acertos: number;
  pecas: number;
  vendido: number;
  comissao: number;
  liquido: number;
  ultimo: string | null;
  ticket: number | null;
  /** Soma das enviadas; nula quando algum ciclo não tem maleta conhecida. */
  enviadas: number | null;
  /** REGRAS §19: vendidas ÷ enviadas. Nulo quando não dá para saber. */
  giro: number | null;
  ciclosSemEnvio: number;
}

export interface AcertosDeMaleta {
  exato: boolean;
  pendentesRevisao: number;
  revendedoras: DesempenhoRevendedora[];
  acertos: AcertoResumo[];
  totais: { acertos: number; pecas: number; vendido: number; comissao: number; liquido: number };
}

export function buscarAcertos(conexao: Connection, sinal?: AbortSignal): Promise<AcertosDeMaleta> {
  return chamar<Partial<AcertosDeMaleta>>(conexao, 'GET', '/api/analytics/revendedoras?periodo=tudo', undefined, { signal: sinal })
    .then(normalizarAcertos);
}

/** Um Worker anterior a estes campos (ou uma resposta inesperada) não pode
 *  derrubar a área inteira: o que faltar vira lista vazia ou nulo, que a
 *  tela já sabe dizer ("—", "não registrada"). */
export function normalizarAcertos(r: Partial<AcertosDeMaleta> | null | undefined): AcertosDeMaleta {
  const acertos = Array.isArray(r?.acertos) ? r.acertos : [];
  return {
    exato: r?.exato ?? true,
    pendentesRevisao: Number(r?.pendentesRevisao ?? 0),
    revendedoras: (Array.isArray(r?.revendedoras) ? r.revendedoras : []).map((x) => ({
      ...x, ticket: x.ticket ?? null, enviadas: x.enviadas ?? null, giro: x.giro ?? null, ciclosSemEnvio: x.ciclosSemEnvio ?? 0,
    })),
    acertos: acertos.map((a) => ({
      ...a, maletaId: a.maletaId ?? null, enviadas: a.enviadas ?? null, devolvidas: a.devolvidas ?? null,
      vendaId: a.vendaId ?? null, vendaChave: a.vendaChave ?? null, situacaoFinanceira: a.situacaoFinanceira ?? 'desconhecida',
    })),
    totais: r?.totais ?? totalizar(acertos),
  };
}

/* ───────────────────────────────────────────── filtros do Histórico */

export type PeriodoAcertos = '30d' | '90d' | 'ano' | 'tudo';
export const PERIODOS_ACERTOS: { id: PeriodoAcertos; rotulo: string }[] = [
  { id: '30d', rotulo: '30 dias' },
  { id: '90d', rotulo: '90 dias' },
  { id: 'ano', rotulo: 'Este ano' },
  { id: 'tudo', rotulo: 'Tudo' },
];

export type FiltroSituacao = 'todas' | SituacaoFinanceira;
export const ROTULO_SITUACAO: Record<SituacaoFinanceira, string> = {
  paga: 'Pago',
  parcial: 'Parcial',
  a_receber: 'A receber',
  sem_venda: 'Sem venda',
  desconhecida: 'Não informado',
};
export const TOM_SITUACAO: Record<SituacaoFinanceira, 'positivo' | 'atencao' | 'critico' | 'neutro'> = {
  paga: 'positivo',
  parcial: 'atencao',
  a_receber: 'critico',
  sem_venda: 'neutro',
  desconhecida: 'neutro',
};

export interface FiltroAcertos {
  periodo: PeriodoAcertos;
  revendedoraId: number | null;
  situacao: FiltroSituacao;
  busca: string;
}

export const FILTRO_INICIAL: FiltroAcertos = { periodo: 'tudo', revendedoraId: null, situacao: 'todas', busca: '' };

/** A data mais antiga que o período aceita, ou null para "tudo". */
export function inicioDoPeriodo(periodo: PeriodoAcertos, hoje = hojeISO()): string | null {
  if (periodo === 'tudo') return null;
  if (periodo === 'ano') return `${hoje.slice(0, 4)}-01-01`;
  const dias = periodo === '30d' ? 30 : 90;
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

const dobrar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

export function filtrarAcertos(acertos: AcertoResumo[], f: FiltroAcertos, hoje = hojeISO()): AcertoResumo[] {
  const desde = inicioDoPeriodo(f.periodo, hoje);
  const termo = dobrar(f.busca.trim());
  return acertos.filter((a) => {
    /* Acerto sem data não cabe em recorte nenhum — só aparece em "tudo". */
    if (desde && (!a.data || a.data < desde)) return false;
    if (f.revendedoraId != null && a.revendedoraId !== f.revendedoraId) return false;
    if (f.situacao !== 'todas' && a.situacaoFinanceira !== f.situacao) return false;
    if (termo) {
      const alvo = dobrar([
        a.revendedora, a.maletaId != null ? `maleta #${a.maletaId} ${a.maletaId}` : '',
        a.data ?? '', a.data ? a.data.split('-').reverse().join('/') : '',
      ].join(' '));
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

/** Os totais do que está na tela — somados das linhas, então o resumo e a
 *  lista nunca contam coisas diferentes. */
export function totalizar(acertos: AcertoResumo[]) {
  const soma = (f: (a: AcertoResumo) => number) => +acertos.reduce((s, a) => s + f(a), 0).toFixed(2);
  return {
    acertos: acertos.length,
    pecas: acertos.reduce((s, a) => s + a.pecas, 0),
    vendido: soma((a) => a.vendido),
    comissao: soma((a) => a.comissao),
    liquido: soma((a) => a.liquido),
  };
}

/** Das peças que saíram numa maleta, quantas venderam — só quando se sabe
 *  quantas saíram. */
export function giroDoCiclo(a: { pecas?: number; pecasVendidas?: number; enviadas: number | null }): number | null {
  const vendidas = a.pecas ?? a.pecasVendidas ?? 0;
  return a.enviadas ? vendidas / a.enviadas : null;
}

export const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

/* ─────────────────────────────── o histórico de UMA revendedora */

/** A resposta de `GET /api/revendedoras/:id/historico`. Tudo aqui é leitura
 *  das tabelas que registram cada fato — nenhum número é somado na tela que
 *  o backend não tenha somado da mesma fonte da Visão geral. */
export interface ItemDoAcerto { sku: string; desc: string | null; qtd: number; valor?: number; destino?: string }
export interface LinhaExcluida { linha: string; sku: string; desc: string | null; qtd: number; valor: number; motivo: string | null }
export interface CorrecaoDoAcerto {
  id: number; versao: number; situacao: string; pecas: number;
  vendido: number; comissao: number; liquido: number; registradaEm: string | null;
}
export interface AcertoHistorico {
  id: string;
  fonte: 'documento' | 'sistema';
  data: string | null;
  maletaId: number | null;
  enviadas: number | null;
  devolvidas: number | null;
  pecasVendidas: number;
  vendido: number;
  comissao: number;
  liquido: number;
  situacaoFinanceira: SituacaoFinanceira;
  conferidoPor: string | null;
  vendaId?: number | null;
  vendaChave?: string | null;
  linhasPlanilha?: string[] | null;
  itensVendidos: ItemDoAcerto[];
  itensDevolvidos: ItemDoAcerto[];
  linhasExcluidas?: LinhaExcluida[];
  correcoes?: CorrecaoDoAcerto[];
  observacoes?: string[];
  versao?: number;
  documento?: string | null;
}
export interface EventoHistorico {
  quando: string | null;
  data: string | null;
  tipo: string;
  grupo: 'cadastro' | 'maleta' | 'envio' | 'devolucao' | 'acerto' | 'ajuste' | 'financeiro';
  titulo: string;
  detalhe?: string | null;
  pecas?: number;
  valor?: number;
  maletaId?: number | null;
  acertoId?: string;
}
export interface HistoricoDaRevendedora {
  ok: boolean;
  revendedora?: { id: number; nome: string; status: string; criadaEm: string | null };
  resumo: {
    acertos: number; pecasVendidas: number; vendido: number; comissao: number; liquido: number;
    aReceber: number; maletas: number; maletasAbertas: number; pecasComEla: number;
  };
  acertos: AcertoHistorico[];
  eventos: EventoHistorico[];
  limites: string[];
}

export function buscarHistorico(conexao: Connection, id: number, sinal?: AbortSignal) {
  return chamar<HistoricoDaRevendedora>(conexao, 'GET', `/api/revendedoras/${id}/historico`, undefined, { signal: sinal });
}
