/** Reconstrói as vendas históricas no D1 sem passar pelo Worker.
 *
 *  POR QUE ISTO EXISTE
 *
 *  A rota `POST /api/vendas/historico/reconstruir` faz a mesma coisa e é o
 *  caminho normal. Mas `wrangler deploy` é Classe C (docs/SECURITY.md):
 *  nenhum agente publica Worker, em ambiente nenhum. Sem publicar, a rota
 *  nova não existe ainda no ar — e a camada derivada precisaria esperar o
 *  deploy para ser conferida contra os dados reais.
 *
 *  Esta ferramenta quebra esse impasse SEM criar uma segunda implementação
 *  da regra: ela importa `reconstruirVendas()` do mesmo módulo que o Worker
 *  usa. O que muda é só o transporte — em vez de `db.batch()`, ela emite o
 *  SQL e o wrangler aplica. Se a regra mudar, muda nos dois ao mesmo tempo,
 *  porque é uma função só.
 *
 *  ESTOQUE: não emite uma única escrita em `produtos` ou `movimentos`.
 *
 *  Uso:
 *      node api/tools/reconstruir-historico.mjs --gerar   # lê o D1 e escreve o SQL
 *  depois:
 *      npx wrangler d1 execute DB --env staging --remote \
 *        -c api/wrangler.toml --file=api/.tmp-sql/reconstrucao.sql
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { reconstruirVendas, REGRA_DESCRITA } from '../src/vendas-historicas.js';
import { normalizarNomeCliente } from '../src/vendas-historico-normalizar.js';

const SAIDA = 'api/.tmp-sql/reconstrucao.sql';

/** Consulta de leitura no marquesa-db-dev. `--json` + argv array: nada passa
 *  pelo shell, então SQL com aspas e acento sobrevive intacto. */
function consultar(sql) {
  const flat = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
  const r = spawnSync(process.execPath, [
    'api/node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB',
    '--env', 'staging', '--remote', '-c', 'api/wrangler.toml',
    '--json', '--command', flat,
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = r.stdout || '';
  const i = out.indexOf('[');
  if (i < 0) throw new Error(`wrangler não devolveu JSON:\n${out}\n${r.stderr}`);
  const blocos = JSON.parse(out.slice(i));
  return blocos.flatMap((b) => b.results ?? []);
}

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

/* ─────────────────────────────────────────────────────────────── leitura */

console.log('lendo os itens do histórico no marquesa-db-dev…');
const itens = consultar(`
  SELECT h.id, h.lote_id, h.origem_linha, h.data, h.cliente_id, h.cliente_nome_norm,
         h.cliente_nome_original, h.qtd, h.valor_total, h.pago, h.canal, h.contexto,
         h.observacao_original
    FROM vendas_historico_itens h
    JOIN vendas_historico_lotes l ON l.id = h.lote_id AND l.status = 'importado'
   ORDER BY h.id`);
console.log(`  ${itens.length} linhas brutas`);

const porLote = new Map();
for (const it of itens) {
  if (!porLote.has(it.lote_id)) porLote.set(it.lote_id, []);
  porLote.get(it.lote_id).push(it);
}

/* clientes e vendas operacionais sem nome normalizado — a dívida do
   `LOWER(TRIM())`, corrigida gravando o que o MESMO JS normaliza */
const clientesSemNorm = consultar('SELECT id, nome FROM clientes WHERE nome_norm IS NULL');
const vendasSemNorm = consultar(`
  SELECT v.id, COALESCE(c.nome, v.cliente_nome) AS nome
    FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id
   WHERE v.cliente_nome_norm IS NULL AND COALESCE(c.nome, v.cliente_nome) IS NOT NULL`);

/* ──────────────────────────────────────────────────────────── reconstrução */

const sql = [];
sql.push('-- GERADO por api/tools/reconstruir-historico.mjs — não edite à mão.');
sql.push(`-- Regra: ${REGRA_DESCRITA.replace(/\n/g, ' ')}`);
sql.push('-- Nenhuma escrita em produtos ou movimentos. Estoque não é tocado.');
sql.push('');

let totalVendas = 0; let totalAjustes = 0; let totalElegiveis = 0; let totalSemData = 0;

for (const [loteId, linhas] of porLote) {
  const vendas = reconstruirVendas(linhas);
  console.log(`lote ${loteId}: ${linhas.length} linhas → ${vendas.filter((v) => v.classe === 'venda').length} vendas`);

  sql.push(`-- ═══ lote ${loteId}: limpar o derivado antes de refazer`);
  sql.push(`UPDATE vendas_historico_itens SET venda_historica_id = NULL, pedido_chave = NULL WHERE lote_id = ${loteId};`);
  sql.push(`DELETE FROM vendas_historicas WHERE lote_id = ${loteId};`);
  sql.push('');

  for (const v of vendas) {
    sql.push('INSERT INTO vendas_historicas (lote_id, chave, classe, regra, cliente_nome, '
      + 'cliente_nome_norm, cliente_id, data, itens, pecas, valor_total, valor_pago, status, '
      + 'elegivel_ticket, canal, contexto, observacao_original, origem_linhas) VALUES ('
      + [loteId, v.chave, v.classe, v.regra, v.clienteNome, v.clienteNomeNorm, v.clienteId,
        v.data, v.itens, v.pecas, v.valorTotal, v.valorPago, v.status,
        v.elegivelTicket ? 1 : 0, v.canal, v.contexto, v.observacaoOriginal,
        JSON.stringify(v.origemLinhas)].map(lit).join(', ')
      + ');');
    sql.push('UPDATE vendas_historico_itens SET '
      + `venda_historica_id = (SELECT id FROM vendas_historicas WHERE lote_id = ${loteId} AND chave = ${lit(v.chave)}), `
      + `pedido_chave = ${lit(v.chave)} `
      + `WHERE lote_id = ${loteId} AND id IN (${v.itensIds.join(',')});`);

    if (v.classe === 'ajuste') totalAjustes++; else totalVendas++;
    if (v.elegivelTicket) totalElegiveis++;
    if (v.classe === 'venda' && !v.data) totalSemData++;
  }
  sql.push('');
}

sql.push('-- ═══ uma normalização de cliente, gravada pelo mesmo JS do histórico');
for (const c of clientesSemNorm) {
  sql.push(`UPDATE clientes SET nome_norm = ${lit(normalizarNomeCliente(c.nome))} WHERE id = ${c.id};`);
}
for (const v of vendasSemNorm) {
  sql.push(`UPDATE vendas SET cliente_nome_norm = ${lit(normalizarNomeCliente(v.nome))} WHERE id = ${v.id};`);
}

mkdirSync('api/.tmp-sql', { recursive: true });
writeFileSync(SAIDA, sql.join('\n') + '\n', 'utf8');

console.log(`\n${SAIDA} escrito.`);
console.log(`  vendas         ${totalVendas}`);
console.log(`  ajustes        ${totalAjustes}`);
console.log(`  elegíveis      ${totalElegiveis}`);
console.log(`  sem data       ${totalSemData}`);
console.log(`  clientes norm  ${clientesSemNorm.length}`);
console.log(`  vendas norm    ${vendasSemNorm.length}`);
