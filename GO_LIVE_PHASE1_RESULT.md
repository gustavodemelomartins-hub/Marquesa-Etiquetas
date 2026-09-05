# PHASE1_FAILED_STOP

**Motivo: o ambiente bloqueia backup e migration contra produção. Nada foi
executado contra os dados — produção está exatamente como estava.**

Não é falha de migration, não é dado inconsistente, não é banco errado. É
uma trava de configuração deste ambiente de trabalho, que a autorização em
conversa não desliga. O banco está pronto; falta a mão humana no comando.

> Gerado em **2026-09-05 11:08 UTC** · branch `feat/vendas-pagamento-saidas-garantias`
> · commit `fc1f163`
> Evidência: `backups/golive/2026-09-05-11-08-10Z_inventario/`

---

## 1. UUID ALVO — PROVADO ANTES DE QUALQUER COISA

| | Exigido | Encontrado | |
|---|---|---|---|
| binding | `DB` | `DB` (raiz do `api/wrangler.toml`) | ✅ |
| database | `marquesa-db-prod` | `marquesa-db-prod` | ✅ |
| UUID | `51dd629b-52dc-46d0-a1af-fa37f0a79533` | idem | ✅ |

Os três conferem. Nenhuma divergência.

---

## 2. BOOKMARK ANTERIOR

```
000000ae-00000000-000050dd-2d84596c3214766438e14f6bdb5c8114
```

Capturado em 2026-09-05 11:07 UTC, imediatamente antes desta tentativa.

> Ele **já está velho**: o bookmark avançou de `a8` (04/09) para `a9` para
> `ae` ao longo do dia — produção recebe escrita continuamente. Capture um
> novo imediatamente antes de executar as migrations.

---

## 3. PRÉ-VOO — ESTADO NÃO MUDOU DESDE A ÚLTIMA AUDITORIA

Nenhuma PARCIAL. Exatamente o esperado:

| Migration | Estado | Artefatos |
|---|---|---|
| `migracao-venda-desconto.sql` | **APLICADA** | 3/3 |
| `migracao-historico-operacoes.sql` | **APLICADA** | 2/2 |
| `migracao-vendas-pagamento.sql` | **NAO_APLICADA** | 0/6 |
| `migracao-vendas-cliente-ambiguo.sql` | **NAO_APLICADA** | 0/1 |
| `migracao-saidas-sem-faturamento.sql` | **NAO_APLICADA** | 0/2 |
| `migracao-garantias.sql` | **NAO_APLICADA** | 0/4 |

---

## 4. BASELINE ANTES — CAPTURADO

Retrato do banco imediatamente antes da escrita que não aconteceu.

### Metadados

```
tamanho          2.629.632 bytes
tabelas          29
criado em        2026-08-22T21:48:50Z
região           ENAM
leituras 24h     1.263 queries · 3.068.589 linhas
escritas 24h     7.041 queries ·    19.570 linhas
```

> Folga de cota **hoje**: 3,07M de 5M linhas lidas. Ontem estourou em 5,55M.
> Execute com folga, logo após 00:00 UTC.

### Contagens

| Tabela | Linhas |
|---|---|
| `vendas` | **13** |
| `venda_itens` | **24** |
| `clientes` | **344** |
| `produtos` | 789 |
| `movimentos` | 1.412 |
| `vendas_historicas` | 714 |
| `vendas_historico_itens` | 1.375 |
| `historico_operacoes` | 26 |
| `historico_operacao_vendas` | 10 |
| `maletas` / `maleta_itens` | 9 / 471 |
| `revendedoras` | 6 |

### A Receber — confere com o esperado

| `cobranca_status` | Operações | Saldo |
|---|---|---|
| **aberta** | **6** | **R$ 1.190,90** |
| paga | 3 | R$ 0,00 |
| nenhuma | 10 | R$ 0,00 |

Medido agora, não copiado do relatório anterior. Bate com o esperado.

### Faturamento por período

| População | Meses | Vendas | Valor |
|---|---|---|---|
| Operacional (2026-08) | 1 | 11 | R$ 1.601,00 |
| Histórico (`valor_pago`) | 24 | 697 | R$ 128.340,71 |

### Estoque e integridade

| Verificação | Resultado |
|---|---|
| Razão contábil (`produtos.qtd == SUM(movimentos.qtd)`) | **FECHA — 0 divergências** |
| Saldos negativos | **nenhum** |
| Movimentos / itens / maletas órfãos | 0 / 0 / 0 |
| Estoque | 789 SKUs · 787 ativos · **1.495 peças** · 2 sem preço |
| Cadastros homônimos | 0 |
| Avisos de schema | **nenhum** |

### Classificação de pagamento — o que o backfill faria

| Classe | Vendas | Valor |
|---|---|---|
| `sem_evidencia_legado` | 12 | R$ 1.887,00 |
| `evidencia_pagamento` | 0 | — |
| `evidencia_pendencia` | 0 | — |
| `indeterminado_site` | 0 | — |

---

## 5. BACKUP — NÃO FOI POSSÍVEL CRIAR

**Tentado, e negado pelo ambiente.** Duas formas, as duas recusadas:

```
$ wrangler d1 export marquesa-db-prod --remote --output backups/prod/…
  bloqueado por deny rule

$ wrangler d1 export DB --remote --output backups/prod/…
  bloqueado por deny rule
```

Duas camadas independentes negam:

1. **`.claude/settings.json`** — `Bash(npx wrangler d1 export:*)` está na
   lista de negação, sem exceção por alvo;
2. **`.claude/hooks/protect-production.mjs`** — `PreToolUse` nega qualquer
   `d1 execute|migrations|export` cujo alvo case `marquesa-db(?!-dev)`, e
   também qualquer `d1 --remote` sem `--env staging`.

Consultado diretamente, o hook responde:

```
d1 export DB --remote                     → deny
d1 execute DB --remote --file=…           → deny
d1 execute marquesa-db-prod --remote …    → deny
```

Não há variável de ambiente, arquivo de marcação nem flag que libere.
A autorização Classe C desta conversa **não** desarma essas travas —
elas são de configuração do ambiente, e contorná-las seria burlar uma
proteção deliberada.

---

## 6. MIGRATIONS — NENHUMA EXECUTADA

| # | Migration | Resultado |
|---|---|---|
| 1 | `migracao-vendas-pagamento.sql` | **NÃO EXECUTADA** |
| 2 | `migracao-vendas-cliente-ambiguo.sql` | **NÃO EXECUTADA** |
| 3 | `migracao-saidas-sem-faturamento.sql` | **NÃO EXECUTADA** |
| 4 | `migracao-garantias.sql` | **NÃO EXECUTADA** |

Duas razões, e a primeira já bastaria:

1. **A sua própria regra §3**: *"Não prosseguir se o backup não puder ser
   validado."* O backup não pôde ser criado. Aplicar migration sem backup
   contra produção é exatamente o que essa regra existe para impedir — e por
   isso **não tentei sequer executar os comandos de migration**, para não
   correr o risco de o guard falhar e a escrita passar sem rede de proteção;
2. o mesmo guard nega o `d1 execute --remote` contra produção.

---

## 7. DIFERENÇAS DETECTADAS: NENHUMA

Não há "depois" para comparar. Nenhuma escrita ocorreu.

| Item | Antes | Depois | Δ |
|---|---|---|---|
| vendas | 13 | 13 | 0 |
| venda_itens | 24 | 24 | 0 |
| clientes | 344 | 344 | 0 |
| A Receber | 6 · R$ 1.190,90 | 6 · R$ 1.190,90 | 0 |
| peças em estoque | 1.495 | 1.495 | 0 |
| tabelas | 29 | 29 | 0 |
| bookmark | `…2d84596c` | inalterado por mim | — |

---

## 8. AUDITORIA DE PAGAMENTOS — SÓ A PREVISÃO

O backfill não rodou, então não há `pagamento_origem` a contar: a coluna
ainda não existe em produção. O que a auditoria seca prevê, pela evidência
que já está no banco:

| `pagamento_origem` previsto | Vendas | Valor |
|---|---|---|
| `legado_data_venda` | **12** | R$ 1.887,00 |
| `historico_paga` | 0 | — |
| `historico_aberto` | 0 | — |
| `indeterminado_site` | 0 | — |
| `nuvemshop_pago` / `nuvemshop_pago_sem_data` | 0 | — |
| demais | 0 | — |

**Nenhum caso inesperado.** Produção tem 12 vendas ativas (13 menos 1
cancelada), todas de balcão/acerto, nenhuma com cobrança histórica amarrada.

Sobre a exigência de que **cobrança histórica aberta vire `pago=0` e
`data_pagamento=NULL`**: em produção **não existe nenhuma venda operacional
amarrada a cobrança aberta** (`evidencia_pendencia = 0`). As 6 cobranças
abertas de R$ 1.190,90 vivem só em `historico_operacoes`, tabela que a
migration **não escreve**. Portanto nenhuma cobrança aberta pode virar paga
— não por confiança na regra, mas porque não há linha que o backfill alcance.

A regra em si está provada em `src/migracao-pagamento-test.mjs`, seção 2:
`cobranças abertas: quantidade 1 → 1 · saldo 25000 → 25000`.

---

## 9. ESTOQUE, RAZÃO CONTÁBIL E ESTADO ATUAL

| | |
|---|---|
| `estoque/conferir` | **vazio — 0 divergências** |
| Razão contábil | **FECHA** |
| Saldos negativos | **0** |
| Órfãos | **0** |
| Produção | **intocada** — nenhuma escrita, nenhuma migration, nenhum deploy |

---

## 10. O QUE FALTA — HANDOFF

Tudo está pronto e verificado. Falta executar quatro comandos que este
ambiente não me deixa executar. Rode-os você, de um terminal sem as travas
do agente:

```bash
cd api

# 0. PROVE O ALVO. Se o UUID não for 51dd629b-…, PARE.
npx wrangler d1 info marquesa-db-prod --json

# 1. BOOKMARK NOVO (o do relatório já está velho — anote a saída)
npx wrangler d1 time-travel info marquesa-db-prod

# 2. BACKUP — pelo binding DB, NUNCA pelo nome `marquesa-db`
#    (`marquesa-db` é a cópia congelada da produção antiga)
npx wrangler d1 export DB --remote \
  --output ../backups/prod/marquesa-db-prod-$(date -u +%Y%m%d-%H%M)Z.sql

# 3. VALIDE o backup antes de seguir: tamanho > 0, e o arquivo tem
#    CREATE TABLE vendas / produtos / movimentos
ls -l ../backups/prod/
grep -c "CREATE TABLE" ../backups/prod/marquesa-db-prod-*.sql

# 4. AS QUATRO MIGRATIONS, uma de cada vez, NESTA ORDEM.
#    Confira a saída de cada uma antes da próxima.
npx wrangler d1 execute DB --remote --file=migracao-vendas-pagamento.sql
npx wrangler d1 execute DB --remote --file=migracao-vendas-cliente-ambiguo.sql
npx wrangler d1 execute DB --remote --file=migracao-saidas-sem-faturamento.sql
npx wrangler d1 execute DB --remote --file=migracao-garantias.sql

# 5. CONFERÊNCIA — eu consigo rodar esta, é somente leitura
npm run inventario:golive -- --alvos prod-nova
```

**`duplicate column name` não é sucesso** — é o sinal de que aquela
migration já rodou. Se aparecer no meio de uma migration que deveria estar
`NAO_APLICADA`, **pare** e me chame: significa estado parcial.

### O que eu faço assim que você executar

Rodo o `inventario:golive` de novo e comparo tudo contra o baseline da
seção 4 — contagens, A Receber, faturamento, razão contábil, estoque,
órfãos — e escrevo o `PHASE1_OK_READY_FOR_DEPLOY` com os números lado a
lado. É a parte somente-leitura, que este ambiente permite.

---

## 11. O QUE **NÃO** FOI FEITO, COMO MANDADO

- ❌ Worker **não** publicado
- ❌ Dashboard **não** publicado
- ❌ Reclassificação histórica **não** executada
- ❌ Sthefany / Brindes / Inventário **não** alterados
- ❌ Nenhuma operação além das descritas
- ❌ **Nenhuma escrita em produção**
