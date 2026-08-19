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

## NUNCA executar automaticamente

Estes comandos e padrões **não** podem ser executados por um agente sem uma
instrução humana explícita, consciente e específica para aquele comando
naquele momento:

```
git reset --hard
git clean -fd
git push --force        (e --force-with-lease)
git checkout -- <arquivo>   quando há trabalho não commitado

DROP TABLE
DROP DATABASE
DELETE sem cláusula WHERE validada
UPDATE em massa sem condição validada
TRUNCATE

wrangler d1 execute --remote        com qualquer coisa que não seja SELECT
wrangler d1 time-travel restore     (restore sobre produção)
wrangler d1 delete
wrangler deploy
wrangler secret delete
```

Autorização para uma operação **não se estende** à próxima nem ao próximo
dia. "Pode aplicar a migration" autoriza aquela migration, não a seguinte.

## DEV é descartável. PROD é Classe C sempre.

Desde 2026-08-18 existe um ambiente de desenvolvimento na nuvem, separado
de produção em toda camada (ver [DEVELOPMENT.md § Ambiente DEV na
nuvem](DEVELOPMENT.md)):

| Recurso | Produção | DEV |
|---|---|---|
| Worker | `marquesa-api` | `marquesa-api-staging` |
| D1 | `marquesa-db` | `marquesa-db-dev` |
| Frontend | GitHub Pages (`main`) | Cloudflare Pages `marquesa-dev.pages.dev` (`develop`) |
| Nuvemshop | real | nunca configurada — sync sempre recusa por segurança |

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

- `wrangler deploy` (com ou sem `--env`) nunca é executado por um agente —
  é bloqueio de infraestrutura da sessão, não só política deste documento.
  A primeira publicação de cada ambiente (Worker e Pages) é sempre um
  comando que a pessoa roda, ou a conexão Git nativa da Cloudflare, nunca
  o agente diretamente.
- Merge em `main`, deploy de produção, migration em `marquesa-db`
  (produção) e qualquer escrita na Nuvemshop real continuam Classe C,
  exigindo autorização humana explícita a cada vez.

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
