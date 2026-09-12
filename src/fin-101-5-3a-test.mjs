/** FIN-101 / Fase 5.3a — a rede das duas correções.
 *
 *  Escrito ANTES da correção, e vermelho quando foi escrito. É o que prova
 *  que o conserto consertou, em vez de o teste ter nascido junto do código
 *  que ele deveria julgar.
 *
 *  ── B1 · o mesmo fato econômico, contado uma vez só
 *
 *  `visaoGeral` soma a diferença de troca com `AND venda_id IS NULL`, porque
 *  desde §36 a troca com registro comercial fatura PELA VENDA. A série
 *  mensal somava a mesma tabela sem esse filtro, e o gráfico ficava maior
 *  que o cartão.
 *
 *  A invariante que este arquivo passa a cobrar é mais forte que "corrigi a
 *  linha": para TODO período e TODA granularidade,
 *
 *      visaoGeral(p).faturamento  ==  Σ evolucao(p).pontos[].faturamento
 *
 *  Duas consultas que respondem à mesma pergunta não podem divergir de novo
 *  sem que este teste diga.
 *
 *  ── B5 · desfazer o pagamento não inventa dívida
 *
 *  PAGO e COBRÁVEL são dimensões diferentes (§36.4). Desfazer um pagamento
 *  tira o dinheiro do faturamento; não é autorizado a criar uma dívida que
 *  não existia. A regra é: **desfazer nunca ELEVA `cobravel`** — ele só volta
 *  a 1 quando quem declarou o pagamento foi uma pessoa daqui
 *  (`pagamento_origem = 'informado'`), que é a mesma autoridade que agora se
 *  corrige. Pagamento declarado pela LOJA não vira dívida ao ser desfeito:
 *  §36.4 já diz que estado técnico da loja não é dívida de ninguém, e
 *  `atualizarPagamentoDaVenda` já se recusa a fazer essa mesma transição por
 *  falta de política contábil.
 *
 *      node src/fin-101-5-3a-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.log('  --   node:sqlite indisponível nesta versão do Node — teste NÃO rodou');
  process.exit(0);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const mod = (p) => import(pathToFileURL(join(raiz, p)).href);

let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

const adaptador = (raw) => {
  const preparar = (sql) => {
    const st = { sql, args: [] };
    st.bind = (...a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
    st.first = async function () { return raw.prepare(this.sql).get(...this.args) ?? null; };
    st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
    st.run = async function () {
      const r = raw.prepare(this.sql).run(...this.args);
      return { meta: { changes: r.changes } };
    };
    return st;
  };
  return {
    prepare: preparar,
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try {
        const saida = [];
        for (const s of stmts) saida.push(await s.run());
        raw.exec('COMMIT');
        return saida;
      } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
};

const { contasAReceber } = await mod('api/src/contas-receber.js');
const { registrarPagamentoVenda } = await mod('api/src/vendas-comandos.js');
const { visaoGeral, evolucao } = await mod('api/src/analytics.js');

const soma = (serie) => +serie.pontos.reduce((s, p) => s + p.faturamento, 0).toFixed(2);
const ponto = (serie, chave) => serie.pontos.find((p) => p.chave === chave) ?? null;

/* ══════════════════════════════════════════════════════════════════ B1 ══ */

/* O catálogo e a razão. Nada aqui escreve `produtos.qtd` sem movimento. */
const CATALOGO = `
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitario', 'Anel', 100.0, 47),
  ('100002', 'Anel Maior',     'Anel', 110.0, 48),
  ('100003', 'Colar Antigo',   'Colar', 75.0, 49);
INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES
  ('100001', 'entrada', 50, 'importacao', 'carga'),
  ('100002', 'entrada', 50, 'importacao', 'carga'),
  ('100003', 'entrada', 50, 'importacao', 'carga'),
  ('100001', 'venda',   -1, 'venda', 'venda 1'),
  ('100001', 'venda',   -2, 'venda', 'venda 3'),
  ('100002', 'troca',   -1, 'troca_garantia', 'troca nova'),
  ('100003', 'troca',   -1, 'troca_garantia', 'troca antiga');
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');

-- julho: o mes de controle. Nenhuma troca o toca, e ele nao pode se mexer.
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, pagamento_origem, cobravel)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-07-10', 100.0, 0, 1,
          '2026-07-10', 'informado', 0);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
  VALUES (1, '100001', 'Anel Solitario', 1, 100.0, 'a0000000-0000-4000-8000-000000000001');

-- setembro: uma venda comum
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, pagamento_origem, cobravel)
  VALUES (3, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-03', 200.0, 0, 1,
          '2026-09-03', 'informado', 0);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
  VALUES (3, '100001', 'Anel Solitario', 2, 100.0, 'a0000000-0000-4000-8000-000000000003');
`;

/* As trocas. Separadas do catálogo para que o mesmo banco possa ser montado
   COM e SEM elas — é assim que "o mês sem troca não se mexe" vira prova, e
   não afirmação. */
const TROCAS = `
INSERT INTO garantias (id, origem_fonte, venda_id, sku, cliente_id, cliente_nome,
                       cliente_nome_norm, data_venda, data_entrada, motivo, status,
                       valor_pago_original)
  VALUES (1, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-07-10',
          '2026-09-04', 'pedra solta', 'sem_conserto', 100.0),
         (2, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-07-10',
          '2026-09-05', 'fecho quebrado', 'sem_conserto', 50.0),
         (3, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-07-10',
          '2026-09-06', 'risco', 'sem_conserto', 100.0);

-- §36: a troca NOVA nasce com registro comercial. A venda 2 E a diferenca.
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, pagamento_origem, cobravel, nuvemshop_status)
  VALUES (2, 1, 'Vitoria', 'vitoria', 'troca', '2026-09-04', 10.0, 0, 1,
          '2026-09-10', 'informado', 0, 'nao_aplicavel');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, preco_tabela, desconto_valor, id)
  VALUES (2, '100002', 'Anel Maior', 1, 10.0, 'troca', 110.0, 100.0,
          'a0000000-0000-4000-8000-000000000002');
INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                             valor_original, valor_novo, diferenca, diferenca_status,
                             diferenca_paga_em, diferenca_valor_pago, venda_id)
  VALUES (1, 1, '2026-09-04', '100002', 'Anel Maior', 100.0, 110.0, 10.0,
          'paga', '2026-09-10', 10.0, 2);

-- a troca ANTERIOR a §36: sem venda ligada. Ela fatura por aqui, e so por aqui.
INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                             valor_original, valor_novo, diferenca, diferenca_status,
                             diferenca_paga_em, diferenca_valor_pago, venda_id)
  VALUES (2, 2, '2026-09-05', '100003', 'Colar Antigo', 50.0, 75.0, 25.0,
          'paga', '2026-09-08', 25.0, NULL);

-- 5.4d: estornada. Nao e faturamento em lugar nenhum. O valor e absurdo de
-- proposito: se vazar para alguma soma, nenhum numero fecha por acidente.
INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                             valor_original, valor_novo, diferenca, diferenca_status,
                             diferenca_paga_em, diferenca_valor_pago, venda_id, estornada,
                             estorno_em, estorno_motivo)
  VALUES (3, 3, '2026-09-06', '100003', 'Colar Antigo', 1.0, 1000.0, 999.0,
          'paga', '2026-09-09', 999.0, NULL, 1, '2026-09-09', 'sku errado');
`;

function banco(comTrocas = true) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(CATALOGO);
  if (comTrocas) raw.exec(TROCAS);
  return raw;
}

const PERIODOS = ['tudo', '12m', '90d', '30d'];

{
  const raw = banco();
  const db = adaptador(raw);

  /* ─── a semântica é a mesma nas duas leituras, em todo recorte.
     Esta é a invariante de verdade: não "a linha foi corrigida", e sim
     "as duas consultas respondem a mesma coisa". */
  for (const periodo of PERIODOS) {
    for (const granularidade of ['mes', 'dia']) {
      const kpi = await visaoGeral(db, { periodo });
      const serie = await evolucao(db, { periodo, granularidade });
      assert.equal(soma(serie), kpi.faturamento,
        `${periodo}/${granularidade}: a série soma ${soma(serie)} e o KPI ${kpi.faturamento}`);
    }
  }
  prova('KPI e série mensal usam a MESMA semântica em tudo/12m/90d/30d, por mês e por dia');

  /* ─── os números, escritos por extenso, para o teste ser legível sem o
     depurador: 100 (julho) + 200 (venda comum) + 10 (diferença nova, pela
     VENDA) + 25 (diferença antiga, por ela mesma) = 335. */
  const kpi = await visaoGeral(db, { periodo: 'tudo' });
  const serie = await evolucao(db, { periodo: 'tudo', granularidade: 'mes' });

  assert.equal(kpi.faturamento, 335);
  assert.equal(kpi.receitaDiferencaTroca, 25,
    'só a troca SEM venda ligada entra por fora; a de §36 entra pela venda');
  assert.equal(ponto(serie, '2026-09').faturamento, 235,
    '200 da venda + 10 da diferença nova + 25 da diferença antiga — a nova NÃO duas vezes');
  prova('a venda da diferença e a linha de garantia_trocas não somam o mesmo real duas vezes');

  assert.equal(ponto(serie, '2026-09').faturamento !== 245, true,
    '245 seria a dupla contagem dos 10');
  prova('a troca anterior a §36 continua faturando uma vez, por ela mesma');

  /* ─── a estornada não vaza. 999 em qualquer soma seria visível a olho. */
  assert.equal(soma(serie), 335);
  assert.equal(kpi.faturamento, 335);
  prova('troca estornada não entra nem no KPI nem na série (5.4d)');

  raw.close();
}

{
  /* ─── o mês sem troca não se mexe: comparado contra o MESMO banco montado
     sem nenhuma troca, ponto a ponto. */
  const comTroca = adaptador(banco(true));
  const semTroca = adaptador(banco(false));

  for (const periodo of PERIODOS) {
    const a = await evolucao(comTroca, { periodo, granularidade: 'mes' });
    const b = await evolucao(semTroca, { periodo, granularidade: 'mes' });
    const julhoA = ponto(a, '2026-07');
    const julhoB = ponto(b, '2026-07');
    if (julhoB) {
      assert.equal(JSON.stringify(julhoA), JSON.stringify(julhoB),
        `julho mudou no recorte ${periodo}`);
    } else {
      assert.equal(julhoA, null, `julho apareceu do nada no recorte ${periodo}`);
    }
  }
  prova('o mês sem troca é idêntico com e sem trocas no banco, em todo recorte');

  /* ─── e os recortes continuam recortando: 30d não alcança julho, tudo sim. */
  const tudo = await evolucao(comTroca, { periodo: 'tudo', granularidade: 'mes' });
  const trintaDias = await evolucao(comTroca, { periodo: '30d', granularidade: 'mes' });
  assert.equal(ponto(tudo, '2026-07').faturamento, 100);
  assert.equal(ponto(trintaDias, '2026-07'), null, '30d não pode alcançar julho');
  assert.equal(ponto(trintaDias, '2026-09').faturamento, 235);
  prova('os filtros de período não regrediram: 30d exclui julho e mantém setembro inteiro');
}

/* ══════════════════════════════════════════════════════════════════ B5 ══ */

const contarVendas = (raw) => raw.prepare('SELECT COUNT(*) n FROM vendas').get().n;

{
  const raw = banco(false);
  const db = adaptador(raw);

  /* ─── 1. a venda que É dívida volta a ser dívida.
     Balcão paga por uma PESSOA (`informado`): desfazer é essa mesma pessoa
     se corrigindo, e a cliente volta a dever. */
  const antes = contarVendas(raw);
  const r = await registrarPagamentoVenda(db, 1, { pago: false });
  assert.equal(r.status, 200);

  const v1 = raw.prepare('SELECT pago, cobravel, data_pagamento FROM vendas WHERE id = 1').get();
  assert.equal(v1.pago, 0);
  assert.equal(v1.cobravel, 1, 'pagamento declarado por uma pessoa: desfazer devolve a dívida');
  assert.equal(v1.data_pagamento, null);

  const lista = await contasAReceber(db, {});
  const conta = lista.contas.find((c) => c.chave === 'venda:1');
  assert.ok(conta, 'a venda volta ao A Receber');
  assert.equal(conta.valorReceber, 100);
  assert.equal(contarVendas(raw), antes, 'nenhuma linha nova de venda foi criada');
  prova('venda cobrável paga volta a NÃO PAGA e continua cobrável, com o valor inteiro');

  raw.close();
}

{
  const raw = banco(false);
  const db = adaptador(raw);

  /* ─── 2. o pagamento declarado pela LOJA não vira dívida ao ser desfeito.
     O caminho real: a loja confirmou `paid`, depois reembolsou, e
     `atualizarPagamentoDaVenda` RECUSOU aplicar o estorno — está escrito lá
     que isso removeria faturamento já contado e a política não existe. A
     pessoa então desfaz na mão. Isso tira o dinheiro do faturamento; não
     autoriza cobrar R$ 250 de quem já foi reembolsado. */
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data,
                                total, cancelada, pago, data_pagamento, cobravel,
                                pagamento_origem, externo_id, nuvemshop_status)
            VALUES (9, 1, 'Vitoria', 'vitoria', 'site', '2026-09-02', 250.0, 0, 1,
                    '2026-09-02', 0, 'nuvemshop_pago', 'nuvemshop:888', 'nao_aplicavel')`);

  const antes = contarVendas(raw);
  const r = await registrarPagamentoVenda(db, 9, { pago: false });
  assert.equal(r.status, 200);

  const v = raw.prepare('SELECT pago, cobravel, pagamento_origem FROM vendas WHERE id = 9').get();
  assert.equal(v.pago, 0, 'o dinheiro sai do faturamento');
  assert.equal(v.cobravel, 0, 'e NÃO vira dívida: desfazer não eleva cobravel');

  const lista = await contasAReceber(db, {});
  assert.equal(lista.contas.find((c) => c.chave === 'venda:9'), undefined,
    'o pedido reembolsado não reaparece no A Receber');
  assert.equal(lista.resumo.total, 0, 'e não entra em soma nenhuma');
  assert.equal(contarVendas(raw), antes, 'nenhuma linha nova de dívida foi criada');
  prova('venda não-cobrável desmarcada NÃO vira cobrável, e não reaparece no A Receber');

  /* §9 — o que o sistema decide não fazer é anunciado, nunca engolido. */
  const corpo = await r.json();
  assert.equal(corpo.cobravel, 0);
  assert.ok(String(corpo.porque || '').length > 0,
    'a resposta precisa DIZER por que não virou conta a receber');
  prova('a resposta anuncia que a venda saiu do faturamento sem virar dívida, e por quê');

  raw.close();
}

{
  const raw = banco(false);
  const db = adaptador(raw);

  /* ─── 3. a venda cancelada e a já não paga continuam onde estavam.
     Nenhuma das duas é porta para a dívida nascer. */
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data,
                                total, cancelada, pago, cobravel, pagamento_origem)
            VALUES (10, 1, 'Vitoria', 'vitoria', 'site', '2026-09-02', 90.0, 0, 0, 0,
                    'nuvemshop_reembolsado'),
                   (11, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-02', 70.0, 1, 1, 0,
                    'informado')`);

  const reembolsada = await registrarPagamentoVenda(db, 10, { pago: false });
  assert.equal(reembolsada.status, 409, 'já estava NÃO PAGA — nada a desfazer');
  const v10 = raw.prepare('SELECT pago, cobravel FROM vendas WHERE id = 10').get();
  assert.equal(v10.pago, 0, 'e nada mudou nela');
  assert.equal(v10.cobravel, 0, 'e nada mudou nela');

  const cancelada = await registrarPagamentoVenda(db, 11, { pago: false });
  assert.equal(cancelada.status, 409, 'venda cancelada não recebe nem devolve pagamento');
  const v11 = raw.prepare('SELECT cancelada, pago, cobravel FROM vendas WHERE id = 11').get();
  assert.equal(v11.cancelada, 1, 'e nada mudou nela');
  assert.equal(v11.pago, 1, 'e nada mudou nela');
  assert.equal(v11.cobravel, 0, 'e nada mudou nela');

  const lista = await contasAReceber(db, {});
  assert.equal(lista.resumo.quantidade, 0, 'nem a reembolsada nem a cancelada entram no A Receber');
  prova('reembolso e cancelamento continuam fora do A Receber, e a regra deles não foi tocada');

  raw.close();
}

{
  const raw = banco(false);
  const db = adaptador(raw);

  /* ─── 4. o caminho de volta continua sendo um caminho de volta: desfazer
     e refazer devolve a venda ao estado em que ela estava. */
  await registrarPagamentoVenda(db, 1, { pago: false });
  await registrarPagamentoVenda(db, 1, { dataPagamento: '2026-07-10' });
  const v = raw.prepare(
    'SELECT pago, cobravel, data_pagamento, pagamento_origem FROM vendas WHERE id = 1').get();
  assert.equal(v.pago, 1);
  assert.equal(v.cobravel, 0);
  assert.equal(v.data_pagamento, '2026-07-10');
  assert.equal(v.pagamento_origem, 'informado');
  prova('desfazer e refazer o pagamento devolve a venda ao estado original');

  raw.close();
}

console.log(`\n  ${provas} prova(s). 5.3a fechada.`);
