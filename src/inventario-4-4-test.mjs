/** Fase 4, item 4 — o inventário inteiro contra o schema real, sem Worker.
 *
 *  Roda `api/schema.sql` de verdade, aplica `api/migracao-inventario-4-4.sql`
 *  em cima (para provar que a migration é aditiva e idempotente sobre um
 *  banco que já tem as tabelas antigas) e chama os módulos de verdade. O que
 *  fica de fora é só o HTTP.
 *
 *  As treze provas do §10 de docs/domains/INVENTARIO-4-4.md, uma a uma:
 *
 *   1. a contagem sobrevive a pausar e retomar;
 *   2. não contado nunca vira faltante — nem no relatório, nem em lote;
 *   3. contado-zero explícito gera diferença; não contado não gera nada;
 *   4. SKU com variação nunca produz movimento sem variação: a rota recusa;
 *   5. "não sei" bloqueia o SKU e não movimenta nada;
 *   6. deriva: contar 7, vender 2, fechar → dif = 0, e a linha diz que mexeu;
 *   7. deriva sem identidade de variação → nao_comparavel, zero movimento;
 *   8. negativa gera perda/saída e positiva gera ajuste/entrada, as duas com
 *      `inventario_id` e `origem = 'inventario'`;
 *   9. aplicar duas vezes é recusado PELO ÍNDICE, não pela aplicação;
 *  10. estorno devolve a peça e libera o relançamento;
 *  11. a razão fecha antes e depois de tudo;
 *  12. nenhum movimento histórico é reescrito;
 *  13. `produtos.qtd` nunca é escrito direto (o gate de código é
 *      `scripts/razao-estoque.test.mjs`; aqui a prova é sobre os dados).
 *
 *  Mais a compatibilidade que o dashboard legado precisa continuar tendo.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de passar em silêncio.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

const raw = new DatabaseSync(':memory:');
raw.exec(ler('api/schema.sql'));

let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

/* ── 0. a migration roda sobre o schema que já tem tudo, e roda duas vezes.
   `ADD COLUMN` de coluna existente é erro em SQLite: a migration precisa ser
   tolerante a isso, porque ninguém sabe se ela já rodou. */
function aplicarMigration() {
  for (const comando of ler('api/migracao-inventario-4-4.sql')
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)) {
    try {
      raw.exec(comando);
    } catch (e) {
      if (!/duplicate column name/i.test(String(e.message))) throw e;
    }
  }
}
aplicarMigration();
aplicarMigration();
for (const t of ['inventario_contagem', 'inventario_nao_identificado', 'inventario_resultado']) {
  assert.ok(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t),
    `${t} não existe depois da migration`);
}
assert.ok(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_saida_inventario_unica'`).get(),
  'o índice de idempotência não existe');
prova('a migration é aditiva e roda duas vezes sem quebrar');

/* ── adaptador mínimo do D1 sobre node:sqlite. `batch` executa de verdade. */
const prepararStmt = (sql) => {
  let binds = [];
  const valores = () => binds.map((v) => (
    v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v)));
  const stmt = {
    sql,
    bind(...v) { binds = v; return stmt; },
    async all() { return { results: raw.prepare(sql).all(...valores()) }; },
    async first(coluna) {
      const r = raw.prepare(sql).get(...valores()) ?? null;
      return coluna === undefined ? r : (r == null ? null : r[coluna]);
    },
    async run() { return { meta: raw.prepare(sql).run(...valores()) }; },
    executar() { return raw.prepare(sql).run(...valores()); },
  };
  return stmt;
};
const db = {
  prepare: prepararStmt,
  async batch(stmts) { return (stmts || []).map((s) => ({ meta: s.executar() })); },
};
const corpo = async (r) => (r && typeof r.json === 'function' ? r.json() : r);
const status = (r) => (r && typeof r.status === 'number' ? r.status : 200);

/* ── catálogo. A entrada vai por movimento, para a razão nascer fechada, e
   as datas são explícitas: a comparação retroagida é sobre `criado_em`, e um
   teste que deixasse tudo no mesmo segundo não provaria nada. */
const ONTEM = '2026-09-01 09:00:00';
const PECAS = [
  ['100001', 'Colar Simples', 79, 5],
  ['100002', 'Pulseira Elos', 59, 3],
  ['100003', 'Brinco Argola', 39, 4],
  ['100004', 'Tornozeleira', 49, 2],
  ['748801', 'Anel Solitário', 159, 7],
  ['200001', 'Anel Trancoso', 129, 6],
  ['300001', 'Anel Meia Alianca', 99, 4],
];
for (const [sku, desc, preco, qtd] of PECAS) {
  raw.prepare("INSERT INTO produtos (sku,desc,cat,preco,qtd,status) VALUES (?,?,'Anel',?,?,'ativo')")
    .run(sku, desc, preco, qtd);
}
/* `748801` e `300001` têm variação cadastrada e razão completa: cada peça
   sabe de qual aro é. `200001` tem variação cadastrada e um movimento
   historicamente incompleto — é o retrato dos 78 que existem em produção. */
const VARIACOES = [
  ['748801', 'Aro 16', '9001'], ['748801', 'Aro 17', '9002'],
  ['200001', 'Aro 16', '8001'], ['200001', 'Aro 17', '8002'],
  ['300001', 'Aro 18', '7001'],
];
for (const [sku, nome, vid] of VARIACOES) {
  raw.prepare('INSERT INTO produto_variacoes (sku,nome,variante_id,ordem) VALUES (?,?,?,0)')
    .run(sku, nome, vid);
}
const movimentar = (sku, qtd, variacao, varianteId, quando, tipo, origem) =>
  raw.prepare('INSERT INTO movimentos (sku,variacao,variante_id,tipo,qtd,origem,criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(sku, variacao, varianteId, tipo || 'entrada', qtd, origem || 'importacao', quando);

for (const [sku, , , qtd] of PECAS) {
  if (sku === '748801' || sku === '200001' || sku === '300001') continue;
  movimentar(sku, qtd, null, null, ONTEM);
}
movimentar('748801', 4, 'Aro 16', '9001', ONTEM);
movimentar('748801', 3, 'Aro 17', '9002', ONTEM);
movimentar('300001', 4, 'Aro 18', '7001', ONTEM);
/* Os dois movimentos de `200001`: um com identidade, outro sem. O segundo é
   o histórico incompleto, e ele NÃO será reescrito por nada aqui. */
movimentar('200001', 4, 'Aro 16', '8001', ONTEM);
const MOV_INCOMPLETO = raw.prepare(
  `INSERT INTO movimentos (sku,tipo,qtd,origem,obs,criado_em)
   VALUES ('200001','entrada',2,'importacao','planilha antiga, sem aro',?) RETURNING id`).get(ONTEM).id;

const razaoAberta = () => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.s, 0)`).get().n;
const saldos = () => Object.fromEntries(
  raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all().map((r) => [r.sku, r.qtd]));
const retratoDosMovimentos = () => raw.prepare(
  'SELECT id, sku, variacao, variante_id, tipo, qtd, origem, obs FROM movimentos ORDER BY id').all()
  .map((m) => JSON.stringify(m));

assert.equal(razaoAberta(), 0, 'a razão já nasceu aberta');
const MOVIMENTOS_ANTES = retratoDosMovimentos();
prova('a razão nasce fechada, com um movimento historicamente incompleto dentro');

const inv = await import('../api/src/inventario.js');
const { estornarSaida } = await import('../api/src/saidas.js');

/* Contar "na segunda": a contagem é gravada agora, e o teste recua o
   `contado_em` para poder criar movimento DEPOIS dela sem depender do
   relógio. É a simulação da contagem que durou dias. */
const CONTOU_EM = '2026-09-07 08:00:00';
const recuarContagem = (invId, sku) => raw.prepare(
  'UPDATE inventario_contagem SET contado_em = ? WHERE inventario_id = ? AND sku = ?')
  .run(CONTOU_EM, invId, sku);

/* ═════════════════════════════════════ 1 — pausar, retomar, e nada se perde */

const abertura = await corpo(await inv.abrirInventario(db));
const ID = abertura.id;
assert.equal(abertura.status, 'aberto');
assert.equal(status(await inv.abrirInventario(db)), 409, 'abriu um segundo inventário por cima');

await inv.contarItem(db, ID, { sku: '100001', contado: 5 });
await inv.contarItem(db, ID, { sku: '100002', contado: 1 });

const pausa = await corpo(await inv.pausarInventario(db, ID));
assert.equal(pausa.status, 'pausado');
assert.ok(pausa.pausadoEm, 'pausou sem registrar quando');
/* Pausado continua sendo "em andamento": abrir outro por cima seria perder
   a contagem parada, que é exatamente o que D1 existe para impedir. */
assert.equal(status(await inv.abrirInventario(db)), 409, 'pausado deixou abrir um segundo inventário');
assert.equal((await corpo(await inv.listarInventarios(db)))[0].status, 'pausado');

const parado = await corpo(await inv.detalheInventario(db, ID));
assert.equal(parado.status, 'pausado');
assert.equal(parado.itens.find((i) => i.sku === '100001').contado, 5);
assert.equal(parado.itens.find((i) => i.sku === '100002').contado, 1);
assert.equal(parado.cobertura.conferidos, 2);
/* `MONTE-COLAR` vem do próprio schema: é o produto guarda-chuva da
   personalização, com saldo 0. Ele conta na cobertura porque é um código
   do catálogo, e nunca aparece no relatório porque não tem saldo. */
assert.equal(parado.cobertura.total, PECAS.length + 1);

const volta = await corpo(await inv.retomarInventario(db, ID));
assert.equal(volta.status, 'aberto');
assert.equal((await corpo(await inv.detalheInventario(db, ID))).contagem.length, 2,
  'retomar perdeu a contagem');
prova('1 — a contagem sobrevive a pausar e retomar, e pausado não é abandonado');

/* ═════════════════════════════ 2, 3 — não contado não é zero, zero é gesto */

/* `100003` fica sem nenhuma contagem: é o item que o desenho não deixa
   entrar em lote nem aparecer como faltante.
   `100004` recebe o zero EXPLÍCITO: "conferi, não tem nenhuma". */
const zero = await corpo(await inv.contarItem(db, ID, { sku: '100004', contado: 0 }));
assert.equal(zero.contado, 0, 'o zero explícito foi descartado');

/* ═════════════════════════════════════════ 4 — variação exige identidade */

const agregada = await inv.contarItem(db, ID, { sku: '748801', contado: 7 });
assert.equal(status(agregada), 409, 'aceitou contagem agregada num SKU com variação');
const recusa = await corpo(agregada);
assert.deepEqual(recusa.variacoes.map((v) => v.nome), ['Aro 16', 'Aro 17'],
  'a recusa não devolveu a régua das variações cadastradas');
assert.equal(status(await inv.contarItem(db, ID, { sku: '748801', variacao: 'Aro 19', contado: 1 })), 409,
  'aceitou uma variação que não está cadastrada');
assert.equal(status(await inv.contarItem(db, ID, { sku: '100001', variacao: 'Aro 16', contado: 1 })), 409,
  'aceitou variação num SKU que não tem variação cadastrada');
prova('4 — SKU com variação recusa contagem agregada e devolve a régua cadastrada');

/* ══════════════════════════════════════ 6 — a deriva entre contar e fechar */

/* O caso real do desenho: ela conta 7 na segunda, vende 2 na quarta, fecha
   na sexta. Não há divergência nenhuma. */
await inv.contarItem(db, ID, { sku: '748801', variacao: 'Aro 16', contado: 4 });
await inv.contarItem(db, ID, { sku: '748801', variacao: 'Aro 17', contado: 3 });
recuarContagem(ID, '748801');
movimentar('748801', -2, 'Aro 16', '9001', '2026-09-08 15:00:00', 'venda', 'venda');
raw.prepare('UPDATE produtos SET qtd = qtd - 2 WHERE sku = ?').run('748801');
assert.equal(razaoAberta(), 0);

/* ═══════════════════════ 7 — deriva sem identidade não é comparável */

await inv.contarItem(db, ID, { sku: '200001', variacao: 'Aro 16', contado: 4 });
await inv.contarItem(db, ID, { sku: '200001', variacao: 'Aro 17', contado: 1 });
recuarContagem(ID, '200001');

/* `300001` conta certo e depois recebe um movimento SEM identidade: a
   retroação daquele código deixa de ser demonstrável. */
await inv.contarItem(db, ID, { sku: '300001', variacao: 'Aro 18', contado: 4 });
recuarContagem(ID, '300001');
movimentar('300001', -1, null, null, '2026-09-08 16:00:00', 'venda', 'venda');
raw.prepare('UPDATE produtos SET qtd = qtd - 1 WHERE sku = ?').run('300001');
assert.equal(razaoAberta(), 0);

/* ═════════════════════════════════════════════ 5 — "não sei qual é" */

/* `100002`: 3 no sistema, ela achou 1 — é a diferença negativa do teste.
   A recusa do "não sei" num SKU sem variação é parte da regra: não existe
   "qual delas" onde não há variação nenhuma. */
assert.equal(status(await inv.registrarNaoIdentificado(db, ID, { sku: '100002', qtd: 1 })), 409,
  'aceitou "não sei" num SKU sem variação cadastrada');
prova('5a — "não sei" só existe onde há variação cadastrada para não saber');

/* ═══════════════════════════════════════════════════ o fechamento */

const rel = await corpo(await inv.concluirInventario(db, ID));
assert.ok(rel.ok, `o fechamento falhou: ${rel.erro}`);

const acha = (lista, sku, variacao = null) =>
  lista.find((l) => l.sku === sku && (variacao === null || l.variacao === variacao));

/* 2 — o não conferido está na lista dele, e em nenhuma outra. */
assert.ok(acha(rel.naoConferido, '100003'), '100003 não foi conferido e sumiu do relatório');
assert.ok(!acha(rel.faltando, '100003'), 'item NÃO CONFERIDO apareceu como faltante');
assert.ok(!acha(rel.sobrando, '100003'));
assert.equal(acha(rel.naoConferido, '100003').esperado, 4);
prova('2 — item não conferido aparece na lista própria e nunca como faltante');

/* 3 — o zero explícito virou diferença de verdade. */
const zeroLinha = acha(rel.faltando, '100004');
assert.ok(zeroLinha, 'o zero explícito não virou diferença');
assert.equal(zeroLinha.contado, 0);
assert.equal(zeroLinha.dif, -2);
prova('3 — contado-zero explícito gera diferença; não contado não gera nada');

/* 6 — a deriva: contou 4 de Aro 16 na segunda, vendeu 2 na terça. */
const aro16 = acha(rel.faltando, '748801', 'Aro 16') || acha(rel.sobrando, '748801', 'Aro 16');
assert.equal(aro16, undefined, `Aro 16 virou divergência: ${JSON.stringify(aro16)}`);
prova('6 — contar 4, vender 2 e fechar depois não é divergência nenhuma');

/* 7 — o código com movimento cego depois da contagem não é comparável. */
const cego = acha(rel.naoComparavel, '300001');
assert.ok(cego, '300001 tinha movimento sem identidade depois da contagem e ficou comparável');
assert.match(cego.motivo, /sem identidade de variação/);
assert.ok(!acha(rel.faltando, '300001') && !acha(rel.sobrando, '300001'));
prova('7 — movimento posterior sem identidade manda a linha para nao_comparavel');

/* A razão cega do histórico: `200001` tem 2 peças que nenhum aro reivindica.
   Ela foi contada, então o código inteiro é não comparável — e o motivo diz
   exatamente quantas peças estão sem identidade. */
const historicoCego = acha(rel.naoComparavel, '200001');
assert.ok(historicoCego, '200001 tem razão incompleta e ficou comparável');
assert.match(historicoCego.motivo, /2 peças na razão sem identidade de variação/);
prova('7b — razão incompleta no histórico bloqueia a comparação, com o número na frente');

/* ═════════════════════════ 8 — a diferença vira saída sem faturamento */

const antesAplicar = saldos();
const faltante = acha(rel.faltando, '100002');
assert.equal(faltante.dif, -2, 'a diferença negativa não é a esperada');
const sobra = acha(rel.sobrando, '100001');
assert.equal(sobra, undefined, 'não deveria haver sobra ainda');

/* Uma sobra de verdade: `100003` continua não conferido, então a sobra vem
   de `100001` — contado 5 contra 5. Para ter sobra, conta-se de novo? Não:
   o retrato está congelado. A sobra do teste é o `748801` Aro 17, contado 3
   contra 3 — também bate. Então a sobra é fabricada onde ela é legítima:
   `100002` falta, e a entrada é provada pelo ESTORNO, mais abaixo. */

const aplicado = await corpo(await inv.aplicarInventario(db, ID, {
  itens: [{ sku: '100002', observacao: 'caiu atrás da gaveta' }],
}));
assert.ok(aplicado.ok, `a aplicação falhou: ${aplicado.erro}`);
assert.equal(aplicado.aplicados[0].qtd, -2);
assert.equal(aplicado.aplicados[0].sentido, 'saida');

const saida = raw.prepare('SELECT * FROM saidas_sem_faturamento WHERE id = ?')
  .get(aplicado.aplicados[0].saidaId);
assert.equal(saida.tipo, 'perda', 'a diferença negativa não virou perda');
assert.equal(saida.sentido, 'saida');
assert.equal(saida.inventario_id, ID, 'a saída não ficou vinculada ao inventário');
assert.equal(saida.observacao, 'caiu atrás da gaveta');
assert.match(saida.motivo, new RegExp(`Diferença de inventário #${ID}`));

const mov = raw.prepare('SELECT * FROM movimentos WHERE id = ?').get(saida.movimento_id);
assert.equal(mov.origem, 'inventario', 'a origem do movimento não é `inventario` (D9)');
assert.equal(mov.tipo, 'perda');
assert.equal(mov.qtd, -2);
assert.equal(saldos()['100002'], antesAplicar['100002'] - 2);
assert.equal(razaoAberta(), 0, 'a razão abriu ao aplicar a diferença');
prova('8 — a diferença negativa vira perda/saída, com inventario_id e origem inventario');

/* ══════════════════════════ 9 — a segunda aplicação é recusada pelo índice */

const segunda = await inv.aplicarInventario(db, ID, { itens: [{ sku: '100002' }] });
assert.equal(status(segunda), 409, 'aplicou a mesma diferença duas vezes');
assert.match((await corpo(segunda)).erro, /já foi corrigido/);

assert.equal(saldos()['100002'], antesAplicar['100002'] - 2, 'a segunda tentativa mexeu no saldo');
assert.equal(razaoAberta(), 0);
prova('9a — a aplicação recusa a segunda vez lendo o retrato congelado');

/* ═══════════════════════ 10 — estorno devolve a peça e libera o relançamento */

const estorno = await estornarSaida(db, saida.id, { motivo: 'contei errado, achei as duas' });
assert.ok(estorno.ok, `o estorno falhou: ${estorno.erro}`);
assert.equal(saldos()['100002'], antesAplicar['100002'], 'o estorno não devolveu a peça');
assert.equal(razaoAberta(), 0);

/* Depois do estorno o índice libera: `estornada = 0` é a cláusula que faz
   isso, e é deliberada — uma diferença estornada pode ser relançada com o
   valor certo. */
const relancado = await corpo(await inv.aplicarInventario(db, ID, {
  itens: [{ sku: '100002', observacao: 'agora sim' }],
}));
assert.ok(relancado.ok, `o relançamento depois do estorno falhou: ${relancado.erro}`);
assert.equal(saldos()['100002'], antesAplicar['100002'] - 2);
assert.equal(razaoAberta(), 0);
prova('10 — estorno devolve a peça e o relançamento volta a ser permitido');

/* ═════════════════ 8b — a diferença POSITIVA usa o mesmo mecanismo */

/* Um segundo inventário, curto, só para a sobra: `100001` tem 5 e ela acha 6. */
const inv2 = (await corpo(await inv.abrirInventario(db))).id;
await inv.contarItem(db, inv2, { sku: '100001', contado: 6 });
const rel2 = await corpo(await inv.concluirInventario(db, inv2));
const sobrando = acha(rel2.sobrando, '100001');
assert.equal(sobrando.dif, 1, 'a sobra não foi calculada');

const antesSobra = saldos();
const aplicadaSobra = await corpo(await inv.aplicarInventario(db, inv2, { itens: [{ sku: '100001' }] }));
assert.ok(aplicadaSobra.ok, `a sobra não foi aplicada: ${aplicadaSobra.erro}`);
const linhaSobra = raw.prepare('SELECT * FROM saidas_sem_faturamento WHERE id = ?')
  .get(aplicadaSobra.aplicados[0].saidaId);
assert.equal(linhaSobra.tipo, 'perda', 'a sobra virou uma segunda tabela?');
assert.equal(linhaSobra.sentido, 'entrada');
assert.equal(linhaSobra.inventario_id, inv2);
const movSobra = raw.prepare('SELECT * FROM movimentos WHERE id = ?').get(linhaSobra.movimento_id);
assert.equal(movSobra.tipo, 'ajuste', 'a entrada da sobra não é um ajuste assinado');
assert.equal(movSobra.qtd, 1);
assert.equal(movSobra.origem, 'inventario');
assert.equal(saldos()['100001'], antesSobra['100001'] + 1);
assert.equal(razaoAberta(), 0);
prova('8b — a sobra usa o mesmo mecanismo: perda/entrada, ajuste assinado, origem inventario');

/* ═════════════════ 9b — e a trava de verdade é do BANCO, não da aplicação */

/* Limpar o retrato à mão simula a segunda aba: ela leu ANTES de a primeira
   escrever, e por isso passa pela validação da aplicação inteira. Se a
   idempotência dependesse só do flag, aqui entrariam duas peças. A sobra é
   o caso certo para provar isso: entrada não passa pelo freio de saldo
   disponível, então o único obstáculo que resta é o índice único. */
raw.prepare('UPDATE inventario_resultado SET aplicado_em = NULL, saida_id = NULL WHERE inventario_id = ? AND sku = ?')
  .run(inv2, '100001');
const concorrente = await inv.aplicarInventario(db, inv2, { itens: [{ sku: '100001' }] });
assert.equal(status(concorrente), 409, 'a trava era só o flag da aplicação, não o índice');
assert.match((await corpo(concorrente)).erro, /já foi lançada/);
assert.equal(saldos()['100001'], antesSobra['100001'] + 1, 'a segunda aba somou a peça de novo');
assert.equal(razaoAberta(), 0);
prova('9b — duas abas: a segunda aplicação é recusada pelo índice único do banco');

/* ═════════════════════════ 2b e 5b — o que NÃO pode ser corrigido */

const naoConferido = await inv.aplicarInventario(db, ID, { itens: [{ sku: '100003' }] });
assert.equal(status(naoConferido), 409, 'corrigiu um item que ninguém conferiu');
assert.match((await corpo(naoConferido)).erro, /não foi conferido/);

const naoComparavel = await inv.aplicarInventario(db, ID, { itens: [{ sku: '300001', variacao: 'Aro 18' }] });
assert.equal(status(naoComparavel), 409, 'corrigiu um item não comparável');
assert.match((await corpo(naoComparavel)).erro, /não é comparável/);
prova('2b — não conferido e não comparável são recusados na aplicação, com o motivo');

/* ═══════════════════════════ 5 — "não sei" bloqueia o SKU inteiro */

const inv3 = (await corpo(await inv.abrirInventario(db))).id;
await inv.contarItem(db, inv3, { sku: '748801', variacao: 'Aro 16', contado: 1 });
const naoSei = await corpo(await inv.registrarNaoIdentificado(db, inv3, { sku: '748801', qtd: 2 }));
assert.equal(naoSei.bloqueia, true);
const rel3 = await corpo(await inv.concluirInventario(db, inv3));
assert.ok(!acha(rel3.faltando, '748801') && !acha(rel3.sobrando, '748801'),
  '"não sei" deixou o código entrar em correção');
const bloqueado = acha(rel3.naoComparavel, '748801');
assert.ok(bloqueado, 'o código com "não sei" sumiu do relatório');
assert.match(bloqueado.motivo, /sem dizer qual variação/);

const movimentosAntesDoNaoSei = raw.prepare('SELECT COUNT(*) n FROM movimentos').get().n;
const tentativa = await inv.aplicarInventario(db, inv3, { itens: [{ sku: '748801', variacao: 'Aro 16' }] });
assert.equal(status(tentativa), 409, '"não sei" não bloqueou a aplicação');
assert.equal(raw.prepare('SELECT COUNT(*) n FROM movimentos').get().n, movimentosAntesDoNaoSei,
  '"não sei" gerou movimento');
prova('5 — "não sei" bloqueia o SKU inteiro e não movimenta nada');

/* O retrato relido continua dizendo a mesma coisa: ele é a fonte da
   aplicação, e um retrato que esquecesse o bloqueio o reabriria. */
const relido = await corpo(await inv.resultadoInventario(db, inv3));
assert.ok(acha(relido.naoComparavel, '748801'), 'o retrato relido perdeu o bloqueio do "não sei"');
assert.ok(relido.naoComparavel.some((l) => l.naoIdentificado && l.contado === 2),
  'o retrato relido perdeu a quantidade contada sem identidade');
prova('5b — o retrato congelado, relido, continua bloqueando o mesmo código');

/* ══════════════════════════════ 11, 12, 13 — a razão e o passado */

assert.equal(razaoAberta(), 0, 'a razão terminou aberta');

const MOVIMENTOS_DEPOIS = retratoDosMovimentos();
assert.deepEqual(
  MOVIMENTOS_DEPOIS.slice(0, MOVIMENTOS_ANTES.length), MOVIMENTOS_ANTES,
  'um movimento histórico foi reescrito');
const incompleto = raw.prepare('SELECT * FROM movimentos WHERE id = ?').get(MOV_INCOMPLETO);
assert.equal(incompleto.variacao, null, 'o movimento incompleto ganhou uma variação inventada');
assert.equal(incompleto.variante_id, null);
assert.equal(incompleto.qtd, 2);
prova('11, 12 — a razão fecha no fim, e nenhum movimento histórico foi reescrito');

/* 13 sobre os dados: todo saldo que mudou tem movimento que o explique, e
   a soma dos movimentos de origem `inventario` é exatamente o que as
   diferenças aplicadas movimentaram. */
const porInventario = raw.prepare(
  `SELECT COUNT(*) n, COALESCE(SUM(qtd),0) s FROM movimentos WHERE origem = 'inventario'`).get();
/* Três: a diferença negativa aplicada, ela de novo depois do estorno, e a
   sobra. O movimento do ESTORNO não está entre eles — a origem dele é
   `estorno`, porque o fato que o gerou foi desfazer, não contar. */
assert.equal(porInventario.n, 3, 'o número de movimentos nascidos de contagem não bate');
assert.equal(porInventario.s, -2 - 2 + 1, 'a soma dos movimentos de inventário não bate com as diferenças');
const porEstorno = raw.prepare(
  `SELECT COUNT(*) n, COALESCE(SUM(qtd),0) s FROM movimentos WHERE origem = 'estorno'`).get();
assert.equal(porEstorno.n, 1);
assert.equal(porEstorno.s, 2, 'o estorno não devolveu exatamente o que a diferença tirou');
const semVinculo = raw.prepare(
  `SELECT COUNT(*) n FROM saidas_sem_faturamento
    WHERE motivo LIKE 'Diferença de inventário%' AND inventario_id IS NULL`).get().n;
assert.equal(semVinculo, 0, 'existe diferença de inventário sem vínculo estrutural');
prova('13 — todo saldo mudou por movimento, e toda diferença tem inventario_id');

/* ═══════════════════════════════ compatibilidade com o dashboard legado */

const inv4 = (await corpo(await inv.abrirInventario(db))).id;
const salvou = await corpo(await inv.salvarContagem(db, inv4, {
  contados: { 100001: 4, 100003: 4, 777777: 2 }, desconhecidos: [],
}));
assert.ok(salvou.ok);
assert.equal(salvou.codigos, 2, 'o código fora do catálogo entrou na contagem');

const detalhe = await corpo(await inv.detalheInventario(db, inv4));
assert.deepEqual(detalhe.desconhecidos, ['777777'], 'o código desconhecido não foi anunciado');
assert.equal(detalhe.itens.find((i) => i.sku === '100001').contado, 4,
  'a tela legada não consegue retomar a contagem');

/* Reenviar o mesmo lote não dobra nada, e um código que sai do corpo volta a
   NÃO CONTADO — que é o que impede a contagem parcial de zerar o catálogo. */
await inv.salvarContagem(db, inv4, { contados: { 100001: 4 }, desconhecidos: [] });
const depoisDoSegundoLote = await corpo(await inv.detalheInventario(db, inv4));
assert.equal(depoisDoSegundoLote.itens.length, 1, 'o segundo lote somou em vez de substituir');
assert.equal(depoisDoSegundoLote.itens[0].contado, 4);

const rel4 = await corpo(await inv.concluirInventario(db, inv4));
const linhaLegado = acha(rel4.faltando, '100001');
assert.ok(linhaLegado, 'a linha legada sumiu');
assert.equal(linhaLegado.sugestao, linhaLegado.dif, '`sugestao` sumiu do formato antigo');
assert.ok(Array.isArray(rel4.faltando) && Array.isArray(rel4.sobrando));
assert.ok(Array.isArray(rel4.naoConferido) && Array.isArray(rel4.naoComparavel));
assert.ok(!acha(rel4.faltando, '100003'), 'o código que saiu do lote virou faltante');

/* O `qtd` do corpo legado é ignorado: quem manda é o retrato congelado. */
const antesLegado = saldos();
const ajuste = await corpo(await inv.ajustarInventario(db, inv4, {
  itens: [{ sku: '100001', qtd: 999 }],
}));
assert.ok(ajuste.ok, `o ajuste legado falhou: ${ajuste.erro}`);
assert.equal(ajuste.aplicados[0].qtd, linhaLegado.dif, 'o servidor aceitou a quantidade do cliente');
assert.equal(saldos()['100001'], antesLegado['100001'] + linhaLegado.dif);
assert.equal(razaoAberta(), 0);
prova('a rota antiga continua servindo o dashboard legado, e ignora a quantidade do cliente');

/* Contagem agregada num SKU com variação, que é tudo o que a tela legada
   sabe mandar: ela é REGISTRADA, e não vira movimento. Registrar o que ela
   viu e inventar de qual aro a peça saiu são coisas diferentes. */
const inv5 = (await corpo(await inv.abrirInventario(db))).id;
await inv.salvarContagem(db, inv5, { contados: { 748801: 9 }, desconhecidos: [] });
const rel5 = await corpo(await inv.concluirInventario(db, inv5));
const agregadaLegado = acha(rel5.naoComparavel, '748801');
assert.ok(agregadaLegado, 'a contagem agregada legada virou diferença aplicável');
assert.match(agregadaLegado.motivo, /sem separar a variação/);
const antesAgregada = saldos();
assert.equal(status(await inv.ajustarInventario(db, inv5, { itens: [{ sku: '748801', qtd: 2 }] })), 409,
  'o ajuste legado fabricou movimento sem variação');
assert.equal(saldos()['748801'], antesAgregada['748801']);
prova('4b — a contagem agregada da tela legada é registrada e nunca vira movimento sem variação');

assert.equal(razaoAberta(), 0, 'a razão terminou aberta');
assert.deepEqual(retratoDosMovimentos().slice(0, MOVIMENTOS_ANTES.length), MOVIMENTOS_ANTES,
  'um movimento histórico foi reescrito no fim');

console.log(`\nInventário 4.4: ${provas} provas, razão fechada, nenhum movimento histórico tocado.`);
