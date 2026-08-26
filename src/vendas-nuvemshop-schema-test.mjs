/** Prova banco novo e produção antiga + migration, sempre em pasta temporária. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = process.cwd();
const apiDir = join(raiz, 'api');
const migration = join(apiDir, 'migracao-vendas-nuvemshop.sql');
const schema = join(apiDir, 'schema.sql');
let falhas = 0, seq = 0;
const ok = t => console.log('  ok   ' + t);
const eq = (t, a, b) => String(a) === String(b) ? ok(t) : (falhas++, console.log(`  FALHA ${t}: esperava ${b}, veio ${a}`));

function sqlFile(dir, sql) {
  const f = join(dir, `q-${seq++}.sql`);
  writeFileSync(f, sql, 'utf8');
  return f;
}
function rodar(dir, file, json = false) {
  const args = ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', dir, '--file', file];
  if (json) args.push('--json');
  return execFileSync('npx', args, { cwd: apiDir, encoding: 'utf8', shell: true });
}
function consultar(dir, sql) {
  const out = rodar(dir, sqlFile(dir, sql), true);
  return JSON.parse(out.match(/\[[\s\S]*\]/)[0])[0].results;
}

const antigo = mkdtempSync(join(tmpdir(), 'marquesa-venda-old-'));
const novo = mkdtempSync(join(tmpdir(), 'marquesa-venda-new-'));
try {
  console.log('\n=== 1. schema anterior + migration aditiva ===');
  // Deriva uma fotografia realmente anterior à migration. Usar `git show
  // HEAD` deixava o teste dependente do commit corrente e reaplicava colunas
  // que já existem no schema novo.
  const schemaAnterior = readFileSync(schema, 'utf8')
    .split(/\r?\n/)
    .filter(l => !/^\s*nuvemshop_(status|erro|em)\s/.test(l))
    .filter(l => !/^\s*variacao\s+TEXT,\s*-- nome para leitura\/histórico/.test(l))
    .filter(l => !/^\s*variante_id\s+TEXT\s*-- identidade estável na Nuvemshop/.test(l))
    .filter(l => !/^CREATE INDEX IF NOT EXISTS idx_venda_itens_variante/.test(l))
    .join('\n');
  // Sem as duas colunas posteriores, `motivo` volta a ser a última coluna.
  const schemaLegado = schemaAnterior.replace(
    /^(\s*motivo\s+TEXT),\s*(-- §8: venda\|perda\|quebra\|brinde\|troca\|\.\.\.)$/m,
    '$1  $2'
  );
  rodar(antigo, sqlFile(antigo, schemaLegado));
  rodar(antigo, sqlFile(antigo, `
    INSERT INTO produtos (sku,desc,cat,preco,qtd) VALUES ('PRE','Prévia','Colar',10,1);
    INSERT INTO vendas (cliente_nome,origem,data,total) VALUES ('Cliente','balcao','2026-08-25',10);
    INSERT INTO venda_itens (venda_id,sku,desc,qtd,preco,motivo) VALUES (1,'PRE','Prévia',1,10,'venda');
  `));
  rodar(antigo, migration);
  const venda = consultar(antigo, `SELECT cliente_nome,nuvemshop_status FROM vendas WHERE id=1`)[0];
  eq('venda antiga sobreviveu', venda.cliente_nome, 'Cliente');
  eq('default seguro entrou', venda.nuvemshop_status, 'nao_enviada');
  const cols = consultar(antigo, `SELECT name FROM pragma_table_info('venda_itens')`).map(x => x.name);
  eq('venda_itens ganhou variante_id', cols.includes('variante_id'), true);
  const idx = consultar(antigo, `SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name='idx_venda_itens_variante'`)[0].n;
  eq('índice novo existe', idx, 1);

  console.log('\n=== 2. banco criado do zero pelo schema novo ===');
  rodar(novo, schema);
  const novas = consultar(novo, `SELECT name FROM pragma_table_info('vendas')`).map(x => x.name);
  eq('schema novo tem nuvemshop_status', novas.includes('nuvemshop_status'), true);
  const itens = consultar(novo, `SELECT name FROM pragma_table_info('venda_itens')`).map(x => x.name);
  eq('schema novo tem variacao e variante_id', itens.includes('variacao') && itens.includes('variante_id'), true);
} finally {
  rmSync(antigo, { recursive: true, force: true });
  rmSync(novo, { recursive: true, force: true });
}

console.log(falhas ? `\n✗ ${falhas} FALHA(S)` : '\n✓ TUDO PASSOU');
process.exit(falhas ? 1 : 0);
