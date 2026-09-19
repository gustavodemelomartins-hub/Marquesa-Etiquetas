/** FIN-101 / Fase 5.3c — a versão do recebível.
 *
 *  `versaoEsperada` existia no contrato e era **aceita e ignorada** para
 *  `venda` e `troca`. Duas telas quitavam a mesma venda sem conflito; a trava
 *  `WHERE pago = 0` salvava o dinheiro, não a DATA do pagamento — e é ela que
 *  decide o mês do faturamento.
 *
 *  Este arquivo prova três coisas, nesta ordem de importância:
 *
 *    1. o MECANISMO — o trigger incrementa exatamente quando o recebível
 *       muda, por qualquer escritor, e não entra em loop nem com
 *       `recursive_triggers` ligado;
 *    2. o CONTRATO — as três fontes devolvem `versao` com a mesma palavra, e
 *       a tela não sabe qual coluna física está atrás dela;
 *    3. a CORRIDA — duas escritas com a mesma versão, e no máximo uma vence,
 *       sem efeito parcial nenhum.
 *
 *      node src/fin-101-5-3c-test.mjs
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

const { contasAReceber, receberConta, definirPrazoDaConta } = await mod('api/src/contas-receber.js');
const { registrarPagamentoVenda } = await mod('api/src/vendas-comandos.js');
const { pagarDiferencaTroca, estornarTroca } = await mod('api/src/garantias.js');
const { quitarVenda, desfazerPagamentoVenda } = await mod('api/src/pagamento-venda.js');
const { atualizarPagamentoDaVenda, pagamentoDoPedido } = await mod('api/src/sync.js');

const SEED = `
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitario', 'Anel', 100.0, 48),
  ('100002', 'Anel Maior',     'Anel', 110.0, 49);
INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES
  ('100001', 'entrada', 50, 'importacao', 'carga'),
  ('100002', 'entrada', 50, 'importacao', 'carga'),
  ('100001', 'venda',   -1, 'venda', 'venda 3'),
  ('100001', 'venda',   -1, 'venda', 'venda 4'),
  ('100002', 'troca',   -1, 'troca_garantia', 'troca 1');
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');

-- a compra de origem
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, pagamento_origem, cobravel)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 100.0, 0, 1,
          '2026-09-01', 'informado', 0);

INSERT INTO garantias (id, origem_fonte, venda_id, sku, cliente_id, cliente_nome,
                       cliente_nome_norm, data_venda, data_entrada, motivo, status,
                       valor_pago_original)
  VALUES (1, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-09-01',
          '2026-09-04', 'pedra solta', 'sem_conserto', 100.0),
         (2, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-09-01',
          '2026-09-05', 'fecho', 'sem_conserto', 50.0);

-- §36: a diferenca como venda propria, em aberto
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, cobravel, nuvemshop_status)
  VALUES (2, 1, 'Vitoria', 'vitoria', 'troca', '2026-09-04', 10.0, 0, 0, 1, 'nao_aplicavel');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, id)
  VALUES (2, '100002', 'Anel Maior', 1, 10.0, 'troca', 'a0000000-0000-4000-8000-000000000002');
INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                             valor_original, valor_novo, diferenca, diferenca_status, venda_id)
  VALUES (1, 1, '2026-09-04', '100002', 'Anel Maior', 100.0, 110.0, 10.0, 'a_receber', 2);

-- a troca ANTERIOR a §36: recebivel proprio, sem venda ligada
INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                             valor_original, valor_novo, diferenca, diferenca_status, venda_id)
  VALUES (2, 2, '2026-09-05', '100002', 'Anel Maior', 50.0, 75.0, 25.0, 'a_receber', NULL);

-- venda de balcao fiada
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, cobravel)
  VALUES (3, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-05', 250.0, 0, 0, 1);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
  VALUES (3, '100001', 'Anel Solitario', 1, 250.0, 'a0000000-0000-4000-8000-000000000003');

-- pedido do site, pendente: e por ele que o sync escreve
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, cobravel, pagamento_origem, externo_id)
  VALUES (4, 1, 'Vitoria', 'vitoria', 'site', '2026-09-06', 90.0, 0, 0, 1,
          'nuvemshop_pendente', 'nuvemshop:555');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
  VALUES (4, '100001', 'Anel Solitario', 1, 90.0, 'a0000000-0000-4000-8000-000000000004');
`;

function banco() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  return raw;
}

const verVenda = (raw, id) =>
  raw.prepare('SELECT recebivel_versao v FROM vendas WHERE id = ?').get(id).v;
const verTroca = (raw, id) =>
  raw.prepare('SELECT recebivel_versao v FROM garantia_trocas WHERE id = ?').get(id).v;
const razaoFecha = (raw) => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.soma, 0)`).get().n;

/* ══════════════════════════════════ 1. o mecanismo: o que bumpa e o que não */
{
  const raw = banco();
  const db = adaptador(raw);

  assert.equal(verVenda(raw, 3), 1, 'toda linha nasce na versão 1 — o backfill é o próprio default');

  /* o que NÃO é recebível não pode gerar conflito à toa */
  raw.exec("UPDATE vendas SET cliente_nome_norm = 'vitoria souza' WHERE id = 3");
  raw.exec("UPDATE vendas SET observacao = 'embrulhar' WHERE id = 3");
  raw.exec("UPDATE vendas SET nuvemshop_status = 'sincronizada' WHERE id = 3");
  assert.equal(verVenda(raw, 3), 1,
    'nome, observação e estado da loja NÃO invalidam: o backfill de normalização '
    + 'reescreve milhares de linhas e não move um centavo');

  /* e o que É recebível bumpa, uma vez por mudança */
  const relevantes = [
    ["UPDATE vendas SET vencimento_em = '2026-10-01' WHERE id = 3", 'vencimento_em'],
    ['UPDATE vendas SET total = 260.0 WHERE id = 3', 'total'],
    ['UPDATE vendas SET valor_recebido = 40.0 WHERE id = 3', 'valor_recebido'],
    ['UPDATE vendas SET cobravel = 0 WHERE id = 3', 'cobravel'],
    ["UPDATE vendas SET pagamento_origem = 'nuvemshop_parcial' WHERE id = 3", 'pagamento_origem'],
    ["UPDATE vendas SET pago = 1, data_pagamento = '2026-09-10' WHERE id = 3", 'pago+data'],
    ['UPDATE vendas SET cancelada = 1 WHERE id = 3', 'cancelada'],
  ];
  let esperado = 1;
  for (const [sql, nome] of relevantes) {
    raw.exec(sql);
    esperado += 1;
    assert.equal(verVenda(raw, 3), esperado, `${nome} deveria ter incrementado a versão`);
  }

  /* escrever o mesmo valor de novo não é mudança */
  raw.exec('UPDATE vendas SET cancelada = 1 WHERE id = 3');
  assert.equal(verVenda(raw, 3), esperado, 'gravar o mesmo valor não conta como mudança');
  raw.close();
  prova('o trigger incrementa nas oito colunas do recebível, e só nelas');
}

{
  /* 5. o item mudou de valor, então a dívida mudou de valor */
  const raw = banco();
  const antes = verVenda(raw, 3);
  raw.exec("UPDATE venda_itens SET desc = 'Anel Solitario Grande' WHERE venda_id = 3");
  assert.equal(verVenda(raw, 3), antes, 'corrigir descrição do item (§40) não muda a dívida');
  raw.exec('UPDATE venda_itens SET preco = 300.0 WHERE venda_id = 3');
  assert.ok(verVenda(raw, 3) > antes, 'mudar o preço do item invalida a versão da venda');
  const depoisPreco = verVenda(raw, 3);
  raw.exec('UPDATE venda_itens SET qtd = 2 WHERE venda_id = 3');
  assert.ok(verVenda(raw, 3) > depoisPreco, 'mudar a quantidade também');
  raw.close();
  prova('venda_itens: preço e quantidade invalidam o token; SKU e descrição não');
}

{
  /* o trigger escreve na MESMA tabela que o disparou. Sem a guarda de
     `recebivel_versao`, isso seria um loop assim que o PRAGMA mudasse. */
  const raw = banco();
  raw.exec('PRAGMA recursive_triggers = ON');
  raw.exec("UPDATE vendas SET pago = 1, data_pagamento = '2026-09-10' WHERE id = 3");
  assert.equal(verVenda(raw, 3), 2, 'uma mudança, um incremento, mesmo com recursão ligada');
  raw.exec("UPDATE garantia_trocas SET diferenca_status = 'paga', diferenca_paga_em = '2026-09-10' WHERE id = 2");
  assert.equal(verTroca(raw, 2), 2);
  raw.close();
  prova('nenhum loop de trigger, nem com recursive_triggers ligado');
}

/* ════════════════════════ 2. o contrato: uma palavra para as três fontes ══ */
{
  const raw = banco();
  const db = adaptador(raw);
  const lista = await contasAReceber(db, {});
  const porChave = Object.fromEntries(lista.contas.map((c) => [c.chave, c]));

  assert.equal(porChave['venda:2'].versao, 1, 'fonte venda devolve versão');
  assert.equal(porChave['venda:3'].versao, 1);
  assert.equal(porChave['troca:2'].versao, 1, 'fonte troca devolve versão');
  for (const c of lista.contas) {
    assert.equal(typeof c.versao, 'number', `${c.chave} sem versão numérica`);
  }
  raw.close();
  prova('as três fontes do A Receber devolvem `versao` na mesma palavra');
}

/* ══════════════════════════════ 3. versão velha é recusada, sem escrever ══ */
{
  const raw = banco();
  const db = adaptador(raw);

  const r = await receberConta(db, {
    chave: 'venda:3', confirmar: true, pagaEm: '2026-09-10', versaoEsperada: 99,
  });
  assert.equal(r.ok, false);
  assert.equal(r.statusHttp, 409);
  assert.equal(r.versaoAtual, 1, 'a resposta traz a versão atual, para a tela recarregar');
  const v = raw.prepare('SELECT pago, data_pagamento FROM vendas WHERE id = 3').get();
  assert.equal(v.pago, 0, 'e NADA foi escrito');
  assert.equal(v.data_pagamento, null);
  raw.close();
  prova('versão velha → 409 com versaoAtual, e nenhuma escrita');
}

{
  const raw = banco();
  const db = adaptador(raw);
  const antes = verVenda(raw, 3);
  const r = await receberConta(db, {
    chave: 'venda:3', confirmar: true, pagaEm: '2026-09-10', versaoEsperada: antes,
  });
  assert.equal(r.ok, true);
  assert.equal(raw.prepare('SELECT pago FROM vendas WHERE id = 3').get().pago, 1);
  assert.ok(verVenda(raw, 3) > antes, 'a escrita incrementou a versão');
  assert.equal(r.versao, verVenda(raw, 3), 'e a resposta devolve o token já atualizado');
  raw.close();
  prova('versão correta escreve, incrementa, e devolve o próximo token');
}

/* ═══════════════ 4. a corrida: mesma versão, no máximo uma vence ═════════ */
{
  const raw = banco();
  const db = adaptador(raw);
  const v0 = verVenda(raw, 3);

  /* As duas telas leram a lista ao mesmo tempo e seguram o mesmo número.
     Datas diferentes de propósito: é a DATA que se perdia antes, porque
     `WHERE pago = 0` deixava a segunda passar sem conflito. */
  const a = await receberConta(db, { chave: 'venda:3', confirmar: true, pagaEm: '2026-09-10', versaoEsperada: v0 });
  const b = await receberConta(db, { chave: 'venda:3', confirmar: true, pagaEm: '2026-09-12', versaoEsperada: v0 });

  assert.equal(a.ok, true, 'a primeira vence');
  assert.equal(b.ok, false, 'a segunda é recusada');
  assert.equal(b.statusHttp, 409);
  assert.equal(b.versaoAtual, verVenda(raw, 3));
  assert.equal(raw.prepare('SELECT data_pagamento FROM vendas WHERE id = 3').get().data_pagamento,
    '2026-09-10', 'a data da vencedora é a que ficou — não vence mais a última');
  raw.close();
  prova('duas escritas com a mesma versão: uma vence, a outra recebe 409');
}

{
  /* nenhum efeito parcial: a venda de uma troca tem DUAS linhas para fechar,
     e uma versão velha não pode fechar a segunda. */
  const raw = banco();
  const db = adaptador(raw);
  const r = await receberConta(db, {
    chave: 'venda:2', confirmar: true, pagaEm: '2026-09-10', versaoEsperada: 42,
  });
  assert.equal(r.ok, false);
  assert.equal(raw.prepare('SELECT pago FROM vendas WHERE id = 2').get().pago, 0);
  assert.equal(
    raw.prepare('SELECT diferenca_status FROM garantia_trocas WHERE id = 1').get().diferenca_status,
    'a_receber', 'a diferença NÃO foi fechada por trás da venda recusada');
  assert.equal(
    raw.prepare("SELECT COUNT(*) n FROM garantia_eventos WHERE tipo='diferenca_paga'").get().n, 0);
  raw.close();
  prova('conflito não deixa efeito parcial: nem a venda, nem a troca, nem o evento');
}

/* ════════════════════ 5. cada fato financeiro incrementa ═════════════════ */
{
  const raw = banco();
  const db = adaptador(raw);

  const v0 = verVenda(raw, 3);
  await registrarPagamentoVenda(db, 3, { dataPagamento: '2026-09-10' });
  const v1 = verVenda(raw, 3);
  assert.ok(v1 > v0, 'receber pagamento incrementa');

  await registrarPagamentoVenda(db, 3, { pago: false });
  const v2 = verVenda(raw, 3);
  assert.ok(v2 > v1, 'desfazer incrementa');

  await definirPrazoDaConta(db, { chave: 'venda:3', vencimentoEm: '2026-10-01' });
  const v3 = verVenda(raw, 3);
  assert.ok(v3 > v2, 'definir prazo incrementa');
  raw.close();
  prova('receber, desfazer e definir prazo incrementam a versão');
}

{
  /* o sync não delega para o núcleo (é o canal da loja), e é exatamente por
     isso que o trigger importa: ele não depende de ninguém se lembrar. */
  const raw = banco();
  const db = adaptador(raw);
  const v0 = verVenda(raw, 4);
  const pg = pagamentoDoPedido({ payment_status: 'paid', paid_at: '2026-09-11T10:00:00Z' }, '2026-09-06', 90);
  const r = await atualizarPagamentoDaVenda(db, 4, pg);
  assert.equal(r.mudou, true);
  assert.ok(verVenda(raw, 4) > v0,
    'o sync mudou o estado financeiro e a versão caiu, sem uma linha de código no sync');
  raw.close();
  prova('sync que altera pagamento incrementa a versão — sem o sync saber que ela existe');
}

{
  /* cancelamento relevante */
  const raw = banco();
  const db = adaptador(raw);
  const v0 = verVenda(raw, 2);
  const r = await estornarTroca(db, 1, { motivo: 'sku errado' });
  assert.equal(r.ok, true);
  assert.ok(verVenda(raw, 2) > v0, 'estornar a troca cancela a venda e invalida o token dela');
  assert.ok(verTroca(raw, 1) > 1, 'e a linha da troca também');
  assert.equal(razaoFecha(raw), 0, 'com a razão fechando');
  raw.close();
  prova('cancelamento por estorno de troca incrementa as duas versões');
}

/* ══════════════════════════ 6. a fonte troca, por ela mesma ══════════════ */
{
  const raw = banco();
  const db = adaptador(raw);

  const ruim = await receberConta(db, {
    chave: 'troca:2', confirmar: true, pagaEm: '2026-09-10', versaoEsperada: 77,
  });
  assert.equal(ruim.ok, false);
  assert.equal(ruim.statusHttp, 409);
  assert.equal(ruim.versaoAtual, 1);
  assert.equal(
    raw.prepare('SELECT diferenca_status FROM garantia_trocas WHERE id = 2').get().diferenca_status,
    'a_receber', 'nada escrito');

  const bom = await pagarDiferencaTroca(db, 2, { pagaEm: '2026-09-10', versaoEsperada: 1 });
  assert.equal(bom.ok, true);
  assert.equal(verTroca(raw, 2), 2);
  assert.equal(bom.versao, 2);
  raw.close();
  prova('a troca sem venda ligada é recebível próprio, e usa a versão DELA');
}

/* ═════════════════ 7. compatibilidade: ausente continua funcionando ══════ */
{
  const raw = banco();
  const db = adaptador(raw);
  /* Os três botões do painel legado não mandam versão. Exigi-la agora
     quebraria todos eles no mesmo dia. */
  const a = await receberConta(db, { chave: 'venda:3', confirmar: true, pagaEm: '2026-09-10' });
  assert.equal(a.ok, true, 'sem versaoEsperada continua funcionando');
  const b = await definirPrazoDaConta(db, { chave: 'venda:2', vencimentoEm: '2026-10-01' });
  assert.equal(b.ok, true);
  const c = await registrarPagamentoVenda(db, 2, { dataPagamento: '2026-09-10' });
  assert.equal(c.status, 200);
  raw.close();
  prova('call sites legados sem versaoEsperada não quebraram (a trava é opt-in)');
}

{
  /* prazo com versão velha também é recusado — trancar uma porta e deixar a
     outra aberta não protege nada. */
  const raw = banco();
  const db = adaptador(raw);
  const r = await definirPrazoDaConta(db, {
    chave: 'venda:3', vencimentoEm: '2026-10-01', versaoEsperada: 88,
  });
  assert.equal(r.ok, false);
  assert.equal(r.statusHttp, 409);
  assert.equal(r.versaoAtual, 1);
  assert.equal(raw.prepare('SELECT vencimento_em FROM vendas WHERE id = 3').get().vencimento_em, null);

  const bom = await definirPrazoDaConta(db, {
    chave: 'venda:3', vencimentoEm: '2026-10-01', versaoEsperada: 1,
  });
  assert.equal(bom.ok, true);
  assert.equal(bom.versao, 2);
  raw.close();
  prova('definirPrazo tem a mesma trava: versão velha não muda vencimento');
}

/* ════════════════ 8. o histórico manteve o mecanismo que já tinha ════════ */
{
  const raw = banco();
  const colunas = (t) => raw.prepare('SELECT name FROM pragma_table_info(?)').all(t).map((r) => r.name);
  assert.ok(colunas('historico_operacoes').includes('versao'),
    'historico_operacoes continua com a `versao` dela');
  assert.ok(!colunas('historico_operacoes').includes('recebivel_versao'),
    'e NÃO ganhou uma segunda — ela é versionada por construção, com linha nova por mudança');
  assert.ok(colunas('vendas').includes('recebivel_versao'));
  assert.ok(colunas('garantia_trocas').includes('recebivel_versao'));
  raw.close();
  prova('o histórico preserva o versionamento próprio; só as outras duas fontes ganharam coluna');
}

/* ══════════════════════════════ 9. nada disso mexeu em estoque ══════════ */
{
  const raw = banco();
  const db = adaptador(raw);
  const qtd = JSON.stringify(raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all());
  const mov = raw.prepare('SELECT COUNT(*) n FROM movimentos').get().n;

  await receberConta(db, { chave: 'venda:3', confirmar: true, pagaEm: '2026-09-10', versaoEsperada: 1 });
  await desfazerPagamentoVenda(db, 3, { versaoEsperada: verVenda(raw, 3) });
  await definirPrazoDaConta(db, { chave: 'venda:3', vencimentoEm: '2026-10-01', versaoEsperada: verVenda(raw, 3) });

  assert.equal(JSON.stringify(raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all()), qtd);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM movimentos').get().n, mov);
  assert.equal(razaoFecha(raw), 0);
  raw.close();
  prova('estoque e razão intactos em toda a sequência com versão');
}

console.log(`\n  ${provas} prova(s). 5.3c fechada.`);
