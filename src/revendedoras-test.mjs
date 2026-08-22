/** BLOCO C e D — a área de Revendedoras vira operação, não lista.
 *
 *  Antes, abrir Revendedoras era cair num grid de cartões: nenhuma leitura
 *  da operação, nenhuma agenda, nenhum desempenho. A Agenda de acertos
 *  morava na Visão Geral do ESTOQUE, que é a tela que ela menos ajuda a
 *  decidir. E a ficha de uma revendedora escondia o telefone no rodapé,
 *  abaixo da tabela e do histórico.
 *
 *  O que precisa ficar provado:
 *
 *   1. a aba inicial é "Visão Geral", e a lista completa continua existindo;
 *   2. a Agenda de acertos SAIU do Estoque e está em Revendedoras;
 *   3. Top Revendedoras sai do HISTÓRICO real — e, sem histórico, a tela
 *      diz isso em vez de ranquear pelo valor da maleta de hoje;
 *   4. a capacidade de novas maletas guarda a reserva e é configurável;
 *   5. contato e "Editar dados" ficam no topo da ficha;
 *   6. a importação continua dentro da revendedora — e agora com preview:
 *      nada é aplicado antes da confirmação;
 *   7. o preview mostra desconhecidos e divergências.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import XLSX from 'xlsx';

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

/* -------------------------------------------------------------- cenário */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'RC1', desc: 'Colar liso', cat: 'Colar', preco: 50, qtd: 400 },
    { sku: 'RC2', desc: 'Brinco argola', cat: 'Brinco', preco: 30, qtd: 300 },
  ],
});
const ana = await api('POST', '/api/revendedoras', { nome: 'Ana Teste', tel: '(11) 91234-5678', cidade: 'São Paulo' });
const bia = await api('POST', '/api/revendedoras', { nome: 'Bia Teste', tel: '11987654321' });

/* Ana tem maleta aberta com data de acerto — é ela que vai para a agenda. */
const maletaAna = await api('POST', '/api/maletas', { revId: ana.id, abertaEm: '2026-08-01', acertoEm: '2026-09-15' });
await api('POST', `/api/maletas/${maletaAna.id}/itens`, { itens: { RC1: 20, RC2: 10 } });

/* Bia teve um ciclo FECHADO: é dela que sai o desempenho real. */
const maletaBia = await api('POST', '/api/maletas', { revId: bia.id, abertaEm: '2026-06-01', acertoEm: '2026-07-15' });
await api('POST', `/api/maletas/${maletaBia.id}/itens`, { itens: { RC1: 40 } });

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + e.message));
page.on('dialog', d => d.accept());
await page.addInitScript(([u, k]) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url: u, key: k }));
}, [URL_API, KEY]);
await page.goto(URL_APP);
await page.waitForTimeout(1500);

/* ==================================================================== */
console.log('\n=== 1. a área abre na Visão Geral, e "Todas" continua existindo ===');
await page.evaluate(() => switchTab('revgeral'));
await page.waitForTimeout(800);
const subabas = await page.evaluate(() =>
  [...document.querySelectorAll('#tabsSubNav .tab')].map(b => b.textContent.trim()));
eq('a primeira subaba é Visão Geral', subabas[0], 'Visão Geral');
eq('e a lista completa é a segunda',
  /^Todas as revendedoras/.test(subabas[1] || ''), 'true');
const geral = await page.locator('#view-revgeral').innerText();
eq('com CTA de nova revendedora', /\+ Nova revendedora/.test(geral), 'true');

console.log('\n=== 2. a Agenda de acertos mudou de casa ===');
eq('está em Revendedoras', /Agenda de acertos/.test(geral), 'true');
eq('e traz quem tem data marcada', /Ana Teste/.test(geral), 'true');
await page.evaluate(() => switchTab('geral'));
await page.waitForTimeout(900);
const estoque = await page.locator('#view-geral').innerText();
eq('e saiu da Visão Geral do Estoque', /Agenda de acertos/.test(estoque), 'false');

console.log('\n=== 3. Top Revendedoras não ranqueia pelo tamanho da maleta ===');
await page.evaluate(() => switchTab('revgeral'));
await page.waitForTimeout(800);
let top = await page.locator('#view-revgeral').innerText();
eq('a seção existe', /Top revendedoras/.test(top), 'true');
/* Ana está com 30 peças e Bia com 40, e NENHUMA das duas acertou ainda.
   Ranquear agora seria ranquear quem recebeu mais, não quem vendeu. */
eq('sem acerto fechado, ela diz que não há o que medir',
  /Ainda n[ãa]o h[áa] acerto fechado/.test(top), 'true');

console.log('\n=== 4. depois de um acerto, o desempenho aparece — do histórico ===');
/* Bia vende 30 das 40 e devolve 10. É o número que o acerto grava, e é
   dele que o giro e o ticket saem. */
await api('POST', `/api/maletas/${maletaBia.id}/acerto`, {
  faltas: [{ sku: 'RC1', linhas: [{ destino: 'vendida', qtd: 30 }] }],
  devolvidas: { RC1: 10 },
});
await page.evaluate(() => sincronizar());
await page.waitForTimeout(1200);
/* Achatado: `money()` separa "R$" do número com espaço fino, e `innerText`
   ainda mete quebra de linha entre as células. O que se prova é o número,
   não o espaço que o navegador escolheu. */
top = (await page.locator('#view-revgeral').innerText()).replace(/\s+/g, ' ');
eq('Bia entrou no Top', /Bia Teste/.test(top), 'true');
eq('com o valor vendido de verdade (30 × R$ 50)', /R\$ 1\.500\b/.test(top), 'true');
eq('e o giro em cima do que saiu (30 de 40)', /75%/.test(top), 'true');
eq('Ana continua fora, porque não tem ciclo fechado',
  /revendedora ainda n[ãa]o tem acerto fechado|revendedoras ainda n[ãa]o t[êe]m acerto fechado/.test(top), 'true');

console.log('\n=== 5. capacidade de novas maletas guarda a reserva ===');
eq('a frase existe e é a do pedido',
  /consegue montar aproximadamente/.test(top), 'true');
const cap = await page.evaluate(() => capacidadeMaletas());
const emCasa = (await api('GET', '/api/state')).produtos
  .reduce((s, p) => s + Math.max(0, p.disponivel || 0), 0);
eq('a conta parte do que está em casa', cap.emCasa, emCasa);
eq('desconta a reserva', cap.utilizavel, Math.max(0, emCasa - cap.reserva));
eq('e divide pelo tamanho-alvo', cap.maletas, Math.floor(cap.utilizavel / cap.alvo));
/* A reserva é o que impede o algoritmo de zerar a casa. */
eq('nunca sobra menos que a reserva', cap.emCasa - cap.maletas * cap.alvo >= cap.reserva, 'true');

await page.evaluate(() => { document.getElementById('cap-alvo').value = '50'; document.getElementById('cap-reserva').value = '100'; });
await page.evaluate(() => salvarPlanejamento());
await page.waitForTimeout(1400);
const cfg = (await api('GET', '/api/state')).config;
eq('os dois parâmetros são configuráveis', `${cfg.maletaAlvoPecas}/${cfg.reservaMinima}`, '50/100');

console.log('\n=== 6. contato e Editar dados no topo da ficha ===');
await page.evaluate(id => switchTab('rev:' + id), ana.id);
await page.waitForTimeout(900);
const topo = await page.locator('#view-rev .revtopo').innerText();
eq('o nome está no topo', /Ana Teste/.test(topo), 'true');
eq('o telefone também', /91234-5678/.test(topo), 'true');
eq('com atalho de WhatsApp', /WhatsApp/.test(topo), 'true');
eq('e "Editar dados" saiu do rodapé', /Editar dados/.test(topo), 'true');
const linkWhats = await page.locator('#view-rev .revtopo a[href^="https://wa.me/"]').getAttribute('href');
eq('o número do WhatsApp leva o DDI', linkWhats, 'https://wa.me/5511912345678');

console.log('\n=== 7. as ações principais estão perto do topo ===');
const acoes = await page.locator('#view-rev .actbar button').allInnerTexts();
eq('importar Anexo I', acoes.some(t => /Importar Anexo I/.test(t)), 'true');
eq('bipar peças', acoes.some(t => /Bipar pe[çc]as/.test(t)), 'true');
eq('imprimir Anexo I', acoes.some(t => /Imprimir Anexo I/.test(t)), 'true');
eq('fazer acerto', acoes.some(t => /Fazer acerto/.test(t)), 'true');

console.log('\n=== 8. histórico por revendedora, com o que o acerto gravou ===');
await page.evaluate(id => switchTab('rev:' + id), bia.id);
await page.waitForTimeout(900);
/* `innerText` devolve o texto RENDERIZADO: os rótulos das colunas são
   maiúsculos por CSS e as quebras viram \n. Compara sobre uma versão
   achatada e sem caixa — o que se prova aqui é o conteúdo, não a
   tipografia. */
const hist = (await page.locator('#view-rev').innerText()).replace(/\s+/g, ' ').toLowerCase();
eq('o ciclo encerrado aparece', /1 ciclo encerrado/.test(hist), 'true');
eq('com o que levou', /levou 40/.test(hist), 'true');
eq('o que vendeu', /vendeu 30/.test(hist), 'true');
eq('o que voltou', /voltou 10/.test(hist), 'true');
eq('a comissão', /comiss[ãa]o 25% r\$ 375/.test(hist), 'true');
eq('e o recebido', /recebido r\$ 1\.125/.test(hist), 'true');
eq('com os totais do ciclo no topo do histórico',
  /r\$ 1\.500 vendido no total/.test(hist), 'true');
eq('e a data de encerramento, que antes vinha vazia',
  /→ \d{2}\/\d{2}\/\d{4}/.test(hist), 'true');

/* ==================================================================== */
console.log('\n=== 9. importar Anexo I: preview obrigatório, nada aplicado antes ===');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['ANEXO I'],
  ['Ana Teste'],
  ['Acerto: 20/10/2026'],
  [],
  ['Código', 'Descrição', 'Valor'],
  ['RC1', 'Colar liso', 50],
  ['RC1', 'Colar liso', 50],
  ['NAOEXISTE', 'Peça fantasma', 70],
  ['RC2', 'Brinco argola', 99],     // preço divergente de propósito
]), 'Anexo I');
const arquivo = path.join(tmpdir(), 'anexo-teste.xlsx');
fs.writeFileSync(arquivo, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }));

await page.evaluate(id => switchTab('rev:' + id), ana.id);
await page.waitForTimeout(700);
await page.evaluate(id => openImport('rev:' + id), ana.id);
await page.waitForTimeout(400);
await page.setInputFiles('#impFile', arquivo);
await page.waitForSelector('#impStep2:not([style*="display: none"])', { timeout: 15000 });
await page.click('#impStep2 .btn-gold');
await page.waitForSelector('#impStep4:not([style*="display: none"])', { timeout: 15000 });

const previa = (await page.locator('#impMaletaBody').innerText()).replace(/\s+/g, ' ');
eq('o preview abriu', /CONFIRA ANTES DE APLICAR/i.test(previa), 'true');
eq('diz para quem', /Ana Teste/.test(previa), 'true');
eq('e se vai para a maleta aberta ou cria uma nova',
  /maleta \d+, j[áa] aberta/.test(previa), 'true');
eq('quantas peças', /4 pe[çc]as/.test(previa), 'true');
eq('mostra o código desconhecido', /NAOEXISTE/.test(previa), 'true');
eq('e a divergência de preço', /pre[çc]o diverge|pre[çc]os divergem/.test(previa), 'true');

/* A prova que importa: nada foi gravado até aqui. */
const antes = await api('GET', '/api/state');
const maletaAntes = antes.maletas.find(m => m.id === maletaAna.id);
eq('a maleta não recebeu peça nenhuma ainda', maletaAntes.itens.RC1, 20);
eq('e o código desconhecido NÃO foi criado',
  antes.produtos.some(p => p.sku === 'NAOEXISTE'), 'false');

console.log('\n=== 10. confirmar aplica — e só então ===');
await page.click('#impStep4 .btn-gold');
await page.waitForTimeout(2500);
const depois = await api('GET', '/api/state');
const maletaDepois = depois.maletas.find(m => m.id === maletaAna.id);
eq('as duas unidades de RC1 entraram', maletaDepois.itens.RC1, 22);
eq('e a de RC2 também', maletaDepois.itens.RC2, 11);
eq('o código desconhecido foi criado, com 0',
  (depois.produtos.find(p => p.sku === 'NAOEXISTE') || {}).qtd, 0);

console.log('\n=== 11. a razão continua fechando ===');
const conf = await api('GET', '/api/estoque/conferir');
eq('saldo bate com a soma dos movimentos', conf.divergentes.length, 0);

console.log('\n=== 12. nenhum erro de página ===');
eq('sem exceção no navegador', erros.length ? erros.join(' | ') : 0, 0);

fs.unlinkSync(arquivo);
await browser.close();
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
