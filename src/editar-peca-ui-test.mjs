/** BLOCO A na tela de verdade — Editar peça, as duas fotos, e o resolvedor
 *  único de imagem.
 *
 *  O que este teste existe para não deixar voltar:
 *
 *   A1 — a quantidade de cada variação se digita na janela "Editar peça",
 *        e o total da peça é a soma. O texto que mandava a pessoa para
 *        Pendências saiu.
 *   A3/A5 — foto original e foto com fundo branco são dois espaços FIXOS
 *        do produto. Vazio continua nomeado; nada é inventado para
 *        preencher.
 *   A6 — "Gerar fundo branco" não existe mais em nenhuma tela do Estoque.
 *        O tratamento mora em Pendências.
 *   A7 — a MESMA peça mostra a MESMA foto na tabela de Estoque e no cartão
 *        de Pendências, e uma URL que falha vira espaço vazio, nunca o
 *        ícone de imagem quebrada do navegador.
 *
 *  Precisa do Worker local no ar, do dashboard em localhost:8000 e do banco
 *  limpo.
 */
import { chromium } from 'playwright';
import { subirLojaFalsa } from './loja-falsa.mjs';

const URL_APP = 'http://localhost:8000/dashboard.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const loja = await subirLojaFalsa();

/* -------------------------------------------------------------- cenário
   122809 — o código do bug relatado: aparecia com foto na tabela de
   Estoque e como imagem quebrada no cartão de Pendências. Ele entra aqui
   com o mesmo formato do caso real: três variações na loja, foto vinda de
   lá, e um total nosso que a loja não confirma (por isso cai em
   Pendências).
   FOTOQUEBRA — a URL que não responde. A tela tem de mostrar espaço vazio,
   não o ícone do navegador.                                              */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: '122809', desc: 'Colar três cores', cat: 'Colar', preco: 90, qtd: 7 },
    { sku: 'EDIT1', desc: 'Colar de editar', cat: 'Colar', preco: 80, qtd: 7 },
    { sku: 'FOTOQUEBRA', desc: 'Peça com foto morta', cat: 'Anel', preco: 50, qtd: 1 },
  ],
});

const cor = (sku, id, valor, estoque) => ({
  id, sku, values: [{ pt: valor }],
  inventory_levels: [{ location_id: 'L1', stock: estoque }],
});

loja.estado.produtos = [
  /* 122809 fica INTOCADO neste teste: 7 aqui contra 1+1+1 na loja é
     exatamente `sem_reparticao`, e é o que faz o cartão de Pendências
     existir. Editá-lo tiraria da tela justamente o cartão que o teste
     precisa comparar com a tabela. */
  {
    id: 90, name: { pt: 'Colar três cores' }, handle: { pt: 'colar-3' }, published: true,
    attributes: [{ pt: 'Cor' }],
    images: [{ id: 9000, src: 'http://localhost:8000/icons/icon-192.png', position: 1 }],
    variants: [cor('122809', 901, 'Verde', 1), cor('122809', 902, 'Vermelho', 1), cor('122809', 903, 'Laranja', 1)],
  },
  {
    id: 92, name: { pt: 'Colar de editar' }, handle: { pt: 'colar-editar' }, published: true,
    attributes: [{ pt: 'Cor' }], images: [],
    variants: [cor('EDIT1', 921, 'Verde', 0), cor('EDIT1', 922, 'Vermelho', 0), cor('EDIT1', 923, 'Laranja', 0)],
  },
  {
    id: 91, name: { pt: 'Peça com foto morta' }, handle: { pt: 'foto-morta' }, published: true,
    images: [{ id: 9100, src: 'http://127.0.0.1:9/nao-existe.jpg', position: 1 }],
    variants: [{ id: 911, sku: 'FOTOQUEBRA', inventory_levels: [{ location_id: 'L1', stock: 1 }] }],
  },
];

await api('POST', '/api/loja/variantes/importar', {});
/* Vincular = anotar ONDE a foto está, sem trazer os bytes. É o estado do
   bug: a peça tem `foto_url` da Nuvemshop e nenhuma chave no R2. */
await api('POST', '/api/fotos/vincular-da-loja', {});

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + e.message));
await page.addInitScript(([u, k]) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url: u, key: k }));
}, [URL_API, KEY]);
await page.goto(URL_APP);
await page.waitForTimeout(1500);

/* ==================================================================== */
console.log('\n=== 1. Editar peça mostra as variações com campo de quantidade ===');
await page.evaluate(() => switchTab('estoque'));
await page.waitForTimeout(500);
await page.evaluate(() => abrirProduto('EDIT1'));
await page.waitForTimeout(900);

eq('a janela abriu',
  await page.locator('#prodOverlay').evaluate(e => e.classList.contains('show')), 'true');
const campos = page.locator('#prodBody .varlinha input[type=number]');
eq('as três variações têm campo editável', await campos.count(), 3);
eq('e cada campo carrega o id da variante, não o nome',
  (await campos.evaluateAll(els => els.map(e => e.dataset.vid).join(','))), '921,922,923');

console.log('\n=== 2. o texto que mandava para Pendências saiu ===');
const corpoTxt = await page.locator('#prodBody').innerText();
eq('não diz mais "Quantidade não se define aqui"',
  /Quantidade n[ãa]o se define aqui/i.test(corpoTxt), 'false');

console.log('\n=== 3. o total é a soma, ao vivo ===');
await campos.nth(0).fill('2');
await campos.nth(1).fill('3');
await campos.nth(2).fill('1');
await page.waitForTimeout(250);
const soma = (await page.locator('#pe-soma').innerText()).replace(/\s+/g, ' ');
eq('a barra mostra o total das variações', /Total das varia[çc][õo]es: 6/.test(soma), 'true');
eq('e avisa que o estoque da peça vai mudar de 7 para 6',
  /de 7 para 6/.test(soma), 'true');

console.log('\n=== 4. salvar grava a repartição junto com os dados ===');
await page.click('#prodBody .btn-gold');
await page.waitForTimeout(1600);
const p = (await api('GET', '/api/state')).produtos.find(x => x.sku === 'EDIT1');
eq('o total virou a soma', p.qtd, 6);
const estrutura = await api('GET', '/api/produtos/EDIT1/variacoes');
eq('e cada variação ficou com o número digitado',
  estrutura.variacoes.map(v => `${v.varianteId}:${v.saldo}`).join(' '),
  '921:2 922:3 923:1');
eq('a razão continua fechando', (await api('GET', '/api/estoque/conferir')).divergentes.length, 0);

console.log('\n=== 5. as duas fotos são espaço fixo do produto ===');
await page.evaluate(() => abrirProduto('122809'));
await page.waitForTimeout(900);
/* `allInnerTexts` devolve o texto RENDERIZADO, e o rótulo é maiúsculo por
   CSS. O que importa é que os dois espaços existam e sejam nomeados. */
const rotulos = (await page.locator('#prodBody .fotoslot').allInnerTexts()).map(t => t.toLowerCase());
eq('os dois espaços existem, nomeados', rotulos.join(' | '), 'foto original | foto com fundo branco');
eq('a original mostra a imagem que veio da loja',
  await page.locator('#prodBody .fotogrid > div:first-child img.fotoprev').count(), 1);
eq('e o fundo branco continua vazio, sem inventar imagem',
  (await page.locator('#prodBody .fotogrid > div:last-child .fotoprev.vazia').innerText()).trim(),
  'ainda não gerada');

console.log('\n=== 6. "Gerar fundo branco" não existe mais no Estoque ===');
eq('nem na janela de editar a peça', /Gerar fundo branco/.test(await page.locator('#prodBody').innerText()), 'false');
await page.evaluate(() => closeProduto());
await page.evaluate(() => abrirFoto('122809'));
await page.waitForTimeout(500);
eq('nem na janela de foto', /Gerar fundo branco/.test(await page.locator('#fotoBody').innerText()), 'false');
eq('e ela aponta para onde o tratamento mora agora',
  /Pend[êe]ncias/.test(await page.locator('#fotoBody').innerText()), 'true');
await page.evaluate(() => closeFoto());

/* ==================================================================== */
console.log('\n=== 7. A MESMA foto na tabela de Estoque e no cartão de Pendências ===');
/* Antes: a tabela montava a URL com `data-cheia` e um `onerror` que
   procurava a célula da tabela; o cartão montava a sua sozinho, sem
   `data-cheia`, e o mesmo `onerror` estourava por não achar a célula — a
   imagem quebrada ficava na tela porque o tratamento do erro é que tinha
   morrido. Agora quem responde "qual é a foto desta peça?" é um lugar só. */
await page.evaluate(() => switchTab('estoque'));
await page.waitForTimeout(700);
const naTabela = await page.evaluate(() => {
  const linha = [...document.querySelectorAll('#view-estoque tr')]
    .find(l => l.textContent.includes('122809'));
  const img = linha && linha.querySelector('.fotocel img.fotomini');
  return img ? img.getAttribute('data-cheia') : null;
});
eq('a tabela de estoque tem miniatura com endereço de reserva', !!naTabela, 'true');

await page.evaluate(() => switchTab('pendencias'));
await page.waitForSelector('.distcard', { timeout: 15000 });
const noCartao = await page.evaluate(() => {
  const cartao = [...document.querySelectorAll('.distcard')]
    .find(c => c.textContent.includes('122809'));
  const img = cartao && cartao.querySelector('img.dc-foto');
  return img ? { cheia: img.getAttribute('data-cheia'), src: img.getAttribute('src') } : null;
});
eq('o cartão de Pendências tem imagem', !!noCartao, 'true');
eq('e é EXATAMENTE a mesma da tabela', noCartao && noCartao.cheia, naTabela);
eq('com endereço de reserva, igual à tabela', !!(noCartao && noCartao.cheia), 'true');

console.log('\n=== 8. URL que falha vira espaço vazio, nunca ícone quebrado ===');
await page.evaluate(() => switchTab('estoque'));
await page.waitForTimeout(2500);
const quebrada = await page.evaluate(() => {
  const linhas = [...document.querySelectorAll('tr')];
  const linha = linhas.find(l => l.textContent.includes('FOTOQUEBRA'));
  if (!linha) return 'linha não achada';
  const img = linha.querySelector('img');
  if (!img) return 'sem img';
  return { completo: img.complete, largura: img.naturalWidth };
});
/* Ou o `onerror` já trocou a imagem pelo selo (não há mais `img`), ou ela
   ainda está carregando. O que NÃO pode acontecer é sobrar um `img` que
   terminou de carregar com largura 0 — que é o ícone quebrado. */
eq('nenhuma imagem quebrada sobrou na tabela',
  quebrada === 'sem img' || (quebrada.completo && quebrada.largura > 0), 'true');

console.log('\n=== 9. nenhum erro de página em todo o percurso ===');
eq('sem exceção no navegador', erros.length ? erros.join(' | ') : 0, 0);

await browser.close();
await loja.fechar();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
