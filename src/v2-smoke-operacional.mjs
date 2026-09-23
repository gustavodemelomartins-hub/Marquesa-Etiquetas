/* SMOKE DA V2 PUBLICADA — as seis superfícies que vão operar amanhã.
 *
 *      MQ_KEY=<chave do staging-v2> node src/v2-smoke-operacional.mjs
 *
 *  Sem `MQ_KEY` ele ainda roda a parte que não precisa de chave (a página
 *  sobe, o casco desenha, o endereço resolve, cabe em 390px) e diz, no fim,
 *  o que ficou de fora. Meia prova declarada vale mais que prova nenhuma.
 *
 *  ┌─ O QUE ESTE ROTEIRO NÃO FAZ ──────────────────────────────────────┐
 *  │ · não FINALIZA inventário — a base definitiva ainda não foi        │
 *  │   importada, e congelar um retrato agora seria congelar o errado;  │
 *  │ · não chama `/aplicar` — nenhum ajuste de estoque, em hipótese     │
 *  │   nenhuma;                                                         │
 *  │ · não registra venda nem saída: as duas MOVIMENTAM estoque real, e │
 *  │   o banco do DEV é a cópia da operação. O que se prova delas é que │
 *  │   a tela abre, valida e chega até o botão — não que ela aperta.    │
 *  │ · o inventário que ele abre é CANCELADO no fim, sempre, inclusive  │
 *  │   se algo estourar no meio. Um inventário aberto esquecido aqui    │
 *  │   impediria a Sthefany de abrir o dela.                            │
 *  └────────────────────────────────────────────────────────────────────┘
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const APP = process.env.MQ_APP || 'https://marquesa-dev.pages.dev/v2/';
const API = process.env.MQ_API
  || 'https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev';
const KEY = process.env.MQ_KEY || null;
const FOTOS = process.env.MQ_SHOTS || 'evidencias-smoke';

mkdirSync(FOTOS, { recursive: true });

const H = KEY ? { Authorization: `Bearer ${KEY}` } : {};
async function api(caminho, metodo = 'GET', corpo) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { ...H, ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch { json = { bruto: txt.slice(0, 300) }; }
  return { status: r.status, json };
}

let falhas = 0;
let pulados = 0;
const prova = (ok, texto) => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${texto}`);
  if (!ok) { falhas += 1; process.exitCode = 1; }
};
const pulo = (texto) => { pulados += 1; console.log(`  --   ${texto}`); };
const secao = (t) => console.log(`\n═══ ${t}`);

const navegador = await chromium.launch({ headless: true });
const erros = [];
/* Duas listas, porque são duas coisas.

   `fotosDaVitrine` — `<img>` de uma imagem que a loja JÁ publica. É
   leitura, não manda dado nosso a lugar nenhum, e a trava de ESCRITA na
   Nuvemshop é do Worker, não do navegador. Enquanto a conta não tiver R2,
   esta é a única foto que existe. O painel legado faz o mesmo em produção
   desde o go-live. Conta, mostra, não reprova.

   `externas` — qualquer OUTRA saída. API da Nuvemshop, produção, um
   terceiro qualquer. Isso continua sendo falha. */
const CDN_VITRINE = /(?:tiendanube|nuvemshop)\.com/;
const fotosDaVitrine = new Set();
const externas = [];
const origemApp = new URL(APP).origin;

async function abrir(w = 1440, h = 900, movel = false) {
  const ctx = await navegador.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    ...(movel ? { isMobile: true, hasTouch: true } : {}),
  });
  if (KEY) {
    await ctx.addInitScript(([url, key]) => {
      localStorage.setItem('marquesa_conexao_v1', JSON.stringify({ url, key }));
    }, [API, KEY]);
  }
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`${w}px · ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') erros.push(`${w}px · ${m.text()}`); });
  /* Nenhuma saída para fora do Pages do DEV e do Worker de staging. Se uma
     linha tentasse falar com produção ou com a Nuvemshop, apareceria aqui. */
  p.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (u.startsWith(origemApp) || u.startsWith(API)) return;
    if (r.resourceType() === 'image' && CDN_VITRINE.test(u)) { fotosDaVitrine.add(u); return; }
    externas.push(`${r.method()} ${u}`);
  });
  return { ctx, p };
}

const foto = (p, nome) => p.screenshot({ path: `${FOTOS}/${nome}.png`, fullPage: true });
const ir = async (p, hash) => {
  await p.goto(APP + hash, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
};

let inventarioAberto = null;

try {
  /* ══════════════════════════════════ 0 · a porta */
  secao('0 · o ambiente');
  {
    const saude = await fetch(`${API}/api/health`);
    const semChave = await fetch(`${API}/api/state`);
    prova(saude.ok && semChave.status === 401,
      `Worker responde e exige chave (health ${saude.status}, state sem chave ${semChave.status})`);

    const html = await (await fetch(APP)).text();
    const bundle = (html.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0];
    prova(!!bundle, `o /v2/ serve um bundle (${bundle || 'nenhum'})`);
    if (bundle) {
      const js = await (await fetch(new URL(bundle, APP).href)).text();
      for (const [marca, onde] of [
        ['Onde está o patrimônio', 'Estoque'],
        ['Conferência do estoque em casa', 'Inventário'],
        ['Escolha seus pingentes', 'Monte seu Colar'],
        ['Análise de saídas', 'Saídas'],
        ['Perfil — ninguém identificado', 'Cabeçalho'],
      ]) {
        prova(js.includes(marca), `o bundle publicado tem ${onde} ("${marca}")`);
      }
    }
  }

  /* ══════════════════════════════════ 1 · cabeçalho */
  secao('1 · Cabeçalho / AppShell');
  if (!KEY) {
    /* Sem chave a V2 não desenha o casco: ela pede a conexão primeiro.
       Isso não é falta de cabeçalho — é a porta funcionando. */
    const { ctx, p } = await abrir();
    await ir(p, '#/home');
    prova(await p.locator('.mq-entrada').count() === 1,
      'sem chave, a V2 pede a conexão antes de desenhar qualquer dado');
    prova(await p.locator('.mq-topbar').count() === 0,
      'e não desenha casco nenhum por cima de dado que não tem');
    await foto(p, '01-sem-chave-porta');
    await ctx.close();
    pulo('cabeçalho, busca, sino e avatar — o casco só existe conectado');
  } else {
    const { ctx, p } = await abrir();
    await ir(p, '#/home');
    const topo = p.locator('.mq-topbar');
    prova(await topo.count() === 1, 'existe UM cabeçalho, e só um');
    prova(await p.locator('.mq-topbar .mq-search input').count() === 1,
      'a busca está no cabeçalho, na pílula do design system');
    const ph = await p.locator('.mq-topbar .mq-search input').getAttribute('placeholder');
    prova(ph === 'Buscar cliente, peça ou venda', `placeholder do protótipo ("${ph}")`);
    prova(await p.locator('.mq-topbar__tools .mq-avatar').count() === 1,
      'o avatar circular está no lugar do ícone genérico');
    const iniciais = (await p.locator('.mq-topbar__tools .mq-avatar').textContent() || '').trim();
    prova(/^[A-Z]{1,2}$/.test(iniciais), `o avatar mostra iniciais ("${iniciais}")`);
    prova(await p.locator('.mq-topbar__tools button[aria-label^="Notificações"]').count() === 1,
      'o sino está no cabeçalho');
    /* "Desconectar" saiu da barra: o protótipo não tem um botão de texto ali. */
    const textoBarra = (await topo.textContent()) || '';
    prova(!textoBarra.includes('Desconectar'),
      'o botão de texto "Desconectar" saiu da barra (mora no menu do avatar)');

    await p.locator('.mq-topbar__tools .mq-avatar').click();
    await p.waitForTimeout(300);
    prova(await p.locator('.mq-perfil__menu').count() === 1, 'o avatar abre o menu de perfil');
    prova((await p.locator('.mq-perfil__menu').textContent() || '').includes('Desconectar'),
      'e o Desconectar está lá dentro');
    await p.keyboard.press('Escape');
    await foto(p, '01-cabecalho');
    await ctx.close();
  }

  /* ══════════════════════════════════ 1b · 390px */
  secao('1b · o telefone de 390px');
  if (!KEY) {
    pulo('a varredura de 390px — sem chave a tela é só o formulário de conexão');
  } else {
    const { ctx, p } = await abrir(390, 844, true);
    await ir(p, '#/estoque');
    const transbordo = await p.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    prova(transbordo <= 1, `sem rolagem horizontal em 390px (transbordo ${transbordo}px)`);
    await foto(p, '01b-telefone-estoque');
    await ctx.close();
  }

  /* ══════════════════════════════════ 2 · Estoque */
  secao('2 · Estoque');
  if (!KEY) {
    pulo('Estoque inteiro — a tela só existe depois da conexão');
  } else {
    const { ctx, p } = await abrir();
    await ir(p, '#/estoque');

    const abas = await p.locator('[role="tablist"][aria-label="Estoque"] [role="tab"]')
      .allTextContents();
    const esperadas = ['Visão geral', 'Cadastro de produtos', 'Na loja',
      'Pendências', 'Inventário', 'Publicar na loja'];
    prova(JSON.stringify(abas.map((t) => t.replace(/\d+$/, '').trim())) === JSON.stringify(esperadas),
      `as seis abas do protótipo, nesta ordem (${abas.join(' · ')})`);

    prova((await p.locator('.mq-pagehead').first().textContent() || '')
      .includes('Operação e distribuição'), 'a sobrancelha é a do protótipo');
    prova(await p.getByRole('heading', { level: 1, name: 'Estoque' }).count() === 1,
      'o título é "Estoque", e não "Estoque Total"');
    prova(await p.getByRole('button', { name: /Conferir estoque/ }).count() === 1,
      'ação "Conferir estoque" presente');
    prova(await p.getByRole('button', { name: /Novo produto/ }).count() === 1,
      'ação "Novo produto" presente');

    if (KEY) {
      const rotulos = await p.locator('.mq-kpi__label').allTextContents();
      const cinco = ['Valor de referência', 'Peças em estoque', 'Em casa',
        'Com revendedoras', 'Precisam de atenção'];
      prova(cinco.every((r) => rotulos.includes(r)),
        `os cinco KPIs do protótipo (${rotulos.slice(0, 5).join(' · ')})`);

      const total = await p.locator('.mq-donut__label b').first().textContent();
      prova(!!total && total.trim() !== '0', `o donut do patrimônio tem número real (${total})`);

      const st = await api('/api/state');
      const somaProd = (st.json.produtos || []).reduce((n, x) => n + (x.qtd || 0), 0);
      prova(somaProd > 0, `o servidor devolve catálogo com saldo (${somaProd} peças)`);

      prova(await p.locator('.mq-bars__row').count() > 0,
        'as categorias aparecem como barras horizontais');
      prova(await p.getByRole('heading', { name: 'Todos os produtos' }).count() === 1,
        'a tabela de produtos é seção da Visão geral');
      prova(await p.locator('.mq-thumb').count() > 0, 'a FOTO é a primeira coluna da tabela');
    } else {
      pulo('KPIs, donut, barras e tabela de produtos — precisam de MQ_KEY');
    }
    await foto(p, '02-estoque');
    await ctx.close();
  }

  /* ══════════════════════════════════ 3 · Inventário */
  secao('3 · Inventário');
  if (!KEY) {
    pulo('o inventário inteiro — precisa de MQ_KEY');
  } else {
    /* 3.0 — nada de abrir um segundo por cima de um que já exista. */
    const jaAbertos = (await api('/api/inventarios')).json
      .filter((i) => i.status === 'aberto' || i.status === 'pausado');
    if (jaAbertos.length) {
      pulo(`JÁ EXISTE inventário em andamento (#${jaAbertos[0].id}) — não abro outro, `
        + 'e não mexo no que é de alguém');
    } else {
      const criado = await api('/api/inventarios', 'POST', {});
      prova(criado.status === 201 && !!criado.json.id, `iniciar: POST devolveu ${criado.status}`);
      inventarioAberto = criado.json.id;

      /* 3.1 — O QUE SE ESPERA EM CASA. A prova mais cara do roteiro. */
      const det = await api(`/api/inventarios/${inventarioAberto}`);
      const esperados = det.json.esperados || [];
      prova(esperados.length > 0, `o servidor manda a lista do esperado (${esperados.length} códigos)`);
      prova(esperados.length === det.json.cobertura.total,
        `a lista e a cobertura concordam (${esperados.length} = ${det.json.cobertura.total})`);

      const comMaleta = esperados.filter((e) => e.consignado > 0);
      if (!comMaleta.length) {
        pulo('nenhum código consignado no banco — a prova da maleta não tem sujeito hoje');
      } else {
        const todosCertos = comMaleta.every((e) => e.esperado === e.total - e.consignado);
        prova(todosCertos,
          `esperado = total − consignado em TODOS os ${comMaleta.length} códigos com maleta`);
        const ex = comMaleta[0];
        console.log(`       exemplo: ${ex.sku} · total ${ex.total} · com revendedoras `
          + `${ex.consignado} · esperado em casa ${ex.esperado}`);

        /* 3.2 — CONTAR o esperado numa peça consignada NÃO pode dar falta. */
        const c = await api(`/api/inventarios/${inventarioAberto}/itens`, 'POST',
          { sku: ex.sku, contado: ex.esperado });
        prova(c.status === 200 || c.status === 201,
          `contar: gravou a contagem de ${ex.sku} (${c.status})`);
      }

      /* 3.3 — contar mais um, para ter faltando e sobrando. */
      const semMaleta = esperados.filter((e) => e.consignado === 0 && e.esperado > 1).slice(0, 2);
      if (semMaleta.length === 2) {
        await api(`/api/inventarios/${inventarioAberto}/itens`, 'POST',
          { sku: semMaleta[0].sku, contado: semMaleta[0].esperado - 1 });
        await api(`/api/inventarios/${inventarioAberto}/itens`, 'POST',
          { sku: semMaleta[1].sku, contado: semMaleta[1].esperado + 1 });
      }

      /* 3.4 — PERSISTÊNCIA: releitura do servidor. */
      const relido = await api(`/api/inventarios/${inventarioAberto}`);
      prova((relido.json.contagem || []).length >= 1,
        `persistência no SERVIDOR: ${relido.json.contagem.length} contagens relidas`);

      /* 3.5 — PAUSAR e RETOMAR sem perder contagem. */
      const pausa = await api(`/api/inventarios/${inventarioAberto}/pausar`, 'POST', {});
      prova(pausa.json.status === 'pausado', `pausar: status ${pausa.json.status}`);
      const naPausa = await api(`/api/inventarios/${inventarioAberto}`);
      prova(naPausa.json.contagem.length === relido.json.contagem.length,
        'pausar não perdeu contagem');
      const segundo = await api('/api/inventarios', 'POST', {});
      prova(segundo.status === 409, `pausado não deixa abrir um segundo (${segundo.status})`);
      const volta = await api(`/api/inventarios/${inventarioAberto}/retomar`, 'POST', {});
      prova(volta.json.status === 'aberto', `retomar: status ${volta.json.status}`);
      const depois = await api(`/api/inventarios/${inventarioAberto}`);
      prova(depois.json.contagem.length === relido.json.contagem.length,
        'retomar devolveu a contagem inteira');

      /* 3.6 — a TELA: progresso, estados e o diálogo antes de finalizar. */
      const { ctx, p } = await abrir();
      await ir(p, '#/estoque/inventario');
      await p.waitForTimeout(1200);

      prova(await p.locator('.inventory-contexts .inventory-context').count() === 3,
        'os três cartões de contexto do protótipo');
      prova(await p.getByRole('heading', { name: 'Conferência do estoque em casa' }).count() === 1,
        'o cabeçalho da contagem em andamento');
      prova(await p.locator('.inventory-progress b').count() === 1, 'a barra de progresso existe');
      const pct = await p.locator('.inventory-progress > strong').textContent();
      prova(/%$/.test((pct || '').trim()), `o progresso em % (${pct})`);

      const estados = await p.locator('.count-row .mq-status').allTextContents();
      const unicos = [...new Set(estados.map((s) => s.trim()))];
      prova(unicos.includes('Conferido') || unicos.includes('Faltando') || unicos.includes('Sobrando'),
        `a tabela classifica as linhas (${unicos.join(' · ')})`);
      prova(unicos.includes('Não conferido'),
        'e "Não conferido" existe como estado próprio — não contado não é zero');

      /* A frase que impede a dúvida mais cara da contagem. */
      const temAviso = (await p.locator('.count-row small').allTextContents())
        .some((t) => /com revendedoras/.test(t));
      prova(temAviso || !comMaleta.length,
        'a linha diz quando o número da coluna Sistema não é o total');

      /* 3.7 — FINALIZAR pede confirmação, e NÓS RECUSAMOS. A base
         definitiva ainda não foi importada; congelar um retrato agora
         seria congelar o errado. */
      let dialogo = null;
      p.once('dialog', async (d) => { dialogo = d.message(); await d.dismiss(); });
      await p.getByRole('button', { name: 'Finalizar inventário' }).click();
      await p.waitForTimeout(600);
      prova(!!dialogo, 'finalizar NÃO é um clique a seco: abriu confirmação');
      if (dialogo) {
        prova(/Faltando|Sobrando|NAO conferidos/i.test(dialogo),
          'a confirmação mostra o resumo das divergências antes de congelar');
        prova(/NAO altera estoque/i.test(dialogo),
          'e diz que finalizar não altera estoque nenhum');
        console.log('       diálogo:', dialogo.replace(/\n/g, ' | ').slice(0, 220));
      }
      const aindaAberto = await api(`/api/inventarios/${inventarioAberto}`);
      prova(aindaAberto.json.status === 'aberto',
        'recusar a confirmação deixou o inventário ABERTO — nada foi congelado');

      await foto(p, '03-inventario');
      await ctx.close();
    }
  }

  /* ══════════════════════════════════ 4 · Venda normal */
  secao('4 · Venda normal');
  if (!KEY) {
    pulo('Venda normal — precisa de catálogo, e catálogo precisa de chave');
  } else {
    const { ctx, p } = await abrir();
    await ir(p, '#/vendas/nova');
    prova(await p.locator('[role="radiogroup"] [role="radio"]').count() === 3,
      'os TRÊS lançamentos estão na tela, juntos');
    const marcado = await p.locator('[role="radio"][aria-checked="true"]').textContent();
    prova(/Venda normal/.test(marcado || ''), `"Venda normal" está marcado (${marcado})`);
    prova(await p.getByRole('heading', { level: 1, name: 'Novo lançamento' }).count() === 1,
      'o cabeçalho é "Novo lançamento", uma vez só');
    prova(await p.locator('.mq-steps .mq-step').count() === 3,
      'os três passos: Itens → Cliente → Pagamento');
    /* Trocar de modo sem sair da tela é o ponto do protótipo. */
    await p.locator('[role="radio"]').nth(2).click();
    await p.waitForTimeout(800);
    prova(await p.locator('[role="radiogroup"] [role="radio"]').count() === 3,
      'trocar de modo NÃO destrói o seletor');
    prova((await p.url()).includes('/vendas/saida'), 'e o endereço acompanha a troca');
    await foto(p, '04-venda-normal');
    await ctx.close();
  }

  /* ══════════════════════════════════ 5 · Saída sem faturamento */
  secao('5 · Saída sem faturamento');
  if (!KEY) {
    pulo('Saída sem faturamento — idem');
  } else {
    const { ctx, p } = await abrir();
    await ir(p, '#/vendas/saida');
    prova(await p.locator('[role="radio"][aria-checked="true"]').count() === 1,
      'o seletor continua na tela, com a saída marcada');
    const corpo = (await p.locator('.mq-shell__main').textContent()) || '';
    for (const motivo of ['Brinde', 'Uso próprio', 'Perda', 'Sorteio']) {
      prova(corpo.includes(motivo), `o motivo "${motivo}" está disponível`);
    }
    /* NÃO registramos: registrar MOVIMENTA estoque real, e o banco do DEV é
       a cópia da operação. */
    pulo('registrar de fato — movimenta estoque real, fora do escopo deste smoke');
    await foto(p, '05-saida-sem-faturamento');
    await ctx.close();
  }

  /* ══════════════════════════════════ 6 · Análise de saídas */
  secao('6 · Análise de saídas');
  if (!KEY) {
    pulo('Análise de saídas — idem');
  } else {
    const { ctx, p } = await abrir();
    await ir(p, '#/estoque/saidas');
    prova(await p.getByRole('heading', { level: 1, name: 'Análise de saídas' }).count() === 1,
      'a tela de análise abre');
    const chips = await p.locator('[aria-label="Período"] button').allTextContents();
    prova(JSON.stringify(chips) === JSON.stringify(['Tudo', '30 dias', '7 dias']),
      `os atalhos do protótipo (${chips.join(' · ')})`);
    const texto = (await p.locator('.mq-shell__main').textContent()) || '';
    prova(texto.includes('Não informado'),
      'o custo aparece como "Não informado" — nunca inventado');
    prova(texto.includes('Não existe custo no sistema'),
      'e a tela explica por quê, em vez de deixar um zero mudo');
    prova(await p.locator('.mq-bars__row').count() === 4,
      'os quatro motivos aparecem na distribuição');
    await foto(p, '06-analise-saidas');
    await ctx.close();
  }
} finally {
  /* ═══ A LIMPEZA. Sempre, inclusive depois de uma exceção: um inventário
     aberto esquecido aqui impediria a Sthefany de abrir o dela. */
  if (inventarioAberto) {
    const c = await api(`/api/inventarios/${inventarioAberto}/cancelar`, 'POST', {});
    console.log(`\n[limpeza] inventário #${inventarioAberto} cancelado (${c.status}) — `
      + 'nenhum ajuste foi aplicado, nenhum movimento foi criado');
  }
  await navegador.close();
}

secao('fechamento');
prova(erros.length === 0, `nenhum erro de JavaScript no console (${erros.length})`);
for (const e of erros.slice(0, 8)) console.log('       ', e);
prova(externas.length === 0,
  `nenhuma requisição para fora do DEV além da foto da vitrine (${externas.length})`);
for (const e of externas.slice(0, 8)) console.log('       ', e);

/* As fotos da vitrine são DECLARADAS, não escondidas — e a miniatura é
   conferida: pedir a imagem de 1024px para uma célula de 46px é o que faz
   uma tabela de mil linhas travar no 4G. */
const cheias = [...fotosDaVitrine].filter((u) => !/-240-0\.[a-z]{3,4}(\?|$)/i.test(u));
console.log(`\n[vitrine] ${fotosDaVitrine.size} imagem(ns) da loja carregadas pelo navegador `
  + '(leitura de foto pública; a trava de escrita é do Worker e continua intocada)');
prova(cheias.length === 0,
  `todas pedidas como MINIATURA da CDN, não em tamanho cheio (${cheias.length} cheia(s))`);
for (const u of cheias.slice(0, 4)) console.log('       ', u);

console.log(`\nSmoke da V2: ${falhas} falha(s), ${pulados} pulada(s).`);
console.log(`evidências em ${FOTOS}/`);
if (!KEY) console.log('SEM MQ_KEY: tudo o que precisa de dado real ficou de fora.');
