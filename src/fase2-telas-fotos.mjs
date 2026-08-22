/** As telas da FASE 2, fotografadas — desktop e celular.
 *
 *  Não é teste: é a prova visual que acompanha o relatório da fase. Monta o
 *  mesmo cenário do `fase2-telas-test.mjs` (um código esperando divisão, uma
 *  peça descartável, uma peça com venda) e tira um retrato de cada tela nova.
 *
 *  Uso:  node src/fase2-telas-fotos.mjs [pasta-de-saida]
 *  Precisa do Worker em :8787 e do dashboard servido em :8000, como a suíte.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';
const SAIDA = process.argv[2] || path.join(process.cwd(), 'fotos-fase2');
fs.mkdirSync(SAIDA, { recursive: true });

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const api = (m, p, b) => fetch(URL_API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const loja = await subirLojaFalsa();

await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'ANELB', desc: 'Anel Banho e Pedra', cat: 'Anel', preco: 120, qtd: 6 },
    { sku: 'PULSEIRA', desc: 'Pulseira lisa', cat: 'Pulseira', preco: 60, qtd: 4 },
    { sku: 'DESCARTE', desc: 'Peca de teste', cat: 'Outros', preco: 10, qtd: 2 },
    { sku: 'VENDIDA', desc: 'Colar que ja vendeu', cat: 'Colar', preco: 90, qtd: 5 },
  ],
});
await api('POST', '/api/vendas', { clienteNome: 'Teste', itens: [{ sku: 'VENDIDA', qtd: 1 }] });
await api('POST', '/api/revendedoras', { nome: 'Sthefany' });

loja.estado.produtos = [
  {
    id: 30, name: { pt: 'Anel Banho e Pedra' }, handle: { pt: 'anel-banho' }, published: true,
    attributes: [{ pt: 'Banho' }, { pt: 'Pedra' }],
    images: [{ id: 3000, src: PIXEL, position: 1 }],
    variants: [
      { id: 301, sku: 'ANELB', values: [{ pt: 'Dourado' }, { pt: 'Zircônia' }], price: '120.00',
        image_id: 3000, inventory_levels: [{ location_id: 'L1', stock: 2 }] },
      { id: 302, sku: 'ANELB', values: [{ pt: 'Dourado' }, { pt: 'Cristal' }], price: '130.00',
        image_id: 3000, inventory_levels: [{ location_id: 'L1', stock: 3 }] },
      { id: 303, sku: 'ANELB', values: [{ pt: 'Ródio' }, { pt: 'Zircônia' }], price: '125.00',
        image_id: 3000, inventory_levels: [{ location_id: 'L1', stock: 1 }] },
    ],
  },
  produtoFalso(10, [{ id: 101, sku: 'PULSEIRA', estoque: 4 }]),
];
await api('POST', '/api/loja/variantes/importar', {});

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const feitas = [];
async function foto(page, nome) {
  const arq = path.join(SAIDA, nome + '.png');
  await page.screenshot({ path: arq, fullPage: true });
  feitas.push(nome);
  console.log('  ' + nome);
}

async function sessao(largura, altura, sufixo) {
  const page = await browser.newPage({ viewport: { width: largura, height: altura } });
  page.on('dialog', d => d.dismiss());
  await page.goto(URL_APP);
  await page.waitForTimeout(600);
  if (await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show'))) {
    await page.fill('#cf-url', URL_API);
    await page.fill('#cf-key', KEY);
    await page.click('#conexaoOverlay .btn-gold');
    await page.waitForTimeout(1500);
  }

  console.log(`\n${sufixo} (${largura}×${altura})`);

  // 1. Pendências — a distribuição, vazia e preenchida
  await page.evaluate(() => switchTab('pendencias'));
  await page.waitForTimeout(1600);
  await foto(page, `1-pendencias-distribuir-${sufixo}`);

  const i = await page.evaluate(() => revisaoVar.itens.findIndex(x => x.sku === 'ANELB'));
  if (i >= 0) {
    await page.click(`button[onclick="distUsarLoja(${i})"]`);
    await page.waitForTimeout(400);
    await foto(page, `2-pendencias-soma-fecha-${sufixo}`);
    await page.fill(`#dist-${i}-0`, '5');
    await page.waitForTimeout(300);
    await foto(page, `3-pendencias-soma-nao-fecha-${sufixo}`);
  }

  // 2. Estoque — a tabela com editar e lixeira
  await page.evaluate(() => switchTab('geral'));
  await page.waitForTimeout(1200);
  await foto(page, `4-estoque-acoes-${sufixo}`);

  // 3. Editar a peça
  await page.evaluate(() => abrirProduto('ANELB'));
  await page.waitForTimeout(1500);
  await foto(page, `5-editar-peca-${sufixo}`);
  await page.evaluate(() => closeProduto());

  // 4. Excluir — os dois caminhos
  await page.evaluate(() => abrirExcluir('DESCARTE'));
  await page.waitForTimeout(1300);
  await foto(page, `6-excluir-sem-historico-${sufixo}`);
  await page.evaluate(() => closeExcluir());
  await page.evaluate(() => abrirExcluir('VENDIDA'));
  await page.waitForTimeout(1300);
  await foto(page, `7-arquivar-com-historico-${sufixo}`);
  await page.evaluate(() => closeExcluir());

  // 5. Cadastro com variações
  await page.evaluate(() => switchTab('cadastro'));
  await page.waitForTimeout(800);
  await page.fill('#cm-sku', 'MQ00042');
  await page.fill('#cm-desc', 'Anel solitário');
  await page.fill('#cm-preco', '95');
  await page.click('#cm-temvar');
  await page.waitForTimeout(400);
  await page.fill('#cadAtrs .atrbox:nth-child(1) .ab-topo input', 'Cor');
  await page.fill('#cadAtrs .atrbox:nth-child(1) input:not(.ab-topo input)', 'Rosa, Dourado');
  await page.click('button[onclick="cadAtrAdd()"]');
  await page.waitForTimeout(300);
  await page.fill('#cadAtrs .atrbox:nth-child(2) .ab-topo input', 'Tamanho');
  await page.fill('#cadAtrs .atrbox:nth-child(2) input:not(.ab-topo input)', 'n° 16, n° 17');
  await page.waitForTimeout(400);
  const q = page.locator('#cadCombos .combolinha input');
  for (const [k, v] of [[0, '2'], [1, '1'], [2, '3'], [3, '1']]) await q.nth(k).fill(v);
  await page.waitForTimeout(400);
  await foto(page, `8-cadastro-variacoes-${sufixo}`);

  // 6. Etiquetas — exclusão múltipla
  await page.evaluate(() => {
    localStorage.setItem('marquesa_etiquetas_v1', JSON.stringify({
      products: [
        { id: 1, desc: 'ANEL ROSA N17', sku: 'MQ00042', price: 95, qty: 3 },
        { id: 2, desc: 'PULSEIRA LISA', sku: 'PULSEIRA', price: 60, qty: 0 },
        { id: 3, desc: 'COLAR PINGENTE', sku: 'C1', price: 120, qty: 2 },
      ], adj: { offX: 0, offY: 0 }, seq: 4,
    }));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  if (await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show'))) {
    await page.fill('#cf-url', URL_API);
    await page.fill('#cf-key', KEY);
    await page.click('#conexaoOverlay .btn-gold');
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => switchTab('etiquetas'));
  await page.waitForTimeout(900);
  await foto(page, `9-etiquetas-excluir-selecionadas-${sufixo}`);

  // 7. Revendedora — o ponto de entrada da maleta
  const rev = (await api('GET', '/api/state')).revendedoras[0];
  await page.evaluate(id => switchTab('rev:' + id), rev.id);
  await page.waitForTimeout(900);
  await foto(page, `10-revendedora-importar-${sufixo}`);
  await page.evaluate(id => openImport('rev:' + id), rev.id);
  await page.waitForTimeout(500);
  await foto(page, `11-importar-maleta-da-revendedora-${sufixo}`);
  await page.evaluate(() => closeImport());

  await page.close();
}

await sessao(1400, 950, 'desktop');
await sessao(390, 844, 'celular');

await browser.close();
await loja.fechar();
console.log(`\n${feitas.length} imagens em ${SAIDA}`);
