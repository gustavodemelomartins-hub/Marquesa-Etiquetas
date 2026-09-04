---
paths:
  - "api/schema.sql"
  - "api/migracao-*.sql"
  - "api/src/estoque.js"
  - "api/src/reconciliacao.js"
---

# Regras de banco (D1/SQLite)

## Antes de qualquer mudança de schema

Carregue a skill `safe-d1-change`. Sete etapas, sem pular nenhuma. Migration
destrutiva **nunca** é executada automaticamente.

## Alvo: provar que é DEV antes de mutar

| | Produção | Rollback congelado | DEV |
|---|---|---|---|
| D1 | `marquesa-db-prod` | `marquesa-db` | `marquesa-db-dev` |
| `database_id` | `51dd629b-…` | `089153a9-…` | `dcc36f65-…` |

Desde o go-live de 2026-08-22 **produção é `marquesa-db-prod`**, e o binding
`DB` sem `--env` resolve para ele (`api/wrangler.toml`). O nome `marquesa-db`
não é mais produção: é a cópia **congelada de rollback**, e escrever nela
destrói a única volta que o projeto tem. Os dois exigem autorização humana
explícita **a cada vez**, mais backup recente confirmado.

`marquesa-db-dev` é descartável: escrever ali é reversível e não pede
autorização. Três nomes parecidos, consequências opostas — leia o alvo duas
vezes, e prefira o binding `DB` ao nome. Procedimento: skill `database-dev`.

## Nunca, em nenhum ambiente, sem instrução humana

```
DROP TABLE · DROP DATABASE
DELETE ou UPDATE em massa sem filtro validado
wrangler d1 time-travel restore · wrangler d1 delete
```

## Verificação depois de mexer no banco

1. `GET /api/estoque/conferir` volta **vazio** (a razão fecha);
2. contagem antes/depois das tabelas que você tocou;
3. divergência encontrada é **mostrada**, nunca corrigida por palpite —
   ver `.claude/rules/business-rules.md` § Nunca chute.

Modelo: [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md).
