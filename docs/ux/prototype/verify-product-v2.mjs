import { chromium } from '../../../src/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1; };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

try {
  const hubUrl = pathToFileURL(path.resolve('docs/ux/prototype/index.html')).href;
  const inventory = [];
  const hub = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await hub.goto(hubUrl);
  check(await hub.locator('a.area-card').count() === 12, 'Hub mantém as 12 famílias navegáveis');
  check(await hub.locator('.architecture-strip').isVisible(), 'Hub mostra a navegação proposta');
  check(await hub.locator('a[href="design-system.html"]').isVisible(), 'Hub liga o design system');
  inventory.push(...await hub.locator('a.area-card').evaluateAll((links) => links.map((link) => ({ label: link.querySelector('h2')?.textContent?.trim(), href: link.href }))));
  await hub.close();

  for (const width of [390, 1440]) {
    for (const item of inventory) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(item.href);
      check(response === null || response.ok(), `${item.label} abre em ${width}px`);
      check(await page.locator('h1:visible').count() >= 1 || await page.locator('h1').count() >= 1, `${item.label} tem título`);
      check(!await overflow(page), `${item.label} sem overflow em ${width}px`);
      check(errors.length === 0, `${item.label} sem erro JS em ${width}px: ${errors.join(', ')}`);
      await page.close();
    }
  }

  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('docs/ux/prototype/design-system.html')).href);
    check(await page.locator('.catalog-section').count() === 4, `Design system completo em ${width}px`);
    check(!await overflow(page), `Design system sem overflow em ${width}px`);
    check(errors.length === 0, `Design system sem erro JS em ${width}px`);
    if (width === 390) await page.screenshot({ path: 'docs/ux/prototype/design-system-mobile.png', fullPage: true });
    if (width === 1440) await page.screenshot({ path: 'docs/ux/prototype/design-system-desktop.png', fullPage: true });
    await page.close();
  }

  console.log(`${checks} verificações globais do protótipo aprovadas`);
} finally {
  await browser.close();
}
