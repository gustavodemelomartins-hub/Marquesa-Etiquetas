/** Smoke dos fluxos da rodada de produção de 26/09/2026, numa tela de verdade.
 *
 *  Roda contra um app e um Worker indicados por ambiente. Pensado para a
 *  cópia local da produção reconciliada (Worker real sobre o export), onde
 *  existe chave; contra produção, basta trocar MQ_APP/MQ_API/MQ_KEY.
 *
 *    MQ_APP=http://127.0.0.1:5199/ MQ_API=http://127.0.0.1:8797 MQ_KEY=... \
 *      node src/v2-rodada-producao-smoke.mjs
 *
 *  Só LÊ, com uma exceção deliberada que prova o contrário: abre um acerto,
 *  confere uma peça e CANCELA — e mostra que o banco não mudou.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const APP = process.env.MQ_APP;
const API = process.env.MQ_API;
const KEY = process.env.MQ_KEY;
const FOTOS = process.env.MQ_SHOTS || 'evidencias-rodada-producao';
if (!APP || !API || !KEY) { console.error('defina MQ_APP, MQ_API e MQ_KEY'); process.exit(2); }
mkdirSync(FOTOS, { recursive: true });

let falhas = 0;
const prova = (ok, t) => { if (ok) console.log(`ok    ${t}`); else { falhas++; console.log(`FALHA ${t}`); } };
const api = (p) => fetch(API + p, { headers: { Authorization: `Bearer ${KEY}` } }).then((r) => r.json());

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const erros = [];
async function abrir(largura = 390, altura = 844) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura } });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API, KEY]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  return { ctx, p };
}
async function ir(p, hash) {
  await p.goto(`${APP}${hash}`);
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(900);
}
const texto = (p) => p.locator('body').innerText();
const transbordo = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const foto = (p, n) => p.screenshot({ path: path.join(FOTOS, `${n}.png`), fullPage: true });

const estado = await api('/api/state');
const revs = new Map(estado.revendedoras.map((r) => [r.nome, r.id]));

for (const [largura, rotulo] of [[390, 'telefone'], [1280, 'desktop']]) {
  console.log(`\n── ${rotulo} (${largura}px)`);
  const { ctx, p } = await abrir(largura, largura === 390 ? 844 : 800);

  await ir(p, '#/estoque');
  const est = await texto(p);
  prova(/2\.064/.test(est), `${rotulo}: Estoque mostra 2.064 peças em casa`);
  prova(/2\.453/.test(est), `${rotulo}: Estoque mostra 2.453 no total`);
  prova(await transbordo(p) <= 0, `${rotulo}: Estoque sem rolagem horizontal`);
  await foto(p, `${rotulo}-estoque`);

  await ir(p, '#/revendedoras');
  const rv = await texto(p);
  for (const n of ['Bruna Follei', 'Evelyn Veiga', 'Graciele Muniz', 'Luciana Souza']) prova(rv.includes(n), `${rotulo}: ${n} na visão geral`);
  await foto(p, `${rotulo}-revendedoras`);

  for (const [nome, pecas, maleta] of [['Bruna Follei', 92, 16], ['Evelyn Veiga', 84, 17], ['Graciele Muniz', 123, 18], ['Luciana Souza', 90, 15]]) {
    await ir(p, `#/revendedoras/${revs.get(nome)}`);
    await p.getByRole('region', { name: 'Histórico da revendedora' }).waitFor({ timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(800);
    const t = await texto(p);
    prova(t.includes(`Maleta #${maleta}`), `${rotulo}: ${nome} com a maleta #${maleta}`);
    prova(t.includes(`${pecas} peças`), `${rotulo}: ${nome} com ${pecas} peças`);
    prova(t.includes('Linha do tempo'), `${rotulo}: ${nome} tem linha do tempo`);
    if (nome !== 'Luciana Souza') {
      prova(/Registrado no histórico de vendas/.test(t), `${rotulo}: ${nome} mostra o acerto que veio da planilha`);
    }
    prova(await transbordo(p) <= 0, `${rotulo}: ficha de ${nome} sem rolagem horizontal`);
    await foto(p, `${rotulo}-ficha-${maleta}`);
  }

  await ir(p, '#/vendas/historico');
  const vh = await texto(p);
  prova(/Elizama/i.test(vh) || /Sarah Marcelino/i.test(vh), `${rotulo}: Vendas › Histórico mostra venda de setembro`);
  await foto(p, `${rotulo}-vendas-historico`);

  await ir(p, '#/vendas/saida');
  const sd = await texto(p);
  prova(sd.includes('Planilha de vendas antiga'), `${rotulo}: Saídas mostra os lançamentos vindos da planilha antiga`);
  prova(sd.includes('Registros antigos sem saída'), `${rotulo}: Saídas mostra os registros antigos sem saída`);
  prova(await transbordo(p) <= 0, `${rotulo}: Saídas sem rolagem horizontal`);
  await foto(p, `${rotulo}-saidas`);

  await ir(p, '#/financeiro/a-receber');
  const fr = await texto(p);
  prova(/Elizama Meira/.test(fr), `${rotulo}: A receber lista a Elizama (NÃO PAGO na planilha)`);
  prova(!/Cinthia Noronha/.test(fr), `${rotulo}: A receber não lista mais quem a planilha diz que pagou`);
  await foto(p, `${rotulo}-a-receber`);

  await ir(p, '#/estoque/inventario');
  prova(/invent/i.test(await texto(p)), `${rotulo}: Inventário abre`);
  await foto(p, `${rotulo}-inventario`);
  await ctx.close();
}

console.log('\n── acerto aberto e cancelado não grava nada');
{
  const antes = await api('/api/state');
  const { ctx, p } = await abrir(390, 844);
  await ir(p, `#/revendedoras/${revs.get('Evelyn Veiga')}`);
  await p.getByRole('button', { name: 'Fazer acerto' }).click();
  await p.waitForTimeout(1200);
  const t = await texto(p);
  prova(/0\s*devolvid/i.test(t), 'o acerto começa com 0 devolvidas');
  prova(/84/.test(t), 'as 84 peças da maleta estão na conferência');
  const campo = p.getByLabel(/Código da etiqueta/i).first();
  if (await campo.count()) {
    const sku = Object.keys(antes.maletas.find((m) => m.status === 'aberta' && m.revId === revs.get('Evelyn Veiga')).itens)[0];
    await campo.fill(sku);
    await p.getByRole('button', { name: /Registrar devolução/i }).first().click();
    await p.waitForTimeout(600);
    prova(/1\s*devolvid/i.test(await texto(p)), 'um código digitado vira 1 devolvida');
  } else {
    prova(false, 'o campo "Código da etiqueta" existe');
  }
  await foto(p, 'acerto-conferindo');
  const cancelar = p.getByRole('button', { name: /Cancelar|Fechar|Voltar/i }).first();
  await cancelar.click().catch(() => {});
  await p.waitForTimeout(800);
  await ctx.close();
  const depois = await api('/api/state');
  prova(JSON.stringify(depois.maletas) === JSON.stringify(antes.maletas), 'cancelar não mudou maleta nenhuma');
  prova((depois.vendas ?? []).length === (antes.vendas ?? []).length, 'cancelar não criou venda');
  const razao = await api('/api/estoque/conferir');
  prova(JSON.stringify(razao.divergentes) === '[]', 'a razão continua fechando');
}

prova(erros.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/.test(e)).length === 0,
  `nenhum erro de JavaScript (${erros.slice(0, 3).join(' | ')})`);
await browser.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
