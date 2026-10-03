/* QA DE "DESCARTAR INVENTÁRIO" — num navegador de verdade, em 1280px e no
 * telefone (390×844). Nasceu de 02/10/2026: havia um inventário pausado em
 * produção e a V2 não tinha como descartá-lo, e um pausado bloqueia o
 * seguinte.
 *
 * Roda contra o harness local — sem chave real, sem nuvem:
 *
 *   node scripts/v2-local/worker-local.mjs . 8787 scripts/v2-local/seed-catalogo.sql &
 *   cd frontend && npm run build && cd ..
 *   node scripts/v2-local/serve-app.mjs frontend/dist 5173 &
 *   cd src && node v2-inventario-descartar-qa.mjs
 *
 * Cada largura abre, conta, pausa, continua, abre a confirmação e volta,
 * descarta, confere o histórico e o estoque, e abre um inventário novo.
 * MQ_FOTOS=<pasta> guarda uma captura de cada passo.
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

/* O retrato do estoque que o descarte não pode mexer: saldo de cada código
   e a conferência da razão. */
const retratoDoEstoque = async () => {
  const estado = (await api('GET', '/api/state')).corpo;
  return JSON.stringify((estado?.produtos ?? []).map((p) => [p.sku, p.qtd]).sort());
};
const razaoFechada = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  const c = r.corpo;
  return r.status === 200 && (Array.isArray(c) ? c.length === 0 : (c?.divergentes ?? c?.itens ?? []).length === 0);
};

/* Nenhum inventário em andamento antes de começar: o harness pode ter
   sobrado de outra rodada. */
for (const i of (await api('GET', '/api/inventarios')).corpo ?? []) {
  if (i.status === 'aberto' || i.status === 'pausado') await api('POST', `/api/inventarios/${i.id}/cancelar`);
}

const navegador = await chromium.launch();

for (const [largura, altura, movel] of [[1280, 900, false], [390, 844, true]]) {
  const tam = `${largura}px`;
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 1,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API, KEY]);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const foto = async (nome) => {
    if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${nome}.png`, fullPage: true });
  };
  const ir = async () => {
    await p.goto(`${APP}/#/estoque/inventario`);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(300);
  };

  const ESTOQUE_ANTES = await retratoDoEstoque();

  /* ── abrir e contar uma peça ── */
  await ir();
  await p.getByRole('button', { name: 'Abrir inventário' }).first().click();
  const titulo = p.getByRole('heading', { name: /^Inventário #\d+$/ });
  await titulo.waitFor({ timeout: 10000 });
  const id = Number((await titulo.innerText()).replace(/\D/g, ''));
  prova(id > 0, `${tam}: inventário #${id} aberto`);
  /* Desde 02/10/2026 a contagem entra pelo leitor ("bipou e marcha"). */
  const leitor = p.getByLabel('Bipar peça');
  await p.waitForFunction(() => !document.querySelector('input[aria-label="Bipar peça"]')?.disabled, null, { timeout: 10000 });
  await leitor.fill('100101');
  await leitor.press('Enter');
  await p.waitForTimeout(800);
  const contados = (await api('GET', `/api/inventarios/${id}`)).corpo?.contagem?.length ?? 0;
  prova(contados === 1, `${tam}: uma contagem gravada (${contados})`);

  /* ── pausar → continuar ── */
  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await p.getByRole('button', { name: 'Continuar', exact: true }).waitFor({ timeout: 5000 });
  const cabecalho = p.locator('.active-inventory-head');
  const textoPausado = await cabecalho.innerText();
  prova(/Pausado/.test(textoPausado) && /iniciado em \d{2}\/\d{2}/.test(textoPausado),
    `${tam}: o cartão diz "Pausado" e a data de início`);
  for (const nome of ['Continuar', 'Concluir', 'Descartar']) {
    prova(await cabecalho.getByRole('button', { name: nome, exact: true }).isVisible(),
      `${tam}: botão "${nome}" visível no pausado`);
  }
  await foto('1-pausado');
  await p.getByRole('button', { name: 'Continuar', exact: true }).click();
  await p.getByRole('button', { name: 'Pausar', exact: true }).waitFor({ timeout: 5000 });
  prova((await api('GET', `/api/inventarios/${id}`)).corpo?.status === 'aberto',
    `${tam}: continuar volta para "aberto"`);
  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await p.getByRole('button', { name: 'Continuar', exact: true }).waitFor({ timeout: 5000 });

  /* ── abrir a confirmação e VOLTAR ── */
  await p.getByRole('button', { name: 'Descartar', exact: true }).click();
  const dialogo = p.getByRole('alertdialog', { name: 'Descartar este inventário?' });
  await dialogo.waitFor({ timeout: 5000 });
  const texto = await dialogo.innerText();
  prova(texto.includes('As contagens realizadas não serão aplicadas ao estoque.')
    && texto.includes('O inventário continuará disponível no histórico como cancelado.'),
  `${tam}: a confirmação diz o combinado`);
  const caixa = await dialogo.boundingBox();
  prova(!!caixa && caixa.x >= 0 && caixa.x + caixa.width <= largura + 1,
    `${tam}: a confirmação cabe na tela`);
  await foto('2-confirmacao');
  await dialogo.getByRole('button', { name: 'Voltar' }).click();
  await p.waitForTimeout(400);
  prova(await dialogo.count() === 0, `${tam}: Voltar fecha a confirmação`);
  const intacto = (await api('GET', `/api/inventarios/${id}`)).corpo;
  prova(intacto?.status === 'pausado' && intacto?.contagem?.length === 1,
    `${tam}: depois de Voltar o inventário segue pausado com a contagem`);

  /* ── descartar de verdade ── */
  await p.getByRole('button', { name: 'Descartar', exact: true }).click();
  await dialogo.waitFor({ timeout: 5000 });
  await dialogo.getByRole('button', { name: 'Descartar inventário' }).click();
  await p.getByRole('button', { name: 'Abrir inventário' }).first().waitFor({ timeout: 10000 });
  const depois = (await api('GET', `/api/inventarios/${id}`)).corpo;
  prova(depois?.status === 'cancelado', `${tam}: o inventário #${id} ficou "cancelado"`);
  prova(depois?.contagem?.length === 1, `${tam}: a contagem continua guardada no cancelado`);
  const linha = p.locator('.mq-item', { hasText: `Inventário #${id}` });
  prova(await linha.count() === 1 && /Cancelado/.test(await linha.innerText()),
    `${tam}: o histórico mostra #${id} como Cancelado`);
  prova(await retratoDoEstoque() === ESTOQUE_ANTES, `${tam}: estoque antes = estoque depois`);
  prova(await razaoFechada(), `${tam}: /api/estoque/conferir vazio`);
  await foto('3-descartado');

  /* ── o cancelado, aberto pelo histórico, não oferece descarte ── */
  await linha.click();
  await p.getByText(/as contagens não foram aplicadas/).waitFor({ timeout: 5000 });
  prova(await p.getByRole('button', { name: /^Descartar/ }).count() === 0
    && await p.getByRole('button', { name: 'Concluir', exact: true }).count() === 0,
  `${tam}: cancelado não oferece Descartar nem Concluir`);
  await p.getByRole('button', { name: 'Fechar', exact: true }).click();

  /* ── um novo pode ser aberto ── */
  await p.getByRole('button', { name: 'Abrir inventário' }).first().click();
  await p.getByRole('heading', { name: new RegExp(`^Inventário #${id + 1}$`) }).waitFor({ timeout: 10000 });
  prova(true, `${tam}: inventário novo #${id + 1} aberto depois do descarte`);
  await api('POST', `/api/inventarios/${id + 1}/cancelar`);

  const larguraDoc = await p.evaluate(() => document.documentElement.scrollWidth);
  prova(larguraDoc <= largura + 1, `${tam}: sem transbordo lateral (${larguraDoc}px)`);
  prova(erros.length === 0, `${tam}: nenhum erro de JavaScript${erros.length ? ` — ${erros[0]}` : ''}`);
  await ctx.close();
}

await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodas as provas passaram.');
process.exit(falhas ? 1 : 0);
