import { chromium } from '../../../../src/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (value, message) => { if (!value) throw new Error(message); checks += 1; };

try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('docs/ux/03-screens/revendedoras/master.html')).href);
    check(await page.locator('[data-view="overview"] h1').isVisible(), `abre ${width}`);
    check(await page.locator('.schedule-list button').count() === 3, `agenda ${width}`);
    check((await page.locator('.reseller-metrics').textContent()).includes('preço congelado no envio'), `snapshot ${width}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overview sem overflow ${width}`);
    await page.locator('[data-see-suggestions]').click();
    check(await page.locator('[data-create-dialog]').evaluate((dialog) => dialog.open), `sugestão revisável ${width}`);
    check((await page.locator('[data-reseller-toast]').textContent()).includes('Nenhuma peça saiu de casa'), `sem saída antecipada ${width}`);
    await page.locator('[data-confirm-case]').click();
    check((await page.locator('[data-reseller-toast]').textContent()).includes('após confirmação'), `confirma maleta ${width}`);
    await page.locator('[data-open-reseller]').first().click();
    check(await page.locator('[data-view="profile"]').isVisible(), `perfil ${width}`);
    check(await page.locator('.case-items article').count() === 3, `itens ${width}`);
    await page.locator('[data-open-settlement]').click();
    check(await page.locator('[data-settlement-dialog]').evaluate((dialog) => dialog.open), `acerto abre ${width}`);
    check((await page.locator('.settlement-dialog').textContent()).includes('Devolvidas'), `vendas e devoluções ${width}`);
    await page.locator('[data-confirm-settlement]').click();
    check((await page.locator('[data-reseller-toast]').textContent()).includes('vendidas baixam do total'), `efeito explícito ${width}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `perfil sem overflow ${width}`);
    check(errors.length === 0, `sem erro ${width}`);
    if (width === 390) await page.screenshot({ path: 'docs/ux/03-screens/revendedoras/resellers-mobile.png', fullPage: true });
    if (width === 1440) await page.screenshot({ path: 'docs/ux/03-screens/revendedoras/resellers-desktop.png', fullPage: true });
    await page.close();
  }
  console.log(`${checks} verificações de Revendedoras aprovadas`);
} finally {
  await browser.close();
}
