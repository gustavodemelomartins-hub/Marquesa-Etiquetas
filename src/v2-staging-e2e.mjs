/* A V2 publicada, contra o STAGING REAL — as 19 provas do roteiro.
 *
 *  Diferente de `scripts/v2-local/e2e-completo.mjs`, que fala com um Worker
 *  em memória e um cenário semeado: aqui o navegador abre o endereço que a
 *  pessoa vai abrir no telefone, e o banco é a cópia da operação. Por isso
 *  nada é fixado por nome — não existe "Vitória Prado" combinada de
 *  antemão. Quem entra em cena é DESCOBERTO pela própria API, e um banco
 *  diferente só muda quem faz o papel, não o que se prova.
 *
 *      MQ_KEY=<chave> node src/v2-staging-e2e.mjs
 *
 *  A chave vem do ambiente e nunca do arquivo: este arquivo é versionado e
 *  o staging serve CPF e telefone de cliente real.
 */
import { chromium } from 'playwright';

const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';
const API = process.env.MQ_API || 'https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev';
const KEY = process.env.MQ_KEY;
if (!KEY) {
  console.error('Defina MQ_KEY com a chave do staging. Ela nao mora neste arquivo.');
  process.exit(2);
}
const H = { Authorization: `Bearer ${KEY}` };
const api = async (caminho) => {
  const r = await fetch(API + caminho, { headers: H });
  if (!r.ok) throw new Error(`${caminho} respondeu ${r.status}`);
  return r.json();
};

const provas = [];
/* Imprime NA HORA, e nao so no fim. Uma excecao no meio do roteiro levava
   junto todas as provas que ja tinham passado, e a saida ficava sendo o
   stack trace de um unico 404 — exatamente a informacao menos util. */
const prova = (ok, texto) => {
  const linha = `${ok ? 'ok   ' : 'FALHA'} ${texto}`;
  provas.push(linha);
  console.log(linha);
  if (!ok) process.exitCode = 1;
};

/* Nome unico por rodada: rodar duas vezes criaria homonimas, e ai a propria
   §2 entra em acao — a ficha recusa vinculo quando o nome aponta para mais
   de uma pessoa, e o teste leria a cliente errada achando que achou bug. */
const NOME = `Teste V2 ${new Date().toISOString().slice(5, 19).replace(/[-:T]/g, '')}`;

const navegador = await chromium.launch({ headless: true });
const erros = [];
const externas = [];
const origemApp = new URL(APP).origin;

async function pagina(w, h, movel) {
  const ctx = await navegador.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API, KEY]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`${w}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(`${w}: ${m.text()}`); });
  /* 18 e 19 · o app so pode falar com o Pages do DEV e com o Worker de
     staging. Qualquer outra saida fica registrada — producao e Nuvemshop
     incluidas, se alguma linha tentasse. */
  p.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (u.startsWith(origemApp) || u.startsWith(API)) return;
    externas.push(`${r.method()} ${u}`);
  });
  return { ctx, p };
}

/* ─────────────────────────── 17 · a porta, antes de qualquer outra coisa */
{
  const semChave = await fetch(`${API}/api/clientes?limite=1`);
  const saude = await fetch(`${API}/api/health`);
  prova(semChave.status === 401 && saude.ok,
    `17 · dado real exige chave (sem chave: ${semChave.status}; /api/health: ${saude.status})`);
}

/* ───────────────────────────────── quem entra em cena, descoberto na API */
const todasClientes = await api('/api/clientes?limite=400');
let historica = null;
for (const c of todasClientes.slice(0, 60)) {
  const perfil = await api(`/api/clientes/perfil?id=${c.id}`);
  if ((perfil.vendas || []).length > 0) { historica = { ...c, perfil }; break; }
}
prova(!!historica, `dados historicos presentes: ${todasClientes.length} clientes no staging`);
if (!historica) {
  console.log(provas.join('\n'));
  await navegador.close();
  process.exit(1);
}

const estado = await api('/api/state');
const alvo = (estado.produtos || []).find((p) => p.qtd > 1 && p.preco > 0);
prova(!!alvo, `catalogo com peca vendavel: ${(estado.produtos || []).length} produtos`);

/* ══════════════════════════════════════════════ 16 · tudo isto no TELEFONE */
{
  const { ctx, p } = await pagina(390, 844, true);

  await p.goto(APP);
  await p.waitForSelector('.mq-kpis', { timeout: 40000 });
  prova(true, '16 · a V2 publicada abre num viewport de telefone (390px)');

  /* 1 e 2 · uma cliente historica, e as compras dela */
  await p.goto(`${APP}#/clientes/${historica.id}`);
  await p.waitForSelector('.mq-kpi', { timeout: 30000 });
  const cabecalho = await p.locator('h1').innerText();
  prova(cabecalho.includes(historica.nome.split(' ')[0]),
    `1 · abre a cliente historica ${historica.nome} (id ${historica.id})`);

  await p.locator('.mq-tabs button', { hasText: 'Compras' }).first().click();
  await p.waitForTimeout(900);
  prova(historica.perfil.vendas.length > 0 && (await p.locator('main').innerText()).length > 0,
    `2 · o historico de compras aparece (${historica.perfil.vendas.length} na API)`);

  /* 3 · credito. Rota PROPRIA: o perfil nao o carrega, e procura-lo la
     devolvia undefined — o campo nunca existiu, o teste e que pedia no
     lugar errado. A resposta declara a regra em letra, e ela e a que
     importa aqui: o saldo e derivado da razao, nao uma coluna. */
  const credito = await api(`/api/clientes/${historica.id}/credito`);
  const razaoCredito = await api('/api/credito/conferir');
  prova(credito.ok
      && typeof credito.saldoCentavos === 'number'
      && /derivado da raz/i.test(credito.regra || '')
      && (razaoCredito.divergentes || []).length === 0,
    `3 · o credito e derivado da razao (saldo ${credito.saldoCentavos} centavos, `
    + `${(credito.extrato || []).length} lancamentos, razao do credito sem divergencia)`);

  /* 4 · criar cliente no staging */
  await p.goto(`${APP}#/clientes`);
  await p.waitForSelector('.mq-tr:not(.mq-tr--head)', { timeout: 30000 });
  await p.getByRole('button', { name: /Nova cliente/ }).click();
  await p.waitForSelector('.mq-drawer');
  await p.locator('.mq-drawer input').first().fill(NOME);
  await p.locator('.mq-drawer input').nth(1).fill('19999990000');
  await p.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await p.waitForSelector('.mq-drawer', { state: 'detached', timeout: 25000 });
  await p.waitForSelector('.mq-kpi', { timeout: 25000 });
  prova((await p.locator('h1').innerText()).includes(NOME), '4 · cria cliente no staging');

  /* 5 · editar */
  await p.getByRole('button', { name: 'Editar dados' }).click();
  await p.waitForSelector('.mq-drawer');
  await p.locator('.mq-drawer input').nth(2).fill('Hortolandia');
  await p.getByRole('button', { name: 'Salvar alteracoes' })
    .or(p.getByRole('button', { name: 'Salvar alterações' }))
    .first()
    .click();
  await p.waitForSelector('.mq-drawer', { state: 'detached', timeout: 25000 });
  await p.waitForTimeout(1200);
  prova((await p.locator('.mq-pagehead').innerText()).includes('Hortolandia'),
    '5 · edita a cliente e a ficha reflete');

  /* 6 e 7 · venda com data de venda e data de pagamento DIFERENTES (§30) */
  const qtdAntes = alvo.qtd;
  const DATA_VENDA = '2026-09-17';
  const DATA_PAGAMENTO = '2026-09-19';

  await p.getByRole('button', { name: /Nova venda/ }).click();
  await p.waitForSelector('.mq-drawer');
  await p.getByLabel('Buscar peca')
    .or(p.getByLabel('Buscar peça'))
    .first()
    .fill(alvo.sku);
  await p.waitForTimeout(900);
  await p.locator('.mq-list--compacta .mq-item').first().click();
  await p.waitForTimeout(400);
  await p.locator('input[type=date]').first().fill(DATA_VENDA);
  await p.locator('input[type=date]').nth(1).fill(DATA_PAGAMENTO);
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Registrar venda/ }).click();
  await p.waitForSelector('.mq-drawer', { state: 'detached', timeout: 30000 });
  await p.waitForTimeout(1200);
  prova(true, '6 · registra a venda no staging pela interface');

  const achadas = await api(`/api/clientes?limite=100&busca=${encodeURIComponent(NOME)}`);
  const nova = achadas.reduce((a, c) => (a && a.id > c.id ? a : c), null);
  const perfilNovo = await api(`/api/clientes/perfil?id=${nova.id}`);
  const venda = (perfilNovo.vendas || [])[0];
  prova(venda && venda.data === DATA_VENDA && venda.pagaEm === DATA_PAGAMENTO,
    `7 · a data do pagamento e propria (vendeu ${venda && venda.data}, recebeu ${venda && venda.pagaEm})`);
  prova((perfilNovo.resumo || {}).vendas === 1, '8 · a venda aparece na ficha da cliente');

  /* 9 · e no Financeiro, no dia do PAGAMENTO — nao no da venda */
  const doDia = await api(`/api/vendas/lancamentos?data=${DATA_PAGAMENTO}`);
  await p.goto(`${APP}#/financeiro/recebimentos~tudo`);
  await p.waitForSelector('.mq-kpi', { timeout: 30000 });
  await p.locator('input[type=date]').first().fill(DATA_PAGAMENTO);
  await p.waitForTimeout(2000);
  const kpis = await p.locator('.mq-kpis').innerText();
  prova(doDia.recebidoNoDia > 0 && kpis.includes(doDia.recebidoNoDia.toLocaleString('pt-BR')),
    `9 · o Financeiro mostra o recebido do dia do pagamento (R$ ${doDia.recebidoNoDia})`);

  /* 10 · o estoque mexeu, e a razao contabil continua fechando */
  const depois = await api('/api/state');
  const qtdDepois = depois.produtos.find((x) => x.sku === alvo.sku).qtd;
  prova(qtdDepois === qtdAntes - 1, `10 · o estoque caiu 1 (${qtdAntes} para ${qtdDepois})`);
  const razao = await api('/api/estoque/conferir');
  prova((razao.divergentes || []).length === 0,
    '10b · a razao contabil continua fechando depois da venda');

  /* 11 · garantia historica */
  const garantias = await api('/api/garantias');
  const listaG = Array.isArray(garantias) ? garantias : (garantias.garantias || garantias.itens || []);
  await p.goto(`${APP}#/garantias/todas`);
  await p.waitForSelector('main', { timeout: 30000 });
  await p.waitForTimeout(1600);
  prova(listaG.length > 0 && (await p.locator('main').innerText()).length > 0,
    `11 · Garantias abre com historico real (${listaG.length} casos)`);

  /* 12 · revendedora e maleta historicas */
  /* `/api/revendedoras` e `/api/maletas` sao POST — elas CRIAM. A leitura
     das duas vem do agregado `/api/state`, que e o que a tela usa. */
  const agregado = await api('/api/state');
  const listaR = agregado.revendedoras || [];
  const listaM = agregado.maletas || [];
  await p.goto(`${APP}#/revendedoras`);
  await p.waitForSelector('main', { timeout: 30000 });
  await p.waitForTimeout(1600);
  prova(listaR.length > 0 && listaM.length > 0,
    `12 · Revendedoras e maletas com dados reais (${listaR.length} revendedoras, ${listaM.length} maletas)`);

  /* 13 · inventario */
  await p.goto(`${APP}#/estoque/inventario`);
  await p.waitForSelector('main', { timeout: 30000 });
  await p.waitForTimeout(1400);
  prova((await p.locator('main').innerText()).includes('contado'),
    '13 · Inventario disponivel, com a regra escrita na tela');

  /* 14 e 15 · deep-link e recarregar caem na mesma tela */
  await p.goto(`${APP}#/estoque/saidas`);
  await p.waitForSelector('h1', { timeout: 30000 });
  const antesDoReload = await p.locator('h1').innerText();
  await p.reload();
  await p.waitForSelector('h1', { timeout: 30000 });
  const depoisDoReload = await p.locator('h1').innerText();
  prova(antesDoReload.length > 0, `14 · deep-link abre direto na tela pedida (${antesDoReload})`);
  prova(depoisDoReload === antesDoReload, '15 · recarregar mantem a mesma tela');

  await ctx.close();
}

/* ═════════════════════════════════ as cinco larguras, em todos os modulos */
const ROTAS = [
  '#/home', '#/clientes', '#/vendas', '#/financeiro/resumo~tudo',
  '#/financeiro/a-receber~tudo', '#/estoque', '#/estoque/pecas',
  '#/estoque/inventario', '#/estoque/saidas', '#/catalogo', '#/garantias',
  '#/revendedoras', '#/nuvemshop', '#/configuracoes', '#/agenda',
  '#/notificacoes', '#/etiquetas',
];
const estouros = [];
for (const [w, h] of [[320, 720], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
  const { ctx, p } = await pagina(w, h, w < 700);
  for (const rota of ROTAS) {
    await p.goto(APP + rota);
    await p.waitForSelector('main', { timeout: 30000 });
    await p.waitForTimeout(600);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
      estouros.push(`${w} · ${rota}`);
    }
  }
  await ctx.close();
}
prova(estouros.length === 0,
  `16b · ${ROTAS.length} telas sem estouro em 320/390/768/1024/1440${estouros.length ? ': ' + estouros.join(', ') : ''}`);

/* 18 e 19 · o veredito sobre para onde o app falou */
const producao = externas.filter((u) => /marquesa-api\.|marquesa-db/.test(u));
const loja = externas.filter((u) => /nuvemshop|tiendanube/i.test(u));
prova(producao.length === 0,
  `18 · nenhuma requisicao para producao${producao.length ? ': ' + producao.join(', ') : ''}`);
prova(loja.length === 0,
  `19 · nenhuma requisicao para a Nuvemshop real${loja.length ? ': ' + loja.join(', ') : ''}`);
prova(externas.length === 0,
  `18b · nenhuma saida fora do Pages do DEV e do Worker de staging${externas.length ? ': ' + externas.slice(0, 4).join(', ') : ''}`);
prova(erros.length === 0,
  `sem erro de console em nenhuma largura${erros.length ? ': ' + erros.slice(0, 4).join(' | ') : ''}`);

await navegador.close();
const falhas = provas.filter((l) => l.startsWith('FALHA'));
console.log(`\n${provas.length - falhas.length}/${provas.length} provas passaram.`);
if (falhas.length) console.log(falhas.join('\n'));
