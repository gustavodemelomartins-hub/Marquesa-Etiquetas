/** As telas de §29 a §32, num navegador de verdade.
 *
 *  O teste de API prova as regras. Este prova que elas CHEGAM à tela — e a
 *  distinção importa: o defeito do "lápis" e o do "Editar dados" eram
 *  exatamente isso, regra certa que não aparecia ou não voltava.
 *
 *  O que precisa ficar provado:
 *
 *   1. a sub-aba "Saídas sem faturamento" existe, navega e registra brinde,
 *      uso próprio e diferença de inventário — com o estoque baixando na
 *      tela e o faturamento parado;
 *   2. o estorno devolve a peça e a linha continua na lista, marcada;
 *   3. o modal de fechar venda tem OBSERVAÇÃO e PAGO/NÃO PAGO, e a tela diz
 *      para qual mês o dinheiro vai antes de confirmar;
 *   4. a venda não paga aparece como A RECEBER na lista do dia, com o botão
 *      de marcar o pagamento;
 *   5. o dia mostra também o que não é venda do sistema (§32);
 *   6. o Painel mostra "Peças em reparo" com dias úteis;
 *   7. o perfil da cliente abre garantia POR ITEM e mostra a linha do tempo;
 *   8. editar a cliente volta para a ficha DELA, com o histórico inteiro —
 *      o defeito de §12;
 *   9. o celular (390px) não gera rolagem horizontal em nenhuma tela nova;
 *  10. nenhum erro de console em nenhuma delas.
 *
 *      PAINEL_URL=http://localhost:8000/dashboard.html \
 *      API_URL=http://localhost:8787 node src/pacote-vendas-ui-test.mjs
 */
import { chromium } from 'playwright';

const PAINEL = process.env.PAINEL_URL || 'http://localhost:8000/dashboard.html';
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x) => (x ? ok(t) : bad(t));

const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const hoje = new Date().toISOString().slice(0, 10);
const SKU = 'UI-PACOTE-1';

console.log(`painel: ${PAINEL}\napi:    ${API}\n`);

console.log('=== 0. dados de partida ===');
{
  const r = await api('POST', '/api/produtos/importar', {
    produtos: [{ sku: SKU, desc: 'Anel de Teste UI', preco: 100, cat: 'Anéis', qtd: 30 }],
  });
  eq('catálogo pronto', r.status, 200);

  const v = await api('POST', '/api/vendas', {
    clienteNome: 'Cliente UI', itens: [{ sku: SKU, qtd: 1 }], pago: false,
  });
  eq('uma venda NÃO paga para a tela mostrar', v.status, 201);

  const s = await api('POST', '/api/saidas', {
    tipo: 'brinde', sku: SKU, qtd: 1, motivo: 'Dia das Mães',
  });
  eq('um brinde para a aba de saídas mostrar', s.status, 201);

  const g = await api('POST', '/api/garantias', {
    vendaId: v.corpo.id, sku: SKU, motivo: 'a pedra soltou',
  });
  eq('uma garantia para o Painel mostrar', g.status, 201);
}

const nav = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
const pg = await ctx.newPage();

const errosConsole = [];
pg.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()); });
pg.on('pageerror', (e) => errosConsole.push('pageerror: ' + e.message));

/* Conecta pelo formulário de verdade — é o caminho que ela percorre, e é o
   mesmo que `vendas-clientes-ui-test.mjs` já usa. */
await pg.goto(PAINEL, { waitUntil: 'networkidle' });
await pg.waitForTimeout(700);
await pg.fill('#cf-url', API);
await pg.fill('#cf-key', KEY);
await pg.click('#conexaoOverlay .btn-gold');
await pg.waitForTimeout(2500);
eq('conectou', await pg.locator('#conexaoOverlay').evaluate((e) => e.classList.contains('show')), 'false');

const irPara = async (aba) => {
  await pg.evaluate((a) => switchTab(a), aba);
  await pg.waitForTimeout(900);
};

console.log('\n=== 1. a sub-aba Saídas sem faturamento existe e navega ===');
{
  await irPara('vendas');
  const abas = await pg.$$eval('#tabsSubNav .tab', (bs) => bs.map((b) => b.textContent.trim()));
  verdade('a sub-aba aparece em Vendas', abas.some((a) => /Sa[íi]das sem faturamento/i.test(a)));

  await irPara('vendas-saidas');
  const visivel = await pg.$eval('#view-vendas-saidas', (e) => e.classList.contains('active'));
  verdade('a view fica ativa', visivel);
  const titulo = await pg.$eval('#view-vendas-saidas .head h2', (e) => e.textContent.trim())
    .catch(() => '');
  eq('com o título certo', titulo, 'Saídas sem faturamento');

  const linhas = await pg.$$eval('#view-vendas-saidas .invrow', (rs) => rs.length);
  verdade('e o brinde registrado aparece na lista', linhas >= 1);

  const texto = await pg.$eval('#view-vendas-saidas', (e) => e.textContent);
  verdade('a tela diz que não entra em faturamento', /n[ãa]o entram? em faturamento/i.test(texto)
    || /não são venda/i.test(texto));
}

console.log('\n=== 2. registrar uma saída pela tela baixa o estoque, e só ===');
{
  const antes = await api('GET', '/api/analytics/vendas?periodo=tudo');
  const st0 = await api('GET', '/api/state');
  const q0 = (st0.corpo.produtos ?? []).find((p) => p.sku === SKU)?.qtd;

  await pg.click('#view-vendas-saidas .btn-gold');
  await pg.waitForTimeout(400);
  verdade('o modal abre', await pg.$eval('#saidaOverlay', (e) => e.classList.contains('show')));

  await pg.selectOption('#sd-tipo', 'uso_proprio');
  await pg.fill('#sd-sku', SKU);
  await pg.fill('#sd-qtd', '2');
  await pg.fill('#sd-motivo', 'retirada pessoal');
  await pg.waitForTimeout(200);
  const eco = await pg.$eval('#sd-sku-eco', (e) => e.textContent);
  verdade('a tela confirma qual é a peça antes de confirmar', eco.includes('Anel de Teste UI'));

  await pg.click('#sdConfirm');
  await pg.waitForTimeout(1500);

  const st1 = await api('GET', '/api/state');
  const q1 = (st1.corpo.produtos ?? []).find((p) => p.sku === SKU)?.qtd;
  eq('o estoque baixou 2', q0 - q1, 2);

  const depois = await api('GET', '/api/analytics/vendas?periodo=tudo');
  eq('o faturamento não se moveu', depois.corpo.faturamento, antes.corpo.faturamento);
  eq('a contagem de vendas não se moveu', depois.corpo.vendas, antes.corpo.vendas);
}

console.log('\n=== 3. estornar devolve a peça e a linha continua na lista ===');
{
  const st0 = await api('GET', '/api/state');
  const q0 = (st0.corpo.produtos ?? []).find((p) => p.sku === SKU)?.qtd;

  pg.once('dialog', (d) => d.accept('lancei no código errado'));
  const botao = await pg.$('#view-vendas-saidas .invrow .btn-ghost');
  verdade('o botão de estornar existe', !!botao);
  await botao.click();
  await pg.waitForTimeout(1500);

  const st1 = await api('GET', '/api/state');
  const q1 = (st1.corpo.produtos ?? []).find((p) => p.sku === SKU)?.qtd;
  verdade('a peça voltou para o estoque', q1 > q0);

  const texto = await pg.$eval('#view-vendas-saidas', (e) => e.textContent);
  verdade('e a linha continua na lista, marcada como estornada', /estornada/i.test(texto));
}

console.log('\n=== 4. o modal de venda tem observação e situação do pagamento ===');
{
  await irPara('vendas');
  /* O modal de fechamento é montado pelo fluxo de bipagem. Montá-lo direto é
     o que permite testar os campos NOVOS sem reimplementar o leitor de
     código de barras dentro do teste. */
  await pg.evaluate((sku) => {
    /* `scan` é um `let` de topo do script: existe como global, mas NÃO como
       propriedade de `window` — atribuir `window.scan` criaria outra
       variável e a função continuaria lendo a original, nula. */
    // eslint-disable-next-line no-undef
    scan = { modo: 'venda', itens: { [sku]: 1 } };
    // eslint-disable-next-line no-undef
    return abrirFecharVenda();
  }, SKU);
  await pg.waitForTimeout(800);

  verdade('o campo de observação existe', !!(await pg.$('#vd-obs')));
  verdade('o seletor PAGO / NÃO PAGO existe', !!(await pg.$('#vd-pago-seg')));
  verdade('e a data do pagamento também', !!(await pg.$('#vd-data-pagto')));

  const ecoPago = await pg.$eval('#vd-pago-eco', (e) => e.textContent);
  verdade('a tela diz para qual data o faturamento vai', /faturamento/i.test(ecoPago));

  await pg.click('#vd-pago-nao');
  await pg.waitForTimeout(200);
  const ecoNao = await pg.$eval('#vd-pago-eco', (e) => e.textContent);
  verdade('e diz que NÃO PAGO vira A Receber', /A Receber/i.test(ecoNao));
  const escondido = await pg.$eval('#vd-pagto-campo', (e) => e.hidden);
  verdade('escondendo a data do pagamento, que ainda não existe', escondido);

  await pg.click('#vd-pago-sim');
  await pg.fill('#vd-obs', 'Feira');
  await pg.fill('#vd-cliente', 'Cliente UI');
  await pg.waitForTimeout(500);
  await pg.click('#vdConfirm');
  await pg.waitForTimeout(2000);

  const lista = await api('GET', `/api/vendas?data=${hoje}`);
  const ultima = (lista.corpo ?? []).filter((v) => v.observacao === 'Feira').pop();
  verdade('a observação foi gravada com a venda', !!ultima);
  eq('e a venda saiu paga', ultima?.pago, true);
}

console.log('\n=== 5. a venda não paga aparece como A RECEBER, com o botão ===');
{
  await irPara('vendas');
  const texto = await pg.$eval('#view-vendas', (e) => e.textContent);
  verdade('o selo A RECEBER aparece na lista', /A RECEBER/i.test(texto));
  verdade('o cartão de a receber do dia aparece', /A receber deste dia/i.test(texto));
  const botao = await pg.$$eval('#view-vendas button',
    (bs) => bs.some((b) => /Marcar pago/i.test(b.textContent)));
  verdade('e o botão de marcar o pagamento existe', botao);

  /* §32: o dia inteiro, não só as vendas do sistema. */
  verdade('o bloco do que mais aconteceu no dia aparece',
    /Tamb[ée]m aconteceu em/i.test(texto));
  verdade('dizendo o que entrou no caixa NESTE dia', /entrou no caixa/i.test(texto));
}

console.log('\n=== 6. o Painel mostra Peças em reparo com dias úteis ===');
{
  await irPara('vendas-painel');
  await pg.waitForTimeout(1500);
  const texto = await pg.$eval('#view-vendas-painel', (e) => e.textContent);
  verdade('o bloco existe', /Pe[çc]as em reparo/i.test(texto));
  verdade('com dias úteis decorridos', /dias? [úu]t(eis|il) decorridos?/i.test(texto));
  verdade('e com o prazo restante', /restantes? de 45|restante de 45/i.test(texto)
    || /45/.test(texto));
  verdade('e diz que sábado e domingo não contam', /S[áa]bado e domingo/i.test(texto));
  verdade('o bloco do que saiu sem ser venda aparece',
    /Saiu do estoque e n[ãa]o foi venda/i.test(texto));
}

console.log('\n=== 7. o perfil abre garantia POR ITEM e mostra a linha do tempo ===');
{
  await pg.evaluate(() => switchTab('cli:' + encodeURIComponent('cliente ui')));
  await pg.waitForTimeout(1800);
  const texto = await pg.$eval('#view-cliente', (e) => e.textContent);
  verdade('a ficha abre', /Hist[óo]rico de compras/i.test(texto));
  verdade('a garantia registrada aparece embaixo do item',
    /garantia registrada/i.test(texto));
  verdade('com o status dela', /Em reparo/i.test(texto));

  const botoes = await pg.$$eval('#view-cliente .tl-item .vd-lapis', (bs) => bs.length);
  verdade('cada item da compra tem o botão de registrar garantia', botoes >= 1);

  await pg.click('#view-cliente .tl-item .vd-lapis');
  await pg.waitForTimeout(600);
  verdade('o modal de garantia abre', await pg.$eval('#garOverlay', (e) => e.classList.contains('show')));
  const corpo = await pg.$eval('#garBody', (e) => e.textContent);
  verdade('já sabendo de qual peça é', corpo.includes(SKU));
  verdade('e quanto ela pagou por ela', /Valor efetivamente pago/i.test(corpo));
  verdade('dizendo o que a garantia NÃO faz',
    /n[ãa]o<\/b>? ?(altera|devolve|mexe)/i.test(corpo) || /não altera esta compra/i.test(corpo));
  await pg.click('#garOverlay .closebtn');
  await pg.waitForTimeout(300);
}

console.log('\n=== 8. §12: editar a cliente volta para a ficha DELA, inteira ===');
{
  await pg.evaluate(() => switchTab('cli:' + encodeURIComponent('cliente ui')));
  await pg.waitForTimeout(1500);
  const antes = await pg.$eval('#view-cliente', (e) => e.textContent);
  const gastouAntes = (antes.match(/Gastou/) || []).length;
  verdade('a ficha mostra o quanto ela gastou', gastouAntes >= 1);

  const perfil = await api('GET', '/api/clientes/perfil?norm=' + encodeURIComponent('cliente ui'));
  const idAntes = perfil.corpo.cadastro.id;
  const fatAntes = perfil.corpo.resumo.faturamento;
  const comprasAntes = perfil.corpo.resumo.vendas;

  await pg.click('#view-cliente .actbar .btn-ghost');
  await pg.waitForTimeout(900);
  verdade('o formulário de edição abre', await pg.$eval('#cliOverlay', (e) => e.classList.contains('show')));

  await pg.fill('#clf-nome', 'Cliente UI Renomeada');
  await pg.fill('#clf-obs', 'Cliente atendida pela minha mãe.');
  await pg.click('#cliSalvar');
  await pg.waitForTimeout(2200);

  /* A prova do defeito: depois de salvar, a tela tem que estar na FICHA
     dela — com o nome novo e o histórico inteiro. Antes da correção ela
     voltava para a lista, e reabrir pelo caminho antigo mostrava um perfil
     vazio: era isso que parecia "não salvou". */
  /* `tabAtual` é um `let` de topo: global, mas não é propriedade de
     `window`. Ler por `window.tabAtual` devolveria undefined e o teste
     falharia por engano — não porque a tela mudou de lugar. */
  // eslint-disable-next-line no-undef
  const ativa = await pg.evaluate(() => tabAtual);
  verdade('a tela ficou na ficha da cliente', String(ativa).startsWith('cli:'));

  const depois = await pg.$eval('#view-cliente', (e) => e.textContent);
  verdade('com o nome NOVO', depois.includes('Cliente UI Renomeada'));
  verdade('e com a observação salva', depois.includes('Cliente atendida pela minha mãe.'));
  verdade('o histórico de compras continua lá', /Hist[óo]rico de compras/i.test(depois));

  const perfil2 = await api('GET', '/api/clientes/perfil?norm=' + encodeURIComponent('cliente ui renomeada'));
  eq('mesmo cliente_id', perfil2.corpo.cadastro.id, idAntes);
  eq('mesmo faturamento', perfil2.corpo.resumo.faturamento, fatAntes);
  eq('mesmas compras', perfil2.corpo.resumo.vendas, comprasAntes);
  verdade('e as garantias vieram junto', (perfil2.corpo.garantias ?? []).length >= 1);
}

console.log('\n=== 9. no celular, nenhuma tela nova rola para o lado ===');
{
  const cel = await ctx.newPage();
  const errosCel = [];
  cel.on('console', (m) => { if (m.type() === 'error') errosCel.push(m.text()); });
  cel.on('pageerror', (e) => errosCel.push('pageerror: ' + e.message));
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.goto(PAINEL, { waitUntil: 'networkidle' });
  await cel.waitForTimeout(700);
  /* A conexão fica no localStorage do contexto, e a aba do desktop já a
     gravou — o modal não aparece de novo. Preencher só quando ele estiver
     aberto é o que faz este teste rodar tanto sozinho quanto em sequência. */
  if (await cel.$eval('#conexaoOverlay', (e) => e.classList.contains('show')).catch(() => false)) {
    await cel.fill('#cf-url', API);
    await cel.fill('#cf-key', KEY);
    await cel.click('#conexaoOverlay .btn-gold');
    await cel.waitForTimeout(2500);
  }

  for (const aba of ['vendas', 'vendas-saidas', 'vendas-painel']) {
    await cel.evaluate((a) => switchTab(a), aba);
    await cel.waitForTimeout(1200);
    const rola = await cel.evaluate(() => document.documentElement.scrollWidth
      > document.documentElement.clientWidth + 1);
    verdade(`${aba} cabe em 390px`, !rola);
  }
  eq('sem erro de console no celular', errosCel.length, 0, errosCel.join(' · '));
  await cel.close();
}

console.log('\n=== 10. nenhum erro de console ===');
{
  const relevantes = errosConsole.filter((e) => !/favicon|manifest|sw\.js/i.test(e));
  eq('console limpo', relevantes.length, 0);
  if (relevantes.length) relevantes.slice(0, 5).forEach((e) => console.log('    ' + e));
}

await nav.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\ntudo ok\n');
process.exit(falhas ? 1 : 0);
