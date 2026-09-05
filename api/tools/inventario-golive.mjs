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

  /* ─── PRÉ-VOO DAS MIGRATIONS PENDENTES (somente leitura)
   *
   *  "duplicate column name" NÃO é sinal de sucesso: ele diz que a coluna
   *  já existe, e não diz nada sobre as outras da mesma migration. Uma
   *  migration que morreu no meio deixa metade das colunas — e rodá-la de
   *  novo pararia no primeiro ALTER, sem aplicar o resto.
   *
   *  Este bloco olha ANTES: para cada migration, quantos dos artefatos dela
   *  já estão no banco. 0 = não aplicada. Todos = aplicada. Qualquer coisa
   *  no meio = PARCIAL, e aí ninguém executa nada antes de olhar. */
  const migrations = [
    ['migracao-venda-desconto.sql', [
      ['coluna', 'venda_itens', 'preco_tabela'],
      ['coluna', 'venda_itens', 'desconto_valor'],
      ['coluna', 'venda_itens', 'desconto_rotulo'],
    ]],
    ['migracao-historico-operacoes.sql', [
      ['tabela', 'historico_operacoes'],
      ['tabela', 'historico_operacao_vendas'],
    ]],
    ['migracao-vendas-pagamento.sql', [
      ['coluna', 'vendas', 'pago'],
      ['coluna', 'vendas', 'data_pagamento'],
      ['coluna', 'vendas', 'observacao'],
      ['coluna', 'vendas', 'pagamento_origem'],
      ['coluna', 'vendas', 'valor_recebido'],
      ['coluna', 'vendas', 'cobravel'],
    ]],
    ['migracao-vendas-cliente-ambiguo.sql', [
      ['coluna', 'vendas', 'cliente_ambiguo'],
    ]],
    ['migracao-saidas-sem-faturamento.sql', [
      ['tabela', 'saidas_sem_faturamento'],
      ['tabela', 'historico_reclassificacao'],
    ]],
    ['migracao-garantias.sql', [
      ['tabela', 'garantias'],
      ['tabela', 'garantia_eventos'],
      ['tabela', 'garantia_trocas'],
      ['tabela', 'feriados'],
    ]],
  ];
  const preflight = migrations.map(([arquivo, artefatos]) => {
    const detalhe = artefatos.map(([tipo, alvo, coluna]) => ({
      tipo, alvo, coluna: coluna ?? null,
      presente: tipo === 'tabela' ? schema.hasTable(alvo) : schema.has(alvo, coluna),
    }));
    const presentes = detalhe.filter(d => d.presente).length;
    const estado = presentes === 0 ? 'NAO_APLICADA'
      : presentes === detalhe.length ? 'APLICADA' : 'PARCIAL';
    if (estado === 'PARCIAL') {
      warnings.push(`PARE: ${arquivo} está PARCIALMENTE aplicada (${presentes}/${detalhe.length}). `
        + `Faltam: ${detalhe.filter(d => !d.presente).map(d => d.coluna ? `${d.alvo}.${d.coluna}` : d.alvo).join(', ')}.`);
    }
    return { arquivo, estado, presentes, total: detalhe.length, detalhe };
  });

  /* ─── §1: quantas vendas seriam pagas, não pagas e indeterminadas
   *
   *  Roda ANTES da migration de propósito: nenhuma coluna nova é usada. A
   *  classificação sai da evidência que JÁ existe no banco, e é exatamente
   *  a mesma que o backfill aplica. Sem este número, marcar tudo como pago
   *  seria transformar conta a receber em faturamento no escuro. */
  const EVID = estado => `EXISTS (SELECT 1 FROM historico_operacao_vendas hov
      JOIN historico_operacoes ho ON ho.id = hov.operacao_id
     WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa'
       AND ho.status_registro = 'ativa' AND ho.cobranca_status = ${lit(estado)}
       ${estado === 'paga' ? 'AND ho.paga_em IS NOT NULL' : ''})`;
  const CLASSE = `CASE
      WHEN ${EVID('aberta')} THEN 'evidencia_pendencia'
      WHEN ${EVID('paga')}   THEN 'evidencia_pagamento'
      WHEN v.origem = 'site' THEN 'indeterminado_site'
      ELSE 'sem_evidencia_legado' END`;
  const payments = optional('classificação de pagamento',
    [['vendas', 'id', 'origem', 'data', 'total', 'cancelada'],
     ['historico_operacao_vendas', 'venda_id', 'operacao_id', 'status_registro'],
     ['historico_operacoes', 'id', 'cobranca_status', 'paga_em', 'status_registro']],
    `SELECT classe, COUNT(*) AS vendas, ROUND(COALESCE(SUM(total),0),2) AS valor,
            MIN(data) AS primeira, MAX(data) AS ultima
       FROM (SELECT v.id, v.total, v.data, ${CLASSE} AS classe
               FROM vendas v WHERE v.cancelada = 0)
      GROUP BY classe ORDER BY classe`);
  /* A lista nominal do que ficaria indeterminado. É o relatório de
     conferência humana que §1 exige — número agregado não se confere. */
  const paymentsUnknown = optional('vendas indeterminadas',
    [['vendas', 'id', 'origem', 'data', 'total', 'cancelada', 'externo_id', 'cliente_nome'],
     ['historico_operacao_vendas', 'venda_id', 'operacao_id', 'status_registro'],
     ['historico_operacoes', 'id', 'cobranca_status', 'paga_em', 'status_registro']],
    `SELECT v.id AS venda_id, v.externo_id, v.origem, v.cliente_nome, v.data, v.total,
            v.nuvemshop_status,
            -- Tudo o que o banco permite saber sobre o pagamento deste pedido.
            -- Vazio nas colunas abaixo = nao ha evidencia nenhuma: o pedido
            -- existir NAO e evidencia de que o dinheiro entrou.
            (SELECT ho.cobranca_status FROM historico_operacao_vendas hov
               JOIN historico_operacoes ho ON ho.id = hov.operacao_id
              WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa'
                AND ho.status_registro = 'ativa' ORDER BY ho.id DESC LIMIT 1) AS cobranca_status,
            (SELECT ho.paga_em FROM historico_operacao_vendas hov
               JOIN historico_operacoes ho ON ho.id = hov.operacao_id
              WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa'
                AND ho.status_registro = 'ativa' ORDER BY ho.id DESC LIMIT 1) AS paga_em,
            (SELECT COUNT(*) FROM historico_operacao_vendas hov
              WHERE hov.venda_id = v.id AND hov.status_registro = 'ativa') AS operacoes_ligadas
       FROM vendas v
      WHERE v.cancelada = 0 AND v.origem = 'site'
      ORDER BY v.data DESC, v.id DESC LIMIT 500`);

  /* O DDL das tabelas que as migrations tocam. Ler o schema de verdade e o
     que impede um pre-voo de acertar por coincidencia. */
  const ddl = query(target,
    `SELECT type, name, tbl_name, sql FROM sqlite_schema
      WHERE tbl_name IN ('vendas','venda_itens','historico_operacoes','historico_operacao_vendas')
        AND sql IS NOT NULL ORDER BY tbl_name, type DESC, name`);

  /* Faturamento por mes, nas DUAS populacoes, separadas de proposito. Nao e
     o numero do painel (que soma as duas e aplica reclassificacao): e a
     materia-prima dele, para comparar antes x depois sem o Worker. */
  const revenueOperational = optional('faturamento operacional por mes',
    [['vendas', 'data', 'total', 'cancelada', 'origem', 'revendedora_id']],
    `SELECT strftime('%Y-%m', v.data) AS mes, COUNT(*) AS vendas,
            ROUND(COALESCE(SUM(v.total),0),2) AS valor
       FROM vendas v
      WHERE v.cancelada = 0 AND v.origem <> 'acerto' AND v.revendedora_id IS NULL
      GROUP BY mes ORDER BY mes`);
  const revenueHistoric = optional('faturamento historico por mes',
    [['vendas_historicas', 'data', 'valor_pago', 'classe', 'lote_id'],
     ['vendas_historico_lotes', 'id', 'status']],
    `SELECT strftime('%Y-%m', vh.data) AS mes, COUNT(*) AS vendas,
            ROUND(COALESCE(SUM(vh.valor_pago),0),2) AS valor_pago
       FROM vendas_historicas vh
       JOIN vendas_historico_lotes l ON l.id = vh.lote_id AND l.status = 'importado'
      WHERE vh.classe = 'venda' AND vh.data IS NOT NULL
      GROUP BY mes ORDER BY mes`);

  /* Saldo negativo e peca que o sistema acha que existe menos que zero.
     Separado da razao contabil: sao defeitos diferentes. */
  const negativeStock = optional('saldos negativos', [['produtos', 'sku', 'qtd', 'desc']],
    'SELECT sku, desc, qtd FROM produtos WHERE qtd < 0 ORDER BY qtd');

  /* Candidatos historicos a nao-venda.
     ATENCAO: varredura CRUA de texto, NAO a classificacao do modulo
     auditoria-historico.js. Existe para dizer QUANTAS linhas merecem passar
     pelo classificador em producao - nunca para decidir. */
  const FILTRO_CAND = `LOWER(COALESCE(h.cliente_nome_original,'')) LIKE 'brinde%'
         OR LOWER(COALESCE(h.observacao_original,'')) LIKE '%brinde%'
         OR LOWER(COALESCE(h.cliente_nome_original,'')) LIKE '%invent%'
         OR UPPER(COALESCE(h.observacao_original,'')) LIKE '%PERDID%'
         OR UPPER(COALESCE(h.observacao_original,'')) LIKE '%ACHO QUE%'
         OR LOWER(COALESCE(h.observacao_original,'')) LIKE '%uso pessoal%'`;
  const REQ_CAND = [
    ['vendas_historico_itens', 'id', 'cliente_nome_original', 'observacao_original',
      'qtd', 'valor_total', 'data', 'sku', 'lote_id'],
    ['vendas_historico_lotes', 'id', 'status'],
  ];
  const historicCandidates = optional('candidatos historicos', REQ_CAND,
    `SELECT CASE
              WHEN LOWER(COALESCE(h.cliente_nome_original,'')) LIKE 'brinde%'
                OR LOWER(COALESCE(h.observacao_original,'')) LIKE '%brinde%' THEN 'brinde'
              WHEN LOWER(COALESCE(h.cliente_nome_original,'')) LIKE '%invent%'
                OR UPPER(COALESCE(h.observacao_original,'')) LIKE '%PERDID%'
                OR UPPER(COALESCE(h.observacao_original,'')) LIKE '%ACHO QUE%' THEN 'perda_ou_inventario'
              ELSE 'uso_proprio_ou_outro' END AS grupo,
            COUNT(*) AS linhas, COALESCE(SUM(h.qtd),0) AS pecas,
            ROUND(COALESCE(SUM(h.valor_total),0),2) AS valor
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
      WHERE ${FILTRO_CAND}
      GROUP BY grupo ORDER BY grupo`);
  /* Retirada pessoal so pode ser encontrada por NOME, e nome nao e identidade
     (§2). Esta consulta NAO classifica: ela lista as linhas cujo nome de
     "cliente" parece o da propria dona do negocio, para que uma pessoa olhe.
     Sem ela, a pergunta "quantas retiradas pessoais existem em producao?"
     ficaria sem resposta ate o Worker novo estar publicado. */
  const personalWithdrawals = optional('linhas com nome de retirada pessoal', REQ_CAND,
    `SELECT h.id, h.data, h.cliente_nome_original AS nome, h.sku, h.qtd,
            h.valor_total AS valor, h.observacao_original AS observacao
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
      WHERE LOWER(COALESCE(h.cliente_nome_original,'')) LIKE '%sthefany%'
         OR LOWER(COALESCE(h.cliente_nome_original,'')) LIKE '%stefany%'
         OR LOWER(COALESCE(h.cliente_nome_original,'')) LIKE '%stephany%'
         OR LOWER(COALESCE(h.cliente_nome_original,'')) LIKE '%marquesa%'
         OR LOWER(COALESCE(h.observacao_original,'')) LIKE '%uso proprio%'
         OR LOWER(COALESCE(h.observacao_original,'')) LIKE '%uso pr%prio%'
         OR LOWER(COALESCE(h.observacao_original,'')) LIKE '%pessoal%'
      ORDER BY h.data, h.id LIMIT 300`);

  const historicCandidateRows = optional('candidatos historicos linha a linha', REQ_CAND,
    `SELECT h.id, h.data, h.cliente_nome_original AS nome, h.sku, h.qtd,
            h.valor_total AS valor, h.observacao_original AS observacao
       FROM vendas_historico_itens h
       JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
      WHERE ${FILTRO_CAND}
      ORDER BY h.data, h.id LIMIT 500`);

  /* ─── §2: nome não é identidade, e aqui está a prova de que isso importa
     neste banco: cadastros diferentes que dividem o mesmo nome normalizado. */
  const homonyms = optional('cadastros homônimos', [['clientes', 'id', 'nome', 'nome_norm']],
    `SELECT nome_norm, COUNT(*) AS cadastros, GROUP_CONCAT(id) AS ids
       FROM clientes WHERE nome_norm IS NOT NULL
      GROUP BY nome_norm HAVING COUNT(*) > 1
      ORDER BY cadastros DESC, nome_norm`);

  /* ─── as contas a receber que existem HOJE. É o número que a migration
     não pode mover: conta aberta antes tem que continuar aberta depois. */
  const receivables = optional('contas a receber',
    [['historico_operacoes', 'cobranca_status', 'saldo_centavos', 'papel', 'status_registro']],
    `SELECT cobranca_status, COUNT(*) AS operacoes,
            COALESCE(SUM(saldo_centavos),0) AS saldo_centavos
       FROM historico_operacoes
      WHERE status_registro = 'ativa' AND papel = 'cliente'
      GROUP BY cobranca_status ORDER BY cobranca_status`);

  const extras = {
    preflight, payments, paymentsUnknown, homonyms, receivables,
    ddl, revenueOperational, revenueHistoric, negativeStock,
    historicCandidates, historicCandidateRows, personalWithdrawals,
  };
  const data = { target, tables, counts, ratio, salesByOrigin, cases, witnesses, orphans, idempotency, sync, siteSales, stock, settings, lastRun, ...extras, warnings };
  for (const [name, value] of Object.entries({ tables, counts, ratio, salesByOrigin, cases, witnesses, orphans, idempotency, sync, siteSales, stock, settings, lastRun, ...extras, warnings })) save(join(folder, `${name}.json`), value);
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
    /* Migration pela metade é o risco que "duplicate column name" esconde:
       rodar de novo pararia no primeiro artefato existente sem aplicar o
       resto, e a mensagem de erro pareceria a de uma migration já feita. */
    for (const m of (s.preflight ?? [])) {
      if (m.estado === 'PARCIAL') {
        risks.push(`${s.target.rotulo}: ${m.arquivo} está PARCIALMENTE aplicada `
          + `(${m.presentes}/${m.total}) — NÃO execute; inspecione primeiro.`);
      }
    }
    const indet = (s.payments ?? []).find(x => x.classe === 'indeterminado_site');
    if (indet && Number(indet.vendas) > 0) {
      risks.push(`${s.target.rotulo}: ${indet.vendas} venda(s) do site sem estado de pagamento conhecido `
        + `(R$ ${Number(indet.valor || 0).toFixed(2)}) — conferência humana antes do backfill.`);
    }
    if ((s.negativeStock ?? []).length) {
      risks.push(`${s.target.rotulo}: ${s.negativeStock.length} SKU(s) com saldo NEGATIVO.`);
    }
    if ((s.homonyms ?? []).length) {
      risks.push(`${s.target.rotulo}: ${s.homonyms.length} nome(s) repetido(s) em cadastros diferentes — `
        + 'ficha por nome não identifica; use o id.');
    }
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
    'Pré-voo das migrations (nenhuma foi executada):',
    ...(s.preflight ?? []).map(m => `- ${m.arquivo}: ${m.estado} (${m.presentes}/${m.total})`
      + (m.estado === 'APLICADA' ? '' : `
    faltando: ${m.detalhe.filter(d => !d.presente).map(d => d.coluna ? `${d.alvo}.${d.coluna}` : d.alvo).join(', ') || '—'}`)),
    '',
    'Classificação de pagamento das vendas (evidência que já existe no banco):',
    json(s.payments), '',
    'Vendas do site sem estado de pagamento conhecido (até 200):',
    json(s.paymentsUnknown), '',
    'Contas a receber hoje (o número que a migration não pode mover):',
    json(s.receivables), '',
    'Cadastros que dividem o mesmo nome normalizado:',
    json(s.homonyms), '',
    'Saldos negativos:', json(s.negativeStock), '',
    'Faturamento operacional por mes (vendas de cliente, sem acerto):',
    json(s.revenueOperational), '',
    'Faturamento historico por mes (valor_pago das vendas reconstruidas):',
    json(s.revenueHistoric), '',
    'Candidatos historicos a nao-venda - varredura CRUA de texto,',
    'NAO e a classificacao do modulo de auditoria:', json(s.historicCandidates), '',
    'Linhas com nome de retirada pessoal (NAO classificadas - para conferencia):',
    json(s.personalWithdrawals), '',
    'DDL das tabelas que as migrations tocam:', json(s.ddl), '',
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
