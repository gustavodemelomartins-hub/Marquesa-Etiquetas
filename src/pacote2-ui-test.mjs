/** Pacote 2 — prova em navegador e evidência visual.
 *
 * Cobre os três começos de lançamento, o configurador canônico, cadastro
 * rápido por identidade, Clientes em quatro abas, prazo histórico versionado,
 * reparos, limpeza de Revendedoras e responsividade.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PAINEL = process.env.PAINEL_URL || 'http://localhost:8000/dashboard.html';
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';
const DESTINO = process.argv[2] || 'docs/baselines/pacote2-2026-09-07';
fs.mkdirSync(DESTINO, { recursive: true });

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));
const verdade = (t, x, detalhe = '') => (x ? ok(t, detalhe) : bad(t, detalhe));
const api = (m, p, b) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const CABECALHO = ['Nº', 'Data de Venda', 'Nome do Cliente', 'ID Produto Marquesa',
  'Nome Produto', 'Tipo ', 'Quantidade Vendida', 'Preço Unit. Venda', 'Desconto ',
  'Valor Total Venda', 'Forma de Pagamento', 'Status Pagamento', 'Observação Venda '];

console.log('\n=== 0. dados focados para Clientes ===');
const simone = await api('POST', '/api/vendas', {
  clienteNome: 'Simone Controle Pacote 2', data: '2026-09-06', pago: false,
  itens: [{ sku: '444032', qtd: 1 }],
});
eq('conta de controle criada', simone.status, 201);
eq('prazo da Simone preparado', (await api('PATCH', '/api/contas-receber/prazo', {
  chave: `venda:${simone.corpo.id}`, vencimentoEm: '2026-10-20',
})).status, 200);

const reparoVenda = await api('POST', '/api/vendas', {
  clienteNome: 'Cliente Reparo Pacote 2', data: '2026-09-05',
  itens: [{ sku: '251552', qtd: 1 }],
});
eq('compra para reparo criada', reparoVenda.status, 201);
eq('reparo pendente criado', (await api('POST', '/api/garantias', {
  vendaId: reparoVenda.corpo.id, sku: '251552',
  motivo: 'Fecho precisa de ajuste', dataEntrada: '2026-09-07',
})).status, 201);

const historico = await api('POST', '/api/vendas/historico/importar', {
  arquivo: 'pacote-2-prazo.xlsx',
  linhas: [CABECALHO,
    [1, '2026-08-28', 'Cliente Historica Pacote Dois', 'HIST-P2', 'Compra histórica P2',
      'Banhada', 1, 180, null, 180, null, 'NÃO PAGO', 'Grupo VIP P2']],
});
eq('histórico de prazo importado', historico.status, 201);
const classificacao = await api('POST', '/api/vendas/historico/operacoes', { operacoes: [{
  vendaChave: 'cliente historica pacote dois|2026-08-28', papel: 'cliente',
  cobrancaStatus: 'aberta', valorEfetivoCentavos: 18000,
  valorRecebidoFonteCentavos: 0, observacao: 'Grupo VIP P2',
}] });
eq('conta histórica classificada', classificacao.status, 200);
const contasAntes = await api('GET', '/api/contas-receber');
const contaHistorica = (contasAntes.corpo?.contas ?? []).find((c) => c.tipo === 'historico'
  && /Historica Pacote Dois/i.test(c.cliente || ''));
verdade('conta histórica está visível para a tela', !!contaHistorica);
const contaSimoneAntes = (contasAntes.corpo?.contas ?? []).find((c) => c.chave === `venda:${simone.corpo.id}`);
eq('controle da Simone começa intacto', contaSimoneAntes?.vencimentoEm, '2026-10-20');

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errosConsole = [];
const patchesPrazo = [];
page.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()); });
page.on('pageerror', (e) => errosConsole.push(`pageerror: ${e.message}`));
page.on('request', (r) => {
  if (r.method() === 'PATCH' && r.url().endsWith('/api/contas-receber/prazo')) {
    try { patchesPrazo.push(JSON.parse(r.postData() || '{}')); } catch { patchesPrazo.push({ invalido: true }); }
  }
});
await page.addInitScript(({ url, key }) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
}, { url: API, key: KEY });
await page.goto(PAINEL);
await page.waitForFunction(() => state && Array.isArray(state.produtos));

const irPara = async (aba, espera = 700) => {
  await page.evaluate((a) => switchTab(a), aba);
  await page.waitForTimeout(espera);
};
const semRolagemHorizontal = () => page.evaluate(() =>
  document.documentElement.scrollWidth <= innerWidth + 1);
const esperarToastSumir = async () => {
  // A troca de tela agenda carregamentos assíncronos; dê tempo para o toast
  // aparecer antes de concluir que a interface já está estável.
  await page.waitForTimeout(350);
  await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('show'), null,
    { timeout: 15000 });
  // O CSS ainda leva .3s para chegar a opacity:0 depois que `.show` sai.
  await page.waitForTimeout(500);
};

console.log('\n=== 1. Lançamentos começa pelas três operações ===');
await irPara('vendas', 1100);
eq('há exatamente três entradas de lançamento', await page.locator('#view-vendas .lanc-opcao').count(), 3);
eq('as três entradas têm os nomes operacionais',
  (await page.locator('#view-vendas .lanc-opcao .lo-t').allTextContents()).join('|'),
  'Venda normal|Monte seu Colar|Saída sem faturamento');
eq('Saídas não ocupa mais uma sub-aba paralela',
  (await page.locator('#tabsSubNav').innerText()).includes('Saídas sem faturamento'), false);
const textoLancamentos = await page.locator('#view-vendas').innerText();
eq('a faixa de contingência da Nuvemshop saiu', /contingência|Atualizar agora/i.test(textoLancamentos), false);

console.log('\n=== 2. configurador usa base, slots e preços confirmados ===');
await page.locator('#view-vendas .lanc-opcao', { hasText: 'Monte seu Colar' }).click();
await page.locator('#vendaOverlay.show .colar-box').waitFor();
eq('base fixa mostrada no modal', (await page.locator('.colar-linha input').first().inputValue()).startsWith('444032'), true);
eq('preço do casal nasce automático', await page.locator('.colar-linha input[type=number]').inputValue(), '129');
eq('preço fechado não é editável', await page.locator('.colar-linha input[type=number]').isDisabled(), true);
eq('casal tem duas posições', await page.locator('.colar-slot').count(), 2);
await esperarToastSumir();
await page.screenshot({ path: path.join(DESTINO, '01-lancamentos-monte-desktop.png'), fullPage: true });

await page.locator('.colar-linha select').selectOption('livre');
eq('livre começa com uma posição', await page.locator('.colar-slot').count(), 1);
eq('livre aceita valor manual', await page.locator('.colar-linha input[type=number]').isEnabled(), true);
eq('livre oferece adicionar posição', await page.locator('.colar-slot-acoes', { hasText: '+ posição' }).count(), 1);

console.log('\n=== 3. cadastro rápido cria e seleciona identidade real ===');
await page.locator('#vd-cliente').fill('Cliente Rapida Pacote Dois');
await page.locator('#vd-cliente-eco .lnk').waitFor();
await page.locator('#vd-cliente-eco .lnk').click();
await page.locator('#vd-cr-tel').fill('(14) 99999-2202');
await page.locator('#vd-cr-cidade').fill('Bauru');
await page.locator('#vd-cr-email').fill('pacote2@example.com');
await page.getByRole('button', { name: 'Cadastrar e selecionar' }).click();
await page.waitForFunction(() => vdClienteSelecionada && Number(vdClienteSelecionada.id) > 0);
const clienteRapidaId = await page.evaluate(() => vdClienteSelecionada.id);
verdade('a seleção guarda o id forte', Number(clienteRapidaId) > 0, String(clienteRapidaId));
const buscaRapida = await api('GET', '/api/clientes?busca=Cliente%20Rapida%20Pacote%20Dois&limite=10');
const clienteRapida = (buscaRapida.corpo ?? []).find((c) => Number(c.id) === Number(clienteRapidaId));
eq('telefone persistiu no cadastro', clienteRapida?.tel, '(14) 99999-2202');
eq('cidade persistiu no cadastro', clienteRapida?.cidade, 'Bauru');
const perfilRapida = await api('GET', `/api/clientes/perfil?id=${clienteRapidaId}`);
eq('e-mail persistiu na ficha completa', perfilRapida.corpo?.cadastro?.email, 'pacote2@example.com');
await page.evaluate(() => closeVenda());

console.log('\n=== 4. Clientes tem uma fonte e quatro leituras ===');
await irPara('clientes', 1500);
eq('as quatro abas internas aparecem',
  (await page.locator('#view-clientes [role=tab]').allTextContents()).map((s) => s.replace(/\s·\s\d+$/, '')).join('|'),
  'Top clientes|Todos os clientes|A receber|Reparos');
await page.locator('#view-clientes [role=tab]', { hasText: 'A receber' }).click();
const linhaHistorica = () => page.locator('#view-clientes .receber-linha', { hasText: 'Cliente Historica Pacote Dois' });
await linhaHistorica().waitFor();
verdade('conta histórica mostra origem e valor', /Grupo VIP P2/.test(await linhaHistorica().innerText())
  && /R\$\s*180/.test(await linhaHistorica().innerText()));
verdade('sem prazo tem prioridade explícita', /Sem prazo/.test(await linhaHistorica().innerText()));

await linhaHistorica().getByRole('button', { name: 'definir' }).click();
await linhaHistorica().locator('.cd-txt').fill('30/09/2026');
await linhaHistorica().getByRole('button', { name: 'Salvar' }).click();
await page.waitForFunction(() => document.querySelector('#view-clientes')?.textContent?.includes('30/09/2026'));
const corpoPrazo = patchesPrazo.find((p) => p.chave === contaHistorica.chave);
eq('a interface envia a versão esperada', corpoPrazo?.versaoEsperada, contaHistorica.versao);
eq('a interface envia a data futura', corpoPrazo?.vencimentoEm, '2026-09-30');

const contasDepois = await api('GET', '/api/contas-receber');
eq('prazo histórico persistiu no servidor',
  contasDepois.corpo.contas.find((c) => c.tipo === 'historico'
    && c.vendaChave === contaHistorica.vendaChave)?.vencimentoEm, '2026-09-30');
eq('prazo da Simone não foi alterado',
  contasDepois.corpo.contas.find((c) => c.chave === `venda:${simone.corpo.id}`)?.vencimentoEm, '2026-10-20');
await esperarToastSumir();
await page.screenshot({ path: path.join(DESTINO, '02-clientes-a-receber-desktop.png'), fullPage: true });

await page.reload();
await page.waitForFunction(() => state && Array.isArray(state.produtos));
await irPara('clientes', 1400);
await page.locator('#view-clientes [role=tab]', { hasText: 'A receber' }).click();
await linhaHistorica().waitFor();
verdade('prazo continua visível depois de recarregar', /30\/09\/2026/.test(await linhaHistorica().innerText()));

await page.locator('#view-clientes [role=tab]', { hasText: 'Reparos' }).click();
const telaReparos = await page.locator('#view-clientes').innerText();
verdade('reparo mostra cliente, entrada, prazo e dias', /Cliente Reparo Pacote 2/.test(telaReparos)
  && /entrada/.test(telaReparos) && /prazo/.test(telaReparos) && /dia útil/.test(telaReparos));
eq('lista de reparos não ganha rodapé genérico', await page.locator('#view-clientes .panel .foot').count(), 0);
await esperarToastSumir();
await page.screenshot({ path: path.join(DESTINO, '03-clientes-reparos-desktop.png'), fullPage: true });

console.log('\n=== 5. Revendedoras ficou sem repetições ===');
await irPara('revgeral', 900);
eq('há uma única ação Nova revendedora', await page.locator('#tabsSubNav .addtab').count(), 1);
eq('não há segunda ação solta no conteúdo',
  await page.locator('#view-revgeral button', { hasText: 'Nova revendedora' }).count(), 0);
const textoRev = await page.locator('#view-revgeral').innerText();
eq('faixa explicativa de resumo foi removida', /pelo tamanho da maleta de hoje/i.test(textoRev), false);
verdade('KPIs operacionais permanecem', /Peças com revendedoras/i.test(textoRev)
  && /Valor consignado/i.test(textoRev) && /Próximo acerto/i.test(textoRev));
await esperarToastSumir();
await page.screenshot({ path: path.join(DESTINO, '04-revendedoras-desktop.png'), fullPage: true });

console.log('\n=== 6. celular e console ===');
await page.setViewportSize({ width: 390, height: 844 });
await irPara('vendas', 750);
eq('Lançamentos não cria rolagem horizontal', await semRolagemHorizontal(), true);
eq('os três cartões empilham no celular',
  await page.locator('#view-vendas .lanc-opcoes').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length), 1);
await esperarToastSumir();
await page.screenshot({ path: path.join(DESTINO, '05-lancamentos-mobile.png'), fullPage: true });
await irPara('clientes', 1200);
await page.locator('#view-clientes [role=tab]', { hasText: 'A receber' }).click();
eq('Clientes não cria rolagem horizontal', await semRolagemHorizontal(), true);
await esperarToastSumir();
await page.screenshot({ path: path.join(DESTINO, '06-clientes-mobile.png'), fullPage: true });
eq('nenhum erro no navegador', errosConsole.length, 0);
if (errosConsole.length) errosConsole.slice(0, 8).forEach((e) => console.log(`    ${e}`));

await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : `\n✓ TUDO PASSOU · 6 capturas em ${DESTINO}`);
process.exit(falhas ? 1 : 0);
