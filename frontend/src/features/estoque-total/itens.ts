/** Classificação e filtro de itens de uma sessão — lógica pura, sem React,
 *  para as duas telas (Estoque Total e Produtos Novos) usarem a mesma
 *  regra de "o que é conflito", "o que é alteração" etc. */
import type { DadosAjusteQtd, ItemSessao } from './tipos';

export type FiltroItem =
  | 'todos'
  | 'alteracoes'
  | 'novos'
  | 'conflitos'
  | 'rejeitados'
  | 'aplicados'
  | 'obsoletos'
  | 'erros';

export const FILTROS: FiltroItem[] = [
  'todos',
  'alteracoes',
  'novos',
  'conflitos',
  'rejeitados',
  'aplicados',
  'obsoletos',
  'erros',
];

export const ROTULO_FILTRO: Record<FiltroItem, string> = {
  todos: 'Todos',
  alteracoes: 'Alterações',
  novos: 'Novos',
  conflitos: 'Conflitos',
  rejeitados: 'Rejeitados',
  aplicados: 'Aplicados',
  obsoletos: 'Obsoletos',
  erros: 'Erros',
};

/** Um item de `ajuste_qtd` cujo `dados.conflito` está preenchido — a
 *  planilha propõe um total menor do que já está com revendedoras. Nunca
 *  aplicável automaticamente (ver docs/RECONCILIATION_ENGINE.md § Fonte da
 *  verdade). */
export function ehConflito(item: ItemSessao): boolean {
  const d = item.dados as DadosAjusteQtd | null;
  return item.tipo === 'ajuste_qtd' && !!d && d.conflito === 'total_menor_que_consignado';
}

export function filtrarItens(itens: ItemSessao[], filtro: FiltroItem): ItemSessao[] {
  switch (filtro) {
    case 'todos':
      return itens;
    case 'alteracoes':
      return itens.filter((i) => i.tipo === 'ajuste_qtd' && !ehConflito(i));
    case 'novos':
      return itens.filter((i) => i.tipo === 'produto_novo');
    case 'conflitos':
      return itens.filter(ehConflito);
    case 'rejeitados':
      return itens.filter((i) => i.status === 'rejeitado');
    case 'aplicados':
      return itens.filter((i) => i.status === 'aplicado');
    case 'obsoletos':
      return itens.filter((i) => i.status === 'obsoleto');
    case 'erros':
      return itens.filter((i) => i.status === 'erro');
    default:
      return itens;
  }
}

export function contarFiltro(itens: ItemSessao[], filtro: FiltroItem): number {
  return filtrarItens(itens, filtro).length;
}

export function itensPendentes(itens: ItemSessao[]): ItemSessao[] {
  return itens.filter((i) => i.status === 'pendente');
}

export function itensAprovados(itens: ItemSessao[]): ItemSessao[] {
  return itens.filter((i) => i.status === 'aprovado');
}

/** Um item pendente cujo único destino sensato é revisão manual — a
 *  aprovação em bloco nunca deve incluí-lo. */
export function precisaRevisaoManual(item: ItemSessao): boolean {
  return ehConflito(item) || item.risco === 'desconhecido' || item.risco === 'perigoso';
}
