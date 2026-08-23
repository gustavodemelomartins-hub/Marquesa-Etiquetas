#!/usr/bin/env node

/** Fase 1 do go-live: inventário D1 estritamente somente leitura. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const API = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(API, '..');
const WRANGLER = join(API, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const ALVOS = [
  { chave: 'producao', rotulo: 'PRODUÇÃO ANTIGA', nome: 'marquesa-db', uuid: '089153a9-cee5-4887-b789-a23b1cf419f5', env: [] },
  { chave: 'dev', rotulo: 'DEV REAL', nome: 'marquesa-db-dev', uuid: 'dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b', env: ['--env', 'staging'] },
  /* Banco de produção criado no corte de 2026-08-22, alvo do binding raiz do
     `wrangler.toml`. Entra aqui porque a mesma pergunta da Fase 1 — "os
     números que eu acho que estão lá estão mesmo lá?" — passou a valer para
     ELE, e não mais para o `marquesa-db` antigo. Não entra na lista padrão:
     quem quer o retrato da produção nova pede por nome, com
     `--alvos prod-nova`, e o diff de vendas do site continua sendo entre a
     produção antiga e o DEV. */
  { chave: 'prod-nova', rotulo: 'PRODUÇÃO NOVA', nome: 'marquesa-db-prod', uuid: '51dd629b-52dc-46d0-a1af-fa37f0a79533', env: [] },
];
const ALVOS_PADRAO = ['producao', 'dev'];

/** `--alvos a,b` escolhe quais bancos consultar. Sem a opção, a lista é a
 *  original da Fase 1 — nada do que já foi rodado muda de comportamento. */
export function escolherAlvos(argv, disponiveis = ALVOS) {
  const i = argv.indexOf('--alvos');
  if (i < 0) return disponiveis.filter(a => ALVOS_PADRAO.includes(a.chave));
  const pedidos = String(argv[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!pedidos.length) throw new Error('Uso: --alvos <chave>[,<chave>] — chaves: ' + disponiveis.map(a => a.chave).join(', '));
  const desconhecido = pedidos.find(p => !disponiveis.some(a => a.chave === p));
  if (desconhecido) throw new Error(`Alvo desconhecido: ${desconhecido}. Conhecidos: ${disponiveis.map(a => a.chave).join(', ')}.`);
  return pedidos.map(p => disponiveis.find(a => a.chave === p));
}
const PROIBIDAS = /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|TRUNCATE|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

export function assertReadOnly(sql) {
  const s = String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ').trim();
  if (!/^(?:SELECT|WITH)\b/i.test(s)) throw new Error('SQL bloqueado: deve começar por SELECT ou WITH.');
  if (PROIBIDAS.test(s)) throw new Error(`SQL bloqueado: ${s.match(PROIBIDAS)[0]} detectado.`);
  if (/;\s*\S/.test(s)) throw new Error('SQL bloqueado: somente uma instrução é permitida.');
  return sql;
}

function exec(program, args, cwd = API) {
  const r = spawnSync(program, args, {
    cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error([r.stderr, r.stdout].filter(Boolean).join('\n').trim() || `${program} falhou (${r.status})`);
  return r.stdout || '';
}

function wrangler(args) { return exec(process.execPath, [WRANGLER, ...args]); }

export function parseJsonWrangler(text) {
  const starts = [text.indexOf('['), text.indexOf('{')].filter(n => n >= 0).sort((a, b) => a - b);
  if (!starts.length) throw new Error(`Wrangler não devolveu JSON: ${text.slice(0, 300)}`);
  return JSON.parse(text.slice(starts[0]));
}

function results(text) {
  const json = parseJsonWrangler(text);
  const blocks = Array.isArray(json) ? json : [json];
  const failure = blocks.find(x => x?.success === false);
  if (failure) throw new Error(`D1 recusou SELECT: ${JSON.stringify(failure.error || failure)}`);
  return blocks.flatMap(x => Array.isArray(x?.results) ? x.results : []);
}

function query(target, sql) {
  assertReadOnly(sql);
  return results(wrangler(['d1', 'execute', target.nome, ...target.env, '--remote', '--json', '--command', sql]));
}

function findUuid(value) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:uuid|database_uuid|database_id)$/i.test(key) && typeof item === 'string') return item;
  }
  for (const item of Object.values(value)) { const found = findUuid(item); if (found) return found; }
  return null;
}

function prove(target) {
  const uuid = findUuid(parseJsonWrangler(wrangler(['d1', 'info', target.nome, ...target.env, '--json'])));
  if (uuid !== target.uuid) throw new Error(`PARE: ${target.nome} resolveu para ${uuid || 'UUID vazio'}, esperado ${target.uuid}. Nenhum SELECT foi executado.`);
}

function ident(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Identificador inesperado: ${name}`);
  return `"${name}"`;
}
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

function schemaReader(target, tables) {
  const cache = new Map();
  const columns = table => {
    if (!tables.includes(table)) return [];
    if (!cache.has(table)) cache.set(table, query(target, `SELECT name FROM pragma_table_info(${lit(table)}) ORDER BY cid`).map(x => x.name));
    return cache.get(table);
  };
  return { hasTable: t => tables.includes(t), has: (t, ...cols) => cols.every(c => columns(t).includes(c)) };
}

function snapshot(target, dest) {
  const folder = join(dest, target.chave);
  mkdirSync(folder, { recursive: true });
  const warnings = [];
  const tables = query(target, "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").map(x => x.name);
  const counts = Object.fromEntries(tables.map(t => [t, Number(query(target, `SELECT COUNT(*) AS n FROM ${ident(t)}`)[0]?.n || 0)]));
  const schema = schemaReader(target, tables);
  const optional = (label, requirements, sql) => {
    const missing = requirements.filter(([t, ...cols]) => !schema.hasTable(t) || !schema.has(t, ...cols));
    if (missing.length) {
      warnings.push(`${label}: faltam ${missing.map(([t, ...c]) => `${t}${c.length ? `(${c.join(',')})` : ''}`).join(', ')}.`);
      return [];
    }
    return query(target, sql);
  };

  const ratio = optional('razão contábil', [['produtos', 'sku', 'qtd'], ['movimentos', 'sku', 'qtd']],
    `SELECT p.sku, p.qtd AS saldo, COALESCE(m.soma,0) AS soma_movimentos FROM produtos p LEFT JOIN (SELECT sku,SUM(qtd) soma FROM movimentos GROUP BY sku) m ON m.sku=p.sku WHERE p.qtd<>COALESCE(m.soma,0) ORDER BY p.sku`);
  const salesByOrigin = optional('vendas por origem', [['vendas', 'origem', 'total', 'data', 'cancelada']],
    `SELECT origem,COUNT(*) n,COALESCE(SUM(total),0) soma,MIN(data) primeira,MAX(data) ultima,COALESCE(SUM(cancelada),0) canceladas FROM vendas GROUP BY origem ORDER BY origem`);
  const cases = optional('maletas por status', [['maletas', 'id', 'status'], ['maleta_itens', 'maleta_id', 'qtd', 'devolvida']],
    `SELECT m.status,COUNT(DISTINCT m.id) maletas,COALESCE(SUM(mi.qtd-mi.devolvida),0) pecas_fora FROM maletas m LEFT JOIN maleta_itens mi ON mi.maleta_id=m.id GROUP BY m.status ORDER BY m.status`);

  const maxSale = schema.has('vendas', 'id') ? '(SELECT COALESCE(MAX(id),0) FROM vendas)' : 'NULL';
  const maxMove = schema.has('movimentos', 'id') ? '(SELECT COALESCE(MAX(id),0) FROM movimentos)' : 'NULL';
  const maxMoveAt = schema.has('movimentos', 'criado_em') ? "(SELECT COALESCE(MAX(criado_em),'') FROM movimentos)" : 'NULL';
  const witnesses = query(target, `SELECT ${maxSale} max_venda,${maxMove} max_movimento,${maxMoveAt} ultimo_movimento_em`);
  if (maxSale === 'NULL' || maxMove === 'NULL') warnings.push('testemunhas: algum MAX(id) ficou null por diferença de schema.');

  const orphanDefs = [
    ['mov_orfaos', 'movimentos', 'sku', 'produtos', 'sku'],
    ['item_orfaos', 'venda_itens', 'venda_id', 'vendas', 'id'],
    ['maleta_orfaos', 'maleta_itens', 'maleta_id', 'maletas', 'id'],
  ];
  const orphans = {};
  for (const [key, child, fk, parent, pk] of orphanDefs) {
    if (schema.has(child, fk) && schema.has(parent, pk)) {
      orphans[key] = Number(query(target, `SELECT COUNT(*) n FROM ${ident(child)} f LEFT JOIN ${ident(parent)} p ON p.${ident(pk)}=f.${ident(fk)} WHERE f.${ident(fk)} IS NOT NULL AND p.${ident(pk)} IS NULL`)[0]?.n || 0);
    } else { orphans[key] = null; warnings.push(`${key}: não mensurado por diferença de schema.`); }
  }

  let idempotency = { externo_total: null, externo_distintos: null, duplicados: [], indice_unico: null };
  if (schema.has('vendas', 'externo_id')) {
    const totals = query(target, 'SELECT COUNT(externo_id) externo_total,COUNT(DISTINCT externo_id) externo_distintos FROM vendas')[0];
    const duplicates = query(target, 'SELECT externo_id,COUNT(*) n FROM vendas WHERE externo_id IS NOT NULL GROUP BY externo_id HAVING COUNT(*)>1 ORDER BY externo_id');
    const indexes = query(target, "SELECT name,sql FROM sqlite_schema WHERE type='index' AND tbl_name='vendas' ORDER BY name");
    idempotency = { ...totals, duplicados: duplicates, indice_unico: indexes.some(i => /CREATE\s+UNIQUE\s+INDEX[\s\S]*\bexterno_id\b/i.test(i.sql || '')), indices: indexes };
  } else warnings.push('idempotência: vendas.externo_id não existe.');

  const sync = optional('sync_execucoes', [['sync_execucoes', 'id', 'iniciado_em', 'terminado_em', 'status', 'pedidos_lidos', 'vendas_criadas', 'produtos_enviados']],
    'SELECT id,iniciado_em,terminado_em,status,pedidos_lidos,vendas_criadas,produtos_enviados FROM sync_execucoes ORDER BY id DESC LIMIT 30');
  const siteSales = optional('vendas site', [['vendas', 'externo_id', 'id', 'data', 'total', 'cliente_nome', 'cancelada', 'origem']],
    "SELECT externo_id,id,data,total,cliente_nome,cancelada FROM vendas WHERE origem='site' AND externo_id IS NOT NULL ORDER BY externo_id");
  /* `config` é o estado interno do robô — `syncUltimoPedido` é a memória de
     até onde a leitura de pedidos já chegou. Antes de mexer nela alguém
     precisa saber o valor de ANTES, senão não existe rollback. Nenhum
     segredo mora aqui: token e store_id são secrets do Worker, nunca D1. */
  const settings = optional('config', [['config', 'chave', 'valor']],
    'SELECT chave,valor FROM config ORDER BY chave');
  /* O relatório inteiro da última rodada. É a única prova disponível de
     QUAIS pedidos o robô enxergou e o que ele teria feito — sem ela, a
     conversa sobre "5 vendas antigas que não podem entrar" seria memória
     de conversa, não evidência. Fica em arquivo próprio porque é grande. */
  const lastRun = optional('detalhe da última sync', [['sync_execucoes', 'id', 'seco', 'iniciado_em', 'status', 'detalhe_json']],
    'SELECT id,seco,iniciado_em,status,detalhe_json FROM sync_execucoes ORDER BY id DESC LIMIT 1');
  const stock = optional('resumo estoque', [['produtos', 'status', 'qtd', 'preco']],
    "SELECT COUNT(*) skus,SUM(CASE WHEN status='ativo' THEN 1 ELSE 0 END) ativos,COALESCE(SUM(qtd),0) pecas_total,SUM(CASE WHEN preco IS NULL THEN 1 ELSE 0 END) sem_preco FROM produtos");

  const data = { target, tables, counts, ratio, salesByOrigin, cases, witnesses, orphans, idempotency, sync, siteSales, stock, settings, lastRun, warnings };
  for (const [name, value] of Object.entries({ tables, counts, ratio, salesByOrigin, cases, witnesses, orphans, idempotency, sync, siteSales, stock, settings, lastRun, warnings })) save(join(folder, `${name}.json`), value);
  return data;
}

function diffSite(prod, dev) {
  const map = rows => new Map(rows.map(x => [String(x.externo_id), x]));
  const a = map(prod), b = map(dev), sort = keys => keys.sort((x, y) => x.localeCompare(y, 'pt-BR', { numeric: true }));
  const onlyProd = sort([...a.keys()].filter(k => !b.has(k))).map(k => a.get(k));
  const onlyDev = sort([...b.keys()].filter(k => !a.has(k))).map(k => b.get(k));
  const divergent = sort([...a.keys()].filter(k => b.has(k) && (String(a.get(k).data) !== String(b.get(k).data) || Number(a.get(k).total) !== Number(b.get(k).total) || Number(a.get(k).cancelada || 0) !== Number(b.get(k).cancelada || 0)))).map(k => ({ externo_id: k, producao: a.get(k), dev: b.get(k) }));
  return { total_producao: prod.length, total_dev: dev.length, so_producao: onlyProd, so_dev: onlyDev, divergentes: divergent };
}

const json = value => JSON.stringify(value, null, 2);
const saleLine = v => `${v.externo_id} | ${v.data || '-'} | R$ ${Number(v.total || 0).toFixed(2)} | ${v.cancelada ? 'CANCELADA' : 'ativa'} | ${v.cliente_nome || '-'}`;

function render(snapshots, diff, meta) {
  const risks = [];
  for (const s of snapshots) {
    if (s.ratio.length) risks.push(`${s.target.rotulo}: razão contábil tem ${s.ratio.length} divergência(s).`);
    if (Object.values(s.orphans).some(n => Number(n) > 0)) risks.push(`${s.target.rotulo}: há registros órfãos.`);
    if (s.idempotency.duplicados?.length) risks.push(`${s.target.rotulo}: há externo_id duplicado.`);
    if (s.idempotency.indice_unico === false) risks.push(`${s.target.rotulo}: índice UNIQUE de vendas.externo_id não foi provado.`);
    if (s.warnings.length) risks.push(`${s.target.rotulo}: ${s.warnings.length} métrica(s) incompleta(s) por diferença de schema.`);
  }
  if (diff?.so_producao.length) risks.push(`${diff.so_producao.length} venda(s) site só na produção antiga seriam perdidas.`);
  if (diff?.divergentes.length) risks.push(`${diff.divergentes.length} pedido(s) site existem nos dois bancos com dados diferentes.`);
  const out = [
    'RELATÓRIO — FASE 1 DO GO-LIVE MARQUESA', '========================================', '',
    `Gerado em: ${meta.date}`, `Commit: ${meta.commit}`, `Branch: ${meta.branch}`, `Node: ${process.version}`, `Wrangler: ${meta.wrangler}`, '',
    'ESCOPO E DECISÕES PRESERVADAS',
    '- Somente SELECT via Wrangler D1; nenhuma alteração remota.',
    '- Nenhuma alteração em D1, R2, secrets, migrations, API keys, deploys ou dados.',
    '- Cron antigo já removido manualmente; código permanece com crons=[].',
    '- GitHub Pages atual permanece como produção.',
    '- Não importar histórico ainda.',
    '- Não criar marquesa-db-prod antes de revisar este relatório.', '',
    'ALVOS PROVADOS', ...snapshots.map(s => `- ${s.target.rotulo}: ${s.target.nome} = ${s.target.uuid}`), '',
    'RESUMO EXECUTIVO',
    risks.length ? 'STATUS: PARAR E REVISAR ANTES DA PRÓXIMA FASE.' : 'STATUS: FASE 1 SEM BLOQUEIO NAS MÉTRICAS CONSULTADAS.',
    ...(risks.length ? risks.map(x => `- ${x}`) : ['- Nenhuma divergência bloqueante detectada.']), '',
  ];
  for (const s of snapshots) out.push(
    `DETALHE — ${s.target.rotulo}`, '-'.repeat(60), '',
    'Contagem por tabela:', json(s.counts), '',
    `Razão contábil: ${s.ratio.length ? `${s.ratio.length} DIVERGÊNCIA(S)` : 'FECHA (0 divergências)'}`, ...(s.ratio.length ? [json(s.ratio)] : []), '',
    'Vendas por origem:', json(s.salesByOrigin), '', 'Maletas por status:', json(s.cases), '',
    'Órfãos:', json(s.orphans), '',
    'Idempotência:', json({ externo_total: s.idempotency.externo_total, externo_distintos: s.idempotency.externo_distintos, duplicados: s.idempotency.duplicados, indice_unico_externo_id: s.idempotency.indice_unico }), '',
    'Testemunhas MAX(id):', json(s.witnesses), '', 'Resumo estoque:', json(s.stock), '',
    'Últimas sync_execucoes (até 30):', json(s.sync), '',
    'config (estado interno do robô):', json(s.settings), '',
    ...(s.warnings.length ? ['Avisos:', ...s.warnings.map(x => `- ${x}`), ''] : []),
  );
  /* O diff só existe quando os DOIS bancos daquela pergunta foram lidos.
     Inventar um "0 divergências" a partir de um lado só seria pior que
     omitir: pareceria prova. */
  if (!diff) {
    out.push('DIFF DE VENDAS SITE POR externo_id', '-'.repeat(60),
      'NÃO CALCULADO: a produção antiga e o DEV real não foram lidos na mesma rodada.', '');
    return `${out.join('\n')}\n`;
  }
  out.push(
    'DIFF DE VENDAS SITE POR externo_id', '-'.repeat(60),
    `Produção antiga: ${diff.total_producao}`, `DEV real: ${diff.total_dev}`, `Só produção: ${diff.so_producao.length}`, `Só DEV: ${diff.so_dev.length}`, `Divergentes nos dois: ${diff.divergentes.length}`, '',
    'Somente em produção (bloqueia até decisão item a item):', ...(diff.so_producao.length ? diff.so_producao.map(v => `- ${saleLine(v)}`) : ['- nenhuma']), '',
    'Somente no DEV:', ...(diff.so_dev.length ? diff.so_dev.map(v => `- ${saleLine(v)}`) : ['- nenhuma']), '',
    'Nos dois com dados diferentes:', ...(diff.divergentes.length ? diff.divergentes.map(v => `- ${v.externo_id}\n  produção: ${saleLine(v.producao)}\n  DEV:      ${saleLine(v.dev)}`) : ['- nenhuma']), '',
  );
  return `${out.join('\n')}\n`;
}

function metadata() {
  return {
    date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date()),
    commit: exec('git', ['rev-parse', 'HEAD'], REPO).trim(), branch: exec('git', ['branch', '--show-current'], REPO).trim(),
    wrangler: wrangler(['--version']).trim().split(/\r?\n/).at(-1),
  };
}

function selfTest() {
  assertReadOnly('SELECT 1'); assertReadOnly('WITH x AS (SELECT 1) SELECT * FROM x');
  for (const sql of ['DELETE FROM vendas', 'SELECT 1; UPDATE vendas SET total=0', 'PRAGMA table_info(vendas)']) {
    let blocked = false; try { assertReadOnly(sql); } catch { blocked = true; }
    if (!blocked) throw new Error(`self-test: deveria bloquear ${sql}`);
  }
  if (results(JSON.stringify([{ success: true, results: [{ n: 1 }] }]))[0]?.n !== 1) throw new Error('self-test: parser Wrangler');

  const chaves = argv => escolherAlvos(argv).map(a => a.chave).join(',');
  if (chaves(['node', 'x']) !== 'producao,dev') throw new Error('self-test: sem --alvos a lista tem de ser a original.');
  if (chaves(['node', 'x', '--alvos', 'prod-nova']) !== 'prod-nova') throw new Error('self-test: --alvos não filtrou.');
  if (chaves(['node', 'x', '--alvos', 'dev,producao']) !== 'dev,producao') throw new Error('self-test: --alvos não preservou a ordem pedida.');
  for (const argv of [['node', 'x', '--alvos', 'nao-existe'], ['node', 'x', '--alvos']]) {
    let blocked = false; try { escolherAlvos(argv); } catch { blocked = true; }
    if (!blocked) throw new Error(`self-test: deveria recusar ${JSON.stringify(argv)}`);
  }
  if (!ALVOS.some(a => a.chave === 'prod-nova' && a.uuid === '51dd629b-52dc-46d0-a1af-fa37f0a79533')) {
    throw new Error('self-test: o UUID da produção nova saiu do lugar.');
  }
  console.log('self-test OK: guardas somente leitura, parser Wrangler e escolha de alvos.');
}

export function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const i = process.argv.indexOf('--dest');
  if (i >= 0 && !process.argv[i + 1]) throw new Error('Uso: --dest <diretório>');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\.\d{3}Z$/, 'Z');
  const dest = resolve(i >= 0 ? process.argv[i + 1] : join(REPO, 'backups', 'golive', `${stamp}_inventario`));
  mkdirSync(dest, { recursive: true });
  const reportPath = join(dest, 'RELATORIO.txt');
  try {
    const alvos = escolherAlvos(process.argv);
    console.log('Provando UUIDs antes de qualquer SELECT...');
    for (const target of alvos) { prove(target); console.log(`OK ${target.nome} = ${target.uuid}`); }
    const snapshots = alvos.map(target => { console.log(`Consultando ${target.rotulo} (somente SELECT)...`); return snapshot(target, dest); });
    const porChave = new Map(snapshots.map(s => [s.target.chave, s]));
    const diff = porChave.has('producao') && porChave.has('dev')
      ? diffSite(porChave.get('producao').siteSales, porChave.get('dev').siteSales)
      : null;
    if (diff) save(join(dest, 'diff-vendas-site.json'), diff);
    writeFileSync(reportPath, render(snapshots, diff, metadata()), 'utf8');
    console.log(`Relatório concluído: ${reportPath}`);
  } catch (error) {
    writeFileSync(reportPath, `RELATÓRIO — FASE 1 INCOMPLETA\n\nInterrompido sem escrita remota.\n\nMotivo: ${error.message}\n`, 'utf8');
    console.error(error.message); process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
