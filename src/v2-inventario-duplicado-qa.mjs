/** QA de navegador — a mesma peça não é contada duas vezes em silêncio
 *  (06/10/2026, REGRAS §59).
 *
 *  O caso real da Sthefany, no telefone (390px) e no computador (1280px),
 *  contra o Worker real: bipa, olha a ficha, bipa de novo a MESMA peça bem
 *  depois dos 4 s da trava antiga; depois copia a quantidade da planilha
 *  dela por cima do que já tinha bipado. Prova em cada passo o número no
 *  servidor, não só na tela.
 *
 *   1 primeiro bipe +1 · 2 mesmo código 5 s depois: não soma, pergunta ·
 *   3 "Foi engano" fica 1 · 4 "Contar outra unidade" vira 2 · 6 A → B → A
 *   normal · 7/8 2 bipados + digita 5 → "Substituir por 5" → 5, nunca 7 ·
 *   9 digita o mesmo → nada · 10 digita menos → pergunta, fica 3 ·
 *   11 peça não conferida, digita → define · 12 nº23 2 → 3 · variação com
 *   bipes sem variação · 13 rede caindo (retry) não soma · 14 recarregar
 *   não esquece a última leitura · 15 o aviso fica por cima da barra de
 *   navegação, botões de polegar, nada técnico, sem rolagem lateral.
 *
 *    node scripts/v2-local/worker-local.mjs . 8799 scripts/v2-local/seed-catalogo.sql &
 *    cd frontend && npm run build && cd ..
 *    node scripts/v2-local/serve-app.mjs frontend/dist 5199 &
 *    cd src && MQ_API=http://127.0.0.1:8799 MQ_APP=http://127.0.0.1:5199 node v2-inventario-duplicado-qa.mjs
 *
 *  MQ_FOTOS=<pasta> guarda uma captura de cada passo. Bundle PUBLICADO:
 *  MQ_APP=<site>/v2 MQ_ROTEAR=<endereço da API que ele usa>.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP = process.env.MQ_APP || 'http://127.0.0.1:5173';
const API = process.env.MQ_API || 'http://127.0.0.1:8787';
const KEY = process.env.MQ_KEY || 'chave-local-de-teste';
const ROTEAR = process.env.MQ_ROTEAR || null;
const FOTOS = process.env.MQ_FOTOS || null;
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

let falhas = 0;
function prova(ok, texto) {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  if (!ok) falhas++;
}
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const PROIBIDO = [/local:/, /variante/i, /\bnao_/, /\w_id\b/, /painel clássico/i, /\/api\//, /undefined/, /\bnull\b/, /NaN/, /\[object/];
const razaoFechada = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  return r.status === 200 && r.corpo?.ok === true && (r.corpo?.divergentes ?? []).length === 0;
};
const fecharAbertos = async () => {
  for (const i of (await api('GET', '/api/inventarios')).corpo ?? []) {
    if (i.status === 'aberto' || i.status === 'pausado') await api('POST', `/api/inventarios/${i.id}/cancelar`);
  }
};

const navegador = await chromium.launch();

for (const [largura, altura, movel, base] of [[390, 844, true, 921000], [1280, 900, false, 922000]]) {
  const tam = `${largura}px`;
  await fecharAbertos();
  const S = { colar: String(base + 1), brinco: String(base + 2), anel: String(base + 3), pulseira: String(base + 4) };
  const existentes = new Set(((await api('GET', '/api/state')).corpo?.produtos ?? []).map((p) => p.sku));
  const novas = [
    { sku: S.colar, desc: `Colar Coração ${tam}`, cat: 'Colar', preco: 99, qtd: 6 },
    { sku: S.brinco, desc: `Brinco Palito ${tam}`, cat: 'Brinco', preco: 59, qtd: 3 },
    { sku: S.anel, desc: `Anel Inspiração Cartier ${tam}`, cat: 'Anel', preco: 149, qtd: 7 },
    { sku: S.pulseira, desc: `Pulseira Trançada ${tam}`, cat: 'Pulseira', preco: 69, qtd: 4 },
  ].filter((p) => !existentes.has(p.sku));
  if (novas.length) {
    const r = await api('POST', '/api/produtos/novos/cadastrar', { produtos: novas, origem: 'qa-inventario-duplicado' });
    prova(r.status < 300, `${tam}: catálogo de prova cadastrado (${r.status})`);
    for (const aro of ['nº18', 'nº23']) await api('POST', `/api/produtos/${S.anel}/variacoes/adicionar`, { valor: aro });
  }

  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: 1,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  /* A rede do aparelho: `derrubar` faz as próximas N gravações de leitura
     falharem ANTES de chegar ao servidor (como sinal caindo). */
  let derrubar = 0;
  let derrubadas = 0;
  const alvo = ROTEAR || API;
  await ctx.route(`${alvo}/**`, async (rota) => {
    const req = rota.request();
    if (derrubar > 0 && req.method() === 'POST' && /\/leituras$/.test(req.url())) {
      derrubar -= 1; derrubadas += 1;
      await rota.abort('internetdisconnected');
      return;
    }
    if (!ROTEAR) { await rota.continue(); return; }
    const destino = req.url().replace(ROTEAR, API);
    const h = { ...req.headers() };
    delete h.host; delete h.origin; delete h.referer;
    const r = await fetch(destino, { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() ?? undefined });
    const corpo = Buffer.from(await r.arrayBuffer());
    const cab = Object.fromEntries(r.headers);
    cab['access-control-allow-origin'] = '*';
    await rota.fulfill({ status: r.status, headers: cab, body: corpo });
  });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [alvo, KEY]);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  let n = 0;
  const foto = async (nome) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${String(++n).padStart(2, '0')}-${nome}.png` }); };

  await p.goto(`${APP}/#/estoque/inventario`);
  await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: 'Abrir inventário' }).first().click();
  await p.getByRole('heading', { name: /^Inventário #\d+$/ }).waitFor({ timeout: 10000 });
  const inv = (await api('GET', '/api/inventarios')).corpo.find((i) => i.status === 'aberto');
  const campo = p.getByLabel('Bipe a peça ou procure por código, nome ou variação');
  const pronto = () => p.waitForFunction(() => {
    const el = document.querySelector('input[aria-label^="Bipe a peça"]');
    return el && !el.disabled;
  }, null, { timeout: 10000 });
  await pronto();
  const bipar = async (codigo) => { await campo.fill(codigo); await campo.press('Enter'); };
  const peca = p.getByRole('region', { name: 'Peça em conferência' });
  /* O número DO SERVIDOR — a prova de verdade. */
  const noServidor = async (sku) => {
    const d = (await api('GET', `/api/inventarios/${inv.id}`)).corpo;
    return Object.fromEntries((d.contagem ?? []).filter((c) => c.sku === sku).map((c) => [c.variacao ?? '', c.contado]));
  };
  const totalNoServidor = async (sku) => Object.values(await noServidor(sku)).reduce((s, q) => s + q, 0);
  const espera = async (fn, valor, ms = 6000) => {
    const fim = Date.now() + ms;
    let v;
    while (Date.now() < fim) { v = await fn(); if (JSON.stringify(v) === JSON.stringify(valor)) return v; await p.waitForTimeout(150); }
    return v;
  };
  const aviso = (nome) => p.getByRole('alertdialog', { name: nome });
  const semAviso = async () => (await p.getByRole('alertdialog').count()) === 0;
  const digitar = async (rotulo, valor) => {
    const el = peca.getByLabel(rotulo, { exact: true });
    await el.fill(valor);
    await el.press('Enter');
  };

  /* ── 1 primeiro bipe */
  await bipar(S.colar);
  await peca.waitFor();
  prova(await espera(() => totalNoServidor(S.colar), 1) === 1, `${tam}: 1 — primeiro bipe: 0 → 1 (servidor)`);

  /* ── 2 mesmo código 5 s depois (fora da janela antiga de 4 s) */
  await p.waitForTimeout(5200);
  await bipar(S.colar);
  const rep = aviso('Essa peça já foi conferida.');
  await rep.waitFor({ timeout: 4000 });
  const textoRep = await rep.innerText();
  prova(/Colar Coração/.test(textoRep) && /Quantidade já conferida:\s*1/.test(textoRep),
    `${tam}: 2 — mesmo código 5 s depois: pergunta, com a peça e "Quantidade já conferida: 1"`);
  await p.waitForTimeout(600);
  prova(await totalNoServidor(S.colar) === 1, `${tam}: 2 — nada somado enquanto ela não responde (servidor 1)`);
  prova(!/✓/.test(await p.locator('.inv-aviso').innerText()), `${tam}: 2 — sem "✓" de sucesso enquanto aguarda`);

  /* ── 15 o aviso por cima de tudo, botões de polegar */
  const caixa = await rep.boundingBox();
  const botoes = rep.getByRole('button');
  const alturas = [];
  for (let i = 0; i < await botoes.count(); i++) alturas.push((await botoes.nth(i).boundingBox())?.height ?? 0);
  prova(alturas.every((h) => h >= 48), `${tam}: 15 — botões do aviso com alvo de polegar (${alturas.map(Math.round).join(', ')} px)`);
  prova(caixa && caixa.y >= 0 && caixa.y + caixa.height <= altura + 1, `${tam}: 15 — aviso inteiro dentro da tela`);
  const noTopo = await p.evaluate(() => {
    const b = [...document.querySelectorAll('.conf-aviso button')];
    return b.every((el) => {
      const r = el.getBoundingClientRect();
      const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return topo === el || el.contains(topo);
    });
  });
  prova(noTopo, `${tam}: 15 — nenhum botão do aviso coberto (barra de navegação, leitor ou lista)`);
  if (movel) {
    const nav = p.locator('.mq-bottomnav');
    if (await nav.count()) {
      const zs = await p.evaluate(() => [
        Number(getComputedStyle(document.querySelector('.conf-aviso')).zIndex),
        Number(getComputedStyle(document.querySelector('.mq-bottomnav')).zIndex),
      ]);
      prova(zs[0] > zs[1], `${tam}: 15 — aviso acima da barra de navegação (z ${zs[0]} > ${zs[1]})`);
    }
    prova(caixa && Math.abs(caixa.y + caixa.height - altura) <= 1, `${tam}: 15 — no telefone o aviso é uma folha presa embaixo, ao alcance do polegar`);
    const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    prova(sw <= iw + 1, `${tam}: 15 — sem rolagem horizontal com o aviso aberto (${sw} ≤ ${iw})`);
  }
  const tecnico = PROIBIDO.filter((r) => r.test(textoRep)).map(String);
  prova(!tecnico.length, `${tam}: nada técnico no aviso${tecnico.length ? ` (${tecnico})` : ''}`);
  await foto('aviso-repetido');

  /* ── 3 "Foi engano" */
  await rep.getByRole('button', { name: 'Foi engano' }).click();
  prova(await semAviso(), `${tam}: 3 — "Foi engano" fecha o aviso`);
  await p.waitForTimeout(400);
  prova(await totalNoServidor(S.colar) === 1, `${tam}: 3 — "Foi engano": continua 1 (servidor)`);

  /* ── 4 "Contar outra unidade" */
  await bipar(S.colar);
  await rep.waitFor({ timeout: 4000 });
  await rep.getByRole('button', { name: 'Contar outra unidade' }).click();
  prova(await espera(() => totalNoServidor(S.colar), 2) === 2, `${tam}: 4 — "Contar outra unidade": 1 → 2 (servidor)`);

  /* ── 7/8 o caso real: 2 bipados, copia 5 da planilha */
  await digitar('Conferido', '5');
  const sub = aviso('Substituir a quantidade conferida?');
  await sub.waitFor({ timeout: 4000 });
  const textoSub = await sub.innerText();
  prova(/Já foram conferidas 2 unidades desta peça/.test(textoSub) && /2\s*→\s*5/.test(textoSub),
    `${tam}: 7 — digitar 5 sobre 2: "Já foram conferidas 2 unidades… 2 → 5"`);
  await foto('aviso-substituir');
  await p.waitForTimeout(400);
  prova(await totalNoServidor(S.colar) === 2, `${tam}: 7 — nada gravado antes de ela confirmar`);
  await sub.getByRole('button', { name: 'Substituir por 5' }).click();
  const depois5 = await espera(() => totalNoServidor(S.colar), 5);
  prova(depois5 === 5, `${tam}: 8 — "Substituir por 5": 5 no servidor — nunca 7 (deu ${depois5})`);

  /* ── 9 o mesmo valor */
  const antes9 = (await api('GET', `/api/inventarios/${inv.id}`)).corpo.contagem.find((c) => c.sku === S.colar).contadoEm;
  await digitar('Conferido', '5');
  await p.waitForTimeout(600);
  prova(await semAviso(), `${tam}: 9 — digitar 5 quando já está 5: sem pergunta`);
  const depois9 = (await api('GET', `/api/inventarios/${inv.id}`)).corpo.contagem.find((c) => c.sku === S.colar).contadoEm;
  prova(antes9 === depois9 && await totalNoServidor(S.colar) === 5, `${tam}: 9 — nada gravado, continua 5`);

  /* ── 10 menos */
  await digitar('Conferido', '3');
  await aviso('Substituir a quantidade conferida?').getByRole('button', { name: 'Substituir por 3' }).click();
  prova(await espera(() => totalNoServidor(S.colar), 3) === 3, `${tam}: 10 — digitar 3 quando está 5: pergunta e fica 3`);

  /* ── Cancelar mantém */
  await digitar('Conferido', '9');
  await aviso('Substituir a quantidade conferida?').getByRole('button', { name: 'Cancelar' }).click();
  await p.waitForTimeout(400);
  prova(await peca.getByLabel('Conferido', { exact: true }).inputValue() === '3' && await totalNoServidor(S.colar) === 3,
    `${tam}: Cancelar — o campo volta a 3 e nada muda`);

  /* ── 6 A → B → A */
  await bipar(S.brinco);
  await bipar(S.colar);
  await p.waitForTimeout(600);
  prova(await semAviso(), `${tam}: 6 — A → B → A: sem pergunta`);
  prova(await espera(() => totalNoServidor(S.colar), 4) === 4 && await totalNoServidor(S.brinco) === 1,
    `${tam}: 6 — A → B → A conta normal (colar 4, brinco 1)`);

  /* ── 11 peça não conferida, digitada */
  await bipar(`Pulseira Trançada ${tam}`);
  await peca.getByText(`Pulseira Trançada ${tam}`).waitFor({ timeout: 4000 });
  await digitar('Conferido', '4');
  await p.waitForTimeout(400);
  prova(await semAviso() && await espera(() => totalNoServidor(S.pulseira), 4) === 4,
    `${tam}: 11 — peça não conferida: digitar 4 define 4, sem pergunta`);

  /* ── variação: 2 bipes sem variação, digita 5 no nº23 */
  await bipar(S.anel);
  await peca.getByText(/1 peça sem variação\./).waitFor({ timeout: 5000 });
  await bipar(S.anel);
  await rep.waitFor({ timeout: 4000 });
  await rep.getByRole('button', { name: 'Contar outra unidade' }).click();
  await espera(() => noServidor(S.anel), { '': 2 });
  await digitar('Conferido em nº23', '5');
  const sv = aviso('As peças bipadas sem variação são do nº23?');
  await sv.waitFor({ timeout: 4000 });
  prova(/2 peças bipadas sem variação/.test(await sv.innerText()), `${tam}: variação — pergunta se as 2 bipadas sem variação são do nº23`);
  await foto('aviso-sem-variacao');
  await sv.getByRole('button', { name: 'Sim, são do nº23' }).click();
  const anel = await espera(() => noServidor(S.anel), { '': 0, 'nº23': 5 });
  prova(JSON.stringify(anel) === JSON.stringify({ '': 0, 'nº23': 5 }), `${tam}: variação — "Sim": nº23 = 5, total 5 — não 7 (${JSON.stringify(anel)})`);

  /* ── 12 nº23 5 → 3 */
  await digitar('Conferido em nº23', '3');
  await aviso('Substituir a quantidade conferida?').getByRole('button', { name: 'Substituir por 3' }).click();
  prova((await espera(() => noServidor(S.anel), { '': 0, 'nº23': 3 }))['nº23'] === 3, `${tam}: 12 — nº23 digitado 3 sobre 5: fica 3`);

  /* ── 13 rede caindo: a leitura volta sozinha e não soma duas vezes */
  derrubar = 2;
  await bipar(S.brinco);
  await espera(() => totalNoServidor(S.brinco), 2, 12000);
  await p.waitForTimeout(2500);
  prova(derrubadas === 2 && await totalNoServidor(S.brinco) === 2,
    `${tam}: 13 — sinal caiu 2× na mesma leitura: reenviada sozinha, brinco 1 → 2, não 3 (${derrubadas} quedas)`);

  /* ── 14 recarregar a página */
  await p.reload();
  await p.waitForLoadState('networkidle');
  await pronto();
  await bipar(S.brinco);
  await rep.waitFor({ timeout: 4000 });
  await p.waitForTimeout(400);
  prova(await totalNoServidor(S.brinco) === 2, `${tam}: 14 — depois de recarregar, o mesmo código pergunta e não soma`);
  await rep.getByRole('button', { name: 'Foi engano' }).click();

  /* ── o aviso aberto + outro código: o repetido não conta, o outro conta */
  await bipar(S.brinco);
  await rep.waitFor({ timeout: 4000 });
  await bipar(S.colar);
  await p.waitForTimeout(800);
  prova(await semAviso() && await totalNoServidor(S.brinco) === 2 && await espera(() => totalNoServidor(S.colar), 5) === 5,
    `${tam}: com o aviso aberto, outro código fecha o aviso sem contar o repetido e conta o novo`);

  prova(!erros.length, `${tam}: nenhum erro de JavaScript${erros.length ? ` (${erros.join(' | ')})` : ''}`);
  await api('POST', `/api/inventarios/${inv.id}/cancelar`);
  await ctx.close();
}

prova(await razaoFechada(), 'a razão fecha (GET /api/estoque/conferir vazio)');
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nInventário — contagem dupla: tudo ok.');
process.exit(falhas ? 1 : 0);
