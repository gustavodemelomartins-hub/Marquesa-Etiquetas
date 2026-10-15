import { chromium } from '../../../src/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const base='http://127.0.0.1:8766/docs/ux/';
let checks=0;const check=(value,message)=>{if(!value)throw new Error(message);checks++};
const moneyText=async locator=>(await locator.textContent()).replace(/\s/g,' ');
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
const modules=['dashboard','vendas','estoque','catalogo','revendedoras','financeiro','reparos','etiquetas','nuvemshop','notificacoes','configuracoes'];
await mkdir('.tmp/closure',{recursive:true});
try{
 const links=new Set();
 for(const width of [390,1440])for(const mod of modules){
  const page=await browser.newPage({viewport:{width,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'03-screens/'+mod+'/master.html');
  check(await page.locator('.v2-header-main').isVisible(),mod+' shared header '+width);
  await page.locator('[data-v2-menu]:visible').click();
  check(await page.locator('.v2-menu a').count()===20,mod+' menu complete '+width);
  for(const href of await page.locator('a[href]').evaluateAll(els=>els.map(el=>el.href)))if(href.startsWith(base))links.add(href.split('#')[0]);
  await page.keyboard.press('Escape');check(await page.locator('.v2-menu').isHidden(),mod+' Escape menu');
  check(!await overflow(page),mod+' overflow '+width);check(errors.length===0,mod+' JS '+errors);
  await page.screenshot({path:'.tmp/closure/'+mod+'-'+width+'.png',fullPage:true});await page.close();
 }
 const audit=await browser.newPage();
 for(const link of links){const response=await audit.request.get(link);check(response.ok(),'broken link '+link)}
 for(const [route,selector] of [['vendas/master.html#clientes','[data-clients-title]'],['vendas/master.html#painel','#painel'],['vendas/master.html#colar','[data-collar-workspace]'],['vendas/master.html#saida','[data-output-history]'],['estoque/master.html#inventario','[data-inventory-tab="open"]'],['dashboard/master.html#calendar','[data-home-view="calendar"]'],['configuracoes/master.html#preferences','[data-settings-view="preferences"]'],['nuvemshop/master.html#pending','[data-cloud-view="pending"]']]){
  await audit.goto(base+'03-screens/'+route);check(await audit.locator(selector).isVisible(),'deep link '+route);
 }
 await audit.close();
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:960}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')requests.push(r.url())});
  await page.goto(base+'03-screens/nuvemshop/publicar.html');check(await page.locator('.publication-row').count()===5,'five initial products');
  await page.locator('[data-search]').fill('191620');check(await page.locator('.publication-row').count()===1,'SKU search');
  await page.locator('[data-search]').fill('nothing');check(await page.locator('[data-empty]').isVisible(),'empty search');await page.locator('[data-reset]').click();
  await page.locator('[data-action="132721"]').click();check(await page.locator('[data-progress]').isVisible(),'prepare action');
  await page.locator('[data-ready]').click();check((await page.locator('[data-sku="132721"] .publication-status').textContent())==='Aguardando aprovação','preparation does not publish');
  await page.locator('[data-action="191620"]').click();
  await page.locator('[name="title"]').fill('Brinco revisado <exemplo>');
  await page.locator('[data-review-tab="photos"]').click();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  await page.locator('[data-upload]').setInputFiles([{name:'frente.png',mimeType:'image/png',buffer:png},{name:'verso.png',mimeType:'image/png',buffer:png}]);
  check(await page.locator('.photo-card').count()===3,'multiple upload');
  await page.locator('[data-photo-action="principal"][data-index="2"]').click();check((await page.locator('.photo-card').first().textContent()).includes('verso.png'),'principal');
  await page.locator('[data-photo-action="down"][data-index="0"]').click();check(!(await page.locator('.photo-card').first().textContent()).includes('verso.png'),'reorder');
  await page.locator('[data-review-tab="preview"]').click();check((await page.locator('[data-preview] h3').textContent())==='Brinco revisado <exemplo>','escaped edited preview');
  check(!await overflow(page),'review overflow '+width);
  await page.locator('[data-review-tab="content"]').click();
  if(width===390||width===1440)await page.screenshot({path:'.tmp/closure/review-'+width+'.png'});
  await page.locator('[data-approve]').click();check(await page.locator('[data-review]').isHidden(),'single approval closes review');
  check((await page.locator('[data-sku="191620"] .publication-status').textContent())==='Publicando','automatic publication begins');
  await page.locator('[data-sku="191620"] .publication-status').filter({hasText:'Publicado'}).waitFor();
  await page.locator('[data-action="220018"]').click();check((await page.locator('[data-sku="220018"] .publication-status').textContent())==='Publicando','failure retries without reapproval');
  await page.locator('[data-sku="220018"] .publication-status').filter({hasText:'Publicado'}).waitFor();
  await page.locator('[data-action="191620"]').click();check(await page.locator('[data-review-panel="preview"]').isVisible(),'published preview');
  await page.locator('[data-close]').click();check(!await overflow(page),'list overflow '+width);check(errors.length===0,'publication JS '+errors);check(!requests.length,'no backend writes');
  if(width===390||width===1440)await page.screenshot({path:'.tmp/closure/publication-'+width+'.png',fullPage:true});await page.close();
 }
 const page=await browser.newPage();await page.goto(base+'03-screens/vendas/master.html#nova-venda');
 await page.locator('[data-product-search]').fill('122060');await page.locator('[data-product-sku="122060"]').click();await page.locator('[data-open-step="customer"]').click();await page.locator('[data-sale-date]').fill('2026-09-10');
 await page.locator('[data-open-step="payment"]').click();await page.locator('[data-add-payment]').click();await page.locator('[data-payment-date]').fill('2026-09-12');await page.locator('[data-finalize-sale]').click();
 check((await page.locator('[data-review-date]').textContent())==='10/09/2026','sale date preserved');check((await page.locator('[data-review-payments-list]').textContent()).includes('12/09/2026'),'actual payment date separate');
 await page.getByRole('button',{name:'Voltar e revisar',exact:true}).click();await page.locator('[data-payment-date]').fill('');check(await page.locator('[data-finalize-sale]').isDisabled(),'missing payment date blocks');await page.locator('[data-payment-date]').fill('2099-12-31');check(await page.locator('[data-finalize-sale]').isDisabled(),'future payment blocks');
 await page.goto(base+'03-screens/financeiro/master.html?cliente=ana');await page.locator('[data-new-receipt]').click();await page.locator('[data-receipt-value]').fill('40');await page.locator('[data-receipt-date]').fill('2026-09-12');await page.locator('[data-save-receipt]').click();
 check((await moneyText(page.locator('[data-detail-open]')))==='R$ 200,00','partial receipt preserves remaining balance');check((await page.locator('[data-detail-client]').textContent()).includes('Ana'),'receipt targets selected account');check((await moneyText(page.locator('[data-account="camila"]'))).includes('R$ 159,00'),'other client unchanged');
 await page.locator('[data-new-receipt]').click();await page.locator('[data-receipt-value]').fill('999');await page.locator('[data-save-receipt]').click();check(await page.locator('[data-receipt-dialog]').isVisible(),'overpayment blocked');await page.keyboard.press('Escape');
 await page.goto(base+'03-screens/vendas/master.html#clientes');await page.locator('[data-client-row="Juliana Prado"]').click();check(!(await page.locator('.client-timeline').textContent()).includes('#1058'),'no other client history');check(await page.locator('[data-register-receipt]').isDisabled(),'no balance no receipt');
 await page.close();console.log(checks+' verificações de fechamento global aprovadas');
}finally{await browser.close()}
