import { chromium } from '../../../../src/node_modules/playwright/index.mjs';

const base = process.env.PROTOTYPE_BASE_URL || 'http://127.0.0.1:8878/prototype/';
const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (value, message) => { if (!value) throw new Error(message); checks += 1; };

try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + 'notificacoes/');
    check(await page.getByRole('heading', { name: 'Notificações' }).isVisible(), `abre ${width}`);
    check(await page.locator('.notice-item').count() === 6, `itens ${width}`);
    check(await page.locator('.notice-item.unread').count() === 5, `não lidas ${width}`);
    await page.locator('[data-notice-filter="urgent"]').click();
    check(await page.locator('.notice-item:visible').count() === 2, `prioridades ${width}`);
    await page.locator('[data-notice-filter="all"]').click();
    await page.locator('[data-mark-all]').click();
    check(await page.locator('.notice-item.unread').count() === 0, `marca lidas ${width}`);
    check(await page.locator('[data-tab-count]').textContent() === '0', `contador ${width}`);
    check(await page.locator('.notice-preferences input').count() === 3, `preferências ${width}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sem overflow ${width}`);
    check(errors.length === 0, `sem erro JavaScript ${width}: ${errors.join('; ')}`);
    await context.close();
  }
  console.log(`${checks} verificações de Notificações aprovadas`);
} finally {
  await browser.close();
}
