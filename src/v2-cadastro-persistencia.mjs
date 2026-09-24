/* CADASTRAR UMA PEÇA DE VERDADE, PELA TELA, E ACHÁ-LA DEPOIS.
 *
 *      MQ_KEY=<chave do staging-v2> node src/v2-cadastro-persistencia.mjs
 *
 *  Este roteiro é o que separa "a tela abre" de "a operação funciona". Ele
 *  faz, no navegador, contra a V2 PUBLICADA e o banco de staging REAL:
 *
 *      clicar → preencher → salvar → RECARREGAR A PÁGINA → achar de novo
 *
 *  Recarregar no meio é o ponto inteiro. Uma tela que guarda o que criou em
 *  memória passa em qualquer teste que não recarregue, e falha na primeira
 *  vez que alguém fecha a aba.
 *
 *  ┌─ O QUE ELE ESCREVE, e por que isso é aceitável ────────────────────┐
 *  │ UMA peça nova, com código gerado pelo próprio servidor e saldo      │
 *  │ inicial 2. Ela é ADITIVA: não altera cadastro nenhum que já exista  │
 *  │ e não mexe em saldo de peça nenhuma. O banco é `marquesa-db-staging │
 *  │ -v2`, a cópia descartável — nada daqui volta para produção, e não   │
 *  │ existe caminho de volta.                                            │
 *  │                                                                      │
 *  │ A peça FICA. `DELETE /api/produtos/:sku` recusa quem tem histórico  │
 *  │ (§28), e o saldo inicial É um movimento — então apagá-la exigiria   │
 *  │ desfazer a própria coisa que este roteiro veio provar. O código     │
 *  │ criado é impresso no fim, para quem quiser conferir à mão.          │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  E a razão contábil é conferida ANTES e DEPOIS: `produtos.qtd` tem de
 *  continuar igual a `SUM(movimentos.qtd)`. Se o cadastro quebrasse essa
 *  igualdade, ele seria um defeito mesmo tendo "funcionado".
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';
const API = process.env.MQ_API
  || 'https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev';
const KEY = process.env.MQ_KEY;
const FOTOS = process.env.MQ_SHOTS || 'evidencias-paridade';

if (!KEY) {
  console.error('Falta MQ_KEY. Este roteiro escreve no staging e não roda às cegas.');
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

/* ─────────────────────────────────────────── a razão, antes de tudo */

const antes = await api('/api/estoque/conferir');
prova(
  antes.status === 200 && Array.isArray(antes.json?.divergentes) && antes.json.divergentes.length === 0,
  `a razão do estoque fecha ANTES (${antes.json?.divergentes?.length ?? '?'} divergentes)`,
);

const catalogoAntes = await api('/api/state');
const totalAntes = (catalogoAntes.json?.produtos ?? []).length;
const pecasAntes = (catalogoAntes.json?.produtos ?? []).reduce((s, p) => s + Number(p.qtd || 0), 0);
prova(totalAntes > 0, `o catálogo do staging tem ${totalAntes} códigos e ${pecasAntes} peças`);

/* ─────────────────────────────────────────────── a tela, no navegador */

const navegador = await chromium.launch({ headless: true });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(([url, key]) => {
  localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
}, [API, KEY]);

const p = await ctx.newPage();
const errosJs = [];
p.on('pageerror', (e) => errosJs.push(e.message));

await p.goto(`${APP}#/catalogo`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

await p.getByRole('button', { name: /Novo produto/ }).click();
await p.waitForTimeout(600);
const dialogo = p.getByRole('dialog', { name: 'Novo produto' });
prova(await dialogo.count() === 1, 'o formulário de cadastro abre a partir do Catálogo');

/* O código vem do SERVIDOR, e ele RESERVA antes de responder (§17). Gerar
   aqui é o que garante que este roteiro não colida com um código real. */
await dialogo.getByRole('button', { name: /Gerar código/ }).click();
await p.waitForTimeout(2000);
const sku = await dialogo.locator('input').first().inputValue();
prova(/^[1-9][0-9]{5}$/.test(sku), `o servidor gerou e reservou o código ${sku}`);

const nome = `Peça de verificação ${new Date().toISOString().slice(0, 10)}`;
await dialogo.getByLabel(/Nome da peça/).fill(nome);
await dialogo.getByLabel(/Preço/).fill('149');
await dialogo.getByLabel(/Quantidade inicial/).fill('2');
await p.waitForTimeout(1200);

const recado = await dialogo.locator('.sku-recado').innerText().catch(() => '');
prova(/livre/i.test(recado), `a tela confere o código contra o catálogo real ("${recado.trim()}")`);

await dialogo.getByRole('button', { name: /Conferir e criar/ }).click();
await p.waitForTimeout(2500);
prova(
  await dialogo.getByText('Confira antes de criar').count() === 1,
  'o servidor devolveu o laudo, e ele aparece antes de qualquer escrita',
);
await p.screenshot({ path: `${FOTOS}/08-laudo-real.png` });

/* Nada foi gravado ainda — e isso é conferível no próprio banco. */
const meioCaminho = await api(`/api/produtos/${encodeURIComponent(sku)}/variacoes`);
prova(meioCaminho.status === 404, 'até aqui a peça NÃO existe: o laudo não escreve');

await dialogo.getByRole('button', { name: /Criar produto/ }).click();
await p.waitForTimeout(3000);
prova(
  await p.getByRole('dialog', { name: 'Novo produto' }).count() === 0,
  'o formulário fecha depois de criar',
);
await p.screenshot({ path: `${FOTOS}/09-criado-real.png`, fullPage: true });

/* ──────────────────────────────── o RECARREGAR, que é o ponto do roteiro */

await p.goto(`${APP}#/catalogo`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.getByLabel('Buscar no catálogo').fill(sku);
await p.waitForTimeout(800);

const naTela = await p.locator('.mq-table').innerText().catch(() => '');
prova(naTela.includes(sku), `depois de RECARREGAR a página, ${sku} está na lista`);
prova(naTela.includes(nome), 'e com o nome que foi digitado');
await p.screenshot({ path: `${FOTOS}/10-achado-apos-recarregar.png`, fullPage: true });

/* A peça também aparece onde o estoque mora, não só no cadastro. */
await p.goto(`${APP}#/estoque`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.getByLabel('Buscar peça').fill(sku);
await p.waitForTimeout(800);
const noEstoque = await p.locator('.mq-table').last().innerText().catch(() => '');
prova(noEstoque.includes(sku), `${sku} aparece também em Estoque › Todos os produtos`);
prova(/\b2\b/.test(noEstoque), 'com o saldo inicial de 2 peças');
/* A captura é da LINHA, não da página: um `fullPage` aqui fotografa o
   catálogo real inteiro — 790 peças com preço — e este repositório é
   público. Evidência é a prova, não o banco de dados em imagem. */
await p.locator('.mq-table').last().screenshot({ path: `${FOTOS}/11-no-estoque.png` })
  .catch(() => {});

await navegador.close();

/* ────────────────────────────────────── o banco, depois: §19 e a razão */

const ficha = await api(`/api/produtos/${encodeURIComponent(sku)}/variacoes`);
prova(ficha.status === 200, 'a peça existe no banco, pela rota da ficha');

const catalogoDepois = await api('/api/state');
const criada = (catalogoDepois.json?.produtos ?? []).find((x) => x.sku === sku);
prova(!!criada, 'a peça está no estado que a aplicação lê');
prova(criada?.qtd === 2, `o saldo é 2 (${criada?.qtd})`);
prova(criada?.preco === 149, `o preço é 149 (${criada?.preco})`);

const totalDepois = (catalogoDepois.json?.produtos ?? []).length;
const pecasDepois = (catalogoDepois.json?.produtos ?? []).reduce((s, x) => s + Number(x.qtd || 0), 0);
prova(totalDepois === totalAntes + 1, `o catálogo ganhou exatamente UM código (${totalAntes} → ${totalDepois})`);
prova(
  pecasDepois === pecasAntes + 2,
  `o estoque ganhou exatamente DUAS peças (${pecasAntes} → ${pecasDepois}) — nenhuma outra peça se moveu`,
);

/* §19 — o saldo não foi digitado em `produtos.qtd`: existe um movimento
   que o explica. Quem responde isso é a razão da própria peça. */
const razao = await api(`/api/estoque/${encodeURIComponent(sku)}/movimentos`);
const movimentos = razao.json?.movimentos ?? [];
const somaMov = movimentos.reduce((s, m) => s + Number(m.qtd || 0), 0);
prova(
  razao.status === 200 && movimentos.length >= 1 && somaMov === 2,
  `§19 — o saldo tem ${movimentos.length} movimento(s) que o explicam, somando ${somaMov}`
  + `${movimentos[0] ? ` (${movimentos[0].tipo ?? movimentos[0].motivo ?? 'entrada'})` : ''}`,
);

const depois = await api('/api/estoque/conferir');
prova(
  depois.status === 200 && depois.json?.divergentes?.length === 0,
  `a razão do estoque fecha DEPOIS (${depois.json?.divergentes?.length ?? '?'} divergentes)`,
);

prova(errosJs.length === 0, `nenhum erro de JavaScript${errosJs.length ? `: ${errosJs[0]}` : ''}`);

console.log('');
console.log(falhas === 0 ? 'Cadastro provado de ponta a ponta.' : `${falhas} prova(s) falharam.`);
console.log(`A peça ${sku} FICA no staging-v2: §28 recusa apagar quem já tem movimento,`);
console.log('e o movimento é justamente o que este roteiro veio provar. Banco descartável.');
console.log(`Capturas em ${FOTOS}/`);
