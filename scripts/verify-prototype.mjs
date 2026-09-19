import { chromium } from '../src/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
const origin=process.env.PROTOTYPE_ORIGIN||'http://127.0.0.1:8878';
const manifest=JSON.parse(await fs.readFile('docs/ux/prototype/routes.json','utf8'));
const browser=await chromium.launch({headless:true});
let checks=0;const check=(ok,label)=>{if(!ok)throw Error(label);checks++;};
const links=new Set(),screens='.tmp/prototype-evidence';await fs.mkdir(screens,{recursive:true});
const selectors={home:'[data-home-view="today"]',vendas:'#painel',clientes:'[data-client-view="lista"]',financeiro:'[data-finance-view="receivable"]',estoque:'.stock-shell',catalogo:'.catalog-shell',revendedoras:'[data-view="overview"]',garantias:'.warranty-shell',etiquetas:'[data-label-view="prepare"]',nuvemshop:'[data-products]',agenda:'[data-home-view="calendar"]',notificacoes:'.notice-feed',configuracoes:'[data-settings-view="preferences"]',loja:'[data-cloud-view="overview"]',pendencias:'[data-cloud-view="pending"]',sincronizacao:'[data-cloud-view="analysis"]',hub:'#golden','design-system':'#fundacao'};
try{
 for(const width of [320,390,768,1024,1440]){
  for(const entry of manifest.pages){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],bad=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   page.on('request',r=>{const u=new URL(r.url());if(!['data:','blob:'].includes(u.protocol)&&(u.origin!==new URL(origin).origin||r.method()!=='GET'||/\/api\//.test(u.pathname)))bad.push(r.url());});
   page.on('response',r=>{if(r.status()>=400)bad.push(`${r.status()} ${r.url()}`);});
   await page.goto(origin+entry.path);await page.waitForSelector('html[data-demo-ready="true"]');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(80);
   check(await page.locator('.mq-rail__nav a[href]').count()===13,entry.id+' all modules in the rail '+width);
   check(await page.locator('.mq-topbar').first().isVisible(),entry.id+' app shell topbar '+width);
   if(width<=900)check(await page.locator('.mq-bottomnav a:visible').count()===4,entry.id+' phone navigation '+width);
   check(await page.getByRole('button',{name:'Mais',exact:true}).count()===0,entry.id+' no hidden menu');
   check(await page.locator('h1:visible').count()>=1,entry.id+' heading');
   if(selectors[entry.id])check(await page.locator(selectors[entry.id]).first().isVisible(),entry.id+' correct surface '+width);
   check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),entry.id+' overflow '+width);
   check(errors.length===0,entry.id+' errors '+errors.join(';'));check(bad.length===0,entry.id+' requests '+bad.join(';'));
   for(const href of await page.locator('a[href],[data-href]').evaluateAll(els=>els.map(e=>e.href||new URL(e.dataset.href,document.baseURI).href))){if(href.startsWith(origin))links.add(href);else check(!/^https?:/.test(href),'external destination '+href);}
   if(width===390||width===1440)await page.screenshot({path:`${screens}/${entry.id}-${width}.png`,fullPage:true});
   await page.close();
  }
 }
 const page=await browser.newPage();
 for(const href of links){const u=new URL(href);check(u.pathname.startsWith('/prototype/'),'link stays in prototype '+href);check(!/\.md$|127\.0\.0\.1:(?!8878)/.test(href),'private link '+href);const res=await page.request.get(href);check(res.ok(),'broken link '+href);}
 const flows={'nova-venda':'[data-launch-workspace]','colar':'[data-collar-workspace]','saida':'[data-output-history]','historico':'#painel','inventario':'[data-inventory-tab="open"]','maletas':'[data-view="profile"]','profile':'[data-settings-view="profile"]','connection':'[data-settings-view="connection"]'};
 for(const f of manifest.flows){const route=manifest.pages.find(p=>p.id===f.page).path;await page.goto(origin+route+'#'+f.hash);await page.waitForSelector('html[data-demo-ready="true"]');await page.waitForTimeout(80);check(await page.locator(flows[f.hash]).first().isVisible(),'flow '+f.hash);}
 for(const entry of manifest.pages.filter(p=>p.nav))for(const state of ['loading','empty','error','partial']){await page.goto(origin+entry.path+'?state='+state);await page.waitForSelector('.demo-scenario');check(await page.locator('.demo-scenario a').isVisible(),entry.id+' '+state+' recoverable');}
 await page.goto(origin+'/prototype/');await page.getByRole('link',{name:'Clientes',exact:true}).first().click();check(new URL(page.url()).pathname==='/prototype/clientes/','header navigation');await page.goBack();check(new URL(page.url()).pathname==='/prototype/','back');await page.goForward();check(new URL(page.url()).pathname==='/prototype/clientes/','forward');await page.reload();await page.waitForSelector('[data-client-view="lista"]:not([hidden])');check(true,'reload keeps Clientes');
 await page.close();
 await fs.writeFile(`${screens}/summary.json`,JSON.stringify({origin,checks,routes:manifest.pages.length,links:links.size,widths:[320,390,768,1024,1440],approval:manifest.approval},null,2));
 console.log(`PASS ${checks} checks; ${manifest.pages.length} routes; ${links.size} links; 5 widths; no operational requests.`);
}finally{await browser.close();}
