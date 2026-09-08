/** Pacote 1 — cabeçalho, navegação em camadas e busca global.
 *
 * Roda contra o Worker e o painel locais. Cadastra apenas duas clientes de
 * ensaio; não toca estoque, Nuvemshop ou produção.
 */
import { chromium } from 'playwright';

const APP = 'http://localhost:8000/dashboard.html';
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (texto, detalhe = '') => console.log(`  ok   ${texto}${detalhe ? `  → ${detalhe}` : ''}`);
const falha = (texto, detalhe = '') => {
  falhas++;
  console.log(`  FALHA ${texto}${detalhe ? `  → ${detalhe}` : ''}`);
};
const igual = (texto, atual, esperado) =>
  String(atual) === String(esperado)
    ? ok(texto, String(atual))
    : falha(texto, `esperava ${esperado}, veio ${atual}`);

async function api(metodo, caminho, corpo) {
  const resposta = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const json = await resposta.json();
  if (!resposta.ok) throw new Error(`${metodo} ${caminho}: ${JSON.stringify(json)}`);
  return json;
}

const vitoria = await api('POST', '/api/clientes', {
  nome: 'Vitória Nunes',
  tel: '(14) 99999-1122',
  cidade: 'Bauru',
});
await api('POST', '/api/clientes', {
  nome: 'Vitória Prado',
  tel: '(11) 98888-7766',
  cidade: 'Jaú',
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const errosConsole = [];
page.on('console', (mensagem) => {
  if (mensagem.type() === 'error') errosConsole.push(mensagem.text());
});
page.on('pageerror', (erro) => errosConsole.push(erro.message));

await page.addInitScript(({ url, key }) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
}, { url: API, key: KEY });
await page.goto(APP);
await page.waitForFunction(() => state && Array.isArray(state.produtos));

console.log('\n=== 1. cabeçalho e navegação em duas camadas ===');
igual(
  'as quatro áreas principais continuam na ordem operacional',
  (await page.locator('#tabsNav .tab').allTextContents()).map((x) => x.trim()).join('|'),
  'Estoque|Revendedoras|Vendas|Etiquetas',
);
igual(
  'Estoque mantém a subnavegação final dos Pacotes 1–4',
  (await page.locator('#tabsSubNav .tab').allTextContents()).map((x) => x.replace(/\d+/g, '').trim()).join('|'),
  'Visão Geral|Cadastro de Produtos|Publicar na Nuvemshop|Nuvemshop|Central',
);
igual('a busca global está no cabeçalho', await page.locator('#clientSearchInput').count(), 1);
igual('o perfil é explicitamente um placeholder', await page.locator('.profile-placeholder').getAttribute('aria-label'), 'Perfil do usuário, disponível em breve');

console.log('\n=== 2. busca por nome, sem decidir entre homônimas ===');
await page.locator('#clientSearchInput').fill('vitoria');
await page.locator('.client-search-result').first().waitFor();
igual('as duas Vitórias aparecem', await page.locator('.client-search-result').count(), 2);
const resultados = (await page.locator('.client-search-result').allTextContents()).join(' ');
igual('cidade e telefone distinguem as duas pessoas', /Bauru/.test(resultados) && /Jaú/.test(resultados), true);

console.log('\n=== 3. teclado e abertura por identidade forte ===');
await page.locator('#clientSearchInput').press('ArrowDown');
igual('a primeira opção fica selecionada', await page.locator('.client-search-result').first().getAttribute('aria-selected'), 'true');
await page.locator('#clientSearchInput').press('Enter');
await page.waitForFunction((id) => tabAtual === `cli:#${id}`, vitoria.id);
igual('a ficha abre pelo id cadastral', await page.evaluate(() => tabAtual), `cli:#${vitoria.id}`);
igual('a navegação principal muda para Vendas', await page.locator('#tabsNav .tab[aria-current="page"]').innerText(), 'Vendas');

console.log('\n=== 4. busca por telefone ===');
await page.locator('#clientSearchInput').fill('999991122');
await page.locator('.client-search-result').first().waitFor();
igual('o telefone encontra a cliente certa', await page.locator('.client-search-result b').first().innerText(), 'Vitória Nunes');

console.log('\n=== 5. o resultado do React abre a rota legada por ID ===');
await page.goto(`${APP}?clienteId=${vitoria.id}`);
await page.waitForFunction((id) => tabAtual === `cli:#${id}`, vitoria.id);
igual('o deep-link abre a mesma ficha forte', await page.evaluate(() => tabAtual), `cli:#${vitoria.id}`);

console.log('\n=== 6. limpeza segura de ação duplicada ===');
await page.evaluate(() => switchTab('revgeral'));
await page.waitForTimeout(500);
igual('a subnavegação mantém uma ação + Nova', await page.locator('#tabsSubNav .addtab').count(), 1);
igual(
  'a faixa de resumo não repete a ação',
  await page.locator('#view-revgeral .actbar button', { hasText: 'Nova revendedora' }).count(),
  0,
);

console.log('\n=== 7. celular ===');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => switchTab('geral'));
const largura = await page.evaluate(() => ({ pagina: document.documentElement.scrollWidth, janela: innerWidth }));
igual('o shell não cria rolagem horizontal', largura.pagina <= largura.janela + 1, true);
igual('a busca continua visível', await page.locator('#clientSearchInput').isVisible(), true);
igual('o perfil continua identificado sem prometer login', await page.locator('.profile-placeholder').isVisible(), true);

console.log('\n=== 8. console ===');
igual('nenhum erro no navegador', errosConsole.length, 0);
if (errosConsole.length) errosConsole.slice(0, 5).forEach((erro) => console.log(`    ${erro}`));

await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
