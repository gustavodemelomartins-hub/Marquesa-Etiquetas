#!/usr/bin/env node
/** A diferença entre dois bancos, como SQL que leva o primeiro ao segundo.
 *
 *  Para que serve: a reconciliação roda pelas rotas reais do Worker sobre
 *  uma CÓPIA do banco de produção. O resultado precisa chegar a produção sem
 *  que a produção rode nada além de um arquivo que pode ser lido, revisado e
 *  desfeito (o Time Travel do D1 volta ao bookmark de antes).
 *
 *  Três travas no próprio arquivo, antes de qualquer escrita:
 *
 *    1. PRECONDIÇÃO — as contagens e os maiores ids do banco de ORIGEM. Se
 *       produção mudou entre o export e a aplicação (uma venda de balcão, uma
 *       maleta), a trava falha e o arquivo inteiro para ali.
 *    2. IDEMPOTÊNCIA — uma linha-marca em `config`. Aplicar de novo esbarra na
 *       chave primária.
 *    3. CHAVE ESTRANGEIRA adiada até o fim, para a ordem interna não importar.
 *
 *  Linhas são casadas pela chave primária de cada tabela. Tabela sem chave
 *  primária declarada é recusada — não há como casar linha sem identidade.
 *
 *    node scripts/reconciliacao/diferenca-sql.mjs <antes.sqlite> <depois.sqlite> <saida.sql> <marca>
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const [arqAntes, arqDepois, saida, marca] = process.argv.slice(2);
if (!arqAntes || !arqDepois || !saida || !marca) {
  console.error('uso: diferenca-sql.mjs <antes.sqlite> <depois.sqlite> <saida.sql> <marca>');
  process.exit(2);
}
const antes = new DatabaseSync(arqAntes, { readOnly: true });
const depois = new DatabaseSync(arqDepois, { readOnly: true });

const tabelas = depois.prepare(`SELECT name FROM sqlite_master WHERE type='table'
  AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'`).all().map((r) => r.name);
const tabelasAntes = new Set(antes.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name));
for (const t of tabelas) if (!tabelasAntes.has(t)) { console.error(`tabela nova sem migration: ${t}`); process.exit(1); }

/* Ordem de dependência: pai antes de filho nos INSERTs, o inverso nos
   DELETEs. A FK adiada cobre o resto, mas a ordem certa deixa o arquivo
   legível na revisão. */
const deps = new Map(tabelas.map((t) => [t,
  new Set(depois.prepare(`PRAGMA foreign_key_list("${t}")`).all().map((f) => f.table).filter((x) => x !== t))]));
const ordem = [];
const visto = new Set();
const visitar = (t) => { if (visto.has(t)) return; visto.add(t); for (const d of deps.get(t) ?? []) if (deps.has(d)) visitar(d); ordem.push(t); };
tabelas.forEach(visitar);

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString('hex')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const q = (c) => `"${c}"`;

const resumo = {};
const ins = [];
const upd = [];
const del = [];
for (const t of ordem) {
  const cols = depois.prepare(`PRAGMA table_info("${t}")`).all();
  const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  const nomes = cols.map((c) => c.name);
  const lerTudo = (db) => new Map(db.prepare(`SELECT * FROM "${t}"`).all().map((r) => [JSON.stringify(pk.map((k) => r[k])), r]));
  const a = lerTudo(antes);
  const b = lerTudo(depois);
  const iguais = (x, y) => nomes.every((n) => (x[n] ?? null) === (y[n] ?? null)
    || (typeof x[n] === 'number' && typeof y[n] === 'number' && x[n] === y[n]));
  let ni = 0; let nu = 0; let nd = 0;
  for (const [k, r] of b) {
    if (!a.has(k)) {
      ins.push(`INSERT INTO ${q(t)} (${nomes.map(q).join(', ')}) VALUES (${nomes.map((n) => lit(r[n])).join(', ')});`);
      ni++;
    } else if (!iguais(a.get(k), r)) {
      const x = a.get(k);
      const mudou = nomes.filter((n) => !pk.includes(n) && (x[n] ?? null) !== (r[n] ?? null));
      upd.push(`UPDATE ${q(t)} SET ${mudou.map((n) => `${q(n)} = ${lit(r[n])}`).join(', ')}`
        + ` WHERE ${pk.map((c) => `${q(c)} = ${lit(r[c])}`).join(' AND ')};`);
      nu++;
    }
  }
  const apagar = [];
  for (const [k, r] of a) if (!b.has(k)) { apagar.push(`DELETE FROM ${q(t)} WHERE ${pk.map((c) => `${q(c)} = ${lit(r[c])}`).join(' AND ')};`); nd++; }
  if ((ni || nu || nd) && !pk.length) { console.error(`tabela ${t} mudou e não tem chave primária`); process.exit(1); }
  del.unshift(...apagar);
  if (ni || nu || nd) resumo[t] = { inserir: ni, atualizar: nu, apagar: nd };
}

/* Os números que provam que o banco de destino é o mesmo de onde a
   diferença foi tirada. */
const pre = {};
for (const t of Object.keys(resumo)) {
  pre[t] = Number(antes.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n);
}
const saldo = Number(antes.prepare('SELECT COALESCE(SUM(qtd),0) s FROM produtos').get().s);
const maxMov = Number(antes.prepare('SELECT COALESCE(MAX(id),0) m FROM movimentos').get().m);
const maxVenda = Number(antes.prepare('SELECT COALESCE(MAX(id),0) m FROM vendas').get().m);
const condicoes = [
  ...Object.entries(pre).map(([t, n]) => `(SELECT COUNT(*) FROM ${q(t)}) = ${n}`),
  `(SELECT COALESCE(SUM(qtd),0) FROM produtos) = ${saldo}`,
  `(SELECT COALESCE(MAX(id),0) FROM movimentos) = ${maxMov}`,
  `(SELECT COALESCE(MAX(id),0) FROM vendas) = ${maxVenda}`,
];

const linhas = [
  `-- ${marca}`,
  `-- gerado de ${arqAntes.split(/[\\/]/).pop()} -> ${arqDepois.split(/[\\/]/).pop()}`,
  ...Object.entries(resumo).map(([t, r]) => `--   ${t}: +${r.inserir} ~${r.atualizar} -${r.apagar}`),
  'PRAGMA defer_foreign_keys = true;',
  `INSERT INTO config (chave, valor) VALUES (${lit(marca)}, ${lit(new Date().toISOString())});`,
  'CREATE TABLE _reconciliacao_precondicao (ok INTEGER NOT NULL CHECK (ok = 1));',
  `INSERT INTO _reconciliacao_precondicao (ok) SELECT CASE WHEN ${condicoes.join('\n  AND ')} THEN 1 ELSE 0 END;`,
  'DROP TABLE _reconciliacao_precondicao;',
  ...del, ...upd, ...ins,
];
writeFileSync(saida, linhas.join('\n') + '\n');
console.log(JSON.stringify({ saida, resumo, instrucoes: linhas.length, precondicoes: condicoes.length }, null, 1));
