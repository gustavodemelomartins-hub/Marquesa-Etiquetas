/** `GET /api/vendas/lista` — a listagem unificada, contra o schema real.
 *
 *  A rota junta duas populações numa resposta só: a venda do sistema e a
 *  linha da planilha importada. Ela não tinha nenhum teste, e foi justamente
 *  onde a auditoria da Fase 5 achou três defeitos de leitura. Nenhum deles
 *  moveu dinheiro ou peça — todos faziam a resposta dizer algo que o banco
 *  não dizia, que é o tipo de defeito que uma tela nova herdaria inteiro.
 *
 *  O que precisa ficar provado:
 *
 *   A4. `pago` é o estado REAL da venda. Era a constante 1 no lado
 *       operacional: uma venda de balcão lançada A Receber saía daqui como
 *       paga, contradizendo `vendas.pago` e contradizendo a própria lista de
 *       contas a receber, que via a mesma venda em aberto;
 *
 *   A5. a venda cancelada continua no histórico, marcada — e agora pode ser
 *       excluída por `canceladas=nao`. §28 tira a cancelada dos AGREGADOS,
 *       não do histórico; sem a porta de saída, quem somasse esta lista
 *       somaria o que a regra manda não contar;
 *
 *   A6. `canal` carregava dois vocabulários na mesma coluna — `vendas.origem`
 *       (`balcao|acerto|site`) de um lado, o texto da planilha (`Site`,
 *       `Instagram`, `Maleta`…) do outro. `?canal=site` achava metade da
 *       resposta e parecia completa. Agora existe `origem`, o vocabulário
 *       comum, preenchido SÓ onde a correspondência é mecânica. O que não
 *       tem equivalente fica NULL: decidir a taxonomia é VEN-Q013, e é de
 *       produto, não daqui.
 *
 *  E a garantia que atravessa tudo: esta rota LÊ. Nenhum movimento, nenhum
 *  saldo, nenhuma venda muda por consultá-la.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de fingir que passou.
 *
 *      node src/vendas-lista-test.mjs
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

/* ── adaptador mínimo do D1 sobre node:sqlite */
const preparar = (sql) => {
  const st = { sql, args: [] };
  st.bind = (...a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all });
  st.first = async function () { return raw.prepare(this.sql).get(...this.args) ?? null; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  return st;
};
const db = { prepare: preparar };

/* ── o cenário mínimo que expõe os três defeitos de uma vez.
   `produtos.cat` é FK de `categorias(nome)`, não do id: 'Anel', não 'anel'. */
raw.exec(`
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitário',  'Anel',  100.0, 50),
  ('100002', 'Colar Veneziana', 'Colar', 200.0, 50);
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');

-- balcão, PAGA
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 100.0, 0, 1, '2026-09-01');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (1, '100001', 'Anel Solitário', 1, 100.0);

-- balcão, A RECEBER: é esta que a rota chamava de paga
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento, vencimento_em)
  VALUES (2, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-02', 200.0, 0, 0, NULL, '2026-10-02');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (2, '100002', 'Colar Veneziana', 1, 200.0);

-- CANCELADA
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento)
  VALUES (3, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-03', 100.0, 1, 1, '2026-09-03');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (3, '100001', 'Anel Solitário', 1, 100.0);

-- site: o único canal que as duas populações nomeiam igual
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total,
                    cancelada, pago, data_pagamento)
  VALUES (4, 1, 'Vitoria', 'vitoria', 'site', '2026-09-04', 200.0, 0, 1, '2026-09-04');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES (4, '100002', 'Colar Veneziana', 1, 200.0);

-- histórico importado
INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash, status)
  VALUES (1, 'planilha.xlsx', 'hash-1', 'importado');
INSERT INTO vendas_historicas (id, lote_id, chave, regra, cliente_nome, cliente_nome_norm, data, canal)
  VALUES (10, 1, 'vitoria|2026-08-01', 'teste', 'Vitoria', 'vitoria', '2026-08-01', 'Site'),
         (11, 1, 'vitoria|2026-08-02', 'teste', 'Vitoria', 'vitoria', '2026-08-02', 'Instagram'),
         (12, 1, 'vitoria|2026-08-03', 'teste', 'Vitoria', 'vitoria', '2026-08-03', 'Maleta');
INSERT INTO vendas_historico_itens
  (id, lote_id, origem_linha, data, cliente_nome_original, cliente_nome_norm, sku, sku_base,
   nome_produto_historico, qtd, valor_total, canal, pago, pedido_chave, venda_historica_id)
  VALUES
  (100, 1, '1', '2026-08-01', 'Vitoria', 'vitoria', '100001', '100001', 'Anel',  1, 100.0, 'Site',      1, 'vitoria|2026-08-01', 10),
  (101, 1, '2', '2026-08-02', 'Vitoria', 'vitoria', '100002', '100002', 'Colar', 1, 200.0, 'Instagram', 0, 'vitoria|2026-08-02', 11),
  (102, 1, '3', '2026-08-03', 'Vitoria', 'vitoria', '100001', '100001', 'Anel',  1, 100.0, 'Maleta',    1, 'vitoria|2026-08-03', 12);
`);

const { listarVendasUnificado } = await mod('api/src/analytics.js');

const FAIXA = { de: '2026-08-01', ate: '2026-09-30', limite: 100 };
const listar = (extra = {}) => listarVendasUnificado(db, { ...FAIXA, ...extra });
const porVenda = (itens, id) => itens.find((i) => i.fonte === 'operacional' && i.venda_id === id);
const porLinha = (itens, id) => itens.find((i) => i.fonte === 'historico' && i.id === id);

/* ══════════════════════════════════════ A4 — pago é o estado real da venda */
{
  const { itens } = await listar();

  assert.equal(porVenda(itens, 1).pago, 1, 'a venda paga deveria aparecer como paga');
  assert.equal(porVenda(itens, 2).pago, 0,
    'a venda A Receber voltou a aparecer como paga — a constante 1 regrediu');
  prova('A4: a venda A Receber aparece como NÃO paga, e a paga como paga');

  /* A contradição concreta: a MESMA venda que a lista chamava de paga é a
     que o banco tem em aberto com prazo combinado. */
  const emAberto = raw.prepare(
    `SELECT id FROM vendas WHERE pago = 0 AND cancelada = 0 AND cobravel = 1`,
  ).all().map((v) => v.id);
  assert.deepEqual(emAberto, [2], 'o cenário perdeu a venda em aberto');
  assert.equal(porVenda(itens, 2).pago, 0,
    'a lista e o banco discordam sobre a mesma venda');
  prova('A4: a lista e vendas.pago dizem a mesma coisa sobre a mesma venda');

  /* O lado histórico sempre leu o valor de verdade — a regressão seria
     igualá-los pelo lado errado. */
  assert.equal(porLinha(itens, 100).pago, 1);
  assert.equal(porLinha(itens, 101).pago, 0);
  prova('A4: o lado histórico continua lendo o pago da planilha');
}

/* ═══════════════════════════════ A5 — cancelada: no histórico, fora da soma */
{
  const { itens } = await listar();
  const cancelada = porVenda(itens, 3);
  assert.ok(cancelada, 'a venda cancelada sumiu do histórico — §28 manda preservá-la');
  assert.equal(cancelada.cancelada, 1, 'a venda cancelada não está marcada como tal');
  prova('A5: o padrão preserva a venda cancelada, marcada — o histórico é histórico');

  const restrito = await listar({ incluirCanceladas: false });
  assert.equal(porVenda(restrito.itens, 3), undefined,
    'canceladas=nao continuou trazendo a venda cancelada');
  assert.equal(restrito.itens.length, itens.length - 1,
    'canceladas=nao tirou mais (ou menos) do que a venda cancelada');
  prova('A5: canceladas=nao devolve exatamente o recorte elegível');

  /* Nenhuma linha de planilha é cancelável: o lado histórico não pode ser
     escondido por um filtro que não lhe diz respeito. */
  assert.equal(restrito.itens.filter((i) => i.fonte === 'historico').length, 3);
  prova('A5: o filtro não mexe no lado histórico, que não tem cancelamento');
}

/* ════════════════════════════════ A6 — um vocabulário comum, sem inventar */
{
  const { itens } = await listar();

  /* O bruto de cada população continua intacto: é ele que permite auditar a
     classificação depois. */
  assert.equal(porVenda(itens, 1).canal, 'balcao');
  assert.equal(porLinha(itens, 101).canal, 'Instagram');
  prova('A6: canal preserva o texto original de cada população');

  /* O vocabulário comum existe e é o que já existia. */
  assert.equal(porVenda(itens, 1).origem, 'balcao');
  assert.equal(porVenda(itens, 4).origem, 'site');
  assert.equal(porLinha(itens, 100).origem, 'site', 'Site e site são a mesma palavra');
  prova('A6: origem usa balcao|acerto|site, e Site do histórico vira site');

  /* E para onde não existe equivalente, a resposta é "não sei" — não um
     canal novo, que seria decidir VEN-Q013 dentro de uma consulta SQL. */
  assert.equal(porLinha(itens, 101).origem, null, 'Instagram ganhou uma origem inventada');
  assert.equal(porLinha(itens, 102).origem, null, 'Maleta ganhou uma origem inventada');
  prova('A6: canal sem equivalente fica NULL — indeterminado anunciado, não chutado');

  const vocabulario = new Set(itens.map((i) => i.origem).filter(Boolean));
  assert.deepEqual([...vocabulario].sort(), ['balcao', 'site'],
    'apareceu um valor de origem fora de balcao|acerto|site');
  prova('A6: nenhum valor de origem fora do vocabulário existente');

  /* O defeito em uma linha: antes, nenhum filtro de canal achava as duas
     populações ao mesmo tempo. */
  const soOperacional = await listar({ canal: 'site' });
  const soHistorico = await listar({ canal: 'Site' });
  assert.equal(soOperacional.itens.length, 1);
  assert.equal(soHistorico.itens.length, 1);
  const ambas = await listar({ origem: 'site' });
  assert.equal(ambas.itens.length, 2, 'origem=site não alcançou as duas populações');
  assert.deepEqual(ambas.itens.map((i) => i.fonte).sort(), ['historico', 'operacional']);
  prova('A6: origem=site alcança as duas populações; canal continua por população');

  const combinado = await listar({ origem: 'balcao', incluirCanceladas: false });
  assert.deepEqual(combinado.itens.map((i) => i.venda_id).sort(), [1, 2],
    'origem e canceladas não combinam');
  prova('A6: os filtros compõem entre si sem se atropelar');
}

/* ═══════════════════════════════════ o que NÃO pode ter mudado: nada físico */
{
  const antes = {
    movimentos: raw.prepare(`SELECT COUNT(*) c FROM movimentos`).get().c,
    saldo: raw.prepare(`SELECT COALESCE(SUM(qtd), 0) s FROM produtos`).get().s,
    vendas: raw.prepare(`SELECT COUNT(*) c FROM vendas`).get().c,
    pagos: raw.prepare(`SELECT COALESCE(SUM(pago), 0) s FROM vendas`).get().s,
  };
  await listar();
  await listar({ incluirCanceladas: false, origem: 'site' });
  const depois = {
    movimentos: raw.prepare(`SELECT COUNT(*) c FROM movimentos`).get().c,
    saldo: raw.prepare(`SELECT COALESCE(SUM(qtd), 0) s FROM produtos`).get().s,
    vendas: raw.prepare(`SELECT COUNT(*) c FROM vendas`).get().c,
    pagos: raw.prepare(`SELECT COALESCE(SUM(pago), 0) s FROM vendas`).get().s,
  };
  assert.deepEqual(depois, antes, 'consultar a listagem alterou o banco');
  prova('listar é leitura: razão, saldo, vendas e pagamento intactos');
}

/* ═══════════════════════════════════════ paginação continua sendo paginação */
{
  const pagina = await listar({ limite: 2, offset: 0 });
  const seguinte = await listar({ limite: 2, offset: 2 });
  assert.equal(pagina.itens.length, 2);
  assert.equal(seguinte.itens.length, 2);
  assert.equal(pagina.limite, 2);
  assert.equal(seguinte.offset, 2);
  const cruzamento = pagina.itens.filter(
    (a) => seguinte.itens.some((b) => b.fonte === a.fonte && b.id === a.id),
  );
  assert.equal(cruzamento.length, 0, 'a mesma linha apareceu em duas páginas');
  prova('paginação não repete nem perde linha');
}

console.log(`\n✓ ${provas} provas — GET /api/vendas/lista\n`);
