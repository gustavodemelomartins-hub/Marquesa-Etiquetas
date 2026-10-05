#!/usr/bin/env node
/** Quais migrations um D1 remoto ainda não recebeu — e, no DEV, aplicá-las.
 *
 *  Por que existe (05/10/2026): o banco do DEV V2 (`marquesa-db-staging-v2`)
 *  estava QUATRO migrations atrás de produção, e Clientes abriu com "Falha
 *  interna". Migration era comando de terminal, lembrado de cabeça; o Pages
 *  subia sozinho a cada push em `develop` e a API e o banco ficavam para
 *  trás. Este programa responde "o que falta?" lendo o próprio banco, e é o
 *  passo que o `deploy-dev.yml` roda antes de publicar o Worker do DEV.
 *
 *  Como sabe se uma migration já entrou: SONDANDO o schema, não por uma
 *  tabela de controle (o D1 de produção nunca teve uma, e inventá-la agora
 *  daria um passado falso). Cada arquivo declara o que cria — `ALTER TABLE
 *  t ADD COLUMN c`, `CREATE TABLE t`, `CREATE INDEX i`, `CREATE TRIGGER g` —
 *  e o estado é:
 *    aplicada   tudo o que ela cria existe;
 *    pendente   nada existe;
 *    parcial    uma parte existe — PARA tudo: alguém aplicou pela metade.
 *  Arquivo que não cria objeto nenhum (só dado) não é sondável: é listado e
 *  nunca aplicado aqui.
 *
 *  O que ele aplica, e onde:
 *    · só com `--aplicar`, e só nos ambientes de DEV (`staging-v2`,
 *      `staging`), provados pelo `wrangler.toml` antes de qualquer escrita;
 *    · só migration ADITIVA pendente — com DROP, RENAME ou DELETE é recusada
 *      e fica para uma pessoa;
 *    · na ordem de `src/migracao-variantes-test.mjs › MIGRACOES` (a ordem em
 *      que produção as recebeu), e as que não estão lá depois, por data do
 *      primeiro commit.
 *  Produção (`--env prod`) é SÓ leitura: o programa recusa `--aplicar` ali.
 *  Migration de produção continua sendo o passo revisado de cada release.
 *
 *    node scripts/d1-migracoes.mjs --env staging-v2            # relatório
 *    node scripts/d1-migracoes.mjs --env staging-v2 --aplicar  # DEV
 *    node scripts/d1-migracoes.mjs --env prod                  # o que PROD não tem
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(RAIZ, 'api');
const args = process.argv.slice(2);
const ENV = args[args.indexOf('--env') + 1];
const APLICAR = args.includes('--aplicar');
const ALVOS = {
  'staging-v2': { banco: 'marquesa-db-staging-v2', id: 'db76e50a-af76-4228-bcad-6be161a61344', escrita: true },
  staging: { banco: 'marquesa-db-dev', id: 'dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b', escrita: true },
  prod: { banco: 'marquesa-db-prod', id: '51dd629b-52dc-46d0-a1af-fa37f0a79533', escrita: false },
};
const parar = (msg) => { console.error(`PAROU: ${msg}`); process.exit(1); };
if (!ALVOS[ENV]) parar(`--env tem de ser um de: ${Object.keys(ALVOS).join(', ')}`);
if (APLICAR && !ALVOS[ENV].escrita) parar('produção é só leitura aqui: migration de PROD é passo revisado da release');

/* ── 1. provar o alvo lendo o wrangler.toml (o binding DB daquele ambiente) */
const toml = readFileSync(path.join(API, 'wrangler.toml'), 'utf8');
const bloco = ENV === 'prod'
  ? toml.slice(0, toml.search(/^\[env\./m))
  : (toml.split(new RegExp(`^\\[\\[env\\.${ENV.replace('-', '\\-')}\\.d1_databases\\]\\]`, 'm'))[1] ?? '').split(/^\[/m)[0];
const nome = /database_name\s*=\s*"([^"]+)"/.exec(bloco)?.[1];
const id = /database_id\s*=\s*"([^"]+)"/.exec(bloco)?.[1];
if (nome !== ALVOS[ENV].banco || id !== ALVOS[ENV].id) {
  parar(`o wrangler.toml resolve --env ${ENV} para ${nome} (${id}); esperado ${ALVOS[ENV].banco} (${ALVOS[ENV].id})`);
}

const wrangler = (...a) => execFileSync(process.execPath,
  [path.join(API, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--remote',
    ...(ENV === 'prod' ? [] : ['--env', ENV]), ...a],
  { cwd: API, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const consultar = (sql) => {
  const saida = wrangler('--json', '--command', sql);
  return JSON.parse(saida.slice(saida.indexOf('[')))[0].results;
};

/* ── 2. o que cada migration cria */
const listaDoTeste = [...readFileSync(path.join(RAIZ, 'src/migracao-variantes-test.mjs'), 'utf8')
  .split('const MIGRACOES = [')[1].split('\n];')[0].matchAll(/'(api\/migracao-[^']+\.sql)'/g)].map((m) => m[1]);
const primeiroCommit = (arq) => {
  try { return execFileSync('git', ['log', '--diff-filter=A', '--format=%ct', '--', arq], { cwd: RAIZ, encoding: 'utf8' }).trim().split('\n').pop() || '9'; } catch { return '9'; }
};
const fora = readdirSync(API).filter((f) => /^migracao-.*\.sql$/.test(f) && !/rollback/.test(f))
  .map((f) => `api/${f}`).filter((f) => !listaDoTeste.includes(f))
  .sort((a, b) => Number(primeiroCommit(a)) - Number(primeiroCommit(b)));
const ordem = [...listaDoTeste, ...fora];

const objetosDe = (sql) => {
  const limpo = sql.replace(/--[^\n]*/g, '');
  const o = [];
  for (const m of limpo.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN\s+"?(\w+)"?/gi)) o.push({ tipo: 'coluna', tabela: m[1], nome: m[2] });
  for (const m of limpo.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)) o.push({ tipo: 'table', nome: m[1] });
  for (const m of limpo.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)) o.push({ tipo: 'index', nome: m[1] });
  for (const m of limpo.matchAll(/CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi)) o.push({ tipo: 'trigger', nome: m[1] });
  const destrutiva = /\b(DROP|RENAME\s+TO|DELETE\s+FROM)\b/i.test(limpo);
  /* Migration de RECONSTRUÇÃO cria tabela de passagem (`x_nova`, `_guard`)
     e a apaga ou renomeia no fim: ela nunca existe depois, e sondá-la faria
     toda migration desse tipo parecer aplicada pela metade. */
  const passagem = new Set([
    ...[...limpo.matchAll(/DROP\s+(?:TABLE|INDEX|TRIGGER)\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/gi)].map((m) => m[1]),
    ...[...limpo.matchAll(/ALTER\s+TABLE\s+"?(\w+)"?\s+RENAME\s+TO/gi)].map((m) => m[1]),
  ]);
  return { o: o.filter((x) => x.tipo === 'coluna' || !passagem.has(x.nome)), destrutiva };
};

/* ── 3. o schema do banco, numa leitura só */
const mestre = consultar(`SELECT type, name FROM sqlite_master WHERE type IN ('table','index','trigger')`);
const existe = new Set(mestre.map((r) => `${r.type}:${r.name}`));
const colunas = new Set(consultar(`SELECT m.name t, p.name c FROM sqlite_master m JOIN pragma_table_info(m.name) p
  WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'`).map((r) => `${r.t}.${r.c}`));
const presente = (x) => (x.tipo === 'coluna' ? colunas.has(`${x.tabela}.${x.nome}`) : existe.has(`${x.tipo}:${x.nome}`));

const relatorio = [];
for (const arq of ordem) {
  const { o, destrutiva } = objetosDe(readFileSync(path.join(RAIZ, arq), 'utf8'));
  /* Tabela criada e depois reconstruída na mesma migration aparece duas
     vezes; o que importa é o conjunto. */
  const unicos = [...new Map(o.map((x) => [`${x.tipo}:${x.tabela ?? ''}.${x.nome}`, x])).values()];
  const tem = unicos.filter(presente).length;
  const estado = !unicos.length ? 'nao_sondavel' : tem === unicos.length ? 'aplicada' : tem === 0 ? 'pendente' : 'parcial';
  relatorio.push({ arq, estado, destrutiva, faltando: unicos.filter((x) => !presente(x)).map((x) => (x.tabela ? `${x.tabela}.${x.nome}` : `${x.tipo} ${x.nome}`)) });
}

const pendentes = relatorio.filter((r) => r.estado === 'pendente');
const parciais = relatorio.filter((r) => r.estado === 'parcial');
console.log(`D1 ${ALVOS[ENV].banco} (--env ${ENV}): ${relatorio.filter((r) => r.estado === 'aplicada').length} aplicadas, `
  + `${pendentes.length} pendentes, ${parciais.length} parciais, ${relatorio.filter((r) => r.estado === 'nao_sondavel').length} sem objeto sondável`);
for (const r of relatorio.filter((x) => x.estado !== 'aplicada')) {
  console.log(`  ${r.estado.padEnd(12)} ${r.arq}${r.destrutiva ? '  (NÃO aditiva)' : ''}${r.faltando.length ? '  falta: ' + r.faltando.slice(0, 4).join(', ') + (r.faltando.length > 4 ? '…' : '') : ''}`);
}
if (parciais.length) parar('migration aplicada pela metade — uma pessoa precisa olhar antes de qualquer escrita');

if (!APLICAR) process.exit(0);
const recusadas = pendentes.filter((r) => r.destrutiva);
if (recusadas.length) parar(`pendente NÃO aditiva fica para uma pessoa: ${recusadas.map((r) => r.arq).join(', ')}`);
for (const r of pendentes) {
  console.log(`aplicando ${r.arq} em ${ALVOS[ENV].banco}…`);
  const saida = wrangler(`--file=${path.join(RAIZ, r.arq)}`);
  console.log('  ' + (saida.match(/Executed[^\n]*/)?.[0] ?? 'ok'));
}
console.log(pendentes.length ? `${pendentes.length} migration(s) aplicada(s).` : 'nada a aplicar.');
