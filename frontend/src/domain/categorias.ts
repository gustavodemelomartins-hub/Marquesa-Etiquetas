/** Cor e ordem das categorias.
 *
 *  A fonte é `state.categorias`, cadastrada no banco. A paleta abaixo é só
 *  o fallback para uma instalação que ainda não cadastrou cor — os mesmos
 *  valores do painel legado, validados para daltonismo. */
import type { AppState, Category } from '../types/api';

const COR_NEUTRA = '#9E8A90';

const PALETA_PADRAO: Record<string, string> = {
  Colar: '#C2426B',
  Brinco: '#C4802A',
  Pulseira: '#0D9382',
  Berloque: '#6A54B5',
  Anel: '#D8646B',
  Argola: '#3D77C4',
  Pingente: '#5C8A34',
  Conjunto: '#A15BA0',
  Outros: '#9E8A90',
};

/** Cor de uma categoria: a cadastrada, senão a da paleta, senão "Outros". */
export function corDaCategoria(categorias: Category[], nome: string): string {
  const c = categorias.find((x) => x.nome === nome);
  if (c && c.cor) return c.cor;
  return PALETA_PADRAO[nome] || COR_NEUTRA;
}

/** Categorias na ordem cadastrada. Vazio quando o banco não tem nenhuma —
 *  aí quem manda é a ordem em que os produtos aparecem. */
export function ordemDasCategorias(estado: AppState): string[] {
  return [...estado.categorias]
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    .map((c) => c.nome);
}
