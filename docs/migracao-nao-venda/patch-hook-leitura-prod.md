# Patch proposto: ler produção deixa de ser tratado como escrever nela

**Arquivo:** `.claude/hooks/protect-production.mjs`, linha **441**
**Status:** NÃO aplicado. O classificador do harness recusa que um agente
reescreva sozinho o próprio hook de segurança — e essa recusa está certa.
Aplique você, ou autorize explicitamente.

## O defeito

O hook tem duas regras para D1 em produção:

- **linha 441** — casa pelo **nome** (`/marquesa-db(?!-dev)/`) e **nega
  sempre**, sem olhar o que o SQL faz.
- **linha 455** — casa pelo **binding** (`d1 execute DB --remote` sem
  `--env staging`) e **já libera leitura pura**: `SELECT`/`WITH`/`PRAGMA`/
  `EXPLAIN` por `--command`, sem nenhum `--file`.

Efeito invertido:

```bash
# PASSA — endereça produção pelo binding, sem citar banco nenhum
npx wrangler d1 execute DB --remote -c api/wrangler.toml --command "SELECT ..."

# NEGADO — o mesmo SELECT, na mesma produção, dizendo qual é o alvo
npx wrangler d1 execute marquesa-db-prod --remote -c api/wrangler.toml --command "SELECT ..."
```

Nomear o alvo fica mais bloqueado do que não dizer banco nenhum. A saída
natural para o agente vira auditar o DEV — que está 12 tabelas atrasado em
relação a PROD. Uma trava que empurra a auditoria para o banco errado protege
o número errado.

O próprio `CLAUDE.md` já diz que isso deveria passar:

> Backup/export do D1 e qualquer consulta somente leitura contra produção
> rodam sem aprovação nenhuma.

## A mudança

Substituir o bloco da linha 441 por:

```js
      /* LER produção não é escrever nela. `SELECT`/`WITH`/`PRAGMA`/`EXPLAIN`
       * por `--command`, sem nenhum `--file`, e `d1 export` (que é backup) não
       * conseguem mutar uma linha sequer.
       *
       * Esta exceção existe porque a regra logo abaixo — a que endereça o
       * banco pelo BINDING — já a aplicava, e a regra por NOME não. O efeito
       * era invertido: `d1 execute DB --remote --command "SELECT …"` passava,
       * e o mesmo SELECT dizendo `marquesa-db-prod` era negado. Nomear o alvo
       * ficava mais bloqueado do que não dizer banco nenhum, e a saída natural
       * era auditar o DEV — que está atrasado em relação à produção. Uma trava
       * que empurra a auditoria para o banco errado protege o número errado.
       *
       * O que NÃO muda: `--file`, `d1 migrations`, qualquer statement que não
       * prove ser leitura, `d1 delete`, `time-travel restore` e o bloco de SQL
       * destrutivo continuam exatamente como estavam. `ehLeituraPura` é
       * fail-closed: o que não prova que lê, conta como escrita. */
      const d1LeituraPura = (() => {
        if (/\bd1\s+export\b/.test(seg)) return true;
        if (!/\bd1\s+execute\b/.test(seg)) return false;
        const cmds = comandosInline(seg);
        return cmds.length > 0
          && arquivosSql(seg).length === 0
          && cmds.every((c) => ehLeituraPura(c));
      })();

      if (/\bd1\s+(execute|migrations|export)\b/.test(seg) && PROD_DB.test(seg) && !d1LeituraPura) {
        negar('Alvo é `marquesa-db` (PRODUÇÃO), não `marquesa-db-dev`. Escrita ou migration '
          + 'em produção exige autorização humana explícita e backup confirmado. '
          + 'Carregue a skill `database-dev` e prove o alvo. '
          + '(Consulta somente leitura — SELECT/WITH/PRAGMA/EXPLAIN por --command, sem --file — passa.)');
      }
```

`ehLeituraPura`, `comandosInline` e `arquivosSql` já existem no arquivo
(linhas 237, 222 e 302). Nenhuma função nova.

## O que continua bloqueado, de propósito

Escrita, migration e `--file` em produção seguem exigindo **Production
Release Approval**. E estas seguem negadas incondicionalmente, com ou sem
aprovação — o patch não as toca:

```
DROP TABLE · DROP DATABASE · TRUNCATE · DELETE/UPDATE em massa sem WHERE
wrangler d1 delete · wrangler d1 time-travel restore · wrangler rollback
wrangler secret put/delete · wrangler deploy
```

## Depois de aplicar, rode o teste do próprio hook

```bash
node .claude/hooks/protect-production.test.mjs
```

Se algum caso fixar "SELECT nomeando prod é negado", esse caso vira o
oposto — e a mudança do teste precisa da mesma decisão humana que o patch.

## Segunda camada, separada desta

Mesmo com o patch, o **classificador do auto mode** do Claude Code bloqueia
`wrangler d1 execute … --remote` genérico. Isso não vem do repositório. Para
liberar, adicione em `.claude/settings.json` › `permissions.allow` — espelhando
a regra que o DEV já tem:

```json
"Bash(npx wrangler d1 execute marquesa-db-prod:*)"
```

Observações sobre o que já está lá:

- `permissions.deny` tem `Bash(npx wrangler d1 execute --remote:*)`. É uma
  regra de **prefixo literal**: casa `npx wrangler d1 execute --remote …`,
  mas não casa `npx wrangler d1 execute marquesa-db-prod --remote …`.
- `.claude/settings.local.json` tem `Bash(npx wrangler *)` no allow. A sintaxe
  de prefixo do Claude Code é `Bash(npx wrangler:*)` — com espaço, a regra não
  casa nada, e é por isso que ela não estava surtindo efeito.

## Enquanto nada disso for aplicado, o caminho que funciona

`d1 export` pelo binding já passa nas três camadas, e foi como esta auditoria
foi feita:

```bash
npx wrangler d1 export DB --remote -c api/wrangler.toml --output prod-dump.sql
```

Baixa o banco inteiro de produção, sem escrever nada. Depois é SQLite local.
