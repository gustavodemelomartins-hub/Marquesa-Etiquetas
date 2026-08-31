import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* as fixturas moram ao lado deste arquivo — o teste roda de qualquer pasta */
const AQUI = path.dirname(fileURLToPath(import.meta.url));

const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, extra = '') => console.log(`  ok   ${t}${extra ? '  → ' + extra : ''}`);
const bad = (t, extra = '') => { falhas++; console.log(`  FALHA ${t}${extra ? '  → ' + extra : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

/* O navegador vem de PW_CHROMIUM quando essa variável existe (é como a
   máquina de origem apontava para /opt/pw-browsers/chromium); sem ela, vale
   o Chromium que o próprio Playwright instalou — o caminho normal no
   Windows e no macOS. Caminho fixo no código deixava o teste rodando num
   sistema operacional só. */
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();

const erros = [];
let vigiando = false;   /* o 401 da chave errada é de propósito, não conta */
page.on('console', m => { if (vigiando && m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', e => erros.push('pageerror: ' + e.message));
page.on('dialog', d => d.accept('Revendedora Teste'));

const st = () => page.evaluate(() => state);

console.log('\n=== portal de conexão ===');
await page.goto(URL_APP);
await page.waitForTimeout(600);
eq('a tela de conexão aparece sozinha',
  await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show')), 'true');

await page.fill('#cf-url', URL_API);
await page.fill('#cf-key', 'chave-errada');
await page.click('#conexaoOverlay .btn-gold');
await page.waitForTimeout(900);
eq('chave errada é recusada com aviso', await page.textContent('#cf-fb'), 'Chave incorreta.');
eq('e não deixa entrar',
  await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show')), 'true');

await page.fill('#cf-key', KEY);
await page.click('#conexaoOverlay .btn-gold');
await page.waitForTimeout(1200);
eq('chave certa conecta',
  await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show')), 'false');
vigiando = true;

console.log('\n=== importar catálogo (planilha fictícia) ===');
/* O caminho passou a ter dois atos. A planilha de estoque total NÃO cria
   peça — num sistema vazio, os 4 códigos dela caem inteiros no grupo
   "produtos novos", e o cadastro é o outro fluxo, em lote. */
await page.evaluate(() => openImport());
await page.setInputFiles('#impFile', path.join(AQUI, 'catalogo-fake.xlsx'));
await page.waitForTimeout(900);
eq('a aba Estoque foi reconhecida como catálogo',
  await page.locator('#impAlvo0').inputValue(), 'catalogo');
await page.click('#impStep2 .btn-gold');           // Analisar planilha
await page.waitForTimeout(1500);

eq('a análise apareceu sem aplicar nada',
  await page.locator('#impStep3').isVisible(), 'true');
eq('e ela não criou produto nenhum', (await st()).produtos.length, 0);
const analise = await page.evaluate(() => impAnalise.resumo);
eq('os 4 códigos entraram como produtos novos', analise.novos, 4);
eq('nenhuma quantidade a mudar num sistema vazio', analise.vaoMudar, 0);
eq('e nada foi para revisão', analise.revisao, 0);

/* "Revisar produtos novos" guarda os códigos na fila e abre o cadastro em
   lote já com eles — sem reimportar o arquivo. */
await page.click('#impStep3 .w-act .btn');
await page.waitForTimeout(1500);
eq('o cadastro em lote abriu',
  await page.locator('#novasOverlay').evaluate(e => e.classList.contains('show')), 'true');
const lote = await page.evaluate(() => novasAnalise.resumo);
eq('os 4 estão prontos para cadastrar de uma vez', lote.prontos, 4);
eq('e um deles entra sem preço, sem virar exceção', lote.semPreco, 1);

await page.click('#novasBody .mfoot .btn-gold');   // Cadastrar todos os válidos
await page.waitForTimeout(2000);

let s = await st();
eq('4 códigos no catálogo (o sufixo -2 somou no base)', s.produtos.length, 4);
eq('900001 ficou com 13 peças (10 + 3 do sufixo)',
  s.produtos.find(p => p.sku === '900001').qtd, 13);
eq('900004 entrou sem preço, não com R$ 0',
  s.produtos.find(p => p.sku === '900004').preco, 'null');
/* O total de peças saiu do cabeçalho e passou a ser o primeiro indicador da
   Visão Geral — o cabeçalho agora só identifica onde você está. A leitura
   troca de aba, lê e volta para onde estava, para não mexer no passo
   seguinte do roteiro. */
async function totalNaTela() {
  const antes = await page.evaluate(() => tabAtual);
  await page.evaluate(() => switchTab('geral'));
  await page.waitForSelector('#view-geral.active .kpis .k-num');
  const v = (await page.textContent('#view-geral .kpis .kpi .k-num')).trim();
  if (antes !== 'geral') await page.evaluate(t => switchTab(t), antes);
  return v;
}

eq('a Visão Geral mostra o total', await totalNaTela(), '38');

console.log('\n=== revendedora pela tela ===');
await page.evaluate(() => openRevForm());
await page.fill('#rf-nome', 'Revendedora Teste');
await page.fill('#rf-cidade', 'Cidade Teste');
await page.click('#revOverlay .btn-gold');
await page.waitForTimeout(1200);
s = await st();
eq('revendedora criada', s.revendedoras.length, 1);
eq('nasce ativa', s.revendedoras[0].status, 'ativa');
const revId = s.revendedoras[0].id;

console.log('\n=== montar maleta bipando ===');
await page.evaluate(rid => novaMaleta(rid), revId);
await page.waitForTimeout(1200);
eq('abriu a tela de bipagem',
  await page.locator('#scanOverlay').evaluate(e => e.classList.contains('show')), 'true');

for (const code of ['900001', '900001', '900002', '900002', '900003', '900003']) {
  await page.fill('#scanInput', code);
  await page.press('#scanInput', 'Enter');
  await page.waitForTimeout(120);
}
eq('a bipagem contou 6 peças', await page.textContent('#scanQtd'), '6');

await page.fill('#scanInput', '999999');
await page.press('#scanInput', 'Enter');
await page.waitForTimeout(250);
eq('código fora do catálogo é recusado na hora', await page.textContent('#scanQtd'), '6');

await page.click('#scanConfirm');
await page.waitForTimeout(2000);
s = await st();
const mal = s.maletas.find(m => m.revId === revId && (m.status === 'aberta' || m.status === 'em_acerto'));
eq('a maleta guardou 6 peças',
  Object.values(mal.itens).reduce((a, b) => a + b, 0), 6);
eq('o preço do envio ficou congelado', mal.precos['900001'], 500);
eq('consignar não muda o total da operação', await totalNaTela(), '38');
eq('900001: 13 no total, 2 fora',
  s.produtos.find(p => p.sku === '900001').consignado, 2);

console.log('\n=== acerto ===');
await page.evaluate(id => openAcerto(id), mal.id);
await page.waitForTimeout(500);
for (const code of ['900001', '900002', '900003']) {
  await page.fill('#scanInput', code);
  await page.press('#scanInput', 'Enter');
  await page.waitForTimeout(120);
}
await page.click('#scanConfirm');
await page.waitForTimeout(900);

const preview = await page.evaluate(() => {
  acerto.faltas.forEach((f, i) => f.linhas.forEach((l, j) => acSetDestino(i, j, 'vendida')));
  const m = state.maletas.find(x => x.id === acerto.maletaId);
  const vend = [];
  acerto.faltas.forEach(f => f.linhas.forEach(l => { if (l.destino === 'vendida' && l.qtd > 0) vend.push({ sku: f.sku, qtd: l.qtd }); }));
  return calcComissao(vend, m);
});
// banhadas = 500 + 400 = 900 → faixa até 1000 = 15%; prata 200 → 10% fixo
eq('faixa sai só das banhadas (900 → 15%)', preview.pct, 15);
eq('total vendido inclui a prata', preview.totalVendido, 1100);
eq('comissão = 135 (banhadas) + 20 (prata)', preview.comissao, 155);
eq('líquido a receber', preview.liquido, 945);

await page.evaluate(() => confirmarAcerto());
await page.waitForTimeout(2500);
s = await st();
const enc = s.maletas.find(m => m.id === mal.id);
eq('a maleta foi encerrada', enc.status, 'encerrada');
eq('o servidor concorda com a prévia da comissão', enc.acerto.comissao, 155);
eq('e com o líquido', enc.acerto.liquido, 945);
eq('as vendidas saíram do estoque total (38 − 3)', await totalNaTela(), '35');
eq('as devolvidas voltaram: nada mais consignado',
  s.produtos.reduce((a, p) => a + p.consignado, 0), 0);

console.log('\n=== recarregar a página (outro aparelho) ===');
await page.reload();
await page.waitForTimeout(2000);
eq('não pede a chave de novo',
  await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show')), 'false');
s = await st();
eq('os produtos continuam lá', s.produtos.length, 4);
eq('a revendedora continua lá', s.revendedoras.length, 1);
eq('o acerto continua registrado',
  s.maletas.find(m => m.id === mal.id).acerto.comissao, 155);
eq('o total bate com o de antes de recarregar', await totalNaTela(), '35');

console.log('\n=== a razão fecha (§19) ===');
const conf = await fetch(URL_API + '/api/estoque/conferir', {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
eq('saldo bate com a soma dos movimentos em todo SKU', conf.divergentes.length, 0);

const vendas = await fetch(URL_API + '/api/vendas?data=' + new Date().toISOString().slice(0, 10), {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
eq('o acerto virou venda de verdade', vendas.filter(v => v.origem === 'acerto').length, 1);

console.log('\n=== venda de balcão ===');
/* estoque depois do acerto: 900001 tem 12, 900002 tem 9, 900003 tem 9 */
await page.evaluate(() => switchTab('vendas'));
await page.waitForTimeout(900);
await page.evaluate(() => novaVenda());
await page.waitForTimeout(400);
eq('a bipagem abriu em modo venda', await page.textContent('#scanTitle'), 'Nova venda');

await page.fill('#scanInput', '900004');   // peça sem preço
await page.press('#scanInput', 'Enter');
await page.waitForTimeout(250);
eq('peça sem preço é barrada na bipagem, não na hora de salvar',
  await page.textContent('#scanQtd'), '0');

for (const code of ['900001', '900001', '900003']) {
  await page.fill('#scanInput', code);
  await page.press('#scanInput', 'Enter');
  await page.waitForTimeout(120);
}
eq('carrinho com 3 peças', await page.textContent('#scanQtd'), '3');
eq('e o valor somado', await page.textContent('#scanVal'), '1200,00');

await page.click('#scanConfirm');
await page.waitForTimeout(500);
eq('pede a cliente antes de gravar',
  await page.locator('#vendaOverlay').evaluate(e => e.classList.contains('show')), 'true');
/* O autocompletar de cliente, dentro do modal de verdade.

   Ele carregava as 50 primeiras clientes em ordem alfabética, UMA vez ao
   abrir, e nunca mais consultava o servidor: com a base cheia, quem vem
   depois do "C" não aparecia, e a venda abria um cadastro novo ao lado do
   antigo. Agora a tela pergunta enquanto se digita.

   E o campo diz, ANTES de confirmar, para onde a venda vai — cliente
   conhecida ou cadastro novo. */
/* ─── §27: o lápis, o desconto numa peça só, e o motivo obrigatório
 *
 * A planilha dela sempre teve coluna Desconto; a venda de balcão não tinha
 * nada — o servidor descartava qualquer preço da tela e gravava o do
 * catálogo. A venda entrava pelo preço cheio e o faturamento nascia acima
 * do que entrou no caixa. */
const precoTabela = await page.evaluate(() => scan.vendaLinhas[0].preco);
const qtdDaLinha = await page.evaluate(() => scan.vendaLinhas[0].q);
await page.click('.scanrow .vd-lapis');
await page.waitForTimeout(250);
eq('o lápis abre o preço daquela peça',
  await page.locator('#vd-preco-0').isVisible(), 'true');
eq('já preenchido com o de tabela',
  await page.locator('#vd-preco-0').inputValue(), precoTabela.toFixed(2));

/* A recusa acontece NA TELA, antes de sair para o servidor: ela descobre o
   que falta com a peça na mão, e não depois de um 409. */
await page.fill('#vd-preco-0', '10.00');
await page.click('.vd-editor .btn-gold');
await page.waitForTimeout(250);
eq('preço diferente SEM motivo é recusado aqui mesmo',
  /motivo/i.test(await page.textContent('#vd-erro-0')), 'true');
eq('e o preço continua o de tabela',
  await page.evaluate(() => scan.vendaLinhas[0].precoFinal), 'null');

await page.selectOption('#vd-motivo-0', 'Grupo VIP');
await page.click('.vd-editor .btn-gold');
await page.waitForTimeout(250);
eq('com o motivo, o preço passa',
  await page.evaluate(() => scan.vendaLinhas[0].precoFinal), 10);
eq('a linha mostra o motivo, antes de confirmar',
  await page.textContent('.vd-tag'), 'Grupo VIP');
eq('e o resumo anuncia o desconto',
  /Desconto/.test(await page.textContent('#vd-resumo')), 'true');

/* §28: o campo de data. `max` é hoje — venda futura é erro de digitação, e
   a tela nem oferece. */
eq('a venda vem datada de hoje por padrão',
  await page.locator('#vd-data').inputValue(), new Date().toISOString().slice(0, 10));
eq('e não deixa escolher dia futuro',
  await page.locator('#vd-data').getAttribute('max'), new Date().toISOString().slice(0, 10));

await page.fill('#vd-cliente', 'Cliente Teste');
await page.waitForTimeout(700);
eq('o campo avisa que é cadastro novo',
  /ainda não está cadastrada/i.test(await page.textContent('#vd-cliente-eco')), 'true');
await page.click('#vdConfirm');
await page.waitForTimeout(2000);

s = await st();
eq('a venda tirou as 3 peças do estoque (35 − 3)', await totalNaTela(), '32');
const vs = await fetch(URL_API + '/api/vendas?data=' + new Date().toISOString().slice(0, 10), {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
const balcao = vs.find(v => v.origem === 'balcao');
eq('a venda de balcão foi registrada', balcao.clienteNome, 'Cliente Teste');
/* O total é o COBRADO, não o de tabela: 1200 menos o abatimento da linha
   que ela editou. É esta linha que prova que o desconto atravessou a tela,
   o servidor e o banco sem se perder no caminho. */
eq('o total é o cobrado, não o de tabela',
  balcao.total, 1200 - (precoTabela - 10) * qtdDaLinha);
const comDesconto = balcao.itens.find(i => i.descontoRotulo);
eq('o motivo chegou ao banco', comDesconto && comDesconto.descontoRotulo, 'Grupo VIP');
eq('com o preço de tabela preservado', comDesconto && comDesconto.precoTabela, precoTabela);
eq('o preço cobrado', comDesconto && comDesconto.preco, 10);
eq('e o abatimento derivado, não digitado',
  comDesconto && comDesconto.descontoValor, precoTabela - 10);
eq('a outra peça continua sem desconto nenhum',
  balcao.itens.filter(i => i.descontoRotulo).length, 1);

/* A chave de agrupamento é gravada NA VENDA, e não só na próxima
   importação de planilha. Sem ela a venda de hoje ficava fora da ficha da
   cliente até alguém importar alguma coisa. */
const vendaNorm = await fetch(URL_API + '/api/clientes/perfil?norm=cliente%20teste', {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
eq('a venda já responde pelo nome normalizado', vendaNorm.ok !== false, 'true');
eq('e traz a compra que acabou de acontecer', (vendaNorm.vendas || []).length >= 1, 'true');

/* segunda venda para a MESMA cliente: agora ela já está cadastrada, e o
   campo tem de reconhecê-la em vez de propor um cadastro novo */
await page.evaluate(() => switchTab('vendas'));
await page.waitForTimeout(600);
await page.evaluate(() => novaVenda());
await page.waitForTimeout(400);
await page.fill('#scanInput', '900001');
await page.press('#scanInput', 'Enter');
await page.waitForTimeout(250);
await page.click('#scanConfirm');
await page.waitForTimeout(600);
await page.fill('#vd-cliente', 'cliente teste');
await page.waitForTimeout(900);
eq('o autocompletar traz a cliente já cadastrada',
  await page.evaluate(() => [...document.querySelectorAll('#vd-clientes option')]
    .some(o => /Cliente Teste/i.test(o.value))), 'true');
eq('e o campo diz que a venda vai para a ficha dela',
  /Vai para a ficha de/i.test(await page.textContent('#vd-cliente-eco')), 'true');
eq('mesmo escrito sem maiúscula — acento e caixa não separam pessoas',
  await page.evaluate(() => !!clienteEscolhidaNaVenda('cliente teste')), 'true');

/* §28: a venda do sábado, lançada na segunda.
 *
 * A lista de vendas é filtrada por DIA. Registrar a venda de ontem e cair
 * na lista de hoje faria a venda parecer não ter entrado — e é exatamente
 * ali que ela iria procurar o botão de cancelar se tivesse errado. */
const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
await page.fill('#vd-data', ontem);
await page.evaluate(() => ecoDataVenda());
await page.waitForTimeout(200);
eq('a tela avisa, por extenso, que não é hoje',
  /não é hoje/i.test(await page.textContent('#vd-data-eco')), 'true');
await page.click('#vdConfirm');
await page.waitForTimeout(2000);

eq('a lista de vendas foi para o DIA da venda, não ficou em hoje',
  await page.evaluate(() => vendasData), ontem);
const deOntem = await fetch(URL_API + '/api/vendas?data=' + ontem, {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
eq('e a venda está lá, com a data de ontem', deOntem.length, 1);
eq('o movimento diz de que dia é a venda', await fetch(
  URL_API + '/api/estoque/900001/movimentos', { headers: { Authorization: 'Bearer ' + KEY } })
  .then(r => r.json())
  .then(h => (h.movimentos || []).some(m => (m.obs || '').includes(`venda de ${ontem}`))), 'true');

/* e a venda lançada por engano se cancela, com as peças voltando */
const antesDoCancelamento = await totalNaTela();
await page.evaluate((id) => cancelarVenda(id), deOntem[0].id);
await page.waitForTimeout(1800);
await page.evaluate(() => sincronizar());
await page.waitForTimeout(1200);
eq('cancelar devolve a peça ao estoque',
  Number((await totalNaTela()).replace(/\D/g, '')),
  Number(antesDoCancelamento.replace(/\D/g, '')) + 1);

await page.evaluate(() => { const o = document.getElementById('scanOverlay');
  if (o) o.classList.remove('show'); });
await page.waitForTimeout(300);

console.log('\n=== inventário ===');
await page.evaluate(() => switchTab('geral'));
await page.waitForTimeout(500);
await page.evaluate(() => iniciarInventario());
await page.waitForTimeout(1500);
eq('a bipagem abriu em modo inventário', await page.textContent('#scanTitle'), 'Inventário');

/* em casa agora: 900001 tem 10, 900002 tem 9, 900003 tem 8, 900004 tem 5.
   Conto 900001 certo, 900002 a menos, 900003 a mais, e bipo um código de fora. */
const contagem = [
  ...Array(10).fill('900001'),
  ...Array(7).fill('900002'),
  ...Array(9).fill('900003'),
  '777777',
];
for (const code of contagem) {
  await page.fill('#scanInput', code);
  await page.press('#scanInput', 'Enter');
  await page.waitForTimeout(60);
}
eq('contou 26 peças', await page.textContent('#scanQtd'), '26');

await page.click('#scanConfirm');
await page.waitForTimeout(2500);
eq('abriu o resultado',
  await page.locator('#invOverlay').evaluate(e => e.classList.contains('show')), 'true');

const res = await page.evaluate(() => ({
  conferidos: invResultado.conferidos,
  faltando: invResultado.faltando.map(l => [l.sku, l.contado, l.esperado, l.sugestao]),
  sobrando: invResultado.sobrando.map(l => [l.sku, l.contado, l.esperado, l.sugestao]),
  desconhecidos: invResultado.desconhecidos,
}));
eq('900001 bateu certo', res.conferidos, 1);
eq('900002 e 900004 aparecem como faltando', res.faltando.length, 2);
eq('900002: contou 7, sistema dizia 9', JSON.stringify(res.faltando.find(f => f[0] === '900002')), '["900002",7,9,-2]');
eq('900003 aparece como sobrando', JSON.stringify(res.sobrando), '[["900003",9,8,1]]');
eq('o código de fora do catálogo foi anotado, não descartado',
  JSON.stringify(res.desconhecidos), '["777777"]');

eq('concluir NÃO mexeu no estoque', await totalNaTela(), '32');

await page.evaluate(() => aplicarAjuste('900002', -2));
await page.waitForTimeout(1800);
eq('só o ajuste confirmado entrou (32 − 2)', await totalNaTela(), '30');
s = await st();
eq('900003 continua intocado, porque não foi confirmado',
  s.produtos.find(p => p.sku === '900003').qtd, 8);

const hist = await fetch(URL_API + '/api/estoque/900002/movimentos', {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
const aj = hist.movimentos.find(m => m.tipo === 'ajuste');
eq('o ajuste virou movimentação com origem inventário', aj.origem, 'inventario');
ok('e o motivo ficou escrito', aj.obs);

const conf2 = await fetch(URL_API + '/api/estoque/conferir', {
  headers: { Authorization: 'Bearer ' + KEY },
}).then(r => r.json());
eq('a razão continua fechando depois do ajuste', conf2.divergentes.length, 0);

console.log('\n=== leitor de código de barras (o caminho do iPhone) ===');
/* Gera uma etiqueta igual à que o app de etiquetas imprime e manda o leitor
   decodificar. Sem isto, "funciona no iPhone" seria só uma esperança: o
   Safari não tem BarcodeDetector, então quem lê lá é o ZXing — e é
   exatamente esse caminho que o teste força, apagando o leitor nativo. */
await page.goto('http://localhost:8000/index.html');
await page.waitForTimeout(400);
const etiquetaReal = await page.evaluate(() => {
  const cv = document.createElement('canvas');
  JsBarcode(cv, '900001', { format: 'CODE128', width: 3, height: 90, displayValue: false, margin: 18 });
  return cv.toDataURL('image/png');
});
eq('o app de etiquetas gerou a imagem do código', etiquetaReal.startsWith('data:image/png'), 'true');

await page.goto(URL_APP);
await page.waitForTimeout(1500);

const leitura = await page.evaluate(async png => {
  delete window.BarcodeDetector;          // força o caminho do iPhone
  const ler = await montarLeitor();
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = png; });

  /* Monta um quadro como a câmera entrega: a etiqueta pequena no meio de
     uma cena grande, e não a imagem do código ocupando a tela inteira.
     Testar com a imagem crua esconde justamente o que quebrava na mão dela. */
  const quadro = (rot = 0, escala = 1.2) => {
    const cv = document.createElement('canvas');
    cv.width = 1920; cv.height = 1080;
    const c = cv.getContext('2d');
    c.fillStyle = '#cfc9c4'; c.fillRect(0, 0, 1920, 1080);
    const w = img.width * escala, h = img.height * escala;
    c.save(); c.translate(960, 540);
    if (rot) c.rotate(rot * Math.PI / 180);
    c.fillStyle = '#fff'; c.fillRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16);
    c.drawImage(img, -w / 2, -h / 2, w, h);
    c.restore();
    return cv;
  };

  const cru = document.createElement('canvas');
  cru.width = img.width; cru.height = img.height;
  cru.getContext('2d').drawImage(img, 0, 0);

  return {
    zxing: !!window.ZXing,
    cru: await ler(cru),
    reta: await ler(quadro(0)),
    emPe: await ler(quadro(90)),
    deCabecaParaBaixo: await ler(quadro(180)),
    longe: await ler(quadro(0, 0.55)),
  };
}, etiquetaReal);

eq('o ZXing foi baixado do arquivo separado', leitura.zxing, 'true');
eq('leu a etiqueta impressa pelo app', leitura.cru, '900001');
eq('leu num quadro de câmera, com a etiqueta pequena no meio', leitura.reta, '900001');
/* etiqueta de bijuteria quase sempre cai deitada no quadro com o celular em pé */
eq('leu a etiqueta em pé (90°)', leitura.emPe, '900001');
eq('leu de cabeça para baixo', leitura.deCabecaParaBaixo, '900001');
eq('leu com a peça mais longe', leitura.longe, '900001');

const semCodigo = await page.evaluate(async () => {
  const ler = await montarLeitor();
  const cv = document.createElement('canvas');
  cv.width = 300; cv.height = 200;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 300, 200);
  /* três vezes: a mira só é tentada em quadros alternados, então uma
     chamada só não passaria por todos os caminhos do leitor */
  return JSON.stringify([await ler(cv), await ler(cv), await ler(cv)]);
});
eq('imagem sem código nenhum devolve nada, em vez de inventar',
  semCodigo, '[null,null,null]');

/* O ZXing tentava TODOS os formatos porque as configurações eram apagadas a
   cada decode — ver o comentário em montarLeitor. Sem restrição ele gasta
   tempo com QR, Aztec e PDF417 e perde o TRY_HARDER que lê a etiqueta
   girada. Esta é a prova de que a restrição está valendo. */
const formatos = await page.evaluate(async () => {
  const Z = window.ZXing;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128]);
  const r = new Z.MultiFormatReader();
  r.setHints(hints);
  const antes = r.readers.length;
  try { r.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(
    new Z.HTMLCanvasElementLuminanceSource(document.createElement('canvas'))))); } catch (e) {}
  return { antes, depois: r.readers.length };
});
eq('decode sem hints REDEFINE os formatos (por isso eles vão em toda chamada)',
  formatos.depois > formatos.antes, 'true');

console.log('\n=== erros de console ===');
if (erros.length) { erros.forEach(e => console.log('  ! ' + e)); bad(`${erros.length} erro(s) no console`); }
else ok('nenhum erro no console do navegador');

await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)\n` : '\n✓ TUDO PASSOU\n');
process.exit(falhas ? 1 : 0);
