/** O ciclo inteiro de Garantias / Reparos / Trocas — Fase 5.4a.
 *
 *  ESTE TESTE É A REDE, NÃO A CORREÇÃO.
 *
 *  A auditoria de 5.4 achou que toda a cobertura HTTP de garantias vive na
 *  suíte `worker-local`, que é `catalog-only` e não roda em gate nenhum. O
 *  domínio que mexe em estoque e em faturamento não tinha uma única prova
 *  executada em CI. Esta suíte existe para isso: caracterizar o que o código
 *  FAZ hoje, antes de qualquer correção, num teste que roda de verdade.
 *
 *  Por isso ele registra também o que está ERRADO. Cada defeito conhecido
 *  aparece marcado como
 *
 *      CARACTERIZAÇÃO — comportamento atual, muda em 5.4<x>
 *
 *  e é asseverado exatamente como é hoje. Quando a subfase seguinte corrigir,
 *  o teste QUEBRA — que é o ponto: a correção tem de passar por aqui e dizer
 *  o que mudou, em vez de escorregar sem ninguém notar.
 *
 *  O que fica provado:
 *
 *    1. abertura, prazo de 45 dias úteis e previsão congelada;
 *    2. estados e o que cada transição faz hoje;
 *    3. eventos, e a ordem deles;
 *    4. reparo, devolução, encerramento;
 *    5. sem conserto e troca, com as três recusas (kit, montável, sem saldo);
 *    6. diferença positiva, zero e negativa;
 *    7. pagamento pelas DUAS portas — a rota da garantia e a tela A Receber;
 *    8. cancelamento;
 *    9. estorno da troca;
 *   10. estoque: a peça nova sai uma vez, a defeituosa nunca volta;
 *   11. financeiro: só a diferença paga vira receita, e nunca duas vezes;
 *   12. venda de origem cancelada depois da abertura;
 *   13. duas unidades do mesmo código com `venda_item_id` distintos;
 *   14. a razão fecha em todos os cenários.
 *
 *      node src/garantias-ciclo-test.mjs
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
/** Marca o que é retrato de defeito, não de acerto. A subfase que corrigir
 *  tem de vir aqui apagar a marca — e é assim que a correção fica visível. */
const caracteriza = (t, subfase) => {
  provas += 1;
  console.log(`  ~~   ${t}   [CARACTERIZAÇÃO — muda em ${subfase}]`);
};

function dividirSql(sql) {
  const fora = []; let atual = ''; let dentro = false;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (!dentro && c === '-' && sql[i + 1] === '-') {
      const fim = sql.indexOf('\n', i); i = fim === -1 ? sql.length : fim; continue;
    }
    if (c === "'") { dentro = !dentro; atual += c; continue; }
    if (c === ';' && !dentro) { fora.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim()) fora.push(atual.trim());
  return fora.filter(Boolean);
}

function comandos(sql) {
  const partes = dividirSql(sql); const saida = []; let acumulado = null;
  for (const parte of partes) {
    if (acumulado !== null) {
      acumulado += `;\n${parte}`;
      if (/(^|\s)END$/i.test(parte.trim())) { saida.push(acumulado); acumulado = null; }
      continue;
    }
    if (/^CREATE\s+TRIGGER/i.test(parte)) {
      if (/(^|\s)END$/i.test(parte.trim())) saida.push(parte); else acumulado = parte;
      continue;
    }
    saida.push(parte);
  }
  if (acumulado !== null) saida.push(acumulado);
  return saida;
}

function aplicar(raw, arquivo) {
  for (const comando of comandos(ler(arquivo))) {
    try {
      raw.exec(comando);
    } catch (e) {
      if (/duplicate column name/i.test(String(e.message))) continue;
      throw new Error(`${arquivo}: ${e.message}\n${comando.slice(0, 160)}`);
    }
  }
}

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

/* §1: o saldo nasce pela razão, nunca por escrita direta em produtos.qtd —
   senão a invariante já começaria quebrada e o teste mediria o cenário. */
const SEED = `
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitário',  'Anel',  100.0, 50),
  ('100002', 'Colar Veneziana', 'Colar', 200.0, 50),
  ('100003', 'Anel Aparador',   'Anel',   80.0, 50),
  ('100004', 'Anel Igual',      'Anel',  100.0, 50);
INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES
  ('100001', 'entrada', 50, 'importacao', 'carga inicial'),
  ('100002', 'entrada', 50, 'importacao', 'carga inicial'),
  ('100003', 'entrada', 50, 'importacao', 'carga inicial'),
  ('100004', 'entrada', 50, 'importacao', 'carga inicial');
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, cancelada, pago)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 480.0, 0, 1);
INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
  (1, '100001', 'Anel Solitário',  1, 100.0, 'a0000000-0000-4000-8000-000000000001'),
  (1, '100001', 'Anel Solitário',  1, 100.0, 'a0000000-0000-4000-8000-000000000002'),
  (1, '100003', 'Anel Aparador',   1,  80.0, 'a0000000-0000-4000-8000-000000000003'),
  (1, '100002', 'Colar Veneziana', 1, 200.0, 'a0000000-0000-4000-8000-000000000004');
INSERT INTO movimentos (sku, tipo, qtd, origem, obs, venda_id) VALUES
  ('100001', 'venda', -2, 'venda', 'venda 1', 1),
  ('100003', 'venda', -1, 'venda', 'venda 1', 1),
  ('100002', 'venda', -1, 'venda', 'venda 1', 1);
UPDATE produtos SET qtd = 48 WHERE sku = '100001';
UPDATE produtos SET qtd = 49 WHERE sku IN ('100002', '100003');
`;

function banco() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  aplicar(raw, 'api/migracao-pos-golive-1.sql');
  raw.exec(SEED);
  return raw;
}

const razaoFecha = (raw) => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.soma, 0)`).get().n;

const qtd = (raw, sku) => raw.prepare('SELECT qtd FROM produtos WHERE sku = ?').get(sku).qtd;
const ITEM_A = 'a0000000-0000-4000-8000-000000000001';
const ITEM_B = 'a0000000-0000-4000-8000-000000000002';
const ITEM_C = 'a0000000-0000-4000-8000-000000000003';

const G = await mod('api/src/garantias.js');
const CR = await mod('api/src/contas-receber.js');

/* ═══════════════════════════════════ 1. abertura, prazo e previsão */
console.log('\n=== 1. abertura: o item, o valor pago e o prazo de 45 dias úteis ===');
{
  const raw = banco(); const db = adaptador(raw);

  const semMotivo = await G.abrirGarantia(db, { vendaItemId: ITEM_A });
  assert.equal(semMotivo.ok, false);
  assert.equal(semMotivo.statusHttp, 400);
  prova('sem motivo não abre: o problema da peça é obrigatório');

  const futura = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2099-01-01' });
  assert.equal(futura.ok, false);
  assert.match(futura.erro, /ainda não chegou/);
  prova('data de entrada no futuro é recusada');

  const prazoRuim = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', prazoDiasUteis: 0 });
  assert.equal(prazoRuim.ok, false);
  prova('prazo tem de ser inteiro positivo');

  const r = await G.abrirGarantia(db, {
    vendaItemId: ITEM_A, motivo: 'A pedra soltou', dataEntrada: '2026-09-01',
  });
  assert.equal(r.ok, true, `abertura falhou: ${r.erro ?? ''}`);
  const g = r.garantia;
  assert.equal(g.status, 'em_reparo');
  assert.equal(g.vendaItemId, ITEM_A);
  assert.equal(g.vendaId, 1);
  assert.equal(g.valorPagoOriginal, 100.0);
  assert.equal(g.dataVenda, '2026-09-01');
  assert.equal(g.clienteId, 1);
  prova('a garantia nasce em reparo, no item certo, com o valor que ela PAGOU');

  assert.equal(g.prazoDiasUteis, 45);
  assert.ok(g.previsaoRetorno, 'sem previsão calculada');
  assert.equal(g.consideraFeriados, false);
  prova('45 dias úteis, previsão calculada e `consideraFeriados: false` sem tabela de feriados');

  /* 01/09/2026 é uma terça. 45 dias úteis à frente, sem feriados, cai em
     03/11/2026 — contado dia a dia pulando sábado e domingo. O número está
     escrito aqui de propósito: se o cálculo mudar, alguém tem de vir aqui
     dizer por quê. */
  assert.equal(g.previsaoRetorno, '2026-11-03');
  prova('e a previsão é uma data concreta: 01/09 + 45 dias úteis = 03/11/2026');

  /* §31 dito na resposta, para nenhuma tela precisar deduzir. */
  assert.equal(r.faturamento, 0);
  assert.equal(r.estoqueAlterado, false);
  assert.equal(r.vendaOriginalAlterada, false);
  assert.equal(qtd(raw, '100001'), 48, 'a abertura mexeu no estoque');
  assert.equal(razaoFecha(raw), 0);
  prova('abrir não toca venda, estoque nem faturamento');

  const ev = g.eventos;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tipo, 'aberta');
  assert.equal(ev[0].statusNovo, 'em_reparo');
  assert.equal(ev[0].dados.valorPagoOriginal, 100.0);
  prova('o primeiro evento é a abertura, com o valor pago dentro');
}

/* ═══════════════════════════════════ 2. estados e transições */
console.log('\n=== 2. estados: o que cada transição faz HOJE ===');
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = r.garantia.id;

  const invalido = await G.mudarStatusGarantia(db, id, { status: 'inventado' });
  assert.equal(invalido.ok, false);
  assert.equal(invalido.statusHttp, 400);
  prova('status fora do vocabulário é recusado');

  const mesmo = await G.mudarStatusGarantia(db, id, { status: 'em_reparo' });
  assert.equal(mesmo.ok, false);
  assert.equal(mesmo.statusHttp, 409);
  prova('mudar para o status em que já está é recusado');

  /* 5.4e — mudar status é registrar um fato JÁ OCORRIDO. As outras três
     portas (abertura, troca, pagamento) já recusavam data futura; esta
     passou a recusar também. Agendar é outro conceito. */
  const futuro = await G.mudarStatusGarantia(db, id, { status: 'reparada', data: '2099-01-01' });
  assert.equal(futuro.ok, false);
  assert.equal(futuro.statusHttp, 400);
  assert.match(futuro.erro, /ainda não chegou/);
  assert.equal((await G.lerGarantia(db, id)).status, 'em_reparo', 'a recusa mudou o status mesmo assim');
  prova('5.4e: mudar status recusa data no FUTURO, como as outras três portas');

  const rep = await G.mudarStatusGarantia(db, id, { status: 'reparada', data: '2026-09-10' });
  assert.equal(rep.ok, true);
  assert.equal(rep.garantia.status, 'reparada');
  assert.equal(rep.garantia.encerradaEm, null, 'reparada NÃO encerra o caso');
  assert.equal(rep.garantia.pendente, true);
  prova('reparada é estado de espera: não encerra, continua pendente');

  const dev = await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-09-05' });
  assert.equal(dev.ok, true);
  assert.equal(dev.garantia.encerradaEm, '2026-09-05');
  assert.equal(dev.garantia.pendente, false);
  assert.equal(dev.faturamento, 0);
  assert.equal(dev.estoqueAlterado, false);
  prova('devolvida encerra o caso, sem gerar venda, estoque nem faturamento');

  /* 5.4e — A MATRIZ MÍNIMA: de estado ENCERRADO não se sai por mudança de
     status. Antes `devolvida → em_reparo` era aceito e apagava a data da
     entrega, fundindo dois atendimentos que aconteceram em momentos
     diferentes. O caminho legítimo agora é outro, e a recusa o aponta. */
  const reabre = await G.mudarStatusGarantia(db, id, { status: 'em_reparo', data: '2026-09-06' });
  assert.equal(reabre.ok, false);
  assert.equal(reabre.statusHttp, 409);
  assert.equal(reabre.encerradaEm, '2026-09-05');
  assert.equal(reabre.caminho, 'POST /api/garantias/:id/reabrir');
  prova('5.4e: caso encerrado não volta por mudança de status, e a recusa diz qual é o caminho');

  const aindaLa = await G.lerGarantia(db, id);
  assert.equal(aindaLa.status, 'devolvida');
  assert.equal(aindaLa.encerradaEm, '2026-09-05', 'a data da entrega foi apagada');
  prova('e o encerramento continua onde estava — a recusa não mexeu em nada');

  /* O que já era absoluto continua: o histórico guarda cada fato. */
  const encerramentos = aindaLa.eventos.filter((e) => e.statusNovo === 'devolvida');
  assert.equal(encerramentos.length, 1);
  assert.equal(encerramentos[0].data, '2026-09-05');
  assert.deepEqual(aindaLa.eventos.map((e) => e.tipo), ['aberta', 'status', 'devolvida']);
  prova('a linha do tempo guarda o encerramento, com a data certa');

  /* E o outro trânsito absurdo: concluída virando cancelada meses depois,
     reescrevendo o desfecho de um caso que já terminou. */
  const canc = await G.mudarStatusGarantia(db, id, { status: 'cancelada', data: '2026-09-08' });
  assert.equal(canc.ok, false);
  assert.equal(canc.statusHttp, 409);
  assert.equal((await G.lerGarantia(db, id)).status, 'devolvida');
  prova('5.4e: caso encerrado também não vira cancelado — o desfecho não se reescreve');
}

/* ═══════════════════════════════════ 3. troca: as recusas */
console.log('\n=== 3. sem conserto: o que a troca RECUSA ===');
{
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`
    INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('KIT-1', 'Kit', 'Anel', 300.0, 0);
    INSERT INTO kit_componentes (kit_sku, componente_sku, qtd) VALUES ('KIT-1', '100002', 1);
    INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('ZERADO', 'Sem saldo', 'Anel', 50.0, 0);
  `);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = r.garantia.id;

  const inexistente = await G.registrarTroca(db, id, { skuNovo: 'NAO-EXISTE' });
  assert.equal(inexistente.ok, false);
  assert.match(inexistente.erro, /não está no catálogo/);
  prova('peça fora do catálogo não troca');

  const kit = await G.registrarTroca(db, id, { skuNovo: 'KIT-1' });
  assert.equal(kit.ok, false);
  assert.equal(kit.statusHttp, 409);
  assert.match(kit.erro, /kit/i);
  prova('kit não troca: ele não tem saldo próprio para movimentar');

  const semSaldo = await G.registrarTroca(db, id, { skuNovo: 'ZERADO' });
  assert.equal(semSaldo.ok, false);
  assert.match(semSaldo.erro, /não há peça disponível/);
  prova('peça sem saldo não troca');

  const dataFutura = await G.registrarTroca(db, id, { skuNovo: '100002', data: '2099-01-01' });
  assert.equal(dataFutura.ok, false);
  prova('troca com data no futuro é recusada');

  assert.equal(razaoFecha(raw), 0);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantia_trocas').get().c, 0);
  prova('e nenhuma recusa deixou linha ou movimento para trás');
}

/* ═══════════════════════════════════ 4. troca com diferença positiva */
console.log('\n=== 4. troca: a diferença, e só ela ===');
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'Sem conserto', dataEntrada: '2026-09-01' });
  const id = r.garantia.id;

  const antes = qtd(raw, '100002');
  const t = await G.registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-10' });
  assert.equal(t.ok, true, `troca falhou: ${t.erro ?? ''}`);

  assert.equal(qtd(raw, '100002'), antes - 1);
  assert.equal(qtd(raw, '100001'), 48, 'a peça DEFEITUOSA voltou ao estoque — não pode');
  prova('a peça nova sai uma vez; a defeituosa não volta ao vendável');

  const mov = raw.prepare(
    `SELECT tipo, origem, qtd, venda_id FROM movimentos WHERE sku = '100002' ORDER BY id DESC LIMIT 1`).get();
  assert.equal(mov.tipo, 'troca');
  assert.equal(mov.origem, 'troca_garantia');
  assert.equal(mov.qtd, -1);
  prova('o movimento diz POR QUE a peça saiu: tipo troca, origem troca_garantia — nunca venda');

  const g = await G.lerGarantia(db, id);
  assert.equal(g.status, 'sem_conserto');
  assert.equal(g.troca.valorOriginal, 100.0);
  assert.equal(g.troca.valorNovo, 200.0);
  assert.equal(g.troca.diferenca, 100.0);
  assert.equal(g.troca.diferencaStatus, 'a_receber');
  assert.equal(t.faturamento, 0, 'trocar não é receber');
  prova('a diferença é 200 − 100, fica a receber, e nada entra no faturamento agora');

  /* §36 — a peça nova nasce como venda, mas a venda vale a DIFERENÇA. */
  assert.equal(t.criouVenda, true);
  const venda = raw.prepare('SELECT * FROM vendas WHERE id = ?').get(t.vendaId);
  assert.equal(venda.origem, 'troca');
  assert.equal(venda.total, 100.0, 'a venda da troca não pode valer o preço cheio da peça nova');
  assert.equal(venda.pago, 0);
  assert.equal(venda.cobravel, 1);
  prova('§36: a peça nova vira venda, e a venda vale 100 (a diferença), não 200');

  const item = raw.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').get(t.vendaId);
  assert.equal(item.preco, 100.0);
  assert.equal(item.preco_tabela, 200.0);
  assert.match(item.desconto_rotulo, /Crédito de garantia/);
  assert.ok(item.id, 'a linha da venda da troca nasceu sem identidade');
  prova('e o item guarda os dois números lado a lado, com o crédito rotulado');

  const segunda = await G.registrarTroca(db, id, { skuNovo: '100003' });
  assert.equal(segunda.ok, false);
  assert.equal(segunda.statusHttp, 409);
  assert.equal(qtd(raw, '100003'), 49, 'a segunda troca baixou estoque mesmo recusada');
  prova('uma garantia troca no máximo uma vez — dois cliques não baixam duas peças');

  const volta = await G.mudarStatusGarantia(db, id, { status: 'em_reparo' });
  assert.equal(volta.ok, false);
  assert.match(volta.erro, /Estorne a troca antes/);
  prova('e com troca registrada a garantia não volta para em reparo');

  assert.equal(razaoFecha(raw), 0);
  prova('a razão fecha depois da troca');
}

/* ═══════════════════════════════════ 5. diferença zero e negativa */
console.log('\n=== 5. diferença zero e diferença negativa ===');
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const t = await G.registrarTroca(db, r.garantia.id, { skuNovo: '100004', data: '2026-09-10' });
  assert.equal(t.ok, true);
  assert.equal(t.diferenca, 0);
  assert.equal(t.diferencaStatus, 'nenhuma');
  const v = raw.prepare('SELECT total, pago, cobravel, data_pagamento FROM vendas WHERE id = ?').get(t.vendaId);
  assert.equal(v.total, 0);
  assert.equal(v.pago, 1);
  assert.equal(v.cobravel, 0);
  assert.equal(v.data_pagamento, '2026-09-10');
  prova('peça do mesmo preço: diferença zero, venda de zero já paga, nada a cobrar');

  const pg = await G.pagarDiferencaTroca(db, r.garantia.id, {});
  assert.equal(pg.ok, false);
  assert.match(pg.erro, /Não há diferença a receber/);
  prova('e não há o que receber numa troca sem diferença');
}
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const t = await G.registrarTroca(db, r.garantia.id, { skuNovo: '100003', data: '2026-09-10' });
  assert.equal(t.ok, true);
  assert.equal(t.diferenca, -20);
  assert.equal(t.diferencaStatus, 'pendente_regra');
  /* 5.4e — a REGRA fechou (12/09/2026): peça mais barata vira CRÉDITO DA
     CLIENTE. Não se perde e não volta em dinheiro. O valor é dito em voz
     alta, para nenhuma tela precisar deduzi-lo do sinal da diferença. */
  assert.equal(t.creditoAoCliente, 20);
  assert.match(t.aviso, /CRÉDITO da cliente/);
  assert.match(t.aviso, /não se perde e não volta em dinheiro/);
  prova('5.4e: a peça mais barata vira crédito de 20 para a cliente, dito explicitamente');

  const g = await G.lerGarantia(db, r.garantia.id);
  assert.equal(g.troca.creditoAoCliente, 20);
  assert.equal(g.troca.diferenca, -20);
  prova('e a leitura da garantia devolve o mesmo crédito, sem recalcular sinal');

  /* O que a regra fechada NÃO trouxe: o lugar onde o crédito mora. O sistema
     não tem carteira, saldo de cliente nem conta a pagar. Nada é lançado, e
     nada é simulado com desconto, pagamento negativo ou ajuste de estoque. */
  const v = raw.prepare('SELECT total, cobravel, pago FROM vendas WHERE id = ?').get(t.vendaId);
  assert.equal(v.total, 0, 'a diferença negativa virou dinheiro em algum lugar');
  assert.equal(v.cobravel, 0);
  const itens = raw.prepare('SELECT preco, desconto_valor FROM venda_itens WHERE venda_id = ?').all(t.vendaId);
  assert.ok(itens.every((i) => Number(i.preco) >= 0), 'apareceu preço negativo simulando crédito');
  const contas = await CR.contasAReceber(db, { status: 'aberta' });
  assert.equal((contas.contas ?? []).some((c) => c.chave === `venda:${t.vendaId}`), false);
  prova('mas nada é lançado: sem preço negativo, sem conta, sem ajuste — o crédito não foi simulado');

  const pg = await G.pagarDiferencaTroca(db, r.garantia.id, {});
  assert.equal(pg.ok, false);
  assert.match(pg.erro, /crédito DA CLIENTE/i);
  prova('e ninguém cobra dela um valor que é dela');

  assert.equal(razaoFecha(raw), 0);
}

/* ═══════════════════════════════════ 6. pagamento pelas duas portas */
console.log('\n=== 6. a diferença paga: as duas portas ===');
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = r.garantia.id;
  const t = await G.registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-10' });

  const parcial = await G.pagarDiferencaTroca(db, id, { valor: 50 });
  assert.equal(parcial.ok, false);
  assert.match(parcial.erro, /pagamento parcial não é tratado/);
  prova('porta 1: pagamento parcial é recusado, em vez de criar saldo que ninguém acompanha');

  const antesDoEstoque = qtd(raw, '100002');
  const pg = await G.pagarDiferencaTroca(db, id, { pagaEm: '2026-09-12' });
  assert.equal(pg.ok, true, `pagamento falhou: ${pg.erro ?? ''}`);
  assert.equal(pg.faturamento, 100.0);
  assert.equal(pg.dataFaturamento, '2026-09-12');
  assert.equal(pg.porOndeFatura, 'venda');
  assert.equal(qtd(raw, '100002'), antesDoEstoque, 'receber fez a peça sair de novo');
  prova('§30: a receita entra pela data do PAGAMENTO, e receber não move estoque');

  const g = await G.lerGarantia(db, id);
  assert.equal(g.troca.diferencaStatus, 'paga');
  assert.equal(raw.prepare('SELECT pago FROM vendas WHERE id = ?').get(t.vendaId).pago, 1);
  prova('as duas linhas fecham juntas: garantia_trocas e a venda de §36');

  assert.ok(g.eventos.some((e) => e.tipo === 'diferenca_paga'));
  prova('e a linha do tempo registra o pagamento');

  const dup = await G.pagarDiferencaTroca(db, id, {});
  assert.equal(dup.ok, false);
  assert.equal(dup.statusHttp, 409);
  assert.equal(g.eventos.filter((e) => e.tipo === 'diferenca_paga').length, 1);
  prova('pagar duas vezes é recusado, e não duplica evento');
}
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = r.garantia.id;
  const t = await G.registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-10' });

  /* Porta 2 — a tela A Receber, que é por onde isto acontece de verdade
     desde §36: a diferença aparece como VENDA, não como troca. */
  const lista = await CR.contasAReceber(db, { status: 'aberta' });
  const conta = (lista.contas ?? []).find((c) => c.chave === `venda:${t.vendaId}`);
  assert.ok(conta, 'a diferença não apareceu no A Receber');
  assert.equal(conta.valorTotal, 100.0);
  assert.equal(conta.valorReceber, 100.0);
  assert.match(conta.origem, /troca\/garantia/i);
  prova('porta 2: a diferença aparece no A Receber, rotulada como troca/garantia');

  const pg = await CR.receberConta(db, { chave: `venda:${t.vendaId}`, confirmar: true, pagaEm: '2026-09-12' });
  assert.equal(pg.ok, true, `recebimento falhou: ${pg.erro ?? ''}`);
  assert.equal(pg.estoqueTocado, false);
  assert.equal(pg.garantiaId, id);
  const g = await G.lerGarantia(db, id);
  assert.equal(g.troca.diferencaStatus, 'paga');
  assert.equal(g.troca.diferencaPagaEm, '2026-09-12');
  prova('e receber por ali fecha as duas linhas do mesmo jeito');

  /* 5.4c — a porta normal passou a escrever na linha do tempo do caso. */
  assert.equal(pg.eventoDeGarantiaRegistrado, true);
  const pagos = g.eventos.filter((e) => e.tipo === 'diferenca_paga');
  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].data, '2026-09-12');
  assert.equal(pagos[0].dados.valor, 100.0);
  assert.equal(pagos[0].dados.vendaId, t.vendaId);
  assert.deepEqual(g.eventos.map((e) => e.tipo), ['aberta', 'troca', 'diferenca_paga']);
  prova('5.4c: receber pelo A Receber entra na linha do tempo da garantia');

  const dup = await CR.receberConta(db, { chave: `venda:${t.vendaId}`, confirmar: true, pagaEm: '2026-09-12' });
  assert.equal(dup.ok, true);
  assert.equal(dup.jaEstavaPaga, true);
  const depois = await G.lerGarantia(db, id);
  assert.equal(depois.eventos.filter((e) => e.tipo === 'diferenca_paga').length, 1);
  prova('receber a mesma conta duas vezes é inofensivo, e não duplica o evento');

  assert.equal(razaoFecha(raw), 0);
}

/* ════════════════════════════ 6b. o evento não vaza para conta que não é troca */
console.log('\n=== 6b. o evento de garantia NAO vaza para conta comum ===');
{
  const raw = banco(); const db = adaptador(raw);
  /* Uma garantia com troca paga existe no banco, para o cenário não passar
     por falta de garantia nenhuma — e uma venda de balcão fiada ao lado. */
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const t = await G.registrarTroca(db, r.garantia.id, { skuNovo: '100002', data: '2026-09-10' });
  assert.equal(t.ok, true);

  raw.exec(`
    INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, cancelada, pago, cobravel)
      VALUES (99, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-02', 80.0, 0, 0, 1);
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (99, '100004', 'Anel Igual', 1, 80.0, 'b0000000-0000-4000-8000-000000000099');
    INSERT INTO movimentos (sku, tipo, qtd, origem, obs, venda_id)
      VALUES ('100004', 'venda', -1, 'venda', 'venda 99', 99);
    UPDATE produtos SET qtd = 49 WHERE sku = '100004';
  `);

  const eventosAntes = raw.prepare('SELECT COUNT(*) c FROM garantia_eventos').get().c;
  const pg = await CR.receberConta(db, { chave: 'venda:99', confirmar: true, pagaEm: '2026-09-05' });
  assert.equal(pg.ok, true, `recebimento falhou: ${pg.erro ?? ''}`);
  assert.equal(pg.garantiaId, null);
  assert.equal(pg.eventoDeGarantiaRegistrado, false);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantia_eventos').get().c, eventosAntes);
  prova('venda de balcão fiada recebe sem escrever evento em garantia nenhuma');

  /* E a troca que continua em aberto não foi tocada de raspão. */
  const g = await G.lerGarantia(db, r.garantia.id);
  assert.equal(g.troca.diferencaStatus, 'a_receber');
  assert.equal(g.eventos.some((e) => e.tipo === 'diferenca_paga'), false);
  prova('e a diferença da garantia ao lado continua em aberto, intocada');

  assert.equal(razaoFecha(raw), 0);
}
{
  /* A conta HISTÓRICA nem chega ao trecho da venda: sai antes, por
     `marcarContaPaga`. A prova é que nenhum evento nasce. */
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  await G.registrarTroca(db, r.garantia.id, { skuNovo: '100002', data: '2026-09-10' });
  const eventosAntes = raw.prepare('SELECT COUNT(*) c FROM garantia_eventos').get().c;

  const pg = await CR.receberConta(db, { chave: 'historico:12345', confirmar: true, pagaEm: '2026-09-05' });
  assert.equal(pg.ok, false, 'a operação histórica inventada não deveria existir');
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantia_eventos').get().c, eventosAntes);
  prova('conta histórica não passa pelo caminho da garantia, nem para falhar');
}

/* ═══════════════════════════════════ 7. faturamento não conta duas vezes */
console.log('\n=== 7. o mesmo real não entra duas vezes ===');
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const t = await G.registrarTroca(db, r.garantia.id, { skuNovo: '100002', data: '2026-09-10' });
  await G.pagarDiferencaTroca(db, r.garantia.id, { pagaEm: '2026-09-12' });

  /* A troca COM venda ligada é excluída da soma de `diferenca_valor_pago`:
     ela já entra pela venda. Se as duas somassem, os 100 virariam 200. */
  const soma = raw.prepare(
    `SELECT COALESCE(SUM(diferenca_valor_pago), 0) s FROM garantia_trocas
      WHERE diferenca_status = 'paga' AND venda_id IS NULL`).get().s;
  assert.equal(soma, 0, 'a troca com venda ligada entrou na soma avulsa também');
  assert.equal(
    raw.prepare('SELECT diferenca_valor_pago FROM garantia_trocas WHERE garantia_id = ?').get(r.garantia.id).diferenca_valor_pago,
    100.0);
  prova('a troca com registro comercial fica FORA da soma avulsa — o real entra uma vez só, pela venda');
}

/* ═══════════════════════════════════ 8. cancelamento */
console.log('\n=== 8. cancelamento ===');
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'abriu por engano', dataEntrada: '2026-09-01' });
  const id = r.garantia.id;
  const c = await G.mudarStatusGarantia(db, id, { status: 'cancelada', data: '2026-09-02', observacao: 'engano' });
  assert.equal(c.ok, true);
  assert.equal(c.garantia.status, 'cancelada');
  assert.equal(c.garantia.encerradaEm, '2026-09-02');
  assert.equal(c.garantia.pendente, false);
  assert.equal(c.faturamento, 0);
  assert.equal(c.estoqueAlterado, false);
  prova('cancelar encerra o caso sem tocar em dinheiro nem em estoque');

  assert.ok(c.garantia.eventos.some((e) => e.tipo === 'cancelada'));
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantias').get().c, 1);
  prova('§28: a garantia cancelada continua existindo, com o evento dizendo o que houve');

  /* A garantia cancelada não segura mais a peça: outra pode ser aberta. */
  const nova = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'agora de verdade', dataEntrada: '2026-09-03' });
  assert.equal(nova.ok, true);
  prova('e cancelada não bloqueia a abertura de uma garantia nova para a mesma peça');
}

/* ═══════════════════════════════════ 9. estorno da troca */
console.log('\n=== 9. estorno da troca (GAR-102) ===');
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = r.garantia.id;
  const antes = qtd(raw, '100002');
  const t = await G.registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-10' });
  assert.equal(qtd(raw, '100002'), antes - 1);

  const semMotivo = await G.estornarTroca(db, id, {});
  assert.equal(semMotivo.ok, false);
  assert.equal(semMotivo.statusHttp, 400);
  prova('estornar sem dizer por quê é recusado');

  const e = await G.estornarTroca(db, id, { motivo: 'SKU digitado errado' });
  assert.equal(e.ok, true, `estorno falhou: ${e.erro ?? ''}`);
  assert.equal(qtd(raw, '100002'), antes, 'a peça nova não voltou ao estoque');
  prova('a peça nova volta ao estoque, exatamente uma vez');

  const mov = raw.prepare(
    `SELECT tipo, origem, qtd FROM movimentos WHERE sku = '100002' ORDER BY id DESC LIMIT 1`).get();
  assert.equal(mov.tipo, 'ajuste');
  assert.equal(mov.origem, 'estorno');
  assert.equal(mov.qtd, 1);
  prova('e o movimento de volta diz que foi estorno, não entrada nova');

  const venda = raw.prepare('SELECT cancelada, cobravel, observacao FROM vendas WHERE id = ?').get(t.vendaId);
  assert.equal(venda.cancelada, 1);
  assert.equal(venda.cobravel, 0);
  assert.match(venda.observacao, /Troca estornada/);
  prova('§28: a venda da diferença é CANCELADA, não apagada, e diz o motivo');

  const g = await G.lerGarantia(db, id);
  assert.equal(g.troca, null);
  assert.equal(g.status, 'sem_conserto');
  const ev = g.eventos.at(-1);
  assert.equal(ev.tipo, 'troca_estornada');
  assert.equal(ev.observacao, 'SKU digitado errado');
  prova('a garantia volta a não ter troca, e o evento guarda o motivo');

  /* 5.4d — ESTORNAR NÃO APAGA (§28). A linha fica, com o estado do caso.
     Quem olhar daqui a um ano vê o que houve, e que foi desfeito. */
  const linha = raw.prepare('SELECT * FROM garantia_trocas WHERE id = ?').get(e.trocaEstornadaId);
  assert.ok(linha, 'a linha da troca foi apagada');
  assert.equal(linha.estornada, 1);
  assert.equal(linha.estorno_motivo, 'SKU digitado errado');
  assert.ok(linha.estorno_em, 'sem data de estorno');
  prova('a troca estornada CONTINUA na tabela, marcada, com motivo e data');

  assert.equal(linha.sku_novo, '100002');
  assert.equal(linha.valor_original, 100.0);
  assert.equal(linha.valor_novo, 200.0);
  assert.equal(linha.diferenca, 100.0);
  assert.equal(linha.data, '2026-09-10');
  assert.equal(linha.venda_id, t.vendaId);
  prova('e o fato original inteiro sobrevive: SKU, os dois valores, a diferença, a data e a venda');

  /* As duas pontas do estoque na mesma linha: um movimento tirou a peça, o
     outro a trouxe de volta. A razão se explica sem consultar mais nada. */
  assert.ok(linha.movimento_id, 'o movimento da troca se perdeu');
  assert.ok(linha.estorno_movimento_id, 'o movimento do estorno não foi gravado');
  assert.notEqual(linha.movimento_id, linha.estorno_movimento_id);
  const saiu = raw.prepare('SELECT qtd, tipo FROM movimentos WHERE id = ?').get(linha.movimento_id);
  const voltou = raw.prepare('SELECT qtd, tipo FROM movimentos WHERE id = ?').get(linha.estorno_movimento_id);
  assert.equal(saiu.qtd, -1);
  assert.equal(voltou.qtd, 1);
  prova('as DUAS pontas do estoque ficam na linha: o movimento que tirou e o que devolveu');

  assert.equal(ev.dados.trocaId, linha.id);
  assert.equal(ev.dados.valorOriginal, 100.0);
  assert.equal(ev.dados.dataDaTroca, '2026-09-10');
  prova('e o evento aponta para a troca, em vez de ser o único rastro dela');

  /* A troca estornada sai de toda soma: ninguém deve nada por ela. */
  const contas = await CR.contasAReceber(db, { status: 'aberta' });
  assert.equal((contas.contas ?? []).some((c) => c.chave === `venda:${t.vendaId}`), false);
  assert.equal((contas.contas ?? []).some((c) => c.chave === `troca:${id}`), false);
  prova('e some do A Receber: a peça voltou e a venda foi cancelada');

  const repetido = await G.estornarTroca(db, id, { motivo: 'de novo' });
  assert.equal(repetido.ok, false);
  assert.equal(repetido.statusHttp, 404);
  assert.equal(qtd(raw, '100002'), antes, 'o segundo estorno devolveu peça de novo');
  assert.equal(
    raw.prepare(`SELECT COUNT(*) c FROM garantia_eventos WHERE tipo = 'troca_estornada'`).get().c, 1);
  prova('estornar duas vezes não devolve a peça duas vezes, nem duplica o evento');

  const outra = await G.registrarTroca(db, id, { skuNovo: '100003', data: '2026-09-11' });
  assert.equal(outra.ok, true, `nova troca falhou: ${outra.erro ?? ''}`);
  assert.equal(qtd(raw, '100003'), 48);
  prova('e depois do estorno uma troca nova é possível — que é a razão de a rota existir');

  /* O índice único parcial: uma troca VIVA por garantia, quantas estornadas
     a história exigir. A trava contra o duplo clique não afrouxou. */
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantia_trocas WHERE garantia_id = ?').get(id).c, 2);
  assert.equal(
    raw.prepare('SELECT COUNT(*) c FROM garantia_trocas WHERE garantia_id = ? AND estornada = 0').get(id).c, 1);
  let recusou = false;
  try {
    raw.prepare(
      `INSERT INTO garantia_trocas (garantia_id, data, sku_novo, produto_novo_nome,
         valor_original, valor_novo, diferenca, diferenca_status)
       VALUES (?, '2026-09-11', '100004', 'Anel Igual', 100, 100, 0, 'nenhuma')`).run(id);
  } catch { recusou = true; }
  assert.equal(recusou, true, 'o índice deixou nascer uma SEGUNDA troca viva');
  prova('o índice único parcial: uma troca viva por garantia, e o duplo clique continua barrado');

  const dobrada = await G.registrarTroca(db, id, { skuNovo: '100004', data: '2026-09-11' });
  assert.equal(dobrada.ok, false);
  assert.equal(dobrada.statusHttp, 409);
  prova('e a rota também recusa, antes de chegar ao índice');

  assert.equal(razaoFecha(raw), 0);
  prova('a razão fecha depois de troca, estorno e troca de novo');
}
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = r.garantia.id;
  const antes = qtd(raw, '100002');
  await G.registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-10' });
  await G.pagarDiferencaTroca(db, id, { pagaEm: '2026-09-12' });

  const e = await G.estornarTroca(db, id, { motivo: 'tentando desfazer' });
  assert.equal(e.ok, false);
  assert.equal(e.statusHttp, 409);
  assert.match(e.erro, /já foi paga/);
  assert.equal(qtd(raw, '100002'), antes - 1, 'o estorno recusado mexeu no estoque');
  prova('troca já paga não estorna: desfazer deixaria o dinheiro sem origem');
}

/* ═══════════════════════════════════ 10. venda de origem cancelada */
console.log('\n=== 10. a venda de origem cancelada ===');
{
  const raw = banco(); const db = adaptador(raw);
  raw.exec('UPDATE vendas SET cancelada = 1 WHERE id = 1');
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /está cancelada/);
  prova('não se abre garantia sobre venda cancelada');
}
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  raw.exec('UPDATE vendas SET cancelada = 1 WHERE id = 1');

  const g = await G.lerGarantia(db, r.garantia.id);
  assert.ok(g, 'a garantia sumiu quando a venda foi cancelada');
  prova('a garantia aberta antes continua legível depois do cancelamento');

  /* 5.4b — a compra sumiu depois da abertura. Trocar agora tiraria uma peça
     nova do estoque por uma compra que não existe: recusado, e dito. */
  const antes = qtd(raw, '100002');
  const t = await G.registrarTroca(db, r.garantia.id, { skuNovo: '100002', data: '2026-09-10' });
  assert.equal(t.ok, false);
  assert.equal(t.statusHttp, 409);
  assert.equal(t.vendaCancelada, true);
  assert.match(t.erro, /foi cancelada/);
  assert.equal(qtd(raw, '100002'), antes, 'a recusa mexeu no estoque mesmo assim');
  prova('a troca sobre venda de origem cancelada é recusada, e o estoque nem se mexe');

  /* E o caso não é apagado: continua legível, com a história inteira. */
  const ainda = await G.lerGarantia(db, r.garantia.id);
  assert.equal(ainda.status, 'em_reparo');
  assert.equal(ainda.eventos.length, 1);
  prova('e a garantia continua lá, inteira — recusar a troca não apaga o caso');
  assert.equal(razaoFecha(raw), 0);
}

/* ═══════════════════════════════════ 11. duas unidades iguais */
console.log('\n=== 11. duas unidades do mesmo código, com identidades distintas ===');
{
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'a pedra soltou', dataEntrada: '2026-09-01' });
  assert.equal(a.ok, true);
  assert.equal(a.garantia.vendaItemId, ITEM_A);
  prova('a primeira unidade abre normalmente');

  /* 5.4b — a trava passou a ser por UNIDADE. Duas peças físicas iguais na
     mesma compra têm dois casos, porque são duas peças. */
  const b = await G.abrirGarantia(db, { vendaItemId: ITEM_B, motivo: 'o banho descascou', dataEntrada: '2026-09-02' });
  assert.equal(b.ok, true, `nao abriu: ${b.erro ?? ''}`);
  assert.notEqual(b.garantia.id, a.garantia.id);
  assert.equal(b.garantia.vendaItemId, ITEM_B);
  prova('a segunda unidade FÍSICA do mesmo código abre caso próprio');

  /* O que continua valendo: a MESMA unidade não abre duas vezes. */
  const repetida = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'de novo', dataEntrada: '2026-09-03' });
  assert.equal(repetida.ok, false);
  assert.equal(repetida.statusHttp, 409);
  assert.equal(repetida.garantiaId, a.garantia.id);
  prova('mas a mesma unidade continua recusando a segunda garantia — dois cliques não viram dois casos');

  /* O que já funciona hoje, e não pode regredir: peça de OUTRO código abre. */
  const c = await G.abrirGarantia(db, { vendaItemId: ITEM_C, motivo: 'entortou', dataEntrada: '2026-09-02' });
  assert.equal(c.ok, true);
  assert.notEqual(c.garantia.id, a.garantia.id);
  prova('outra peça da mesma compra abre caso próprio, sem interferência');

  await G.mudarStatusGarantia(db, a.garantia.id, { status: 'devolvida', data: '2026-09-03' });
  const d = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'soltou de novo', dataEntrada: '2026-09-04' });
  assert.equal(d.ok, true, `nao abriu: ${d.erro ?? ''}`);
  prova('e a unidade cujo caso encerrou pode abrir um caso novo');

  assert.equal(razaoFecha(raw), 0);
}
{
  /* O FALLBACK LEGADO, que 5.4b deliberadamente NÃO afrouxou.
     A garantia antiga sem ponteiro confiável pode ser de QUALQUER uma das
     duas unidades — ninguém sabe qual peça voltou. Ela continua travando
     pelo código, como antes, porque distinguir unidades por suposição é
     exatamente o chute que 5.2b se recusou a dar. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  assert.equal(a.ok, true);
  raw.prepare(
    `UPDATE garantias SET venda_item_id = NULL, venda_item_vinculo = 'ambiguo' WHERE id = ?`,
  ).run(a.garantia.id);

  const b = await G.abrirGarantia(db, { vendaItemId: ITEM_B, motivo: 'o banho descascou', dataEntrada: '2026-09-02' });
  assert.equal(b.ok, false);
  assert.equal(b.statusHttp, 409);
  assert.equal(b.garantiaId, a.garantia.id);
  prova('garantia antiga AMBÍGUA continua travando o código inteiro — o fallback não foi afrouxado');

  /* E outro código da mesma compra segue livre: a trava larga alcança o
     código da garantia ambígua, e só ele. */
  const c = await G.abrirGarantia(db, { vendaItemId: ITEM_C, motivo: 'entortou', dataEntrada: '2026-09-02' });
  assert.equal(c.ok, true, `nao abriu: ${c.erro ?? ''}`);
  prova('mas ela não trava a compra inteira: outro código abre normalmente');
}
{
  /* A planilha não entrou nessa: `historico_item_id` sempre foi PK real, e
     a trava dela nunca dependeu do código. */
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`
    INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash, status)
      VALUES (1, 'p.xlsx', 'h', 'importado');
    INSERT INTO vendas_historicas (id, lote_id, chave, regra, data, cliente_nome, cliente_nome_norm, valor_total)
      VALUES (1, 1, 'vitoria|2026-05-01', 'r', '2026-05-01', 'Vitoria', 'vitoria', 200.0);
    INSERT INTO vendas_historico_itens
      (id, lote_id, origem_linha, venda_historica_id, data, sku, sku_base, nome_produto_historico,
       qtd, valor_total, cliente_nome_norm, cliente_nome_original) VALUES
      (1, 1, '1', 1, '2026-05-01', '100001', '100001', 'Anel', 1, 100.0, 'vitoria', 'Vitoria'),
      (2, 1, '2', 1, '2026-05-01', '100001', '100001', 'Anel', 1, 100.0, 'vitoria', 'Vitoria');
  `);
  const p1 = await G.abrirGarantia(db, { historicoItemId: 1, motivo: 'x', dataEntrada: '2026-09-01' });
  const p2 = await G.abrirGarantia(db, { historicoItemId: 2, motivo: 'y', dataEntrada: '2026-09-01' });
  assert.equal(p1.ok, true);
  assert.equal(p2.ok, true, `nao abriu: ${p2.erro ?? ''}`);
  const rep = await G.abrirGarantia(db, { historicoItemId: 1, motivo: 'de novo', dataEntrada: '2026-09-02' });
  assert.equal(rep.ok, false);
  prova('duas linhas iguais da planilha abrem casos próprios, e a mesma linha não abre duas vezes');
}

/* ═══════════════════════════════════ 12. o prazo, e o defeito dele */
console.log('\n=== 12. o relógio do prazo ===');
{
  const raw = banco(); const db = adaptador(raw);
  const r = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-01-05' });
  const id = r.garantia.id;
  await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-01-20' });
  const g = await G.lerGarantia(db, id);

  assert.equal(g.status, 'devolvida');
  assert.equal(g.encerradaEm, '2026-01-20');
  /* 05/01 a 20/01/2026 são 11 dias úteis — bem dentro dos 45. O caso foi
     entregue NO PRAZO, e mesmo assim: */
  /* 05/01 a 20/01/2026 são 11 dias úteis, bem dentro dos 45. */
  assert.equal(g.atrasado, false);
  assert.equal(g.atrasoDiasUteis, 0);
  assert.equal(g.diasUteisDecorridos, 11);
  assert.equal(g.diasUteisRestantes, 34);
  assert.equal(g.contadoAte, '2026-01-20');
  assert.equal(g.relogioParado, true);
  prova('5.4b: o relógio para no encerramento — entregue no prazo não atrasa, e o número não cresce mais');

  /* O que já está certo, e a correção de 5.4b não pode quebrar: enquanto o
     caso está aberto, o atraso é real e tem de aparecer. */
  const aberto = await G.abrirGarantia(db, { vendaItemId: ITEM_C, motivo: 'x', dataEntrada: '2026-01-05' });
  const ga = await G.lerGarantia(db, aberto.garantia.id);
  assert.equal(ga.status, 'em_reparo');
  assert.equal(ga.encerradaEm, null);
  assert.equal(ga.atrasado, true);
  assert.equal(ga.relogioParado, false);
  assert.ok(ga.atrasoDiasUteis > 100, `atraso inesperado: ${ga.atrasoDiasUteis}`);
  prova('caso AINDA ABERTO e fora do prazo continua atrasado — o relógio só para quando encerra');
}

/* ═══════════════════════════════════ 13. painel e ficha da cliente */
console.log('\n=== 13. o que o Painel e a ficha mostram ===');
{
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const c = await G.abrirGarantia(db, { vendaItemId: ITEM_C, motivo: 'y', dataEntrada: '2026-09-02' });
  await G.mudarStatusGarantia(db, c.garantia.id, { status: 'devolvida', data: '2026-09-05' });

  const p = await G.garantiasPendentes(db, { limite: 50 });
  assert.equal(p.total, 1);
  assert.equal(p.pendentes[0].id, a.garantia.id);
  prova('o Painel mostra só o que ainda pede alguma coisa: o caso encerrado sai');

  const daCliente = await G.garantiasDaCliente(db, { clienteId: 1, norm: 'vitoria' });
  assert.equal(daCliente.length, 2);
  prova('mas a ficha da cliente continua com os dois, inteiros');

  const lista = await G.listarGarantias(db, { status: 'devolvida' });
  assert.equal(lista.garantias.length, 1);
  assert.equal(lista.garantias[0].id, c.garantia.id);
  prova('e a lista filtra por status');

  const v = await G.vinculosDeGarantia(db);
  assert.equal(v.resolvidas, 2);
  assert.equal(v.ambiguas, 0);
  assert.equal(v.semMatch, 0);
  prova('as duas nasceram com ponteiro direto: nenhuma pendência de vínculo (5.2b)');
}

/* ═══════════════════════════════════ 14. venda histórica */
console.log('\n=== 14. a compra que veio da planilha ===');
{
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`
    INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash, status)
      VALUES (1, 'planilha.xlsx', 'hash-1', 'importado');
    INSERT INTO vendas_historicas (id, lote_id, chave, regra, data, cliente_nome, cliente_nome_norm, valor_total)
      VALUES (1, 1, 'vitoria|2026-05-01', 'mesmo nome e mesma data', '2026-05-01', 'Vitoria', 'vitoria', 100.0);
    INSERT INTO vendas_historico_itens
      (id, lote_id, origem_linha, venda_historica_id, data, sku, sku_base, nome_produto_historico,
       qtd, valor_total, cliente_nome_norm, cliente_nome_original)
      VALUES (1, 1, '1', 1, '2026-05-01', '100001', '100001', 'Anel Solitário',
              1, NULL, 'vitoria', 'Vitoria');
  `);
  const r = await G.abrirGarantia(db, { historicoItemId: 1, motivo: 'x', dataEntrada: '2026-09-01' });
  assert.equal(r.ok, true, `abertura falhou: ${r.erro ?? ''}`);
  assert.equal(r.garantia.origemFonte, 'historico');
  assert.equal(r.garantia.historicoItemId, 1);
  assert.equal(r.garantia.valorPagoOriginal, null);
  assert.equal(r.garantia.vendaItemVinculo, 'nao_se_aplica');
  prova('a peça da planilha abre garantia mesmo sem valor conhecido');

  const t = await G.registrarTroca(db, r.garantia.id, { skuNovo: '100002', data: '2026-09-10' });
  assert.equal(t.ok, false);
  assert.equal(t.statusHttp, 409);
  assert.match(t.erro, /Não sei quanto ela pagou/);
  prova('mas a TROCA para: sem saber o que ela pagou, a diferença seria chute (§2)');

  const t2 = await G.registrarTroca(db, r.garantia.id, { skuNovo: '100002', data: '2026-09-10', valorOriginal: 100 });
  assert.equal(t2.ok, true);
  assert.equal(t2.diferenca, 100.0);
  prova('com o valor informado por gente, a troca segue normalmente');

  assert.equal(razaoFecha(raw), 0);
}

/* ═══════════════════════════════════ 15. o novo atendimento (5.4e) */
console.log('\n=== 15. novo atendimento da mesma peça: 7 dias úteis + etiqueta ===');
{
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'a pedra soltou', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;

  const cedo = await G.reabrirGarantia(db, id, { motivo: 'soltou de novo', etiquetaPreservada: true });
  assert.equal(cedo.ok, false);
  assert.equal(cedo.statusHttp, 409);
  assert.match(cedo.erro, /não terminou/);
  prova('não se reabre um caso que ainda está aberto — não há o que reabrir');

  await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-09-07' });

  /* A etiqueta é o único dado que o sistema não tem como saber sozinho. Ele
     não assume: exige a confirmação, e distingue "ninguém perguntou" de
     "perguntaram e a etiqueta não estava". */
  const semConfirmar = await G.reabrirGarantia(db, id, { motivo: 'soltou de novo' });
  assert.equal(semConfirmar.ok, false);
  assert.equal(semConfirmar.statusHttp, 400);
  assert.equal(semConfirmar.precisaConfirmar, 'etiquetaPreservada');
  prova('sem confirmar a etiqueta o backend PARA — ele não tem como saber, e não assume');

  const semEtiqueta = await G.reabrirGarantia(db, id, { motivo: 'soltou', etiquetaPreservada: false });
  assert.equal(semEtiqueta.ok, false);
  assert.equal(semEtiqueta.statusHttp, 409);
  assert.match(semEtiqueta.erro, /etiqueta foi removida/);
  prova('etiqueta removida: a troca não é autorizada, e o motivo é dito');

  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantias').get().c, 1);
  prova('e nenhuma das recusas criou caso nenhum');

  const r = await G.reabrirGarantia(db, id, {
    motivo: 'a pedra soltou de novo', etiquetaPreservada: true, dataEntrada: '2026-09-10',
  });
  assert.equal(r.ok, true, `reabertura falhou: ${r.erro ?? ''}`);
  assert.notEqual(r.garantia.id, id);
  prova('dentro do prazo e com a etiqueta: nasce um caso NOVO, não uma edição do antigo');

  /* O caso anterior permanece encerrado, inteiro. É o ponto da decisão. */
  const antigo = await G.lerGarantia(db, id);
  assert.equal(antigo.status, 'devolvida');
  assert.equal(antigo.encerradaEm, '2026-09-07');
  assert.equal(antigo.pendente, false);
  assert.equal(antigo.relogioParado, true);
  prova('o atendimento anterior continua encerrado, com a data da entrega intacta');

  /* E os dois ciclos ficam ligados, legíveis dos dois lados. */
  assert.equal(r.garantia.garantiaAnteriorId, id);
  assert.equal(r.garantia.reabertura.deGarantiaId, id);
  assert.equal(r.garantia.reabertura.etiquetaPreservada, true);
  assert.equal(r.garantia.reabertura.diasUteisDesdeAEntrega, 3);
  assert.ok(antigo.eventos.some((e) => e.tipo === 'reaberta_em_novo_caso'
    && e.dados.novaGarantiaId === r.garantia.id));
  prova('os dois ciclos ficam ligados: o novo diz de quem veio, o antigo diz para onde foi');

  /* Cada ciclo tem o próprio prazo e os próprios eventos. */
  assert.equal(r.garantia.status, 'em_reparo');
  assert.equal(r.garantia.dataEntrada, '2026-09-10');
  assert.equal(r.garantia.encerradaEm, null);
  assert.deepEqual(r.garantia.eventos.map((e) => e.tipo), ['aberta']);
  assert.equal(r.garantia.valorPagoOriginal, 100.0, 'o valor pago na compra se perdeu no caso novo');
  assert.equal(r.garantia.vendaItemId, ITEM_A, 'o caso novo aponta para outra unidade');
  prova('e o caso novo começa do zero: prazo próprio, eventos próprios, mesma peça e mesmo valor pago');

  /* §31 vale para o caso novo tanto quanto para o primeiro. */
  assert.equal(r.faturamento, 0);
  assert.equal(r.estoqueAlterado, false);
  assert.equal(r.vendaOriginalAlterada, false);
  assert.equal(qtd(raw, '100001'), 48);
  assert.equal(razaoFecha(raw), 0);
  prova('reabrir não toca venda, estoque nem faturamento');

  /* A unidade não tem dois casos abertos ao mesmo tempo. */
  const outra = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'terceira vez', dataEntrada: '2026-09-11' });
  assert.equal(outra.ok, false);
  assert.equal(outra.statusHttp, 409);
  prova('e a unidade continua com um caso aberto de cada vez');
}
{
  /* O PRAZO. 7 dias ÚTEIS, não corridos, contados do dia da entrega. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-08-01' });
  await G.mudarStatusGarantia(db, a.garantia.id, { status: 'devolvida', data: '2026-08-03' });

  /* 03/08/2026 é uma segunda. 7 dias úteis depois é 12/08 (quarta): o fim de
     semana de 08 e 09 não conta. Em dias CORRIDOS 12/08 seriam 9 dias, e é
     essa a diferença que a regra exige. */
  const noLimite = await G.reabrirGarantia(db, a.garantia.id, {
    motivo: 'voltou', etiquetaPreservada: true, dataEntrada: '2026-08-12',
  });
  assert.equal(noLimite.ok, true, `no limite deveria passar: ${noLimite.erro ?? ''}`);
  assert.equal(noLimite.diasUteisDesdeAEntrega, 7);
  prova('7 dias úteis é o limite, e o fim de semana no meio não consome prazo');
}
{
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-08-01' });
  await G.mudarStatusGarantia(db, a.garantia.id, { status: 'devolvida', data: '2026-08-03' });

  const tarde = await G.reabrirGarantia(db, a.garantia.id, {
    motivo: 'voltou', etiquetaPreservada: true, dataEntrada: '2026-08-13',
  });
  assert.equal(tarde.ok, false);
  assert.equal(tarde.statusHttp, 409);
  assert.equal(tarde.diasUteisDecorridos, 8);
  assert.equal(tarde.prazoDiasUteis, 7);
  assert.match(tarde.erro, /prazo para um novo atendimento/);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantias').get().c, 1);
  prova('um dia útil depois do limite já é recusado, e nenhum caso nasce');
}
{
  /* Feriado cadastrado também não conta — a mesma régua do prazo de reparo,
     e a prova de que a infraestrutura de dias úteis está sendo usada. */
  const raw = banco(); const db = adaptador(raw);
  raw.exec(`INSERT INTO feriados (data, nome) VALUES ('2026-08-12', 'Feriado de teste')`);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-08-01' });
  await G.mudarStatusGarantia(db, a.garantia.id, { status: 'devolvida', data: '2026-08-03' });

  const r = await G.reabrirGarantia(db, a.garantia.id, {
    motivo: 'voltou', etiquetaPreservada: true, dataEntrada: '2026-08-13',
  });
  assert.equal(r.ok, true, `o feriado deveria ter devolvido um dia: ${r.erro ?? ''}`);
  assert.equal(r.diasUteisDecorridos ?? r.diasUteisDesdeAEntrega, 7);
  assert.equal(r.consideraFeriados, true);
  prova('feriado cadastrado devolve um dia de prazo: dias úteis de verdade, não corridos');
}
{
  /* Casos que não têm de onde contar. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'engano', dataEntrada: '2026-09-01' });
  await G.mudarStatusGarantia(db, a.garantia.id, { status: 'cancelada', data: '2026-09-02' });
  const r = await G.reabrirGarantia(db, a.garantia.id, { motivo: 'x', etiquetaPreservada: true });
  assert.equal(r.ok, false);
  assert.match(r.erro, /nunca foi um atendimento/);
  prova('caso CANCELADO não reabre: ele nunca foi atendimento, e a peça abre garantia normal');

  const nova = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'agora sim', dataEntrada: '2026-09-03' });
  assert.equal(nova.ok, true, `nao abriu: ${nova.erro ?? ''}`);
  prova('e a garantia normal daquela peça abre sem problema');
}
{
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  await G.mudarStatusGarantia(db, a.garantia.id, { status: 'devolvida', data: '2026-09-07' });
  const antes = await G.reabrirGarantia(db, a.garantia.id, {
    motivo: 'x', etiquetaPreservada: true, dataEntrada: '2026-09-05',
  });
  assert.equal(antes.ok, false);
  assert.equal(antes.statusHttp, 400);
  assert.match(antes.erro, /antes de ter sido entregue/);
  prova('a peça não pode ter voltado antes de ter sido entregue');

  const futuro = await G.reabrirGarantia(db, a.garantia.id, {
    motivo: 'x', etiquetaPreservada: true, dataEntrada: '2099-01-01',
  });
  assert.equal(futuro.ok, false);
  prova('nem numa data que ainda não chegou');
}
{
  /* O ciclo completo: primeiro atendimento devolve a peça, o segundo troca.
     Os dois existem, cada um com a própria história. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'pedra solta', dataEntrada: '2026-09-01' });
  await G.mudarStatusGarantia(db, a.garantia.id, { status: 'reparada', data: '2026-09-04' });
  await G.mudarStatusGarantia(db, a.garantia.id, { status: 'devolvida', data: '2026-09-07' });

  const r = await G.reabrirGarantia(db, a.garantia.id, {
    motivo: 'soltou de novo', etiquetaPreservada: true, dataEntrada: '2026-09-09',
  });
  const antesQtd = qtd(raw, '100002');
  const t = await G.registrarTroca(db, r.garantia.id, { skuNovo: '100002', data: '2026-09-10' });
  assert.equal(t.ok, true, `troca falhou: ${t.erro ?? ''}`);
  assert.equal(qtd(raw, '100002'), antesQtd - 1);
  assert.equal(t.diferenca, 100.0);
  prova('o segundo atendimento troca normalmente, com o valor pago na compra original');

  const antigo = await G.lerGarantia(db, a.garantia.id);
  assert.equal(antigo.status, 'devolvida');
  assert.equal(antigo.troca, null, 'a troca do caso novo vazou para o antigo');
  assert.equal((await G.lerGarantia(db, r.garantia.id)).status, 'sem_conserto');
  prova('e a troca fica no ciclo em que aconteceu — o anterior segue como terminou');

  /* A cadeia inteira aparece na ficha da cliente. */
  const daCliente = await G.garantiasDaCliente(db, { clienteId: 1, norm: 'vitoria' });
  assert.equal(daCliente.length, 2);
  assert.equal(daCliente.filter((g) => g.garantiaAnteriorId != null).length, 1);
  prova('a ficha da cliente mostra os dois atendimentos, e qual deles veio do outro');

  assert.equal(razaoFecha(raw), 0);
  prova('a razão fecha depois do ciclo inteiro');
}

/* ═══════════════════════════════════ 16. corrigir status lançado errado (5.4f) */
console.log('\n=== 16. correção de status: o operador clicou errado ===');
{
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'a pedra soltou', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;
  await G.mudarStatusGarantia(db, id, { status: 'reparada', data: '2026-09-04' });
  await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-09-05' });

  const semMotivo = await G.corrigirStatusGarantia(db, id, {});
  assert.equal(semMotivo.ok, false);
  assert.equal(semMotivo.statusHttp, 400);
  assert.equal((await G.lerGarantia(db, id)).status, 'devolvida');
  prova('corrigir sem dizer por quê é recusado, e nada muda');

  const antesEventos = (await G.lerGarantia(db, id)).eventos.length;
  const c = await G.corrigirStatusGarantia(db, id, { motivo: 'cliquei em devolvida sem querer' });
  assert.equal(c.ok, true, `correção falhou: ${c.erro ?? ''}`);
  assert.equal(c.statusIncorreto, 'devolvida');
  assert.equal(c.statusRestaurado, 'reparada');
  assert.equal(c.encerradaEmDesfeita, '2026-09-05');
  prova('o encerramento lançado por engano é corrigido, e a resposta diz o que era e o que voltou');

  /* O ESTADO ATUAL volta atrás. */
  const g = await G.lerGarantia(db, id);
  assert.equal(g.status, 'reparada');
  assert.equal(g.encerradaEm, null, 'o encerramento que nunca existiu continua na coluna');
  assert.equal(g.pendente, true);
  assert.equal(g.relogioParado, false);
  prova('o estado atual volta para onde estava, e o caso volta a pendente com o relógio andando');

  /* O HISTÓRICO não volta. É a linha divisória da fase inteira. */
  const tipos = g.eventos.map((e) => e.tipo);
  assert.deepEqual(tipos, ['aberta', 'status', 'devolvida', 'status_corrigido']);
  assert.equal(g.eventos.length, antesEventos + 1, 'a correção apagou algum evento');
  const errado = g.eventos.find((e) => e.tipo === 'devolvida');
  assert.ok(errado, 'o evento do encerramento errado sumiu');
  assert.equal(errado.data, '2026-09-05');
  assert.equal(errado.statusNovo, 'devolvida');
  prova('§28: o evento do encerramento errado PERMANECE, com a data em que foi lançado');

  const corr = g.eventos.at(-1);
  assert.equal(corr.tipo, 'status_corrigido');
  assert.equal(corr.observacao, 'cliquei em devolvida sem querer');
  assert.equal(corr.dados.statusIncorreto, 'devolvida');
  assert.equal(corr.dados.statusRestaurado, 'reparada');
  assert.equal(corr.dados.eventoCorrigidoId, errado.id);
  assert.equal(corr.dados.lancadoEm, '2026-09-05');
  assert.equal(corr.dados.encerradaEmDesfeita, '2026-09-05');
  prova('e o evento de correção aponta para o que foi desfeito, com o encerramento que sumiu da coluna');

  /* §31: correção de status é só status. */
  assert.equal(c.faturamento, 0);
  assert.equal(c.estoqueAlterado, false);
  assert.equal(c.vendaOriginalAlterada, false);
  assert.equal(qtd(raw, '100001'), 48);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantia_trocas').get().c, 0);
  assert.equal(razaoFecha(raw), 0);
  prova('corrigir status não move peça nem dinheiro: estoque, trocas e razão intactos');

  /* E o caso corrigido volta a andar normalmente. */
  const dev = await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-09-08' });
  assert.equal(dev.ok, true, `nao seguiu: ${dev.erro ?? ''}`);
  assert.equal(dev.garantia.encerradaEm, '2026-09-08');
  prova('e depois de corrigido o caso segue o fluxo normal, encerrando quando for a hora');
}
{
  /* A dupla tentativa. Depois da primeira correção o caso não está mais
     encerrado, e a segunda não tem o que desfazer. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;
  await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-09-05' });

  const um = await G.corrigirStatusGarantia(db, id, { motivo: 'engano' });
  assert.equal(um.ok, true);
  const dois = await G.corrigirStatusGarantia(db, id, { motivo: 'engano de novo' });
  assert.equal(dois.ok, false);
  assert.equal(dois.statusHttp, 409);
  assert.match(dois.erro, /não é um encerramento/);

  const g = await G.lerGarantia(db, id);
  assert.equal(g.status, 'em_reparo');
  assert.equal(g.eventos.filter((e) => e.tipo === 'status_corrigido').length, 1);
  assert.deepEqual(g.eventos.map((e) => e.tipo), ['aberta', 'devolvida', 'status_corrigido']);
  prova('corrigir duas vezes não corrompe nada: a segunda é recusada e o histórico não duplica');
}
{
  /* Cancelada por engano também se corrige — é o caso mais provável de
     todos, porque cancelar é irreversível por qualquer outro caminho. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;
  await G.mudarStatusGarantia(db, id, { status: 'cancelada', data: '2026-09-02' });
  const c = await G.corrigirStatusGarantia(db, id, { motivo: 'cancelei a garantia errada' });
  assert.equal(c.ok, true, `correção falhou: ${c.erro ?? ''}`);
  assert.equal(c.statusRestaurado, 'em_reparo');
  const g = await G.lerGarantia(db, id);
  assert.equal(g.status, 'em_reparo');
  assert.ok(g.eventos.some((e) => e.tipo === 'cancelada'));
  prova('cancelada por engano também se corrige, e o cancelamento continua no histórico');
}
{
  /* O BLOQUEIO 1: já existe um novo atendimento nascido deste encerramento. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;
  await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-09-05' });
  const nova = await G.reabrirGarantia(db, id, {
    motivo: 'voltou de verdade', etiquetaPreservada: true, dataEntrada: '2026-09-08',
  });
  assert.equal(nova.ok, true);

  const c = await G.corrigirStatusGarantia(db, id, { motivo: 'na verdade foi engano' });
  assert.equal(c.ok, false);
  assert.equal(c.statusHttp, 409);
  assert.equal((await G.lerGarantia(db, id)).status, 'devolvida', 'fez rollback mesmo com filho');
  prova('bloqueio: encerramento que já gerou novo atendimento não se corrige em silêncio');
  assert.ok(c.efeitosPosteriores || c.novaGarantiaId, 'a recusa não disse o que encontrou');
}
{
  /* O BLOQUEIO 2: pagamento depois do encerramento. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;
  const t = await G.registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-02' });
  assert.equal(t.ok, true);
  await G.mudarStatusGarantia(db, id, { status: 'concluida', data: '2026-09-03' });
  const pg = await G.pagarDiferencaTroca(db, id, { pagaEm: '2026-09-04' });
  assert.equal(pg.ok, true, `pagamento falhou: ${pg.erro ?? ''}`);

  const c = await G.corrigirStatusGarantia(db, id, { motivo: 'conclui sem querer' });
  assert.equal(c.ok, false);
  assert.equal(c.statusHttp, 409);
  assert.equal(c.efeitosPosteriores.length, 1);
  assert.equal(c.efeitosPosteriores[0].tipo, 'diferenca_paga');
  assert.equal((await G.lerGarantia(db, id)).status, 'concluida');
  prova('bloqueio: dinheiro que entrou depois do encerramento impede a correção simples');
  prova('e a recusa NOMEIA o efeito posterior, em vez de só negar');
}
{
  /* O BLOQUEIO 3: estorno depois do encerramento. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;
  await G.registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-02' });
  await G.mudarStatusGarantia(db, id, { status: 'concluida', data: '2026-09-03' });
  const e = await G.estornarTroca(db, id, { motivo: 'sku errado' });
  assert.equal(e.ok, true, `estorno falhou: ${e.erro ?? ''}`);

  const c = await G.corrigirStatusGarantia(db, id, { motivo: 'engano' });
  assert.equal(c.ok, false);
  assert.equal(c.efeitosPosteriores.map((x) => x.tipo).join(','), 'troca_estornada');
  prova('bloqueio: estorno posterior ao encerramento também trava a correção');
}
{
  /* A parede do terminal fechou a porta lateral: `concluida` não troca peça.
     Antes a troca gravava `sem_conserto` por cima de um caso encerrado. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;
  await G.mudarStatusGarantia(db, id, { status: 'concluida', data: '2026-09-03' });
  const antes = qtd(raw, '100002');
  const t = await G.registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-04' });
  assert.equal(t.ok, false);
  assert.equal(t.statusHttp, 409);
  assert.equal((await G.lerGarantia(db, id)).status, 'concluida');
  assert.equal(qtd(raw, '100002'), antes, 'a troca recusada baixou estoque');
  prova('5.4f: caso CONCLUÍDO não troca peça — a porta lateral do terminal fechou');
}
{
  /* Correção e reabertura continuam sendo fluxos diferentes, e nenhum dos
     dois sabe fazer o trabalho do outro. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-08-01' });
  const id = a.garantia.id;
  await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-08-03' });

  /* Muito depois dos 7 dias úteis: a reabertura recusa... */
  const reab = await G.reabrirGarantia(db, id, {
    motivo: 'voltou', etiquetaPreservada: true, dataEntrada: '2026-09-01',
  });
  assert.equal(reab.ok, false);
  assert.match(reab.erro, /prazo para um novo atendimento/);

  /* ...e a correção NÃO aplica prazo nenhum, porque a peça nunca voltou:
     o que se desfaz é o clique, e ele não tem validade de 7 dias. */
  const c = await G.corrigirStatusGarantia(db, id, { motivo: 'aquele encerramento foi engano' });
  assert.equal(c.ok, true, `correção falhou: ${c.erro ?? ''}`);
  assert.equal(c.statusRestaurado, 'em_reparo');
  prova('a regra dos 7 dias NÃO é acionada numa correção: ela não é um novo atendimento');

  const g = await G.lerGarantia(db, id);
  assert.equal(g.garantiaAnteriorId, null);
  assert.equal(g.reabertura, null);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantias').get().c, 1);
  prova('e a correção não cria caso novo nem pede etiqueta — corrigir não é reabrir');
}
{
  /* O caso que o sistema se recusa a adivinhar: evento antigo sem o estado
     de origem gravado. Ele PARA em vez de escolher um estado plausível. */
  const raw = banco(); const db = adaptador(raw);
  const a = await G.abrirGarantia(db, { vendaItemId: ITEM_A, motivo: 'x', dataEntrada: '2026-09-01' });
  const id = a.garantia.id;
  await G.mudarStatusGarantia(db, id, { status: 'devolvida', data: '2026-09-05' });
  raw.prepare(
    `UPDATE garantia_eventos SET dados_json = '{}' WHERE garantia_id = ? AND status_novo = 'devolvida'`,
  ).run(id);

  const c = await G.corrigirStatusGarantia(db, id, { motivo: 'engano' });
  assert.equal(c.ok, false);
  assert.equal(c.statusHttp, 409);
  assert.match(c.erro, /não vou adivinhar/);
  assert.equal((await G.lerGarantia(db, id)).status, 'devolvida');
  prova('§2: sem saber de onde o caso veio, a correção PARA em vez de chutar um estado');
}

console.log(`\n✓ ${provas} provas — ciclo completo de Garantias (5.4a)`);
console.log('     ~~ marcaria comportamento ATUAL com defeito conhecido.');
console.log('        Nenhuma sobrou: 5.4b–5.4e fecharam as sete.\n');
