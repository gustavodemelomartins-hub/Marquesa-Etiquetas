/* Evidencia visual da V2 publicada — o logo oficial nas tres formas que o
 *  casco tem, mais a tela de entrada.
 *
 *  Existe porque "o logo apareceu" e uma afirmacao que so uma imagem fecha.
 *  As tres larguras nao sao decorativas: cada uma mostra um caminho
 *  diferente do mesmo arquivo `brand/logo.webp`.
 *
 *    1440  trilho inteiro     — o logo completo, invertido para branco
 *    1100  trilho minimo      — a MESMA imagem recortada no ornamento + M
 *     390  telefone, gaveta   — o logo completo de novo, dentro da gaveta
 *
 *      MQ_KEY=<chave> node src/v2-staging-capturas.mjs [destino]
 *
 *  Sem MQ_KEY ele ainda captura a tela de ENTRADA (que nao precisa de
 *  chave) — util para conferir a marca sobre fundo claro.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';
const API = process.env.MQ_API || 'https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev';
const KEY = process.env.MQ_KEY || '';
const destino = process.argv[2] || '.tmp/capturas-v2';
mkdirSync(destino, { recursive: true });

const navegador = await chromium.launch({ headless: true });
const feitas = [];

async function capturar(nome, { w, h, movel = false, conectar = true, prepara }) {
  const ctx = await navegador.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  if (conectar && KEY) {
    await ctx.addInitScript(([url, key]) => {
      localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
    }, [API, KEY]);
  }
  const p = await ctx.newPage();
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  /* A entrada e o casco tem ancoras diferentes: esperar a errada daria
     timeout numa tela que carregou perfeitamente. */
  await p.waitForSelector(conectar && KEY ? '.mq-rail' : '.mq-entrada', { timeout: 40000 });
  await p.waitForTimeout(1500);
  if (prepara) await prepara(p);
  const arquivo = join(destino, `${nome}.png`);
  await p.screenshot({ path: arquivo });
  feitas.push(arquivo);
  await ctx.close();
}

await capturar('entrada-390', { w: 390, h: 844, movel: true, conectar: false });
if (KEY) {
  await capturar('casco-1440-logo-inteiro', { w: 1440, h: 900 });
  await capturar('casco-1100-marca-recortada', { w: 1100, h: 820 });
  await capturar('casco-390-gaveta-aberta', {
    w: 390, h: 844, movel: true,
    prepara: async (p) => {
      await p.locator('.mq-burger').first().click();
      await p.waitForSelector('.mq-rail.is-open', { timeout: 10000 });
      await p.waitForTimeout(700);
    },
  });
} else {
  console.log('Sem MQ_KEY: so a tela de entrada foi capturada.');
}

await navegador.close();
console.log(feitas.join('\n'));
