import type { ClienteDaBase } from './tipos';

/* As três listas da Visão geral. Nenhuma inventa critério: o ESTADO de
   cada cliente (recorrente, em risco, inativa) vem do servidor, pela régua
   §25 que o painel clássico já usava — a própria frequência de compra de
   cada uma. Aqui só se escolhe a ordem e quantas mostrar. */

/** Quem mais comprou no período — pago ou não. Cliente sem nome não entra:
 *  "Cliente não identificado" no topo de um ranking não leva a ficha
 *  nenhuma. */
export function topCompradoras(todos: ClienteDaBase[], n = 10): ClienteDaBase[] {
  return todos
    .filter((c) => c.identificada && c.comprado > 0)
    .sort((a, b) => b.comprado - a.comprado || b.vendas - a.vendas)
    .slice(0, n);
}

/** As que compram com frequência e estão em dia — 2 compras ou mais, e a
 *  última dentro do ritmo dela. Quem compra mais vezes vem primeiro. */
export function recorrentes(todos: ClienteDaBase[]): ClienteDaBase[] {
  return todos
    .filter((c) => c.identificada && c.estado === 'recorrente')
    .sort((a, b) => b.vendas - a.vendas || b.comprado - a.comprado);
}

/** Quantas há em cada estado, para a linha de situação da base. */
export function contarEstados(todos: ClienteDaBase[]): Record<'recorrente' | 'ativa' | 'em risco' | 'inativa', number> {
  const n = { recorrente: 0, ativa: 0, 'em risco': 0, inativa: 0 };
  for (const c of todos) {
    if (!c.identificada) continue;
    if (c.estado in n) n[c.estado as keyof typeof n] += 1;
  }
  return n;
}

/** "há 3 dias", "há 2 meses", "há 1 ano" — o suficiente para decidir se
 *  vale mandar mensagem, sem obrigar a fazer conta de data. */
export function haQuanto(dias: number | null): string {
  if (dias === null) return '—';
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 60) return `há ${dias} dias`;
  const meses = Math.round(dias / 30);
  if (meses < 24) return `há ${meses} meses`;
  const anos = Math.floor(dias / 365);
  return `há ${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}
