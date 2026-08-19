/** Prova o schema do motor de reconciliação — SEM subir o Worker, sem tocar
 *  no banco de desenvolvimento, e nunca em produção.
 *
 *  Roda `wrangler d1 execute --local --persist-to <pasta descartável>`
 *  direto, o que significa: cada asserção lê o SQLite de verdade que o D1
 *  local usa, não uma simulação.
 *
 *  O que fica provado, em ordem:
 *
 *   1. a migration aplica sobre o schema de ANTES desta mudança — não sobre
 *      um banco vazio, que não provaria nada sobre produção;
 *   2. as tabelas e os cinco índices nascem certos;
 *   3. dado que já existia (produto, movimento) continua intacto depois da
 *      migration, e nenhuma tabela antiga sumiu;
 *   4. a unicidade (sessao_id, sku, variacao_chave, tipo) rejeita duplicata
 *      — inclusive com `variacao IS NULL` nos dois lados;
 *   5. no máximo uma sessão 'revisao' por origem;
 *   6. os dois CHECK (status/tipo/risco/origem) aceitam o que é válido e
 *      recusam o que não é;
 *   7. `migracao-reconciliacao.sql` é idempotente (CREATE ... IF NOT
 *      EXISTS); `migracao-sync-seco.sql` NÃO é — e isso é o esperado, do
 *      mesmo jeito que `migracao-variacoes.sql` já documenta.
 *
 *  O "schema de antes" vem do próprio Git: o commit `f3f08cb` é a produção
 *  real antes de qualquer coisa desta fase — reproduzível por qualquer
 *  pessoa que clonar o repositório, ao contrário de um dump de backup.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, a) : bad(t, `esperava ${b}, veio ${a}`));

/* ------------------------------------------------------------- infra */

const PERSIST = mkdtempSync(join(tmpdir(), 'marquesa-schema-test-'));
let contador = 0;

// Absolutos de propósito: `aplicar()` roda o wrangler com `cwd` na pasta
// `api/` (para achar o wrangler.toml), e um caminho relativo aqui seria
// resolvido contra ESSE cwd, não contra o do script — foi exatamente o bug
// que fez a primeira versão deste teste "aplicar" um arquivo inexistente
// (`api/api/migracao-reconciliacao.sql`) sem avisar.
const API_DIR = join(process.cwd(), 'api');
const MIGRACAO_RECONCILIACAO = join(API_DIR, 'migracao-reconciliacao.sql');
const MIGRACAO_SYNC_SECO = join(API_DIR, 'migracao-sync-seco.sql');

function arquivoSql(sql) {
  const f = join(PERSIST, `q-${contador++}.sql`);
  writeFileSync(f, sql, 'utf8');
  return f;
}

/** Roda um arquivo .sql (SEMPRE caminho absoluto — `cwd: 'api'` é só para o
 *  wrangler achar o `wrangler.toml`, e um caminho relativo aqui dentro
 *  resolveria contra esse `cwd`, não contra o do script).
 *
 *  `esperaFalha`, quando passado, é o regex que a falha PRECISA bater —
 *  aceitar "qualquer erro" mascararia a asserção errada (ex.: a tabela nem
 *  existe) passando por "a constraint certa recusou". */
function aplicar(caminhoAbsoluto, { esperaFalha, rotulo } = {}) {
  const nome = rotulo || caminhoAbsoluto;
  try {
    execFileSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'marquesa-db', '--local', '--persist-to', PERSIST, '--file', caminhoAbsoluto],
      { cwd: API_DIR, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (esperaFalha) bad(nome, 'deveria ter falhado e passou');
    else ok(nome);
    return { falhou: false };
  } catch (e) {
    const texto = String((e.stdout || '') + (e.stderr || ''));
    if (esperaFalha && esperaFalha.test(texto)) ok(nome, texto.match(esperaFalha)[0]);
    else if (esperaFalha) bad(nome, `falhou, mas não pelo motivo esperado — ${texto.slice(0, 300)}`);
    else bad(nome, texto.slice(0, 300));
    return { falhou: true, texto };
  }
}

/** Roda um SELECT e devolve as linhas. */
function consultar(sql) {
  const f = arquivoSql(sql);
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'marquesa-db', '--local', '--persist-to', PERSIST, '--file', f, '--json'],
    { cwd: API_DIR, encoding: 'utf8', shell: true },
  );
  const bloco = out.match(/\[[\s\S]*\]/);
  return JSON.parse(bloco[0])[0].results;
}

function tabelas() {
  // `_cf_*` é bookkeeping interno do D1 (`_cf_METADATA` no D1 local,
  // `_cf_KV` no remoto) — não é tabela nossa, e aparece em QUALQUER banco
  // D1, mesmo vazio. Sem o filtro, toda contagem teria +1 que nada tem a
  // ver com este schema.
  return consultar(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`)
    .map(r => r.name);
}

function colunas(tabela) {
  // `table_info` (sem x) OMITE colunas GENERATED — só `table_xinfo` as lista
  // (com `hidden = 3`). Sem isso, `variacao_chave` pareceria não existir.
  return consultar(`SELECT name FROM pragma_table_xinfo('${tabela}') ORDER BY name`).map(r => r.name);
}

function indices(tabela) {
  return consultar(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${tabela}' ORDER BY name`)
    .map(r => r.name);
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/* ============================================================== setup */

console.log('pasta descartável: ' + PERSIST);

console.log('\n=== 1. a migration aplica sobre o schema de ANTES desta fase ===');

const schemaAntigo = git(['show', 'f3f08cb:api/schema.sql']);
const fSchemaAntigo = arquivoSql(schemaAntigo);
aplicar(fSchemaAntigo, { rotulo: 'schema de f3f08cb (produção antes desta fase) aplica limpo' });

const tabelasAntes = tabelas();
eq('16 tabelas no schema antigo (docs/DATA_MODEL.md)', tabelasAntes.length, 16);
eq('reconciliacao_sessoes NÃO existe ainda', tabelasAntes.includes('reconciliacao_sessoes'), 'false');
eq('reconciliacao_itens NÃO existe ainda', tabelasAntes.includes('reconciliacao_itens'), 'false');
eq('sync_execucoes ainda NÃO tem a coluna seco', colunas('sync_execucoes').includes('seco'), 'false');

/* Dado que precisa sobreviver à migration, para provar a seção 3. */
aplicar(arquivoSql(`
  INSERT INTO produtos (sku, desc, cat, preco, qtd) VALUES ('PRE1', 'Peça Pré-Existente', 'Colar', 77, 5);
  INSERT INTO movimentos (sku, tipo, qtd, origem) VALUES ('PRE1', 'entrada', 5, 'importacao');
`), { rotulo: 'seed: produto e movimento anteriores à migration' });

console.log('\n=== 2. tabelas, colunas e índices nascem certos ===');

aplicar(MIGRACAO_RECONCILIACAO, { rotulo: 'migracao-reconciliacao.sql aplica sobre o schema antigo' });
aplicar(MIGRACAO_SYNC_SECO, { rotulo: 'migracao-sync-seco.sql aplica sobre o schema antigo' });

const tabelasDepois = tabelas();
eq('reconciliacao_sessoes existe agora', tabelasDepois.includes('reconciliacao_sessoes'), 'true');
eq('reconciliacao_itens existe agora', tabelasDepois.includes('reconciliacao_itens'), 'true');
eq('sync_execucoes ganhou a coluna seco', colunas('sync_execucoes').includes('seco'), 'true');

const colSessoes = colunas('reconciliacao_sessoes');
for (const c of ['id', 'origem', 'status', 'criada_em', 'decidida_em', 'aplicada_em', 'resumo_json', 'relato_json', 'erro']) {
  eq(`reconciliacao_sessoes tem a coluna ${c}`, colSessoes.includes(c), 'true');
}
const colItens = colunas('reconciliacao_itens');
for (const c of ['id', 'sessao_id', 'sku', 'variacao', 'variacao_chave', 'descricao', 'tipo',
                 'de', 'para', 'base_json', 'risco', 'motivo', 'status', 'erro', 'dados_json']) {
  eq(`reconciliacao_itens tem a coluna ${c}`, colItens.includes(c), 'true');
}

const idxSessoes = indices('reconciliacao_sessoes');
const idxItens = indices('reconciliacao_itens');
eq('idx_rec_sessoes_status existe', idxSessoes.includes('idx_rec_sessoes_status'), 'true');
eq('idx_rec_sessoes_revisao_unica existe', idxSessoes.includes('idx_rec_sessoes_revisao_unica'), 'true');
eq('idx_rec_itens_sessao existe', idxItens.includes('idx_rec_itens_sessao'), 'true');
eq('idx_rec_itens_status existe', idxItens.includes('idx_rec_itens_status'), 'true');
eq('idx_rec_itens_unico existe', idxItens.includes('idx_rec_itens_unico'), 'true');

console.log('\n=== 3. nada antigo sumiu, e o dado prévio sobreviveu intacto ===');

const faltando = tabelasAntes.filter(t => !tabelasDepois.includes(t));
eq('nenhuma das 16 tabelas antigas foi removida', faltando.length, 0, faltando.join(','));

const pre = consultar(`SELECT sku, desc, qtd FROM produtos WHERE sku = 'PRE1'`);
eq('o produto seedado antes da migration continua lá', pre.length, 1);
eq('com os mesmos valores', `${pre[0].desc}|${pre[0].qtd}`, 'Peça Pré-Existente|5');
const preMov = consultar(`SELECT qtd FROM movimentos WHERE sku = 'PRE1'`);
eq('o movimento seedado antes da migration continua lá', preMov.length, 1);

console.log('\n=== 4. unicidade (sessao_id, sku, variacao_chave, tipo) ===');

aplicar(arquivoSql(`INSERT INTO reconciliacao_sessoes (id, origem) VALUES (1, 'nuvemshop');`),
  { rotulo: 'sessão 1 criada' });

aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, variacao, tipo, risco)
  VALUES (1, 'S1', NULL, 'estoque_loja', 'trivial');
`), { rotulo: 'item com variacao NULL: 1ª inserção' });

aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, variacao, tipo, risco)
  VALUES (1, 'S1', NULL, 'estoque_loja', 'confere');
`), { esperaFalha: /UNIQUE constraint failed/i, rotulo: 'MESMO sku+tipo com variacao NULL de novo: banco recusa' });

aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, variacao, tipo, risco)
  VALUES (1, 'S1', '16', 'estoque_loja', 'trivial');
`), { rotulo: 'variação 16 do mesmo sku: aceita (variacao diferente)' });

aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, variacao, tipo, risco)
  VALUES (1, 'S1', '18', 'estoque_loja', 'trivial');
`), { rotulo: 'variação 18 do mesmo sku: aceita' });

aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, variacao, tipo, risco)
  VALUES (1, 'S1', '16', 'estoque_loja', 'perigoso');
`), { esperaFalha: /UNIQUE constraint failed/i, rotulo: 'variação 16 REPETIDA: banco recusa' });

aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, variacao, tipo, risco)
  VALUES (1, 'S1', NULL, 'ajuste_qtd', 'trivial');
`), { rotulo: 'MESMO sku+variacao NULL, TIPO diferente: aceita' });

const itensSessao1 = consultar(`SELECT COUNT(*) AS n FROM reconciliacao_itens WHERE sessao_id = 1`);
eq('4 itens sobreviveram (2 recusados não entraram)', itensSessao1[0].n, 4);

console.log('\n=== 5. no máximo uma sessão "revisao" por origem ===');

aplicar(arquivoSql(`INSERT INTO reconciliacao_sessoes (id, origem, status) VALUES (2, 'nuvemshop', 'revisao');`),
  { esperaFalha: /UNIQUE constraint failed/i, rotulo: 'segunda sessão nuvemshop em revisão: banco recusa' });

aplicar(arquivoSql(`INSERT INTO reconciliacao_sessoes (id, origem, status) VALUES (3, 'planilha_estoque_total', 'revisao');`),
  { rotulo: 'sessão de origem DIFERENTE (planilha_estoque_total) em revisão: aceita' });

aplicar(arquivoSql(`UPDATE reconciliacao_sessoes SET status = 'superada' WHERE id = 1;`),
  { rotulo: 'sessão 1 marcada superada' });

aplicar(arquivoSql(`INSERT INTO reconciliacao_sessoes (id, origem, status) VALUES (4, 'nuvemshop', 'revisao');`),
  { rotulo: 'agora uma sessão nuvemshop nova em revisão: aceita (a 1 não conta mais)' });

console.log('\n=== 6. CHECK — estados/tipos/riscos válidos passam, o resto é recusado ===');

aplicar(arquivoSql(`INSERT INTO reconciliacao_sessoes (id, origem, status) VALUES (5, 'nuvemshop', 'aplicada_parcial');`),
  { rotulo: 'status de sessão válido (aplicada_parcial): aceita' });
aplicar(arquivoSql(`INSERT INTO reconciliacao_sessoes (id, origem, status) VALUES (6, 'nuvemshop', 'concluida');`),
  { esperaFalha: /CHECK constraint failed/i, rotulo: 'status de sessão INVENTADO (concluida): banco recusa' });
aplicar(arquivoSql(`INSERT INTO reconciliacao_sessoes (id, origem) VALUES (7, 'planilha_manual');`),
  { esperaFalha: /CHECK constraint failed/i, rotulo: 'origem fora do enum válido (nuvemshop|planilha_estoque_total|planilha_produtos_novos): banco recusa' });

aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, risco, status)
  VALUES (4, 'S2', 'campo', 'trivial', 'obsoleto');
`), { rotulo: 'status de item válido (obsoleto): aceita' });
aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, risco, status)
  VALUES (4, 'S3', 'campo', 'trivial', 'aprovadoo');
`), { esperaFalha: /CHECK constraint failed/i, rotulo: 'status de item com erro de digitação: banco recusa' });
aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, risco)
  VALUES (4, 'S4', 'movimento_direto', 'trivial');
`), { esperaFalha: /CHECK constraint failed/i, rotulo: 'tipo fora dos 4 conhecidos: banco recusa' });
aplicar(arquivoSql(`
  INSERT INTO reconciliacao_itens (sessao_id, sku, tipo, risco)
  VALUES (4, 'S5', 'campo', 'urgente');
`), { esperaFalha: /CHECK constraint failed/i, rotulo: 'risco fora dos 4 conhecidos: banco recusa' });

console.log('\n=== 7. idempotência das migrations ===');

aplicar(MIGRACAO_RECONCILIACAO,
  { rotulo: 'migracao-reconciliacao.sql roda uma SEGUNDA vez sem erro (tudo IF NOT EXISTS)' });
aplicar(MIGRACAO_SYNC_SECO,
  { esperaFalha: /duplicate column/i, rotulo: 'migracao-sync-seco.sql roda uma SEGUNDA vez e FALHA — esperado (ALTER TABLE ADD COLUMN não é IF NOT EXISTS, mesmo padrão de migracao-variacoes.sql)' });

/* ============================================================ limpeza */

rmSync(PERSIST, { recursive: true, force: true });

console.log(`\n${falhas === 0 ? 'TUDO CERTO' : falhas + ' FALHA(S)'}`);
process.exit(falhas ? 1 : 0);
