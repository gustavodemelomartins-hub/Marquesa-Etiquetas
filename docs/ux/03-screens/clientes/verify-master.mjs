import { chromium } from '../../../../src/node_modules/playwright/index.mjs';
const base = process.env.PROTOTYPE_BASE_URL || 'http://127.0.0.1:8878/prototype/';

const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (value, message) => { if (!value) throw new Error(message); checks += 1; };

try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + 'clientes/');
    await page.waitForSelector('html[data-demo-ready="true"]');
    check(await page.getByRole('heading', { name: 'Clientes', exact: true }).isVisible(), `rota de clientes abre ${width}`);
    check(await page.locator('[data-client-row]:visible').count() === 5, `lista mostra cinco exemplos ${width}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `lista sem overflow ${width}`);
    await page.locator('[data-client-row="Camila Ferreira"]').click();
    check(await page.locator('[data-client-profile]').isVisible(), `perfil abre ${width}`);
    check((await page.locator('[data-profile-name]').textContent()) === 'Camila Ferreira', `identidade preservada ${width}`);
    check((await page.locator('[data-profile-open]').textContent()).replace(/\s/g, ' ') === 'R$ 159,00', `saldo em aberto separado ${width}`);
    check(await page.locator('.client-timeline article').count() === 3, `linha do tempo completa ${width}`);
    check((await page.locator('[data-client-profile]').textContent()).includes('sem geração de parcelas'), `sem parcelamento ${width}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `perfil sem overflow ${width}`);
    await page.locator('[data-register-receipt]').click();
    await page.waitForURL('**/prototype/financeiro/?cliente=camila');
    check((await page.locator('[data-detail-client]').textContent()) === 'Camila Ferreira', `recebimento abre a conta da cliente ${width}`);
    check(await page.getByRole('heading', {name:'A receber',exact:true}).isVisible(), `financeiro abre ${width}`);
    await page.goto(base + 'clientes/');
    check(await page.locator('[data-client-row]:visible').count() === 5, `volta à lista ${width}`);
    check(errors.length === 0, `sem erro JavaScript ${width}`);
    if (width === 390) {
      await page.locator('[data-client-row="Camila Ferreira"]').click();
      await page.screenshot({ path: 'docs/ux/03-screens/clientes/clients-mobile.png', fullPage: true });
    }
    if (width === 1440) {
      await page.locator('[data-client-row="Camila Ferreira"]').click();
      await page.screenshot({ path: 'docs/ux/03-screens/clientes/clients-desktop.png', fullPage: true });
    }
    await page.close();
  }
  console.log(`${checks} verificações de Clientes aprovadas`);
} finally {
  await browser.close();
}
