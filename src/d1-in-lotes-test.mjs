/** Quatro consultas montavam `IN (...)` com a lista inteira, sem quebrar em
 *  lotes. O D1 limita quantos parâmetros uma consulta aceita, então com
 *  inventário ou histórico grande elas não devolvem resultado errado: falham.
 *  E em duas delas havia um `catch` que transformava a falha em lista vazia,
 *  o que é pior — a tela mostrava "nenhuma variação" e "nenhuma composição"
 *  sem dizer que a consulta nem chegou a rodar.
 *
 *  Este teste usa um D1 falso que RECUSA mais de LIMITE parâmetros, como o
 *  de verdade. Ele prova, para cada um dos quatro pontos:
 *
 *   1. lista pequena devolve exatamente o mesmo resultado de antes, e numa
 *      consulta só — a quebra não cobra pedágio de quem não precisa dela;
 *   2. lista grande passa a funcionar, em vez de falhar ou sumir;
 *   3. ordem e semântica preservadas;
 *   4. nenhuma linha duplicada por causa do lote;
 *   5. lista vazia não dispara consulta e devolve o vazio certo;
 *   6. nenhuma escrita no banco é introduzida.
 */
import assert from 'node:assert/strict';
import { LOTE_PADRAO } from '../api/src/plataforma/d1.js';
import { listarPendencias } from '../api/src/pendencias.js';
import { personalizacoesDeVendas } from '../api/src/personalizacao.js';
import { correcoesDeVenda } from '../api/src/venda-correcao.js';
import { produtosMaisVendidos } from '../api/src/analytics.js';

/** O limite do D1 por consulta. O lote padrão tem de caber com margem. */
const LIMITE = 100;
assert.ok(LOTE_PADRAO < LIMITE, `o lote padrão (${LOTE_PADRAO}) tem de ser menor que ${LIMITE}`);

const ESCRITA = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;

/** D1 falso. `responder(sql, binds)` devolve as linhas; qualquer consulta
 *  não prevista devolve vazio, como as `.catch` do código real fariam. */
function bancoFalso(responder) {
  const consultas = [];
  const escritas = [];
  const db = {
    consultas,
    escritas,
    prepare(sql) {
      if (ESCRITA.test(sql)) escritas.push(sql);
      let binds = [];
      const stmt = {
        bind(...v) { binds = v; return stmt; },
        async all() {
          if (binds.length > LIMITE) {
            /* A mensagem que o D1 devolve nesse caso. O ponto do teste é
               que ela NÃO deve mais acontecer. */
            throw new Error(`D1_ERROR: too many SQL variables (${binds.length} > ${LIMITE})`);
          }
          consultas.push({ sql, binds });
          return { results: responder(sql, binds) || [] };
        },
        async first(coluna) {
          const r = (await stmt.all()).results[0] ?? null;
          return coluna === undefined ? r : (r == null ? null : r[coluna]);
        },
        async run() { return { meta: {} }; },
      };
      return stmt;
    },
    /* Nenhum destes pontos deve escrever. Se algum tentar, o teste quebra
       aqui em vez de passar silenciosamente. */
    async batch() { throw new Error('batch: nenhuma destas leituras deveria escrever'); },
    async exec() { throw new Error('exec: nenhuma destas leituras deveria escrever'); },
  };
  return db;
}

const consultasEm = (db, marca) => db.consultas.filter((c) => c.sql.includes(marca));
const semEscrita = (db, onde) => assert.deepEqual(db.escritas, [], `${onde} passou a escrever no banco`);

/* ══════════════════════════════════════════════ 1. pendencias.js
   As variações cadastradas dos códigos que aparecem na lista de pendências.
   A lista cresce com o número de peças em maleta aberta — e a produção já
   teve 382 peças em 4 maletas. */
async function pendencias(quantosSkus) {
  const skus = Array.from({ length: quantosSkus }, (_, i) => `SKU${String(i).padStart(4, '0')}`);
  const db = bancoFalso((sql, binds) => {
    if (sql.includes('FROM maleta_itens')) {
      return skus.map((sku, i) => ({
        maleta_id: 1, sku, desc: sku, revendedora: 'R', aberta_em: '2026-01-01',
        fora: 1, identificado: 0, n_variacoes: 2, linha: i,
      }));
    }
    if (sql.includes('FROM produto_variacoes pv')) {
      /* Duas variações por código, em ordem de `pv.ordem`. */
      return binds.flatMap((sku) => [
        { sku, nome: 'aro 16', atributo: 'aro', variante_id: 10, valores_json: '["16"]', estoque_loja: 1, saldo: 1 },
        { sku, nome: 'aro 18', atributo: 'aro', variante_id: 11, valores_json: '["18"]', estoque_loja: 2, saldo: 2 },
      ]);
    }
    return [];
  });
  const r = await listarPendencias(db);
  return { db, r, skus };
}

{
  /* 1 — lista pequena: uma consulta só, e a variação chega na tela. */
  const { db, r, skus } = await pendencias(10);
  const uma = consultasEm(db, 'WHERE pv.sku IN (');
  assert.equal(uma.length, 1, 'lista pequena deixou de caber numa consulta só');
  const item = r.pendencias.find((x) => x.sku === skus[0]);
  assert.ok(item, 'a pendência de maleta desapareceu da lista');
  assert.deepEqual((item.variacoesPossiveis ?? []).map((v) => v.nome), ['aro 16', 'aro 18'],
    'a ordem das variações de um código mudou');
  semEscrita(db, 'listarPendencias');

  /* 2, 3 e 4 — lista grande: antes a consulta falhava inteira e o `catch`
     devolvia vazio; a tela oferecia a escolha de variação em branco. */
  const grande = await pendencias(250);
  const lotes = consultasEm(grande.db, 'WHERE pv.sku IN (');
  assert.equal(lotes.length, Math.ceil(250 / LOTE_PADRAO), 'o número de lotes não fecha');
  for (const c of lotes) {
    assert.ok(c.binds.length <= LIMITE, `um lote foi com ${c.binds.length} parâmetros — o D1 recusaria`);
    assert.equal((c.sql.match(/\?/g) || []).length, c.binds.length, 'interrogações e valores divergiram');
  }
  const todosOsBinds = lotes.flatMap((c) => c.binds);
  assert.equal(new Set(todosOsBinds).size, todosOsBinds.length, 'um código foi consultado em dois lotes');
  assert.deepEqual(todosOsBinds, grande.skus, 'a lista de códigos mudou de conteúdo ou de ordem');

  const comVariacao = grande.r.pendencias.filter((x) => (x.variacoesPossiveis ?? []).length);
  assert.equal(comVariacao.length, 250, `só ${comVariacao.length} de 250 pendências receberam variação`);
  for (const x of comVariacao) {
    assert.deepEqual(x.variacoesPossiveis.map((v) => v.nome), ['aro 16', 'aro 18'],
      `a ordem ou a duplicidade das variações de ${x.sku} mudou`);
  }
  semEscrita(grande.db, 'listarPendencias (250)');
  console.log('  ok   pendências: 250 códigos passam a receber variação, em 4 lotes sem repetição');
}

/* ══════════════════════════════════════════════ 2. personalizacao.js
   As composições de um conjunto de vendas. O histórico de uma cliente antiga
   passa de cem vendas. */
async function composicoes(quantasVendas) {
  const ids = Array.from({ length: quantasVendas }, (_, i) => i + 1);
  const db = bancoFalso((sql, binds) => {
    if (!sql.includes('FROM venda_personalizacoes vp')) return [];
    /* Duas peças por composição, em ordem de posição. */
    return binds.flatMap((vendaId) => [0, 1].map((posicao) => ({
      id: 1000 + vendaId, venda_id: vendaId, modelo_id: 7, modelo_nome: 'Colar',
      sku_comercial: 'C1', base_sku: 'B1', base_variacao: null, preco: 100,
      estoque_ja_refletido: 1, observacao: null, criado_em: '2026-01-01',
      posicao, componente_sku: `P${posicao}`, componente_nome: `peça ${posicao}`,
      item_variacao: null, item_variante_id: null, rotulo: null, item_qtd: 1,
      movimento_id: null,
    })));
  });
  return { db, mapa: await personalizacoesDeVendas(db, ids), ids };
}

{
  const { db, mapa, ids } = await composicoes(10);
  assert.equal(consultasEm(db, 'FROM venda_personalizacoes vp').length, 1,
    'lista pequena deixou de caber numa consulta só');
  assert.equal(mapa.size, 10);
  assert.deepEqual(mapa.get(ids[0]).map((p) => p.componentes.map((c) => c.sku)), [['P0', 'P1']],
    'a ordem dos componentes de uma composição mudou');
  semEscrita(db, 'personalizacoesDeVendas');

  const g = await composicoes(170);
  const lotes = consultasEm(g.db, 'FROM venda_personalizacoes vp');
  assert.equal(lotes.length, Math.ceil(170 / LOTE_PADRAO));
  for (const c of lotes) assert.ok(c.binds.length <= LIMITE);
  assert.equal(g.mapa.size, 170, `só ${g.mapa.size} de 170 vendas receberam composição`);
  for (const id of g.ids) {
    const lista = g.mapa.get(id);
    assert.equal(lista.length, 1, `a venda ${id} ganhou composição duplicada`);
    assert.deepEqual(lista[0].componentes.map((c) => c.sku), ['P0', 'P1'],
      `a ordem dos componentes da venda ${id} mudou`);
  }
  semEscrita(g.db, 'personalizacoesDeVendas (170)');
  console.log('  ok   composições: 170 vendas, sem duplicata e com a ordem das peças intacta');
}

/* ══════════════════════════════════════════════ 3. venda-correcao.js
   As correções de um lote de histórico. Aqui o `ORDER BY id` vale para a
   lista INTEIRA, e é o único dos quatro pontos em que a concatenação dos
   lotes mudaria a ordem observável. */
async function correcoes(quantosItens) {
  const ids = Array.from({ length: quantosItens }, (_, i) => i + 1);
  const db = bancoFalso((sql, binds) => {
    if (!sql.includes('FROM venda_item_correcoes')) return [];
    /* `id` cresce junto com o item, e o D1 devolveria ordenado por id
       DENTRO do lote — é o que o fake imita. */
    return [...binds]
      .map((itemId) => ({
        id: itemId * 10, venda_id: null, historico_item_id: itemId,
        sku_antigo: 'A', sku_novo: 'B', motivo: 'ajuste', criado_em: '2026-01-01',
        qtd: 1, estoque_efeito: 'nenhum',
      }))
      .sort((a, b) => a.id - b.id);
  });
  return { db, lista: await correcoesDeVenda(db, { historicoItemIds: ids }), ids };
}

{
  const { db, lista } = await correcoes(10);
  assert.equal(consultasEm(db, 'FROM venda_item_correcoes').length, 1);
  assert.deepEqual(lista.map((x) => x.id), Array.from({ length: 10 }, (_, i) => (i + 1) * 10));
  semEscrita(db, 'correcoesDeVenda');

  const g = await correcoes(200);
  const lotes = consultasEm(g.db, 'FROM venda_item_correcoes');
  assert.equal(lotes.length, Math.ceil(200 / LOTE_PADRAO));
  for (const c of lotes) assert.ok(c.binds.length <= LIMITE);
  const ids = g.lista.map((x) => x.id);
  assert.equal(ids.length, 200, `esperava 200 correções, veio ${ids.length}`);
  assert.equal(new Set(ids).size, 200, 'o lote duplicou correção');
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b),
    'a ordem global por id não foi preservada — a concatenação dos lotes venceu o ORDER BY');
  semEscrita(g.db, 'correcoesDeVenda (200)');
  console.log('  ok   correções: 200 itens, ordem global por id preservada, sem duplicata');
}

/* ══════════════════════════════════════════════ 4. analytics.js
   A ficha de catálogo dos códigos que sobreviveram ao LIMIT. A rota permite
   `?limite=200`, e 200 > o limite de parâmetros do D1: essa chamada
   respondia 500. */
async function maisVendidos(limite) {
  const skus = Array.from({ length: limite }, (_, i) => `SKU${String(i).padStart(4, '0')}`);
  const db = bancoFalso((sql, binds) => {
    if (sql.includes('FROM juntos j')) {
      return skus.map((sku, i) => ({
        sku, nome_historico: `nome ${i}`, pecas: limite - i, faturamento: (limite - i) * 10,
      }));
    }
    if (sql.includes('FROM produtos WHERE UPPER(sku) IN')) {
      return binds.map((sku) => ({
        sku, desc: `desc de ${sku}`, cat: 'Anéis',
        foto_original_key: null, foto_tratada_key: null, foto_url: null,
      }));
    }
    return [];
  });
  return { db, r: await produtosMaisVendidos(db, { limite }), skus };
}

{
  const { db, r } = await maisVendidos(20);
  assert.equal(consultasEm(db, 'FROM produtos WHERE UPPER(sku) IN').length, 1);
  assert.equal(r.produtos.length, 20);
  assert.equal(r.produtos[0].sku, 'SKU0000');
  assert.ok(r.produtos[0].nomeAtual || r.produtos[0].nomeHistorico, 'a ficha de catálogo sumiu do item');
  semEscrita(db, 'produtosMaisVendidos');

  /* O caso que respondia 500: `GET /api/analytics/produtos?limite=200`. */
  const g = await maisVendidos(200);
  const lotes = consultasEm(g.db, 'FROM produtos WHERE UPPER(sku) IN');
  assert.equal(lotes.length, Math.ceil(200 / LOTE_PADRAO));
  for (const c of lotes) {
    assert.ok(c.binds.length <= LIMITE, `um lote foi com ${c.binds.length} parâmetros`);
    assert.equal((c.sql.match(/\?/g) || []).length, c.binds.length);
  }
  const binds = lotes.flatMap((c) => c.binds);
  assert.equal(new Set(binds).size, binds.length, 'um código foi consultado em dois lotes');
  assert.equal(g.r.produtos.length, 200, `esperava 200 itens, veio ${g.r.produtos.length}`);
  assert.deepEqual(g.r.produtos.map((x) => x.sku), g.skus, 'a ordem do ranking mudou');
  semEscrita(g.db, 'produtosMaisVendidos (200)');
  console.log('  ok   analytics: ?limite=200 deixa de estourar o limite de parâmetros');
}

/* ══════════════════════════════════════════════ 5. lista vazia
   Nenhuma consulta, e o vazio de sempre — `IN ()` é erro de sintaxe. */
{
  const db = bancoFalso(() => []);
  assert.equal((await personalizacoesDeVendas(db, [])).size, 0);
  assert.equal((await personalizacoesDeVendas(db, null)).size, 0);
  assert.deepEqual(await correcoesDeVenda(db, { historicoItemIds: [] }), []);
  assert.deepEqual(await correcoesDeVenda(db, {}), []);
  assert.equal(db.consultas.length, 0, 'lista vazia disparou consulta');
  semEscrita(db, 'lista vazia');

  /* Só valores nulos equivale a lista vazia: eles são filtrados antes. */
  assert.equal((await personalizacoesDeVendas(db, [null, undefined])).size, 0);
  assert.deepEqual(await correcoesDeVenda(db, { historicoItemIds: [null] }), []);
  assert.equal(db.consultas.length, 0, 'lista só de nulos disparou consulta');
  console.log('  ok   lista vazia (e lista só de nulos) não consulta e devolve o vazio certo');
}

console.log('IN (...) em lotes: ok');
