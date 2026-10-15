/** Fase 4, item 5 — catálogo, mídia e publicação contra o schema real.
 *
 *  Roda `api/schema.sql` de verdade, aplica `api/migracao-catalogo-4-5.sql`
 *  em cima (duas vezes, para provar que a parte aditiva aguenta) e chama os
 *  módulos de verdade. O que fica de fora é só o HTTP, o R2 (um Map no
 *  lugar) e a Nuvemshop (um `fetch` de mentira).
 *
 *  As dezenove provas do § 17 do pedido, uma a uma:
 *
 *   1. SKU sempre passa pelo normalizador único;
 *   2. produto incompleto não fica pronto para publicar;
 *   3. preço zero não passa pelo gate;
 *   4. "Sem categoria" não é "Outros";
 *   5. múltiplas fotos por produto;
 *   6. foto principal única — garantida pelo BANCO;
 *   7. ordem de galeria determinística;
 *   8. upload em lote não perde o lote inteiro por um arquivo inválido;
 *   9. SKU desconhecido fica pendente;
 *  10. múltiplas fotos do mesmo SKU são agrupadas;
 *  11. o original não é perdido ao registrar a versão preparada;
 *  12. preparação não publica;
 *  13. aprovação não significa publicação concluída;
 *  14. publicação possui estado explícito;
 *  15. falha de publicação é representável;
 *  16. produto histórico vindo da loja continua legível;
 *  17. exclusão respeita todas as FKs reais;
 *  18. a razão de estoque permanece fechando;
 *  19. nenhuma escrita direta em `produtos.qtd`.
 *
 *  Usa `node:sqlite`, embutido no Node 22.5+. Onde não existir, o teste diz
 *  que não rodou em vez de passar em silêncio.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

/* ── 0. a migration aditiva roda sobre o schema que já tem tudo, e roda
   duas vezes. `ADD COLUMN` de coluna existente é erro em SQLite; um
   aplicador que não tolere isso não consegue reexecutar. */
function aplicar(arquivo, { tolerante = true } = {}) {
  for (const comando of dividirSql(ler(arquivo))) {
    try {
      raw.exec(comando);
    } catch (e) {
      if (tolerante && /duplicate column name/i.test(String(e.message))) continue;
      throw new Error(`${arquivo}: ${e.message}\n${comando.slice(0, 120)}`);
    }
  }
}

/** Divide um .sql respeitando string literal E comentário de linha. Sem a
 *  segunda parte, um `--` com apóstrofo dentro (português tem muitos)
 *  inverte o estado de aspas e o resto do arquivo vira lixo. */
function dividirSql(sql) {
  const fora = [];
  let atual = '', dentro = false;
  for (let i = 0; i < sql.length; i++) {
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

aplicar('api/migracao-catalogo-4-5.sql');
aplicar('api/migracao-catalogo-4-5.sql');
for (const t of ['produto_fotos', 'fotos_lotes', 'fotos_lote_itens', 'preparacao_tarefas']) {
  assert.ok(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t),
    `${t} não existe depois da migration`);
}
assert.ok(raw.prepare(`SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_produto_fotos_principal'`).get(),
  'o índice de principal única não existe');
prova('a migration aditiva roda duas vezes sem quebrar');

/* ── adaptador mínimo do D1 sobre node:sqlite. `batch` executa de verdade e,
   como no D1, tudo ou nada. */
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
const db = {
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

/* R2 de mentira: um Map. Prova a ida e a volta dos bytes sem rede nenhuma. */
const bucket = new Map();
const R2 = {
  put: async (k, b, o) => { bucket.set(k, { bytes: b, tipo: o?.httpMetadata?.contentType }); },
  get: async (k) => (bucket.has(k) ? { body: bucket.get(k).bytes, size: bucket.get(k).bytes.byteLength } : null),
  delete: async (k) => { bucket.delete(k); },
};
const envSemR2 = {};
const envComR2 = { FOTOS: R2 };

const {
  faltasDaPeca, prontaParaPublicar, sentinelasDeCategoria, SEM_CATEGORIA,
} = await mod('api/src/catalogo/completude.js');
const cat = await mod('api/src/catalogo/categorias.js');
const gal = await mod('api/src/catalogo/galeria.js');
const nomes = await mod('api/src/catalogo/nome-de-arquivo.js');
const lotes = await mod('api/src/catalogo/lote-de-fotos.js');
const prep = await mod('api/src/catalogo/preparacao.js');
const pub = await mod('api/src/catalogo/publicador.js');
const publicacao = await mod('api/src/publicacao-catalogo.js');
const produtos = await mod('api/src/produtos.js');
const comandos = await mod('api/src/catalogo-comandos.js');
const { normSku } = await mod('api/src/sku.js');

const bytes = (n, tam = 64) =>
  new Uint8Array(Array.from({ length: tam }, (_, i) => (i * 7 + n) % 251)).buffer;

/* ══════════════════════════════════════════════════════════ 1. SKU único */

{
  /* A importação de planilha fazia `String(sku).trim()` enquanto o cadastro
     fazia `normSku`: duas normalizações em dois caminhos de CRIAÇÃO. Um
     `br1234` da planilha entrava como peça fantasma ao lado do `BR1234`. */
  const r = await comandos.importarProdutos(db, {
    produtos: [{ sku: '  br1234 ', desc: 'Colar Teste', cat: 'Colar', preco: 10, qtd: 2 }],
  });
  assert.equal(r.status, 200, 'a importação recusou');
  const p = raw.prepare(`SELECT sku, qtd FROM produtos WHERE sku = 'BR1234'`).get();
  assert.ok(p, 'a planilha não gravou na forma canônica');
  assert.equal(p.qtd, 2);

  /* O mesmo código escrito de outro jeito reconhece a peça em vez de tentar
     criar a segunda. */
  await comandos.importarProdutos(db, {
    produtos: [{ sku: 'Br 1234', desc: 'Colar Teste', cat: 'Colar', preco: 10, qtd: 5 }],
  });
  const depois = raw.prepare(`SELECT COUNT(*) n FROM produtos WHERE sku LIKE '%1234'`).get();
  assert.equal(depois.n, 1, 'a planilha criou uma peça fantasma');
  assert.equal(raw.prepare(`SELECT qtd FROM produtos WHERE sku='BR1234'`).get().qtd, 5);
  prova('o SKU da planilha passa pelo normalizador único — nada de peça fantasma');
}

/* ═══════════════════════════════════════ 2, 3, 4. o juiz de completude */

raw.exec(`
  INSERT INTO produtos (sku, desc, cat, preco, qtd, origem_cadastro, autoridade) VALUES
    ('100100','Colar Sol','Colar',      99, 3, 'marquesa','marquesa'),
    ('100200','100200','Sem categoria',  0, 0, 'marquesa','marquesa'),
    ('100300','Pulseira Lua','Outros',  49, 2, 'marquesa','marquesa'),
    ('100400','Anel Chuva','Anel',    NULL, 1, 'marquesa','marquesa'),
    ('100500','Brinco Gota','Anel',      0, 1, 'marquesa','marquesa');
  INSERT INTO movimentos (sku, tipo, qtd, origem) VALUES
    ('100100','entrada',3,'teste'), ('100300','entrada',2,'teste'),
    ('100400','entrada',1,'teste'), ('100500','entrada',1,'teste');
`);

const sentinelas = await sentinelasDeCategoria(db);
const peca = (sku) => {
  const p = raw.prepare('SELECT * FROM produtos WHERE sku=?').get(sku);
  p.casa = p.qtd;
  return p;
};

{
  const f = faltasDaPeca(peca('100200'), { sentinelas });
  assert.deepEqual(f.faltas.sort(), ['categoria', 'foto', 'nome', 'preco', 'quantidade'].sort());
  assert.equal(prontaParaPublicar(peca('100200'), { sentinelas }), false);
  prova('produto incompleto não fica pronto para publicar, e a lista diz o que falta');
}

{
  /* §24 dizia "sem preço nunca é pronto" e três das quatro cópias liam só
     `preco == null`. Preço 0 passava numa tela e era recusado na outra. */
  assert.ok(faltasDaPeca(peca('100400'), { sentinelas }).faltas.includes('preco'), 'preço NULL passou');
  assert.ok(faltasDaPeca(peca('100500'), { sentinelas }).faltas.includes('preco'), 'preço zero passou');
  prova('preço zero não passa pelo gate — e preço NULL também não');
}

{
  /* A peça em 'Outros' é uma peça categorizada. A peça na sentinela, não. */
  assert.equal(faltasDaPeca(peca('100300'), { sentinelas }).faltas.includes('categoria'), false);
  assert.equal(faltasDaPeca(peca('100200'), { sentinelas }).faltas.includes('categoria'), true);
  const linhas = raw.prepare(`SELECT nome, sentinela FROM categorias WHERE nome IN ('Outros', ?)`).all(SEM_CATEGORIA);
  assert.equal(linhas.find((c) => c.nome === 'Outros').sentinela, 0);
  assert.equal(linhas.find((c) => c.nome === SEM_CATEGORIA).sentinela, 1);
  prova('"Sem categoria" não é "Outros" — uma é a ausência, a outra é categoria de verdade');
}

{
  /* O bloqueio de infraestrutura é uma lista SEPARADA das faltas: sem R2 o
     ambiente não consegue preparar imagem nenhuma, e isso não é pendência
     de trabalho da Sthefany. */
  const semR2 = faltasDaPeca({ ...peca('100100'), foto_url: 'https://loja/x.jpg' },
    { sentinelas, temR2: false });
  assert.deepEqual(semR2.faltas, []);
  assert.deepEqual(semR2.bloqueios, ['sem_r2']);
  prova('falta de trabalho humano e bloqueio de infraestrutura são listas diferentes');
}

/* ═════════════════════════════════════════ 5, 6, 7, 11. galeria própria */

const f1 = await gal.adicionarFoto(db, envComR2, '100100', bytes(1), 'image/jpeg', { arquivoNome: '100100.jpg' });
const f2 = await gal.adicionarFoto(db, envComR2, '100100', bytes(2), 'image/jpeg', { arquivoNome: '100100_1.jpg' });
const f3 = await gal.adicionarFoto(db, envComR2, '100100', bytes(3), 'image/png', { arquivoNome: '100100-frente.png' });

{
  assert.ok(f1.ok && f2.ok && f3.ok, 'a galeria recusou alguma foto');
  const g = await gal.galeriaDoProduto(db, '100100');
  assert.equal(g.total, 3);
  prova('uma peça tem várias fotos, e as três convivem');
}

{
  /* A regra é do BANCO, não do código: um UPDATE à mão tem de bater no
     índice único parcial. Se ela fosse só disciplina de quem escreve, o
     primeiro caminho novo que esquecesse de zerar a anterior criaria duas
     principais sem nenhum erro. */
  assert.equal(raw.prepare(`SELECT COUNT(*) n FROM produto_fotos WHERE sku='100100' AND principal=1`).get().n, 1);
  await gal.definirPrincipal(db, '100100', f3.fotoId);
  assert.equal(raw.prepare(`SELECT principal FROM produto_fotos WHERE id=?`).get(f3.fotoId).principal, 1);
  assert.equal(raw.prepare(`SELECT COUNT(*) n FROM produto_fotos WHERE sku='100100' AND principal=1`).get().n, 1);
  assert.throws(
    () => raw.prepare('UPDATE produto_fotos SET principal=1 WHERE id=?').run(f1.fotoId),
    /UNIQUE/i,
    'o banco aceitou duas principais no mesmo SKU');
  prova('a foto principal é única, e quem garante isso é o banco');
}

{
  await gal.reordenarGaleria(db, '100100', [f2.fotoId, f1.fotoId]);
  const a = await gal.galeriaDoProduto(db, '100100');
  const b = await gal.galeriaDoProduto(db, '100100');
  assert.deepEqual(a.fotos.map((x) => x.id), b.fotos.map((x) => x.id));
  /* Principal primeiro, mesmo tendo sido posta por último na ordem pedida:
     `principal DESC` vem antes de `ordem`, e a tela precisa disso. */
  assert.equal(a.fotos[0].id, f3.fotoId);
  const empatadas = raw.prepare(`SELECT COUNT(*) n FROM produto_fotos WHERE sku='100100'`).get().n;
  assert.equal(empatadas, 3);
  prova('a ordem da galeria é determinística e a principal vem primeiro');
}

{
  const chaveOriginal = raw.prepare('SELECT original_key FROM produto_fotos WHERE id=?').get(f1.fotoId).original_key;
  const bytesOriginais = bucket.get(chaveOriginal).bytes;
  const r = await gal.registrarPreparada(db, envComR2, f1.fotoId, bytes(99), 'image/png');
  assert.ok(r.ok);
  const linha = raw.prepare('SELECT original_key, preparada_key, estado FROM produto_fotos WHERE id=?').get(f1.fotoId);
  assert.equal(linha.original_key, chaveOriginal, 'a chave do original mudou');
  assert.notEqual(linha.preparada_key, chaveOriginal, 'a preparada escreveu por cima do original');
  assert.equal(bucket.get(chaveOriginal).bytes, bytesOriginais, 'os bytes do original foram sobrescritos');
  assert.equal(linha.estado, 'preparada');
  prova('registrar a versão preparada não perde o original — nem a chave, nem os bytes');
}

/* ══════════════════════════════════ 8, 9, 10. o lote e o nome do arquivo */

{
  /* A convenção de sufixo de compra (`212223-2` = segunda compra) pertence
     ao importador de histórico. Aqui, nada é removido por regra: procura-se
     do mais específico para o menos e quem responde é o catálogo. */
  assert.deepEqual(nomes.candidatosDoNome('100100-detalhe-2.jpg'),
    ['100100-DETALHE-2', '100100-DETALHE', '100100']);
  assert.deepEqual(nomes.candidatosDoNome('MONTE-COLAR.png'), ['MONTE-COLAR', 'MONTE']);
  const comAmbos = new Set(['212223', '212223-2']);
  assert.equal(nomes.casarArquivo('212223-2.jpg', comAmbos).situacao, 'nome_ambiguo');
  assert.equal(nomes.casarArquivo('212223-2.jpg', new Set(['212223'])).sku, '212223');
  prova('o sufixo -N não é removido por regra: ambíguo para, e o hífen legítimo sobrevive');
}

const lote = await lotes.analisarLote(db, {
  arquivos: [
    '100300.jpg', '100300_1.jpg', '100300-lado.jpg',   // três do mesmo código
    '999999.jpg',                                       // código que não existe
    'foto sem codigo.jpg',                              // nome que não produz candidato
    '100300_1.jpg',                                     // repetido na seleção
    '100400.jpg',                                       // vai falhar no upload
  ],
});

{
  assert.equal(lote.gravouBytes, false, 'a análise gravou byte');
  const porArquivo = new Map(lote.itens.map((i) => [i.arquivo, i]));
  assert.equal(porArquivo.get('100300.jpg').situacao, 'vinculado');
  assert.equal(porArquivo.get('999999.jpg').situacao, 'sku_nao_encontrado');
  assert.equal(porArquivo.get('foto sem codigo.jpg').situacao, 'sku_nao_encontrado');
  prova('um SKU desconhecido fica pendente no lote, com o motivo, em vez de sumir');
}

{
  const doSku = lote.itens.filter((i) => i.sku === '100300');
  assert.equal(doSku.length, 3, 'as fotos do mesmo código não foram agrupadas');
  assert.deepEqual(doSku.map((i) => i.ordemNoSku), [0, 1, 2]);
  assert.deepEqual(doSku.map((i) => i.situacao), ['vinculado', 'multiplas', 'multiplas']);
  assert.equal(lote.grupos.find((g) => g.sku === '100300').fotos, 3);
  prova('múltiplas fotos do mesmo SKU são agrupadas, não descartadas');
}

{
  const bons = [];
  for (const arquivo of ['100300.jpg', '100300_1.jpg', '100300-lado.jpg']) {
    bons.push(await lotes.enviarArquivoDoLote(db, envComR2, lote.loteId, arquivo, bytes(arquivo.length), 'image/jpeg'));
  }
  /* Os três modos de falhar, um de cada vez: tipo inválido, código sem
     dono, e arquivo que nem faz parte do lote. */
  const tipoRuim = await lotes.enviarArquivoDoLote(db, envComR2, lote.loteId, '100400.jpg', bytes(5), 'application/pdf');
  const semDono = await lotes.enviarArquivoDoLote(db, envComR2, lote.loteId, '999999.jpg', bytes(6), 'image/jpeg');
  const forasteiro = await lotes.enviarArquivoDoLote(db, envComR2, lote.loteId, 'outro.jpg', bytes(7), 'image/jpeg');

  assert.ok(bons.every((r) => r.ok), 'um arquivo bom falhou');
  assert.equal(tipoRuim.ok, false);
  assert.equal(semDono.ok, false);
  assert.equal(forasteiro.ok, false);

  const fim = await lotes.confirmarLote(db, lote.loteId);
  assert.equal(fim.ok, true);
  assert.equal(fim.resumo.gravadas, 3, 'o lote perdeu arquivos bons por causa dos ruins');
  assert.ok(fim.resumo.naoGravadas >= 1);
  assert.equal((await gal.galeriaDoProduto(db, '100300')).total, 3);
  prova('um arquivo inválido não derruba o lote: os bons entram e o ruim vira linha com motivo');
}

/* ═════════════════════════════════ 12, 13, 14, 15. preparar ≠ publicar */

const skuPub = '100300';
{
  const abertura = await prep.abrirTarefas(db, envSemR2, { skus: [skuPub] });
  assert.equal(abertura.abertas, 1, JSON.stringify(abertura.recusados));
  const tarefa = abertura.tarefas[0];

  const concluida = await prep.concluirTarefa(db, envSemR2, tarefa.tarefaId, {
    executor: 'assistido',
    resultado: {
      descricaoSite: 'Pulseira em banho dourado, feita à mão.',
      seoTitulo: 'Pulseira Lua — Marquesa Semijoias',
      seoDescricao: 'Pulseira Lua, banho dourado, peça única.',
    },
  });
  assert.equal(concluida.ok, true, concluida.erro);
  assert.equal(concluida.publicado, false, 'a preparação disse que publicou');
  assert.equal(concluida.item.estado, 'aguardando_aprovacao');
  assert.equal(raw.prepare(`SELECT COUNT(*) n FROM produtos WHERE sku=? AND url_loja IS NOT NULL`).get(skuPub).n, 0);
  /* O executor é rótulo livre: o domínio não sabe nem pergunta quem é. */
  assert.equal(raw.prepare(`SELECT executor FROM preparacao_tarefas WHERE id=?`).get(tarefa.tarefaId).executor, 'assistido');
  prova('preparação não publica — ela para em "aguardando aprovação"');
}

{
  const aprovada = await publicacao.aprovarPublicacao(db, skuPub, { aprovadoPor: 'sthefany' });
  assert.equal(aprovada.ok, true, aprovada.erro);
  assert.equal(aprovada.escritaNaLoja, false, 'aprovar escreveu na loja');
  assert.equal(aprovada.item.estado, 'aprovado_para_publicar');
  assert.equal(raw.prepare(`SELECT url_loja FROM produtos WHERE sku=?`).get(skuPub).url_loja, null);
  prova('aprovação não significa publicação concluída');
}

{
  /* Três travas em série, e nenhuma delas depende de o chamador lembrar. */
  const seco = await pub.publicarPeca(db, envSemR2, skuPub);
  assert.equal(seco.escritaNaLoja, false);
  assert.ok(seco.enviaria, 'o ensaio não mostrou o que subiria');
  assert.equal(seco.enviaria.published, false, 'o ensaio criaria a peça já publicada');

  const semFlag = await pub.publicarPeca(db, envSemR2, skuPub, { seco: false });
  assert.equal(semFlag.escritaNaLoja, false, 'publicou sem NUVEMSHOP_PUBLICACAO_ENABLED');
  assert.equal(semFlag.trava, 'sem_credencial');

  const comCredencial = { NUVEMSHOP_STORE_ID: '1', NUVEMSHOP_TOKEN: 't', NUVEMSHOP_WRITES_ENABLED: 'true' };
  const semPublicacao = await pub.publicarPeca(db, { ...comCredencial }, skuPub, { seco: false });
  assert.equal(semPublicacao.escritaNaLoja, false, 'a segunda trava não segurou');
  assert.equal(semPublicacao.trava, 'publicacao_desativada');
  prova('a publicação real é fail-closed em três camadas, e o ensaio mostra o corpo exato');
}

/* A loja de mentira: `fetch` trocado, sem rede nenhuma. */
const fetchOriginal = globalThis.fetch;
const respostas = [];
globalThis.fetch = async (url, opcoes = {}) => {
  const proxima = respostas.shift();
  if (!proxima) throw new Error('a loja de mentira ficou sem resposta');
  if (proxima.erro) return new Response(proxima.erro, { status: proxima.status || 500 });
  return new Response(JSON.stringify(proxima.corpo), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const envLoja = {
  NUVEMSHOP_STORE_ID: '1', NUVEMSHOP_TOKEN: 't',
  NUVEMSHOP_WRITES_ENABLED: 'true', NUVEMSHOP_PUBLICACAO_ENABLED: 'true',
  NUVEMSHOP_BASE: 'https://loja-de-mentira.invalido',
};

{
  respostas.push({ erro: 'Internal Server Error', status: 500 });
  const falhou = await pub.publicarPeca(db, envLoja, skuPub, { seco: false });
  assert.equal(falhou.ok, false);
  const linha = raw.prepare(`SELECT estado, publicacao_erro, tentativas FROM catalogo_publicacoes WHERE sku=?`).get(skuPub);
  assert.equal(linha.estado, 'falhou_ao_publicar', 'a falha não ficou representada no banco');
  assert.ok(linha.publicacao_erro, 'a falha não gravou o motivo');
  assert.equal(linha.tentativas, 1);
  prova('falha de publicação é representável: estado gravado, motivo gravado, tentativa contada');
}

{
  /* Repetir só é aceito porque a assinatura dos dados continua a mesma. */
  const repetida = await publicacao.repetirPublicacao(db, skuPub);
  assert.equal(repetida.ok, true, repetida.erro);

  respostas.push({ corpo: { id: 4242, name: { pt: 'Pulseira Lua' } } });
  const ok = await pub.publicarPeca(db, envLoja, skuPub, { seco: false });
  assert.equal(ok.ok, true, ok.erro);
  assert.equal(ok.escritaNaLoja, true);
  assert.equal(ok.visivelNaVitrine, false, 'criar e publicar viraram um passo só');
  const linha = raw.prepare(`SELECT estado, produto_id_loja, publicado_em, publicando_em FROM catalogo_publicacoes WHERE sku=?`).get(skuPub);
  assert.equal(linha.estado, 'publicado');
  assert.equal(linha.produto_id_loja, '4242');
  assert.ok(linha.publicando_em, '"publicando" não foi gravado antes da chamada externa');
  assert.ok(linha.publicado_em);
  assert.equal(raw.prepare(`SELECT produto_id_loja FROM produtos WHERE sku=?`).get(skuPub).produto_id_loja, '4242');
  prova('a publicação tem estado explícito: publicando, publicado, e o id externo guardado');
}

{
  respostas.push({ corpo: { id: 4242, published: false } });
  const fora = await pub.despublicarPeca(db, envLoja, skuPub, { seco: false, motivo: 'saiu de linha' });
  assert.equal(fora.ok, true, fora.erro);
  assert.equal(raw.prepare(`SELECT estado, despublicado_por FROM catalogo_publicacoes WHERE sku=?`).get(skuPub).estado,
    'despublicado');
  prova('despublicar existe como ato com nome, e fica registrado');
}
globalThis.fetch = fetchOriginal;

/* ═══════════════════════════════════════════ 16. o produto histórico */

{
  /* A peça que veio da loja em 2024: origem histórica preservada, nenhuma
     coluna nova exigida, e ela continua legível e listável. */
  raw.exec(`
    INSERT INTO produtos (sku, desc, cat, preco, qtd, url_loja, estoque_loja, visivel, nome_loja, foto_url, foto_origem)
    VALUES ('900900','Colar Antigo','Colar', 79, 4, 'colar-antigo', 4, 1, 'Colar Antigo', 'https://loja/colar.jpg', 'nuvemshop');
    INSERT INTO movimentos (sku, tipo, qtd, origem) VALUES ('900900','entrada',4,'historico');
  `);
  const p = peca('900900');
  assert.equal(p.origem_cadastro, null, 'o histórico foi reescrito com procedência inventada');
  assert.equal(p.autoridade, null);
  const f = faltasDaPeca(p, { sentinelas });
  assert.deepEqual(f.faltas, [], `a peça histórica virou incompleta: ${f.faltas}`);
  const lista = await publicacao.listarPublicacoes(db, envSemR2);
  const item = lista.itens.find((x) => x.sku === '900900');
  assert.ok(item, 'a peça histórica sumiu da lista');
  assert.equal(item.presencaNaLoja, true);
  assert.equal(item.estado, 'publicado');
  assert.equal(item.estadoObservado, true, 'a presença na vitrine virou decisão nossa');
  prova('produto histórico vindo da loja continua legível, e "publicado" é lido como observação');
}

/* ═══════════════════════════════════ 17, 18, 19. exclusão e a razão */

{
  const refs = await produtos.referenciasAProdutos(db);
  const tabelas = new Set(refs.map((r) => r.tabela));
  /* As três que a Fase 4.4 criou e que a lista digitada à mão esquecia, mais
     as que a 4.5 acabou de criar. */
  for (const t of ['inventario_contagem', 'inventario_resultado', 'inventario_nao_identificado',
    'catalogo_publicacoes', 'produto_fotos', 'preparacao_tarefas', 'saidas_sem_faturamento',
    'venda_itens', 'maleta_itens', 'kit_componentes']) {
    assert.ok(tabelas.has(t), `${t} referencia produtos e não foi derivada do schema`);
  }
  assert.ok(refs.length >= 16, `só ${refs.length} referências derivadas`);

  /* O cenário concreto do risco R2: peça com prévia de publicação e nenhuma
     venda passava em `podeExcluir: true`, o batch apagava `movimentos` e o
     DELETE final batia na FK — a peça perdia a razão e continuava existindo. */
  raw.exec(`INSERT INTO inventarios (id, status) VALUES (77,'aberto');`);
  raw.exec(`INSERT INTO inventario_contagem (inventario_id, sku, contado) VALUES (77,'100400',1);`);
  const bloqueado = await produtos.dependenciasDoProduto(db, '100400');
  assert.equal(bloqueado.podeExcluir, false, 'a contagem de inventário não bloqueou');
  assert.ok(bloqueado.bloqueios.some((b) => b.tipo === 'inventario_contagem'));
  prova('a exclusão respeita TODAS as FKs reais, derivadas do schema');
}

const razaoFecha = () => raw.prepare(`
  SELECT COUNT(*) n FROM produtos p
   WHERE p.qtd <> COALESCE((SELECT SUM(m.qtd) FROM movimentos m WHERE m.sku = p.sku), 0)`).get().n;
const movimentosOrfaos = () => raw.prepare(`
  SELECT COUNT(*) n FROM movimentos m
   WHERE NOT EXISTS (SELECT 1 FROM produtos p WHERE p.sku = m.sku)`).get().n;

{
  assert.equal(razaoFecha(), 0, 'a razão já não fechava antes da exclusão');
  /* Uma peça com galeria, tarefa e rascunho — tudo que "vai junto" — sai
     inteira, e os bytes dela saem do R2 na mesma operação. */
  const chaves = raw.prepare(`SELECT original_key, preparada_key FROM produto_fotos WHERE sku='100100'`).all()
    .flatMap((f) => [f.original_key, f.preparada_key]).filter(Boolean);
  assert.ok(chaves.length >= 3);
  const r = await produtos.excluirProduto(db, '100100', envComR2);
  assert.equal(r.ok, true, r.erro);
  assert.equal(razaoFecha(), 0, 'a exclusão quebrou a razão');
  assert.equal(movimentosOrfaos(), 0, 'sobrou movimento sem produto');
  assert.equal(raw.prepare(`SELECT COUNT(*) n FROM produto_fotos WHERE sku='100100'`).get().n, 0);
  assert.ok(chaves.every((k) => !bucket.has(k)), 'sobraram bytes órfãos no R2');
  prova('a razão continua fechando depois da exclusão, e nenhum byte fica órfão');
}

{
  /* A invariante do §19 no CÓDIGO desta fase: nenhum módulo novo escreve
     `produtos.qtd`. O gate do projeto (scripts/razao-estoque.test.mjs)
     varre a árvore inteira; aqui a prova é dirigida ao que a 4.5 criou,
     para a regressão apontar o arquivo certo. */
  const novos = readdirSync(join(raiz, 'api/src/catalogo')).map((f) => `api/src/catalogo/${f}`);
  const suspeito = /UPDATE\s+produtos\s+SET[^;`]*\bqtd\s*=/i;
  for (const arquivo of novos) {
    assert.equal(suspeito.test(ler(arquivo)), false, `${arquivo} escreve produtos.qtd direto`);
  }
  assert.ok(novos.length >= 6, 'os módulos da 4.5 não foram varridos');
  prova(`nenhuma escrita direta em produtos.qtd nos ${novos.length} módulos da 4.5`);
}

/* ══════════════════════════════════════ categorias: a identidade estável */

{
  const antes = raw.prepare(`SELECT COUNT(*) n FROM produtos WHERE cat='Colar'`).get().n;
  assert.ok(antes > 0);
  const r = await cat.renomearCategoria(db, 'colar', { nome: 'Colares' });
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.id, 'colar', 'a identidade mudou junto com o nome');
  assert.equal(raw.prepare(`SELECT COUNT(*) n FROM produtos WHERE cat='Colares'`).get().n, antes);
  assert.equal(raw.prepare(`SELECT COUNT(*) n FROM produtos WHERE cat='Colar'`).get().n, 0);
  assert.equal(raw.prepare(`SELECT COUNT(*) n FROM categorias WHERE id='colar' AND arquivada_em IS NULL`).get().n, 1);

  /* A normalização que faltava: "colares " não cria uma segunda categoria. */
  const dup = await cat.salvarCategoria(db, { nome: '  colares ' });
  assert.equal(dup.criada, false, 'criou uma categoria quase-igual');
  assert.equal(dup.id, 'colar');

  const colidiu = await cat.renomearCategoria(db, 'colar', { nome: 'Brinco' });
  assert.equal(colidiu.ok, false);
  assert.equal(colidiu.statusHttp, 409);

  assert.equal((await cat.arquivarCategoria(db, 'colar')).ok, false, 'arquivou categoria com peça');
  assert.equal((await cat.arquivarCategoria(db, 'sem-categoria')).ok, false, 'arquivou a sentinela');
  prova('a categoria sobrevive ao próprio nome, e não se duplica por caixa ou espaço');
}

{
  const r = await comandos.editarProduto(db, '100300', { cat: 'Inexistente' });
  assert.equal(r.status, 400, 'categoria inválida não foi recusada com mensagem própria');
  const corpo = await r.json();
  assert.ok(Array.isArray(corpo.categoriasDisponiveis), 'a recusa não diz quais existem');
  const s = await comandos.editarProduto(db, '100300', { status: 'sumido' });
  assert.equal(s.status, 400, 'status inválido entrou no banco');
  prova('categoria e status inválidos voltam com mensagem própria, não com erro de FK');
}

assert.equal(razaoFecha(), 0, 'a razão não fechava no fim do teste');
console.log(`\nCatálogo 4.5: ok — ${provas} provas no lugar`);
