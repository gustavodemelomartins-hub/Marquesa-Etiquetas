/** Comandos de escrita sobre a razão de estoque que ainda moravam dentro do
 *  despachante: lançar um movimento, repartir o saldo entre variações e
 *  desfazer a repartição que a sincronização fez sozinha.
 *
 *  O código é o mesmo, movido inteiro. Ele ainda devolve `Response` em vez de
 *  um resultado puro — separar decisão de formatação é trabalho da Fase 4,
 *  que trata razão e saldo. O que muda aqui é só o endereço: regra de estoque
 *  não pode morar na camada de transporte.
 *
 *  A invariante continua sendo a de sempre: `produtos.qtd == SUM(movimentos.qtd)`.
 *  Nada aqui escreve saldo direto; tudo passa por `movimentar`. */
import { json } from './auth.js';
import { movimentar, saldosDoSku } from './estoque.js';

/* Cópia deliberada do helper do despachante: `index.js` ainda precisa dele
   para os kits. Duas linhas duplicadas custam menos que um módulo de
   utilidades criado antes de haver terceiro caso. */
const int = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

export async function lancarMovimento(db, sku, { tipo, quantidade, obs, variacao }) {
  const p = await db.prepare(`SELECT sku FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo` }, 404);
  if (!tipo) return json({ erro: 'Informe o tipo do movimento' }, 400);
  const q = int(quantidade);
  if (q === 0) return json({ erro: 'Quantidade não pode ser zero' }, 400);

  /* Código vendido em mais de uma opção precisa dizer QUAL — senão a peça
     entra no total sem entrar em aro nenhum, e a repartição fica devendo
     sem ninguém perceber. */
  const temVar = await db.prepare(
    `SELECT COUNT(*) AS n FROM produto_variacoes WHERE sku = ?`).bind(sku).first();
  if (temVar.n > 0 && !variacao) {
    return json({ erro: `${sku} é vendido em mais de uma opção. Diga qual (variacao).` }, 400);
  }
  if (variacao) {
    const existe = await db.prepare(
      `SELECT 1 FROM produto_variacoes WHERE sku = ? AND nome = ?`).bind(sku, variacao).first();
    if (!existe) return json({ erro: `${sku} não tem a opção "${variacao}"` }, 400);
  }

  try {
    await db.batch(movimentar(db, { sku, tipo, quantidade: q, origem: 'manual', obs, variacao: variacao || null }));
  } catch (e) {
    return json({ erro: String(e.message || e) }, 400);
  }
  return json({ ok: true, saldos: await saldosDoSku(db, sku) });
}

/** Desfaz uma repartição automática que não devia ter acontecido.
 *
 *  A primeira versão de `semearVariacoes` servia as variações na ordem até o
 *  total acabar. Com a loja carregando a herança do bug antigo — o total do
 *  código inteiro dentro da primeira variação — isso entupia a primeira e
 *  zerava as demais. O freio da rodada barrou o empurrão, mas a repartição
 *  já tinha sido gravada aqui.
 *
 *  Não apaga movimento (§28): lança a contrapartida. O histórico continua
 *  mostrando que a repartição aconteceu e que foi desfeita, com o motivo.
 *
 *  Só mexe em código cuja repartição veio TODA da semeadura automática. Se
 *  alguém corrigiu qualquer coisa à mão, aquele código fica como está —
 *  desfazer trabalho de gente é justamente o que não pode acontecer. */
export async function desfazerSemeadura(db) {
  const auto = new Set((await db.prepare(
    `SELECT DISTINCT sku FROM movimentos
      WHERE origem = 'variacao' AND obs LIKE 'Repartido pela Nuvemshop%'`).all())
    .results.map(r => r.sku));
  if (!auto.size) return json({ ok: true, desfeitos: 0, motivo: 'nada foi semeado automaticamente' });

  const tocadoAMao = new Set((await db.prepare(
    `SELECT DISTINCT sku FROM movimentos
      WHERE variacao IS NOT NULL
        AND NOT (origem = 'variacao' AND obs LIKE 'Repartido pela Nuvemshop%')`).all())
    .results.map(r => r.sku));

  /* Agrupa pela MESMA chave que a razão usa hoje — nome E variante_id — e
     reverte com ela inteira. Reverter só pelo nome deixaria a soma do
     variante_id positiva e a do nome negativa: o total voltaria a zero, mas
     o casamento com a loja veria dois baldes que não fecham e travaria o
     código para sempre. */
  const saldos = (await db.prepare(
    `SELECT sku, variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
      WHERE variacao IS NOT NULL GROUP BY sku, variacao, variante_id`).all()).results;

  const stmts = [], desfeitos = new Set(), preservados = [...tocadoAMao].filter(s => auto.has(s));
  for (const r of saldos) {
    if (!auto.has(r.sku) || tocadoAMao.has(r.sku) || !r.saldo) continue;
    desfeitos.add(r.sku);
    stmts.push(...movimentar(db, {
      sku: r.sku, variacao: r.variacao, varianteId: r.variante_id,
      tipo: 'ajuste', quantidade: -r.saldo, origem: 'variacao',
      obs: `Repartição automática desfeita: a loja não sabia dizer quanto tem de "${r.variacao}"`,
    }));
    stmts.push(...movimentar(db, {
      sku: r.sku, tipo: 'ajuste', quantidade: r.saldo, origem: 'variacao',
      obs: `Repartição automática desfeita: "${r.variacao}" volta a ficar sem variação`,
    }));
  }

  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, desfeitos: desfeitos.size, preservados });
}

/** Reparte entre as variações um estoque que hoje é um número só.
 *
 *  É o passo que falta para os códigos com aro: o sistema sabe que existem 6
 *  anéis, mas não quantos são de cada aro. Repartir NÃO é corrigir o total —
 *  são dois atos diferentes, como no inventário (§19). Por isso a soma
 *  precisa bater com o que já existe, e a rota recusa quando não bate, em
 *  vez de escolher sozinha quem está certo.
 *
 *  Cada remanejo vira DOIS movimentos que se anulam no total: sai de "sem
 *  aro", entra no aro. Assim `produtos.qtd == SUM(movimentos.qtd)` continua
 *  valendo, e o histórico mostra a repartição em vez de um número que mudou
 *  sozinho. */
export async function repartirVariacoes(db, sku, { distribuicao, obs }) {
  const p = await db.prepare(`SELECT sku, qtd FROM produtos WHERE sku = ?`).bind(sku).first();
  if (!p) return json({ erro: `Código ${sku} não está no catálogo` }, 404);

  const vars = (await db.prepare(
    `SELECT nome, variante_id FROM produto_variacoes WHERE sku = ? ORDER BY ordem, nome`).bind(sku).all()).results;
  if (!vars.length) return json({ erro: `${sku} não tem variações para repartir` }, 400);

  const nomes = new Set(vars.map(v => v.nome));
  /* O id da variante viaja junto com o remanejo. Sem ele o movimento
     saberia "16" e nada mais, e "16" é nome que a loja pode renomear — o
     casamento na sincronização deixaria de encontrar a caixinha e o código
     travaria. Com o id, renomear lá não quebra nada aqui. */
  const idDe = new Map(vars.map(v => [v.nome, v.variante_id || null]));
  const idsValidos = new Set(vars.filter(v => v.variante_id).map(v => String(v.variante_id)));
  const nomeDoId = new Map(vars.filter(v => v.variante_id).map(v => [String(v.variante_id), v.nome]));

  const alvo = {};
  for (const [nome, q] of Object.entries(distribuicao || {})) {
    if (!nomes.has(nome)) return json({ erro: `${sku} não tem a opção "${nome}"` }, 400);
    const n = int(q);
    if (n < 0) return json({ erro: `Quantidade negativa em "${nome}"` }, 400);
    alvo[nome] = n;
  }

  const soma = Object.values(alvo).reduce((s, n) => s + n, 0);
  if (soma !== p.qtd) {
    return json({
      erro: `A soma das opções dá ${soma}, e o estoque de ${sku} é ${p.qtd}. ` +
            `Repartir não muda o total — se o total é que está errado, ajuste primeiro e reparta depois.`,
    }, 409);
  }

  /* Os saldos saem agrupados pelas DUAS chaves — nome e variante_id —
     porque é assim que a razão os guarda e é assim que a sincronização os
     lê. Agrupar só por nome faria a devolução de um saldo órfão sair por
     uma chave e o saldo original ficar na outra: os dois se anulariam no
     total e nenhum deles se anularia no casamento, deixando o código
     travado para sempre. */
  const baldes = (await db.prepare(
    `SELECT variacao, variante_id, SUM(qtd) AS saldo FROM movimentos
      WHERE sku = ? AND variacao IS NOT NULL GROUP BY variacao, variante_id`).bind(sku).all()).results;

  /* Órfão é o balde que a sincronização também não conseguiria casar: id
     que não existe mais na loja, ou — quando o movimento nem id tem — nome
     que sumiu de lá. A regra é a mesma dos dois lados de propósito; se
     divergirem, esta rota "resolveria" algo que a sincronização continuaria
     recusando. */
  const ehOrfao = (b) => (b.variante_id
    ? !idsValidos.has(String(b.variante_id))
    : !nomes.has(b.variacao));

  const atual = new Map();
  const orfaos = [];
  for (const b of baldes) {
    if (ehOrfao(b)) { if (b.saldo) orfaos.push(b); continue; }
    // Quem tem id vale pelo nome ATUAL daquele id, não pelo nome que o
    // movimento gravou: renomear na loja não pode desalinhar a conta.
    const chave = b.variante_id ? nomeDoId.get(String(b.variante_id)) : b.variacao;
    atual.set(chave, (atual.get(chave) || 0) + b.saldo);
  }

  const stmts = [];
  const razao = obs || `Repartição do estoque de ${sku}`;
  let movidas = 0;
  for (const nome of nomes) {
    const delta = (alvo[nome] ?? 0) - (atual.get(nome) || 0);
    if (!delta) continue;
    movidas += Math.abs(delta);
    // entra (ou sai) do aro...
    stmts.push(...movimentar(db, {
      sku, variacao: nome, varianteId: idDe.get(nome),
      tipo: 'ajuste', quantidade: delta,
      origem: 'variacao', obs: `${razao}: "${nome}" passa a ter ${alvo[nome] ?? 0}`,
    }));
    // ...e sai (ou entra) de "sem aro", para o total não se mexer
    stmts.push(...movimentar(db, {
      sku, tipo: 'ajuste', quantidade: -delta,
      origem: 'variacao', obs: `${razao}: contrapartida de "${nome}"`,
    }));
  }

  /* Saldo preso numa variação que a loja NÃO tem mais volta para "sem
     variação" na mesma operação, e volta pela MESMA chave em que estava.

     Sem isto o produto viraria um beco sem saída: o aro sai do ar na loja,
     a peça continua contada nele, o casamento por variante_id não acha
     caixinha nenhuma para ela, a sincronização bloqueia o código — e não
     haveria como desbloquear, porque repartir só enxergava as variações que
     ainda existem. A pessoa veria "precisa de revisão" para sempre, sem
     botão que resolvesse. */
  for (const b of orfaos) {
    stmts.push(...movimentar(db, {
      sku, variacao: b.variacao, varianteId: b.variante_id,
      tipo: 'ajuste', quantidade: -b.saldo, origem: 'variacao',
      obs: `${razao}: "${b.variacao}" não existe mais na loja e volta a ficar sem variação`,
    }));
    stmts.push(...movimentar(db, {
      sku, tipo: 'ajuste', quantidade: b.saldo, origem: 'variacao',
      obs: `${razao}: contrapartida de "${b.variacao}", que saiu da loja`,
    }));
  }

  if (!stmts.length) return json({ ok: true, movidas: 0, jaEstava: true });
  await db.batch(stmts);
  return json({
    ok: true, movidas,
    orfaosDevolvidos: orfaos.map(b => ({ nome: b.variacao, varianteId: b.variante_id, saldo: b.saldo })),
    saldos: await saldosDoSku(db, sku),
  });
}
