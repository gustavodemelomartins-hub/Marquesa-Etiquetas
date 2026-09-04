---
name: database-dev
description: Carregue ANTES de qualquer comando que escreva no D1 pela linha de comando. Prova que o alvo é marquesa-db-dev (DEV) e não marquesa-db-prod (produção) nem marquesa-db (rollback congelado), e define o que rodar antes e depois. Para desenhar schema/migration, use safe-d1-change; esta skill é sobre executar com segurança.
---

# D1 DEV — provar o alvo antes de mutar

Os três bancos diferem por poucas letras e por consequência irreversível.
**Prove o alvo antes de qualquer escrita.**

| | DEV | Produção | Rollback congelado |
|---|---|---|---|
| Nome | `marquesa-db-dev` | `marquesa-db-prod` | `marquesa-db` |
| `database_id` | `dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b` | `51dd629b-52dc-46d0-a1af-fa37f0a79533` | `089153a9-cee5-4887-b789-a23b1cf419f5` |
| Escrita | livre, descartável | **autorização humana a cada vez + backup** | **nunca** — é a única volta |

Desde o go-live de 2026-08-22, **`marquesa-db` não é mais produção**. Quem
digita o nome antigo por memória não erra o ambiente: acerta o banco que
jamais deveria ser tocado. Por isso o `api/wrangler.toml` e o `api/DEPLOY.md`
mandam usar o binding `DB` (`--env staging` → DEV; sem `--env` → produção),
nunca o nome do banco.

## 1. Provar

```bash
npx wrangler d1 info marquesa-db-dev        # confira o uuid dcc36f65-…
```

Se o comando que você vai rodar não contém literalmente `marquesa-db-dev`,
ou contém `--remote` apontando para outro nome, **não rode**. Não existe
escrita "provavelmente em DEV".

## 2. Fotografar antes

```bash
npx wrangler d1 execute marquesa-db-dev --remote \
  --command "SELECT 'produtos', COUNT(*) FROM produtos UNION ALL SELECT 'movimentos', COUNT(*) FROM movimentos UNION ALL SELECT 'vendas', COUNT(*) FROM vendas"
```

Guarde os números. São a sua base de comparação.

## 3. Executar

Local (`--local`) sempre que der — é grátis e ainda mais reversível.
Remoto só com `marquesa-db-dev` no comando.

## 4. Conferir depois

1. as mesmas contagens do passo 2, e explicar cada delta;
2. `GET /api/estoque/conferir` → **vazio**, a razão fecha;
3. divergência achada é **relatada**, não corrigida por palpite.

## Nunca aqui

`DROP TABLE` · `DROP DATABASE` · `DELETE`/`UPDATE` em massa sem filtro
validado · `d1 delete` · `d1 time-travel restore` — nem no DEV, sem
instrução humana. Recriar o DEV do zero é procedimento, não improviso.

Dados: o DEV trabalha com os **dados reais destinados ao teste**. Seed
fictício sobe schema; não valida comportamento.
