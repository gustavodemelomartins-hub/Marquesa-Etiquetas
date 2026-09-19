import { chromium } from '../../../../src/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
let checks = 0;

function check(condition, message) {
  if (!condition) throw new Error(message);
  checks += 1;
}

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

async function isVisuallyOneColumn(locator) {
  return locator.evaluate((element) => {
    const children = [...element.children].filter((child) => child.getBoundingClientRect().height > 0);
    if (children.length < 2) return true;
    const first = children[0].getBoundingClientRect();
    const second = children[1].getBoundingClientRect();
    return second.top >= first.bottom - 1;
  });
}

try {
  for (const width of [320, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('docs/ux/03-screens/vendas/master.html')).href);

    check(!await hasHorizontalOverflow(page), `Painel sem rolagem lateral em ${width}px`);
    check(await isVisuallyOneColumn(page.locator('#painel .month-grid')), `Análises do Painel em uma coluna em ${width}px`);

    await page.locator('[data-screen="clientes"]').click();
    check(!await hasHorizontalOverflow(page), `Clientes sem rolagem lateral em ${width}px`);
    check(await page.locator('#clientes .client-list tbody').evaluate((element) => getComputedStyle(element).display === 'grid'), `Clientes usa cartões móveis em ${width}px`);
    await page.locator('[data-client-row]').first().click();
    check(await page.locator('.client-kpi-grid article').count() === 5, `Perfil mostra cinco indicadores em ${width}px`);
    check(await page.locator('.client-aftercare').isVisible(), `Perfil mostra pós-venda em ${width}px`);
    check(await page.locator('.client-credit').getByText('Regra pendente').isVisible(), `Crédito não inventa valor em ${width}px`);
    check(!await hasHorizontalOverflow(page), `Perfil da cliente sem rolagem lateral em ${width}px`);

    await page.locator('[data-screen="lancamentos"]').click();
    check(!await hasHorizontalOverflow(page), `Lançamentos sem rolagem lateral em ${width}px`);
    check(await page.locator('#lancamentos .choice').count() === 3, `Três tipos de lançamento visíveis em ${width}px`);

    await page.locator('[data-launch-screen="saidas"]').click();
    check(!await hasHorizontalOverflow(page), `Saídas sem rolagem lateral em ${width}px`);
    check(await isVisuallyOneColumn(page.locator('.output-analysis-grid')), `Análises de saída em uma coluna em ${width}px`);
    check(await page.locator('.output-record').first().evaluate((element) => getComputedStyle(element).display === 'grid'), `Histórico de saída usa linha empilhada em ${width}px`);

    const firstRow = page.locator('.output-record').first();
    const destination = await firstRow.locator('td:nth-child(2)').boundingBox();
    const date = await firstRow.locator('td:nth-child(1)').boundingBox();
    check(destination.y < date.y && destination.y + destination.height <= date.y + 2, `Destino e data não se sobrepõem em ${width}px (${JSON.stringify({ destination, date })})`);

    await firstRow.click();
    check(await page.locator('.output-expanded-row:not([hidden])').count() === 1, `Detalhe de saída abre em ${width}px`);
    check(!await hasHorizontalOverflow(page), `Detalhe aberto sem rolagem lateral em ${width}px`);
    check(errors.length === 0, `Sem erros de JavaScript em ${width}px: ${errors.join(', ')}`);

    if (width === 390) {
      await page.screenshot({ path: 'docs/ux/03-screens/vendas/mobile-saidas.png', fullPage: true });
      await page.locator('[data-screen="painel"]').click();
      await page.screenshot({ path: 'docs/ux/03-screens/vendas/mobile-painel.png', fullPage: true });
      await page.locator('[data-screen="clientes"]').click();
      await page.locator('[data-client-row]').first().click();
      await page.screenshot({ path: 'docs/ux/03-screens/vendas/mobile-clientes.png', fullPage: true });
    }

    await page.close();
  }

  console.log(`${checks} verificações mobile aprovadas`);
} finally {
  await browser.close();
}
