/** Tira fotos das telas para conferir o visual — celular e computador.
 *  Roda depois do e2e, que deixa o banco local com dados de exemplo. */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const destino = process.argv[2] || AQUI;
const KEY = 'troque-por-uma-chave-de-teste';

/* uma contagem deixada aberta por uma rodada anterior mudaria a Visão geral,
   e as fotos precisam sair iguais toda vez */
const st = await fetch('http://localhost:8787/api/state',
  { headers: { Authorization: 'Bearer ' + KEY } }).then(r => r.json());
if (st.inventario && st.inventario.abertoId) {
  await fetch(`http://localhost:8787/api/inventarios/${st.inventario.abertoId}/cancelar`,
    { method: 'POST', headers: { Authorization: 'Bearer ' + KEY } });
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function foto(nome, largura, altura, acao) {
  const page = await browser.newPage({ viewport: { width: largura, height: altura } });
  await page.addInitScript(k => {
    localStorage.setItem('marquesa_conexao_v1',
      JSON.stringify({ url: 'http://localhost:8787', key: k }));
  }, KEY);
  await page.goto('http://localhost:8000/dashboard.html');
  await page.waitForTimeout(1600);
  if (acao) { await acao(page); }
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(destino, nome + '.png'), fullPage: true });
  console.log('  ' + nome + '.png');
  await page.close();
}

await foto('tela-geral', 1180, 900);
await foto('tela-vendas', 1180, 900, p => p.evaluate(() => switchTab('vendas')));
await foto('tela-inventario-mob', 420, 900, async p => {
  await p.evaluate(() => iniciarInventario());
  await p.waitForTimeout(1200);
  for (const c of ['900001', '900001', '900003', '888888']) {
    await p.fill('#scanInput', c);
    await p.press('#scanInput', 'Enter');
    await p.waitForTimeout(120);
  }
});
await foto('tela-venda-mob', 420, 900, async p => {
  await p.evaluate(() => novaVenda());
  await p.waitForTimeout(500);
  for (const c of ['900001', '900002']) {
    await p.fill('#scanInput', c);
    await p.press('#scanInput', 'Enter');
    await p.waitForTimeout(120);
  }
});

await browser.close();
