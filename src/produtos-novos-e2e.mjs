/** Teste ponta a ponta da tela "Estoque Total" (React), fluxo
 *  "Adicionar Peças Novas".
 *
 *  O que precisa ficar provado aqui:
 *
 *   1. SKU que já existe é IGNORADO por completo — nunca vira item, e o
 *      produto existente não muda em nenhum campo, mesmo com quantidade,
 *      preço e descrição diferentes na planilha
 *   2. só SKU novo vira item, com o rótulo NOVO
 *   3. aprovar e aplicar cria o produto de verdade, com um movimento de
 *      entrada — não um INSERT direto
 *   4. nenhum erro de console
 *
 *  Precisa do build pronto (`npm run build` dentro de frontend/) e do
 *  Worker local no ar em localhost:8787, com o dashboard/frontend servidos
 *  em localhost:8000. Não toca a Nuvemshop.
 */
import * as XLSX from 'xlsx';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const URL_APP = 'http://localhost:8000/frontend/dist/index.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));
const contem = (t, texto, trecho) =>
  (String(texto).includes(trecho) ? ok(t) : bad(t, `não achei "${trecho}"`));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

/* PN1 já existe: a planilha traz quantidade/descrição/preço DIFERENTES —
 * nada disso pode vazar para o produto existente.
 * PN2 não existe: deve virar candidato a criação. */
await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'PN1', desc: 'Original Fixture', cat: 'Anel', preco: 55, qtd: 8 }],
});

const wb = XLSX.utils.book_new();
const aba = XLSX.utils.aoa_to_sheet([
  ['SKU', 'Descrição', 'Quantidade', 'Preço'],
  ['PN1', 'Descrição Trocada Na Planilha', 999, 1],
  ['PN2', 'Colar Novo Fixture', 5, 130],
]);
XLSX.utils.book_append_sheet(wb, aba, 'Novos');
const dir = mkdtempSync(join(tmpdir(), 'marquesa-e2e-'));
const arquivo = join(dir, 'Pecas Novas Fixture.xlsx');
writeFileSync(arquivo, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();

const erros = [];
page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', e => erros.push('pageerror: ' + e.message));

await page.addInitScript(([url, key]) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
}, [URL_API, KEY]);

await page.goto(URL_APP);
await page.waitForSelector('.nav-item', { timeout: 15000 });

console.log('\n=== 1. escolher Adicionar Peças Novas, selecionar o arquivo ===');
await page.click('.nav-item:has-text("Estoque Total")');
await page.waitForSelector('.cartao-escolha', { timeout: 15000 });
await page.click('.cartao-escolha:has-text("Adicionar Peças Novas")');
await page.setInputFiles('input[type="file"]', arquivo);
await page.waitForSelector('text=Pecas Novas Fixture.xlsx', { timeout: 15000 });

console.log('\n=== 2. analisar ===');
await page.click('button:has-text("Analisar peças novas")');
await page.waitForSelector('table.tabela', { timeout: 20000 });

const metricas = await page.$$eval('.metric', ns => ns.map(n => ({
  rotulo: n.querySelector('.rotulo').textContent.trim(),
  valor: n.querySelector('.valor').textContent.trim(),
})));
const metrica = r => (metricas.find(m => m.rotulo === r) || {}).valor;
eq('novos produtos: só PN2', metrica('Novos produtos'), 1);
eq('já existem e serão ignorados: PN1', metrica('Já existem e serão ignorados'), 1);

const linhas = await page.$$eval('table.tabela tbody tr', ns => ns.map(n => n.textContent));
eq('só 1 linha na tabela — PN1 nunca vira item', linhas.length, 1);
contem('a linha é o PN2', linhas[0], 'PN2');
eq('e não é o PN1', linhas[0].includes('PN1'), 'false');

console.log('\n=== 3. PN1 continua exatamente como estava, mesmo depois da análise ===');
const pn1Antes = (await api('GET', '/api/state')).produtos.find(p => p.sku === 'PN1');
eq('PN1.qtd continua 8 (a planilha dizia 999)', pn1Antes.qtd, 8);
eq('PN1.desc continua "Original Fixture"', pn1Antes.desc, 'Original Fixture');
eq('PN1.preco continua 55 (a planilha dizia 1)', pn1Antes.preco, 55);

console.log('\n=== 4. aprovar e aplicar o PN2 ===');
await page.click('button:has-text("Aprovar")');
await page.waitForSelector('button:has-text("Revisar e aplicar (1)")', { timeout: 15000 });
await page.click('button:has-text("Revisar e aplicar (1)")');
await page.waitForSelector('text=Você aprovou 1 item', { timeout: 15000 });
const confirmacao = await page.textContent('.cartao');
contem('a confirmação diz "será cadastrado"', confirmacao, 'será cadastrado');

await page.click('button:has-text("Cadastrar novos produtos")');
await page.waitForSelector('text=Importação concluída', { timeout: 20000 });
ok('resultado apareceu');

console.log('\n=== 5. o produto foi criado de verdade, com movimento de entrada ===');
const depois = await api('GET', '/api/state');
const pn2 = depois.produtos.find(p => p.sku === 'PN2');
if (!pn2) bad('PN2 foi criado'); else {
  ok('PN2 foi criado');
  eq('com a quantidade da planilha', pn2.qtd, 5);
  eq('com a descrição da planilha', pn2.desc, 'Colar Novo Fixture');
  eq('com o preço da planilha', pn2.preco, 130);
}

const pn1Depois = depois.produtos.find(p => p.sku === 'PN1');
eq('PN1 SEGUE intacto depois do Apply do fluxo — este fluxo é estruturalmente incapaz de tocá-lo',
   pn1Depois.qtd, 8);
eq('PN1.desc segue intacto', pn1Depois.desc, 'Original Fixture');

const conferencia = await api('GET', '/api/estoque/conferir');
eq('a razão contábil fecha (o PN2 nasceu com um movimento de entrada, não um INSERT solto)',
   conferencia.divergentes.length, 0);

console.log('\n=== 6. retry: reabrir a mesma planilha não duplica o PN2 ===');
await page.goto(URL_APP);
await page.click('.nav-item:has-text("Estoque Total")');
await page.click('.cartao-escolha:has-text("Adicionar Peças Novas")');
await page.setInputFiles('input[type="file"]', arquivo);
await page.waitForSelector('text=Pecas Novas Fixture.xlsx', { timeout: 15000 });
await page.click('button:has-text("Analisar peças novas")');
/* Desta vez zero itens são gerados (os dois SKUs já existem) — a tabela
   vira EmptyState, não table.tabela. Espera pelo resumo, que aparece de
   qualquer forma. */
await page.waitForSelector('.metric', { timeout: 20000 });
const metricas2 = await page.$$eval('.metric', ns => ns.map(n => ({
  rotulo: n.querySelector('.rotulo').textContent.trim(),
  valor: n.querySelector('.valor').textContent.trim(),
})));
const metrica2 = r => (metricas2.find(m => m.rotulo === r) || {}).valor;
eq('agora PN1 E PN2 já existem — os dois são ignorados, zero novos',
   metrica2('Já existem e serão ignorados'), 2);
eq('zero novos produtos na segunda análise', metrica2('Novos produtos'), 0);

console.log('\n=== 7. erros de console ===');
eq('nenhum erro no console do navegador', erros.length, 0);
if (erros.length) erros.slice(0, 5).forEach(e => console.log('    ' + e));

await browser.close();

console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ tudo certo');
process.exit(falhas ? 1 : 0);
