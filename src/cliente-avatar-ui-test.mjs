/** Foto da cliente, de ponta a ponta: Worker local (ambiente staging, com R2
 *  local) + painel V2 (React, `frontend/dist`) num Chromium de verdade,
 *  desktop e celular.
 *
 *  Provas: sem foto → iniciais; com foto confirmada → foto (R2, link
 *  assinado); sugestão pendente → "É ela / Não é ela / Próxima"; clicar no
 *  avatar NÃO abre a ficha; falha ao baixar a foto não confirma nada; o
 *  layout não ganha rolagem horizontal; o cadastro/listagem de Clientes
 *  segue igual; console limpo.
 *
 *  Subir antes:  (cd frontend && npm run build)
 *                (cd api && wrangler dev --env staging --local --port 8787 \
 *                   --var API_KEY:<chave> ORIGENS_PERMITIDAS:http://localhost:8000)
 *                python3 -m http.server 8000      (na raiz do repositório)
 *  Rodar:        API_KEY=<chave> PW_CHROMIUM=/opt/pw-browsers/chromium node src/cliente-avatar-ui-test.mjs
 *
 *  O download da foto na confirmação (R2, tipo, tamanho, expirada) é provado
 *  com `fetch` injetado em `cliente-avatar-test.mjs` — o Worker local não
 *  alcança a CDN do Instagram.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const PAINEL = process.env.PAINEL_URL || 'http://localhost:8000/frontend/dist/index.html';
const API = process.env.API_URL || 'http://localhost:8787';
const KEY = process.env.API_KEY || 'troque-por-uma-chave-de-teste';

let falhas = 0, total = 0;
const ok = (t, x = '') => { total++; console.log(`  ok   ${t}${x ? '  → ' + x : ''}`); };
const bad = (t, x = '') => { total++; falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));
const api = (m, p, b) => fetch(API + p, { method: m, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: b === undefined ? undefined : JSON.stringify(b) }).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

/* PNG sólido 64x64, sem dependência */
function png(r, g, b) {
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (tipo, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(tipo), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(64, 0); ihdr.writeUInt32BE(64, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 64 }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array(64).fill([r, g, b]).flat())])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png(200, 120, 140);

const wr = (...a) => execFileSync('npx', ['wrangler', ...a, '--env', 'staging', '--local'], { cwd: new URL('../api', import.meta.url).pathname, stdio: 'pipe' });
const pic = (n) => `https://scontent-gru1-${n}.cdninstagram.com/v/t51/foto${n}.png`;

console.log('\n=== 0. preparar dados (somente fixtures de teste) ===');
await api('POST', '/api/produtos/importar', { produtos: [{ sku: 'AV-ANEL', desc: 'Anel Teste', preco: 80, cat: 'Anéis', qtd: 50 }] });
const mk = async (nome, tel) => (await api('POST', '/api/clientes', { nome, tel })).corpo.id;
const kamila = await mk('Kamila Pereira', '11988887777');
const joana = await mk('Joana Lima', '11977776666');
const marcia = await mk('Marcia Souza', '11966665555');
for (const [i, c] of [kamila, joana, marcia].entries()) {
  const v = await api('POST', '/api/vendas', { clienteNome: ['Kamila Pereira', 'Joana Lima', 'Marcia Souza'][i], clienteId: c, itens: [{ sku: 'AV-ANEL', qtd: 1 }], data: '2026-09-10', pago: true });
  eq(`venda de teste ${i + 1}`, v.status, 201);
}
eq('Kamila: busca com 2 candidatos', (await api('POST', '/api/clientes/avatar/candidatos', { clienteId: kamila, resultado: 'ok', candidatos: [
  { user_id: '11', username: 'kamila.pereira', full_name: 'Kamila Pereira', profile_pic_url: pic(1) },
  { user_id: '12', username: 'kamilapereira_', full_name: 'Kamila Pereira Souza', profile_pic_url: pic(2) },
  { user_id: '13', username: 'so_kamila', full_name: 'Kamila Souza', profile_pic_url: pic(3) }] })).corpo.candidatos, 2);
eq('Joana: Instagram indisponível não quebra nada', (await api('POST', '/api/clientes/avatar/candidatos', { clienteId: joana, resultado: 'erro', erro: 'instagram_indisponivel' })).status, 200);
// foto confirmada da Marcia: bytes no R2 local + linha no D1 (o que a confirmação grava)
const dir = mkdtempSync(join(tmpdir(), 'av-')); const arq = join(dir, 'a.png'); writeFileSync(arq, PNG);
wr('r2', 'object', 'put', `marquesa-fotos-dev/clientes/${marcia}/avatar`, `--file=${arq}`, '--content-type=image/png');
wr('d1', 'execute', 'DB', `--command=INSERT INTO cliente_avatar (cliente_id, instagram_username, r2_key, tipo, tamanho, confirmed_at, updated_at) VALUES (${marcia}, 'marcia.souza', 'clientes/${marcia}/avatar', 'image/png', ${PNG.length}, datetime('now'), datetime('now'))`);

// o wrangler pode recarregar o runtime quando a CLI mexe no estado local
for (let i = 0; i < 30; i++) { if (await fetch(API + '/api/health').then((r) => r.ok).catch(() => false)) break; await new Promise((r) => setTimeout(r, 1000)); }

console.log('\n=== 1. API: contrato e regressão de Clientes ===');
const crm = (await api('GET', '/api/analytics/crm')).corpo;
const lin = (id) => crm.todos.find((c) => c.clienteId === id);
const marciaUrl = lin(marcia).avatarUrl;
eq('lista de clientes segue completa', crm.todos.length, 3);
eq('Joana (sem foto): sem avatarUrl nem sugestão', [lin(joana).avatarUrl, lin(joana).avatarSugestao], [undefined, undefined].join(','));
eq('Kamila: sugestão pendente, sem foto', [lin(kamila).avatarSugestao, lin(kamila).avatarUrl], 'true,');
ok('Marcia: avatarUrl assinada', /\/avatar\?exp=\d+&sig=/.test(lin(marcia).avatarUrl));
const img = await fetch(API + lin(marcia).avatarUrl);
eq('imagem servida do R2', [img.status, img.headers.get('content-type'), (await img.arrayBuffer()).byteLength], `200,image/png,${PNG.length}`);
eq('sem assinatura: 401', (await fetch(`${API}/api/clientes/${marcia}/avatar`)).status, 401);
eq('busca de clientes (venda) segue igual e traz a foto', (await api('GET', '/api/clientes?busca=marcia')).corpo.map((c) => [c.nome, c.tel, !!c.avatarUrl].join('|')), 'Marcia Souza|11966665555|true');
eq('criar cliente sem Instagram segue funcionando', (await api('POST', '/api/clientes', { nome: 'Nova Cliente', tel: '1' })).status, 201);
eq('fila: a recém-criada já está lá (assíncrono, sem acoplamento)', (await api('GET', '/api/clientes/avatar/fila?limite=10')).corpo.some((c) => c.nome === 'Nova Cliente'), 'true');



const nav = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
async function sessao(largura, altura) {
  const ctx = await nav.newContext({ viewport: { width: largura, height: altura }, serviceWorkers: 'block' });
  await ctx.addInitScript(([url, key]) => localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key })), [API, KEY]);
  const pg = await ctx.newPage(); const erros = [];
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  pg.on('pageerror', (e) => erros.push(String(e)));
  await pg.route(/cdninstagram\.com/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await pg.goto(PAINEL + '#/clientes/todos', { waitUntil: 'networkidle' });
  await pg.waitForSelector('.mq-table .mq-tr:not(.mq-tr--head)');
  return { pg, erros, ctx };
}
const linha = (pg, nome) => pg.locator('.mq-tr:not(.mq-tr--head)', { hasText: nome });
const limpo = (erros) => erros.filter((e) => !/Failed to load resource|avatar\/decidir|502/.test(e)).join(' | ');

console.log('\n=== 2. desktop (1280px) ===');
{
  const { pg, erros, ctx } = await sessao(1280, 900);
  const j = linha(pg, 'Joana Lima');
  eq('sem foto: iniciais JL', await j.locator('.mq-avatar').innerText(), 'JL');
  eq('sem foto: nenhuma <img>', await j.locator('.mq-avatar img').count(), 0);
  const m = linha(pg, 'Marcia Souza');
  eq('com foto confirmada: <img> do R2', await m.locator('.mq-avatar img').count(), 1);
  ok('…link assinado da API', /\/api\/clientes\/\d+\/avatar\?exp=/.test(await m.locator('.mq-avatar img').getAttribute('src')));
  eq('a imagem carregou de verdade', await m.locator('.mq-avatar img').evaluate((i) => i.complete && i.naturalWidth > 0), 'true');
  const k = linha(pg, 'Kamila Pereira');
  eq('sugestão pendente: iniciais + marca de sugestão', [await k.locator('.mq-avatar--sug').innerText(), await k.locator('img').count()], 'KP,0');
  eq('a lista tem as 3 clientes + a recém-criada', await pg.locator('.mq-tr:not(.mq-tr--head)').count(), 4);

  await k.click(); await pg.waitForSelector('.mq-pagehead');
  const av = pg.locator('.mq-pagehead__actions button.mq-avatar');
  eq('ficha: avatar com sugestão é botão', await av.count(), 1);
  await av.click();
  await pg.waitForSelector('[role=dialog]');
  const dlg = pg.locator('[role=dialog]');
  ok('mostra @usuario e nome encontrado', /@kamila\.pereira/.test(await dlg.innerText()) && /Kamila Pereira/.test(await dlg.innerText()));
  await pg.waitForFunction(() => { const i = document.querySelector('[role=dialog] .mq-avatar img'); return i && i.complete; }, null, { timeout: 5000 }).catch(() => {});
  eq('foto sugerida carregou', await dlg.locator('.mq-avatar img').evaluate((i) => i.complete && i.naturalWidth > 0), 'true');
  eq('ações: É ela / Não é ela / Próxima sugestão', (await dlg.locator('.mq-btns button').allInnerTexts()).join('|'), 'É ela|Não é ela|Próxima sugestão');
  ok('perfil só com primeiro nome nunca foi sugerido', !/so_kamila/.test(await dlg.innerText()));
  await dlg.getByRole('button', { name: 'Próxima sugestão' }).click(); await pg.waitForTimeout(500);
  ok('"Próxima" mostra o outro candidato', /@kamilapereira_/.test(await dlg.innerText()));
  await dlg.getByRole('button', { name: 'Não é ela' }).click(); await pg.waitForTimeout(700);
  ok('"Não é ela" passa para a restante', /@kamila\.pereira/.test(await dlg.innerText()));
  eq('…a última: sem botão Próxima', await dlg.getByRole('button', { name: 'Próxima sugestão' }).count(), 0);
  await dlg.getByRole('button', { name: 'É ela', exact: true }).click(); await pg.waitForTimeout(2500);
  ok('falha ao baixar a foto: erro no diálogo, nada confirmado', (await dlg.getByRole('alert').innerText()).length > 0);
  eq('…botão voltou a funcionar', await dlg.getByRole('button', { name: 'É ela', exact: true }).isEnabled(), 'true');
  eq('…e a API não registrou foto para Kamila', (await api('GET', '/api/clientes/perfil?id=' + kamila)).corpo.avatarUrl, 'undefined');
  await pg.keyboard.press('Escape');

  await pg.goto(PAINEL + '#/clientes/todos'); await pg.waitForSelector('.mq-tr:not(.mq-tr--head)');
  await linha(pg, 'Marcia Souza').click(); await pg.waitForSelector('.mq-pagehead');
  eq('ficha da Marcia: foto ao lado do nome', await pg.locator('.mq-pagehead .mq-avatar img').count(), 1);
  await pg.locator('.mq-pagehead__actions button.mq-avatar').click(); await pg.waitForSelector('[role=dialog]');
  await pg.getByRole('button', { name: 'Remover foto' }).click(); await pg.waitForTimeout(1500);
  eq('após remover: iniciais de volta', [await pg.locator('.mq-pagehead .mq-avatar').innerText(), await pg.locator('.mq-pagehead .mq-avatar img').count()], 'MS,0');
  eq('R2: o link antigo agora é 404', (await fetch(API + marciaUrl)).status, 404);

  await pg.goto(PAINEL + '#/clientes'); await pg.waitForTimeout(1500);
  ok('visão geral (top clientes) usa o mesmo avatar', (await pg.locator('.mq-item .mq-avatar').count()) >= 1);
  eq('console limpo (desktop)', limpo(erros), '');
  await ctx.close();
}

console.log('\n=== 3. celular (390px) ===');
{
  const { pg, erros, ctx } = await sessao(390, 800);
  eq('sem rolagem horizontal na lista', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'true');
  const k = linha(pg, 'Kamila Pereira');
  const bx = await k.locator('.mq-avatar').boundingBox();
  eq('avatar pequeno e quadrado (34px)', [Math.round(bx.width), Math.round(bx.height)], '34,34');
  const nm = await k.locator('b').first().boundingBox();
  ok('avatar alinhado ao nome (mesma faixa vertical)', bx.y <= nm.y + nm.height && bx.y + bx.height >= nm.y);
  const alturas = await pg.locator('.mq-tr:not(.mq-tr--head)').evaluateAll((l) => l.map((x) => Math.round(x.getBoundingClientRect().height)));
  ok('linhas com altura de linha (não viraram cartões gigantes)', alturas.every((h) => h < 120), alturas.join(','));
  await k.click(); await pg.waitForSelector('.mq-pagehead');
  eq('sem rolagem horizontal na ficha', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'true');
  await pg.locator('.mq-pagehead__actions button.mq-avatar').click(); await pg.waitForSelector('[role=dialog]');
  const md = await pg.locator('[role=dialog]').boundingBox();
  ok('diálogo cabe na tela do celular', md.x >= 0 && md.x + md.width <= 390.5);
  eq('console limpo (celular)', limpo(erros), '');
  await ctx.close();
}

await nav.close();
console.log(`\n${total - falhas}/${total} asserções ok`);
process.exit(falhas ? 1 : 0);
