/* A tela de conexão tem de mostrar a CAUSA, não só "Falha interna".
   API falsa: /api/health responde ok, /api/state responde 503 com erro+detalhe
   — exatamente a forma da resposta nova do Worker quando a cota do D1 estoura. */
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const ERRO = 'O limite diário de leitura do banco (D1) foi atingido nesta conta Cloudflare.';
const DETALHE = 'Não é erro de cadastro nem de venda: a cota é da CONTA, e por isso o DEV para junto. '
              + 'Ela se renova à meia-noite UTC (21h de Brasília).';

const srv = createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url === '/api/health') { res.writeHead(200, cors); return res.end(JSON.stringify({ ok: true, hoje: '2026-09-01' })); }
  if (req.url === '/api/state') { res.writeHead(503, cors); return res.end(JSON.stringify({ erro: ERRO, detalhe: DETALHE, limite: 'd1-leitura-diaria' })); }
  res.writeHead(404, cors); res.end(JSON.stringify({ erro: 'Rota não encontrada' }));
});
await new Promise((r) => srv.listen(8899, r));

const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const pg = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const console_ = [];
pg.on('console', (m) => { if (m.type() === 'error') console_.push(m.text()); });

await pg.goto('http://localhost:8000/dashboard.html', { waitUntil: 'networkidle' });
await pg.waitForTimeout(700);
await pg.fill('#cf-url', 'http://localhost:8899');
await pg.fill('#cf-key', 'qualquer-chave');
await pg.click('#conexaoOverlay .btn-gold');
await pg.waitForTimeout(2000);

let falhas = 0;
const eq = (t, a, b) => (String(a) === String(b)
  ? console.log(`  ok   ${t}`)
  : (falhas++, console.log(`  FALHA ${t}  → esperava ${b}, veio ${a}`)));

const fb = await pg.$eval('#cf-fb', (e) => e.textContent);
console.log(`\n  mensagem na tela:\n    "${fb}"\n`);
eq('a causa aparece na tela', fb.includes('limite diário de leitura'), 'true');
eq('e a saída também', fb.includes('meia-noite UTC'), 'true');
eq('não caiu no "Falha interna" genérico', /Falha interna/.test(fb), 'false');

const diag = console_.find((l) => l.includes('[API]')) || '';
eq('o console registra a etapa', /GET \/api\/state/.test(console_.join(' ')), 'true');
eq('o console registra o status 503', /503/.test(console_.join(' ')), 'true');
eq('a CHAVE nunca aparece no console', /qualquer-chave/.test(console_.join(' ')), 'false');

await nav.close();
srv.close();
console.log(falhas ? `\n${falhas} FALHA(S).` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
