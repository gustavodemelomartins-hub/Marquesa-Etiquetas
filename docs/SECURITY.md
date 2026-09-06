# Segurança e política de operações perigosas

> Este sistema controla **estoque real e vendas reais**. Confiabilidade vale
> mais que velocidade de implementação.

## Classes de operação

Toda ação sobre este repositório cai numa de três classes. A classe decide
se ela pode ser executada direto, depois de checkpoint, ou só com
autorização humana explícita.

### Classe A — leitura · pode executar normalmente

- Ler arquivos, buscar no código, gerar diff
- Consultar Git (`status`, `log`, `diff`, `show`, `branch`)
- Consultar o banco **local** (`wrangler d1 execute --local` com `SELECT`)
- Rodar dry-run (`POST /api/sync {"seco": true}`)
- Rodar a suíte de testes local
- Consultar a Nuvemshop **sem escrita** (`GET /products`, `GET /orders`)
- Ler `GET /api/state`, `GET /api/estoque/conferir`

### Classe B — alteração local reversível · depois de checkpoint

- Editar documentação
- Criar ou editar testes
- Criar configuração, skills, agentes
- Refactor **autorizado explicitamente**, com testes rodando antes e depois

Reversível significa: existe um commit ou snapshot ao qual voltar. Ver
[BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).

### Classe C — operação crítica · exige validação humana explícita antes

- Migration em produção
- `DELETE` em massa · `UPDATE` em massa
- Alteração de schema no D1 remoto
- Importação real de estoque ou catálogo
- Sincronização forçada (`{"forcar": true}`)
- Qualquer escrita de estoque na Nuvemshop
- Alteração, rotação ou remoção de Secret
- Deploy de produção (`wrangler deploy`)
- Restore de banco · reset de banco
- Comandos Git destrutivos

Migration em produção e deploy de produção continuam Classe C, mas desde
2026-09-06 a validação humana acontece **por release**
([§ Production Release Approval](#production-release-approval)), não a cada
comando. As demais linhas desta lista não têm caminho de aprovação
nenhum — ver a seção "NUNCA executar" logo abaixo dessa.

## Production Release Approval

Desde 2026-09-06, quatro categorias — merge em `main`, push de `main`,
migration no D1 de produção, deploy (Worker ou Pages) — deixaram de exigir
autorização humana **a cada comando** e passaram a exigir uma autorização
**por release**: uma aprovação efêmera que, uma vez concedida, libera a
sequência inteira de publicação dentro de uma janela curta.

Isto é uma mudança de MECANISMO, não de PADRÃO: a régua continua "produção
não muda sem uma pessoa dizer que pode", só que a pessoa diz isso uma vez
por release, em vez de uma vez por `Bash`.

### Como funciona

`.claude/hooks/protect-production.mjs` consulta
`.claude/approvals/production-release.json` (não versionado) antes de negar
qualquer uma das quatro categorias. Quando o arquivo existe e é válido, a
ação prossegue; quando não existe — o estado normal — nada muda em relação
a antes: as quatro continuam negadas.

Uma aprovação só é válida quando **todos** os pontos abaixo se confirmam
contra o repositório de verdade no momento da ação (não contra o que está
escrito no arquivo por si só):

1. **não expirou** — e nunca dura mais que um teto absoluto de 12 horas,
   embutido no código (`JANELA_MAXIMA_MS`), mesmo que o arquivo diga outra
   coisa;
2. **o ambiente bate** — `"production"` exato, nunca `"staging"`;
3. **a ação está na lista** — `merge-main`, `push-main`, `d1-migrate-prod`,
   `worker-deploy` ou `pages-deploy`, e só as que a aprovação nomeou;
4. **`main` já está em checkout** — é de lá que se publica, sempre;
5. **a árvore de trabalho está limpa** (`git status --porcelain` vazio);
6. **o commit aprovado é ancestral do HEAD atual** (`git merge-base
   --is-ancestor`) — cobre tanto fast-forward quanto um merge por cima dele;
   se a branch mudou ou `main` avançou depois da aprovação, ela para de
   valer;
7. **para migration**: o `--file=` do comando é exatamente o arquivo
   aprovado, e o `sha256` do CONTEÚDO atual desse arquivo bate com o
   registrado na aprovação — mudou uma linha depois de aprovar, a aprovação
   não cobre mais aquele arquivo.

Cada consulta — liberada ou negada — grava uma linha em
`.claude/approvals/audit.log.jsonl` (também não versionado), para revisão
humana depois do fato.

Como uma pessoa autoriza um release, e o formato completo do arquivo:
[.claude/approvals/README.md](../.claude/approvals/README.md).

### O que uma aprovação de release NUNCA destrava

Nenhuma aprovação, por mais válida que seja, muda o resultado da seção
seguinte. Essas checagens não CONSULTAM aprovação nenhuma — nem perguntam se
existe uma. E dentro de uma migration aprovada, o CONTEÚDO do arquivo
continua sendo conferido à parte (DROP/TRUNCATE negam sempre; DELETE/UPDATE/
REPLACE/RENAME sem WHERE claro pedem confirmação humana sempre) — a
aprovação autoriza QUAL arquivo pode rodar contra produção, nunca O QUE ele
pode conter.

### Leitura contra produção não é gate de release

`wrangler d1 export` (backup) e qualquer `wrangler d1 execute --remote
--command` cujo conteúdo seja só `SELECT`/`WITH`/`PRAGMA`/`EXPLAIN` — mesmo
pelo binding de produção, sem `--env staging` — rodam **sem aprovação
nenhuma**. Não escrevem uma linha no banco, e exigir aprovação para tirar um
backup impediria o próprio primeiro passo de um release (backup vem antes de
qualquer aprovação fazer sentido). `wrangler d1 time-travel info` já era
leitura livre antes desta mudança e continua sendo. Continuar a digitar o
NOME do banco (`marquesa-db`/`marquesa-db-prod`) em vez do binding `DB`
continua bloqueado, leitura ou não — é a convenção que evita confundir o
banco congelado de rollback com o de produção.

## NUNCA executar — nenhuma aprovação de release cobre isto

Estes comandos e padrões **não** podem ser executados por um agente,
independentemente de qualquer aprovação de release presente, válida ou não:

```
git reset --hard
git clean -fd
git push --force        (e --force-with-lease)
git checkout -- <arquivo>   quando há trabalho não commitado
reescrita de histórico (filter-branch, filter-repo, reflog expire, gc --prune=now)

DROP TABLE
DROP DATABASE
DELETE sem cláusula WHERE validada
UPDATE em massa sem condição validada
TRUNCATE

wrangler rollback
wrangler d1 time-travel restore     (restore sobre qualquer ambiente)
wrangler d1 delete
wrangler secret put / delete / bulk (inclusive em staging)
```

Autorização para uma operação **não se estende** à próxima nem ao próximo
dia. "Pode aplicar a migration" autoriza aquela migration (aquele arquivo,
aquele hash), não a seguinte.

## DEV é descartável. PROD é Classe C sempre.

Desde 2026-08-18 existe um ambiente de desenvolvimento na nuvem, separado
de produção em toda camada (ver [DEVELOPMENT.md § Ambiente DEV na
nuvem](DEVELOPMENT.md)):

| Recurso | Produção | DEV |
|---|---|---|
| Worker | `marquesa-api` | `marquesa-api-staging` |
| D1 | `marquesa-db` | `marquesa-db-dev` |
| Frontend | GitHub Pages (`main`) | Cloudflare Pages `marquesa-dev.pages.dev` (`develop`) |
| Nuvemshop | real, leitura e escrita | pode receber credencial real de **leitura** — escrita continua barrada estruturalmente, ver abaixo |

### Staging pode ler a loja real. Nunca pode escrever nela.

Desde 2026-08-21, `marquesa-api-staging` pode receber
`NUVEMSHOP_TOKEN`/`NUVEMSHOP_STORE_ID` de verdade como Secret — para
analisar catálogo, produtos, variações e imagens reais sem depender de
`marquesa-db`/produção. A trava não é mais "a credencial não existe": é
estrutural, dentro do cliente (`api/src/nuvemshop.js › Nuvemshop.chamar`).

- `NUVEMSHOP_WRITES_ENABLED` decide, por ambiente. **Fail-closed**: ausente,
  `"false"` ou qualquer outro valor → bloqueia. Só a string exata `"true"`
  libera. Não é segredo (não autoriza nada sozinha, só destrava o método
  HTTP) — mora em `[vars]`/`[env.staging.vars]` no `wrangler.toml`.
- Todo `POST`/`PUT`/`PATCH`/`DELETE` para a Nuvemshop passa por `chamar()`
  antes do `fetch` sair do Worker. `GET`/`HEAD` nunca são afetados. Vale
  para rota direta, bug de frontend, sync automático ou uma tela nova que
  reuse o cliente — não é uma checagem de interface, é o único ponto por
  onde toda chamada externa passa.
- Erro de escrita bloqueada: `NUVEMSHOP_WRITE_DISABLED` — mensagem humana,
  nunca imprime token nem credencial.
- Staging vem com `NUVEMSHOP_WRITES_ENABLED = "false"` no `wrangler.toml`
  (linha versionada, não secret). Mudar para `"true"` em staging é decisão
  consciente que muda a postura de segurança do ambiente — documente o
  motivo se fizer isso, não troque "de passagem".
- Produção precisa de `NUVEMSHOP_WRITES_ENABLED = "true"` explícito no
  `[vars]` raiz — sem essa linha, o padrão fail-closed do código pararia de
  empurrar estoque de verdade para a loja no próximo deploy,
  silenciosamente. Já está lá; se um dia essa linha sumir do
  `wrangler.toml`, é bug, não intenção.
- Secrets (`NUVEMSHOP_TOKEN`, `NUVEMSHOP_STORE_ID`, `NUVEMSHOP_CLIENT_ID`,
  `NUVEMSHOP_CLIENT_SECRET`) continuam fora do Git em qualquer ambiente,
  sempre via `wrangler secret put`.

Isso muda a régua **só para os recursos DEV**:

- `wrangler d1 execute marquesa-db-dev --remote` com schema/seed: **Classe B**
  (reversível — é descartável, dá para recriar do zero a qualquer momento).
  `marquesa-db` (produção) continua Classe C sempre.
- `wrangler secret put` no Worker `marquesa-api-staging`: **Classe B**.
  Qualquer secret em `marquesa-api` (produção) continua Classe C.
- Push em `develop` depois de testes verdes: **autorizado por padrão**,
  disparando o deploy automático DEV — ver § Fluxo padrão em
  DEVELOPMENT.md.

O que **não muda**, nem para DEV:

- `wrangler deploy --env staging` (o Worker de DEV) nunca é executado pelo
  agente — o pipeline é `git push origin develop`
  (`.github/workflows/deploy-dev.yml`), nunca o comando direto. A Production
  Release Approval (seção acima) não cobre `staging` em hipótese nenhuma:
  seu campo `ambiente` precisa ser exatamente `"production"`.
- A primeira publicação de cada ambiente (Worker e Pages) é sempre um
  comando que a pessoa roda, ou a conexão Git nativa da Cloudflare, nunca
  o agente diretamente.
- Merge em `main`, push de `main`, deploy de produção e migration em
  `marquesa-db-prod` continuam Classe C — exigindo autorização humana
  explícita — mas agora por **release aprovado**
  ([§ Production Release Approval](#production-release-approval)), não por
  comando individual. Sem uma aprovação válida, o comportamento é
  idêntico ao de antes desta mudança: bloqueado.
- Qualquer escrita na Nuvemshop real continua fora do escopo de qualquer
  aprovação de release — é regida só por `NUVEMSHOP_WRITES_ENABLED`
  (acima) e pelo freio de segurança da sincronização.

## Auditoria de segredos — resultado (2026-08-18)

Varredura de todo o repositório atrás de chaves, tokens, senhas, credenciais
Cloudflare/Nuvemshop, Bearer tokens, URLs com segredo e arquivos `.env`.

**Nenhum segredo real encontrado versionado.** Nenhum valor de credencial é
reproduzido neste documento.

| Item | Arquivo | Tipo | Gravidade | Versionado? | Ação |
|---|---|---|---|---|---|
| Chave de teste `troque-por-uma-chave-de-teste` | `api/.dev.vars.example`, `src/*.mjs`, `src/reset-e-testar.sh` | Valor de teste, sem poder | Nenhuma | Sim, de propósito | Nenhuma |
| Token falso da loja de mentira | `src/loja-falsa.mjs` | Fixture de teste | Nenhuma | Sim, de propósito | Nenhuma |
| `database_id` do D1 | `api/wrangler.toml` | Identificador de recurso | **Baixa** | Sim | Manter. Não é credencial: sem conta e sem token da Cloudflare, não abre nada. Convenção do próprio Wrangler é versionar |
| `API_KEY` guardada em `localStorage` | `src/dashboard.tpl.html` (`marquesa_conexao_v1`) | Credencial no navegador | **Média** | Não (só em runtime) | Aceito por decisão de projeto. Ver abaixo |
| Ausência de `.env` no repositório | — | — | — | — | Confirmado: nenhum arquivo `.env` ou `.dev.vars` existe no disco versionado |

### Sobre a `API_KEY` no `localStorage`

É uma senha única compartilhada, não um sistema de contas — e
[api/src/auth.js](../api/src/auth.js) diz isso com todas as letras. É
proporcional a uma ferramenta interna de uma pessoa só. As consequências que
precisam ficar escritas:

- quem tiver acesso ao navegador dela tem a chave;
- XSS no dashboard entrega a chave, e o `dashboard.html` embute bibliotecas
  de terceiros (SheetJS, ZXing);
- **não existe revogação por dispositivo**: trocar a chave desconecta todos;
- **não existe rastro de quem fez o quê** — a razão de `movimentos` diz o
  que mudou, nunca quem mudou.

Se um dia mais de uma pessoa usar o painel, isto deixa de ser proporcional.

### O repositório é público

Serve o PWA pelo GitHub Pages. Tudo que entra é baixado por quem clona e
publicado na web. O `.gitignore` foi endurecido nesta etapa para cobrir
`.env*`, `.dev.vars*`, `*.pem`, `*.key`, `backups/`, `*.sqlite` e
`node_modules/`, preservando as duas exceções deliberadas
(`.env.example`, `.dev.vars.example`) e passando a **versionar** a
configuração própria de `.claude/`.

`api/.gitignore` já protegia o `seed.sql` — dado real de clientes e
revendedoras gerado por `gerar-seed.py`. Mantido.

## Superfície de ataque da API

| Rota | Autenticação | Nota |
|---|---|---|
| `GET /api/health` | **Nenhuma** | Não devolve dado. Aceitável |
| `GET /api/nuvemshop/callback` | **Nenhuma** — `code` de uso único | Correto: quem chama é o navegador vindo da Nuvemshop. Sem rate limit próprio |
| Todo o resto de `/api/*` | Bearer `API_KEY` | Comparação de string simples (`chave === env.API_KEY`), não constant-time |
| CORS | `ORIGENS_PERMITIDAS` no `wrangler.toml` | Sem a variável, libera geral — aceitável **só** em desenvolvimento |

Pontos conhecidos, registrados sem correção nesta etapa (ver
[TECH_DEBT.md](TECH_DEBT.md)):

- sem rate limiting em nenhuma rota;
- sem constant-time compare na checagem da chave;
- sem log de auditoria de quem chamou o quê.

## Rotação de credenciais

Se uma credencial vazar, na ordem:

1. **Nuvemshop** — gerar token novo no painel (o antigo para de valer) e
   `npx wrangler secret put NUVEMSHOP_TOKEN`. Lembrar: o token guarda as
   permissões de quando foi criado.
2. **API_KEY** — `npx wrangler secret put API_KEY`. Todos os dispositivos
   caem e precisam reconectar.
3. **Cloudflare** — revogar o token de API no painel da conta.
4. Se o segredo chegou a ser **commitado**, trocar a credencial vem
   **primeiro**. Reescrever histórico é o segundo passo, e nunca substitui o
   primeiro: o valor já está em qualquer clone.

## Regras permanentes para quem trabalha aqui (humano ou agente)

1. Nunca imprimir o valor de um segredo numa resposta, log, commit ou
   documento.
2. Nunca gravar credencial em arquivo versionado.
3. Nunca mover uma credencial de um lugar para outro automaticamente — é a
   razão de o callback do OAuth mostrar o token para copiar à mão.
4. Preferir preview/dry-run antes de qualquer escrita.
5. Nunca adivinhar quando um conflito de dados puder representar estoque
   físico. Parar e mostrar os dois números é sempre melhor.
6. Git protege código. Backup protege dados. Teste protege comportamento.
   Dry-run protege operações. Nenhum dos quatro substitui os outros.
