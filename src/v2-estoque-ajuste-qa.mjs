/* Uso (sem chave, sem nuvem — toda escrita cai na CÓPIA):
 *   MQ_RAIZ=<worktree> MQ_BANCO=<cópia .sqlite de um export de PROD, com
 *   api/migracao-inventario-ajuste.sql aplicada> MQ_FOTOS=<pasta>
 *   MQ_APP=<site V2> MQ_API=<URL da API que o site chama> node src/v2-estoque-ajuste-qa.mjs
 * Nunca grave a cópia nem as capturas no repositório: têm dado pessoal. */
/* QA da V2 publicada no DEV com os dados reais de PROD (cópia), sem chave.
 * A API do staging-v2 é interceptada no Playwright e respondida pelo Worker
 * REAL (api/src/index.js da árvore de integração) sobre uma cópia SQLite do
 * export de PROD. Toda escrita cai na cópia. */
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = process.env.MQ_RAIZ;
const BANCO = process.env.MQ_BANCO;
const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';
const API = process.env.MQ_API || 'https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev';
const FOTOS = process.env.MQ_FOTOS;
mkdirSync(FOTOS, { recursive: true });
const { chromium } = createRequire(path.join(RAIZ, 'src/package.json'))('playwright');

const raw = new DatabaseSync(BANCO);
raw.exec('PRAGMA foreign_keys = ON');
const preparar = (sql) => {
  const st = { sql, args: [] };
  const comArgs = (a) => ({ ...st, args: a, bind: st.bind, first: st.first, all: st.all, run: st.run, executar: st.executar });
  st.bind = (...a) => comArgs(a.map((v) => (v === undefined ? null : v)));
  st.first = async function (col) { const l = raw.prepare(this.sql).get(...this.args) ?? null; return col && l ? l[col] : l; };
  st.all = async function () { return { results: raw.prepare(this.sql).all(...this.args) }; };
  st.run = async function () { const r = raw.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes ?? 0) } }; };
  st.executar = function () { return raw.prepare(this.sql).run(...this.args); };
  return st;
};
const DB = {
  prepare: preparar,
  async batch(stmts) { raw.exec('BEGIN'); try { const r = stmts.map((x) => x.executar()); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; } },
};
const { default: worker } = await import(pathToFileURL(path.join(RAIZ, 'api/src/index.js')).href);
const KEY = 'chave-qa';
const env = { DB, API_KEY: KEY };
const chamarWorker = async (metodo, caminho, corpo, headers = {}) => worker.fetch(new Request(API + caminho, {
  method: metodo, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...headers },
  body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
}), env, { waitUntil() {}, passThroughOnException() {} });
const api = async (m, p, b) => { const r = await chamarWorker(m, p, b); return { status: r.status, corpo: await r.json().catch(() => null) }; };

let falhas = 0;
const prova = (ok, t) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${t}`); if (!ok) falhas++; };
const q1 = (sql, ...a) => raw.prepare(sql).get(...a);
const razao = () => q1(`SELECT COUNT(*) n FROM produtos p LEFT JOIN (SELECT sku, SUM(qtd) s FROM movimentos GROUP BY sku) m ON m.sku=p.sku WHERE p.qtd<>COALESCE(m.s,0)`).n;

const nav = await chromium.launch();
const respostas5xx = [];
async function contexto(largura, altura, movel) {
  const ctx = await nav.newContext({ viewport: { width: largura, height: altura }, ...(movel ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(([url, key]) => localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key })), [API, KEY]);
  await ctx.route(API + '/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    const u = new URL(req.url());
    const r = await chamarWorker(req.method(), u.pathname + u.search, req.postData() ?? undefined, { Origin: 'https://marquesa-dev.pages.dev' });
    const corpo = Buffer.from(await r.arrayBuffer());
    if (r.status >= 500) respostas5xx.push(`${req.method()} ${u.pathname} ${r.status} ${corpo.toString().slice(0, 200)}`);
    const headers = Object.fromEntries(r.headers.entries());
    headers['access-control-allow-origin'] = '*';
    await route.fulfill({ status: r.status, headers, body: corpo });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  return { ctx, p, erros };
}
const ir = async (p, hash) => { await p.goto(APP + hash); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500); };

/* ═══ 1. Clientes abre (a "Falha interna"), sem tabelas do avatar nesta cópia */
{
  const temAvatar = !!q1(`SELECT 1 x FROM sqlite_master WHERE name='cliente_avatar'`);
  const { ctx, p, erros } = await contexto(1280, 900, false);
  await ir(p, '#/clientes');
  const corpo = await p.locator('body').innerText();
  prova(!/Falha interna/.test(corpo), `Clientes abre sem "Falha interna" (tabelas do avatar nesta cópia: ${temAvatar ? 'sim' : 'NÃO'})`);
  const r = await api('GET', '/api/clientes?limite=2000');
  prova(r.status === 200 && r.corpo.length > 300, `GET /api/clientes 200 com ${r.corpo?.length} clientes, sem avatar e sem R2`);
  await p.screenshot({ path: `${FOTOS}/1280-clientes.png` });
  prova(!erros.length, `Clientes sem erro de página ${erros.join(' | ')}`);
  await ctx.close();
}

/* ═══ 2. 256359: Ajustar estoque 8 → 7 pela ficha */
for (const [largura, altura, movel] of [[1280, 900, false], [390, 844, true]]) {
  const tam = `${largura}px`;
  const antes = q1(`SELECT qtd FROM produtos WHERE sku='256359'`).qtd;
  const { ctx, p, erros } = await contexto(largura, altura, movel);
  await ir(p, '#/estoque/peca%3A256359');
  await p.getByRole('heading', { name: /Anel Inspiração Cartier/ }).waitFor({ timeout: 15000 });
  if (largura === 1280) prova(antes === 8, `${tam}: 256359 começa com total 8 (como a Sthefany viu)`);
  await p.getByRole('button', { name: 'Ajustar estoque' }).first().click();
  const dlg = p.getByRole('dialog', { name: 'Ajustar estoque' });
  await dlg.waitFor();
  const alvo = antes - 1;
  await dlg.getByLabel(/Quantidade correta/).fill(String(alvo));
  await dlg.getByLabel('Motivo').selectOption('correcao_cadastro');
  await dlg.getByLabel(/Observação/).fill('QA: comprei 7; a peça da Luciana foi contada duas vezes');
  const previa = await dlg.locator('#ajuste-diferenca').innerText();
  prova(/Diferença: -1/.test(previa) && new RegExp(`total ${antes} → ${alvo}`).test(previa), `${tam}: prévia "${previa.replace(/\s+/g, ' ').slice(0, 90)}"`);
  prova(!(await dlg.getByLabel('Em qual variação').count()), `${tam}: anel sem saldo por aro não pede aro (regra 2)`);
  await p.screenshot({ path: `${FOTOS}/${largura}-ajuste-dialogo.png` });
  await dlg.getByRole('button', { name: 'Confirmar ajuste' }).click();
  await p.getByText(new RegExp(`Estoque de 256359 ajustado: ${antes} → ${alvo}`)).waitFor({ timeout: 10000 });
  await p.waitForTimeout(800);
  const numeros = await p.locator('.mq-peca__numeros').innerText();
  prova(new RegExp(`Total\\s+${alvo}`, 'i').test(numeros), `${tam}: cabeçalho mostra total ${alvo} (${numeros.replace(/\s+/g, ' ')})`);
  const mov = q1(`SELECT * FROM movimentos WHERE sku='256359' ORDER BY id DESC LIMIT 1`);
  prova(mov.tipo === 'ajuste' && mov.qtd === -1 && mov.origem === 'ajuste' && mov.variacao === null, `${tam}: razão ganhou ajuste −1 sem aro`);
  await p.getByRole('tab', { name: 'Histórico' }).click();
  await p.getByText(new RegExp(`Ajuste de estoque · Correção de cadastro · de ${antes} para ${alvo}`)).first().waitFor({ timeout: 8000 });
  prova(true, `${tam}: histórico da peça mostra o motivo e os dois números`);
  prova(await p.getByText(/planilha diz 8, sistema tinha 7/).count() > 0, `${tam}: o +1 do go-live continua no histórico`);
  await p.screenshot({ path: `${FOTOS}/${largura}-historico.png`, fullPage: true });
  prova(!erros.length, `${tam}: sem erro de página ${erros.join(' | ')}`);
  await ctx.close();
}
prova(razao() === 0, 'razão fechada depois dos ajustes');

/* ═══ 3. Inventário: diferença vira ajuste; excluir só o sem efeito */
{
  const saidasAntes = q1('SELECT COUNT(*) n FROM saidas_sem_faturamento').n;
  const ab = await api('POST', '/api/inventarios', {});
  const id = ab.corpo.id;
  const det = await api('GET', `/api/inventarios/${id}`);
  const alvo = det.corpo.esperados.find((e) => e.esperado >= 2 && !e.variacoes?.length && e.sku === '101175')
    ?? det.corpo.esperados.find((e) => e.esperado >= 2 && !(e.variacoes || []).length);
  const c = await api('POST', `/api/inventarios/${id}/itens`, { sku: alvo.sku, faltando: 1 });
  prova(c.status < 300, `inventário #${id}: bipei ${alvo.sku} com falta 1 (${c.status})`);
  const fim = await api('POST', `/api/inventarios/${id}/concluir`, {});
  prova(fim.status === 200, `inventário #${id} concluído`);
  const ap = await api('POST', `/api/inventarios/${id}/aplicar`, { itens: [{ sku: alvo.sku, motivoId: 'nao_encontrada', motivo: 'Não encontrada na casa' }] });
  prova(ap.corpo?.ok && ap.corpo.aplicados[0].classe === 'ajuste', `falta aplicada como AJUSTE de inventário (${JSON.stringify(ap.corpo?.aplicados?.[0] ?? ap.corpo)})`);
  prova(q1('SELECT COUNT(*) n FROM saidas_sem_faturamento').n === saidasAntes, 'nenhuma "perda" nasceu da diferença');

  const { ctx, p, erros } = await contexto(1280, 900, false);
  await ir(p, '#/estoque/inventario');
  await p.getByText(`Inventário #${id}`).first().waitFor({ timeout: 10000 });
  prova(await p.getByRole('button', { name: `Excluir o inventário #${id}` }).count() === 0, `#${id} (alterou estoque) não oferece Excluir`);
  prova(await p.getByRole('button', { name: 'Excluir o inventário #8' }).count() === 1, '#8 (cancelado, sem efeito) oferece Excluir');
  await p.getByRole('button', { name: 'Excluir o inventário #8' }).click();
  const dlg = p.getByRole('alertdialog');
  await dlg.getByText('Nenhuma movimentação de estoque foi aplicada por este inventário.').waitFor();
  await p.screenshot({ path: `${FOTOS}/1280-excluir-dialogo.png` });
  await dlg.getByRole('button', { name: 'Excluir inventário' }).click();
  await p.getByText(/Inventário #8 excluído. Nenhum estoque foi alterado./).waitFor({ timeout: 8000 });
  prova(await p.getByText(/continua no cadastro/).count() === 1, 'aviso diz que a variação criada na contagem continua no cadastro');
  prova(!q1('SELECT 1 x FROM inventarios WHERE id = 8'), '#8 saiu do banco');
  const reg = q1('SELECT * FROM inventarios_excluidos WHERE inventario_id = 8');
  prova(reg && reg.leituras === 8 && reg.pecas === 15, `registro da exclusão: ${JSON.stringify(reg && { status: reg.status, leituras: reg.leituras, pecas: reg.pecas })}`);
  prova(!!q1(`SELECT 1 x FROM produto_variacoes WHERE sku='256359' AND variante_id LIKE 'local:%'`), 'a variação nº23 criada no #8 continua na peça');
  await p.getByRole('button', { name: new RegExp(`^Inventário #${id}`) }).first().click().catch(() => p.getByText(`Inventário #${id}`).first().click());
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${FOTOS}/1280-inventario-revisao.png`, fullPage: true });
  await p.getByText(/diferença já ajustada/).first().click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${FOTOS}/1280-inventario-resolvidas.png`, fullPage: true });
  const txt = await p.locator('body').innerText();
  prova(/Ajuste de inventário/.test(txt), 'revisão mostra a linha resolvida como "Ajuste de inventário"');
  prova(!erros.length, `inventário sem erro de página ${erros.join(' | ')}`);
  await ctx.close();
}

const conf = await api('GET', '/api/estoque/conferir');
prova(conf.corpo?.ok === true, 'GET /api/estoque/conferir vazio');
prova(!respostas5xx.length, `nenhuma resposta 5xx ${respostas5xx.join(' || ')}`);
await nav.close();
console.log(`\nQA DEV: ${falhas ? falhas + ' FALHA(S)' : 'tudo ok'}`);
process.exit(falhas ? 1 : 0);
