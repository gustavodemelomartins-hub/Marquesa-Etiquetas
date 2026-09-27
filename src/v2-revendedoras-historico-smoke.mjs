/** Revendedoras na V2: histórico de acertos, Top e inativas — numa tela de
 *  verdade, sobre os dados reais.
 *
 *  O gap da homologação de 27/09/2026: a V2 mostrava só quem estava com
 *  maleta. O clássico dizia também quanto cada uma já vendeu, quantos
 *  acertos fez, quem está inativa. Este roteiro prova que a V2 responde a
 *  tudo isso sem abrir o clássico, em 1280 e em 390×844.
 *
 *    MQ_APP=http://127.0.0.1:5199/ MQ_API=http://127.0.0.1:8797 MQ_KEY=... \
 *      [MQ_DB=<cópia.sqlite>] node src/v2-revendedoras-historico-smoke.mjs
 *
 *  Pensado para o Worker real sobre uma cópia da produção. Só LÊ: toda
 *  requisição à API é conferida como GET, e com MQ_DB o arquivo do banco é
 *  comparado byte a byte antes e depois.
 *
 *  Os números esperados são os do banco (via API), não constantes — exceto
 *  os que a homologação citou por nome, que são a própria pergunta.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const APP = process.env.MQ_APP;
const API = process.env.MQ_API;
const KEY = process.env.MQ_KEY;
const FOTOS = process.env.MQ_SHOTS || 'evidencias-revendedoras-historico';
if (!APP || !API || !KEY) { console.error('defina MQ_APP, MQ_API e MQ_KEY'); process.exit(2); }
mkdirSync(FOTOS, { recursive: true });
const hashDoBanco = () => (process.env.MQ_DB
  ? createHash('sha256').update(readFileSync(process.env.MQ_DB)).digest('hex') : null);
const bancoAntes = hashDoBanco();

let falhas = 0;
const prova = (ok, t) => { if (ok) console.log(`ok    ${t}`); else { falhas++; console.log(`FALHA ${t}`); } };
const api = (p) => fetch(API + p, { headers: { Authorization: `Bearer ${KEY}` } }).then((r) => r.json());
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(v) ? 0 : 2 })
  .replace(/ /g, ' ');
const norm = (s) => s.replace(/ /g, ' ');

const estado = await api('/api/state');
const acertos = await api('/api/analytics/revendedoras?periodo=tudo');
const idDe = (prefixo) => estado.revendedoras.find((r) => r.nome.startsWith(prefixo))?.id;
const inativas = estado.revendedoras.filter((r) => r.status === 'inativa').map((r) => r.nome);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const erros = [];
const escritas = [];
async function abrir(largura, altura) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura } });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API, KEY]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  p.on('request', (r) => {
    if (r.url().startsWith(API) && r.method() !== 'GET' && r.method() !== 'OPTIONS') escritas.push(`${r.method()} ${r.url()}`);
  });
  return { ctx, p };
}
async function ir(p, hash) {
  await p.goto(`${APP}${hash}`);
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(700);
}
const texto = async (loc) => norm(await loc.innerText());
const transbordo = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const foto = (p, n) => p.screenshot({ path: path.join(FOTOS, `${n}.png`), fullPage: true });
const secao = (p, titulo) => p.locator('section.painel').filter({ has: p.getByRole('heading', { name: titulo, exact: true }) });

for (const [largura, altura, rotulo] of [[1280, 860, 'desktop'], [390, 844, 'telefone']]) {
  console.log(`\n── ${rotulo} (${largura}px)`);
  const { ctx, p } = await abrir(largura, altura);

  /* Visão geral */
  await ir(p, '#/revendedoras');
  const maletas = await texto(secao(p, 'Maletas ativas'));
  for (const [nome, maleta, pecas] of [['Bruna', 16, 92], ['Evelyn', 17, 84], ['Graciele', 18, 123], ['Luciana', 15, 90]]) {
    prova(maletas.includes(nome) && maletas.includes(`Maleta #${maleta}`) && maletas.includes(`${pecas} peças`),
      `${rotulo}: Maletas ativas — ${nome}, maleta #${maleta}, ${pecas} peças`);
  }
  for (const nome of inativas) prova(!maletas.includes(nome), `${rotulo}: ${nome} (inativa) não aparece como maleta atual`);
  const hist = await texto(secao(p, 'Histórico de acertos'));
  prova(hist.includes(brl(acertos.totais.vendido)) && hist.includes(brl(acertos.totais.comissao)) && hist.includes(brl(acertos.totais.liquido)),
    `${rotulo}: resumo ${brl(acertos.totais.vendido)} · ${brl(acertos.totais.comissao)} · ${brl(acertos.totais.liquido)}`);
  const top = p.getByRole('list', { name: 'Top revendedoras' }).getByRole('button');
  prova(await top.count() === acertos.revendedoras.length, `${rotulo}: Top com ${acertos.revendedoras.length} revendedoras`);
  const primeira = await texto(top.first());
  prova(primeira.includes(acertos.revendedoras[0].nome), `${rotulo}: Top abre com ${acertos.revendedoras[0].nome}`);
  for (const nome of inativas) {
    const linha = await texto(top.filter({ hasText: nome }));
    prova(/Inativa/.test(linha), `${rotulo}: ${nome} no Top, marcada Inativa`);
  }
  prova(await transbordo(p) <= 0, `${rotulo}: Visão geral sem rolagem horizontal`);
  await foto(p, `${rotulo}-1-visao-geral`);

  /* Todas as revendedoras */
  await ir(p, '#/revendedoras/todas');
  const linhas = p.locator('.rev-lista .mq-tr:not(.mq-tr--head)');
  prova(await linhas.count() === estado.revendedoras.length, `${rotulo}: Todas mostra as ${estado.revendedoras.length} (inativas incluídas)`);
  await p.getByRole('button', { name: /^Inativas/ }).click();
  const soInativas = await texto(p.locator('.rev-lista'));
  prova(inativas.every((n) => soInativas.includes(n)) && await linhas.count() === inativas.length, `${rotulo}: filtro Inativas → ${inativas.join(', ')}`);
  await p.getByRole('button', { name: /^Ativas/ }).click();
  prova(await linhas.count() === estado.revendedoras.length - inativas.length, `${rotulo}: filtro Ativas`);
  await p.getByRole('button', { name: /^Todas/ }).click();
  prova(await transbordo(p) <= 0, `${rotulo}: Todas sem rolagem horizontal`);
  await foto(p, `${rotulo}-2-todas`);

  /* Histórico de acertos */
  await ir(p, '#/revendedoras/historico');
  const tabela = p.getByRole('table', { name: 'Acertos' });
  prova(await tabela.getByRole('row', { name: /^Acerto de/ }).count() === acertos.acertos.length, `${rotulo}: Histórico com os ${acertos.acertos.length} acertos`);
  await p.getByRole('combobox', { name: 'Revendedora', exact: true }).selectOption({ label: 'Evelyn Veiga' });
  const evelyn = await texto(tabela);
  prova(await tabela.getByRole('row', { name: /^Acerto de/ }).count() === 2 && evelyn.includes('19/09/2026'), `${rotulo}: Evelyn — 2 acertos, último em 19/09/2026`);
  await p.getByRole('combobox', { name: 'Revendedora', exact: true }).selectOption('');
  prova(await transbordo(p) <= 0, `${rotulo}: Histórico sem rolagem horizontal`);
  await foto(p, `${rotulo}-3-historico`);

  for (const [nome, data, vendidas, devolvidas, maleta] of [
    ['Bruna Follei', '22/09/2026', 15, 79, 12],
    ['Graciele Muniz', '23/02/2026', 26, 60, 14],
  ]) {
    await tabela.getByRole('row', { name: new RegExp(`Acerto de ${nome} em ${data.replace(/\//g, '\\/')}`) }).click();
    const gaveta = p.getByRole('dialog', { name: `Acerto de ${nome}` });
    await gaveta.getByRole('region', { name: 'Peças vendidas' }).waitFor();
    const g = await texto(gaveta);
    prova(g.includes(`#${maleta}`) && new RegExp(`Vendidas\\s*${vendidas}`).test(g) && new RegExp(`Devolvidas\\s*${devolvidas}`).test(g),
      `${rotulo}: acerto ${nome} ${data} — maleta #${maleta}, ${vendidas} vendidas, ${devolvidas} devolvidas`);
    const skus = await gaveta.getByRole('region', { name: 'Peças vendidas' }).locator('li').count();
    prova(skus > 0, `${rotulo}: acerto ${nome} lista os SKUs vendidos (${skus} códigos)`);
    if (nome.startsWith('Bruna')) await foto(p, `${rotulo}-4-acerto-bruna`);
    await gaveta.getByRole('button', { name: 'Fechar' }).click();
  }

  /* Fichas */
  for (const [prefixo, esperado] of [
    ['Bruna', { maleta: 16, pecas: 92, acertos: 1 }],
    ['Evelyn', { maleta: 17, pecas: 84, acertos: 2 }],
    ['Graciele', { maleta: 18, pecas: 123, acertos: 1 }],
    ['Luciana', { maleta: 15, pecas: 90, acertos: 0 }],
    ['Jessica', { inativa: true, acertos: 2 }],
    ['Andreia', { inativa: true, acertos: 2 }],
  ]) {
    const id = idDe(prefixo);
    if (!id) { prova(false, `${rotulo}: cadastro de ${prefixo} existe`); continue; }
    await ir(p, `#/revendedoras/${id}`);
    await p.getByRole('heading', { name: 'Histórico da revendedora' }).waitFor();
    await p.waitForTimeout(400);
    const t = norm(await p.locator('main').innerText());
    if (esperado.inativa) {
      prova(/Inativa/.test(t) && t.includes('Nenhuma maleta ativa') && !(await p.getByRole('button', { name: '+ Criar maleta' }).count()),
        `${rotulo}: ficha de ${prefixo} abre — Inativa, Nenhuma maleta ativa, sem oferta de maleta`);
    } else {
      prova(t.includes(`Maleta #${esperado.maleta}`) && t.includes(`${esperado.pecas} peças`), `${rotulo}: ficha de ${prefixo} — maleta #${esperado.maleta}, ${esperado.pecas} peças`);
    }
    const tabelaFicha = p.getByRole('table', { name: 'Acertos' });
    const n = esperado.acertos ? await tabelaFicha.getByRole('rowgroup').count() : 0;
    prova(n === esperado.acertos, `${rotulo}: ficha de ${prefixo} — ${esperado.acertos} acerto(s) no histórico`);
    prova(await transbordo(p) <= 0, `${rotulo}: ficha de ${prefixo} sem rolagem horizontal`);
    if (prefixo === 'Jessica') await foto(p, `${rotulo}-5-ficha-jessica-inativa`);
  }
  await ctx.close();
}

await browser.close();
prova(!escritas.length, `nenhuma escrita na API${escritas.length ? `: ${escritas.join(', ')}` : ''}`);
prova(!erros.length, `nenhum erro no console${erros.length ? `: ${erros.slice(0, 3).join(' | ')}` : ''}`);
const razao = await api('/api/estoque/conferir');
prova(JSON.stringify(razao.divergentes ?? []) === '[]', 'razão fecha (GET /api/estoque/conferir vazio)');
if (bancoAntes) prova(hashDoBanco() === bancoAntes, 'o arquivo do banco não mudou');

if (falhas) { console.error(`\n${falhas} falha(s).`); process.exit(1); }
console.log('\nTudo certo — a V2 responde quem vende, quanto, quando e o que aconteceu em cada acerto.');
