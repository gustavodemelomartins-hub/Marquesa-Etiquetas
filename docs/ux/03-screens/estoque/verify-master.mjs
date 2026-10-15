import { chromium } from '../../../../src/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1; };

try {
  const hub = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await hub.goto(pathToFileURL(path.resolve('docs/ux/prototype/index.html')).href);
  check(await hub.getByRole('heading', { name: 'Sistema Marquesa V2' }).isVisible(), 'hub abre no mobile');
  check(await hub.locator('.area-card').count() === 12, 'hub cobre doze famílias visuais');
  check((await hub.locator('a.area-card').count()) === 12, 'todas as áreas recebem link navegável');
  check(await hub.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'hub sem overflow mobile');
  await hub.close();

  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('docs/ux/03-screens/estoque/master.html')).href);

    check(await page.getByRole('heading', { name: 'Estoque', exact: true }).isVisible(), `Estoque abre em ${width}px`);
    check(await page.locator('.stock-donut').isVisible(), `resumo de estoque visível em ${width}px`);
    check(await page.locator('[data-inventory-tab]').count() === 3, `três contextos do inventário em ${width}px`);
    check(await page.locator('[data-product]').count() === 6, `produtos demonstrativos em ${width}px`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sem overflow inicial em ${width}px`);
    check(errors.length === 0, `sem erro JavaScript em ${width}px`);

    await page.locator('[data-start-inventory]').click();
    check(await page.locator('.start-dialog').evaluate((dialog) => dialog.open), `confirma início em ${width}px`);
    await page.locator('[data-confirm-start]').click();
    check(await page.locator('[data-inventory-panel="active"]').isVisible(), `contagem abre em ${width}px`);
    check((await page.locator('[data-open-label]').textContent()) === 'Em andamento', `card aberto atualiza em ${width}px`);

    await page.locator('[data-pause-inventory]').click();
    check(await page.locator('[data-count-search]').isDisabled(), `pausa bloqueia captura em ${width}px`);
    await page.locator('[data-pause-inventory]').click();
    check(!await page.locator('[data-count-search]').isDisabled(), `retomada libera captura em ${width}px`);

    await page.locator('[data-add-count]').click();
    check(await page.locator('.variation-dialog').evaluate((dialog) => dialog.open), `variação abre em ${width}px`);
    check(await page.locator('[data-confirm-variation]').isDisabled(), `variação exige escolha em ${width}px`);
    await page.locator('.variation-options label').filter({ hasText: 'Aro 17' }).click();
    await page.locator('[data-confirm-variation]').click();
    check((await page.locator('.inventory-count-list .count-row:last-child small').textContent()) === 'Aro 17', `variação exata preservada em ${width}px`);

    await page.locator('[data-finish-inventory]').click();
    check(await page.locator('[data-inventory-panel="review"]').isVisible(), `finalizar abre revisão em ${width}px`);
    check(await page.locator('.review-list input[type="checkbox"]').count() === 3, `somente divergências elegíveis selecionáveis em ${width}px`);
    check(await page.locator('.review-list article input').count() === 0, `não comparável sem checkbox em ${width}px`);

    await page.locator('[data-apply-adjustments]').click();
    check(await page.locator('[data-inventory-panel="detail"]').isVisible(), `aplicação simulada abre detalhe em ${width}px`);
    check((await page.locator('[data-stock-toast]').textContent()).includes('simulada'), `protótipo declara simulação em ${width}px`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `fluxo completo sem overflow em ${width}px`);

    await page.locator('[data-product-search]').fill('colar');
    check(await page.locator('[data-product]:visible').count() === 1, `busca filtra produtos em ${width}px`);
    await page.locator('[data-product-search]').fill('produto inexistente');
    check(await page.locator('[data-product-empty]').isVisible(), `busca vazia explica resultado em ${width}px`);

    if (width === 390) {
      await page.locator('[data-product-search]').fill('');
      await page.locator('[data-inventory-tab="history"]').click();
      await page.screenshot({ path: 'docs/ux/03-screens/estoque/stock-mobile.png', fullPage: true });
    }
    if (width === 1440) {
      await page.locator('[data-product-search]').fill('');
      await page.locator('[data-inventory-tab="health"]').click();
      await page.screenshot({ path: 'docs/ux/03-screens/estoque/stock-desktop.png', fullPage: true });
    }
    await page.close();
  }
  console.log(`${checks} verificações do Estoque aprovadas`);
} finally {
  await browser.close();
}
