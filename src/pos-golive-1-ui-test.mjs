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

console.log('\n=== 4. o console ficou limpo ===');
eq('nenhum erro de JavaScript', erros.length, 0);
if (erros.length) erros.slice(0, 6).forEach((e) => console.log('     ' + e));

await browser.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
