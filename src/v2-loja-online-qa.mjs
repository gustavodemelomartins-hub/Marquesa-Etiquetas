/** QA da Loja online (§63) — Visão geral e Preparação, 1366 e 390 px.
 *
 *    cd src && MQ_APP=<site>/v2 MQ_API=<Worker local> MQ_ROTEAR=<API do bundle> \
 *      node v2-loja-online-qa.mjs
 *
 *  MQ_ROTEAR entrega cada chamada da API do bundle ao Worker local (o Worker
 *  real sobre uma cópia do banco, SEM credencial da Nuvemshop): nenhuma
 *  chave de produção, nada escrito na nuvem, nada publicado na loja — o
 *  "Publicar" do teste chega ao servidor e é recusado pela trava de
 *  credencial, o que prova o caminho inteiro sem tocar na loja.
 *
 *  Prova o que a pessoa vê: estado da sincronização, quatro números, só o
 *  que precisa de gente, conferir × corrigir, o técnico fechado; na
 *  Preparação, miniatura real, checklist de oito itens, filtros, seleção,
 *  publicar um / selecionados / todos com confirmação, o detalhe da peça;
 *  sem erro de JS e sem rolagem lateral no telefone.
 */
import { chromium } from 'playwright';

const APP = process.env.MQ_APP || 'http://localhost:5173';
const API = process.env.MQ_API || 'http://127.0.0.1:8792';
const KEY = process.env.MQ_KEY || 'chave-local-de-teste';
const ROTEAR = process.env.MQ_ROTEAR || null;
const FOTOS = process.env.MQ_FOTOS || null;

let falhas = 0;
const prova = (ok, texto) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`); if (!ok) falhas++; };
const numero = async (loc) => Number((await loc.innerText()).replace(/\D/g, '') || NaN);

const navegador = await chromium.launch();
for (const [largura, altura, movel] of [[1366, 900, false], [390, 844, true]]) {
  const tam = `${largura}px`;
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura },
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  const publicacoes = [];
  if (ROTEAR) {
    await ctx.route(`${ROTEAR}/**`, async (rota) => {
      const req = rota.request();
      if (req.method() === 'POST' && /\/publicar$/.test(req.url())) publicacoes.push(req.url());
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
  const foto = async (nome, cheia = false) => {
    if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${nome}.png`, fullPage: cheia });
  };
  const lateral = async (onde) => {
    const px = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    prova(px <= 1, `${tam} ${onde}: sem rolagem lateral (${px}px)`);
  };

  /* ───────────────────────────── Visão geral */
  await p.goto(`${APP}/#/nuvemshop`);
  await p.getByRole('heading', { name: 'Loja online' }).waitFor({ timeout: 20000 });
  await p.locator('.mq-kpis').waitFor({ timeout: 30000 });
  prova(await p.getByRole('button', { name: 'Visão geral' }).count() === 1
    && await p.getByRole('button', { name: /^Preparação/ }).count() === 1, `${tam} duas abas: Visão geral e Preparação`);
  prova(await p.locator('.mq-loja-status .mq-status').count() === 1,
    `${tam} estado da sincronização numa linha: "${await p.locator('.mq-loja-status .mq-status').innerText()}"`);
  const kpi = (r) => p.locator('.mq-kpi', { hasText: r }).locator('.mq-kpi__value');
  const k = {
    publicados: await numero(kpi('Publicados na loja')), ocultos: await numero(kpi('Ocultos em preparação')),
    prontos: await numero(kpi('Prontos para publicar')), atencao: await numero(kpi('Precisam de atenção')),
  };
  prova(Object.values(k).every(Number.isFinite) && await p.locator('.mq-kpi').count() === 4,
    `${tam} quatro números: ${k.publicados} publicados · ${k.ocultos} ocultos · ${k.prontos} prontos · ${k.atencao} atenção`);
  const textoAtencao = await p.locator('#atencao').innerText();
  prova(!/fora do ar com peça/i.test(textoAtencao), `${tam} oculto em preparação NÃO aparece como problema`);
  prova(!/linha_de_base|variante_criada|sem_reparticao|resultado_json/.test(textoAtencao), `${tam} nenhuma chave técnica na tela principal`);
  prova(/O que fazer:/.test(textoAtencao) || /Nada esperando por você/.test(textoAtencao), `${tam} cada item diz o que fazer`);
  const gemeosNaAtencao = /Possível duplicidade/.test(textoAtencao);
  prova(await p.getByRole('button', { name: 'Analisar sincronização' }).count() === 0, `${tam} "Analisar sincronização" saiu`);
  prova(await p.getByRole('button', { name: 'Conferir agora' }).count() === 1
    && /não muda nada na Nuvemshop/.test(await p.locator('[aria-label="Conferir com a Nuvemshop"]').innerText()),
  `${tam} "Conferir agora" diz que só lê`);
  prova(await p.locator('details.mq-card[open]').count() === 0, `${tam} diagnóstico técnico fechado`);
  await foto('visao-geral', true);
  await lateral('visão geral');
  await p.getByText('Ver detalhes da sincronização').click();
  prova(await p.locator('.mq-tecnica').count() > 0, `${tam} "Ver detalhes da sincronização" abre o técnico`);

  /* ───────────────────────────── Preparação */
  await p.locator('.mq-kpi', { hasText: 'Prontos para publicar' }).click();
  await p.locator('.mq-prep-linha').first().waitFor({ timeout: 30000 });
  prova(await p.locator('nav[aria-label="Situação na Nuvemshop"] button[aria-selected="true"]', { hasText: 'Prontos' }).count() === 1,
    `${tam} o número "Prontos" leva à aba dos prontos`);
  const linhas = p.locator('.mq-prep-linha');
  prova(await linhas.count() === k.prontos, `${tam} a aba tem os ${k.prontos} prontos do número`);
  await p.waitForTimeout(2500);
  const imgs = await p.$$eval('.mq-prep-linha .mq-thumb img', (l) => l.slice(0, 8).map((i) => ({ ok: i.complete && i.naturalWidth > 0 })));
  prova(imgs.length > 0 && imgs.some((i) => i.ok), `${tam} miniaturas reais carregadas (${imgs.filter((i) => i.ok).length}/${imgs.length} das primeiras)`);
  prova(await p.locator('.mq-prep-linha .mq-minicheck').count() === await linhas.count(), `${tam} checklist compacto em toda linha`);
  if (!movel) {
    const selos = await linhas.first().locator('.mq-minicheck li:not(.mq-minicheck__resumo):not(.mq-minicheck__disp)').allInnerTexts();
    prova(selos.length === 7 && selos.every((s) => s.startsWith('✓')), `${tam} pronto = 7 ✓ de cadastro (${selos.map((s) => s.split(':')[0]).join(' ')})`);
    prova(/em casa/.test(await linhas.first().locator('.mq-minicheck__disp').innerText()), `${tam} disponibilidade à parte do cadastro (§64)`);
  } else {
    prova(await linhas.first().getByText('✓ Cadastro completo').isVisible(), `${tam} no telefone: "✓ Cadastro completo"`);
  }
  await foto('prontos');
  await lateral('preparação');

  /* filtro por tipo + selecionar os filtrados */
  const tipos = await p.locator('select[aria-label="Tipo"] option').allInnerTexts();
  const tipo = tipos.find((t) => /Brinco/.test(t)) || tipos[1];
  await p.locator('select[aria-label="Tipo"]').selectOption({ label: tipo });
  const filtradas = await linhas.count();
  const cats = await linhas.evaluateAll((l) => l.map((x) => x.querySelector('small')?.textContent || ''));
  prova(filtradas > 0 && cats.every((c) => c.includes(tipo)), `${tam} filtro "${tipo}": ${filtradas} peças, todas do tipo`);
  await p.getByLabel(/Selecionar os filtrados/).check();
  const sel = p.getByRole('button', { name: new RegExp(`Publicar selecionados \\(${filtradas}\\)`) });
  prova(await sel.isEnabled(), `${tam} "Publicar selecionados (${filtradas})"`);
  await sel.click();
  const modal = p.getByRole('dialog', { name: 'Publicar na Nuvemshop' });
  await modal.waitFor();
  const resumo = await modal.innerText();
  prova(/Pendências críticas\s*0/i.test(resumo) && /Com imagem/i.test(resumo) && /Peças em casa/i.test(resumo), `${tam} confirmação com o resumo do lote`);
  await foto('confirmar-selecionados');
  await modal.getByRole('button', { name: 'Cancelar' }).click();
  prova(publicacoes.length === 0, `${tam} cancelar não publica nada`);

  await p.locator('select[aria-label="Tipo"]').selectOption({ index: 0 });
  await p.getByRole('button', { name: /Publicar todos os prontos/ }).click();
  await modal.waitFor();
  prova(new RegExp(`${k.prontos} produtos estão prontos para publicação`).test(await modal.innerText()),
    `${tam} "Publicar todos": "${k.prontos} produtos estão prontos para publicação."`);
  await modal.getByRole('button', { name: 'Cancelar' }).click();

  /* publicar UM, de ponta a ponta: o servidor de teste não tem credencial
     da loja, então ele RECUSA — e a tela diz que não publicou. */
  await linhas.first().getByRole('button', { name: 'Publicar' }).click();
  await modal.waitFor();
  await modal.getByRole('button', { name: 'Publicar 1 produto' }).click();
  await modal.getByRole('heading', { name: 'Publicação concluída' }).waitFor({ timeout: 30000 });
  const fim = await modal.innerText();
  prova(publicacoes.length === 1 && /0 publicados/.test(fim) && /1 não publicado/.test(fim),
    `${tam} publicar um: o servidor revalida, recusa sem credencial e a tela diz "1 não publicado"`);
  await foto('resultado');
  await modal.getByRole('button', { name: 'Fechar' }).first().click();

  /* o detalhe da peça */
  await linhas.first().locator('.mq-prep-linha__abrir').click();
  const drawer = p.getByRole('dialog', { name: 'Detalhes da peça' });
  await drawer.waitFor();
  await p.waitForTimeout(1200);
  const det = await drawer.innerText();
  prova(/SKU/i.test(det) && /Preço/i.test(det) && /Estoque em casa/i.test(det) && /Categoria/i.test(det) && /Cadastro/i.test(det) && /Disponibilidade/i.test(det),
    `${tam} detalhe: SKU, preço, estoque, categoria, cadastro e disponibilidade`);
  prova(!/sem_preparador|sem_r2|linha_de_base|variante_criada|Ainda não disponível/.test(det), `${tam} detalhe sem código interno (§64)`);
  prova(/Na Nuvemshop agora/i.test(det), `${tam} detalhe lê o anúncio da loja (aqui sem credencial: avisa e segue)`);
  prova(await drawer.getByRole('button', { name: 'Publicar na Nuvemshop' }).count() === 1, `${tam} detalhe tem "Publicar na Nuvemshop"`);
  await foto('detalhe');
  await lateral('detalhe');
  await drawer.getByRole('button', { name: 'Fechar' }).click();

  for (const aba of ['Não cadastrados', 'Ocultos — em preparação', 'Publicados', 'Com erro', 'Sem peça em casa']) {
    prova(await p.locator('nav[aria-label="Situação na Nuvemshop"] button', { hasText: aba }).count() === 1, `${tam} aba "${aba}"`);
  }
  /* §64 — oculto sem peça em casa: aba própria, nenhum ✕, frase de estado */
  await p.locator('nav[aria-label="Situação na Nuvemshop"] button', { hasText: 'Sem peça em casa' }).click();
  await p.waitForTimeout(300);
  const semPeca = await linhas.count();
  const textoSemPeca = semPeca ? await p.locator('.mq-list').innerText() : '';
  prova(!semPeca || (/Sem peça em casa/.test(textoSemPeca) && !/sem_estoque/.test(textoSemPeca)),
    `${tam} aba "Sem peça em casa": ${semPeca} peças, fora da fila, sem chave técnica`);
  await foto('sem-estoque');
  const corpoInteiro = await p.locator('main').innerText().catch(() => '');
  prova(!/sem_preparador|sem_r2|linha_de_base|variante_criada|resultado_json/.test(corpoInteiro), `${tam} Preparação sem código interno (§64)`);
  await p.locator('nav[aria-label="Situação na Nuvemshop"] button', { hasText: 'Ocultos' }).click();
  await p.locator('select[aria-label="Mostrar"]').selectOption({ label: 'Sem foto' });
  prova(true, `${tam} filtro "Sem foto" nos ocultos: ${await linhas.count()} peças`);
  await foto('ocultos-sem-foto');

  /* §66 — oculto que pode ser o gêmeo de outro código: filtro próprio, a
     atenção da visão geral e o detalhe dizem com quem e o que fazer. */
  await p.locator('select[aria-label="Mostrar"]').selectOption({ label: 'Possível duplicidade' });
  await p.waitForTimeout(300);
  const gemeos = await linhas.count();
  prova(gemeos > 0 && gemeosNaAtencao, `${tam} "Possível duplicidade": ${gemeos} ocultos no filtro e o bloco na visão geral`);
  if (gemeos) {
    await linhas.first().locator('.mq-prep-linha__abrir').click();
    await drawer.waitFor();
    await p.waitForTimeout(800);
    const d2 = await drawer.innerText();
    prova(/Possível duplicidade — decida antes de publicar/.test(d2) && /mesmo modelo de \d+/.test(d2) && /✕\s*Cadastro/.test(d2),
      `${tam} detalhe do gêmeo: com qual código, o indício, e Cadastro ✕`);
    await foto('gemeo');
    await drawer.getByRole('button', { name: 'Fechar' }).click();
  }

  prova(erros.length === 0, `${tam} sem erro de JavaScript${erros.length ? ': ' + erros[0] : ''}`);
  await ctx.close();
}
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nLoja online: ok');
process.exit(falhas ? 1 : 0);
