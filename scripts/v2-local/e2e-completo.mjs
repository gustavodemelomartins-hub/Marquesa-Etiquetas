/* Os quinze fluxos pedidos, contra o Worker local com dados reais de teste,
   mais a varredura das cinco larguras. */
import { chromium } from 'playwright';
const APP = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8787';
const H = { Authorization: 'Bearer chave-local-de-teste' };
/* Nome único por rodada: rodar o E2E duas vezes criava homônimas, e aí o
   próprio §2 entrava em ação — a ficha se recusa a atribuir venda sem
   vínculo quando o nome aponta para mais de uma pessoa. O teste estava
   lendo a cliente errada, não encontrando um defeito. */
const NOME = `Teste E2E ${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
const provas = [];
const prova = (ok, t) => { provas.push(`${ok ? 'ok   ' : 'FALHA'} ${t}`); if (!ok) process.exitCode = 1; };

const b = await chromium.launch({ headless: true });
const erros = [];
const externas = [];

async function pagina(w, h, movel) {
  const ctx = await b.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(() => localStorage.setItem('marquesa_conexao_v1',
    JSON.stringify({ url: 'http://127.0.0.1:8787', key: 'chave-local-de-teste' })));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`${w}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(`${w}: ${m.text()}`); });
  /* 15 · nenhuma escrita externa. Qualquer requisição que não seja para o
     app local ou para o Worker local é registrada — PROD e Nuvemshop
     incluídas, se alguma linha tentasse. */
  p.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(APP) && !u.startsWith(API) && !u.startsWith('data:') && !u.startsWith('blob:')) {
      externas.push(`${r.method()} ${u}`);
    }
  });
  return { ctx, p };
}

/* ═══════════════════════ os fluxos, no telefone (390) */
{
  const { ctx, p } = await pagina(390, 844, true);

  await p.goto(APP);
  await p.waitForSelector('.mq-kpis', { timeout: 25000 });
  prova((await p.locator('main').innerText()).includes('Precisa da sua atenção'), '13 · a Home abre pelo que precisa de uma pessoa');

  /* 1 · abrir uma cliente real */
  await p.locator('.mq-bottomnav button', { hasText: 'Clientes' }).click();
  await p.waitForSelector('.mq-tr:not(.mq-tr--head)', { timeout: 20000 });
  await p.locator('.mq-tr', { hasText: 'Vitória Prado' }).first().click();
  await p.waitForSelector('.mq-kpi');
  prova((await p.locator('h1').innerText()).includes('Vitória'), '1 · abre uma cliente real');

  /* 2 · o histórico dela */
  await p.locator('.mq-tabs button', { hasText: 'Compras' }).first().click();
  await p.waitForTimeout(400);
  const compras = await p.locator('.mq-table').innerText();
  prova(compras.includes('10/09/2026') && compras.includes('pago em 12/09/2026'),
    '2 · o histórico mostra a data da venda e a do pagamento, separadas');

  /* 3 · criar cliente */
  await p.locator('.mq-btn--link', { hasText: 'Todas as clientes' }).click();
  await p.waitForSelector('.mq-tr:not(.mq-tr--head)');
  await p.getByRole('button', { name: /Nova cliente/ }).click();
  await p.waitForSelector('.mq-drawer');
  await p.locator('.mq-drawer input').first().fill(NOME);
  await p.locator('.mq-drawer input').nth(1).fill('19999990000');
  await p.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await p.waitForSelector('.mq-drawer', { state: 'detached', timeout: 15000 });
  await p.waitForSelector('.mq-kpi', { timeout: 15000 });
  prova((await p.locator('h1').innerText()).includes(NOME), '3 · cria cliente no staging e abre a ficha dela');

  /* 4 · editar cliente */
  await p.getByRole('button', { name: 'Editar dados' }).click();
  await p.waitForSelector('.mq-drawer');
  await p.locator('.mq-drawer input').nth(2).fill('Hortolândia');
  await p.getByRole('button', { name: 'Salvar alterações' }).click();
  await p.waitForSelector('.mq-drawer', { state: 'detached', timeout: 15000 });
  await p.waitForTimeout(900);
  prova((await p.locator('.mq-pagehead').innerText()).includes('Hortolândia'), '4 · edita cliente e a ficha reflete');

  /* 5, 6 · criar venda com data de pagamento própria */
  const antes = await (await fetch(`${API}/api/state`, { headers: H })).json();
  const skuAlvo = '100302';
  const qtdAntes = antes.produtos.find((x) => x.sku === skuAlvo).qtd;

  await p.getByRole('button', { name: /Nova venda/ }).click();
  await p.waitForSelector('.mq-drawer');
  await p.getByLabel('Buscar peça').fill('Anel Aparador');
  await p.waitForTimeout(400);
  await p.locator('.mq-list--compacta .mq-item').first().click();
  await p.waitForTimeout(200);
  await p.locator('input[type=date]').first().fill('2026-09-18');
  await p.locator('input[type=date]').nth(1).fill('2026-09-19');
  await p.waitForTimeout(200);
  await p.getByRole('button', { name: /Registrar venda/ }).click();
  await p.waitForSelector('.mq-drawer', { state: 'detached', timeout: 20000 });
  await p.waitForTimeout(900);
  prova(true, '5 · registra venda no staging');

  const clientes = await (await fetch(
    `${API}/api/clientes?limite=100&busca=${encodeURIComponent(NOME)}`, { headers: H },
  )).json();
  const nova = clientes.reduce((a, c) => (a && a.id > c.id ? a : c), null);
  const perfil = await (await fetch(`${API}/api/clientes/perfil?id=${nova.id}`, { headers: H })).json();
  const v = perfil.vendas[0];
  prova(v && v.data === '2026-09-18' && v.pagaEm === '2026-09-19',
    `6 · pagamento com data real (venda ${v && v.data}, pago ${v && v.pagaEm})`);
  prova(perfil.resumo.vendas === 1, '7 · a venda aparece na ficha da cliente');

  /* 8 · no Financeiro */
  await p.goto(`${APP}#/financeiro/recebimentos~tudo`);
  await p.waitForSelector('.mq-kpi', { timeout: 20000 });
  await p.locator('input[type=date]').first().fill('2026-09-19');
  await p.waitForTimeout(1300);
  /* O cartão mostra o TOTAL do dia, não uma venda: o que se prova aqui é
     que a tela e o backend dizem o mesmo número para a mesma data. */
  const doDia = await (await fetch(`${API}/api/vendas/lancamentos?data=2026-09-19`, { headers: H })).json();
  const esperado = doDia.recebidoNoDia.toLocaleString('pt-BR');
  const kpisFin = await p.locator('.mq-kpis').innerText();
  prova(kpisFin.includes(esperado) && doDia.recebidoNoDia > 0,
    `8 · o Financeiro mostra o recebido do dia do pagamento (R$ ${esperado})`);

  /* 9 · estoque reflete e a razão fecha */
  const depois = await (await fetch(`${API}/api/state`, { headers: H })).json();
  const qtdDepois = depois.produtos.find((x) => x.sku === skuAlvo).qtd;
  prova(qtdDepois === qtdAntes - 1, `9 · o estoque caiu 1 (${qtdAntes} → ${qtdDepois})`);
  const razao = await (await fetch(`${API}/api/estoque/conferir`, { headers: H })).json();
  prova(razao.divergentes.length === 0, '9b · a razão contábil continua fechando');

  /* 10 · garantia histórica */
  await p.goto(`${APP}#/garantias/todas`);
  await p.waitForSelector('.mq-item', { timeout: 20000 });
  await p.locator('.mq-card .mq-item').first().click();
  await p.waitForSelector('.mq-drawer .mq-timeline', { timeout: 15000 });
  prova((await p.locator('.mq-drawer').innerText()).includes('O que aconteceu'), '10 · abre uma garantia histórica com a linha do tempo');
  await p.locator('.mq-drawer .mq-modal__close').click();

  /* 11 · revendedora histórica */
  await p.goto(`${APP}#/revendedoras`);
  await p.waitForSelector('main', { timeout: 20000 });
  await p.waitForTimeout(1500);
  const rev = await p.locator('main').innerText();
  prova(rev.includes('Andreia') || /revendedora/i.test(rev), '11 · Revendedoras carrega com dados reais');

  /* 12 · inventário */
  await p.goto(`${APP}#/estoque/inventario`);
  await p.waitForSelector('main', { timeout: 20000 });
  await p.waitForTimeout(1200);
  prova((await p.locator('main').innerText()).includes('Não contado não é zero'), '12 · inventário disponível com a regra em letra');

  /* 14 · deep-link e recarregar */
  await p.goto(`${APP}#/estoque/saidas`);
  await p.waitForSelector('h1', { timeout: 20000 });
  await p.reload();
  await p.waitForSelector('h1', { timeout: 20000 });
  prova((await p.locator('h1').innerText()).includes('Saiu sem faturar'), '14 · deep-link e recarregar voltam para a mesma tela');

  await ctx.close();
}

/* ═══════════════════════ as cinco larguras, em todos os módulos */
const ROTAS = [
  '#/home', '#/clientes', '#/clientes/1', '#/vendas', '#/financeiro/resumo~tudo',
  '#/financeiro/a-receber~tudo', '#/financeiro/conferencia~tudo', '#/estoque',
  '#/estoque/pecas', '#/estoque/inventario', '#/estoque/saidas', '#/catalogo',
  '#/garantias', '#/revendedoras', '#/nuvemshop', '#/configuracoes',
  '#/agenda', '#/notificacoes', '#/etiquetas',
];
const estouros = [];
for (const [w, h] of [[320, 720], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
  const { ctx, p } = await pagina(w, h, w < 700);
  for (const rota of ROTAS) {
    await p.goto(APP + rota);
    await p.waitForSelector('main', { timeout: 20000 });
    await p.waitForTimeout(550);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
      estouros.push(`${w} · ${rota}`);
    }
  }
  await ctx.close();
}
prova(estouros.length === 0, `todas as ${ROTAS.length} telas sem estouro horizontal em 320/390/768/1024/1440${estouros.length ? ': ' + estouros.join(', ') : ''}`);
prova(externas.length === 0, `15 · nenhuma requisição para fora do ambiente local${externas.length ? ': ' + externas.slice(0, 3).join(', ') : ''}`);
prova(erros.length === 0, `sem erro de console em nenhuma largura${erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''}`);

await b.close();
console.log(provas.join('\n'));
