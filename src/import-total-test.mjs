/** Importar Estoque Total, agora com uma regra fixa em vez de uma pergunta.
 *
 *  ESTE TESTE SUBSTITUI `import-casa-test.mjs`, e o motivo é uma decisão de
 *  negócio, não um teste que ficou chato de manter.
 *
 *  Antes, a tela perguntava: "os números desta planilha são o TOTAL ou só o
 *  que está EM CASA?". A pergunta existia por um risco real — uma planilha
 *  que só contou a prateleira, comparada contra o total do sistema, corta a
 *  peça que está numa maleta aberta, e ela não sumiu: só mudou de lugar.
 *
 *  O problema é que as duas respostas parecem certas na hora de responder, e
 *  a errada estraga estoque em silêncio. A operação decidiu tirar a escolha:
 *  a planilha desta tela SEMPRE é o estoque total da Marquesa — casa mais
 *  revendedoras. Uma regra fixa que a pessoa pode aprender uma vez vale mais
 *  que uma pergunta que ela precisa acertar toda vez.
 *
 *  O que fica provado aqui:
 *
 *   1. o seletor "total × só em casa" não existe mais na tela;
 *   2. nem o seletor de destino da aba (que oferecia "Catálogo e estoque
 *      total" e as opções de revendedora) no caminho do estoque;
 *   3. a planilha é lida como TOTAL, sempre, sem ninguém escolher nada;
 *   4. a análise continua vindo ANTES de aplicar, com o diff na tela;
 *   5. e a aba Loja, que usa a mesma janela para outra coisa, continua
 *      funcionando.
 */
import { chromium } from 'playwright';
import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const saldo = async sku => {
  const p = (await api('GET', '/api/state')).produtos.find(x => x.sku === sku);
  return p ? p.qtd : null;
};

/* Cada planilha ganha um nome próprio, mesmo com o conteúdo repetido:
   escolher o "mesmo" arquivo duas vezes não dispara o evento `change` do
   campo — é assim que o navegador funciona, não é o app que ignora. */
let seq = 0;
const criados = [];
function planilhaCom(qtdC1) {
  const dados = [['ID Produto Marquesa', 'Nome Produto', 'Estoque atual', 'Valor de Venda'],
    ['C1', 'Colar Cenário Teste', qtdC1, 100]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), 'Estoque');
  const arquivo = path.join(AQUI, `planilha-total-${qtdC1}-${seq++}.xlsx`);
  XLSX.writeFile(wb, arquivo);
  criados.push(arquivo);
  return arquivo;
}

/* ---------------------------------------------------------- o cenário
   C1 tem 10 no total e 3 numa maleta aberta — 7 estão em casa. É o mesmo
   cenário do teste antigo de propósito: é nele que a diferença entre "total"
   e "em casa" aparecia. */
await api('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'C1', desc: 'Colar Cenário Teste', cat: 'Colar', preco: 100, qtd: 10 }],
});
const rev = await api('POST', '/api/revendedoras', { nome: 'Teste Estoque Total' });
const maleta = await api('POST', '/api/maletas', { revId: rev.id });
await api('POST', `/api/maletas/${maleta.id}/itens`, { itens: { C1: 3 } });

console.log('\n=== cenário: C1 tem 10 no total, 3 numa maleta aberta ===');
eq('C1 começa com 10', await saldo('C1'), 10);

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
page.on('dialog', d => d.accept());
const errosConsole = [];
page.on('console', m => { if (m.type() === 'error') errosConsole.push(m.text()); });

await page.goto(URL_APP);
await page.waitForTimeout(600);
await page.fill('#cf-url', URL_API);
await page.fill('#cf-key', KEY);
await page.click('#conexaoOverlay .btn-gold');
await page.waitForTimeout(1200);

console.log('\n=== 1. a pergunta "total ou só em casa?" não existe mais ===');
await page.evaluate(() => openImport());
await page.waitForTimeout(200);
await page.setInputFiles('#impFile', planilhaCom(7));
await page.waitForTimeout(800);

eq('o bloco do seletor sumiu do HTML', await page.locator('#impModoCasa').count(), 0);
eq('e nenhum rádio de modo sobrou', await page.locator('input[name="impModo"]').count(), 0);

console.log('\n=== 2. nem o seletor de destino da aba ===');
/* "Catálogo e estoque total" era uma escolha entre outras, ao lado das
   opções de revendedora. No caminho do estoque não há mais o que escolher:
   a aba de catálogo É o estoque total. */
const textoDaTela = await page.locator('#impStep2').innerText();
eq('não oferece mais "Catálogo e estoque total"',
  /Catálogo e estoque total/i.test(textoDaTela), 'false');
eq('não oferece mais criar maleta de revendedora aqui',
  /Criar maleta de/i.test(textoDaTela), 'false');
eq('e diz, em palavras, o que a planilha significa',
  /estoque total/i.test(textoDaTela), 'true');

console.log('\n=== 3. a planilha é lida como TOTAL, sem ninguém escolher ===');
/* A planilha diz 7. O sistema tem 10. Lendo como total, o ajuste é −3 — e
   isso é o certo: a planilha de estoque total inclui o que está com as
   revendedoras, então 7 significa mesmo que três peças sumiram. */
await page.click('#impStep2 .btn-gold');            // Analisar planilha
await page.waitForTimeout(1200);
const laudo = await page.evaluate(() => ({
  modo: impModo,
  resumo: impAnalise.resumo,
  mudam: impAnalise.mudam.itens,
}));
eq('o modo é "total", fixo', laudo.modo, 'total');
const delta = (laudo.mudam.find(x => x.sku === 'C1') || {}).delta;
eq('a análise anunciou −3 ANTES de aplicar', delta, -3);
eq('e nada foi aplicado ainda — C1 continua 10', await saldo('C1'), 10);

console.log('\n=== 4. aplicar é o segundo ato, e é ele que escreve ===');
await page.click('#impStep3 .mfoot .btn-gold');     // Aplicar
await page.waitForTimeout(1400);
eq('C1 passou a 7, como a planilha dizia', await saldo('C1'), 7);

console.log('\n=== 5. a razão continua fechando (§19) ===');
const conf = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos', conf.divergentes.length, 0);

console.log('\n=== 6. a aba Loja usa a mesma janela para outra coisa, e continua ===');
/* A janela é compartilhada: o export da própria Nuvemshop entra por ela,
   pela aba Loja, e ali o seletor de destino continua fazendo sentido. Foi
   por isso que `openImport` ganhou contexto em vez de perder o seletor de
   vez. */
await page.evaluate(() => closeImport());
await page.waitForTimeout(200);
await page.evaluate(() => openImport('loja'));
await page.waitForTimeout(200);
eq('a janela abre no contexto da loja', await page.evaluate(() => impContexto), 'loja');
await page.evaluate(() => closeImport());

console.log('\n=== 7. nenhum erro de console ===');
eq('o navegador não reclamou de nada', errosConsole.length, 0);
if (errosConsole.length) errosConsole.slice(0, 3).forEach(e => console.log('    ' + e));

for (const f of criados) { try { fs.unlinkSync(f); } catch (e) { /* já foi */ } }
await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
