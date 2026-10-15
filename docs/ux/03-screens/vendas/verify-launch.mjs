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
  check(await page.locator('.today-sales').isVisible(), 'vendas de hoje aparece antes de escolher o tipo');
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-start.png', fullPage: true });
  await page.locator('[data-launch-type="sale"]').click();
  check(await page.locator('[data-launch-workspace]').isVisible(), 'venda normal revela o fluxo');
  check(await page.locator('[data-flow-step="items"] .flow-step-body').isVisible(), 'itens começa como etapa aberta');
  check(await page.locator('[data-flow-step="customer"] .flow-step-body').isHidden(), 'cliente começa recolhida');
  check(await page.locator('[data-flow-step="payment"] .flow-step-body').isHidden(), 'pagamento começa recolhido');
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-empty-sale.png', fullPage: true });
  await page.locator('[data-product-search]').focus();
  check(await page.locator('[data-product-results]').isHidden(), 'foco vazio não abre sugestões');
  await page.locator('[data-product-search-form] button[type="submit"]').click();
  check(await page.locator('[data-product-results]').isHidden(), 'adicionar vazio não abre catálogo');
  check((await page.locator('[data-launch-toast]').textContent()).includes('Digite o nome'), 'entrada vazia explica digitar, bipar ou usar câmera');
  await page.locator('[data-open-camera]').click();
  check(await page.locator('#camera-dialog').isVisible(), 'botão abre leitor pela câmera');
  check((await page.locator('[data-camera-status]').textContent()) === 'Câmera desligada.', 'câmera aguarda confirmação explícita');
  await page.locator('#camera-dialog').getByRole('button', { name: 'Fechar', exact: true }).click();

  check(await page.locator('[data-cart-item]').count() === 0, 'lançamento começa sem peças');
  check(await page.locator('[data-payment-entry]').count() === 0, 'lançamento começa sem pagamentos');
  check(await page.locator('[data-selected-customer]').isHidden(), 'lançamento começa sem cliente');
  check(await textOf(page.locator('[data-sale-total]')) === 'R$ 0,00', 'lançamento começa zerado');
  check(await page.locator('[data-finalize-sale]').isDisabled(), 'venda vazia não pode ser finalizada');

  await page.locator('[data-product-search]').fill('anel aurora');
  check(await page.locator('[data-product-results] [data-product-sku="784231"]').count() === 1, 'produto com variações aparece uma única vez na busca');
  await page.locator('[data-product-sku="784231"]').click();
  const variationDialog = page.locator('#variation-dialog');
  check(await variationDialog.isVisible(), 'produto com mais de uma variação exige escolha explícita');
  check(await page.locator('[data-cart-item]').count() === 0, 'produto ambíguo não entra no carrinho antes da escolha');
  check(await variationDialog.locator('[data-variant-id]').count() === 3, 'seletor mostra todos os aros reais');
  check(await variationDialog.locator('[data-variant-id="784231-20"]').isDisabled(), 'variação sem estoque fica visível e bloqueada');
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-variation.png', fullPage: true });
  await variationDialog.getByRole('button', { name: /Aro 16/ }).click();
  check(await textOf(page.locator('[data-cart-item][data-variant-id="784231-16"] .variant-pill')) === 'Aro 16', 'variação escolhida acompanha a linha do carrinho');

  await page.locator('[data-product-search]').fill('784231');
  await page.locator('[data-product-sku="784231"]').click();
  await variationDialog.getByRole('button', { name: /Aro 18/ }).click();
  check(await page.locator('[data-cart-item][data-sku="784231"]').count() === 2, 'aros diferentes do mesmo SKU ocupam linhas separadas');
  const aro18 = page.locator('[data-cart-item][data-variant-id="784231-18"]');
  await aro18.locator('[data-quantity-action="increase"]').click();
  check(await aro18.locator('[data-item-quantity]').textContent() === '1', 'quantidade não ultrapassa o saldo da variação');
  check((await page.locator('[data-launch-toast]').textContent()).includes('somente 1 disponível'), 'saldo da variação explica por que a quantidade foi bloqueada');

  await page.locator('[data-product-search]').fill('784231');
  await page.locator('[data-product-sku="784231"]').click();
  await variationDialog.getByRole('button', { name: /Aro 16/ }).click();
  check(await page.locator('[data-cart-item][data-sku="784231"]').count() === 2, 'mesmo SKU e mesmo aro não criam linha duplicada');
  check((await page.locator('[data-launch-toast]').textContent()).includes('Use +'), 'aro repetido orienta aumentar pela linha existente');

  await page.locator('[data-product-search]').fill('122060');
  await page.locator('[data-product-sku="122060"]').click();
  check(!(await page.locator('[data-open-step="customer"]').isDisabled()), 'peça adicionada libera próxima etapa');
  await page.locator('[data-product-search]').fill('122060');
  await page.locator('[data-product-search-form] button[type="submit"]').click();
  const argolaItem = page.locator('[data-cart-item][data-sku="122060"]');
  check(await argolaItem.count() === 1, 'item repetido não cria outra linha');
  check(await argolaItem.locator('[data-item-quantity]').textContent() === '1', 'item repetido não aumenta quantidade sozinho');
  check((await page.locator('[data-launch-toast]').textContent()).includes('já está na venda'), 'item repetido orienta usar o controle de quantidade');
  await argolaItem.locator('[data-edit-price]').click();
  check((await page.locator('[data-price-form]').textContent()).includes('Preço padrão'), 'modal usa preço padrão');
  await page.locator('[data-final-price]').fill('120');
  await page.locator('[data-price-reason]').fill('Grupo VIP');
  await page.locator('[data-price-form] button[type="submit"]').click();
  check((await textOf(argolaItem.locator('.price-note'))).includes('Desconto de R$ 30,00 por peça'), 'desconto aparece no item');
  check(await textOf(page.locator('[data-sale-discount]')) === 'R$ 30,00', 'desconto aparece no fechamento');

  await argolaItem.locator('[data-edit-price]').click();
  await page.locator('[data-final-price]').fill('180');
  await page.locator('[data-price-reason]').fill('Condição especial');
  await page.locator('[data-price-form] button[type="submit"]').click();
  check(await page.locator('[data-sale-adjustment-label]').textContent() === 'Acréscimo', 'preço maior usa acréscimo');
  check(await textOf(page.locator('[data-sale-discount]')) === 'R$ 30,00', 'acréscimo nunca aparece negativo');

  await page.locator('[data-open-step="customer"]').click();
  check(await page.locator('[data-flow-step="customer"] .flow-step-body').isVisible(), 'continuação abre cliente');
  const channels = await page.locator('[data-sale-channel] option').allTextContents();
  check(channels.join('|') === 'Balcão|WhatsApp|Instagram|Grupo VIP|Feira|Maleta|Outro', 'local ou canal usa opções reais do sistema');
  await page.locator('[data-sale-channel]').selectOption('Outro');
  check(await page.locator('[data-sale-channel-other]').isVisible(), 'outro canal permite informar o nome');
  await page.locator('[data-sale-channel]').selectOption('Grupo VIP');
  await page.locator('[data-customer-search]').fill('Camila Ferreira');
  await page.locator('[data-customer-search]').dispatchEvent('change');
  await page.locator('[data-open-step="payment"]').click();
  check(await page.locator('[data-payment-empty]').isVisible(), 'pagamento vazio mostra convite em vez de tabela');
  await page.locator('[data-add-payment]').click();
  check(await page.locator('[data-payment-table]').isVisible(), 'primeiro pagamento revela os campos');
  check(await page.locator('[data-add-payment]').textContent() === '+ Adicionar outro pagamento', 'pagamento misto usa adicionar outro pagamento');
  await page.locator('[data-payment-method]').selectOption('Cartão de crédito');
  check(await page.locator('[data-payment-installments]').count() === 0, 'parcelamento não aparece nesta versão');
  await page.locator('[data-payment-state]').selectOption('pending');
  check(await page.locator('[data-payment-due-input]').isVisible(), 'pendente abre vencimento');
  check(await page.locator('[data-finalize-sale]').isDisabled(), 'pendente sem vencimento bloqueia finalização');
  check((await page.locator('[data-payment-warning]').textContent()).includes('Defina o vencimento'), 'pendente sem vencimento explica bloqueio');
  await page.locator('[data-payment-due-input]').fill('2026-09-20');
  check(!(await page.locator('[data-finalize-sale]').isDisabled()), 'vencimento preenchido libera finalização');

  await page.locator('[data-finalize-sale]').click();
  const reviewDialog = page.locator('#finalize-sale-dialog');
  check(await reviewDialog.isVisible(), 'finalizar abre revisão completa');
  const reviewText = await textOf(reviewDialog);
  check(reviewText.includes('Camila Ferreira') && reviewText.includes('Grupo VIP'), 'revisão mostra cliente e canal');
  check(reviewText.includes('Argola Duas Linhas Cravejadas') && reviewText.includes('R$ 180,00'), 'revisão mostra peça e total');
  check(reviewText.includes('Aro 16') && reviewText.includes('Aro 18'), 'revisão mostra a variação exata de cada peça');
  check(reviewText.includes('Cartão de crédito') && reviewText.includes('20/09/2026'), 'revisão mostra pagamento e vencimento');
  check(reviewText.includes('Acréscimo') && !reviewText.includes('-R$'), 'revisão mostra acréscimo sem desconto negativo');
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile-review.png', fullPage: true });
  await reviewDialog.getByRole('button', { name: 'Voltar e revisar' }).click();

  const todayRows = page.locator('.today-sales .sale-row');
  await todayRows.nth(0).click();
  await todayRows.nth(1).click();
  check(await page.locator('.today-sales .sale-detail-row').count() === 2, 'duas vendas de hoje ficam abertas juntas');
  check(!(await page.locator('.today-sales').textContent()).includes('(19)'), 'vendas de hoje não mostram telefone');

  await todayRows.nth(1).locator('[data-open-client]').click();
  check(await page.locator('[data-clients-title]').textContent() === 'Camila Ferreira', 'clique abre a cliente específica');
  check(await page.locator('[data-client-profile]').isVisible() && await page.locator('.client-list').isHidden(), 'perfil mostra a cliente escolhida sem repetir a lista');

  await page.locator('[data-screen="lancamentos"]').click();
  await page.screenshot({ path: 'docs/ux/03-screens/vendas/launch-mobile.png', fullPage: true });
  console.log(`ok ${checks.length} verificações`);
} finally {
  await browser.close();
}
