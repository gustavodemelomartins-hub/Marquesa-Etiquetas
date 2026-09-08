---
name: deploy-dev
description: Carregue quando for útil publicar e verificar o ambiente DEV. DEV é auxiliar e nunca gate; releases de produção usam pre-deploy-check e partem do estado real de PROD.
---

# Publicar e verificar o DEV

**Alvos permitidos, e só eles:** Pages `marquesa-dev` · Worker
`marquesa-api-staging` · D1 `marquesa-db-dev` · R2 `marquesa-fotos-dev`.

O agente pode executar o deploy de DEV quando ele trouxer evidência útil.
Não faça deploy de DEV por burocracia e não use seu estado como fonte de
verdade sobre produção. Ver [docs/SECURITY.md](../../../docs/SECURITY.md).

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

## 3. Worker DEV — execução opcional

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
merge em `main`: **nada disso pertence a esta skill.** Para produção, carregue
`pre-deploy-check`, inspecione PROD real e conclua a release autonomamente.
