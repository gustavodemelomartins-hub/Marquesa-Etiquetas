# Publicar a API do DEV — passo a passo para quem tem a credencial

Fecha a metade que falta do ambiente DEV: a **migration** no `marquesa-db-dev`
e o **Worker** `marquesa-api-staging`. O Pages (`marquesa-dev.pages.dev`) já
sobe sozinho a cada push em `develop` e não precisa de nada aqui.

> **Nada neste documento toca produção.** Nenhum comando cita `marquesa-api`,
> `marquesa-db` (o banco congelado de rollback) ou `marquesa-db-prod`. Todos
> carregam `--env staging`, e o passo 1 existe para provar isso antes de
> qualquer escrita.

---

## Por que isto é comando de terminal, e não um botão

`docs/SECURITY.md` classifica `wrangler deploy` como **Classe C**: nenhum
agente executa, em ambiente nenhum. A regra continua valendo e não foi
afrouxada.

Existe um workflow pronto — `.github/workflows/deploy-staging-api.yml` — que
faz tudo isto por CI, com disparo manual (`workflow_dispatch`), confirmação
digitada e as mesmas verificações. Mas o GitHub só oferece o botão *Run
workflow* para arquivos que existem no **branch padrão**, que aqui é `main`.
O arquivo está em `develop`. Enquanto ele não chegar em `main` — o que é um
merge, e merge em `main` exige sua autorização explícita — o caminho é este
runbook.

Depois que `main` alcançar `develop`, o botão passa a existir e este
documento vira o plano B.

---

## Pré-requisito

```bash
cd api
npx wrangler login        # ou exporte CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
npx wrangler whoami       # confirme a conta antes de seguir
```

O token precisa de **D1:Edit** e **Workers Scripts:Edit**. Nada de Zone,
nada de DNS.

---

## 1. Provar o alvo (só leitura — não escreve nada)

```bash
cd api

# o que `--env staging` resolve
npx wrangler d1 info marquesa-db-dev
```

**Confira antes de continuar:**

| Campo | Tem de ser |
|---|---|
| `database_name` | `marquesa-db-dev` |
| `uuid` | `dcc36f65-daaa-42a4-9fbd-15e6f27e4d4b` |

Se qualquer um dos dois for diferente, **pare**. Especialmente se aparecer
`marquesa-db` ou `marquesa-db-prod`: esses são produção e o banco congelado.

---

## 2. Contagens ANTES (só leitura)

Anote a saída. É contra ela que o passo 5 confere.

```bash
npx wrangler d1 execute DB --env staging --remote --command "
  SELECT (SELECT COUNT(*) FROM produtos)                 AS produtos,
         (SELECT COALESCE(SUM(qtd),0) FROM produtos)     AS soma_qtd,
         (SELECT COUNT(*) FROM movimentos)               AS movimentos,
         (SELECT COUNT(*) FROM vendas)                   AS vendas,
         (SELECT COUNT(*) FROM vendas WHERE cancelada=0) AS vendas_vivas,
         (SELECT COUNT(*) FROM revendedoras)             AS revendedoras,
         (SELECT COUNT(*) FROM maletas)                  AS maletas,
         (SELECT COUNT(*) FROM clientes)                 AS clientes"
```

E a razão contábil, que tem de vir **zero**:

```bash
npx wrangler d1 execute DB --env staging --remote --command "
  SELECT COUNT(*) AS divergentes FROM produtos p
    LEFT JOIN (SELECT sku, SUM(qtd) soma FROM movimentos GROUP BY sku) m
      ON m.sku = p.sku
   WHERE p.qtd <> COALESCE(m.soma,0)"
```

---

## 3. Migration

`migracao-vendas-historico.sql` é **puramente aditiva**: 10 `ALTER TABLE ADD
COLUMN` em `clientes`, 3 `CREATE TABLE` e 11 `CREATE INDEX`. Nenhum `UPDATE`,
nenhum `DELETE`, nenhum `DROP` — nenhuma linha de dado existente é reescrita.

Primeiro confira se ela já entrou (rodar duas vezes devolve `duplicate column
name`, porque `ADD COLUMN` não é idempotente no SQLite):

```bash
npx wrangler d1 execute DB --env staging --remote --command "
  SELECT COUNT(*) AS ja_aplicada FROM sqlite_master
   WHERE type='table' AND name='vendas_historico_itens'"
```

Se voltar `0`, aplique:

```bash
npx wrangler d1 execute DB --env staging --remote \
  --file=migracao-vendas-historico.sql
```

### 3b. A segunda migration — a venda histórica reconstruída

`migracao-vendas-historicas.sql` (com **s** no fim) cria a camada derivada
que transforma as 1.341 linhas em 695 vendas, e é o que faz o ticket médio
existir. Também puramente aditiva: 1 `CREATE TABLE`, 2 `ALTER TABLE ADD
COLUMN`, 9 `CREATE INDEX`. Nenhum `UPDATE`, `DELETE` ou `DROP`.

> **Já aplicada no `marquesa-db-dev` em 2026-08-28**, com a reconstrução
> junto. Este passo existe para quem montar o ambiente do zero, e para
> produção quando chegar a vez.

```bash
npx wrangler d1 execute DB --env staging --remote \
  --file=migracao-vendas-historicas.sql
```

Num banco que **já tinha** histórico importado, a camada derivada precisa ser
construída uma vez. Importação nova já faz isso sozinha:

```bash
curl -s -X POST -H "Authorization: Bearer <API_KEY do staging>" \
  "https://marquesa-api-staging.marquesaasemijoias.workers.dev/api/vendas/historico/reconstruir"
```

Sem depender do Worker publicado, a ferramenta que usa a MESMA função da
rota — lê o D1, calcula em JS, emite o SQL:

```bash
node api/tools/reconstruir-historico.mjs
npx wrangler d1 execute DB --env staging --remote \
  -c api/wrangler.toml --file=api/.tmp-sql/reconstrucao.sql
```

Confira que fechou (`itens_soltos` tem de ser `0`):

```bash
curl -s -H "Authorization: Bearer <API_KEY do staging>" \
  "https://marquesa-api-staging.marquesaasemijoias.workers.dev/api/vendas/historico/reconstrucao"
```

---

## 4. Publicar o Worker do DEV

```bash
npx wrangler deploy --env staging
```

Publica **`marquesa-api-staging`**. O `--env staging` não é decoração: sem
ele, `wrangler deploy` publica o Worker de **produção**.

---

## 5. Conferir que nada de estoque mudou

Rode de novo os dois comandos do passo 2.

**Têm de estar idênticos ao ANTES:** `produtos`, `soma_qtd`, `movimentos`,
`vendas`, `vendas_vivas`, `revendedoras`, `maletas`. E `divergentes` continua
`0`.

`clientes` também não muda aqui — ele só cresce quando a importação histórica
rodar, no passo 7.

Schema novo no lugar:

```bash
npx wrangler d1 execute DB --env staging --remote --command "
  SELECT name FROM sqlite_master WHERE type='table'
   AND name IN ('vendas_historico_lotes','vendas_historico_itens','clientes_vinculo_revisao')
   ORDER BY name"
```

---

## 6. Smoke test do Worker publicado

```bash
W=https://marquesa-api-staging.marquesaasemijoias.workers.dev

curl -s "$W/api/health"                       # {"ok":true,...}

# as rotas novas: 401 = existem e estão protegidas. 404 = o deploy não pegou.
# `/painel` e `/crm` são as duas AGREGADAS — cada tela pede uma vez só.
for r in /api/analytics/painel /api/analytics/crm \
         /api/analytics/vendas /api/analytics/clientes /api/analytics/origem \
         /api/analytics/produtos /api/analytics/categorias /api/analytics/evolucao \
         /api/vendas/lista /api/vendas/historico/lotes \
         /api/vendas/historico/reconstrucao; do
  printf '%s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$W$r")" "$r"
done

# CORS para o painel do DEV
curl -s -D- -o /dev/null -H "Origin: https://marquesa-dev.pages.dev" \
  "$W/api/health" | grep -i access-control-allow-origin
```

Com a chave do DEV, a prova de que a rota responde de verdade:

```bash
curl -s -H "Authorization: Bearer <API_KEY do staging>" \
  "$W/api/analytics/vendas?periodo=tudo"
```

---

## 7. Importar o histórico — **pela tela, não por comando**

Não há comando aqui de propósito: a importação é uma decisão, e a tela foi
feita para mostrá-la antes de aplicar.

1. abra <https://marquesa-dev.pages.dev/dashboard.html>;
2. **Vendas → Painel → Importar histórico de vendas**;
3. escolha `Vendas Marquesa.xlsx`;
4. leia o relatório. A primeira coisa que ele mostra é o impacto sobre o
   estoque, e ele tem de dizer **0 movimentos, 0 produtos, 0 Nuvemshop**;
5. confira os números contra a planilha: 1.341 linhas, 1.357 peças,
   R$ 125.726,92 pagos, 348 clientes, 1.006 códigos;
6. **Importar 1.341 linhas**;
7. a tela mostra a reconciliação campo a campo. Todas as linhas com ✓.

Rodar o mesmo arquivo de novo é recusado com `409` — a idempotência é pelo
sha-256 do conteúdo, não pelo nome do arquivo.

---

## 8. Conferir os totais no D1 remoto

Depois de importar, lidos do banco de verdade — não do teste local:

```bash
cd api
npx wrangler d1 execute DB --env staging --remote --command "
  SELECT COUNT(*)                                   AS linhas,
         COALESCE(SUM(qtd),0)                       AS pecas,
         ROUND(SUM(CASE WHEN pago=1 THEN valor_total ELSE 0 END),2) AS fat_pago,
         ROUND(SUM(valor_total),2)                  AS fat_total,
         COUNT(DISTINCT cliente_nome_norm)          AS clientes,
         COUNT(DISTINCT sku)                        AS skus,
         MIN(data) AS de, MAX(data) AS ate,
         SUM(CASE WHEN data IS NULL THEN 1 ELSE 0 END)        AS sem_data,
         SUM(CASE WHEN valor_total IS NULL THEN 1 ELSE 0 END) AS sem_valor
    FROM vendas_historico_itens h
    JOIN vendas_historico_lotes l ON l.id=h.lote_id AND l.status='importado'"
```

Esperado, conferido contra a planilha:

| Campo | Valor |
|---|---|
| `linhas` | 1341 |
| `pecas` | 1357 |
| `fat_pago` | 125726.92 |
| `fat_total` | 127556.11 |
| `clientes` | 348 |
| `skus` | 1006 |
| `de` → `ate` | 2024-04-05 → 2026-08-21 |
| `sem_data` | 15 |
| `sem_valor` | 9 |

E a prova de que o histórico não mexeu em estoque — as contagens do passo 2,
de novo, ainda idênticas, e:

```bash
npx wrangler d1 execute DB --env staging --remote --command "
  SELECT COUNT(*) AS movimentos_de_historico FROM movimentos
   WHERE origem='historico' OR tipo='historico'"     -- tem de ser 0
```

---

## Se algo der errado

| Sintoma | O que é | O que fazer |
|---|---|---|
| `duplicate column name` no passo 3 | a migration já tinha sido aplicada | siga para o passo 4 |
| rotas do passo 6 devolvem `404` | o deploy não pegou | repita o passo 4 e confira a saída |
| `Authentication error` | token sem D1:Edit ou Workers Scripts:Edit | gere um token com esses dois escopos |
| contagens do passo 5 diferentes do passo 2 | **pare e me avise** | a migration é aditiva; qualquer diferença é sinal de outra coisa acontecendo |

Reverter a importação histórica (não mexe em estoque, porque ela nunca mexeu):

```bash
curl -s -X POST -H "Authorization: Bearer <API_KEY do staging>" \
  "https://marquesa-api-staging.marquesaasemijoias.workers.dev/api/vendas/historico/lotes/1/reverter"
```
