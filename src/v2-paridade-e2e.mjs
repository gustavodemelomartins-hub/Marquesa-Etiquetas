/* AS TELAS NOVAS DA V2, NUM NAVEGADOR DE VERDADE — e o telefone manda.
 *
 *  O que este roteiro prova é o que nenhum teste de unidade prova: que as
 *  superfícies que a paridade declara PRONTAS abrem, carregam dado real,
 *  sobrevivem a um recarregamento e cabem em 390px de largura.
 *
 *  Contra o Worker LOCAL — `scripts/v2-local/` —, que é o `api/src/index.js`
 *  de verdade com um SQLite em memória. Não há binding para nuvem nenhuma
 *  neste processo: não existe caminho daqui até PROD, até o D1 remoto ou até
 *  a Nuvemshop. Não por disciplina — por ausência. O roteiro confere isso
 *  também, registrando qualquer requisição que saia dos dois endereços.
 *
 *      # da raiz, com os dois servidores no ar:
 *      node scripts/v2-local/worker-local.mjs . 8787 scripts/v2-local/seed-catalogo.sql &
 *      node scripts/v2-local/semear.mjs
 *      node scripts/v2-local/serve-app.mjs frontend/dist 5173 &
 *
 *      cd src && node v2-paridade-e2e.mjs
 *
 *  Mora em `src/` porque é aqui que o Playwright é dependência — os testes de
 *  navegador do projeto todos moram neste diretório.
 *
 *  390 PRIMEIRO. As larguras de referência da V2 são 320, 390, 768, 1024 e
 *  1440, e a de 390 é a que decide: é o telefone em que a venda é lançada de
 *  pé, no balcão. Por isso o roteiro funcional roda NELA, e as outras quatro
 *  entram na varredura de transbordo.
 */
import { chromium } from 'playwright';

const APP = process.env.MQ_APP || 'http://127.0.0.1:5173';
const API = process.env.MQ_API || 'http://127.0.0.1:8787';
const KEY = process.env.MQ_KEY || 'chave-local-de-teste';

const provas = [];
const erros = [];
const externas = [];

/* Imprime NA HORA. Uma exceção no meio do roteiro levava junto todas as
   provas que já tinham passado, e a saída virava o stack trace de um 404 —
   a informação menos útil possível. */
function prova(ok, texto) {
  const linha = `${ok ? 'ok   ' : 'FALHA'} ${texto}`;
  provas.push(linha);
  console.log(linha);
  if (!ok) process.exitCode = 1;
}

const navegador = await chromium.launch({ headless: true });

async function pagina(largura, altura, movel) {
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 2,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API, KEY]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`${largura}px · ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    /* Uma resposta de recusa do servidor (503 do freio da personalização,
       409 de uma regra de negócio) chega ao console como "Failed to load
       resource". Ela NÃO é defeito da tela — é o backend fazendo o que se
       espera dele, e a tela mostra a frase. Contar isso como erro de
       JavaScript faria a prova ficar vermelha justamente quando a regra
       funciona. Exceção de verdade continua entrando por `pageerror`. */
    if (/Failed to load resource/.test(m.text())) return;
    erros.push(`${largura}px · console: ${m.text()}`);
  });
  /* Nenhuma escrita externa. Qualquer requisição que não seja para o app
     local ou para o Worker local é registrada — PROD e Nuvemshop incluídas,
     se alguma linha tentasse. */
  p.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(APP) && !u.startsWith(API)
      && !u.startsWith('data:') && !u.startsWith('blob:')) {
      externas.push(`${r.method()} ${u}`);
    }
  });
  return { ctx, p };
}

const irPara = async (p, hash) => {
  await p.goto(`${APP}/#/${hash}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(700);
};

/* `innerText` devolve o texto COMO RENDERIZADO, e `text-transform:
   uppercase` no rótulo do KPI chega em caixa alta. Comparar sem caixa é o
   certo: a prova é sobre a informação estar na tela, não sobre o CSS. */
const texto = async (p) => (await p.locator('body').innerText())
  .replace(/\s+/g, ' ').toLowerCase();

/* ══════════════════════════════════════════════ o roteiro, em 390px ══ */

const { ctx, p } = await pagina(390, 844, true);

/* ── 1. o casco ─────────────────────────────────────────────────────── */
await irPara(p, 'home');
prova(await p.locator('.mq-shell').count() === 1, 'existe UM casco');
prova(await p.locator('.mq-topbar').count() === 1, 'existe UMA barra superior');
prova(await p.locator('.mq-bottomnav').isVisible(), 'a barra inferior aparece no telefone');
prova(await p.locator('.mq-rail__logo').count() >= 1, 'o logo oficial está no trilho');

/* O logo é o arquivo da marca, embutido pelo Vite — nunca um caminho
   relativo escrito à mão, que é o que já quebrou em /v2/ e não em /. */
const src = await p.locator('.mq-rail__logo').first().getAttribute('src');
prova(!!src && !src.includes('..'), `o logo vem do bundle (${String(src).slice(0, 28)}…)`);

/* ── 2. Vendas: as cinco superfícies ────────────────────────────────── */
await irPara(p, 'vendas');
let t = await texto(p);
prova(t.includes('painel de vendas'), 'Vendas abre no PAINEL, não numa tabela');
prova(/faturamento recebido no per/.test(t), 'o painel mostra o faturamento do recorte');
prova(/ticket m[eé]dio/.test(t), 'o painel mostra o ticket médio');
/* §19 — a tela diz que a comparação com o período anterior não existe, em
   vez de desenhar uma seta que ninguém calculou. */
prova(/compara[cç][aã]o com o per[ií]odo anterior/.test(t), 'o painel ANUNCIA que não há tendência');

await irPara(p, 'vendas/lancamentos');
t = await texto(p);
prova(/venda normal/.test(t) && /monte seu colar/.test(t) && /sa[ií]da sem faturamento/.test(t),
  'Lançamentos mostra as TRÊS portas');

await irPara(p, 'vendas/nova');
t = await texto(p);
prova(/itens da venda/.test(t) && /cliente da venda/.test(t) && /pagamento/.test(t),
  'a venda normal tem os três passos');
/* O passo 2 nasce fechado — quem chega quer bipar a peça, não digitar nome.
   As datas moram nele, e abrir é o que a pessoa faz. */
await p.locator('.mq-passo__cabeca', { hasText: 'Cliente da venda' }).click();
await p.waitForTimeout(400);
t = await texto(p);
prova(/data da venda/.test(t), 'a data da VENDA aparece no passo do cliente');
prova(/local ou canal/.test(t), 'o canal aparece com a limitação dita');
await p.locator('.mq-passo__cabeca', { hasText: 'Pagamento' }).click();
await p.waitForTimeout(400);
t = await texto(p);
prova(/data efetiva do pagamento/.test(t), 'a data do PAGAMENTO é um campo separado');
prova(/um recebimento, n[aã]o v[aá]rios/.test(t),
  'a tela ANUNCIA que não há recebimento em partes');

await irPara(p, 'vendas/colar');
t = await texto(p);
prova(/monte seu colar/.test(t), 'Monte seu Colar abre pela rota');
/* PERSONALIZACAO_ATIVA não está ligada no Worker local: a tela tem de
   continuar visível e dizer que a operação está bloqueada. */
prova(/desativad|bloquead/i.test(t), 'com a feature desligada, a tela diz que está bloqueada');

await irPara(p, 'vendas/saida');
t = await texto(p);
prova(/sem faturar/.test(t), 'a saída sem faturamento abre dentro de Lançamentos');

await irPara(p, 'vendas/historico');
t = await texto(p);
prova(/hist[oó]rico de vendas/.test(t), 'o histórico abre pela rota');

/* ── 3. deep-link e recarregamento ──────────────────────────────────── */
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(600);
prova((await texto(p)).includes('histórico de vendas'),
  'recarregar em #/vendas/historico volta para o histórico');
await p.goBack();
await p.waitForTimeout(500);
prova(p.url().includes('#/vendas/'), 'o voltar do navegador anda dentro do módulo');

/* ── 4. Clientes ────────────────────────────────────────────────────── */
await irPara(p, 'clientes');
t = await texto(p);
prova(/clientes/.test(t), 'Clientes abre');

/* ── 5. a busca global NÃO sai da V2 ────────────────────────────────── */
/* No telefone a busca fica fechada e abre por um botão. Ela SUMIA por CSS
   abaixo de 900px — quem usa o sistema de pé não tinha busca nenhuma. */
const abrirBusca = p.locator('button[aria-label="Buscar"]');
prova(await abrirBusca.count() === 1, 'no telefone existe o botão que abre a busca');
await abrirBusca.click();
await p.waitForTimeout(300);
const busca = p.locator('input[role="combobox"]');
await busca.fill('vit');
await p.waitForTimeout(900);
const linksParaOLegado = await p.locator('.busca-global-resultados a[href*="dashboard.html"]').count();
prova(linksParaOLegado === 0, 'nenhum resultado da busca leva ao painel clássico');
const opcoes = await p.locator('.busca-global-resultados [role="option"]').count();
prova(opcoes > 0, `a busca global encontra (${opcoes} resultados)`);
if (opcoes > 0) {
  await p.locator('.busca-global-resultados [role="option"]').first().click();
  await p.waitForTimeout(700);
  prova(p.url().includes('#/'), `a busca navega por rota interna (${p.url().split('#')[1]})`);
}

/* ── 6. Financeiro, Estoque, Inventário ─────────────────────────────── */
for (const [hash, esperado, nome] of [
  ['financeiro', /A receber|Resumo|Recebimentos/i, 'Financeiro'],
  ['estoque', /Estoque/i, 'Estoque'],
  ['estoque/inventario', /Inventário|contagem/i, 'Inventário'],
  ['estoque/pecas', /Peças|peça/i, 'Peças'],
  ['catalogo', /Catálogo/i, 'Catálogo'],
  ['revendedoras', /Revendedora|Visão Geral/i, 'Revendedoras'],
  ['garantias', /Garantias|reparo/i, 'Garantias'],
  ['nuvemshop', /Nuvemshop/i, 'Nuvemshop'],
  ['nuvemshop/publicacao', /Fila de publicação/i, 'Fila de publicação'],
  ['configuracoes', /Configurações/i, 'Configurações'],
  ['agenda', /desenvolvimento/i, 'Agenda diz "em desenvolvimento"'],
]) {
  await irPara(p, hash);
  prova(esperado.test(await texto(p)), `${nome} abre em #/${hash}`);
}

/* ── 7. a fila de publicação não oferece publicar ───────────────────── */
await irPara(p, 'nuvemshop/publicacao');
t = await texto(p);
prova(/escrita autom[aá]tica na loja est[aá] desligada/.test(t),
  'a fila ANUNCIA que a escrita na loja está desligada');
const botaoPublicar = await p.locator('button', { hasText: /^Publicar na loja/i }).count();
prova(botaoPublicar === 0, 'não existe botão que publique na loja real');

/* ── 8. abrir garantia a partir da compra ───────────────────────────── */
await irPara(p, 'garantias');
const abrir = p.locator('button', { hasText: 'A peça voltou' });
prova(await abrir.count() === 1, 'Garantias tem o botão de abrir um caso');
if (await abrir.count()) {
  await abrir.click();
  await p.waitForTimeout(500);
  prova(/de qual compra ela saiu/.test(await texto(p)),
    'abrir garantia começa pela COMPRA, não por um formulário vazio');
  await p.locator('.mq-modal__close').first().click();
}

/* ── 9. variações: a regra 2 na tela ────────────────────────────────── */
await irPara(p, 'catalogo');
const verVar = p.locator('button', { hasText: 'Ver variações' });
if (await verVar.count()) {
  await verVar.first().click();
  await p.waitForTimeout(700);
  prova(/varia[cç][oõ]es da pe[cç]a/.test(await texto(p)), 'a tela de variações abre pela peça');
  await p.locator('.mq-modal__close').first().click();
} else {
  prova(false, 'Catálogo não ofereceu "Ver variações"');
}

/* ── 10. o alvo do dedo ─────────────────────────────────────────────── */
await irPara(p, 'vendas/lancamentos');
const pequenos = await p.evaluate(() => {
  const ruins = [];
  for (const b of document.querySelectorAll('button, a[href], input, select')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;          // escondido
    if (r.height < 28) ruins.push((b.textContent || b.getAttribute('aria-label') || '?').trim().slice(0, 30));
  }
  return ruins;
});
prova(pequenos.length === 0,
  `todo alvo de toque tem ao menos 28px de altura${pequenos.length ? ` — ${pequenos.slice(0, 5).join(' · ')}` : ''}`);

await ctx.close();

/* ═════════════════════════════════════ as cinco larguras, sem transbordo */

for (const [largura, altura, movel] of [[320, 720, true], [390, 844, true],
  [768, 1024, false], [1024, 768, false], [1440, 900, false]]) {
  const { ctx: c, p: q } = await pagina(largura, altura, movel);
  const vazou = [];
  for (const hash of ['vendas', 'vendas/nova', 'vendas/lancamentos', 'clientes',
    'financeiro', 'estoque', 'estoque/inventario', 'catalogo', 'garantias',
    'nuvemshop/publicacao', 'revendedoras']) {
    await irPara(q, hash);
    /* Transbordo HORIZONTAL do documento. Uma folga de 2px absorve o
       arredondamento de subpixel do próprio navegador. */
    const excesso = await q.evaluate(() => document.documentElement.scrollWidth
      - document.documentElement.clientWidth);
    if (excesso > 2) vazou.push(`${hash} (+${excesso}px)`);
  }
  prova(vazou.length === 0,
    `${largura}px sem transbordo lateral${vazou.length ? ` — ${vazou.join(', ')}` : ''}`);
  await c.close();
}

await navegador.close();

/* ═══════════════════════════════════════════════════════════ o veredito */

prova(externas.length === 0,
  `nenhuma requisição saiu do ambiente local${externas.length ? ` — ${externas.slice(0, 3).join(', ')}` : ''}`);

if (erros.length) {
  console.log('\nErros de página:');
  for (const e of [...new Set(erros)].slice(0, 20)) console.log(`  · ${e}`);
}
prova(erros.length === 0, 'nenhum erro de JavaScript em nenhuma tela');

const falhas = provas.filter((l) => l.startsWith('FALHA')).length;
console.log(`\n${provas.length - falhas}/${provas.length} provas passaram.`);
