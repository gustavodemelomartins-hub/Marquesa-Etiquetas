#!/usr/bin/env node
/** Prova a governança production-first do hook, e que ela olha o DESTINO.
 *
 *  A pergunta que este teste responde não é "o comando é perigoso?", e sim
 *  "contra o quê?". A mesma migration é autônoma contra `marquesa-db-dev` e
 *  pede decisão humana contra `marquesa-db-prod` enquanto a produção estiver
 *  congelada. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(aqui, 'protect-production.mjs');
const raiz = path.resolve(aqui, '..', '..');
let ok = 0;
let falhas = 0;

function decisao(command, cwd = raiz) {
  const r = spawnSync(process.execPath, [hook], {
    cwd,
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  if (r.status !== 0) return `erro:${r.status}:${r.stderr}`;
  if (!r.stdout.trim()) return 'allow';
  try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; }
  catch { return `json-invalido:${r.stdout}`; }
}

function t(nome, atual, esperado) {
  if (atual === esperado) ok += 1;
  else { falhas += 1; console.log(`FALHA: ${nome} — esperado ${esperado}, veio ${atual}`); }
}

console.log('\n1. DEV e staging continuam autônomos');
for (const cmd of [
  'npx wrangler deploy --env staging',
  'npx wrangler secret put API_KEY --env staging',
  'npx wrangler d1 execute DB --env staging --remote --command "SELECT 1"',
  'npx wrangler d1 execute marquesa-db-dev --remote --file=api/migracao-publicacao-catalogo.sql',
  'npx wrangler d1 migrations apply DB --env staging --remote',
  'npx wrangler pages deploy publicar --project-name marquesa-dev --branch develop',
  'git push origin develop',
  'git push origin claude/refactor-sistema-marquesa',
  'git checkout main && git merge codex/release',
]) t(cmd, decisao(cmd), 'allow');

console.log('\n2. Leitura e execução local não são publicação');
for (const cmd of [
  'npx wrangler d1 execute DB --local --command "SELECT 1"',
  'npx wrangler tail --env staging',
  'npx wrangler d1 list',
  'npx wrangler deployments list',
  'git log --oneline -5',
]) t(cmd, decisao(cmd), 'allow');

console.log('\n3. Produção congelada: Classe C deixa de ser autônoma');
for (const cmd of [
  'npx wrangler deploy',
  'npx wrangler rollback',
  'npx wrangler triggers deploy',
  'npx wrangler secret put API_KEY',
  'npx wrangler d1 execute DB --remote --file=api/migracao-publicacao-catalogo.sql',
  'npx wrangler d1 execute marquesa-db-prod --remote --command "SELECT 1"',
  'npx wrangler d1 migrations apply DB --remote',
  'npx wrangler d1 time-travel restore marquesa-db-prod --timestamp=2026-09-08T10:00:00Z',
  'git push origin main',
  'git push origin HEAD:main',
  'git push origin +main',
]) t(cmd, decisao(cmd), 'ask');

console.log('\n4. Alvo que não se consegue provar vale o mesmo que produção');
for (const cmd of [
  /* A cópia congelada de rollback não pertence a ambiente nenhum: ela nunca
     é "DEV por eliminação". */
  'npx wrangler d1 execute marquesa-db --remote --command "SELECT 1"',
  'npx wrangler deploy --env producao',
  'npx wrangler pages deploy . --project-name marquesa',
  'git push',
  'git push origin',
]) t(cmd, decisao(cmd), 'ask');

console.log('\n5. Classe D é Classe D em qualquer ambiente');
for (const cmd of [
  'git push --force origin main',
  'git push --force-with-lease origin develop',
  'git push origin --delete develop',
  'git reset --hard HEAD~1',
  'git clean -fd',
  'npx wrangler d1 delete marquesa-db-prod',
  'npx wrangler delete marquesa-api',
  'npx wrangler d1 execute DB --env staging --remote --command "DROP TABLE produtos"',
  'npx wrangler d1 execute DB --env staging --remote --command "DELETE FROM produtos"',
  'curl -X POST https://marquesa-api.workers.dev/api/sync -d \'{"forcar":true}\'',
]) t(cmd, decisao(cmd), 'ask');

console.log('\n6. Segredos e dados reais continuam fora do contexto');
for (const cmd of ['cat api/.dev.vars', 'type .env', 'head backups/prod.sql']) {
  t(cmd, decisao(cmd), 'deny');
}
t('arquivo example é público', decisao('cat api/.dev.vars.example'), 'allow');
t('documentar comando não executa comando', decisao("cat > docs/x.md <<'EOF'\nnpx wrangler deploy\nEOF"), 'allow');

console.log('\n7. O freeze é um estado, não uma regra costurada no código');
{
  /* Um repositório de mentira com a mesma declaração de ambientes e a
     produção DESCONGELADA: Classe C volta a ser autônoma, e Classe D não. */
  const falso = mkdtempSync(path.join(tmpdir(), 'marquesa-freeze-'));
  mkdirSync(path.join(falso, 'api'), { recursive: true });
  mkdirSync(path.join(falso, '.claude'), { recursive: true });
  copyFileSync(path.join(raiz, 'api', 'wrangler.toml'), path.join(falso, 'api', 'wrangler.toml'));
  writeFileSync(
    path.join(falso, '.claude', 'governanca.json'),
    JSON.stringify({ prodCongelada: false, ramosProtegidos: ['main'], pagesNaoProdutivos: ['marquesa-dev'] }),
  );
  t('descongelada: deploy de produção volta a ser autônomo', decisao('npx wrangler deploy', falso), 'allow');
  t('descongelada: push em main volta a ser autônomo', decisao('git push origin main', falso), 'allow');
  t('descongelada: migration em produção volta a ser autônoma',
    decisao('npx wrangler d1 execute marquesa-db-prod --remote --command "SELECT 1"', falso), 'allow');
  t('descongelada: Classe D continua pedindo instrução humana',
    decisao('git push --force origin main', falso), 'ask');

  /* E sem o arquivo de governança nenhum, o padrão é CONGELADA: um arquivo
     perdido não pode destravar produção. */
  const semArquivo = mkdtempSync(path.join(tmpdir(), 'marquesa-sem-gov-'));
  mkdirSync(path.join(semArquivo, 'api'), { recursive: true });
  copyFileSync(path.join(raiz, 'api', 'wrangler.toml'), path.join(semArquivo, 'api', 'wrangler.toml'));
  t('sem governanca.json o padrão é congelada', decisao('npx wrangler deploy', semArquivo), 'ask');
  t('sem governanca.json staging continua autônomo',
    decisao('npx wrangler deploy --env staging', semArquivo), 'allow');
}

console.log(falhas ? `\n${falhas} FALHA(S) em ${ok + falhas} casos\n` : `\nok — ${ok} casos\n`);
process.exit(falhas ? 1 : 0);
