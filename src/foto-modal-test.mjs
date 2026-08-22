/** Confere o modal de foto no navegador de verdade.
 *
 *  A tela deixou de ter um campo de "endereço da foto" para digitar — a
 *  Sthefany sobe o arquivo, e o arquivo vai para o R2. Este teste prova o
 *  caminho inteiro: `<input type=file>` real, upload de bytes de verdade,
 *  exibição via o link assinado que o servidor devolve, e remoção.
 *
 *  Precisa do Worker local no ar, do dashboard servido em localhost:8000 e
 *  do banco limpo (`api/dev-local.sh`).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const pixelB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const arquivoPixel = path.join(AQUI, 'pixel-modal-test.png');
fs.writeFileSync(arquivoPixel, Buffer.from(pixelB64, 'base64'));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

await api('POST', '/api/produtos/novos/cadastrar', {
  produtos: [{ sku: 'MODAL1', desc: 'Peça do teste de modal', cat: 'Colar', preco: 90, qtd: 2 }],
});

/* Mesmo padrão dos outros testes de navegador: honra PW_CHROMIUM e, sem
   ela, usa o Chromium do próprio Playwright. O caminho fixo
   `/opt/pw-browsers/chromium` deixava este teste rodando só no Linux. */
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push(String(e.message)));
await page.addInitScript(k => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url: 'http://localhost:8787', key: k }));
}, KEY);
await page.goto(URL_APP);
await page.waitForTimeout(1500);

await page.evaluate(() => switchTab('estoque'));
await page.waitForTimeout(600);
await page.evaluate(() => abrirFoto('MODAL1'));
await page.waitForTimeout(400);

eq('o modal abriu', await page.locator('#fotoOverlay').evaluate(e => e.classList.contains('show')), 'true');
eq('não existe mais campo de URL para digitar', await page.locator('#fotoUrl').count(), 0);
eq('existe input de arquivo para a original',
  await page.locator('#fotoBody input[type=file]').count() >= 1, 'true');

const inputs = page.locator('#fotoBody input[type=file]');
await inputs.nth(0).setInputFiles(arquivoPixel);
await page.waitForTimeout(1200);

eq('a prévia da foto original apareceu', await page.locator('#fotoBody img.fotoprev').count() >= 1, 'true');
const srcOriginal = await page.locator('#fotoBody img.fotoprev').first().getAttribute('src');
eq('o src é o link assinado da API, não um blob local nem URL externa',
  /^\/api\/produtos\/MODAL1\/foto\/original\?exp=\d+&sig=[0-9a-f]+$/.test(srcOriginal || ''), 'true');

const statusChip = (await page.locator('#fotoBody .fotochip').first().textContent()).trim();
eq('o estado mostrado é "falta fundo branco"', statusChip, 'falta fundo branco');

page.once('dialog', d => d.accept());
await page.click('#fotoBody .btn-danger');
await page.waitForTimeout(900);
eq('depois de remover, volta a mostrar "sem foto"',
  (await page.locator('#fotoBody .fotochip').first().textContent()).trim(), 'sem foto');
eq('e some o botão de remover', await page.locator('#fotoBody .btn-danger').count(), 0);

eq('nenhum erro de página em todo o percurso', erros.length, 0);

fs.unlinkSync(arquivoPixel);
await browser.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
