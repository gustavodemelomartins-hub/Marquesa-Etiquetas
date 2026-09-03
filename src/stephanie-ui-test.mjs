/** Prova visual/funcional das alterações pedidas pela Stephanie.
 *
 * Pré-condição: Worker local sobre a cópia reconciliada e dashboard.html
 * servido em localhost:8000. O banco é descartável.
 */
import { chromium } from 'playwright';

const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const textoPlano = (s) => String(s || '').replace(/\s+/g, ' ');

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const erros = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) erros.push(m.text());
});
page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());

try {
  console.log('\n=== 1. conecta ao painel local ===');
  await page.goto(URL_APP);
  await page.fill('#cf-url', URL_API);
  await page.fill('#cf-key', KEY);
  await page.click('#conexaoOverlay .btn-gold');
  await page.waitForFunction(() => !document.querySelector('#conexaoOverlay')?.classList.contains('show'));
  eq('painel conectado', await page.locator('#conexaoOverlay').evaluate((e) => e.classList.contains('show')), false);

  console.log('\n=== 2. Painel de Vendas e A receber ===');
  await page.evaluate(() => switchTab('vendas-painel'));
  await page.waitForFunction(() => document.querySelectorAll('#view-vendas-painel .kpi').length === 4);
  const rotulos = await page.locator('#view-vendas-painel .k-lbl').allTextContents();
  eq('quatro indicadores certos', JSON.stringify(rotulos),
    JSON.stringify(['Faturamento', 'Faturamento do mês', 'Ticket médio', 'Peças vendidas']));
  eq('card antigo Vendas saiu', rotulos.includes('Vendas'), false);
  eq('há nove compras a receber', await page.locator('#view-vendas-painel .receber-linha').count(), 9);
  const receberTexto = textoPlano(await page.locator('#view-vendas-painel').innerText());
  eq('total aberto aparece', receberTexto.includes('R$ 1.525,49'), true);
  eq('prazo ausente não é inventado', receberTexto.includes('Sem prazo definido'), true);

  console.log('\n=== 3. perfil mostra valor, origem, desconto e NÃO PAGO ===');
  await page.getByRole('button', { name: 'Simone Teixeira', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('#view-cliente')?.classList.contains('active')
    && document.querySelectorAll('#view-cliente .nao-pago').length === 2);
  eq('duas compras de Simone estão abertas', await page.locator('#view-cliente .nao-pago').count(), 2);
  const perfilTexto = textoPlano(await page.locator('#view-cliente').innerText());
  eq('compra normal mostra R$ 149', perfilTexto.includes('R$ 149'), true);
  eq('compra com desconto mostra o abatimento', perfilTexto.includes('R$ 142,41'), true);
  eq('motivo do desconto aparece', perfilTexto.includes('Desconto Aniversário Marquesa'), true);
  eq('origem aparece', /Maleta|Grupo VIP|Feira|Site/.test(perfilTexto), true);

  await page.locator('#view-cliente .nao-pago').first().click();
  await page.waitForFunction(() => document.querySelectorAll('#view-cliente .nao-pago').length === 1);
  eq('clique confirmado quita só uma compra', await page.locator('#view-cliente .nao-pago').count(), 1);
  eq('selo PAGO aparece', (await page.locator('#view-cliente').innerText()).includes('PAGO em'), true);

  console.log('\n=== 4. acertos ficam em Revendedoras com comissão exata ===');
  await page.evaluate(() => switchTab('revgeral'));
  await page.waitForFunction(() => document.querySelector('#view-revgeral')?.innerText.includes('Acertos de maleta'));
  const revGeral = textoPlano(await page.locator('#view-revgeral').innerText());
  eq('bloco de acertos está na Visão Geral', revGeral.includes('Acertos de maleta'), true);
  eq('comissão total exata aparece', revGeral.includes('R$ 1.910,65'), true);
  eq('Evelyn aparece no acerto', revGeral.includes('Evelyn Veiga'), true);
  eq('Andréia não aparece mais com comissão zero', /Andreia Souza[\s\S]*R\$ 0,00/.test(revGeral), false);
  eq('rótulo de comissão estimada foi removido', revGeral.includes('Comissão estimada'), false);

  console.log('\n=== 5. inativas podem voltar e somem do fluxo enquanto arquivadas ===');
  await page.evaluate(() => switchTab('revlist'));
  await page.waitForSelector('#view-revlist.active');
  const jessicaId = await page.evaluate(() => state.revendedoras.find((r) => r.nome === 'Jessica da Silva Melim')?.id);
  eq('Jéssica existe no cadastro', !!jessicaId, true);
  eq('duas revendedoras inativas listadas', await page.locator('#view-revlist .gtab.inativas .gt-r').count(), 2);
  const abasAntes = await page.locator('#tabsSubNav').innerText();
  eq('Jéssica inativa não aparece na barra', abasAntes.includes('Jessica'), false);
  eq('Andréia inativa não aparece na barra', abasAntes.includes('Andreia'), false);
  eq('cada inativa tem botão para ativar',
    await page.getByRole('button', { name: 'Ativar revendedora', exact: true }).count(), 2);

  await page.evaluate((id) => reativarRevendedora(id), jessicaId);
  await page.waitForFunction((id) => state.revendedoras.find((r) => r.id === id)?.status === 'ativa', jessicaId);
  eq('botão reativa Jéssica', await page.evaluate((id) => state.revendedoras.find((r) => r.id === id)?.status, jessicaId), 'ativa');
  eq('reativada volta para a barra', (await page.locator('#tabsSubNav').innerText()).includes('Jessica'), true);

  await page.evaluate((id) => switchTab('rev:' + id), jessicaId);
  await page.getByRole('button', { name: 'Desativar revendedora', exact: true }).click();
  await page.waitForFunction((id) => state.revendedoras.find((r) => r.id === id)?.status === 'inativa', jessicaId);
  eq('botão desativa novamente sem apagar histórico',
    await page.evaluate((id) => state.revendedoras.find((r) => r.id === id)?.status, jessicaId), 'inativa');
  eq('histórico documental continua no painel',
    await page.evaluate(() => acertosRevendedoras.revendedoras.some((r) => r.nome === 'Jessica da Silva Melim' && r.acertos === 2)), true);

  eq('nenhum erro no console', erros.length, 0);
} finally {
  await browser.close();
}

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — telas e ações principais funcionam no navegador real.');
