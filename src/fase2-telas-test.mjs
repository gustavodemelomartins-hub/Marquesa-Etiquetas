/** FASE 2 — as telas que faltavam para a decisão ser humana.
 *
 *  A FASE 1 ensinou o motor a PARAR quando não sabe: variação sem
 *  `variant_id` mapeado não é escrita na loja, ponto. O efeito colateral
 *  disso é que ela criou uma fila — 10 códigos parados esperando alguém
 *  dizer quantas peças são de cada cor — e uma fila sem tela é uma dívida,
 *  não uma proteção.
 *
 *  Este teste prova as telas dessa fase, na ordem dos 18 itens obrigatórios:
 *
 *    1–7   a distribuição em Pendências, e o que ela recusa
 *    8–10  cadastro sem variação, com um atributo e com dois
 *    11–12 SKU duplicado e SKU gerado
 *    13–14 exclusão de peça sem histórico × arquivamento de peça com
 *    15    exclusão múltipla de etiquetas
 *    16    Importar Estoque Total sem os seletores antigos
 *    17    a mesma tela num celular
 *    18    regressão: o que continua sem ser escrito na loja
 *
 *  O que ele NÃO prova, e é de propósito: nada aqui escreve na Nuvemshop.
 *  A loja falsa está no ar só para o catálogo existir — o número de
 *  requisições de escrita que chegam nela é, ele mesmo, uma asserção.
 */
import { chromium } from 'playwright';
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(async r => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const corpo = async (m, p, b) => (await api(m, p, b)).corpo;
const prod = async sku => (await corpo('GET', '/api/state')).produtos.find(p => p.sku === sku);

/* 1×1 transparente, para a foto do cartão existir sem sair para a rede. */
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const loja = await subirLojaFalsa();

/* ------------------------------------------------------------- o cenário
   Quatro peças, cada uma pelo motivo que ela prova:

     ANELB     3 variantes na loja e 6 peças aqui — é o `sem_reparticao`
               de verdade, o caso dos 10 códigos parados em produção
     PULSEIRA  sem variação nenhuma; nada nesta fase pode atrapalhá-la
     DESCARTE  cadastrada e nunca usada — a peça de teste que entulha a
               lista, e o único caso em que apagar não perde nada
     VENDIDA   tem venda registrada — apagar levaria junto o faturamento */
await corpo('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'ANELB', desc: 'Anel Banho e Pedra', cat: 'Anel', preco: 120, qtd: 6 },
    { sku: 'PULSEIRA', desc: 'Pulseira lisa', cat: 'Pulseira', preco: 60, qtd: 4 },
    { sku: 'DESCARTE', desc: 'Peca de teste', cat: 'Outros', preco: 10, qtd: 2 },
    { sku: 'VENDIDA', desc: 'Colar que ja vendeu', cat: 'Colar', preco: 90, qtd: 5 },
  ],
});
await corpo('POST', '/api/vendas', { clienteNome: 'Teste', itens: [{ sku: 'VENDIDA', qtd: 1 }] });

loja.estado.produtos = [
  {
    id: 30, name: { pt: 'Anel Banho e Pedra' }, handle: { pt: 'anel-banho' }, published: true,
    attributes: [{ pt: 'Banho' }, { pt: 'Pedra' }],
    /* Imagem embutida: uma URL de mentira faria o navegador registrar um
       erro de rede, e este teste trata erro de console como falha. */
    images: [{ id: 3000, src: PIXEL, position: 1 }],
    variants: [
      { id: 301, sku: 'ANELB', values: [{ pt: 'Dourado' }, { pt: 'Zircônia' }], price: '120.00',
        image_id: 3000, inventory_levels: [{ location_id: 'L1', stock: 2 }] },
      { id: 302, sku: 'ANELB', values: [{ pt: 'Dourado' }, { pt: 'Cristal' }], price: '130.00',
        image_id: 3000, inventory_levels: [{ location_id: 'L1', stock: 3 }] },
      { id: 303, sku: 'ANELB', values: [{ pt: 'Ródio' }, { pt: 'Zircônia' }], price: '125.00',
        image_id: 3000, inventory_levels: [{ location_id: 'L1', stock: 1 }] },
    ],
  },
  produtoFalso(10, [{ id: 101, sku: 'PULSEIRA', estoque: 4 }]),
];
await corpo('POST', '/api/loja/variantes/importar', {});

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const errosConsole = [];
page.on('console', m => { if (m.type() === 'error') errosConsole.push(m.text()); });
/* O stack junto: "Cannot set properties of null" sem ele é uma caça ao
   tesouro num arquivo de 7 mil linhas. */
page.on('pageerror', e => errosConsole.push('pageerror: ' + e.message
  + (e.stack ? ' | ' + String(e.stack).split('\n').slice(1, 4).join(' ').trim() : '')));
/* Confirmações são aceitas por padrão. Onde o teste precisa RECUSAR, ele
   troca este comportamento na hora e devolve depois. */
let respostaDialogo = true;
let ultimoDialogo = '';
page.on('dialog', d => { ultimoDialogo = d.message(); respostaDialogo ? d.accept() : d.dismiss(); });

await page.goto(URL_APP);
await page.waitForTimeout(600);
await page.fill('#cf-url', URL_API);
await page.fill('#cf-key', KEY);
await page.click('#conexaoOverlay .btn-gold');
await page.waitForTimeout(1400);

/* Índice do cartão na lista de revisão. A tela numera os campos pela posição
   em `revisaoVar.itens`, e não pelo SKU — procurar pelo SKU aqui é o que
   deixa o teste sobreviver à ordem mudar. */
const cartaoDe = sku => page.evaluate(
  s => (revisaoVar ? revisaoVar.itens.findIndex(x => x.sku === s) : -1), sku);
const naRevisao = sku => page.evaluate(
  s => !!(revisaoVar && revisaoVar.itens.some(x => x.sku === s)), sku);

async function irParaPendencias() {
  await page.evaluate(() => switchTab('pendencias'));
  await page.waitForTimeout(1400);
}

/* ==================================================================== */
console.log('\n=== 1. o produto sem_reparticao aparece com uma tela, não com um erro ===');
await irParaPendencias();
eq('a revisão foi carregada', await page.evaluate(() => !!revisaoVar), 'true');
eq('ANELB está nela', await naRevisao('ANELB'), 'true');
const i = await cartaoDe('ANELB');
eq('e o motivo é a repartição que falta',
  await page.evaluate(k => revisaoVar.itens[k].motivo, i), 'sem_reparticao');

const textoCartao = await page.locator('.distcard').first().innerText();
eq('a tela pede a divisão em palavras', /Distribua as 6 unidades/.test(textoCartao), 'true');
eq('mostra o total daqui', /6\s*\n?\s*no seu estoque/.test(textoCartao), 'true');
eq('e o total da loja lado a lado', /6\s*\n?\s*na Nuvemshop hoje/.test(textoCartao), 'true');
eq('as três variações estão na tela',
  await page.locator(`#dist-${i}-0, #dist-${i}-1, #dist-${i}-2`).count(), 3);
eq('e a pessoa lê o nome, não o id',
  /Dourado · Zircônia/.test(textoCartao) && !/variant_id/i.test(textoCartao), 'true');
eq('o botão de salvar começa travado',
  await page.locator(`#dist-salvar-${i}`).isDisabled(), 'true');

/* ==================================================================== */
console.log('\n=== 2. soma MENOR que o total: bloqueia ===');
await page.fill(`#dist-${i}-0`, '2');
await page.fill(`#dist-${i}-1`, '1');
await page.fill(`#dist-${i}-2`, '1');
await page.waitForTimeout(200);
eq('a tela diz quantas faltam',
  /Soma 4 de 6 — faltam 2/.test(await page.locator(`#dist-soma-${i}`).innerText()), 'true');
eq('e o salvar continua travado', await page.locator(`#dist-salvar-${i}`).isDisabled(), 'true');
/* A trava da tela é conveniência. A recusa de verdade é do servidor, e é
   ela que precisa existir mesmo que alguém chame a rota na mão. */
let r = await api('POST', '/api/produtos/ANELB/variacoes/distribuir', {
  distribuicao: [{ varianteId: '301', qtd: 2 }, { varianteId: '302', qtd: 1 }, { varianteId: '303', qtd: 1 }],
});
eq('o servidor também recusa a soma curta', r.status, 409);
eq('e diz os dois números', `${r.corpo.soma}/${r.corpo.total}`, '4/6');

/* ==================================================================== */
console.log('\n=== 3. soma MAIOR que o total: bloqueia ===');
await page.fill(`#dist-${i}-0`, '5');
await page.fill(`#dist-${i}-1`, '3');
await page.fill(`#dist-${i}-2`, '1');
await page.waitForTimeout(200);
eq('a tela diz quantas sobram',
  /Soma 9 de 6 — sobram 3/.test(await page.locator(`#dist-soma-${i}`).innerText()), 'true');
eq('e o salvar continua travado', await page.locator(`#dist-salvar-${i}`).isDisabled(), 'true');
r = await api('POST', '/api/produtos/ANELB/variacoes/distribuir', {
  distribuicao: [{ varianteId: '301', qtd: 5 }, { varianteId: '302', qtd: 3 }, { varianteId: '303', qtd: 1 }],
});
eq('o servidor recusa a soma que estoura', r.status, 409);
eq('e ANELB continua com 6', (await prod('ANELB')).qtd, 6);

/* ==================================================================== */
console.log('\n=== 5. "usar quantidades da loja" PREENCHE e não grava ===');
/* Fora de ordem de propósito: precisa acontecer ANTES do salvamento, senão
   o produto já saiu da fila e não há mais formulário para preencher. */
const antesDoBotao = await page.evaluate(async () => {
  const r = await fetch('http://localhost:8787/api/variacoes/revisao',
    { headers: { Authorization: 'Bearer troque-por-uma-chave-de-teste' } });
  return (await r.json()).total;
});
await page.click(`button[onclick="distUsarLoja(${i})"]`);
await page.waitForTimeout(300);
eq('preencheu com o que a loja tem', [
  await page.inputValue(`#dist-${i}-0`),
  await page.inputValue(`#dist-${i}-1`),
  await page.inputValue(`#dist-${i}-2`),
].join(','), '2,3,1');
eq('e a soma passou a fechar',
  /fecha certinho/.test(await page.locator(`#dist-soma-${i}`).innerText()), 'true');
eq('mas nada foi gravado — ANELB ainda está na fila', await naRevisao('ANELB'), 'true');
const depoisDoBotao = await page.evaluate(async () => {
  const r = await fetch('http://localhost:8787/api/variacoes/revisao',
    { headers: { Authorization: 'Bearer troque-por-uma-chave-de-teste' } });
  return (await r.json()).total;
});
eq('a fila do servidor não mudou', depoisDoBotao, antesDoBotao);
eq('e o botão de salvar está liberado, esperando a confirmação',
  await page.locator(`#dist-salvar-${i}`).isDisabled(), 'false');

/* ==================================================================== */
console.log('\n=== 4 e 6. soma exata salva, e o produto sai da revisão ===');
/* Números diferentes dos da loja de propósito: o que vale é o que a pessoa
   confirmou, não o palpite que o botão preencheu. */
await page.fill(`#dist-${i}-0`, '1');
await page.fill(`#dist-${i}-1`, '4');
await page.fill(`#dist-${i}-2`, '1');
await page.waitForTimeout(200);
eq('a soma fecha', /Soma 6 de 6/.test(await page.locator(`#dist-soma-${i}`).innerText()), 'true');
await page.click(`#dist-salvar-${i}`);
await page.waitForTimeout(2200);
eq('a confirmação mostrou a divisão que vai ser gravada',
  /Dourado · Cristal: 4/.test(ultimoDialogo), 'true');
eq('ANELB saiu da revisão', await naRevisao('ANELB'), 'false');
eq('e o total continua 6 — repartir não muda o total', (await prod('ANELB')).qtd, 6);

const saldos = await corpo('GET', '/api/produtos/ANELB/variacoes');
const porId = Object.fromEntries(saldos.variacoes.map(v => [v.varianteId, v.saldo]));
eq('a variante 301 ficou com 1', porId['301'], 1);
eq('a 302 com 4', porId['302'], 4);
eq('a 303 com 1', porId['303'], 1);
eq('a razão fecha (§19)', (await corpo('GET', '/api/estoque/conferir')).divergentes.length, 0);

/* ==================================================================== */
console.log('\n=== 7. o vínculo é o variant_id, e sobrevive à loja renomear ===');
/* A loja troca "Cristal" por "Cristal Rosa" e "Ródio" por "Rhodium". Se o
   casamento fosse por nome, os 4 desta variante virariam saldo órfão e o
   produto voltaria para a fila. É exatamente o bug que a FASE 1 arrancou. */
const anel = loja.estado.produtos.find(p => p.id === 30);
anel.variants[1].values = [{ pt: 'Dourado' }, { pt: 'Cristal Rosa' }];
anel.variants[2].values = [{ pt: 'Rhodium' }, { pt: 'Zircônia' }];
await corpo('POST', '/api/loja/variantes/importar', {});

const depois = await corpo('GET', '/api/produtos/ANELB/variacoes');
const porIdDepois = Object.fromEntries(depois.variacoes.map(v => [v.varianteId, v.saldo]));
eq('a variante renomeada continua com as mesmas 4 peças', porIdDepois['302'], 4);
eq('e a outra também', porIdDepois['303'], 1);
eq('o nome novo é o que a tela mostra',
  depois.variacoes.find(v => v.varianteId === '302').valores.map(x => x.valor).join(' · '),
  'Dourado · Cristal Rosa');
await irParaPendencias();
eq('e o produto NÃO voltou para a fila de revisão', await naRevisao('ANELB'), 'false');

/* ==================================================================== */
console.log('\n=== 8. cadastro de peça nova SEM variação ===');
/* Os códigos digitados aqui passaram a ser numéricos de seis dígitos porque
   é isso que o cadastro manual aceita desde a auditoria do catálogo real —
   `SIMPLES1` era um código que a Marquesa nunca teria. O que este bloco
   prova continua sendo o cadastro em si. Ver src/sku-gerador-test.mjs. */
await page.evaluate(() => switchTab('cadastro'));
await page.waitForTimeout(500);
eq('a seção de variações existe e começa desligada',
  await page.locator('#cm-temvar').isChecked(), 'false');
eq('e a quantidade inicial é um campo comum', await page.locator('#cm-qtd').count(), 1);

await page.fill('#cm-sku', '311001');
await page.fill('#cm-desc', 'Brinco simples');
await page.fill('#cm-qtd', '7');
await page.fill('#cm-preco', '35');
await page.waitForTimeout(700);
await page.click('button[onclick="cadastrarManual()"]');
await page.waitForTimeout(1400);
await page.click('#novasOverlay .btn-gold');
await page.waitForTimeout(1800);
eq('a peça nasceu com 7', (await prod('311001')).qtd, 7);
eq('e sem variação nenhuma',
  (await corpo('GET', '/api/produtos/311001/variacoes')).variacoes.length, 0);

/* ==================================================================== */
console.log('\n=== 9. cadastro de peça nova com UM atributo ===');
await page.evaluate(() => switchTab('cadastro'));
await page.waitForTimeout(500);
await page.fill('#cm-sku', '311002');
await page.fill('#cm-desc', 'Anel de aro');
await page.fill('#cm-preco', '80');
await page.click('#cm-temvar');
await page.waitForTimeout(300);
eq('a quantidade inicial deixou de ser digitável', await page.locator('#cm-qtd').count(), 0);
eq('e virou a soma das variações', await page.locator('#cm-var-total').count(), 1);

await page.fill('#cadAtrs .atrbox:nth-child(1) .ab-topo input', 'Tamanho');
await page.fill('#cadAtrs .atrbox:nth-child(1) input:not(.ab-topo input)', '16, 17, 18');
await page.waitForTimeout(300);
eq('três combinações apareceram', await page.locator('#cadCombos .combolinha').count(), 3);
const qtds = page.locator('#cadCombos .combolinha input');
await qtds.nth(0).fill('2');
await qtds.nth(1).fill('3');
await qtds.nth(2).fill('1');
await page.waitForTimeout(300);
eq('o total é a soma, e a tela diz isso',
  /6 peças no total/.test(await page.locator('#cm-var-total').innerText()), 'true');
await page.waitForTimeout(600);
await page.click('button[onclick="cadastrarManual()"]');
await page.waitForTimeout(1400);
await page.click('#novasOverlay .btn-gold');
await page.waitForTimeout(2200);
eq('a peça nasceu com o total da soma', (await prod('311002')).qtd, 6);
const umAtr = await corpo('GET', '/api/produtos/311002/variacoes');
eq('com três variações', umAtr.variacoes.length, 3);
eq('e o estoque já distribuído', umAtr.variacoes.map(v => v.saldo).sort().join(','), '1,2,3');
eq('cada uma com identidade própria, mesmo sem loja',
  umAtr.variacoes.every(v => v.varianteId && v.varianteId.startsWith('local:')), 'true');
eq('a razão continua fechando', (await corpo('GET', '/api/estoque/conferir')).divergentes.length, 0);

/* ==================================================================== */
console.log('\n=== 10. cadastro de peça nova com DOIS atributos ===');
await page.evaluate(() => switchTab('cadastro'));
await page.waitForTimeout(500);
await page.fill('#cm-sku', '311003');
await page.fill('#cm-desc', 'Colar com pingente');
await page.fill('#cm-preco', '150');
await page.click('#cm-temvar');
await page.waitForTimeout(300);
await page.fill('#cadAtrs .atrbox:nth-child(1) .ab-topo input', 'Cor');
await page.fill('#cadAtrs .atrbox:nth-child(1) input:not(.ab-topo input)', 'Rosa, Dourado');
await page.click('button[onclick="cadAtrAdd()"]');
await page.waitForTimeout(300);
await page.fill('#cadAtrs .atrbox:nth-child(2) .ab-topo input', 'Cristal');
await page.fill('#cadAtrs .atrbox:nth-child(2) input:not(.ab-topo input)', 'Sim, Não');
await page.waitForTimeout(300);
eq('duas dimensões dão quatro combinações',
  await page.locator('#cadCombos .combolinha').count(), 4);
eq('e o nome delas junta os dois valores',
  /Rosa · Sim/.test(await page.locator('#cadCombos').innerText()), 'true');
const q2 = page.locator('#cadCombos .combolinha input');
for (const [k, v] of [[0, '1'], [1, '2'], [2, '3'], [3, '4']]) await q2.nth(k).fill(v);
await page.waitForTimeout(300);
eq('total 10', /10 peças no total/.test(await page.locator('#cm-var-total').innerText()), 'true');
await page.waitForTimeout(600);
await page.click('button[onclick="cadastrarManual()"]');
await page.waitForTimeout(1400);
await page.click('#novasOverlay .btn-gold');
await page.waitForTimeout(2200);
eq('a peça nasceu com 10', (await prod('311003')).qtd, 10);
const dois = await corpo('GET', '/api/produtos/311003/variacoes');
eq('quatro variações', dois.variacoes.length, 4);
eq('os atributos são os que a pessoa inventou, não uma lista nossa',
  dois.atributos.map(a => a.nome).join(','), 'Cor,Cristal');
eq('estoque distribuído 1+2+3+4',
  dois.variacoes.reduce((s, v) => s + v.saldo, 0), 10);
eq('a razão continua fechando', (await corpo('GET', '/api/estoque/conferir')).divergentes.length, 0);

/* ==================================================================== */
console.log('\n=== 11. SKU manual duplicado ===');
await page.evaluate(() => switchTab('cadastro'));
await page.waitForTimeout(500);
await page.fill('#cm-sku', 'ANELB');
await page.waitForTimeout(1200);
const recado = await page.locator('#cm-sku-recado').innerText();
eq('a tela avisa antes de terminar de preencher', /já é a peça ANELB/.test(recado), 'true');
eq('e pinta como ocupado',
  await page.locator('#cm-sku-recado').evaluate(e => e.className), 'sku-recado ocupado');
/* A recusa de verdade é do backend — a tela pode falhar sem estragar nada. */
const dup = await corpo('GET', '/api/produtos/sku/checar?sku=anelb');
eq('o backend também recusa, e normalizado', dup.disponivel, 'false');
eq('e diz onde já está', dup.bloqueiam[0].onde, 'produtos');

/* ==================================================================== */
console.log('\n=== 12. SKU gerado ===');
await page.fill('#cm-sku', '');
await page.click('button[onclick="gerarSku(this)"]');
await page.waitForTimeout(1200);
const gerado = await page.inputValue('#cm-sku');
/* Era `MQ` + 5 enquanto o padrão real não tinha sido medido. Foi medido:
   seis dígitos, sem prefixo. Ver src/sku-gerador-test.mjs. */
eq('veio um código de seis dígitos', /^\d{6}$/.test(gerado), 'true');
eq('e a tela já diz que está livre',
  /está livre/.test(await page.locator('#cm-sku-recado').innerText()), 'true');
const g2 = await corpo('POST', '/api/produtos/sku/gerar', { origem: 'teste' });
eq('o próximo gerado é diferente', g2.sku === gerado, 'false');
/* O código que chega na tela é DEFINITIVO: nada de "formato provisório"
   pedindo para a pessoa desconfiar do que acabou de receber. */
eq('e a tela não relativiza o código que entregou',
  /provis[óo]rio/i.test(await page.locator('#cm-sku-recado').innerText()), 'false');

/* O campo ensina o formato certo — e ensinar errado é instrução errada que
   vira código errado cadastrado à mão. */
eq('o campo mostra um exemplo de seis dígitos',
  await page.getAttribute('#cm-sku', 'placeholder'), 'Ex.: 123456');
await page.fill('#cm-sku', '12345');
await page.waitForTimeout(1200);
eq('e digitar cinco números é recusado na hora, com o recado da operação',
  (await page.locator('#cm-sku-recado').innerText()).trim(), 'O código deve ter 6 números.');

/* ==================================================================== */
console.log('\n=== 13. exclusão de peça SEM histórico ===');
await page.evaluate(() => switchTab('geral'));
await page.waitForTimeout(900);
await page.evaluate(() => abrirExcluir('DESCARTE'));
await page.waitForTimeout(1200);
let janela = await page.locator('#delBody').innerText();
eq('a janela oferece apagar de vez', /Apagar de vez/.test(janela), 'true');
eq('e diz o que vai junto', /Vai junto: 1 movimento de estoque/.test(janela), 'true');
await page.click('#delBody button[onclick="excluirDeVez(this)"]');
await page.waitForTimeout(2000);
eq('DESCARTE sumiu do catálogo', await prod('DESCARTE'), undefined);
eq('a razão continua fechando', (await corpo('GET', '/api/estoque/conferir')).divergentes.length, 0);

/* ==================================================================== */
console.log('\n=== 14. peça COM histórico não é destruída ===');
await page.evaluate(() => abrirExcluir('VENDIDA'));
await page.waitForTimeout(1200);
janela = await page.locator('#delBody').innerText();
eq('a janela recusa apagar', /não pode ser apagada/.test(janela), 'true');
eq('e nomeia o histórico que impede', /1 venda registrada/.test(janela), 'true');
eq('não existe botão de apagar aqui',
  await page.locator('#delBody button[onclick="excluirDeVez(this)"]').count(), 0);
eq('o que ela oferece é arquivar',
  await page.locator('#delBody button[onclick="arquivarPeca(this)"]').count(), 1);
eq('avisando que arquivar não dá baixa', /Arquivar\s*não\s*dá baixa/.test(janela.replace(/\s+/g, ' ')), 'true');
/* A recusa também é do servidor, não só da tela. */
const tentativa = await api('DELETE', '/api/produtos/VENDIDA');
eq('o DELETE direto é recusado', tentativa.status, 409);
eq('e a resposta oferece a alternativa', tentativa.corpo.alternativa, 'arquivar');

await page.fill('#del-motivo', 'descontinuada');
await page.click('#delBody button[onclick="arquivarPeca(this)"]');
await page.waitForTimeout(1800);
const dep = await corpo('GET', '/api/produtos/VENDIDA/dependencias');
eq('a peça continua existindo', dep.sku, 'VENDIDA');
eq('mas arquivada', dep.status, 'arquivado');
eq('com o motivo guardado', dep.arquivadoMotivo, 'descontinuada');
eq('e o saldo dela intacto — arquivar não é baixa', dep.qtd, 4);
eq('a razão continua fechando', (await corpo('GET', '/api/estoque/conferir')).divergentes.length, 0);

/* ==================================================================== */
console.log('\n=== 15. exclusão múltipla de etiquetas ===');
await page.evaluate(() => switchTab('etiquetas'));
await page.waitForTimeout(700);
await page.evaluate(() => {
  /* Três peças na lista de etiquetas. Elas NÃO são o estoque: vivem no
     localStorage deste navegador, e é justamente isso que o teste protege. */
  const st = { products: [
    { id: 1, desc: 'ETQ UM', sku: 'E1', price: 10, qty: 2 },
    { id: 2, desc: 'ETQ DOIS', sku: 'E2', price: 20, qty: 0 },
    { id: 3, desc: 'ETQ TRES', sku: 'E3', price: 30, qty: 1 },
  ], adj: { offX: 0, offY: 0 }, seq: 4 };
  localStorage.setItem('marquesa_etiquetas_v1', JSON.stringify(st));
});
await page.reload();
await page.waitForTimeout(1400);
/* A conexão fica guardada neste navegador: depois do reload o portal só
   reaparece se ela tiver se perdido. */
if (await page.locator('#conexaoOverlay').evaluate(e => e.classList.contains('show'))) {
  await page.fill('#cf-url', URL_API);
  await page.fill('#cf-key', KEY);
  await page.click('#conexaoOverlay .btn-gold');
  await page.waitForTimeout(1400);
}
await page.evaluate(() => switchTab('etiquetas'));
await page.waitForTimeout(700);

const produtosAntes = (await corpo('GET', '/api/state')).produtos.length;
eq('o botão conta a mesma marcação da impressão',
  (await page.locator('#etq-btnExcluirSel').innerText()).trim(), 'Excluir selecionadas (2)');
eq('e só existe uma coluna de caixinha na tabela',
  await page.locator('#view-etiquetas thead input[type="checkbox"]').count(), 1);

await page.click('#etq-btnExcluirSel');
await page.waitForTimeout(900);
eq('a confirmação diz o número', /Excluir 2 peças do cadastro de etiquetas/.test(ultimoDialogo), 'true');
eq('e diz o que ela NÃO faz', /O estoque, as vendas e as maletas/.test(ultimoDialogo), 'true');
eq('sobrou só a que não estava marcada',
  await page.evaluate(() => Etq.resumo().pecas), 1);
eq('e o estoque não foi tocado', (await corpo('GET', '/api/state')).produtos.length, produtosAntes);
eq('o botão sumiu junto com a seleção',
  await page.locator('#etq-btnExcluirSel').isVisible(), 'false');
eq('a lixeira individual continua existindo',
  await page.locator('#etq-lista .iconbtn.del').count(), 1);

/* ==================================================================== */
console.log('\n=== 16. Importar Estoque Total sem os seletores antigos ===');
await page.evaluate(() => { switchTab('cadastro'); });
await page.waitForTimeout(500);
await page.evaluate(() => openImport());
await page.waitForTimeout(300);
eq('a janela abre no contexto do estoque',
  await page.evaluate(() => impContexto), 'estoque');
eq('o seletor "total × só em casa" não existe',
  await page.locator('#impModoCasa').count(), 0);
eq('e o modo é total, fixo', await page.evaluate(() => impModo), 'total');
await page.evaluate(() => closeImport());

console.log('\n    ...e o fluxo de maleta foi para dentro da revendedora');
const rev = await corpo('POST', '/api/revendedoras', { nome: 'Maria Teste' });
await page.evaluate(() => sincronizar());
await page.waitForTimeout(900);
await page.evaluate(id => switchTab('rev:' + id), rev.id);
await page.waitForTimeout(700);
eq('a revendedora tem o ponto de entrada',
  /Importar planilha \/ Montar maleta/.test(await page.locator('#view-rev').innerText()), 'true');
await page.evaluate(id => openImport('rev:' + id), rev.id);
await page.waitForTimeout(300);
eq('e ele abre a mesma janela, endereçada a ela',
  await page.evaluate(() => impContexto), 'rev:' + rev.id);
await page.evaluate(() => closeImport());

/* ==================================================================== */
console.log('\n=== 17. a mesma tela num celular ===');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => switchTab('pendencias'));
await page.waitForTimeout(1600);
const largura = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  janela: window.innerWidth,
}));
eq('a página de Pendências não rola para o lado', largura.doc <= largura.janela + 1, 'true');
await page.evaluate(() => switchTab('geral'));
await page.waitForTimeout(1200);
eq('a tabela de peças tem os dois botões de ação',
  await page.locator('#view-estoque .actions .iconbtn').count() >= 2, 'true');
await page.evaluate(() => switchTab('cadastro'));
await page.waitForTimeout(700);
await page.click('#cm-temvar');
await page.waitForTimeout(300);
await page.fill('#cadAtrs .atrbox:nth-child(1) .ab-topo input', 'Cor');
await page.fill('#cadAtrs .atrbox:nth-child(1) input:not(.ab-topo input)', 'Rosa, Azul');
await page.waitForTimeout(300);
const larguraCad = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
eq('o cadastro com variações também cabe na tela',
  larguraCad.doc <= larguraCad.janela + 1, 'true');
eq('e as combinações aparecem no celular',
  await page.locator('#cadCombos .combolinha').count(), 2);
await page.click('#cm-temvar');
await page.setViewportSize({ width: 1400, height: 1000 });

/* ==================================================================== */
console.log('\n=== 18. regressão: o que não está mapeado continua sem ser escrito ===');
/* Um produto novo na loja, com duas variantes e nenhuma repartição aqui.
   Ele tem de voltar para a fila e a sincronização tem de recusá-lo — é a
   garantia da FASE 1, e nada desta fase pode tê-la afrouxado. */
await corpo('POST', '/api/produtos/importar', {
  produtos: [{ sku: 'NOVOVAR', desc: 'Anel novo', cat: 'Anel', preco: 70, qtd: 5 }],
});
loja.estado.produtos.push({
  id: 50, name: { pt: 'Anel novo' }, handle: { pt: 'anel-novo' }, published: true,
  attributes: [{ pt: 'Aro' }], images: [],
  variants: [
    { id: 501, sku: 'NOVOVAR', values: [{ pt: '17' }], price: '70.00',
      inventory_levels: [{ location_id: 'L1', stock: 3 }] },
    { id: 502, sku: 'NOVOVAR', values: [{ pt: '19' }], price: '70.00',
      inventory_levels: [{ location_id: 'L1', stock: 2 }] },
  ],
});
await corpo('POST', '/api/loja/variantes/importar', {});
const escritasAntes = loja.estado.escritas.length;
const seco = await corpo('POST', '/api/sync', { seco: true });
eq('o ensaio segurou o código não repartido',
  (seco.semEmpurrar || []).some(x => x.sku === 'NOVOVAR' && x.motivo === 'sem_reparticao'), 'true');
eq('e nada foi escrito na loja', loja.estado.escritas.length, escritasAntes);
await irParaPendencias();
eq('ele aparece na fila de revisão', await naRevisao('NOVOVAR'), 'true');
eq('e ANELB, que foi resolvido, continua fora dela', await naRevisao('ANELB'), 'false');

console.log('\n=== nenhum erro de console ===');
eq('o navegador não reclamou de nada', errosConsole.length, 0);
if (errosConsole.length) errosConsole.slice(0, 5).forEach(e => console.log('    ' + e));

await browser.close();
await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
