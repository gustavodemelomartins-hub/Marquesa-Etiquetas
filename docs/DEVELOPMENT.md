# Desenvolvimento

Nada aqui toca a nuvem. Tudo roda contra um SQLite local dentro de
`api/.wrangler` e, quando o assunto é Nuvemshop, contra uma loja de mentira
que sobe no próprio computador.

## O que precisa estar instalado

| Ferramenta | Versão conferida | Para quê |
|---|---|---|
| Node.js | v24.19.0 | Worker local, testes, scripts |
| npm | 12.0.2 | Dependências |
| Python 3 | 3.14.7 | `src/build.py` |
| Wrangler | 4.123.0 (via `npx`) | Worker + D1 |
| Git | 2.54 | Checkpoints |

```bash
cd api && npm install       # wrangler
cd ../src && npm install    # playwright + xlsx (testes de navegador)
npx playwright install chromium
cd ../frontend && npm install   # React, TypeScript, Vite, vitest
```

> **Windows:** o comando é `python`, não `python3`. O script
> `npm run build` do `src/package.json` chama `python3` e falha aqui —
> rode `python src/build.py` direto. Ver [TECH_DEBT.md](TECH_DEBT.md).

## Gerar o dashboard

`dashboard.html` é **montado**, nunca editado à mão.

```bash
python src/build.py
# dashboard.html: 452.292 bytes  (css 20.852 · sheetjs 250.427)
```

O build lê o CSS e o SheetJS de dentro do `index.html` e injeta em
`src/dashboard.tpl.html` nos marcadores `/*__BASE_CSS__*/` e
`<!--__SHEETJS__-->`. É por isso que os dois apps têm a mesma cara: existe
uma folha de estilo só, e ela mora no `index.html`.

As fronteiras dos blocos são achadas **por conteúdo**, não por número de
linha, e o script confere o tamanho do que extraiu — mexer no `index.html`
não quebra a montagem em silêncio.

> **Windows:** o build reescreve o arquivo inteiro com CRLF, o que produz um
> diff de 4.248 linhas sem uma única mudança de conteúdo. Confira com
> `git diff --ignore-cr-at-eol` antes de commitar um `dashboard.html`
> regerado no Windows.

## Subir o Worker local

```bash
cd api
cp .dev.vars.example .dev.vars     # e escolha uma chave qualquer de teste
rm -rf .wrangler/state             # zera o banco (pare o wrangler antes)
npx wrangler d1 execute marquesa-db --local --file=schema.sql
npx wrangler dev --local --port 8787
```

Conferir que subiu:

```bash
curl http://localhost:8787/api/health
# {"ok":true,"hoje":"2026-08-18"}
```

O `.dev.vars` completo, com o que os testes de sincronização também exigem:

```
API_KEY=troque-por-uma-chave-de-teste
NUVEMSHOP_STORE_ID=999999
NUVEMSHOP_TOKEN=token-de-mentira
NUVEMSHOP_BASE=http://localhost:8799
NUVEMSHOP_CLIENT_ID=app-de-mentira
NUVEMSHOP_CLIENT_SECRET=segredo-de-mentira
NUVEMSHOP_AUTH_BASE=http://localhost:8799
ORIGENS_PERMITIDAS=http://localhost:8000
```

`ORIGENS_PERMITIDAS` aqui **sobrescreve** o `[vars]` do `wrangler.toml`
durante o `wrangler dev`. Sem ela, o Worker responde com o endereço de
produção no `Access-Control-Allow-Origin`, o navegador bloqueia a chamada, e
a tela diz *"Não encontrei a API neste endereço"* — que parece erro de rede
e é CORS.

`NUVEMSHOP_BASE` e `NUVEMSHOP_AUTH_BASE` existem só para o teste apontar
para a loja falsa; fora do teste ninguém define e vale o endereço real.
`.dev.vars` é ignorado pelo Git.

## Rodar o painel novo (React + TypeScript + Vite)

```bash
cd frontend
npm run dev          # http://localhost:5173
```

Ele conversa com o mesmo Worker em `localhost:8787` e reaproveita a conexão
guardada pelo painel legado — mesma chave de `localStorage`, mesmo formato.

```bash
npm run build        # tsc --noEmit && vite build → frontend/dist/
npm run typecheck
npm test             # vitest
```

O build sai com caminhos relativos, então `frontend/dist/index.html` funciona
servido de qualquer subdiretório — inclusive por baixo do
`python -m http.server 8000` da seção seguinte, em
`http://localhost:8000/frontend/dist/index.html`.

Arquitetura, tipos e decisões em
[FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md).

## Servir o dashboard

Aberto como `file://` o navegador bloqueia a chamada à API por CORS. Sirva
por HTTP:

```bash
python -m http.server 8000
# http://localhost:8000/dashboard.html
```

Na tela de conexão: endereço `http://localhost:8787` e a chave do
`.dev.vars`.

## Trabalhar com a loja falsa

[src/loja-falsa.mjs](../src/loja-falsa.mjs) sobe uma Nuvemshop de mentira em
`localhost:8799`. Nenhuma chamada sai para a loja de verdade e nenhum token
real é preciso.

Ela imita o que importa do comportamento real:

- exige o `User-Agent` (a API verdadeira responde **400** sem ele);
- pagina por `page` / `per_page`;
- guarda tudo que chega no `PATCH`, para o teste conferir o que foi escrito;
- implementa a troca OAuth `POST /apps/authorize/token`.

Os testes a sobem sozinhos (`subirLojaFalsa()`), então normalmente não é
preciso iniciá-la à mão.

## Rodar os testes

Ver [TESTING.md](TESTING.md) — inclui o que roda em cada sistema
operacional e o baseline atual.

Resumo:

```bash
node src/sync-test.mjs        # sincronização com a Nuvemshop        67 asserções
node src/variacoes-test.mjs   # aro do anel, comprimento da corrente  48
node src/kits-test.mjs        # peça vendida inteira ou desmontada    20
node src/e2e.mjs              # o caminho inteiro num navegador       66
node src/import-casa-test.mjs # "total ou só em casa?"                 8
```

Cada um precisa do Worker local no ar **e de banco limpo** — as contagens
mudam se sobrar dado do teste anterior. Os dois últimos também precisam do
dashboard servido em `localhost:8000` e do Chromium do Playwright
(`npx playwright install chromium`, dentro de `src/`).

## Ambiente DEV na nuvem

Separado de produção em toda camada, para poder quebrar à vontade:

```
develop  →  frontend DEV (Cloudflare Pages)  →  API DEV (Worker)  →  D1 DEV
```

| Camada | Produção | DEV |
|---|---|---|
| Branch | `main` | `develop` |
| Frontend | GitHub Pages, `main` | Cloudflare Pages, `develop` |
| URL do frontend | `https://gustavodemelomartins-hub.github.io/Marquesa-Etiquetas/` | **`https://marquesa-dev.pages.dev`** (fixo) |
| Worker | `marquesa-api` | `marquesa-api-staging` |
| URL da API | `https://marquesa-api.marquesaasemijoias.workers.dev` | `https://marquesa-api-staging.marquesaasemijoias.workers.dev` |
| D1 | `marquesa-db` | `marquesa-db-dev` |
| Nuvemshop | conectada de verdade | **nunca conectada** — sem `NUVEMSHOP_TOKEN`/`NUVEMSHOP_STORE_ID` como secret em `marquesa-api-staging`, `Nuvemshop.configurada()` volta `false` e qualquer sync termina em "loja não conectada". Nenhum PATCH sai daqui, estruturalmente |

`marquesa-dev.pages.dev` é fixo porque `develop` foi declarado a
**branch de produção do projeto Pages** (`--production-branch develop`
na criação) — não é um preview por commit, que muda de link a cada push.
Preview por commit também existe (Cloudflare gera um para cada deploy),
mas serve só para comparar uma versão específica; o link que vai para os
favoritos é sempre o fixo.

### Publicar pela primeira vez (feito uma única vez, manual)

`wrangler deploy` não é executado por um agente em ambiente nenhum — ver
[SECURITY.md](SECURITY.md). O primeiro deploy do Worker DEV é:

```bash
cd api
npx wrangler deploy --env staging
```

Depois disso, o Worker DEV é republicado só por este comando à mão (ou
por uma pipeline de CI que vier a existir para `api/` — hoje não há uma).

### Deploy automático do frontend — GitHub Actions, não Git Integration

`marquesa-dev` é um projeto Cloudflare Pages **Direct Upload**, criado
assim desde o início. Direct Upload não tem, e não pode ganhar depois, a
integração Git nativa da Cloudflare — um projeto assim não é convertido
para Git Integration sem recriar o projeto, o que trocaria o link fixo.
Por isso o deploy automático do frontend não usa Git Integration.

O deploy automático é **`.github/workflows/deploy-dev.yml`**: todo push
em `develop` que toca `frontend/` roda testes, builda e publica com

```bash
wrangler pages deploy frontend/dist --project-name marquesa-dev --branch develop
```

via `cloudflare/wrangler-action`. As credenciais vêm dos secrets do
repositório GitHub — `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` —
nunca em texto no workflow.

`marquesa-api-staging` (Worker DEV) **não** faz parte deste workflow — é
publicado à parte, hoje só manual (comando da seção acima).

Nada neste fluxo toca `main`, `marquesa-api` ou `marquesa-db`.

Para ver o que está publicado agora e em qual commit:

```bash
npx wrangler pages deployment list --project-name marquesa-dev
```

A coluna `Source` traz o SHA. Se ele não é o `HEAD` de `develop`, ou a
GitHub Action mais recente falhou, ou ainda não rodou — conferir na aba
Actions do repositório.

### Seed de dados sintéticos

`marquesa-db-dev` não recebe cópia de dado real — nunca. Semeado com
catálogo, revendedora, maleta com consignação e uma venda, todos com
prefixo `DEV-`, via chamadas normais da API (não `INSERT` direto: passa
pelo mesmo `movimentar()` que produção, a razão contábil fecha). Script em
`api/scripts/` não versionado (é só demonstração, refeito a qualquer
momento) — refazer:

```bash
cd api
npx wrangler dev --env staging --remote --port 8788   # API DEV local, banco DEV remoto
# noutro terminal, com o Worker acima no ar:
node caminho/para/seed_dev.mjs
# Ctrl+C no wrangler dev quando terminar
```

### Rollback

```bash
git revert <commit>
git push origin develop
```

Nunca `push --force` em `develop`. O Cloudflare Pages mantém histórico de
deployments por commit (painel → Pages → marquesa-dev → Deployments); dá
para promover manualmente um deployment antigo para o alias fixo ali sem
precisar reverter Git, se for só para conferir algo rápido.

### Observabilidade

Status de cada deploy do frontend: aba **Actions** do repositório no
GitHub (workflow `deploy-dev.yml`) — log completo de teste, build e
publicação. Status do Worker DEV: painel da Cloudflare → Workers & Pages
→ `marquesa-api-staging` → aba Deployments (publicado manual, ver seção
acima).

## Ciclo de trabalho

```
1. leia a regra    → api/REGRAS.md e o documento de docs/ correspondente
2. edite           → api/src/*.js  ou  src/dashboard.tpl.html
3. build           → python src/build.py     (se mexeu no front)
4. teste           → banco limpo + Worker local + os três testes de API
5. confira a razão → GET /api/estoque/conferir  deve voltar vazio
6. diff            → git diff  (e --ignore-cr-at-eol para dashboard.html)
7. commit + push develop → se os testes estiverem verdes. Preview DEV
   atualiza sozinho. Se algum teste falhar: NÃO faz push.
```

## Validar antes de pensar em deploy

Use a skill `pre-deploy-check`. O essencial:

- [ ] `git status` limpo ou inteiramente compreendido
- [ ] os três testes de API passando **com banco limpo**
- [ ] `python src/build.py` rodado se o front mudou, e o `dashboard.html`
      regerado incluído no commit
- [ ] `GET /api/estoque/conferir` vazio
- [ ] nenhum segredo no diff
- [ ] migration pendente identificada e **combinada com uma pessoa**
- [ ] backup do D1 feito se houver migration ou escrita em massa
- [ ] rollback definido antes de subir

**Deploy é Classe C** ([SECURITY.md](SECURITY.md)): `npx wrangler deploy`
nunca é executado por um agente.

## Onde as coisas ficam

| Preciso de… | Vá para |
|---|---|
| Regras de negócio e o porquê | [api/REGRAS.md](../api/REGRAS.md) |
| Visão geral do sistema | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Tabelas e invariantes | [DATA_MODEL.md](DATA_MODEL.md) |
| API da loja, matching, limites | [NUVEMSHOP_INTEGRATION.md](NUVEMSHOP_INTEGRATION.md) |
| Fluxo da sincronização | [SYNC_ENGINE.md](SYNC_ENGINE.md) |
| Publicar a API pela primeira vez | [api/DEPLOY.md](../api/DEPLOY.md) |
| Backup e restore | [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) |
| Como montar o dashboard | [src/README.md](../src/README.md) |
| Frontend React/TS/Vite | [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) |
