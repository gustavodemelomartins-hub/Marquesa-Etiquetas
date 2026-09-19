/** Fase 5.6 — vocabulário único de canal, e intervalo arbitrário.
 *
 *  Duas metades independentes, e as duas vêm da mesma auditoria:
 *
 *   A6. `canal` significava DUAS coisas na mesma resposta. Do lado
 *       operacional era o rótulo de tela (`Balcão`, `Site`, `Acerto de
 *       maleta`); do lado histórico, o texto da planilha (`Site`,
 *       `Instagram`, `Maleta`). Agrupar os dois na mesma coluna é somar
 *       vocabulários diferentes e chamar o resultado de "canais".
 *
 *       5.1 corrigiu isso em `GET /api/vendas/lista`. 5.6 leva a mesma regra
 *       para o analytics: `canal` continua sendo o bruto de cada população, e
 *       `origem` é o vocabulário comum — preenchido SÓ onde a correspondência
 *       é mecânica. `Instagram` e `Maleta` ficam **indeterminados**, porque
 *       classificá-los é decidir `VEN-Q013`, que é de produto.
 *
 *   A7. o analytics só aceitava presets (`tudo`, `7d`, `30d`, `90d`, `12m`).
 *       O intervalo personalizado que a UX já simula não tinha contrato
 *       nenhum atrás (`API-VEN-001`).
 *
 *       E o detalhe que decide se isso é melhoria ou armadilha: valor
 *       desconhecido **caía em `tudo`**. Para preset, tudo bem — só a tela
 *       escreve preset. Data vem de gente, e devolver o faturamento inteiro
 *       da loja diante de `de=2026-13-01` é o pior tipo de erro, porque o
 *       número é plausível e ninguém desconfia.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de fingir que passou.
 *
 *      node src/analytics-recorte-canal-test.mjs
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

const raw = new DatabaseSync(':memory:');
raw.exec(ler('api/schema.sql'));
const db = {
  prepare(sql) {
    const st = { sql, args: [] };
    const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
    st.bind = (...a) => comArgs(a);
    st.first = async function () { return raw.prepare(this.sql).get(...this.args) ?? null; };
    st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
    st.run = async function () { return { meta: { changes: 0 } }; };
    return st;
  },
};

/* ── as duas populações, com canais que NÃO compartilham vocabulário. */
raw.exec(`
INSERT OR IGNORE INTO categorias (nome, ordem) VALUES ('Anel', 1);
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('100001', 'Anel', 'Anel', 100.0, 500);
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria'), (2, 'Bruna', 'bruna');

-- operacional: balcão em julho, site em agosto
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, pago, data_pagamento)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-07-10', 100.0, 1, '2026-07-10'),
         (2, 2, 'Bruna',   'bruna',   'site',   '2026-08-10', 200.0, 1, '2026-08-10');
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES
  (1, '100001', 'Anel', 1, 100.0), (2, '100001', 'Anel', 2, 100.0);

-- histórico: Site (casa mecanicamente) e Instagram (não tem equivalente)
INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash, status)
  VALUES (1, 'planilha.xlsx', 'hash-1', 'importado');
INSERT INTO vendas_historicas (id, lote_id, chave, regra, cliente_nome, cliente_nome_norm, data,
                               canal, valor_total, valor_pago, status, elegivel_ticket, pecas)
  VALUES (10, 1, 'vitoria|2026-07-05', 'teste', 'Vitoria', 'vitoria', '2026-07-05', 'Site',      150.0, 150.0, 'paga', 1, 1),
         (11, 1, 'bruna|2026-08-05',   'teste', 'Bruna',   'bruna',   '2026-08-05', 'Instagram', 300.0, 300.0, 'paga', 1, 1);
INSERT INTO vendas_historico_itens
  (id, lote_id, origem_linha, data, cliente_nome_original, cliente_nome_norm, sku, sku_base,
   nome_produto_historico, qtd, valor_total, canal, pago, pedido_chave, venda_historica_id)
  VALUES
  (100, 1, '1', '2026-07-05', 'Vitoria', 'vitoria', '100001', '100001', 'Anel', 1, 150.0, 'Site',      1, 'vitoria|2026-07-05', 10),
  (101, 1, '2', '2026-08-05', 'Bruna',   'bruna',   '100001', '100001', 'Anel', 1, 300.0, 'Instagram', 1, 'bruna|2026-08-05',   11);
`);

const A = await mod('api/src/analytics.js');

/* ════════════════════════════════ A7 — o intervalo, e o que ele recusa */
console.log('\n=== A7. intervalo arbitrário ===');
{
  const f = A.faixaDePeriodo({ periodo: 'tudo', de: '2026-07-01', ate: '2026-07-31' });
  assert.equal(f.periodo, 'personalizado',
    'a faixa não declarou o recorte que usou — quem lê teria de deduzir pelas datas');
  assert.equal(f.de, '2026-07-01');
  assert.equal(f.ate, '2026-07-31');
  prova('A7: o intervalo vence o preset, e a faixa declara `personalizado`');

  assert.equal(A.faixaDePeriodo({ periodo: '30d' }).periodo, '30d');
  assert.equal(A.faixaDePeriodo('30d').periodo, '30d', 'a assinatura antiga quebrou');
  assert.equal(A.faixaDePeriodo({ periodo: 'tudo' }).de, null);
  prova('A7: presets e a assinatura antiga continuam funcionando iguais');
}
{
  /* As quatro recusas. Cada uma existe porque cair em `tudo` devolveria um
     número plausível e errado. */
  const casos = [
    [{ de: '2026-07-01' }, /de.+ate|faixa|meia/i, 'meia faixa'],
    [{ de: '2026-13-01', ate: '2026-12-01' }, /inválid/i, 'mês 13'],
    [{ de: '2026-02-31', ate: '2026-03-01' }, /inválid/i, '31 de fevereiro'],
    [{ de: '2026-08-01', ate: '2026-07-01' }, /depois do fim/i, 'início depois do fim'],
  ];
  for (const [intervalo, padrao, nome] of casos) {
    const v = A.validarIntervalo(intervalo);
    assert.equal(v.ok, false, `${nome} foi aceito — viraria recorte silenciosamente errado`);
    assert.match(v.erro, padrao, `${nome}: a recusa não diz o motivo`);
  }
  prova('A7: meia faixa, mês 13, 31 de fevereiro e ordem invertida são RECUSADOS, com motivo');

  const f = A.faixaDePeriodo({ de: '2026-02-31', ate: '2026-03-01' });
  assert.equal(f.periodo, 'invalido',
    'intervalo inválido virou `tudo`: a loja inteira devolvida com cara de recorte pedido');
  assert.equal(f.de, null);
  prova('A7: e mesmo chamada direto, a faixa inválida NÃO vira `tudo` em silêncio');
}
{
  /* O recorte de verdade, contra o banco: julho tem uma venda de cada
     população, agosto tem as outras duas. */
  const julho = await A.visaoGeral(db, { de: '2026-07-01', ate: '2026-07-31' });
  assert.equal(julho.periodo.periodo, 'personalizado');
  assert.equal(julho.faturamento, 250, 'julho deveria somar 100 (balcão) + 150 (Site histórico)');

  const agosto = await A.visaoGeral(db, { de: '2026-08-01', ate: '2026-08-31' });
  assert.equal(agosto.faturamento, 500, 'agosto deveria somar 200 (site) + 300 (Instagram)');

  const tudo = await A.visaoGeral(db, { periodo: 'tudo' });
  assert.equal(tudo.faturamento, 750);
  assert.equal(julho.faturamento + agosto.faturamento, tudo.faturamento,
    'as duas metades não fecham o total — o recorte perdeu ou dobrou linha');
  prova('A7: o intervalo recorta de verdade, e as metades fecham o total');
}
{
  /* O risco que §12 nomeia para 5.6: cartão e tabela do MESMO painel
     respondendo sobre recortes diferentes. */
  const p = await A.painel(db, { de: '2026-07-01', ate: '2026-07-31' });
  assert.equal(p.periodo.periodo, 'personalizado');
  assert.equal(p.geral.faturamento, 250, 'o cartão do painel ignorou o intervalo e somou tudo');
  assert.equal(p.origem.periodo.periodo, 'personalizado',
    'um bloco do painel ficou num recorte diferente do cabeçalho');
  const somaEvolucao = p.evolucao.pontos.reduce((s, x) => s + x.faturamento, 0);
  assert.equal(somaEvolucao, p.geral.faturamento,
    'cartão e série discordam dentro do mesmo painel — é o B1 voltando por outra porta');
  prova('A7: o intervalo desce para TODOS os blocos do painel, sem divergência entre eles');
}

/* ══════════════════════════ A6 — dois vocabulários, e nenhum inventado */
console.log('\n=== A6. vocabulário de canal ===');
{
  const o = await A.porOrigem(db, { periodo: 'tudo' });

  /* O bruto continua bruto: é ele que permite auditar a classificação. */
  const canais = Object.fromEntries((o.canais ?? []).map((c) => [c.canal, c.faturamento]));
  assert.equal(canais['Instagram'], 300, 'o texto da planilha sumiu — a auditoria da leitura foi embora');
  assert.equal(canais['Balcão'], 100, 'o rótulo do lado operacional sumiu');
  prova('A6: `canais` continua devolvendo o texto bruto de cada população');

  const origens = Object.fromEntries((o.origens ?? []).map((x) => [x.origem ?? 'indeterminado', x]));
  assert.ok(o.origens, 'o eixo comparável não existe: sem ele, só dá para somar vocabulários diferentes');

  /* `Site` histórico e `site` operacional são a MESMA palavra: somam. */
  assert.equal(origens.site.faturamento, 350, 'Site (planilha) e site (sistema) não somaram no mesmo eixo');
  assert.equal(origens.balcao.faturamento, 100);
  prova('A6: no eixo comum, Site da planilha e site do sistema somam — é a mesma palavra');

  /* `Instagram` NÃO tem equivalente em balcao|acerto|site. */
  assert.ok(origens.indeterminado, 'o que não tem equivalente sumiu da resposta em vez de ser anunciado');
  assert.equal(origens.indeterminado.indeterminado, true);
  assert.equal(origens.indeterminado.faturamento, 300);
  assert.equal(origens.indeterminado.origem, null,
    'Instagram foi classificado: isso é decidir VEN-Q013 dentro de um SELECT');
  prova('A6: Instagram fica INDETERMINADO e anunciado — VEN-Q013 continua sendo de produto');

  const somaOrigens = (o.origens ?? []).reduce((s, x) => s + x.faturamento, 0);
  assert.equal(somaOrigens, o.totalFaturamento,
    'o eixo comum perdeu dinheiro: uma fatia sumiu em vez de virar indeterminado');
  assert.equal(somaOrigens, 750);
  prova('A6: o eixo comum fecha o total — nenhuma fatia desaparece por não ter nome');

  assert.ok(o.vocabulario?.canal && o.vocabulario?.origem,
    'a resposta não diz o que cada eixo significa, e os dois parecem intercambiáveis');
  prova('A6: a resposta declara, por escrito, o que é `canal` e o que é `origem`');
}

console.log(`\n  ${provas} prova(s). 5.6 — A6 e A7 fechados.`);
