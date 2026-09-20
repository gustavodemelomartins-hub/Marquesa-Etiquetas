/* O QUE ESTÁ NO AR, num navegador — sem chave nenhuma.
 *
 *  Este roteiro abre `https://marquesa-dev.pages.dev/v2/` como quem abre o
 *  link pela primeira vez: sem conexão gravada, sem segredo no ambiente. Ele
 *  prova o que dá para provar assim — que o bundle publicado carrega, que a
 *  marca aparece, que a porta de entrada pede a chave em vez de inventar
 *  uma, e que nada disso transborda em 390px.
 *
 *  O QUE ELE NÃO PROVA, e é importante dizer: nada que dependa de dado. Para
 *  isso existe `v2-staging-e2e.mjs`, que precisa de `MQ_KEY` — a chave do
 *  staging não mora em arquivo versionado, e o staging serve CPF e telefone
 *  de cliente real.
 *
 *      node src/v2-publicado-smoke.mjs
 *      MQ_APP=https://outro.exemplo/v2/ node src/v2-publicado-smoke.mjs
 */
import { chromium } from 'playwright';

const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';

const provas = [];
const erros = [];
const prova = (ok, texto) => {
  const linha = `${ok ? 'ok   ' : 'FALHA'} ${texto}`;
  provas.push(linha);
  console.log(linha);
  if (!ok) process.exitCode = 1;
};

const navegador = await chromium.launch({ headless: true });

/* Nenhuma chave é gravada: é exatamente este o estado que se quer testar. */
const ctx = await navegador.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true,
});
const p = await ctx.newPage();
p.on('pageerror', (e) => erros.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(m.text());
});

const resposta = await p.goto(APP, { waitUntil: 'networkidle' });
prova(resposta?.status() === 200, `${APP} responde 200`);
await p.waitForTimeout(1200);

const texto = (await p.locator('body').innerText()).replace(/\s+/g, ' ');

/* A porta de entrada PEDE a chave. Um app que se conectasse sozinho estaria
   carregando uma chave de algum lugar — e não há lugar de onde carregá-la. */
prova(/chave|conectar|endere/i.test(texto), 'a entrada pede a conexão em vez de se conectar sozinha');

/* O logo é o arquivo oficial, embutido pelo Vite. Um caminho relativo
   escrito à mão é o que já quebrou em `/v2/` e não em `/`. */
const logo = p.locator('img[alt*="Marquesa"]');
prova(await logo.count() >= 1, 'o logo oficial aparece na entrada');
const src = await logo.first().getAttribute('src');
prova(!!src && !src.includes('..'), `o logo vem do bundle (${String(src).slice(0, 26)}…)`);

const excesso = await p.evaluate(() => document.documentElement.scrollWidth
  - document.documentElement.clientWidth);
prova(excesso <= 2, `a entrada não transborda em 390px (${excesso}px)`);

/* A sugestão de endereço aponta para o STAGING, nunca para produção: é o que
   impede alguém de colar a chave de produção num app de teste por engano. */
const sugestao = await p.locator('input').first().inputValue().catch(() => '');
const campos = await p.locator('input').count();
prova(!/marquesa-api\.[a-z]/.test(sugestao),
  `o endereço sugerido não é o de produção (${sugestao || `${campos} campos, vazio`})`);

await ctx.close();
await navegador.close();

if (erros.length) {
  console.log('\nErros de página:');
  for (const e of [...new Set(erros)].slice(0, 10)) console.log(`  · ${e}`);
}
prova(erros.length === 0, 'nenhum erro de JavaScript no bundle publicado');

const falhas = provas.filter((l) => l.startsWith('FALHA')).length;
console.log(`\n${provas.length - falhas}/${provas.length} provas passaram.`);
