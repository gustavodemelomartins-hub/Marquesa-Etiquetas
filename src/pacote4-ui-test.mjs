/** Pacote 4 — prova visual e de interação da Central/Publicação. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PAINEL = process.env.PAINEL_URL || 'http://127.0.0.1:8000/dashboard.html';
const API = process.env.API_URL || 'http://127.0.0.1:8790';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';
const DESTINO = process.argv[2] || 'docs/baselines/pacote4-2026-09-08';
fs.mkdirSync(DESTINO, { recursive: true });

async function prepararCenario() {
  const api = async (metodo, rota, corpo, tipo = 'application/json') => fetch(API + rota, {
    method: metodo,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': tipo },
    body: tipo === 'application/json' ? JSON.stringify(corpo) : corpo,
  }).then((r) => r.json());
  await api('POST', '/api/produtos/importar', { produtos: [
    { sku: 'P4-FALTA', desc: 'Brinco Aurora', cat: 'Brinco', preco: null, qtd: 2 },
    { sku: 'P4-PRONTO', desc: 'Colar Horizonte', cat: 'Colar', preco: 159.9, qtd: 3 },
  ] });
  const imagem = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  await api('PUT', '/api/produtos/P4-PRONTO/foto/original', imagem, 'image/png');
  await api('PUT', '/api/produtos/P4-PRONTO/foto/tratada', imagem, 'image/png');
  await api('POST', '/api/catalogo/publicacao/P4-PRONTO/previa', {
    nomeSite: 'Colar Horizonte',
    descricaoSite: 'Colar Horizonte com acabamento delicado para compor produções do dia à noite.',
    seoTitulo: 'Colar Horizonte | Marquesa',
    seoDescricao: 'Conheça o Colar Horizonte da Marquesa e veja os detalhes desta peça.',
  });
}
await prepararCenario();

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x === '' ? '' : ` → ${x}`}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x === '' ? '' : ` → ${x}`}`); };
const eq = (t, a, b) => String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}; veio ${a}`);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const erros = [];
page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('dialog', (d) => d.accept());
await page.addInitScript(({ url, key }) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
}, { url: API, key: KEY });
await page.goto(PAINEL);
await page.waitForFunction(() => typeof state === 'object' && Array.isArray(state.produtos));

const semHorizontal = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const esperarEstavel = async () => {
  await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('show'), null,
    { timeout: 15000 });
  await page.waitForTimeout(350);
};

console.log('\n=== 1. publicação é área principal e mostra o funil ===');
const nav = await page.locator('#tabsSubNav').innerText();
eq('Publicar na Nuvemshop está na primeira linha', /Publicar na Nuvemshop/.test(nav), true);
eq('Central está na primeira linha', /Central/.test(nav), true);
await page.evaluate(() => switchTab('publicar'));
await page.waitForFunction(() => publicacao && Array.isArray(publicacao.itens));
eq('cinco etapas visíveis', await page.locator('.pub-etapa').count(), 5);
eq('escrita externa é anunciada como bloqueada', /Nenhuma escrita automática na loja/.test(await page.locator('#view-pendencias').innerText()), true);
eq('sem preço não está aguardando aprovação', await page.evaluate(() => {
  const x = publicacao.itens.find((p) => p.sku === 'P4-FALTA');
  return x && x.estado !== 'aguardando_aprovacao';
}), true);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '01-publicacao-desktop.png'), fullPage: true });

console.log('\n=== 2. prévia e aprovação não publicam ===');
await page.evaluate(() => setFiltroEstadoPub('aguardando_aprovacao'));
await page.waitForSelector('.pub-card');
const card = page.locator('.pub-card').filter({ hasText: 'P4-PRONTO' }).first();
eq('rascunho está disponível para revisar', /Ver prévia/.test(await card.innerText()), true);
await card.getByRole('button', { name: 'Aprovar prévia' }).click();
await page.waitForFunction(() => filtroEstadoPub === 'aprovado_para_publicar');
await page.waitForSelector('.pub-card[data-estado="aprovado_para_publicar"]');
const aprovado = await page.locator('.pub-card[data-estado="aprovado_para_publicar"]').first().innerText();
eq('gate humano fica registrado', /Aprovação humana registrada/.test(aprovado), true);
eq('não existe botão externo de publicar', await page.getByRole('button', { name: /^Publicar$/ }).count(), 0);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '02-aprovado-bloqueado-desktop.png'), fullPage: true });

console.log('\n=== 3. Central unificada explica e resolve na linha ===');
await page.evaluate(() => switchTab('central'));
await page.waitForFunction(() => centralPend && Array.isArray(centralPend.pendencias));
const centralTxt = await page.locator('#view-pendencias').innerText();
eq('uma única Central, sem subtela Variações', /Central de pendências/.test(centralTxt), true);
eq('linha informa Falta', /Falta/.test(centralTxt), true);
eq('linha informa Efeito', /Efeito/i.test(centralTxt), true);
eq('há ação de resolução', /Completar dados|Resolver|Preparar com agente/.test(centralTxt), true);
eq('Revisar depois continua disponível', /Revisar depois/.test(centralTxt), true);
eq('sem rolagem horizontal no desktop', await semHorizontal(), true);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '03-central-desktop.png'), fullPage: true });

console.log('\n=== 4. mobile mantém hierarquia e largura ===');
await page.setViewportSize({ width: 393, height: 852 });
await page.evaluate(() => switchTab('publicar'));
await page.waitForTimeout(500);
eq('funil não estoura no mobile', await semHorizontal(), true);
eq('cards continuam legíveis', await page.locator('.pub-card').count() >= 1, true);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '04-publicacao-mobile.png'), fullPage: true });
await page.evaluate(() => switchTab('central'));
await page.waitForTimeout(500);
eq('Central não estoura no mobile', await semHorizontal(), true);
await esperarEstavel();
await page.screenshot({ path: path.join(DESTINO, '05-central-mobile.png'), fullPage: true });

eq('nenhum erro de página/console', erros.length ? erros.join(' | ') : 0, 0);
await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ PACOTE 4 UI PASSOU');
process.exit(falhas ? 1 : 0);
