/** BLOCO B — quem responde o quê: Nuvemshop e Pendências.
 *
 *  Os dois banners gigantes da aba Nuvemshop ("27 códigos têm mais de uma
 *  variação no site", "124 códigos com peça em casa não existem na loja")
 *  descreviam TRABALHO. Trabalho tem um lugar só, e não é lá — eles
 *  empurravam para baixo o que a aba Nuvemshop tem de próprio (saúde da
 *  integração, catálogo publicado, estoque divergente) e duplicavam o que
 *  Pendências existe para resolver.
 *
 *  O que precisa ficar provado:
 *
 *   1. os banners saíram da tela;
 *   2. os NÚMEROS não saíram: KPIs e abas continuam contando o mesmo;
 *   3. as ações dos banners também não sumiram — mudaram de lugar;
 *   4. Pendências tem três seções nomeadas, e cada uma com o seu conteúdo;
 *   5. os códigos "falta subir" alimentam Publicar na Nuvemshop, com foto,
 *      preço, estoque, variações e o que falta em cada um;
 *   6. os casos de variação continuam chegando em Pendências;
 *   7. NENHUMA escrita sai para a Nuvemshop neste ambiente.
 */
import { chromium } from 'playwright';
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const loja = await subirLojaFalsa();

/* -------------------------------------------------------------- cenário
   VARIA  — dois códigos na loja com mais de uma variação e total que não
            bate: é o "27" do banner, em miniatura.
   FORA1/2 — peça em casa que a loja não conhece: é o "124".              */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'VARIA', desc: 'Colar variado', cat: 'Colar', preco: 90, qtd: 9 },
    { sku: 'NALOJA', desc: 'Peça publicada', cat: 'Anel', preco: 40, qtd: 2 },
    { sku: 'FORA1', desc: 'Peça só daqui', cat: 'Colar', preco: 55, qtd: 3 },
    { sku: 'FORA2', desc: 'Outra só daqui', cat: 'Brinco', preco: null, qtd: 4 },
  ],
});

const v = (id, valor, estoque) => ({
  id, sku: 'VARIA', values: [{ pt: valor }],
  inventory_levels: [{ location_id: 'L1', stock: estoque }],
});
loja.estado.produtos = [
  {
    id: 70, name: { pt: 'Colar variado' }, handle: { pt: 'variado' }, published: true,
    attributes: [{ pt: 'Cor' }],
    images: [{ id: 7000, src: 'http://localhost:8000/icons/icon-192.png', position: 1 }],
    variants: [v(701, 'Rosa', 1), v(702, 'Cristal', 1)],
  },
  produtoFalso(71, [{ id: 711, sku: 'NALOJA', estoque: 2 }]),
];
await api('POST', '/api/loja/variantes/importar', {});

const escritasAntes = loja.estado.escritas.length;
await api('POST', '/api/sync', { forcar: true });

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + e.message));
await page.addInitScript(([u, k]) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url: u, key: k }));
}, [URL_API, KEY]);
await page.goto(URL_APP);
await page.waitForTimeout(1500);

/* ==================================================================== */
console.log('\n=== 1. os dois banners saíram da aba Nuvemshop ===');
await page.evaluate(() => switchTab('loja'));
await page.waitForTimeout(1200);
const txtLoja = await page.locator('#view-loja').innerText();
eq('não há mais o banner de variações',
  /c[óo]digos t[êe]m mais de uma varia[çc][ãa]o no site/i.test(txtLoja), 'false');
eq('nem o de "não existem na loja"',
  /n[ãa]o existem? na loja/i.test(txtLoja), 'false');

console.log('\n=== 2. mas os números continuam ===');
eq('o KPI "Falta subir" existe', /Falta subir/.test(txtLoja), 'true');
const kpiFalta = await page.evaluate(() => {
  const k = [...document.querySelectorAll('#view-loja .kpi')]
    .find(e => /Falta subir/.test(e.textContent));
  return k ? k.querySelector('.k-num').textContent.trim() : null;
});
eq('e conta os dois códigos que a loja não tem', kpiFalta, '2');
const abaVar = await page.evaluate(() => {
  const b = [...document.querySelectorAll('#view-loja .pill')]
    .find(e => /^Varia[çc][õo]es/.test(e.textContent));
  return b ? b.textContent.trim() : null;
});
eq('a aba de variações continua com a contagem', abaVar, 'Variações (1)');

console.log('\n=== 3. as ações dos banners mudaram de lugar, não sumiram ===');
await page.evaluate(() => setFiltroVitrine('falta'));
await page.waitForTimeout(500);
const acoesFalta = await page.locator('#view-loja .subtabs button').allInnerTexts();
eq('baixar a lista para cadastrar continua ali',
  acoesFalta.some(t => /Baixar lista para cadastrar/.test(t)), 'true');
eq('e agora existe caminho para preparar a publicação',
  acoesFalta.some(t => /Preparar para publicar/.test(t)), 'true');
await page.evaluate(() => setFiltroVitrine('variacao'));
await page.waitForTimeout(500);
const acoesVar = await page.locator('#view-loja .subtabs button').allInnerTexts();
eq('baixar a lista de variações continua ali',
  acoesVar.some(t => /Baixar lista/.test(t)), 'true');
eq('e o caminho para repartir leva a Pendências',
  acoesVar.some(t => /Repartir em Pend[êe]ncias/.test(t)), 'true');

/* ==================================================================== */
console.log('\n=== 4. Pendências tem três seções nomeadas ===');
await page.evaluate(() => switchTab('pendencias'));
await page.waitForTimeout(2000);
const secoes = await page.evaluate(() =>
  [...document.querySelectorAll('#view-pendencias > .subtabs .pill')].map(b => b.textContent.trim()));
eq('as três estão lá', secoes.length, 3);
eq('e na ordem certa',
  secoes.map(s => s.replace(/\s*\(\d+\)$/, '')).join(' | '),
  'Variações | Publicar na Nuvemshop | Outras pendências');

console.log('\n=== 5. a seção Variações traz o que a sincronização recusou ===');
await page.evaluate(() => setSecaoPend('variacoes'));
await page.waitForSelector('.distcard', { timeout: 15000 });
const cartoes = await page.locator('.distcard').count();
eq('há cartão para repartir', cartoes >= 1, 'true');
eq('e ele é do código certo',
  /VARIA/.test(await page.locator('.distcard').first().innerText()), 'true');
const rev = await api('GET', '/api/variacoes/revisao');
eq('o backend continua devolvendo o caso', rev.total, 1);
eq('pelo motivo certo', rev.itens[0].motivo, 'sem_reparticao');

console.log('\n=== 6. a seção Publicar traz os códigos que a loja não tem ===');
await page.evaluate(() => setSecaoPend('publicar'));
await page.waitForTimeout(800);
const pub = await api('GET', '/api/catalogo/publicacao');
const todos = new Set(['prontos', 'semFoto', 'semFundoBranco', 'semDescricao', 'semCategoria', 'semPreco']
  .flatMap(k => (pub[k] || []).map(x => x.sku)));
eq('os dois códigos fora da loja estão na lista',
  ['FORA1', 'FORA2'].every(s => todos.has(s)), 'true');
eq('e o que já está publicado NÃO está', todos.has('NALOJA'), 'false');

const semPreco = (pub.semPreco || []).find(x => x.sku === 'FORA2');
eq('cada item diz o que falta nele', (semPreco.falta || []).includes('preco'), 'true');
eq('e diz se está pronto', semPreco.pronto, 'false');
eq('a peça sem foto também aparece com "foto" faltando',
  ((pub.semFoto || []).find(x => x.sku === 'FORA1') || {}).falta.includes('foto'), 'true');

const linhaFora = await page.evaluate(() => {
  const l = [...document.querySelectorAll('#view-pendencias tbody tr')]
    .find(e => e.textContent.includes('FORA'));
  return l ? l.innerText.replace(/\s+/g, ' ') : null;
});
eq('a tabela mostra a linha da peça', !!linhaFora, 'true');
eq('com os selos do que falta', /pre[çc]o|foto/i.test(linhaFora || ''), 'true');

console.log('\n=== 7. a seção Outras existe e não inventa categoria ===');
await page.evaluate(() => setSecaoPend('outras'));
await page.waitForTimeout(600);
const txtOutras = await page.locator('#view-pendencias').innerText();
eq('ela fala de fotos sem dono', /Fotos sem dono/.test(txtOutras), 'true');
eq('e não repete a lista de publicação', /Falta subir/.test(txtOutras), 'false');

console.log('\n=== 8. nenhuma escrita saiu para a Nuvemshop ===');
/* A trava é estrutural (api/src/nuvemshop.js › chamar), mas esta é a prova
   pelo lado de fora: a loja de mentira registra tudo que chega. */
const escritas = loja.estado.escritas.slice(escritasAntes);
eq('nenhum PATCH de estoque na caixinha do código não repartido',
  escritas.some(w => JSON.stringify(w).includes('70')), 'false');

console.log('\n=== 9. nenhum erro de página ===');
eq('sem exceção no navegador', erros.length ? erros.join(' | ') : 0, 0);

await browser.close();
await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
