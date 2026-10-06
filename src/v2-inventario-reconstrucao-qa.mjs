/** QA de navegador do inventário reconstruído (06/10/2026).
 *
 *  A pergunta de aceite é a da rodada: a Sthefany abre um inventário e
 *  entende a tela sem explicação? Este roteiro faz o caminho inteiro dela,
 *  no computador (1280px) e no telefone (390px), contra o Worker real:
 *
 *   abrir → bipar → ver "em casa / conferido / faltando" → bipe repetido sem
 *   querer (não soma, pergunta) → segunda peça igual (soma) → "estão todas
 *   aqui" → anel com aros: peça sem aro, escolher o aro, duas do mesmo aro,
 *   criar aro novo, tentar criar um que já existe → revendedora com aro
 *   desconhecido → busca por nome → pausar, recarregar, continuar → balanço
 *   (não conferidas, falta, sobra, impacto) → finalizar → estoque ajustado
 *   por movimento, razão fechada, variações guardadas, nada de perda.
 *
 *  E em cada tela: nenhuma informação técnica visível, nenhuma rolagem
 *  horizontal no telefone, botões de contar com alvo de dedo.
 *
 *    node scripts/v2-local/worker-local.mjs . 8799 scripts/v2-local/seed-catalogo.sql &
 *    cd frontend && npm run build && cd ..
 *    node scripts/v2-local/serve-app.mjs frontend/dist 5199 &
 *    cd src && MQ_API=http://127.0.0.1:8799 MQ_APP=http://127.0.0.1:5199 node v2-inventario-reconstrucao-qa.mjs
 *
 *  MQ_FOTOS=<pasta> guarda uma captura de cada passo. Para provar o bundle
 *  PUBLICADO: MQ_APP=<site>/v2 MQ_ROTEAR=<endereço da API que ele usa>.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP = process.env.MQ_APP || 'http://127.0.0.1:5173';
const API = process.env.MQ_API || 'http://127.0.0.1:8787';
const KEY = process.env.MQ_KEY || 'chave-local-de-teste';
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
const textoTecnico = (t) => PROIBIDO.filter((r) => r.test(t)).map(String);

const razaoFechada = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  return r.status === 200 && r.corpo?.ok === true && (r.corpo?.divergentes ?? []).length === 0;
};
const fecharAbertos = async () => {
  for (const i of (await api('GET', '/api/inventarios')).corpo ?? []) {
    if (i.status === 'aberto' || i.status === 'pausado') await api('POST', `/api/inventarios/${i.id}/cancelar`);
  }
};
const totalDe = async (sku) => ((await api('GET', '/api/state')).corpo?.produtos ?? []).find((p) => p.sku === sku)?.qtd;

/* Revendedora de prova com maleta aberta (uma para as duas larguras). */
const revs = (await api('GET', '/api/state')).corpo?.revendedoras ?? [];
let evelyn = revs.find((r) => r.nome === 'Evelyn Prova');
if (!evelyn) evelyn = (await api('POST', '/api/revendedoras', { nome: 'Evelyn Prova', cidade: 'Sumaré' })).corpo;
let maleta = ((await api('GET', '/api/state')).corpo?.maletas ?? [])
  .find((m) => (m.revId ?? m.rev_id) === evelyn.id && m.status === 'aberta');
if (!maleta) maleta = (await api('POST', '/api/maletas', { revId: evelyn.id, abertaEm: '2026-10-01', acertoEm: '2026-11-07' })).corpo;

const navegador = await chromium.launch();

for (const [largura, altura, movel, base] of [[1280, 900, false, 911000], [390, 844, true, 912000]]) {
  const tam = `${largura}px`;
  await fecharAbertos();

  /* ── as peças desta largura, pelas rotas reais. */
  const S = { brinco: String(base + 1), colar: String(base + 2), pulseira: String(base + 3), anel: String(base + 4) };
  const existentes = new Set(((await api('GET', '/api/state')).corpo?.produtos ?? []).map((p) => p.sku));
  const novas = [
    { sku: S.brinco, desc: `Brinco Gota ${tam}`, cat: 'Brinco', preco: 79, qtd: 6 },
    { sku: S.colar, desc: `Colar Elo ${tam}`, cat: 'Colar', preco: 99, qtd: 3 },
    { sku: S.pulseira, desc: `Pulseira Fita ${tam}`, cat: 'Pulseira', preco: 59, qtd: 2 },
    { sku: S.anel, desc: `Anel Cartier ${tam}`, cat: 'Anel', preco: 149, qtd: 7 },
  ].filter((p) => !existentes.has(p.sku));
  if (novas.length) {
    const r = await api('POST', '/api/produtos/novos/cadastrar', { produtos: novas, origem: 'qa-inventario-v2' });
    prova(r.status < 300, `${tam}: catálogo de prova cadastrado (${r.status})`);
    for (const aro of ['nº18', 'nº21', 'nº23']) await api('POST', `/api/produtos/${S.anel}/variacoes/adicionar`, { valor: aro });
    const ri = await api('POST', `/api/maletas/${maleta.id}/itens`, { itens: { [S.anel]: 1 } });
    prova(ri.status < 300, `${tam}: 1 anel na maleta da Evelyn Prova, aro não informado (${ri.status})`);
  }

  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: 1,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  /* MQ_ROTEAR=<endereço publicado da API>: o bundle PUBLICADO fala com o
     endereço dele, e o Playwright entrega cada chamada ao Worker real local
     (sem chave de produção, sem nuvem). */
  const ROTEAR = process.env.MQ_ROTEAR || null;
  if (ROTEAR) {
    await ctx.route(`${ROTEAR}/**`, async (rota) => {
      const req = rota.request();
      const destino = req.url().replace(ROTEAR, API);
      const h = { ...req.headers() };
      delete h.host; delete h.origin; delete h.referer;
      const r = await fetch(destino, { method: req.method(), headers: h, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() ?? undefined });
      const corpo = Buffer.from(await r.arrayBuffer());
      const cab = Object.fromEntries(r.headers);
      cab['access-control-allow-origin'] = '*';
      await rota.fulfill({ status: r.status, headers: cab, body: corpo });
    });
  }
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [ROTEAR || API, KEY]);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const leituras = [];
  p.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/inventarios\/\d+\/leituras$/.test(r.url())) leituras.push(JSON.parse(r.postData() || '{}'));
  });
  let n = 0;
  const foto = async (nome) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${String(++n).padStart(2, '0')}-${nome}.png`, fullPage: true }); };
  const semTecnico = async (onde) => {
    const t = await p.locator('main').innerText();
    const achados = textoTecnico(t);
    prova(!achados.length, `${tam}: nada técnico na tela — ${onde}${achados.length ? ` (${achados.join(', ')})` : ''}`);
  };
  const semRolagemLateral = async (onde) => {
    if (!movel) return;
    const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    prova(sw <= iw + 1, `${tam}: sem rolagem horizontal — ${onde} (${sw} ≤ ${iw})`);
  };

  await p.goto(`${APP}/#/estoque/inventario`);
  await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: 'Abrir inventário' }).first().click();
  const titulo = p.getByRole('heading', { name: /^Inventário #\d+$/ });
  await titulo.waitFor({ timeout: 10000 });
  const numeroTela = Number((await titulo.innerText()).replace(/\D/g, ''));
  const lista = (await api('GET', '/api/inventarios')).corpo;
  const inv = lista.find((i) => i.status === 'aberto');
  prova(inv && inv.numero === numeroTela, `${tam}: título mostra o número visível #${numeroTela} (id técnico ${inv?.id} fora da tela)`);
  prova(!(await p.locator('main').innerText()).includes(`#${inv.id}`) || inv.id === inv.numero,
    `${tam}: o id técnico não aparece`);
  const campo = p.getByLabel('Bipe a peça ou procure por código, nome ou variação');
  await p.waitForFunction(() => {
    const el = document.querySelector('input[aria-label^="Bipe a peça"]');
    return el && !el.disabled;
  }, null, { timeout: 10000 });
  await semRolagemLateral('conferência aberta');
  await foto('aberto');

  const bipar = async (codigo) => { await campo.fill(codigo); await campo.press('Enter'); };
  const peca = p.getByRole('region', { name: 'Peça em conferência' });
  const numero = (rotulo) => peca.getByLabel('Quantidades').locator('div', { has: p.locator('dt', { hasText: new RegExp(`^${rotulo}$`) }) }).locator('dd').innerText();
  const esperaNumero = async (rotulo, valor) => {
    await p.waitForFunction(([r, v]) => {
      const dts = [...document.querySelectorAll('[aria-label="Quantidades"] dt')];
      const dt = dts.find((d) => d.textContent === r);
      return dt && dt.nextElementSibling?.textContent === v;
    }, [rotulo, valor], { timeout: 5000 }).catch(() => {});
    return numero(rotulo);
  };

  /* ── 1 bipe = 1 unidade */
  await bipar(S.brinco);
  await peca.waitFor();
  prova(await esperaNumero('Conferido', '1') === '1', `${tam}: um bipe = 1 unidade conferida`);
  prova(await numero('Em casa') === '6' && await numero('Estoque total') === '6', `${tam}: estoque total 6, em casa 6`);
  prova(await numero('Faltando') === '5', `${tam}: faltando 5`);
  prova(await campo.inputValue() === '', `${tam}: o campo limpa depois do bipe`);
  await foto('um-bipe');

  /* ── bipe repetido sem querer: não soma, pergunta */
  await bipar(S.brinco);
  await p.getByText('Essa peça acabou de ser lida.').waitFor({ timeout: 3000 });
  await p.waitForTimeout(300);
  prova(leituras.filter((l) => l.sku === S.brinco).length === 1, `${tam}: bipe repetido logo em seguida NÃO somou`);
  prova(await numero('Conferido') === '1', `${tam}: continua 1 conferida`);
  await semRolagemLateral('pergunta do bipe repetido');
  await foto('bipe-repetido');
  await p.getByRole('button', { name: 'Contar outra unidade' }).click();
  prova(await esperaNumero('Conferido', '2') === '2', `${tam}: "Contar outra unidade" somou a segunda peça igual`);

  /* ── estão todas aqui */
  await peca.getByRole('button', { name: /Estão todas aqui \(6\)/ }).click();
  prova(await esperaNumero('Conferido', '6') === '6', `${tam}: "Estão todas aqui" conferiu 6`);
  prova(await numero('Faltando') === '—', `${tam}: sem falta, "Faltando" fica vazio (—)`);

  /* ── alvo de dedo nos botões de contar */
  if (movel) {
    const box = await peca.getByRole('button', { name: /Contar mais uma/ }).first().boundingBox();
    prova(box && box.width >= 40 && box.height >= 40, `${tam}: botão + tem alvo de dedo (${box?.width}×${box?.height})`);
  }

  /* ── anel com aros */
  await bipar(S.anel);
  await p.getByText(/1 peça sem variação\./).waitFor({ timeout: 5000 });
  const fora = peca.getByRole('region', { name: 'Com revendedoras' });
  prova(/Evelyn · 1 peça · variação não informada/.test(await fora.innerText()), `${tam}: revendedora com aro desconhecido aparece como "variação não informada"`);
  await foto('anel-sem-aro');
  await peca.getByRole('button', { name: 'nº23', exact: true }).click();
  await peca.getByRole('button', { name: 'Contar mais uma — Conferido em nº23' }).click();
  await p.waitForFunction(() => document.querySelector('input[aria-label="Conferido em nº23"]')?.value === '2', null, { timeout: 5000 }).catch(() => {});
  prova(await peca.getByLabel('Conferido em nº23', { exact: true }).inputValue() === '2', `${tam}: duas peças do mesmo aro (nº23 → 2)`);

  await peca.getByRole('button', { name: /Criar variação/ }).click();
  await peca.getByLabel('Variação', { exact: true }).fill('N21');
  prova(await peca.getByText('Essa variação já existe: nº21.').count() > 0, `${tam}: "N21" é a nº21 que já existe — avisa antes de criar`);
  await peca.getByLabel('Variação', { exact: true }).fill('19');
  await peca.getByLabel('Quantidade encontrada').fill('1');
  await peca.getByRole('button', { name: 'Salvar e continuar' }).click();
  await peca.getByLabel('Conferido em nº19', { exact: true }).waitFor({ timeout: 6000 }).catch(() => {});
  prova(await peca.getByLabel('Conferido em nº19', { exact: true }).count() === 1, `${tam}: variação nº19 criada sem sair do inventário`);
  await p.waitForFunction(() => document.querySelector('input[aria-label="Conferido em nº19"]')?.value === '1', null, { timeout: 5000 }).catch(() => {});
  prova(await peca.getByLabel('Conferido em nº19', { exact: true }).inputValue() === '1', `${tam}: nº19 com 1 encontrada`);
  const est = (await api('GET', `/api/produtos/${S.anel}/variacoes`)).corpo;
  prova(est.variacoes.some((v) => v.nome === 'nº19'), `${tam}: nº19 está no cadastro da peça (Peças, vendas, maletas)`);
  prova(await esperaNumero('Conferido', '3') === '3' && await numero('Faltando') === '3', `${tam}: anel 3 de 6 em casa — faltando 3`);
  await semTecnico('anel com variações');
  await semRolagemLateral('anel com variações');
  await foto('anel-variacoes');

  /* ── sobra: colar 3 esperado, conferido 4 (digitado) */
  await bipar(S.colar);
  await peca.getByLabel('Conferido', { exact: true }).fill('4');
  await peca.getByLabel('Conferido', { exact: true }).press('Enter');
  prova(await esperaNumero('Sobrando', '1') === '1', `${tam}: conferido 4 de 3 — sobrando 1`);

  /* ── busca manual por nome, sem contar */
  const antesBusca = leituras.length;
  await bipar(`Pulseira Fita ${tam}`);
  await peca.getByText(`Pulseira Fita ${tam}`).waitFor({ timeout: 3000 });
  prova(leituras.length === antesBusca, `${tam}: busca por nome abre a peça e não conta nada`);

  /* ── categorias e lista */
  const cats = p.getByRole('region', { name: 'Andamento por categoria' });
  prova(await cats.count() === 1 && /Anel/.test(await cats.innerText()), `${tam}: andamento por categoria visível`);
  const listaRegiao = p.getByRole('region', { name: 'Lista do inventário' });
  prova(await listaRegiao.getByText(`Pulseira Fita ${tam}`).count() > 0, `${tam}: a pulseira não conferida está na lista "Não conferidas"`);
  await semRolagemLateral('lista');
  await foto('lista');

  /* ── pausar, recarregar, continuar */
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Pausar' }).click();
  await p.getByText(/Tudo o que você conferiu está guardado/).waitFor({ timeout: 5000 });
  await p.reload();
  await p.waitForLoadState('networkidle');
  await p.getByText(/Tudo o que você conferiu está guardado/).waitFor({ timeout: 8000 });
  prova(await campo.isDisabled(), `${tam}: depois de recarregar, continua pausado e não aceita leitura`);
  await p.getByRole('button', { name: 'Continuar conferindo' }).first().click();
  await p.waitForFunction(() => !document.querySelector('input[aria-label^="Bipe a peça"]')?.disabled, null, { timeout: 5000 });
  const det = (await api('GET', `/api/inventarios/${inv.id}`)).corpo;
  const soma = (sku) => det.contagem.filter((c) => c.sku === sku).reduce((s, c) => s + c.contado, 0);
  prova(soma(S.brinco) === 6 && soma(S.anel) === 3 && soma(S.colar) === 4, `${tam}: retomou com tudo guardado (6, 3, 4)`);

  /* ── balanço */
  await p.getByRole('button', { name: 'Revisar e finalizar' }).click();
  await p.getByRole('heading', { name: `Balanço do inventário #${numeroTela}` }).waitFor({ timeout: 8000 });
  const impacto = await p.getByRole('region', { name: 'O que vai acontecer' }).innerText();
  prova(/(peça terá|peças terão) o estoque reduzido/.test(impacto), `${tam}: balanço diz quantas terão o estoque reduzido`);
  prova(/terá o estoque aumentado|terão o estoque aumentado/.test(impacto), `${tam}: balanço diz quantas terão o estoque aumentado`);
  prova(/não conferidas? continua/.test(impacto), `${tam}: balanço diz que as não conferidas ficam como estão`);
  prova(/Nenhuma diferença vira perda/.test(impacto), `${tam}: nenhuma diferença vira perda sozinha`);
  const grupoNao = p.locator('details', { hasText: 'Não conferidas' });
  prova(await grupoNao.getByText(`Pulseira Fita ${tam}`).count() > 0, `${tam}: a pulseira aparece em "Não conferidas"`);
  await semTecnico('balanço');
  await semRolagemLateral('balanço');
  await foto('balanco');

  await p.getByRole('button', { name: 'Finalizar inventário' }).click();
  await p.getByRole('button', { name: 'Finalizar e ajustar o estoque' }).click();
  await p.getByText(new RegExp(`Inventário #${numeroTela} finalizado`)).waitFor({ timeout: 10000 });
  await foto('finalizado');
  await semTecnico('finalizado');

  prova(await totalDe(S.anel) === 4, `${tam}: anel 7 → 4 (falta de 3 em casa; o da Evelyn continua)`);
  prova(await totalDe(S.colar) === 4, `${tam}: colar 3 → 4 (sobra de 1)`);
  prova(await totalDe(S.brinco) === 6, `${tam}: brinco sem diferença, 6`);
  prova(await totalDe(S.pulseira) === 2, `${tam}: pulseira não conferida, estoque igual (2)`);
  const movs = (await api('GET', `/api/estoque/${S.anel}/movimentos`)).corpo.movimentos;
  const ajuste = movs.find((m) => m.origem === 'inventario');
  prova(ajuste && new RegExp(`^Ajuste de inventário #${numeroTela} · Contagem física · contado 3, sistema dizia 6`).test(ajuste.obs),
    `${tam}: histórico do anel: "Ajuste de inventário #${numeroTela} · Contagem física · contado 3, sistema dizia 6"`);
  prova(ajuste && ajuste.variacao === null, `${tam}: a falta do anel sem aro na razão não ganhou aro inventado`);
  const estDepois = (await api('GET', `/api/produtos/${S.anel}/variacoes`)).corpo;
  const saldo = (nome) => estDepois.variacoes.find((v) => v.nome === nome)?.saldo;
  const semAro = estDepois.qtd - estDepois.variacoes.reduce((t, v) => t + v.saldo, 0);
  prova(saldo('nº23') === 2 && saldo('nº19') === 1 && semAro === 1,
    `${tam}: variações guardadas — nº23 2, nº19 1, não informada 1 (a da Evelyn)`);
  const perdas = ((await api('GET', '/api/saidas')).corpo?.saidas ?? (await api('GET', '/api/saidas')).corpo ?? [])
    .filter?.((s) => [S.anel, S.colar].includes(s.sku)) ?? [];
  prova(!perdas.length, `${tam}: nenhuma saída de perda criada`);
  prova(await razaoFechada(), `${tam}: GET /api/estoque/conferir vazio — a razão fecha`);

  /* ── a ficha da peça: histórico legível e variações sem nada técnico */
  await p.goto(`${APP}/#/estoque/peca:${S.anel}|historico`);
  await p.waitForLoadState('networkidle');
  await p.getByText(/Ajuste de inventário -3|Ajuste de inventário −3/).first().waitFor({ timeout: 8000 }).catch(() => {});
  const hist = await p.locator('main').innerText();
  prova(/Ajuste de inventário -3/.test(hist) && /Contado fisicamente: 3 · Sistema esperava: 6 · Motivo: Contagem física/.test(hist),
    `${tam}: histórico da peça em palavras de gente`);
  await semTecnico('histórico da peça');
  await foto('historico-peca');
  await p.goto(`${APP}/#/estoque/peca:${S.anel}|estoque`);
  await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: 'Variações' }).click();
  const painel = p.getByRole('dialog', { name: 'Variações da peça' });
  await painel.getByText('Variação ainda não informada', { exact: true }).waitFor({ timeout: 8000 });
  const tPainel = await painel.innerText();
  prova(!textoTecnico(tPainel).length && !/painel clássico/i.test(tPainel), `${tam}: Variações da peça sem id, sem "painel clássico"`);
  prova(/Total da peça\s*4/.test(tPainel) && /Com revendedoras\s*1/.test(tPainel) && /Em casa\s*3/.test(tPainel),
    `${tam}: Variações da peça mostra total 4 · com revendedoras 1 · em casa 3`);
  await semRolagemLateral('variações da peça');
  await foto('variacoes-da-peca');

  prova(!erros.length, `${tam}: nenhum erro de página${erros.length ? ` (${erros.join(' | ')})` : ''}`);
  await ctx.close();
}

await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nInventário V2: tudo certo nas duas larguras.');
process.exit(falhas ? 1 : 0);
