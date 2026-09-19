/** A garantia aponta para a LINHA da venda — Fase 5.2b, contra o schema real.
 *
 *  `garantias` guardava a origem operacional como (venda_id, sku,
 *  variante_id). O schema afirmava que o trio identificava a linha "sem
 *  ambiguidade". Duas regras desmentiram isso:
 *
 *    §27  o preço é POR ITEM. Duas unidades do mesmo código na mesma venda,
 *         com preços diferentes, são duas linhas — e o trio casa as duas.
 *    §41  corrigir o código do item reescreve `venda_itens.sku`. O trio
 *         passa a apontar para uma combinação que não existe mais.
 *
 *  Desde 5.2 existe `venda_itens.id`. Esta fase troca o ponteiro.
 *
 *  O que precisa ficar provado:
 *
 *   1. banco antigo → migration, e os dois caminhos chegam à mesma tabela
 *      (esta segunda metade é o gate `schema-migration-coerencia`);
 *   2. match único vira ponteiro correto;
 *   3. match ambíguo NÃO recebe chute — fica sem ponteiro, e classificado;
 *   4. sem match NÃO recebe chute;
 *   5. o valor pago desempata quando desempata, e só então;
 *   6. garantia nova grava `venda_item_id`;
 *   7. duas linhas do mesmo SKU: o caminho sem id PERGUNTA em vez de escolher;
 *   8. variante e Monte seu Colar;
 *   9. origem histórica continua inteira, e é marcada `nao_se_aplica`;
 *  10. §41: corrigir o código depois NÃO solta o ponteiro;
 *  11. troca, diferença e estorno continuam funcionando;
 *  12. dado antigo permanece legível: o trio não foi apagado;
 *  13. a migration roda duas vezes sem estragar nada, e o rollback volta;
 *  14. nada disso move estoque — a razão continua fechando.
 *
 *      node src/garantia-venda-item-test.mjs
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

/** Divide um .sql respeitando string literal E comentário de linha. */
function dividirSql(sql) {
  const fora = [];
  let atual = '';
  let dentro = false;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (!dentro && c === '-' && sql[i + 1] === '-') {
      const fim = sql.indexOf('\n', i);
      i = fim === -1 ? sql.length : fim;
      continue;
    }
    if (c === "'") { dentro = !dentro; atual += c; continue; }
    if (c === ';' && !dentro) { fora.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim()) fora.push(atual.trim());
  return fora.filter(Boolean);
}

function comandos(sql) {
  const partes = dividirSql(sql);
  const saida = [];
  let acumulado = null;
  for (const parte of partes) {
    if (acumulado !== null) {
      acumulado += `;\n${parte}`;
      if (/(^|\s)END$/i.test(parte.trim())) { saida.push(acumulado); acumulado = null; }
      continue;
    }
    if (/^CREATE\s+TRIGGER/i.test(parte)) {
      if (/(^|\s)END$/i.test(parte.trim())) saida.push(parte);
      else acumulado = parte;
      continue;
    }
    saida.push(parte);
  }
  if (acumulado !== null) saida.push(acumulado);
  return saida;
}

function aplicar(raw, arquivo) {
  const avisos = [];
  for (const comando of comandos(ler(arquivo))) {
    try {
      raw.exec(comando);
    } catch (e) {
      if (/duplicate column name/i.test(String(e.message))) { avisos.push(e.message); continue; }
      throw new Error(`${arquivo}: ${e.message}\n${comando.slice(0, 160)}`);
    }
  }
  return avisos;
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

/* §1: o saldo nasce pela razão. Escrever `produtos.qtd` direto deixaria a
   invariante quebrada antes do primeiro cenário, e o teste mediria o defeito
   do próprio cenário em vez do código. */
const SEED = `
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitário',  'Anel',  100.0, 50),
  ('100002', 'Colar Veneziana', 'Colar', 200.0, 50),
  ('100003', 'Anel Aparador',   'Anel',   80.0, 50);
INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES
  ('100001', 'entrada', 50, 'importacao', 'carga inicial do teste'),
  ('100002', 'entrada', 50, 'importacao', 'carga inicial do teste'),
  ('100003', 'entrada', 50, 'importacao', 'carga inicial do teste');
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, cancelada, pago)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 600.0, 0, 1);
`;

/** O banco como ele está HOJE: com a identidade de linha da 5.2, mas ainda
 *  SEM o ponteiro da garantia. Construído desfazendo os artefatos de 5.2b —
 *  o SQLite dizendo "a coluna sumiu" é prova; um `replace` que casou é
 *  esperança, e ler do git faria o teste se comparar consigo mesmo. */
function bancoAntesDe52b() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  aplicar(raw, 'api/migracao-pos-golive-1.sql');
  raw.exec(`
    DROP INDEX IF EXISTS idx_gar_venda_item;
    DROP INDEX IF EXISTS idx_gar_vinculo;
    ALTER TABLE garantias DROP COLUMN venda_item_id;
    ALTER TABLE garantias DROP COLUMN venda_item_vinculo;
  `);
  const cols = raw.prepare(`SELECT name FROM pragma_table_info('garantias')`).all().map((r) => r.name);
  assert.ok(!cols.includes('venda_item_id'),
    'o ponto de partida já tinha o ponteiro — o teste não prova nada');
  raw.exec(SEED);
  return raw;
}

const garantiaAntiga = (raw, campos) => {
  const c = {
    origem_fonte: 'operacional', venda_id: 1, sku: '100001', variante_id: null,
    variacao: null, valor_pago_original: 100.0, cliente_id: 1, cliente_nome: 'Vitoria',
    cliente_nome_norm: 'vitoria', produto_nome: 'Anel Solitário', data_venda: '2026-09-01',
    data_entrada: '2026-09-05', prazo_dias_uteis: 45, previsao_retorno: '2026-11-07',
    motivo: 'A pedra soltou', status: 'em_reparo', ...campos,
  };
  const cols = Object.keys(c);
  raw.prepare(
    `INSERT INTO garantias (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
  ).run(...cols.map((k) => c[k]));
  return raw.prepare('SELECT last_insert_rowid() id').get().id;
};

const vinculo = (raw, id) => raw.prepare(
  'SELECT venda_item_id, venda_item_vinculo FROM garantias WHERE id = ?').get(id);

const razaoFecha = (raw) => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.soma, 0)`).get().n;

console.log('\n=== 1. backfill: match ÚNICO ===');
{
  const raw = bancoAntesDe52b();
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100001', 'Anel Solitário',  1, 100.0, 'aaaaaaaa-1111-4111-8111-111111111111'),
      (1, '100002', 'Colar Veneziana', 1, 200.0, 'bbbbbbbb-2222-4222-8222-222222222222');
  `);
  const g = garantiaAntiga(raw, { sku: '100001' });

  const avisos = aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  assert.equal(avisos.length, 0, 'a primeira rodada não deveria reclamar de nada');

  const v = vinculo(raw, g);
  assert.equal(v.venda_item_id, 'aaaaaaaa-1111-4111-8111-111111111111');
  assert.equal(v.venda_item_vinculo, 'backfill_unico');
  prova('uma linha possível: o ponteiro aponta para ELA, e o motivo fica registrado');

  const antigo = raw.prepare('SELECT venda_id, sku, variante_id FROM garantias WHERE id = ?').get(g);
  assert.equal(antigo.venda_id, 1);
  assert.equal(antigo.sku, '100001');
  prova('o trio antigo continua intacto: a migration não apaga a prova de como a garantia foi aberta');

  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  assert.deepEqual(vinculo(raw, g), v);
  prova('a segunda rodada é inofensiva: nada é reclassificado');
}

console.log('\n=== 2. backfill: match AMBÍGUO — o sistema NÃO escolhe ===');
{
  const raw = bancoAntesDe52b();
  /* §27 em estado puro: duas unidades do mesmo anel, na mesma venda, pelo
     MESMO preço. Nem o trio nem o valor desempatam. */
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100001', 'Anel Solitário', 1, 100.0, 'cccccccc-3333-4333-8333-333333333333'),
      (1, '100001', 'Anel Solitário', 1, 100.0, 'dddddddd-4444-4444-8444-444444444444');
  `);
  const g = garantiaAntiga(raw, { sku: '100001', valor_pago_original: 100.0 });

  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  const v = vinculo(raw, g);
  assert.equal(v.venda_item_id, null, 'o backfill ESCOLHEU uma das duas — é exatamente o que não pode');
  assert.equal(v.venda_item_vinculo, 'ambiguo');
  prova('duas linhas possíveis: nenhum ponteiro, e a pendência registrada na própria linha');

  const { vinculosDeGarantia } = await mod('api/src/garantias.js');
  const r = await vinculosDeGarantia(adaptador(raw));
  assert.equal(r.ambiguas, 1);
  assert.equal(r.casos.length, 1);
  assert.equal(r.casos[0].candidatas.length, 2);
  assert.deepEqual(r.casos[0].candidatas.map((c) => c.vendaItemId).sort(),
    ['cccccccc-3333-4333-8333-333333333333', 'dddddddd-4444-4444-8444-444444444444']);
  prova('o relatório mostra as DUAS candidatas — "ambíguo" sem as opções seria só uma reclamação');
}

console.log('\n=== 3. backfill: o VALOR desempata, e só quando desempata ===');
{
  const raw = bancoAntesDe52b();
  /* Mesmo código, mesma venda, preços diferentes (§27). `valor_pago_original`
     foi copiado de `venda_itens.preco` na abertura: se só uma linha foi
     cobrada por aquele valor, ela É a linha — chave mais forte, não
     preferência arbitrária. */
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100001', 'Anel Solitário', 1, 100.0, 'eeeeeeee-5555-4555-8555-555555555555'),
      (1, '100001', 'Anel Solitário', 1,  60.0, 'ffffffff-6666-4666-8666-666666666666');
  `);
  const gBarata = garantiaAntiga(raw, { sku: '100001', valor_pago_original: 60.0 });

  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  const v = vinculo(raw, gBarata);
  assert.equal(v.venda_item_id, 'ffffffff-6666-4666-8666-666666666666');
  assert.equal(v.venda_item_vinculo, 'backfill_unico_valor');
  prova('a peça que saiu com desconto casa a linha do desconto, não a de tabela');
}
{
  const raw = bancoAntesDe52b();
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100001', 'Anel Solitário', 1, 100.0, 'eeeeeeee-5555-4555-8555-555555555555'),
      (1, '100001', 'Anel Solitário', 1,  60.0, 'ffffffff-6666-4666-8666-666666666666');
  `);
  /* Valor que não bate com nenhuma das duas: o desempate não se aplica, e o
     caso volta a ser ambíguo em vez de casar "a mais próxima". */
  const g = garantiaAntiga(raw, { sku: '100001', valor_pago_original: 77.0 });
  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  assert.equal(vinculo(raw, g).venda_item_id, null);
  assert.equal(vinculo(raw, g).venda_item_vinculo, 'ambiguo');
  prova('valor que não bate com nenhuma candidata NÃO vira "a mais próxima"');
}

console.log('\n=== 4. backfill: SEM match — o sistema NÃO inventa ===');
{
  const raw = bancoAntesDe52b();
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100002', 'Colar Veneziana', 1, 200.0, 'bbbbbbbb-2222-4222-8222-222222222222');
  `);
  const g = garantiaAntiga(raw, { sku: '100001' });
  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  const v = vinculo(raw, g);
  assert.equal(v.venda_item_id, null, 'inventou um ponteiro onde não havia linha nenhuma');
  assert.equal(v.venda_item_vinculo, 'sem_match');
  prova('nenhuma linha possível: sem ponteiro, e o caso fica visível no relatório');

  const { vinculosDeGarantia } = await mod('api/src/garantias.js');
  const r = await vinculosDeGarantia(adaptador(raw));
  assert.equal(r.semMatch, 1);
  assert.equal(r.casos[0].motivo, 'sem_match');
  prova('e o relatório separa "não achei" de "achei demais"');
}

console.log('\n=== 5. variante: o trio ainda desempata quando a variante difere ===');
{
  const raw = bancoAntesDe52b();
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, variacao, variante_id, id) VALUES
      (1, '100001', 'Anel Solitário', 1, 100.0, 'Aro 16', '4242', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      (1, '100001', 'Anel Solitário', 1, 100.0, 'Aro 18', '4343', '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  `);
  const g16 = garantiaAntiga(raw, { sku: '100001', variante_id: '4242', variacao: 'Aro 16' });
  const g18 = garantiaAntiga(raw, { sku: '100001', variante_id: '4343', variacao: 'Aro 18' });
  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  assert.equal(vinculo(raw, g16).venda_item_id, '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(vinculo(raw, g18).venda_item_id, '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  prova('dois aros do mesmo anel: cada garantia casa o SEU, sem ambiguidade');
}
{
  const raw = bancoAntesDe52b();
  /* A garantia sem variante_id e a linha COM: `IS` distingue, e o caso é
     honestamente "sem match" — não uma casada por aproximação. */
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, variacao, variante_id, id) VALUES
      (1, '100001', 'Anel Solitário', 1, 100.0, 'Aro 16', '4242', '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  `);
  const g = garantiaAntiga(raw, { sku: '100001', variante_id: null });
  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  assert.equal(vinculo(raw, g).venda_item_id, null);
  assert.equal(vinculo(raw, g).venda_item_vinculo, 'sem_match');
  prova('garantia sem variante não casa linha COM variante por aproximação');
}

console.log('\n=== 6. origem histórica: a pergunta não se aplica ===');
{
  const raw = bancoAntesDe52b();
  raw.exec(`
    INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash, status)
      VALUES (1, 'planilha.xlsx', 'hash-1', 'importado');
    INSERT INTO vendas_historicas (id, lote_id, chave, regra, data, cliente_nome, cliente_nome_norm, valor_total)
      VALUES (1, 1, 'vitoria|2026-05-01', 'mesmo nome e mesma data', '2026-05-01',
              'Vitoria', 'vitoria', 100.0);
    INSERT INTO vendas_historico_itens
      (id, lote_id, origem_linha, venda_historica_id, data, sku, sku_base,
       nome_produto_historico, qtd, valor_total, cliente_nome_norm, cliente_nome_original)
      VALUES (1, 1, '1', 1, '2026-05-01', '100001', '100001', 'Anel Solitário',
              1, 100.0, 'vitoria', 'Vitoria');
  `);
  const g = garantiaAntiga(raw, {
    origem_fonte: 'historico', venda_id: null, historico_item_id: 1, venda_historica_id: 1,
  });
  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  const v = vinculo(raw, g);
  assert.equal(v.venda_item_id, null);
  assert.equal(v.venda_item_vinculo, 'nao_se_aplica');
  prova('planilha: `historico_item_id` já é PK real, e isso é dito em vez de ficar nulo sem explicação');

  const { vinculosDeGarantia } = await mod('api/src/garantias.js');
  const r = await vinculosDeGarantia(adaptador(raw));
  assert.equal(r.naoSeAplica, 1);
  assert.equal(r.ambiguas, 0);
  assert.equal(r.semMatch, 0);
  assert.equal(r.casos.length, 0, 'o histórico não é pendência e não pode entrar na lista');
  prova('e ela não aparece como pendência de migração');
}

console.log('\n=== 7. garantia NOVA nasce apontando para a linha ===');
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  aplicar(raw, 'api/migracao-pos-golive-1.sql');
  raw.exec(SEED);
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100001', 'Anel Solitário', 1, 100.0, 'aaaaaaaa-1111-4111-8111-111111111111'),
      (1, '100001', 'Anel Solitário', 1,  60.0, 'bbbbbbbb-2222-4222-8222-222222222222');
  `);
  const db = adaptador(raw);
  const { abrirGarantia, lerGarantia } = await mod('api/src/garantias.js');

  /* Sem id, com duas linhas do mesmo código: o caminho antigo escolheria a
     primeira com `LIMIT 1`. Agora ele PERGUNTA. */
  const ambigua = await abrirGarantia(db, {
    vendaId: 1, sku: '100001', motivo: 'A pedra soltou', dataEntrada: '2026-09-05',
  });
  assert.equal(ambigua.ok, false);
  assert.equal(ambigua.statusHttp, 409);
  assert.equal(ambigua.candidatas.length, 2);
  assert.match(ambigua.erro, /qual delas voltou/);
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantias').get().c, 0,
    'abriu garantia mesmo com dúvida');
  prova('duas linhas e nenhum id: o sistema PARA e devolve as candidatas, em vez de escolher');

  const r = await abrirGarantia(db, {
    vendaItemId: 'bbbbbbbb-2222-4222-8222-222222222222',
    motivo: 'A pedra soltou', dataEntrada: '2026-09-05',
  });
  assert.equal(r.ok, true, `a abertura falhou: ${r.erro ?? ''}`);
  assert.equal(r.garantia.vendaItemId, 'bbbbbbbb-2222-4222-8222-222222222222');
  assert.equal(r.garantia.vendaItemVinculo, 'direto');
  assert.equal(r.garantia.vendaId, 1, 'o id da linha tem de resolver a venda sozinho');
  prova('com o id da linha: a garantia nasce apontando para ELA, sem precisar de venda nem de código');

  /* O valor cobrado vem da LINHA escolhida, não da outra. É o número que a
     diferença da troca usa: pegar a linha errada cobraria a mais. */
  assert.equal(r.garantia.valorPagoOriginal, 60.0);
  prova('e o valor pago é o da linha escolhida (60), não o da outra unidade (100)');

  const lida = await lerGarantia(db, r.garantia.id);
  assert.equal(lida.vendaItemId, 'bbbbbbbb-2222-4222-8222-222222222222');
  prova('a leitura devolve o ponteiro — o contrato expõe a identidade oficial');

  /* §31: abrir garantia não devolve peça ao estoque nem fatura. */
  assert.equal(r.faturamento, 0);
  assert.equal(r.estoqueAlterado, false);
  assert.equal(r.vendaOriginalAlterada, false);
  prova('§31 continua: abrir garantia não mexe em estoque, faturamento nem na venda');
}

console.log('\n=== 8. o id vale mais que o código: §41 não solta o ponteiro ===');
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  aplicar(raw, 'api/migracao-pos-golive-1.sql');
  raw.exec(SEED);
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100001', 'Anel Solitário', 1, 100.0, 'aaaaaaaa-1111-4111-8111-111111111111');
    INSERT INTO movimentos (sku, tipo, qtd, origem, obs, venda_id) VALUES
      ('100001', 'venda', -1, 'venda', 'venda 1', 1);
    UPDATE produtos SET qtd = 49 WHERE sku = '100001';
  `);
  const db = adaptador(raw);
  const { abrirGarantia, lerGarantia } = await mod('api/src/garantias.js');
  const r = await abrirGarantia(db, {
    vendaItemId: 'aaaaaaaa-1111-4111-8111-111111111111',
    motivo: 'O banho descascou', dataEntrada: '2026-09-05',
  });
  assert.equal(r.ok, true, `a abertura falhou: ${r.erro ?? ''}`);

  /* §41 — a cliente comprou o 100003 e o balcão digitou 100001. Corrigir
     reescreve `venda_itens.sku`; o trio da garantia deixa de casar. */
  const { corrigirItemDeVenda } = await mod('api/src/venda-correcao.js');
  const c = await corrigirItemDeVenda(db, {
    fonte: 'operacional', vendaId: 1, sku: '100001', skuNovo: '100003',
    motivo: 'código digitado errado no balcão',
  });
  assert.equal(c.ok, true, `a correção falhou: ${c.erro ?? ''}`);

  const trio = raw.prepare(
    `SELECT COUNT(*) c FROM venda_itens i JOIN garantias g ON g.venda_id = i.venda_id
      AND i.sku = g.sku AND i.variante_id IS g.variante_id`).get().c;
  assert.equal(trio, 0, 'o cenário não reproduziu a quebra do trio');
  prova('depois da correção o trio antigo não casa mais NENHUMA linha — era assim que o ponteiro se perdia');

  const g = await lerGarantia(db, r.garantia.id);
  const linha = raw.prepare('SELECT sku FROM venda_itens WHERE id = ?').get(g.vendaItemId);
  assert.equal(g.vendaItemId, 'aaaaaaaa-1111-4111-8111-111111111111');
  assert.equal(linha.sku, '100003');
  prova('mas o ponteiro continua de pé, e agora leva ao código CORRIGIDO');

  assert.equal(razaoFecha(raw), 0);
  prova('e a razão continua fechando: produtos.qtd == SUM(movimentos.qtd)');
}

console.log('\n=== 9. troca, diferença e estorno continuam inteiros ===');
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  aplicar(raw, 'api/migracao-pos-golive-1.sql');
  raw.exec(SEED);
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100001', 'Anel Solitário', 1, 100.0, 'aaaaaaaa-1111-4111-8111-111111111111');
    INSERT INTO movimentos (sku, tipo, qtd, origem, obs, venda_id) VALUES
      ('100001', 'venda', -1, 'venda', 'venda 1', 1);
    UPDATE produtos SET qtd = 49 WHERE sku = '100001';
  `);
  const db = adaptador(raw);
  const { abrirGarantia, registrarTroca, pagarDiferencaTroca, estornarTroca, lerGarantia } =
    await mod('api/src/garantias.js');

  const r = await abrirGarantia(db, {
    vendaItemId: 'aaaaaaaa-1111-4111-8111-111111111111',
    motivo: 'Sem conserto', dataEntrada: '2026-09-05',
  });
  assert.equal(r.ok, true, `a abertura falhou: ${r.erro ?? ''}`);
  const id = r.garantia.id;

  const antes = raw.prepare(`SELECT qtd FROM produtos WHERE sku = '100002'`).get().qtd;
  const t = await registrarTroca(db, id, { skuNovo: '100002', data: '2026-09-10' });
  assert.equal(t.ok, true, `a troca falhou: ${t.erro ?? ''}`);
  assert.equal(raw.prepare(`SELECT qtd FROM produtos WHERE sku = '100002'`).get().qtd, antes - 1,
    'a troca não baixou a peça nova');
  prova('a troca baixa a peça NOVA do estoque, uma vez');

  const g = await lerGarantia(db, id);
  assert.equal(g.troca.valorOriginal, 100.0);
  assert.equal(g.troca.valorNovo, 200.0);
  assert.equal(g.troca.diferenca, 100.0);
  assert.equal(g.troca.diferencaStatus, 'a_receber');
  prova('a diferença sai do valor da LINHA de origem (100), e fica a receber');

  const p = await pagarDiferencaTroca(db, id, { pagaEm: '2026-09-12' });
  assert.equal(p.ok, true, `o pagamento falhou: ${p.erro ?? ''}`);
  assert.equal((await lerGarantia(db, id)).troca.diferencaStatus, 'paga');
  prova('§36: só a diferença PAGA vira faturamento');

  /* E depois de paga o estorno é RECUSADO: desfazer a troca deixaria o
     dinheiro recebido sem origem. O sistema diz isso em vez de estornar. */
  const eDepois = await estornarTroca(db, id, { motivo: 'peça devolvida' });
  assert.equal(eDepois.ok, false);
  assert.match(eDepois.erro, /já foi paga/);
  assert.equal(raw.prepare(`SELECT qtd FROM produtos WHERE sku = '100002'`).get().qtd, antes - 1,
    'o estorno recusado mexeu no estoque mesmo assim');
  prova('estornar troca JÁ PAGA é recusado, e o estoque nem chega a se mexer');

  assert.equal(razaoFecha(raw), 0);
  prova('e depois de troca, pagamento e estorno a razão continua fechando');

  /* A venda da diferença é uma venda de verdade, e a linha dela também tem
     identidade: 5.2 cobriu este ponto de inserção, e 5.2b não pode desfazê-lo. */
  assert.equal(raw.prepare(`SELECT COUNT(*) c FROM venda_itens WHERE id IS NULL`).get().c, 0);
  prova('a linha da venda da diferença também nasce com identidade');

  /* Segunda peça, segunda garantia: a troca que NÃO foi paga estorna, e aí
     sim a peça nova volta ao estoque. */
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100003', 'Anel Aparador', 1, 80.0, 'cccccccc-3333-4333-8333-333333333333');
    INSERT INTO movimentos (sku, tipo, qtd, origem, obs, venda_id) VALUES
      ('100003', 'venda', -1, 'venda', 'venda 1', 1);
    UPDATE produtos SET qtd = 49 WHERE sku = '100003';
  `);
  const r2 = await abrirGarantia(db, {
    vendaItemId: 'cccccccc-3333-4333-8333-333333333333',
    motivo: 'Sem conserto', dataEntrada: '2026-09-05',
  });
  assert.equal(r2.ok, true, `a abertura falhou: ${r2.erro ?? ''}`);
  const antes2 = raw.prepare(`SELECT qtd FROM produtos WHERE sku = '100002'`).get().qtd;
  const t2 = await registrarTroca(db, r2.garantia.id, { skuNovo: '100002', data: '2026-09-10' });
  assert.equal(t2.ok, true, `a troca falhou: ${t2.erro ?? ''}`);
  const e2 = await estornarTroca(db, r2.garantia.id, { motivo: 'peça devolvida' });
  assert.equal(e2.ok, true, `o estorno falhou: ${e2.erro ?? ''}`);
  assert.equal(raw.prepare(`SELECT qtd FROM produtos WHERE sku = '100002'`).get().qtd, antes2);
  prova('a troca ainda NÃO paga estorna, e devolve a peça nova ao estoque');

  assert.equal(razaoFecha(raw), 0);
  prova('e a razão segue fechando depois do estorno de verdade');
}

console.log('\n=== 10. Monte seu Colar: composições não colidem ===');
{
  const raw = bancoAntesDe52b();
  /* §42/§43 — o recibo é uma linha do SKU de composição, e a mesma venda
     pode levar dois colares montados diferentes. Mesmo código, mesma venda,
     mesmo preço: só a identidade de linha os separa. */
  raw.exec(`
    INSERT INTO produtos (sku, desc, cat, preco, qtd)
      VALUES ('MONTE-COLAR-T', 'Monte seu Colar', 'Colar', 0, 0);
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, 'MONTE-COLAR-T', 'Colar montado', 1, 150.0, '33333333-cccc-4ccc-8ccc-cccccccccccc'),
      (1, 'MONTE-COLAR-T', 'Colar montado', 1, 150.0, '44444444-dddd-4ddd-8ddd-dddddddddddd');
  `);
  const g = garantiaAntiga(raw, { sku: 'MONTE-COLAR-T', valor_pago_original: 150.0 });
  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  assert.equal(vinculo(raw, g).venda_item_vinculo, 'ambiguo');
  prova('dois colares montados iguais na mesma venda: o backfill não escolhe qual voltou');

  /* E aqui fica REGISTRADA a regra de produto que 5.2b deliberadamente NÃO
     mexeu: com uma garantia já aberta naquele código, a segunda montagem é
     recusada, mesmo apontando para a outra linha. Com identidade de item
     seria defensável liberar — são duas peças físicas —, mas afrouxar a
     trava é decisão de produto, e esta fase é migração de identidade.
     Marcado para 5.4. O teste cobra o comportamento ATUAL: se alguém
     afrouxar sem decidir, ele quebra. */
  const { abrirGarantia } = await mod('api/src/garantias.js');
  const recusada = await abrirGarantia(adaptador(raw), {
    vendaItemId: '44444444-dddd-4ddd-8ddd-dddddddddddd',
    motivo: 'O fecho abriu', dataEntrada: '2026-09-05',
  });
  assert.equal(recusada.ok, false);
  assert.equal(recusada.statusHttp, 409);
  assert.match(recusada.erro, /já tem a garantia/);
  prova('a trava por (venda, código) NÃO foi afrouxada por 5.2b — segue recusando, como hoje');
}
{
  /* Sem garantia anterior no caminho, o id da linha resolve sozinho QUAL das
     duas montagens idênticas voltou. */
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  aplicar(raw, 'api/migracao-pos-golive-1.sql');
  raw.exec(SEED);
  raw.exec(`
    INSERT INTO produtos (sku, desc, cat, preco, qtd)
      VALUES ('MONTE-COLAR-T', 'Monte seu Colar', 'Colar', 0, 0);
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, 'MONTE-COLAR-T', 'Colar montado', 1, 150.0, '33333333-cccc-4ccc-8ccc-cccccccccccc'),
      (1, 'MONTE-COLAR-T', 'Colar montado', 1, 150.0, '44444444-dddd-4ddd-8ddd-dddddddddddd');
  `);
  const { abrirGarantia } = await mod('api/src/garantias.js');
  const r = await abrirGarantia(adaptador(raw), {
    vendaItemId: '44444444-dddd-4ddd-8ddd-dddddddddddd',
    motivo: 'O fecho abriu', dataEntrada: '2026-09-05',
  });
  assert.equal(r.ok, true, `a abertura falhou: ${r.erro ?? ''}`);
  assert.equal(r.garantia.vendaItemId, '44444444-dddd-4ddd-8ddd-dddddddddddd');
  prova('quem sabe QUAL montagem voltou consegue dizer, pelo id da linha');
}

console.log('\n=== 11. o relatório conta as três populações, e o rollback volta ===');
{
  const raw = bancoAntesDe52b();
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100002', 'Colar Veneziana', 1, 200.0, 'bbbbbbbb-2222-4222-8222-222222222222'),
      (1, '100001', 'Anel Solitário',  1, 100.0, 'cccccccc-3333-4333-8333-333333333333'),
      (1, '100001', 'Anel Solitário',  1, 100.0, 'dddddddd-4444-4444-8444-444444444444');
  `);
  const gUnico = garantiaAntiga(raw, { sku: '100002', valor_pago_original: 200.0 });
  const gAmbiguo = garantiaAntiga(raw, { sku: '100001', valor_pago_original: 100.0 });
  const gSemMatch = garantiaAntiga(raw, { sku: '100003', valor_pago_original: 80.0 });

  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  const { vinculosDeGarantia } = await mod('api/src/garantias.js');
  const r = await vinculosDeGarantia(adaptador(raw));
  assert.equal(r.resolvidas, 1);
  assert.equal(r.ambiguas, 1);
  assert.equal(r.semMatch, 1);
  assert.equal(r.casos.length, 2, 'o relatório tem de listar as duas pendências, e só elas');
  console.log(`       contagem do cenário: únicos=${r.resolvidas} ambíguos=${r.ambiguas} sem match=${r.semMatch}`);
  prova('o relatório separa resolvidas, ambíguas e sem match — e lista só as pendentes');

  assert.equal(vinculo(raw, gUnico).venda_item_id, 'bbbbbbbb-2222-4222-8222-222222222222');
  assert.equal(vinculo(raw, gAmbiguo).venda_item_id, null);
  assert.equal(vinculo(raw, gSemMatch).venda_item_id, null);

  /* Rollback documentado na migration: solta os ponteiros e volta ao estado
     anterior, sem perder garantia nenhuma. */
  const quantas = raw.prepare('SELECT COUNT(*) c FROM garantias').get().c;
  raw.exec('UPDATE garantias SET venda_item_id = NULL, venda_item_vinculo = NULL');
  assert.equal(raw.prepare('SELECT COUNT(*) c FROM garantias').get().c, quantas);
  assert.equal(raw.prepare(
    `SELECT COUNT(*) c FROM garantias WHERE venda_id = 1 AND sku = '100002'`).get().c, 1);
  prova('o rollback solta os ponteiros e não perde garantia nenhuma — o trio ainda está lá');

  aplicar(raw, 'api/migracao-garantia-venda-item.sql');
  assert.equal(vinculo(raw, gUnico).venda_item_id, 'bbbbbbbb-2222-4222-8222-222222222222');
  assert.equal(vinculo(raw, gAmbiguo).venda_item_vinculo, 'ambiguo');
  prova('e reaplicar depois do rollback chega ao mesmo resultado');
}

console.log(`\n✓ ${provas} provas — a garantia aponta para a linha da venda (5.2b)\n`);
