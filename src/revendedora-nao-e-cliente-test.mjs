/** Revendedora não é cliente — e o dinheiro dela não some.
 *
 *  O defeito que este teste existe para impedir de voltar:
 *
 *    A planilha histórica tem UMA coluna para quem levou a peça, e nela
 *    convivem a cliente final e a revendedora que veio acertar a maleta.
 *    Sem separar as duas, a revendedora entrava no CRM como a maior
 *    cliente da casa: 46 linhas de "Maleta" num acerto de 36 peças viravam
 *    "Maior compra — R$ 2.368,80 numa venda só" num cartão de destaque.
 *
 *  O que precisa ficar provado:
 *
 *   1. a revendedora CADASTRADA sai do ranking, da lista e dos destaques;
 *   2. quem NÃO está cadastrada continua sendo cliente — o sistema não
 *      adivinha papel de ninguém pelo texto da observação;
 *   3. o FATURAMENTO continua contando o acerto: a venda aconteceu e o
 *      valor entrou. Só a CONTAGEM DE CLIENTES exclui a revendedora;
 *   4. a comissão estimada usa a régua do acerto real — faixa pelas
 *      banhadas, Prata 925 com 10% à parte — e bate com a conta feita à
 *      mão sobre os acertos verdadeiros da planilha;
 *   5. as premissas da estimativa viajam no payload. Estimativa rotulada é
 *      útil; estimativa disfarçada de extrato é mentira.
 *
 *  Teste puro: não sobe Worker e não toca a nuvem. O banco é um SQLite
 *  em memória criado a partir do `api/schema.sql` de verdade, com um adaptador
 *  mínimo que fala a mesma língua do D1 (`prepare().bind().all()/.first()`).
 *
 *      node src/revendedora-nao-e-cliente-test.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { visaoGeral, crm, acertosDeMaleta, clientesRanking } from '../api/src/analytics.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));

/* ─────────────────────────────────────────────── o adaptador de D1

   O `analytics.js` fala D1: `prepare(sql).bind(...).all()` devolve
   `{ results }`, `.first()` devolve a linha. O `node:sqlite` fala outra
   coisa. Este adaptador é a tradução — e é deliberadamente burro: se ele
   precisasse de lógica, ele estaria testando a si mesmo. */
function comoD1(sq) {
  const exec = (sql, binds) => ({
    all: async () => ({ results: sq.prepare(sql).all(...binds) }),
    first: async () => sq.prepare(sql).get(...binds) ?? null,
    run: async () => ({ meta: { changes: sq.prepare(sql).run(...binds).changes } }),
  });
  return {
    prepare: (sql) => ({ ...exec(sql, []), bind: (...b) => exec(sql, b) }),
    batch: async (stmts) => { for (const s of stmts) await s.run(); },
  };
}

const sq = new DatabaseSync(':memory:');
sq.exec(readFileSync(join(raiz, 'api/schema.sql'), 'utf8'));
const db = comoD1(sq);

/* ─────────────────────────────────────────────────────────── o cenário

   Os números dos acertos são os REAIS da planilha da Jessica Melim, com os
   itens reduzidos a um par por acerto (um de prata, um do resto): a
   comissão só depende dessas duas somas, e a conta tem de dar o mesmo. */
sq.exec(`INSERT INTO revendedoras (id, nome, status) VALUES
           (1, 'Jessica Melim', 'ativa'),
           (2, 'Beatriz Souza', 'inativa')`);

sq.exec(`INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash, linhas_total, linhas_importadas, status)
         VALUES (1, 'Vendas Marquesa.xlsx', 'hash-de-teste', 8, 8, 'importado')`);

let proximaVenda = 0;
let proximaLinha = 0;
/** Uma venda histórica reconstruída, com os itens que a compõem. */
function venda({ nome, norm, data, prata = 0, outros = 0, pecas = 1 }) {
  const id = ++proximaVenda;
  const total = +(prata + outros).toFixed(2);
  sq.prepare(
    `INSERT INTO vendas_historicas
       (id, lote_id, chave, classe, regra, cliente_nome, cliente_nome_norm, data,
        itens, pecas, valor_total, valor_pago, status, elegivel_ticket, canal)
     VALUES (?, 1, ?, 'venda', 'mesmo cliente + mesma data', ?, ?, ?, ?, ?, ?, ?, 'paga', 1, 'Maleta')`,
  ).run(id, `${norm}|${data}`, nome, norm, data, prata && outros ? 2 : 1, pecas, total, total);

  for (const [tipo, valor] of [['Prata 925', prata], ['Bruto', outros]]) {
    if (!valor) continue;
    sq.prepare(
      `INSERT INTO vendas_historico_itens
         (lote_id, origem_linha, cliente_nome_original, cliente_nome_norm, data,
          nome_produto_historico, tipo, qtd, valor_total, pago, canal, venda_historica_id)
       VALUES (1, ?, ?, ?, ?, ?, ?, 1, ?, 1, 'Maleta', ?)`,
    ).run(String(++proximaLinha), nome, norm, data, `Peça ${tipo}`, tipo, valor, id);
  }
  return id;
}

/* os três acertos verdadeiros da revendedora */
venda({ nome: 'Jessica Melim', norm: 'jessica melim', data: '2026-03-27', prata: 54.00, outros: 69.00, pecas: 2 });
venda({ nome: 'Jessica Melim', norm: 'jessica melim', data: '2026-06-13', prata: 62.30, outros: 2306.50, pecas: 36 });
venda({ nome: 'Jessica Melim', norm: 'jessica melim', data: '2026-07-18', prata: 0, outros: 694.45, pecas: 8 });

/* duas clientes de verdade, uma delas com mais dinheiro que a outra */
venda({ nome: 'Thais Nania', norm: 'thais nania', data: '2026-05-10', outros: 800.00, pecas: 5 });
venda({ nome: 'Thais Nania', norm: 'thais nania', data: '2026-06-02', outros: 400.00, pecas: 3 });
venda({ nome: 'Angela Alves', norm: 'angela alves', data: '2026-06-20', outros: 300.00, pecas: 2 });

/* e uma pessoa cujo nome NÃO está no cadastro de revendedoras, mesmo com a
   observação "Maleta": ela continua sendo cliente */
venda({ nome: 'Cinthia Noronha', norm: 'cinthia noronha', data: '2026-07-01', outros: 250.00, pecas: 2 });

console.log('\n── 1. a revendedora sai do CRM');
{
  const c = await crm(db, { periodo: 'tudo' });
  const nomes = c.todos.map((x) => x.nome);
  eq('a revendedora não está na lista de clientes', nomes.includes('Jessica Melim'), 'false');
  eq('as clientes de verdade estão', nomes.length, 3);
  eq('a campeã é a maior cliente REAL', c.insights.campeao.nome, 'Thais Nania');
  eq('e não a revendedora com o acerto de R$ 2.368,80',
    c.insights.maiorCompra.nome, 'Thais Nania');
  eq('quem tem "Maleta" na observação mas não é cadastrada continua cliente',
    nomes.includes('Cinthia Noronha'), 'true');
}

console.log('\n── 2. o dinheiro NÃO some');
{
  const g = await visaoGeral(db, { periodo: 'tudo' });
  /* 3.186,25 da revendedora + 1.750,00 das três clientes */
  eq('faturamento conta o acerto de maleta', g.faturamento, 4936.25);
  eq('peças também', g.pecas, 58);
  eq('mas a contagem de clientes exclui a revendedora', g.clientes, 3);
}

console.log('\n── 3. o ranking de clientes ignora a revendedora');
{
  const r = await clientesRanking(db, { periodo: 'tudo', limite: 50 });
  eq('total de clientes no ranking', r.total, 3);
  eq('primeira colocada', r.clientes[0].nome, 'Thais Nania');
  eq('a revendedora não aparece',
    r.clientes.some((c) => c.nome === 'Jessica Melim'), 'false');
}

console.log('\n── 4. a comissão estimada usa a régua do acerto real');
{
  const a = await acertosDeMaleta(db, { periodo: 'tudo' });
  eq('três acertos', a.totais.acertos, 3);
  eq('vendido', a.totais.vendido, 3186.25);
  /* 27/03: banhadas 69,00 → faixa de 0%; prata 54,00 × 10% = 5,40
     13/06: banhadas 2.306,50 → faixa de 30% = 691,95; prata 62,30 × 10% = 6,23
     18/07: banhadas 694,45 → faixa de 0%; sem prata                    */
  eq('comissão estimada', a.totais.comissao, 703.58);
  eq('líquido para a casa', a.totais.liquido, 2482.67);

  const junho = a.acertos.find((x) => x.data === '2026-06-13');
  eq('o acerto grande cai na faixa de 30%', junho.pct, 30);
  eq('e a prata dele é cobrada à parte, a 10%', junho.pctPrata, 10);
  eq('comissão do acerto grande', junho.comissao, 698.18);

  eq('uma revendedora com acerto no período', a.revendedoras.length, 1);
  eq('e ela é a Jessica', a.revendedoras[0].nome, 'Jessica Melim');
  eq('só as revendedoras entram aqui — nenhuma cliente',
    a.acertos.every((x) => x.revendedoraId === 1), 'true');
}

console.log('\n── 5. a estimativa se declara estimativa');
{
  const a = await acertosDeMaleta(db, { periodo: 'tudo' });
  eq('as premissas viajam com o número', a.premissas.length >= 3, 'true');
  eq('a peça bruta está declarada',
    a.premissas.some((p) => /bruta/i.test(p)), 'true');
  eq('e a validade das faixas no tempo também',
    a.premissas.some((p) => /faixas/i.test(p)), 'true');
  eq('a tela sabe se a régua é a configurada ou o padrão',
    typeof a.config.faixasConfiguradas, 'boolean');
}

console.log('\n── 6. sem revendedora cadastrada, nada muda');
{
  sq.exec('DELETE FROM revendedoras');
  const g = await visaoGeral(db, { periodo: 'tudo' });
  eq('todo mundo volta a ser cliente', g.clientes, 4);
  const a = await acertosDeMaleta(db, { periodo: 'tudo' });
  eq('e não há acerto nenhum para estimar', a.totais.acertos, 0);
  eq('nem revendedora para listar', a.revendedoras.length, 0);
}

sq.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
