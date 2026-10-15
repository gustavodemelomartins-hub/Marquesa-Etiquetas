/** Fase 4, invariante 1 — a semântica da razão contábil.
 *
 *  `scripts/razao-estoque.test.mjs` garante que ninguém escreve `produtos.qtd`
 *  por fora. Este teste garante que o que `movimentar` escreve está CERTO:
 *  o sinal de cada tipo, o par movimento + saldo na mesma transação, e o que
 *  deliberadamente NÃO move saldo.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. um tipo trocar de sinal. `brinde` virar +1 não dá erro em lugar
 *      nenhum: o estoque simplesmente cresce a cada peça dada;
 *   2. consignação ou devolução de maleta passarem a mexer no saldo TOTAL.
 *      A peça continua sendo da Marquesa, só mudou de lugar (§5.3) — mexer
 *      aqui conta a mesma peça duas vezes;
 *   3. `ajuste` e `cancelamento` perderem o sinal que vem no valor e virarem
 *      sempre negativos, ou sempre positivos;
 *   4. o movimento ser gravado sem o ajuste de saldo, ou com valor diferente
 *      dele — é a separação dos dois que produz divergência;
 *   5. um tipo desconhecido passar calado, gravando um movimento de efeito
 *      indefinido;
 *   6. `varianteId` vazio virar a string "" em vez de NULL. NULL aqui
 *      significa "não sei qual variação", e a sincronização lê isso como
 *      motivo para NÃO escrever naquele código;
 *   7. kit ganhar saldo próprio, ou a baixa do kit não multiplicar pela
 *      quantidade do componente.
 */
import assert from 'node:assert/strict';
import {
  efeitoDe, movimentar, movimentarKit, saldosDoSku, conferirEstoque,
  TIPOS_SEM_FATURAMENTO,
} from '../api/src/estoque.js';

/** D1 falso que só registra o que seria executado. */
function bancoFalso(responder = () => []) {
  const preparados = [];
  const db = {
    preparados,
    prepare(sql) {
      const registro = { sql: sql.replace(/\s+/g, ' ').trim(), binds: null };
      preparados.push(registro);
      /* O statement devolvido carrega `sql` e `binds` para o teste poder
         inspecionar o que SERIA executado — `movimentar` devolve estes
         objetos ao chamador, que os junta num batch. */
      const stmt = {
        sql: registro.sql,
        binds: null,
        bind(...v) { registro.binds = v; stmt.binds = v; return stmt; },
        async all() { return { results: responder(registro.sql, registro.binds) || [] }; },
        async first(coluna) {
          const r = (responder(registro.sql, registro.binds) || [])[0] ?? null;
          return coluna === undefined ? r : (r == null ? null : r[coluna]);
        },
      };
      return stmt;
    },
  };
  return db;
}

const movimentoDe = (stmts) => stmts.find((s) => /INSERT INTO movimentos/i.test(s.sql));
const saldoDe = (stmts) => stmts.find((s) => /UPDATE produtos SET qtd/i.test(s.sql));
/** A coluna `qtd` é a 5ª do INSERT: sku, variacao, variante_id, tipo, qtd. */
const QTD_NO_INSERT = 4;

/* ═════════════════════════════════════ 1, 3 e 5 — o sinal de cada tipo */
{
  const esperado = {
    entrada: +3,
    venda: -3,
    perda: -3,
    quebra: -3,
    dano: -3,
    furto: -3,
    brinde: -3,
    sorteio: -3,
    uso_proprio: -3,
    troca: -3,
    nota_credito: -3,
    venda_conjunto: -3,
    consignacao: 0,
    devolucao: 0,
  };
  for (const [tipo, efeito] of Object.entries(esperado)) {
    assert.equal(efeitoDe(tipo, 3), efeito, `o sinal de "${tipo}" mudou`);
    /* Quantidade negativa não inverte um tipo de sinal fixo: saída é saída. */
    assert.equal(efeitoDe(tipo, -3), efeito, `"${tipo}" passou a obedecer o sinal do valor`);
  }
  /* 3 — estes dois, e só estes dois, carregam o próprio sinal. */
  for (const tipo of ['ajuste', 'cancelamento']) {
    assert.equal(efeitoDe(tipo, 5), 5, `"${tipo}" perdeu o sinal positivo`);
    assert.equal(efeitoDe(tipo, -5), -5, `"${tipo}" perdeu o sinal negativo`);
    assert.equal(efeitoDe(tipo, 0), 0);
  }
  /* 5 — tipo desconhecido não pode virar movimento nenhum. */
  assert.throws(() => efeitoDe('inventado', 1), /desconhecido/i,
    'tipo desconhecido deixou de explodir — gravaria movimento de efeito indefinido');
  assert.throws(() => efeitoDe(undefined, 1), /desconhecido/i);
  console.log('  ok   o sinal de cada tipo, e o tipo desconhecido que explode');
}

/* ═══════════════════════════════ 4 — movimento e saldo, sempre juntos */
{
  const stmts = movimentar(bancoFalso(), {
    sku: 'A1', tipo: 'venda', quantidade: 2, origem: 'balcao', vendaId: 9,
  });
  assert.equal(stmts.length, 2, 'a venda deixou de gravar movimento + saldo');
  const mov = movimentoDe(stmts);
  const saldo = saldoDe(stmts);
  assert.ok(mov && saldo);
  assert.equal(mov.binds[QTD_NO_INSERT], -2, 'o movimento da venda não saiu negativo');
  assert.equal(saldo.binds[0], -2, 'o saldo recebeu valor diferente do movimento');
  assert.equal(saldo.binds[1], 'A1');
  assert.equal(mov.binds[QTD_NO_INSERT], saldo.binds[0],
    'movimento e saldo divergiram — é exatamente isso que quebra a invariante');
  console.log('  ok   movimento e ajuste de saldo saem com o MESMO valor');
}

/* ═════════════════ 2 — consignação e devolução não mexem no saldo total */
{
  for (const tipo of ['consignacao', 'devolucao']) {
    const stmts = movimentar(bancoFalso(), { sku: 'A1', tipo, quantidade: 4, maletaId: 7 });
    assert.equal(stmts.length, 1, `"${tipo}" passou a mexer no saldo total — conta a peça duas vezes`);
    assert.equal(movimentoDe(stmts).binds[QTD_NO_INSERT], 0, `"${tipo}" deixou de gravar efeito 0`);
    assert.equal(saldoDe(stmts), undefined);
  }
  /* `ajuste` de zero também não move saldo, mas registra o fato. */
  const zero = movimentar(bancoFalso(), { sku: 'A1', tipo: 'ajuste', quantidade: 0 });
  assert.equal(zero.length, 1);
  console.log('  ok   consignação e devolução registram o movimento sem mover o saldo');
}

/* ══════════════════════════════════════════ 6 — NULL significa "não sei" */
{
  const caso = (varianteId, variacao) => movimentar(bancoFalso(), {
    sku: 'A1', tipo: 'venda', quantidade: 1, varianteId, variacao,
  })[0].binds;

  assert.equal(caso(null, null)[2], null);
  assert.equal(caso(undefined, undefined)[2], null);
  assert.equal(caso('', 'aro 16')[2], null, 'varianteId vazio virou string vazia em vez de NULL');
  assert.equal(caso(123, 'aro 16')[2], '123', 'o variante_id deixou de ser gravado como texto');
  assert.equal(caso(0, 'aro 16')[2], '0', 'o variante_id 0 foi confundido com ausente');
  assert.equal(caso(null, '')[1], null, 'variação vazia virou string vazia em vez de NULL');
  assert.equal(caso(null, 'aro 18')[1], 'aro 18');
  console.log('  ok   variação e variante_id ausentes gravam NULL, e o id 0 não é "ausente"');
}

/* ═══════════════════════════════════ tipos sem faturamento (§30) */
{
  assert.deepEqual([...TIPOS_SEM_FATURAMENTO].sort(),
    ['brinde', 'perda', 'sorteio', 'uso_proprio'],
    'a lista de saídas sem faturamento mudou — dinheiro entraria numa soma que não é venda');
  for (const tipo of TIPOS_SEM_FATURAMENTO) {
    assert.equal(efeitoDe(tipo, 1), -1, `"${tipo}" tem de sair do estoque`);
  }
  console.log('  ok   as quatro saídas sem faturamento saem do estoque e não são venda');
}

/* ══════════════════════════════════════════════════ 7 — kits */
{
  /* Kit K1 = 2 × C1 + 1 × C2. */
  const componentes = [
    { sku: 'C1', qtd: 2, desc: 'corrente', preco: 50 },
    { sku: 'C2', qtd: 1, desc: 'pingente', preco: 30 },
  ];
  const db = bancoFalso((sql) => {
    if (/FROM kit_componentes kc/i.test(sql)) return componentes;
    return [];
  });

  const stmts = await movimentarKit(db, {
    kitSku: 'K1', tipo: 'venda', quantidade: 3, vendaId: 5, obs: 'pedido 12',
  });
  const movimentos = stmts.filter((s) => /INSERT INTO movimentos/i.test(s.sql));
  assert.equal(movimentos.length, 2, 'a baixa do kit deixou de atingir os dois componentes');
  assert.deepEqual(movimentos.map((m) => m.binds[0]), ['C1', 'C2']);
  assert.deepEqual(movimentos.map((m) => m.binds[QTD_NO_INSERT]), [-6, -3],
    'a baixa deixou de multiplicar pela quantidade do componente');
  for (const m of movimentos) {
    assert.ok(String(m.binds[9]).includes('kit K1'),
      'a observação do movimento não diz de qual kit veio a baixa');
  }
  assert.equal(stmts.filter((s) => /INSERT INTO movimentos/i.test(s.sql) && s.binds[0] === 'K1').length, 0,
    'o kit ganhou movimento próprio — ele não tem saldo para mexer');
  console.log('  ok   kit baixa os componentes, multiplicado, e nunca a si mesmo');
}

{
  /* O disponível de um kit é o mínimo compartilhado: quem tem menos manda. */
  const saldos = { C1: 10, C2: 4 };
  const db = bancoFalso((sql, binds) => {
    if (/FROM kit_componentes/i.test(sql)) {
      return binds[0] === 'K1'
        ? [{ sku: 'C1', qtd: 2, desc: 'corrente', preco: 50 },
           { sku: 'C2', qtd: 1, desc: 'pingente', preco: 30 }]
        : [];
    }
    if (/FROM produtos WHERE sku = \?/i.test(sql)) {
      const sku = binds[0];
      if (sku === 'K1') return [{ sku, desc: 'Conjunto', preco: 90, qtd: 0 }];
      return saldos[sku] == null ? [] : [{ sku, desc: sku, preco: 10, qtd: saldos[sku] }];
    }
    if (/FROM maleta_itens mi/i.test(sql)) return [{ fora: 0 }];
    return [];
  });

  const kit = await saldosDoSku(db, 'K1');
  assert.equal(kit.qtd, 0, 'o kit passou a ter saldo próprio');
  assert.equal(kit.consignado, 0, 'kit não vai para maleta (§28) e não pode ter consignado');
  assert.equal(kit.disponivel, 4, 'o disponível do kit deixou de ser o mínimo dos componentes');

  saldos.C2 = 0;
  assert.equal((await saldosDoSku(db, 'K1')).disponivel, 0,
    'componente esgotado deixou de derrubar o kit — dois anúncios venderiam a mesma peça');
  console.log('  ok   o disponível do kit é o mínimo compartilhado entre os componentes');
}

/* ════════════════════════════════════ a prova sobre os dados */
{
  const divergentes = [{ sku: 'A1', saldo: 5, soma_movimentos: 4 }];
  const db = bancoFalso((sql) => (/p.qtd <> COALESCE/i.test(sql) ? divergentes : []));
  assert.deepEqual(await conferirEstoque(db), divergentes,
    'conferirEstoque deixou de devolver a divergência que encontrou');
  const limpo = bancoFalso(() => []);
  assert.deepEqual(await conferirEstoque(limpo), [],
    'conferirEstoque passou a inventar divergência onde não há');
  console.log('  ok   conferirEstoque devolve a divergência, e vazio quando a razão fecha');
}

console.log('Razão e saldo: ok');
