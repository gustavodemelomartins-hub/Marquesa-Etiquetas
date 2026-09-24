/* PARIDADE DA V2 PUBLICADA — as cinco superfícies P0, no bundle que está no ar.
 *
 *      node src/v2-paridade-publicada.mjs
 *      MQ_APP=https://outro.exemplo/v2/ node src/v2-paridade-publicada.mjs
 *
 *  A diferença para `v2-smoke-operacional.mjs` é a fonte dos dados. Aquele
 *  fala com o Worker de staging e exige `MQ_KEY`; este INTERCEPTA a API no
 *  navegador e responde com um retrato pequeno e conhecido.
 *
 *  Por que isso vale alguma coisa: o CÓDIGO é o publicado, byte por byte —
 *  é o mesmo bundle que a Sthefany abre. O que este roteiro prova é o que
 *  depende da tela e não do banco: que a composição aprovada está lá, que os
 *  botões chegam até o fim do fluxo, que o formulário monta o corpo certo da
 *  requisição, e que nada disso transborda no telefone.
 *
 *  ┌─ O QUE ELE NÃO PROVA ──────────────────────────────────────────────┐
 *  │ · persistência. Nenhuma linha é gravada em lugar nenhum: as rotas   │
 *  │   de escrita são atendidas aqui dentro, e o que se confere é o      │
 *  │   CORPO que a tela mandou, não o efeito dele;                       │
 *  │ · a razão do estoque, que só fecha contra o banco de verdade;       │
 *  │ · qualquer regra que o backend aplique e a tela não repita.         │
 *  │ Para essas três existe `v2-smoke-operacional.mjs`, com `MQ_KEY`.    │
 *  └─────────────────────────────────────────────────────────────────────┘
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';
const API = 'https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev';
const FOTOS = process.env.MQ_SHOTS || 'evidencias-paridade';

mkdirSync(FOTOS, { recursive: true });

let falhas = 0;
const prova = (ok, texto) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  if (!ok) { falhas += 1; process.exitCode = 1; }
};

/* O retrato. Pequeno de propósito: três peças, duas contas e um inventário
   concluído bastam para toda superfície desta sessão ter conteúdo. Números
   redondos porque eles vão ser conferidos na tela. */
const PRODUTOS = [
  {
    sku: '230076', desc: 'Anel Abaulado', cat: 'Anel', preco: 99, semPreco: false,
    qtd: 5, consignado: 2, disponivel: 3, status: 'ativo', fotoStatus: 'sem_foto',
    visivel: null,
  },
  {
    sku: '347801', desc: 'Colar Coração Vazado', cat: 'Colar', preco: 69, semPreco: false,
    qtd: 4, consignado: 0, disponivel: 4, status: 'ativo', fotoStatus: 'sem_foto',
    visivel: null,
  },
  {
    sku: '428015', desc: 'Pulseira Elo Português', cat: 'Pulseira', preco: null, semPreco: true,
    qtd: 6, consignado: 1, disponivel: 5, status: 'ativo', fotoStatus: 'sem_foto',
    visivel: null,
  },
];

const ESTADO = {
  v: 2,
  produtos: PRODUTOS,
  revendedoras: [], maletas: [], vendas: [], clientes: [], categorias: [
    { nome: 'Anel', ordem: 1, cor: null },
    { nome: 'Colar', ordem: 2, cor: null },
    { nome: 'Pulseira', ordem: 3, cor: null },
  ],
  movimentos: [], garantias: [], saidas: [],
  inventario: { abertoId: null, diasDesde: 22, vencido: false, ultimoEm: '2026-09-02' },
  loja: { lidoEm: null, produtosNaLoja: 0 },
  config: {},
};

const CONTAS = {
  ok: true,
  cobertura: { completa: true, fontes: {}, porque: null },
  resumo: { quantidade: 2, total: 369, totalCentavos: 36900, vencidas: 2, semPrazo: 0, porTipo: {} },
  regra: 'Uma linha por venda. Abra para ver os recebimentos e registrar a entrada.',
  contas: [
    {
      chave: 'venda:1058', tipo: 'venda', id: 1058, versao: 1, vendaId: 1058,
      data: '2026-09-05', clienteId: 7, clienteNorm: 'camila ferreira',
      cliente: 'Camila Ferreira', clienteAmbiguo: false, origem: 'venda do sistema',
      observacao: null, valorTotal: 159, valorRecebido: 0, valorReceber: 159,
      vencimentoEm: '2026-09-16', vencida: true, pagaEm: null,
      cobrancaStatus: 'aberta', podeDefinirPrazo: true,
    },
    {
      chave: 'venda:1056', tipo: 'venda', id: 1056, versao: 1, vendaId: 1056,
      data: '2026-09-03', clienteId: 9, clienteNorm: 'ana luiza sedassari',
      cliente: 'Ana Luiza Sedassari', clienteAmbiguo: false, origem: 'venda do sistema',
      observacao: null, valorTotal: 340, valorRecebido: 100, valorReceber: 210,
      vencimentoEm: '2026-09-12', vencida: true, pagaEm: '2026-09-10',
      cobrancaStatus: 'aberta', podeDefinirPrazo: true,
    },
  ],
};

const INVENTARIOS = [
  {
    id: 41, status: 'concluido', iniciadoEm: '2026-09-02T09:00:00Z',
    pausadoEm: null, concluidoEm: '2026-09-02T18:20:00Z',
    divergentes: 12, pecas: 790, naoComparaveis: 0,
  },
];

const PAINEL = {
  geral: {
    periodo: { de: '2026-08-25', ate: '2026-09-24' },
    faturamento: 359, vendas: 4, pecas: 7, clientes: 3, skus: 5, clientesNovos: 1,
    aReceber: 369, receitaDiferencaTroca: 0, valorMedioPorItem: 120,
    intervalo: { de: '2026-08-25', ate: '2026-09-24' },
    ticketMedio: { valor: 150, vendasElegiveis: 4, formula: 'x' },
    composicao: {
      vendasHistoricas: 0, vendasSistema: 4, ajustes: 0, vendasSemData: 0,
      faturamentoDeVendas: 359,
    },
  },
  evolucao: [], canais: [], categorias: [], clientes: [], produtos: [],
};

/* O que a tela MANDOU. É aqui que se confere se o formulário monta o corpo
   certo — a parte do cadastro que um teste de renderização não alcança. */
const enviados = [];

/* `allInnerTexts` devolve o texto COMO ELE É PINTADO, e o Design System
   escreve cabeçalho de tabela e rótulo de indicador em caixa alta por CSS.
   Comparar sem normalizar acusaria diferença onde não há nenhuma. */
const igual = (lista, esperados) => {
  const vistos = lista.map((t) => t.trim().toLocaleLowerCase('pt-BR'));
  return esperados.every((e) => vistos.includes(e.toLocaleLowerCase('pt-BR')));
};

const navegador = await chromium.launch({ headless: true });
const ctx = await navegador.newContext({
  viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
});

await ctx.addInitScript((url) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key: 'chave-de-mentira' }));
}, API);

const json = (route, corpo, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(corpo),
});

await ctx.route(`${API}/**`, async (route) => {
  const req = route.request();
  const caminho = new URL(req.url()).pathname;
  const metodo = req.method();
  if (metodo !== 'GET') {
    enviados.push({ metodo, caminho, corpo: req.postDataJSON?.() ?? null });
  }

  if (caminho === '/api/state') return json(route, ESTADO);
  if (caminho === '/api/inventarios' && metodo === 'GET') return json(route, INVENTARIOS);
  if (caminho === '/api/inventarios' && metodo === 'POST') return json(route, { id: 42 });
  if (caminho.startsWith('/api/inventarios/')) {
    return json(route, {
      id: 42, status: 'aberto', iniciadoEm: '2026-09-24T04:00:00Z',
      pausadoEm: null, concluidoEm: null, contagem: [], naoIdentificado: [],
      cobertura: { conferidos: 0, total: 3 },
      esperados: PRODUTOS.map((p) => ({
        sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco,
        total: p.qtd, consignado: p.consignado, esperado: p.qtd - p.consignado,
      })),
    });
  }
  if (caminho === '/api/contas-receber') return json(route, CONTAS);
  if (caminho === '/api/analytics/painel') return json(route, PAINEL);
  if (caminho === '/api/produtos/sku/checar') {
    return json(route, {
      sku: '482913', valido: true, bloqueiam: [], avisos: [], formato: { ok: true },
    });
  }
  if (caminho === '/api/produtos/sku/gerar') return json(route, { ok: true, sku: '482913' });
  if (caminho === '/api/produtos/novos/analisar') {
    return json(route, {
      linhas: 1,
      prontos: {
        itens: [{
          sku: '482913', desc: 'Brinco Gota Cravejado', cat: 'Anel',
          preco: 149, qtd: 3, alertas: [],
        }],
      },
      jaExistem: { itens: [] },
      revisao: { itens: [] },
      resumo: { linhas: 1, prontos: 1, jaExistem: 0, revisao: 0, pecas: 3, semPreco: 0 },
    });
  }
  if (caminho === '/api/produtos/novos/cadastrar') {
    return json(route, { criados: 1, ignorados: [], avisos: [] });
  }
  if (caminho === '/api/contas-receber/receber') return json(route, { ok: true });

  /* Qualquer outra rota responde vazio. Uma tela que dependesse de algo não
     previsto aqui mostraria o estado vazio dela, não um erro — e é isso que
     se quer: nada de silêncio disfarçado de dado. */
  return json(route, {});
});

const p = await ctx.newPage();
const errosJs = [];
p.on('pageerror', (e) => errosJs.push(e.message));

const ir = async (hash) => {
  await p.goto(`${APP}#${hash}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
};

/* ══════════════════════════════════════════════ 1. ESTOQUE · VISÃO GERAL */

await ir('/estoque');
const secaoInv = p.locator('#inventario');
prova(await secaoInv.count() === 1, 'Estoque › a conferência física está NA tela, como seção');
prova(
  await p.locator('#inventario >> text=Saúde do estoque').count() === 1
  && await p.locator('#inventario >> text=Último inventário').count() === 1
  && await p.locator('#inventario >> text=Inventário em aberto').count() === 1,
  'Estoque › os três contextos do protótipo aparecem dentro da seção',
);

/* A ORDEM é o conteúdo da prova: inventário entre a distribuição e o
   catálogo físico, como em docs/ux/03-screens/estoque/master.html. */
const ordem = await p.evaluate(() => {
  const achar = (t) => [...document.querySelectorAll('h2')].find((h) => h.textContent?.trim() === t);
  const patrimonio = achar('Onde está o patrimônio');
  const inventario = document.getElementById('inventario');
  const catalogo = achar('Todos os produtos');
  if (!patrimonio || !inventario || !catalogo) return null;
  const depois = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  return depois(patrimonio, inventario) && depois(inventario, catalogo);
});
prova(ordem === true, 'Estoque › o inventário vem depois do patrimônio e antes do catálogo');

prova(
  await p.locator('.mq-kpi__label').count() >= 5,
  'Estoque › os cinco indicadores do protótipo estão no topo',
);
await p.screenshot({ path: `${FOTOS}/01-estoque-visao-geral.png`, fullPage: true });

/* "Conferir estoque" ROLA até a seção; não troca de página. */
const antes = p.url();
await p.getByRole('button', { name: /Conferir estoque/ }).click();
await p.waitForTimeout(800);
prova(p.url() === antes, 'Estoque › "Conferir estoque" não sai da Visão geral');
const visivel = await p.evaluate(() => {
  const s = document.getElementById('inventario');
  if (!s) return false;
  const r = s.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
});
prova(visivel, 'Estoque › depois do clique, a seção do inventário está à vista');

/* ════════════════════════════════════════════════════ 2. INVENTÁRIO */

await p.getByRole('button', { name: /Abrir inventário/ }).click();
await p.waitForTimeout(1200);
prova(
  enviados.some((e) => e.metodo === 'POST' && e.caminho === '/api/inventarios'),
  'Inventário › abrir a conferência chama POST /api/inventarios',
);
const contagemVisivel = await p.locator('text=Anel Abaulado').count() > 0;
prova(contagemVisivel, 'Inventário › a lista do que se espera encontrar em casa aparece');
await p.screenshot({ path: `${FOTOS}/02-inventario-embutido.png`, fullPage: true });

/* A rota antiga continua valendo, e é a MESMA tela em cabeçalho de página. */
await ir('/estoque/inventario');
prova(
  await p.getByRole('heading', { level: 1, name: 'Inventário' }).count() === 1,
  'Inventário › #/estoque/inventario continua abrindo a tela inteira',
);

/* ══════════════════════════════════ 3. CADASTRO DE PRODUTOS · 4. NOVO */

await ir('/catalogo');
prova(
  await p.getByRole('button', { name: /Novo produto/ }).count() === 1,
  'Catálogo › a ação "Novo produto" está no cabeçalho da tela',
);
const cabecalhos = await p.locator('.mq-tr--head span').allInnerTexts();
prova(
  igual(cabecalhos, ['Peça', 'Categoria', 'Quantidade', 'Preço', 'Situação']),
  `Catálogo › a tabela mostra ${cabecalhos.filter(Boolean).join(' · ')}`,
);
await p.screenshot({ path: `${FOTOS}/03-cadastro-de-produtos.png`, fullPage: true });

await p.getByRole('button', { name: /Novo produto/ }).click();
await p.waitForTimeout(500);
const dialogo = p.getByRole('dialog', { name: 'Novo produto' });
prova(await dialogo.count() === 1, 'Novo produto › o formulário ABRE — não é botão cenográfico');

await dialogo.getByRole('button', { name: /Gerar código/ }).click();
await p.waitForTimeout(700);
const codigo = await dialogo.locator('input').first().inputValue();
prova(codigo === '482913', `Novo produto › "Gerar código" preenche o campo (${codigo})`);

await dialogo.getByLabel(/Nome da peça/).fill('Brinco Gota Cravejado');
await dialogo.getByLabel(/Categoria/).selectOption('Anel');
await dialogo.getByLabel(/Preço/).fill('149');
await dialogo.getByLabel(/Quantidade inicial/).fill('3');
await p.screenshot({ path: `${FOTOS}/04-novo-produto-preenchido.png` });

await dialogo.getByRole('button', { name: /Conferir e criar/ }).click();
await p.waitForTimeout(900);
prova(
  await dialogo.getByText('Confira antes de criar').count() === 1,
  'Novo produto › o laudo aparece ANTES de qualquer escrita',
);
prova(
  !enviados.some((e) => e.caminho === '/api/produtos/novos/cadastrar'),
  'Novo produto › nada foi cadastrado só por preencher o formulário',
);

await dialogo.getByRole('button', { name: /Criar produto/ }).click();
await p.waitForTimeout(1200);

const cadastro = enviados.find((e) => e.caminho === '/api/produtos/novos/cadastrar');
prova(!!cadastro, 'Novo produto › "Criar produto" chama POST /api/produtos/novos/cadastrar');
prova(cadastro?.corpo?.origem === 'manual', 'Novo produto › o cadastro vai com origem manual (§17)');
prova(cadastro?.corpo?.produtos?.[0]?.qtd === 3, 'Novo produto › a quantidade inicial viaja na linha (§19)');
prova(
  await p.getByRole('dialog', { name: 'Novo produto' }).count() === 0,
  'Novo produto › o formulário fecha depois de criar',
);
const busca = await p.getByLabel('Buscar no catálogo').inputValue();
prova(busca === '482913', 'Novo produto › a lista volta com a peça recém-criada à vista');
await p.screenshot({ path: `${FOTOS}/05-produto-criado.png`, fullPage: true });

/* §24 — preço em branco não pode virar zero em lugar nenhum do caminho. */
await p.getByRole('button', { name: /Novo produto/ }).click();
await p.waitForTimeout(400);
const d2 = p.getByRole('dialog', { name: 'Novo produto' });
await d2.locator('input').first().fill('310928');
await d2.getByLabel(/Nome da peça/).fill('Peça sem preço');
await d2.getByRole('button', { name: /Conferir e criar/ }).click();
await p.waitForTimeout(900);
const analise = [...enviados].reverse().find((e) => e.caminho === '/api/produtos/novos/analisar');
prova(analise?.corpo?.produtos?.[0]?.preco === null, 'Novo produto › §24: preço em branco vai como ausente, não zero');
await d2.getByRole('button', { name: 'Cancelar' }).click();

/* ═══════════════════════════════════════════ 5. FINANCEIRO · A RECEBER */

await ir('/financeiro/a-receber');
const rotulos = await p.locator('.mq-kpis .mq-kpi__label').allInnerTexts();
prova(
  igual(rotulos, ['Saldo em aberto', 'Vence hoje', 'Em atraso', 'Recebido']),
  `A receber › quatro números: ${rotulos.join(' · ')}`,
);
const valores = await p.locator('.mq-kpis .mq-kpi__value').allInnerTexts();
prova(valores.every((v) => v.includes('R$')), 'A receber › os quatro são dinheiro, nenhum é contagem');

prova(
  await p.getByText('Três datas, três significados.').count() === 1,
  'A receber › as três datas estão nesta aba, onde se trabalha com elas',
);

const colunas = await p.locator('.mq-tr--head span').allInnerTexts();
prova(
  igual(colunas, ['Cliente', 'Venda', 'Vencimento', 'Total', 'Recebido', 'A receber', 'Situação']),
  `A receber › sete colunas: ${colunas.join(' · ')}`,
);
prova(
  await p.getByLabel('Buscar cliente ou venda').count() === 1
  && await p.getByRole('button', { name: 'Em atraso' }).count() >= 1,
  'A receber › busca e chips de filtro existem',
);
prova(
  await p.locator('.sale-detail').count() === 1
  && await p.getByText('Venda selecionada').count() === 1,
  'A receber › o painel da venda fica ao lado da lista',
);
await p.screenshot({ path: `${FOTOS}/06-a-receber.png`, fullPage: true });

/* Selecionar outra linha troca o painel — e a lista continua ali. */
await p.getByRole('button', { name: /Abrir Ana Luiza Sedassari/ }).click();
await p.waitForTimeout(400);
const noPainel = await p.locator('.sale-detail').innerText();
prova(/Ana Luiza/.test(noPainel), 'A receber › o painel segue a linha escolhida');
prova(/R\$ 340/.test(noPainel), 'A receber › o painel mostra o valor da venda, não só o saldo');
prova(
  await p.getByRole('table', { name: 'Contas a receber' }).count() === 1,
  'A receber › a lista continua visível: painel, não diálogo',
);

/* O que o sistema NÃO faz está dito, e não virou botão. */
prova(
  await p.getByRole('button', { name: /Corrigir lançamento/ }).count() === 0
  && await p.getByText(/Corrigir ou estornar um recebimento ainda não existe/).count() === 1,
  'A receber › a ausência de correção é anunciada em vez de fingida',
);

await p.getByRole('button', { name: 'Registrar recebimento' }).click();
await p.waitForTimeout(500);
const dRec = p.getByRole('dialog', { name: 'Registrar recebimento' });
prova(await dRec.count() === 1, 'A receber › "Registrar recebimento" abre o diálogo da data efetiva');
await dRec.getByRole('button', { name: /^Recebi/ }).click();
await p.waitForTimeout(900);
const receb = enviados.find((e) => e.caminho === '/api/contas-receber/receber');
prova(!!receb?.corpo?.pagaEm, `A receber › o recebimento vai com a DATA EFETIVA (${receb?.corpo?.pagaEm})`);
prova(receb?.corpo?.chave === 'venda:1056', 'A receber › e com a chave da conta escolhida');
await p.screenshot({ path: `${FOTOS}/07-recebimento-registrado.png`, fullPage: true });

/* ═══════════════════════════════════════════════════ 6. O TELEFONE */

const tel = await navegador.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
await tel.addInitScript((url) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key: 'chave-de-mentira' }));
}, API);
await tel.route(`${API}/**`, async (route) => {
  const caminho = new URL(route.request().url()).pathname;
  if (caminho === '/api/state') return json(route, ESTADO);
  if (caminho === '/api/inventarios') return json(route, INVENTARIOS);
  if (caminho === '/api/contas-receber') return json(route, CONTAS);
  if (caminho === '/api/analytics/painel') return json(route, PAINEL);
  return json(route, {});
});
const t = await tel.newPage();
for (const [hash, nome] of [['/estoque', 'estoque'], ['/financeiro/a-receber', 'a-receber']]) {
  await t.goto(`${APP}#${hash}`, { waitUntil: 'networkidle' });
  await t.waitForTimeout(900);
  const excesso = await t.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  prova(excesso <= 1, `Telefone › ${nome} não transborda em 390px (${excesso}px)`);
  await t.screenshot({ path: `${FOTOS}/tel-${nome}.png`, fullPage: true });
}

prova(errosJs.length === 0, `nenhum erro de JavaScript no bundle publicado${errosJs.length ? `: ${errosJs[0]}` : ''}`);

await navegador.close();

console.log('');
console.log(falhas === 0
  ? `Todas as provas passaram. Capturas em ${FOTOS}/`
  : `${falhas} prova(s) falharam.`);
console.log('NÃO PROVADO aqui: persistência, razão do estoque e as regras que só o backend aplica.');
console.log('Para isso: MQ_KEY=<chave do staging-v2> node src/v2-smoke-operacional.mjs');
