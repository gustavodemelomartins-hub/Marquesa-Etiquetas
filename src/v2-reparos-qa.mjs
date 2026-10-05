/* QA DO CASO DE REPARO E DA FOTO DA CLIENTE — num navegador de verdade, no
 * telefone (390×844) e em 1280px. Nasceu de 05/10/2026: o detalhe do reparo
 * só abria pela lista de Garantias; o Início e a ficha da cliente mostravam a
 * peça e não deixavam tocar.
 *
 * Roda contra o harness local — sem chave real, sem nuvem:
 *
 *   MQ_LOCAL_FOTOS=1 node scripts/v2-local/worker-local.mjs . 8797 scripts/v2-local/seed-catalogo.sql &
 *   cd frontend && npm run build && cd ..
 *   node scripts/v2-local/serve-app.mjs frontend/dist 5183 &
 *   cd src && node v2-reparos-qa.mjs
 *
 * O cenário nasce PELAS ROTAS REAIS: uma cliente, uma venda, duas garantias
 * (uma peça com foto na galeria, outra sem), e três clientes para os três
 * estados do avatar. MQ_FOTOS=<pasta> guarda uma captura de cada passo.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pngDeJoia } from '../scripts/v2-local/loja-falsa-fotos.mjs';

const APP = process.env.MQ_APP || 'http://127.0.0.1:5183';
const API = process.env.MQ_API || 'http://127.0.0.1:8797';
const KEY = process.env.MQ_KEY || 'chave-local-de-teste';
const FOTOS = process.env.MQ_FOTOS || null;
/* MQ_ROTEAR_DE=<endereço da API publicada>: para provar o bundle PUBLICADO
   (que só fala com o endereço dele) sem chave real — o app recebe esse
   endereço, e o navegador desvia cada requisição para o Worker local. */
const ROTEAR = process.env.MQ_ROTEAR_DE || null;
const API_DO_APP = ROTEAR || API;
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

let falhas = 0;
const prova = (ok, t) => { console.log(`${ok ? 'ok   ' : 'FALHA'} ${t}`); if (!ok) falhas++; };
const api = (m, p, b, extra = {}) => fetch(API + p, {
  method: m,
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...extra.headers },
  body: extra.bytes ?? (b === undefined ? undefined : JSON.stringify(b)),
}).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));

const estoque = async () => JSON.stringify(((await api('GET', '/api/state')).corpo?.produtos ?? []).map((p) => [p.sku, p.qtd]).sort());

/* ─────────────────────────────────────────────────────────── cenário */
const brenda = (await api('POST', '/api/clientes', { nome: 'Brenda Vitachi', tel: '11911112222' })).corpo;
const venda = (await api('POST', '/api/vendas', {
  clienteId: brenda.id, clienteNome: 'Brenda Vitachi', data: '2026-09-01', pago: true, dataPagamento: '2026-09-01',
  itens: [{ sku: '100101', qtd: 1, preco: 189 }, { sku: '100401', qtd: 1, preco: 139 }],
})).corpo;
const vendaId = venda?.id ?? venda?.vendaId;
prova(!!vendaId, `venda criada (#${vendaId})`);
const foto = await api('POST', '/api/produtos/100101/galeria', undefined, {
  headers: { 'Content-Type': 'image/png', 'X-Principal': '1', 'X-Arquivo': 'colar.png' }, bytes: pngDeJoia([150, 90, 60]),
});
prova(foto.status < 300, `foto da peça 100101 na galeria (${foto.status})`);
const gA = (await api('POST', '/api/garantias', { vendaId, sku: '100101', motivo: 'Banho', dataEntrada: '2026-09-02' })).corpo;
const gB = (await api('POST', '/api/garantias', { vendaId, sku: '100401', motivo: 'Elo solto', dataEntrada: '2026-09-03' })).corpo;
const idA = gA?.garantia?.id ?? gA?.id, idB = gB?.garantia?.id ?? gB?.id;
prova(!!idA && !!idB, `duas garantias abertas (#${idA} com foto, #${idB} sem)`);

const ana = (await api('POST', '/api/clientes', { nome: 'Ana Souza' })).corpo;
const carla = (await api('POST', '/api/clientes', { nome: 'Carla Dias' })).corpo;
const sug = await api('POST', '/api/clientes/avatar/candidatos', {
  clienteId: ana.id, resultado: 'ok',
  candidatos: [{ user_id: '1', username: 'ana.souza', full_name: 'Ana Souza', profile_pic_url: 'https://scontent.cdninstagram.com/v/a.jpg' }],
});
prova(sug.corpo?.candidatos === 1, 'Ana Souza com uma sugestão de foto pendente');

const ESTOQUE = await estoque();
const navegador = await chromium.launch();

for (const [largura, altura, movel] of [[390, 844, true], [1280, 900, false]]) {
  const tam = `${largura}px`;
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: 1,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(([url, key]) => {
    localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
  }, [API_DO_APP, KEY]);
  if (ROTEAR) {
    await ctx.route(`${ROTEAR}/**`, async (r) => {
      const resp = await r.fetch({ url: r.request().url().replace(ROTEAR, API) });
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await r.fulfill({ response: resp, headers });
    });
  }
  const p = await ctx.newPage();
  const erros = [];
  const externas = [];
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('request', (r) => {
    const u = r.url();
    /* A sugestão de foto da cliente É a miniatura do Instagram (por
       desenho, ver SugestaoDeFoto). Fora dela, nada de imagem de fora. */
    if (!u.startsWith(API) && !u.startsWith(API_DO_APP) && !u.startsWith(APP) && !u.startsWith('data:')
      && !/fonts\.(googleapis|gstatic)/.test(u) && !/cdninstagram\.com/.test(u)) externas.push(u);
  });
  const ir = async (hash) => {
    await p.goto(`${APP}/${hash}`);
    await p.waitForLoadState('networkidle');
    await p.waitForTimeout(300);
  };
  const cap = async (n) => {
    if (!FOTOS) return;
    const gaveta = p.locator('[role=dialog].caso');
    if (await gaveta.count()) {
      await gaveta.evaluate((el) => { el.scrollTop = 0; });
      await p.screenshot({ path: `${FOTOS}/${largura}-${n}-topo.png` });
      await gaveta.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    }
    await p.screenshot({ path: `${FOTOS}/${largura}-${n}.png` });
  };

  /** O que todo caso aberto tem de cumprir, venha de onde vier. */
  async function conferirCaso(origem, id, comFoto) {
    const d = p.locator('[role=dialog].caso');
    await d.waitFor({ timeout: 8000 });
    await d.getByText(`Caso #${id}`).waitFor({ timeout: 8000 });
    await d.locator('.caso__nome').waitFor();
    prova(true, `${tam} ${origem}: abriu o caso #${id} no componente único (.caso)`);
    const texto = await d.innerText();
    prova(!/nao_se_aplica|v[ií]nculo|\b[a-z]+_[a-z_]+\b/.test(texto), `${tam} ${origem}: nenhum enum/snake_case na tela`);
    const img = await d.locator('.caso__peca img').count();
    prova(comFoto ? img === 1 : img === 0, `${tam} ${origem}: ${comFoto ? 'miniatura real da peça' : 'sem foto → ícone de sempre'}`);
    if (comFoto) {
      const carregou = await d.locator('.caso__peca img').evaluate((i) => i.complete && i.naturalWidth > 0);
      prova(carregou, `${tam} ${origem}: a miniatura carregou de verdade (R2 local)`);
    }
    const larga = await d.evaluate((el) => el.scrollWidth - el.clientWidth);
    prova(larga <= 1, `${tam} ${origem}: nada cortado na horizontal (${larga}px)`);
    const cortados = await d.evaluate((el) => [...el.querySelectorAll('h2, dd, dt, b, small, .mq-btn')]
      .filter((x) => x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflow !== 'visible').map((x) => x.textContent));
    prova(cortados.length === 0, `${tam} ${origem}: nenhum texto cortado${cortados.length ? ` — ${cortados[0]}` : ''}`);
    if (movel) {
      const baixos = await d.evaluate((el) => [...el.querySelectorAll('.caso__acoes button, .caso__acoes .mq-item')]
        .filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent));
      prova(baixos.length === 0, `${tam} ${origem}: áreas de toque ≥ 44px${baixos.length ? ` — ${baixos[0]}` : ''}`);
      /* rolar até o fim e conferir que o último botão está À VISTA, não
         embaixo da barra de navegação nem da borda do telefone */
      const ultimo = d.locator('.caso__acoes button').last();
      if (await ultimo.count()) {
        await ultimo.scrollIntoViewIfNeeded();
        const livre = await ultimo.evaluate((b) => {
          const r = b.getBoundingClientRect();
          const no = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return (no === b || b.contains(no)) && r.bottom <= window.innerHeight;
        });
        prova(livre, `${tam} ${origem}: último botão visível e tocável (nada por cima)`);
      }
    }
    return d;
  }
  const fecharCaso = async () => {
    await p.locator('[role=dialog].caso').getByRole('button', { name: 'Fechar' }).first().click();
    await p.locator('[role=dialog].caso').waitFor({ state: 'detached', timeout: 5000 });
  };

  /* 1. Início › Peças em reparo */
  await ir('#/home');
  const linhaA = p.getByRole('button', { name: 'Abrir o caso de Colar Lua Cheia' });
  await linhaA.waitFor({ timeout: 8000 });
  prova(await linhaA.locator('img').count() === 1, `${tam} Início: a linha da peça com foto mostra a miniatura`);
  prova(await p.getByRole('button', { name: 'Abrir o caso de Pulseira Elos Finos' }).locator('img').count() === 0,
    `${tam} Início: a linha da peça sem foto mantém o ícone`);
  await cap('1-inicio');
  await linhaA.click();
  await conferirCaso('Início', idA, true);
  await cap('2-caso-do-inicio');
  await fecharCaso();
  prova(/#\/home$/.test(p.url()), `${tam} Início: fechar volta para o Início (${p.url().split('#')[1]})`);

  /* 2. Cliente › Garantias e trocas — o MESMO caso */
  await ir(`#/clientes/${brenda.id}`);
  await p.getByRole('button', { name: /Garantias e trocas/ }).click();
  await p.getByRole('button', { name: 'Abrir o caso de Colar Lua Cheia' }).click();
  await conferirCaso('Cliente', idA, true);
  await cap('3-caso-da-cliente');
  await fecharCaso();
  prova(new RegExp(`#/clientes/${brenda.id}$`).test(p.url()), `${tam} Cliente: fechar volta para a ficha`);

  /* 3. Garantias (lista completa) — o mesmo, e a peça sem foto */
  await ir('#/garantias');
  await p.locator('.mq-list button.mq-item', { hasText: 'Pulseira Elos Finos' }).click();
  await conferirCaso('Garantias', idB, false);
  await cap('4-caso-sem-foto');

  /* 4. Ações: só no 1º tamanho mudamos o status, para o 2º ver o efeito */
  const d = p.locator('[role=dialog].caso');
  const primarios = await d.locator('.mq-btn--primary').count();
  prova(primarios === 1, `${tam} ações: UMA principal (${primarios})`);
  prova(await d.locator('.caso__cancelar.mq-btn--danger').count() === 1, `${tam} ações: cancelar com cara de destrutiva`);
  if (largura === 390) {
    await d.getByRole('button', { name: 'Reparada · aguardando entrega' }).click();
    await d.getByText(/Marcar como/).waitFor();
    await cap('5-confirmar');
    await d.getByRole('button', { name: 'Confirmar' }).click();
    await d.locator('.mq-status', { hasText: 'Reparada' }).waitFor({ timeout: 8000 });
    prova(true, `${tam} ações: "Reparada" gravou e o caso mostra a situação nova`);
    prova(await d.getByRole('button', { name: 'Peça devolvida' }).count() === 1, `${tam} ações: a principal passa a ser entregar`);
    await fecharCaso();
    await p.locator('.mq-list button.mq-item', { hasText: 'Pulseira Elos Finos' }).getByText('Reparada').waitFor({ timeout: 8000 });
    prova(true, `${tam} ações: a lista atrás releu sozinha`);
  } else {
    prova(await d.getByRole('button', { name: 'Peça devolvida' }).count() === 1, `${tam} ações: o status mudado no telefone aparece aqui`);
    await fecharCaso();
  }

  /* 5. Avatar — sem sugestão: "Buscar foto" */
  await ir(`#/clientes/${carla.id}`);
  await p.getByRole('button', { name: 'Buscar foto de Carla Dias' }).click();
  const fotoD = p.getByRole('dialog', { name: 'Foto de Carla Dias' });
  await fotoD.waitFor();
  if (largura === 390) {
    await fotoD.getByText(/Ainda não procuramos/).waitFor();
    await cap('6-avatar-sem-sugestao');
    await fotoD.getByRole('button', { name: 'Buscar foto' }).click();
  }
  await fotoD.getByText(/Busca pedida/).waitFor({ timeout: 5000 });
  prova(true, `${tam} avatar sem sugestão: explica e "Buscar foto" vira "Busca pedida"`);
  await fotoD.getByRole('button', { name: 'Fechar' }).click();

  /* 6. Avatar — com sugestão: "É ela / Não é ela" */
  await ir(`#/clientes/${ana.id}`);
  await p.getByRole('button', { name: 'Sugestão de foto para Ana Souza' }).click();
  const anaD = p.getByRole('dialog', { name: 'Foto de Ana Souza' });
  await anaD.getByText('@ana.souza').waitFor();
  prova(await anaD.getByRole('button', { name: 'É ela', exact: true }).count() === 1 && await anaD.getByRole('button', { name: 'Não é ela', exact: true }).count() === 1,
    `${tam} avatar com sugestão: @usuario + É ela / Não é ela`);
  await cap('7-avatar-sugestao');
  await anaD.getByRole('button', { name: 'Fechar' }).count();
  await p.keyboard.press('Escape');

  const lw = await p.evaluate(() => document.documentElement.scrollWidth);
  prova(lw <= largura + 1, `${tam}: sem rolagem lateral (${lw}px)`);
  prova(externas.length === 0, `${tam}: nenhuma imagem/endereço externo pedido${externas.length ? ` — ${externas[0]}` : ''}`);
  prova(erros.length === 0, `${tam}: nenhum erro de JavaScript${erros.length ? ` — ${erros[0]}` : ''}`);
  await ctx.close();
}
await navegador.close();
prova(await estoque() === ESTOQUE, 'estoque igual antes e depois');
const conf = (await api('GET', '/api/estoque/conferir')).corpo;
prova((conf?.divergentes ?? []).length === 0, '/api/estoque/conferir vazio');
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodas as provas passaram.');
process.exit(falhas ? 1 : 0);
