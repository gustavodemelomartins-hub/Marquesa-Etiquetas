/** Fase 4, item 3 — uma configuração montável não tem saldo próprio.
 *
 *  "Colar Casal" é identidade de venda, não peça. As venezianas e os
 *  pingentes que ele consome já estão contados; contar o casal também
 *  somaria as mesmas peças uma segunda vez, e o valor do estoque passaria
 *  a incluir coisa que não existe na gaveta.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. `produtos.qtd` de uma configuração virar saldo vendável — e ele
 *      EXISTE em produção: `326660` tem 1, herdado de uma importação;
 *   2. desativar a configuração devolvê-la ao mundo dos produtos comuns,
 *      com o saldo legado junto;
 *   3. a disponibilidade sair de um número guardado em vez dos componentes;
 *   4. a Veneziana deixar de ser teto — vender montagem sem corrente;
 *   5. `2 Menino` ser lido como "dois SKUs diferentes de Menino", quando a
 *      decisão de 10/09/2026 permite repetir a mesma cor;
 *   6. cadastro pela metade (sem base ou sem slot) parecer vendável;
 *   7. peça comum passar a ser tratada como configuração.
 */
import assert from 'node:assert/strict';
import {
  saldosDoSku, montagensPossiveis, configuracaoDoSku, semSaldoProprio,
} from '../api/src/estoque.js';

/** D1 falso guiado por padrão de SQL. Escrever é impossível: não existe
 *  `run`, `batch` nem `exec` — nada aqui deveria escrever. */
function bancoFalso({ produtos = {}, modelo = null, slots = [], opcoes = [] }) {
  return {
    prepare(sql) {
      const limpo = sql.replace(/\s+/g, ' ').trim();
      let binds = [];
      const responder = () => {
        if (/FROM produtos WHERE sku = \?/i.test(limpo)) {
          const p = produtos[binds[0]];
          return p ? [{ sku: binds[0], desc: p.desc ?? binds[0], preco: p.preco ?? null, qtd: p.qtd }] : [];
        }
        if (/FROM personalizacao_modelos/i.test(limpo)) {
          return modelo && modelo.sku_comercial === binds[0] ? [modelo] : [];
        }
        if (/FROM personalizacao_slots/i.test(limpo)) return slots;
        if (/FROM personalizacao_opcoes/i.test(limpo)) return opcoes;
        if (/FROM kit_componentes/i.test(limpo)) return [];
        if (/FROM maleta_itens/i.test(limpo)) return [{ fora: 0 }];
        return [];
      };
      const stmt = {
        bind(...v) { binds = v; return stmt; },
        async all() { return { results: responder() }; },
        async first() { return responder()[0] ?? null; },
      };
      return stmt;
    },
  };
}

const MODELO = {
  id: 1, slug: 'casal', nome: 'Colar Casal', sku_comercial: '326660',
  base_sku_padrao: '444032', preco_sugerido: 129, ativo: 1,
};
const OPCOES = [
  { componente_sku: '251551', grupo: 'Menino' },
  { componente_sku: '251552', grupo: 'Menino' },
  { componente_sku: '329494', grupo: 'Menino' },
  { componente_sku: '263236', grupo: 'Menina' },
  { componente_sku: '273470', grupo: 'Menina' },
];
const CATALOGO = {
  /* O saldo legado real de produção: a configuração tem 1 em `produtos`. */
  326660: { qtd: 1, preco: 129, desc: 'Colar Casal Banho de Ouro 18k' },
  444032: { qtd: 10, preco: 74, desc: 'Colar Veneziana 45cm com Extensor' },
  251551: { qtd: 3, preco: 119, desc: 'Menino Azul' },
  251552: { qtd: 0, preco: 119, desc: 'Menino Incolor' },
  329494: { qtd: 1, preco: 119, desc: 'Menino Verde' },
  263236: { qtd: 5, preco: 119, desc: 'Menina Rosa Claro' },
  273470: { qtd: 2, preco: 119, desc: 'Menina Incolor' },
};

const casal = (extra = {}) => bancoFalso({
  produtos: CATALOGO, modelo: MODELO, opcoes: OPCOES,
  slots: [{ grupo: 'Menino', qtd: 1, ordem: 0 }, { grupo: 'Menina', qtd: 1, ordem: 1 }],
  ...extra,
});

/* 1 e 3 — o saldo legado não é estoque. */
{
  const s = await saldosDoSku(casal(), '326660');
  assert.equal(s.qtd, 0,
    'a configuração devolveu saldo próprio — produtos.qtd dela é resíduo, não peça');
  assert.equal(s.consignado, 0);
  assert.ok(s.montagem, 'a configuração não foi reconhecida como montagem');
  /* Menino: 3+0+1 = 4 · Menina: 5+2 = 7 · Veneziana 10 → min(10, 4, 7) */
  assert.equal(s.disponivel, 4, 'a disponibilidade deixou de vir dos componentes');
  assert.equal(s.preco, 129, 'a configuração perdeu o preço comercial dela');
  assert.ok(semSaldoProprio(s));
  console.log('  ok   configuração: qtd 0, disponível derivado dos componentes');
}

/* 4 — sem corrente não há montagem, por mais pingente que exista. */
{
  const db = casal({ produtos: { ...CATALOGO, 444032: { qtd: 0 } } });
  assert.equal((await saldosDoSku(db, '326660')).disponivel, 0,
    'vendeu montagem sem Veneziana — ela é obrigatória e é teto de todas');

  const dbUma = casal({ produtos: { ...CATALOGO, 444032: { qtd: 1 } } });
  assert.equal((await saldosDoSku(dbUma, '326660')).disponivel, 1,
    'a Veneziana deixou de limitar a montagem');
  console.log('  ok   a Veneziana é teto: sem ela, disponível zero');
}

/* 5 — dois slots do mesmo grupo somam o grupo, e repetir cor é permitido. */
{
  const doisMeninos = {
    ...MODELO, id: 2, slug: 'dois-meninos', sku_comercial: '311066', nome: 'Dois Meninos',
  };
  const db = bancoFalso({
    produtos: { ...CATALOGO, 311066: { qtd: 0, preco: 129 } },
    modelo: doisMeninos, opcoes: OPCOES,
    slots: [{ grupo: 'Menino', qtd: 2, ordem: 0 }],
  });
  /* Azul 3 · Incolor 0 · Verde 1 → soma 4 → floor(4/2) = 2.
     A regra recusada (cores distintas) daria min(2, 4−3) = 1. */
  assert.equal((await saldosDoSku(db, '311066')).disponivel, 2,
    'dois slots do mesmo grupo deixaram de somar o grupo — Azul + Azul é venda válida');

  const soAzul = bancoFalso({
    produtos: { ...CATALOGO, 311066: { qtd: 0 }, 251552: { qtd: 0 }, 329494: { qtd: 0 } },
    modelo: doisMeninos, opcoes: OPCOES,
    slots: [{ grupo: 'Menino', qtd: 2, ordem: 0 }],
  });
  assert.equal((await saldosDoSku(soAzul, '311066')).disponivel, 1,
    'com 3 azuis e mais nada, uma montagem tem de sair — repetir a cor é permitido');
  console.log('  ok   dois slots do mesmo grupo: floor(soma / 2), cor repetida vale');
}

/* 2 — configuração desativada continua sem saldo. */
{
  const db = casal({ modelo: { ...MODELO, ativo: 0 } });
  const s = await saldosDoSku(db, '326660');
  assert.ok(s.montagem, 'a configuração desativada voltou a ser produto comum');
  assert.equal(s.qtd, 0, 'o saldo legado reapareceu ao desativar a configuração');
  assert.equal(s.disponivel, 0, 'configuração desativada continuou vendável');
  console.log('  ok   desativar não devolve o saldo legado ao mundo dos produtos');
}

/* 6 — cadastro pela metade não é vendável. */
{
  const semSlot = casal({ slots: [] });
  assert.equal((await saldosDoSku(semSlot, '326660')).disponivel, 0,
    'configuração sem slot ficou vendável — seria um colar sem pingente nenhum');

  const semBase = casal({ modelo: { ...MODELO, base_sku_padrao: null } });
  assert.equal((await saldosDoSku(semBase, '326660')).disponivel, 0,
    'configuração sem base ficou vendável');
  console.log('  ok   cadastro pela metade vale zero, não "o que der"');
}

/* 7 — peça comum continua peça comum. */
{
  const db = casal();
  const s = await saldosDoSku(db, '263236');
  assert.equal(s.qtd, 5, 'o componente perdeu o saldo próprio');
  assert.equal(s.disponivel, 5);
  assert.ok(!s.montagem);
  assert.ok(!semSaldoProprio(s));
  assert.equal(await configuracaoDoSku(db, '263236'), null);
  console.log('  ok   componente físico continua com saldo, movimento e inventário');
}

/* A reserva do carrinho: duas montagens na mesma venda disputam a mesma
   peça, e o banco só muda no batch, lá no fim. */
{
  const db = casal();
  const cfg = await configuracaoDoSku(db, '326660');
  const reservado = new Map([['251551', 3], ['329494', 1]]);
  const disponivelDe = (sku, bruto) => bruto - (reservado.get(sku) ?? 0);
  assert.equal(await montagensPossiveis(db, cfg, disponivelDe), 0,
    'o grupo Menino inteiro estava reservado no carrinho e ainda sobrou montagem');
  console.log('  ok   o que outra linha do carrinho reservou não é vendido de novo');
}

console.log('Saldo de montagem: ok');
