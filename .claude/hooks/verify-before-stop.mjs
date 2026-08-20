#!/usr/bin/env node
/** Stop — impede declarar pronto só porque um arquivo foi editado.
 *
 *  Se o diretório de trabalho tem mudança em código-fonte e a sessão ainda
 *  não foi lembrada, devolve UMA vez a matriz de verificação proporcional à
 *  mudança. Uma vez por sessão, com carimbo em disco: lembrete que repete
 *  vira laço, e laço queima token.
 *
 *  Node puro, sem dependência — portátil entre Windows, WSL2 e container.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let bruto = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (p) => { bruto += p; });
process.stdin.on('end', () => {
  let evento;
  try { evento = JSON.parse(bruto || '{}'); } catch { process.exit(0); }
  if (evento.stop_hook_active) process.exit(0);

  const carimbos = join(tmpdir(), 'marquesa-verify-stamp');
  const carimbo = join(carimbos, `${evento.session_id ?? 'sem-id'}.stamp`);
  if (existsSync(carimbo)) process.exit(0);

  let sujo = '';
  try {
    sujo = execSync('git status --porcelain', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { process.exit(0); }

  const alvos = [
    [/\sapi\/src\//, 'API: `node src/<teste>.mjs` do assunto + `GET /api/estoque/conferir` vazio'],
    [/\sapi\/(schema|migracao-)/, 'Banco: contagens antes/depois, cada delta explicado, e a razão fechando'],
    [/\sfrontend\/src\//, 'Frontend novo: `cd frontend && npm test && npm run build`'],
    [/\ssrc\/dashboard\.tpl\.html/, 'Painel legado: `python src/build.py` e depois `node src/e2e.mjs`'],
  ];
  const pendentes = alvos.filter(([re]) => re.test(`\n${sujo}`)).map(([, texto]) => texto);
  if (pendentes.length === 0) process.exit(0);

  try { mkdirSync(carimbos, { recursive: true }); writeFileSync(carimbo, ''); } catch { /* segue */ }

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: 'Há código-fonte alterado nesta sessão. Antes de encerrar, faça a '
      + 'verificação PROPORCIONAL à mudança — direcionada, não a suíte inteira:\n\n'
      + pendentes.map((p) => `- ${p}`).join('\n')
      + '\n\nSe você já rodou isso, diga em uma linha o que rodou e o resultado, e encerre. '
      + 'Se não dá para rodar agora (Worker fora do ar, banco sujo, dependência faltando), '
      + 'diga isso explicitamente em vez de chamar a mudança de pronta. '
      + 'Este lembrete aparece uma vez por sessão.',
  }));
  process.exit(0);
});
