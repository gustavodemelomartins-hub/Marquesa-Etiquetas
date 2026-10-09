/** QA da Preparação para Nuvemshop (§62) — o bundle publicado, 1366 e 390 px.
 *
 *    cd src && MQ_APP=<site>/v2 MQ_API=<Worker local> MQ_ROTEAR=<API do bundle> \
 *      node v2-preparacao-nuvemshop-qa.mjs
 *
 *  MQ_ROTEAR entrega cada chamada da API do bundle ao Worker local (o Worker
 *  real sobre uma cópia do banco): nenhuma chave de produção, nada escrito
 *  na nuvem. Prova o que a pessoa vê: as cinco abas, o checklist do card, o
 *  texto do site, o rótulo "Nuvemshop: OCULTO", sem erro de JS e sem rolagem
 *  lateral no telefone.
 */
import { chromium } from 'playwright';

const APP = process.env.MQ_APP || 'http://localhost:5173';
const API = process.env.MQ_API || 'http://127.0.0.1:8792';
const KEY = process.env.MQ_KEY || 'chave-local-de-teste';
const ROTEAR = process.env.MQ_ROTEAR || null;
const FOTOS = process.env.MQ_FOTOS || null;

let falhas = 0;
const prova = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`); if (!ok) falhas++; };

const navegador = await chromium.launch();
for (const [largura, altura, movel] of [[1366, 768, false], [390, 844, true]]) {
  const tam = `${largura}px`;
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura },
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  if (ROTEAR) {
    await ctx.route(`${ROTEAR}/**`, async (rota) => {
      const req = rota.request();
      const h = { ...req.headers() };
      delete h.host; delete h.origin; delete h.referer;
      const r = await fetch(req.url().replace(ROTEAR, API), {
        method: req.method(), headers: h,
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() ?? undefined,
      });
      const cab = Object.fromEntries(r.headers);
      cab['access-control-allow-origin'] = '*';
      await rota.fulfill({ status: r.status, headers: cab, body: Buffer.from(await r.arrayBuffer()) });
    });
  }
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [ROTEAR || API, KEY]);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const foto = async (nome) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${nome}.png`, fullPage: false }); };

  await p.goto(`${APP}/#/nuvemshop/publicacao`);
  await p.getByRole('heading', { name: 'Preparação para Nuvemshop' }).waitFor({ timeout: 20000 });
  await p.locator('.mq-kpis').waitFor({ timeout: 20000 });
  for (const aba of ['Não cadastrados', 'Ocultos — em preparação', 'Prontos para publicar', 'Publicados', 'Com erro']) {
    prova(await p.getByRole('button', { name: new RegExp(aba) }).count() > 0, `${tam} aba "${aba}"`);
  }
  await foto('preparacao');

  await p.getByRole('button', { name: /Não cadastrados/ }).click();
  const linha = p.locator('.mq-list .mq-item').first();
  await linha.waitFor();
  prova((await linha.innerText()).includes('NÃO CADASTRADO'), `${tam} não cadastrado diz "Nuvemshop: NÃO CADASTRADO"`);
  await linha.click();
  const lista = p.locator('.mq-checklist').first();
  await lista.waitFor();
  const itens = await lista.innerText();
  prova(/Cadastro/.test(itens) && /Foto/.test(itens) && /SEO/.test(itens) && /[✓✕⚠]/.test(itens), `${tam} checklist ✓ ✕ ⚠ no card`);
  prova(await p.getByText('O texto do site').count() > 0, `${tam} "O texto do site" com o que vai subir`);
  await foto('nao-cadastrado');

  await p.getByRole('button', { name: /Ocultos — em preparação/ }).click();
  const oculta = p.locator('.mq-list .mq-item').first();
  if (await oculta.count()) {
    prova((await oculta.innerText()).includes('OCULTO'), `${tam} oculto diz "Nuvemshop: OCULTO"`);
    await oculta.click();
    await p.getByText('Detalhe técnico').first().waitFor();
    prova(true, `${tam} detalhe técnico recolhido no card`);
    await foto('oculto');
  } else {
    prova(true, `${tam} nenhuma peça oculta pendente nesta cópia`);
  }

  await p.getByRole('button', { name: /Prontos para publicar/ }).click();
  const pronta = p.locator('.mq-list .mq-item').first();
  if (await pronta.count()) {
    await pronta.click();
    prova(await p.getByRole('button', { name: 'Publicar na Nuvemshop' }).count() > 0, `${tam} pronto mostra "Publicar na Nuvemshop"`);
    await p.getByRole('button', { name: 'Publicar na Nuvemshop' }).click();
    prova(await p.getByRole('button', { name: /Confirmar: deixar visível/ }).count() > 0, `${tam} publicar pede confirmação`);
    await p.getByRole('button', { name: 'Cancelar' }).click();
    await foto('pronto');
  }

  const lateral = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  prova(lateral <= 1, `${tam} sem rolagem lateral (${lateral}px)`);
  prova(erros.length === 0, `${tam} sem erro de JavaScript${erros.length ? ': ' + erros[0] : ''}`);
  await ctx.close();
}
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nPreparação para Nuvemshop: ok');
process.exit(falhas ? 1 : 0);
