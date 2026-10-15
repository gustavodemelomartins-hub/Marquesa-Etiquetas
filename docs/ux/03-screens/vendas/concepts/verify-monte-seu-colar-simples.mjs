import { chromium } from '../../../../../src/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const checks = [];

function check(condition, label) {
  if (!condition) throw new Error(`FALHA: ${label}`);
  checks.push(label);
}

const compactText = async (locator) => (await locator.textContent()).replace(/\s/g, ' ');

try {
  const fileUrl = pathToFileURL(path.resolve('docs/ux/03-screens/vendas/concepts/monte-seu-colar-simples.html')).href;
  await page.goto(fileUrl);

  check(await compactText(page.locator('[data-footer-label]')) === 'Nenhum pingente', 'composição começa vazia');
  check(await page.locator('[data-color-section]').isHidden(), 'cores só aparecem depois da quantidade');
  check(await page.locator('[data-commercial-section]').isHidden(), 'dados comerciais não aparecem sem composição');
  check(await page.locator('[data-add-sale]').isDisabled(), 'não adiciona uma composição vazia');

  const addBoy = page.locator('[data-quantity="boy"][data-delta="1"]');
  const addGirl = page.locator('[data-quantity="girl"][data-delta="1"]');
  await addBoy.click();
  await addBoy.click();
  await addGirl.click();

  check(await compactText(page.locator('[data-count="boy"]')) === '2', 'contador escolhe duas unidades de menino');
  check(await compactText(page.locator('[data-count="girl"]')) === '1', 'contador escolhe uma unidade de menina');
  check(await page.locator('[data-color-type]').count() === 3, 'quantidades geram uma escolha de cor por peça');
  check(await page.locator('[data-color-group]').count() === 2, 'cores ficam agrupadas entre Meninos e Meninas');
  check((await page.locator('.color-card-grid').first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)) === 3, 'mobile preserva três mini-cards por linha');
  check((await page.locator('.color-card').first().boundingBox()).height <= 110, 'mini-card mobile permanece compacto');
  check(await page.locator('[data-commercial-sku]').inputValue() === '314161', 'combinação reconhece o SKU comercial existente');
  check(await page.locator('[data-commercial-sku]').getAttribute('readonly') !== null, 'SKU conhecido não pode ser rebatizado por engano');
  check((await compactText(page.locator('[data-match-banner]'))).includes('Modelo reconhecido'), 'interface explica o reconhecimento');

  await page.locator('[data-color-type="boy"][data-color-index="0"]').selectOption('329494');
  await page.locator('[data-color-type="boy"][data-color-index="1"]').selectOption('251551');
  await page.locator('[data-color-type="girl"][data-color-index="0"]').selectOption('263236');
  check(await page.locator('.preview-piece').count() === 3, 'prévia acompanha quantidade e cores');
  check(!(await page.locator('[data-add-sale]').isDisabled()), 'modelo completo usa o preço cadastrado e pode ser adicionado');

  await page.locator('[data-final-price]').fill('169');
  check(await page.locator('[data-price-reason-field]').isVisible(), 'alterar o valor de modelo conhecido exige motivo');
  check(await page.locator('[data-add-sale]').isDisabled(), 'preço alterado sem motivo bloqueia a venda');
  await page.locator('[data-price-reason]').fill('Condição combinada com a cliente');
  check(!(await page.locator('[data-add-sale]').isDisabled()), 'motivo libera o preço final alterado');

  await page.addStyleTag({ content: '.concept-header{position:relative!important}.sale-footer{position:static!important}body{padding-bottom:0!important}' });
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/concepts/monte-seu-colar-simples-mobile.png', fullPage: true });
  await page.locator('[data-add-sale]').click();
  const review = page.locator('[data-review-dialog]');
  const reviewText = await compactText(review);
  check(await review.isVisible(), 'adicionar abre uma conferência final');
  check(reviewText.includes('314161') && reviewText.includes('Veneziana 444032'), 'conferência preserva SKU comercial e base física');
  check(reviewText.includes('329494') && reviewText.includes('251551') && reviewText.includes('263236'), 'conferência mostra cada SKU físico escolhido');
  check(reviewText.includes('R$ 169,00') && reviewText.includes('Condição combinada'), 'conferência mostra valor alterado e motivo');
  await page.locator('[data-close-review]').click();

  await page.locator('[data-extra-trigger]').click();
  check((await compactText(page.locator('[data-match-banner]'))).includes('Nova combinação'), 'pingente extra muda o fluxo para nova configuração');
  check(await page.locator('[data-commercial-sku]').getAttribute('readonly') === null, 'nova configuração aceita um SKU novo');
  check(!(await page.locator('[data-commercial-name]').getAttribute('readonly')), 'nova configuração permite alterar o nome');
  check(/^\d{6}$/.test(await page.locator('[data-commercial-sku]').inputValue()), 'nova configuração recebe SKU automático de seis dígitos');
  check(await page.locator('[data-final-price]').inputValue() === '189.00', 'nova combinação recebe sugestão de preço pela faixa atual');
  check((await compactText(page.locator('[data-price-suggestion]'))).includes('R$ 30,00 por pingente adicional'), 'interface explica como chegou ao preço sugerido');
  check(await page.locator('[data-add-sale]').isDisabled(), 'nova configuração incompleta não pode ser vendida');
  await page.locator('[data-extra-sku]').fill('SKU-EXTRA');
  await page.locator('[data-commercial-name]').fill('Colar Filhos com Pingente Extra');
  check(!(await page.locator('[data-add-sale]').isDisabled()), 'SKU, nome, preço e peça extra completos liberam a nova configuração');
  await page.addStyleTag({ content: '.concept-header{position:relative!important}.sale-footer{position:static!important}body{padding-bottom:0!important}' });
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/concepts/monte-seu-colar-nova-combinacao-mobile.png', fullPage: true });

  const widePage = await browser.newPage({ viewport: { width: 858, height: 800 }, deviceScaleFactor: 1 });
  await widePage.goto(fileUrl);
  const wideBoy = widePage.locator('[data-quantity="boy"][data-delta="1"]');
  const wideGirl = widePage.locator('[data-quantity="girl"][data-delta="1"]');
  await wideBoy.click({ clickCount: 2 });
  await wideGirl.click({ clickCount: 4 });
  check(await widePage.locator('.color-card').count() === 6, 'seis peças viram seis mini-cards, sem linhas gigantes');
  check(await widePage.locator('[data-color-group="boy"] .color-card').count() === 2, 'grupo Meninos mantém duas escolhas independentes');
  check(await widePage.locator('[data-color-group="girl"] .color-card').count() === 4, 'grupo Meninas mantém quatro escolhas independentes');
  check((await widePage.locator('.color-card-grid').last().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)) === 3, 'largura da referência usa três mini-cards por linha');
  await widePage.locator('[data-color-type="boy"][data-color-index="0"]').selectOption('329494');
  await widePage.locator('[data-color-type="girl"][data-color-index="0"]').selectOption('263236');
  await widePage.addStyleTag({ content: '.concept-header{position:relative!important}.sale-footer{position:static!important}body{padding-bottom:0!important}' });
  await widePage.screenshot({ path: 'docs/ux/03-screens/vendas/concepts/monte-seu-colar-cores-compactas.png', fullPage: true });
  await widePage.close();

  console.log(`ok ${checks.length} verificações`);
} finally {
  await browser.close();
}
