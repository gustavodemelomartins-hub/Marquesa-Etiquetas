/** Fase 4, item 3 — o estorno de uma montagem devolve o que saiu.
 *
 *  Cancelar um colar montado é o momento em que a peça física volta para a
 *  gaveta. Se o estorno devolver "uma veneziana qualquer" em vez da que
 *  saiu, o TOTAL fecha — `produtos.qtd == SUM(movimentos.qtd)` continua
 *  valendo — e a razão POR VARIAÇÃO passa a mentir, sem erro nenhum na
 *  tela. É o §2 do CLAUDE.md aplicado ao estorno: nunca chutar a
 *  distribuição de uma variante.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. a base voltar sem `variacao`/`varianteId`, embora tenha saído com
 *      eles — o defeito real que existia até este commit;
 *   2. o componente voltar pelo grupo ("um menino") em vez do SKU exato
 *      que a cliente levou;
 *   3. quantidade do componente ignorada: dois pingentes iguais voltarem
 *      como um;
 *   4. composição de venda retroativa (§7.4) devolver estoque que nunca
 *      foi baixado;
 *   5. o SKU comercial da configuração receber movimento — ele não tem
 *      saldo físico, e um `+1` nele inventaria patrimônio;
 *   6. `''` e `0` deixarem de ser tratados como "não informado" e como um
 *      id legítimo, respectivamente.
 */
import assert from 'node:assert/strict';
import { estornoDeComposicao } from '../api/src/vendas-comandos.js';

/** D1 falso: `prepare` só guarda o SQL e os valores. Nada executa — o
 *  estorno MONTA statements, e quem chama decide gravar. */
function bancoFalso() {
  return {
    prepare(sql) {
      const limpo = sql.replace(/\s+/g, ' ').trim();
      const stmt = { sql: limpo, binds: null, bind(...v) { stmt.binds = v; return stmt; } };
      return stmt;
    },
  };
}

/** Os INSERTs em `movimentos`, lidos como campo nomeado. A ordem dos binds
 *  é a de `estoque.js › movimentar`. */
function movimentosDe(stmts) {
  return stmts
    .filter((s) => /^INSERT INTO movimentos/i.test(s.sql))
    .map((s) => {
      const [sku, variacao, varianteId, tipo, qtd, origem, , , vendaId, obs] = s.binds;
      return { sku, variacao, varianteId, tipo, qtd, origem, vendaId, obs };
    });
}

const db = bancoFalso();

/* A composição como `personalizacoesDeVendas` a devolve: a base com
   identidade de variação, e cada componente com a sua. */
const composicao = {
  modeloNome: 'Colar Casal',
  skuComercial: '326660',
  baseSku: '444032',
  baseVariacao: '45cm',
  baseVarianteId: '901',
  estoqueJaRefletido: false,
  componentes: [
    { sku: '251551', variacao: 'Azul', varianteId: '902', qtd: 1 },
    { sku: '263236', variacao: 'Rosa Claro', varianteId: '903', qtd: 1 },
  ],
};

/* 1, 2 e 5 — o estorno exato. */
{
  const mv = movimentosDe(estornoDeComposicao(db, 77, composicao));

  assert.equal(mv.length, 3, 'a montagem devolveu um número de peças diferente de base + 2 componentes');
  for (const m of mv) {
    assert.equal(m.tipo, 'cancelamento');
    assert.equal(m.origem, 'cancelamento');
    assert.equal(m.vendaId, 77);
    assert.equal(m.qtd, 1, 'cancelamento tem sinal explícito: devolver é +1');
  }

  const base = mv.find((m) => m.sku === '444032');
  assert.ok(base, 'a Veneziana não voltou');
  assert.equal(base.variacao, '45cm',
    'a base voltou sem variação — o total fecha e a razão por variação passa a mentir');
  assert.equal(base.varianteId, '901',
    'a base voltou sem variante_id — a caixinha da loja deixa de casar');

  const azul = mv.find((m) => m.sku === '251551');
  assert.equal(azul.variacao, 'Azul');
  assert.equal(azul.varianteId, '902');
  const rosa = mv.find((m) => m.sku === '263236');
  assert.equal(rosa.variacao, 'Rosa Claro');
  assert.equal(rosa.varianteId, '903');

  assert.ok(!mv.some((m) => m.sku === '326660'),
    'o SKU comercial recebeu movimento — configuração não tem saldo físico');

  console.log('  ok   base e componentes voltam com o SKU e a variação exatos');
}

/* 3 — dois pingentes iguais na mesma composição. */
{
  const mv = movimentosDe(estornoDeComposicao(db, 78, {
    ...composicao,
    modeloNome: 'Colar Filhos Dois Meninos',
    skuComercial: '311066',
    componentes: [{ sku: '251551', variacao: 'Azul', varianteId: '902', qtd: 2 }],
  }));
  const azul = mv.find((m) => m.sku === '251551');
  assert.equal(azul.qtd, 2, 'dois pingentes iguais voltaram como um');
  console.log('  ok   quantidade do componente é devolvida inteira');
}

/* 4 — §7.4: a venda retroativa não baixou nada, e não devolve nada. */
{
  const stmts = estornoDeComposicao(db, 79, { ...composicao, estoqueJaRefletido: true });
  assert.deepEqual(stmts, [],
    'composição com estoque já refletido devolveu peça que nunca saiu');
  console.log('  ok   composição retroativa não devolve estoque');
}

/* 6 — ausência de identidade continua sendo ausência, e o id 0 é um id. */
{
  const mv = movimentosDe(estornoDeComposicao(db, 80, {
    ...composicao,
    baseVariacao: '',
    baseVarianteId: null,
    componentes: [{ sku: '273470', variacao: null, varianteId: '0', qtd: 1 }],
  }));
  const base = mv.find((m) => m.sku === '444032');
  assert.equal(base.variacao, null, "'' deixou de significar não informado");
  assert.equal(base.varianteId, null);

  const comp = mv.find((m) => m.sku === '273470');
  assert.equal(comp.variacao, null);
  assert.equal(comp.varianteId, '0', "o id '0' foi lido como ausente — é um id legítimo");
  console.log('  ok   sem identidade continua NULL, e o id "0" sobrevive');
}

/* A obs diz de onde veio a devolução: o histórico da peça precisa explicar
   por que um pingente voltou sozinho para o estoque. */
{
  const mv = movimentosDe(estornoDeComposicao(db, 81, composicao));
  assert.ok(mv[0].obs.includes('Estorno da venda 81'), 'a obs perdeu a venda de origem');
  assert.ok(mv[0].obs.includes('Colar Casal'), 'a obs perdeu a configuração');
  assert.ok(mv[0].obs.includes('base'));
  assert.ok(mv[1].obs.includes('componente'));
  console.log('  ok   a obs de cada movimento diz venda, configuração e papel');
}

console.log('Estorno de montagem: ok');
