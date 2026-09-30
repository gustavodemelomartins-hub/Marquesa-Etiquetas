/** Galeria de fotos da peça + importação da loja online para o R2.
 *
 *  O Worker REAL (`api/src/index.js`) numa base SQLite em memória, com um
 *  R2 de mentira (um Map), uma Nuvemshop de mentira e uma CDN de mentira —
 *  tudo dentro deste processo, por um `fetch` substituto. Nenhuma chamada
 *  sai do computador, nenhuma chave de verdade é usada.
 *
 *  O que fica provado, na ordem em que a Sthefany usaria:
 *
 *   1. a migration é aditiva e roda duas vezes sobre o schema anterior;
 *   2. a análise (dry-run) lê a loja inteira e NÃO baixa nem grava foto;
 *   3. o casamento: SKU, vínculo de variação, anúncio com vários códigos
 *      (revisar), código em dois anúncios (revisar), código que não existe
 *      aqui (sem peça) — nenhuma foto vai para a peça errada;
 *   4. a importação em lotes traz TODAS as fotos, na ordem da loja, com
 *      miniatura, principal = a da vitrine, e anuncia a foto que falhou;
 *   5. reimportar não duplica nada;
 *   6. o `/api/state` mostra a principal e as contagens; o link assinado
 *      abre a foto, e sem assinatura não abre;
 *   7. definir principal, trocar a principal, reordenar, e a ordem persiste;
 *   8. upload manual de várias fotos entra no fim; a mesma imagem duas
 *      vezes é recusada;
 *   9. remover apaga os bytes do R2, promove a próxima principal, e a
 *      importação seguinte NÃO traz a foto de volta;
 *  10. a importação de UMA peça pela ficha: prévia, importação, e "não
 *      encontrei na loja";
 *  11. sem R2, tudo recusa com o motivo — nada finge que gravou;
 *  12. nenhuma escrita na loja, nenhum movimento de estoque, razão fechando.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

let provas = 0;
const prova = (t) => { provas += 1; console.log(`  ok   ${t}`); };

/** Divide um .sql respeitando string e comentário de linha. */
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
function aplicarMigration(banco, sql) {
  for (const comando of dividirSql(sql)) {
    try { banco.exec(comando); } catch (e) {
      if (/duplicate column name/i.test(String(e.message))) continue;
      throw e;
    }
  }
}

/* ═══════════════════════════════════════ 1. a migration, sobre o ANTES */
{
  /* O schema de antes desta mudança, tirado do próprio git: a migration
     tem de funcionar no banco que produção TEM, não no que o repositório
     descreve depois dela. */
  let antes = null;
  try {
    antes = execFileSync('git', ['show', 'HEAD:api/schema.sql'], { cwd: raiz, encoding: 'utf8' });
  } catch { /* fora de um clone git: cai no schema atual */ }
  const velho = new DatabaseSync(':memory:');
  velho.exec(antes || ler('api/schema.sql'));
  velho.exec(`INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('X1', 'Peça', 'Colar', 10, 0)`);
  velho.exec(`INSERT INTO produto_fotos (id, sku, ordem, principal, origem, original_key)
              VALUES ('f-velha', 'X1', 0, 1, 'upload', 'produtos/X1/f-velha/original')`);
  const migration = ler('api/migracao-galeria-fotos.sql');
  aplicarMigration(velho, migration);
  aplicarMigration(velho, migration);
  const cols = velho.prepare(`SELECT name FROM pragma_table_info('produto_fotos')`).all().map((c) => c.name);
  for (const c of ['miniatura_key', 'largura', 'altura', 'produto_id_loja', 'variante_id_loja', 'posicao_loja', 'removida_em']) {
    assert.ok(cols.includes(c), `a coluna ${c} não entrou`);
  }
  const linha = velho.prepare(`SELECT * FROM produto_fotos WHERE id = 'f-velha'`).get();
  assert.equal(linha.original_key, 'produtos/X1/f-velha/original');
  assert.equal(linha.removida_em, null);
  assert.ok(velho.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'idx_produto_fotos_imagem_loja'`).get());
  prova('a migration é aditiva, roda duas vezes e não muda a linha que já existia');
}

/* ═══════════════════════════════════════ o Worker de verdade, em processo */

const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON;');
raw.exec(ler('api/schema.sql'));

const preparar = (sql) => {
  const st = { sql, args: [] };
  st.bind = (...a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run });
  st.first = async function (col) {
    const l = raw.prepare(this.sql).get(...this.args) ?? null;
    return col && l ? l[col] : l;
  };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () {
    const r = raw.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(r.changes ?? 0) } };
  };
  return st;
};
const DB = {
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
  exec: async (sql) => { raw.exec(sql); return { count: 0 }; },
};

/* R2 de mentira. */
const bucket = new Map();
const FOTOS = {
  put: async (k, b, o) => { bucket.set(k, { bytes: b, tipo: o?.httpMetadata?.contentType }); },
  get: async (k) => (bucket.has(k)
    ? { body: bucket.get(k).bytes, size: bucket.get(k).bytes.byteLength, httpMetadata: { contentType: bucket.get(k).tipo } }
    : null),
  delete: async (k) => { bucket.delete(k); },
};

/* ── A loja de mentira e a CDN de mentira ──────────────────────────────── */
const CDN = 'https://acdn.nuvemshop.com.br/stores/001/products';
const img = (nome) => `${CDN}/${nome}-1024-1024.jpg`;
const jpeg = (semente) => {
  const b = new Uint8Array(400);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < b.length; i++) b[i] = (i * 13 + semente.length * 7 + semente.charCodeAt(semente.length - 1)) % 251;
  const marca = new TextEncoder().encode(semente);
  b.set(marca, 8);
  return b.buffer;
};
const loja = {
  produtos: [
    /* UMA foto, um código. */
    { id: 100, name: { pt: 'Brinco uma foto' }, images: [{ id: 1001, src: img('uma'), position: 1 }],
      variants: [{ id: 1100, sku: 'UMA' }] },
    /* TRÊS fotos, um código — a galeria inteira tem de vir, na ordem. */
    { id: 200, name: { pt: 'Colar três fotos' },
      images: [
        { id: 2003, src: img('var-c'), position: 3 },
        { id: 2001, src: img('var-a'), position: 1 },
        { id: 2002, src: img('var-b'), position: 2 },
      ],
      variants: [{ id: 2100, sku: 'VARIAS' }] },
    /* Anel com aro: variações com o MESMO código; a foto 3002 é da
       variação 3100 (aro 16). */
    { id: 300, name: { pt: 'Anel com aro' },
      images: [{ id: 3001, src: img('anel-geral'), position: 1 }, { id: 3002, src: img('anel-16'), position: 2 }],
      variants: [{ id: 3100, sku: 'ANEL', image_id: 3002 }, { id: 3101, sku: 'ANEL' }] },
    /* Variações com códigos PRÓPRIOS da loja (ARGOLA-P, ARGOLA-G) que aqui
       são variações de UM código só (ARGOLA) — vínculo gravado. */
    { id: 400, name: { pt: 'Argola' },
      images: [{ id: 4001, src: img('argola'), position: 1 }],
      variants: [{ id: 4100, sku: 'ARGOLA-P' }, { id: 4101, sku: 'ARGOLA-G' }] },
    /* Um anúncio que junta DOIS códigos daqui, com foto solta: revisar. */
    { id: 500, name: { pt: 'Conjunto misto' },
      images: [{ id: 5001, src: img('misto'), position: 1 }],
      variants: [{ id: 5100, sku: 'AMB1' }, { id: 5101, sku: 'AMB2' }] },
    /* O MESMO código em dois anúncios: cadastro duplicado na loja. */
    { id: 600, name: { pt: 'Pulseira A' }, images: [{ id: 6001, src: img('dup-a'), position: 1 }],
      variants: [{ id: 6100, sku: 'DUP' }] },
    { id: 601, name: { pt: 'Pulseira B' }, images: [{ id: 6011, src: img('dup-b'), position: 1 }],
      variants: [{ id: 6110, sku: 'DUP' }] },
    /* Código que não existe aqui. */
    { id: 700, name: { pt: 'Peça que só a loja tem' }, images: [{ id: 7001, src: img('fora'), position: 1 }],
      variants: [{ id: 7100, sku: 'FORA' }] },
    /* A foto desta está fora do ar na CDN. */
    { id: 800, name: { pt: 'Foto quebrada' }, images: [{ id: 8001, src: img('quebrada'), position: 1 }],
      variants: [{ id: 8100, sku: 'QUEBRADA' }] },
    /* Anúncio sem foto nenhuma. */
    { id: 900, name: { pt: 'Sem foto na loja' }, images: [], variants: [{ id: 9100, sku: 'SEMLOJA' }] },
  ],
  chamadas: [],
};

const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (entrada, opcoes = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url);
  const metodo = String(opcoes.method || 'GET').toUpperCase();
  if (url.hostname === 'api.loja-falsa.test') {
    loja.chamadas.push(`${metodo} ${url.pathname}`);
    if (metodo !== 'GET') return new Response('{}', { status: 405 });
    const partes = url.pathname.split('/').filter(Boolean);     // [versão, loja, 'products', ...]
    const resto = partes.slice(2);
    if (resto.length === 1 && resto[0] === 'products') {
      const pagina = Number(url.searchParams.get('page') || 1);
      return Response.json(pagina === 1 ? loja.produtos : []);
    }
    if (resto[0] === 'products' && resto[1] === 'sku') {
      const sku = decodeURIComponent(resto[2]);
      const p = loja.produtos.find((x) => x.variants.some((v) => v.sku === sku));
      return p ? Response.json(p) : new Response('{"description":"Not found"}', { status: 404 });
    }
    if (resto[0] === 'products' && resto[1]) {
      const p = loja.produtos.find((x) => String(x.id) === resto[1]);
      return p ? Response.json(p) : new Response('{"description":"Not found"}', { status: 404 });
    }
    return new Response('[]', { status: 404 });
  }
  if (url.hostname === 'acdn.nuvemshop.com.br') {
    if (url.pathname.includes('quebrada')) return new Response('fora do ar', { status: 404 });
    return new Response(jpeg(url.pathname), { headers: { 'Content-Type': 'image/jpeg' } });
  }
  return fetchOriginal(entrada, opcoes);
};

const { default: worker } = await import(pathToFileURL(join(raiz, 'api/src/index.js')).href);
const CHAVE = 'chave-de-teste-galeria';
const envBase = {
  DB, API_KEY: CHAVE,
  NUVEMSHOP_STORE_ID: '123', NUVEMSHOP_TOKEN: 'token-falso',
  NUVEMSHOP_BASE: 'https://api.loja-falsa.test',
  NUVEMSHOP_WRITES_ENABLED: 'false',
};
const envComR2 = { ...envBase, FOTOS };
const envSemR2 = { ...envBase };

async function chamar(env, metodo, caminho, corpo, cabecalhos = {}) {
  const bytes = corpo instanceof ArrayBuffer;
  const r = await worker.fetch(new Request(`http://api.local${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${CHAVE}`,
      'Content-Type': bytes ? (cabecalhos['Content-Type'] || 'image/jpeg') : 'application/json',
      ...cabecalhos,
    },
    body: corpo === undefined ? undefined : (bytes ? corpo : JSON.stringify(corpo)),
  }), env, { waitUntil() {} });
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, corpo: tipo.includes('json') ? await r.json() : await r.arrayBuffer() };
}
const api = (m, c, b, h) => chamar(envComR2, m, c, b, h);
const noBanco = (sql, ...a) => raw.prepare(sql).all(...a);
const um = (sql, ...a) => raw.prepare(sql).get(...a);

/* ── o catálogo daqui ──────────────────────────────────────────────────── */
{
  const r = await api('POST', '/api/produtos/importar', {
    produtos: ['SEM', 'UMA', 'VARIAS', 'ANEL', 'ARGOLA', 'AMB1', 'AMB2', 'DUP', 'QUEBRADA', 'SEMLOJA']
      .map((sku) => ({ sku, desc: `Peça ${sku}`, cat: 'Colar', preco: 50, qtd: 2 })),
  });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  /* Os vínculos gravados: ARGOLA tem as duas variações da loja; ANEL tem o
     aro 16 amarrado à variação 3100. */
  raw.exec(`INSERT INTO produto_variacoes (sku, nome, variante_id, produto_id, ordem) VALUES
            ('ARGOLA', 'P', '4100', '400', 0), ('ARGOLA', 'G', '4101', '400', 1),
            ('ANEL', '16', '3100', '300', 0), ('ANEL', '17', '3101', '300', 1)`);
}
const movimentosAntes = um(`SELECT COUNT(*) n, COALESCE(SUM(qtd),0) s FROM movimentos`);

/* ═══════════════════════════════════════ 2 e 3. análise = dry-run */
let analise;
{
  const r = await api('POST', '/api/fotos/loja/analisar');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  analise = r.corpo;
  assert.equal(bucket.size, 0, 'a análise gravou bytes no R2');
  assert.equal(um(`SELECT COUNT(*) n FROM produto_fotos`).n, 0, 'a análise criou foto na galeria');
  const s = analise.resumo;
  assert.equal(s.anunciosNaLoja, 10);
  assert.equal(s.anunciosSemFoto, 1);
  assert.equal(s.fotosEncontradas, 12);
  /* UMA 1 + VARIAS 3 + ANEL 2 + ARGOLA 1 + QUEBRADA 1 = 8 fotos com dono. */
  assert.equal(s.fotosNovas, 8, JSON.stringify(s));
  assert.equal(s.fotosJaNoR2, 0);
  assert.equal(s.fotosParaRevisar, 3, 'misto (1) + DUP em dois anúncios (2)');
  assert.equal(s.fotosSemPeca, 1, 'FORA');
  assert.equal(s.anunciosComCorrespondencia, 5);
  prova('a análise lê a loja inteira e não baixa, não grava, não vincula nada');

  const misto = analise.revisar.find((g) => g.produtoId === '500');
  assert.ok(misto, 'o anúncio com dois códigos não foi para revisão');
  assert.deepEqual(misto.candidatos.map((c) => c.sku).sort(), ['AMB1', 'AMB2']);
  assert.match(misto.motivo, /mais de um código|2 códigos/);
  const dup = analise.revisar.filter((g) => g.produtoId === '600' || g.produtoId === '601');
  assert.equal(dup.length, 2, 'o código em dois anúncios não foi para revisão');
  assert.match(dup[0].motivo, /2 anúncios/);
  assert.equal(analise.semPeca[0].produtoId, '700');
  assert.match(analise.semPeca[0].motivo, /FORA/);
  assert.equal(analise.amostra.find((n) => n.sku === 'ARGOLA')?.via, 'vinculo',
    'a argola não casou pelo vínculo gravado das variações');
  assert.ok(analise.skusParaRevisar.includes('AMB1') && analise.skusParaRevisar.includes('DUP'));
  prova('SKU ambíguo e anúncio misto vão para "Precisa revisar", com candidatos e motivo');
  prova('código que só a loja tem vai para "sem correspondência", sem foto em peça nenhuma');
  prova('variações com código próprio na loja casam pelo vínculo gravado, não pelo nome');
}

/* ═══════════════════════════════════════ 4. importação em lotes */
{
  const ignorar = [];
  let voltas = 0, importadas = 0;
  const falhas = [];
  for (;;) {
    const r = await api('POST', '/api/fotos/loja/importar', { limite: 3, ignorar });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    importadas += r.corpo.importadas;
    for (const f of r.corpo.falhas) { ignorar.push(f.imagemId); falhas.push(f); }
    voltas++;
    if (!r.corpo.restantes || voltas > 10) break;
  }
  assert.equal(importadas, 7);
  assert.equal(falhas.length, 1);
  assert.equal(falhas[0].sku, 'QUEBRADA');
  assert.match(falhas[0].motivo, /404/);
  assert.ok(voltas >= 3, 'o limite por lote não foi respeitado');
  prova('a importação em lotes traz as 7 fotos que baixam e anuncia a que falhou, com motivo');

  const varias = noBanco(`SELECT * FROM produto_fotos WHERE sku='VARIAS' AND removida_em IS NULL ORDER BY ordem`);
  assert.deepEqual(varias.map((f) => f.imagem_id_loja), ['2001', '2002', '2003'], 'a ordem da loja se perdeu');
  assert.deepEqual(varias.map((f) => f.principal), [1, 0, 0]);
  for (const f of varias) {
    assert.ok(bucket.has(f.original_key), 'original não está no R2');
    assert.ok(f.miniatura_key && bucket.has(f.miniatura_key), 'miniatura não está no R2');
    assert.equal(f.origem, 'nuvemshop');
    assert.equal(f.produto_id_loja, '200');
    assert.equal(f.url_externa, img(f.imagem_id_loja === '2001' ? 'var-a' : f.imagem_id_loja === '2002' ? 'var-b' : 'var-c'));
  }
  prova('peça com várias fotos: TODAS vêm, na ordem da loja, com miniatura, e a principal é a da vitrine');

  const uma = noBanco(`SELECT * FROM produto_fotos WHERE sku='UMA'`);
  assert.equal(uma.length, 1);
  assert.equal(uma[0].principal, 1);
  prova('peça com uma foto: uma foto, principal');

  const anel = noBanco(`SELECT * FROM produto_fotos WHERE sku='ANEL' ORDER BY ordem`);
  assert.deepEqual(anel.map((f) => f.variante_id_loja), [null, '3100']);
  const gal = (await api('GET', '/api/produtos/ANEL/galeria')).corpo;
  assert.equal(gal.fotos[1].variacao, '16', 'a foto do aro 16 não diz a variação');
  assert.equal(gal.fotos[0].variacao, null);
  prova('variação: a foto presa à variação na loja chega dizendo qual é, e a geral fica geral');

  for (const sku of ['AMB1', 'AMB2', 'DUP', 'SEM']) {
    assert.equal(um(`SELECT COUNT(*) n FROM produto_fotos WHERE sku=?`, sku).n, 0, `${sku} recebeu foto sem certeza`);
  }
  prova('nenhuma peça recebeu foto de anúncio ambíguo ou de outro código');
}

/* ═══════════════════════════════════════ 5. reimportar não duplica */
{
  const linhas = um(`SELECT COUNT(*) n FROM produto_fotos`).n;
  const objetos = bucket.size;
  const a = (await api('POST', '/api/fotos/loja/analisar')).corpo;
  assert.equal(a.resumo.fotosJaNoR2, 7);
  assert.equal(a.resumo.fotosNovas, 1, 'só a quebrada continua na fila');
  const r = (await api('POST', '/api/fotos/loja/importar', { limite: 20 })).corpo;
  assert.equal(r.importadas, 0);
  assert.equal(um(`SELECT COUNT(*) n FROM produto_fotos`).n, linhas);
  assert.equal(bucket.size, objetos);
  prova('rodar a análise e a importação de novo não cria nenhuma cópia');
}

/* ═══════════════════════════════════════ 6. state e link assinado */
let estado = (await api('GET', '/api/state')).corpo;
const peca = (sku) => estado.produtos.find((p) => p.sku === sku);
{
  assert.equal(peca('VARIAS').fotosQtd, 3);
  assert.equal(peca('VARIAS').fotosDaLoja, 3);
  assert.equal(peca('VARIAS').fotosNaLoja, 3);
  assert.equal(peca('SEM').fotosQtd, 0);
  assert.equal(peca('SEM').fotoMiniUrl, undefined);
  assert.equal(peca('SEM').naLoja, false, 'SEM não está em anúncio nenhum');
  assert.equal(peca('VARIAS').naLoja, true);
  const principal = um(`SELECT id FROM produto_fotos WHERE sku='VARIAS' AND principal=1`).id;
  assert.ok(peca('VARIAS').fotoMiniUrl.includes(`/api/galeria/${principal}/miniatura`));
  assert.ok(peca('VARIAS').fotoGaleriaUrl.includes(`/api/galeria/${principal}/original`));

  const semChave = await worker.fetch(new Request(`http://api.local${peca('VARIAS').fotoMiniUrl}`), envComR2);
  assert.equal(semChave.status, 200, 'o link assinado não abriu sem o Bearer');
  assert.equal(semChave.headers.get('content-type'), 'image/jpeg');
  assert.match(semChave.headers.get('cache-control') || '', /max-age/);
  const forjado = peca('VARIAS').fotoMiniUrl.replace(/sig=[0-9a-f]{4}/, 'sig=0000');
  assert.equal((await worker.fetch(new Request(`http://api.local${forjado}`), envComR2)).status, 401);
  const outraFoto = peca('VARIAS').fotoMiniUrl.replace(principal, 'id-que-nao-e-este');
  assert.equal((await worker.fetch(new Request(`http://api.local${outraFoto}`), envComR2)).status, 401,
    'a assinatura de uma foto abriu outra');
  const de2 = (await api('GET', '/api/state')).corpo.produtos.find((p) => p.sku === 'VARIAS');
  assert.equal(de2.fotoMiniUrl, peca('VARIAS').fotoMiniUrl, 'o endereço mudou entre duas leituras — o cache do navegador não serve');
  prova('o state traz a principal (miniatura e grande) e as contagens; o link assinado abre, o forjado não');
  prova('o endereço da foto é estável entre leituras, para o navegador usar o cache');
}

/* ═══════════════════════════════════════ 7. principal, troca, reordenar */
{
  const ids = () => noBanco(`SELECT id FROM produto_fotos WHERE sku='VARIAS' AND removida_em IS NULL ORDER BY ordem`).map((r) => r.id);
  const [a, b, c] = ids();
  let r = await api('POST', '/api/produtos/VARIAS/galeria/principal', { fotoId: c });
  assert.equal(r.status, 200);
  assert.deepEqual(ids(), [c, a, b], 'a nova principal não foi para o início');
  assert.equal(um(`SELECT id FROM produto_fotos WHERE sku='VARIAS' AND principal=1`).id, c);
  estado = (await api('GET', '/api/state')).corpo;
  assert.ok(peca('VARIAS').fotoMiniUrl.includes(c), 'a lista não passou a mostrar a nova principal');
  prova('definir como principal: persiste, vai para o início e a lista mostra a nova');

  r = await api('POST', '/api/produtos/VARIAS/galeria/principal', { fotoId: b });
  assert.equal(um(`SELECT COUNT(*) n FROM produto_fotos WHERE sku='VARIAS' AND principal=1`).n, 1);
  assert.equal(um(`SELECT id FROM produto_fotos WHERE sku='VARIAS' AND principal=1`).id, b);
  prova('trocar a principal: continua uma só');

  r = await api('POST', '/api/produtos/VARIAS/galeria/ordem', { ordem: [a, c, b] });
  assert.equal(r.status, 200);
  const g = (await api('GET', '/api/produtos/VARIAS/galeria')).corpo;
  assert.deepEqual(g.fotos.map((f) => f.id), [a, c, b], 'a ordem pedida não persistiu');
  assert.equal(g.principal.id, b, 'reordenar trocou a principal');
  assert.ok(g.fotos.every((f) => f.urlMiniatura && f.urlGrande), 'a galeria não trouxe os links');
  assert.equal(g.fotos[0].origem, 'nuvemshop');
  assert.ok(g.fotos[0].arquivoR2.startsWith('produtos/VARIAS/'));
  prova('reordenar persiste (relida do banco) e não troca a principal');
}

/* ═══════════════════════════════════════ 8. upload manual */
const png = (semente) => {
  const b = new Uint8Array(300);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let i = 8; i < b.length; i++) b[i] = (i + semente) % 251;
  return b.buffer;
};
{
  const antes = (await api('GET', '/api/produtos/VARIAS/galeria')).corpo;
  const novos = [];
  for (const s of [1, 2]) {
    const r = await api('POST', '/api/produtos/VARIAS/galeria', png(s),
      { 'Content-Type': 'image/png', 'X-Largura': '1200', 'X-Altura': '1600', 'X-Arquivo': encodeURIComponent(`colar-ção-${s}.png`) });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    novos.push(r.corpo.fotoId);
    const m = await api('PUT', `/api/galeria/${r.corpo.fotoId}/miniatura`, png(s + 100), { 'Content-Type': 'image/png' });
    assert.equal(m.status, 200, JSON.stringify(m.corpo));
  }
  const depois = (await api('GET', '/api/produtos/VARIAS/galeria')).corpo;
  assert.deepEqual(depois.fotos.map((f) => f.id), [...antes.fotos.map((f) => f.id), ...novos], 'as fotos novas não foram para o fim');
  assert.equal(depois.principal.id, antes.principal.id, 'o upload trocou a principal');
  const nova = depois.fotos.at(-1);
  assert.equal(nova.origem, 'upload');
  assert.equal(nova.largura, 1200);
  assert.equal(nova.arquivo, 'colar-ção-2.png');
  assert.ok(nova.temMiniatura && nova.urlMiniatura.includes('/miniatura'));
  prova('upload manual de várias fotos: entram no fim, com miniatura e procedência, sem trocar a principal');

  const repetida = await api('POST', '/api/produtos/VARIAS/galeria', png(1), { 'Content-Type': 'image/png' });
  assert.equal(repetida.status, 409);
  assert.equal(repetida.corpo.duplicado, true);
  prova('a mesma imagem duas vezes na mesma peça é recusada');

  const primeira = await api('POST', '/api/produtos/SEM/galeria', png(9), { 'Content-Type': 'image/png' });
  assert.equal(primeira.status, 201);
  assert.equal(primeira.corpo.principal, true);
  prova('peça sem foto: a primeira que entra vira a principal');

  const pdf = await api('POST', '/api/produtos/SEM/galeria', new TextEncoder().encode('%PDF').buffer, { 'Content-Type': 'application/pdf' });
  assert.equal(pdf.status, 400);
}

/* ═══════════════════════════════════════ 9. remover */
{
  const principal = um(`SELECT * FROM produto_fotos WHERE sku='UMA' AND principal=1`);
  const chaves = [principal.original_key, principal.miniatura_key];
  assert.ok(chaves.every((k) => bucket.has(k)));
  const r = await api('DELETE', `/api/galeria/${principal.id}`);
  assert.equal(r.status, 200);
  assert.match(r.corpo.detalhe, /continua na loja online/);
  assert.ok(chaves.every((k) => !bucket.has(k)), 'os bytes ficaram no R2');
  const linha = um(`SELECT * FROM produto_fotos WHERE id=?`, principal.id);
  assert.ok(linha.removida_em, 'a linha não registrou a remoção');
  assert.equal((await api('GET', '/api/produtos/UMA/galeria')).corpo.total, 0);
  prova('remover: apaga os bytes do R2, some da galeria, e a linha guarda que existiu');

  const a = (await api('POST', '/api/fotos/loja/analisar')).corpo;
  assert.equal(a.resumo.fotosRemovidasAqui, 1);
  await api('POST', '/api/fotos/loja/importar', { limite: 20 });
  assert.equal((await api('GET', '/api/produtos/UMA/galeria')).corpo.total, 0, 'a importação trouxe de volta a foto removida');
  prova('a importação seguinte NÃO traz de volta a foto que alguém removeu');

  const ids = noBanco(`SELECT id FROM produto_fotos WHERE sku='VARIAS' AND removida_em IS NULL ORDER BY ordem`).map((x) => x.id);
  const p = um(`SELECT id FROM produto_fotos WHERE sku='VARIAS' AND principal=1`).id;
  await api('DELETE', `/api/galeria/${p}`);
  const nova = um(`SELECT id FROM produto_fotos WHERE sku='VARIAS' AND principal=1`);
  assert.equal(nova.id, ids.filter((x) => x !== p)[0], 'a próxima da ordem não assumiu a principal');
  prova('remover a principal: a próxima da ordem assume');
}

/* ═══════════════════════════════════════ 10. uma peça, pela ficha */
{
  /* A loja ganhou uma foto nova no anúncio da UMA. */
  loja.produtos[0].images.push({ id: 1002, src: img('uma-2'), position: 2 });
  let r = await api('POST', '/api/produtos/UMA/galeria/importar-da-loja', {});
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.seco, true);
  assert.equal(r.corpo.encontrado, true);
  assert.equal(r.corpo.resumo.novas, 1);
  assert.equal(r.corpo.resumo.removidas, 1);
  assert.equal(r.corpo.anuncios[0].nome, 'Brinco uma foto');
  assert.equal((await api('GET', '/api/produtos/UMA/galeria')).corpo.total, 0, 'a prévia importou');
  prova('ficha › buscar na loja: a prévia diz o que viria (1 nova, 1 que você removeu) sem gravar');

  r = await api('POST', '/api/produtos/UMA/galeria/importar-da-loja', { seco: false });
  assert.equal(r.corpo.importacao.importadas, 1);
  const g = (await api('GET', '/api/produtos/UMA/galeria')).corpo;
  assert.equal(g.total, 1);
  assert.equal(g.fotos[0].imagemIdLoja, '1002');
  assert.equal(g.fotos[0].principal, true);
  prova('ficha › importar: traz a foto nova e ela vira a principal da galeria vazia');

  /* SEMLOJA não tem vínculo gravado nenhum além do espelho: a busca acha
     o anúncio (sem foto). */
  r = await api('POST', '/api/produtos/SEMLOJA/galeria/importar-da-loja', {});
  assert.equal(r.corpo.encontrado, true);
  assert.equal(r.corpo.fotos.length, 0);

  r = await api('POST', '/api/produtos/SEM/galeria/importar-da-loja', {});
  assert.equal(r.status, 200);
  assert.equal(r.corpo.encontrado, false);
  assert.match(r.corpo.detalhe, /Não encontrei o código SEM na loja online/);
  assert.ok(loja.chamadas.some((c) => c.includes('/products/sku/SEM')), 'não perguntou à loja pelo SKU');
  prova('produto não encontrado na loja: diz isso, depois de perguntar pelo SKU');

  r = await api('POST', '/api/produtos/AMB1/galeria/importar-da-loja', {});
  assert.equal(r.corpo.fotos.length, 0);
  assert.equal(r.corpo.revisar.length, 1, 'a ficha de AMB1 não mostrou o anúncio ambíguo');
  prova('ficha de peça com anúncio ambíguo: mostra o que precisa revisar, e não importa');
}

/* ═══════════════════════════════════════ 11. sem R2 */
{
  const r = await chamar(envSemR2, 'POST', '/api/fotos/loja/importar', { limite: 5 });
  assert.equal(r.status, 503);
  assert.equal(r.corpo.bloqueio, 'sem_r2');
  const u = await chamar(envSemR2, 'POST', '/api/produtos/ANEL/galeria', png(55), { 'Content-Type': 'image/png' });
  assert.equal(u.status, 503);
  const semBytes = await chamar(envSemR2, 'GET', peca('ANEL').fotoMiniUrl.replace('http://api.local', ''));
  assert.equal(semBytes.status, 404, 'sem R2 a leitura deveria dizer que não achou, e não quebrar');
  prova('R2 indisponível: importação e upload recusam com o motivo; leitura responde 404 limpo');

  const semLoja = await chamar({ ...envComR2, NUVEMSHOP_TOKEN: '' }, 'POST', '/api/fotos/loja/analisar');
  assert.equal(semLoja.status, 409);
  assert.match(semLoja.corpo.erro, /não está conectada/);
  prova('loja desconectada: a análise diz que falta o token');
}

/* ═══════════════════════════════════════ 12. nada fora do lugar */
{
  assert.ok(loja.chamadas.every((c) => c.startsWith('GET ')), `houve escrita na loja: ${loja.chamadas.filter((c) => !c.startsWith('GET')).join(', ')}`);
  assert.ok(!loja.chamadas.some((c) => c.includes('/orders')), 'a importação leu pedidos');
  const depois = um(`SELECT COUNT(*) n, COALESCE(SUM(qtd),0) s FROM movimentos`);
  assert.deepEqual(depois, movimentosAntes, 'mexer em foto criou movimento de estoque');
  const conferir = (await api('GET', '/api/estoque/conferir')).corpo;
  const divergencias = Array.isArray(conferir) ? conferir : (conferir.divergencias ?? conferir.itens ?? []);
  assert.equal(divergencias.length, 0, `a razão não fecha: ${JSON.stringify(conferir).slice(0, 300)}`);
  prova('só leitura na loja, nenhum pedido lido, nenhum movimento de estoque, e a razão fecha');
}

globalThis.fetch = fetchOriginal;
console.log(`\n  ${provas} provas, 0 falhas`);
