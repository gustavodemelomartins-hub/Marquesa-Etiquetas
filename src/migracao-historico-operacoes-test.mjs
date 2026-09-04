/** A migration roda sobre o schema ANTERIOR, e roda duas vezes.
 *
 * O que se prova aqui não é que o SQL é válido — é que ele é válido no banco
 * que existe HOJE em produção, que é o de antes desta mudança. Um
 * `CREATE TABLE` que só funciona sobre `schema.sql` já atualizado passa em
 * qualquer teste e falha na única vez que importa.
 *
 * Roda 100% local, num SQLite dentro de `api/.wrangler`. Nunca toca a nuvem.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const RAIZ = path.resolve(import.meta.dirname, '..');
const API = path.join(RAIZ, 'api');

let falhas = 0;
const ok = (t, x = '') => console.log(`  ok   ${t}${x !== '' ? '  → ' + x : ''}`);
const bad = (t, x = '') => { falhas++; console.log(`  FALHA ${t}${x ? '  → ' + x : ''}`); };
const eq = (t, a, b) => (String(a) === String(b) ? ok(t, String(a)) : bad(t, `esperava ${b}, veio ${a}`));

/** `--local` mantém tudo num SQLite de arquivo; `DB` é o binding, nunca o
 *  nome do banco — ver api/DEPLOY.md. */
function d1(args) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', ...args],
    { cwd: API, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } });
}
const arquivo = (f) => d1(['--file', f]);
const comando = (sql) => d1(['--json', '--command', sql]);
const linhas = (sql) => {
  const bruto = comando(sql);
  const inicio = bruto.indexOf('[');
  return JSON.parse(bruto.slice(inicio))[0].results;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'marquesa-migracao-'));
const schemaAnterior = path.join(tmp, 'schema-anterior.sql');

console.log('\n=== 1. o banco de ANTES desta mudança ===');
// O schema anterior é o do commit em que `historico_operacoes` ainda não
// existia. Sai do próprio Git, para nunca envelhecer em relação ao repositório.
const anterior = execFileSync('git', ['show', 'HEAD:api/schema.sql'], { cwd: RAIZ, encoding: 'utf8' });
const semTabelaNova = anterior.split('-- ═════════════════════════ decisões duráveis')[0];
fs.writeFileSync(schemaAnterior, semTabelaNova);
eq('o schema anterior realmente não tem a tabela nova',
  /historico_operacoes/.test(semTabelaNova), false);

fs.rmSync(path.join(API, '.wrangler', 'state'), { recursive: true, force: true });
arquivo(schemaAnterior);
const antes = linhas("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'historico_%'");
eq('nenhuma tabela de decisão antes da migration', antes.length, 0);
const lotesAntes = linhas("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='vendas_historico_lotes'");
eq('mas as tabelas que ela referencia já existem', lotesAntes[0].n, 1);

console.log('\n=== 2. a migration aplica sobre esse banco ===');
arquivo(path.join(API, 'migracao-historico-operacoes.sql'));
const tabelas = linhas(
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'historico_%' ORDER BY name",
).map((r) => r.name);
eq('as duas tabelas nasceram', JSON.stringify(tabelas),
  '["historico_operacao_vendas","historico_operacoes"]');

const indices = linhas(
  "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_hist_%' ORDER BY name",
).map((r) => r.name);
eq('e os oito índices também', indices.length, 8);
ok('índices', indices.join(', '));

console.log('\n=== 3. rodar de novo é inofensivo ===');
arquivo(path.join(API, 'migracao-historico-operacoes.sql'));
const tabelas2 = linhas(
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'historico_%'",
);
eq('continuam duas tabelas depois da segunda passada', tabelas2[0].n, 2);

console.log('\n=== 4. o schema completo por cima também é inofensivo ===');
// Quem monta um banco do zero roda `schema.sql`, que já traz a tabela nova.
// Rodar por cima de um banco migrado não pode explodir.
arquivo(path.join(API, 'schema.sql'));
const tabelas3 = linhas(
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'historico_%'",
);
eq('nada duplicou', tabelas3[0].n, 2);

console.log('\n=== 5. as travas do banco valem de verdade ===');
// Sem estas CHECKs, um acerto poderia fechar em número que não soma, e uma
// cobrança paga poderia continuar devendo. É dinheiro em coluna INTEGER.
linhas("INSERT INTO vendas_historico_lotes (id, arquivo_nome, arquivo_hash) VALUES (1,'t.xlsx','h')");
const recusa = (rotulo, sql) => {
  try {
    comando(sql);
    bad(rotulo, 'o banco ACEITOU');
  } catch {
    ok(rotulo);
  }
};
recusa('acerto cujo bruto não é comissão + líquido',
  "INSERT INTO historico_operacoes (lote_id, venda_chave, fingerprint, papel, revendedora_id,"
  + " bruto_centavos, comissao_centavos, liquido_centavos) VALUES (1,'x|2026-01-01','f','acerto',1,100,10,10)");
recusa('cobrança paga com saldo em aberto',
  "INSERT INTO historico_operacoes (lote_id, venda_chave, fingerprint, cobranca_status,"
  + " valor_efetivo_centavos, saldo_centavos) VALUES (1,'y|2026-01-01','f','paga',100,50)");
recusa('cobrança aberta sem saldo',
  "INSERT INTO historico_operacoes (lote_id, venda_chave, fingerprint, cobranca_status,"
  + " valor_efetivo_centavos, saldo_centavos) VALUES (1,'z|2026-01-01','f','aberta',100,0)");
recusa('centavos negativos',
  "INSERT INTO historico_operacoes (lote_id, venda_chave, fingerprint, valor_efetivo_centavos)"
  + " VALUES (1,'w|2026-01-01','f',-1)");
recusa('acerto sem revendedora',
  "INSERT INTO historico_operacoes (lote_id, venda_chave, fingerprint, papel,"
  + " bruto_centavos, comissao_centavos, liquido_centavos) VALUES (1,'v|2026-01-01','f','acerto',100,40,60)");

comando("INSERT INTO historico_operacoes (lote_id, venda_chave, fingerprint) VALUES (1,'ok|2026-01-01','f')");
recusa('duas decisões ATIVAS para a mesma venda',
  "INSERT INTO historico_operacoes (lote_id, venda_chave, fingerprint) VALUES (1,'ok|2026-01-01','f2')");
comando("UPDATE historico_operacoes SET status_registro='substituida' WHERE venda_chave='ok|2026-01-01'");
try {
  comando("INSERT INTO historico_operacoes (lote_id, venda_chave, fingerprint, versao) VALUES (1,'ok|2026-01-01','f2',2)");
  ok('mas a versão seguinte entra depois que a anterior sai de cena');
} catch (e) {
  bad('a versão seguinte deveria entrar', String(e).slice(0, 120));
}

fs.rmSync(tmp, { recursive: true, force: true });

if (falhas) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log('\nTudo certo — a migration sobe no banco de hoje, é idempotente e as travas seguram.');
