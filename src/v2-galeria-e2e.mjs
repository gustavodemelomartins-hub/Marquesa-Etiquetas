/* PEÇAS + FOTOS + R2 na V2, num navegador de verdade — o caminho da Sthefany.
 *
 * Roda contra o harness local COM fotos (R2 em memória + loja falsa local):
 *
 *   MQ_LOCAL_FOTOS=1 node scripts/v2-local/worker-local.mjs . 8797 scripts/v2-local/seed-catalogo.sql &
 *   cd frontend && npm run build && cd ..
 *   node scripts/v2-local/serve-app.mjs frontend/dist 5187 &
 *   cd src && MQ_API=http://127.0.0.1:8797 MQ_APP=http://127.0.0.1:5187 node v2-galeria-e2e.mjs
 *
 * Nenhuma chave de verdade, nenhuma chamada para fora de 127.0.0.1.
 *
 * O que fica provado: a importação em massa está À VISTA no topo de Peças;
 * a análise mostra as contas antes; a importação traz TODAS as fotos, na
 * ordem da loja, e anuncia a que falhou; a lista mostra a principal real;
 * a ficha abre como página; a galeria mostra todas; ampliar, definir
 * principal, arrastar para ordenar, adicionar várias e remover funcionam e
 * PERSISTEM depois de recarregar; reimportar não duplica; a busca de uma
 * peça só; os filtros de foto; e tudo isso no telefone (390 px). */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pngDeJoia } from '../scripts/v2-local/loja-falsa-fotos.mjs';

const APP = process.env.MQ_APP || 'http://127.0.0.1:5187';
const API = process.env.MQ_API || 'http://127.0.0.1:8797';
const LOJA = process.env.MQ_LOJA || 'http://127.0.0.1:8808';
const KEY = process.env.MQ_KEY || 'chave-local-de-teste';
const CAPTURAS = process.env.MQ_CAPTURAS || join(process.cwd(), '..', '.tmp', 'galeria-e2e');
mkdirSync(CAPTURAS, { recursive: true });

let falhas = 0, provas = 0;
function prova(ok, texto) {
  provas++;
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  if (!ok) { falhas++; process.exitCode = 1; }
}
const erros = [], externas = [];

const api = async (m, c, b) => (await fetch(API + c, {
  method: m, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b),
})).json();
const r2 = async () => (await fetch(`${API}/__r2`)).json();

const navegador = await chromium.launch({ headless: true });
async function pagina(largura, altura, movel) {
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: 2,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API, KEY]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`${largura}px · ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(`${largura}px · ${m.text()}`);
  });
  p.on('request', (r) => {
    const u = r.url();
    if (![APP, API, LOJA].some((b) => u.startsWith(b)) && !u.startsWith('data:') && !u.startsWith('blob:')) {
      externas.push(`${r.method()} ${u}`);
    }
  });
  return p;
}
const foto = (p, nome) => p.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: false });
const imagemCarregou = (loc) => loc.evaluate((img) => img.complete && img.naturalWidth > 0);

/* ══════════════════════════════════════════════════ computador, 1280 */
const p = await pagina(1280, 900, false);
await p.goto(`${APP}/#/estoque`);
await p.getByRole('heading', { level: 1, name: 'Peças' }).waitFor();

const botaoImportar = p.getByRole('button', { name: /Importar fotos da Nuvemshop/ });
const caixa = await botaoImportar.boundingBox();
prova(!!caixa && caixa.y >= 0 && caixa.y + caixa.height <= 900,
  '"Importar fotos da Nuvemshop" está visível no topo de Peças, sem rolar');
await foto(p, '01-pecas-lista-antes');

prova((await r2()).length === 0, 'antes: o R2 está vazio');
await botaoImportar.click();
const modal = p.getByRole('dialog', { name: 'Importar fotos da Nuvemshop' });
await modal.getByText('Anúncios na loja').waitFor();
const numero = async (rotulo) => Number((await modal.locator('.mq-importacao__numero', { hasText: rotulo }).first().locator('b').textContent()).replace(/\D/g, ''));
prova(await numero('Anúncios na loja') === 8, 'análise: 8 anúncios lidos da loja');
prova(await numero('Com correspondência') === 5, 'análise: 5 anúncios casaram com uma peça');
prova(await numero('Sem correspondência') === 1, 'análise: 1 anúncio sem peça aqui (código só da loja)');
prova(await numero('Precisa revisar') === 1, 'análise: 1 anúncio precisa revisar (junta dois códigos)');
prova(await numero('Fotos encontradas') === 12, 'análise: 12 fotos encontradas');
prova(await numero('Novas') === 10, 'análise: 10 fotos novas');
prova((await r2()).length === 0, 'a análise (dry-run) não gravou nada no R2');
await modal.getByText(/Precisa revisar \(1 anúncio/).click();
prova(await modal.getByText(/Kit Pulseiras/).isVisible(), 'a revisão mostra o anúncio da loja…');
prova(await modal.getByRole('button', { name: /100401/ }).isVisible() && await modal.getByRole('button', { name: /100402/ }).isVisible(),
  '…e as possíveis peças, clicáveis');
await foto(p, '02-importacao-analise');

await modal.getByRole('button', { name: /Iniciar importação de 10 fotos/ }).click();
await modal.getByText(/Importação concluída/).waitFor({ timeout: 60000 });
prova(await numero('Falharam') === 1, 'importação: 1 foto falhou (a que está fora do ar na loja)…');
prova(await modal.getByText(/a loja respondeu 404/).isVisible(), '…e o motivo aparece');
prova(/9 fotos entraram/.test(await modal.textContent()), 'importação: 9 fotos entraram nas galerias');
prova((await r2()).length === 9, `o R2 recebeu 9 objetos (veio ${(await r2()).length})`);
await foto(p, '03-importacao-concluida');
await modal.getByRole('button', { name: 'Ver as peças' }).click();

const linhaLua = p.getByRole('button', { name: /Colar Lua Cheia/ }).first();
await linhaLua.waitFor();
const miniLua = linhaLua.locator('img');
await p.waitForFunction((sel) => {
  const i = document.querySelector(sel);
  return i && i.complete && i.naturalWidth > 0;
}, '.mq-table--pecas button.mq-tr img', { timeout: 10000 }).catch(() => {});
prova((await miniLua.getAttribute('src')).startsWith(`${API}/api/galeria/`), 'a lista mostra a foto PRINCIPAL da galeria (endereço da API, assinado)');
prova(await imagemCarregou(miniLua), 'a miniatura da lista carregou de verdade (sem ícone quebrado)');
prova(/4/.test(await linhaLua.locator('.mq-selo-fotos').textContent()), 'a linha diz discretamente que há 4 fotos');
await foto(p, '04-pecas-lista-com-fotos');

await p.getByRole('button', { name: /Galeria/ }).click();
await p.locator('.mq-cartoes .mq-cartao').first().waitFor();
prova(await p.locator('.mq-cartoes .mq-cartao').count() === 8, 'a vista Galeria mostra os 8 cartões');
await foto(p, '05-pecas-galeria');
await p.getByRole('button', { name: /Lista/ }).click();

/* ── a ficha ── */
await linhaLua.click();
const ficha = p.getByRole('article', { name: 'Ficha da peça 100101' });
await ficha.waitFor();
prova(/#\/estoque\/peca%3A100101$/.test(p.url()), 'clicar na peça abre a FICHA (página própria)');
await foto(p, '06-ficha-visao-geral');
await ficha.getByRole('tab', { name: /Fotos/ }).click();
const tira = p.getByRole('list', { name: 'Ordem das fotos' });
await tira.locator('li').first().waitFor();
const ordem = async () => (await api('GET', '/api/produtos/100101/galeria')).fotos.map((f) => f.imagemIdLoja);
prova((await tira.locator('li').count()) === 4, 'a galeria mostra TODAS as 4 fotos');
prova(JSON.stringify(await ordem()) === JSON.stringify(['10100', '10101', '10102', '10103']), 'na ordem da loja');
prova(await imagemCarregou(p.locator('.mq-galeria__destaque img')), 'a foto em destaque carregou');
await foto(p, '07-ficha-fotos');

/* ampliar */
await p.locator('.mq-galeria__destaque').click();
const ampliada = p.locator('.mq-ampliada');
await ampliada.waitFor();
prova(await imagemCarregou(ampliada.locator('img')), 'ampliar abre a foto grande');
await p.keyboard.press('ArrowRight');
prova(/2 de 4/.test(await ampliada.textContent()), 'a seta passa para a próxima foto');
await foto(p, '08-foto-ampliada');
await p.keyboard.press('Escape');
prova(await ampliada.count() === 0, 'Esc fecha a foto ampliada (e só ela)');
prova(await ficha.isVisible(), 'a ficha continua aberta');

/* definir principal */
await tira.locator('li').nth(2).locator('button').click();
await p.getByRole('button', { name: /Definir como principal/ }).click();
await p.getByText(/Esta é a foto principal agora/).waitFor();
prova((await ordem())[0] === '10102', 'definir como principal: a foto 3 vira a primeira');
await p.reload();
await tira.locator('li').first().waitFor();
prova((await tira.locator('li').first().locator('button').getAttribute('aria-label')) === 'Foto 1, principal',
  'depois de recarregar, a principal continua a escolhida');

/* arrastar */
await tira.locator('li').nth(3).dragTo(tira.locator('li').nth(0));
await p.waitForTimeout(600);
prova((await ordem())[0] === '10103', 'arrastar a foto 4 para a posição 1 a torna a primeira');
await p.reload();
await tira.locator('li').first().waitFor();
const principalId = (await api('GET', '/api/produtos/100101/galeria')).principal.imagemIdLoja;
prova(principalId === '10102', 'arrastar não trocou a principal');
prova((await tira.locator('li').first().locator('img').getAttribute('src')).includes('/api/galeria/'),
  'a ordem continua depois de recarregar');

/* adicionar várias */
const entrada = p.getByLabel('Escolher fotos para 100101');
await entrada.setInputFiles([
  { name: 'detalhe-fecho.png', mimeType: 'image/png', buffer: pngDeJoia([90, 60, 120]) },
  { name: 'modelo.png', mimeType: 'image/png', buffer: pngDeJoia([30, 120, 140]) },
]);
await p.getByText('2 fotos adicionadas no fim da galeria.').waitFor({ timeout: 20000 });
prova((await tira.locator('li').count()) === 6, 'adicionar 2 fotos de uma vez: a galeria fica com 6');
const depoisDoUpload = (await api('GET', '/api/produtos/100101/galeria')).fotos;
prova(depoisDoUpload.slice(-2).every((f) => f.origem === 'upload' && f.temMiniatura),
  'as duas entram no fim, com miniatura gravada');
await foto(p, '09-galeria-com-upload');

/* remover */
await tira.locator('li').last().locator('button').click();
await p.getByRole('button', { name: /^Remover$/ }).first().click();
await p.getByRole('button', { name: 'Remover', exact: true }).last().click();
await p.getByText('Foto removida.').waitFor();
prova((await tira.locator('li').count()) === 5, 'remover: a galeria fica com 5');
prova((await r2()).length === 9 + 2 * 2 - 2, 'os bytes da foto removida (original e miniatura) saíram do R2');

/* detalhes de origem */
await tira.locator('li').first().locator('button').click();
await p.getByText('De onde veio esta foto').click();
prova(await p.getByText('Loja online (Nuvemshop)').first().isVisible() && await p.getByText('10103').isVisible(),
  'a origem da foto (loja, ID na loja, arquivo no armazenamento) está a um toque');

/* reimportar não duplica */
await p.goto(`${APP}/#/estoque/importar-fotos`);
const modal2 = p.getByRole('dialog', { name: 'Importar fotos da Nuvemshop' });
await modal2.getByText('Anúncios na loja').waitFor();
const n2 = async (rotulo) => Number((await modal2.locator('.mq-importacao__numero', { hasText: rotulo }).first().locator('b').textContent()).replace(/\D/g, ''));
prova(await n2('Já no sistema') === 9 && await n2('Novas') === 1,
  'reanalisar: 9 já no sistema, e só a que falhou continua nova');
await modal2.getByRole('button', { name: /Iniciar importação de 1 foto/ }).click();
await modal2.getByText(/Importação concluída/).waitFor({ timeout: 30000 });
prova((await api('GET', '/api/produtos/100101/galeria')).total === 5, 'reimportar não criou nenhuma cópia');
await modal2.getByRole('button', { name: 'Ver as peças' }).click();

/* uma peça só: anúncio sem foto, e anúncio que precisa revisar */
await p.goto(`${APP}/#/estoque/peca%3A100202%7Cfotos`);
await p.getByText('Esta peça ainda não tem foto').waitFor();
await p.getByRole('button', { name: /Buscar fotos na loja online/ }).click();
await p.getByText(/não tem foto nenhuma/).waitFor();
prova(true, 'buscar na loja de uma peça cujo anúncio não tem foto: diz isso');
await p.goto(`${APP}/#/estoque/peca%3A100401%7Cfotos`);
await p.getByRole('button', { name: /Buscar fotos na loja online/ }).click();
await p.getByText(/Precisa revisar:/).waitFor();
prova((await api('GET', '/api/produtos/100401/galeria')).total === 0, 'peça de anúncio ambíguo: mostra o motivo e NÃO recebe foto');
await foto(p, '10-busca-precisa-revisar');

/* filtros */
await p.goto(`${APP}/#/estoque`);
await p.getByLabel('Fotos').selectOption('sem_foto');
/* 100302 NÃO entra: a loja tem uma foto dela (fora do ar agora, e por isso
   não foi copiada). Ela aparece em "Foto só na loja (falta copiar)" — é a
   fila certa para ela, e a tela desenha o losango se a imagem não abrir. */
const semFoto = await p.locator('.mq-table--pecas button.mq-tr').count();
prova(semFoto === 3, `filtro "Sem foto": 3 peças (veio ${semFoto})`);
await p.getByLabel('Fotos').selectOption('so_na_loja');
prova((await p.locator('.mq-table--pecas button.mq-tr').allTextContents()).join(' ').includes('100302'),
  'filtro "Foto só na loja": a peça cuja foto da loja não pôde ser copiada');
await p.getByLabel('Fotos').selectOption('varias');
prova(await p.locator('.mq-table--pecas button.mq-tr').count() === 3, 'filtro "Com várias fotos": 3 peças');
await p.getByLabel('Fotos').selectOption('revisar');
await p.waitForTimeout(400);
prova(await p.locator('.mq-table--pecas button.mq-tr').count() === 2, 'filtro "Precisa revisar": as 2 peças do anúncio ambíguo');
await p.getByLabel('Fotos').selectOption('');
await p.getByRole('button', { name: /Cadastro incompleto/ }).first().click();
await p.getByRole('button', { name: /^Sem foto \(/ }).click();
prova(await p.locator('.mq-table--pecas button.mq-tr').count() === 3, 'Cadastro incompleto › Sem foto: as mesmas 3');
await foto(p, '11-filtro-sem-foto');

/* ══════════════════════════════════════════════════ telefone, 390 */
const m = await pagina(390, 844, true);
await m.goto(`${APP}/#/estoque`);
await m.getByRole('heading', { level: 1, name: 'Peças' }).waitFor();
prova(await m.getByRole('button', { name: /Importar fotos da Nuvemshop/ }).isVisible(), '390 px: "Importar fotos da Nuvemshop" visível');
const largura = async () => m.evaluate(() => document.documentElement.scrollWidth);
prova(await largura() <= 390, `390 px: a lista não rola para o lado (${await largura()})`);
await foto(m, '20-telefone-lista');
await m.getByRole('button', { name: /Galeria/ }).click();
await m.locator('.mq-cartao').first().waitFor();
prova(await largura() <= 390, '390 px: a vista Galeria cabe na tela');
await foto(m, '21-telefone-galeria');
await m.locator('.mq-cartao', { hasText: 'Colar Lua Cheia' }).click();
const fichaM = m.getByRole('article', { name: 'Ficha da peça 100101' });
await fichaM.waitFor();
await foto(m, '22-telefone-ficha');
await fichaM.getByRole('tab', { name: /Fotos/ }).click();
const tiraM = m.getByRole('list', { name: 'Ordem das fotos' });
await tiraM.locator('li').first().waitFor();
prova(await largura() <= 390, '390 px: a galeria da peça cabe na tela');
const alturas = await m.locator('.mq-galeria__acoes .mq-btn').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height));
prova(alturas.every((h) => h >= 36), `390 px: os botões de ordem têm alvo de dedo (${alturas.map(Math.round).join(', ')} px)`);
await foto(m, '23-telefone-fotos');
const antes = await ordem();
await tiraM.locator('li').nth(1).locator('button').tap();
await m.getByRole('button', { name: 'Mover para frente' }).tap();
await m.waitForTimeout(700);
const depois = await ordem();
prova(depois[2] === antes[1] && depois[1] === antes[2], '390 px: "Depois" troca a foto de lugar com a seguinte, e grava');
/* A primeira agora NÃO é a principal (a principal foi arrastada para
   trás no computador) — é ela que vira capa pelo toque. */
const alvo = (await api('GET', '/api/produtos/100101/galeria')).fotos.find((f) => !f.principal).id;
await tiraM.locator('li').first().locator('button').tap();
await m.getByRole('button', { name: /Definir como principal/ }).tap();
await m.getByText(/Esta é a foto principal agora/).waitFor();
const g390 = await api('GET', '/api/produtos/100101/galeria');
prova(g390.fotos[0].principal === true && g390.principal.id === alvo, '390 px: definir como principal funciona pelo toque');
await m.locator('.mq-galeria__destaque').tap();
await m.locator('.mq-ampliada').waitFor();
prova(await imagemCarregou(m.locator('.mq-ampliada img')), '390 px: a foto ampliada abre');
await foto(m, '24-telefone-ampliada');
await m.getByRole('button', { name: 'Fechar a foto ampliada' }).tap();

/* ══════════════════════════════════════════════════ nada fora do lugar */
const escritas = await (await fetch(`${LOJA}/__escritas`)).json();
prova(escritas.length === 0, `nenhuma escrita na loja online (${escritas.join(', ') || 'nenhuma'})`);
const conferir = await api('GET', '/api/estoque/conferir');
const div = Array.isArray(conferir) ? conferir : (conferir.divergencias ?? conferir.itens ?? []);
prova(div.length === 0, 'a razão do estoque continua fechando');
prova(externas.length === 0, `nenhuma requisição para fora (${externas.slice(0, 3).join(', ')})`);
prova(erros.length === 0, `nenhum erro de JavaScript (${erros.slice(0, 3).join(' | ')})`);

await navegador.close();
console.log(`\n${provas - falhas} de ${provas} provas · capturas em ${CAPTURAS}`);
