/** Teste ponta a ponta da tela "Estoque Total" (React), fluxo
 *  "Atualizar Estoque Total".
 *
 *  O que precisa ficar provado aqui:
 *
 *   1. o fluxo é Selecionar → Analisar → Revisar → Aprovar/Rejeitar →
 *      Confirmar → Aplicar → Resultado, e nada escreve antes da
 *      confirmação
 *   2. os números do resumo vêm da API, não são inventados no cliente
 *   3. um SKU cuja quantidade muda vira alteração comum, aprovável
 *   4. um SKU cujo total da planilha é menor que o consignado vira
 *      CONFLITO — não pode ser aprovado, e o estoque real não muda
 *   5. um SKU do catálogo ausente da planilha é só informativo, nunca
 *      zerado
 *   6. depois do Apply, o estoque físico (produtos.qtd) reflete só o que
 *      foi aprovado — e passou pelo motor de reconciliação de verdade
 *      (não um UPDATE direto)
 *   7. nenhum erro de console
 *
 *  Precisa do build pronto (`npm run build` dentro de frontend/) e do
 *  Worker local no ar em localhost:8787, com o dashboard/frontend servidos
 *  em localhost:8000 (mesmo protocolo de src/frontend-e2e.mjs). Não toca a
 *  Nuvemshop — este fluxo não fala com ela.
 */
import * as XLSX from 'xlsx';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const URL_APP = 'http://localhost:8000/frontend/dist/index.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));
const contem = (t, texto, trecho) =>
  (String(texto).includes(trecho) ? ok(t) : bad(t, `não achei "${trecho}"`));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

/* ---------------------------------------------------------- o cenário
 *
 *   ET1  vai de 4 para 7 na planilha       → alteração comum
 *   ET2  igual nas duas                    → sem alteração
 *   ET3  planilha diz 2, mas tem 3 numa maleta aberta → CONFLITO
 *   ET4  existe no catálogo, some da planilha → só informativo
 *   (ET5, na planilha, não existe no catálogo → "novos", não é criado aqui)
 */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'ET1', desc: 'Brinco Argola Fixture', cat: 'Brinco', preco: 90, qtd: 4 },
    { sku: 'ET2', desc: 'Colar Fino Fixture', cat: 'Colar', preco: 60, qtd: 10 },
    { sku: 'ET3', desc: 'Pulseira Consignada Fixture', cat: 'Pulseira', preco: 80, qtd: 5 },
    { sku: 'ET4', desc: 'Anel Ausente Fixture', cat: 'Anel', preco: 40, qtd: 6 },
  ],
});

const rev = await api('POST', '/api/revendedoras', { nome: 'Fixture E2E Estoque Total' });
const maleta = await api('POST', '/api/maletas', { revId: rev.id });
await api('POST', `/api/maletas/${maleta.id}/itens`, { itens: { ET3: 3 } });

/* ------------------------------------------------------- a planilha */
const wb = XLSX.utils.book_new();
const aba = XLSX.utils.aoa_to_sheet([
  ['SKU', 'Descrição', 'Quantidade', 'Preço'],
  ['ET1', 'Brinco Argola Fixture', 7, 90],
  ['ET2', 'Colar Fino Fixture', 10, 60],
  ['ET3', 'Pulseira Consignada Fixture', 2, 80],
  ['ET5', 'Peça Inexistente Fixture', 3, 30],
]);
XLSX.utils.book_append_sheet(wb, aba, 'Estoque');
const dir = mkdtempSync(join(tmpdir(), 'marquesa-e2e-'));
const arquivo = join(dir, 'Estoque Fixture.xlsx');
writeFileSync(arquivo, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));

/* ----------------------------------------------------------- navegador */

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();

const erros = [];
page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', e => erros.push('pageerror: ' + e.message));

await page.addInitScript(([url, key]) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
}, [URL_API, KEY]);

await page.goto(URL_APP);
await page.waitForSelector('.nav-item', { timeout: 15000 });

console.log('\n=== 1. navegar até Estoque Total ===');
await page.click('.nav-item:has-text("Estoque")');
await page.click('.pill:has-text("Estoque Total")');
await page.waitForSelector('.cartao-escolha', { timeout: 15000 });
ok('a escolha entre os dois modos apareceu');

console.log('\n=== 2. escolher Atualizar Estoque Total, selecionar o arquivo ===');
await page.click('.cartao-escolha:has-text("Atualizar Estoque Total")');
await page.setInputFiles('input[type="file"]', arquivo);
await page.waitForSelector('text=Estoque Fixture.xlsx', { timeout: 15000 });
ok('o arquivo foi identificado antes de analisar — nada escreveu ainda');

const antesDoAnalisar = (await api('GET', '/api/state')).produtos.find(p => p.sku === 'ET1').qtd;
eq('ET1 continua 4 — selecionar arquivo não altera nada', antesDoAnalisar, 4);

console.log('\n=== 3. analisar planilha — cria sessão, ainda não escreve ===');
await page.click('button:has-text("Analisar planilha")');
await page.waitForSelector('table.tabela', { timeout: 20000 });
ok('a tabela de revisão apareceu');

const linhas = await page.$$eval('table.tabela tbody tr', ns => ns.map(n => n.textContent));
eq('2 linhas na revisão — só ET1 (muda) e ET3 (conflito) viram item; ET2 (igual), ET4 (ausente) e ET5 (novo) não',
   linhas.length, 2);

const metricas = await page.$$eval('.metric', ns => ns.map(n => ({
  rotulo: n.querySelector('.rotulo').textContent.trim(),
  valor: n.querySelector('.valor').textContent.trim(),
})));
const metrica = r => (metricas.find(m => m.rotulo === r) || {}).valor;
eq('sem alteração: só ET2', metrica('Sem alteração'), 1);
eq('terão quantidade alterada: só ET1 (ET3 é conflito, não conta aqui)', metrica('Terão quantidade alterada'), 1);
eq('produtos novos na planilha: ET5', metrica('Produtos novos na planilha'), 1);

const avisoAusente = await page.textContent('.aviso[data-tom="neutro"]');
contem('ET4 (ausente da planilha) aparece como informativo', avisoAusente, 'não aparece');

const antesEscrever = (await api('GET', '/api/state')).produtos.find(p => p.sku === 'ET1').qtd;
eq('analisar sozinho ainda não mudou o estoque', antesEscrever, 4);

console.log('\n=== 4. conflito de consignação: não pode ser aprovado ===');
const linhaConflito = page.locator('tr', { hasText: 'ET3' });
await linhaConflito.waitFor();
const textoConflito = await linhaConflito.textContent();
contem('a linha do ET3 mostra "Precisa de revisão"', textoConflito, 'Precisa de revisão');
const botaoAprovarET3 = linhaConflito.getByRole('button', { name: 'Aprovar' });
const desabilitado = await botaoAprovarET3.isDisabled();
eq('o botão Aprovar do ET3 está desabilitado', desabilitado, 'true');

console.log('\n=== 5. aprovar só o ET1 (alteração normal) ===');
const linhaEt1 = page.locator('tr', { hasText: 'ET1' });
await linhaEt1.getByRole('button', { name: 'Aprovar' }).click();
await page.waitForSelector('button:has-text("Revisar e aplicar (1)")', { timeout: 15000 });
ok('o contador de aprovados foi para 1');

console.log('\n=== 6. rejeitar o conflito, para não deixar pendente ===');
await linhaConflito.getByRole('button', { name: 'Rejeitar' }).click();
await page.waitForTimeout(300);

console.log('\n=== 7. confirmar e aplicar ===');
await page.click('button:has-text("Revisar e aplicar (1)")');
await page.waitForSelector('text=Você aprovou 1 item', { timeout: 15000 });
const textoConfirmacao = await page.textContent('.cartao');
contem('a confirmação diz o que vai acontecer, não "Continuar"', textoConfirmacao, 'poderão modificar o estoque');

await page.click('button:has-text("Aplicar alterações")');
await page.waitForSelector('text=Importação concluída', { timeout: 20000 });
ok('a tela de resultado apareceu');

const resultado = await page.textContent('.conteudo');
contem('não diz "Tudo certo!" genérico', resultado, 'Importação concluída');

console.log('\n=== 8. o estoque real refletiu só o aprovado, via o motor (não UPDATE direto) ===');
const depois = await api('GET', '/api/state');
const et1 = depois.produtos.find(p => p.sku === 'ET1');
const et3 = depois.produtos.find(p => p.sku === 'ET3');
const et4 = depois.produtos.find(p => p.sku === 'ET4');
eq('ET1 foi de 4 para 7', et1.qtd, 7);
eq('ET3 continua 5 — o conflito nunca foi aplicado', et3.qtd, 5);
eq('ET4 continua 6 — ausente da planilha não é zerado', et4.qtd, 6);

const conferencia = await api('GET', '/api/estoque/conferir');
eq('a razão contábil fecha depois do Apply (produtos.qtd == SUM(movimentos.qtd))',
   conferencia.divergentes.length, 0);

console.log('\n=== 9. erros de console ===');
eq('nenhum erro no console do navegador', erros.length, 0);
if (erros.length) erros.slice(0, 5).forEach(e => console.log('    ' + e));

await browser.close();

console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ tudo certo');
process.exit(falhas ? 1 : 0);
