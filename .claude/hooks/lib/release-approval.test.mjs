#!/usr/bin/env node
/** Prova `validarAprovacao` — a decisão pura do Production Release Approval.
 *
 *      node .claude/hooks/lib/release-approval.test.mjs
 *
 *  Nenhum destes testes toca disco, `git` ou rede: todo fato (branch, SHA,
 *  árvore limpa, hash de migration) é fabricado. É isso que faz este
 *  arquivo rodar em qualquer máquina, em milissegundos, sem fixture de
 *  repositório — a integração com `git` de verdade é provada à parte, em
 *  `protect-production.test.mjs`.
 */
import { ACOES, JANELA_MAXIMA_MS, validarAprovacao, validarCamposBasicos } from './release-approval.mjs';

let ok = 0;
let falhas = 0;
function t(nome, cond, detalhe = '') {
  if (cond) { ok += 1; }
  else { falhas += 1; console.log(`FALHA: ${nome}${detalhe ? '  → ' + detalhe : ''}`); }
}

const AGORA = new Date('2026-09-06T18:00:00-03:00');
const COMMIT = '1df2ac1234567890abcdef1234567890abcdef12';
const MIGRACAO_HASH = 'a'.repeat(64);

/** Aprovação de referência: válida em todo campo, para os cinco cenários
 *  felizes. Cada teste clona e desvia UM campo por vez. */
function aprovacaoBase(extra = {}) {
  return {
    versao: 1,
    id: 'release-2026-09-06-01',
    ambiente: 'production',
    branch: 'claude/marquesa-operational-review-eztpzt',
    commit: COMMIT,
    acoes: Object.values(ACOES),
    criadaEm: '2026-09-06T15:00:00-03:00',
    expiraEm: '2026-09-07T03:00:00-03:00',
    migration: { arquivo: 'api/migracao-pos-golive-1.sql', sha256: MIGRACAO_HASH },
    ...extra,
  };
}

/** Fatos "tudo certo" para uma ação que não seja migration — a maioria dos
 *  testes só desvia um destes. */
function fatosBase(extra = {}) {
  return {
    agora: AGORA,
    ambienteAlvo: 'production',
    branchAtual: 'main',
    arvoreLimpa: true,
    shaEhAncestral: true,
    migrationArquivo: null,
    migrationHashAtual: null,
    ...extra,
  };
}

/* ═══════════════════════════════════ 1. sem aprovação → sempre bloqueado */
console.log('\n1. sem aprovação');
{
  const r = validarAprovacao({ aprovacao: null, acao: ACOES.PUSH_MAIN, ...fatosBase() });
  t('push main sem aprovação nenhuma é negado', r.ok === false);
  t('motivo explica a ausência', /não há aprovação/i.test(r.motivo), r.motivo);

  const r2 = validarAprovacao({ aprovacao: undefined, acao: ACOES.WORKER_DEPLOY, ...fatosBase() });
  t('deploy sem aprovação também é negado', r2.ok === false);
}

/* ═══════════════════════════ 2. aprovação válida → cada ação autorizada */
console.log('\n2. aprovação válida libera cada ação da lista');
{
  for (const acao of Object.values(ACOES)) {
    const fatos = acao === ACOES.D1_MIGRATE_PROD
      ? fatosBase({ migrationArquivo: 'api/migracao-pos-golive-1.sql', migrationHashAtual: MIGRACAO_HASH })
      : fatosBase();
    const r = validarAprovacao({ aprovacao: aprovacaoBase(), acao, ...fatos });
    t(`"${acao}" liberado com aprovação válida`, r.ok === true, r.motivo);
    t(`"${acao}": motivo cita o id da aprovação`, /release-2026-09-06-01/.test(r.motivo));
  }
}

/* ═══════════════════════════════════════════════ 3. aprovação expirada */
console.log('\n3. aprovação expirada');
{
  const expirada = aprovacaoBase({ expiraEm: '2026-09-06T17:59:59-03:00' });
  const r = validarAprovacao({ aprovacao: expirada, acao: ACOES.PUSH_MAIN, ...fatosBase() });
  t('expirou 1s antes de "agora" → negado', r.ok === false);
  t('motivo fala em expiração', /expirou/i.test(r.motivo), r.motivo);

  const noLimite = aprovacaoBase({ expiraEm: AGORA.toISOString() });
  const r2 = validarAprovacao({ aprovacao: noLimite, acao: ACOES.PUSH_MAIN, ...fatosBase() });
  t('expira EXATAMENTE agora → negado (limite é exclusivo)', r2.ok === false);

  const janelaEnorme = aprovacaoBase({
    criadaEm: '2026-09-06T15:00:00-03:00',
    expiraEm: new Date(new Date('2026-09-06T15:00:00-03:00').getTime() + JANELA_MAXIMA_MS + 1000).toISOString(),
  });
  const r3 = validarAprovacao({ aprovacao: janelaEnorme, acao: ACOES.PUSH_MAIN, ...fatosBase() });
  t('janela maior que o teto (12h) é rejeitada mesmo sem ter expirado ainda', r3.ok === false);
  t('motivo cita o teto', /malformada/i.test(r3.motivo) && /teto/i.test(r3.motivo), r3.motivo);
}

/* ══════════════════════════════════════════════ 4. SHA / branch errados */
console.log('\n4. SHA e branch');
{
  const r = validarAprovacao({
    aprovacao: aprovacaoBase(), acao: ACOES.PUSH_MAIN,
    ...fatosBase({ shaEhAncestral: false }),
  });
  t('commit aprovado não é ancestral do HEAD atual → negado', r.ok === false);
  t('motivo fala em histórico/branch mudou', /histórico/i.test(r.motivo), r.motivo);

  const r2 = validarAprovacao({
    aprovacao: aprovacaoBase(), acao: ACOES.MERGE_MAIN,
    ...fatosBase({ branchAtual: 'claude/marquesa-operational-review-eztpzt' }),
  });
  t('branch atual não é main → negado', r2.ok === false);
  t('motivo pede checkout main', /checkout main/i.test(r2.motivo), r2.motivo);
}

/* ══════════════════════════════ 5. migration diferente da aprovada */
console.log('\n5. migration diferente da aprovada');
{
  const semMigration = aprovacaoBase({ migration: null });
  const r = validarAprovacao({
    aprovacao: semMigration, acao: ACOES.D1_MIGRATE_PROD,
    ...fatosBase({ migrationArquivo: 'api/migracao-pos-golive-1.sql', migrationHashAtual: MIGRACAO_HASH }),
  });
  t('aprovação sem campo migration não cobre nenhuma migration', r.ok === false);

  const r2 = validarAprovacao({
    aprovacao: aprovacaoBase(), acao: ACOES.D1_MIGRATE_PROD,
    ...fatosBase({ migrationArquivo: 'api/migracao-outra.sql', migrationHashAtual: MIGRACAO_HASH }),
  });
  t('arquivo de migration diferente do aprovado → negado', r2.ok === false);
  t('motivo cita os dois nomes', /migracao-outra\.sql/.test(r2.motivo) && /migracao-pos-golive-1\.sql/.test(r2.motivo));

  const r3 = validarAprovacao({
    aprovacao: aprovacaoBase(), acao: ACOES.D1_MIGRATE_PROD,
    ...fatosBase({ migrationArquivo: 'api/migracao-pos-golive-1.sql', migrationHashAtual: 'b'.repeat(64) }),
  });
  t('mesmo arquivo mas conteúdo mudou (hash diferente) → negado', r3.ok === false);
  t('motivo diz que o hash não bate', /hash não bate/i.test(r3.motivo), r3.motivo);

  const r4 = validarAprovacao({
    aprovacao: aprovacaoBase(), acao: ACOES.D1_MIGRATE_PROD,
    ...fatosBase({ migrationArquivo: null, migrationHashAtual: null }),
  });
  t('d1-migrate-prod sem --file (comando solto) → negado mesmo com aprovação', r4.ok === false);
  t('motivo exige --file=', /--file=/.test(r4.motivo), r4.motivo);
}

/* ══════════════════════════════ 6. deploy aprovado → permitido (positivo) */
console.log('\n6. deploy aprovado, cenário completo');
{
  const r = validarAprovacao({
    aprovacao: aprovacaoBase(), acao: ACOES.WORKER_DEPLOY, ...fatosBase(),
  });
  t('worker-deploy com tudo certo é permitido', r.ok === true, r.motivo);

  const r2 = validarAprovacao({
    aprovacao: aprovacaoBase(), acao: ACOES.PAGES_DEPLOY, ...fatosBase(),
  });
  t('pages-deploy com tudo certo é permitido', r2.ok === true, r2.motivo);
}

/* ══════════════════════════════════════ 7. escopo: ação fora da lista */
console.log('\n7. ação não incluída na aprovação');
{
  const escopoReduzido = aprovacaoBase({ acoes: [ACOES.MERGE_MAIN, ACOES.PUSH_MAIN] });
  const r = validarAprovacao({ aprovacao: escopoReduzido, acao: ACOES.WORKER_DEPLOY, ...fatosBase() });
  t('aprovação só de merge+push não libera deploy', r.ok === false);
  t('motivo lista o que ESTÁ autorizado', /merge-main, push-main/.test(r.motivo), r.motivo);

  const r2 = validarAprovacao({ aprovacao: escopoReduzido, acao: ACOES.MERGE_MAIN, ...fatosBase() });
  t('mas continua liberando o que está na lista', r2.ok === true);
}

/* ══════════════════════════════════════════════ 8. ambiente errado */
console.log('\n8. ambiente');
{
  const paraStaging = aprovacaoBase({ ambiente: 'staging' });
  const r = validarAprovacao({ aprovacao: paraStaging, acao: ACOES.WORKER_DEPLOY, ...fatosBase() });
  t('aprovação de staging não libera ação em produção', r.ok === false);
  t('motivo nomeia os dois ambientes', /staging/.test(r.motivo) && /production/.test(r.motivo), r.motivo);
}

/* ══════════════════════════════════════════════ 9. árvore suja */
console.log('\n9. árvore de trabalho suja');
{
  const r = validarAprovacao({
    aprovacao: aprovacaoBase(), acao: ACOES.PUSH_MAIN,
    ...fatosBase({ arvoreLimpa: false }),
  });
  t('árvore com mudança não commitada → negado', r.ok === false);
  t('motivo pede commit ou stash', /commit ou stash/i.test(r.motivo), r.motivo);
}

/* ══════════════════════════════════════ 10. campos malformados */
console.log('\n10. validarCamposBasicos — forma da aprovação');
{
  t('null não é aprovação válida', validarCamposBasicos(null).length > 0);
  t('objeto vazio junta vários problemas', validarCamposBasicos({}).length >= 5);
  t('commit que não parece SHA é rejeitado',
    validarCamposBasicos(aprovacaoBase({ commit: 'not-a-sha' })).some((p) => /commit/.test(p)));
  t('ação desconhecida na lista é rejeitada',
    validarCamposBasicos(aprovacaoBase({ acoes: ['apagar-tudo'] })).some((p) => /desconhecida/.test(p)));
  t('data inválida em criadaEm é rejeitada',
    validarCamposBasicos(aprovacaoBase({ criadaEm: 'ontem' })).some((p) => /criadaEm/.test(p)));
  t('expiraEm antes de criadaEm é rejeitado',
    validarCamposBasicos(aprovacaoBase({ criadaEm: '2026-09-06T15:00:00-03:00', expiraEm: '2026-09-06T10:00:00-03:00' }))
      .some((p) => /depois de/.test(p)));
  t('migration com sha256 curto é rejeitada',
    validarCamposBasicos(aprovacaoBase({ migration: { arquivo: 'x.sql', sha256: 'abc' } }))
      .some((p) => /sha256/.test(p)));
  t('aprovação totalmente válida não tem problema nenhum',
    validarCamposBasicos(aprovacaoBase()).length === 0);
}

/* ══════════════════════════ 11. aprovação malformada nunca "quase passa" */
console.log('\n11. malformada → tratada como ausente, nunca como parcialmente válida');
{
  const r = validarAprovacao({
    aprovacao: { ambiente: 'production' }, // sem branch, commit, acoes, datas
    acao: ACOES.PUSH_MAIN, ...fatosBase(),
  });
  t('aprovação incompleta é negada, não "ask"', r.ok === false);
  t('motivo diz "malformada"', /malformada/i.test(r.motivo), r.motivo);
}

console.log(falhas ? `\n${falhas} FALHA(S) em ${ok + falhas} casos\n` : `\nok — ${ok} casos\n`);
process.exit(falhas ? 1 : 0);
