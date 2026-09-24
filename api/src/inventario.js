/** Inventário — a conferência física do que está em casa.  §19 · Fase 4.4
 *
 *  Princípio que manda aqui: **o inventário não corrige nada sozinho.**
 *  Ele conta, compara e mostra a diferença. Transformar a diferença em
 *  saldo é um segundo ato, explícito, um código de cada vez — e mesmo
 *  esse ato vira movimentação (§19), nunca digitação de saldo.
 *
 *  O motivo é prático, não burocrático: uma peça "faltando" quase nunca
 *  sumiu. Ela está na bolsa, foi para a maleta sem lançar, ou a etiqueta
 *  não leu. Se o sistema zerasse o saldo por conta própria, o erro de
 *  contagem viraria a nova verdade e ninguém saberia disso depois.
 *
 *  ── O que a Fase 4.4 acrescentou, e por quê ────────────────────────────
 *  Desenho canônico: docs/domains/INVENTARIO-4-4.md (decisões D1–D13).
 *
 *   D1  a contagem é PAUSÁVEL e pode durar dias — `inventario_contagem`
 *       guarda linha a linha, desde o primeiro bipe;
 *   D2  **não contado nunca é zero.** A ausência de linha é o estado "não
 *       contado"; zero exige gesto explícito e vira `contado = 0`;
 *   D3  item não conferido não entra em lote e não aparece como faltante —
 *       um inventário parado pela metade não pode zerar meio catálogo;
 *   D4  SKU com variação cadastrada exige identidade de variação. Sem ela,
 *       não há movimento — era por aqui que o inventário FABRICAVA
 *       movimento incompleto novo, o defeito que a 4.4 existe para fechar;
 *   D5  "não sei" é resposta válida: bloqueia o SKU e não vira nada;
 *   D6/D7 a diferença dos dois lados vai por `saidas_sem_faturamento`,
 *       `tipo='perda'` — `saida` baixa, `entrada` devolve;
 *   D9  a ORIGEM do movimento continua `inventario`: o motivo diz que é
 *       diferença, a origem diz que o fato nasceu de uma contagem física;
 *   D10 comparação RETROAGIDA por `contado_em` — contar na segunda, vender
 *       na quarta e fechar na sexta não é divergência nenhuma;
 *   D11 sem identidade suficiente para provar a retroação, a linha vira
 *       `nao_comparavel` com o motivo escrito. Não se infere;
 *   D12 correção de erro é ESTORNO, nunca ajuste compensatório solto;
 *   D13 nenhum `UPDATE produtos SET qtd`. Tudo pela razão.
 *
 *  `inventario_itens` continua existindo e continua sendo lida, para os
 *  inventários fechados antes desta fase. Ela não recebe escrita nova.
 */
import { json } from './auth.js';
import { registrarSaida } from './saidas.js';
import { normSku } from './sku.js';

/** O que se espera encontrar em casa: total menos o que está com as
 *  revendedoras. É o mesmo "disponível" do §5.2 — peça consignada não
 *  está em casa e não pode ser cobrada da contagem. */
/** Kit fica de fora: ele nunca tem produtos.qtd próprio (é sempre 0, sem
 *  movimento nenhum), então "contar" um kit não diz nada sobre estoque —
 *  quem tem saldo de verdade para bipar são os componentes dele, que já
 *  aparecem aqui normalmente como qualquer outro produto.
 *
 *  Configuração montável (§42) fica de fora pelo mesmo motivo, e por um a
 *  mais: contá-la levaria a Sthefany a bipar um "Colar Casal" e a somá-lo
 *  às venezianas e pingentes que ela já contou — a dupla contagem que o
 *  modelo existe para impedir.
 *
 *  `qtd` e `consignado` voltam SEPARADOS além do `esperado` já somado: a
 *  comparação por variação precisa dos dois lados em separado para saber
 *  quanto da razão e quanto da consignação ficou sem identidade. */
const SQL_ESPERADO = `
  SELECT p.sku, p.desc, p.cat, p.preco, p.qtd,
         COALESCE((
           SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
             JOIN maletas m ON m.id = mi.maleta_id
            WHERE mi.sku = p.sku AND m.status IN ('aberta', 'em_acerto')
         ), 0) AS consignado,
         p.qtd - COALESCE((
           SELECT SUM(mi.qtd - mi.devolvida) FROM maleta_itens mi
             JOIN maletas m ON m.id = mi.maleta_id
            WHERE mi.sku = p.sku AND m.status IN ('aberta', 'em_acerto')
         ), 0) AS esperado
    FROM produtos p
   WHERE p.sku NOT IN (SELECT kit_sku FROM kit_componentes)
     AND p.sku NOT IN (SELECT sku_comercial FROM personalizacao_modelos
                        WHERE sku_comercial IS NOT NULL)`;

/** Um inventário "em andamento" é `aberto`, pausado ou não.
 *
 *  Pausar NÃO muda `status` (D1): mexe só em `pausado_em`. É essa escolha
 *  que faz o dashboard legado continuar retomando a contagem sem nenhuma
 *  alteração, e que impede abrir um segundo inventário por cima do que
 *  está parado. O estado "pausado" que a tela mostra é derivado. */
const EM_ANDAMENTO = `status = 'aberto'`;
/** Quanto de UMA variação está consignado. A identificação da maleta vem
 *  pelo `variante_id` quando alguém o disse, e pelo NOME quando não. O que
 *  não estiver identificado NÃO é distribuído por aqui: sobra como
 *  "consignado cego", e é ele que manda o código para `nao_comparavel`. */
const consignadaDe = (consignadas, v) => (
  (v.varianteId != null ? consignadas.get(v.varianteId) : undefined)
  ?? consignadas.get(v.nome) ?? 0);

const statusVisivel = (inv) => (inv.status === 'aberto' && inv.pausado_em ? 'pausado' : inv.status);

/** Chave de uma linha do retrato. O separador é um caractere que não pode
 *  aparecer em SKU nem em nome de variação: sem ele, "748801" + "Aro 16"
 *  colidiria com "748801 Aro" + "16". */
const CHAVE = (sku, variacao) => `${sku}\u0000${variacao || ''}`;

/* ═══════════════════════════════════════════════════ abrir, pausar, cancelar */

export async function abrirInventario(db) {
  const aberto = await db.prepare(
    `SELECT id FROM inventarios WHERE ${EM_ANDAMENTO} ORDER BY id DESC LIMIT 1`).first();
  if (aberto) {
    return json({ erro: 'Já existe um inventário em andamento.', id: aberto.id }, 409);
  }
  const r = await db.prepare(
    `INSERT INTO inventarios (status) VALUES ('aberto') RETURNING id, iniciado_em`).first();
  return json({ id: r.id, iniciadoEm: r.iniciado_em, status: 'aberto' }, 201);
}

/** D1 — pausar e retomar não tocam a contagem, porque não precisam: cada
 *  bipe já está gravado. Pausar é só o registro de que ela parou, para a
 *  tela poder dizer isso e para a cobertura fazer sentido ao lado. */
async function marcarPausa(db, id, pausar) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') {
    return json({ erro: 'Só dá para pausar ou retomar um inventário em andamento' }, 409);
  }
  await db.prepare(`UPDATE inventarios SET pausado_em = ${pausar ? `datetime('now')` : 'NULL'} WHERE id = ?`)
    .bind(id).run();
  const depois = await db.prepare(`SELECT pausado_em FROM inventarios WHERE id = ?`).bind(id).first();
  return json({
    ok: true, id,
    status: pausar ? 'pausado' : 'aberto',
    pausadoEm: depois.pausado_em ?? null,
    cobertura: await cobertura(db, id),
  });
}

export const pausarInventario = (db, id) => marcarPausa(db, id, true);
export const retomarInventario = (db, id) => marcarPausa(db, id, false);

/** §28: um inventário abandonado no meio é cancelado, não apagado —
 *  saber que uma contagem foi começada e largada também é informação. */
export async function cancelarInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') return json({ erro: 'Só dá para cancelar um inventário em andamento' }, 409);
  await db.prepare(
    `UPDATE inventarios SET status = 'cancelado', concluido_em = datetime('now') WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

/* ══════════════════════════════════════════════════════════ variações do SKU */

/** As variações CADASTRADAS de um SKU, com o saldo que a razão atribui a
 *  cada uma. O saldo de uma variação é a mesma soma de `movimentos.qtd`
 *  que fecha a invariante, com um filtro de identidade a mais — não existe
 *  segunda contabilidade para desencontrar.
 *
 *  O casamento é o mesmo de `pendencias.js › escolherVariacao`: pelo
 *  `variante_id` quando o movimento sabe dele, pelo NOME quando não sabe. */
async function variacoesComSaldo(db) {
  const { results } = await db.prepare(
    `SELECT pv.sku, pv.nome, pv.variante_id, pv.ordem,
            COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo
                       WHERE mo.sku = pv.sku
                         AND (mo.variante_id = pv.variante_id
                              OR (mo.variante_id IS NULL AND mo.variacao = pv.nome))), 0) AS saldo
       FROM produto_variacoes pv
      ORDER BY pv.sku, pv.ordem, pv.nome`).all();

  const porSku = new Map();
  for (const r of results ?? []) {
    if (!porSku.has(r.sku)) porSku.set(r.sku, []);
    porSku.get(r.sku).push({
      nome: r.nome,
      varianteId: r.variante_id == null ? null : String(r.variante_id),
      saldo: Number(r.saldo || 0),
    });
  }
  return porSku;
}

/** A régua de variações de UM código, sem o saldo.
 *
 *  Existe separada de propósito: contar é o gesto mais repetido do sistema
 *  — uma chamada por bipe — e a versão com saldo tem uma subconsulta sobre
 *  `movimentos` por variação. Ler a linha do produto para montar a régua é
 *  tudo o que a contagem precisa, e é o que evita transformar um inventário
 *  de 790 códigos numa varredura da razão inteira a cada peça. */
async function variacoesDoSku(db, sku) {
  const { results } = await db.prepare(
    `SELECT nome, variante_id FROM produto_variacoes WHERE sku = ? ORDER BY ordem, nome`)
    .bind(sku).all();
  return (results ?? []).map((r) => ({
    nome: r.nome,
    varianteId: r.variante_id == null ? null : String(r.variante_id),
  }));
}

/** Quanto de cada variação está consignado numa maleta que não encerrou.
 *
 *  Tabela nova (`maleta_item_variacoes`, pós-golive-1); banco que ainda não
 *  rodou a migration devolve vazio, e o comportamento é o mesmo de nunca
 *  ter identificado nada — que é justamente o que faz a comparação por
 *  variação parar em `nao_comparavel` em vez de chutar. */
async function consignadoPorVariacao(db) {
  const mapa = new Map();
  try {
    const { results } = await db.prepare(
      `SELECT mv.sku, mv.variacao, mv.variante_id, SUM(mv.qtd) AS qtd
         FROM maleta_item_variacoes mv
         JOIN maletas m ON m.id = mv.maleta_id
        WHERE m.status IN ('aberta', 'em_acerto')
        GROUP BY mv.sku, mv.variacao, mv.variante_id`).all();
    for (const r of results ?? []) {
      if (!mapa.has(r.sku)) mapa.set(r.sku, new Map());
      const m = mapa.get(r.sku);
      for (const chave of [r.variante_id == null ? null : String(r.variante_id), r.variacao]) {
        if (chave == null) continue;
        m.set(chave, (m.get(chave) || 0) + Number(r.qtd || 0));
        break;
      }
    }
  } catch { /* migration pendente: nenhuma consignação identificada */ }
  return mapa;
}

/* ═════════════════════════════════════════════════════════ contagem (D1, D2) */

async function inventarioEmAndamento(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return { erro: json({ erro: 'Inventário não encontrado' }, 404) };
  if (inv.status !== 'aberto') return { erro: json({ erro: 'Este inventário já foi fechado' }, 409) };
  return { inv };
}

/** Conta UMA linha: um SKU, ou um SKU numa variação. Upsert — reenviar o
 *  mesmo corpo com o número certo corrige o engano, e é assim que a tela
 *  desfaz uma bipada a mais.
 *
 *  D4 é cobrado aqui, e é a trava que impede o inventário de voltar a
 *  fabricar movimento sem variação: SKU com variação cadastrada NÃO aceita
 *  contagem agregada. O 409 devolve o cardápio dentro do erro, para a tela
 *  montar a régua sem inventar nome nenhum. */
export async function contarItem(db, id, corpo = {}) {
  const { inv, erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;

  const sku = normSku(corpo.sku);
  if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);

  const contado = Number(corpo.contado);
  /* D2 — zero é legítimo e significativo aqui: é "conferi, não tem
     nenhuma". O que não existe é contagem negativa. */
  if (!Number.isInteger(contado) || contado < 0) {
    return json({ erro: 'A contagem tem que ser um inteiro maior ou igual a zero.' }, 400);
  }

  const p = await db.prepare(
    `SELECT sku, desc FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo.`, sku, desconhecido: true }, 409);

  const forasDoInventario = await db.prepare(
    `SELECT 1 FROM produtos p
      WHERE p.sku = ?
        AND (p.sku IN (SELECT kit_sku FROM kit_componentes)
             OR p.sku IN (SELECT sku_comercial FROM personalizacao_modelos
                           WHERE sku_comercial IS NOT NULL))`).bind(sku).first();
  if (forasDoInventario) {
    return json({
      erro: `${p.desc} não tem saldo próprio — quem se conta são as peças que o compõem.`, sku,
    }, 409);
  }

  const cadastradas = await variacoesDoSku(db, sku);
  let variacao = String(corpo.variacao ?? '').trim();
  let varianteId = corpo.varianteId == null || corpo.varianteId === '' ? null : String(corpo.varianteId);

  if (cadastradas.length) {
    if (!variacao && !varianteId) {
      return json({
        erro: `${p.desc} tem variação cadastrada. Diga qual você contou.`,
        sku,
        variacoes: cadastradas.map((v) => ({ nome: v.nome, varianteId: v.varianteId })),
      }, 409);
    }
    const achada = varianteId
      ? cadastradas.find((v) => v.varianteId === varianteId)
      : cadastradas.find((v) => v.nome === variacao);
    if (!achada) {
      return json({
        erro: `"${varianteId ?? variacao}" não é uma variação cadastrada de ${sku}.`,
        sku,
        variacoes: cadastradas.map((v) => ({ nome: v.nome, varianteId: v.varianteId })),
      }, 409);
    }
    variacao = achada.nome;
    varianteId = achada.varianteId;
  } else if (variacao || varianteId) {
    return json({
      erro: `${p.desc} não tem variação cadastrada. Cadastre as variações antes de contar por variação.`,
      sku,
    }, 409);
  }

  const origem = corpo.origem === 'digitado' ? 'digitado' : 'bipagem';
  const linha = await db.prepare(
    `INSERT INTO inventario_contagem (inventario_id, sku, variacao, variante_id, contado, origem)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (inventario_id, sku, variacao) DO UPDATE
        SET contado = excluded.contado,
            variante_id = excluded.variante_id,
            origem = excluded.origem,
            contado_em = datetime('now')
     RETURNING *`,
  ).bind(id, sku, variacao || '', varianteId, contado, origem).first();

  return json({
    ok: true,
    sku, desc: p.desc,
    variacao: linha.variacao || null,
    varianteId: linha.variante_id ?? null,
    contado: linha.contado,
    contadoEm: linha.contado_em,
    cobertura: await cobertura(db, id),
    pausado: !!inv.pausado_em,
  });
}

/** Volta uma linha para "não contado" — que NÃO é zero (D2). Existe porque
 *  desfazer um engano tem de ter um caminho diferente de "conferi e não
 *  tem nenhuma": os dois são resultados diferentes da contagem. */
export async function descontarItem(db, id, sku, variacao) {
  const { erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;
  const alvo = normSku(sku);
  const r = await db.prepare(
    `DELETE FROM inventario_contagem
      WHERE inventario_id = ? AND sku = ? AND variacao = ?`)
    .bind(id, alvo, String(variacao ?? '').trim()).run();
  const removidas = Number(r?.meta?.changes ?? r?.meta?.rows_written ?? 0);
  return json({
    ok: true, sku: alvo, variacao: String(variacao ?? '').trim() || null,
    estado: 'nao_contado', removidas,
    cobertura: await cobertura(db, id),
  });
}

/** D5 — "não sei qual variação é" é resposta de primeira classe, não
 *  caminho de erro. A quantidade fica registrada, aparece no relatório e
 *  BLOQUEIA a aplicação daquele SKU inteiro, dizendo por quê. Ela nunca
 *  vira movimento: é exatamente a regra 2 do CLAUDE.md — não sabe qual aro
 *  saiu, não escreve. */
export async function registrarNaoIdentificado(db, id, corpo = {}) {
  const { erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;

  const sku = normSku(corpo.sku);
  if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);
  const qtd = Number(corpo.qtd);
  if (!Number.isInteger(qtd) || qtd < 0) {
    return json({ erro: 'A quantidade tem que ser um inteiro maior ou igual a zero.' }, 400);
  }

  const p = await db.prepare(`SELECT sku, desc FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo.`, sku, desconhecido: true }, 409);

  const cadastradas = await variacoesDoSku(db, sku);
  if (!cadastradas.length) {
    /* Sem variação cadastrada não existe "qual delas": a contagem normal já
       diz tudo o que há para dizer, e aceitar isto aqui criaria um bloqueio
       sem nada para resolver. */
    return json({
      erro: `${p.desc} não tem variação cadastrada — conte pelo código mesmo.`, sku,
    }, 409);
  }

  /* Zero apaga: é como ela desfaz um "não sei" depois de descobrir qual era. */
  if (qtd === 0) {
    await db.prepare(`DELETE FROM inventario_nao_identificado WHERE inventario_id = ? AND sku = ?`)
      .bind(id, sku).run();
    return json({ ok: true, sku, qtd: 0, bloqueia: false });
  }

  await db.prepare(
    `INSERT INTO inventario_nao_identificado (inventario_id, sku, qtd) VALUES (?, ?, ?)
     ON CONFLICT (inventario_id, sku) DO UPDATE
        SET qtd = excluded.qtd, contado_em = datetime('now')`,
  ).bind(id, sku, qtd).run();

  return json({
    ok: true, sku, desc: p.desc, qtd,
    bloqueia: true,
    aviso: `${qtd} ${qtd === 1 ? 'peça contada' : 'peças contadas'} de ${p.desc} sem dizer qual variação. `
      + 'Nenhuma diferença deste código será corrigida enquanto isso não for resolvido.',
  });
}

/** Quantos códigos do catálogo já receberam alguma contagem. É por aqui que
 *  a tela abre o relatório: "você conferiu 214 de 790 códigos". */
async function cobertura(db, id) {
  const [conferidos, total] = await Promise.all([
    db.prepare(`SELECT COUNT(DISTINCT sku) AS n FROM inventario_contagem WHERE inventario_id = ?`)
      .bind(id).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM (${SQL_ESPERADO})`).first(),
  ]);
  return { conferidos: Number(conferidos?.n || 0), total: Number(total?.n || 0) };
}

/* ═════════════════════════════════════════════ contagem em lote (dashboard legado) */

/** Rota preservada para o dashboard legado, que bipa por CÓDIGO e não sabe
 *  de variação. Substitui a contagem inteira em vez de somar: reenviar o
 *  mesmo lote duas vezes (rede ruim, botão clicado de novo) não dobra nada.
 *
 *  Um SKU com variação cadastrada entra aqui como contagem AGREGADA, na
 *  linha `variacao = ''`. Ela é gravada — a Sthefany contou, e a contagem
 *  dela é um fato — mas o fechamento a marca `nao_comparavel` (D4/D11) e
 *  nenhuma diferença dela vira movimento. É a diferença entre registrar o
 *  que ela viu e inventar de qual aro a peça saiu.
 *
 *  Códigos ausentes do corpo voltam a "não contado" (D2), e não a zero: é
 *  esta linha que impede um inventário parado pela metade de listar meio
 *  catálogo como faltante. */
export async function salvarContagem(db, id, { contados, desconhecidos }) {
  const { erro } = await inventarioEmAndamento(db, id);
  if (erro) return erro;

  const contaveis = new Set((await db.prepare(
    `SELECT sku FROM (${SQL_ESPERADO})`).all()).results.map((p) => p.sku));
  const catalogo = new Set((await db.prepare(`SELECT sku FROM produtos`).all()).results.map((p) => p.sku));

  const stmts = [db.prepare(`DELETE FROM inventario_contagem WHERE inventario_id = ?`).bind(id)];
  const fora = new Set(desconhecidos || []);
  let codigos = 0;

  for (const [bruto, qtd] of Object.entries(contados || {})) {
    const sku = normSku(bruto);
    if (!(qtd > 0)) continue;
    // um código que não está no catálogo não pode entrar na razão de
    // estoque — vai para a lista de avisos, que a tela mostra à parte
    if (!catalogo.has(sku)) { fora.add(bruto); continue; }
    // kit e configuração montável não se contam: quem tem saldo são as
    // peças que os compõem. Bipar um deles é aviso, não contagem.
    if (!contaveis.has(sku)) { fora.add(bruto); continue; }
    stmts.push(db.prepare(
      `INSERT INTO inventario_contagem (inventario_id, sku, variacao, contado, origem)
       VALUES (?, ?, '', ?, 'bipagem')`,
    ).bind(id, sku, qtd));
    codigos += 1;
  }
  stmts.push(db.prepare(`UPDATE inventarios SET desconhecidos_json = ? WHERE id = ?`)
    .bind(JSON.stringify([...fora]), id));

  await db.batch(stmts);
  return json({ ok: true, codigos });
}

/* ══════════════════════════════════════════════════════ fechamento (D3, D10, D11) */

/** A comparação de um inventário, linha a linha, com a retroação já feita.
 *  Devolve linhas puras — quem chama decide se congela (concluir) ou só
 *  mostra (resultado). */
async function comparar(db, id) {
  const produtos = (await db.prepare(SQL_ESPERADO).all()).results;
  const contagens = (await db.prepare(
    `SELECT sku, variacao, variante_id, contado, contado_em
       FROM inventario_contagem WHERE inventario_id = ?`).bind(id).all()).results ?? [];
  const naoIdentificados = new Map(((await db.prepare(
    `SELECT sku, qtd FROM inventario_nao_identificado WHERE inventario_id = ?`)
    .bind(id).all()).results ?? []).map((r) => [r.sku, Number(r.qtd)]));

  const porSku = new Map();
  for (const c of contagens) {
    if (!porSku.has(c.sku)) porSku.set(c.sku, []);
    porSku.get(c.sku).push(c);
  }

  const variacoes = await variacoesComSaldo(db);
  const consignadoVar = await consignadoPorVariacao(db);

  /* Movimentos posteriores a uma contagem, por SKU. Ler isto NÃO é
     adivinhar: eles estão registrados, com `criado_em`. É o que impede o
     desenho ingênuo de registrar sobra de 2 e devolver ao estoque duas
     peças que estão com a cliente (D10). */
  const deltaSku = async (sku, desde) => {
    const r = await db.prepare(
      `SELECT COALESCE(SUM(qtd), 0) AS d FROM movimentos
        WHERE sku = ? AND criado_em > ?`).bind(sku, desde).first();
    return Number(r?.d || 0);
  };
  const deltaVariacao = async (sku, v, desde) => {
    const r = await db.prepare(
      `SELECT COALESCE(SUM(qtd), 0) AS d FROM movimentos
        WHERE sku = ? AND criado_em > ?
          AND (variante_id = ? OR (variante_id IS NULL AND variacao = ?))`)
      .bind(sku, desde, v.varianteId, v.nome).first();
    return Number(r?.d || 0);
  };
  /* D11 — movimento do intervalo SEM identidade de variação num SKU que
     tem variação cadastrada. Não dá para saber de qual aro ele saiu, então
     a retroação daquele código não pode ser provada. */
  const cegosDepois = async (sku, desde) => {
    const r = await db.prepare(
      `SELECT COUNT(*) AS n FROM movimentos
        WHERE sku = ? AND criado_em > ? AND variacao IS NULL AND variante_id IS NULL`)
      .bind(sku, desde).first();
    return Number(r?.n || 0);
  };

  const avisoDelta = (d) => {
    if (!d) return null;
    const n = Math.abs(d);
    return d < 0
      ? `mexeu depois que você contou: ${n} ${n === 1 ? 'saída' : 'saídas'}`
      : `mexeu depois que você contou: ${n} ${n === 1 ? 'entrada' : 'entradas'}`;
  };

  const linhas = [];
  for (const p of produtos) {
    const contadas = porSku.get(p.sku) || [];
    const cadastradas = variacoes.get(p.sku) || [];
    const naoIdent = naoIdentificados.get(p.sku) || 0;
    const base = { sku: p.sku, desc: p.desc, cat: p.cat, preco: p.preco };

    /* ── SKU sem variação cadastrada: o caso da imensa maioria. */
    if (!cadastradas.length) {
      const c = contadas.find((x) => (x.variacao || '') === '');
      // nem tinha nem apareceu: fora do relatório, como sempre foi
      if (!c && !p.esperado) continue;
      if (!c) {
        linhas.push({ ...base, variacao: '', varianteId: null, contado: null,
          esperado: p.esperado, deltaPos: 0, dif: null, situacao: 'nao_conferido', motivo: null });
        continue;
      }
      const deltaPos = await deltaSku(p.sku, c.contado_em);
      const esperado = p.esperado - deltaPos;
      const dif = c.contado - esperado;
      linhas.push({ ...base, variacao: '', varianteId: null, contado: c.contado,
        esperado, deltaPos, dif,
        situacao: dif === 0 ? 'conferido' : (dif < 0 ? 'faltando' : 'sobrando'),
        motivo: null, aviso: avisoDelta(deltaPos) });
      continue;
    }

    /* ── SKU COM variação cadastrada. Aqui a 4.4 muda de regra: ou a
       identidade fecha inteira, ou o código não é comparável. */
    const saldoIdentificado = cadastradas.reduce((s, v) => s + v.saldo, 0);
    const razaoCega = p.qtd - saldoIdentificado;
    const consignadas = consignadoVar.get(p.sku) || new Map();
    const consignadoIdentificado = cadastradas.reduce(
      (s, v) => s + consignadaDe(consignadas, v), 0);
    const consignadoCego = p.consignado - consignadoIdentificado;
    const agregada = contadas.find((x) => (x.variacao || '') === '');
    const desdeMin = contadas.length
      ? contadas.map((x) => x.contado_em).sort()[0] : null;
    const cegos = desdeMin ? await cegosDepois(p.sku, desdeMin) : 0;

    const bloqueios = [];
    if (naoIdent) {
      bloqueios.push(`${naoIdent} ${naoIdent === 1 ? 'peça contada' : 'peças contadas'} sem dizer qual variação`);
    }
    if (agregada) {
      bloqueios.push(`${agregada.contado} ${agregada.contado === 1 ? 'peça contada' : 'peças contadas'} `
        + 'pelo código, sem separar a variação');
    }
    if (razaoCega !== 0) {
      const n = Math.abs(razaoCega);
      bloqueios.push(`${n} ${n === 1 ? 'peça' : 'peças'} na razão sem identidade de variação`);
    }
    if (consignadoCego !== 0) {
      const n = Math.abs(consignadoCego);
      bloqueios.push(`${n} ${n === 1 ? 'peça consignada' : 'peças consignadas'} sem variação identificada`);
    }
    if (cegos) {
      bloqueios.push(`${cegos} ${cegos === 1 ? 'movimento posterior' : 'movimentos posteriores'} `
        + 'à contagem sem identidade de variação');
    }

    /* Um código que NINGUÉM contou não é "não comparável": é não conferido,
       e não conferido não vira movimento nenhum de qualquer jeito. Marcar os
       setecentos códigos não bipados como não comparáveis afogaria a lista
       que existe justamente para ser lida uma a uma.
       Quando a razão do código tem peça sem identidade, a linha sai no nível
       do CÓDIGO: é o único número que dá para provar ali. */
    if (!contadas.length && !naoIdent) {
      if (razaoCega !== 0 || consignadoCego !== 0) {
        if (p.esperado) {
          linhas.push({ ...base, variacao: '', varianteId: null, contado: null,
            esperado: p.esperado, deltaPos: 0, dif: null, situacao: 'nao_conferido', motivo: null });
        }
        continue;
      }
      for (const v of cadastradas) {
        const esperadoHoje = v.saldo - consignadaDe(consignadas, v);
        if (!esperadoHoje) continue;
        linhas.push({ ...base, variacao: v.nome, varianteId: v.varianteId, contado: null,
          esperado: esperadoHoje, deltaPos: 0, dif: null, situacao: 'nao_conferido', motivo: null });
      }
      continue;
    }

    if (bloqueios.length) {
      const motivo = bloqueios.join('; ') + '. Não dá para provar de qual variação, e o inventário não chuta.';
      /* Uma linha por variação cadastrada, mais a agregada quando existir:
         quem lê precisa ver O QUE foi contado, mesmo sem poder corrigir. */
      for (const v of cadastradas) {
        const c = contadas.find((x) => (x.variacao || '') === v.nome);
        linhas.push({ ...base, variacao: v.nome, varianteId: v.varianteId,
          contado: c ? c.contado : null, esperado: v.saldo - consignadaDe(consignadas, v),
          deltaPos: 0, dif: null, situacao: 'nao_comparavel', motivo });
      }
      if (agregada) {
        linhas.push({ ...base, variacao: '', varianteId: null, contado: agregada.contado,
          esperado: p.esperado, deltaPos: 0, dif: null, situacao: 'nao_comparavel', motivo });
      }
      /* A quantidade sem identidade NÃO entra no retrato congelado: ela já
         vive em `inventario_nao_identificado`, e inventar uma chave para ela
         em `inventario_resultado` criaria uma variação que não existe. O
         relatório a remonta de lá, nas duas leituras. */
      if (naoIdent) {
        linhas.push({ ...base, variacao: '', varianteId: null,
          contado: naoIdent, esperado: 0, deltaPos: 0, dif: null,
          situacao: 'nao_comparavel', motivo, naoIdentificado: true, efemera: true });
      }
      continue;
    }

    for (const v of cadastradas) {
      const c = contadas.find((x) => (x.variacao || '') === v.nome);
      const consignadaDela = consignadaDe(consignadas, v);
      const esperadoHoje = v.saldo - consignadaDela;
      if (!c && !esperadoHoje) continue;
      if (!c) {
        linhas.push({ ...base, variacao: v.nome, varianteId: v.varianteId, contado: null,
          esperado: esperadoHoje, deltaPos: 0, dif: null, situacao: 'nao_conferido', motivo: null });
        continue;
      }
      const deltaPos = await deltaVariacao(p.sku, v, c.contado_em);
      const esperado = esperadoHoje - deltaPos;
      const dif = c.contado - esperado;
      linhas.push({ ...base, variacao: v.nome, varianteId: v.varianteId, contado: c.contado,
        esperado, deltaPos, dif,
        situacao: dif === 0 ? 'conferido' : (dif < 0 ? 'faltando' : 'sobrando'),
        motivo: null, aviso: avisoDelta(deltaPos) });
    }
  }
  return linhas;
}

/** As cinco listas do §7.3. `faltando` e `sobrando` mantêm exatamente o
 *  formato antigo — inclusive `sugestao` —, porque é o que a tela legada
 *  lê. As três listas novas são campos novos: quem não as conhece as
 *  ignora, e nada quebra. */
function relatorio(id, linhas, desconhecidos, cob, concluidoEm) {
  const faltando = [], sobrando = [], naoConferido = [], naoComparavel = [];
  let conferido = 0;

  for (const l of linhas) {
    if (l.situacao === 'conferido') { conferido += 1; continue; }
    if (l.situacao === 'nao_conferido') {
      naoConferido.push({ sku: l.sku, desc: l.desc, cat: l.cat,
        variacao: l.variacao || null, esperado: l.esperado });
      continue;
    }
    if (l.situacao === 'nao_comparavel') {
      naoComparavel.push({ sku: l.sku, desc: l.desc, cat: l.cat,
        variacao: l.naoIdentificado ? null : (l.variacao || null),
        naoIdentificado: !!l.naoIdentificado,
        contado: l.contado, motivo: l.motivo });
      continue;
    }
    const linha = {
      sku: l.sku, desc: l.desc, cat: l.cat, preco: l.preco,
      variacao: l.variacao || null, varianteId: l.varianteId,
      contado: l.contado, esperado: l.esperado, dif: l.dif, sugestao: l.dif,
      deltaPos: l.deltaPos, aviso: l.aviso ?? null,
      valor: (l.preco || 0) * Math.abs(l.dif),
      aplicado: false,
    };
    (l.dif < 0 ? faltando : sobrando).push(linha);
  }

  const ordena = (a, b) => b.valor - a.valor || String(a.desc).localeCompare(String(b.desc), 'pt');
  const ordenaSimples = (a, b) => String(a.desc).localeCompare(String(b.desc), 'pt');
  return {
    ok: true, id,
    concluidoEm,
    cobertura: cob,
    conferido,
    /* `conferidos` no nome antigo continua significando o que significava
       para a tela legada: quantas linhas bateram exatamente. */
    conferidos: conferido,
    pecasContadas: linhas.reduce((s, l) => s + (l.contado || 0), 0),
    faltando: faltando.sort(ordena),
    sobrando: sobrando.sort(ordena),
    naoConferido: naoConferido.sort(ordenaSimples),
    naoComparavel: naoComparavel.sort(ordenaSimples),
    desconhecidos,
  };
}

/** Fecha a contagem e CONGELA o resultado.
 *
 *  O esperado é congelado aqui, do mesmo jeito que a maleta congela o
 *  preço do envio (§6.1): sem isso, abrir um inventário de três meses
 *  atrás mostraria a diferença contra o estoque de hoje, e um inventário
 *  que muda de resultado depois de fechado não prova nada. A partir da
 *  4.4 o congelamento é por VARIAÇÃO, e é dele que a aplicação lê a
 *  quantidade — nunca do cliente. */
export async function concluirInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'aberto') return json({ erro: 'Este inventário já foi fechado' }, 409);

  const linhas = await comparar(db, id);
  const cob = await cobertura(db, id);

  const stmts = [db.prepare(`DELETE FROM inventario_resultado WHERE inventario_id = ?`).bind(id)];
  for (const l of linhas) {
    /* `efemera` é a linha do "não sei qual variação": ela não tem variação
       para servir de chave, e a fonte dela (`inventario_nao_identificado`)
       já é permanente. Congelá-la aqui inventaria uma variação. */
    if (l.efemera) continue;
    stmts.push(db.prepare(
      `INSERT INTO inventario_resultado
         (inventario_id, sku, variacao, variante_id, contado, esperado, delta_pos, dif, situacao, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, l.sku, l.variacao || '', l.varianteId ?? null,
      l.contado, l.esperado, l.deltaPos, l.dif, l.situacao, l.motivo ?? null));
  }
  stmts.push(db.prepare(
    `UPDATE inventarios SET status = 'concluido', pausado_em = NULL, concluido_em = datetime('now')
      WHERE id = ?`).bind(id));
  await db.batch(stmts);

  return json(relatorio(id, linhas, JSON.parse(inv.desconhecidos_json || '[]'), cob,
    new Date().toISOString().slice(0, 10)));
}

/** O retrato congelado, relido. É o que a tela abre depois de fechar a aba
 *  do relatório, e é a mesma fonte que a aplicação usa. */
export async function resultadoInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'concluido') {
    return json({ erro: 'Este inventário ainda não foi concluído', status: statusVisivel(inv) }, 409);
  }

  const { results } = await db.prepare(
    `SELECT r.*, p.desc, p.cat, p.preco,
            s.estornada AS saida_estornada
       FROM inventario_resultado r
       JOIN produtos p ON p.sku = r.sku
       LEFT JOIN saidas_sem_faturamento s ON s.id = r.saida_id
      WHERE r.inventario_id = ?`).bind(id).all();

  const linhas = (results ?? []).map((r) => ({
    sku: r.sku, desc: r.desc, cat: r.cat, preco: r.preco,
    variacao: r.variacao,
    naoIdentificado: false,
    varianteId: r.variante_id, contado: r.contado, esperado: r.esperado,
    deltaPos: r.delta_pos, dif: r.dif, situacao: r.situacao, motivo: r.motivo,
    aviso: r.delta_pos
      ? `mexeu depois que você contou: ${Math.abs(r.delta_pos)} `
        + `${Math.abs(r.delta_pos) === 1 ? (r.delta_pos < 0 ? 'saída' : 'entrada') : (r.delta_pos < 0 ? 'saídas' : 'entradas')}`
      : null,
    aplicadoEm: r.aplicado_em, saidaId: r.saida_id,
    /* Estornada volta a ser aplicável: o índice único libera o relançamento
       depois do estorno (D12), e a tela precisa dizer isso. */
    aplicado: !!r.aplicado_em && !r.saida_estornada,
  }));

  /* As peças contadas sem identidade continuam bloqueando o código depois
     do fechamento, e a tela precisa continuar dizendo por quê. A fonte é a
     tabela delas, não o retrato — ver `concluirInventario`. */
  const naoIdent = ((await db.prepare(
    `SELECT n.sku, n.qtd, p.desc, p.cat, p.preco FROM inventario_nao_identificado n
       JOIN produtos p ON p.sku = n.sku WHERE n.inventario_id = ?`).bind(id).all()).results) ?? [];
  for (const n of naoIdent) {
    const bloqueada = linhas.find((l) => l.sku === n.sku && l.situacao === 'nao_comparavel');
    linhas.push({
      sku: n.sku, desc: n.desc, cat: n.cat, preco: n.preco, variacao: '', varianteId: null,
      contado: n.qtd, esperado: 0, deltaPos: 0, dif: null, situacao: 'nao_comparavel',
      motivo: bloqueada ? bloqueada.motivo
        : `${n.qtd} ${n.qtd === 1 ? 'peça contada' : 'peças contadas'} sem dizer qual variação.`,
      naoIdentificado: true, aplicado: false, saidaId: null,
    });
  }

  const rel = relatorio(id, linhas.map((l) => ({ ...l, deltaPos: l.deltaPos })),
    JSON.parse(inv.desconhecidos_json || '[]'),
    /* A contagem não é apagada no fechamento: ela é o rastro de quem contou o
       quê e quando. A cobertura relida vem dela, e não das linhas do retrato,
       porque um código conferido e sem diferença não gera linha de retrato e
       sumiria da conta. */
    await cobertura(db, id),
    String(inv.concluido_em || '').slice(0, 10));

  /* O relatório recém-montado não sabe o que já foi aplicado; o retrato
     sabe. Marcar aqui evita duplicar a regra dentro de `relatorio`. */
  const aplicados = new Map(linhas.map((l) => [CHAVE(l.sku, l.variacao), l]));
  for (const lista of [rel.faltando, rel.sobrando]) {
    for (const linha of lista) {
      const fonte = aplicados.get(CHAVE(linha.sku, linha.variacao || ''));
      linha.aplicado = !!(fonte && fonte.aplicado);
      linha.saidaId = fonte ? fonte.saidaId : null;
    }
  }
  return json(rel);
}

/* ═══════════════════════════════════════════════ aplicar a diferença (D6–D9, D12) */

const rotuloVariacao = (v) => (v ? ` (${v})` : '');

/** Aplica a diferença de itens NOMEADOS, um movimento por linha.
 *
 *  Três coisas que este caminho garante, e que o `/ajustar` antigo não
 *  garantia:
 *
 *   · a quantidade vem do retrato CONGELADO, nunca do cliente — ela já foi
 *     decidida no fechamento, e aceitar um número novo aqui seria deixar a
 *     tela reabrir a comparação (§8);
 *   · a diferença vira `saidas_sem_faturamento` com `inventario_id`,
 *     variação, movimento amarrado e estorno possível (D6, D7, D8);
 *   · aplicar duas vezes é recusado pelo ÍNDICE do banco, não por um flag
 *     lido e escrito no mesmo batch — vale sob crash-e-retry e sob duas
 *     abas abertas.
 *
 *  Nada é escrito antes de todos os itens passarem na validação: um lote
 *  com um item inválido não aplica metade e reclama depois. */
async function aplicarDiferenca(db, id, pedidos) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);
  if (inv.status !== 'concluido') {
    return json({ erro: 'Só dá para corrigir depois de concluir a contagem' }, 409);
  }
  if (!pedidos.length) return json({ erro: 'Nenhum item informado' }, 400);

  const { results } = await db.prepare(
    `SELECT r.*, s.estornada AS saida_estornada
       FROM inventario_resultado r
       LEFT JOIN saidas_sem_faturamento s ON s.id = r.saida_id
      WHERE r.inventario_id = ?`).bind(id).all();
  const porChave = new Map((results ?? []).map((r) => [CHAVE(r.sku, r.variacao), r]));
  const porSku = new Map();
  for (const r of results ?? []) {
    if (!porSku.has(r.sku)) porSku.set(r.sku, []);
    porSku.get(r.sku).push(r);
  }

  /* ── validação, inteira, antes de qualquer escrita. */
  const alvos = [];
  const vistos = new Set();
  for (const pedido of pedidos) {
    const sku = normSku(pedido.sku);
    if (!sku) return json({ erro: 'Informe o código da peça.' }, 400);
    const temVariacao = pedido.variacao != null && String(pedido.variacao).trim() !== '';
    let linha;
    if (temVariacao) {
      linha = porChave.get(CHAVE(sku, String(pedido.variacao).trim()));
    } else {
      const doSku = (porSku.get(sku) || []).filter((r) => r.dif != null && r.dif !== 0);
      /* Regra 2 do CLAUDE.md: duas variações do mesmo código com diferença
         e nenhuma dita é exatamente "não sei qual aro saiu". Recusa. */
      if (doSku.length > 1) {
        return json({
          erro: `${sku} tem diferença em mais de uma variação. Diga qual você está corrigindo.`,
          sku,
          variacoes: doSku.map((r) => ({ variacao: r.variacao, dif: r.dif })),
        }, 409);
      }
      linha = doSku[0] ?? porChave.get(CHAVE(sku, ''));
    }

    if (!linha) return json({ erro: `${sku} não faz parte deste inventário`, sku }, 400);
    const chave = CHAVE(linha.sku, linha.variacao);
    if (vistos.has(chave)) {
      return json({ erro: `${sku}${rotuloVariacao(linha.variacao)} veio duas vezes no mesmo lote`, sku }, 400);
    }
    vistos.add(chave);

    /* D3 — não conferido nunca entra em correção. É a trava que impede um
       inventário parado pela metade de zerar meio catálogo. */
    if (linha.situacao === 'nao_conferido') {
      return json({
        erro: `${sku}${rotuloVariacao(linha.variacao)} não foi conferido neste inventário. `
          + 'Não contado não é zero, e não vira diferença.', sku,
      }, 409);
    }
    if (linha.situacao === 'nao_comparavel') {
      return json({
        erro: `${sku}${rotuloVariacao(linha.variacao)} não é comparável: ${linha.motivo}`,
        sku, motivo: linha.motivo,
      }, 409);
    }
    if (linha.dif == null || linha.dif === 0) {
      return json({ erro: `${sku}${rotuloVariacao(linha.variacao)} não tem diferença para corrigir`, sku }, 409);
    }
    if (linha.aplicado_em && !linha.saida_estornada) {
      return json({
        erro: `${sku}${rotuloVariacao(linha.variacao)} já foi corrigido neste inventário`,
        sku, saidaId: linha.saida_id,
      }, 409);
    }
    alvos.push({ linha, observacao: String(pedido.observacao ?? '').trim() || null });
  }

  /* ── escrita, item a item. */
  const data = String(inv.concluido_em || '').slice(0, 10).split('-').reverse().join('/');
  const aplicados = [];
  for (const { linha, observacao } of alvos) {
    const r = await registrarSaida(db, {
      tipo: 'perda',
      sentido: linha.dif < 0 ? 'saida' : 'entrada',
      sku: linha.sku,
      variacao: linha.variacao || null,
      varianteId: linha.variante_id,
      qtd: Math.abs(linha.dif),
      motivo: `Diferença de inventário #${id}`,
      observacao: observacao
        ?? `Inventário de ${data}: contado ${linha.contado}, sistema dizia ${linha.esperado}`,
      inventarioId: id,
    });
    if (!r.ok) {
      /* Anuncia em voz alta o que foi feito e o que não foi, em vez de
         devolver só o erro e deixar quem chamou supor (regra 9). */
      return json({
        erro: r.erro, sku: linha.sku, variacao: linha.variacao || null,
        aplicados, naoAplicados: alvos.length - aplicados.length,
      }, r.statusHttp ?? 409);
    }
    await db.prepare(
      `UPDATE inventario_resultado
          SET aplicado_em = datetime('now'), saida_id = ?
        WHERE inventario_id = ? AND sku = ? AND variacao = ?`)
      .bind(r.saida.id, id, linha.sku, linha.variacao).run();
    aplicados.push({
      sku: linha.sku, variacao: linha.variacao || null,
      qtd: linha.dif, saidaId: r.saida.id, movimentoId: r.saida.movimentoId,
      sentido: r.saida.sentido,
    });
  }
  return json({ ok: true, aplicados });
}

/** Rota nova. A quantidade não vem no corpo — o servidor usa a `dif`
 *  congelada (§8 do desenho). */
export async function aplicarInventario(db, id, { itens } = {}) {
  const pedidos = (itens || []).filter((i) => i && i.sku);
  return aplicarDiferenca(db, id, pedidos);
}

/** Rota PRESERVADA para o dashboard legado, que manda `{sku, qtd}`.
 *
 *  `qtd` é deliberadamente ignorado: ele já foi decidido no fechamento, e
 *  o corpo do cliente pode estar velho. O que a tela legada manda é
 *  exatamente a `sugestao` que ela recebeu do `/concluir`, então ignorar
 *  não muda nada no caminho feliz — e no caminho infeliz impede aplicar um
 *  número que não é mais o do retrato.
 *
 *  As duas mudanças de comportamento declaradas na Fase 2: passa a recusar
 *  item não contado e item não comparável. */
export async function ajustarInventario(db, id, { itens } = {}) {
  const pedidos = (itens || []).filter((i) => i && i.sku);
  if (!pedidos.length) return json({ erro: 'Nenhum ajuste informado' }, 400);
  return aplicarDiferenca(db, id, pedidos);
}

/* ══════════════════════════════════════════════════════════════════ leitura */

export async function detalheInventario(db, id) {
  const inv = await db.prepare(`SELECT * FROM inventarios WHERE id = ?`).bind(id).first();
  if (!inv) return json({ erro: 'Inventário não encontrado' }, 404);

  const contagem = ((await db.prepare(
    `SELECT c.sku, c.variacao, c.variante_id, c.contado, c.contado_em, c.origem, p.desc, p.cat, p.preco
       FROM inventario_contagem c JOIN produtos p ON p.sku = c.sku
      WHERE c.inventario_id = ? ORDER BY p.desc, c.variacao`).bind(id).all()).results) ?? [];
  const naoIdentificado = ((await db.prepare(
    `SELECT n.sku, n.qtd, p.desc FROM inventario_nao_identificado n
       JOIN produtos p ON p.sku = n.sku WHERE n.inventario_id = ?`).bind(id).all()).results) ?? [];

  /* `itens` é a forma ANTIGA, por código, e é o que o dashboard legado lê
     para retomar uma contagem. Ela soma as variações do mesmo SKU: a tela
     legada bipa por código e não sabe separá-las. O detalhe por variação
     vive em `contagem`, campo novo. */
  const agregado = new Map();
  for (const c of contagem) {
    const atual = agregado.get(c.sku) || { sku: c.sku, desc: c.desc, cat: c.cat, preco: c.preco, contado: 0 };
    atual.contado += c.contado;
    agregado.set(c.sku, atual);
  }

  /* Inventário fechado ANTES da 4.4 não tem linha em `inventario_contagem`.
     Ele continua legível, na tabela histórica, e continua certo. */
  let itens = [...agregado.values()].map((i) => ({ ...i, esperado: null, dif: null, ajustado: false }));
  let historico = false;
  if (!itens.length) {
    const antigos = ((await db.prepare(
      `SELECT ii.*, p.desc, p.cat, p.preco FROM inventario_itens ii
         JOIN produtos p ON p.sku = ii.sku
        WHERE ii.inventario_id = ? ORDER BY p.desc`).bind(id).all()).results) ?? [];
    if (antigos.length) {
      historico = true;
      itens = antigos.map((i) => ({
        sku: i.sku, desc: i.desc, cat: i.cat, preco: i.preco,
        contado: i.contado, esperado: i.esperado,
        dif: i.esperado === null ? null : i.contado - i.esperado,
        ajustado: !!i.ajustado,
      }));
    }
  }

  return json({
    id: inv.id,
    status: statusVisivel(inv),
    iniciadoEm: inv.iniciado_em, pausadoEm: inv.pausado_em ?? null, concluidoEm: inv.concluido_em,
    desconhecidos: JSON.parse(inv.desconhecidos_json || '[]'),
    historico,
    itens,
    contagem: contagem.map((c) => ({
      sku: c.sku, desc: c.desc, variacao: c.variacao || null, varianteId: c.variante_id,
      contado: c.contado, contadoEm: c.contado_em, origem: c.origem,
    })),
    naoIdentificado: naoIdentificado.map((n) => ({ sku: n.sku, desc: n.desc, qtd: n.qtd })),
    cobertura: await cobertura(db, id),
  });
}

export async function listarInventarios(db, limite = 20) {
  const r = await db.prepare(
    `SELECT i.*,
            (SELECT COUNT(*) FROM inventario_resultado x
              WHERE x.inventario_id = i.id AND x.dif IS NOT NULL AND x.dif <> 0) AS divergentes_novo,
            (SELECT COUNT(*) FROM inventario_itens x
              WHERE x.inventario_id = i.id AND x.esperado IS NOT NULL AND x.contado <> x.esperado) AS divergentes_antigo,
            (SELECT COALESCE(SUM(contado), 0) FROM inventario_contagem x WHERE x.inventario_id = i.id) AS pecas_novo,
            (SELECT COALESCE(SUM(contado), 0) FROM inventario_itens x WHERE x.inventario_id = i.id) AS pecas_antigo,
            (SELECT COUNT(*) FROM inventario_resultado x
              WHERE x.inventario_id = i.id AND x.situacao = 'nao_comparavel') AS nao_comparaveis
       FROM inventarios i ORDER BY i.id DESC LIMIT ?`).bind(limite).all();
  return json(r.results.map((i) => ({
    id: i.id,
    status: statusVisivel(i),
    iniciadoEm: i.iniciado_em, pausadoEm: i.pausado_em ?? null, concluidoEm: i.concluido_em,
    /* Inventário fechado antes da 4.4 só existe em `inventario_itens`; o de
       agora só existe nas tabelas novas. Cada linha lê a sua. */
    divergentes: i.pecas_novo || i.divergentes_novo ? i.divergentes_novo : i.divergentes_antigo,
    pecas: i.pecas_novo || i.pecas_antigo,
    naoComparaveis: i.nao_comparaveis,
  })));
}

/** O que o dashboard precisa saber sem pedir a lista inteira: tem contagem
 *  aberta agora? está pausada? quando foi a última? já venceu o prazo? */
export async function resumoInventario(db, prazoDias) {
  const [aberto, ultimo] = await Promise.all([
    db.prepare(`SELECT id, iniciado_em, pausado_em FROM inventarios WHERE ${EM_ANDAMENTO} ORDER BY id DESC LIMIT 1`).first(),
    db.prepare(`SELECT id, concluido_em FROM inventarios WHERE status = 'concluido' ORDER BY id DESC LIMIT 1`).first(),
  ]);

  let diasDesde = null;
  if (ultimo && ultimo.concluido_em) {
    const ms = Date.now() - Date.parse(ultimo.concluido_em.replace(' ', 'T') + 'Z');
    diasDesde = Math.max(0, Math.floor(ms / 86400000));
  }
  return {
    abertoId: aberto ? aberto.id : null,
    abertoEm: aberto ? aberto.iniciado_em : null,
    pausadoEm: aberto ? (aberto.pausado_em ?? null) : null,
    ultimoId: ultimo ? ultimo.id : null,
    ultimoEm: ultimo ? String(ultimo.concluido_em).slice(0, 10) : null,
    diasDesde,
    prazoDias,
    // nunca contou ainda também é "vencido": é o estado que mais precisa
    // aparecer, e não o que menos
    vencido: diasDesde === null || diasDesde >= prazoDias,
  };
}
