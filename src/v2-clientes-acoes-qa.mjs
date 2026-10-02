/* QA DAS AÇÕES DE CADASTRO DA CLIENTE — num navegador de verdade, em 1280px
 * e no telefone (390×844). Nasceu de 02/10/2026: a V2 não tinha como excluir
 * nem arquivar cliente, e os cadastros operacionais da planilha antiga
 * ("Brinde dia das mães", "Inventário") ficavam na lista.
 *
 * Roda contra o harness local — sem chave real, sem nuvem:
 *
 *   node scripts/v2-local/worker-local.mjs . 8787 scripts/v2-local/seed-catalogo.sql &
 *   cd frontend && npm run build && cd ..
 *   node scripts/v2-local/serve-app.mjs frontend/dist 5173 &
 *   cd src && node v2-clientes-acoes-qa.mjs
 *
 * Cada largura cria uma cliente com compra e uma sem nada; arquiva, confere
 * que saiu da lista e que a ficha guarda o histórico, reativa, tenta excluir
 * a que tem histórico (o sistema oferece arquivar) e exclui a vazia.
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
const prova = (ok, t) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${t}`); if (!ok) falhas++; };
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

/* O retrato do estoque, que nada aqui pode mexer. */
const estoque = async () => JSON.stringify(((await api('GET', '/api/state')).corpo?.produtos ?? []).map((p) => [p.sku, p.qtd]).sort());
const ESTOQUE = await estoque();

const navegador = await chromium.launch();
for (const [largura, altura, movel] of [[1280, 900, false], [390, 844, true]]) {
  const tam = `${largura}px`;
  const sufixo = `${largura}-${Date.now() % 100000}`;
  const comCompra = `QA Compra ${sufixo}`;
  const vazia = `QA Vazia ${sufixo}`;
  /* A cliente "com histórico" ganha um ajuste de crédito: é uma dependência
     como qualquer compra, e não depende do estado da planilha do harness. */
  await api('POST', '/api/clientes', { nome: comCompra });
  const idC = (await api('GET', `/api/clientes?limite=2000&busca=${encodeURIComponent(comCompra)}`)).corpo[0]?.id;
  const aj = await api('POST', '/api/credito/ajuste', { clienteId: idC, valorCentavos: 1000, motivo: 'QA: histórico de teste' });
  prova(aj.status < 300, `${tam}: cliente com histórico (crédito) criada (${aj.status})`);
  await api('POST', '/api/clientes', { nome: vazia });
  const lista = (await api('GET', '/api/clientes?limite=2000')).corpo;
  const idCompra = lista.find((c) => c.nome === comCompra)?.id;
  const idVazia = lista.find((c) => c.nome === vazia)?.id;
  prova(!!idCompra && !!idVazia, `${tam}: cenário criado (#${idCompra}, #${idVazia})`);

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
  const ir = async (hash) => {
    await p.goto(`${APP}/${hash}`);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(300);
  };
  const foto = async (n) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${n}.png` }); };
  const menu = async () => {
    await p.getByRole('button', { name: 'Mais ações' }).click();
    await p.getByRole('menu').waitFor({ timeout: 5000 });
  };

  /* ── a ficha: nada destrutivo à vista ── */
  await ir(`#/clientes/${idCompra}`);
  await p.getByRole('heading', { name: comCompra }).waitFor({ timeout: 10000 });
  prova(await p.getByRole('button', { name: /Excluir|Arquivar/ }).count() === 0, `${tam}: nenhum botão destrutivo à vista na ficha`);
  await menu();
  const itens = await p.getByRole('menuitem').allInnerTexts();
  prova(itens.join('|') === 'Editar dados|Arquivar|Excluir', `${tam}: "•••" tem Editar, Arquivar, Excluir (${itens.join(', ')})`);
  const caixaMenu = await p.getByRole('menu').boundingBox();
  prova(!!caixaMenu && caixaMenu.x >= 0 && caixaMenu.x + caixaMenu.width <= largura + 1, `${tam}: o menu cabe na tela`);
  await foto('1-menu');

  /* ── excluir com histórico → oferece arquivar ── */
  await p.getByRole('menuitem', { name: 'Excluir' }).click();
  const comHist = p.getByRole('alertdialog', { name: 'Esta cliente tem histórico' });
  await comHist.waitFor({ timeout: 8000 });
  prova(/Tem 1 movimento de crédito\./.test(await comHist.innerText()), `${tam}: diz o histórico que impede excluir`);
  prova(await comHist.getByRole('button', { name: /Excluir/ }).count() === 0, `${tam}: com histórico, não há botão de excluir`);
  await foto('2-com-historico');
  await comHist.getByRole('button', { name: 'Voltar' }).click();

  /* ── arquivar ── */
  await menu();
  await p.getByRole('menuitem', { name: 'Arquivar' }).click();
  const arq = p.getByRole('alertdialog', { name: `Arquivar ${comCompra}?` });
  await arq.waitFor({ timeout: 5000 });
  const bx = await arq.boundingBox();
  prova(!!bx && bx.x >= 0 && bx.x + bx.width <= largura + 1, `${tam}: a confirmação cabe na tela`);
  await foto('3-arquivar');
  await arq.getByRole('button', { name: 'Arquivar' }).click();
  await p.getByText('Arquivada', { exact: true }).waitFor({ timeout: 8000 });
  prova(true, `${tam}: a ficha passa a dizer "Arquivada"`);
  prova((await api('GET', `/api/clientes/${idCompra}/dependencias`)).corpo.dependencias.some((d) => d.chave === 'credito'),
    `${tam}: a arquivada mantém o histórico (crédito continua lá)`);
  await ir('#/clientes/todos');
  await p.getByLabel('Buscar cliente por nome, telefone ou CPF').fill(comCompra);
  await p.waitForTimeout(900);
  prova(await p.getByText(comCompra).count() === 0, `${tam}: arquivada sai da lista padrão`);
  await p.getByRole('button', { name: 'Arquivadas' }).click();
  await p.waitForTimeout(900);
  prova(await p.getByText(comCompra).count() === 1, `${tam}: aparece em "Arquivadas"`);
  await foto('4-lista-arquivadas');

  /* ── reativar ── */
  await p.getByText(comCompra).click();
  await p.getByRole('heading', { name: comCompra }).waitFor({ timeout: 8000 });
  await menu();
  await p.getByRole('menuitem', { name: 'Reativar' }).click();
  await p.waitForTimeout(900);
  prova(await p.getByText('Arquivada', { exact: true }).count() === 0, `${tam}: reativar tira o "Arquivada"`);
  prova(!(await api('GET', `/api/clientes/${idCompra}/dependencias`)).corpo.arquivada, `${tam}: reativada no banco`);

  /* ── excluir a vazia ── */
  await ir(`#/clientes/${idVazia}`);
  await p.getByRole('heading', { name: vazia }).waitFor({ timeout: 8000 });
  await menu();
  await p.getByRole('menuitem', { name: 'Excluir' }).click();
  const ex = p.getByRole('alertdialog', { name: `Excluir ${vazia}?` });
  await ex.waitFor({ timeout: 8000 });
  await foto('5-excluir');
  await ex.getByRole('button', { name: 'Excluir cliente' }).click();
  await p.waitForTimeout(1200);
  prova(/#\/clientes\/todos$/.test(p.url()), `${tam}: depois de excluir volta para a lista (${p.url().split('#')[1]})`);
  prova((await api('GET', `/api/clientes/${idVazia}/dependencias`)).status === 404, `${tam}: a vazia não existe mais`);

  const lw = await p.evaluate(() => document.documentElement.scrollWidth);
  prova(lw <= largura + 1, `${tam}: sem rolagem lateral (${lw}px)`);
  prova(erros.length === 0, `${tam}: nenhum erro de JavaScript${erros.length ? ` — ${erros[0]}` : ''}`);
  await ctx.close();
}
await navegador.close();
prova(await estoque() === ESTOQUE, 'estoque igual antes e depois');
const conf = (await api('GET', '/api/estoque/conferir')).corpo;
prova((conf?.divergentes ?? []).length === 0, '/api/estoque/conferir vazio');
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodas as provas passaram.');
process.exit(falhas ? 1 : 0);
