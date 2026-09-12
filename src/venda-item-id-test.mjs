/** Identidade estável da linha de venda — Fase 5.2, contra o schema real.
 *
 *  `venda_itens` nasceu sem chave própria. A identidade era o trio
 *  (venda_id, sku, variante_id), e §27 quebrou esse trio no dia em que
 *  permitiu duas linhas do MESMO código na mesma venda com preços
 *  diferentes. Quem precisou de identidade de verdade caiu no `rowid` — que
 *  o SQLite reatribui num VACUUM — e dois consumidores chegaram a mandá-lo
 *  de volta numa segunda requisição, um deles gravando-o em `config`.
 *
 *  O que precisa ficar provado:
 *
 *   1. a migration é aditiva, roda duas vezes e faz backfill de tudo;
 *   2. nenhuma linha fica sem id, e nenhum id se repete;
 *   3. quem insere sem id recebe um do banco — a garantia não depende de
 *      nenhum caminho de código lembrar;
 *   4. id atribuído não muda: trocar aborta a escrita;
 *   5. duas unidades do MESMO código na mesma venda têm ids diferentes —
 *      é o caso que o trio não sabia distinguir;
 *   6. **o id sobrevive a um VACUUM, e o rowid não.** Esta é a prova que
 *      justifica a fase inteira;
 *   7. variação e Monte seu Colar não colidem;
 *   8. `GET /api/vendas/lista` devolve o id estável, não o rowid;
 *   9. correção de item e resolução de variação continuam funcionando, e
 *      agora pelo id;
 *  10. nada disso move estoque: a razão continua fechando.
 *
 *      node src/venda-item-id-test.mjs
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

/** A MIGRATION é aplicada instrução por instrução, para que "duplicate
 *  column name" da segunda rodada possa ser tolerado sem abortar o resto —
 *  é assim que o aplicador real se comporta. O schema inteiro, esse vai de
 *  uma vez (`exec`), como nos outros testes contra o schema real.
 *
 *  O divisor quebra em `;`, e `CREATE TRIGGER … BEGIN … END;` tem ponto e
 *  vírgula dentro: este agrupador remonta o gatilho antes de executar. */
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

const SEED = `
INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES
  ('100001', 'Anel Solitário',  'Anel',  100.0, 50),
  ('100002', 'Colar Veneziana', 'Colar', 200.0, 50);
INSERT INTO clientes (id, nome, nome_norm) VALUES (1, 'Vitoria', 'vitoria');
-- §1: o saldo nasce pela razão, nunca por escrita direta em produtos.qtd.
-- Sem estes dois movimentos a invariante já começaria quebrada, e o teste
-- estaria medindo o defeito do próprio cenário.
INSERT INTO movimentos (sku, tipo, qtd, origem, obs) VALUES
  ('100001', 'entrada', 50, 'importacao', 'carga inicial do teste'),
  ('100002', 'entrada', 50, 'importacao', 'carga inicial do teste');
INSERT INTO vendas (id, cliente_id, cliente_nome, cliente_nome_norm, origem, data, total, cancelada, pago)
  VALUES (1, 1, 'Vitoria', 'vitoria', 'balcao', '2026-09-01', 300.0, 0, 1);
`;

/* ══════════════════════════ 1. a migration sobre um banco que JÁ tem dados */
{
  const raw = new DatabaseSync(':memory:');
  /* O schema ANTERIOR à 5.2 — a forma que produção tem hoje, e sobre a qual
     a migration vai rodar de verdade. Construído desfazendo os três
     artefatos da fase no banco, e não recortando o arquivo com expressão
     regular: o SQLite dizendo "a coluna sumiu" é prova, um `replace` que
     casou é só esperança. Ler do histórico do git também não serve — o
     teste passaria a se comparar consigo mesmo no commit seguinte. */
  raw.exec(ler('api/schema.sql'));
  raw.exec(`
    DROP TRIGGER IF EXISTS venda_itens_id_ao_inserir;
    DROP TRIGGER IF EXISTS venda_itens_id_imutavel;
    DROP INDEX   IF EXISTS idx_venda_itens_id;
    ALTER TABLE venda_itens DROP COLUMN id;
  `);

  const colunasAntes = raw.prepare(`SELECT name FROM pragma_table_info('venda_itens')`)
    .all().map((r) => r.name);
  assert.ok(!colunasAntes.includes('id'), 'o schema de partida já tinha a coluna — o teste não prova nada');
  prova('o ponto de partida é a tabela SEM identidade própria');

  raw.exec(SEED);
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco) VALUES
      (1, '100001', 'Anel Solitário',  1, 100.0),
      (1, '100001', 'Anel Solitário',  1,  60.0),
      (1, '100002', 'Colar Veneziana', 1, 200.0);
  `);
  const antes = raw.prepare(`SELECT COUNT(*) c FROM venda_itens`).get().c;
  assert.equal(antes, 3);

  const avisos1 = aplicar(raw, 'api/migracao-venda-item-id.sql');
  assert.equal(avisos1.length, 0, 'a primeira rodada não deveria reclamar de nada');

  const depois = raw.prepare(`SELECT COUNT(*) c FROM venda_itens`).get().c;
  assert.equal(depois, antes, 'a migration perdeu ou duplicou linha');
  prova('migration aditiva: as 3 linhas continuam 3');

  const semId = raw.prepare(`SELECT COUNT(*) c FROM venda_itens WHERE id IS NULL`).get().c;
  assert.equal(semId, 0, 'linha ficou sem identidade depois do backfill');
  const distintos = raw.prepare(`SELECT COUNT(DISTINCT id) c FROM venda_itens`).get().c;
  assert.equal(distintos, 3, 'o backfill repetiu id');
  prova('backfill completo: nenhuma linha sem id, nenhum id repetido');

  const { ehVendaItemId } = await mod('api/src/venda-item-id.js');
  const ids = raw.prepare(`SELECT id FROM venda_itens`).all().map((r) => r.id);
  for (const id of ids) assert.ok(ehVendaItemId(id), `id fora do formato: ${id}`);
  prova('o id gerado em SQL tem o mesmo formato do gerado pela aplicação');

  /* Rodar duas vezes: só a coluna reclama, e nada mais muda. */
  const idsAntes = ids.slice().sort().join(',');
  const avisos2 = aplicar(raw, 'api/migracao-venda-item-id.sql');
  assert.equal(avisos2.length, 1, 'a segunda rodada deveria reclamar só da coluna duplicada');
  assert.match(avisos2[0], /duplicate column name/i);
  const idsDepois = raw.prepare(`SELECT id FROM venda_itens`).all().map((r) => r.id).sort().join(',');
  assert.equal(idsDepois, idsAntes, 'a segunda rodada trocou id de linha existente');
  prova('rodar a migration duas vezes é inofensivo e não reescreve id');

  /* ── o gatilho: quem insere sem id recebe um */
  raw.exec(`INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco)
            VALUES (1, '100002', 'Colar Veneziana', 1, 200.0)`);
  const nova = raw.prepare(`SELECT id FROM venda_itens ORDER BY rowid DESC LIMIT 1`).get();
  assert.ok(ehVendaItemId(nova.id), 'linha inserida sem id não recebeu identidade');
  prova('linha inserida sem id recebe uma do banco — a garantia não depende do código');

  /* ── o gatilho: id atribuído é imutável */
  assert.throws(
    () => raw.exec(`UPDATE venda_itens SET id = 'outro' WHERE id = '${nova.id}'`),
    /imutavel/i,
    'trocar um id atribuído deveria abortar',
  );
  const aindaLa = raw.prepare(`SELECT COUNT(*) c FROM venda_itens WHERE id = ?`).get(nova.id).c;
  assert.equal(aindaLa, 1, 'o id mudou apesar do gatilho');
  prova('id atribuído é imutável: trocar aborta a escrita');

  /* ── o índice único recusa duplicata vinda de fora */
  assert.throws(
    () => raw.exec(`INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
                    VALUES (1, '100001', 'Anel', 1, 10.0, '${nova.id}')`),
    /UNIQUE/i,
    'o índice único deixou passar id repetido',
  );
  prova('o índice único recusa id repetido');
}

/* ══════════════════════════════ 2. a prova que justifica a fase: o VACUUM */
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '100001', 'A', 1, 10.0, '11111111-1111-4111-8111-111111111111'),
      (1, '100001', 'B', 1, 20.0, '22222222-2222-4222-8222-222222222222'),
      (1, '100002', 'C', 1, 30.0, '33333333-3333-4333-8333-333333333333'),
      (1, '100002', 'D', 1, 40.0, '44444444-4444-4444-8444-444444444444');
  `);
  /* Apagar do meio abre buracos de rowid — é o que faz o VACUUM renumerar. */
  raw.exec(`DELETE FROM venda_itens WHERE desc IN ('A', 'C')`);

  const antes = raw.prepare(`SELECT id, rowid AS r FROM venda_itens ORDER BY id`).all();
  raw.exec('VACUUM');
  const depoisVacuum = raw.prepare(`SELECT id, rowid AS r FROM venda_itens ORDER BY id`).all();
  assert.deepEqual(depoisVacuum.map((x) => x.id), antes.map((x) => x.id),
    'o id mudou depois de um VACUUM — não serve como identidade');
  prova('o id atravessa um VACUUM sem mudar');

  /* O SQLite não PROMETE renumerar o rowid num VACUUM — ele promete apenas
     que pode. Provar o risco com um VACUUM seria depender de um detalhe de
     implementação que muda entre versões; então o teste reproduz a operação
     que a documentação nomeia explicitamente, e que qualquer migration de
     reconstrução faria: copiar a tabela para outra e renomear. */
  raw.exec(`
    CREATE TABLE venda_itens_novo AS SELECT * FROM venda_itens ORDER BY preco DESC;
    DROP TABLE venda_itens;
    ALTER TABLE venda_itens_novo RENAME TO venda_itens;
  `);
  const depoisRebuild = raw.prepare(
    `SELECT id, rowid AS r FROM venda_itens ORDER BY id`,
  ).all();

  assert.deepEqual(depoisRebuild.map((x) => x.id), antes.map((x) => x.id),
    'o id não sobreviveu à reconstrução da tabela');
  prova('o id atravessa uma reconstrução de tabela sem mudar');

  const porId = new Map(antes.map((x) => [x.id, x.r]));
  const rowidMudou = depoisRebuild.some((x) => porId.get(x.id) !== x.r);
  assert.ok(rowidMudou,
    'o rowid não mudou na reconstrução: o cenário não exercitou a renumeração');
  prova('o rowid MUDA na mesma reconstrução — era isso que servia de identidade');
}

/* ═══════════ 3. o caso que o trio (venda, sku, variante) não distinguia */
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  const db = adaptador(raw);
  const { registrarVenda } = await mod('api/src/vendas-comandos.js');

  /* §27: metade das unidades com preço cheio, metade com desconto e motivo.
     Duas linhas do MESMO código na MESMA venda — exatamente o que o trio
     não sabia separar. */
  const r = await registrarVenda(db, {}, {
    clienteNome: 'Vitoria',
    data: '2026-09-05',
    itens: [
      { sku: '100001', qtd: 1 },
      { sku: '100001', qtd: 1, preco: 60, descontoRotulo: 'Grupo VIP' },
    ],
  });
  assert.ok(r.status === 200 || r.status === 201,
    `a venda foi recusada: ${await r.clone().text()}`);

  const linhas = raw.prepare(
    `SELECT id, sku, preco FROM venda_itens WHERE sku = '100001' ORDER BY preco DESC`,
  ).all();
  assert.equal(linhas.length, 2, 'as duas linhas do mesmo SKU não foram gravadas');
  assert.notEqual(linhas[0].id, linhas[1].id, 'as duas linhas do mesmo SKU têm o mesmo id');
  const { ehVendaItemId } = await mod('api/src/venda-item-id.js');
  for (const l of linhas) assert.ok(ehVendaItemId(l.id));
  prova('duas unidades do mesmo código na mesma venda têm ids diferentes');

  /* E a identidade do trio, de fato, não distingue — é o motivo de existir. */
  const peloTrio = raw.prepare(
    `SELECT COUNT(*) c FROM venda_itens WHERE venda_id = ? AND sku = '100001' AND variante_id IS NULL`,
  ).get(linhas[0] && raw.prepare(`SELECT venda_id FROM venda_itens WHERE id = ?`).get(linhas[0].id).venda_id).c;
  assert.equal(peloTrio, 2, 'o cenário não reproduziu a ambiguidade do trio');
  prova('o trio (venda, sku, variante) casa as duas — por isso ele não servia');

  const semId = raw.prepare(`SELECT COUNT(*) c FROM venda_itens WHERE id IS NULL`).get().c;
  assert.equal(semId, 0, 'registrarVenda gravou linha sem id');
  prova('registrarVenda grava o id que ela mesma gerou, antes da escrita');
}

/* ══════════════════ 4. a rota pública devolve o id estável, não o rowid */
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
    VALUES (1, '100001', 'Anel', 1, 100.0, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  `);
  const db = adaptador(raw);
  const { listarVendasUnificado } = await mod('api/src/analytics.js');
  const { itens } = await listarVendasUnificado(db, { limite: 50 });
  const linha = itens.find((i) => i.fonte === 'operacional');
  assert.ok(linha, 'a listagem não devolveu a venda operacional');
  assert.equal(linha.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'GET /api/vendas/lista ainda devolve o rowid como id da linha');
  assert.notEqual(linha.id, 1, 'o id devolvido ainda parece um rowid');
  prova('GET /api/vendas/lista devolve o id estável da linha');
}

/* ════════ 5. variação, Monte seu Colar, correção e garantia continuam ok */
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  raw.exec(`
    INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('100003', 'Anel Aro', 'Anel', 90.0, 10);
    INSERT INTO produto_variacoes (sku, nome, ordem) VALUES ('100003', 'Aro 16', 1), ('100003', 'Aro 18', 2);
  `);
  const db = adaptador(raw);

  /* duas linhas do mesmo código, variações diferentes: ids diferentes e
     nenhuma colisão com a linha sem variação. */
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, variacao, id) VALUES
      (1, '100003', 'Anel Aro', 1, 90.0, 'Aro 16', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      (1, '100003', 'Anel Aro', 1, 90.0, 'Aro 18', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  `);
  const variados = raw.prepare(
    `SELECT DISTINCT id FROM venda_itens WHERE sku = '100003'`,
  ).all();
  assert.equal(variados.length, 2, 'variações distintas colidiram no mesmo id');
  prova('variações distintas do mesmo código não colidem');

  /* Monte seu Colar grava UMA linha com o SKU comercial. Duas composições
     iguais na mesma venda continuam sendo duas linhas distinguíveis. */
  raw.exec(`
    INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('326660', 'Colar Casal', 'Colar', 129.0, 0);
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id) VALUES
      (1, '326660', 'Colar Casal — Menino Azul', 1, 129.0, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
      (1, '326660', 'Colar Casal — Menina Rosa', 1, 129.0, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  `);
  const montados = raw.prepare(
    `SELECT COUNT(DISTINCT id) c FROM venda_itens WHERE sku = '326660'`,
  ).get().c;
  assert.equal(montados, 2, 'duas composições iguais na mesma venda colidiram');
  prova('duas composições de Monte seu Colar na mesma venda não colidem');

  /* resolução de variação: pelo itemId, e a chave da pendência é estável */
  const { resolverVariacaoDaVenda } = await mod('api/src/pendencias.js');
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
    VALUES (1, '100003', 'Anel Aro', 1, 90.0, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  `);
  const res = await resolverVariacaoDaVenda(db, {
    vendaId: 1, sku: '100003', itemId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', variacao: 'Aro 16',
  });
  assert.ok(res.ok, `a resolução falhou: ${JSON.stringify(res)}`);
  assert.equal(res.itemId, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  assert.equal(res.chave, 'venda_variacao:1:ffffffff-ffff-4fff-8fff-ffffffffffff',
    'a chave da pendência ainda é montada com o rowid');
  const resolvida = raw.prepare(
    `SELECT variacao FROM venda_itens WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'`,
  ).get();
  assert.equal(resolvida.variacao, 'Aro 16', 'a variação foi escrita na linha errada');
  prova('resolver variação escreve na linha nomeada pelo itemId, e a chave é estável');

  /* Compatibilidade: o painel legado ainda pode mandar `linha` (o rowid)
     enquanto não for atualizado em toda instalação. Esta metade sai quando
     o legado sair, e existe um teste para o dia em que alguém a remover sem
     querer. */
  raw.exec(`
    INSERT INTO venda_itens (venda_id, sku, desc, qtd, preco, id)
    VALUES (1, '100003', 'Anel Aro', 1, 90.0, '99999999-9999-4999-8999-999999999999');
  `);
  const rowidDaNova = raw.prepare(
    `SELECT rowid AS r FROM venda_itens WHERE id = '99999999-9999-4999-8999-999999999999'`,
  ).get().r;
  const legado = await resolverVariacaoDaVenda(db, {
    vendaId: 1, sku: '100003', linha: rowidDaNova, variacao: 'Aro 18',
  });
  assert.ok(legado.ok, `a compatibilidade com o painel legado quebrou: ${JSON.stringify(legado)}`);
  assert.equal(
    raw.prepare(`SELECT variacao FROM venda_itens WHERE id = '99999999-9999-4999-8999-999999999999'`).get().variacao,
    'Aro 18',
    'o caminho legado escreveu na linha errada',
  );
  prova('o painel legado, mandando `linha`, continua resolvendo a linha certa');
}

/* ═══════════════════════════ 6. correção de item vendido não regride */
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  /* `venda_item_correcoes` — a trilha de auditoria de §40 — só existe na
     migration pós-go-live; `schema.sql` não a cria. Sem ela a correção
     falharia por tabela ausente, e não pela regra que se quer provar. */
  aplicar(raw, 'api/migracao-pos-golive-1.sql');
  raw.exec(SEED);
  const db = adaptador(raw);
  const { registrarVenda } = await mod('api/src/vendas-comandos.js');
  const { corrigirItemDeVenda } = await mod('api/src/venda-correcao.js');

  const v = await registrarVenda(db, {}, {
    clienteNome: 'Vitoria', data: '2026-09-06', itens: [{ sku: '100001', qtd: 1 }],
  });
  assert.ok(v.status === 200 || v.status === 201, `a venda foi recusada: ${await v.clone().text()}`);
  const vendaId = (await v.clone().json()).id;

  const idAntes = raw.prepare(
    `SELECT id FROM venda_itens WHERE venda_id = ? AND sku = '100001'`,
  ).get(vendaId).id;

  const r = await corrigirItemDeVenda(db, {
    fonte: 'operacional', vendaId, sku: '100001', skuNovo: '100002',
  });
  assert.ok(r.ok, `a correção falhou: ${JSON.stringify(r)}`);

  const depois = raw.prepare(
    `SELECT id, sku FROM venda_itens WHERE venda_id = ?`,
  ).all(vendaId);
  assert.equal(depois.length, 1, 'a correção duplicou ou perdeu a linha');
  assert.equal(depois[0].sku, '100002', 'o código não foi corrigido');
  assert.equal(depois[0].id, idAntes,
    'a correção trocou a IDENTIDADE da linha — corrigir o código não é criar outro item');
  prova('corrigir o código da peça preserva a identidade da linha');

  /* §40 e §1: a razão fecha depois da correção. */
  const razao = raw.prepare(
    `SELECT p.sku, p.qtd, COALESCE((SELECT SUM(m.qtd) FROM movimentos m WHERE m.sku = p.sku), 0) AS soma
       FROM produtos p`,
  ).all();
  for (const l of razao) {
    assert.equal(Number(l.qtd), Number(l.soma),
      `razão não fecha em ${l.sku}: produtos.qtd=${l.qtd}, SUM(movimentos)=${l.soma}`);
  }
  prova('a razão continua fechando: produtos.qtd == SUM(movimentos.qtd)');
}

/* ══════════════════════════════════ 7. garantia continua achando o item */
{
  const raw = new DatabaseSync(':memory:');
  raw.exec(ler('api/schema.sql'));
  raw.exec(SEED);
  const db = adaptador(raw);
  const { registrarVenda } = await mod('api/src/vendas-comandos.js');
  const { abrirGarantia, lerGarantia } = await mod('api/src/garantias.js');

  const v = await registrarVenda(db, {}, {
    clienteNome: 'Vitoria', data: '2026-09-07',
    itens: [{ sku: '100001', qtd: 1, preco: 80, descontoRotulo: 'Grupo VIP' }],
  });
  assert.ok(v.status === 200 || v.status === 201, `a venda foi recusada: ${await v.clone().text()}`);
  const vendaId = (await v.clone().json()).id;

  const g = await abrirGarantia(db, {
    vendaId, sku: '100001', motivo: 'Pedra soltou', dataEntrada: '2026-09-08',
  });
  assert.ok(g.ok, `a garantia não abriu: ${JSON.stringify(g)}`);
  const garantiaId = g.id ?? g.garantia?.id ?? g.garantiaId;
  assert.ok(garantiaId, `a garantia não devolveu id: ${JSON.stringify(g)}`);
  const lida = await lerGarantia(db, Number(garantiaId));
  assert.equal(lida.sku, '100001');
  /* O valor que ela pagou, não o de tabela — é a base da diferença de troca. */
  assert.equal(Number(lida.valorPagoOriginal), 80,
    'a garantia pegou o preço de tabela em vez do efetivamente pago');
  prova('garantia continua achando o item e o valor realmente pago');
}

console.log(`\n✓ ${provas} provas — identidade estável de venda_itens (5.2)\n`);
