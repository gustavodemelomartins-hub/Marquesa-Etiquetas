/** O dia da operação. O banco grava instantes em UTC — o `datetime('now')`
 *  do SQLite ("2026-10-03 00:00:00", sem fuso escrito) ou ISO com "Z" —, e
 *  a Marquesa vive em São Paulo. O inventário aberto em 02/10/2026 às 21h é
 *  gravado "2026-10-03 00:00:00" e é do dia 02: cortar os dez primeiros
 *  caracteres dava o dia de Greenwich.
 *
 *  Sem somar nem subtrair horas à mão: o Intl sabe o fuso (e o horário de
 *  verão, se um dia voltar). */
export const FUSO_OPERACIONAL = 'America/Sao_Paulo';

/* en-CA formata como AAAA-MM-DD. */
const DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_OPERACIONAL, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** "AAAA-MM-DD" do dia de São Paulo em que o instante caiu. Dia civil (só a
 *  data) passa como veio; data com hora sem fuso escrito é UTC. Vazio ou
 *  ilegível → null. */
export function diaOperacional(valor) {
  if (valor == null || valor === '') return null;
  let quando = valor instanceof Date ? valor : null;
  if (!quando) {
    const texto = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/.exec(texto);
    if (!m) return null;
    quando = new Date(`${m[1]}T${m[2]}${m[3] ?? 'Z'}`);
  }
  return Number.isNaN(quando.getTime()) ? null : DIA.format(quando);
}

/** Hoje, no dia de São Paulo. */
export function hojeOperacional(agora = new Date()) {
  return diaOperacional(agora);
}
