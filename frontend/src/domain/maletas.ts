/** Leitura de maletas: prazo, situação, peças e valor.
 *
 *  Portado de `src/dashboard.tpl.html` sem mudar nenhuma regra. As duas que
 *  importam:
 *
 *  §6.1 — o valor de uma maleta usa o preço CONGELADO no envio
 *  (`maleta.precos`), não o preço atual do catálogo. É o mesmo número que o
 *  servidor usa para calcular a comissão no acerto.
 *
 *  O prazo é o dia combinado (`acertoEm`). Só quando ele não foi marcado é
 *  que vale a regra dos `config.prazoDias` dias a partir da saída. */
import type { AppState, Product, Suitcase } from '../types/api';
import { addDias, hojeISO, plural } from './formato';

/** "Cancelada" e "encerrada" não contam: a peça voltou ou nunca saiu. */
export function maletaAberta(m: Suitcase): boolean {
  return m.status === 'aberta' || m.status === 'em_acerto';
}

export function maletaEncerrada(m: Suitcase): boolean {
  return m.status === 'encerrada';
}

export function maletasAbertas(maletas: Suitcase[]): Suitcase[] {
  return maletas.filter(maletaAberta);
}

export function maletaAbertaDe(estado: AppState, revId: number): Suitcase | null {
  return estado.maletas.find((m) => m.revId === revId && maletaAberta(m)) || null;
}

export function qtdMaleta(m: Suitcase): number {
  return Object.values(m.itens || {}).reduce((s, q) => s + (Number(q) || 0), 0);
}

/** §6.1: preço do envio, com o catálogo só como último recurso — uma
 *  maleta antiga cujo item perdeu o preço congelado ainda precisa somar. */
export function precoEnvio(m: Suitcase, sku: string, produtos: Map<string, Product>): number | null {
  const congelado = m.precos ? m.precos[sku] : undefined;
  if (congelado !== undefined && congelado !== null) return congelado;
  const p = produtos.get(sku);
  return p && p.preco !== null ? p.preco : null;
}

export function valMaleta(m: Suitcase, produtos: Map<string, Product>): number {
  return Object.entries(m.itens || {}).reduce(
    (s, [sku, q]) => s + (precoEnvio(m, sku, produtos) || 0) * q,
    0,
  );
}

/** O dia do acerto. `null` quando não há data nem saída registrada. */
export function prazoDe(m: Suitcase, prazoDias: number): string | null {
  if (m.acertoEm) return m.acertoEm;
  if (m.abertaEm) return addDias(m.abertaEm, prazoDias);
  return null;
}

/** Quantos dias faltam. Negativo = atrasado. `null` quando não há prazo. */
export function diasAteAcerto(m: Suitcase, prazoDias: number, hoje = hojeISO()): number | null {
  const p = prazoDe(m, prazoDias);
  if (!p) return null;
  const hj = new Date(hoje + 'T12:00:00');
  const dt = new Date(p + 'T12:00:00');
  return Math.round((dt.getTime() - hj.getTime()) / 86400000);
}

export type TomSituacao = 'neutro' | 'positivo' | 'atencao' | 'critico';

export interface Situacao {
  tom: TomSituacao;
  texto: string;
  atrasada: boolean;
}

/** A situação de uma maleta em uma frase.
 *
 *  A severidade segue a escala escassa de `tokens.css`: atraso é crítico
 *  (peça e dinheiro parados fora de casa), prazo próximo pede atenção, e o
 *  resto é informação. */
export function situacaoMaleta(m: Suitcase, prazoDias: number, hoje = hojeISO()): Situacao {
  const d = diasAteAcerto(m, prazoDias, hoje);
  if (d === null) return { tom: 'neutro', texto: 'sem data marcada', atrasada: false };
  if (d < 0) {
    return { tom: 'critico', texto: `atrasada ${-d} ${plural(-d, 'dia', 'dias')}`, atrasada: true };
  }
  if (d === 0) return { tom: 'atencao', texto: 'acerto é hoje', atrasada: false };
  if (d <= 7) {
    return { tom: 'atencao', texto: `acerto em ${d} ${plural(d, 'dia', 'dias')}`, atrasada: false };
  }
  return { tom: 'neutro', texto: `acerto em ${d} dias`, atrasada: false };
}

export interface LinhaAgenda {
  maleta: Suitcase;
  revId: number;
  revNome: string;
  prazo: string | null;
  dias: number | null;
  situacao: Situacao;
  pecas: number;
  valor: number;
}

export function nomeDaRevendedora(estado: AppState, id: number): string {
  const r = estado.revendedoras.find((x) => x.id === id);
  return r ? r.nome : 'Revendedora removida';
}

/** A agenda de acertos: as maletas abertas, da mais urgente para a menos.
 *
 *  Maleta sem data marcada vai para o fim — não é urgente por não ter
 *  prazo, mas também não pode sumir da lista. */
export function agendaDeAcertos(estado: AppState, hoje = hojeISO()): LinhaAgenda[] {
  const produtos = new Map(estado.produtos.map((p) => [p.sku, p]));
  const prazoDias = estado.config.prazoDias;

  return maletasAbertas(estado.maletas)
    .map((m) => ({
      maleta: m,
      revId: m.revId,
      revNome: nomeDaRevendedora(estado, m.revId),
      prazo: prazoDe(m, prazoDias),
      dias: diasAteAcerto(m, prazoDias, hoje),
      situacao: situacaoMaleta(m, prazoDias, hoje),
      pecas: qtdMaleta(m),
      valor: valMaleta(m, produtos),
    }))
    .sort((a, b) => {
      if (a.dias === null && b.dias === null) return 0;
      if (a.dias === null) return 1;
      if (b.dias === null) return -1;
      return a.dias - b.dias;
    });
}

export interface ResumoRevendedora {
  id: number;
  nome: string;
  status: 'ativa' | 'inativa';
  maletaAberta: Suitcase | null;
  situacao: Situacao | null;
  prazo: string | null;
  pecas: number;
  valor: number;
  maletasFechadas: number;
}

/** Uma linha por revendedora ativa, com a maleta aberta dela se houver. */
export function resumoDasRevendedoras(estado: AppState, hoje = hojeISO()): ResumoRevendedora[] {
  const produtos = new Map(estado.produtos.map((p) => [p.sku, p]));
  const prazoDias = estado.config.prazoDias;

  return estado.revendedoras
    .filter((r) => r.status !== 'inativa')
    .map((r) => {
      const m = maletaAbertaDe(estado, r.id);
      return {
        id: r.id,
        nome: r.nome,
        status: r.status,
        maletaAberta: m,
        situacao: m ? situacaoMaleta(m, prazoDias, hoje) : null,
        prazo: m ? prazoDe(m, prazoDias) : null,
        pecas: m ? qtdMaleta(m) : 0,
        valor: m ? valMaleta(m, produtos) : 0,
        maletasFechadas: estado.maletas.filter((x) => x.revId === r.id && maletaEncerrada(x)).length,
      };
    });
}
