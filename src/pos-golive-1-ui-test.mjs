/** REVISÃO OPERACIONAL 1 — as telas, provadas num navegador de verdade.
 *
 *  O que só o navegador prova: que o cartão desenha o número certo, que o
 *  campo de data guarda o que foi digitado, que o clique na barra do gráfico
 *  abre o resumo do mês, e que nada disso derruba o console.
 *
 *  Pré-requisitos:
 *    Worker local em :8787 (banco limpo) e o painel servido em :8000.
 *      api/dev-local.sh
 *      python3 -m http.server 8000        (na raiz do repositório)
 *      node src/pos-golive-1-ui-test.mjs
 */
import { chromium } from 'playwright';

const URL_APP = process.env.APP_URL || 'http://localhost:8000/dashboard.html';
const URL_API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x, x2 = '') => (x ? ok(t, x2) : bad(t, x2));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const P = (s) => `UI1-${s}`;

console.log('\n=== 0. dados de teste ===');
{
  const r = await api('POST', '/api/produtos/importar', {
    produtos: [
      { sku: P('ANEL'), desc: 'Anel Minimalista Cruz', preco: 89, cat: 'Anéis', qtd: 20 },
      { sku: P('BRIN'), desc: 'Brinco Pétalas', preco: 69, cat: 'Brincos', qtd: 20 },
    ],
  });
  eq('catálogo', r.status, 200);
  await api('POST', '/api/vendas', {
    clienteNome: 'Tela Um', data: '2026-08-05',
    itens: [{ sku: P('ANEL'), qtd: 1 }, { sku: P('BRIN'), qtd: 2 }],
  });
  await api('POST', '/api/vendas', {
    clienteNome: 'Tela Fiada', data: '2026-08-05', pago: false,
    itens: [{ sku: P('ANEL'), qtd: 1 }],
  });
  ok('duas vendas em 05/08/2026');
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
const erros = [];
let vigiando = false;
page.on('console', (m) => { if (vigiando && m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));

console.log('\n=== 1. conectar ===');
await page.goto(URL_APP);
await page.waitForTimeout(700);
await page.fill('#cf-url', URL_API);
await page.fill('#cf-key', KEY);
await page.click('#conexaoOverlay .btn-gold');
await page.waitForTimeout(1500);
eq('conectou', await page.locator('#conexaoOverlay').evaluate((e) => e.classList.contains('show')), 'false');
vigiando = true;

console.log('\n=== 2. cartões de Lançamentos seguem a data (§35) ===');
{
  await page.evaluate(() => switchTab('vendas'));
  await page.waitForTimeout(400);
  await page.evaluate(() => setVendasData('2026-08-05'));
  await page.waitForTimeout(1200);

  const txt = await page.locator('#view-vendas .kpis').innerText();
  /* O número esperado vem da PRÓPRIA API, não de uma constante no teste:
     rodar duas vezes sobre o mesmo banco dobra os dados, e um valor fixo
     falharia por causa do teste, não do produto. O que se prova aqui é que
     a tela desenha o que o servidor calculou — e que não é R$ 0. */
  const esperado = (await api('GET', '/api/vendas/lancamentos?data=2026-08-05')).corpo;
  verdade('o dia realmente tem venda', esperado.vendidoNoDia.valor > 0, String(esperado.vendidoNoDia.valor));
  const soNumeros = (t) => t.replace(/[^0-9,]/g, ' ');
  verdade('o cartão mostra o vendido do dia, não R$ 0',
    soNumeros(txt).includes(String(Math.round(esperado.vendidoNoDia.valor))),
    txt.split('\n').slice(0, 3).join(' | '));
  verdade('e as peças do dia batem com o servidor',
    txt.includes(`${esperado.vendidoNoDia.pecas} peça`), String(esperado.vendidoNoDia.pecas));
  verdade('o cartão de acerto fala em líquido', /[Ll]íquido da Marquesa/.test(txt));
  verdade('e não repete "peças que a revendedora não devolveu"',
    !/não devolveu/.test(txt));
  verdade('o cartão a receber do dia aparece', /A receber deste dia/i.test(txt));

  await page.evaluate(() => setVendasData('2026-08-07'));
  await page.waitForTimeout(1200);
  const vazio = await page.locator('#view-vendas .kpis').innerText();
  verdade('trocar a data zera os cartões na hora', /R\$\s*0/.test(vazio), vazio.split('\n')[1]);
}

console.log('\n=== 3. campo de prazo no A receber (§39) ===');
{
  await page.evaluate(() => switchTab('vendas-painel'));
  await page.waitForTimeout(2000);

  const chave = await page.evaluate(() => {
    const c = (painelVendas?.contasReceber?.contas ?? []).find((x) => x.podeDefinirPrazo !== false);
    return c ? c.chave : null;
  });
  verdade('há uma conta em aberto na tela', !!chave, String(chave));

  /* estado LIDO: um botão "definir", não um input cru permanentemente vazio */
  const antes = await page.locator('.receber-lista .campo-data').first().innerText();
  verdade('o campo começa fechado, com ação por extenso', /definir|editar/.test(antes), antes.trim());

  await page.evaluate((k) => abrirCampoData(k), chave);
  await page.waitForTimeout(400);
  await page.fill(`[id="cd-${chave}"]`, '');
  await page.type(`[id="cd-${chave}"]`, '15092026');
  eq('a máscara escreve DD/MM/AAAA sozinha',
    await page.inputValue(`[id="cd-${chave}"]`), '15/09/2026');

  /* data impossível é recusada sem apagar o que foi digitado */
  await page.fill(`[id="cd-${chave}"]`, '');
  await page.type(`[id="cd-${chave}"]`, '31022026');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  verdade('31/02 é recusado com o motivo',
    /não existe no calendário/.test(await page.locator(`[id="cd-fb-${chave}"]`).innerText()));
  eq('e o que foi digitado continua lá',
    await page.inputValue(`[id="cd-${chave}"]`), '31/02/2026');

  /* a data boa salva e sobrevive ao recarregar a tela */
  await page.fill(`[id="cd-${chave}"]`, '');
  await page.type(`[id="cd-${chave}"]`, '15092026');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  const depois = await page.locator('.receber-lista .campo-data').first().innerText();
  verdade('salvou e voltou ao estado lido, em DD/MM/AAAA',
    /15\/09\/2026/.test(depois) && /editar/.test(depois), depois.trim());

  await page.evaluate(() => switchTab('vendas'));
  await page.waitForTimeout(600);
  await page.evaluate(() => switchTab('vendas-painel'));
  await page.waitForTimeout(2000);
  const relido = await page.locator('.receber-lista .campo-data').first().innerText();
  verdade('e continua lá depois de sair e voltar', /15\/09\/2026/.test(relido), relido.trim());
}

console.log('\n=== 4. clicar numa barra abre o resumo do mês (§40) ===');
{
  await page.evaluate(() => switchTab('vendas-painel'));
  await page.waitForTimeout(1800);

  const barras = await page.locator('#evoBox .evo-col').count();
  verdade('o gráfico tem barras', barras > 0, String(barras));
  verdade('e elas se anunciam como botão',
    (await page.locator('#evoBox .evo-col').first().getAttribute('role')) === 'button');

  /* a barra de agosto/2026, que é onde os dados de teste estão */
  const alvoMes = await page.evaluate(() => {
    const c = [...document.querySelectorAll('#evoBox .evo-col')]
      .find((x) => x.dataset.mes === '2026-08');
    return c ? c.dataset.mes : null;
  });
  verdade('a barra de agosto/2026 existe', !!alvoMes, String(alvoMes));

  await page.locator('#evoBox .evo-col[data-mes="2026-08"]').click();
  await page.waitForTimeout(1800);

  const box = page.locator('#resumoMesBox');
  verdade('o resumo abriu abaixo do gráfico, sem trocar de tela',
    await box.isVisible());
  const cab = await box.locator('.mes-cab h3').innerText();
  eq('e traz o mês por extenso no título', cab, 'Resumo de agosto de 2026');

  const esperado = (await api('GET', '/api/analytics/mes?mes=2026-08')).corpo;
  const cards = await box.locator('.kpis').innerText();
  verdade('quatro cartões', (await box.locator('.kpi').count()) === 4,
    String(await box.locator('.kpi').count()));
  verdade('faturamento do mês bate com o servidor',
    cards.replace(/[^0-9]/g, ' ').includes(String(Math.round(esperado.cards.faturamento.valor))),
    String(esperado.cards.faturamento.valor));
  verdade('clientes atendidos conta pessoa, não compra',
    /Clientes atendidos/i.test(cards)
      && esperado.cards.clientesAtendidos.total <= esperado.cards.vendas.total,
    `${esperado.cards.clientesAtendidos.total} clientes / ${esperado.cards.vendas.total} vendas`);

  verdade('o gráfico de categorias aparece',
    (await box.locator('.mes-cat').count()) > 0);
  const somaCats = await page.evaluate(() => [...document.querySelectorAll('#resumoMesBox .mc-vl')]
    .reduce((s, e) => s + Number(e.textContent.replace(/\D/g, '')), 0));
  eq('e a soma das categorias bate com as peças do mês',
    somaCats, esperado.cards.pecas.total);

  /* histórico compacto: fechado por padrão, expande no clique */
  const linhas = await box.locator('.mes-venda').count();
  verdade('o histórico do mês lista as compras', linhas > 0, String(linhas));
  eq('e nenhuma vem aberta por padrão', await box.locator('.mv-itens').count(), 0);

  await box.locator('.mv-topo').first().click();
  await page.waitForTimeout(700);
  verdade('clicar numa compra mostra os itens dela',
    (await page.locator('#resumoMesBox .mv-item').count()) > 0);
  const item = await page.locator('#resumoMesBox .mv-item').first().innerText();
  verdade('com SKU e nome da peça', /UI1-/.test(item), item.replace(/\n/g, ' '));

  /* fechar volta ao estado anterior */
  await page.locator('#resumoMesBox .mes-cab .lnk').click();
  await page.waitForTimeout(700);
  eq('fechar remove o resumo', await page.locator('#resumoMesBox').count(), 0);
}

console.log('\n=== 5. corrigir o código de uma peça vendida (§41) ===');
{
  /* uma venda com o código errado, para corrigir pela tela */
  await api('POST', '/api/produtos/importar', {
    produtos: [
      { sku: P('ERRADO'), desc: 'Peça Lançada Errada', preco: 60, cat: 'Brincos', qtd: 5 },
      { sku: P('CERTO'), desc: 'Brinco Argola Média', preco: 60, cat: 'Brincos', qtd: 5 },
    ],
  });
  await api('POST', '/api/vendas', {
    clienteNome: 'Juliana Negri', data: '2026-08-30', itens: [{ sku: P('ERRADO'), qtd: 1 }],
  });

  await page.evaluate(() => switchTab('cli:juliana negri'));
  await page.waitForTimeout(2000);

  const botoes = page.locator('#view-cliente .tl-item .vd-lapis');
  verdade('o item tem ação de corrigir código', (await botoes.count()) >= 2,
    String(await botoes.count()));
  await botoes.nth(1).click();
  await page.waitForTimeout(600);
  verdade('o modal de correção abriu',
    await page.locator('#corrOverlay').evaluate((e) => e.classList.contains('show')));

  /* código inexistente: recusado ANTES de confirmar */
  await page.fill('#cor-sku', 'NAO-EXISTE-MESMO');
  /* o catálogo em memória não conhece o código, então a tela pergunta ao
     servidor depois de uma pausa de digitação — a espera aqui é essa pausa
     mais a ida e volta */
  await page.waitForTimeout(1500);
  verdade('código fora do catálogo é barrado na hora',
    /Nenhuma peça/.test(await page.locator('#cor-achado').innerText()));
  eq('e o botão de confirmar fica desligado',
    await page.locator('#corConfirm').isDisabled(), 'true');

  /* o código certo mostra QUAL peça é antes de confirmar */
  await page.fill('#cor-sku', P('CERTO'));
  await page.waitForTimeout(2500);
  const achado = await page.locator('#cor-achado').innerText();
  verdade('o código certo mostra a peça antes de confirmar',
    /Brinco Argola Média/.test(achado), achado.trim());
  eq('e libera o confirmar', await page.locator('#corConfirm').isDisabled(), 'false');

  const antes = await api('GET', '/api/state');
  const saldoDe = (st, sku) => Number((st.corpo?.produtos ?? []).find((x) => x.sku === sku)?.qtd ?? -1);

  await page.fill('#cor-motivo', 'Código lançado errado no balcão');
  await page.click('#corConfirm');
  await page.waitForTimeout(2500);

  eq('o modal fechou', await page.locator('#corrOverlay').evaluate((e) => e.classList.contains('show')), 'false');
  const depois = await api('GET', '/api/state');
  eq('o código errado recebeu a peça de volta',
    saldoDe(depois, P('ERRADO')), saldoDe(antes, P('ERRADO')) + 1);
  eq('e o certo baixou uma',
    saldoDe(depois, P('CERTO')), saldoDe(antes, P('CERTO')) - 1);

  const ficha = await page.locator('#view-cliente').innerText();
  verdade('a ficha mostra o texto da auditoria',
    /SKU corrigido de .* para .* em \d{2}\/\d{2}\/\d{4}/.test(ficha),
    (ficha.match(/SKU corrigido[^\n]*/) || [''])[0]);
  verdade('e a peça certa aparece no histórico', /Brinco Argola Média/.test(ficha));

  const conf = await api('GET', '/api/estoque/conferir');
  eq('a razão fecha depois da correção',
    JSON.stringify(conf.corpo?.divergentes ?? []), '[]');
}

console.log('\n=== 6. Central de Pendências resolve a variação (§42) ===');
{
  /* o caso do print: código com aro, peça vendida sem dizer qual */
  await api('POST', '/api/produtos/importar', {
    produtos: [{ sku: P('ARO'), desc: 'Anel Solitário Coroa', preco: 109, cat: 'Anéis', qtd: 6 }],
  });
  await api('PUT', `/api/produtos/${encodeURIComponent(P('ARO'))}/variacoes`, {
    atributos: [{ nome: 'Aro', valores: ['16', '18'] }],
  });
  await api('POST', `/api/produtos/${encodeURIComponent(P('ARO'))}/repartir`, {
    distribuicao: { 16: 3, 18: 3 },
  });
  const v = await api('POST', '/api/vendas', {
    clienteNome: 'Andreia Aparecida', data: '2026-09-04', itens: [{ sku: P('ARO'), qtd: 1 }],
  });
  eq('venda sem variação registrada', v.status, 201);

  await page.evaluate(() => switchTab('pendencias'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => setSecaoPend('central'));
  await page.waitForTimeout(1200);

  const central = page.locator('#view-pendencias .panel', { hasText: 'Central de pendências' });
  verdade('a Central existe na aba Pendências', await central.count() > 0);

  const chave = await page.evaluate(() => {
    const p = (centralPend?.pendencias ?? []).find((x) => x.motivo === 'variacao_da_venda');
    return p ? p.chave : null;
  });
  verdade('a venda sem variação está na Central', !!chave, String(chave));

  /* filtros por tipo */
  await page.evaluate(() => setFiltroCentral('venda'));
  await page.waitForTimeout(1200);
  const soVendas = await page.evaluate(() =>
    (centralPend?.pendencias ?? []).every((x) => x.tipo === 'venda'));
  verdade('o filtro por tipo funciona', soVendas);

  /* resolver dentro da própria linha */
  await page.evaluate((k) => alternarPendencia(k), chave);
  await page.waitForTimeout(600);
  const opcoes = await page.locator('.pend-linha.escolha').count();
  eq('oferece as variações já cadastradas', opcoes, 2);
  const texto = await page.locator('.pend-form').first().innerText();
  verdade('e diz que escolher não baixa estoque de novo',
    /não baixa estoque de novo/.test(texto));

  const antes = await api('GET', '/api/state');
  const saldoDe = (st, sku) => Number((st.corpo?.produtos ?? []).find((x) => x.sku === sku)?.qtd ?? -1);

  await page.locator('.pend-linha.escolha input[type="radio"]').nth(1).check();
  await page.locator('.pend-form .btn-gold').first().click();
  await page.waitForTimeout(2500);

  const depois = await api('GET', '/api/state');
  eq('o estoque NÃO mudou ao resolver',
    saldoDe(depois, P('ARO')), saldoDe(antes, P('ARO')));
  const aindaLa = await page.evaluate((k) =>
    (centralPend?.pendencias ?? []).some((x) => x.chave === k), chave);
  verdade('e a pendência saiu da lista sozinha', !aindaLa);

  const dia = await api('GET', '/api/vendas?data=2026-09-04');
  const venda = (dia.corpo ?? []).find((x) => x.id === v.corpo.id);
  eq('a linha da venda passou a dizer o aro', venda && venda.itens[0].variacao, '18');

  const conf = await api('GET', '/api/estoque/conferir');
  eq('a razão fecha depois de resolver',
    JSON.stringify(conf.corpo?.divergentes ?? []), '[]');
}

console.log('\n=== 7. Monte seu Colar, no mesmo carrinho (§43) ===');
{
  await api('POST', '/api/produtos/importar', {
    produtos: [
      { sku: P('VENEZ'), desc: 'Colar Veneziana', preco: 79, cat: 'Colares', qtd: 10 },
      { sku: P('VERDE'), desc: 'Pingente Filho Verde', preco: 35, cat: 'Pingentes', qtd: 4 },
      { sku: P('ROSA'), desc: 'Pingente Filha Rosa', preco: 35, cat: 'Pingentes', qtd: 5 },
      { sku: P('AZUL'), desc: 'Pingente Filho Azul', preco: 35, cat: 'Pingentes', qtd: 3 },
    ],
  });
  const mod = await api('POST', '/api/personalizacao/modelos', {
    nome: 'Colar personalizado — 3 filhos', slug: 'ui-3-filhos',
    slotsMin: 3, slotsMax: 3, baseSkuPadrao: P('VENEZ'), precoSugerido: 149,
    opcoes: [
      { componenteSku: P('VERDE'), rotulo: 'Menino Verde', grupo: 'Menino' },
      { componenteSku: P('AZUL'), rotulo: 'Menino Azul', grupo: 'Menino' },
      { componenteSku: P('ROSA'), rotulo: 'Menina Rosa', grupo: 'Menina' },
    ],
  });
  eq('modelo cadastrado', mod.status, 200);

  await page.evaluate(() => switchTab('vendas'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { modelosColar = null; });
  await page.evaluate(() => novaVendaPersonalizada());
  await page.waitForTimeout(2500);

  verdade('o box "Monte seu colar" abriu dentro da venda',
    await page.locator('.colar-box').isVisible());
  const cab = await page.locator('.colar-cab').innerText();
  verdade('e diz que vai para o mesmo carrinho', /mesmo carrinho/.test(cab), cab.replace(/\n/g, ' '));
  eq('com três posições, como o modelo manda',
    await page.locator('.colar-slot select').count(), 3);

  /* escolher menino verde, menina rosa, menino azul — o exemplo do pacote */
  const ids = await page.evaluate(() => {
    const m = modelosColar.modelos.find((x) => x.slug === 'ui-3-filhos');
    const p = (r) => String(m.opcoes.find((o) => o.rotulo === r).id);
    return [p('Menino Verde'), p('Menina Rosa'), p('Menino Azul')];
  });
  for (const [i, id] of ids.entries()) {
    await page.locator('.colar-slot select').nth(i).selectOption(id);
    await page.waitForTimeout(300);
  }
  const resumo = await page.locator('.colar-resumo').innerText();
  verdade('o resumo diz o que sai do estoque ANTES de confirmar',
    /Sai do estoque/.test(resumo) && /Veneziana/.test(resumo), resumo.replace(/\n/g, ' '));

  await page.locator('.colar-box .btn-gold').click();
  await page.waitForTimeout(700);
  const carrinho = await page.locator('#vd-personalizados').innerText();
  verdade('a composição entrou no carrinho',
    /3 filhos/.test(carrinho) && /Menino Verde/.test(carrinho), carrinho.replace(/\n/g, ' '));
  const rodape = await page.locator('#vd-resumo').innerText();
  verdade('e soma no total da venda', /149/.test(rodape.replace(/\./g, '')), rodape.replace(/\n/g, ' '));
  verdade('a caixinha de "estoque já refletido" aparece',
    await page.locator('.colar-refletido').isVisible());

  const antes = await api('GET', '/api/state');
  const saldoDe = (st, sku) => Number((st.corpo?.produtos ?? []).find((x) => x.sku === sku)?.qtd ?? -1);

  await page.fill('#vd-cliente', 'Cliente do Colar UI');
  await page.click('#vdConfirm');
  await page.waitForTimeout(3000);

  const depois = await api('GET', '/api/state');
  eq('a base baixou uma', saldoDe(depois, P('VENEZ')), saldoDe(antes, P('VENEZ')) - 1);
  eq('o verde baixou um', saldoDe(depois, P('VERDE')), saldoDe(antes, P('VERDE')) - 1);
  eq('a rosa baixou uma', saldoDe(depois, P('ROSA')), saldoDe(antes, P('ROSA')) - 1);
  eq('o azul baixou um', saldoDe(depois, P('AZUL')), saldoDe(antes, P('AZUL')) - 1);

  const conf = await api('GET', '/api/estoque/conferir');
  eq('a razão fecha depois da venda personalizada',
    JSON.stringify(conf.corpo?.divergentes ?? []), '[]');

  /* o histórico mostra a composição, não quatro peças soltas */
  await page.evaluate(() => switchTab('cli:cliente do colar ui'));
  await page.waitForTimeout(2000);
  const ficha = await page.locator('#view-cliente').innerText();
  verdade('a ficha mostra a venda personalizada', /3 filhos/.test(ficha),
    (ficha.match(/[^\n]*3 filhos[^\n]*/) || [''])[0]);
}

console.log('\n=== 8. o console ficou limpo ===');
eq('nenhum erro de JavaScript', erros.length, 0);
if (erros.length) erros.slice(0, 6).forEach((e) => console.log('     ' + e));

await browser.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
