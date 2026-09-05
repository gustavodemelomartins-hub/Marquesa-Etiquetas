/** §1 da revisão pré-go-live — a migration de pagamentos, provada linha a linha.
 *
 *  O DEFEITO que este arquivo existe para impedir de voltar:
 *
 *    `UPDATE vendas SET pago = 1, data_pagamento = data` aplicado a todas as
 *    linhas. Ele parece inofensivo porque o faturamento não muda — e é
 *    exatamente por isso que é perigoso: uma conta a RECEBER de verdade vira
 *    pagamento, ninguém vê número nenhum cair, e a cobrança some do radar.
 *
 *  O que se prova aqui, sem Worker e sem rede, executando o arquivo SQL de
 *  verdade sobre um SQLite montado com a forma ANTERIOR de `vendas`:
 *
 *    1. venda histórica PAGA           → pago=1 com a data REAL do recebimento
 *    2. venda histórica A RECEBER      → pago=0, sem data, e continua a receber
 *    3. venda do site sem estado       → ausência de informação vira ausência
 *                                        de número: faturamento 0 E A Receber 0
 *    4. legado sem evidência           → aproximação DECLARADA, não fato
 *    5. rodar o backfill duas vezes não muda nada
 *
 *      node src/migracao-pagamento-test.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));

/* A forma de `vendas` ANTES da migration. Só as colunas que o backfill lê —
   um recorte, de propósito: o teste tem que falhar se a migration passar a
   depender de alguma coluna que ela não declarou precisar. */
const ANTES = `
CREATE TABLE vendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_nome TEXT,
  origem TEXT NOT NULL DEFAULT 'balcao',
  data TEXT NOT NULL,
  total REAL NOT NULL,
  cancelada INTEGER NOT NULL DEFAULT 0,
  externo_id TEXT
);
CREATE TABLE historico_operacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cobranca_status TEXT NOT NULL DEFAULT 'nenhuma',
  saldo_centavos INTEGER,
  paga_em TEXT,
  status_registro TEXT NOT NULL DEFAULT 'ativa'
);
CREATE TABLE historico_operacao_vendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operacao_id INTEGER NOT NULL,
  venda_id INTEGER NOT NULL,
  status_registro TEXT NOT NULL DEFAULT 'ativa'
);`;

/* As quatro situações que existem de verdade neste banco, mais uma venda
   cancelada para provar que ela não é esquecida pelo carimbo. */
const SEMENTE = `
INSERT INTO vendas (id, cliente_nome, origem, data, total, externo_id) VALUES
  (1, 'Cliente Paga',      'balcao', '2026-07-15', 100.0, NULL),
  (2, 'Cliente A Receber', 'balcao', '2026-07-20', 250.0, NULL),
  (3, 'Cliente do Site',   'site',   '2026-08-02',  89.0, 'nuvemshop:777'),
  (4, 'Cliente Balcao',    'balcao', '2026-08-10',  69.0, NULL),
  (5, 'Cancelada',         'balcao', '2026-08-11',  50.0, NULL);
UPDATE vendas SET cancelada = 1 WHERE id = 5;

INSERT INTO historico_operacoes (id, cobranca_status, saldo_centavos, paga_em)
  VALUES (10, 'paga', 0, '2026-09-04 13:22:00');
INSERT INTO historico_operacao_vendas (operacao_id, venda_id) VALUES (10, 1);

INSERT INTO historico_operacoes (id, cobranca_status, saldo_centavos)
  VALUES (11, 'aberta', 25000);
INSERT INTO historico_operacao_vendas (operacao_id, venda_id) VALUES (11, 2);
`;

const db = new DatabaseSync(':memory:');
db.exec(ANTES);
db.exec(SEMENTE);

const ABERTAS = "SELECT COUNT(*) n, COALESCE(SUM(saldo_centavos),0) s FROM historico_operacoes WHERE cobranca_status='aberta'";
const abertasAntes = db.prepare(ABERTAS).get();

/* A migration de verdade — o arquivo que vai para produção, não uma cópia. */
const SQL = readFileSync(new URL('../api/migracao-vendas-pagamento.sql', import.meta.url), 'utf8');
db.exec(SQL);

const v = (id) => db.prepare('SELECT * FROM vendas WHERE id = ?').get(id);

console.log('\n=== 1. venda histórica PAGA — a data é a REAL, não a da venda ===');
{
  const r = v(1);
  eq('pago', r.pago, 1);
  eq('data da venda intocada', r.data, '2026-07-15');
  eq('data do pagamento é a do recebimento', r.data_pagamento, '2026-09-04');
  eq('procedência', r.pagamento_origem, 'historico_paga');
}

console.log('\n=== 2. venda histórica A RECEBER — continua a receber ===');
{
  const r = v(2);
  eq('pago', r.pago, 0);
  eq('sem data de pagamento', r.data_pagamento, 'null');
  eq('procedência', r.pagamento_origem, 'historico_aberto');
  const dep = db.prepare(ABERTAS).get();
  eq('cobranças abertas: quantidade', dep.n, abertasAntes.n);
  eq('cobranças abertas: saldo', dep.s, abertasAntes.s);
}

console.log('\n=== 3. pedido do site — ausência de informação, ausência de número ===');
{
  const r = v(3);
  /* Não saber NÃO é o mesmo que saber que entrou. O banco nunca guardou o
     estado do pagamento deste pedido, e a existência do pedido nunca foi
     evidência de recebimento. Então a linha não vira faturamento (não há
     prova de que entrou) NEM conta a receber (não há prova de que o cliente
     deve). Ela vira pendência de conferência financeira.

     Em produção isto não move um centavo: `marquesa-db-prod` tem ZERO
     vendas de origem `site`, medido em 2026-09-05. */
  eq('não é declarado pago', r.pago, 0);
  eq('sem data de pagamento', r.data_pagamento, 'null');
  eq('o recebido conhecido é ZERO', r.valor_recebido, 0);
  eq('e não é cobrável', r.cobravel, 0);
  eq('procedência diz que é indeterminada', r.pagamento_origem, 'indeterminado_site');
  eq('a data da venda continua intocada', r.data, '2026-08-02');
}

console.log('\n=== 4. legado sem evidência — aproximação DECLARADA ===');
{
  const r = v(4);
  eq('pago', r.pago, 1);
  eq('data aproximada', r.data_pagamento, '2026-08-10');
  eq('procedência', r.pagamento_origem, 'legado_data_venda');
  eq('venda cancelada também recebe carimbo', v(5).pagamento_origem, 'legado_data_venda');
}

console.log('\n=== 5. nada foi inventado ===');
{
  const conta = (onde) => db.prepare(`SELECT COUNT(*) n FROM vendas WHERE ${onde}`).get().n;
  eq('toda venda tem procedência', conta('pagamento_origem IS NULL'), 0);
  eq('nenhuma venda herdada se declara informada', conta("pagamento_origem = 'informado'"), 0);
  eq('as aproximações estão marcadas como aproximação',
    conta("pagamento_origem = 'legado_data_venda'"), 2);
  /* O pedido do site NÃO é aproximação: é ausência. Ele não entra em
     faturamento nem em cobrança, e por isso conta à parte. */
  eq('e a ausência está marcada como ausência',
    conta("pagamento_origem = 'indeterminado_site'"), 1);
  eq('nenhuma linha indeterminada virou faturamento',
    conta("pagamento_origem = 'indeterminado_site' AND pago = 1"), 0);
  eq('nem conta a receber',
    conta("pagamento_origem = 'indeterminado_site' AND cobravel = 1"), 0);
}

console.log('\n=== 6. rodar o backfill de novo não muda nada ===');
{
  const retrato = () => JSON.stringify(
    db.prepare('SELECT id, pago, data_pagamento, pagamento_origem, valor_recebido, cobravel FROM vendas ORDER BY id').all());
  const antes = retrato();
  /* Os `ALTER TABLE` não são idempotentes no SQLite — "duplicate column
     name" é justamente o sinal de que a migration já rodou. O que precisa
     ser idempotente é o BACKFILL, que é a parte que reescreve dado. */
  const backfill = SQL.split(/;\s*\r?\n/)
    .filter((t) => /^\s*UPDATE\b/i.test(t.replace(/--[^\n]*\n/g, '')))
    .map((t) => `${t};`).join('\n');
  if (!backfill.trim()) bad('backfill localizado no arquivo');
  db.exec(backfill);
  eq('backfill idempotente', retrato(), antes);
}

db.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\ntudo ok\n');
process.exit(falhas ? 1 : 0);
