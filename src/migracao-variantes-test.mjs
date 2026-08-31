/** A migration das variantes, provada nas DUAS direções.
 *
 *  Sem controle de versão de migrations (TECH_DEBT item 1), o único jeito de
 *  saber que `schema.sql` e `migracao-*.sql` continuam dizendo a mesma coisa
 *  é comparar os dois bancos resultantes, tabela por tabela e coluna por
 *  coluna. Um `ALTER TABLE` que entrou só na migration e não no schema não
 *  quebra nada hoje — quebra no dia em que alguém criar o banco do zero, que
 *  é o pior dia para descobrir.
 *
 *  Não precisa do Worker nem da rede: roda contra dois SQLite temporários,
 *  com o `node:sqlite` que já vem no runtime.
 *
 *      node src/migracao-variantes-test.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dir = mkdtempSync(join(tmpdir(), 'marquesa-mig-'));

const git = (...args) => execFileSync('git', args, {
  cwd: raiz, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).trim();

/** O `schema.sql` de ANTES desta migration, direto do Git — é contra ele que
 *  ela precisa rodar, porque é o que produção e o DEV têm.
 *
 *  A referência NÃO pode ser `HEAD`: funcionaria enquanto a mudança está no
 *  diretório de trabalho e passaria a se comparar consigo mesma no minuto
 *  seguinte ao commit, quando o teste vira um "sempre passa" silencioso.
 *  Em vez disso ela é ancorada no commit que criou o arquivo da migration:
 *  o pai dele é, por definição, o banco de antes. Antes do commit existir, a
 *  busca vem vazia e `HEAD` é a resposta certa. */
function schemaAnterior() {
  const criou = git('log', '--diff-filter=A', '--format=%H', '--', MIGRACOES[0])
    .split('\n').filter(Boolean).pop();
  const base = criou ? `${criou}^` : 'HEAD';
  return { sql: git('show', `${base}:api/schema.sql`), base };
}

/** As migrations desta linha do tempo, NA ORDEM em que produção as recebe.
 *
 *  A ordem não é decoração: `migracao-variacoes-locais.sql` acrescenta uma
 *  coluna a uma tabela em que `migracao-variantes.sql` acabou de acrescentar
 *  outras. Fora de ordem falha, e falha parecendo bug do schema.
 *
 *  Migration nova entra AQUI, no fim. Esquecer disso faz o teste comparar o
 *  schema novo com um banco migrado pela metade — e ele acusa a diferença,
 *  que é exatamente o serviço dele. */
const MIGRACOES = [
  'api/migracao-variantes.sql',
  'api/migracao-variacoes-locais.sql',
  'api/migracao-fotos-loja.sql',
  'api/migracao-vendas-nuvemshop.sql',
  'api/migracao-vendas-historico.sql',
  /* Depois de `migracao-vendas-historico.sql`, e não antes: a camada
     derivada referencia `vendas_historico_lotes`, que nasce lá. */
  'api/migracao-vendas-historicas.sql',
  /* Aditiva e independente das anteriores: só acrescenta CPF à ficha da
     cliente, que já existe desde o schema original. */
  'api/migracao-cliente-cpf.sql',
  /* Também aditiva e independente: `venda_itens` existe desde o schema
     original, e as três colunas só descrevem o preço que já era gravado. */
  'api/migracao-venda-desconto.sql',
];

/** O SQLite do Node aceita várias instruções de uma vez, mas engasga com
 *  transação implícita em arquivo grande — vai em bloco só, como o D1. */
function aplicar(db, sql, { tolerarColunaDuplicada = false } = {}) {
  try {
    db.exec(sql);
  } catch (e) {
    if (tolerarColunaDuplicada && /duplicate column name/i.test(e.message)) return e.message;
    throw e;
  }
  return null;
}

const colunas = (db, tabela) =>
  db.prepare(`SELECT name FROM pragma_table_info(?)`).all(tabela).map(r => r.name).sort();

const objetos = (db, tipo) =>
  db.prepare(`SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'`)
    .all(tipo).map(r => r.name).sort();

console.log('\n=== 1. banco NOVO, criado do zero pelo schema.sql ===');
const novo = new DatabaseSync(join(dir, 'novo.sqlite'));
aplicar(novo, readFileSync(join(raiz, 'api/schema.sql'), 'utf8'));
ok('schema.sql cria o banco inteiro sem erro');
eq('loja_variantes existe', objetos(novo, 'table').includes('loja_variantes'), 'true');
eq('sku_reservas existe', objetos(novo, 'table').includes('sku_reservas'), 'true');
eq('movimentos ganhou variante_id', colunas(novo, 'movimentos').includes('variante_id'), 'true');
eq('produto_variacoes ganhou valores_json',
  colunas(novo, 'produto_variacoes').includes('valores_json'), 'true');

console.log('\n=== 2. banco ANTIGO + migration ===');
/* O caminho de produção e do DEV: o banco já existe, com dados, e recebe só
   a migration. */
const velho = new DatabaseSync(join(dir, 'velho.sqlite'));
const anterior = schemaAnterior();
aplicar(velho, anterior.sql);
ok('o schema anterior ainda sobe (é o que está lá hoje)', anterior.base);

/* Dado de verdade ANTES da migration, para provar que nada dele se perde.
   §28: migration não apaga histórico. */
velho.exec(`INSERT OR IGNORE INTO categorias (nome, ordem) VALUES ('Anel', 1)`);
velho.exec(`INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('ANTIGO', 'Peça de antes', 'Anel', 10, 0)`);
velho.exec(`INSERT INTO movimentos (sku, tipo, qtd, origem) VALUES ('ANTIGO', 'entrada', 7, 'importacao')`);
velho.exec(`UPDATE produtos SET qtd = 7 WHERE sku = 'ANTIGO'`);
velho.exec(`INSERT INTO produto_variacoes (sku, nome, atributo, variante_id, produto_id, estoque_loja, ordem)
            VALUES ('ANTIGO', '16', 'Aro', '4242', '99', 7, 0)`);

const antesProdutos = velho.prepare(`SELECT COUNT(*) n FROM produtos`).get().n;
const antesMovimentos = velho.prepare(`SELECT COUNT(*) n FROM movimentos`).get().n;
const antesVariacoes = velho.prepare(`SELECT COUNT(*) n FROM produto_variacoes`).get().n;

for (const arq of MIGRACOES) {
  aplicar(velho, readFileSync(join(raiz, arq), 'utf8'));
  ok('roda contra o banco antigo sem erro', arq.replace('api/', ''));
}

eq('nenhum produto se perdeu', velho.prepare(`SELECT COUNT(*) n FROM produtos`).get().n, antesProdutos);
eq('nenhum movimento se perdeu', velho.prepare(`SELECT COUNT(*) n FROM movimentos`).get().n, antesMovimentos);
eq('nenhuma variação se perdeu', velho.prepare(`SELECT COUNT(*) n FROM produto_variacoes`).get().n, antesVariacoes);
eq('o variante_id que já existia continua lá',
  velho.prepare(`SELECT variante_id FROM produto_variacoes WHERE sku = 'ANTIGO'`).get().variante_id, '4242');
eq('e as colunas novas entram NULAS, sem inventar valor',
  velho.prepare(`SELECT valores_json FROM produto_variacoes WHERE sku = 'ANTIGO'`).get().valores_json, 'null');
eq('movimento histórico fica com variante_id nulo, que é honesto',
  velho.prepare(`SELECT variante_id FROM movimentos WHERE sku = 'ANTIGO'`).get().variante_id, 'null');

console.log('\n=== 3. a razão continua fechando depois da migration (§19) ===');
const divergentes = velho.prepare(`
  SELECT COUNT(*) n FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.soma, 0)`).get().n;
eq('produtos.qtd == SUM(movimentos.qtd) em todo SKU', divergentes, 0);

console.log('\n=== 4. os dois caminhos chegam ao MESMO banco ===');
/* O que este teste existe para pegar: schema e migration divergindo em
   silêncio. Quem cria do zero e quem migra têm de terminar iguais. */
const tabelasNovo = objetos(novo, 'table').join(',');
const tabelasVelho = objetos(velho, 'table').join(',');
eq('as mesmas tabelas', tabelasVelho, tabelasNovo);

for (const t of ['produtos', 'movimentos', 'produto_variacoes', 'loja_variantes', 'sku_reservas']) {
  eq(`as mesmas colunas em ${t}`, colunas(velho, t).join(','), colunas(novo, t).join(','));
}

const idxNovo = objetos(novo, 'index').filter(n => n.startsWith('idx_')).join(',');
const idxVelho = objetos(velho, 'index').filter(n => n.startsWith('idx_')).join(',');
eq('os mesmos índices', idxVelho, idxNovo);

console.log('\n=== 5. os índices que seguram as invariantes continuam de pé ===');
for (const db of [['novo', novo], ['migrado', velho]]) {
  const idx = new Set(objetos(db[1], 'index'));
  eq(`${db[0]}: idx_vendas_externo (idempotência dos pedidos)`, idx.has('idx_vendas_externo'), 'true');
  eq(`${db[0]}: idx_variacoes_variante (uma variante, uma linha)`, idx.has('idx_variacoes_variante'), 'true');
  eq(`${db[0]}: idx_produtos_sku_norm (SKU único de fato)`, idx.has('idx_produtos_sku_norm'), 'true');
  eq(`${db[0]}: idx_movimentos_reconciliacao_item`, idx.has('idx_movimentos_reconciliacao_item'), 'true');
}

console.log('\n=== 6. o índice de SKU recusa o quase-igual ===');
/* O caso real que passava: o importador de planilha só fazia `.trim()`. */
novo.exec(`INSERT OR IGNORE INTO categorias (nome, ordem) VALUES ('Colar', 1)`);
novo.exec(`INSERT INTO produtos (sku, desc, cat, qtd) VALUES ('BR1234', 'Brinco', 'Colar', 0)`);
let recusou = false;
try { novo.exec(`INSERT INTO produtos (sku, desc, cat, qtd) VALUES ('br1234', 'Duplicata', 'Colar', 0)`); }
catch (e) { recusou = /UNIQUE|constraint/i.test(e.message); }
eq('"br1234" não entra ao lado de "BR1234"', recusou, 'true');

recusou = false;
try { novo.exec(`INSERT INTO produtos (sku, desc, cat, qtd) VALUES (' BR1234 ', 'Com espaço', 'Colar', 0)`); }
catch (e) { recusou = /UNIQUE|constraint/i.test(e.message); }
eq('nem com espaço em volta', recusou, 'true');

console.log('\n=== 7. duas linhas não podem apontar para a mesma variante ===');
novo.exec(`INSERT INTO produto_variacoes (sku, nome, variante_id, produto_id) VALUES ('BR1234', '16', '777', '9')`);
recusou = false;
try { novo.exec(`INSERT INTO produto_variacoes (sku, nome, variante_id, produto_id) VALUES ('BR1234', '18', '777', '9')`); }
catch (e) { recusou = /UNIQUE|constraint/i.test(e.message); }
eq('a mesma caixinha da loja não tem dois donos', recusou, 'true');
/* NULL nunca é igual a NULL num índice único: linha sem id convive em paz,
   que é o que permite a coluna existir sem quebrar o que já havia. */
novo.exec(`INSERT INTO produto_variacoes (sku, nome, produto_id) VALUES ('BR1234', '20', '9')`);
novo.exec(`INSERT INTO produto_variacoes (sku, nome, produto_id) VALUES ('BR1234', '22', '9')`);
ok('mas duas linhas SEM id convivem, como antes');

console.log('\n=== 8. rodar a migration duas vezes é inofensivo (com uma ressalva) ===');
/* `ALTER TABLE ADD COLUMN` não é idempotente e falha com "duplicate column
   name" — e esse erro significa exatamente "já foi aplicada". Está escrito
   no comentário do arquivo; aqui fica provado que é só isso que acontece. */
const erro = aplicar(velho, readFileSync(join(raiz, MIGRACOES[0]), 'utf8'),
  { tolerarColunaDuplicada: true });
eq('a segunda rodada só reclama de coluna duplicada', /duplicate column name/i.test(erro || ''), 'true');
eq('e o banco continua íntegro', velho.prepare(`SELECT COUNT(*) n FROM produtos`).get().n, antesProdutos);

novo.close(); velho.close();
rmSync(dir, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
