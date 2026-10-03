/** Fuso operacional (03/10/2026) — puro, sem banco nem Worker.
 *
 *  O servidor grava instantes em UTC (`datetime('now')` do SQLite). O dia de
 *  um instante, para a operação, é o de America/Sao_Paulo: o inventário
 *  aberto em 02/10/2026 às 21h é gravado "2026-10-03 00:00:00" e é do dia 02.
 *
 *    node src/fuso-operacional-test.mjs
 */
import assert from 'node:assert/strict';
import { diaOperacional, hojeOperacional } from '../api/src/fuso.js';

const casos = [
  ['dia civil passa como veio', '2026-08-19', '2026-08-19'],
  ['21h de SP = 00h UTC do dia seguinte', '2026-10-03 00:00:00', '2026-10-02'],
  ['o mesmo instante em ISO Z', '2026-10-03T00:00:00.000Z', '2026-10-02'],
  ['com o fuso escrito', '2026-10-02T21:00:00-03:00', '2026-10-02'],
  ['23:59:59 de SP', '2026-10-03 02:59:59', '2026-10-02'],
  ['00:00:00 de SP', '2026-10-03 03:00:00', '2026-10-03'],
  ['tarde: UTC e SP coincidem', '2026-10-02 15:14:20', '2026-10-02'],
  ['Date', new Date('2026-10-03T00:30:00Z'), '2026-10-02'],
  ['vazio', '', null],
  ['nulo', null, null],
  ['lixo', 'ontem', null],
];
let ok = 0;
for (const [nome, entrada, esperado] of casos) {
  assert.equal(diaOperacional(entrada), esperado, nome);
  ok += 1;
}
assert.match(hojeOperacional(), /^\d{4}-\d{2}-\d{2}$/);
assert.equal(hojeOperacional(new Date('2026-10-03T00:00:00Z')), '2026-10-02', 'hoje às 21h de SP');
ok += 2;
console.log(`fuso operacional: ${ok}/${ok} ok`);
