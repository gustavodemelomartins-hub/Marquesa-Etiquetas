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

| | Produção | DEV |
|---|---|---|
| D1 | `marquesa-db` | `marquesa-db-dev` |
| `database_id` | `089153a9-…` | `dcc36f65-…` |

`marquesa-db-dev` é descartável: escrever ali é reversível e não pede
autorização. `marquesa-db` exige autorização humana explícita **a cada vez**,
mais backup recente confirmado. Nome parecido, consequência oposta — leia o
alvo duas vezes. Procedimento: skill `database-dev`.

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
