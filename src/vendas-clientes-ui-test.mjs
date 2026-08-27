/** Painel de Vendas e área de Clientes, num navegador de verdade.
 *
 *  O que precisa ficar provado aqui:
 *
 *   1. as três sub-abas de Vendas existem e navegam — Lançamentos, Painel,
 *      Clientes;
 *   2. o painel mostra os KPIs com os números que a API devolve;
 *   3. o painel NÃO mostra ticket médio histórico, e diz por quê;
 *   4. Clientes usa os MESMOS componentes de Revendedoras (`.revgrid`,
 *      `.revcard`, `.rc-nm`, `.rc-row`, `.badge`) — é o critério de
 *      consistência visual, e ele é verificável, não opinião;
 *   5. o modal de cliente tem a mesma estrutura do de revendedora
 *      (`.overlay.center` → `.modal` → `.mhead`/`.mbody`/`.mfoot`, `.field`);
 *   6. o perfil de uma cliente abre com resumo e histórico;
 *   7. o celular (390px) não gera rolagem horizontal em nenhuma das telas;
 *   8. nenhum erro de console em nenhuma delas.
 */
import { chromium } from 'playwright';

const PAINEL = 'http://localhost:8000/dashboard.html';
const API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

/* Mesma convenção do e2e.mjs e do fase2-telas-test.mjs: `PW_CHROMIUM` aponta
   para um Chromium já instalado, quando o do Playwright não está lá. */
const nav = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
const pg = await ctx.newPage();

const errosConsole = [];
pg.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()); });
pg.on('pageerror', (e) => errosConsole.push(String(e)));

/* conecta pelo formulário de verdade, como o e2e faz — é o caminho que a
   Sthefany percorre, e não depende de saber onde a chave é guardada */
await pg.goto(PAINEL, { waitUntil: 'networkidle' });
await pg.waitForTimeout(700);
await pg.fill('#cf-url', API);
await pg.fill('#cf-key', KEY);
await pg.click('#conexaoOverlay .btn-gold');
await pg.waitForTimeout(1800);
eq('conectou', await pg.locator('#conexaoOverlay').evaluate((e) => e.classList.contains('show')), 'false');

/* ═══════════════════════════════════════════════════════════ 1. navegação */

console.log('\n=== 1. Vendas tem três sub-abas ===');

await pg.evaluate(() => switchTab('vendas'));
await pg.waitForTimeout(700);

const subAbas = await pg.$$eval('#tabsSubNav .tab', (n) => n.map((x) => x.textContent.trim()));
eq('três sub-abas em Vendas', subAbas.length >= 3, 'true');
ok('são elas', subAbas.join(' · '));
eq('tem Lançamentos', subAbas.some((t) => /Lançamentos/.test(t)), 'true');
eq('tem Painel', subAbas.some((t) => /Painel/.test(t)), 'true');
eq('tem Clientes', subAbas.some((t) => /Clientes/.test(t)), 'true');

/* ══════════════════════════════════════════════════════════════ 2. painel */

console.log('\n=== 2. o Painel mostra os números ===');

await pg.evaluate(() => switchTab('vendas-painel'));
await pg.waitForTimeout(2500);

const painelVisivel = await pg.$eval('#view-vendas-painel', (e) => e.classList.contains('active'));
eq('a view do painel está ativa', painelVisivel, 'true');

const kpis = await pg.$$eval('#view-vendas-painel .kpi', (n) => n.map((x) => ({
  rot: (x.querySelector('.k-lbl') || {}).textContent || '',
  num: (x.querySelector('.k-num') || {}).textContent || '',
})));
eq('quatro KPIs no topo', kpis.length, 4);
for (const k of kpis) ok(`KPI ${k.rot.trim()}`, k.num.trim());

const api = (p) => fetch(API + p, { headers: { Authorization: 'Bearer ' + KEY } }).then((r) => r.json());
const g = await api('/api/analytics/vendas?periodo=tudo');
const kpiFat = kpis.find((k) => /Faturamento/i.test(k.rot));
eq('o faturamento da tela é o da API',
  kpiFat.num.replace(/[^\d,]/g, ''),
  g.faturamento.toFixed(2).replace('.', ','));

console.log('\n=== 3. o painel NÃO inventa ticket médio histórico ===');
const textoPainel = await pg.$eval('#view-vendas-painel', (e) => e.textContent);
eq('avisa que o ticket médio do histórico é indisponível',
  /indispon[íi]vel de prop[óo]sito/i.test(textoPainel), 'true');
eq('e explica o motivo (linhas, não pedidos)',
  /identifica LINHAS|linhas, n[ãa]o pedidos/i.test(textoPainel), 'true');

console.log('\n=== 3b. os blocos de inteligência aparecem ===');
const titulos = await pg.$$eval('#view-vendas-painel .panel .head h2', (n) => n.map((x) => x.textContent.trim()));
for (const t of ['Produtos mais vendidos', 'Categorias', 'De onde vieram as vendas', 'Clientes que mais compraram']) {
  eq(`bloco "${t}"`, titulos.includes(t), 'true');
}

/* ════════════════════════════════════════════════ 4. Clientes = Revendedoras */

console.log('\n=== 4. Clientes usa os componentes de Revendedoras ===');

/* primeiro o que Revendedoras usa, lido da própria tela */
await pg.evaluate(() => switchTab('revlist'));
await pg.waitForTimeout(600);
const revTemGrid = await pg.$$eval('#view-revlist .revgrid', (n) => n.length);

await pg.evaluate(() => switchTab('clientes'));
await pg.waitForTimeout(2000);

const cliVisivel = await pg.$eval('#view-clientes', (e) => e.classList.contains('active'));
eq('a view de clientes está ativa', cliVisivel, 'true');

const grid = await pg.$$eval('#view-clientes .revgrid', (n) => n.length);
eq('usa a MESMA .revgrid de revendedoras', grid > 0, 'true');

const cards = await pg.$$eval('#view-clientes .revcard', (n) => n.length);
eq('e os MESMOS .revcard', cards > 0, 'true');
ok('clientes na tela', String(cards));

const partes = await pg.$eval('#view-clientes .revcard', (c) => ({
  nome: !!c.querySelector('.rc-nm'),
  meta: !!c.querySelector('.rc-meta'),
  linha: !!c.querySelector('.rc-row'),
  stat: !!c.querySelector('.rc-st'),
  selo: !!c.querySelector('.badge'),
}));
for (const [k, v] of Object.entries(partes)) eq(`o card tem .${k === 'selo' ? 'badge' : 'rc-' + k.slice(0, 4)}`, v, 'true');

/* o teste real de consistência: o estilo computado dos dois cards bate */
const estilos = await pg.evaluate(() => {
  const pega = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return { radius: s.borderRadius, border: s.borderTopWidth, padding: s.padding, bg: s.backgroundColor };
  };
  const c = document.querySelector('#view-clientes .revcard');
  const tmp = document.createElement('div');
  tmp.className = 'revcard';
  document.querySelector('#view-clientes').appendChild(tmp);
  const r = pega(tmp);
  tmp.remove();
  return { cliente: pega(c), referencia: r };
});
eq('mesmo raio de borda que o card de referência',
  estilos.cliente.radius, estilos.referencia.radius);
eq('mesma borda', estilos.cliente.border, estilos.referencia.border);
eq('mesmo fundo', estilos.cliente.bg, estilos.referencia.bg);

/* ═══════════════════════════════════════════════════════ 5. modal igual */

console.log('\n=== 5. o modal de cliente espelha o de revendedora ===');

const estrutura = async (sel) => pg.evaluate((s) => {
  const o = document.querySelector(s);
  if (!o) return null;
  return {
    overlayCenter: o.classList.contains('overlay') && o.classList.contains('center'),
    modal: !!o.querySelector('.modal'),
    largura: (o.querySelector('.modal') || {}).style?.width || '',
    mhead: !!o.querySelector('.mhead'),
    mbody: !!o.querySelector('.mbody'),
    mfoot: !!o.querySelector('.mfoot'),
    campos: o.querySelectorAll('.field').length,
    duas: o.querySelectorAll('.two').length,
    botoes: [...o.querySelectorAll('.mfoot .btn')].map((b) => b.className),
  };
}, sel);

const rev = await estrutura('#revOverlay');
const cli = await estrutura('#cliOverlay');

eq('overlay center', cli.overlayCenter, rev.overlayCenter);
eq('mesma largura do modal', cli.largura, rev.largura);
eq('tem .mhead', cli.mhead, rev.mhead);
eq('tem .mbody', cli.mbody, rev.mbody);
eq('tem .mfoot', cli.mfoot, rev.mfoot);
eq('usa .field', cli.campos > 0, 'true');
eq('usa .two para duas colunas', cli.duas > 0, 'true');
eq('mesmos botões no rodapé', JSON.stringify(cli.botoes), JSON.stringify(rev.botoes));

await pg.evaluate(() => openCliForm());
await pg.waitForTimeout(400);
eq('o modal abre', await pg.$eval('#cliOverlay', (e) => e.classList.contains('show')), 'true');
/* `clf-` e não `cf-`: o prefixo `cf-` já é do formulário de CONEXÃO
   (`cf-url`, `cf-key`, `cf-fb`), e dois formulários disputando o mesmo
   prefixo é colisão de id esperando acontecer. */
eq('e o foco vai para o nome', await pg.evaluate(() => document.activeElement.id), 'clf-nome');
await pg.evaluate(() => closeCliForm());
await pg.waitForTimeout(300);

/* ══════════════════════════════════════════════════════════ 6. perfil */

console.log('\n=== 6. o perfil de uma cliente abre ===');

const primeiro = await pg.$eval('#view-clientes .revcard .rc-nm', (e) => e.textContent.trim());
await pg.click('#view-clientes .revcard');
await pg.waitForTimeout(2000);

const perfilAtivo = await pg.$eval('#view-cliente', (e) => e.classList.contains('active'));
eq('a view do perfil está ativa', perfilAtivo, 'true');
const tituloPerfil = await pg.$eval('#view-cliente .head h2', (e) => e.textContent.trim());
eq('mostra a cliente que foi clicada', tituloPerfil.toLowerCase(), primeiro.toLowerCase());

const kpisPerfil = await pg.$$eval('#view-cliente .kpi', (n) => n.length);
eq('quatro KPIs no perfil', kpisPerfil, 4);

const textoPerfil = await pg.$eval('#view-cliente', (e) => e.textContent);
eq('tem histórico de compras', /Hist[óo]rico de compras/.test(textoPerfil), 'true');

/* ═════════════════════════════════════════════════════════ 7. celular */

console.log('\n=== 7. celular (390px): nenhuma rolagem horizontal ===');

await pg.setViewportSize({ width: 390, height: 844 });
for (const [aba, rot] of [['vendas-painel', 'Painel'], ['clientes', 'Clientes']]) {
  await pg.evaluate((a) => switchTab(a), aba);
  await pg.waitForTimeout(1600);
  const estoura = await pg.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  eq(`${rot} cabe na largura do celular`, estoura, 'false');
}

/* o modal também precisa caber */
await pg.evaluate(() => openCliForm());
await pg.waitForTimeout(400);
const modalCabe = await pg.evaluate(() => {
  const m = document.querySelector('#cliOverlay .modal');
  return m.getBoundingClientRect().width <= window.innerWidth;
});
eq('o modal de cliente cabe no celular', modalCabe, 'true');
await pg.evaluate(() => closeCliForm());

/* ═══════════════════════════════════════════════════════════ 8. console */

console.log('\n=== 8. nenhum erro de console ===');
/* favicon e afins não contam: não são erro de produto */
const reais = errosConsole.filter((e) => !/favicon|manifest|sw\.js/i.test(e));
eq('console limpo', reais.length, 0);
if (reais.length) reais.slice(0, 6).forEach((e) => console.log('     ' + e));

await nav.close();
console.log(`\n${falhas ? '✗ ' + falhas + ' FALHA(S)' : '✓ TUDO PASSOU'}`);
process.exit(falhas ? 1 : 0);
