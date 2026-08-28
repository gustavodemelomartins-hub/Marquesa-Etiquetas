/** Painel de Vendas e área de Clientes, num navegador de verdade.
 *
 *  O que precisa ficar provado aqui:
 *
 *   1. as três sub-abas de Vendas existem e navegam — Lançamentos, Painel,
 *      Clientes — e o cabeçalho real do sistema continua de pé;
 *   2. o painel mostra os cinco indicadores com os números que a API devolve;
 *   3. o ticket médio EXISTE e a tela explica a regra dele. (Este teste dizia
 *      o contrário até 2026-08-27, quando a planilha não tinha pedido. A
 *      regra de agrupamento passou a existir e a asserção virou o oposto.)
 *   4. os blocos do painel aparecem: categoria, evolução, produtos com foto,
 *      origem, top clientes, insights;
 *   5. a rosca de categoria mostra CATEGORIA, nunca material — `Banhada`,
 *      `Bruto` e `Prata 925` não podem aparecer como fatia;
 *   6. Clientes tem o dashboard E a operação: os indicadores, a saúde da
 *      base, a reativação, e a lista com os MESMOS componentes de
 *      Revendedoras (`.revgrid`, `.revcard`, `.rc-nm`, `.badge`);
 *   7. o modal de cliente espelha o de revendedora;
 *   8. o perfil abre com resumo, preferências e a linha do tempo — e a venda
 *      de 36 peças aparece como UMA compra, não como 36;
 *   9. os filtros de período e as pílulas de status funcionam;
 *  10. o celular (390px) não gera rolagem horizontal em nenhuma das telas;
 *  11. nenhum erro de console em nenhuma delas.
 *
 *  Aponta para onde mandarem, então serve tanto para o local quanto para o
 *  DEV publicado (§41):
 *      PAINEL_URL=https://marquesa-dev.pages.dev/dashboard.html \
 *      API_URL=https://marquesa-api-staging.marquesaasemijoias.workers.dev \
 *      API_KEY=<a chave do staging> node src/vendas-clientes-ui-test.mjs
 */
import { chromium } from 'playwright';

const PAINEL = process.env.PAINEL_URL || 'http://localhost:8000/dashboard.html';
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

console.log(`painel: ${PAINEL}\napi:    ${API}\n`);

const nav = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
const pg = await ctx.newPage();

const errosConsole = [];
pg.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()); });
pg.on('pageerror', (e) => errosConsole.push(String(e)));

/* conecta pelo formulário de verdade — é o caminho que a Sthefany percorre */
await pg.goto(PAINEL, { waitUntil: 'networkidle' });
await pg.waitForTimeout(700);
await pg.fill('#cf-url', API);
await pg.fill('#cf-key', KEY);
await pg.click('#conexaoOverlay .btn-gold');
await pg.waitForTimeout(2500);
eq('conectou', await pg.locator('#conexaoOverlay').evaluate((e) => e.classList.contains('show')), 'false');

const api = (p) => fetch(API + p, { headers: { Authorization: 'Bearer ' + KEY } }).then((r) => r.json());

/* ═══════════════════════════════════ 1. cabeçalho e navegação preservados */

console.log('\n=== 1. o cabeçalho real do sistema continua de pé ===');

const abasTopo = await pg.$$eval('#tabsNav .tab', (n) => n.map((x) => x.textContent.trim()));
for (const t of ['Estoque', 'Revendedoras', 'Vendas', 'Etiquetas']) {
  eq(`navegação global tem ${t}`, abasTopo.some((x) => x.includes(t)), 'true');
}
eq('a logo da marca está lá', await pg.$$eval('.brand .logo', (n) => n.length > 0), 'true');
eq('Ajustes continua no cabeçalho',
  await pg.$$eval('header.top', (n) => /Ajustes/i.test(n[0].textContent)), 'true');

await pg.evaluate(() => switchTab('vendas'));
await pg.waitForTimeout(800);
const subAbas = await pg.$$eval('#tabsSubNav .tab', (n) => n.map((x) => x.textContent.trim()));
eq('três sub-abas em Vendas', subAbas.length >= 3, 'true');
for (const t of ['Lançamentos', 'Painel', 'Clientes']) {
  eq(`sub-aba ${t}`, subAbas.some((x) => x.includes(t)), 'true');
}

/* ══════════════════════════════════════════════════════════════ 2. painel */

console.log('\n=== 2. o Painel mostra os cinco indicadores ===');

await pg.evaluate(() => switchTab('vendas-painel'));
await pg.waitForTimeout(3000);
eq('a view do painel está ativa',
  await pg.$eval('#view-vendas-painel', (e) => e.classList.contains('active')), 'true');

const kpis = await pg.$$eval('#view-vendas-painel .panel:first-of-type .kpi', (n) => n.map((x) => ({
  rot: (x.querySelector('.k-lbl') || {}).textContent || '',
  num: (x.querySelector('.k-num') || {}).textContent || '',
})));
eq('cinco indicadores no topo', kpis.length, 5);
for (const k of kpis) ok(`indicador ${k.rot.trim()}`, k.num.trim());
for (const r of ['Faturamento', 'Vendas', 'Peças vendidas', 'Clientes', 'Ticket médio']) {
  eq(`existe o indicador "${r}"`, kpis.some((k) => k.rot.trim() === r), 'true');
}

const g = await api('/api/analytics/vendas?periodo=tudo');
const num = (s) => Number(String(s).replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.'));
eq('o faturamento da tela é o da API',
  num(kpis.find((k) => /Faturamento/i.test(k.rot)).num).toFixed(2), g.faturamento.toFixed(2));
eq('as VENDAS da tela são as da API (não as linhas da planilha)',
  num(kpis.find((k) => /^Vendas$/i.test(k.rot.trim())).num), g.vendas);
eq('e vendas ≠ linhas brutas — o agrupamento aconteceu',
  g.vendas < g.composicao.linhasBrutas, 'true');
ok('linhas brutas → vendas', `${g.composicao.linhasBrutas} → ${g.vendas}`);

console.log('\n=== 3. o ticket médio EXISTE e a tela explica a regra ===');
const textoPainel = await pg.$eval('#view-vendas-painel', (e) => e.textContent);
eq('a API devolve ticket médio', g.ticketMedio.valor != null, 'true');
ok('ticket médio', String(g.ticketMedio.valor));
eq('a tela mostra o valor, não um traço',
  num(kpis.find((k) => /Ticket/i.test(k.rot)).num).toFixed(2), g.ticketMedio.valor.toFixed(2));
eq('NÃO diz mais "indisponível de propósito"',
  /indispon[íi]vel de prop[óo]sito/i.test(textoPainel), 'false');
eq('explica como o ticket é calculado',
  /Como o ticket m[ée]dio [ée] calculado/i.test(textoPainel), 'true');

console.log('\n=== 4. os blocos do painel aparecem ===');
const titulos = await pg.$$eval('#view-vendas-painel .panel .head h2', (n) => n.map((x) => x.textContent.trim()));
for (const t of ['Distribuição por categoria vendida', 'Evolução por mês',
  'Produtos mais vendidos', 'Origem das vendas', 'Top clientes']) {
  eq(`bloco "${t}"`, titulos.includes(t), 'true');
}
eq('a rosca de categoria foi desenhada',
  await pg.$$eval('#roscaCatVendas svg .slice', (n) => n.length > 0), 'true');
eq('o gráfico de evolução tem barras',
  await pg.$$eval('#view-vendas-painel .evo .evo-bar', (n) => n.length > 0), 'true');
eq('os produtos têm linha com foto ou lugar reservado',
  await pg.$$eval('#view-vendas-painel .pvrow .pv-foto', (n) => n.length > 0), 'true');
const semFoto = await pg.$$eval('#view-vendas-painel .pv-foto .semfoto', (n) => n.length);
ok('produtos sem foto mostram o lugar reservado (não somem do ranking)', String(semFoto));
eq('há cartões de insight no rodapé',
  await pg.$$eval('#view-vendas-painel .insights .insight', (n) => n.length > 0), 'true');
eq('nenhum insight inventa "% vs. período anterior"',
  /vs\.?\s*per[íi]odo anterior/i.test(textoPainel), 'false');

console.log('\n=== 5. a rosca mostra CATEGORIA, nunca material ===');
const cats = (await api('/api/analytics/categorias?periodo=tudo')).categorias.map((c) => c.categoria);
ok('categorias', cats.join(', '));
for (const material of ['Banhada', 'Bruto', 'Prata 925', 'Aço Inox']) {
  eq(`"${material}" não aparece como categoria`, cats.includes(material), 'false');
}
eq('as categorias são as do Estoque',
  cats.every((c) => ['Colar', 'Brinco', 'Pulseira', 'Berloque', 'Anel', 'Argola',
    'Pingente', 'Conjunto', 'Outros'].includes(c)), 'true');

console.log('\n=== 6. o filtro de período muda os números ===');
const antes = kpis.find((k) => /Faturamento/i.test(k.rot)).num;
await pg.evaluate(() => setPainelPeriodo('30d'));
await pg.waitForTimeout(2500);
const depois = await pg.$eval('#view-vendas-painel .kpi .k-num', (e) => e.textContent);
eq('30 dias mostra menos que tudo', num(depois) < num(antes), 'true');
ok('tudo → 30 dias', `${antes} → ${depois}`);
await pg.evaluate(() => setPainelPeriodo('tudo'));
await pg.waitForTimeout(2500);

/* ════════════════════════════════════════════════ 7. Clientes: CRM + operação */

console.log('\n=== 7. Clientes tem dashboard E operação ===');

await pg.evaluate(() => switchTab('revlist'));
await pg.waitForTimeout(700);
await pg.evaluate(() => switchTab('clientes'));
await pg.waitForTimeout(3000);
eq('a view de clientes está ativa',
  await pg.$eval('#view-clientes', (e) => e.classList.contains('active')), 'true');

const kpisCli = await pg.$$eval('#view-clientes .kpi .k-lbl', (n) => n.map((x) => x.textContent.trim()));
eq('cinco indicadores de CRM', kpisCli.length >= 5, 'true');
ok('são eles', kpisCli.join(' · '));

const titulosCli = await pg.$$eval('#view-clientes .panel .head h2', (n) => n.map((x) => x.textContent.trim()));
for (const t of ['Principais clientes ao longo do tempo', 'Peças compradas pelos principais clientes',
  'Saúde da base', 'Top clientes', 'Oportunidades de reativação', 'Todos os clientes']) {
  eq(`bloco "${t}"`, titulosCli.includes(t), 'true');
}
eq('o gráfico de linhas tem séries',
  await pg.$$eval('#view-clientes .lchart .ln', (n) => n.length > 0), 'true');
eq('e legenda com o nome de cada cliente (não só cor)',
  await pg.$$eval('#view-clientes .lgnd .lgn', (n) => n.length > 0), 'true');
eq('a rosca da saúde da base foi desenhada',
  await pg.$$eval('#roscaSaude svg .slice', (n) => n.length > 0), 'true');

const textoCli = await pg.$eval('#view-clientes', (e) => e.textContent);
eq('não chama gasto acumulado de LTV', /\bLTV\b/.test(textoCli.replace(/não é LTV/g, '')), 'false');
eq('e diz explicitamente que não é LTV', /não é LTV/i.test(textoCli), 'true');
eq('não inventa "Última reativação"', /[ÚU]ltima reativa[çc][ãa]o/i.test(textoCli), 'false');
eq('o botão de reativação não promete envio de mensagem',
  /Reativar<|>Reativar</.test(await pg.$eval('#view-clientes', (e) => e.innerHTML)), 'false');

console.log('\n=== 8. a lista usa os componentes de Revendedoras ===');
eq('usa a MESMA .revgrid', await pg.$$eval('#view-clientes .revgrid', (n) => n.length > 0), 'true');
const cards = await pg.$$eval('#view-clientes .revcard', (n) => n.length);
eq('e os MESMOS .revcard', cards > 0, 'true');
ok('clientes na tela', String(cards));
const clientesTotal = (await api('/api/analytics/crm?periodo=tudo')).kpis.ativos;
ok('clientes na base', String(clientesTotal));
const partes = await pg.$eval('#view-clientes .revcard', (c) => ({
  nome: !!c.querySelector('.rc-nm'), meta: !!c.querySelector('.rc-meta'),
  linha: !!c.querySelector('.rc-row'), stat: !!c.querySelector('.rc-st'),
  selo: !!c.querySelector('.badge'),
}));
for (const [k, v] of Object.entries(partes)) eq(`o card tem ${k}`, v, 'true');

const estilos = await pg.evaluate(() => {
  const pega = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return { radius: s.borderRadius, border: s.borderTopWidth, bg: s.backgroundColor };
  };
  const c = document.querySelector('#view-clientes .revcard');
  const tmp = document.createElement('div');
  tmp.className = 'revcard';
  document.querySelector('#view-clientes').appendChild(tmp);
  const r = pega(tmp); tmp.remove();
  return { cliente: pega(c), referencia: r };
});
eq('mesmo raio de borda que o card de referência', estilos.cliente.radius, estilos.referencia.radius);
eq('mesma borda', estilos.cliente.border, estilos.referencia.border);
eq('mesmo fundo', estilos.cliente.bg, estilos.referencia.bg);

console.log('\n=== 9. busca e filtros de status ===');
const total = cards;
/* A lista pagina (48 por vez), então contar cartões não mede o filtro: os
   dois casos mostram 48. O que o filtro muda é a COMPOSIÇÃO — depois de
   filtrar, todo selo visível tem de dizer "recorrente". */
await pg.evaluate(() => setClientesFiltro('recorrente'));
await pg.waitForTimeout(700);
const selos = await pg.$$eval('#view-clientes .revcard .badge', (n) =>
  [...new Set(n.map((x) => x.textContent.trim()))]);
eq('o filtro "Recorrentes" deixa só recorrentes', selos.join(','), 'recorrente');
const rotuloRec = await pg.$eval('#view-clientes .fpill.on', (e) => e.textContent.trim());
ok('pílula ativa', rotuloRec);
eq('e o total mostrado é menor que a base',
  Number(rotuloRec.replace(/\D/g, '')) < clientesTotal, 'true');
await pg.evaluate(() => setClientesFiltro('todos'));
await pg.waitForTimeout(600);

/* a paginação existe e não esconde ninguém: o rodapé diz de quantos é */
const rodape = await pg.$eval('#todosClientes', (e) => e.textContent);
eq('a lista pagina em vez de despejar tudo', /Mostrando \d+ de \d+/.test(rodape), 'true');
eq('e oferece ver mais', /Ver mais/.test(rodape), 'true');

const nomeAlvo = await pg.$eval('#view-clientes .revcard .rc-nm', (e) => e.textContent.trim());
await pg.fill('#cliBusca', nomeAlvo.split(' ')[0]);
await pg.waitForTimeout(700);
const achados = await pg.$$eval('#view-clientes .revcard', (n) => n.length);
eq('a busca filtra', achados > 0 && achados <= total, 'true');
eq('e o foco fica no campo de busca (não perde letra)',
  await pg.evaluate(() => document.activeElement.id), 'cliBusca');
await pg.fill('#cliBusca', '');
await pg.waitForTimeout(600);

console.log('\n=== 10. o modal de cliente espelha o de revendedora ===');
const estrutura = async (sel) => pg.evaluate((s) => {
  const o = document.querySelector(s);
  if (!o) return null;
  return {
    overlayCenter: o.classList.contains('overlay') && o.classList.contains('center'),
    modal: !!o.querySelector('.modal'),
    largura: (o.querySelector('.modal') || {}).style?.width || '',
    mhead: !!o.querySelector('.mhead'), mbody: !!o.querySelector('.mbody'),
    mfoot: !!o.querySelector('.mfoot'),
    campos: o.querySelectorAll('.field').length, duas: o.querySelectorAll('.two').length,
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
eq('usa .two', cli.duas > 0, 'true');
eq('mesmos botões no rodapé', JSON.stringify(cli.botoes), JSON.stringify(rev.botoes));

await pg.evaluate(() => openCliForm());
await pg.waitForTimeout(500);
eq('o modal abre', await pg.$eval('#cliOverlay', (e) => e.classList.contains('show')), 'true');
eq('e o foco vai para o nome', await pg.evaluate(() => document.activeElement.id), 'clf-nome');
await pg.evaluate(() => closeCliForm());
await pg.waitForTimeout(400);

/* ════════════════════════════════════════════════════════════ 11. perfil */

console.log('\n=== 11. o perfil abre e agrupa a compra corretamente ===');

const rank = await api('/api/analytics/clientes?periodo=tudo&ordem=compras&limite=1');
const alvo = rank.clientes[0];
await pg.evaluate((n) => switchTab('cli:' + encodeURIComponent(n)), alvo.norm);
await pg.waitForTimeout(3000);
eq('a view do perfil está ativa',
  await pg.$eval('#view-cliente', (e) => e.classList.contains('active')), 'true');
const tituloPerfil = await pg.$eval('#view-cliente .head h2', (e) => e.textContent.trim());
ok('perfil aberto', tituloPerfil);
eq('cinco indicadores no perfil', await pg.$$eval('#view-cliente .kpi', (n) => n.length), 5);
const textoPerfil = await pg.$eval('#view-cliente', (e) => e.textContent);
eq('tem histórico de compras', /Hist[óo]rico de compras/.test(textoPerfil), 'true');
eq('tem preferências', /Prefer[êe]ncias/.test(textoPerfil), 'true');

/* a prova central da rodada: a compra de muitas peças é UMA linha do tempo */
const perfil = await api('/api/clientes/perfil?norm=' + encodeURIComponent(alvo.norm));
const maiorVenda = Math.max(...perfil.vendas.map((v) => v.itens.length));
const blocos = await pg.$$eval('#view-cliente .tl .tlv', (n) => n.length);
eq('a linha do tempo tem uma entrada por COMPRA', blocos, perfil.vendas.length);
eq('e a maior compra traz vários itens dentro dela', maiorVenda > 1, 'true');
ok('maior compra', `${maiorVenda} itens numa entrada só`);
eq('o total de compras é menor que o de itens',
  perfil.resumo.vendas < perfil.resumo.itensLancados, 'true');

/* ══════════════════════════════════════════════════════════ 12. celular */

console.log('\n=== 12. celular (390px): nenhuma rolagem horizontal ===');
await pg.setViewportSize({ width: 390, height: 844 });
for (const [aba, rot] of [['vendas-painel', 'Painel'], ['clientes', 'Clientes'],
  [`cli:${encodeURIComponent(alvo.norm)}`, 'Perfil']]) {
  await pg.evaluate((a) => switchTab(a), aba);
  await pg.waitForTimeout(2200);
  const estoura = await pg.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  eq(`${rot} cabe na largura do celular`, estoura, 'false');
}
await pg.evaluate(() => switchTab('clientes'));
await pg.waitForTimeout(1800);
await pg.evaluate(() => openCliForm());
await pg.waitForTimeout(500);
eq('o modal de cliente cabe no celular', await pg.evaluate(() => {
  const m = document.querySelector('#cliOverlay .modal');
  return m.getBoundingClientRect().width <= window.innerWidth;
}), 'true');
await pg.evaluate(() => closeCliForm());

/* ══════════════════════════════════════════════════════════ 13. console */

console.log('\n=== 13. nenhum erro de console ===');
const reais = errosConsole.filter((e) => !/favicon|manifest|sw\.js/i.test(e));
eq('console limpo', reais.length, 0);
if (reais.length) reais.slice(0, 8).forEach((e) => console.log('     ' + e));

await nav.close();
console.log(`\n${falhas ? '✗ ' + falhas + ' FALHA(S)' : '✓ TUDO PASSOU'}`);
process.exit(falhas ? 1 : 0);
