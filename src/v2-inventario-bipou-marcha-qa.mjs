/** QA de navegador do inventário "bipou e marcha" (02/10/2026).
 *
 *  A pergunta de aceite: "a Sthefany consegue pegar o leitor e ir bipando
 *  peça atrás de peça sem parar?". O leitor USB é um TECLADO: digita o código
 *  e manda Enter, rápido. Esta prova faz exatamente isso — 30 leituras
 *  seguidas pelo teclado, sem um clique entre elas — e mede:
 *
 *   · o campo limpa sozinho (sem "263571421089");
 *   · o foco nunca sai do leitor;
 *   · nenhum modal aparece;
 *   · cada leitura chega ao servidor UMA vez, como "conferido" (faltando 0);
 *   · o tempo de cada leitura até a tela mostrar a peça;
 *   · falta por "2 + Enter" e pelo campo Faltando, com o foco voltando;
 *   · peça com revendedora mostra o nome dela, e o esperado exclui o que está fora;
 *   · variação criada sem sair do inventário;
 *   · pausar → continuar preserva tudo; estoque e razão intactos.
 *
 *  Roda contra o harness local — sem chave real, sem nuvem:
 *
 *    node scripts/v2-local/worker-local.mjs . 8787 scripts/v2-local/seed-catalogo.sql &
 *    cd frontend && npm run build && cd ..
 *    node scripts/v2-local/serve-app.mjs frontend/dist 5173 &
 *    cd src && node v2-inventario-bipou-marcha-qa.mjs
 *
 *  MQ_FOTOS=<pasta> guarda uma captura de cada passo.
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

/* ── o catálogo da prova: 30 peças novas (900101…900130) e uma revendedora
   com uma maleta aberta, tudo pelas rotas reais. */
const NOVAS = Array.from({ length: 30 }, (_, i) => ({
  sku: String(900101 + i), desc: `Peça de prova ${i + 1}`, cat: i % 2 ? 'Brinco' : 'Anel', preco: 79, qtd: 3,
}));
const existentes = new Set(((await api('GET', '/api/state')).corpo?.produtos ?? []).map((p) => p.sku));
const faltam = NOVAS.filter((p) => !existentes.has(p.sku));
if (faltam.length) {
  const r = await api('POST', '/api/produtos/novos/cadastrar', { produtos: faltam, origem: 'qa-bipou-marcha' });
  prova(r.status < 300, `catálogo de prova: ${faltam.length} peças novas cadastradas (${r.status})`);
}
const revs = (await api('GET', '/api/state')).corpo?.revendedoras ?? [];
let evelyn = revs.find((r) => r.nome === 'Evelyn Prova');
if (!evelyn) evelyn = (await api('POST', '/api/revendedoras', { nome: 'Evelyn Prova', cidade: 'Sumaré' })).corpo;
const maletas = (await api('GET', '/api/state')).corpo?.maletas ?? [];
if (!maletas.some((m) => (m.revId ?? m.rev_id) === evelyn.id && m.status === 'aberta')) {
  const m = (await api('POST', '/api/maletas', { revId: evelyn.id, abertaEm: '2026-10-01', acertoEm: '2026-11-07' })).corpo;
  const r = await api('POST', `/api/maletas/${m.id}/itens`, { itens: { 900101: 1 } });
  prova(r.status < 300, `maleta aberta da Evelyn Prova com 1 × 900101 (${r.status})`);
}

const retratoDoEstoque = async () => JSON.stringify(((await api('GET', '/api/state')).corpo?.produtos ?? [])
  .map((p) => [p.sku, p.qtd]).sort());
const razaoFechada = async () => {
  const r = await api('GET', '/api/estoque/conferir');
  const c = r.corpo;
  return r.status === 200 && (Array.isArray(c) ? c.length === 0 : (c?.divergentes ?? c?.itens ?? []).length === 0);
};
const fecharAbertos = async () => {
  for (const i of (await api('GET', '/api/inventarios')).corpo ?? []) {
    if (i.status === 'aberto' || i.status === 'pausado') await api('POST', `/api/inventarios/${i.id}/cancelar`);
  }
};

const navegador = await chromium.launch();

for (const [largura, altura, movel] of [[1280, 900, false], [390, 844, true]]) {
  await fecharAbertos();
  const tam = `${largura}px`;
  /* O harness é um banco só para as duas larguras: cada uma cria o seu aro. */
  const ARO = `Aro ${largura > 600 ? 'L' : 'M'}${Date.now().toString(36).slice(-4)}`;
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: 1,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API, KEY]);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const gravacoes = [];
  p.on('request', (r) => {
    if (r.method() === 'POST' && /\/api\/inventarios\/\d+\/itens$/.test(r.url())) gravacoes.push(JSON.parse(r.postData() || '{}'));
  });
  const foto = async (nome) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${nome}.png`, fullPage: true }); };

  const ESTOQUE_ANTES = await retratoDoEstoque();
  await p.goto(`${APP}/#/estoque/inventario`);
  await p.waitForLoadState('networkidle');
  await p.getByRole('button', { name: 'Abrir inventário' }).first().click();
  const titulo = p.getByRole('heading', { name: /^Inventário #\d+$/ });
  await titulo.waitFor({ timeout: 10000 });
  const id = Number((await titulo.innerText()).replace(/\D/g, ''));
  const leitor = p.getByLabel('Bipar peça');
  await p.waitForFunction(() => {
    const el = document.querySelector('input[aria-label="Bipar peça"]');
    return el && !el.disabled && document.activeElement === el;
  }, null, { timeout: 10000 });
  prova(true, `${tam}: inventário #${id} aberto, leitor habilitado e com foco sem clique`);
  prova(!(await p.locator('.inventory-contexts').count()), `${tam}: cartões de contexto saem do caminho durante a contagem`);
  await foto('1-aberto');

  /* ── 30 leituras seguidas, pelo teclado, como o leitor USB faz. */
  const tempos = [];
  let focoPerdido = 0, campoSujo = 0, modal = 0;
  for (const peca of NOVAS) {
    const t0 = Date.now();
    await p.keyboard.type(peca.sku, { delay: 4 });
    await p.keyboard.press('Enter');
    await p.locator('.estacao__ultima', { hasText: peca.desc }).first().waitFor({ timeout: 3000 });
    tempos.push(Date.now() - t0);
    if (!(await leitor.evaluate((el) => el === document.activeElement))) focoPerdido++;
    if ((await leitor.inputValue()) !== '') campoSujo++;
    if (await p.locator('[role="dialog"]').count()) modal++;
  }
  tempos.sort((a, b) => a - b);
  const mediana = tempos[Math.floor(tempos.length / 2)];
  const pior = tempos.at(-1);
  prova(focoPerdido === 0, `${tam}: 30 leituras seguidas — foco nunca saiu do leitor (${focoPerdido})`);
  prova(campoSujo === 0, `${tam}: o campo limpou a cada leitura — nenhum código grudado (${campoSujo})`);
  prova(modal === 0, `${tam}: nenhum modal interrompeu (${modal})`);
  prova(mediana < 400, `${tam}: leitura → peça na tela: mediana ${mediana} ms, pior ${pior} ms (inclui digitar 6 dígitos)`);
  await p.waitForFunction(() => !document.body.innerText.includes('salvando…'), null, { timeout: 10000 });
  await p.waitForTimeout(400);
  const det = (await api('GET', `/api/inventarios/${id}`)).corpo;
  const doServidor = det.contagem.filter((c) => /^9001/.test(c.sku));
  prova(doServidor.length === 30, `${tam}: as 30 conferências estão no servidor (${doServidor.length})`);
  prova(doServidor.every((c) => c.faltando === 0), `${tam}: todas como "conferido" (faltando 0)`);
  const porSku = new Map(doServidor.map((c) => [c.sku, c.contado]));
  prova(porSku.get('900102') === 3, `${tam}: um bipe = esperado inteiro (3), não 1 (${porSku.get('900102')})`);
  prova(gravacoes.filter((g) => /^9001/.test(g.sku)).length === 30, `${tam}: uma gravação por referência, nenhuma duplicada`);
  prova(gravacoes.every((g) => !('contado' in g) || g.contado !== 1 || g.sku === '900101'), `${tam}: nenhuma leitura gravada como "+1 unidade"`);
  await foto('2-trinta-leituras');

  /* ── repetir um código: "Já conferido", nenhuma gravação. */
  const antes = gravacoes.length;
  await p.keyboard.type('900105'); await p.keyboard.press('Enter');
  await p.getByText(/Já conferido/).first().waitFor({ timeout: 3000 });
  prova(gravacoes.length === antes, `${tam}: código repetido mostra "Já conferido" e não grava`);

  /* ── peça com revendedora: 3 no total, 1 com a Evelyn → 2 em casa. */
  const ultima = p.getByRole('region', { name: 'Última peça' });
  await p.keyboard.type('900101'); await p.keyboard.press('Enter');
  await ultima.getByText(/Peça de prova 1$/).waitFor({ timeout: 3000 });
  const textoUltima = await ultima.innerText();
  prova(/Evelyn 1/.test(textoUltima), `${tam}: a peça mostra "Com revendedoras: Evelyn 1"`);
  const det1 = (await api('GET', `/api/inventarios/${id}`)).corpo;
  prova(det1.contagem.find((c) => c.sku === '900101')?.contado === 2, `${tam}: esperado em casa exclui a peça da Evelyn (2 = 3 − 1)`);

  /* ── falta: "2 + Enter" no próprio leitor. */
  await p.keyboard.type('900110'); await p.keyboard.press('Enter');
  await ultima.getByText(/Peça de prova 10$/).waitFor({ timeout: 3000 });
  await p.keyboard.type('2'); await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const c110 = (await api('GET', `/api/inventarios/${id}`)).corpo.contagem.find((c) => c.sku === '900110');
  prova(c110?.faltando === 2 && c110?.contado === 1, `${tam}: "2 + Enter" grava falta 2 (encontrado 1 de 3)`);
  prova(await leitor.evaluate((el) => el === document.activeElement), `${tam}: depois da falta o leitor continua pronto`);

  /* ── falta pelo campo Faltando, Enter, e o foco volta. */
  await p.keyboard.type('900111'); await p.keyboard.press('Enter');
  await ultima.getByText(/Peça de prova 11$/).waitFor({ timeout: 3000 });
  await p.getByLabel('Faltando').click();
  await p.keyboard.type('1'); await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const c111 = (await api('GET', `/api/inventarios/${id}`)).corpo.contagem.find((c) => c.sku === '900111');
  prova(c111?.faltando === 1, `${tam}: campo Faltando + Enter grava falta 1`);
  prova(await leitor.evaluate((el) => el === document.activeElement), `${tam}: Enter no Faltando devolve o foco ao leitor`);
  /* ...e a leitura seguinte entra direto, sem clique. */
  await p.keyboard.type('100101'); await p.keyboard.press('Enter');
  await ultima.getByText('Colar Lua Cheia').waitFor({ timeout: 3000 });
  prova(true, `${tam}: a leitura seguinte entrou sem clique`);
  await foto('3-falta');

  /* ── variação nova sem sair do inventário. */
  await p.getByRole('button', { name: '+ Adicionar variação' }).click();
  await p.getByLabel('Nova variação').fill(ARO);
  await p.getByRole('button', { name: 'Salvar', exact: true }).click();
  await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Bipar peça', null, { timeout: 5000 });
  await p.waitForTimeout(800);
  const det2 = (await api('GET', `/api/inventarios/${id}`)).corpo;
  prova(det2.eventos?.some((e) => e.sku === '100101' && e.variacao === ARO), `${tam}: variação "${ARO}" criada e registrada no inventário`);
  prova(det2.contagem.some((c) => c.sku === '100101' && c.variacao === ARO), `${tam}: a peça ficou conferida na variação nova`);
  prova(true, `${tam}: o foco voltou ao leitor depois de criar a variação`);
  await foto('4-variacao');

  /* ── código desconhecido: aviso, nada gravado, leitor segue. */
  const g0 = gravacoes.length;
  await p.keyboard.type('777777'); await p.keyboard.press('Enter');
  await p.getByText(/777777 não está na lista/).first().waitFor({ timeout: 3000 });
  prova(gravacoes.length === g0 && (await leitor.inputValue()) === '', `${tam}: código desconhecido avisa, não grava e limpa o campo`);

  /* ── resumo discreto. */
  const resumo = await p.getByLabel('Resumo da conferência').innerText();
  prova(/conferidos/i.test(resumo) && /com falta/i.test(resumo) && /pendentes/i.test(resumo), `${tam}: resumo Conferidos / Com falta / Pendentes`);
  const lista = p.locator('details.inventario-lista');
  prova(!(await lista.evaluate((el) => el.open)), `${tam}: a lista completa fica recolhida`);

  /* ── pausar → continuar. */
  await p.getByRole('button', { name: 'Pausar', exact: true }).click();
  await p.getByRole('button', { name: 'Continuar', exact: true }).waitFor({ timeout: 5000 });
  prova(await leitor.isDisabled(), `${tam}: pausado, o leitor não aceita leitura`);
  await p.getByRole('button', { name: 'Continuar', exact: true }).click();
  await p.getByRole('button', { name: 'Pausar', exact: true }).waitFor({ timeout: 5000 });
  const det3 = (await api('GET', `/api/inventarios/${id}`)).corpo;
  prova(det3.contagem.find((c) => c.sku === '900110')?.faltando === 2, `${tam}: pausar → continuar preserva conferidos e faltas`);

  /* ── concluir mostra o resumo e não fecha sozinho. */
  await p.getByRole('button', { name: /^Concluir$/ }).click();
  const dialogo = p.getByRole('dialog');
  await dialogo.waitFor({ timeout: 3000 });
  const textoDialogo = await dialogo.innerText();
  prova(/com falta/i.test(textoDialogo) && /não conferidos/i.test(textoDialogo) && textoDialogo.includes(ARO),
    `${tam}: encerrar mostra conferidos, com falta, não conferidos e a variação criada`);
  await foto('5-encerrar');
  await dialogo.getByRole('button', { name: /^Continuar conferindo$/ }).first().click();

  prova(await retratoDoEstoque() === ESTOQUE_ANTES, `${tam}: estoque idêntico — contar não mexe em saldo`);
  prova(await razaoFechada(), `${tam}: /api/estoque/conferir vazio`);
  const largo = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  prova(!largo, `${tam}: sem rolagem horizontal`);
  prova(erros.length === 0, `${tam}: nenhum erro de JavaScript (${erros.join(' | ')})`);
  await api('POST', `/api/inventarios/${id}/cancelar`);
  await ctx.close();
}

await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
