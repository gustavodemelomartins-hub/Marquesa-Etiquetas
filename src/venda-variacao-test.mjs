/** Fase 4, item 2 — a venda e a correção decidindo QUAL variação saiu.
 *
 *  `resolverVariantes` cuida do empurrão para a loja. Estes dois cuidam da
 *  peça física saindo da prateleira, e erram de forma pior: a loja pode ser
 *  corrigida na rodada seguinte, a peça não volta para a caixinha certa
 *  sozinha.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. código com duas variações vender "a primeira" em vez de perguntar —
 *      é o §2 do CLAUDE.md: nunca chutar a distribuição de uma variante;
 *   2. um `variante_id` que já não pertence ao código passar batido e a
 *      baixa cair numa caixinha que não existe mais;
 *   3. `null`/`''` deixarem de significar "não informado", ou o id `0`
 *      passar a ser lido como ausente;
 *   4. peça sem variação nenhuma parar de vender — a maioria do catálogo
 *      não tem variação, e a venda dela não pode exigir escolha;
 *   5. a correção de item repetir na correção o erro que a Central de
 *      Pendências existe para não cometer;
 *   6. a correção aceitar um código que não está no catálogo, trocando um
 *      erro conhecido por um desconhecido.
 */
import assert from 'node:assert/strict';
import { varianteDaVenda } from '../api/src/vendas-comandos.js';
import { corrigirItemDeVenda } from '../api/src/venda-correcao.js';

/** D1 falso guiado por padrão de SQL. Nenhuma escrita é possível: `batch`
 *  explode, porque nada aqui deveria escrever. */
function bancoFalso(responder, { permitirBatch = false } = {}) {
  const escritas = [];
  const lotes = [];
  return {
    escritas,
    lotes,
    prepare(sql) {
      const limpo = sql.replace(/\s+/g, ' ').trim();
      if (/^(INSERT|UPDATE|DELETE)/i.test(limpo)) escritas.push(limpo);
      let binds = [];
      /* O statement carrega `sql` e `binds` para o teste poder inspecionar
         o que foi para o batch. */
      const stmt = {
        sql: limpo,
        binds: null,
        bind(...v) { binds = v; stmt.binds = v; return stmt; },
        async all() { return { results: responder(limpo, binds) || [] }; },
        async first(coluna) {
          const r = (responder(limpo, binds) || [])[0] ?? null;
          return coluna === undefined ? r : (r == null ? null : r[coluna]);
        },
        async run() { throw new Error('run: este caminho não deveria escrever'); },
      };
      return stmt;
    },
    async batch(stmts) {
      if (!permitirBatch) throw new Error('batch: este caminho não deveria escrever');
      lotes.push(stmts);
      return (stmts || []).map(() => ({ meta: {} }));
    },
  };
}

/** Loja com as variantes que o código tem. */
const comVariantes = (variantes) => bancoFalso((sql, binds) => {
  if (/FROM loja_variantes WHERE sku_norm = \?/i.test(sql)) {
    return binds[0] === 'BR1234' ? variantes : [];
  }
  return [];
});

/* 4 — peça sem variação: vende sem identidade, e isso é o normal. */
{
  const r = await varianteDaVenda(comVariantes([]), 'BR1234', null);
  assert.deepEqual(r, { varianteId: null, variacao: null },
    'peça sem variação passou a exigir escolha — a maioria do catálogo não tem variação');
  console.log('  ok   peça sem variação vende sem identidade');
}

/* Uma variação só: usa ela, e não cobra saldo por variação. */
{
  const r = await varianteDaVenda(comVariantes([{ variante_id: 801, nome: '16' }]), 'BR1234', null);
  assert.equal(r.varianteId, '801');
  assert.equal(r.variacao, '16');
  assert.equal(r.exigeSaldo, false, 'variação única passou a exigir conferência de saldo por variação');
  assert.equal(typeof r.varianteId, 'string', 'o varianteId gravado no movimento deixou de ser texto');
  console.log('  ok   variação única é usada sem perguntar');
}

/* 1 — duas variações e ninguém disse qual: pergunta, não escolhe. */
{
  const db = comVariantes([{ variante_id: 801, nome: '16' }, { variante_id: 802, nome: '18' }]);
  const r = await varianteDaVenda(db, 'BR1234', null);
  assert.ok(r.erro, 'código com duas variações vendeu sem perguntar qual saiu');
  assert.match(r.erro, /mais de uma varia/i);
  assert.equal(r.varianteId, undefined, 'a resposta de erro trouxe uma variação escolhida');
  console.log('  ok   duas variações sem escolha param a venda com erro explícito');
}

/* 2 — id que não pertence mais ao código. */
{
  const db = comVariantes([{ variante_id: 801, nome: '16' }]);
  const r = await varianteDaVenda(db, 'BR1234', 999);
  assert.ok(r.erro, 'um variant_id estranho ao código passou batido');
  assert.match(r.erro, /não pertence mais/i);
  console.log('  ok   variant_id que saiu do código recusa em vez de baixar em caixinha errada');
}

/* 3 — o que conta como "informado". */
{
  const duas = [{ variante_id: 801, nome: '16' }, { variante_id: 802, nome: '18' }];

  for (const ausente of [null, undefined, '']) {
    const r = await varianteDaVenda(comVariantes(duas), 'BR1234', ausente);
    assert.ok(r.erro, `${JSON.stringify(ausente)} deixou de significar "não informado"`);
  }

  /* Tipo diferente casa: a loja manda número, a tela devolve texto. */
  const texto = await varianteDaVenda(comVariantes(duas), 'BR1234', '802');
  assert.equal(texto.varianteId, '802');
  assert.equal(texto.variacao, '18');
  assert.equal(texto.exigeSaldo, true, 'código com duas variações deixou de exigir saldo da variação');

  /* O id 0 é informado, não ausente. */
  const zero = await varianteDaVenda(comVariantes([{ variante_id: 0, nome: 'única' }]), 'BR1234', 0);
  assert.equal(zero.varianteId, '0', 'o variant_id 0 foi lido como ausente');
  assert.equal(zero.erro, undefined);
  console.log('  ok   null/vazio são "não informado"; 0 é um id; o tipo não atrapalha');
}

/* ═══════════════════════════════════ correção de item */

/** Banco mínimo para a correção chegar até a decisão de variação. */
const paraCorrecao = ({ variacoes = [], itemExiste = true, permitirBatch = false }) => bancoFalso((sql, binds) => {
  if (/FROM produtos WHERE sku = \?/i.test(sql)) {
    return [{ sku: binds[0], desc: 'Anel ' + binds[0], preco: 100, qtd: 5 }];
  }
  if (/FROM kit_componentes/i.test(sql)) return [];
  if (/FROM maleta_itens/i.test(sql)) return [{ fora: 0 }];
  if (/FROM vendas WHERE id = \?/i.test(sql)) return [{ id: binds[0], cancelada: 0 }];
  if (/FROM venda_itens/i.test(sql)) {
    return itemExiste ? [{ linha: 1, sku: binds[1], qtd: 1, variacao: null, variante_id: null }] : [];
  }
  if (/FROM produto_variacoes WHERE sku = \?/i.test(sql)) return variacoes;
  if (/FROM movimentos/i.test(sql)) return [{ id: 1, saldo: 5 }];
  return [];
}, { permitirBatch });

/* 5 — código novo com duas variações e nada informado. */
{
  const db = paraCorrecao({
    variacoes: [{ nome: '16', variante_id: 801 }, { nome: '18', variante_id: 802 }],
  });
  const r = await corrigirItemDeVenda(db, {
    fonte: 'operacional', vendaId: 7, sku: 'AA1111', skuNovo: 'BB2222',
  });
  assert.equal(r.statusHttp, 409, 'a correção escolheu uma variação sozinha');
  assert.equal(r.ok, false);
  assert.match(r.erro, /mais de uma varia/i);
  assert.deepEqual(r.variacoes, [
    { nome: '16', varianteId: 801 }, { nome: '18', varianteId: 802 },
  ], 'a recusa deixou de devolver as opções — quem corrige fica sem o que escolher');
  assert.deepEqual(db.escritas, [], 'a correção recusada escreveu no banco');
  console.log('  ok   correção com duas variações devolve as opções em vez de escolher');
}

/* Uma variação só: a correção não pergunta, e a baixa nova sai NA variação
   resolvida — é o mesmo casamento que a venda faria. */
{
  const db = paraCorrecao({
    variacoes: [{ nome: '16', variante_id: 801 }], permitirBatch: true,
  });
  const r = await corrigirItemDeVenda(db, {
    fonte: 'operacional', vendaId: 7, sku: 'AA1111', skuNovo: 'BB2222',
    variacaoNova: '16', varianteIdNovo: 801,
  });
  assert.notEqual(r.statusHttp, 409,
    'código com a variação informada passou a exigir escolha na correção');
  const gravados = (db.lotes[0] || []).map((x) => x.sql).filter((q) => /INSERT INTO movimentos/i.test(q));
  assert.equal(gravados.length, 2,
    'a correção deixou de estornar a peça errada e baixar a certa — dois movimentos, nem mais nem menos');
  console.log('  ok   correção resolvida grava o estorno e a baixa, na variação informada');
}

/* 6 — código novo fora do catálogo, e o código igual ao que já está lá. */
{
  const semCatalogo = bancoFalso(() => []);
  const r = await corrigirItemDeVenda(semCatalogo, {
    fonte: 'operacional', vendaId: 7, sku: 'AA1111', skuNovo: 'ZZ9999',
  });
  assert.equal(r.statusHttp, 400);
  assert.match(r.erro, /não está no catálogo/i);

  const mesmo = await corrigirItemDeVenda(paraCorrecao({}), {
    fonte: 'operacional', vendaId: 7, sku: 'BB2222', skuNovo: 'BB2222',
  });
  assert.equal(mesmo.statusHttp, 409, 'corrigir para o mesmo código deixou de ser recusado');

  const semFonte = await corrigirItemDeVenda(paraCorrecao({}), { vendaId: 7, skuNovo: 'BB2222' });
  assert.equal(semFonte.statusHttp, 400, 'a correção aceitou não saber se a venda é do sistema ou da planilha');
  console.log('  ok   código fora do catálogo, código igual e fonte ausente são recusados');
}

console.log('Variação na venda e na correção: ok');
