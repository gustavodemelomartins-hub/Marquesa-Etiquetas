# V2 — develop como fonte da verdade (05/10/2026)

Objetivo: `origin/develop` = código oficial da V2 = DEV = base de PROD. Sem
dados de produção alterados; sem deploy de PROD; painel clássico intocado.

## Antes

| | Commit | Avatar | Estoque/inventário (05/10) |
|---|---|---|---|
| `origin/develop` | `64018f0` | não | sim |
| `feat/cliente-avatar-v2` (local) | `0fab997` | sim (+ R2 staging-v2) | não |
| `origin/feat/cliente-avatar-v2` | `d7a149e` | sim, **sem** o R2 do staging-v2 | não |
| `dev/integracao-2026-10-05` (local) | `1629ff9` | sim | sim |
| Pages DEV | `d7ace676` ← `1629ff9` (branch local) | sim | sim |
| Worker DEV `staging-v2` | `b0f3fc2a` ← `1629ff9` (branch local) | sim | sim |
| Pages PROD | `45def4ec` ← `bf4f322` | não | sim |
| Worker PROD | `69be6f4d` ← `bf4f322` | não | sim |

O DEV estava publicado a partir de uma branch que só existia nesta máquina,
e o `0fab997` (o `[[env.staging-v2.r2_buckets]] FOTOS = marquesa-fotos-dev`)
nunca tinha subido. O CI do DEV publicava só o Pages: um push em `develop`
(`bf4f322`) tirou o avatar do ar, e o Worker e o banco do DEV V2 nunca
tiveram caminho automático (o D1 do staging-v2 estava sem
`migracao-galeria-fotos.sql`).

## O que foi feito

1. **Avatar integrado em `develop`** por merge (`9d54de5`), preservando
   `47f3b9c`, `d7a149e` e `0fab997`. Conflito só em
   `docs/architecture/api-contracts.json` (união: 207 contratos).
2. **R2 versionado:** PROD `FOTOS → marquesa-fotos`; `staging-v2` e
   `staging` `FOTOS → marquesa-fotos-dev` (`api/wrangler.toml`).
3. **`scripts/d1-migracoes.mjs`:** sonda o schema remoto e diz o que cada
   banco não recebeu; aplica só migration aditiva e só no DEV; PROD é só
   leitura. Aplicou `migracao-galeria-fotos.sql` no staging-v2 (bookmark
   antes `00000069-00000000-000050fb-54daf02df3767a641ceab3fb20349c8b`).
   Hoje: staging-v2 44/44; PROD 43/44 — falta só
   `migracao-cliente-avatar.sql`.
4. **`deploy-dev.yml`:** job `api` (migrations pendentes → Worker
   `marquesa-api-staging-v2` → smoke) antes do Pages; fila em vez de
   cancelamento; `api/**` nos gatilhos.
5. **Gates de checkout limpo:** testes do avatar no manifesto, migration do
   avatar na coerência schema×migrations, `frontend/dist` fora do
   docs-links, e `fin-101-5-3a` sem depender do relógio. Clone limpo de
   `origin/develop`: **28/28 gates**.
6. **DEV publicado do clone limpo** (`d6e7a83`): Worker `bfd92afc`, Pages
   `564ded7e` — o bundle tem o mesmo hash do que estava no ar pela branch
   local (`index-C-ACLZgy.js`). QA (`src/v2-estoque-ajuste-qa.mjs`,
   `MQ_AVATAR=1`): 40 provas, 0 falhas, 1280 e 390px.

## Pendente (precisa de uma pessoa)

**O token do GitHub não tem permissão de D1.** O primeiro run do job `api`
parou com `7403: The given account is not valid or is not authorized to
access this service`. O `CLOUDFLARE_API_TOKEN` dos secrets do repositório
só publica Pages. Ele precisa de **D1: Edit** e **Workers Scripts: Edit** na
conta (além de **Cloudflare Pages: Edit**). Até isso, todo push em
`develop` que toque os caminhos do workflow falha no job `api` e NÃO
publica o Pages — de propósito: publicar o site sem a API dele é o drift que
este trabalho fecha. Depois de ajustar o token: Actions → "Deploy DEV" →
Run workflow.

## PROD × develop

Diferença de código publicável = exatamente o avatar (18 arquivos de
`api/src`, `frontend/src`, `schema.sql`, `wrangler.toml`). Não publicado
em PROD de propósito: lançar o avatar é uma release própria, que precisa
antes de `migracao-cliente-avatar.sql` no `marquesa-db-prod` e da amostra
real do Instagram. Sem a migração o código é inerte (lista sem foto, nada
abre) — `node scripts/d1-migracoes.mjs --env prod` mostra a pendência.

## Branches e worktrees que podem ser descartados

Todos sem commit exclusivo (conferido com `git cherry` contra
`origin/develop`):

- `feat/cliente-avatar-v2` (local e `origin/`), `fix/estoque-ajuste-inventario`
  (local e `origin/`), `dev/integracao-2026-10-05` (só merges),
  `integra/develop-avatar`;
- `origin/feat/cliente-avatar-instagram` — versão anterior do mesmo avatar
  (rebase sobre `69ac8ac`); o que entrou em `develop` é a evoluída (filtro
  de arquivadas, validação de bytes, recusa sem R2);
- worktrees `Marquesa-Claude-Estoque` e `Marquesa-Claude-DevInteg`;
- a cópia isolada `Documents/Codex/2026-10-04/.../Marquesa-Etiquetas-avatar-dev`.

A árvore principal (`Marquesa-Etiquetas`) está em `feat/cliente-avatar-v2`
com `intelligence/` não rastreado (trilha do Codex): mudar de branch ali
é decisão de quem usa essa árvore.
