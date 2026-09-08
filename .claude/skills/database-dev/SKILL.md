---
name: database-dev
description: Carregue antes de qualquer comando que escreva no D1. Parte do schema real de PROD, prova o alvo exato, protege dados e valida antes/depois. DEV é auxiliar, nunca gate. Para desenhar schema/migration, use safe-d1-change.
---

# Operar D1 — production-first

Os três bancos diferem por poucas letras e por consequência irreversível.
**Prove o alvo antes de qualquer escrita.**

| | DEV | Produção | Rollback congelado |
|---|---|---|---|
| Nome | `marquesa-db-dev` | `marquesa-db-prod` | `marquesa-db` |
| `database_id` | `dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b` | `51dd629b-52dc-46d0-a1af-fa37f0a79533` | `089153a9-cee5-4887-b789-a23b1cf419f5` |
| Escrita | auxiliar, descartável | **Classe C autônoma + backup/rollback** | somente recuperação planejada |

Desde o go-live de 2026-08-22, **`marquesa-db` não é mais produção**. Quem
digita o nome antigo por memória não erra o ambiente: acerta o banco que
jamais deveria ser tocado. Por isso o `api/wrangler.toml` e o `api/DEPLOY.md`
mandam usar o binding `DB` (`--env staging` → DEV; sem `--env` → produção),
nunca o nome do banco.

## 1. Provar o alvo real

```bash
npx wrangler d1 info marquesa-db-prod       # confira o uuid 51dd629b-…
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Para PROD, prefira o binding `DB` sem `--env`; confirme no `wrangler.toml`
que ele resolve para `marquesa-db-prod`. Nunca use DEV como prova de schema
ou como pré-requisito. O nome `marquesa-db` é a cópia congelada, não PROD.

## 2. Fotografar antes

```bash
npx wrangler d1 execute DB --remote \
  --command "SELECT 'produtos', COUNT(*) FROM produtos UNION ALL SELECT 'movimentos', COUNT(*) FROM movimentos UNION ALL SELECT 'vendas', COUNT(*) FROM vendas"
```

Guarde os números. São a sua base de comparação.

## 3. Executar

Teste local antes. Em PROD, crie export/bookmark, registre rollback e então
execute autonomamente o arquivo revisado necessário à release.

## 4. Conferir depois

1. as mesmas contagens do passo 2, e explicar cada delta;
2. `GET /api/estoque/conferir` → **vazio**, a razão fecha;
3. divergência achada é **relatada**, não corrigida por palpite.

## Nunca aqui

`DROP TABLE` · `DROP DATABASE` · exclusão de recurso ou `DELETE`/`UPDATE` em
massa sem filtro validado são Classe D e exigem instrução humana explícita.
Restore técnico diante de regressão comprovada é Classe C e segue o plano de
rollback preparado antes da release.

Dados: PROD é a fonte operacional. DEV pode ajudar em testes, mas sua
divergência nunca bloqueia uma release.
