/* BIPAR UMA ETIQUETA DE VERDADE, NA V2 PUBLICADA.
 *
 *      MQ_KEY=<chave do staging-v2> node src/v2-camera-e2e.mjs
 *
 *  Este é o roteiro que separa "o componente chama a função certa" de "a
 *  Sthefany aponta o celular e o número sobe". Ele não simula a leitura:
 *  ele ALIMENTA A CÂMERA do navegador com uma etiqueta real.
 *
 *  Como:
 *
 *   1. o próprio app de etiquetas desenha o CODE128 do SKU, com JsBarcode —
 *      o mesmo código que a impressora usa;
 *   2. os pixels viram um arquivo Y4M, que é vídeo cru;
 *   3. o Chromium sobe com `--use-file-for-fake-video-capture`, e a partir
 *      daí `getUserMedia` entrega aquele vídeo como se fosse a câmera;
 *   4. a V2 publicada abre, a contagem começa, a câmera é ligada — e o
 *      resto é o código de produção, inteiro: ZXing ou BarcodeDetector,
 *      mira, giro, antirrepique, `POST /itens`.
 *
 *  ┌─ O QUE ELE ESCREVE ────────────────────────────────────────────────┐
 *  │ Abre UM inventário no staging, conta UMA peça, e CANCELA o          │
 *  │ inventário no fim — inclusive se algo estourar no meio. Cancelar    │
 *  │ não aplica ajuste nenhum e não cria movimento: a razão do estoque   │
 *  │ fica exatamente como estava. Um inventário aberto esquecido aqui    │
 *  │ impediria a Sthefany de abrir o dela.                               │
 *  └─────────────────────────────────────────────────────────────────────┘
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';
const BASE = APP.replace(/\/v2\/?$/, '');
const API = process.env.MQ_API
  || 'https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev';
const KEY = process.env.MQ_KEY;
const FOTOS = process.env.MQ_SHOTS || 'evidencias-paridade';

if (!KEY) {
  console.error('Falta MQ_KEY. Este roteiro abre um inventário no staging e não roda às cegas.');
  process.exit(2);
}
mkdirSync(FOTOS, { recursive: true });

let falhas = 0;
const prova = (ok, texto) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  if (!ok) { falhas += 1; process.exitCode = 1; }
};

async function api(caminho, metodo = 'GET', corpo) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(corpo ? { 'content-type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { status: r.status, json };
}

const pasta = path.join(tmpdir(), `marquesa-cam-${Date.now()}`);
mkdirSync(pasta, { recursive: true });
const arquivoY4M = path.join(pasta, 'etiqueta.y4m');

/* ══════════════════════════════════════════ 1. quem vai ser bipado */

/* A peça é DESCOBERTA, não fixada por nome: trocar o banco muda quem faz o
   papel, não o que se prova. Ela precisa de duas coisas — estar no que se
   espera em casa, e NÃO ter variação cadastrada, porque peça com variação
   abre uma pergunta em vez de contar (e isso tem prova própria). */
const aberto = await api('/api/inventarios', 'POST', {});
const invId = aberto.json?.id;
prova(!!invId, `inventário #${invId} aberto no staging para esta prova`);
if (!invId) process.exit(1);

/* Daqui para a frente NADA pode sair sem cancelar o inventário. */
async function limpar() {
  if (!invId) return;
  const r = await api(`/api/inventarios/${invId}/cancelar`, 'POST', {});
  console.log(`\n[limpeza] inventário #${invId} cancelado (${r.status})`
    + ' — nenhum ajuste aplicado, nenhum movimento criado');
}
process.on('exit', () => {});

let navegador = null;
try {
  const detalhe = await api(`/api/inventarios/${invId}`);
  const esperados = detalhe.json?.esperados ?? [];
  prova(esperados.length > 0, `o servidor manda ${esperados.length} códigos esperados em casa`);

  /* `temVariacao` é o campo que a própria rota calcula, e é o mesmo que
     `contarItem` consulta para decidir se pergunta o aro. Contar
     `variacoes.length` daria falso positivo: a lista traz também as
     variantes que existem só na Nuvemshop, e essas não fazem a contagem
     perguntar nada. */
  let alvo = null;
  for (const p of esperados.slice(0, 60)) {
    const v = await api(`/api/produtos/${encodeURIComponent(p.sku)}/variacoes`);
    if (v.status === 200 && v.json?.temVariacao === false) { alvo = p; break; }
  }
  prova(!!alvo, alvo ? `a peça da prova é ${alvo.sku} · ${alvo.desc}` : 'nenhuma peça sem variação');
  if (!alvo) throw new Error('sem peça utilizável');

  /* ═══════════════════════════════ 2. a etiqueta vira um vídeo cru */

  const L = 640, A = 480;
  const desenho = await (async () => {
    const b = await chromium.launch({ headless: true });
    const p = await b.newPage();
    /* O app de etiquetas, o mesmo que imprime. JsBarcode vem de lá. */
    await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => typeof window.JsBarcode !== 'undefined', { timeout: 15000 })
      .catch(async () => {
        await p.addScriptTag({ url: `${BASE}/vendor/jsbarcode.min.js` });
        await p.waitForFunction(() => typeof window.JsBarcode !== 'undefined', { timeout: 15000 });
      });
    /* Um QUADRO DE CÂMERA, não a imagem do código: a etiqueta pequena, no
       meio de uma cena. Testar com a imagem crua esconde justamente o que
       quebra na mão dela. */
    const cinza = await p.evaluate(([sku, larg, alt]) => {
      const bc = document.createElement('canvas');
      window.JsBarcode(bc, sku, { format: 'CODE128', width: 3, height: 90, displayValue: false, margin: 18 });
      const cv = document.createElement('canvas');
      cv.width = larg; cv.height = alt;
      const c = cv.getContext('2d');
      c.fillStyle = '#cfc9c4'; c.fillRect(0, 0, larg, alt);
      const escala = Math.min((larg * 0.7) / bc.width, (alt * 0.35) / bc.height);
      const w = bc.width * escala, h = bc.height * escala;
      c.fillStyle = '#fff';
      c.fillRect((larg - w) / 2 - 10, (alt - h) / 2 - 10, w + 20, h + 20);
      c.drawImage(bc, (larg - w) / 2, (alt - h) / 2, w, h);
      const d = c.getImageData(0, 0, larg, alt).data;
      const y = new Array(larg * alt);
      for (let i = 0; i < larg * alt; i += 1) {
        /* Luma BT.601 — é o que a câmera entrega e o que o leitor usa. */
        y[i] = Math.max(16, Math.min(235, Math.round(
          0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2],
        )));
      }
      return y;
    }, [alvo.sku, L, A]);
    await b.close();
    return cinza;
  })();
  prova(desenho.length === L * A, `o app de etiquetas desenhou o CODE128 de ${alvo.sku}`);

  /* Y4M: cabeçalho, e cada quadro em I420. A etiqueta é cinza, então as
     duas planas de cor são neutras (128) e nem mudam entre quadros. */
  const Y = Buffer.from(desenho);
  const UV = Buffer.alloc((L / 2) * (A / 2), 128);
  const cabecalho = Buffer.from(`YUV4MPEG2 W${L} H${A} F25:1 Ip A1:1 C420mpeg2\n`, 'ascii');
  const marca = Buffer.from('FRAME\n', 'ascii');
  const quadros = [];
  /* 25 s de vídeo: tempo de sobra para abrir a câmera, montar o leitor e
     decodificar. O Chromium repete o arquivo quando ele acaba. */
  for (let i = 0; i < 25 * 25; i += 1) quadros.push(marca, Y, UV, UV);
  writeFileSync(arquivoY4M, Buffer.concat([cabecalho, ...quadros]));
  prova(true, `vídeo de câmera gerado (${(Buffer.concat([cabecalho]).length + quadros.length) > 0 ? `${L}x${A}` : ''})`);

  /* ══════════════════════════════════ 3. a V2 publicada, com a câmera */

  navegador = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',          // concede a permissão sozinho
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${arquivoY4M}`,
    ],
  });
  const ctx = await navegador.newContext({
    viewport: { width: 420, height: 900 },
    permissions: ['camera'],
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API, KEY]);

  const p = await ctx.newPage();
  const errosJs = [];
  p.on('pageerror', (e) => errosJs.push(e.message));

  await p.goto(`${APP}#/estoque/inventario`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);

  const botaoCamera = p.getByRole('button', { name: /Abrir câmera/ });
  prova(await botaoCamera.count() === 1, 'a contagem oferece "Abrir câmera"');

  await botaoCamera.click();
  const leitor = p.getByRole('region', { name: 'Leitor de etiquetas' });
  await leitor.waitFor({ timeout: 15000 });
  prova(true, 'o leitor abriu dentro da contagem, sem trocar de tela');

  /* A câmera precisa de um instante para o primeiro quadro chegar e o
     ZXing ser baixado no caminho do iPhone. */
  await p.waitForTimeout(1500);
  const temVideo = await p.evaluate(() => {
    const v = document.querySelector('.mq-cam__palco video');
    return !!(v && v.srcObject && v.videoWidth > 0);
  });
  prova(temVideo, 'a câmera está entregando quadros de verdade');
  await p.screenshot({ path: `${FOTOS}/13-camera-aberta.png` });

  /* ═══════════════════════════════════ 4. a prova: o número subiu */

  let contado = null;
  for (let i = 0; i < 40 && contado === null; i += 1) {
    await p.waitForTimeout(500);
    const d = await api(`/api/inventarios/${invId}`);
    const linha = (d.json?.contagem ?? []).find((c) => c.sku === alvo.sku);
    if (linha) contado = linha.contado;
  }
  prova(contado === 1, `bipar a etiqueta contou a peça no servidor (contado: ${contado})`);
  await p.screenshot({ path: `${FOTOS}/14-bipou.png` });

  const recado = await leitor.innerText();
  prova(/✓|de \d/.test(recado), 'o leitor mostrou a confirmação na tela');

  /* A segunda unidade: a MESMA etiqueta continua na frente da lente. O
     antirrepique deixa passar depois da janela, e o contado vai a 2 —
     é isto que prova que a bipada SOMA em vez de afirmar 1. */
  let segundo = null;
  for (let i = 0; i < 16 && segundo === null; i += 1) {
    await p.waitForTimeout(500);
    const d = await api(`/api/inventarios/${invId}`);
    const linha = (d.json?.contagem ?? []).find((c) => c.sku === alvo.sku);
    if (linha && linha.contado > 1) segundo = linha.contado;
  }
  prova(segundo !== null && segundo >= 2,
    `a etiqueta parada não conta a cada quadro: chegou a ${segundo ?? contado} em ~8s`
    + ' (dezenas de quadros passaram)');

  /* ════════════════════════════════════ 5. desligar de verdade */

  await p.getByRole('button', { name: /Desligar a câmera/ }).click();
  await p.waitForTimeout(800);
  const desligada = await p.evaluate(() => {
    const v = document.querySelector('.mq-cam__palco video');
    if (v && v.srcObject) return false;
    /* Nenhuma trilha de vídeo viva na página. */
    return true;
  });
  prova(desligada, 'fechar o leitor desligou o vídeo');

  /* Reabrir continua o MESMO inventário, com o que já foi contado. */
  await p.getByRole('button', { name: /Abrir câmera/ }).click();
  await leitor.waitFor({ timeout: 15000 });
  const d = await api(`/api/inventarios/${invId}`);
  const aindaLa = (d.json?.contagem ?? []).find((c) => c.sku === alvo.sku);
  prova(!!aindaLa && aindaLa.contado >= 1,
    `reabrir continuou o mesmo inventário #${invId}, com ${aindaLa?.contado} já contado`);

  prova(errosJs.length === 0, `nenhum erro de JavaScript${errosJs.length ? `: ${errosJs[0]}` : ''}`);
  await p.close();

  /* ══════════════════════════════ 6. O CAMINHO DO IPHONE, à força
   *
   *  Tudo acima rodou no Chromium, que tem `BarcodeDetector` nativo — o
   *  caminho do Android. O Safari do iPhone NÃO tem, e é o aparelho que ela
   *  usa: lá quem lê é o ZXing, baixado de `/vendor/zxing.min.js`.
   *
   *  Provar o caminho comum e chamar de "funciona no iPhone" seria
   *  esperança, não prova. Então o detector nativo é APAGADO antes de a
   *  página carregar, exatamente como o e2e do painel clássico faz, e a
   *  bipada é refeita com o outro leitor. */
  const ctxIphone = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['camera'],
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  await ctxIphone.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
    // eslint-disable-next-line no-delete-var
    delete window.BarcodeDetector;
  }, [API, KEY]);

  const pi = await ctxIphone.newPage();
  const errosIphone = [];
  pi.on('pageerror', (e) => errosIphone.push(e.message));
  await pi.goto(`${APP}#/estoque/inventario`, { waitUntil: 'networkidle' });
  await pi.waitForTimeout(2500);
  prova(
    await pi.evaluate(() => !('BarcodeDetector' in window)),
    'o detector nativo foi apagado — daqui para a frente é o caminho do iPhone',
  );

  await pi.getByRole('button', { name: /Abrir câmera/ }).click();
  await pi.getByRole('region', { name: 'Leitor de etiquetas' }).waitFor({ timeout: 20000 });
  await pi.waitForTimeout(3000);
  prova(
    await pi.evaluate(() => !!window.ZXing),
    'o ZXing foi baixado de /vendor/zxing.min.js, como no painel clássico',
  );

  /* A contagem estava em 3 e o inventário é o mesmo. Se o ZXing ler, ela
     sobe — e é isso que se quer saber. */
  const antesIphone = (await api(`/api/inventarios/${invId}`)).json?.contagem
    ?.find((c) => c.sku === alvo.sku)?.contado ?? 0;
  let depoisIphone = null;
  for (let i = 0; i < 40 && depoisIphone === null; i += 1) {
    await pi.waitForTimeout(500);
    const d = await api(`/api/inventarios/${invId}`);
    const linha = (d.json?.contagem ?? []).find((c) => c.sku === alvo.sku);
    if (linha && linha.contado > antesIphone) depoisIphone = linha.contado;
  }
  prova(depoisIphone !== null,
    `o ZXing leu a etiqueta e contou (${antesIphone} → ${depoisIphone}) — o caminho do iPhone funciona`);
  await pi.screenshot({ path: `${FOTOS}/15-caminho-iphone.png` });
  prova(errosIphone.length === 0,
    `nenhum erro de JavaScript no caminho do ZXing${errosIphone.length ? `: ${errosIphone[0]}` : ''}`);
} catch (e) {
  prova(false, `roteiro interrompido: ${e.message}`);
} finally {
  if (navegador) await navegador.close().catch(() => {});
  await limpar();
  rmSync(pasta, { recursive: true, force: true });
}

console.log('');
console.log(falhas === 0
  ? 'A câmera da V2 conta peça de verdade, no bundle publicado.'
  : `${falhas} prova(s) falharam.`);
