import { chromium } from '../../../../src/node_modules/playwright/index.mjs';

const base = process.env.PROTOTYPE_BASE_URL || 'http://127.0.0.1:8878/prototype/';
const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (value, message) => { if (!value) throw new Error(message); checks += 1; };

try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + 'financeiro/');
    await page.waitForSelector('html[data-demo-ready="true"]');
    page.on('dialog', dialog => dialog.accept());
    await Promise.all([page.waitForNavigation(), page.locator('[data-demo-reset]').click()]);
    await page.waitForSelector('html[data-demo-ready="true"]');
    check(await page.getByRole('heading', { name: 'A receber' }).isVisible(), `abre ${width}`);
    check(await page.locator('[data-account]').count() === 3, `saldos ${width}`);
    check((await page.locator('.finance-heading').textContent()).includes('sem geração de parcelas'), `sem parcelas ${width}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sem overflow ${width}`);
    await page.locator('[data-new-receipt]').click();
    check(await page.locator('[data-receipt-dialog]').evaluate(dialog => dialog.open), `dialog ${width}`);
    await page.locator('[data-save-receipt]').click();
    await page.locator('[data-detail-status]').filter({ hasText: 'Pago' }).waitFor();
    check((await page.locator('[data-detail-status]').textContent()) === 'Pago', `status derivado ${width}`);
    check((await page.locator('[data-detail-open]').textContent()).replace(/\s/g, ' ') === 'R$ 0,00', `saldo recalculado ${width}`);
    check((await page.locator('[data-finance-toast]').textContent()).includes('Estoque preservado'), `estoque preservado ${width}`);
    await page.locator('[data-correct-receipt]').click();
    await page.locator('[data-correction-reason] textarea').fill('Data confirmada pela cliente');
    await page.locator('[data-save-receipt]').click();
    await page.locator('[data-event-list]').filter({ hasText: 'registro anterior preservado' }).waitFor();
    check((await page.locator('[data-event-list]').textContent()).includes('registro anterior preservado'), `correção auditável ${width}`);
    await page.locator('[data-finance-tab="history"]').click();
    check(await page.getByRole('heading', { name: 'Histórico financeiro' }).isVisible(), `histórico ${width}`);
    check(errors.length === 0, `sem erro ${width}: ${errors.join('; ')}`);
    await page.close();
  }
  console.log(`${checks} verificações de Financeiro aprovadas`);
} finally {
  await browser.close();
}
