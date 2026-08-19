/** Teste ponta a ponta do frontend NOVO (React + TypeScript + Vite).
 *
 *  O que precisa ficar provado aqui:
 *
 *   1. o app carrega e reaproveita a conexão do painel legado
 *   2. a tela Nuvemshop lê o estado de verdade e mostra os números certos
 *   3. a divergência de estoque aparece como INFORMAÇÃO enquanto a
 *      sincronização estiver de pé — e vira PENDÊNCIA quando ela não
 *      estiver, porque aí ninguém vai consertar
 *   4. o que precisa de gente aparece em Pendências, com o motivo
 *   5. "Analisar sincronização" roda a rodada SECA e mostra o diff
 *      classificado por risco
 *   6. e não escreve NADA na Nuvemshop — a loja falsa registra tudo que
 *      recebe, e a contagem de escritas tem de continuar zero
 *   7. nenhum erro de console
 *
 *  Precisa do build pronto (`npm run build` dentro de frontend/), do Worker
 *  local no ar e do dashboard servido em localhost:8000.
 */
import { chromium } from 'playwright';
import { subirLojaFalsa, produtoFalso } from './loja-falsa.mjs';

const URL_APP = 'http://localhost:8000/frontend/dist/index.html';
const URL_API = 'http://localhost:8787';
const KEY = 'troque-por-uma-chave-de-teste';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));
const contem = (t, texto, trecho) =>
  (String(texto).includes(trecho) ? ok(t) : bad(t, `não achei "${trecho}"`));

const api = (m, p, b) => fetch(URL_API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
}).then(r => r.json());

const loja = await subirLojaFalsa();
console.log('loja falsa em ' + loja.url);

/* ---------------------------------------------------------- o cenário
 *
 * Montado para exercitar as três categorias que a tela separa:
 *   B1  estoque divergente  → a sincronização conserta sozinha
 *   B2  em dia
 *   B3  só existe na loja   → não é tocado, e não é problema nosso
 *   B4  tem peça em casa e não existe na loja → PENDÊNCIA (cadastrar)
 *   B5  oculto na loja com peça em casa       → PENDÊNCIA (reativar)
 */
await api('POST', '/api/produtos/importar', {
  produtos: [
    { sku: 'B1', desc: 'Colar Divergente', cat: 'Colar', preco: 100, qtd: 10 },
    { sku: 'B2', desc: 'Brinco Em Dia', cat: 'Brinco', preco: 50, qtd: 4 },
    { sku: 'B4', desc: 'Anel Sem Anuncio', cat: 'Anel', preco: 70, qtd: 3 },
    { sku: 'B5', desc: 'Pulseira Oculta', cat: 'Pulseira', preco: 60, qtd: 2 },
  ],
});

loja.estado.produtos = [
  produtoFalso(1, [{ id: 11, sku: 'B1', estoque: 10 }]),  // igual, por enquanto
  produtoFalso(2, [{ id: 22, sku: 'B2', estoque: 4 }]),   // igual
  produtoFalso(3, [{ id: 33, sku: 'B3', estoque: 7 }]),   // só lá
  produtoFalso(5, [{ id: 55, sku: 'B5', estoque: 2 }], { publicado: false }),
];

/* Uma sincronização REAL primeiro, sem nada para mudar (a loja já está com
   os números certos). É o que estabelece "última execução real: ok" antes
   do cenário começar — sem isso, a tela não teria como dizer
   "sincronizando normalmente" com honestidade: uma rodada SECA não conta
   mais como saúde operacional (TECH_DEBT.md item 12). */
const primeira = await api('POST', '/api/sync', {});
eq('a sincronização real inicial terminou bem', primeira.ok, 'true');
eq('e não escreveu nada — a loja já estava certa', loja.estado.escritas.length, 0);

/* Agora simula a divergência que apareceu DEPOIS dessa sincronização —
   alguém mudou o número lá na loja. */
loja.estado.produtos[0].variants[0].inventory_levels[0].stock = 2;   // B1: loja diz 2, temos 10

/* E uma rodada seca para descobrir essa divergência sem escrever nada. É
   ela que grava o retrato da loja — o teste confere adiante que ela
   continua sem NENHUMA escrita própria. */
const previa = await api('POST', '/api/sync', { seco: true });
eq('a rodada seca terminou bem', previa.ok, 'true');
eq('e não escreveu na loja', loja.estado.escritas.length, 0);

/* ----------------------------------------------------------- navegador */

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();

const erros = [];
page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', e => erros.push('pageerror: ' + e.message));

/* A conexão é a MESMA chave de localStorage do painel legado. Semear aqui
   prova a compatibilidade: quem já conectou lá, chega aqui conectado. */
await page.addInitScript(([url, key]) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
}, [URL_API, KEY]);

await page.goto(URL_APP);
await page.waitForSelector('.nav-item', { timeout: 15000 });

console.log('\n=== 1. o app abre já conectado ===');
ok('a navegação apareceu — a conexão do painel legado foi reaproveitada');
const abas = await page.$$eval('.nav-item', ns => ns.map(n => n.textContent.trim()));
contem('as quatro áreas principais são Etiqueta/Estoque/Revendedoras/Vendas',
  abas.join('|'), 'Etiqueta|Estoque|Revendedoras|Vendas');
if (abas.some((a) => a === 'Nuvemshop' || a === 'Reconciliação')) {
  bad('Nuvemshop/Reconciliação não deveriam mais ser abas principais', abas.join('|'));
}

/* Nuvemshop agora mora dentro de Estoque, não é mais aba principal. */
await page.click('.nav-item:has-text("Estoque")');
await page.click('.pill:has-text("Nuvemshop")');

console.log('\n=== 2. estado da integração ===');
await page.waitForSelector('.selo', { timeout: 15000 });
const estado = await page.textContent('.selo');
/* O rótulo diz o que está ACONTECENDO, não só que existe token. "Conectada"
   com a última rodada em erro seria a tela dando um recado tranquilizador
   sobre uma integração parada. */
eq('a loja aparece sincronizando normalmente', estado.trim(), 'Sincronizando normalmente');

console.log('\n=== 3. visão geral com os números reais ===');
await page.waitForSelector('.metric', { timeout: 15000 });
const metricas = await page.$$eval('.metric', ns => ns.map(n => ({
  rotulo: n.querySelector('.rotulo').textContent.trim(),
  valor: n.querySelector('.valor').textContent.trim(),
})));
const metrica = r => (metricas.find(m => m.rotulo === r) || {}).valor;

eq('produtos publicados: os 3 que casaram', metrica('Produtos publicados'), 3);
eq('estoque divergente: só o B1', metrica('Estoque divergente'), 1);
eq('aguardando cadastro: só o B4', metrica('Aguardando cadastro'), 1);

console.log('\n=== 4. divergência NÃO vira pendência (com a rodada de pé) ===');
/* A regra que a tela nova precisa honrar: o que a próxima rodada conserta
   sozinha é informação, não tarefa de ninguém. */
const pendencias = await page.$$eval('.pendencia .titulo', ns => ns.map(n => n.textContent.trim()));
const temCadastro = pendencias.some(t => t.includes('não existe na loja'));
const temOculto = pendencias.some(t => t.includes('fora do ar'));
const temDivergencia = pendencias.some(t => t.toLowerCase().includes('divergent'));
eq('"falta cadastrar" está nas pendências', temCadastro, 'true');
eq('"oculto com peça" está nas pendências', temOculto, 'true');
eq('"estoque divergente" NÃO está nas pendências', temDivergencia, 'false');

console.log('\n=== 5. analisar sincronização (rodada seca) ===');
const escritasAntes = loja.estado.escritas.length;
await page.click('button:has-text("Analisar sincronização")');
await page.waitForSelector('table.tabela', { timeout: 30000 });

const linhas = await page.$$eval('table.tabela tbody tr', ns => ns.map(n => n.textContent));
eq('o diff apareceu com 1 mudança (o B1)', linhas.length, 1);
contem('e é o código certo', linhas[0], 'B1');
contem('mostrando o valor de hoje na loja', linhas[0], '2');
contem('e o valor que passaria a mostrar', linhas[0], '10');

const risco = await page.textContent('table.tabela tbody tr .selo');
eq('classificado como "Confira" — sobe 8 peças, não zera', risco.trim(), 'Confira');

console.log('\n=== 6. a análise NÃO escreveu na loja ===');
eq('nenhuma escrita nova chegou à Nuvemshop falsa',
   loja.estado.escritas.length, escritasAntes);
eq('e continua zero desde o começo', loja.estado.escritas.length, 0);

console.log('\n=== 7. a aba Pendências (Estoque → Pendências) recebe a mesma análise ===');
await page.click('.pill:has-text("Pendências")');
await page.waitForSelector('table.tabela', { timeout: 15000 });
const corpoRec = await page.textContent('.conteudo');
contem('diz que aprovar e aplicar ainda não existem', corpoRec, 'ainda não existem');
const linhasRec = await page.$$eval('table.tabela tbody tr', ns => ns.length);
eq('a tabela do diff está lá também', linhasRec, 1);

console.log('\n=== 8. com a sincronização quebrada, a MESMA divergência vira pendência ===');
/* A regra da seção 4 tinha uma condição escondida: "a próxima rodada
   conserta" só vale se houver próxima rodada. Aqui a loja passa a responder
   500, a rodada falha de verdade, e a tela precisa mudar de ideia sobre
   exatamente o mesmo número. */
loja.estado.falhar = true;
const quebrada = await api('POST', '/api/sync', {});
eq('a rodada falhou de verdade', quebrada.ok, 'false');
loja.estado.falhar = false;

await page.goto(URL_APP);
await page.waitForSelector('.nav-item', { timeout: 15000 });
await page.click('.nav-item:has-text("Estoque")');
await page.click('.pill:has-text("Nuvemshop")');
await page.waitForSelector('.pendencia .titulo', { timeout: 15000 });

const estado2 = await page.textContent('.selo');
eq('o estado deixou de dizer que está normal', estado2.trim(), 'Última rodada falhou');

const pend2 = await page.$$eval('.pendencia .titulo', ns => ns.map(n => n.textContent.trim()));
eq('agora "estoque divergente" ESTÁ nas pendências',
   pend2.some(x => x.toLowerCase().includes('divergente')), 'true');
eq('e vem primeiro: o motivo dela está fora da própria lista',
   pend2[0].toLowerCase().includes('divergente'), 'true');

const corpoPend = await page.textContent('.pendencia .descricao');
/* A pendência tem de carregar o motivo REAL que o servidor deu — não um
   texto genérico escrito na tela. É a diferença entre "algo deu errado" e
   uma frase que diz o que fazer a respeito. */
contem('a pendência carrega a mensagem que o servidor deu',
  corpoPend, 'loja de mentira: falha proposital');
contem('e diz o que isso custa enquanto durar', corpoPend, 'número diferente');

const notaDiv = await page.$$eval('.metric', ns => {
  const m = ns.find(n => n.querySelector('.rotulo').textContent.trim() === 'Estoque divergente');
  return m ? m.textContent : '';
});
contem('e o cartão parou de prometer que a próxima rodada acerta',
  notaDiv, 'Ninguém vai acertar');

eq('nada disso escreveu na loja', loja.estado.escritas.length, 0);

console.log('\n=== 9. o painel legado continua alcançável ===');
const rodape = await page.textContent('.rodape');
contem('o rodapé aponta para o dashboard.html', rodape, 'dashboard.html');

console.log('\n=== 10. erros de console ===');
eq('nenhum erro no console do navegador', erros.length, 0);
if (erros.length) erros.slice(0, 5).forEach(e => console.log('    ' + e));

await browser.close();
await loja.fechar();

console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ tudo certo');
process.exit(falhas ? 1 : 0);
