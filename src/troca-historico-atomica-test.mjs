/** A troca da planilha falhando NO MEIO não pode deixar o sistema sem
 *  histórico.
 *
 *  O defeito que este teste existe para impedir de voltar:
 *
 *    `substituirHistorico` revertia os lotes antigos — apagando as linhas —
 *    e SÓ DEPOIS importava a planilha nova. Uma falha na importação (D1 fora
 *    do ar, teto de batch, constraint) deixava a operação sem histórico
 *    nenhum: o painel de Vendas e Clientes zerava, e a volta era manual,
 *    subir de novo a planilha antiga na mão.
 *
 *    Não dá para provocar essa falha pela API — a análise roda antes e
 *    aprova tudo que a importação aceitaria. Então aqui o banco é de mentira
 *    de propósito: um SQLite em memória com um adaptador que sabe FALHAR na
 *    hora exata, que é o único jeito de provar o caminho de volta.
 *
 *  O que precisa ficar provado:
 *
 *   1. falha na importação devolve o histórico antigo INTEIRO;
 *   2. inclusive a fila de revisão de cliente, que precisa sair na hora da
 *      desativação porque o índice único dela não conhece lote;
 *   3. o lote antigo volta a `importado`, e não fica meio-revertido;
 *   4. a troca bem-sucedida continua funcionando e não deixa lote fantasma;
 *   5. a cliente que existe nas DUAS planilhas mantém o mesmo `id` — antes
 *      ela era apagada e recriada, e qualquer decisão que apontasse para ela
 *      perdia o dono.
 *
 *      node src/troca-historico-atomica-test.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { importarHistorico, substituirHistorico, retratoDoHistorico } from '../api/src/vendas-historico.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x !== '' ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));

/* O adaptador de D1 — igual ao de revendedora-nao-e-cliente-test.mjs, mais
   um gatilho: `db.falharQuando` recebe um pedaço de SQL e, a partir do
   momento em que ele é definido, qualquer statement que o contenha explode.
   É a única peça "esperta" daqui, e ela existe só para simular a queda. */
function comoD1(sq) {
  const estado = { falharQuando: null };
  const talvezFalhar = (sql) => {
    if (estado.falharQuando && sql.includes(estado.falharQuando)) {
      throw new Error('D1_SIMULADO: a escrita caiu no meio da importação');
    }
  };
  const exec = (sql, binds) => ({
    all: async () => { talvezFalhar(sql); return { results: sq.prepare(sql).all(...binds) }; },
    first: async () => { talvezFalhar(sql); return sq.prepare(sql).get(...binds) ?? null; },
    run: async () => { talvezFalhar(sql); return { meta: { changes: sq.prepare(sql).run(...binds).changes } }; },
  });
  return {
    estado,
    prepare: (sql) => ({ ...exec(sql, []), bind: (...b) => exec(sql, b) }),
    batch: async (stmts) => { for (const s of stmts) await s.run(); },
  };
}

const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

const PLANILHA_A = [
  CAB,
  [1, '2026-08-19', 'Ana Ribeiro', 'SKU1', 'Colar', 'Banhada', 1, 100, null, 100, 'Pix', 'PAGO', 'Feira'],
  [2, '2026-08-20', 'Bruna Costa', 'SKU2', 'Brinco', 'Banhada', 2, 50, null, 100, 'Pix', 'PAGO', 'Feira'],
];
const PLANILHA_B = [
  CAB,
  [1, '2026-08-19', 'Ana Ribeiro', 'SKU1', 'Colar', 'Banhada', 1, 120, null, 120, 'Pix', 'PAGO', 'Feira'],
  [2, '2026-08-20', 'Bruna Costa', 'SKU2', 'Brinco', 'Banhada', 2, 50, null, 100, 'Pix', 'PAGO', 'Feira'],
  [3, '2026-08-25', 'Carla Dias', 'SKU3', 'Anel', 'Banhada', 1, 80, null, 80, 'Pix', 'PAGO', 'Feira'],
];

const sq = new DatabaseSync(':memory:');
sq.exec(readFileSync(join(raiz, 'api/schema.sql'), 'utf8'));
const db = comoD1(sq);

const conta = (sql) => sq.prepare(sql).get().n;
const lotesNoAr = () => conta("SELECT COUNT(*) AS n FROM vendas_historico_lotes WHERE status='importado'");
const idDe = (nome) => sq.prepare('SELECT id FROM clientes WHERE nome = ?').get(nome)?.id;

console.log('\n=== 1. a planilha A entra ===');
const primeira = await importarHistorico(db, { arquivo: 'A.xlsx', linhas: PLANILHA_A });
eq('importou', primeira.ok, true);
const retratoA = await retratoDoHistorico(db);
eq('duas vendas no ar', retratoA.vendas, 2);
eq('duas linhas', retratoA.linhas, 2);
eq('um lote no ar', lotesNoAr(), 1);
const idAnaAntes = idDe('Ana Ribeiro');
eq('a cliente Ana existe', typeof idAnaAntes, 'number');

/* Uma pendência de revisão de cliente, que é o que precisa sair na
   desativação (índice único global) e voltar na restauração. */
sq.prepare(
  `INSERT INTO clientes_vinculo_revisao (lote_id, nome_original, nome_norm, motivo, linhas)
   VALUES ((SELECT id FROM vendas_historico_lotes WHERE status='importado'), 'Ana R.', 'ana r', 'parecido', 1)`,
).run();
eq('uma pendência de revisão gravada',
  conta("SELECT COUNT(*) AS n FROM clientes_vinculo_revisao WHERE status='pendente'"), 1);

console.log('\n=== 2. a troca CAI no meio da importação ===');
// A importação do lote novo grava os itens; derrubar esse INSERT é derrubar
// a troca exatamente depois de o lote antigo já ter saído do ar.
db.estado.falharQuando = 'INSERT OR IGNORE INTO vendas_historico_itens';
const caiu = await substituirHistorico(db, { arquivo: 'B.xlsx', linhas: PLANILHA_B });
db.estado.falharQuando = null;

eq('a troca falhou', caiu.ok, false);
eq('e falhou na importação, não na análise', caiu.etapa, 'importacao');
eq('e diz que restaurou', caiu.restaurado, true);
eq('nenhum lote foi dado como revertido', (caiu.revertidos ?? []).length, 0);
// A importação cria a linha do lote ANTES de gravar as linhas dela. O pedaço
// que não terminou tem de sair; senão sobra um segundo lote `importado` e o
// sistema passa a ter dois históricos no ar.
eq('e o lote pela metade foi descartado', caiu.loteParcialDescartado, 1);

console.log('\n=== 3. o histórico antigo voltou INTEIRO ===');
const depoisDaQueda = await retratoDoHistorico(db);
eq('as duas vendas continuam lá', depoisDaQueda.vendas, retratoA.vendas);
eq('as duas linhas continuam lá', depoisDaQueda.linhas, retratoA.linhas);
eq('o faturamento é o mesmo', depoisDaQueda.faturamento, retratoA.faturamento);
eq('as clientes continuam lá', depoisDaQueda.clientes, retratoA.clientes);
eq('um único lote no ar', lotesNoAr(), 1);
eq('e ele é o lote A, de volta ao ar',
  sq.prepare("SELECT status FROM vendas_historico_lotes WHERE id=1").get().status, 'importado');
eq('sem marca de revertido',
  sq.prepare('SELECT revertido_em FROM vendas_historico_lotes WHERE id=1').get().revertido_em, null);
eq('a fila de revisão voltou',
  conta("SELECT COUNT(*) AS n FROM clientes_vinculo_revisao WHERE status='pendente'"), 1);
eq('e a Ana continua com o mesmo id', idDe('Ana Ribeiro'), idAnaAntes);

console.log('\n=== 4. a troca boa continua funcionando ===');
const trocou = await substituirHistorico(db, { arquivo: 'B.xlsx', linhas: PLANILHA_B });
eq('trocou', trocou.ok, true);
eq('nenhuma limpeza ficou pendente', trocou.limpezaPendente, undefined);
const retratoB = await retratoDoHistorico(db);
eq('três vendas agora', retratoB.vendas, 3);
eq('três linhas', retratoB.linhas, 3);
eq('um único lote no ar', lotesNoAr(), 1);
eq('e não somou os dois lotes', retratoB.linhas, 3);
eq('o faturamento é o da planilha nova', retratoB.faturamento, 300);
eq('as linhas do lote antigo saíram de verdade',
  conta('SELECT COUNT(*) AS n FROM vendas_historico_itens WHERE lote_id=1'), 0);

console.log('\n=== 5. a cliente das duas planilhas manteve o id ===');
// Antes, a limpeza rodava ANTES da importação, com o banco sem item nenhum:
// a Ana era apagada e recriada com id novo. Uma decisão que apontasse para
// ela ficaria órfã sem ninguém perceber.
eq('a Ana atravessou a troca com o mesmo id', idDe('Ana Ribeiro'), idAnaAntes);
eq('e a Carla, que só existe na B, entrou', typeof idDe('Carla Dias'), 'number');

console.log('\n=== 6. estoque: nada, dos dois lados ===');
eq('a troca não criou movimento nenhum', conta('SELECT COUNT(*) AS n FROM movimentos'), 0);

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — a queda no meio devolve o histórico inteiro.');
