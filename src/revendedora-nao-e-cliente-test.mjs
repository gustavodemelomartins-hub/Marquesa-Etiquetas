/** A mesma pessoa pode ser cliente e revendedora em momentos diferentes.
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
 *   1. o papel é da OPERAÇÃO, não do cadastro da pessoa;
 *   2. a compra pessoal anterior continua no CRM;
 *   3. acertos documentais saem de Vendas e entram em Revendedoras;
 *   4. vendido, comissão e líquido são os números exatos do documento;
 *   5. sem decisão explícita, a operação continua cliente — nada é inferido
 *      pelo texto "Maleta" nem pelo cadastro atual da pessoa.
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

/* Uma compra pessoal e dois acertos da mesma pessoa. */
venda({ nome: 'Jessica Melim', norm: 'jessica melim', data: '2026-03-27', prata: 54.00, outros: 69.00, pecas: 2 });
venda({ nome: 'Jessica Melim', norm: 'jessica melim', data: '2026-06-13', prata: 62.30, outros: 2306.50, pecas: 36 });
venda({ nome: 'Jessica Melim', norm: 'jessica melim', data: '2026-07-18', prata: 0, outros: 694.45, pecas: 8 });

sq.exec(`INSERT INTO historico_operacoes
  (lote_id, venda_chave, fingerprint, papel, cliente_nome_norm,
   revendedora_id, pecas, bruto_centavos, comissao_centavos, liquido_centavos)
VALUES
  (1, 'jessica melim|2026-03-27', 'pessoal-jessica', 'cliente', 'jessica melim',
   NULL, NULL, NULL, NULL, NULL),
  (1, 'jessica melim|2026-06-13', 'maleta-1-jessica', 'acerto', NULL,
   1, 36, 343100, 106220, 236880),
  (1, 'jessica melim|2026-07-18', 'maleta-2-jessica', 'acerto', NULL,
   1, 8, 81700, 12255, 69445)`);

/* duas clientes de verdade, uma delas com mais dinheiro que a outra */
venda({ nome: 'Thais Nania', norm: 'thais nania', data: '2026-05-10', outros: 800.00, pecas: 5 });
venda({ nome: 'Thais Nania', norm: 'thais nania', data: '2026-06-02', outros: 400.00, pecas: 3 });
venda({ nome: 'Angela Alves', norm: 'angela alves', data: '2026-06-20', outros: 300.00, pecas: 2 });

/* e uma pessoa cujo nome NÃO está no cadastro de revendedoras, mesmo com a
   observação "Maleta": ela continua sendo cliente */
venda({ nome: 'Cinthia Noronha', norm: 'cinthia noronha', data: '2026-07-01', outros: 250.00, pecas: 2 });

console.log('\n── 1. somente os acertos saem do CRM');
{
  const c = await crm(db, { periodo: 'tudo' });
  const nomes = c.todos.map((x) => x.nome);
  eq('a compra pessoal mantém Jéssica na lista', nomes.includes('Jessica Melim'), 'true');
  eq('há quatro clientes reais', nomes.length, 4);
  eq('Jéssica tem só uma compra pessoal', c.todos.find((x) => x.nome === 'Jessica Melim').vendas, 1);
  eq('essa compra pessoal vale R$ 123', c.todos.find((x) => x.nome === 'Jessica Melim').faturamento, 123);
  eq('a campeã é a maior cliente REAL', c.insights.campeao.nome, 'Thais Nania');
  eq('e não a revendedora com os acertos documentais',
    c.insights.maiorCompra.nome, 'Thais Nania');
  eq('quem tem "Maleta" na observação mas não é cadastrada continua cliente',
    nomes.includes('Cinthia Noronha'), 'true');
}

console.log('\n── 2. Vendas contém só compras pessoais');
{
  const g = await visaoGeral(db, { periodo: 'tudo' });
  /* 123 da Jéssica + 1.750 das demais clientes. */
  eq('faturamento não mistura acerto', g.faturamento, 1873);
  eq('peças de clientes apenas', g.pecas, 14);
  eq('a pessoa cliente e revendedora conta uma vez no CRM', g.clientes, 4);
}

console.log('\n── 3. o ranking usa só compras pessoais');
{
  const r = await clientesRanking(db, { periodo: 'tudo', limite: 50 });
  eq('total de clientes no ranking', r.total, 4);
  eq('primeira colocada', r.clientes[0].nome, 'Thais Nania');
  eq('Jéssica aparece somente pelos R$ 123 pessoais',
    r.clientes.find((c) => c.nome === 'Jessica Melim').faturamento, 123);
}

console.log('\n── 4. comissão e líquido vêm exatos dos documentos');
{
  const a = await acertosDeMaleta(db, { periodo: 'tudo' });
  eq('dois acertos', a.totais.acertos, 2);
  eq('vendido documental', a.totais.vendido, 4248);
  eq('comissão documental', a.totais.comissao, 1184.75);
  eq('líquido para a casa', a.totais.liquido, 3063.25);

  const junho = a.acertos.find((x) => x.data === '2026-06-13');
  eq('bruto da maleta 1 é exato', junho.vendido, 3431);
  eq('comissão da maleta 1 é exata', junho.comissao, 1062.2);
  eq('não existe percentual estimado', 'pct' in junho, false);

  eq('uma revendedora com acerto no período', a.revendedoras.length, 1);
  eq('e ela é a Jessica', a.revendedoras[0].nome, 'Jessica Melim');
  eq('só as revendedoras entram aqui — nenhuma cliente',
    a.acertos.every((x) => x.revendedoraId === 1), 'true');
}

console.log('\n── 5. a resposta declara que os valores são exatos');
{
  const a = await acertosDeMaleta(db, { periodo: 'tudo' });
  eq('payload é exato', a.exato, true);
  eq('cada acerto também é exato', a.acertos.every((x) => x.exato), true);
  eq('não há premissas de estimativa', 'premissas' in a, false);
}

console.log('\n── 6. sem revendedora cadastrada, nada muda');
{
  sq.exec('DELETE FROM historico_operacoes');
  sq.exec('DELETE FROM revendedoras');
  const g = await visaoGeral(db, { periodo: 'tudo' });
  eq('todo mundo volta a ser cliente', g.clientes, 4);
  const a = await acertosDeMaleta(db, { periodo: 'tudo' });
  eq('e não há acerto documental', a.totais.acertos, 0);
  eq('nem revendedora para listar', a.revendedoras.length, 0);
}

sq.close();
console.log(falhas ? `\n${falhas} FALHA(S)\n` : '\nTudo certo.\n');
process.exit(falhas ? 1 : 0);
