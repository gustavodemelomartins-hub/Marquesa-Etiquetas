/** Fase 5.3f — a rede que impede a regressão de 5.3.
 *
 *  §9 listou dez gaps de teste. Sete já caíram como efeito colateral das
 *  subfases anteriores, e é importante dizer ONDE, para ninguém reescrevê-los:
 *
 *    G1  KPI × série mensal                    `fin-101-5-3a-test.mjs`
 *    G2  estado do banco pelas duas portas     `fin-101-5-3b-test.mjs`
 *    G3  venda PARCIAL sendo quitada           `fin-101-5-3b-test.mjs`
 *    G4  `pago:false` sobre `cobravel = 0`     `fin-101-5-3a-test.mjs`
 *    G5  `versaoEsperada` nas três fontes      `fin-101-5-3c-test.mjs`
 *    G6  `status=paga` diz que é parcial       `fin-101-5-3d-test.mjs`
 *    G8  idempotência das três portas          `fin-101-5-3b-test.mjs`
 *
 *  Sobraram três, e são estes que este arquivo fecha:
 *
 *   G7. ARREDONDAMENTO. Dinheiro ainda mora em REAL (a conversão é 5.7), e
 *       `0.1 + 0.2 !== 0.3` em ponto flutuante. O risco não é teórico: em 5.8
 *       `PAGO` deixa de ser escrito e passa a ser COMPARADO, e nesse dia uma
 *       venda pode ficar eternamente parcial por um centavo que não existe.
 *
 *   G9. A conta de uma venda `cliente_ambiguo = 1`. A cobrança EXISTE —
 *       alguém levou a peça — e não tem dona, porque §2 proíbe escolher entre
 *       homônimas pelo nome. Ela precisa aparecer na lista e NÃO oferecer um
 *       vínculo que não existe.
 *
 *  G10. A razão contábil do dinheiro: `GET /api/financeiro/conferir`. O gap
 *       estrutural — estoque tem uma invariante executável, recebíveis não
 *       tinham nenhuma.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de fingir que passou.
 *
 *      node src/fin-101-5-3f-test.mjs
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

function banco() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(`
INSERT OR IGNORE INTO categorias (nome, ordem) VALUES ('Anel', 1);
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('100001', 'Anel', 'Anel', 100.0, 500);
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria'), (2, 'Bruna', 'bruna');
`);
  return raw;
}
const adaptador = (raw) => ({
  prepare(sql) {
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
  },
});

const CR = await mod('api/src/contas-receber.js');
const FIN = await mod('api/src/financeiro-conferir.js');

const conta = (r, chave) => (r.contas ?? []).find((c) => c.chave === chave);
const checagem = (r, id) => r.checagens.find((c) => c.id === id);

/* ══════════════════════════════════════════ G7 — arredondamento não mente */
console.log('\n=== G7. arredondamento ===');
{
  const raw = banco(); const db = adaptador(raw);

  /* O caso canônico do ponto flutuante: 0,10 + 0,20 recebidos contra 0,30
     devidos. Em REAL puro, `0.1 + 0.2 >= 0.3` é FALSE, e a venda ficaria
     devendo para sempre um centavo que não existe. */
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, valor_recebido)
            VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 0.30, 0, 0.30)`);
  const r = await CR.contasAReceber(db, { status: 'aberta' });
  const c = conta(r, 'venda:1');
  assert.ok(c, 'a venda de 0,30 sumiu da lista');
  assert.equal(c.valorReceber, 0,
    'sobrou saldo numa venda totalmente recebida — é o 0.1 + 0.2 !== 0.3 chegando ao dinheiro');
  prova('G7: 0,30 recebido contra 0,30 devido não deixa resto de ponto flutuante');

  /* O saldo parcial também tem que fechar no centavo, e não em 0,009999… */
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, valor_recebido)
            VALUES (2, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-02', 100.10, 0, 33.37)`);
  const r2 = await CR.contasAReceber(db, { status: 'aberta' });
  assert.equal(conta(r2, 'venda:2').valorReceber, 66.73);
  prova('G7: o saldo parcial fecha no centavo exato, sem cauda decimal');
}
{
  /* Cem contas de um centavo. Somadas em ponto flutuante uma a uma, elas
     derivam; o resumo precisa bater no centavo com a soma das linhas. */
  const raw = banco(); const db = adaptador(raw);
  const N = 137;
  for (let i = 1; i <= N; i += 1) {
    raw.prepare(
      `INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago)
       VALUES (?, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 0.01, 0)`,
    ).run(i);
  }
  const r = await CR.contasAReceber(db, { status: 'aberta' });
  assert.equal(r.resumo.quantidade, N);
  assert.equal(r.resumo.totalCentavos, N,
    `${N} contas de 1 centavo não somaram ${N} centavos — a soma derivou em ponto flutuante`);
  assert.equal(r.resumo.total, Number((N / 100).toFixed(2)));
  const soma = (r.contas ?? []).reduce((s, c) => s + c.valorReceber, 0);
  assert.equal(Math.round(soma * 100), r.resumo.totalCentavos,
    'o resumo e a soma das linhas discordam — quem confere a tela vai achar que faltou dinheiro');
  prova(`G7: ${N} contas de 1 centavo somam exatamente ${N} centavos, e o resumo bate com as linhas`);
}
{
  /* Recebido MAIOR que o total. Hoje a lista devolve saldo zero por
     `Math.max(0, …)`, e isso é decisão registrada — o que 5.3f garante é que
     a sobra não fique invisível no sistema inteiro: G10 a encontra. */
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, valor_recebido)
            VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 100.00, 0, 130.00)`);
  const r = await CR.contasAReceber(db, { status: 'aberta' });
  assert.equal(conta(r, 'venda:1').valorReceber, 0, 'apareceu saldo NEGATIVO na lista de cobrança');
  const f = await FIN.conferirFinanceiro(db);
  const sobra = checagem(f, 'venda_recebido_maior_que_total');
  assert.equal(sobra.divergentes.length, 1, 'a sobra de 30 reais não foi encontrada por ninguém');
  assert.equal(sobra.divergentes[0].sobraCentavos, 3000);
  prova('G7/B6: a lista zera a sobra, e a conferência a ENCONTRA — ela não desaparece do sistema');
}

/* ══════════════════════════════ G9 — a conta sem dona, que existe mesmo assim */
console.log('\n=== G9. cliente ambíguo ===');
{
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, cliente_ambiguo)
            VALUES (1, NULL, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 250.00, 0, 1)`);
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, cliente_ambiguo)
            VALUES (2, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-02', 100.00, 0, 0)`);

  const r = await CR.contasAReceber(db, { status: 'aberta' });
  const ambigua = conta(r, 'venda:1');
  assert.ok(ambigua, 'a conta da venda ambígua sumiu: alguém levou a peça e a dívida existe');
  assert.equal(ambigua.valorReceber, 250);
  prova('G9: a cobrança de uma venda sem dona CONTINUA na lista — a dívida existe');

  assert.equal(ambigua.clienteAmbiguo, true, 'a lista não avisa que a dona é indeterminada');
  assert.equal(ambigua.clienteId, null,
    '§2: apontar um cliente_id numa venda ambígua é escolher entre homônimas pelo nome');
  assert.equal(ambigua.clienteNorm, null, 'o norm navegaria para uma ficha que pode ser da pessoa errada');
  assert.ok(ambigua.cliente, 'o nome escrito na venda continua visível — ele é o que se sabe');
  prova('G9: ela é marcada ambígua e NÃO oferece vínculo — nome aparece, ficha não');

  const normal = conta(r, 'venda:2');
  assert.equal(normal.clienteAmbiguo, false);
  assert.equal(normal.clienteId, 1, 'a venda não-ambígua perdeu o vínculo que tinha');
  prova('G9: e a venda de dona conhecida continua navegando normalmente');

  assert.equal(r.resumo.totalCentavos, 35000,
    'a conta ambígua saiu do total: dívida sem dona continua sendo dívida');
  prova('G9: a conta sem dona entra no total — não ter ficha não a torna menos real');
}

/* ═════════════════════════════ G10 — a razão contábil do dinheiro */
console.log('\n=== G10. a invariante executável do dinheiro ===');
{
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, valor_recebido, data_pagamento)
            VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 100.00, 1, 100.00, '2026-09-01')`);
  const limpo = await FIN.conferirFinanceiro(db);
  assert.equal(limpo.ok, true, 'um banco sem defeito acusou defeito — a régua grita à toa');
  assert.equal(limpo.total, 0);
  assert.ok(limpo.checagens.length >= 6, 'a conferência encolheu: verificação some sem ninguém ver');
  /* Todas as verificações voltam, inclusive as limpas: "nada apareceu" tem de
     ser distinguível de "nada foi olhado". */
  assert.ok(limpo.checagens.every((c) => Array.isArray(c.divergentes)));
  assert.ok(limpo.checagens.every((c) => c.origem && c.invariante));
  prova('G10: banco íntegro devolve ok, com TODAS as verificações listadas e rastreadas');
}
{
  const raw = banco(); const db = adaptador(raw);

  /* B4 — a venda afirma duas coisas incompatíveis. */
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, valor_recebido, data_pagamento)
            VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 100.00, 1, 40.00, '2026-09-01')`);
  /* §28/B5 — cancelada e cobrável ao mesmo tempo. */
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, cancelada, cobravel)
            VALUES (2, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-02', 250.00, 0, 1, 1)`);
  /* 5.3e — saldo de crédito negativo, plantado por fora das portas. */
  raw.exec(`INSERT INTO credito_movimentos (cliente_id, tipo, valor_centavos, origem, origem_id, motivo)
            VALUES (2, 'consumo', -500, 'venda', 'venda:77', 'consumo sem saldo, plantado')`);

  const f = await FIN.conferirFinanceiro(db);
  assert.equal(f.ok, false, 'três defeitos de dinheiro passaram como banco íntegro');
  assert.equal(f.total, 3);

  const b4 = checagem(f, 'venda_paga_com_recebido_menor');
  assert.equal(b4.divergentes.length, 1);
  assert.equal(b4.divergentes[0].vendaId, 1);
  assert.equal(b4.divergentes[0].faltamCentavos, 6000,
    'a conferência achou o defeito e não disse QUANTO falta — sem o valor, ninguém decide');
  assert.equal(b4.origem, 'B4');
  prova('G10: B4 é encontrado, com a venda e o valor que falta');

  const b5 = checagem(f, 'venda_cancelada_ainda_cobravel');
  assert.equal(b5.divergentes.length, 1);
  assert.equal(b5.divergentes[0].vendaId, 2);
  prova('G10: venda cancelada que continuou cobrável é encontrada (§28/B5)');

  const cred = checagem(f, 'credito_saldo_negativo');
  assert.equal(cred.divergentes.length, 1);
  assert.equal(cred.divergentes[0].saldoCentavos, -500);
  prova('G10: o saldo de crédito negativo aparece no MESMO painel — uma pergunta, uma resposta');

  /* A conferência MEDE. Se ela consertasse, estaria decidindo quem pagou
     quanto e quando — e é justamente isso que nenhum script decide sozinho
     sem inventar dinheiro. */
  const depois = raw.prepare('SELECT pago, valor_recebido, cobravel FROM vendas WHERE id = 1').get();
  assert.equal(depois.pago, 1);
  assert.equal(depois.valor_recebido, 40.0);
  const c2 = raw.prepare('SELECT cobravel FROM vendas WHERE id = 2').get();
  assert.equal(c2.cobravel, 1, 'a conferência CONSERTOU um registro — ela só pode medir');
  prova('G10: conferir não escreve nada; quem decide o conserto é humano');
}
{
  /* A dessincronia que 5.3b existe para impedir: a venda da diferença foi
     paga e a troca continua `a_receber`. Só chega aqui quem escreveu fora do
     núcleo único — e é exatamente por isso que precisa ser visível. */
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, valor_recebido, data_pagamento)
            VALUES (1, 1, 'Vitoria', 'vitoria', 'troca', '2026-09-01', 30.00, 1, 30.00, '2026-09-05')`);
  raw.exec(`INSERT INTO garantias (origem_fonte, venda_id, sku, cliente_id, cliente_nome, motivo, data_entrada, status)
            VALUES ('operacional', 1, '100001', 1, 'Vitoria', 'x', '2026-09-01', 'sem_conserto')`);
  raw.exec(`INSERT INTO garantia_trocas (garantia_id, data, sku_novo, valor_original, valor_novo, diferenca, diferenca_status, venda_id)
            VALUES (1, '2026-09-02', '100001', 100.0, 130.0, 30.0, 'a_receber', 1)`);

  const f = await FIN.conferirFinanceiro(db);
  const d = checagem(f, 'troca_a_receber_com_venda_paga');
  assert.equal(d.divergentes.length, 1, 'o dinheiro entrou por uma ponta e a outra não soube, e ninguém viu');
  assert.equal(d.divergentes[0].vendaId, 1);
  assert.equal(d.divergentes[0].diferencaCentavos, 3000);
  assert.equal(d.divergentes[0].vendaPagaEm, '2026-09-05');
  prova('G10: troca a_receber cuja venda já foi paga é encontrada, com a data do pagamento');
}
{
  /* Tolerância: meio centavo de REAL não é defeito, e uma verificação que
     grita à toa é desligada pela primeira pessoa que a vê. */
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, valor_recebido, data_pagamento)
            VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 0.30, 1, 0.1, '2026-09-01')`);
  raw.exec(`UPDATE vendas SET valor_recebido = 0.1 + 0.2 WHERE id = 1`);
  const f = await FIN.conferirFinanceiro(db);
  assert.equal(checagem(f, 'venda_paga_com_recebido_menor').divergentes.length, 0,
    'a cauda de ponto flutuante virou defeito: a régua grita à toa e acaba desligada');
  assert.equal(f.ok, true);
  prova('G7+G10: 0,1 + 0,2 pagando 0,30 não é acusado como pagamento incompleto');
}

console.log(`\n  ${provas} prova(s). 5.3f — G7, G9 e G10 fechados.`);
