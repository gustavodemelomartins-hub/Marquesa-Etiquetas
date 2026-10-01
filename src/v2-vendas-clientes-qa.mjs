/* QA DE VENDAS, CLIENTES E FINANCEIRO — num navegador de verdade, em 1280px
 * e no telefone (390×844). Nasceu da rodada de 01/10/2026:
 *
 *   1. "Vendas feitas" mostrava a compra de 5 peças da Elizama Meira como
 *      CINCO vendas de R$ 504,00. Aqui ela tem de aparecer UMA vez, com
 *      "5 peças", e o detalhe tem de abrir as 5 peças com o preço de cada.
 *   2. Notas de desenvolvimento apareciam na tela ("Três datas, três
 *      significados", "Entram: compra histórica em aberto…"). Aqui cada tela
 *      principal é varrida atrás de frases técnicas.
 *   3. Clientes ganhou a Visão geral.
 *
 * Roda contra o harness local — sem chave real, sem nuvem:
 *
 *   node scripts/v2-local/worker-local.mjs . 8787 scripts/v2-local/seed-catalogo.sql &
 *   node scripts/v2-local/semear.mjs
 *   cd frontend && npm run build && cd ..
 *   node scripts/v2-local/serve-app.mjs frontend/dist 5173 &
 *   cd src && node v2-vendas-clientes-qa.mjs
 *
 * MQ_FOTOS=<pasta> guarda uma captura de cada tela.
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

/* ── a planilha: a compra real da Elizama, e uma cliente que sumiu ── */
const CAB = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];
const lotes = (await api('GET', '/api/vendas/historico/lotes')).corpo?.lotes ?? [];
if (!lotes.some((l) => l.status === 'importado')) {
  const imp = await api('POST', '/api/vendas/historico/importar', {
    arquivo: 'Vendas QA.xlsx',
    linhas: [
      CAB,
      [1, '2026-09-19', 'Elizama Meira', '316411', 'Colar Ponto de Luz', 'Banhada', 1, 105, null, 105, null, 'NÃO PAGO', 'Maleta'],
      [2, '2026-09-19', 'Elizama Meira', '101665', 'Brinco Gota', 'Banhada', 1, 62, null, 62, null, 'NÃO PAGO', 'Maleta'],
      [3, '2026-09-19', 'Elizama Meira', '301665', 'Pulseira Elos', 'Banhada', 1, 89, null, 89, null, 'NÃO PAGO', 'Maleta'],
      [4, '2026-09-19', 'Elizama Meira', '562583', 'Anel Solitário', 'Banhada', 1, 119, null, 119, null, 'NÃO PAGO', 'Maleta'],
      [5, '2026-09-19', 'Elizama Meira', '446425', 'Choker Pérola', 'Banhada', 1, 129, null, 129, null, 'NÃO PAGO', 'Maleta'],
      [6, '2025-03-02', 'Rita Sumida', '316411', 'Colar Ponto de Luz', 'Banhada', 1, 105, null, 105, 'Pix', 'PAGO', 'Site'],
      [7, '2025-04-10', 'Rita Sumida', '101665', 'Brinco Gota', 'Banhada', 1, 62, null, 62, 'Pix', 'PAGO', 'Site'],
      [8, '2025-05-20', 'Rita Sumida', '301665', 'Pulseira Elos', 'Banhada', 1, 89, null, 89, 'Pix', 'PAGO', 'Site'],
    ],
  });
  prova(imp.status === 201, `planilha de QA importada (${imp.status})`);
}
/* Como em PROD: a compra da Elizama tem cobrança aberta em A receber. */
const contas = (await api('GET', '/api/contas-receber')).corpo?.contas ?? [];
if (!contas.some((c) => /elizama/i.test(c.cliente ?? ''))) {
  const op = await api('POST', '/api/vendas/historico/operacoes', {
    operacoes: [{
      vendaChave: 'elizama meira|2026-09-19', papel: 'cliente', cobrancaStatus: 'aberta',
      valorEfetivoCentavos: 50400, valorRecebidoFonteCentavos: 0, evidencia: { fonte: 'qa' },
    }],
  });
  prova(op.status === 200, `cobrança da Elizama aberta (${op.status})`);
}

/* Frases que são documentação, não tela. Achadas na rodada de 01/10/2026;
   qualquer uma delas de volta numa tela principal é regressão. */
const PROIBIDAS = [
  /Três datas/i, /Entram:/, /Não entram/, /três significados/i,
  /\bservidor\b/i, /backfill/i, /LEGACY_/, /regra \d/i, /\b5\.4b\b/,
  /data efetiva/i, /Saldo simples/i, /decisão de negócio/i,
  /Como estes números são feitos/i, /saldo cobrável/i, /elegíve/i,
  /premissa/i, /heurística/i, /Nossa razão/i, /Stéfane/i,
  /Não existe custo no sistema/i, /indeterminad/i,
];

const TELAS = [
  ['início', '#/home'],
  ['nova venda', '#/vendas'],
  ['vendas feitas', '#/vendas/historico'],
  ['relatório', '#/vendas/relatorio'],
  ['a receber', '#/financeiro/a-receber'],
  ['recebido', '#/financeiro/recebimentos'],
  ['resumo financeiro', '#/financeiro/resumo'],
  ['saiu sem faturar', '#/financeiro/saidas'],
  ['clientes', '#/clientes'],
  ['todos os clientes', '#/clientes/todos'],
  ['peças', '#/estoque'],
  ['revendedoras', '#/revendedoras'],
  ['garantias', '#/garantias'],
  ['loja online', '#/nuvemshop'],
];

const navegador = await chromium.launch({ headless: true });

async function rodada(largura, altura, movel) {
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

  const ir = async (hash) => {
    await p.goto(`${APP}/${hash}`);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(300);
  };
  const foto = async (nome) => {
    if (FOTOS) await p.screenshot({ path: `${FOTOS}/${largura}-${nome}.png`, fullPage: true });
  };

  /* ── 1. Vendas feitas: uma linha por venda ── */
  await ir('#/vendas/historico');
  const linhasEli = p.locator('button.mq-tr', { hasText: 'Elizama Meira' });
  prova(await linhasEli.count() === 1, `${tam} · Elizama aparece UMA vez em Vendas feitas (veio ${await linhasEli.count()})`);
  const linha = linhasEli.first();
  prova(/5 peças/.test(await linha.innerText()), `${tam} · a linha diz "5 peças"`);
  prova(/504,00/.test(await linha.innerText()), `${tam} · a linha diz R$ 504,00`);
  prova(/a receber/.test(await linha.innerText()), `${tam} · e "a receber"`);
  const largura0 = await p.evaluate(() => document.documentElement.scrollWidth);
  prova(largura0 <= largura + 1, `${tam} · sem rolagem lateral na lista (${largura0}px)`);
  await foto('vendas-feitas');

  await linha.click();
  const modal = p.getByRole('dialog', { name: 'Detalhe da venda' });
  await modal.waitFor();
  const pecas = modal.locator('[role="table"] .mq-tr:not(.mq-tr--head)');
  prova(await pecas.count() === 5, `${tam} · o detalhe abre as 5 peças (veio ${await pecas.count()})`);
  const textoModal = await modal.innerText();
  for (const v of ['105,00', '62,00', '89,00', '119,00', '129,00']) {
    prova(textoModal.includes(v), `${tam} · peça de R$ ${v} no detalhe`);
  }
  prova(/Total da venda\s*R\$\s*504,00/.test(textoModal), `${tam} · total da venda R$ 504,00`);
  prova(/A receber\s*R\$\s*504,00/.test(textoModal), `${tam} · a receber R$ 504,00`);
  prova(/Ir para A receber/.test(textoModal), `${tam} · venda da planilha leva para A receber`);
  await foto('vendas-detalhe');
  await p.keyboard.press('Escape');

  /* ── 2. Clientes: Visão geral ── */
  await ir('#/clientes');
  for (const bloco of ['Top clientes', 'Para chamar de volta', 'Clientes recorrentes']) {
    prova(await p.getByRole('region', { name: bloco }).count() === 1, `${tam} · Clientes › Visão geral tem "${bloco}"`);
  }
  const top = await p.getByRole('region', { name: 'Top clientes' }).innerText();
  prova(/Elizama Meira[\s\S]*504,00/.test(top), `${tam} · Elizama no Top com R$ 504,00 comprados`);
  const volta = await p.getByRole('region', { name: 'Para chamar de volta' }).innerText();
  prova(/Rita Sumida/.test(volta), `${tam} · Rita (última compra em 2025) está em "Para chamar de volta"`);
  await foto('clientes-visao-geral');

  await ir('#/clientes/todos');
  prova(await p.getByText('Total comprado').count() >= (movel ? 0 : 1), `${tam} · Todos os clientes mostra Total comprado`);
  await foto('clientes-todos');

  /* ── 3. a ficha: o que falta receber primeiro ── */
  await ir('#/clientes/norm:elizama meira');
  await p.getByRole('heading', { level: 1 }).waitFor();
  const ficha = await p.locator('body').innerText();
  prova(/Falta receber/.test(ficha), `${tam} · a ficha da Elizama abre com "Falta receber"`);
  prova(/Compra de 19\/09\/2026/.test(ficha), `${tam} · com a compra de 19/09/2026`);
  await foto('cliente-ficha');

  /* ── 4. varredura de texto técnico ── */
  for (const [nome, hash] of TELAS) {
    await ir(hash);
    const texto = await p.locator('body').innerText();
    const achadas = PROIBIDAS.filter((re) => re.test(texto)).map(String);
    prova(achadas.length === 0, `${tam} · ${nome}: sem texto técnico${achadas.length ? ` (achou ${achadas.join(', ')})` : ''}`);
    const lw = await p.evaluate(() => document.documentElement.scrollWidth);
    prova(lw <= largura + 1, `${tam} · ${nome}: sem rolagem lateral (${lw}px)`);
    await foto(nome.replace(/ /g, '-'));
  }

  prova(erros.length === 0, `${tam} · nenhum erro de JavaScript${erros.length ? `: ${erros.join(' | ')}` : ''}`);
  await ctx.close();
}

await rodada(1280, 800, false);
await rodada(390, 844, true);
await navegador.close();

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
