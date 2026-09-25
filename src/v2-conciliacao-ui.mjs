/* QA VISUAL DA CONCILIAÇÃO, NO BUNDLE PUBLICADO.
 *
 *      node src/v2-conciliacao-ui.mjs
 *
 *  Este roteiro prova a TELA — composição, densidade, e que ela continua
 *  legível num telefone de 390px. Ele NÃO precisa de chave, e essa é uma
 *  escolha, não uma limitação:
 *
 *   · o que se está provando aqui é layout e fluxo, e layout não depende de
 *     qual banco respondeu. A API é interceptada por `page.route`, com
 *     fixtures que carregam exatamente os casos que a revisão existe para
 *     separar — falta parcial, falta declarada, sobra e bloqueado;
 *   · uma chave de staging num roteiro de QA visual é um segredo a mais
 *     circulando por um motivo que não justifica.
 *
 *  O que ele NÃO cobre, e por isso existe ao lado e não no lugar de
 *  `src/v2-camera-e2e.mjs`: a gravação de verdade no D1. Aquele roteiro
 *  bipa contra o staging e precisa de `MQ_KEY`.
 *
 *  O BUNDLE é o publicado. Não é `vite preview`, não é `dist/` local: é o
 *  arquivo que a Sthefany carregaria agora, servido pelo Pages.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';
/* Relativo à RAIZ do repositório, e não ao diretório de onde se chamou:
   rodar `node src/v2-conciliacao-ui.mjs` de dentro de `src/` jogaria as
   fotos num segundo `evidencias-paridade/` que ninguém procura. */
const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FOTOS = process.env.MQ_SHOTS || `${RAIZ}evidencias-paridade`;
mkdirSync(FOTOS, { recursive: true });

let falhas = 0;
const prova = (ok, texto) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  if (!ok) { falhas += 1; process.exitCode = 1; }
};

/* ── as fixtures. Cada linha existe para um caso que a revisão separa. */
const ESPERADOS = [
  { sku: '500001', desc: 'Colar Veneziana 45cm', cat: 'Colar', preco: 89, total: 3, consignado: 0, esperado: 3 },
  { sku: '500002', desc: 'Brinco Argola Média', cat: 'Brinco', preco: 49, total: 3, consignado: 0, esperado: 3 },
  { sku: '500003', desc: 'Anel Solitário Cravejado', cat: 'Anel', preco: 129, total: 3, consignado: 0, esperado: 3 },
  { sku: '500004', desc: 'Pulseira Elos Grossa', cat: 'Pulseira', preco: 59, total: 1, consignado: 0, esperado: 1 },
  { sku: '500005', desc: 'Colar Ponto de Luz', cat: 'Colar', preco: 99, total: 4, consignado: 4, esperado: 0 },
  { sku: '500006', desc: 'Brinco Gota Lisa', cat: 'Brinco', preco: 39, total: 2, consignado: 0, esperado: 2 },
  { sku: '500007', desc: 'Anel Aparador Duplo', cat: 'Anel', preco: 149, total: 5, consignado: 0, esperado: 5 },
  { sku: '500008', desc: 'Brinco Pérola Pequena', cat: 'Brinco', preco: 45, total: 4, consignado: 0, esperado: 4 },
  { sku: '500009', desc: 'Colar Cordão Baiano', cat: 'Colar', preco: 139, total: 2, consignado: 0, esperado: 2 },
  { sku: '500010', desc: 'Pulseira Riviera', cat: 'Pulseira', preco: 79, total: 3, consignado: 0, esperado: 3 },
];

const CONTAGEM = [
  { sku: '500001', variacao: null, contado: 3, contadoEm: '2026-09-25T10:00:00Z' },
  { sku: '500002', variacao: null, contado: 2, contadoEm: '2026-09-25T10:12:00Z' },
  { sku: '500004', variacao: null, contado: 2, contadoEm: '2026-09-25T10:31:00Z' },
  { sku: '500008', variacao: null, contado: 4, contadoEm: '2026-09-25T10:48:00Z' },
  { sku: '500009', variacao: null, contado: 2, contadoEm: '2026-09-25T11:02:00Z' },
];

const MOTIVOS = [
  { id: 'nao_encontrada', rotulo: 'Não encontrada na casa', sentido: 'saida', explica: '' },
  { id: 'quebrada', rotulo: 'Quebrada ou danificada', sentido: 'saida', explica: '' },
  { id: 'saiu_sem_lancar', rotulo: 'Saiu sem lançamento', sentido: 'saida', explica: '' },
  { id: 'entrou_sem_lancar', rotulo: 'Entrou sem lançamento', sentido: 'entrada', explica: '' },
  { id: 'devolucao_nao_lancada', rotulo: 'Devolução não lançada', sentido: 'entrada', explica: '' },
  { id: 'erro_de_contagem', rotulo: 'Erro de contagem anterior', sentido: 'ambos', explica: '' },
  { id: 'outro', rotulo: 'Outro', sentido: 'ambos', explica: '', livre: true },
];

const linha = (o) => ({
  varianteId: null, deltaPos: 0, aviso: null, aplicado: false, saidaId: null,
  motivoAplicado: null, declarado: false, motivo: null, variacao: null, ...o,
});

const RESULTADO = {
  ok: true, id: 19, concluidoEm: '2026-09-25',
  cobertura: { conferidos: 5, total: 10 },
  conferido: 3, conferidos: 3,
  conferidosItens: [
    { sku: '500001', desc: 'Colar Veneziana 45cm', cat: 'Colar', variacao: null, contado: 3, esperado: 3, aviso: null },
    { sku: '500008', desc: 'Brinco Pérola Pequena', cat: 'Brinco', variacao: null, contado: 4, esperado: 4, aviso: null },
    { sku: '500009', desc: 'Colar Cordão Baiano', cat: 'Colar', variacao: null, contado: 2, esperado: 2, aviso: null },
  ],
  pecasContadas: 13,
  faltando: [
    linha({ sku: '500003', desc: 'Anel Solitário Cravejado', cat: 'Anel', preco: 129,
      contado: 0, esperado: 3, dif: -3, sugestao: -3, valor: 387, declarado: true,
      motivo: 'Não foi bipada, e a contagem foi declarada completa.' }),
    linha({ sku: '500007', desc: 'Anel Aparador Duplo', cat: 'Anel', preco: 149,
      contado: 0, esperado: 5, dif: -5, sugestao: -5, valor: 745, declarado: true,
      motivo: 'Não foi bipada, e a contagem foi declarada completa.' }),
    linha({ sku: '500002', desc: 'Brinco Argola Média', cat: 'Brinco', preco: 49,
      contado: 2, esperado: 3, dif: -1, sugestao: -1, valor: 49 }),
    linha({ sku: '500006', desc: 'Brinco Gota Lisa', cat: 'Brinco', preco: 39,
      contado: 0, esperado: 2, dif: -2, sugestao: -2, valor: 78, declarado: true,
      motivo: 'Não foi bipada, e a contagem foi declarada completa.' }),
  ],
  sobrando: [
    linha({ sku: '500004', desc: 'Pulseira Elos Grossa', cat: 'Pulseira', preco: 59,
      contado: 2, esperado: 1, dif: 1, sugestao: 1, valor: 59 }),
  ],
  naoConferido: [
    { sku: '500010', desc: 'Pulseira Riviera', cat: 'Pulseira', variacao: null, esperado: 3,
      motivo: 'A razão deste código tem peça sem identidade de variação. Dizer que a contagem terminou não diz de qual variação é a falta, e o inventário não chuta.' },
  ],
  naoComparavel: [],
  desconhecidos: [],
  contagemCompleta: true,
  motivos: MOTIVOS,
  conciliacao: { divergencias: 5, resolvidas: 0, pendentes: 5, bloqueadas: 0, naoConferidos: 1, conciliado: false },
};

/** O estado mínimo que o casco pede para desenhar a tela. */
const STATE = {
  v: 2, produtos: [], clientes: [], vendas: [], revendedoras: [], maletas: [],
  categorias: [{ nome: 'Colar', ordem: 1, cor: null }, { nome: 'Brinco', ordem: 2, cor: null }],
  config: {}, loja: null,
  inventario: { abertoId: 19, abertoEm: '2026-09-25T09:00:00Z', pausadoEm: null,
    ultimoId: 18, ultimoEm: '2026-09-02', diasDesde: 23, prazoDias: 30, vencido: false },
};

async function abrir(pagina, { concluido }) {
  await pagina.route('**/api/**', async (rota) => {
    const url = new URL(rota.request().url());
    const p = url.pathname;
    const responder = (corpo, status = 200) => rota.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(corpo),
    });

    if (p.endsWith('/api/state')) return responder(STATE);
    if (p.endsWith('/api/inventarios')) {
      return responder([{
        id: 19, status: concluido ? 'concluido' : 'aberto',
        iniciadoEm: '2026-09-25T09:00:00Z', pausadoEm: null,
        concluidoEm: concluido ? '2026-09-25' : null,
        divergentes: concluido ? 5 : 0, pecas: 13, naoComparaveis: 0,
      }]);
    }
    if (/\/api\/inventarios\/19$/.test(p)) {
      return responder({
        id: 19, status: concluido ? 'concluido' : 'aberto',
        iniciadoEm: '2026-09-25T09:00:00Z', pausadoEm: null,
        concluidoEm: concluido ? '2026-09-25' : null,
        contagem: CONTAGEM, naoIdentificado: [],
        cobertura: { conferidos: 5, total: 10 },
        esperados: concluido ? [] : ESPERADOS,
      });
    }
    if (p.endsWith('/resultado')) return responder(RESULTADO);
    return responder({ ok: true });
  });

  await pagina.addInitScript(() => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({
      url: 'https://api.local', key: 'qa-visual',
    }));
  });
  await pagina.goto(`${APP}#/estoque/inventario`, { waitUntil: 'networkidle' });
}

const foto = (pagina, nome) => pagina.screenshot({
  path: `${FOTOS}/${nome}.png`, fullPage: true,
});

const navegador = await chromium.launch();
try {
  /* ── 1. A CONTAGEM, no desktop. */
  {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
    const pagina = await ctx.newPage();
    await abrir(pagina, { concluido: false });

    const painel = pagina.locator('[aria-label="Progresso da conferência"]');
    await painel.waitFor({ timeout: 15000 });
    prova(await painel.isVisible(), 'a seção de progresso aparece na contagem');

    /* 5 de 10 códigos bipados. A medida é COBERTURA, e não "encontrado
       sobre esperado" — ver o cabeçalho de `progresso.ts`. */
    prova(/50%/.test(await painel.innerText()), 'o progresso mostra 50% (5 de 10 códigos)');
    /* `innerText` devolve o texto RENDERIZADO, e o `dt` sobe para
       maiúsculas por CSS — comparar com a grafia do código-fonte falharia
       por causa do `text-transform`, não por causa da tela. */
    prova(/ainda não visitados/i.test(await painel.innerText()),
      'o que falta é "ainda não visitado", e não "faltando"');

    /* A checagem é sobre os RÓTULOS, e só eles: a nota do rodapé usa a
       palavra "faltando" DE PROPÓSITO, para negar que seja disso que a
       barra fala. Varrer o painel inteiro acusaria justamente a frase que
       existe para impedir o mal-entendido. */
    const numeros = await painel.locator('.progress-figures').innerText();
    const barras = await painel.locator('.progress-bars').innerText();
    prova(!/faltando|sobrando|perda|divergência/i.test(numeros + barras),
      'nenhum número ou barra do progresso é rotulado como perda');

    const chips = painel.locator('[aria-label="Categoria"] button');
    prova(await chips.count() >= 4, 'o filtro traz as categorias vindas do catálogo');
    await foto(pagina, 'conciliacao-1-contagem-desktop');

    /* ── o filtro recorta o progresso E a lista. */
    await chips.filter({ hasText: 'Brinco' }).first().click();
    await pagina.waitForTimeout(250);
    prova(/67%|33%|100%|0%/.test(await painel.innerText()),
      'filtrar por categoria recalcula o progresso');
    await foto(pagina, 'conciliacao-2-filtro-brinco');
    await ctx.close();
  }

  /* ── 2. O ENCERRAMENTO — as três saídas. */
  {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
    const pagina = await ctx.newPage();
    await abrir(pagina, { concluido: false });
    await pagina.locator('[aria-label="Progresso da conferência"]').waitFor({ timeout: 15000 });

    await pagina.getByRole('button', { name: /Finalizar inventário/ }).click();
    const dialogo = pagina.getByRole('dialog');
    await dialogo.waitFor({ timeout: 5000 });
    const texto = await dialogo.innerText();

    prova(/terminou de conferir/i.test(texto), 'o diálogo pergunta se a conferência terminou');
    prova(/5/.test(texto), 'o diálogo diz quantos códigos ficaram sem bipe');
    prova(await dialogo.getByRole('button', { name: 'Encerrar parcial' }).isVisible(),
      'existe a saída "encerrar parcial"');
    prova(await dialogo.getByRole('button', { name: /Sim, terminei a contagem/ }).isVisible(),
      'existe a saída "terminei a contagem"');
    prova(await dialogo.getByRole('button', { name: /^Continuar conferindo$/ }).isVisible(),
      'e a saída que não faz nada');
    await foto(pagina, 'conciliacao-3-encerramento');
    await ctx.close();
  }

  /* ── 3. A REVISÃO, desktop. */
  {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
    const pagina = await ctx.newPage();
    await abrir(pagina, { concluido: true });
    await pagina.getByRole('button', { name: /Inventário #19/ }).first().click();

    const revisao = pagina.locator('.revisao');
    await revisao.waitFor({ timeout: 15000 });
    const texto = await revisao.innerText();

    prova(/0 de 5 divergências resolvidas/.test(texto),
      'a revisão abre pela conciliação: quanto falta decidir');
    prova(/A conferência foi declarada completa/.test(texto),
      'a declaração é dita em voz alta, e explica os faltantes não bipados');
    prova(/não foi bipada — virou diferença/.test(texto),
      'a falta declarada se identifica como declarada');

    /* O que está certo fica RECOLHIDO. */
    const recolhidos = await pagina.locator('details.revisao-resumo').count();
    prova(recolhidos >= 2, 'o que não pede decisão fica em seções recolhidas');
    prova(await pagina.locator('details.revisao-resumo[open]').count() === 0,
      'e nenhuma delas abre sozinha disputando a atenção');

    /* O motivo está NA LINHA, não atrás de um clique. */
    const seletores = pagina.locator('.revisao-linha__motivo select');
    prova(await seletores.count() === 5, 'cada diferença tem o motivo na própria linha');

    const botao = pagina.getByRole('button', { name: /^Resolver / });
    prova(await botao.isDisabled(), 'sem seleção e sem motivo, não há o que resolver');
    await foto(pagina, 'conciliacao-4-revisao-desktop');

    /* ── o lote. */
    await pagina.locator('.revisao-todas input').first().check();
    await pagina.getByLabel('Aplicar um motivo a todas as selecionadas')
      .selectOption('nao_encontrada');
    await pagina.getByRole('button', { name: 'Aplicar aos selecionados' }).click();
    await pagina.waitForTimeout(250);
    prova(!(await botao.isDisabled()),
      'com motivo aplicado em lote, o botão de resolver libera');
    await foto(pagina, 'conciliacao-5-lote');
    await ctx.close();
  }

  /* ── 4. MOBILE — 390px, que é o telefone de quem conta de pé.
   *
   *  Cada trecho ganha uma PÁGINA nova, e não é zelo: `abrir` registra uma
   *  rota e um `addInitScript`, e reusá-la empilharia os dois. Pior, o
   *  `goto` para a MESMA URL com hash não renavega — a tela ficaria a de
   *  antes, e o roteiro estaria provando a página errada em silêncio. */
  const TELEFONE = {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true,
    hasTouch: true,
  };
  {
    const ctx = await navegador.newContext(TELEFONE);
    const pagina = await ctx.newPage();

    await abrir(pagina, { concluido: false });
    await pagina.locator('[aria-label="Progresso da conferência"]').waitFor({ timeout: 15000 });
    const rolagemH = await pagina.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    prova(rolagemH <= 1, `a contagem não cria rolagem horizontal no telefone (sobra ${rolagemH}px)`);
    await foto(pagina, 'conciliacao-6-contagem-mobile');
    await ctx.close();
  }

  {
    const ctx = await navegador.newContext(TELEFONE);
    const pagina = await ctx.newPage();
    await abrir(pagina, { concluido: true });
    await pagina.getByRole('button', { name: /Inventário #19/ }).first().click();
    await pagina.locator('.revisao').waitFor({ timeout: 15000 });
    const rolagemR = await pagina.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    prova(rolagemR <= 1, `a revisão não cria rolagem horizontal no telefone (sobra ${rolagemR}px)`);

    /* O alvo do seletor de motivo tem de continuar clicável com o polegar. */
    const caixa = await pagina.locator('.revisao-linha__motivo select').first().boundingBox();
    prova(caixa && caixa.height >= 32, `o seletor de motivo continua grande no telefone (${caixa?.height}px)`);
    await foto(pagina, 'conciliacao-7-revisao-mobile');
    await ctx.close();
  }
} finally {
  await navegador.close();
}

console.log(falhas
  ? `\n${falhas} falha(s) no QA visual da conciliação.`
  : '\nQA visual da conciliação: tudo no lugar, desktop e telefone.');
