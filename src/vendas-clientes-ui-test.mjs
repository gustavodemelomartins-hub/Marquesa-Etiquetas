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

console.log('\n=== 2. o Painel mostra os quatro indicadores ===');

await pg.evaluate(() => switchTab('vendas-painel'));
await pg.waitForTimeout(3000);
eq('a view do painel está ativa',
  await pg.$eval('#view-vendas-painel', (e) => e.classList.contains('active')), 'true');

const kpis = await pg.$$eval('#view-vendas-painel .panel:first-of-type .kpi', (n) => n.map((x) => ({
  rot: (x.querySelector('.k-lbl') || {}).textContent || '',
  num: (x.querySelector('.k-num') || {}).textContent || '',
})));
/* Eram cinco até 2026-08-28. "Clientes" saiu do topo do Painel: a
   contagem de gente não é leitura de faturamento, e a aba Clientes inteira
   responde a essa pergunta melhor. Os quatro que ficaram são os que a dona
   do negócio nomeou. */
eq('quatro indicadores no topo', kpis.length, 4);
for (const k of kpis) ok(`indicador ${k.rot.trim()}`, k.num.trim());
for (const r of ['Faturamento', 'Ticket médio', 'Vendas', 'Peças vendidas']) {
  eq(`existe o indicador "${r}"`, kpis.some((k) => k.rot.trim() === r), 'true');
}
eq('e "Clientes" NÃO é mais indicador do Painel',
  kpis.some((k) => k.rot.trim() === 'Clientes'), 'false');

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

console.log('\n=== 4. os blocos do painel: o que fica em cima e o que desce ===');
const titulos = await pg.$$eval('#view-vendas-painel .panel .head h2', (n) => n.map((x) => x.textContent.trim()));

/* Na primeira tela, aberta, só a evolução por mês. */
eq('bloco "Evolução por mês"', titulos.includes('Evolução por mês'), 'true');
/* "Top clientes" mudou de endereço: ele agora mora na aba Clientes, e não
   nas duas. Era a queixa literal — a mesma informação em dois lugares. */
eq('"Top clientes" NÃO está mais no Painel', titulos.includes('Top clientes'), 'false');

/* O resto continua existindo, dentro do "Ver detalhes" — nada foi apagado. */
const detalhes = await pg.$('#view-vendas-painel details.maisitens.secao');
eq('existe o bloco "Ver detalhes"', !!detalhes, 'true');
eq('e ele começa FECHADO', await detalhes.evaluate((e) => e.open), 'false');
eq('o resumo diz o que tem lá dentro',
  /produtos, categorias e canais/i.test(await detalhes.$eval('summary', (e) => e.textContent)), 'true');
for (const t of ['Distribuição por categoria vendida', 'Produtos mais vendidos', 'Origem das vendas']) {
  eq(`"${t}" continua existindo, dentro do "Ver detalhes"`,
    await detalhes.evaluate((e, alvo) => [...e.querySelectorAll('.head h2')]
      .some((h) => h.textContent.trim() === alvo), t), 'true');
}
await detalhes.evaluate((e) => { e.open = true; });
await pg.waitForTimeout(400);
eq('a rosca de categoria foi desenhada',
  await pg.$$eval('#roscaCatVendas svg .slice', (n) => n.length > 0), 'true');
eq('o gráfico de evolução tem barras',
  await pg.$$eval('#view-vendas-painel .evo .evo-bar', (n) => n.length > 0), 'true');
eq('os produtos têm linha com foto ou lugar reservado',
  await pg.$$eval('#view-vendas-painel .pvrow .pv-foto', (n) => n.length > 0), 'true');
const semFoto = await pg.$$eval('#view-vendas-painel .pv-foto .semfoto', (n) => n.length);
ok('produtos sem foto mostram o lugar reservado (não somem do ranking)', String(semFoto));
/* Os três destaques que a dona do negócio pediu pelo NOME. Cinco cartões
   viraram três, e os três nomeiam alguém ou alguma coisa. */
const destaques = await pg.$$eval('#view-vendas-painel .insights .insight',
  (n) => n.map((x) => ({
    rot: (x.querySelector('.i-t') || {}).textContent || '',
    val: (x.querySelector('.i-d b') || {}).textContent || '',
  })));
eq('três destaques', destaques.length, 3);
for (const r of ['Peça que mais vendeu', 'Cliente que mais compra', 'Melhor mês']) {
  const d = destaques.find((x) => x.rot.trim() === r);
  eq(`destaque "${r}"`, !!d, 'true');
  if (d) ok(`  e ele nomeia`, d.val.trim());
}
eq('a peça campeã é nomeada, não é um código solto',
  /^\d+$/.test((destaques.find((d) => /Peça/i.test(d.rot)) || {}).val || ''), 'false');
eq('o cartão da cliente leva para a ficha dela',
  await pg.$$eval('#view-vendas-painel .insight.clicavel', (n) => n.length > 0), 'true');
eq('nenhum destaque inventa "% vs. período anterior"',
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

console.log('\n=== 7. Clientes é a agenda, não um dashboard ===');

await pg.evaluate(() => switchTab('revlist'));
await pg.waitForTimeout(700);
await pg.evaluate(() => switchTab('clientes'));
await pg.waitForTimeout(3000);
eq('a view de clientes está ativa',
  await pg.$eval('#view-clientes', (e) => e.classList.contains('active')), 'true');

/* DOIS blocos, nesta ordem, e mais nada. Era o pedido literal de quem usa:
   "na aba clientes, ficar só os meus clientes". */
const titulosCli = await pg.$$eval('#view-clientes .panel .head h2', (n) => n.map((x) => x.textContent.trim()));
eq('dois blocos, e só', titulosCli.length, 2);
eq('o primeiro é Top clientes', titulosCli[0], 'Top clientes');
eq('o segundo é Todos os clientes', titulosCli[1], 'Todos os clientes');

eq('nenhum indicador de dashboard sobrou',
  await pg.$$eval('#view-clientes .kpi', (n) => n.length), 0);
for (const t of ['Principais clientes ao longo do tempo', 'Peças compradas pelos principais clientes',
  'Saúde da base', 'Oportunidades de reativação']) {
  eq(`"${t}" saiu`, titulosCli.includes(t), 'false');
}
eq('e o gráfico de linhas não existe mais',
  await pg.$$eval('#view-clientes .lchart', (n) => n.length), 0);

const textoCli = await pg.$eval('#view-clientes', (e) => e.textContent);
eq('não chama gasto acumulado de LTV', /\bLTV\b/.test(textoCli), 'false');
eq('não inventa "Última reativação"', /[ÚU]ltima reativa[çc][ãa]o/i.test(textoCli), 'false');

/* O selo continua: é a única leitura que ficou, e ela vira ação (filtrar,
   abrir a cliente), não mais um cartão para rolar. */
eq('as linhas do Top clientes trazem o selo de relacionamento',
  await pg.$$eval('#view-clientes .gtab.tcli .selo', (n) => n.length > 0), 'true');

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

/* ═══════════════════════════════ 14. o acabamento: o que a segunda passada
   prometeu e a tela precisa continuar cumprindo. Cada asserção aqui nasceu de
   um defeito visto no navegador, não de uma ideia de design. */

console.log('\n=== 14. acabamento visual ===');

const ctxW = await nav.newContext({ viewport: { width: 1440, height: 950 } });
const pw = await ctxW.newPage();
const errosW = [];
pw.on('console', (m) => { if (m.type() === 'error') errosW.push(m.text()); });
pw.on('pageerror', (e) => errosW.push(String(e)));
await pw.goto(PAINEL, { waitUntil: 'networkidle' });
await pw.waitForTimeout(600);
await pw.fill('#cf-url', API);
await pw.fill('#cf-key', KEY);
await pw.click('#conexaoOverlay .btn-gold');
await pw.waitForTimeout(2500);

await pw.evaluate(() => switchTab('vendas-painel'));
await pw.waitForTimeout(2500);

/* a barra de rolagem embaixo do gráfico de meses era o item que mais fazia a
   tela parecer quebrada */
eq('evolução não ganha barra de rolagem em 1440px', await pw.$eval('#evoBox',
  (e) => getComputedStyle(e).overflowX !== 'visible' && e.scrollWidth - e.clientWidth > 2), 'false');
eq('e a página não rola de lado por causa dela', await pw.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1), 'false');

/* o rótulo do mês era cortado nas duas pontas: como item de flex ele herdava
   a largura da barra, de 14px com 24 meses */
eq('rótulo de mês não é cortado', await pw.$$eval('#evoBox .evo-lbl',
  (n) => n.filter((e) => e.textContent.trim() && e.scrollWidth - e.clientWidth > 2).length), 0);
eq('o mês mais recente está rotulado', await pw.$$eval('#evoBox .evo-col',
  (n) => !!n[n.length - 1].querySelector('.evo-lbl').textContent.trim()), 'true');

/* a lista de categorias encurtou, e a rosca continua com TODAS */
const catVis = await pw.$$eval('#view-vendas-painel .catgrid.vend > div > .rank > .rkrow', (n) => n.length);
const catFat = await pw.$$eval('#roscaCatVendas .slice', (n) => n.length);
eq('a lista de categorias mostra no máximo 6', catVis <= 6, 'true');
eq('a rosca desenha todas as categorias', catFat >= catVis, 'true');

/* nenhum cartão herdando altura de vizinho e sobrando metade vazio */
const sobra = async (pgx, vista) => pgx.evaluate((v) => {
  const out = [];
  document.querySelectorAll(v + ' .panel').forEach((p) => {
    const b = p.querySelector('.body'); if (!b) return;
    const alt = p.getBoundingClientRect().height; if (alt < 220) return;
    let baixo = 0;
    b.querySelectorAll(':scope > *').forEach((c) => {
      const r = c.getBoundingClientRect(); if (r.height) baixo = Math.max(baixo, r.bottom);
    });
    if (p.getBoundingClientRect().bottom - baixo > alt * 0.28) {
      out.push((p.querySelector('h2') || {}).textContent);
    }
  });
  return out;
}, vista);
eq('painel: nenhum cartão meio vazio', (await sobra(pw, '#view-vendas-painel')).join(' | '), '');

/* o texto original de cada origem existe para ser conferido inteiro */
eq('o texto original da origem não vira reticências', await pw.$$eval(
  '#view-vendas-painel .rk-nm.livre',
  (n) => n.filter((e) => e.scrollWidth - e.clientWidth > 2).length), 0);

await pw.evaluate(() => switchTab('clientes'));
await pw.waitForTimeout(2500);

/* A grade de Top clientes, que é a única leitura que ficou nesta aba. */
eq('top clientes é uma grade de leitura',
  await pw.$$eval('#view-clientes .gtab.tcli .gt-r', (n) => n.length >= 6), 'true');
eq('e mostra as colunas em 1440px',
  await pw.$eval('#view-clientes .gtab.tcli .gt-r .col-op',
    (e) => getComputedStyle(e).display !== 'none'), 'true');

/* nada truncado em nenhuma das grades */
eq('nada é cortado nas grades de leitura', await pw.$$eval(
  '#view-clientes .gtab .gt-nm, #view-clientes .gtab .gt-sub',
  (n) => n.filter((e) => e.scrollWidth - e.clientWidth > 2).length), 0);

eq('clientes: nenhum cartão meio vazio', (await sobra(pw, '#view-clientes')).join(' | '), '');

/* A FICHA: telefone, CPF e cidade estavam no cadastro e não apareciam em
   lugar nenhum da lista. É o que a dona do negócio pediu para ver de
   relance, sem abrir cliente por cliente. */
console.log('\n=== 15. o cartão da cliente virou ficha ===');
const semContato = await pw.$$eval('#view-clientes .revcard .rc-contato.vazio', (n) => n.length);
const comContato = await pw.$$eval('#view-clientes .revcard .rc-contato:not(.vazio)', (n) => n.length);
eq('todo cartão diz alguma coisa sobre contato',
  semContato + comContato, await pw.$$eval('#view-clientes .revcard', (n) => n.length));
eq('e quem não tem nada preenchido é convidado a preencher',
  semContato === 0 || await pw.$eval('#view-clientes .revcard .rc-contato.vazio',
    (e) => /toque para preencher/i.test(e.textContent)), 'true');

/* prova de ponta a ponta: grava contato numa cliente e ele aparece no cartão */
const alvoFicha = await pw.$eval('#view-clientes .revcard .rc-nm', (e) => e.textContent.trim());
const idAlvo = await pw.evaluate((nome) => {
  const c = (clientesLista || []).find((x) => x.nome === nome);
  return c ? c.clienteId : null;
}, alvoFicha);
eq('a cliente do primeiro cartão tem cadastro', !!idAlvo, 'true');
if (idAlvo) {
  await pw.evaluate(async (id) => {
    await api('PATCH', '/api/clientes/' + id,
      { tel: '41999998888', cpf: '39053344705', cidade: 'Maringá' });
    await carregarClientes(); renderClientes();
  }, idAlvo);
  await pw.waitForTimeout(1200);
  const ficha = await pw.evaluate((nome) => {
    const card = [...document.querySelectorAll('#view-clientes .revcard')]
      .find((c) => c.querySelector('.rc-nm').textContent.trim() === nome);
    return card ? card.querySelector('.rc-contato').textContent : '';
  }, alvoFicha);
  eq('o telefone aparece no cartão, formatado', /\(41\) 99999-8888/.test(ficha), 'true');
  eq('a cidade também', /Maring/.test(ficha), 'true');
  eq('e o CPF, com máscara', /390\.533\.447-05/.test(ficha), 'true');

  /* e a busca acha por telefone, não só por nome */
  await pw.fill('#cliBusca', '99998888');
  await pw.waitForTimeout(800);
  eq('a busca acha pelo telefone',
    await pw.$$eval('#view-clientes .revcard .rc-nm', (n) => n.map((x) => x.textContent.trim())),
    [alvoFicha].toString());
  await pw.fill('#cliBusca', '');
  await pw.waitForTimeout(600);
}

/* o atalho entre a leitura e a agenda */
await pw.evaluate(() => verEstadoNaLista('em risco'));
await pw.waitForTimeout(1000);
eq('"Ver todos" filtra a lista de baixo',
  await pw.$eval('#todosClientes .fpill.on', (e) => /em risco/i.test(e.textContent)), 'true');
await pw.evaluate(() => setClientesFiltro('todos'));
await pw.waitForTimeout(600);

/* ───────────────────────── revendedora não é cliente, e o acerto dela aparece

   O defeito que originou esta rodada: a planilha tem UMA coluna para quem
   levou a peça, e nela convivem a cliente final e a revendedora que veio
   acertar a maleta. A revendedora entrava no CRM como a maior cliente da
   casa — 46 linhas de "Maleta" num acerto de 36 peças viravam "Maior
   compra" num cartão de destaque.

   O teste é independente dos dados: pega quem hoje é a PRIMEIRA do ranking,
   cadastra essa pessoa como revendedora e exige que ela saia do ranking e
   apareça em "Acertos de maleta", com a comissão estimada. */
console.log('\n=== 16. revendedora sai do ranking e vira acerto de maleta ===');

const rankAntes = (await api('/api/analytics/crm?periodo=tudo')).topClientes;
const primeira = rankAntes[0];
ok('primeira do ranking antes', `${primeira.nome} · ${primeira.faturamento}`);

const nova = await fetch(API + '/api/revendedoras', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ nome: primeira.nome, cidade: 'Curitiba' }),
}).then((r) => r.json());
eq('cadastrei ela como revendedora', !!nova.id, 'true');

const crmDepois = await api('/api/analytics/crm?periodo=tudo');
eq('ela sumiu do ranking de clientes',
  crmDepois.topClientes.some((c) => c.norm === primeira.norm), 'false');
eq('e da lista completa também',
  crmDepois.todos.some((c) => c.norm === primeira.norm), 'false');
eq('outra pessoa assumiu o topo', crmDepois.topClientes[0].norm !== primeira.norm, 'true');

const painelApi = await api('/api/analytics/painel?periodo=tudo');
const ml = painelApi.maletas;
eq('o painel traz o bloco de acertos', ml.totais.acertos > 0, 'true');
ok('vendido nos acertos', String(ml.totais.vendido));
ok('comissão estimada', String(ml.totais.comissao));
eq('líquido = vendido − comissão',
  (ml.totais.vendido - ml.totais.comissao).toFixed(2), ml.totais.liquido.toFixed(2));
eq('a comissão é menor que o vendido', ml.totais.comissao < ml.totais.vendido, 'true');
eq('e as premissas da estimativa viajam junto', (ml.premissas || []).length >= 3, 'true');

/* o dinheiro NÃO some do faturamento — é a decisão de negócio desta rodada */
const geralDepois = await api('/api/analytics/vendas?periodo=tudo');
eq('o faturamento continua contando o acerto',
  geralDepois.faturamento.toFixed(2), g.faturamento.toFixed(2));
eq('mas a contagem de clientes caiu em um', geralDepois.clientes, g.clientes - 1);

await pw.evaluate(() => switchTab('vendas-painel'));
await pw.waitForTimeout(2800);
const txtPainel2 = await pw.$eval('#view-vendas-painel', (e) => e.textContent);
eq('a tela mostra "Acertos de maleta"', /Acertos de maleta/.test(txtPainel2), 'true');
eq('e diz que a comissão é estimativa',
  /comiss[ãa]o [ée] uma estimativa/i.test(txtPainel2), 'true');
eq('a grade de acertos tem linha',
  await pw.$$eval('#view-vendas-painel .gtab.acertos .gt-r', (n) => n.length > 0), 'true');

/* ─────────────────────────────── e some das abas quando é arquivada */
console.log('\n=== 17. revendedora arquivada sai das abas e volta pela lista ===');
await pw.evaluate(async () => { await sincronizar(); });
await pw.evaluate((id) => api('POST', `/api/revendedoras/${id}/arquivar`), nova.id);
await pw.evaluate(async () => { await sincronizar(); });
await pw.evaluate(() => switchTab('revlist'));
await pw.waitForTimeout(1500);

const abasRev = await pw.$$eval('#tabsSubNav .tab', (n) => n.map((x) => x.textContent.trim()));
eq('a arquivada saiu das abas laterais',
  abasRev.some((t) => t.includes(primeira.nome.split(' ')[0])), 'false');
eq('mas continua listada em "Revendedoras inativas"',
  await pw.$$eval('#view-revlist .gtab.inativas .gt-nm', (n) => n.map((x) => x.textContent.trim()))
    .then((l) => l.includes(primeira.nome)), 'true');
eq('com o botão de reativar do lado',
  await pw.$$eval('#view-revlist .gtab.inativas .btn-gold', (n) => n.length > 0), 'true');
eq('e ela não conta como ativa',
  await pw.evaluate(() => revAtivas().some((r) => r.status === 'inativa')), 'false');
eq('o acerto dela continua no painel mesmo arquivada',
  (await api('/api/analytics/painel?periodo=tudo')).maletas.totais.acertos > 0, 'true');

await pw.evaluate((id) => reativarRevendedora(id), nova.id);
await pw.waitForTimeout(1800);
eq('reativar devolve ela para as ativas',
  await pw.evaluate((id) => revAtivas().some((r) => r.id === id), nova.id), 'true');

/* ─────────────────────────── o autocompletar de cliente em Lançamentos */
console.log('\n=== 18. o autocompletar acha quem está no fim do alfabeto ===');
const todos = crmDepois.todos.filter((c) => c.identificada);
/* alguém cuja inicial NÃO caiba nas 50 primeiras em ordem alfabética —
   era exatamente quem o autocompletar antigo não encontrava */
const tarde = [...todos].sort((a, b) => b.nome.localeCompare(a.nome))[0];
ok('procurando por', tarde.nome);
const achou = await pw.evaluate(async (termo) => {
  const r = await api('GET', '/api/clientes?busca=' + encodeURIComponent(termo));
  return (r || []).map((c) => c.nome);
}, tarde.nome.split(' ')[0]);
eq('a busca do servidor acha', achou.includes(tarde.nome), 'true');

/* Aqui a prova para no que a busca CARREGA: o `<datalist>` só existe
   enquanto o modal de venda está aberto, e abrir o modal exige um carrinho
   com peça bipada. Esse caminho inteiro — digitar, ver a opção aparecer e
   a venda cair na ficha certa — está coberto em `src/e2e.mjs`, no fluxo de
   venda de verdade. */
await pw.evaluate((nome) => buscarClienteVenda(nome), tarde.nome.split(' ')[0]);
await pw.waitForTimeout(900);
eq('e a lista que alimenta o autocompletar recebe ela',
  await pw.evaluate((nome) => vdClientes.some((c) => c.nome === nome), tarde.nome), 'true');
eq('com a cidade junto, para desempatar homônima',
  await pw.evaluate(() => vdClientes.every((c) => 'cidade' in c)), 'true');

eq('console limpo no acabamento',
  errosW.filter((e) => !/favicon|manifest|sw\.js/i.test(e)).length, 0);
if (errosW.length) errosW.slice(0, 5).forEach((e) => console.log('     ' + e));
await ctxW.close();

await nav.close();
console.log(`\n${falhas ? '✗ ' + falhas + ' FALHA(S)' : '✓ TUDO PASSOU'}`);
process.exit(falhas ? 1 : 0);
