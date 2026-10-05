/** Ajustar estoque, diferença de inventário como AJUSTE e exclusão segura de
 *  inventário — o feedback da Sthefany de 05/10/2026, contra o schema real,
 *  sem Worker.
 *
 *  O caso que abriu a rodada: o anel 256359 mostrava 8 no total quando ela
 *  comprou 7. Ela não conseguia corrigir ("não consegui editar"), tinha medo
 *  de o inventário chamar a diferença de perda, e queria apagar inventários
 *  de teste. Cada seção prova uma regra:
 *
 *   A  a migration é aditiva e roda duas vezes;
 *   B  AJUSTAR ESTOQUE grava UM movimento `ajuste` com motivo e os dois
 *      números, e a razão fecha (§54);
 *   C  as recusas: tela velha, abaixo do consignado, sem motivo, "Outro"
 *      sem texto, zero de diferença, quantidade inválida — nenhuma escreve;
 *   D  variação: razão sem identidade por aro ajusta o código inteiro e
 *      recusa aro; razão com identidade exige o aro (regra 2);
 *   E  `seco` mostra a prévia e não escreve;
 *   F  diferença de inventário sem perda declarada vira AJUSTE de
 *      inventário — nenhuma saída sem faturamento (§55);
 *   G  "Perda confirmada" continua sendo perda; sobra não pode ser perda;
 *   H  o painel clássico (`/ajustar`, sem motivo) também vira ajuste;
 *   I  excluir: cancelado sem efeito sai, com registro; concluído sem
 *      ajuste sai; com ajuste aplicado é recusado; em andamento é recusado;
 *      a variação criada na contagem continua no cadastro (§53);
 *   J  a lista de inventários diz o que é excluível.
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
const importar = (p) => import(pathToFileURL(join(raiz, p)).href);

const raw = new DatabaseSync(':memory:');
raw.exec(ler('api/schema.sql'));
raw.exec('PRAGMA foreign_keys = ON');

let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

/* ═══════════════ A — a migration é aditiva e roda duas vezes */
{
  const sql = ler('api/migracao-inventario-ajuste.sql');
  raw.exec(sql);
  raw.exec(sql);
  const efetivo = sql.replace(/^--.*$/gm, '');
  for (const proibido of [/\bDROP\b/i, /\bUPDATE\b/i, /\bINSERT\b/i, /\bDELETE\b/i, /RENAME TO/i, /ALTER TABLE/i]) {
    assert.ok(!proibido.test(efetivo), `a migration ganhou ${proibido}`);
  }
  const tabelas = raw.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((t) => t.name);
  assert.ok(tabelas.includes('inventario_ajustes') && tabelas.includes('inventarios_excluidos'));
  prova('A — a migration do ajuste de inventário é aditiva e roda duas vezes');
}

/* ── adaptador mínimo do D1 sobre node:sqlite. `batch` é atômico, como no D1. */
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
  async batch(stmts) {
    raw.exec('BEGIN');
    try {
      const r = (stmts || []).map((s) => ({ meta: s.executar() }));
      raw.exec('COMMIT');
      return r;
    } catch (e) { raw.exec('ROLLBACK'); throw e; }
  },
};
const corpo = async (r) => (r && typeof r.json === 'function' ? r.json() : r);
const status = (r) => (r && typeof r.status === 'number' ? r.status : 200);

const { ajustarEstoque, MOTIVOS_DE_AJUSTE } = await importar('api/src/estoque-comandos.js');
const inv = await importar('api/src/inventario.js');

const qtd = (sku) => raw.prepare('SELECT qtd FROM produtos WHERE sku = ?').get(sku).qtd;
const razaoAberta = () => raw.prepare(
  `SELECT COUNT(*) n FROM produtos p
     LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku = p.sku
    WHERE p.qtd <> COALESCE(m.s, 0)`).get().n;
const movimentos = () => raw.prepare('SELECT COUNT(*) n FROM movimentos').get().n;

/* ── cenário: o anel do caso real e um código com aro identificado. */
for (const cat of ['Anel', 'Brinco']) {
  raw.prepare('INSERT INTO categorias (nome,ordem) SELECT ?,0 WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nome = ?)').run(cat, cat);
}
const novo = (sku, desc, cat, n) => {
  raw.prepare("INSERT INTO produtos (sku,desc,cat,preco,qtd,status) VALUES (?,?,?,89,0,'ativo')").run(sku, desc, cat);
  if (n) {
    raw.prepare("INSERT INTO movimentos (sku,tipo,qtd,origem,obs) VALUES (?,'entrada',?,'importacao','Saldo inicial')").run(sku, n);
    raw.prepare('UPDATE produtos SET qtd = ? WHERE sku = ?').run(n, sku);
  }
};
novo('256359', 'Anel Inspiração Cartier', 'Anel', 7);
/* O +1 do go-live (a peça da maleta contada duas vezes). */
raw.prepare(`INSERT INTO movimentos (sku,tipo,qtd,origem,obs) VALUES ('256359','ajuste',1,'importacao',
  'Estoque total (Estoque (1).xlsx casa + Anexos I, 26/09/2026): planilha diz 8, sistema tinha 7')`).run();
raw.prepare("UPDATE produtos SET qtd = 8 WHERE sku = '256359'").run();
for (const [nome, ordem] of [['Aro 17', 0], ['Aro 21', 1]]) {
  raw.prepare('INSERT INTO produto_variacoes (sku,nome,ordem) VALUES (?,?,?)').run('256359', nome, ordem);
}
/* Uma peça com a Luciana (maleta aberta). */
raw.prepare("INSERT INTO revendedoras (nome,status) VALUES ('Luciana','ativa')").run();
const rev = raw.prepare('SELECT id FROM revendedoras').get().id;
raw.prepare("INSERT INTO maletas (rev_id,status,aberta_em) VALUES (?,'aberta','2026-09-01')").run(rev);
const maleta = raw.prepare('SELECT id FROM maletas').get().id;
raw.prepare('INSERT INTO maleta_itens (maleta_id,sku,qtd,devolvida,preco_envio) VALUES (?,?,1,0,89)').run(maleta, '256359');

/* Código com aro identificado na razão. */
novo('700001', 'Anel Com Aro', 'Anel', 0);
for (const [nome, ordem] of [['Aro 16', 0], ['Aro 18', 1]]) {
  raw.prepare('INSERT INTO produto_variacoes (sku,nome,ordem) VALUES (?,?,?)').run('700001', nome, ordem);
  raw.prepare("INSERT INTO movimentos (sku,variacao,tipo,qtd,origem,obs) VALUES ('700001',?,'entrada',2,'importacao','x')").run(nome);
}
raw.prepare("UPDATE produtos SET qtd = 4 WHERE sku = '700001'").run();
novo('800001', 'Brinco Simples', 'Brinco', 3);
novo('800002', 'Brinco Sobra', 'Brinco', 1);
assert.equal(razaoAberta(), 0);

/* ═══════════════ C — as recusas, antes de qualquer escrita */
{
  const antes = movimentos();
  const casos = [
    [{ quantidadeAtual: 7, quantidadeCorreta: 7, motivo: 'correcao_cadastro' }, 409, /mudou enquanto/],
    [{ quantidadeAtual: 8, quantidadeCorreta: 0, motivo: 'correcao_cadastro' }, 409, /com revendedoras/],
    [{ quantidadeAtual: 8, quantidadeCorreta: 7 }, 400, /motivo/],
    [{ quantidadeAtual: 8, quantidadeCorreta: 7, motivo: 'inventado' }, 400, /motivo/],
    [{ quantidadeAtual: 8, quantidadeCorreta: 7, motivo: 'outro' }, 400, /Outro/],
    [{ quantidadeAtual: 8, quantidadeCorreta: 8, motivo: 'correcao_cadastro' }, 400, /igual/],
    [{ quantidadeAtual: 8, quantidadeCorreta: -1, motivo: 'correcao_cadastro' }, 400, /quantidade correta/],
    [{ quantidadeAtual: 8, quantidadeCorreta: 6.5, motivo: 'correcao_cadastro' }, 400, /quantidade correta/],
    [{ quantidadeAtual: 8, quantidadeCorreta: 7, motivo: 'correcao_cadastro', variacao: 'Aro 17' }, 409, /não separa/],
  ];
  for (const [entrada, st, re] of casos) {
    const r = await ajustarEstoque(db, '256359', entrada);
    assert.equal(status(r), st, JSON.stringify(entrada));
    assert.match((await corpo(r)).erro, re, JSON.stringify(entrada));
  }
  assert.equal(status(await ajustarEstoque(db, '999999', { quantidadeAtual: 1, quantidadeCorreta: 0, motivo: 'outro' })), 404);
  const semMotivo = await corpo(await ajustarEstoque(db, '256359', { quantidadeAtual: 8, quantidadeCorreta: 7 }));
  assert.deepEqual(semMotivo.motivos.map((m) => m.id), MOTIVOS_DE_AJUSTE.map((m) => m.id));
  assert.equal(movimentos(), antes, 'uma recusa escreveu movimento');
  assert.equal(qtd('256359'), 8);
  prova('C — tela velha, abaixo do consignado, sem motivo, "Outro" vazio, diferença zero e número inválido: recusados sem escrever');
}

/* ═══════════════ E — `seco` é só prévia */
{
  const antes = movimentos();
  const p = await corpo(await ajustarEstoque(db, '256359', {
    quantidadeAtual: 8, quantidadeCorreta: 7, motivo: 'correcao_cadastro', seco: true,
  }));
  assert.equal(p.seco, true);
  assert.deepEqual([p.de, p.para, p.diferenca, p.consignado, p.emCasaAntes, p.emCasaDepois], [8, 7, -1, 1, 7, 6]);
  assert.equal(movimentos(), antes);
  assert.equal(qtd('256359'), 8);
  prova('E — a prévia diz de 8 para 7, diferença −1, em casa 7 → 6, e não grava nada');
}

/* ═══════════════ B — o ajuste de verdade, no caso real */
{
  const r = await corpo(await ajustarEstoque(db, '256359', {
    quantidadeAtual: 8, quantidadeCorreta: 7, motivo: 'correcao_cadastro',
    observacao: 'comprei 7; a peça da Luciana foi contada duas vezes no go-live',
  }));
  assert.equal(r.ok, true, r.erro);
  assert.equal(qtd('256359'), 7);
  const m = raw.prepare("SELECT * FROM movimentos WHERE sku = '256359' ORDER BY id DESC LIMIT 1").get();
  assert.equal(m.tipo, 'ajuste');
  assert.equal(m.qtd, -1);
  assert.equal(m.origem, 'ajuste');
  assert.equal(m.variacao, null, 'o ajuste chutou um aro');
  assert.match(m.obs, /^Ajuste de estoque · Correção de cadastro · de 8 para 7 · comprei 7/);
  /* O passado fica: o +1 do go-live continua lá, e a correção é uma linha nova. */
  assert.equal(raw.prepare("SELECT COUNT(*) n FROM movimentos WHERE sku = '256359' AND obs LIKE 'Estoque total%'").get().n, 1);
  assert.equal(r.saldos.consignado, 1);
  assert.equal(r.saldos.disponivel, 6);
  assert.equal(razaoAberta(), 0);
  prova('B — 256359 de 8 para 7: um movimento ajuste −1 com motivo e os dois números; o +1 antigo continua no histórico');

  const outro = await corpo(await ajustarEstoque(db, '800001', {
    quantidadeAtual: 3, quantidadeCorreta: 5, motivo: 'outro', observacao: 'achei duas na caixa da feira',
  }));
  assert.equal(outro.ok, true, outro.erro);
  const m2 = raw.prepare("SELECT * FROM movimentos WHERE sku = '800001' ORDER BY id DESC LIMIT 1").get();
  assert.equal(m2.qtd, 2);
  assert.equal(m2.obs, 'Ajuste de estoque · achei duas na caixa da feira · de 3 para 5');
  prova('B2 — "Outro": o texto dela vira o rótulo do ajuste');
}

/* ═══════════════ D — variação identificada exige o aro */
{
  const sem = await ajustarEstoque(db, '700001', { quantidadeAtual: 4, quantidadeCorreta: 3, motivo: 'contagem_fisica' });
  assert.equal(status(sem), 409);
  assert.deepEqual((await corpo(sem)).variacoes.map((v) => [v.nome, v.saldo]), [['Aro 16', 2], ['Aro 18', 2]]);
  const demais = await ajustarEstoque(db, '700001', { quantidadeAtual: 4, quantidadeCorreta: 1, motivo: 'contagem_fisica', variacao: 'Aro 16' });
  assert.equal(status(demais), 409, 'tirou de um aro mais do que ele tem');
  const certo = await corpo(await ajustarEstoque(db, '700001', {
    quantidadeAtual: 4, quantidadeCorreta: 3, motivo: 'contagem_fisica', variacao: 'Aro 18',
  }));
  assert.equal(certo.ok, true, certo.erro);
  const m = raw.prepare("SELECT * FROM movimentos WHERE sku = '700001' ORDER BY id DESC LIMIT 1").get();
  assert.equal(m.variacao, 'Aro 18');
  assert.equal(qtd('700001'), 3);
  assert.equal(razaoAberta(), 0);
  prova('D — razão com aro identificado: sem aro é recusado com os saldos; com aro, o movimento leva o aro');
}

/* ═══════════════ F — diferença de inventário NÃO é perda por padrão */
const abrir = async () => (await corpo(await inv.abrirInventario(db))).id;
let INV_AJUSTE;
{
  INV_AJUSTE = await abrir();
  await inv.contarItem(db, INV_AJUSTE, { sku: '800001', contado: 4 }); // sistema 5, achou 4
  await inv.contarItem(db, INV_AJUSTE, { sku: '800002', contado: 2 }); // sistema 1, achou 2
  const rel = await corpo(await inv.concluirInventario(db, INV_AJUSTE));
  assert.equal(rel.faltando.find((l) => l.sku === '800001').dif, -1);
  assert.equal(rel.sobrando.find((l) => l.sku === '800002').dif, 1);

  /* G (metade) — sobra não pode ser perda. */
  const sobraPerda = await inv.aplicarInventario(db, INV_AJUSTE, {
    itens: [{ sku: '800002', motivoId: 'perda', motivo: 'Perda confirmada' }],
  });
  assert.equal(status(sobraPerda), 409);
  assert.match((await corpo(sobraPerda)).erro, /sobra não é perda/);

  const saidasAntes = raw.prepare('SELECT COUNT(*) n FROM saidas_sem_faturamento').get().n;
  const r = await corpo(await inv.aplicarInventario(db, INV_AJUSTE, {
    itens: [
      { sku: '800001', motivoId: 'entrada_duplicada', motivo: 'Entrada duplicada ou cadastro errado' },
      { sku: '800002', motivoId: 'erro_de_contagem', motivo: 'Erro do sistema / contagem anterior', observacao: 'estava na vitrine' },
    ],
  }));
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual(r.aplicados.map((a) => [a.sku, a.qtd, a.classe, a.saidaId]),
    [['800001', -1, 'ajuste', null], ['800002', 1, 'ajuste', null]]);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM saidas_sem_faturamento').get().n, saidasAntes,
    'a diferença de inventário virou "perda" sem ela dizer');
  const mov = raw.prepare("SELECT * FROM movimentos WHERE sku = '800002' ORDER BY id DESC LIMIT 1").get();
  assert.equal(mov.tipo, 'ajuste');
  assert.equal(mov.origem, 'inventario');
  assert.match(mov.obs, new RegExp(`^Ajuste de inventário #${INV_AJUSTE} · Erro do sistema / contagem anterior · contado 2, sistema dizia 1`));
  assert.match(mov.obs, /estava na vitrine$/);
  assert.equal(qtd('800001'), 4);
  assert.equal(qtd('800002'), 2);

  const relido = await corpo(await inv.resultadoInventario(db, INV_AJUSTE));
  const l = relido.faltando.find((x) => x.sku === '800001');
  assert.equal(l.aplicado, true);
  assert.equal(l.motivoAplicado, 'Entrada duplicada ou cadastro errado');
  assert.equal(l.classeAplicada, 'ajuste');
  assert.equal(relido.conciliacao.conciliado, true);

  const repetido = await inv.aplicarInventario(db, INV_AJUSTE, { itens: [{ sku: '800001', motivoId: 'erro_de_contagem', motivo: 'x' }] });
  assert.equal(status(repetido), 409, 'aplicou a mesma diferença duas vezes');
  assert.equal(qtd('800001'), 4);

  /* A trava é do BANCO: com o flag do retrato limpo à mão (a segunda aba), a
     chave de `inventario_ajustes` recusa — e o batch desfaz o movimento. */
  raw.prepare('UPDATE inventario_resultado SET aplicado_em = NULL WHERE inventario_id = ? AND sku = ?').run(INV_AJUSTE, '800001');
  const movsAntes = movimentos();
  const concorrente = await inv.aplicarInventario(db, INV_AJUSTE, { itens: [{ sku: '800001', motivo: 'Erro do sistema / contagem anterior' }] });
  assert.equal(status(concorrente), 409);
  assert.match((await corpo(concorrente)).erro, /já foi corrigido/);
  assert.equal(movimentos(), movsAntes, 'o conflito deixou um movimento órfão');
  assert.equal(qtd('800001'), 4);
  raw.prepare("UPDATE inventario_resultado SET aplicado_em = datetime('now') WHERE inventario_id = ? AND sku = ?").run(INV_AJUSTE, '800001');
  assert.equal(razaoAberta(), 0);
  prova('F — falta e sobra viram AJUSTE de inventário (origem inventario, motivo na razão), nenhuma saída de perda; a chave impede aplicar duas vezes');
}

/* ═══════════════ G — perda só quando ela diz que é perda */
{
  const id = await abrir();
  await inv.contarItem(db, id, { sku: '800002', contado: 1 }); // sistema 2, achou 1
  await inv.concluirInventario(db, id);
  const r = await corpo(await inv.aplicarInventario(db, id, {
    itens: [{ sku: '800002', motivoId: 'perda', motivo: 'Perda confirmada' }],
  }));
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.aplicados[0].classe, 'perda');
  const s = raw.prepare('SELECT * FROM saidas_sem_faturamento WHERE id = ?').get(r.aplicados[0].saidaId);
  assert.equal(s.tipo, 'perda');
  assert.equal(s.inventario_id, id);
  /* "Quebrada ou danificada" pelo RÓTULO, sem id, também é perda. */
  assert.equal(inv.classeDoMotivo(null, 'Quebrada ou danificada'), 'perda');
  assert.equal(inv.classeDoMotivo(null, 'Não encontrada na casa'), 'ajuste');
  assert.equal(inv.classeDoMotivo(null, 'qualquer texto do Outro'), 'ajuste');
  assert.equal(inv.classeDoMotivo(null, null), 'ajuste');
  assert.equal(razaoAberta(), 0);
  prova('G — "Perda confirmada" continua indo para Saiu sem faturar como perda; sobra nunca é perda');
}

/* ═══════════════ H — o painel clássico (sem motivo) também vira ajuste */
{
  const id = await abrir();
  await inv.salvarContagem(db, id, { contados: { 800001: 3 }, desconhecidos: [] }); // sistema 4
  await inv.concluirInventario(db, id);
  const r = await corpo(await inv.ajustarInventario(db, id, { itens: [{ sku: '800001', qtd: -1 }] }));
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.aplicados[0].classe, 'ajuste');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM saidas_sem_faturamento WHERE inventario_id = ?').get(id).n, 0);
  assert.match(raw.prepare('SELECT motivo FROM inventario_ajustes WHERE inventario_id = ?').get(id).motivo,
    new RegExp(`Diferença de inventário #${id}`));
  prova('H — o /ajustar do painel clássico, sem motivo, vira ajuste de inventário e não perda');
}

/* ═══════════════ I — excluir inventário */
{
  /* I1 — cancelado, com uma variação criada durante a contagem. */
  const cancelado = await abrir();
  await inv.contarItem(db, cancelado, { sku: '800001', contado: 3 });
  const criou = await corpo(await inv.criarVariacaoNaContagem(db, cancelado, { sku: '256359', valor: 'Aro 23' }));
  assert.equal(criou.ok, true, JSON.stringify(criou));
  const eventos = raw.prepare('SELECT COUNT(*) n FROM inventario_eventos WHERE inventario_id = ?').get(cancelado).n;
  assert.equal(eventos, 1, 'a variação criada na contagem não ficou registrada');
  const variacaoCriada = raw.prepare(
    "SELECT nome FROM produto_variacoes WHERE sku = '256359' AND nome NOT IN ('Aro 17','Aro 21')").get().nome;

  /* Em andamento: recusado. */
  const aberto = await inv.excluirInventario(db, cancelado, {});
  assert.equal(status(aberto), 409);
  assert.match((await corpo(aberto)).erro, /em andamento/);

  await inv.cancelarInventario(db, cancelado);
  const antesMov = movimentos();
  const qtdAntes = raw.prepare('SELECT SUM(qtd) s FROM produtos').get().s;
  const ex = await corpo(await inv.excluirInventario(db, cancelado, { motivo: 'teste da Sthefany' }));
  assert.equal(ex.ok, true, ex.erro);
  assert.equal(ex.leituras, 1);
  assert.deepEqual(ex.variacoesMantidas, [{ sku: '256359', variacao: variacaoCriada }]);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM inventarios WHERE id = ?').get(cancelado).n, 0);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM inventario_contagem WHERE inventario_id = ?').get(cancelado).n, 0);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM inventario_eventos WHERE inventario_id = ?').get(cancelado).n, 0);
  const registro = raw.prepare('SELECT * FROM inventarios_excluidos WHERE inventario_id = ?').get(cancelado);
  assert.equal(registro.status, 'cancelado');
  assert.equal(registro.leituras, 1);
  assert.equal(registro.pecas, 3);
  assert.equal(registro.motivo, 'teste da Sthefany');
  assert.equal(JSON.parse(registro.eventos_json).length, 1);
  assert.ok(raw.prepare("SELECT 1 x FROM produto_variacoes WHERE sku = '256359' AND nome = ?").get(variacaoCriada),
    'a exclusão apagou a variação do cadastro');
  assert.equal(movimentos(), antesMov, 'excluir mexeu na razão');
  assert.equal(raw.prepare('SELECT SUM(qtd) s FROM produtos').get().s, qtdAntes, 'excluir mexeu no estoque');
  assert.equal(status(await inv.excluirInventario(db, cancelado, {})), 404, 'excluiu duas vezes');
  prova('I1 — inventário cancelado sem efeito é excluído com registro; a variação criada continua; nada no estoque muda');

  /* I2 — concluído sem nenhuma diferença aplicada também sai. */
  const concluido = await abrir();
  await inv.contarItem(db, concluido, { sku: '800001', contado: 1 });
  await inv.concluirInventario(db, concluido);
  const ex2 = await corpo(await inv.excluirInventario(db, concluido, {}));
  assert.equal(ex2.ok, true, ex2.erro);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM inventario_resultado WHERE inventario_id = ?').get(concluido).n, 0);
  prova('I2 — inventário concluído sem nenhuma diferença aplicada pode ser excluído');

  /* I3 — o que já mexeu em estoque não sai, nem por ajuste nem por perda. */
  for (const id of [INV_AJUSTE]) {
    const r = await inv.excluirInventario(db, id, {});
    assert.equal(status(r), 409);
    const b = await corpo(r);
    assert.match(b.erro, /já alterou o estoque/);
    assert.ok(b.efeitos.some((e) => /ajuste/.test(e)), JSON.stringify(b.efeitos));
    assert.ok(raw.prepare('SELECT 1 x FROM inventarios WHERE id = ?').get(id));
  }
  const comPerda = raw.prepare('SELECT inventario_id id FROM saidas_sem_faturamento WHERE inventario_id IS NOT NULL').get().id;
  const rp = await inv.excluirInventario(db, comPerda, {});
  assert.equal(status(rp), 409);
  assert.ok((await corpo(rp)).efeitos.some((e) => /perda/.test(e)));
  prova('I3 — inventário que aplicou ajuste ou perda é recusado, com a lista do que ele alterou');
}

/* ═══════════════ J — a lista diz o que pode ser excluído */
{
  const parado = await abrir();
  await inv.cancelarInventario(db, parado);
  const lista = await corpo(await inv.listarInventarios(db, 50));
  const porId = new Map(lista.map((i) => [i.id, i]));
  assert.equal(porId.get(parado).excluivel, true);
  assert.equal(porId.get(INV_AJUSTE).excluivel, false);
  assert.equal(porId.get(INV_AJUSTE).alterouEstoque, true);
  const andando = await abrir();
  assert.equal((await corpo(await inv.listarInventarios(db, 50))).find((i) => i.id === andando).excluivel, false);
  await inv.cancelarInventario(db, andando);
  prova('J — a lista marca excluível só o que não mexeu em estoque e não está em andamento');
}

assert.equal(razaoAberta(), 0, 'a razão terminou aberta');
console.log(`\nAjuste de estoque e inventário: ${provas} provas, razão fechada.`);
