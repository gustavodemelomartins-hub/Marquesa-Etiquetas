/** FIN-101 / Fase 5.3 — teste de CARACTERIZAÇÃO da auditoria financeira.
 *
 *  Não corrige nada. Prova, com o código de hoje rodando, os defeitos que a
 *  auditoria de 5.3 encontrou por leitura — para que a correção tenha de
 *  passar por aqui e dizer o que mudou.
 *
 *  ── o que ainda está aqui, e para qual subfase vai
 *
 *    D2 — `POST /api/vendas/:id/pagamento` não fecha o lado da garantia.
 *         `receberConta` fecha `vendas` e `garantia_trocas` no mesmo batch,
 *         com o comentário dizendo por quê. `registrarPagamentoVenda` — a
 *         outra porta, que o legado chama no perfil da cliente pelo botão
 *         "NÃO PAGO" (dashboard.tpl.html:10680) — fecha só a venda. A
 *         diferença fica `a_receber` para sempre na linha do tempo do caso.
 *         → 5.3b, porta financeira única.
 *
 *    D3 — quitar apaga o recebimento parcial, e as duas portas deixam o
 *         banco em estados diferentes depois da MESMA quitação.
 *         → 5.3b, porta financeira única.
 *
 *  ── o que SAIU daqui porque foi corrigido
 *
 *    B1 (dupla contagem da diferença de troca na série mensal) e B5
 *    (desfazer o pagamento ressuscitava a cobrança) foram corrigidos em
 *    5.3a. As provas deles deixaram de ser retrato de defeito e viraram
 *    rede de regressão, em `src/fin-101-5-3a-test.mjs`. Um defeito
 *    consertado não fica caracterizado em lugar nenhum: ou ele é regra
 *    testada, ou não é nada.
 *
 *      node src/fin-101-caracterizacao-test.mjs
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
const caracteriza = (t) => {
  provas += 1;
  console.log(`  ~~   ${t}   [CARACTERIZAÇÃO — defeito de hoje]`);
};

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

/* O estado exato que `registrarVendaDaTroca` deixa no banco: uma venda
   `origem='troca'` cujo total é a DIFERENÇA, e a linha de `garantia_trocas`
   apontando para ela. Nada aqui é inventado — os valores e as colunas são
   os que `api/src/garantias.js` escreve. */
const SEED = `
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitario', 'Anel', 100.0, 49),
  ('100002', 'Anel Maior',     'Anel', 110.0, 49);
INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES
  ('100001', 'entrada', 50, 'importacao', 'carga'),
  ('100002', 'entrada', 50, 'importacao', 'carga'),
  ('100001', 'venda',   -1, 'venda',      'venda 1'),
  ('100002', 'troca',   -1, 'troca_garantia', 'troca da garantia 1');
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');

INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, pagamento_origem, cobravel)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 100.0, 0, 1,
          '2026-09-01', 'informado', 0);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
  VALUES (1, '100001', 'Anel Solitario', 1, 100.0, 'a0000000-0000-4000-8000-000000000001');

INSERT INTO garantias (id, origem_fonte, venda_id, sku, cliente_id, cliente_nome,
                       cliente_nome_norm, data_venda, data_entrada, motivo,
                       status, valor_pago_original)
  VALUES (1, 'operacional', 1, '100001', 1, 'Vitoria', 'vitoria', '2026-09-01',
          '2026-09-05', 'pedra solta', 'sem_conserto', 100.0);

INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, cobravel, nuvemshop_status)
  VALUES (2, 1, 'Vitoria', 'vitoria', 'troca', '2026-09-05', 10.0, 0, 0, 1, 'nao_aplicavel');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, motivo, preco_tabela, desconto_valor, id)
  VALUES (2, '100002', 'Anel Maior', 1, 10.0, 'troca', 110.0, 100.0,
          'a0000000-0000-4000-8000-000000000002');

INSERT INTO garantia_trocas (id, garantia_id, data, sku_novo, produto_novo_nome,
                             valor_original, valor_novo, diferenca, diferenca_status, venda_id)
  VALUES (1, 1, '2026-09-05', '100002', 'Anel Maior', 100.0, 110.0, 10.0, 'a_receber', 2);
`;

function banco() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  return raw;
}

const { contasAReceber, receberConta } = await mod('api/src/contas-receber.js');
const { registrarPagamentoVenda } = await mod('api/src/vendas-comandos.js');
const { visaoGeral, evolucao } = await mod('api/src/analytics.js');


/* ═════════════ D2 — /api/vendas/:id/pagamento nao fecha o lado da garantia */
{
  const raw = banco();
  const db = adaptador(raw);

  /* A MESMA conta, pela outra porta — a que o legado chama no perfil da
     cliente (dashboard.tpl.html:10680) para qualquer venda operacional. */
  const resposta = await registrarPagamentoVenda(db, 2, { dataPagamento: '2026-09-10' });
  assert.equal(resposta.status, 200);

  const venda = raw.prepare('SELECT pago FROM vendas WHERE id = 2').get();
  assert.equal(venda.pago, 1, 'a venda fechou');

  const troca = raw.prepare(
    'SELECT diferenca_status, diferenca_paga_em FROM garantia_trocas WHERE id = 1').get();
  assert.equal(troca.diferenca_status, 'a_receber',
    'DEFEITO: a diferenca continua a receber no caso, com a venda ja paga');
  assert.equal(troca.diferenca_paga_em, null);
  caracteriza('registrarPagamentoVenda deixa garantia_trocas em a_receber — as duas portas discordam');

  raw.close();

  /* E o que a MESMA escrita faz pelo caminho de §37, para comparacao. */
  const outro = banco();
  const db2 = adaptador(outro);
  await receberConta(db2, { chave: 'venda:2', confirmar: true, pagaEm: '2026-09-10' });
  const t2 = outro.prepare('SELECT diferenca_status FROM garantia_trocas WHERE id = 1').get();
  assert.equal(t2.diferenca_status, 'paga', 'receberConta fecha as duas linhas no mesmo batch');
  outro.close();
}

/* ═══ D3 — quitar apaga o recebimento parcial que a loja tinha informado */
{
  const raw = banco();
  const db = adaptador(raw);

  /* O único produtor de PARCIAL hoje: `pagamentoDoPedido` com
     `payment_status = 'partially_paid'` e valor conhecido (sync.js:374). */
  raw.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data,
                                total, cancelada, pago, cobravel, valor_recebido,
                                pagamento_origem, externo_id)
            VALUES (3, 1, 'Vitoria', 'vitoria', 'site', '2026-09-02', 100.0, 0, 0, 1, 40.0,
                    'nuvemshop_parcial', 'nuvemshop:777')`);

  const aberta = await contasAReceber(db, {});
  const conta = aberta.contas.find((c) => c.chave === 'venda:3');
  assert.equal(conta.valorRecebido, 40, 'o A Receber cobra so o saldo');
  assert.equal(conta.valorReceber, 60);

  await registrarPagamentoVenda(db, 3, { dataPagamento: '2026-09-10' });
  const v = raw.prepare('SELECT pago, valor_recebido, pagamento_origem FROM vendas WHERE id = 3').get();
  assert.equal(v.pago, 1);
  assert.equal(v.valor_recebido, null,
    'DEFEITO: os 40 que a loja informou somem — nao ha registro de que houve parcial');
  assert.equal(v.pagamento_origem, 'informado', 'e o carimbo da loja e sobrescrito');
  caracteriza('quitar apaga o parcial: `valor_recebido = NULL` destroi o unico recebimento estruturado');

  /* A outra porta grava OUTRO estado para o mesmo fato. */
  const outro = banco();
  const db2 = adaptador(outro);
  outro.exec(`INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data,
                                  total, cancelada, pago, cobravel, valor_recebido,
                                  pagamento_origem, externo_id)
              VALUES (3, 1, 'Vitoria', 'vitoria', 'site', '2026-09-02', 100.0, 0, 0, 1, 40.0,
                      'nuvemshop_parcial', 'nuvemshop:777')`);
  await receberConta(db2, { chave: 'venda:3', confirmar: true, pagaEm: '2026-09-10' });
  const v2 = outro.prepare('SELECT pago, valor_recebido FROM vendas WHERE id = 3').get();
  assert.equal(v2.pago, 1);
  assert.equal(v2.valor_recebido, 40,
    'DEFEITO: receberConta preserva os 40 — e `pago = 1` com `valor_recebido = 40` diz duas coisas diferentes');
  caracteriza('as duas portas deixam o banco em estados diferentes depois da MESMA quitacao');
  outro.close();

  raw.close();
}


console.log(`\n  ${provas} defeito(s) caracterizado(s). Nada foi corrigido — isto e a rede.`);
