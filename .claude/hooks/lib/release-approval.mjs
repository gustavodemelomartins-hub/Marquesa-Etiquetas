/** LEGADO INERTE desde 2026-09-08.
 *  O hook ativo não importa este módulo; mantido para auditoria histórica.
 *  A política vigente está em docs/SECURITY.md.
 *
 *  Núcleo de decisão do antigo "Production Release Approval".
 *
 *  Migra o modelo de autorização de "por comando" para "por release": uma
 *  aprovação efêmera (`.claude/approvals/production-release.json`), escrita
 *  a partir de uma instrução humana explícita no chat, libera uma sequência
 *  fechada de ações (merge em `main`, push de `main`, migration aprovada no
 *  D1 de produção, deploy do Worker, deploy do painel) dentro de uma janela
 *  de tempo curta — em vez de exigir aprovação humana a cada `Bash`
 *  individual dessa sequência.
 *
 *  ─── o que este arquivo NÃO faz
 *
 *  Não fala com o disco, não chama `git`, não sabe rodar comando nenhum.
 *  Tudo aqui é função pura: recebe fatos já apurados (branch atual, se a
 *  árvore está limpa, se o commit aprovado é ancestral do HEAD, o hash do
 *  arquivo de migration) e devolve `{ ok, motivo }`. Quem apura os fatos e
 *  quem decide o que fazer com `{ ok, motivo }` é `protect-production.mjs`.
 *  A separação existe para isto ser testável sem precisar de um repositório
 *  Git de mentira: os testes chamam `validarAprovacao` direto, com fatos
 *  fabricados.
 *
 *  ─── por que uma aprovação não é um cheque em branco
 *
 *  Ela só destrava as CINCO ações em `ACOES` — nunca `DROP`, `TRUNCATE`,
 *  `d1 delete`, `time-travel restore`, `git push --force`, `git reset
 *  --hard`, alteração de secret, ou escrita forçada na Nuvemshop. Essas
 *  continuam negadas em `protect-production.mjs` de forma incondicional,
 *  sem olhar para aprovação nenhuma — ver CLAUDE.md § Nunca execute e
 *  docs/SECURITY.md § Classe C.
 *
 *  E mesmo dentro das cinco ações, uma aprovação só vale para o release
 *  exato que ela descreve: branch, commit (ou um descendente dele — depois
 *  de um merge, o HEAD de `main` é um commit NOVO, mas o commit aprovado
 *  continua no histórico dele) e, quando a ação é aplicar migration, o
 *  ARQUIVO e o HASH exatos aprovados. Mudou o arquivo depois da aprovação?
 *  A aprovação para de valer para ele — é o que impede um "sim" de ontem
 *  cobrir um SQL diferente hoje.
 */

/** As únicas ações que uma aprovação de release pode liberar. Qualquer
 *  string fora desta lista é sempre inválida — nunca adivinhe uma ação
 *  nova aqui sem também decidir, em `protect-production.mjs`, exatamente
 *  qual comando ela destrava. */
export const ACOES = Object.freeze({
  MERGE_MAIN: 'merge-main',
  PUSH_MAIN: 'push-main',
  D1_MIGRATE_PROD: 'd1-migrate-prod',
  WORKER_DEPLOY: 'worker-deploy',
  PAGES_DEPLOY: 'pages-deploy',
});

const ACOES_VALIDAS = new Set(Object.values(ACOES));

/** Teto absoluto de validade, embutido no código — não no arquivo. Uma
 *  aprovação com `expiraEm` mais longe que isto no futuro é inválida por
 *  inteiro, mesmo que `criadaEm`/`expiraEm` estejam formatados direito. Sem
 *  este teto, um erro de digitação ("expira em 2027", não 2026) ficaria
 *  válido por um ano. 12h cobre uma janela de release com folga, sem
 *  aprovação nenhuma sobrevivendo de um dia para o outro. */
export const JANELA_MAXIMA_MS = 12 * 60 * 60 * 1000;

const SHA_RE = /^[0-9a-f]{7,40}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

/** Confere a FORMA da aprovação, sem julgar se ela se aplica a nada. Usada
 *  tanto por quem carrega o arquivo (um JSON malformado deve ser tratado
 *  como "sem aprovação", não travar o hook) quanto pelos testes.
 *  Devolve a lista de problemas — vazia é válido. */
export function validarCamposBasicos(aprovacao) {
  const problemas = [];
  if (!aprovacao || typeof aprovacao !== 'object') {
    return ['aprovação não é um objeto'];
  }
  if (typeof aprovacao.ambiente !== 'string' || !aprovacao.ambiente) {
    problemas.push('campo `ambiente` ausente ou vazio');
  }
  if (typeof aprovacao.branch !== 'string' || !aprovacao.branch) {
    problemas.push('campo `branch` ausente ou vazio');
  }
  if (typeof aprovacao.commit !== 'string' || !SHA_RE.test(aprovacao.commit)) {
    problemas.push('campo `commit` ausente ou não parece um SHA de Git');
  }
  if (!Array.isArray(aprovacao.acoes) || !aprovacao.acoes.length) {
    problemas.push('campo `acoes` ausente ou vazio');
  } else {
    for (const a of aprovacao.acoes) {
      if (!ACOES_VALIDAS.has(a)) problemas.push(`ação desconhecida em \`acoes\`: "${a}"`);
    }
  }
  const criadaEm = Date.parse(aprovacao.criadaEm);
  const expiraEm = Date.parse(aprovacao.expiraEm);
  if (Number.isNaN(criadaEm)) problemas.push('campo `criadaEm` não é uma data válida (use ISO 8601 com fuso)');
  if (Number.isNaN(expiraEm)) problemas.push('campo `expiraEm` não é uma data válida (use ISO 8601 com fuso)');
  if (!Number.isNaN(criadaEm) && !Number.isNaN(expiraEm)) {
    if (expiraEm <= criadaEm) problemas.push('`expiraEm` não é depois de `criadaEm`');
    if (expiraEm - criadaEm > JANELA_MAXIMA_MS) {
      problemas.push(`janela de validade maior que o teto permitido (${JANELA_MAXIMA_MS / 3600000}h)`);
    }
  }
  if (aprovacao.migration != null) {
    if (typeof aprovacao.migration !== 'object') {
      problemas.push('campo `migration` presente mas não é um objeto');
    } else {
      if (typeof aprovacao.migration.arquivo !== 'string' || !aprovacao.migration.arquivo) {
        problemas.push('`migration.arquivo` ausente ou vazio');
      }
      if (typeof aprovacao.migration.sha256 !== 'string' || !SHA256_RE.test(aprovacao.migration.sha256)) {
        problemas.push('`migration.sha256` ausente ou não parece um sha256');
      }
    }
  }
  return problemas;
}

/** Decide se a ação `acao` pode prosseguir, dados os fatos apurados por
 *  quem chama. Nunca lança — sempre devolve `{ ok, motivo }`, e `motivo`
 *  está preenchido nos dois casos (é o que vira a mensagem do `ask`/`deny`
 *  ou o comentário do `allow`).
 *
 *  Fail-closed em cada etapa: a primeira coisa que não bate faz `ok:false`
 *  e para — nunca acumula "quase válido".
 *
 *  @param {object}   args.aprovacao      objeto já parseado do JSON, ou
 *                                        `null`/`undefined` se não há
 *                                        arquivo (ou não deu para ler).
 *  @param {string}   args.acao           uma de `ACOES`.
 *  @param {Date}     args.agora          "agora", injetado — testável sem
 *                                        depender do relógio real.
 *  @param {string}   args.ambienteAlvo   o ambiente que O COMANDO está
 *                                        tentando afetar (hoje só existe
 *                                        `"production"` neste projeto).
 *  @param {string}   args.branchAtual    branch git no momento da ação
 *                                        (depois de simular `checkout`/
 *                                        `switch` anteriores no mesmo
 *                                        comando — ver `ramoSimulado` em
 *                                        `protect-production.mjs`).
 *  @param {boolean}  args.arvoreLimpa    nenhuma modificação NÃO commitada
 *                                        em arquivo RASTREADO (`git status
 *                                        --porcelain` sem linha fora de
 *                                        `??`) — arquivo não rastreado não
 *                                        conta como sujeira, ver
 *                                        `arvoreEstaLimpa` em
 *                                        protect-production.mjs.
 *  @param {boolean}  args.shaEhAncestral `git merge-base --is-ancestor
 *                                        <aprovacao.commit> HEAD` — true
 *                                        também quando são o mesmo commit.
 *  @param {?string}  args.migrationArquivo  caminho do `--file=` do
 *                                        comando, normalizado relativo à
 *                                        raiz do repositório — `null`
 *                                        quando a ação não é sobre um
 *                                        arquivo (ex.: deploy).
 *  @param {?string}  args.migrationHashAtual  sha256 do CONTEÚDO atual de
 *                                        `migrationArquivo` — `null` se o
 *                                        arquivo não existe/não leu.
 */
export function validarAprovacao({
  aprovacao,
  acao,
  agora,
  ambienteAlvo,
  branchAtual,
  arvoreLimpa,
  shaEhAncestral,
  migrationArquivo = null,
  migrationHashAtual = null,
}) {
  if (!ACOES_VALIDAS.has(acao)) {
    return { ok: false, motivo: `ação interna desconhecida: "${acao}" (bug em protect-production.mjs, não na aprovação)` };
  }

  if (!aprovacao) {
    return {
      ok: false,
      motivo: 'não há aprovação de release ativa '
        + '(.claude/approvals/production-release.json ausente, ilegível ou não é JSON).',
    };
  }

  const problemas = validarCamposBasicos(aprovacao);
  if (problemas.length) {
    return { ok: false, motivo: `aprovação malformada — ${problemas.join('; ')}.` };
  }

  if (aprovacao.ambiente !== ambienteAlvo) {
    return {
      ok: false,
      motivo: `a aprovação é para o ambiente "${aprovacao.ambiente}", não "${ambienteAlvo}".`,
    };
  }

  const criadaEm = new Date(aprovacao.criadaEm);
  const expiraEm = new Date(aprovacao.expiraEm);
  if (criadaEm.getTime() > agora.getTime()) {
    return {
      ok: false,
      motivo: `a aprovação tem \`criadaEm\` no futuro (${aprovacao.criadaEm}) — relógio ou arquivo suspeito.`,
    };
  }
  if (agora.getTime() >= expiraEm.getTime()) {
    return {
      ok: false,
      motivo: `a aprovação expirou em ${aprovacao.expiraEm} (agora: ${agora.toISOString()}). `
        + 'Peça uma aprovação nova para continuar o release.',
    };
  }

  if (!aprovacao.acoes.includes(acao)) {
    return {
      ok: false,
      motivo: `a ação "${acao}" não está entre as autorizadas por esta aprovação `
        + `(autorizadas: ${aprovacao.acoes.join(', ')}).`,
    };
  }

  if (branchAtual !== 'main') {
    return {
      ok: false,
      motivo: `esta ação espera rodar com \`main\` já em checkout (branch atual: "${branchAtual}"). `
        + 'O release sempre publica a partir de `main` — dê `git checkout main` antes.',
    };
  }

  if (!arvoreLimpa) {
    return {
      ok: false,
      motivo: 'a árvore de trabalho não está limpa (`git status --porcelain` não veio vazio). '
        + 'Faça commit ou stash antes de uma ação de release.',
    };
  }

  if (!shaEhAncestral) {
    return {
      ok: false,
      motivo: `o commit aprovado (${aprovacao.commit}) não está no histórico do HEAD atual — `
        + 'a branch mudou (ou main avançou) depois da aprovação. Peça uma aprovação nova.',
    };
  }

  if (acao === ACOES.D1_MIGRATE_PROD) {
    if (!aprovacao.migration) {
      return {
        ok: false,
        motivo: 'a aprovação não cobre nenhuma migration, e esta ação está aplicando uma. '
          + 'Se o release não precisa de migration, esta ação não deveria estar na lista `acoes`.',
      };
    }
    if (migrationArquivo == null) {
      return {
        ok: false,
        motivo: 'a aprovação cobre migration POR ARQUIVO (`--file=`), não comando solto. '
          + `Use --file=${aprovacao.migration.arquivo}.`,
      };
    }
    if (aprovacao.migration.arquivo !== migrationArquivo) {
      return {
        ok: false,
        motivo: `o arquivo "${migrationArquivo}" não é o aprovado ("${aprovacao.migration.arquivo}").`,
      };
    }
    if (migrationHashAtual == null) {
      return {
        ok: false,
        motivo: `não consegui ler "${migrationArquivo}" para conferir o hash contra a aprovação.`,
      };
    }
    if (aprovacao.migration.sha256 !== migrationHashAtual) {
      return {
        ok: false,
        motivo: `o conteúdo de "${migrationArquivo}" mudou desde a aprovação (o hash não bate). `
          + 'Gere uma aprovação nova para o conteúdo atual — nunca reaproveite a antiga.',
      };
    }
  }

  return {
    ok: true,
    motivo: `liberado pela aprovação "${aprovacao.id ?? '(sem id)'}" `
      + `(branch ${aprovacao.branch}, commit ${aprovacao.commit.slice(0, 7)}, `
      + `expira ${aprovacao.expiraEm}).`,
  };
}
