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
  check(await page.locator('[data-collar-customizer]').isHidden(), 'composição começa sem modelo e sem slots');
  check(await page.locator('[data-add-collar]').isDisabled(), 'composição vazia não pode ser adicionada');
  check(await page.locator('[data-collar-model]').count() === 5, 'lista usa as cinco configurações comerciais confirmadas');
  check(!(await textOf(page.locator('[data-collar-workspace]'))).includes('MONTE-COLAR'), 'composição livre não aparece');

  await page.locator('[data-collar-model="314161"]').click();
  check(await page.locator('[data-collar-customizer]').isVisible(), 'modelo escolhido revela as posições');
  check(await page.locator('[data-collar-slot]').count() === 3, 'modelo 314161 cria exatamente três posições');
  check(await page.locator('.collar-model:visible').count() === 1, 'mobile recolhe os outros modelos depois da escolha');
  check((await textOf(page.locator('.fixed-collar-base'))).includes('SKU 444032'), 'Veneziana fixa aparece incluída automaticamente');
  check(await textOf(page.locator('[data-collar-footer-price]')) === 'R$ 159,00', 'preço vem do modelo comercial');

  const slots = page.locator('[data-collar-slot]');
  await slots.nth(0).click();
  const componentDialog = page.locator('#component-dialog');
  check(await componentDialog.isVisible(), 'posição abre seletor de componente');
  check(await componentDialog.locator('[data-component-sku]').count() === 3, 'posição Menino mostra somente componentes compatíveis');
  check((await textOf(componentDialog)).includes('251551') && (await textOf(componentDialog)).includes('329494'), 'seletor usa SKUs físicos reais');
  await componentDialog.locator('[data-component-sku="329494"]').click();

  await slots.nth(1).click();
  check(!(await componentDialog.locator('[data-component-sku="329494"]').isDisabled()), 'mesma cor continua disponível para outro slot quando o saldo cobre');
  check((await textOf(componentDialog.locator('[data-component-sku="329494"]'))).includes('1 disp.'), 'repetição desconta o uso anterior do saldo exibido');
  await componentDialog.locator('[data-component-sku="329494"]').click();

  await slots.nth(2).click();
  check(await componentDialog.locator('[data-component-sku]').count() === 2, 'posição Menina mostra somente as duas opções confirmadas');
  await componentDialog.locator('[data-component-sku="263236"]').click();

  check(!(await page.locator('[data-add-collar]').isDisabled()), 'todos os slots válidos liberam adicionar à venda');
  check(await page.locator('.preview-slot.filled').count() === 3, 'prévia respeita as três posições escolhidas');
  await page.locator('[data-collar-customizer]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-collar.png' });

  await page.locator('[data-add-collar]').click();
  check(await page.locator('[data-collar-workspace]').isHidden(), 'adicionar fecha o compositor');
  check(await page.locator('[data-launch-workspace]').isVisible(), 'composição segue para o fluxo compartilhado da venda');
  check(await page.locator('[data-flow-step="customer"] .flow-step-body').isVisible(), 'continuação abre a etapa de cliente');
  const collarItem = page.locator('[data-cart-item][data-custom-collar="true"]');
  check(await collarItem.count() === 1, 'colar entra como uma única linha comercial');
  const collarText = await textOf(collarItem);
  check(collarText.includes('Veneziana 444032') && collarText.match(/Verde/g)?.length === 2 && collarText.includes('Rosa claro'), 'linha congela base e escolhas, inclusive cor repetida');
  check(await collarItem.locator('[data-quantity-action]').count() === 0, 'composição não usa quantidade genérica');
  check(await collarItem.locator('[data-edit-price]').count() === 0, 'preço do modelo não vira soma ou edição avulsa');
  check(await page.locator('[data-product-search-form]').isHidden(), 'modo Monte seu Colar não expõe catálogo avulso após a composição');

  await page.locator('[data-customer-search]').fill('Camila Ferreira');
  await page.locator('[data-customer-search]').dispatchEvent('change');
  await page.locator('[data-open-step="payment"]').click();
  await page.locator('[data-add-payment]').click();
  check(await textOf(page.locator('[data-sale-total]')) === 'R$ 159,00', 'pagamento recebe o valor da composição inteira');
  check(!(await page.locator('[data-finalize-sale]').isDisabled()), 'venda personalizada completa pode seguir à revisão');
  await page.locator('[data-finalize-sale]').click();
  const review = page.locator('#finalize-sale-dialog');
  const reviewText = await textOf(review);
  check(reviewText.includes('Colar Filhos') && reviewText.includes('Veneziana 444032'), 'revisão mostra modelo e base fixa');
  check(reviewText.match(/Verde/g)?.length === 2 && reviewText.includes('Rosa claro'), 'revisão preserva a ordem e cada escolha');
  check(reviewText.includes('R$ 159,00'), 'revisão mostra o preço comercial da composição');
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-collar-review.png' });

  console.log(`ok ${checks.length} verificações`);
} finally {
  await browser.close();
}
