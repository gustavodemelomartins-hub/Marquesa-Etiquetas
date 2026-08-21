---
name: pre-deploy-check
description: Carregue antes de qualquer deploy, publicação ou "subir para produção". Checklist de dez itens — Git, testes, build, secrets, migrations, mudanças críticas, backup, diff, ambiente e rollback. O deploy em si é Classe C e nunca é executado por um agente.
---

# Antes de publicar

> **`npx wrangler deploy` é Classe C** ([docs/SECURITY.md](../../../docs/SECURITY.md))
> e está no `deny` do `.claude/settings.json`. **Quem publica é uma pessoa.**
> Seu trabalho é deixar a decisão pronta, com o rollback escrito.

Percorra os dez itens. Um item não verificado é um item reprovado.

## 1. Git limpo, ou inteiramente compreendido

```bash
git status
git diff --stat
git log --oneline -10
```

- [ ] Nada não commitado por acidente.
- [ ] Todo arquivo modificado tem motivo.
- [ ] `dashboard.html` só aparece se o front mudou de verdade — no Windows,
      confira com `git diff --ignore-cr-at-eol`, porque o build reescreve o
      arquivo inteiro com CRLF.

> **Atenção neste repositório:** o `origin` aponta para o GitHub de verdade.
> `git push` publica de fato, e o PWA sai do ar se o `dashboard.html` subir
> quebrado — o GitHub Pages serve a branch direto. `push` só quando alguem
> pedir; `push --force` nunca.
> Ver [docs/BACKUP_RECOVERY.md](../../../docs/BACKUP_RECOVERY.md).

## 2. Testes

Banco limpo e Worker local recém-subido, **um teste por vez**:

```bash
node src/sync-test.mjs        # esperado: 67 ok, 0 falhas
node src/variacoes-test.mjs   # esperado: 48 ok, 0 falhas
node src/kits-test.mjs        # esperado: 20 ok, 0 falhas
node src/e2e.mjs              # esperado: 66 ok, 0 falhas
node src/import-total-test.mjs # esperado: 14 ok, 0 falhas
```

- [ ] Os cinco passam: **209 asserções, 0 falhas**.
- [ ] O resultado bate com [docs/BASELINE.md](../../../docs/BASELINE.md).
      Queda em relação ao baseline é regressão.
- [ ] O `e2e` rodou de verdade. É o único teste que prova que interface e
      API conversam — pular por pressa é publicar sem essa prova.

## 3. Build

- [ ] Se `src/dashboard.tpl.html` ou `index.html` mudou:
      `python src/build.py` foi rodado.
- [ ] O `dashboard.html` regerado está no commit. Publicar o template sem
      regerar não muda nada para quem usa — e é um erro silencioso.
- [ ] Se `api/schema.sql` mudou: `node api/gerar-schema-console.mjs` foi
      rodado.

## 4. Secrets

- [ ] **Nenhum segredo no diff.** Confira: `git diff | grep -iE "token|secret|key|senha|bearer"`.
- [ ] `.dev.vars` não está sendo commitado (`git check-ignore api/.dev.vars`).
- [ ] Se uma variável **nova** foi introduzida: ela está em `.env.example`
      (só o nome), e alguém sabe que precisa rodar `wrangler secret put`
      **antes** do deploy — senão a rota nova nasce quebrada.
- [ ] Se uma variável de texto foi adicionada: ela está no
      `api/wrangler.toml`. O `wrangler deploy` **apaga** as variáveis de
      texto do painel que não estejam lá. (Secrets não são afetados.)

## 5. Migrations

- [ ] Há mudança de schema? Se sim, a skill `safe-d1-change` foi percorrida
      inteira.
- [ ] A migration foi testada nas **duas** direções: banco do zero e banco
      antigo.
- [ ] A ordem está clara: a migration roda **antes** do deploy quando o
      código novo depende dela.
- [ ] Ninguém está publicando código que lê uma coluna que ainda não existe.

## 6. Mudanças críticas

Passe os olhos no diff procurando por:

- [ ] alguma escrita em `produtos.qtd` fora de `movimentar`? — **para tudo**;
- [ ] mudança em `estoque.js › movimentar` ou na tabela `EFEITO`;
- [ ] mudança na ordem de `sincronizar` (puxar antes de empurrar);
- [ ] mudança nos freios (`syncLimiteMudancas`, `syncLimiteZerar`) ou no uso
      de `forcar`;
- [ ] remoção ou alteração de `idx_vendas_externo`;
- [ ] mudança em `semearVariacoes` — as duas travas continuam de pé?
- [ ] mudança em `auth.js` ou no CORS.

Qualquer um desses exige releitura da regra correspondente em
[api/REGRAS.md](../../../api/REGRAS.md) e menção explícita no resumo.

## 7. Backup

Obrigatório quando houver migration, importação em massa, ou sincronização
forçada:

- [ ] `npx wrangler d1 export marquesa-db --remote --output …` feito;
- [ ] o arquivo foi **conferido** (não vazio, tabelas presentes, razão
      fechando);
- [ ] bookmark de Time Travel anotado.

Procedimento: [docs/BACKUP_RECOVERY.md](../../../docs/BACKUP_RECOVERY.md).

## 8. Diff revisado

- [ ] `git diff` lido inteiro, não só o `--stat`.
- [ ] Nenhum `console.log` de depuração, nenhum código comentado esquecido,
      nenhum `TODO` que na verdade é um bug.
- [ ] Os comentários do código continuam verdadeiros depois da mudança. Este
      repositório documenta o **porquê** dentro do código; comentário que
      virou mentira é pior que comentário nenhum.

## 9. Ambiente certo

- [ ] `api/wrangler.toml`: `name = "marquesa-api"`, `database_name =
      "marquesa-db"`, `database_id` correto.
- [ ] `ORIGENS_PERMITIDAS` aponta para o endereço público do painel.
- [ ] O cron (`0 9,21 * * *` UTC) continua o pretendido.
- [ ] Você está na conta certa da Cloudflare.

## 10. Rollback definido ANTES

Escreva, antes de publicar:

- [ ] **Código:** qual versão volta. O Cloudflare guarda as versões
      anteriores do Worker; saiba qual é a última boa.
- [ ] **Banco:** o bookmark de Time Travel, ou o arquivo de export.
- [ ] **Sinal:** o que indica que deu errado — `GET /api/health` responde?
      `GET /api/state` responde? A próxima rodada de sincronização
      terminou em `ok`?
- [ ] **Quem decide** reverter, e em quanto tempo.

Deploy sem rollback escrito não é deploy: é aposta.

## Depois de publicar (a pessoa faz, você acompanha)

```bash
curl https://<worker>/api/health          # {"ok":true,...}
```

- [ ] `GET /api/state` responde com a chave certa.
- [ ] `GET /api/estoque/conferir` volta vazio.
- [ ] `POST /api/sync {"seco": true}` roda sem erro — **antes** de deixar o
      cron rodar sozinho na madrugada.
- [ ] `GET /api/sync` mostra a rodada com `status = 'ok'`.

## Resumo que você entrega

```
O que muda:        <uma frase>
Testes:            209 asserções, 0 falhas (67/48/20/66/8)
Build:             dashboard.html regerado / não foi preciso
Migration:         nenhuma / <arquivo>, testada nas duas direções
Backup:            <caminho>  ·  bookmark <valor>
Secrets:           nenhum novo / <NOME> precisa de `secret put` antes
Risco:             baixo | médio | alto — <por quê>
Rollback:          <como, em uma frase>
Comando:           npx wrangler deploy      ← rodado por uma PESSOA
```
