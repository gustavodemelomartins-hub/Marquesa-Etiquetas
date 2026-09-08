/** Evidência visual do Pacote 1, depois de `pacote1-shell-test.mjs` preparar
 * as duas clientes homônimas no D1 local. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const destino = process.argv[2];
if (!destino) throw new Error('Informe a pasta de destino das capturas.');
fs.mkdirSync(destino, { recursive: true });

const conexao = { url: 'http://localhost:8787', key: 'troque-por-uma-chave-de-teste' };
const browser = await chromium.launch();
const erros = [];

async function pagina(url, largura, altura) {
  const page = await browser.newPage({ viewport: { width: largura, height: altura } });
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') erros.push(`${url}: ${mensagem.text()}`);
  });
  page.on('pageerror', (erro) => erros.push(`${url}: ${erro.message}`));
  await page.addInitScript((c) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify(c));
  }, conexao);
  await page.goto(url);
  return page;
}

async function capturarLegado(nome, largura, altura, buscaAberta) {
  const page = await pagina('http://localhost:8000/dashboard.html', largura, altura);
  await page.waitForFunction(() =>
    document.querySelector('#view-geral')?.textContent?.trim()
      && !document.querySelector('#toast')?.classList.contains('show'),
  );
  await page.waitForTimeout(350);
  if (buscaAberta) {
    await page.locator('#clientSearchInput').fill('vitoria');
    await page.locator('.client-search-result').first().waitFor();
  }
  await page.screenshot({ path: path.join(destino, nome), fullPage: true });
  await page.close();
}

async function capturarReact(nome, largura, altura, buscaAberta) {
  const page = await pagina('http://localhost:8000/frontend/dist/index.html', largura, altura);
  await page.getByRole('navigation', { name: 'Áreas principais' }).waitFor();
  if (buscaAberta) {
    await page.getByRole('combobox', { name: 'Buscar cliente por nome ou telefone' }).fill('vitoria');
    await page.getByRole('option').first().waitFor();
  }
  await page.screenshot({ path: path.join(destino, nome), fullPage: true });
  await page.close();
}

await capturarLegado('legado-desktop-busca.png', 1180, 820, true);
await capturarLegado('legado-mobile.png', 390, 844, false);
await capturarReact('react-desktop-busca.png', 1180, 820, true);
await capturarReact('react-mobile.png', 390, 844, false);

await browser.close();
if (erros.length) throw new Error(`Erros de navegador:\n${erros.join('\n')}`);
console.log('4 capturas do Pacote 1 geradas sem erros de navegador.');
