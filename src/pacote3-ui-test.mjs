/** Pacote 3 — prova de navegador e evidência visual do Painel de Vendas. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PAINEL = process.env.PAINEL_URL || 'http://localhost:8000/dashboard.html';
const API = process.env.API_URL || 'http://127.0.0.1:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';
const DESTINO = process.argv[2] || 'docs/baselines/pacote3-2026-09-08';
fs.mkdirSync(DESTINO, { recursive: true });

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x !== '' ? `  → ${x}` : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? `  → ${x}` : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x, d = '') => (x ? ok(t, d) : bad(t, d));

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errosConsole = [];
page.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()); });
page.on('pageerror', (e) => errosConsole.push(`pageerror: ${e.message}`));
await page.addInitScript(({ url, key }) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
}, { url: API, key: KEY });
await page.goto(PAINEL);
await page.waitForFunction(() => state && Array.isArray(state.produtos));
await page.evaluate(() => switchTab('vendas-painel'));
await page.waitForFunction(() => painelVendas && !painelVendas.erro);

const esperarEstavel = async () => {
  await page.waitForTimeout(350);
  await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('show'), null,
    { timeout: 15000 });
  await page.waitForTimeout(500);
};
const semRolagemHorizontal = () => page.evaluate(() =>
  document.documentElement.scrollWidth <= innerWidth + 1);

console.log('\n=== 1. hierarquia e análise padrão ===');
const kpis = await page.locator('#view-vendas-painel > .panel:first-child .k-lbl').allTextContents();
eq('cinco KPIs no topo', kpis.length, 5);
eq('ordem dos KPIs', kpis.join('|'),
  'Faturamento do período|Faturamento do mês|Ticket médio|Peças vendidas|A receber deste mês');
eq('A receber do mês usa o vencimento',
  (await page.locator('#view-vendas-painel > .panel:first-child .kpi').last().locator('.k-num').innerText())
    .replace(/\s+/g, ' '), 'R$ 100');
eq('Análise detalhada abre selecionada',
  await page.getByRole('tab', { name: 'Análise detalhada' }).getAttribute('aria-selected'), 'true');
eq('quatro períodos ficam dentro do módulo',
  await page.locator('.modulo-analitico .periodo-analise button').count(), 4);
eq('as três leituras analíticas estão abertas', await page.locator('.analise-grade > .panel').count(), 3);
eq('sem roscas no módulo principal', await page.locator('.modulo-analitico [id^=rosca]').count(), 0);
verdade('total geral em aberto permanece legível',
  /Total em aberto.*R\$ 200/i.test((await page.locator('.receber-destaque').innerText())
    .replace(/\s+/g, ' ')));
const ordem = await page.evaluate(() => ({
  modulo: document.querySelector('.modulo-analitico')?.getBoundingClientRect().top,
  destaques: document.querySelector('#view-vendas-painel > .insights')?.getBoundingClientRect().top,
}));
verdade('cartões de curiosidade ficam abaixo do módulo', ordem.destaques > ordem.modulo,
  `${ordem.modulo} < ${ordem.destaques}`);
verdade('textos técnicos foram removidos da visão principal',
  !/Histórico da planilha \+ vendas do sistema|Como o ticket médio é calculado|mesmo número do cartão acima/i
    .test(await page.locator('#view-vendas-painel').innerText()));
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '01-analise-desktop.png'), fullPage: true });

console.log('\n=== 2. Evolução e seleção de mês são um único módulo ===');
await page.getByRole('tab', { name: 'Evolução mensal' }).click();
eq('Evolução fica selecionada',
  await page.getByRole('tab', { name: 'Evolução mensal' }).getAttribute('aria-selected'), 'true');
verdade('há barras mensais comparáveis', await page.locator('.modulo-analitico .evo-col').count() >= 3);
eq('há um único controle de métrica', await page.locator('.modulo-analitico .selmini').count(), 1);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '02-evolucao-desktop.png'), fullPage: true });

const barra = page.locator('.modulo-analitico .evo-col').last();
const mesEscolhido = await barra.getAttribute('data-mes');
await barra.click();
await page.waitForFunction(() => painelAnaliseVisao === 'analise' && resumoMes && !mesCarregando);
eq('clicar na barra abre Análise detalhada',
  await page.getByRole('tab', { name: 'Análise detalhada' }).getAttribute('aria-selected'), 'true');
eq('o mês escolhido governa a análise', await page.evaluate(() => mesAberto), mesEscolhido);
verdade('resumo mensal abriu integrado', await page.locator('.modulo-analitico .mes-box').count() === 1);
eq('fechar textual desalinhado saiu', await page.locator('.modulo-analitico .mes-cab .lnk').count(), 0);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '03-mes-selecionado-desktop.png'), fullPage: true });

await page.getByRole('tab', { name: 'Evolução mensal' }).click();
eq('a seleção permanece ao voltar à Evolução', await page.locator('.evo-col.aberta').count(), 1);
await page.locator('.modulo-analitico .periodo-analise button', { hasText: '30 dias' }).click();
await page.waitForFunction(() => painelPeriodo === '30d' && painelVendas?.periodo?.periodo === '30d');
eq('trocar período limpa somente a seleção mensal', await page.evaluate(() => mesAberto), null);
eq('a visão Evolução permanece coerente', await page.evaluate(() => painelAnaliseVisao), 'evolucao');
await page.getByRole('tab', { name: 'Análise detalhada' }).click();
eq('Análise usa o mesmo filtro de 30 dias',
  await page.locator('.modulo-analitico .periodo-analise button.on').innerText(), '30 dias');

console.log('\n=== 3. celular e console ===');
await page.setViewportSize({ width: 390, height: 844 });
eq('cinco KPIs continuam presentes no celular',
  await page.locator('#view-vendas-painel > .panel:first-child .kpi').count(), 5);
eq('A receber ocupa uma faixa legível no celular',
  await page.locator('#view-vendas-painel > .panel:first-child .kpi').last()
    .evaluate((e) => getComputedStyle(e).gridColumnEnd), '-1');
eq('Painel não cria rolagem horizontal', await semRolagemHorizontal(), true);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '04-analise-mobile.png'), fullPage: true });
await page.getByRole('tab', { name: 'Evolução mensal' }).click();
eq('Evolução móvel não cria rolagem na página', await semRolagemHorizontal(), true);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '05-evolucao-mobile.png'), fullPage: true });
eq('nenhum erro no navegador', errosConsole.length, 0);
if (errosConsole.length) errosConsole.slice(0, 8).forEach((e) => console.log(`    ${e}`));

await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : `\n✓ TUDO PASSOU · 5 capturas em ${DESTINO}`);
process.exit(falhas ? 1 : 0);
