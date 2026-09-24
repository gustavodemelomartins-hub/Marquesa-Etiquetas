import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { validarDistribuicaoAcerto } from '../api/src/maletas-comandos.js';

const itens = [{ sku: 'A', qtd: 3 }, { sku: 'B', qtd: 2 }];
const validas = { A: 1, B: 2 };
const destinos = [{ sku: 'A', linhas: [
  { qtd: 1, destino: 'vendida' }, { qtd: 1, destino: 'quebra' },
] }];

test('acerto completo admite devolução, venda e perda repartidas', () => {
  assert.equal(validarDistribuicaoAcerto(itens, validas, destinos), null);
});

test('não encerra com peça sem destino nem com peça contada duas vezes', () => {
  assert.match(validarDistribuicaoAcerto(itens, { A: 0, B: 2 }, destinos), /somar 3/);
  assert.match(validarDistribuicaoAcerto(itens, { A: 2, B: 2 }, destinos), /somar 3/);
});

test('recusa quantidades inválidas e código ou destino desconhecido', () => {
  assert.match(validarDistribuicaoAcerto(itens, { A: -1, B: 2 }, destinos), /inválida/);
  assert.match(validarDistribuicaoAcerto(itens, { A: 1.5, B: 2 }, destinos), /inválida/);
  assert.match(validarDistribuicaoAcerto(itens, { A: 1, B: 2, X: 0 }, destinos), /não está/);
  assert.match(validarDistribuicaoAcerto(itens, validas, [
    { sku: 'A', linhas: [{ qtd: 2, destino: 'desconhecido' }] },
  ]), /inválido/);
});

test('recusa SKU duplicado e linha sem quantidade positiva', () => {
  assert.match(validarDistribuicaoAcerto(itens, validas, [...destinos, ...destinos]), /mais de uma vez/);
  assert.match(validarDistribuicaoAcerto(itens, validas, [
    { sku: 'A', linhas: [{ qtd: 0, destino: 'vendida' }] },
  ]), /inválido/);
});

test('o acerto usa identidade única e limpa órfãos se o batch falhar', () => {
  const comandos = readFileSync(new URL('../api/src/maletas-comandos.js', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../api/schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_externo\s+ON vendas\(externo_id\)/);
  assert.match(comandos, /acerto:maleta:\$\{maletaId\}/);
  assert.match(comandos, /Este acerto já está sendo processado/);
  assert.match(comandos, /DELETE FROM vendas WHERE id=\? AND externo_id=\?/);
  assert.match(comandos, /await db\.batch\(stmts\)/);
});
