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

/** §54 — os motivos de "Ajustar estoque". Lista curta pelo mesmo motivo do
 *  desconto (§27) e da diferença de inventário: texto livre puro faz cada
 *  grafia virar um motivo diferente e nada agrupa. "Outro" exige a
 *  observação, que vira o rótulo. A V2 tem a mesma lista em
 *  `frontend/src/features/estoque/ajuste.ts` — os ids são o contrato. */
export const MOTIVOS_DE_AJUSTE = [
  { id: 'correcao_cadastro', rotulo: 'Correção de cadastro' },
  { id: 'contagem_fisica', rotulo: 'Contagem física' },
  { id: 'erro_entrada', rotulo: 'Erro de entrada' },
  { id: 'ajuste_administrativo', rotulo: 'Ajuste administrativo' },
  { id: 'outro', rotulo: 'Outro', livre: true },
];

const LIMITE_OBSERVACAO = 300;

/** §54 — AJUSTAR ESTOQUE: dizer qual é a quantidade CERTA, nunca digitar o
 *  saldo. O servidor calcula a diferença e grava UM movimento `ajuste` com
 *  o motivo e os dois números na observação; o histórico da peça mostra
 *  quem estava errado e por quê (§19).
 *
 *  Quatro recusas, todas antes de escrever:
 *   · `quantidadeAtual` diferente do saldo de agora — a tela estava velha
 *     (uma venda entrou no meio) e a diferença calculada seria outra;
 *   · total abaixo do que está com revendedoras — a peça na maleta existe;
 *     o caminho é o acerto da maleta, não o ajuste;
 *   · kit e configuração montável — não têm saldo próprio;
 *   · código com variação cuja razão SABE por aro e ninguém disse qual aro:
 *     regra 2, não se chuta a variante. Quando a razão não separa por aro
 *     (o caso comum), o ajuste vale para o código inteiro e é recusado se
 *     vier com aro — escrever num aro sem saldo o deixaria negativo.
 *
 *  `seco: true` devolve a prévia (de, para, diferença, em casa depois) sem
 *  gravar nada. */
export async function ajustarEstoque(db, sku, corpo = {}) {
  const saldos = await saldosDoSku(db, sku);
  if (!saldos) return json({ erro: `Código ${sku} não está no catálogo` }, 404);
  if (saldos.componentes || saldos.montagem) {
    return json({ erro: `${sku} não tem estoque próprio (é kit ou montagem): ajuste as peças que o compõem.` }, 409);
  }

  const inteiro = (v) => (v === '' || v == null ? NaN : Number(v));
  const para = inteiro(corpo.quantidadeCorreta);
  const de = inteiro(corpo.quantidadeAtual);
  if (!Number.isInteger(para) || para < 0) {
    return json({ erro: 'Informe a quantidade correta: um número inteiro, zero ou mais.' }, 400);
  }
  if (!Number.isInteger(de)) {
    return json({ erro: 'Informe a quantidade atual que você viu na tela.' }, 400);
  }
  if (de !== saldos.qtd) {
    return json({
      erro: `O estoque de ${sku} mudou enquanto você ajustava: era ${de}, agora é ${saldos.qtd}. Confira e tente de novo.`,
      quantidadeAtual: saldos.qtd,
    }, 409);
  }
  const diferenca = para - saldos.qtd;
  if (diferenca === 0) return json({ erro: 'A quantidade correta é igual à atual — nada a ajustar.' }, 400);
  if (para < saldos.consignado) {
    return json({
      erro: `${saldos.consignado} ${saldos.consignado === 1 ? 'peça está' : 'peças estão'} com revendedoras: `
        + 'o total não pode ficar abaixo disso. Se a peça não está na maleta, corrija a maleta primeiro.',
      consignado: saldos.consignado,
    }, 409);
  }

  const motivo = MOTIVOS_DE_AJUSTE.find((m) => m.id === String(corpo.motivo ?? '').trim());
  if (!motivo) {
    return json({ erro: 'Diga o motivo do ajuste.', motivos: MOTIVOS_DE_AJUSTE }, 400);
  }
  const observacao = String(corpo.observacao ?? '').trim();
  if (observacao.length > LIMITE_OBSERVACAO) {
    return json({ erro: `A observação é longa demais (máximo ${LIMITE_OBSERVACAO} caracteres).` }, 400);
  }
  if (motivo.livre && !observacao) {
    return json({ erro: 'Em "Outro", escreva o que aconteceu na observação.' }, 400);
  }

  /* Variação: a razão SABE por aro quando algum movimento do código tem
     identidade com saldo. Mesmo critério de `inventario.js › variacoesComSaldo`. */
  const variacao = String(corpo.variacao ?? '').trim() || null;
  const variacoes = (await db.prepare(
    `SELECT pv.nome, pv.variante_id,
            COALESCE((SELECT SUM(mo.qtd) FROM movimentos mo
                       WHERE mo.sku = pv.sku
                         AND (mo.variante_id = pv.variante_id
                              OR (mo.variante_id IS NULL AND mo.variacao = pv.nome))), 0) AS saldo
       FROM produto_variacoes pv WHERE pv.sku = ?`).bind(sku).all()).results ?? [];
  const identificada = variacoes.some((v) => Number(v.saldo) !== 0);
  let alvoVariacao = null;
  if (variacao) {
    alvoVariacao = variacoes.find((v) => v.nome === variacao);
    if (!alvoVariacao) return json({ erro: `${sku} não tem a variação "${variacao}"` }, 400);
    if (!identificada) {
      return json({
        erro: `O histórico de ${sku} não separa as peças por variação: o ajuste vale para o código inteiro. `
          + 'Tire a variação e ajuste o total.',
      }, 409);
    }
    if (Number(alvoVariacao.saldo) + diferenca < 0) {
      return json({ erro: `"${variacao}" tem ${alvoVariacao.saldo}; não dá para tirar ${-diferenca} dela.` }, 409);
    }
  } else if (identificada) {
    return json({
      erro: `${sku} tem estoque separado por variação. Diga em qual variação está a diferença.`,
      variacoes: variacoes.map((v) => ({ nome: v.nome, saldo: Number(v.saldo) })),
    }, 409);
  }

  const previa = {
    sku, de: saldos.qtd, para, diferenca,
    consignado: saldos.consignado,
    emCasaAntes: saldos.qtd - saldos.consignado,
    emCasaDepois: para - saldos.consignado,
    motivo: motivo.rotulo,
    variacao: alvoVariacao ? alvoVariacao.nome : null,
  };
  if (corpo.seco) return json({ ok: true, seco: true, ...previa });

  const rotulo = motivo.livre ? observacao : motivo.rotulo;
  const obs = `Ajuste de estoque · ${rotulo} · de ${saldos.qtd} para ${para}`
    + (alvoVariacao ? ` · ${alvoVariacao.nome}` : '')
    + (observacao && !motivo.livre ? ` · ${observacao}` : '');
  await db.batch(movimentar(db, {
    sku, tipo: 'ajuste', quantidade: diferenca, origem: 'ajuste',
    obs,
    variacao: alvoVariacao ? alvoVariacao.nome : null,
    varianteId: alvoVariacao ? alvoVariacao.variante_id : null,
  }));
  return json({ ok: true, ...previa, obs, saldos: await saldosDoSku(db, sku) });
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
