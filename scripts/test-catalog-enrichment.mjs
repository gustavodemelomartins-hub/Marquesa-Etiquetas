import assert from 'node:assert/strict';
import { enriquecerProduto, fatosDoProduto, removerCodigoConfirmado, normalizarTags, tagsEquivalentes, MARCA_CANONICA, CUIDADOS_HTML } from '../api/src/catalogo/enriquecimento.js';

let checks = 0;
const check = (name, run) => { run(); checks++; console.log(`ok ${checks} - ${name}`); };
const base = (extra = {}) => ({ id: 1, name: { pt: 'Argola Coração Banho de Ouro 18k' }, description: { pt: '' }, seo_title: { pt: '' }, seo_description: { pt: '' }, variants: [{ id: 2, sku: '001234', price: '95', stock: 3 }], tags: '', brand: '', categories: [], published: false, ...extra });
const categorias = [
  { id: 10, parent: 0, name: { pt: 'Brinco' } },
  { id: 11, parent: 10, name: { pt: 'Brincos' } },
  { id: 20, parent: 0, name: { pt: 'Prata 925' } },
  { id: 21, parent: 20, name: { pt: 'Brinco' } },
  { id: 22, parent: 20, name: { pt: 'Conjuntos' } },
  { id: 30, parent: 0, name: { pt: 'Colar' } },
];
const opcoes = { novo: true, marcaCanonica: MARCA_CANONICA, cuidadosHtml: CUIDADOS_HTML, categorias };

check('SKU confirmado, entities e strong; outros códigos preservados', () => {
  const r = removerCodigoConfirmado('<p><strong>C&oacute;d:</strong> 001234</p><p>Código: 999999</p><p>Medida: 12 cm</p>', ['001234']);
  assert.deepEqual(r.removidos, ['001234']); assert.equal(r.descricao, '<p>Código: 999999</p><p>Medida: 12 cm</p>');
  assert.equal(removerCodigoConfirmado('<p>Cód: 1234</p>', ['001234']).removidos.length, 0);
});
check('nenhuma escrita cosmética quando código desconhecido', () => {
  const original = '  <p>Modelo 001234. Código: ABC</p>\n ';
  assert.equal(removerCodigoConfirmado(original, ['001234']).descricao, original);
});
check('tags equivalentes, desconhecidas e ouro sem banho preservados', () => {
  assert.equal(normalizarTags('banho ouro 18K, Banho de Ouro 18k, edição especial, edição especial, ouro18k'), 'Banho de Ouro 18k, edição especial, ouro18k');
});
check('canonicalização da API por ordem/acentos/caixa não repete escrita de tags', () => {
  const p = base({ name: { pt: 'Brinco Zircônia Banho de Ouro 18k' }, tags: 'Banho de Ouro 18k, Brinco, Zirconia' });
  assert.equal(enriquecerProduto(p, opcoes).patch.tags, undefined);
  assert.equal(tagsEquivalentes('Brinco, Zircônia', 'zirconia, BRINCO'), true);
  assert.equal(tagsEquivalentes('Brinco, Brinco', 'Brinco'), false);
  assert.equal(tagsEquivalentes('banho ouro18k', 'Banho de Ouro 18k'), false);
  assert.equal(tagsEquivalentes('Zirconias', 'Zircônia'), false);
  const corrigidas = enriquecerProduto(base({ tags: 'Brinco, brinco, banho ouro18k' }), { novo: false }).patch.tags;
  assert.ok(tagsEquivalentes(corrigidas, 'Brinco, Banho de Ouro 18k'));
});
check('preserva SEO aprovado, idiomas e todos os campos operacionais', () => {
  const p = base({ description: { pt: '<p>SKU: 001234</p><p>Ficha específica.</p>', es: 'Original' }, seo_title: { pt: 'Título aprovado' }, seo_description: { pt: 'Meta aprovada' }, tags: 'tema especial' });
  const antes = structuredClone(p), r = enriquecerProduto(p, { ...opcoes, novo: false });
  assert.equal(r.patch.seo_title, undefined); assert.equal(r.patch.seo_description, undefined); assert.equal(r.patch.description.es, 'Original'); assert.equal(r.patch.tags, undefined);
  assert.deepEqual(p, antes);
  for (const campo of ['price', 'stock', 'variants', 'published', 'name', 'images', 'weight', 'width', 'google_shopping_category']) assert.equal(r.patch[campo], undefined);
});
check('argola recebe leaf Brincos; não recebe ramo prata', () => {
  const r = enriquecerProduto(base(), opcoes); assert.deepEqual(r.patch.categories, [11]); assert.ok(r.patch.description.pt.includes(CUIDADOS_HTML));
  assert.ok(r.patch.tags.includes('Banho de Ouro 18k')); assert.equal(r.patch.brand, 'Marquesa'); assert.equal(new TextEncoder().encode(r.patch.seo_title.pt).length <= 70, true);
});
check('prata925 comprovada escolhe ramo; prata926 não vira prata925', () => {
  assert.deepEqual(enriquecerProduto(base({ name: { pt: 'Brinco Esfera Prata 925' } }), opcoes).patch.categories, [21]);
  const r = enriquecerProduto(base({ name: { pt: 'Brinco Esfera Prata 926' } }), opcoes); assert.deepEqual(r.patch.categories, [11]); assert.ok(!r.patch.tags.includes('Prata 925'));
});
check('conjunto sem material não força categoria prata; pingente não vira colar', () => {
  assert.equal(enriquecerProduto(base({ name: { pt: 'Conjunto Coração' } }), opcoes).patch.categories, undefined);
  assert.equal(enriquecerProduto(base({ name: { pt: 'Pingente Menino Verde' } }), opcoes).patch.categories, undefined);
});
check('primeiro tipo declara identidade, decoração não muda família', () => {
  assert.equal(fatosDoProduto(base({ name: { pt: 'Colar Coração com Pingente' } })).tipo, 'colar');
  assert.equal(fatosDoProduto(base({ name: { pt: 'Pulseira Berloque Coração' } })).tipo, 'pulseira');
  assert.equal(fatosDoProduto(base({ name: { pt: 'Argola com Pingente Pérola' } })).tipo, 'brinco');
});
check('nome sem tipo usa categoria explícita, SKU sozinho continua desconhecido', () => {
  const r = enriquecerProduto(base({ name: { pt: 'Dupla Esfera Lisa Prata 925' } }), { ...opcoes, cadastro: { cat: 'Brinco' } });
  assert.ok(r.patch.description.pt.includes('Brinco Dupla Esfera Lisa'));
  assert.equal(enriquecerProduto(base({ name: { pt: '001234' } }), { ...opcoes, cadastro: { cat: 'Brinco' } }).patch.seo_title, undefined);
});
check('material extraído de parágrafo sem engolir cor, garantia ou cuidados', () => {
  const p = base({ description: { pt: '<p>Material: Metal e zirc&ocirc;nias</p><p>Cores: Dourado</p><p>Semijoia hipoalerg&ecirc;nica</p><p>Garantia: um ano</p>' } });
  const r = fatosDoProduto(p); assert.deepEqual(r.materiais, ['Metal e zircônias']); assert.deepEqual(r.cores, ['Dourado']);
});
check('não extrai atributo genérico dos cuidados nem inventa cor do ródio', () => {
  const r = fatosDoProduto(base({ name: { pt: 'Brinco Banho de Ródio Branco' }, description: { pt: '<p>Como preservar suas semijoias</p><p>Material: prata</p>' } }));
  assert.deepEqual(r.materiais, []); assert.deepEqual(r.cores, []); assert.deepEqual(r.acabamentos, ['Banho de Ródio Branco']);
});
check('preserva verde esmeralda; cor não é presumida de tamanho', () => {
  const r = fatosDoProduto(base({ name: { pt: 'Brinco Verde Esmeralda' }, attributes: [{ pt: 'Tamanho' }], variants: [{ sku: '001234', values: [{ pt: 'Cristal' }] }] }));
  assert.deepEqual(r.cores, ['Verde Esmeralda']); assert.deepEqual(r.materiais, []);
});
check('cuidados existentes e embalagens/observações são integralmente preservados', () => {
  const original = '<p>Descrição específica.</p><p>Como preservar suas semijoias:</p><ul><li>Use flanela; não utilize limpa-prata.</li></ul><p>Embalagens para presente: duas unidades.</p><p>Observação: imagem 2.</p>';
  const r = enriquecerProduto(base({ description: { pt: original } }), { ...opcoes, novo: false }); assert.equal(r.patch.description, undefined);
});
check('marcas semanticamente diferentes não são sobrescritas', () => {
  const r = enriquecerProduto(base({ brand: 'Outra marca' }), opcoes); assert.equal(r.patch.brand, undefined); assert.ok(r.pendencias.some(p => p.campo === 'brand'));
  assert.equal(enriquecerProduto(base({ brand: 'Mrquesa' }), opcoes).patch.brand, 'Marquesa');
});
check('título extenso se resume por fatos sem cortar byte nem usar SKU', () => {
  const r = enriquecerProduto(base({ name: { pt: 'Dupla Argolas Corações Cravejados Pequena e Média Banho de Ouro 18k' } }), opcoes);
  assert.ok(r.patch.seo_title); assert.ok(new TextEncoder().encode(r.patch.seo_title.pt).length <= 70); assert.ok(!r.patch.seo_title.pt.includes('001234')); assert.ok(r.patch.description.pt.includes('Pequena e Média'));
});
check('copy comercial apresenta fatos sem linguagem de implementação', () => {
  const r = enriquecerProduto(base({ name: { pt: 'Dupla Argolas Corações Cravejados Pequena e Média Banho de Ouro 18k' } }), { ...opcoes, cadastro: { material: 'Metal', cor: 'Azul' } });
  assert.ok(r.patch.description.pt.includes('Material: Metal.'));
  assert.ok(r.patch.description.pt.includes('Cores: Azul.'));
  for (const campo of ['description', 'seo_title', 'seo_description']) assert.ok(!/cadastrad|sistema|SKU|001234/i.test(r.patch[campo]?.pt ?? ''));
});
check('colisões SEO usam redação factual distinta; nenhuma diferença física inventada', () => {
  const a = enriquecerProduto(base({ name: { pt: 'Brinco Círculo Aberto Liso' } }), opcoes);
  const b = enriquecerProduto(base({ name: { pt: 'Brinco Círculo Aberto Liso' } }), { ...opcoes, nomesIguais: 1, seoTitulosOcupados: [a.patch.seo_title.pt], seoDescricoesOcupadas: [a.patch.seo_description.pt] });
  assert.notEqual(a.patch.seo_title.pt, b.patch.seo_title.pt); assert.notEqual(a.patch.seo_description.pt, b.patch.seo_description.pt); assert.ok(!/001234|exclusiv|maior|menor/i.test(b.patch.seo_title.pt));
});
check('colisão de nome longo de pulseira usa resumo comercial factual', () => {
  const p = base({ name: { pt: 'Pulseira Cadeia de Consagracao Medalha e Cadeado Banho de Ouro 18k' } });
  const a = enriquecerProduto(p, opcoes);
  assert.ok(a.patch.seo_title);
  const b = enriquecerProduto(p, { ...opcoes, seoTitulosOcupados: [a.patch.seo_title.pt] });
  assert.ok(b.patch.seo_title);
  assert.notEqual(a.patch.seo_title.pt, b.patch.seo_title.pt);
  assert.ok(new TextEncoder().encode(b.patch.seo_title.pt).length <= 70);
  assert.ok(/Pulseira de Consagracao/.test(b.patch.seo_title.pt));
  assert.ok(/Medalha/.test(b.patch.seo_title.pt));
  assert.ok(/Cadeado/.test(b.patch.seo_title.pt));
  assert.ok(b.patch.description.pt.includes('Cadeia'));
  assert.ok(!/001234|modelo|maior|menor/i.test(b.patch.seo_title.pt));
});
check('aplicação pura é idempotente e não propaga HTML inseguro', () => {
  const p = base(), a = enriquecerProduto(p, opcoes); assert.deepEqual(enriquecerProduto({ ...p, ...a.patch }, opcoes).patch, {});
  assert.equal(enriquecerProduto(base({ description: { pt: '<script>bad()</script><p>SKU: 001234</p>' } }), opcoes).patch.description, undefined);
});
console.log(`${checks} cenários passaram.`);
