/** Fotos das telas mudadas nos BLOCOS A–D, no computador e no celular.
 *
 *  Monta um cenário próprio (não depende do e2e ter rodado antes) e
 *  fotografa cada tela que mudou, nos dois tamanhos.
 *
 *      node src/shot-pos-fase2.mjs /caminho/da/pasta
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { subirLojaFalsa } from './loja-falsa.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const destino = process.argv[2] || AQUI;
fs.mkdirSync(destino, { recursive: true });
const KEY = 'troque-por-uma-chave-de-teste';
const API = 'http://localhost:8787';

const api = (m, p, b) => fetch(API + p, {
  method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const loja = await subirLojaFalsa();

await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '122809', desc: 'Colar Elos Grossos', cat: 'Colar', preco: 189.9, qtd: 7 },
    { sku: '340012', desc: 'Brinco Argola Média', cat: 'Argola', preco: 89.9, qtd: 12 },
    { sku: '551117', desc: 'Anel Solitário Cristal', cat: 'Anel', preco: 129.9, qtd: 6 },
    { sku: '780004', desc: 'Pulseira Veneziana', cat: 'Pulseira', preco: 149.9, qtd: 20 },
    { sku: '997620', desc: 'Pingente Coração', cat: 'Pingente', preco: 69.9, qtd: 30 },
    { sku: '412300', desc: 'Colar Ponto de Luz', cat: 'Colar', preco: null, qtd: 9 },
    { sku: '660190', desc: 'Berloque Estrela', cat: 'Berloque', preco: 59.9, qtd: 14 },
  ],
});

const cor = (sku, id, valor, estoque) => ({
  id, sku, values: [{ pt: valor }],
  inventory_levels: [{ location_id: 'L1', stock: estoque }],
});
const FOTO = 'http://localhost:8000/icons/icon-192.png';

loja.estado.produtos = [
  {
    id: 90, name: { pt: 'Colar Elos Grossos' }, handle: { pt: 'colar-elos' }, published: true,
    attributes: [{ pt: 'Cor' }],
    images: [{ id: 9000, src: FOTO, position: 1 }, { id: 9001, src: FOTO, position: 2 }],
    variants: [cor('122809', 901, 'Verde', 1), cor('122809', 902, 'Vermelho', 1), cor('122809', 903, 'Laranja', 1)],
  },
  {
    id: 91, name: { pt: 'Brinco Argola Média' }, handle: { pt: 'brinco-argola' }, published: true,
    images: [{ id: 9100, src: FOTO, position: 1 }],
    variants: [{ id: 911, sku: '340012', inventory_levels: [{ location_id: 'L1', stock: 12 }] }],
  },
  {
    id: 92, name: { pt: 'Anel Solitário Cristal' }, handle: { pt: 'anel-solitario' }, published: true,
    images: [{ id: 9200, src: FOTO, position: 1 }],
    variants: [{ id: 921, sku: '551117', inventory_levels: [{ location_id: 'L1', stock: 2 }] }],
  },
];
await api('POST', '/api/loja/variantes/importar', {});
await api('POST', '/api/sync', { forcar: true });

/* Uma revendedora com maleta aberta e agenda, outra com um ciclo fechado —
   é o que faz a Visão Geral de Revendedoras ter o que mostrar. */
const ana = await api('POST', '/api/revendedoras', { nome: 'Ana Carolina', tel: '(11) 91234-5678', cidade: 'São Paulo' });
const bia = await api('POST', '/api/revendedoras', { nome: 'Beatriz Mendes', tel: '(11) 98765-4321', cidade: 'Campinas' });
const mA = await api('POST', '/api/maletas', { revId: ana.id, abertaEm: '2026-08-01', acertoEm: '2026-09-15' });
await api('POST', `/api/maletas/${mA.id}/itens`, { itens: { '780004': 8, '997620': 12, '660190': 6 } });
const mB = await api('POST', '/api/maletas', { revId: bia.id, abertaEm: '2026-06-01', acertoEm: '2026-07-15' });
await api('POST', `/api/maletas/${mB.id}/itens`, { itens: { '997620': 14, '660190': 8 } });
await api('POST', `/api/maletas/${mB.id}/acerto`, {
  faltas: [{ sku: '997620', linhas: [{ destino: 'vendida', qtd: 9 }] },
           { sku: '660190', linhas: [{ destino: 'vendida', qtd: 5 }] }],
  devolvidas: { '997620': 5, '660190': 3 },
});

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function foto(nome, largura, altura, acao) {
  const page = await browser.newPage({ viewport: { width: largura, height: altura } });
  await page.addInitScript(k => {
    localStorage.setItem('marquesa_conexao_v1',
      JSON.stringify({ url: 'http://localhost:8787', key: k }));
  }, KEY);
  await page.goto('http://localhost:8000/dashboard.html');
  await page.waitForTimeout(1700);
  if (acao) await acao(page);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(destino, nome + '.png'), fullPage: true });
  console.log('  ' + nome + '.png');
  await page.close();
}

const D = [1180, 1200];   // computador
const M = [420, 900];     // celular

const abrirPeca = async p => {
  await p.evaluate(() => switchTab('estoque'));
  await p.waitForTimeout(500);
  await p.evaluate(() => abrirProduto('122809'));
  await p.waitForTimeout(900);
};
const abrirPend = secao => async p => {
  await p.evaluate(() => switchTab('pendencias'));
  await p.waitForTimeout(2000);
  await p.evaluate(s => setSecaoPend(s), secao);
  await p.waitForTimeout(600);
};

await foto('A-editar-peca', ...D, abrirPeca);
await foto('A-editar-peca-mob', ...M, abrirPeca);
await foto('A-estoque-fotos', ...D, p => p.evaluate(() => switchTab('estoque')));
await foto('B-nuvemshop', ...D, p => p.evaluate(() => switchTab('loja')));
await foto('B-nuvemshop-mob', ...M, p => p.evaluate(() => switchTab('loja')));
await foto('B-pendencias-variacoes', ...D, abrirPend('variacoes'));
await foto('B-pendencias-publicar', ...D, abrirPend('publicar'));
await foto('B-pendencias-publicar-mob', ...M, abrirPend('publicar'));
await foto('C-revendedoras-geral', ...D, p => p.evaluate(() => switchTab('revgeral')));
await foto('C-revendedoras-geral-mob', ...M, p => p.evaluate(() => switchTab('revgeral')));
await foto('C-revendedora-ficha', ...D, p => p.evaluate(id => switchTab('rev:' + id), ana.id));
await foto('C-revendedora-ficha-mob', ...M, p => p.evaluate(id => switchTab('rev:' + id), ana.id));
await foto('D-historico', ...D, p => p.evaluate(id => switchTab('rev:' + id), bia.id));

await browser.close();
await loja.fechar();
console.log('Fotos em ' + destino);
