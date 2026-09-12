import { chromium } from '../../../../src/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const checks = [];

function check(condition, label) {
  if (!condition) throw new Error(`FALHA: ${label}`);
  checks.push(label);
}

const textOf = async (locator) => (await locator.textContent()).replace(/\s/g, ' ');

try {
  const fileUrl = pathToFileURL(path.resolve('docs/ux/03-screens/vendas/master.html')).href;
  await page.goto(fileUrl);
  await page.locator('[data-screen="lancamentos"]').click();
  check(await page.locator('[data-launch-workspace]').isHidden(), 'fluxo começa reduzido no seletor de tipo');
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-start.png', fullPage: true });
  await page.locator('[data-launch-type="sale"]').click();
  check(await page.locator('[data-launch-workspace]').isVisible(), 'venda normal revela o fluxo');
  check(await page.locator('[data-flow-step="items"] .flow-step-body').isVisible(), 'itens começa como etapa aberta');
  check(await page.locator('[data-flow-step="customer"] .flow-step-body').isHidden(), 'cliente começa recolhida');
  check(await page.locator('[data-flow-step="payment"] .flow-step-body').isHidden(), 'pagamento começa recolhido');

  check(await page.locator('[data-cart-item]').count() === 0, 'lançamento começa sem peças');
  check(await page.locator('[data-payment-entry]').count() === 0, 'lançamento começa sem pagamentos');
  check(await page.locator('[data-selected-customer]').isHidden(), 'lançamento começa sem cliente');
  check(await textOf(page.locator('[data-sale-total]')) === 'R$ 0,00', 'lançamento começa zerado');
  check(await page.locator('[data-finalize-sale]').isDisabled(), 'venda vazia não pode ser finalizada');

  await page.locator('[data-product-search]').fill('122060');
  await page.locator('[data-product-sku="122060"]').click();
  check(!(await page.locator('[data-open-step="customer"]').isDisabled()), 'peça adicionada libera próxima etapa');
  await page.locator('[data-edit-price]').click();
  check((await page.locator('[data-price-form]').textContent()).includes('Preço padrão'), 'modal usa preço padrão');
  await page.locator('[data-final-price]').fill('120');
  await page.locator('[data-price-reason]').fill('Grupo VIP');
  await page.locator('[data-price-form] button[type="submit"]').click();
  check((await textOf(page.locator('.price-note'))).includes('Desconto de R$ 30,00 por peça'), 'desconto aparece no item');
  check(await textOf(page.locator('[data-sale-discount]')) === 'R$ 30,00', 'desconto aparece no fechamento');

  await page.locator('[data-open-step="customer"]').click();
  check(await page.locator('[data-flow-step="customer"] .flow-step-body').isVisible(), 'continuação abre cliente');
  await page.locator('[data-open-step="payment"]').click();
  check(await page.locator('[data-payment-empty]').isVisible(), 'pagamento vazio mostra convite em vez de tabela');
  await page.locator('[data-add-payment]').click();
  check(await page.locator('[data-payment-table]').isVisible(), 'primeiro pagamento revela os campos');
  check(await page.locator('[data-add-payment]').textContent() === '+ Adicionar outro pagamento', 'pagamento misto usa adicionar outro pagamento');
  await page.locator('[data-payment-method]').selectOption('Cartão de crédito');
  check(await page.locator('[data-payment-installments]').isVisible(), 'parcelas aparecem somente no cartão de crédito');
  await page.locator('[data-payment-state]').selectOption('pending');
  check(await page.locator('[data-payment-due-input]').isVisible(), 'pendente abre vencimento');
  check(await page.locator('[data-finalize-sale]').isDisabled(), 'pendente sem vencimento bloqueia finalização');
  check((await page.locator('[data-payment-warning]').textContent()).includes('Defina o vencimento'), 'pendente sem vencimento explica bloqueio');
  await page.locator('[data-payment-due-input]').fill('2026-09-20');
  check(!(await page.locator('[data-finalize-sale]').isDisabled()), 'vencimento preenchido libera finalização');

  const todayRows = page.locator('.today-sales .sale-row');
  await todayRows.nth(0).click();
  await todayRows.nth(1).click();
  check(await page.locator('.today-sales .sale-detail-row').count() === 2, 'duas vendas de hoje ficam abertas juntas');
  check(!(await page.locator('.today-sales').textContent()).includes('(19)'), 'vendas de hoje não mostram telefone');

  await todayRows.nth(1).locator('[data-open-client]').click();
  check(await page.locator('[data-clients-title]').textContent() === 'Camila Ferreira', 'clique abre a cliente específica');
  check(await page.locator('[data-client-row]:visible').count() === 1, 'perfil mostra somente a cliente escolhida');

  await page.locator('[data-screen="lancamentos"]').click();
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile.png', fullPage: true });
  console.log(`ok ${checks.length} verificações`);
} finally {
  await browser.close();
}
