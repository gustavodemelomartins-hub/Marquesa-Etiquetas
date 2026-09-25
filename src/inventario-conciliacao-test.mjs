/** Conciliação do inventário — a declaração de contagem completa, contra o
 *  schema real, sem Worker.
 *
 *  A pergunta que este arquivo existe para responder é uma só:
 *
 *      quando a pessoa AFIRMA que terminou de conferir, o que muda?
 *
 *  Até aqui a resposta era "nada", e isso era um problema. "Não conferido"
 *  era um estado permanente: 659 códigos ficavam sem resolução, sem ação e
 *  sem caminho, e um inventário que não resolve nada é um inventário que
 *  ninguém termina. A resposta certa também não é "vira tudo zero" — essa é
 *  a que a Fase 4.4 fechou de propósito.
 *
 *  A resposta desta rodada, e o que cada seção prova:
 *
 *   A  encerrar SEM declarar não cria zero nenhum, não cria divergência
 *      nenhuma, e o não conferido continua sendo não conferido (D3 intacto);
 *   B  declarar transforma o não conferido CONFERÍVEL em falta candidata —
 *      e nenhum movimento é aplicado por isso;
 *   C  a falta parcial resolve só a diferença, nunca o saldo inteiro;
 *   D  o que bateu não pede decisão nenhuma;
 *   E  a sobra tem caminho próprio e não é ajustada em silêncio;
 *   F  divergência sem motivo é recusada — o inventário não se concilia
 *      calado;
 *   G  a conciliação é DERIVADA: resolvidas, pendentes, e o estorno devolve
 *      a linha para pendente;
 *   H  CONSIGNADO — peça na maleta de uma revendedora não vira falsa falta
 *      da casa, nem mesmo sob a declaração. É a regra mais cara da tela;
 *   I  a declaração não alcança código cuja falta não tem endereço de
 *      variação. A regra 2 do projeto não abre exceção por declaração;
 *   J  o retrato congelado, relido, sabe dizer se o zero foi bipado ou
 *      declarado — e com que motivo cada diferença foi resolvida.
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

/* ── 0. a migration desta rodada roda sobre o schema pronto, e roda duas
   vezes. `ADD COLUMN` de coluna existente é erro em SQLite, e ninguém sabe
   se ela já rodou. */
function aplicar(arquivo) {
  for (const comando of ler(arquivo)
    .replace(/^--.*$/gm, '').split(';').map((c) => c.trim()).filter(Boolean)) {
    try {
      raw.exec(comando);
    } catch (e) {
      if (!/duplicate column name/i.test(String(e.message))) throw e;
    }
  }
}
aplicar('api/migracao-inventario-4-4.sql');
aplicar('api/migracao-inventario-conciliacao.sql');
aplicar('api/migracao-inventario-conciliacao.sql');
{
  const colunas = raw.prepare(`PRAGMA table_info(inventarios)`).all().map((c) => c.name);
  assert.ok(colunas.includes('contagem_completa'),
    '`inventarios.contagem_completa` não existe depois da migration');
  /* Aditiva de verdade: a migration não pode conter escrita de dado nem
     reconstrução de tabela — é o que a mantém Classe C e reversível. */
  const efetivo = ler('api/migracao-inventario-conciliacao.sql').replace(/^--.*$/gm, '');
  for (const proibido of [/\bDROP\b/i, /\bUPDATE\b/i, /\bINSERT\b/i, /RENAME TO/i]) {
    assert.ok(!proibido.test(efetivo), `a migration ganhou ${proibido}`);
  }
  prova('a migration da conciliação é aditiva e roda duas vezes sem quebrar');
}

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

/* ── o catálogo do cenário. Cada código existe para UMA das situações que a
   revisão precisa separar, e os nomes dizem qual. */
const ONTEM = '2026-09-01 09:00:00';
const PECAS = [
  ['500001', 'Colar Bate (3)', 'Colar', 89, 3],   // D — sistema 3, contado 3
  ['500002', 'Brinco Falta (3→2)', 'Brinco', 49, 3],  // C — falta parcial
  ['500003', 'Anel Some (3→0)', 'Anel', 129, 3],  // B — nunca bipado
  ['500004', 'Pulseira Sobra (1→2)', 'Pulseira', 59, 1], // E — sobra
  ['500005', 'Colar Na Maleta', 'Colar', 99, 4],  // H — consignado
  ['500006', 'Brinco Nao Bipado', 'Brinco', 39, 2],  // B — nunca bipado
  ['500007', 'Anel Aro Cego', 'Anel', 149, 5],    // I — razão sem identidade
];
for (const [sku, desc, cat, preco, qtd] of PECAS) {
  raw.prepare("INSERT INTO categorias (nome,ordem) SELECT ?,0 WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nome = ?)")
    .run(cat, cat);
  raw.prepare("INSERT INTO produtos (sku,desc,cat,preco,qtd,status) VALUES (?,?,?,?,?,'ativo')")
    .run(sku, desc, cat, preco, qtd);
}

const movimentar = (sku, qtd, variacao, varianteId) =>
  raw.prepare('INSERT INTO movimentos (sku,variacao,variante_id,tipo,qtd,origem,criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(sku, variacao, varianteId, 'entrada', qtd, 'importacao', ONTEM);

/* `500007` tem variação cadastrada E peça na razão sem identidade: 3 de 5
   sabem de qual aro são, 2 não. É o retrato dos movimentos historicamente
   incompletos que existem em produção. */
raw.prepare("INSERT INTO produto_variacoes (sku,nome,variante_id,ordem) VALUES ('500007','Aro 16','6001',0)").run();
raw.prepare("INSERT INTO produto_variacoes (sku,nome,variante_id,ordem) VALUES ('500007','Aro 17','6002',1)").run();
for (const [sku, , , , qtd] of PECAS) {
  if (sku === '500007') continue;
  movimentar(sku, qtd, null, null);
}
movimentar('500007', 3, 'Aro 16', '6001');
raw.prepare(
  `INSERT INTO movimentos (sku,tipo,qtd,origem,obs,criado_em)
   VALUES ('500007','entrada',2,'importacao','planilha antiga, sem aro',?)`).run(ONTEM);

/* H — `500005` sai numa maleta ABERTA. O que está na rua não se cobra da
   contagem da casa, e é isto que a declaração não pode desfazer. */
raw.prepare("INSERT INTO revendedoras (nome,status) VALUES ('Revendedora da Prova','ativa')").run();
const revId = raw.prepare('SELECT id FROM revendedoras ORDER BY id DESC LIMIT 1').get().id;
raw.prepare("INSERT INTO maletas (rev_id,status,aberta_em) VALUES (?,'aberta',?)").run(revId, ONTEM);
const maletaId = raw.prepare('SELECT id FROM maletas ORDER BY id DESC LIMIT 1').get().id;
raw.prepare('INSERT INTO maleta_itens (maleta_id,sku,qtd,devolvida,preco_envio) VALUES (?,?,?,0,?)')
  .run(maletaId, '500005', 4, 99);

const razaoAberta = () => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.s, 0)`).get().n;
const saldos = () => Object.fromEntries(
  raw.prepare('SELECT sku, qtd FROM produtos ORDER BY sku').all().map((r) => [r.sku, r.qtd]));
const movimentos = () => raw.prepare('SELECT COUNT(*) n FROM movimentos').get().n;

assert.equal(razaoAberta(), 0, 'a razão já nasceu aberta');
prova('a razão nasce fechada, com um movimento historicamente incompleto dentro');

const inv = await import('../api/src/inventario.js');
const { estornarSaida } = await import('../api/src/saidas.js');

const acha = (lista, sku, variacao = null) =>
  lista.find((l) => l.sku === sku && (l.variacao ?? null) === variacao);

/** Conta a mesma coisa nos dois inventários do teste: bate, falta parcial,
 *  sobra — e deixa `500003`, `500006` e `500007` sem bipe nenhum. */
async function contarOMesmo(id) {
  await inv.contarItem(db, id, { sku: '500001', contado: 3 });  // bate
  await inv.contarItem(db, id, { sku: '500002', contado: 2 });  // falta 1 de 3
  await inv.contarItem(db, id, { sku: '500004', contado: 2 });  // sobra 1
}

/* ═══════════════════════════ A — encerrar SEM declarar não muda nada */

const invA = (await corpo(await inv.abrirInventario(db))).id;
await contarOMesmo(invA);

const saldosAntes = saldos();
const movimentosAntes = movimentos();

const relA = await corpo(await inv.concluirInventario(db, invA));

assert.equal(relA.contagemCompleta, false,
  'o fechamento sem corpo se declarou completo sozinho');

/* Os três que ninguém bipou continuam INCÓGNITA — nenhum deles na lista de
   faltantes, nenhum com `contado: 0`. É a trava D3, intacta. */
for (const sku of ['500003', '500006']) {
  assert.ok(acha(relA.naoConferido, sku), `${sku} sumiu da lista de não conferidos`);
  assert.equal(acha(relA.faltando, sku), undefined,
    `${sku} virou faltante sem ninguém dizer que a conferência terminou`);
}
assert.equal(relA.faltando.length, 1, 'apareceu falta que ninguém contou');
assert.equal(acha(relA.faltando, '500002').dif, -1);

/* E nada foi escrito: concluir congela o retrato, não mexe em estoque. */
assert.deepEqual(saldos(), saldosAntes, 'concluir mexeu no saldo');
assert.equal(movimentos(), movimentosAntes, 'concluir criou movimento');
assert.equal(razaoAberta(), 0);
prova('A — encerrar sem declarar: nenhum zero criado, nenhuma divergência inventada');

/* O retrato CONGELADO diz o mesmo — não é só a resposta do fechamento. */
{
  const congelado = raw.prepare(
    `SELECT situacao, contado, dif FROM inventario_resultado
      WHERE inventario_id = ? AND sku = '500003'`).get(invA);
  assert.equal(congelado.situacao, 'nao_conferido');
  assert.equal(congelado.contado, null, 'o não conferido foi congelado como zero');
  assert.equal(congelado.dif, null);
  prova('A2 — o retrato congelado guarda o não conferido como NULL, não como zero');
}

/* ═══════════════ B — declarar transforma o não conferido em falta candidata */

/* Um inventário aberto por vez: o de cima foi CONCLUÍDO, então este abre.
   A contagem é a mesma — o que muda entre os dois é só a declaração. */
const ID = (await corpo(await inv.abrirInventario(db))).id;
await contarOMesmo(ID);

const antesDeclarar = saldos();
const movimentosAntesDeclarar = movimentos();

const rel = await corpo(await inv.concluirInventario(db, ID, { contagemCompleta: true }));

assert.equal(rel.contagemCompleta, true, 'a declaração não voltou no relatório');

/* `500003`: sistema 3, ninguém bipou, conferência declarada completa. */
const some = acha(rel.faltando, '500003');
assert.ok(some, '500003 não virou divergência depois da declaração');
assert.equal(some.esperado, 3);
assert.equal(some.contado, 0);
assert.equal(some.dif, -3, 'a diferença declarada não é a falta inteira');
assert.equal(some.declarado, true, 'a linha não diz que o zero foi DECLARADO, não bipado');
assert.ok(some.motivo, 'a linha declarada não explica de onde veio o zero');

/* E `500006`, com 2 peças, pelo mesmo caminho. */
assert.equal(acha(rel.faltando, '500006').dif, -2);

/* NENHUM movimento foi aplicado por causa da declaração. Ela muda o
   significado da linha no retrato; o ajuste continua sendo um segundo ato. */
assert.deepEqual(saldos(), antesDeclarar, 'a declaração mexeu no saldo sozinha');
assert.equal(movimentos(), movimentosAntesDeclarar, 'a declaração criou movimento sozinha');
assert.equal(razaoAberta(), 0);
prova('B — declarar vira falta candidata de -3, e nenhum movimento é aplicado por isso');

/* A declaração fica no BANCO: reabrir em três meses continua sabendo. */
assert.equal(raw.prepare('SELECT contagem_completa FROM inventarios WHERE id = ?').get(ID).contagem_completa, 1);
assert.equal(raw.prepare('SELECT contagem_completa FROM inventarios WHERE id = ?').get(invA).contagem_completa, 0);
prova('B2 — a declaração é um fato guardado, e o inventário anterior não foi contaminado');

/* ═════════════════════════════ C, D, E — falta parcial, bate, sobra */

const parcial = acha(rel.faltando, '500002');
assert.equal(parcial.esperado, 3);
assert.equal(parcial.contado, 2);
assert.equal(parcial.dif, -1, 'a falta parcial pediu as três peças, não a diferença');
assert.equal(parcial.declarado, false, 'a falta bipada foi marcada como declarada');
prova('C — sistema 3 e contado 2 resolvem UMA unidade, não as três');

assert.equal(acha(rel.faltando, '500001'), undefined);
assert.equal(acha(rel.sobrando, '500001'), undefined);
assert.ok(acha(rel.conferidosItens, '500001'), 'o que bateu sumiu do resumo');
assert.equal(acha(rel.conferidosItens, '500001').contado, 3);
prova('D — sistema 3 e contado 3 ficam no resumo e não pedem decisão nenhuma');

const sobra = acha(rel.sobrando, '500004');
assert.equal(sobra.dif, 1, 'a sobra não foi calculada');
assert.equal(saldos()['500004'], antesDeclarar['500004'],
  'a sobra foi devolvida ao estoque sem ninguém confirmar');
prova('E — sistema 1 e contado 2 viram +1, e nada é somado em silêncio');

/* ══════════════════════════════════ H — CONSIGNADO, sob a declaração */

/* `500005` tem 4 peças, TODAS na maleta de uma revendedora. Ninguém a bipou,
   e a conferência foi declarada completa. Ela NÃO pode aparecer como falta:
   as peças estão na rua, e cobrá-las da casa é o defeito mais caro que esta
   tela já teve. O esperado em casa dela é zero, então ela não gera linha. */
assert.equal(acha(rel.faltando, '500005'), undefined,
  'peça em maleta aberta virou falta da casa depois da declaração');
assert.equal(acha(rel.naoConferido, '500005'), undefined,
  'peça inteiramente consignada apareceu na conferência da casa');
assert.equal(
  raw.prepare(`SELECT COUNT(*) n FROM inventario_resultado WHERE inventario_id = ? AND sku = '500005'`)
    .get(ID).n,
  0, 'o retrato congelou uma linha para a peça que está toda na rua');
prova('H — peça na maleta de uma revendedora não vira falsa falta da casa, nem sob declaração');

/* ═══════════ I — a declaração não inventa de qual variação é a falta */

/* `500007` tem duas variações cadastradas e 2 peças na razão sem identidade.
   Ninguém o bipou. Declarar que a contagem terminou NÃO diz de qual aro a
   falta é — e movimento sem variação num código que tem variação cadastrada
   é exatamente o defeito D4. A linha continua não conferida, COM o motivo. */
{
  const cego = acha(rel.naoConferido, '500007');
  assert.ok(cego, '500007 sumiu do relatório');
  assert.equal(acha(rel.faltando, '500007'), undefined,
    'a declaração fabricou uma falta sem saber de qual variação ela é');
  assert.match(String(cego.motivo), /identidade de variação/i,
    'a recusa não foi anunciada — o código sumiu da lista sem explicação');
  prova('I — código com peça sem identidade de variação continua não conferido, e diz por quê');
}

/* ═══════════════ F — divergência sem motivo não se concilia em silêncio */

const semMotivo = await inv.aplicarInventario(db, ID, { itens: [{ sku: '500003' }] });
assert.equal(status(semMotivo), 409, 'aplicou uma diferença sem dizer o que aconteceu');
assert.ok((await corpo(semMotivo)).motivos.length, 'a recusa não ofereceu os motivos');
assert.deepEqual(saldos(), antesDeclarar, 'a recusa mexeu no saldo');
prova('F — diferença sem motivo é recusada, com a lista de motivos dentro da recusa');

/* E não conferido CONTINUA sendo recusado, mesmo com motivo: a declaração
   não transformou `500007` em nada, e a trava de D3 segue valendo para ele. */
{
  const bloqueado = await inv.aplicarInventario(db, ID, {
    itens: [{ sku: '500007', motivo: 'Não encontrada na casa' }],
  });
  assert.equal(status(bloqueado), 409);
  assert.match((await corpo(bloqueado)).erro, /não foi conferido|não é comparável/i);
  prova('F2 — o que a declaração não alcançou continua recusado na aplicação');
}

/* ═══════════════════════ G — a conciliação é derivada, e conta certo */

assert.equal(rel.conciliacao.divergencias, rel.faltando.length + rel.sobrando.length);
assert.equal(rel.conciliacao.resolvidas, 0);
assert.equal(rel.conciliacao.pendentes, rel.conciliacao.divergencias);
assert.equal(rel.conciliacao.conciliado, false,
  'um inventário com divergência pendente se declarou conciliado');
const TOTAL_DIVERGENCIAS = rel.conciliacao.divergencias;

/* Resolver UMA. O motivo vai para a coluna agrupável e chega à razão. */
const aplicada = await corpo(await inv.aplicarInventario(db, ID, {
  itens: [{ sku: '500003', motivo: 'Não encontrada na casa' }],
}));
assert.ok(aplicada.ok, `a aplicação falhou: ${aplicada.erro}`);
assert.equal(aplicada.aplicados[0].qtd, -3, 'aplicou uma quantidade diferente da congelada');
assert.equal(saldos()['500003'], antesDeclarar['500003'] - 3);
assert.equal(razaoAberta(), 0, 'a razão abriu ao aplicar a diferença declarada');

const saida = raw.prepare('SELECT * FROM saidas_sem_faturamento WHERE id = ?')
  .get(aplicada.aplicados[0].saidaId);
assert.equal(saida.tipo, 'perda');
assert.equal(saida.sentido, 'saida');
assert.equal(saida.inventario_id, ID, 'a diferença declarada não ficou amarrada ao inventário');
assert.equal(saida.motivo, 'Não encontrada na casa', 'o motivo escolhido não sobreviveu');
const mov = raw.prepare('SELECT * FROM movimentos WHERE id = ?').get(saida.movimento_id);
assert.equal(mov.origem, 'inventario', 'a origem do movimento não é `inventario` (D9)');
assert.match(mov.obs, /Não encontrada na casa/, 'o motivo não chegou à razão');
assert.match(mov.obs, new RegExp(`inventário #${ID}`), 'a razão não diz de qual inventário veio');
prova('G — o motivo escolhido chega à razão, junto com o número do inventário');

/* A conciliação anda: uma resolvida, o resto pendente. */
{
  const relido = await corpo(await inv.resultadoInventario(db, ID));
  assert.equal(relido.conciliacao.divergencias, TOTAL_DIVERGENCIAS);
  assert.equal(relido.conciliacao.resolvidas, 1, 'a conciliação não contou a diferença aplicada');
  assert.equal(relido.conciliacao.pendentes, TOTAL_DIVERGENCIAS - 1);
  assert.equal(relido.conciliacao.conciliado, false);
  assert.equal(acha(relido.faltando, '500003').motivoAplicado, 'Não encontrada na casa',
    'o motivo sumiu do relatório relido — um motivo que não sobrevive ao recarregar é enfeite');
  prova('G2 — a conciliação anda sozinha: 1 resolvida, o resto pendente');
}

/* ═════════════════ J — o retrato relido separa o zero bipado do declarado */

/* `500003` nunca foi bipado: o zero dele é declaração. `500002` foi bipado
   com 2 de 3: a falta dele é contagem. Os dois estão na mesma lista, e a
   revisão precisa poder dizer qual é qual três meses depois. */
{
  const relido = await corpo(await inv.resultadoInventario(db, ID));
  assert.equal(relido.contagemCompleta, true, 'o retrato relido esqueceu a declaração');
  assert.equal(acha(relido.faltando, '500003').declarado, true);
  assert.equal(acha(relido.faltando, '500002').declarado, false);
  prova('J — o retrato relido sabe dizer se o zero foi bipado ou declarado');
}

/* ═══════════════ G3 — o estorno devolve a linha para PENDENTE */

const estorno = await estornarSaida(db, saida.id, { motivo: 'apareceu na gaveta de baixo' });
assert.ok(estorno.ok, `o estorno falhou: ${estorno.erro}`);
assert.equal(saldos()['500003'], antesDeclarar['500003'], 'o estorno não devolveu as peças');
assert.equal(razaoAberta(), 0);
{
  const relido = await corpo(await inv.resultadoInventario(db, ID));
  assert.equal(relido.conciliacao.resolvidas, 0,
    'a diferença estornada continuou contando como resolvida');
  assert.equal(relido.conciliacao.pendentes, TOTAL_DIVERGENCIAS);
  assert.equal(acha(relido.faltando, '500003').motivoAplicado, null,
    'o motivo de uma resolução estornada continuou sendo exibido como vigente');
  prova('G3 — estornar devolve a divergência para pendente, e a conciliação recua junto');
}

/* ══════════════ o fecho: a razão, e nenhuma peça inventada no caminho */

assert.equal(razaoAberta(), 0, 'a razão terminou aberta');
assert.deepEqual(saldos(), antesDeclarar,
  'o teste terminou com saldo diferente do que começou — sobrou escrita no caminho');

console.log(`\nInventário · conciliação: ${provas} provas, razão fechada.`);
