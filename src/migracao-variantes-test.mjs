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
  /* Daqui para baixo: as 22 migrations que o repositório tinha e que esta
     lista nunca exercitou. Até 11/09/2026 o teste rodava só as oito acima, e
     o `schema.sql` daquela época correspondia a elas. Quando a refatoração
     consolidou o schema inteiro (4.4, 4.5, montagem, garantias, histórico de
     operações, saídas, pagamento), a comparação passou a comparar coisas
     diferentes. Corrigir a lista foi mais honesto do que encolher o schema.

     A ordem NÃO é alfabética: foi obtida aplicando cada arquivo sobre um
     banco reconstruído do zero e mantendo só o que subia limpo, até todas
     entrarem. Duas dependências que ela codifica, e que quebram em silêncio
     se alguém reordenar por estética:
       · `migracao-montagem-slots.sql` precisa de `personalizacao_modelos`,
         que quem cria é `migracao-pos-golive-1.sql`;
       · `migracao-sorteio-saida-sem-faturamento.sql` vem DEPOIS de
         `migracao-inventario-4-4.sql`, que é a ordem real de produção: a
         reconstrução copia `inventario_id` e recria
         `idx_saida_inventario_unica`. Até 26/09/2026 era o contrário, e a
         versão antiga do sorteio reconstruía a tabela sem a coluna. */
  'api/migracao-catalogo-4-5.sql',
  'api/migracao-catalogo.sql',
  'api/migracao-foto-url.sql',
  'api/migracao-garantias.sql',
  'api/migracao-historico-operacoes.sql',
  'api/migracao-idempotencia-reconciliacao.sql',
  'api/migracao-inventario.sql',
  'api/migracao-kits.sql',
  'api/migracao-publicacao-catalogo.sql',
  'api/migracao-catalogo-4-5-publicacao.sql',
  'api/migracao-reconciliacao.sql',
  'api/migracao-saidas-sem-faturamento.sql',
  'api/migracao-inventario-4-4.sql',
  'api/migracao-sorteio-saida-sem-faturamento.sql',
  'api/migracao-sync-seco.sql',
  'api/migracao-sync.sql',
  'api/migracao-variacoes.sql',
  'api/migracao-vendas-cliente-ambiguo.sql',
  'api/migracao-vendas-pagamento.sql',
  'api/migracao-pos-golive-1.sql',
  'api/migracao-montagem-slots.sql',
  'api/migracao-pacote-2.sql',
  /* 5.2 — identidade própria da linha de venda. No fim porque ela só
     acrescenta a `venda_itens`, que já existe desde o schema original e não
     é reconstruída por nenhuma das migrations acima. */
  'api/migracao-venda-item-id.sql',
  /* 5.2b — a garantia troca o trio (venda, sku, variante) pelo id da linha.
     Depois de `migracao-venda-item-id.sql` obrigatoriamente: o backfill lê
     `venda_itens.id`, que só existe a partir dela. */
  'api/migracao-garantia-venda-item.sql',
  /* 5.4d — estornar troca deixa de apagar a linha. Depois da de cima só
     por ordem cronológica: as duas mexem em tabelas diferentes. */
  'api/migracao-garantia-troca-estorno.sql',
  /* 5.4e — o novo atendimento vira caso próprio, ligado ao anterior. */
  'api/migracao-garantia-reabertura.sql',
  /* 5.3c — a versão do recebível em `vendas` e `garantia_trocas`, mais os
     três triggers que a incrementam. Depois de todas as de cima porque ela
     acrescenta coluna a duas tabelas que várias delas ainda alteram. */
  'api/migracao-recebivel-versao.sql',
  /* 5.3e — a razão de crédito, mais `credito_emitido` no CHECK de
     `garantia_trocas.diferenca_status`. Por último porque a parte 2
     RECONSTRÓI `garantia_trocas` e precisa copiar as colunas que
     `garantia-troca-estorno`, `garantia-reabertura` e `recebivel-versao`
     acrescentaram. Fora de ordem, a cópia perde coluna. */
  'api/migracao-credito-cliente.sql',
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
/* 5.3e — preenchidos no meio do laço abaixo. `garantias` não existe no
   schema base: ela nasce de uma das migrations, então a troca só pode ser
   plantada depois dessa e antes da que reconstrói a tabela. */
let contagemTrocasAntes = null;
let trocaAntes = null;
const antesMovimentos = velho.prepare(`SELECT COUNT(*) n FROM movimentos`).get().n;
const antesVariacoes = velho.prepare(`SELECT COUNT(*) n FROM produto_variacoes`).get().n;

for (const arq of MIGRACOES) {
  /* 5.3e — uma TROCA de verdade, plantada NA VÉSPERA da migration que
     reconstrói `garantia_trocas`. SQLite não altera CHECK, então a parte 2
     cria tabela nova, copia, dropa e renomeia; uma cópia errada perde
     histórico financeiro em silêncio. Com zero linha, a reconstrução
     passaria no teste sem ter copiado nada. */
  if (arq === 'api/migracao-credito-cliente.sql') {
    /* A garantia tem CHECK por origem: `operacional` exige `venda_id`,
       `historico` exige `historico_item_id`. A venda mínima é o caminho mais
       curto que não afrouxa nada — o alvo da prova é a CÓPIA da troca. */
    velho.exec(`INSERT INTO vendas (id, cliente_nome, origem, data, total)
                VALUES (1, 'Vitoria', 'balcao', '2026-07-01', 100.0)`);
    velho.exec(`INSERT INTO garantias
                  (origem_fonte, venda_id, sku, cliente_nome, motivo, data_entrada, status)
                VALUES ('operacional', 1, 'ANTIGO', 'Vitoria', 'pedra caiu', '2026-08-01', 'sem_conserto')`);
    velho.exec(`INSERT INTO garantia_trocas
                  (garantia_id, data, sku_novo, valor_original, valor_novo, diferenca, diferenca_status)
                VALUES (1, '2026-08-02', 'ANTIGO', 100.0, 70.0, -30.0, 'pendente_regra')`);
    contagemTrocasAntes = velho.prepare(`SELECT COUNT(*) n FROM garantia_trocas`).get().n;
    trocaAntes = velho.prepare(`SELECT * FROM garantia_trocas WHERE id = 1`).get();
  }
  /* Várias destas são aditivas e idempotentes: reclamam de coluna duplicada
     quando a coluna já veio do schema anterior. Isso é sucesso, não falha —
     a mesma ressalva que o cenário 8 documenta. */
  aplicar(velho, readFileSync(join(raiz, arq), 'utf8'), { tolerarColunaDuplicada: true });
  ok('roda contra o banco antigo sem erro', arq.replace('api/', ''));
}

/* A invariante é "nada se perdeu", não "a contagem não mudou": desde
   `migracao-pacote-2.sql` uma migration SEMEIA legitimamente o SKU de recibo
   `MONTE-COLAR` (qtd 0, inativo — não é peça física). Contar igualdade
   confundiria semeadura com perda. O que se cobra é: o produto que já estava
   lá continua lá, a contagem nunca diminuiu, e o único acréscimo é o que
   está nomeado aqui. */
const SEMEADOS_POR_MIGRATION = ['MONTE-COLAR'];
const produtosDepois = velho.prepare(`SELECT sku FROM produtos ORDER BY sku`).all().map(r => r.sku);
eq('o produto que já existia continua lá', produtosDepois.includes('ANTIGO'), 'true');
eq('nenhum produto se perdeu', produtosDepois.length >= antesProdutos, 'true');
eq('e o que entrou foi só a semeadura nomeada',
  produtosDepois.filter((sku) => sku !== 'ANTIGO').join(','),
  SEMEADOS_POR_MIGRATION.join(','));
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
/* DIVERGÊNCIA FECHADA em 15/09/2026 — a lista está vazia, e continua aqui.
 *
 * `migracao-pos-golive-1.sql` criava duas tabelas e sete índices que nunca
 * tinham sido escritos de volta em `api/schema.sql`: um banco criado do zero
 * nascia sem `maleta_item_variacoes` e `venda_item_correcoes`, que
 * `produtos.js`, `inventario.js`, `variantes.js`, `pendencias.js`,
 * `venda-correcao.js` e `pagamento-venda.js` consultam.
 *
 * O DDL que entrou no schema foi DERIVADO, não redigido: comparado instrução
 * a instrução contra uma cópia real de produção e contra a própria migration,
 * e os três são idênticos.
 *
 * A estrutura fica de pé vazia de propósito. Ela é o lugar onde uma
 * divergência nova teria de ser declarada por nome para o teste passar — e
 * declarar por nome é caro o bastante para ninguém fazer por distração. Se
 * alguém acrescentar objeto numa migration e esquecer o schema, o teste falha
 * em vez de crescer uma exceção em silêncio. */
const SO_NO_MIGRADO = { tabelas: [], indices: [] };
const SO_NO_SCHEMA = { tabelas: [], indices: [] };

const semExcecoes = (lista, fora) => lista.filter((n) => !fora.includes(n));

const tabelasNovo = semExcecoes(objetos(novo, 'table'), SO_NO_SCHEMA.tabelas).join(',');
const tabelasVelho = semExcecoes(objetos(velho, 'table'), SO_NO_MIGRADO.tabelas).join(',');
eq('as mesmas tabelas, tirando as divergências conhecidas', tabelasVelho, tabelasNovo);

/* E as exceções são conferidas, não só ignoradas: cada nome tem de estar
   mesmo onde a lista diz que está. Exceção que deixou de existir é exceção
   que precisa sair da lista. */
for (const t of SO_NO_MIGRADO.tabelas) {
  eq(`divergência conhecida: ${t} só existe no banco migrado`,
    objetos(velho, 'table').includes(t) && !objetos(novo, 'table').includes(t), 'true');
}
for (const i of SO_NO_SCHEMA.indices) {
  eq(`divergência conhecida: ${i} só existe no schema`,
    objetos(novo, 'index').includes(i) && !objetos(velho, 'index').includes(i), 'true');
}

for (const t of ['produtos', 'movimentos', 'produto_variacoes', 'loja_variantes', 'sku_reservas',
  /* 5.2 e 5.2b acrescentaram coluna nas duas: se o schema e a migration
     divergirem aí, a identidade do item some no banco criado do zero. */
  'venda_itens', 'garantias',
  /* 5.3c — as duas que ganharam `recebivel_versao`. Se ela existir só num
     dos caminhos, a trava de concorrência do dinheiro some no banco novo. */
  'vendas', 'garantia_trocas']) {
  eq(`as mesmas colunas em ${t}`, colunas(velho, t).join(','), colunas(novo, t).join(','));
}

const idxNovo = semExcecoes(
  objetos(novo, 'index').filter((n) => n.startsWith('idx_')), SO_NO_SCHEMA.indices).join(',');
const idxVelho = semExcecoes(
  objetos(velho, 'index').filter((n) => n.startsWith('idx_')), SO_NO_MIGRADO.indices).join(',');
eq('os mesmos índices, tirando as divergências conhecidas', idxVelho, idxNovo);

/* 5.3c — TRIGGERS também. Este teste comparava tabelas, colunas e índices, e
   um trigger que entrasse só num dos dois caminhos passaria despercebido até
   o dia em que alguém criasse o banco do zero. Agora não passa: a versão do
   recebível é incrementada POR TRIGGER, então ele deixou de ser detalhe de
   implementação e virou a peça que segura a concorrência do dinheiro.
   Comparar só os nomes não bastaria — um `WHEN` diferente entre os dois
   caminhos daria versões diferentes para o mesmo fato —, então o corpo entra
   na comparação, normalizado só no espaço em branco. */
const gatilhos = (db) => Object.fromEntries(
  db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name`)
    .all().map((r) => [r.name, String(r.sql).replace(/\s+/g, ' ').trim()]));

const gNovo = gatilhos(novo);
const gVelho = gatilhos(velho);
eq('os mesmos triggers', Object.keys(gVelho).join(','), Object.keys(gNovo).join(','));
for (const nome of Object.keys(gNovo)) {
  eq(`o trigger ${nome} tem o mesmo corpo nos dois caminhos`, gVelho[nome], gNovo[nome]);
}
for (const nome of ['vendas_recebivel_versao', 'venda_itens_recebivel_versao',
  'garantia_trocas_recebivel_versao', 'venda_itens_id_ao_inserir', 'venda_itens_id_imutavel']) {
  eq(`o trigger ${nome} existe nos dois`, !!(gNovo[nome] && gVelho[nome]), 'true');
}

/* 5.3e — o CORPO das tabelas que têm CHECK de vocabulário.
 *
 *  A comparação acima pega tabela, coluna, índice e trigger. Não pega CHECK:
 *  `diferenca_status IN (…)` pode listar um estado a mais num caminho e não
 *  no outro, e os dois bancos continuariam com as mesmas colunas. O defeito
 *  apareceria só quando alguém gravasse o estado novo no banco errado — em
 *  produção, com a escrita falhando por "constraint failed".
 *
 *  Normalizado só no comentário e no espaço em branco: indentação não é
 *  contrato, o CHECK é. */
const ddl = (db, nome) => String(
  db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nome)?.sql ?? '',
)
  .replace(/--[^\n]*/g, ' ')
  /* `ALTER TABLE … RENAME TO` faz o SQLite reescrever o DDL com o nome entre
     aspas: `CREATE TABLE "garantia_trocas"`. É artefato da reconstrução, não
     divergência — e sem normalizar isso o teste acusaria diferença em toda
     tabela que alguma migration tenha renomeado. */
  .replace(/^CREATE TABLE "([^"]+)"/i, 'CREATE TABLE $1')
  .replace(/\s+/g, ' ').trim();

for (const t of ['garantia_trocas', 'credito_movimentos']) {
  eq(`o CHECK de ${t} é o mesmo nos dois caminhos`, ddl(velho, t), ddl(novo, t));
}
for (const estado of ['pendente_regra', 'credito_emitido']) {
  eq(`banco migrado aceita diferenca_status = ${estado}`,
    ddl(velho, 'garantia_trocas').includes(estado), 'true');
  eq(`banco novo aceita diferenca_status = ${estado}`,
    ddl(novo, 'garantia_trocas').includes(estado), 'true');
}

/* A reconstrução copia linha por linha. Perder uma é perder histórico
   financeiro, e o histórico não se reescreve (§28). */
eq('a reconstrução de garantia_trocas não perdeu linha',
  velho.prepare(`SELECT COUNT(*) n FROM garantia_trocas`).get().n, contagemTrocasAntes);
const trocaDepois = velho.prepare(`SELECT * FROM garantia_trocas WHERE id = 1`).get();
for (const campo of ['garantia_id', 'data', 'sku_novo', 'valor_original', 'valor_novo',
  'diferenca', 'diferenca_status', 'recebivel_versao', 'estornada']) {
  eq(`a troca preservou ${campo} na reconstrução`, String(trocaDepois[campo]), String(trocaAntes[campo]));
}

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
eq('e o banco continua íntegro',
  velho.prepare(`SELECT COUNT(*) n FROM produtos`).get().n,
  antesProdutos + SEMEADOS_POR_MIGRATION.length);

novo.close(); velho.close();
rmSync(dir, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
