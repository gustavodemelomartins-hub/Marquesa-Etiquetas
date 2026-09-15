/** Fase 5.3d — o contrato de leitura do FIN-101.
 *
 *  5.3a–5.3c trataram da ESCRITA: um lugar só para dizer "esta venda foi
 *  paga", e uma versão para impedir que duas telas discordem. 5.3d trata da
 *  LEITURA, e o risco aqui é outro: uma leitura que preenche o que não sabe.
 *
 *  O que precisa ficar provado:
 *
 *   D1. o resumo financeiro sai em CENTAVOS INTEIROS (API-VEN-015), e é da
 *       VENDA — aninhado em `financeiro`, com `escopo: 'venda'`, porque esta
 *       rota devolve ITENS e somar a coluna daria o total multiplicado pelo
 *       número de peças;
 *
 *   D2. recebimento NÃO se inventa. `pago = 1` com `valor_recebido` NULL é o
 *       estado real de quase toda venda antiga: a resposta devolve
 *       `valorRecebido: null` e nomeia a lacuna, em vez de escrever
 *       `valorRecebido = valorVenda`. Escrever seria produzir, do lado da
 *       leitura, a mesma contradição que B4 achou no banco;
 *
 *   D3. saldo negativo APARECE. `contas-receber.js` faz `Math.max(0, …)` e
 *       some com a sobra em silêncio (B6); `historico-operacoes.js` recusa e
 *       está certo. Aqui o número sai negativo, marcado `sobra: true`;
 *
 *   D4. o lado histórico usa o status que a planilha já tem
 *       (`paga|nao_paga|parcial|indefinida`), e `valor_total` NULL continua
 *       NULL — a planilha sem valor não vira zero;
 *
 *   D5. `GET /api/contas-receber?status=paga` para de devolver meia resposta
 *       calada: declara a cobertura por fonte e diz que não é completa.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de fingir que passou.
 *
 *      node src/fin-101-5-3d-test.mjs
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
raw.exec(ler('api/schema.sql'));

let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

const preparar = (sql) => {
  const st = { sql, args: [] };
  st.bind = (...a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all });
  st.first = async function () { return raw.prepare(this.sql).get(...this.args) ?? null; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  return st;
};
const db = { prepare: preparar };

/* ── o cenário: cada venda existe para provar UM estado de conhecimento.
   `produtos.cat` é FK de `categorias(nome)`. */
raw.exec(`
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitário',  'Anel',  100.0, 50),
  ('100002', 'Colar Veneziana', 'Colar', 200.0, 50);
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');

-- 1: paga, COM valor registrado — o caso completo
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, valor_recebido)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 100.0, 0, 1, '2026-09-01', 100.0);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (1, '100001', 'Anel Solitário', 1, 100.0);

-- 2: paga, SEM valor registrado — o caso que tenta a leitura a inventar
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, valor_recebido)
  VALUES (2, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-02', 200.0, 0, 1, '2026-09-02', NULL);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (2, '100002', 'Colar Veneziana', 1, 200.0);

-- 3: em aberto, parcial conhecido — 40 de 100 (o estado de B4, agora legível)
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, valor_recebido, vencimento_em)
  VALUES (3, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-03', 100.0, 0, 0, 40.0, '2026-10-03');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (3, '100001', 'Anel Solitário', 1, 100.0);

-- 4: recebeu A MAIS — a sobra que contas-receber esconde com Math.max(0, …)
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, valor_recebido)
  VALUES (4, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-04', 100.0, 0, 1, 130.0);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (4, '100001', 'Anel Solitário', 1, 100.0);

-- 5: DUAS peças na mesma venda — a prova de que somar a coluna dobraria
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, valor_recebido)
  VALUES (5, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-05', 300.0, 0, 0, NULL);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES
  (5, '100001', 'Anel Solitário', 1, 100.0),
  (5, '100002', 'Colar Veneziana', 1, 200.0);

-- histórico: um com valor e status, outro SEM valor nenhum
INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash, status)
  VALUES (1, 'planilha.xlsx', 'hash-1', 'importado');
INSERT INTO vendas_historicas (id, lote_id, chave, regra, cliente_nome, cliente_nome_norm, data,
                               canal, valor_total, valor_pago, status)
  VALUES (10, 1, 'vitoria|2026-08-01', 'teste', 'Vitoria', 'vitoria', '2026-08-01', 'Site', 150.0, 60.0, 'parcial'),
         (11, 1, 'vitoria|2026-08-02', 'teste', 'Vitoria', 'vitoria', '2026-08-02', 'Maleta', NULL, 0.0, 'indefinida');
INSERT INTO vendas_historico_itens
  (id, lote_id, origem_linha, data, cliente_nome_original, cliente_nome_norm, sku, sku_base,
   nome_produto_historico, qtd, valor_total, canal, pago, pedido_chave, venda_historica_id)
  VALUES
  (100, 1, '1', '2026-08-01', 'Vitoria', 'vitoria', '100001', '100001', 'Anel',  1, 150.0, 'Site',   0, 'vitoria|2026-08-01', 10),
  (101, 1, '2', '2026-08-02', 'Vitoria', 'vitoria', '100002', '100002', 'Colar', 1, NULL,  'Maleta', 0, 'vitoria|2026-08-02', 11);
`);

const { listarVendasUnificado } = await mod('api/src/analytics.js');

const FAIXA = { de: '2026-08-01', ate: '2026-09-30', limite: 100 };
const { itens } = await listarVendasUnificado(db, FAIXA);
const daVenda = (id) => itens.filter((i) => i.fonte === 'operacional' && i.venda_id === id);
const umaVenda = (id) => daVenda(id)[0].financeiro;
const daLinha = (id) => itens.find((i) => i.fonte === 'historico' && i.id === id).financeiro;

/* ════════════════════════════ D1 — centavos inteiros, e o escopo é a VENDA */
{
  const f = umaVenda(1);
  assert.equal(f.moeda, 'centavos');
  assert.equal(f.escopo, 'venda');
  assert.equal(f.valorVenda, 10000);
  assert.equal(f.valorRecebido, 10000);
  assert.equal(f.valorAReceber, 0);
  assert.equal(f.statusPagamento, 'paga');
  assert.ok(Number.isInteger(f.valorVenda) && Number.isInteger(f.valorRecebido),
    'centavos precisam ser inteiros — REAL aqui reabre o 0.1+0.2 de §7');
  prova('D1: o resumo sai em centavos inteiros, com os quatro campos de API-VEN-015');

  const linhas = daVenda(5);
  assert.equal(linhas.length, 2, 'a venda 5 deveria aparecer em duas linhas');
  assert.deepEqual(linhas.map((l) => l.financeiro.valorVenda), [30000, 30000]);
  const somaDasLinhas = linhas.reduce((s, l) => s + l.financeiro.valorVenda, 0);
  assert.equal(somaDasLinhas, 60000);
  assert.equal(linhas[0].financeiro.escopo, 'venda',
    'sem escopo declarado, esses 60000 passariam por faturamento da venda');
  prova('D1: o valor é da venda, repetido por linha — e o escopo diz isso em palavras');
}

/* ══════════════════════════════════ D2 — recebimento não se inventa */
{
  const f = umaVenda(2);
  assert.equal(f.statusPagamento, 'paga', 'pago=1 é o fato escrito e continua sendo lido');
  assert.equal(f.valorRecebido, null,
    'a leitura inventou o recebimento: pago=1 NÃO autoriza valorRecebido = valorVenda');
  assert.equal(f.valorAReceber, null, 'sem recebido conhecido não existe saldo conhecido');
  assert.deepEqual(f.indeterminado, ['valorRecebido']);
  prova('D2: paga sem valor registrado devolve null e NOMEIA a lacuna');

  const parcial = umaVenda(3);
  assert.equal(parcial.valorRecebido, 4000);
  assert.equal(parcial.valorAReceber, 6000);
  assert.equal(parcial.statusPagamento, 'parcial');
  prova('D2: parcial conhecido (40 de 100) é legível, e o saldo é derivado dos dois');

  const semNada = umaVenda(5);
  assert.equal(semNada.valorRecebido, null);
  assert.equal(semNada.statusPagamento, 'nao_paga',
    'sem recebimento registrado, o derivado é conservador: nao_paga, nunca parcial');
  prova('D2: sem recebimento registrado o status não afirma parcial');
}

/* ══════════════════════════════════════════ D3 — a sobra aparece */
{
  const f = umaVenda(4);
  assert.equal(f.valorVenda, 10000);
  assert.equal(f.valorRecebido, 13000);
  assert.equal(f.valorAReceber, -3000, 'a sobra virou zero — é o Math.max(0, …) de B6 de novo');
  assert.equal(f.sobra, true);
  prova('D3: quem recebeu a mais aparece com saldo negativo e marcado, não zerado');
}

/* ═══════════════════════════ D4 — o histórico usa o status que já tem */
{
  const comValor = daLinha(100);
  assert.equal(comValor.valorVenda, 15000);
  assert.equal(comValor.valorRecebido, 6000);
  assert.equal(comValor.valorAReceber, 9000);
  assert.equal(comValor.statusPagamento, 'parcial',
    'o status do histórico não é derivado: vendas_historicas.status já é autoridade');
  prova('D4: o lado histórico entrega o status da planilha, sem recalcular');

  const semValor = daLinha(101);
  assert.equal(semValor.valorVenda, null, 'valor_total NULL virou zero — planilha sem valor não é venda de R$ 0');
  assert.equal(semValor.valorAReceber, null);
  assert.equal(semValor.statusPagamento, 'indefinida');
  assert.deepEqual(semValor.indeterminado, ['valorVenda']);
  prova('D4: planilha sem valor continua indeterminada, e diz qual campo falta');
}

/* ══════════════════════ D5 — status=paga declara a cobertura em vez de calar */
{
  const { contasAReceber } = await mod('api/src/contas-receber.js');

  const abertas = await contasAReceber(db, { status: 'aberta' });
  assert.equal(abertas.ok, true);
  assert.equal(abertas.cobertura.completa, true);
  assert.equal(abertas.cobertura.fontes.venda, 'incluida');
  assert.equal(abertas.cobertura.fontes.troca, 'incluida');
  prova('D5: status=aberta declara cobertura completa das três fontes');

  const pagas = await contasAReceber(db, { status: 'paga' });
  assert.equal(pagas.ok, true, 'quebrar o chamador não era o objetivo: a resposta continua válida');
  assert.equal(pagas.cobertura.completa, false,
    'status=paga voltou a se apresentar como resposta completa — é a meia resposta calada de novo');
  assert.equal(pagas.cobertura.fontes.historico, 'incluida');
  assert.equal(pagas.cobertura.fontes.venda, 'nao_representavel');
  assert.equal(pagas.cobertura.fontes.troca, 'nao_representavel');
  assert.ok(String(pagas.cobertura.porque).length > 0, 'recusar completude sem dizer por quê não é recusa explícita');
  prova('D5: status=paga recusa a alegação de completude, por escrito e em campo próprio');
}

console.log(`\n  ${provas} prova(s). 5.3d fechada.`);
