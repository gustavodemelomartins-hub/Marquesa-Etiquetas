/** Helpers mínimos de D1 — Fase 3.
 *
 *  Mínimos de propósito. Há 490 `prepare` neste código e nenhum deles muda
 *  de forma aqui: reescrever 490 chamadas seria um big bang com risco alto
 *  e ganho nenhum. Este módulo recolhe só a encanação que estava repetida
 *  literalmente, e que erra de um jeito que não aparece em teste feliz.
 *
 *  O que estava repetido:
 *
 *    1. `valores.map(() => '?').join(',')` — oito lugares, com separador
 *       diferente entre eles;
 *    2. `(resultado.results ?? [])` — e, em nove lugares, sem o `?? []`;
 *    3. a quebra em lotes de uma lista grande num `IN (...)`. Só
 *       `sync.js › explicarMudancasComVendas` faz isso, em lotes de 80,
 *       porque o D1 limita quantos parâmetros uma consulta aceita. Onde a
 *       lista é grande e ninguém quebrou, a consulta não devolve resultado
 *       errado: ela falha inteira.
 *
 *  O módulo não conhece tabela, regra de negócio nem rota. Ele monta texto
 *  e fatia lista.
 */

/** O lote que `sync.js` já usava. Não é o limite do D1 — é a margem que
 *  aquele código escolheu e que este módulo preserva, para que a mudança
 *  seja de forma e não de comportamento. */
export const LOTE_PADRAO = 80;

/** `parametros(3)` → `'?,?,?'`, para um `IN (...)`.
 *
 *  O motivo de isto existir em vez de interpolar valor: placeholder é a
 *  única coisa que vai para o SQL. O valor viaja pelo `bind`, sempre. */
export function parametros(quantos) {
  const n = Math.max(0, Number(quantos) | 0);
  return Array.from({ length: n }, () => '?').join(',');
}

/** As linhas de um `.all()`, sem o `undefined` do meio do caminho.
 *  `(await ...all()).results` é `undefined` quando a consulta não devolve
 *  conjunto, e `.map` em `undefined` quebra a rota inteira. */
export function linhas(resultado) {
  return (resultado && resultado.results) || [];
}

/** Fatia uma lista em pedaços de no máximo `tamanho`. Lista vazia devolve
 *  lista vazia — nenhum lote, nenhuma consulta. */
export function emLotes(valores, tamanho = LOTE_PADRAO) {
  const lista = Array.isArray(valores) ? valores : [...(valores ?? [])];
  const passo = Math.max(1, Number(tamanho) | 0);
  const lotes = [];
  for (let inicio = 0; inicio < lista.length; inicio += passo) {
    lotes.push(lista.slice(inicio, inicio + passo));
  }
  return lotes;
}

/** Repete uma consulta `IN (...)` em lotes e concatena as linhas, na ordem
 *  dos lotes.
 *
 *  `montarSql` recebe os placeholders do lote e devolve o SQL. Quem chama
 *  continua dono do SQL — este helper não monta consulta, só repete a que
 *  lhe deram:
 *
 *      const rs = await consultarEmLotes(db, skus,
 *        (qs) => `SELECT sku FROM produtos WHERE sku IN (${qs})`);
 *
 *  Lista vazia não dispara consulta nenhuma. `extras` entra depois dos
 *  valores do lote no `bind`, na ordem em que vier. */
export async function consultarEmLotes(db, valores, montarSql, { tamanho = LOTE_PADRAO, extras = [] } = {}) {
  const saida = [];
  for (const lote of emLotes(valores, tamanho)) {
    const r = await db.prepare(montarSql(parametros(lote.length), lote))
      .bind(...lote, ...extras)
      .all();
    saida.push(...linhas(r));
  }
  return saida;
}
