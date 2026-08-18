/** O backend grava com `datetime('now')` do SQLite: "2026-08-18 09:00:00",
 *  UTC e sem o "Z" no fim. O navegador, sem o sufixo, lê como hora LOCAL —
 *  e no Brasil isso põe toda sincronização três horas no futuro.
 *
 *  Um único lugar faz essa tradução. Duas cópias dela é como nasce o bug
 *  em que a tela mostra a hora certa e a conta de atraso usa a errada.
 */

/** Converte o timestamp do backend em `Date`. `null` quando não dá para
 *  ler — que é diferente de "faz muito tempo" e não pode virar isso. */
export function parseDataBackend(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const normalizado = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)
    ? iso.replace(' ', 'T') + 'Z'
    : iso;
  const d = new Date(normalizado);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Horas decorridas entre um timestamp do backend e um instante dado.
 *  `null` quando a data não pôde ser lida. */
export function horasDesde(iso: string | null | undefined, agora: Date): number | null {
  const d = parseDataBackend(iso);
  if (!d) return null;
  return (agora.getTime() - d.getTime()) / 3600_000;
}
