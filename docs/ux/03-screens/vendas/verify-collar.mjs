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
  await page.locator('[data-launch-type="collar"]').click();

  check(await page.locator('[data-collar-workspace]').isVisible(), 'Monte seu Colar abre o compositor próprio');
  check(await page.locator('[data-launch-workspace]').isHidden(), 'venda normal não disputa espaço com o compositor');
  check(await page.locator('.today-sales').isVisible(), 'vendas de hoje continua abaixo do lançamento');
  check(await page.locator('[data-collar-color-section]').isHidden(), 'composição começa sem peças e sem opções abertas');
  check(await page.locator('[data-add-collar]').isDisabled(), 'composição vazia não pode ser adicionada');
  check(await textOf(page.locator('[data-collar-footer-copy]')) === 'Escolha a quantidade para começar', 'rodapé orienta o primeiro passo');

  await page.locator('[data-collar-quantity="Menino"][data-collar-delta="1"]').click({ clickCount: 2 });
  await page.locator('[data-collar-quantity="Menina"][data-collar-delta="1"]').click();
  check(await textOf(page.locator('[data-collar-count="Menino"]')) === '2', 'contador mantém dois meninos no mesmo bloco');
  check(await textOf(page.locator('[data-collar-count="Menina"]')) === '1', 'contador mantém uma menina no mesmo bloco');
  check(await page.locator('.collar-color-card').count() === 3, 'quantidade cria três mini-cards de cor');
  check(await page.locator('[data-collar-commercial-section]').isVisible(), 'configuração revela confirmação comercial');
  check(await page.locator('[data-collar-commercial-sku]').inputValue() === '314161', 'combinação conhecida reconhece SKU comercial');
  check(await page.locator('[data-collar-commercial-name]').inputValue() === 'Colar Filhos Dois Meninos e Uma Menina', 'combinação conhecida reconhece o nome');
  check(await page.locator('[data-collar-final-price]').inputValue() === '159.00', 'combinação conhecida traz o preço cadastrado');
  check(await page.locator('[data-collar-commercial-sku]').isEditable() === false, 'SKU conhecido fica protegido');
  check((await textOf(page.locator('.fixed-collar-base'))).includes('SKU 444032'), 'Veneziana fixa aparece incluída automaticamente');

  const boyColors = page.locator('[data-collar-color-group="Menino"]');
  await boyColors.nth(0).selectOption('329494');
  check(!(await boyColors.nth(1).locator('option[value="329494"]').isDisabled()), 'mesma cor pode repetir enquanto há saldo');
  await boyColors.nth(1).selectOption('329494');
  await page.locator('[data-collar-color-group="Menina"]').selectOption('263236');
  check(!(await page.locator('[data-add-collar]').isDisabled()), 'cores válidas liberam adicionar à venda');
  check(await page.locator('.preview-slot.filled').count() === 3, 'prévia mostra somente as peças escolhidas');

  await page.locator('[data-collar-final-price]').fill('169');
  check(await page.locator('[data-collar-price-reason-field]').isVisible(), 'alterar preço conhecido exige motivo');
  check(await page.locator('[data-add-collar]').isDisabled(), 'preço alterado sem motivo bloqueia inclusão');
  await page.locator('[data-collar-price-reason]').fill('Condição especial no balcão');
  check(!(await page.locator('[data-add-collar]').isDisabled()), 'motivo informado libera preço alterado');
  await page.locator('[data-collar-commercial-section]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-collar.png' });

  await page.locator('[data-add-collar]').click();
  const collarItem = page.locator('[data-cart-item][data-custom-collar="true"]');
  check(await collarItem.count() === 1, 'colar entra como uma única linha comercial');
  const collarText = await textOf(collarItem);
  check(collarText.includes('Veneziana 444032') && collarText.match(/Verde/g)?.length === 2 && collarText.includes('Rosa claro'), 'linha congela base e escolhas, inclusive cor repetida');
  check(collarText.includes('Acréscimo de R$ 10,00') && collarText.includes('Condição especial'), 'linha explica o acréscimo e seu motivo');
  check(await textOf(collarItem.locator('[data-item-total]')) === 'R$ 169,00', 'linha usa o preço final confirmado');
  check(await page.locator('[data-flow-step="customer"] .flow-step-body').isVisible(), 'continuação abre a etapa de cliente');

  await page.locator('[data-flow-step="items"] [data-step-toggle]').click();
  await page.locator('[data-edit-collar]').click();
  await page.locator('[data-collar-extra-trigger]').click();
  check((await textOf(page.locator('[data-collar-match]'))).includes('Combinação nova'), 'pingente extra transforma o conjunto em combinação nova');
  check(/^\d{6}$/.test(await page.locator('[data-collar-commercial-sku]').inputValue()), 'combinação nova recebe SKU automático de seis dígitos');
  check(await page.locator('[data-collar-commercial-sku]').isEditable(), 'SKU sugerido de combinação nova pode ser revisado');
  check((await page.locator('[data-collar-commercial-name]').inputValue()).includes('Pingente Extra'), 'nome sugerido descreve a nova composição');
  check(await page.locator('[data-collar-final-price]').inputValue() === '189.00', 'quatro pingentes recebem sugestão de R$ 189');
  const suggestionText = await textOf(page.locator('[data-collar-price-suggestion]'));
  check(suggestionText.includes('R$ 99,00') && suggestionText.includes('R$ 30,00'), 'fórmula da sugestão fica visível');
  check(await page.locator('[data-add-collar]').isDisabled(), 'pingente extra vazio bloqueia inclusão');
  await page.locator('[data-collar-extra-sku]').fill('Coração incolor · SKU 123456');
  check(!(await page.locator('[data-add-collar]').isDisabled()), 'pingente extra identificado libera inclusão');
  await page.locator('[data-collar-commercial-section]').scrollIntoViewIfNeeded();
  await page.locator('[data-launch-toast]').evaluate((toast) => { toast.hidden = true; });
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-collar-new.png' });

  await page.locator('[data-add-collar]').click();
  check(await page.locator('[data-cart-item][data-custom-collar="true"]').count() === 1, 'editar substitui a composição anterior sem duplicar');
  check((await textOf(page.locator('[data-cart-item][data-custom-collar="true"]'))).includes('Coração incolor'), 'linha comercial preserva o pingente extra');
  check(await textOf(page.locator('[data-sale-total]')) === 'R$ 189,00', 'pagamento recebe o preço final da combinação nova');

  console.log(`ok ${checks.length} verificações`);
} finally {
  await browser.close();
}
