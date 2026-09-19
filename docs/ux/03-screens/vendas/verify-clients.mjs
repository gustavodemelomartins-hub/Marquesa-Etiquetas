import { chromium } from '../../../../src/node_modules/playwright/index.mjs';
const base = process.env.PROTOTYPE_BASE_URL || 'http://127.0.0.1:8878/prototype/';

const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1; };

try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + 'clientes/');
    await page.waitForSelector('html[data-demo-ready="true"]');
    await page.locator('[data-screen="clientes"]').click();
    await page.locator('[data-client-row]').first().click();

    check(await page.locator('[data-client-profile]').isVisible(), `Perfil abre em ${width}px`);
    check(await page.locator('.client-kpi-grid article').count() === 5, `Cinco KPIs em ${width}px`);
    check(await page.locator('.aftercare-grid article').count() === 2, `Dois exemplos de pós-venda em ${width}px`);
    check(await page.locator('.client-credit').getByText('Regra pendente').isVisible(), `Crédito pendente explícito em ${width}px`);
    check((await page.locator('[data-profile-ticket]').textContent()).replace(/\s/g, ' ') === 'R$ 321,00', `Ticket demonstrativo em ${width}px`);
    check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), `Sem overflow em ${width}px`);
    check(errors.length === 0, `Sem erro JS em ${width}px: ${errors.join(', ')}`);

    if (width === 390) await page.screenshot({ path: 'docs/ux/03-screens/clientes/perfil-mobile-v2.png' });
    if (width === 1440) await page.screenshot({ path: 'docs/ux/03-screens/clientes/perfil-desktop-v2.png', fullPage: true });
    await page.close();
  }
  console.log(`${checks} verificações do perfil de cliente aprovadas`);
} finally {
  await browser.close();
}
