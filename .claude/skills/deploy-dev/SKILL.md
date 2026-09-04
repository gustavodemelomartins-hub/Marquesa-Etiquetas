---
name: deploy-dev
description: Carregue para publicar e verificar o ambiente DEV — Cloudflare Pages marquesa-dev e Worker marquesa-api-staging. Só DEV. Nunca produção. Inclui o smoke test do que foi publicado.
---

# Publicar e verificar o DEV

**Alvos permitidos, e só eles:** Pages `marquesa-dev` · Worker
`marquesa-api-staging` · D1 `marquesa-db-dev` · R2 `marquesa-fotos-dev`.

**`wrangler deploy` não é executado por agente — em nenhum ambiente.** É
política de [docs/SECURITY.md](../../../docs/SECURITY.md), reforçada por
`deny` em `.claude/settings.json` e pelo hook `protect-production`. O que o
agente faz é preparar, empurrar por `develop` e **verificar**.

## 1. Portão verde antes de empurrar

```bash
cd frontend && npm test && npm run build       # build já roda tsc --noEmit
python src/build.py                            # só se o painel legado mudou
```

Vermelho aqui = fim do procedimento. Não se empurra teste quebrado.

## 2. Frontend DEV — pelo CI, não à mão

```bash
git push origin develop
```

`.github/workflows/deploy-dev.yml` testa, builda e publica em
`marquesa-dev.pages.dev`. Autorizado sem perguntar, depois de testes verdes.
Acompanhe:

```bash
gh run watch                     # ou: gh run list --workflow=deploy-dev.yml --limit 1
npx wrangler pages deployment list --project-name marquesa-dev
```

## 3. Worker DEV — comando humano

O agente **entrega o comando**, não o executa:

```
npx wrangler deploy --env staging
```

## 4. Smoke test do que ficou publicado

```bash
curl -s https://marquesa-api-staging.marquesaasemijoias.workers.dev/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://marquesa-dev.pages.dev
```

Saúde ruim depois de publicar é relatada na hora, com o corpo da resposta.

## Fronteira

`marquesa-api` · `marquesa-db-prod` (e `marquesa-db`, a cópia congelada de
rollback) · `marquesa-fotos` · GitHub Pages de `main` ·
merge em `main`: **nada disso pertence a esta skill.** Encontrou necessidade
de tocar produção? Pare e diga qual comando a pessoa precisa rodar.
