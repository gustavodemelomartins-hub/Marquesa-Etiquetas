/** Fase 5.3e — a razão de crédito da cliente.
 *
 *  A regra existia desde 12/09/2026 e não tinha onde morar: troca com peça
 *  nova mais barata vira CRÉDITO, e o sistema registrava e parava. O risco
 *  desta subfase não é deixar de creditar — é creditar errado, e crédito
 *  errado é dinheiro que a loja passa a dever sem saber.
 *
 *  O que precisa ficar provado:
 *
 *   E1. a troca negativa EMITE crédito na razão, e a troca sai de
 *       `pendente_regra` para `credito_emitido`;
 *
 *   E2. crédito sem dona NÃO EXISTE. Garantia sem `cliente_id` não vira
 *       crédito anônimo nem crédito escolhido pelo nome (§2): vira pendência
 *       anunciada, e a troca fica em `pendente_regra`;
 *
 *   E3. emitir duas vezes a mesma troca grava UMA linha. A idempotência é do
 *       banco — índice único `(tipo, origem, origem_id)` —, não da lógica que
 *       pode falhar num retry depois de timeout;
 *
 *   E4. o saldo é DERIVADO por `SUM`, nunca coluna, e o extrato o explica:
 *       gerado, consumido, estornado, ajustado;
 *
 *   E5. estornar a troca estorna o crédito por CONTRAPARTIDA, nunca `DELETE`
 *       (§28). O saldo volta a zero e as duas linhas continuam no extrato;
 *
 *   E6. o ajuste manual exige motivo e RECUSA deixar o saldo negativo — a
 *       invariante de `/api/credito/conferir` aplicada na escrita;
 *
 *   E7. `conferirCredito` encontra saldo negativo quando ele existe. É a
 *       trava que SQLite não consegue aplicar (não há CHECK agregado), então
 *       ela precisa ser medida, não prometida;
 *
 *   E8. diferença positiva ou zero NÃO gera crédito — seria criar dinheiro do
 *       lado errado da razão.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de fingir que passou.
 *
 *      node src/credito-ledger-test.mjs
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

const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON;');
raw.exec(ler('api/schema.sql'));

let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

/* ── adaptador mínimo do D1 sobre node:sqlite. `run` precisa devolver
   `meta.changes`, que é como o código de produção detecta corrida. */
const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.bind = (...a) => comArgs(a);
  st.first = async function () { return raw.prepare(this.sql).get(...this.args) ?? null; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () {
    const r = raw.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(r.changes ?? 0) } };
  };
  return st;
};
const db = { prepare: preparar };

raw.exec(`
INSERT OR IGNORE INTO categorias (nome, ordem) VALUES ('Anel', 1);
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('100001', 'Anel Solitário', 'Anel', 100.0, 50);
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria'), (2, 'Bruna', 'bruna');
`);

const {
  emitirCreditoDaTroca, estornarCreditoDaTroca, saldoDeCredito,
  conferirCredito, registrarAjuste,
} = await mod('api/src/credito.js');

const linhas = (clienteId) => raw.prepare(
  'SELECT tipo, valor_centavos, origem, origem_id FROM credito_movimentos WHERE cliente_id = ? ORDER BY id',
).all(clienteId);

/* ═════════════════════════ E1/E8 — só a diferença negativa vira crédito */
{
  const nada = await emitirCreditoDaTroca(db, { trocaId: 90, clienteId: 1, diferenca: 25.0 });
  assert.equal(nada.emitido, false);
  assert.equal(nada.motivo, 'DIFERENCA_NAO_NEGATIVA');
  const zero = await emitirCreditoDaTroca(db, { trocaId: 91, clienteId: 1, diferenca: 0 });
  assert.equal(zero.emitido, false);
  assert.equal(linhas(1).length, 0, 'diferença positiva ou zero lançou crédito — dinheiro do lado errado da razão');
  prova('E8: diferença positiva ou zero não gera crédito nenhum');

  const r = await emitirCreditoDaTroca(db, { trocaId: 7, clienteId: 1, diferenca: -30.0 });
  assert.equal(r.emitido, true);
  assert.equal(r.valorCentavos, 3000, 'o crédito é o valor ABSOLUTO da diferença negativa');
  assert.deepEqual(linhas(1).map((l) => [l.tipo, l.valor_centavos, l.origem_id]),
    [['credito', 3000, 'troca:7']]);
  prova('E1: a troca negativa emite crédito em centavos, com a origem nomeada');
}

/* ══════════════════════════════ E3 — a idempotência é do banco, não da lógica */
{
  const de_novo = await emitirCreditoDaTroca(db, { trocaId: 7, clienteId: 1, diferenca: -30.0 });
  assert.equal(de_novo.emitido, true);
  assert.equal(de_novo.jaExistia, true, 'o retry não reconheceu a linha que já existia');
  assert.equal(linhas(1).length, 1, 'o retry duplicou o crédito — o índice único não segurou');
  prova('E3: emitir a mesma troca duas vezes grava UMA linha (índice único)');
}

/* ═══════════════════════════════ E2 — crédito sem dona não existe */
{
  const semDona = await emitirCreditoDaTroca(db, { trocaId: 8, clienteId: null, diferenca: -50.0 });
  assert.equal(semDona.ok, true, 'recusar não é erro de servidor: é o caso previsto pela decisão 4');
  assert.equal(semDona.emitido, false);
  assert.equal(semDona.motivo, 'CLIENTE_NAO_IDENTIFICADA');
  assert.equal(semDona.valorCentavos, 5000, 'o valor precisa ser dito mesmo sem dona, senão a pendência é cega');
  assert.ok(String(semDona.aviso).length > 0);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM credito_movimentos WHERE origem_id = 'troca:8'").get().n, 0);
  prova('E2: garantia sem cliente identificada vira pendência anunciada, não crédito anônimo');

  const fantasma = await emitirCreditoDaTroca(db, { trocaId: 9, clienteId: 999, diferenca: -50.0 });
  assert.equal(fantasma.emitido, false);
  assert.equal(fantasma.motivo, 'CLIENTE_NAO_ENCONTRADA');
  prova('E2: cliente que não existe mais no cadastro também não recebe crédito');
}

/* ════════════════════════════════ E4 — saldo derivado, extrato que explica */
{
  const s = await saldoDeCredito(db, 1);
  assert.equal(s.ok, true);
  assert.equal(s.moeda, 'centavos');
  assert.equal(s.saldoCentavos, 3000);
  assert.equal(s.geradoCentavos, 3000);
  assert.equal(s.consumidoCentavos, 0);
  assert.equal(s.saldoNegativo, false);
  assert.equal(s.extrato.length, 1);
  assert.equal(s.extrato[0].origemId, 'troca:7');
  prova('E4: o saldo é derivado por SUM, e o extrato mostra de onde ele veio');

  /* O saldo NÃO mora em `clientes`: se morasse, seria um número sem história,
     e duas escritas concorrentes perderiam uma (§12.A). */
  const colunas = raw.prepare('SELECT name FROM pragma_table_info(?)').all('clientes').map((c) => c.name);
  assert.ok(!colunas.includes('saldo_credito'),
    'apareceu clientes.saldo_credito — a opção A foi descartada de propósito');
  prova('E4: não existe coluna de saldo em clientes; a razão é a única fonte');
}

/* ════════════════════════════ E5 — estorno é contrapartida, nunca DELETE */
{
  const e = await estornarCreditoDaTroca(db, { trocaId: 7, motivo: 'peça devolvida por engano' });
  assert.equal(e.estornado, true);
  assert.equal(e.valorCentavos, -3000);

  const extrato = linhas(1);
  assert.equal(extrato.length, 2, 'o estorno apagou a linha original — §28 proíbe');
  assert.deepEqual(extrato.map((l) => l.tipo), ['credito', 'estorno']);

  const s = await saldoDeCredito(db, 1);
  assert.equal(s.saldoCentavos, 0, 'o saldo não voltou a zero depois do estorno');
  assert.equal(s.geradoCentavos, 3000, 'o histórico perdeu a emissão — o extrato passou a mentir sobre o passado');
  assert.equal(s.estornadoCentavos, 3000);
  prova('E5: o estorno é contrapartida; saldo volta a zero e as duas linhas ficam');

  const repetido = await estornarCreditoDaTroca(db, { trocaId: 7, motivo: 'de novo' });
  assert.equal(repetido.jaExistia, true);
  assert.equal(linhas(1).length, 2, 'o segundo estorno duplicou a contrapartida');
  prova('E5: estornar duas vezes não desconta duas vezes');

  const semNada = await estornarCreditoDaTroca(db, { trocaId: 12345 });
  assert.equal(semNada.ok, true);
  assert.equal(semNada.estornado, false);
  assert.equal(semNada.motivo, 'SEM_CREDITO_EMITIDO');
  prova('E5: troca que nunca emitiu crédito estorna sem erro — é o caso comum');
}

/* ══════════════════════════════════════════════ E6 — ajuste manual */
{
  const semMotivo = await registrarAjuste(db, { clienteId: 2, valorCentavos: 1000, motivo: '   ' });
  assert.equal(semMotivo.ok, false);
  assert.equal(semMotivo.statusHttp, 400);
  prova('E6: ajuste sem motivo é recusado — é o furo que a razão existe para fechar');

  const zero = await registrarAjuste(db, { clienteId: 2, valorCentavos: 0, motivo: 'nada' });
  assert.equal(zero.ok, false);
  prova('E6: ajuste de zero não é ajuste');

  const negativo = await registrarAjuste(db, { clienteId: 2, valorCentavos: -500, motivo: 'correção' });
  assert.equal(negativo.ok, false);
  assert.equal(negativo.statusHttp, 409);
  assert.equal(negativo.saldoResultanteCentavos, -500);
  assert.equal(linhas(2).length, 0, 'o ajuste que deixaria o saldo negativo foi gravado assim mesmo');
  prova('E6: o ajuste que deixaria o saldo negativo é recusado NA ESCRITA, com o número');

  const ok = await registrarAjuste(db, { clienteId: 2, valorCentavos: 2500, motivo: 'crédito combinado no balcão', origemId: 'ajuste:teste-1' });
  assert.equal(ok.ok, true);
  assert.equal(ok.saldoCentavos, 2500);
  const repetido = await registrarAjuste(db, { clienteId: 2, valorCentavos: 2500, motivo: 'de novo', origemId: 'ajuste:teste-1' });
  assert.equal(repetido.ok, false, 'a mesma chave de ajuste entrou duas vezes');
  assert.equal(repetido.statusHttp, 409);
  prova('E6: ajuste válido credita, e a mesma chave não entra duas vezes');

  const desfaz = await registrarAjuste(db, { clienteId: 2, valorCentavos: -2500, motivo: 'estorno do combinado', origemId: 'ajuste:teste-2' });
  assert.equal(desfaz.ok, true);
  assert.equal(desfaz.saldoCentavos, 0);
  prova('E6: ajuste negativo é permitido enquanto o saldo não fica negativo');
}

/* ═══════════════════════════ E7 — a invariante que o SQLite não aplica */
{
  const limpo = await conferirCredito(db);
  assert.equal(limpo.ok, true);
  assert.deepEqual(limpo.divergentes, []);
  prova('E7: com a razão íntegra, conferir devolve ok e nenhum divergente');

  /* Furo plantado POR FORA das portas — é exatamente o que `/conferir`
     existe para achar: nenhum CHECK agregado o impediria. */
  raw.exec(`INSERT INTO credito_movimentos (cliente_id, tipo, valor_centavos, origem, origem_id, motivo)
            VALUES (2, 'consumo', -700, 'venda', 'venda:999', 'consumo sem saldo, plantado pelo teste')`);
  const sujo = await conferirCredito(db);
  assert.equal(sujo.ok, false, 'saldo negativo passou despercebido — a única trava que existe é esta');
  assert.equal(sujo.divergentes.length, 1);
  assert.equal(sujo.divergentes[0].clienteId, 2);
  assert.equal(sujo.divergentes[0].saldoCentavos, -700);
  prova('E7: saldo negativo escrito por fora das portas é encontrado, com cliente e valor');

  const s = await saldoDeCredito(db, 2);
  assert.equal(s.saldoNegativo, true, 'a projeção da cliente escondeu o saldo negativo');
  prova('E7: a projeção da cliente também anuncia o defeito, sem exigir outra rota');
}

/* ═══════════════════ o CHECK novo da troca existe e aceita só o vocabulário */
{
  const check = raw.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'garantia_trocas'",
  ).get().sql;
  assert.ok(check.includes('credito_emitido'), 'garantia_trocas não aceita credito_emitido');
  assert.ok(check.includes('pendente_regra'),
    'pendente_regra sumiu — ele continua sendo o destino da troca sem cliente identificada');
  prova('E1: o CHECK de diferenca_status ganhou credito_emitido e manteve pendente_regra');
}

console.log(`\n  ${provas} prova(s). 5.3e — razão de crédito fechada.`);
