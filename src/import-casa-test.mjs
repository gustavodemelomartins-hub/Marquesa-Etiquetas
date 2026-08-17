/** Prova o botão "os números são total ou só em casa?" da importação.
 *
 *  O risco que ele existe para evitar: uma planilha que só contou a
 *  prateleira, comparada direto contra o total do sistema, corta a peça
 *  que só está numa maleta aberta — não sumiu, só mudou de lugar.
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

const saldo = async sku => (await api('GET', '/api/state')).produtos.find(p => p.sku === sku).qtd;

/* Cada planilha ganha um nome próprio, mesmo quando o conteúdo se repete
   (testes 1 e 2 usam qtd=7 nos dois). Escolher o "mesmo" arquivo duas vezes
   não dispara o evento `change` do campo — é assim que o navegador
   funciona, não é o app que ignora. */
let seq = 0;
function planilhaCom(qtdC1) {
  const dados = [['ID Produto Marquesa', 'Nome Produto', 'Estoque atual', 'Valor de Venda'],
    ['C1', 'Colar Cenário Teste', qtdC1, 100]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), 'Estoque');
  const arquivo = path.join(AQUI, `planilha-casa-${qtdC1}-${seq++}.xlsx`);
  XLSX.writeFile(wb, arquivo);
  return arquivo;
}

console.log('=== cenário: C1 tem 10 no total, 3 numa maleta aberta (7 deveriam estar em casa) ===');
await api('POST', '/api/produtos/importar', { produtos: [
  { sku: 'C1', desc: 'Colar Cenário Teste', cat: 'Colar', preco: 100, qtd: 10 },
] });
await api('POST', '/api/revendedoras', { nome: 'Rev Cenário' });
const rev = (await api('GET', '/api/state')).revendedoras.find(r => r.nome === 'Rev Cenário');
const mal = await api('POST', '/api/maletas', { revId: rev.id });
await api('POST', `/api/maletas/${mal.id}/itens`, { itens: { C1: 3 } });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
let confirmText = '';
page.on('dialog', d => { confirmText = d.message(); d.accept(); });

await page.goto(URL_APP);
await page.waitForTimeout(600);
await page.fill('#cf-url', URL_API);
await page.fill('#cf-key', KEY);
await page.click('#conexaoOverlay .btn-gold');
await page.waitForTimeout(1200);

async function importar(arquivo, modo) {
  confirmText = '';
  await page.evaluate(() => openImport());
  await page.waitForTimeout(150);
  await page.setInputFiles('#impFile', arquivo);
  await page.waitForTimeout(700);
  if (modo) await page.click(`#impModoCasa input[value="${modo}"]`);
  await page.click('#impStep2 .btn-gold');
  await page.waitForTimeout(1200);
}

console.log('\n=== 1. modo "total" (padrão) contra uma planilha que só contou a prateleira ===');
await importar(planilhaCom(7), 'total');
eq('avisou a mudança de -3 antes de aplicar', /-3\s+C1|C1.*-3/.test(confirmText), 'true');
eq('e cortou a peça que só estava na maleta — é o risco que o modo existe para evitar',
  await saldo('C1'), 7);

console.log('\n=== desfaz o efeito do teste 1, volta ao cenário ===');
await api('POST', '/api/produtos/C1/movimento', { tipo: 'ajuste', quantidade: 3, obs: 'restaurando o cenário' });
eq('C1 de volta a 10', await saldo('C1'), 10);
// o ajuste acima foi direto na API, por fora da página — sem isto, o
// `state` que o navegador guarda em memória continuaria achando que C1
// tem 7, e o teste 2 partiria de um número que já não é mais verdade
await page.evaluate(() => sincronizar());
await page.waitForTimeout(300);

console.log('\n=== 2. modo "em casa": mesma planilha (7), mas a realidade já bate ===');
await importar(planilhaCom(7), 'casa');
eq('7 em casa + 3 na maleta = 10 → nada mudou, sem nem perguntar', confirmText, '');
eq('C1 continua 10 — a peça na maleta não foi descontada', await saldo('C1'), 10);

console.log('\n=== 3. modo "em casa" com falta real: a planilha agora diz 6, não 7 ===');
await importar(planilhaCom(6), 'casa');
eq('avisou -1, não -4 — a diferença é só a peça que falta de verdade', /-1\s+C1|C1.*-1/.test(confirmText), 'true');
eq('C1 foi para 9 (6 em casa + 3 na maleta)', await saldo('C1'), 9);

console.log('\n=== a razão fecha no final (§19) ===');
const conf = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos', conf.divergentes.length, 0);

fs.readdirSync(AQUI).filter(f => f.startsWith('planilha-casa-'))
  .forEach(f => fs.unlinkSync(path.join(AQUI, f)));
await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
