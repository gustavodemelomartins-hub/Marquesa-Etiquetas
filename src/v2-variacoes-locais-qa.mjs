/** QA de navegador — Variações da peça do código 391471 (06/10/2026).
 *
 *  O caso do print, como usuária: ficha da peça → Estoque → Variações →
 *  nº24 = 1, nº18 = 1 → Salvar variações. Antes: "A variante 1509838878 não
 *  existe na loja para 391471." Depois: salva, o total continua 2, nada
 *  técnico na tela, e a variante da loja aparece só como "loja online: 2".
 *
 *  Worker real local com a semente do 391471 exatamente como em PROD:
 *
 *    node scripts/v2-local/worker-local.mjs . 8787 <semente-391471.sql>
 *    cd src && MQ_APP=<site>/v2 MQ_ROTEAR=<API do bundle> node v2-variacoes-locais-qa.mjs
 *
 *  MQ_ROTEAR prova o bundle PUBLICADO: o Playwright entrega cada chamada da
 *  API ao Worker local (sem chave de produção, nada escrito na nuvem).
 */
import { chromium } from 'playwright';

const APP = process.env.MQ_APP || 'http://127.0.0.1:5173';
const API = process.env.MQ_API || 'http://127.0.0.1:8787';
const KEY = process.env.MQ_KEY || 'chave-local-de-teste';
const ROTEAR = process.env.MQ_ROTEAR || null;
const FOTOS = process.env.MQ_FOTOS || null;

let falhas = 0;
const prova = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`); if (!ok) falhas++; };
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));
const TECNICO = /\b\d{8,}\b|local:|[0-9a-f]{8}-[0-9a-f]{4}-|variante \d|não existe na loja/i;

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
  const foto = async (nome) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${nome}.png` }); };

  /* Volta ao estado do print: tudo em "não informada". */
  const antes = (await api('GET', '/api/produtos/391471/variacoes?visao=estoque')).corpo;
  const desfazer = antes.variacoes.filter((v) => v.saldo).map((v) => ({ varianteId: v.varianteId, qtd: 0 }));
  if (desfazer.length) {
    await api('POST', '/api/produtos/391471/variacoes/distribuir', {
      parcial: true, obs: 'QA: volta ao estado do print',
      distribuicao: antes.variacoes.map((v) => ({ varianteId: v.varianteId, qtd: 0 })),
    });
  }

  await p.goto(`${APP}/#/estoque/peca%3A391471`);
  await p.waitForLoadState('networkidle');
  await p.getByRole('tab', { name: 'Estoque' }).click();
  await p.getByRole('button', { name: 'Variações', exact: true }).first().click();
  const painel = p.getByRole('dialog', { name: 'Variações da peça' });
  await painel.getByLabel('Quantidade de nº24').waitFor({ timeout: 10000 });
  await foto('1-aberto');

  const texto = await painel.innerText();
  prova(!/Banho de Ouro 18K · n°18/.test(texto), `${tam}: a variante da loja não é mais uma segunda linha de n°18`);
  prova(/loja online: 2/.test(texto), `${tam}: "loja online: 2" continua visível como informação`);
  prova(/ainda não está na loja online/.test(texto), `${tam}: nº24 diz que ainda não está na loja online`);

  await painel.getByLabel('Quantidade de nº24').fill('1');
  await painel.getByLabel('Quantidade de nº18').fill('1');
  prova((await painel.getByLabel('Variação ainda não informada').innerText()).trim() === '0',
    `${tam}: com 1 + 1, "variação ainda não informada" fica 0`);
  await painel.getByRole('button', { name: 'Salvar variações' }).click();
  await painel.getByText('Variações salvas. O total da peça não mudou.').waitFor({ timeout: 10000 });
  await foto('2-salvo');
  const final = await painel.innerText();
  prova(!TECNICO.test(final), `${tam}: nada técnico na tela depois de salvar`);

  const depois = (await api('GET', '/api/produtos/391471/variacoes?visao=estoque')).corpo;
  prova(JSON.stringify(depois.variacoes.map((v) => [v.nome, v.saldo])) === '[["nº24",1],["nº18",1]]',
    `${tam}: no servidor, nº24 = 1 e nº18 = 1`);
  prova(depois.qtd === 2, `${tam}: o total da peça continua 2`);
  const razao = (await api('GET', '/api/estoque/conferir')).corpo;
  prova(razao?.ok === true && !(razao?.divergentes ?? []).length, `${tam}: a razão fecha`);
  prova(!erros.length, `${tam}: nenhum erro de página${erros.length ? ` (${erros[0]})` : ''}`);
  if (movel) {
    const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    prova(sw <= iw + 1, `${tam}: sem rolagem horizontal (${sw} ≤ ${iw})`);
  }
  await ctx.close();
}
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nVariações do 391471: tudo ok.');
process.exit(falhas ? 1 : 0);
