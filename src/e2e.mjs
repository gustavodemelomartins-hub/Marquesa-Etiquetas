import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* as fixturas moram ao lado deste arquivo — o teste roda de qualquer pasta */
const AQUI = path.dirname(fileURLToPath(import.meta.url));

const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, extra = '') => console.log(`  ok   ${t}${extra ? '  → ' + extra : ''}`);
const bad = (t, extra = '') => { falhas++; console.log(`  FALHA ${t}${extra ? '  → ' + extra : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

const erros = [];
let vigiando = false;   /* o 401 da chave errada é de propósito, não conta */
page.on('console', m => { if (vigiando && m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', e => erros.push('pageerror: ' + e.message));
page.on('dialog', d => d.accept('Revendedora Teste'));

const st = () => page.evaluate(() => state);

console.log('\n=== portal de conexão ===');
await page.goto(URL_APP);
await page.waitForTimeout(600);
eq('a tela de conexão aparece sozinha',
  await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show')), 'true');

await page.fill('#cf-url', URL_API);
await page.fill('#cf-key', 'chave-errada');
await page.click('#conexaoOverlay .btn-gold');
await page.waitForTimeout(900);
eq('chave errada é recusada com aviso', await page.textContent('#cf-fb'), 'Chave incorreta.');
eq('e não deixa entrar',
  await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show')), 'true');

await page.fill('#cf-key', KEY);
await page.click('#conexaoOverlay .btn-gold');
await page.waitForTimeout(1200);
eq('chave certa conecta',
  await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show')), 'false');
vigiando = true;

console.log('\n=== importar catálogo (planilha fictícia) ===');
await page.evaluate(() => openImport());
await page.setInputFiles('#impFile', path.join(AQUI, 'catalogo-fake.xlsx'));
await page.waitForTimeout(900);
eq('a aba Estoque foi reconhecida como catálogo',
  await page.locator('#impAlvo0').inputValue(), 'catalogo');
await page.click('#impStep2 .btn-gold');
await page.waitForTimeout(2000);

let s = await st();
eq('4 códigos no catálogo (o sufixo -2 somou no base)', s.produtos.length, 4);
eq('900001 ficou com 13 peças (10 + 3 do sufixo)',
  s.produtos.find(p => p.sku === '900001').qtd, 13);
eq('900004 entrou sem preço, não com R$ 0',
  s.produtos.find(p => p.sku === '900004').preco, 'null');
eq('cabeçalho mostra o total', await page.textContent('#hdPecas'), '38');

console.log('\n=== revendedora pela tela ===');
await page.evaluate(() => openRevForm());
await page.fill('#rf-nome', 'Revendedora Teste');
await page.fill('#rf-cidade', 'Cidade Teste');
await page.click('#revOverlay .btn-gold');
await page.waitForTimeout(1200);
s = await st();
eq('revendedora criada', s.revendedoras.length, 1);
eq('nasce ativa', s.revendedoras[0].status, 'ativa');
const revId = s.revendedoras[0].id;

console.log('\n=== montar maleta bipando ===');
await page.evaluate(rid => novaMaleta(rid), revId);
await page.waitForTimeout(1200);
eq('abriu a tela de bipagem',
  await page.locator('#scanOverlay').evaluate(e => e.classList.contains('show')), 'true');

for (const code of ['900001', '900001', '900002', '900002', '900003', '900003']) {
  await page.fill('#scanInput', code);
  await page.press('#scanInput', 'Enter');
  await page.waitForTimeout(120);
}
eq('a bipagem contou 6 peças', await page.textContent('#scanQtd'), '6');

await page.fill('#scanInput', '999999');
await page.press('#scanInput', 'Enter');
await page.waitForTimeout(250);
eq('código fora do catálogo é recusado na hora', await page.textContent('#scanQtd'), '6');

await page.click('#scanConfirm');
await page.waitForTimeout(2000);
s = await st();
const mal = s.maletas.find(m => m.revId === revId && (m.status === 'aberta' || m.status === 'em_acerto'));
eq('a maleta guardou 6 peças',
  Object.values(mal.itens).reduce((a, b) => a + b, 0), 6);
eq('o preço do envio ficou congelado', mal.precos['900001'], 500);
eq('consignar não muda o total da operação', await page.textContent('#hdPecas'), '38');
eq('900001: 13 no total, 2 fora',
  s.produtos.find(p => p.sku === '900001').consignado, 2);

console.log('\n=== acerto ===');
await page.evaluate(id => openAcerto(id), mal.id);
await page.waitForTimeout(500);
for (const code of ['900001', '900002', '900003']) {
  await page.fill('#scanInput', code);
  await page.press('#scanInput', 'Enter');
  await page.waitForTimeout(120);
}
await page.click('#scanConfirm');
await page.waitForTimeout(900);

const preview = await page.evaluate(() => {
  acerto.faltas.forEach((f, i) => f.linhas.forEach((l, j) => acSetDestino(i, j, 'vendida')));
  const m = state.maletas.find(x => x.id === acerto.maletaId);
  const vend = [];
  acerto.faltas.forEach(f => f.linhas.forEach(l => { if (l.destino === 'vendida' && l.qtd > 0) vend.push({ sku: f.sku, qtd: l.qtd }); }));
  return calcComissao(vend, m);
});
// banhadas = 500 + 400 = 900 → faixa até 1000 = 15%; prata 200 → 10% fixo
eq('faixa sai só das banhadas (900 → 15%)', preview.pct, 15);
eq('total vendido inclui a prata', preview.totalVendido, 1100);
eq('comissão = 135 (banhadas) + 20 (prata)', preview.comissao, 155);
eq('líquido a receber', preview.liquido, 945);

await page.evaluate(() => confirmarAcerto());
await page.waitForTimeout(2500);
s = await st();
const enc = s.maletas.find(m => m.id === mal.id);
eq('a maleta foi encerrada', enc.status, 'encerrada');
eq('o servidor concorda com a prévia da comissão', enc.acerto.comissao, 155);
eq('e com o líquido', enc.acerto.liquido, 945);
eq('as vendidas saíram do estoque total (38 − 3)', await page.textContent('#hdPecas'), '35');
eq('as devolvidas voltaram: nada mais consignado',
  s.produtos.reduce((a, p) => a + p.consignado, 0), 0);

console.log('\n=== recarregar a página (outro aparelho) ===');
await page.reload();
await page.waitForTimeout(2000);
eq('não pede a chave de novo',
  await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show')), 'false');
s = await st();
eq('os produtos continuam lá', s.produtos.length, 4);
eq('a revendedora continua lá', s.revendedoras.length, 1);
eq('o acerto continua registrado',
  s.maletas.find(m => m.id === mal.id).acerto.comissao, 155);
eq('o total bate com o de antes de recarregar', await page.textContent('#hdPecas'), '35');

console.log('\n=== a razão fecha (§19) ===');
const conf = await fetch(URL_API + '/api/estoque/conferir', {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
eq('saldo bate com a soma dos movimentos em todo SKU', conf.divergentes.length, 0);

const vendas = await fetch(URL_API + '/api/vendas?data=' + new Date().toISOString().slice(0, 10), {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
eq('o acerto virou venda de verdade', vendas.filter(v => v.origem === 'acerto').length, 1);

console.log('\n=== erros de console ===');
if (erros.length) { erros.forEach(e => console.log('  ! ' + e)); bad(`${erros.length} erro(s) no console`); }
else ok('nenhum erro no console do navegador');

await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
