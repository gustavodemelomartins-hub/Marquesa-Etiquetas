/* Clientes V2 — lista, painel de relacionamento e cadastro, em cinco larguras. */
import { chromium } from '../../../../src/node_modules/playwright/index.mjs';
const base = process.env.PROTOTYPE_BASE_URL || 'http://127.0.0.1:8878/prototype/';
const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1; };

try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { const u = new URL(r.url()); if (!['data:', 'blob:'].includes(u.protocol) && (u.origin !== new URL(base).origin || r.method() !== 'GET')) external.push(r.url()); });
    await page.goto(base + 'clientes/');
    await page.waitForSelector('html[data-demo-ready="true"]');
    await page.locator('[data-open-client]').first().waitFor();

    /* Lista */
    check(await page.getByRole('heading', { name: 'Clientes', exact: true }).isVisible(), `lista abre em ${width}px`);
    check(await page.locator('[data-open-client]').count() === 5, `base demonstrativa completa em ${width}px`);
    check((await page.locator('[data-client-rows]').textContent()).includes('Camila Ferreira'), `cliente listada em ${width}px`);

    /* Busca e filtro preservam o recorte e explicam o vazio */
    await page.locator('[data-client-search]').fill('camila');
    check(await page.locator('[data-open-client]').count() === 1, `busca filtra em ${width}px`);
    await page.locator('[data-client-search]').fill('zzz');
    check(await page.locator('[data-client-empty]').isVisible(), `vazio explicado em ${width}px`);
    await page.locator('[data-client-clear]').click();
    check(await page.locator('[data-open-client]').count() === 5, `limpar filtros restaura em ${width}px`);
    await page.locator('[data-client-filter="open"]').click();
    check(await page.locator('[data-open-client]').count() === 3, `filtro de saldo aberto em ${width}px`);
    await page.locator('[data-client-filter="all"]').click();

    /* Painel da cliente */
    await page.locator('[data-open-client="camila"]').click();
    check(await page.locator('[data-client-view="perfil"]').isVisible(), `painel abre em ${width}px`);
    check((await page.locator('[data-profile-name]').textContent()) === 'Camila Ferreira', `painel identifica a cliente em ${width}px`);
    check(await page.locator('.profile-kpis .mq-kpi').count() === 5, `cinco indicadores da relação em ${width}px`);
    check((await page.locator('[data-profile-timeline]').textContent()).includes('Venda #1058'), `compra na linha do tempo em ${width}px`);
    check((await page.locator('[data-profile-timeline]').textContent()).includes('vencimento'), `venda e vencimento separados em ${width}px`);

    /* Compra e dinheiro são fatos distintos */
    await page.locator('[data-timeline-filter="money"]').click();
    check(!(await page.locator('[data-profile-timeline]').textContent()).includes('Venda #1058'), `recorte de dinheiro exclui a venda em ${width}px`);
    await page.locator('[data-timeline-filter="all"]').click();

    /* Pós-venda e crédito continuam explícitos */
    check((await page.locator('main').textContent()).includes('Garantia #G-142'), `pós-venda ligado à cliente em ${width}px`);
    check((await page.locator('main').textContent()).includes('Regra pendente'), `crédito segue como decisão pendente em ${width}px`);

    /* Cadastro demonstrativo */
    await page.locator('[data-edit-client]').click();
    check(await page.locator('[data-client-dialog]').evaluate((d) => d.open), `edição abre em ${width}px`);
    check((await page.locator('[data-form-name]').inputValue()) === 'Camila Ferreira', `edição carrega o cadastro em ${width}px`);
    await page.locator('[data-client-dialog] [value="cancel"]').first().click();

    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sem transbordo em ${width}px`);
    check(errors.length === 0, `sem erro JavaScript em ${width}px: ${errors.join(';')}`);
    check(external.length === 0, `nenhuma requisição externa em ${width}px`);
    if (width === 390) await page.screenshot({ path: 'docs/ux/03-screens/clientes/clients-mobile.png', fullPage: true });
    if (width === 1440) await page.screenshot({ path: 'docs/ux/03-screens/clientes/clients-desktop.png', fullPage: true });
    await page.close();
  }
  console.log(`${checks} verificações de Clientes aprovadas`);
} finally { await browser.close(); }
