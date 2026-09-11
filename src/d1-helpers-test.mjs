/** A encanação de D1 erra de um jeito que teste feliz não pega: com lista
 *  pequena tudo passa, e o defeito só aparece quando o inventário cresce.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. número de `?` diferente do número de valores no `bind` — o erro do
 *      D1 nesse caso não diz qual consulta foi;
 *   2. lista vazia disparar consulta com `IN ()`, que é erro de sintaxe;
 *   3. a quebra em lotes perder o último lote, ou devolver as linhas fora
 *      da ordem em que vinham;
 *   4. `(await ...all()).results` `undefined` quebrar a rota inteira;
 *   5. valor ir para o SQL em vez de ir pelo `bind`.
 */
import assert from 'node:assert/strict';
import {
  parametros, linhas, emLotes, consultarEmLotes, LOTE_PADRAO,
} from '../api/src/plataforma/d1.js';

/* 1 e 5 — placeholders, nunca valor. */
assert.equal(parametros(0), '');
assert.equal(parametros(1), '?');
assert.equal(parametros(3), '?,?,?');
assert.equal(parametros(-5), '', 'quantidade negativa deixou de virar lista vazia');
assert.equal(parametros(undefined), '');
assert.equal(parametros('4'), '?,?,?,?');
assert.equal(parametros(2.9), '?,?', 'fração deixou de ser truncada');
console.log('  ok   parametros() devolve só "?", na quantidade pedida');

/* 4 — as linhas de um .all() que não devolveu conjunto. */
assert.deepEqual(linhas(undefined), []);
assert.deepEqual(linhas(null), []);
assert.deepEqual(linhas({}), []);
assert.deepEqual(linhas({ results: null }), []);
assert.deepEqual(linhas({ results: [] }), []);
assert.deepEqual(linhas({ results: [{ sku: 'A' }] }), [{ sku: 'A' }]);
console.log('  ok   linhas() nunca devolve undefined');

/* 3 — a quebra em lotes. */
assert.deepEqual(emLotes([]), []);
assert.deepEqual(emLotes(null), []);
assert.equal(emLotes(Array.from({ length: LOTE_PADRAO }, (_, i) => i)).length, 1);
{
  const um = Array.from({ length: LOTE_PADRAO + 1 }, (_, i) => i);
  const lotes = emLotes(um);
  assert.equal(lotes.length, 2, 'o lote de sobra desapareceu');
  assert.equal(lotes[0].length, LOTE_PADRAO);
  assert.equal(lotes[1].length, 1);
  assert.deepEqual(lotes.flat(), um, 'a ordem ou o conteúdo mudou na quebra');
}
assert.deepEqual(emLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(emLotes(new Set([1, 2, 3]), 2), [[1, 2], [3]], 'Set deixou de ser aceito');
assert.deepEqual(emLotes([1, 2], 0), [[1], [2]], 'tamanho 0 teria laço infinito');
console.log(`  ok   emLotes() fecha a conta em lotes de ${LOTE_PADRAO}`);

/** Banco falso: registra SQL e valores, devolve uma linha por valor do lote. */
function bancoFalso() {
  const chamadas = [];
  return {
    chamadas,
    prepare(sql) {
      const chamada = { sql, binds: null };
      return {
        bind(...valores) {
          chamada.binds = valores;
          return this;
        },
        async all() {
          chamadas.push(chamada);
          return { results: (chamada.binds ?? []).map((v) => ({ valor: v })) };
        },
      };
    },
  };
}

/* 2 — lista vazia não consulta. */
{
  const db = bancoFalso();
  const r = await consultarEmLotes(db, [], (qs) => `SELECT 1 WHERE x IN (${qs})`);
  assert.deepEqual(r, []);
  assert.equal(db.chamadas.length, 0, 'lista vazia disparou consulta — IN () é erro de sintaxe');
  console.log('  ok   lista vazia não dispara consulta nenhuma');
}

/* 1 e 3 — lotes, contagem de parâmetros e ordem. */
{
  const db = bancoFalso();
  const valores = Array.from({ length: 170 }, (_, i) => `SKU${i}`);
  const r = await consultarEmLotes(db, valores, (qs) => `SELECT sku FROM produtos WHERE sku IN (${qs})`);

  assert.equal(db.chamadas.length, 3, 'número de lotes mudou');
  assert.deepEqual(db.chamadas.map((c) => c.binds.length), [80, 80, 10]);
  for (const c of db.chamadas) {
    const quantos = (c.sql.match(/\?/g) || []).length;
    assert.equal(quantos, c.binds.length,
      `${quantos} interrogações para ${c.binds.length} valores — o D1 recusaria a consulta`);
    assert.ok(!c.sql.includes('SKU'), 'um valor foi para o SQL em vez do bind');
  }
  assert.deepEqual(r.map((x) => x.valor), valores, 'as linhas voltaram fora de ordem');
  console.log('  ok   170 valores viram 3 lotes, com bind e ordem conferindo');
}

/* `extras` entra DEPOIS dos valores do lote — a ordem do bind é posicional,
   e inverter isso compara a coluna errada sem erro nenhum. */
{
  const db = bancoFalso();
  await consultarEmLotes(db, [1, 2, 3], (qs) => `SELECT 1 WHERE id IN (${qs}) AND data >= ?`,
    { tamanho: 2, extras: ['2026-01-01'] });
  assert.deepEqual(db.chamadas.map((c) => c.binds), [[1, 2, '2026-01-01'], [3, '2026-01-01']]);
  console.log('  ok   extras vão depois do lote, em todos os lotes');
}

/* O SQL é de quem chama: o helper repete, não monta. */
{
  const db = bancoFalso();
  await consultarEmLotes(db, ['a'], (qs, lote) => {
    assert.deepEqual(lote, ['a'], 'o lote deixou de chegar em montarSql');
    return `X ${qs}`;
  });
  assert.equal(db.chamadas[0].sql, 'X ?');
  console.log('  ok   montarSql recebe os placeholders e o lote');
}

console.log('Helpers de D1: ok');
