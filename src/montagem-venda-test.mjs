/** Fase 4, item 3 — a venda de uma montagem.
 *
 *  Duas coisas diferentes acontecem numa venda de "Colar Casal": a
 *  identidade comercial vai para o recibo, e as peças físicas saem da
 *  gaveta. Confundir as duas é o defeito central deste domínio — ou o
 *  colar vira três linhas que ninguém reconhece, ou o SKU comercial recebe
 *  uma baixa de estoque que ele não tem como sustentar.
 *
 *  Os defeitos que este teste existe para impedir:
 *
 *   1. o SKU comercial receber movimento — ele não tem saldo próprio;
 *   2. a Veneziana deixar de sair automaticamente, ou sair duas vezes;
 *   3. um quarto pingente entrar numa configuração de três — a composição
 *      arbitrária em tempo de venda que a decisão de 10/09/2026 proibiu;
 *   4. faltar peça e a venda passar assim mesmo;
 *   5. uma peça de fora do cardápio da configuração ser aceita;
 *   6. a base ser trocada pelo pedido — a troca foi revogada;
 *   7. o preço da composição virar a soma das peças, ou aceitar um valor
 *      digitado que não é o da configuração;
 *   8. duas cores iguais no mesmo grupo serem recusadas — repetir é
 *      permitido (decisão de 10/09/2026);
 *   9. o recibo virar peças soltas em vez de uma linha só.
 */
import assert from 'node:assert/strict';
import { prepararPersonalizacoes } from '../api/src/personalizacao.js';

const MODELOS = {
  casal: {
    id: 1, slug: 'casal', nome: 'Colar Casal', sku_comercial: '326660',
    base_sku_padrao: '444032', preco_sugerido: 129, ativo: 1,
    slots: [{ grupo: 'Menino', qtd: 1, ordem: 0 }, { grupo: 'Menina', qtd: 1, ordem: 1 }],
  },
  'dois-meninos-uma-menina': {
    id: 4, slug: 'dois-meninos-uma-menina', nome: 'Colar Filhos Dois Meninos e Uma Menina',
    sku_comercial: '314161', base_sku_padrao: '444032', preco_sugerido: 159, ativo: 1,
    slots: [{ grupo: 'Menino', qtd: 2, ordem: 0 }, { grupo: 'Menina', qtd: 1, ordem: 1 }],
  },
};
const OPCOES = [
  { componente_sku: '251551', grupo: 'Menino' },
  { componente_sku: '251552', grupo: 'Menino' },
  { componente_sku: '329494', grupo: 'Menino' },
  { componente_sku: '263236', grupo: 'Menina' },
  { componente_sku: '273470', grupo: 'Menina' },
];
const CATALOGO = {
  326660: { qtd: 1, preco: 129, desc: 'Colar Casal Banho de Ouro 18k' },
  314161: { qtd: 0, preco: 159, desc: 'Colar Filhos Dois Meninos e Uma Menina' },
  444032: { qtd: 10, preco: 74, desc: 'Colar Veneziana 45cm com Extensor' },
  251551: { qtd: 3, preco: 119, desc: 'Menino Azul' },
  251552: { qtd: 2, preco: 119, desc: 'Menino Incolor' },
  329494: { qtd: 1, preco: 119, desc: 'Menino Verde' },
  263236: { qtd: 5, preco: 119, desc: 'Menina Rosa Claro' },
  273470: { qtd: 2, preco: 119, desc: 'Menina Incolor' },
  888888: { qtd: 9, preco: 49, desc: 'Berloque Coração' },
};

/** D1 falso. Sem `run`, `batch` nem `exec`: preparar uma venda não escreve
 *  nada — quem escreve é `registrarVenda`, depois, num batch só. */
function bancoFalso({ produtos = CATALOGO, modelos = MODELOS, opcoes = OPCOES } = {}) {
  const porSkuComercial = Object.fromEntries(
    Object.values(modelos).map((m) => [m.sku_comercial, m]),
  );
  return {
    prepare(sql) {
      const limpo = sql.replace(/\s+/g, ' ').trim();
      let binds = [];
      const responder = () => {
        if (/FROM personalizacao_modelos WHERE \(id = \?/i.test(limpo)) {
          const [id, slug, sku] = binds;
          const m = Object.values(modelos).find(
            (x) => x.id === id || x.slug === slug || x.sku_comercial === sku,
          );
          return m ? [m] : [];
        }
        if (/FROM personalizacao_modelos WHERE sku_comercial = \?/i.test(limpo)) {
          const m = porSkuComercial[binds[0]];
          return m ? [m] : [];
        }
        if (/FROM personalizacao_slots/i.test(limpo)) {
          const m = Object.values(modelos).find((x) => x.id === binds[0]);
          return m ? m.slots : [];
        }
        if (/FROM personalizacao_opcoes/i.test(limpo)) return opcoes;
        if (/FROM produtos WHERE sku = \?/i.test(limpo)) {
          const p = produtos[binds[0]];
          return p ? [{ sku: binds[0], desc: p.desc, preco: p.preco ?? null, qtd: p.qtd }] : [];
        }
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

const preparar = (composicao, opcoes = {}) =>
  prepararPersonalizacoes(bancoFalso(opcoes.banco ?? {}), [composicao], opcoes);

const CASAL = {
  modeloSlug: 'casal',
  componentes: [{ componenteSku: '251551' }, { componenteSku: '263236' }],
};

/* 1, 2 e 9 — o que sai e o que aparece no recibo. */
{
  const r = await preparar(CASAL);
  assert.ok(!r.erro, r.erro && r.erro.erro);
  const p = r.preparadas[0];

  assert.deepEqual(
    p.movimentos.map((m) => `${m.sku}×${m.qtd}`).sort(),
    ['251551×1', '263236×1', '444032×1'],
    'as peças físicas baixadas não são a Veneziana mais as duas escolhas',
  );
  assert.ok(!p.movimentos.some((m) => m.sku === '326660'),
    'o SKU comercial recebeu movimento — configuração não tem saldo físico');
  assert.equal(p.movimentos.filter((m) => m.sku === '444032').length, 1,
    'a Veneziana saiu duas vezes');

  assert.equal(p.linha.sku, '326660', 'o recibo perdeu a identidade comercial');
  assert.equal(p.linha.qtd, 1, 'o recibo virou peças soltas');
  assert.equal(p.linha.preco, 129);
  assert.ok(p.linha.desc.includes('Colar Casal'));
  console.log('  ok   -1 Veneziana e -1 de cada escolha; o recibo é uma linha só');
}

/* 8 — duas cores iguais no mesmo grupo. */
{
  const r = await preparar({
    modeloSlug: 'dois-meninos-uma-menina',
    componentes: [
      { componenteSku: '251551' }, { componenteSku: '251551' }, { componenteSku: '263236' },
    ],
  });
  assert.ok(!r.erro, r.erro && r.erro.erro);
  const azul = r.preparadas[0].movimentos.find((m) => m.sku === '251551');
  assert.equal(azul.qtd, 2, 'dois azuis viraram um — repetir a mesma cor é permitido');
  /* Um movimento de qtd 2, e não dois de qtd 1: a razão registra a saída
     da peça, e duas linhas idênticas contariam a mesma escolha duas vezes
     no histórico sem dizer nada a mais. */
  assert.equal(r.preparadas[0].movimentos.length, 3,
    'as duas escolhas iguais deixaram de virar um movimento só');
  assert.equal(r.preparadas[0].slots.length, 3, 'as três posições precisam ficar registradas separadas');
  console.log('  ok   Azul + Azul é venda válida, e as duas posições ficam gravadas');
}

/* 3 — nem a mais, nem a menos. */
{
  const demais = await preparar({
    modeloSlug: 'casal',
    componentes: [
      { componenteSku: '251551' }, { componenteSku: '263236' }, { componenteSku: '273470' },
    ],
  });
  assert.equal(demais.erro.statusHttp, 409, 'um terceiro pingente entrou num Casal');
  assert.match(demais.erro.erro, /Menina/);

  const demenos = await preparar({ modeloSlug: 'casal', componentes: [{ componenteSku: '251551' }] });
  assert.equal(demenos.erro.statusHttp, 409, 'o Casal saiu sem a menina');
  console.log('  ok   as posições da configuração são exatas, para os dois lados');
}

/* 5 — peça de fora do cardápio. */
{
  const r = await preparar({
    modeloSlug: 'casal',
    componentes: [{ componenteSku: '888888' }, { componenteSku: '263236' }],
  });
  assert.equal(r.erro.statusHttp, 409);
  assert.match(r.erro.erro, /não é uma peça desta configuração/);
  console.log('  ok   peça fora do cardápio é recusada — sem composição inventada na venda');
}

/* 6 — a troca de base foi revogada. */
{
  const r = await preparar({ ...CASAL, baseSku: '453578' });
  assert.equal(r.erro.statusHttp, 409, 'a base foi trocada pelo pedido');
  assert.match(r.erro.erro, /sempre a base 444032/);

  const igual = await preparar({ ...CASAL, baseSku: '444032' });
  assert.ok(!igual.erro, 'mandar a MESMA base deixou de ser aceito — a tela manda');
  console.log('  ok   a Veneziana é automática e não é escolha');
}

/* 4 — falta de peça bloqueia a montagem, e a mensagem diz qual. */
{
  const r = await preparar({
    modeloSlug: 'dois-meninos-uma-menina',
    componentes: [
      { componenteSku: '329494' }, { componenteSku: '329494' }, { componenteSku: '263236' },
    ],
  });
  assert.equal(r.erro.statusHttp, 409, 'vendeu dois verdes tendo um');
  assert.equal(r.erro.sku, '329494', 'a recusa não diz qual peça faltou');
  assert.match(r.erro.erro, /1 disponível/);

  const semVeneziana = await preparar(CASAL, {
    banco: { produtos: { ...CATALOGO, 444032: { qtd: 0, preco: 74, desc: 'Veneziana' } } },
  });
  assert.equal(semVeneziana.erro.statusHttp, 409, 'montou colar sem corrente');
  assert.equal(semVeneziana.erro.sku, '444032');
  console.log('  ok   sem peça não há montagem, e a recusa diz qual peça');
}

/* 7 — o preço é da configuração. */
{
  const r = await preparar({ ...CASAL, preco: 99 });
  assert.equal(r.erro.statusHttp, 409, 'aceitou um preço digitado diferente do da configuração');
  assert.match(r.erro.erro, /129/);

  const semPreco = await preparar(CASAL, {
    banco: { modelos: { casal: { ...MODELOS.casal, preco_sugerido: null } } },
  });
  assert.equal(semPreco.erro.statusHttp, 409, 'vendeu configuração sem preço cadastrado');
  console.log('  ok   o preço é o da configuração, e sem preço não vende');
}

/* Configuração inativa não vende, e configuração inexistente é 400. */
{
  const inativa = await preparar(CASAL, {
    banco: { modelos: { casal: { ...MODELOS.casal, ativo: 0 } } },
  });
  assert.equal(inativa.erro.statusHttp, 409);

  const nenhuma = await preparar({ modeloSlug: 'tres-meninos', componentes: [{ componenteSku: '251551' }] });
  assert.equal(nenhuma.erro.statusHttp, 400, 'configuração não cadastrada foi aceita');
  console.log('  ok   configuração inativa ou não cadastrada não vende');
}

/* §7.4 — a venda retroativa não confere saldo e não baixa nada. */
{
  const r = await preparar(CASAL, {
    estoqueJaRefletido: true,
    banco: { produtos: { ...CATALOGO, 251551: { qtd: 0, preco: 119, desc: 'Menino Azul' } } },
  });
  assert.ok(!r.erro, 'o registro retroativo foi recusado por saldo de hoje');
  console.log('  ok   registro retroativo não confere o saldo de hoje');
}

/* O carrinho: duas montagens disputando a mesma peça. */
{
  const reservado = new Map();
  const db = bancoFalso();
  const r = await prepararPersonalizacoes(db, [
    { modeloSlug: 'casal', componentes: [{ componenteSku: '329494' }, { componenteSku: '263236' }] },
    { modeloSlug: 'casal', componentes: [{ componenteSku: '329494' }, { componenteSku: '273470' }] },
  ], {
    disponivelReal: (sku, bruto) => bruto - (reservado.get(sku) ?? 0),
    reservar: (sku, q) => reservado.set(sku, (reservado.get(sku) ?? 0) + q),
  });
  assert.equal(r.erro.statusHttp, 409,
    'as duas montagens levaram o mesmo pingente verde — só existe um');
  assert.equal(r.erro.sku, '329494');
  console.log('  ok   duas montagens no mesmo carrinho não vendem a mesma peça');
}

console.log('Venda de montagem: ok');
