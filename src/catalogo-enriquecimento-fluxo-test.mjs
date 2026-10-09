import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { aplicarEnriquecimento, hashProduto, hashFonteEditorial, projecaoComercial, enriquecerOcultos, categoriasEquivalentes, lerSeoOcupado } from '../api/src/catalogo/enriquecimento-fluxo.js';
import { corpoDoProdutoOculto, classificarCatalogo, chaveDoModelo, mapearCategorias } from '../api/src/catalogo/nuvemshop-catalogo.js';
import { REGRA_ENRIQUECIMENTO } from '../api/src/catalogo/enriquecimento.js';

let provas = 0;
const prova = (nome) => { provas++; console.log(`ok ${nome}`); };
const produto = (id = 1, sku = '198242') => ({ id, name: { pt: 'Brinco Coração Cristal', es: 'Pendiente Corazón' },
  handle: { pt: 'brinco-coracao-cristal', es: 'pendiente-corazon' }, visibility: 'hidden', published: false,
  description: { pt: '<p>Brinco Coração Cristal.</p>', es: '<p>Descripción revisada.</p>' },
  seo_title: 'Título aprovado | Marquesa', seo_description: 'Meta aprovada, preservada integralmente.',
  tags: '', brand: '', categories: [], images: [{ id: 3, src: 'http://local/foto.jpg' }],
  attributes: [{ pt: 'Cor' }], variants: [{ id: id * 10, sku, stock: 3, price: '49.00', values: [{ pt: 'Cristal' }] }], updated_at: '2026-10-09' });
assert.equal(await hashProduto(produto()), await hashProduto({ ...produto(), invalid_at: null }));
assert.notEqual(await hashProduto(produto()), await hashProduto({ ...produto(), invalid_at: '2026-10-09' }));
prova('hash equivale invalid_at ausente a null, preserva qualquer invalid_at real');
assert.equal(categoriasEquivalentes([14], [{ id: 10, parent: null }, { id: 14, parent: 10 }]), true);
assert.equal(categoriasEquivalentes([14], [{ id: 10, parent: null }, { id: 14, parent: 10 }, { id: 99, parent: null }]), false);
assert.equal(categoriasEquivalentes([14], [{ id: 10, parent: null }]), false);
assert.equal(categoriasEquivalentes([14], [{ id: 10, parent: 14 }, { id: 14, parent: 10 }]), false);
prova('categorias aceitam somente ancestrais comprovados, sem extra estranho, filho ausente ou ciclo');
function lojaSimulada(p, { antesSegundoGet = null, depoisPut = null, limpaLocalizados = false } = {}) {
  let atual = structuredClone(p), gets = 0, puts = 0;
  const corpos = [];
  return { corpos, get puts() { return puts; }, get atual() { return structuredClone(atual); },
    async produto() { gets++; if (gets === 2 && antesSegundoGet) antesSegundoGet(atual); return structuredClone(atual); },
    async atualizarProduto(id, corpo) {
      puts++; corpos.push(structuredClone(corpo));
      if (limpaLocalizados) for (const campo of ['name', 'handle', 'description', 'seo_title', 'seo_description']) {
        if (!(campo in corpo)) atual[campo] = typeof atual[campo] === 'object' ? {} : '';
      }
      Object.assign(atual, structuredClone(corpo));
      if (corpo.categories) atual.categories = corpo.categories.map((c) => ({ id: Number(c), name: { pt: 'Brincos' } }));
      atual.updated_at = '2026-10-10';
      if (depoisPut) depoisPut(atual);
      return structuredClone(atual);
    },
  };
}

{
  const p = produto(), loja = lojaSimulada(p, { limpaLocalizados: true }), registros = [];
  const r = await aplicarEnriquecimento(loja, 1, { brand: 'Marquesa', categories: [14] }, {
    expectedHash: await hashProduto(p), journal: async (e) => {
      if (e.estado === 'preparado') assert.equal(loja.puts, 0);
      registros.push(e);
    },
  });
  assert.equal(r.ok, true); assert.equal(loja.puts, 1);
  assert.deepEqual(registros.map((e) => e.estado), ['preparado', 'validado']);
  assert.deepEqual(r.produto.name, p.name); assert.deepEqual(r.produto.handle, p.handle);
  assert.deepEqual(r.produto.description, p.description);
  assert.equal(r.produto.seo_title, p.seo_title); assert.equal(r.produto.seo_description, p.seo_description);
  assert.deepEqual(projecaoComercial(r.produto), projecaoComercial(p));
  assert.deepEqual(JSON.parse(registros[0].before_json), p);
  assert.equal(JSON.parse(registros[0].patch_json).seo_title, p.seo_title);
  prova('journal antes do PUT, idiomas completos, SEO aprovado, URL e dados comerciais preservados mesmo quando API limpa omitidos');
}
{
  const p = produto(), loja = lojaSimulada(p), registros = [];
  const r = await aplicarEnriquecimento(loja, 1, { seo_title: 'Brinco Coração Cristal | Marquesa', description: { pt: '<p>Texto factual.</p>' } }, { journal: async (e) => registros.push(e) });
  assert.equal(r.produto.seo_title, 'Brinco Coração Cristal | Marquesa');
  assert.equal(r.produto.description.es, p.description.es);
  prova('SEO string aceito e tradução não alterada preservada');
}
for (const campo of ['visibility', 'published', 'name', 'handle', 'variants', 'price', 'stock', 'images']) {
  const loja = lojaSimulada(produto());
  await assert.rejects(aplicarEnriquecimento(loja, 1, { [campo]: 'x' }, { journal: async () => {} }), /não permitido/);
  assert.equal(loja.puts, 0);
}
{
  const loja = lojaSimulada(produto(), { depoisPut: (v) => { v.tags = 'Banho de Ouro 18k, Brinco, Zirconia'; } });
  const r = await aplicarEnriquecimento(loja, 1, { tags: 'Brinco, Banho de Ouro 18k, Zircônia' }, { journal: async () => {} });
  assert.equal(r.ok, true);
  const perda = lojaSimulada(produto(), { depoisPut: (v) => { v.tags = 'Banho de Ouro 18k, Brinco'; } });
  await assert.rejects(aplicarEnriquecimento(perda, 1, { tags: 'Brinco, Banho de Ouro 18k, Zircônia' }, { journal: async () => {} }), /não confirmou tags/);
  prova('readback aceita ordenação/acento canônicos de tags, mas rejeita perda de qualquer tag');
}
prova('allowlist rejeita publicação, identidade, variante, preço, estoque e foto antes do PUT');
{
  const loja = lojaSimulada(produto());
  await assert.rejects(aplicarEnriquecimento(loja, 1, { brand: 'Marquesa' }), /journal/);
  await assert.rejects(aplicarEnriquecimento(loja, 1, { brand: 'Marquesa' }, { journal: async () => { throw new Error('journal indisponível'); } }), /indisponível/);
  assert.equal(loja.puts, 0);
  prova('ausência ou falha do journal impede escrita');
}
{
  const p = produto(), loja = lojaSimulada(p), registros = [];
  await assert.rejects(aplicarEnriquecimento(loja, 1, { brand: 'Marquesa' }, { expectedHash: 'stale', journal: async (e) => registros.push(e) }), /planejamento/);
  assert.equal(loja.puts, 0); assert.equal(registros.length, 0);
  prova('plano antigo aborta antes de qualquer escrita');
}
{
  const p = produto(), loja = lojaSimulada(p, { antesSegundoGet: (v) => { v.variants[0].stock = 2; } }), registros = [];
  await assert.rejects(aplicarEnriquecimento(loja, 1, { brand: 'Marquesa' }, { journal: async (e) => registros.push(e) }), /concorrente antes/);
  assert.equal(loja.puts, 0); assert.deepEqual(registros.map((e) => e.estado), ['preparado', 'erro']);
  prova('mudança concorrente na segunda leitura impede PUT e registra erro');
}
{
  const loja = lojaSimulada(produto(), { depoisPut: (v) => { v.variants[0].stock = 2; } }), registros = [];
  await assert.rejects(aplicarEnriquecimento(loja, 1, { brand: 'Marquesa' }, { journal: async (e) => registros.push(e) }), /mudança comercial/);
  assert.equal(loja.puts, 1); assert.deepEqual(registros.map((e) => e.estado), ['preparado', 'erro']);
  assert.ok(registros[1].after_json); assert.ok(registros[1].after_hash);
  prova('mudança comercial durante PUT não é declarada válida; estado real posterior guardado');
}
{
  const loja = lojaSimulada(produto(), { depoisPut: (v) => { v.seo_title = ''; } });
  await assert.rejects(aplicarEnriquecimento(loja, 1, { brand: 'Marquesa' }, { journal: async () => {} }), /editorial preservado/);
  prova('readback detecta SEO aprovado apagado por API e interrompe');
}
{
  const loja = lojaSimulada(produto());
  await assert.rejects(aplicarEnriquecimento(loja, 1, { seo_title: 'á'.repeat(36) }, { journal: async () => {} }), /70 bytes/);
  assert.equal(loja.puts, 0);
  prova('limite título mede UTF-8, não caracteres');
}
{
  const corpo = corpoDoProdutoOculto({ sku: 'N', nome: 'Brinco Coração Cristal', categoria: 'Brinco', casa: 3, preco: null,
    atributos: ['Cor'], variacoes: [{ nome: 'Cristal', valores: [{ atributo: 'Cor', valor: 'Cristal' }], estoque: 3 }], texto: {} },
  { categorias: [{ id: 14, name: { pt: 'Brincos' } }] });
  assert.equal(corpo.visibility, 'hidden'); assert.equal(corpo.brand, 'Marquesa');
  assert.match(corpo.description.pt, /Como preservar suas semijoias/); assert.match(corpo.tags, /Cristal/i);
  assert.deepEqual(corpo.categories, [14]); assert.equal('price' in corpo.variants[0], false);
  assert.equal(corpo.variants[0].stock, 3); assert.ok(corpo.seo_title.pt); assert.ok(corpo.seo_description.pt);
  prova('novo nasce com marca, cuidados, tags, categoria e SEO; oculto, sem preço inventado');
}
assert.notEqual(chaveDoModelo('Colar Coração Cravejado'), chaveDoModelo('Anel Coração Cravejado'));
assert.equal(chaveDoModelo('Anel Flor nº27 Banho de Ouro'), chaveDoModelo('Anel Flor n°18 Banho de Ouro'));
assert.equal(chaveDoModelo('Aparador de Aliança'), chaveDoModelo('Anel Aparador de Aliança'));
assert.equal(mapearCategorias([{ id: 14, name: { pt: 'Brincos' } }]).argola, '14');
prova('deduplicação preserva família e equivale aros; Argola corresponde a Brincos');
{
  const base = { produtos: [{ sku: '387128', desc: 'Colar Coração Cravejado', cat: 'Colar', qtd: 2, casa: 2, preco: 49 }],
    nomesDaLoja: new Map([['9', { nome: 'Anel Coração Cravejado', skus: new Set(['315220']) }]]),
    montagens: new Set(), mapaCategorias: null };
  for (const k of ['variacoes', 'nomeados', 'maletaVar', 'lojaPorSku', 'catalogo', 'fotos', 'fila', 'conf', 'rascunhos']) base[k] = new Map();
  assert.equal(classificarCatalogo(base).itens[0].criavel, true);
  base.produtos[0] = { ...base.produtos[0], desc: 'Anel Coração Cravejado nº18', cat: 'Anel' };
  assert.equal(classificarCatalogo(base).itens[0].criavel, false);
  base.nomesDaLoja.set('9', { nome: 'Anel Aparador de Aliança', skus: new Set(['408061']) });
  base.produtos[0] = { ...base.produtos[0], desc: 'Aparador de Aliança', cat: 'Anel' };
  assert.equal(classificarCatalogo(base).itens[0].criavel, false);
  base.nomesDaLoja.clear();
  base.produtos[0] = { ...base.produtos[0], desc: 'Brinco Coração Cristal', cat: 'Brinco' };
  const v = (nome, ordem) => ({ sku: '387128', nome, atributo: 'Tamanho', origem: 'local', ordem,
    valores_json: JSON.stringify([{ atributo: 'Tamanho', valor: nome }]) });
  base.variacoes.set('387128', [v('Azul', 0), v('Cristal', 1)]);
  const todosCor = classificarCatalogo(base).itens[0];
  assert.equal(todosCor.criavel, true); assert.deepEqual(todosCor.atributos, ['Cor']);
  assert.equal(JSON.parse(base.variacoes.get('387128')[0].valores_json)[0].atributo, 'Tamanho');
  base.variacoes.set('387128', [v('Azul', 0), v('nº18', 1)]);
  const misto = classificarCatalogo(base).itens[0];
  assert.equal(misto.criavel, false); assert.match(misto.bloqueios.join(' '), /cor e outro significado/);
  prova('Colar não bloqueado por Anel; mesma família mantém trava; cores exatas normalizadas, significado misto bloqueado, dados locais intactos');
}
{
  const ocupados = await lerSeoOcupado({ async chamar(url) {
    assert.match(url, /per_page=30&fields=id,name,seo_title,seo_description/);
    return [{ id: 1, seo_title: 'Título próprio', seo_description: 'Meta própria' }, { id: 2, seo_title: 'Título ocupado', seo_description: 'Meta ocupada' }];
  } }, 'Brinco Coração', 1);
  assert.deepEqual(ocupados.seoTitulosOcupados, ['Título ocupado']);
  await assert.rejects(lerSeoOcupado({ async chamar() { return Array.from({ length: 30 }, (_, id) => ({ id })); } }, 'Brinco'), /não conclusiva/);
  prova('busca SEO estreita exclui próprio anúncio e falha fechado quando resultado é truncado');
}

const raw = new DatabaseSync(':memory:');
raw.exec(readFileSync(new URL('../api/schema.sql', import.meta.url), 'utf8'));
const migration = readFileSync(new URL('../api/migracao-catalogo-enriquecimento.sql', import.meta.url), 'utf8');
raw.exec(migration); raw.exec(migration);
const DB = {
  prepare(sql) {
    const st = raw.prepare(sql);
    const comArgs = (args = []) => ({ bind: (...a) => comArgs(a),
      first: async () => st.get(...args) || null, all: async () => ({ results: st.all(...args) }),
      run: async () => ({ meta: { changes: Number(st.run(...args).changes) } }) });
    return comArgs();
  },
};
raw.prepare("INSERT INTO config(chave,valor) VALUES('nuvemshopCatalogoAtivo','true')").run();
const pecas = new Map();
for (const [sku, id, origem, vis] of [['A', 1, 'criado', 'hidden'], ['B', 2, 'criado', 'hidden'], ['C', 3, 'criado', 'hidden'], ['D', 4, 'adotado', 'hidden'], ['E', 5, 'criado', 'visible']]) {
  raw.prepare("INSERT INTO produtos(sku,desc,cat,status) VALUES(?, 'Brinco Coração Cristal', 'Brinco','ativo')").run(sku);
  raw.prepare('INSERT INTO nuvemshop_catalogo(sku,estado,origem,produto_id,visibilidade,atualizado_em) VALUES(?,?,?,?,?,?)')
    .run(sku, vis === 'hidden' ? 'oculto' : 'visivel', origem, String(id), vis, '2026-10-09');
  const p = produto(id, sku); p.visibility = vis; p.published = vis === 'visible'; pecas.set(String(id), p);
}
const env = { NUVEMSHOP_STORE_ID: 'fake', NUVEMSHOP_TOKEN: 'fake', NUVEMSHOP_WRITES_ENABLED: 'true' };
let atualizacoes = 0;
const lojaLote = {
  async categorias() { return [{ id: 14, name: { pt: 'Brincos' } }]; },
  async produto(id) { return structuredClone(pecas.get(String(id))); },
  async atualizarProduto(id, corpo) {
    assert.ok(raw.prepare("SELECT id FROM nuvemshop_enriquecimento WHERE product_id=? AND estado='preparado'").get(String(id)));
    atualizacoes++; const p = pecas.get(String(id)); Object.assign(p, structuredClone(corpo));
    if (corpo.categories) p.categories = corpo.categories.map((c) => ({ id: c }));
  },
};
{
  const antes = JSON.stringify(raw.prepare('SELECT * FROM movimentos').all());
  const ensaio = await enriquecerOcultos(DB, env, { loja: lojaLote });
  assert.equal(ensaio.seco, true); assert.equal(atualizacoes, 0); assert.equal(ensaio.itens.length, 2);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM nuvemshop_enriquecimento').get().n, 0);
  const r = await enriquecerOcultos(DB, env, { seco: false, loja: lojaLote });
  assert.equal(r.ok, true); assert.equal(r.alterados, 2); assert.equal(atualizacoes, 2);
  const r2 = await enriquecerOcultos(DB, env, { seco: false, loja: lojaLote });
  assert.equal(r2.alterados, 1); assert.equal(atualizacoes, 3);
  assert.equal(pecas.get('4').brand, ''); assert.equal(pecas.get('5').brand, '');
  for (const id of ['1', '2', '3']) assert.equal(pecas.get(id).visibility, 'hidden');
  assert.equal(JSON.stringify(raw.prepare('SELECT * FROM movimentos').all()), antes);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM nuvemshop_enriquecimento WHERE regra=? AND estado='validado'").get(REGRA_ENRIQUECIMENTO).n, 3);
  await enriquecerOcultos(DB, env, { seco: false, loja: lojaLote }); // cursor volta
  const r3 = await enriquecerOcultos(DB, env, { seco: false, loja: lojaLote });
  assert.equal(r3.alterados, 0); assert.equal(atualizacoes, 3);
  prova('migration idempotente, ensaio sem escrita, lote2 com cursor e sem reescrita; adotados/publicados e ledger intactos');
}
{
  raw.prepare("UPDATE produtos SET desc='Brinco Coração Azul' WHERE sku='A'").run();
  const r = await enriquecerOcultos(DB, env, { seco: false, skus: ['A'], loja: lojaLote });
  assert.equal(r.ok, true); assert.equal(r.itens.length, 1);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM nuvemshop_enriquecimento WHERE product_id='1'").get().n, 2);
  prova('mudança na fonte local libera reavaliação sem sobrescrever SEO aprovado');
}
{
  raw.prepare(`INSERT INTO produto_variacoes(sku,nome,atributo,variante_id,valores_json,origem)
    VALUES('A','Cristal','Tamanho','local:A-Cristal',?,'local')`)
    .run(JSON.stringify([{ atributo: 'Tamanho', valor: 'Cristal' }]));
  const n = () => raw.prepare("SELECT COUNT(*) AS n FROM nuvemshop_enriquecimento WHERE product_id='1'").get().n;
  const antes = n();
  await enriquecerOcultos(DB, env, { seco: false, skus: ['A'], loja: lojaLote });
  assert.equal(n(), antes + 1, 'opção local nova deve invalidar fonte anterior');
  raw.prepare(`UPDATE produto_variacoes SET atributo='Cor', valores_json=? WHERE sku='A'`)
    .run(JSON.stringify([{ atributo: 'Cor', valor: 'Cristal' }]));
  const atributo = await enriquecerOcultos(DB, env, { seco: false, skus: ['A'], loja: lojaLote });
  assert.equal(atributo.ok, true); assert.equal(atributo.itens.length, 1);
  assert.equal(n(), antes + 2, 'mudança comprovada de atributo deve provocar reavaliação');
  raw.prepare(`UPDATE produto_variacoes SET nome='Azul', valores_json=? WHERE sku='A'`)
    .run(JSON.stringify([{ atributo: 'Cor', valor: 'Azul' }]));
  pecas.get('1').variants[0].values = [{ pt: 'Azul' }];
  const opcao = await enriquecerOcultos(DB, env, { seco: false, skus: ['A'], loja: lojaLote });
  assert.equal(opcao.ok, true); assert.equal(n(), antes + 3);
  const putsAntes = atualizacoes;
  raw.prepare("UPDATE produtos SET preco=89, qtd=qtd+2 WHERE sku='A'").run();
  pecas.get('1').variants[0].stock += 2; pecas.get('1').variants[0].price = '89.00';
  const comercial = await enriquecerOcultos(DB, env, { seco: false, skus: ['A'], loja: lojaLote });
  assert.equal(comercial.iguais, 1); assert.equal(comercial.itens.length, 0);
  assert.equal(n(), antes + 3); assert.equal(atualizacoes, putsAntes);
  const fonte = { desc: 'Brinco', cat: 'Brinco', variantes_editoriais: JSON.stringify([
    { nome: 'Cristal', atributo: 'Cor', valores: JSON.stringify([{ atributo: 'Cor', valor: 'Cristal' }]) },
    { nome: 'Azul', atributo: 'Cor', valores: JSON.stringify([{ atributo: 'Cor', valor: 'Azul' }]) },
  ]) };
  assert.equal(await hashFonteEditorial(fonte), await hashFonteEditorial({ ...fonte,
    variantes_editoriais: JSON.stringify(JSON.parse(fonte.variantes_editoriais).reverse()), preco: 200, estoque: 800 }));
  prova('nomes, atributos e opções locais invalidam fonte; preço, saldo e ordem das linhas não causam reescrita editorial');
}
raw.close();
console.log(`${provas} provas do fluxo de enriquecimento.`);
