/** FIN-101 / Fase 5.3b — a porta financeira única.
 *
 *  A pergunta que este arquivo responde não é "a função nova funciona?". É:
 *
 *      as três portas de pagamento deixam o banco no MESMO estado?
 *
 *  Por isso quase toda prova aqui é uma COMPARAÇÃO: dois bancos idênticos, a
 *  mesma quitação por caminhos diferentes, e um retrato das três tabelas que
 *  o dinheiro toca (`vendas`, `garantia_trocas`, `garantia_eventos`). Se as
 *  portas voltarem a divergir, elas divergem aqui primeiro.
 *
 *  As três portas:
 *
 *    A · POST /api/contas-receber/receber  { chave: 'venda:N' }  → receberConta
 *    B · POST /api/vendas/:id/pagamento                          → registrarPagamentoVenda
 *    C · POST /api/garantias/:id/troca/pagar                     → pagarDiferencaTroca
 *
 *  As três passam por `pagamento-venda.js › quitarVenda` desde 5.3b.
 *
 *      node src/fin-101-5-3b-test.mjs
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

const { contasAReceber, receberConta } = await mod('api/src/contas-receber.js');
const { registrarPagamentoVenda } = await mod('api/src/vendas-comandos.js');
const { pagarDiferencaTroca } = await mod('api/src/garantias.js');
const { quitarVenda, desfazerPagamentoVenda } = await mod('api/src/pagamento-venda.js');

/* ─── o retrato. `atualizado_em` e `criado_em` ficam de fora: eles mudam com
   o relógio, e o que se compara aqui é a DECISÃO, não o instante dela. */
function retrato(raw) {
  return JSON.stringify({
    vendas: raw.prepare(
      `SELECT id, total, cancelada, pago, data_pagamento, pagamento_origem,
              valor_recebido, cobravel, observacao
         FROM vendas ORDER BY id`).all(),
    trocas: raw.prepare(
      `SELECT id, garantia_id, venda_id, diferenca, diferenca_status,
              diferenca_paga_em, diferenca_valor_pago, estornada
         FROM garantia_trocas ORDER BY id`).all(),
    eventos: raw.prepare(
      `SELECT garantia_id, tipo, data, status_novo, dados_json
         FROM garantia_eventos ORDER BY id`).all(),
  }, null, 1);
}

const razaoFecha = (raw) => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.soma, 0)`).get().n;

/* ─── o mundo: uma compra paga, uma garantia, a troca de §36 com a venda da
   diferença em aberto, e uma venda de balcão fiada. Os valores e as colunas
   são os que `garantias.js › registrarVendaDaTroca` escreve de verdade. */
const SEED = `
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitario', 'Anel', 100.0, 48),
  ('100002', 'Anel Maior',     'Anel', 110.0, 49);
INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES
  ('100001', 'entrada', 50, 'importacao', 'carga'),
  ('100002', 'entrada', 50, 'importacao', 'carga'),
  ('100001', 'venda',   -1, 'venda', 'venda 1'),
  ('100001', 'venda',   -1, 'venda', 'venda 3'),
  ('100002', 'troca',   -1, 'troca_garantia', 'troca da garantia 1');
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');

INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, pagamento_origem, cobravel)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 100.0, 0, 1,
          '2026-09-01', 'informado', 0);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
  VALUES (1, '100001', 'Anel Solitario', 1, 100.0, 'a0000000-0000-4000-8000-000000000001');

INSERT INTO garantias (id, origem_fonte, venda_id, sku, cliente_id, cliente_nome,
                       cliente_nome_norm, data_venda, data_entrada, motivo, status,
                       valor_pago_original)
  VALUES (1, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-09-01',
          '2026-09-04', 'pedra solta', 'sem_conserto', 100.0);

-- §36: a diferenca nasce como VENDA propria, nao paga
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, cobravel, nuvemshop_status, observacao)
  VALUES (2, 1, 'Vitoria', 'vitoria', 'troca', '2026-09-04', 10.0, 0, 0, 1, 'nao_aplicavel',
          'Troca de garantia 1 · 100001 → 100002');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, preco_tabela, desconto_valor, id)
  VALUES (2, '100002', 'Anel Maior', 1, 10.0, 'troca', 110.0, 100.0,
          'a0000000-0000-4000-8000-000000000002');
INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                             valor_original, valor_novo, diferenca, diferenca_status, venda_id)
  VALUES (1, 1, '2026-09-04', '100002', 'Anel Maior', 100.0, 110.0, 10.0, 'a_receber', 2);

-- uma venda de balcao fiada, sem nenhuma relacao com garantia
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, cobravel)
  VALUES (3, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-05', 250.0, 0, 0, 1);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
  VALUES (3, '100001', 'Anel Solitario', 1, 250.0, 'a0000000-0000-4000-8000-000000000003');
`;

function banco() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  return raw;
}

/** Roda uma porta num banco novo e devolve o retrato. */
async function porta(acao) {
  const raw = banco();
  const r = await acao(adaptador(raw), raw);
  const foto = retrato(raw);
  const razao = razaoFecha(raw);
  raw.close();
  return { foto, razao, r };
}

const QUITAR = '2026-09-10';
const A = (id) => (db) => receberConta(db, { chave: `venda:${id}`, confirmar: true, pagaEm: QUITAR });
const B = (id) => (db) => registrarPagamentoVenda(db, id, { dataPagamento: QUITAR });
const C = (garantiaId) => (db) => pagarDiferencaTroca(db, garantiaId, { pagaEm: QUITAR });

/* ══════════════════════════ 1. venda comum — duas portas, um estado ══════ */
{
  const a = await porta(A(3));
  const b = await porta(B(3));
  assert.equal(a.foto, b.foto, 'A e B divergiram numa venda de balcão comum');
  assert.equal(a.razao, 0);
  assert.equal(b.razao, 0);
  prova('venda de balcão: A Receber e /vendas/:id/pagamento deixam o banco idêntico');
}

/* ═══════════ 2. venda ligada a garantia_trocas — TRÊS portas, um estado ══ */
{
  const a = await porta(A(2));
  const b = await porta(B(2));
  const c = await porta(C(1));

  assert.equal(a.foto, b.foto, 'B2: A e B divergiram na venda de uma troca');
  assert.equal(a.foto, c.foto, 'B2: A e C divergiram na venda de uma troca');
  prova('venda de troca: as TRÊS portas deixam vendas, garantia_trocas e eventos idênticos');

  /* e o estado é o CERTO, não só o mesmo nos três */
  const raw = banco();
  await receberConta(adaptador(raw), { chave: 'venda:2', confirmar: true, pagaEm: QUITAR });
  const v = raw.prepare('SELECT pago, data_pagamento, cobravel FROM vendas WHERE id = 2').get();
  assert.equal(v.pago, 1);
  assert.equal(v.data_pagamento, QUITAR);
  assert.equal(v.cobravel, 0);
  const t = raw.prepare(
    'SELECT diferenca_status, diferenca_paga_em, diferenca_valor_pago FROM garantia_trocas WHERE id = 1').get();
  assert.equal(t.diferenca_status, 'paga', 'B2 fechado: a troca não fica mais a_receber');
  assert.equal(t.diferenca_paga_em, QUITAR);
  assert.equal(t.diferenca_valor_pago, 10);
  const ev = raw.prepare(
    "SELECT COUNT(*) n FROM garantia_eventos WHERE tipo = 'diferenca_paga'").get();
  assert.equal(ev.n, 1, 'e a linha do tempo do caso registrou o pagamento, uma vez');
  raw.close();
  prova('B2 fechado: a diferença é quitada nas duas tabelas e entra na linha do tempo');
}

/* ════════════════════════════ 3. parcial conhecido — B3 e B4 ═════════════ */
{
  const comParcial = (db, raw) => {
    /* o único produtor de PARCIAL hoje: sync.js com `partially_paid` e valor
       utilizável. 40 de 250. */
    raw.exec("UPDATE vendas SET valor_recebido = 40.0, pagamento_origem = 'nuvemshop_parcial',"
      + " origem = 'site', externo_id = 'nuvemshop:777' WHERE id = 3");
  };

  const a = await porta(async (db, raw) => { comParcial(db, raw); return A(3)(db); });
  const b = await porta(async (db, raw) => { comParcial(db, raw); return B(3)(db); });
  assert.equal(a.foto, b.foto, 'B4: as portas discordam sobre o que fazer com o parcial');
  prova('parcial conhecido: as duas portas convergem — B4 fechado');

  const raw = banco();
  const db = adaptador(raw);
  comParcial(db, raw);

  const antes = await contasAReceber(db, {});
  assert.equal(antes.contas.find((c) => c.chave === 'venda:3').valorReceber, 210,
    'em aberto, o A Receber cobra só o saldo de 210');

  const r = await receberConta(db, { chave: 'venda:3', confirmar: true, pagaEm: QUITAR });
  const v = raw.prepare('SELECT pago, valor_recebido, observacao FROM vendas WHERE id = 3').get();

  assert.equal(v.pago, 1);
  assert.equal(v.valor_recebido, 250,
    'B3/B4: recebido vai ao TOTAL — pago = 1 nunca coexiste com recebido < total');
  assert.notEqual(v.valor_recebido, null, 'e não é apagado, que era o defeito B3');
  assert.match(String(v.observacao), /parcial conhecido de 40\.00 de 250\.00/,
    'o número anterior sobrevive, legível, com data e carimbo');
  assert.match(String(v.observacao), /5\.8/,
    'e a nota diz onde o registro de parcelas vai existir de verdade');
  assert.equal(r.parcialAnteriorPreservadoEmObservacao, 40,
    '§9: a resposta anuncia que houve um parcial, em vez de a tela ter de deduzir');
  prova('B3 fechado: o parcial não é apagado nem fingido de histórico — vira estado correto + nota');

  const depois = await contasAReceber(db, {});
  assert.equal(depois.contas.find((c) => c.chave === 'venda:3'), undefined);
  assert.equal(depois.resumo.total, 10, 'sobra só a diferença da troca — nada foi inventado');
  raw.close();
}

/* ═══════════════════════ 4. desfazer — cobrabilidade e troca preservadas ═ */
{
  /* 4a. a regra de 5.3a continua valendo dentro do núcleo */
  const raw = banco();
  const db = adaptador(raw);
  raw.exec("INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data,"
    + " total, cancelada, pago, data_pagamento, cobravel, pagamento_origem, externo_id)"
    + " VALUES (9, 1, 'Vitoria', 'vitoria', 'site', '2026-09-02', 250.0, 0, 1,"
    + " '2026-09-02', 0, 'nuvemshop_pago', 'nuvemshop:888')");

  const r = await registrarPagamentoVenda(db, 9, { pago: false });
  assert.equal(r.status, 200);
  const v9 = raw.prepare('SELECT pago, cobravel FROM vendas WHERE id = 9').get();
  assert.equal(v9.pago, 0);
  assert.equal(v9.cobravel, 0, 'desfazer não eleva cobravel — 5.3a, agora no núcleo');
  const lista = await contasAReceber(db, {});
  assert.equal(lista.contas.find((c) => c.chave === 'venda:9'), undefined,
    'nenhum recebível inventado');
  raw.close();
  prova('desfazer preserva a cobrabilidade e não inventa recebível (5.3a preservada no núcleo)');
}

{
  /* 4b. desfazer a venda de uma troca REABRE a diferença. Sem isto, `vendas`
     diria "não paga" e `garantia_trocas` diria "paga" — B2 ao contrário. */
  const raw = banco();
  const db = adaptador(raw);
  await receberConta(db, { chave: 'venda:2', confirmar: true, pagaEm: QUITAR });
  assert.equal(
    raw.prepare('SELECT diferenca_status FROM garantia_trocas WHERE id = 1').get().diferenca_status,
    'paga');

  const r = await registrarPagamentoVenda(db, 2, { pago: false });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.diferencaReaberta, true, '§9: a resposta diz que a diferença voltou');

  const t = raw.prepare(
    'SELECT diferenca_status, diferenca_paga_em, diferenca_valor_pago FROM garantia_trocas WHERE id = 1').get();
  assert.equal(t.diferenca_status, 'a_receber', 'a diferença reabriu junto com a venda');
  assert.equal(t.diferenca_paga_em, null);
  assert.equal(t.diferenca_valor_pago, null);

  /* §28 — o fato não foi apagado: ganhou uma linha que o desfaz. */
  const ev = raw.prepare(
    "SELECT tipo FROM garantia_eventos WHERE garantia_id = 1 ORDER BY id").all().map((x) => x.tipo);
  assert.deepEqual(ev.slice(-2), ['diferenca_paga', 'diferenca_pagamento_desfeito'],
    'a linha do tempo conta as duas coisas, em ordem');

  const lista = await contasAReceber(db, {});
  assert.equal(lista.contas.filter((c) => c.chave === 'venda:2').length, 1,
    'e a diferença volta ao A Receber uma vez só, como venda');
  assert.equal(lista.contas.filter((c) => c.tipo === 'troca').length, 0,
    'nunca como venda E como troca — isso seria dupla cobrança');
  raw.close();
  prova('desfazer reabre a diferença da troca, sem apagar o fato e sem cobrar duas vezes');
}

/* ═══════════════════════════════ 5. retry e idempotência ════════════════ */
{
  const raw = banco();
  const db = adaptador(raw);

  await receberConta(db, { chave: 'venda:2', confirmar: true, pagaEm: QUITAR });
  const depoisDaPrimeira = retrato(raw);

  /* o mesmo clique de novo, pelas TRÊS portas */
  const r1 = await receberConta(db, { chave: 'venda:2', confirmar: true, pagaEm: QUITAR });
  const r2 = await registrarPagamentoVenda(db, 2, { dataPagamento: QUITAR });
  const r3 = await pagarDiferencaTroca(db, 1, { pagaEm: QUITAR });

  assert.equal(retrato(raw), depoisDaPrimeira, 'um retry escreveu alguma coisa');
  assert.equal(r1.jaEstavaPaga, true, 'A: 200 com jaEstavaPaga — é uma lista reprocessável');
  assert.equal(r2.status, 409, 'B: 409 com a data — quem clica merece saber que já estava gravado');
  assert.equal(r3.ok, false, 'C: 409 — a diferença já foi marcada como paga');
  assert.equal(
    raw.prepare("SELECT COUNT(*) n FROM garantia_eventos WHERE tipo='diferenca_paga'").get().n, 1,
    'e o evento da garantia não duplicou');
  raw.close();
  prova('retry pelas três portas não escreve nada e não duplica o evento (contratos HTTP preservados)');
}

{
  /* 5b. pagar DEPOIS de desfazer é um fato novo e verdadeiro, e não pode
     ficar mudo só porque já houve um pagamento antes. */
  const raw = banco();
  const db = adaptador(raw);
  await receberConta(db, { chave: 'venda:2', confirmar: true, pagaEm: QUITAR });
  await desfazerPagamentoVenda(db, 2);
  await quitarVenda(db, 2, { pagaEm: QUITAR });

  const ev = raw.prepare(
    "SELECT tipo FROM garantia_eventos WHERE garantia_id = 1 ORDER BY id").all().map((x) => x.tipo);
  assert.deepEqual(ev.slice(-3),
    ['diferenca_paga', 'diferenca_pagamento_desfeito', 'diferenca_paga'],
    'pagar de novo depois de desfazer escreve a linha nova');
  assert.equal(
    raw.prepare('SELECT diferenca_status FROM garantia_trocas WHERE id = 1').get().diferenca_status,
    'paga');
  raw.close();
  prova('pagar depois de desfazer volta a registrar — idempotência não é amnésia');
}

/* ══════════════════════ 6. a troca ANTERIOR a §36 continua funcionando ═══ */
{
  const raw = banco();
  const db = adaptador(raw);
  /* sem `venda_id`: é a troca que nasceu antes do registro comercial. Ela não
     tem venda para quitar, e continua fechando pela rota da garantia. */
  raw.exec(`INSERT INTO garantias (id, origem_fonte, venda_id, sku, cliente_id, cliente_nome,
              cliente_nome_norm, data_venda, data_entrada, motivo, status, valor_pago_original)
            VALUES (2, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-09-01',
                    '2026-09-05', 'fecho', 'sem_conserto', 50.0);
            INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                    valor_original, valor_novo, diferenca, diferenca_status, venda_id)
            VALUES (2, 2, '2026-09-05', '100002', 'Anel Maior', 50.0, 75.0, 25.0,
                    'a_receber', NULL)`);

  const antes = await contasAReceber(db, {});
  assert.equal(antes.contas.find((c) => c.chave === 'troca:2').valorReceber, 25);

  const r = await pagarDiferencaTroca(db, 2, { pagaEm: QUITAR });
  assert.equal(r.ok, true);
  assert.equal(r.porOndeFatura, 'diferenca_troca', 'sem venda ligada, fatura por ela mesma');
  assert.equal(r.vendaId, null);
  const t = raw.prepare(
    'SELECT diferenca_status, diferenca_valor_pago FROM garantia_trocas WHERE id = 2').get();
  assert.equal(t.diferenca_status, 'paga');
  assert.equal(t.diferenca_valor_pago, 25);
  assert.equal(
    raw.prepare("SELECT COUNT(*) n FROM garantia_eventos WHERE garantia_id=2 AND tipo='diferenca_paga'").get().n,
    1);

  /* e a mesma conta pela porta A da lista */
  const outro = banco();
  const db2 = adaptador(outro);
  outro.exec(`INSERT INTO garantias (id, origem_fonte, venda_id, sku, cliente_id, cliente_nome,
                cliente_nome_norm, data_venda, data_entrada, motivo, status, valor_pago_original)
              VALUES (2, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-09-01',
                      '2026-09-05', 'fecho', 'sem_conserto', 50.0);
              INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                      valor_original, valor_novo, diferenca, diferenca_status, venda_id)
              VALUES (2, 2, '2026-09-05', '100002', 'Anel Maior', 50.0, 75.0, 25.0,
                      'a_receber', NULL)`);
  await receberConta(db2, { chave: 'troca:2', confirmar: true, pagaEm: QUITAR });
  assert.equal(retrato(raw), retrato(outro),
    'a troca antiga também fecha igual pelas duas portas que a alcançam');
  outro.close();
  raw.close();
  prova('a troca anterior a §36 continua fechando, e igual pelas duas portas que a alcançam');
}

/* ═════════ 6b. a nota do EVENTO não encosta na observação da VENDA ══════ */
{
  const raw = banco();
  const db = adaptador(raw);
  raw.exec("UPDATE vendas SET observacao = 'ANOTACAO HUMANA IMPORTANTE' WHERE id = 2");

  /* A rota da garantia aceita uma observação, e ela descreve o PAGAMENTO da
     diferença — pertence à linha do tempo do caso, não à venda. Confundir as
     duas apagava o que uma pessoa tinha escrito na venda. */
  await pagarDiferencaTroca(db, 1, { pagaEm: QUITAR, observacao: 'pagou em pix' });

  assert.equal(raw.prepare('SELECT observacao FROM vendas WHERE id = 2').get().observacao,
    'ANOTACAO HUMANA IMPORTANTE', 'a anotação humana da venda continua intacta');
  assert.equal(
    raw.prepare("SELECT observacao FROM garantia_eventos WHERE tipo = 'diferenca_paga'").get().observacao,
    'pagou em pix', 'e a nota do pagamento foi para o evento, que é o lugar dela');
  raw.close();
  prova('a observação do pagamento vai para o evento e nunca sobrescreve a da venda');
}

{
  /* e a nota do parcial APENAS acrescenta — nunca substitui. */
  const raw = banco();
  const db = adaptador(raw);
  raw.exec("UPDATE vendas SET observacao = 'cliente pediu embrulho de presente',"
    + " valor_recebido = 40.0, pagamento_origem = 'nuvemshop_parcial' WHERE id = 3");
  await receberConta(db, { chave: 'venda:3', confirmar: true, pagaEm: QUITAR });
  const obs = String(raw.prepare('SELECT observacao FROM vendas WHERE id = 3').get().observacao);
  assert.match(obs, /^cliente pediu embrulho de presente · /,
    'a observação existente vem primeiro e inteira');
  assert.match(obs, /parcial conhecido de 40\.00 de 250\.00/, 'e a nota é acrescentada');
  raw.close();
  prova('a nota do parcial é aditiva: a observação que já existia não é sobrescrita');
}

/* ═══════════════════ 7. nada disso mexeu em estoque nem em dívida ═══════ */
{
  const raw = banco();
  const db = adaptador(raw);
  const qtdAntes = JSON.stringify(raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all());
  const movAntes = raw.prepare('SELECT COUNT(*) n FROM movimentos').get().n;
  const vendasAntes = raw.prepare('SELECT COUNT(*) n FROM vendas').get().n;

  await receberConta(db, { chave: 'venda:2', confirmar: true, pagaEm: QUITAR });
  await registrarPagamentoVenda(db, 3, { dataPagamento: QUITAR });
  await registrarPagamentoVenda(db, 3, { pago: false });

  assert.equal(JSON.stringify(raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all()), qtdAntes);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM movimentos').get().n, movAntes,
    '§29: receber dinheiro não cria movimento de estoque');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM vendas').get().n, vendasAntes,
    'nenhuma linha nova de venda — nenhuma dívida inventada');
  assert.equal(razaoFecha(raw), 0, 'a razão contábil fecha');
  raw.close();
  prova('estoque, razão e número de vendas intactos em todas as escritas acima');
}

console.log(`\n  ${provas} prova(s). 5.3b fechada.`);
