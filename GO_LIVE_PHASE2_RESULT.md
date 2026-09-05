# GO_LIVE_PARTIAL_STOP

**A Fase 1 está confirmada no banco. O deploy da Fase 2 não saiu: o ambiente
nega `wrangler deploy` e nega o merge em `main`. Nada foi publicado, nada foi
alterado, e não há o que reverter.**

Não é falha de teste, de código nem de banco — as sete suítes críticas
passaram e produção está íntegra. É a mesma trava de configuração que parou a
Fase 1, e ela não distingue autorização humana em conversa de um agente
agindo por conta própria.

> Gerado em **2026-09-05 12:45 UTC** · branch `feat/vendas-pagamento-saidas-garantias`
> · commit `3dfc290`
> Evidência da auditoria: `backups/golive/2026-09-05-12-38-18Z_inventario/`

---

## 1. COMMIT A PUBLICAR

| | |
|---|---|
| branch | `feat/vendas-pagamento-saidas-garantias` — a esperada |
| HEAD | `3dfc2907f10e31f41f0dd7c22c3edebe738e80fd` |
| árvore de trabalho | limpa — só `.codex/`, `.tmp/` e `AGENTS.md` não versionados |
| `dashboard.html` | `python src/build.py` rodou e **não mudou byte nenhum**: o arquivo commitado já é o que o template produz |

Correções finais presentes no HEAD:

| Assunto | Commit |
|---|---|
| pagamentos (`pago`/`valor_recebido`/`cobravel`) | `68b014e` |
| Nuvemshop — reembolso e parcial | `7ceadab` |
| Nuvemshop — status ausente | `39618a9` |
| `cliente_id`, homônimos, garantias, saídas | na série de `b1e6afc` para trás |

---

## 2. A FASE 1 ACONTECEU — CONFERIDO NO BANCO, NÃO ACEITO DE PALAVRA

Auditoria somente-leitura contra o alvo provado antes de qualquer SELECT:

```
OK marquesa-db-prod = 51dd629b-52dc-46d0-a1af-fa37f0a79533
```

### As seis migrations, artefato por artefato

| Migration | Estado | Artefatos |
|---|---|---|
| `migracao-venda-desconto.sql` | **APLICADA** | 3/3 |
| `migracao-historico-operacoes.sql` | **APLICADA** | 2/2 |
| `migracao-vendas-pagamento.sql` | **APLICADA** | **6/6** |
| `migracao-vendas-cliente-ambiguo.sql` | **APLICADA** | **1/1** |
| `migracao-saidas-sem-faturamento.sql` | **APLICADA** | **2/2** |
| `migracao-garantias.sql` | **APLICADA** | **4/4** |

**Nenhuma PARCIAL.** O DDL de `vendas` lido de produção termina em:

```sql
... , pago INTEGER NOT NULL DEFAULT 1, data_pagamento TEXT, observacao TEXT,
      pagamento_origem TEXT, valor_recebido REAL,
      cobravel INTEGER NOT NULL DEFAULT 1, cliente_ambiguo INTEGER NOT NULL DEFAULT 0)
```

E as tabelas novas existem, vazias: `garantias` 0, `garantia_eventos` 0,
`garantia_trocas` 0, `saidas_sem_faturamento` 0, `historico_reclassificacao` 0.

---

## 3. BASELINE DA FASE 2 — MEDIDO AGORA

| Indicador | Valor | Bate com a Fase 1? |
|---|---|---|
| clientes | **344** | sim |
| vendas operacionais | **13** | sim |
| `venda_itens` | **24** | sim |
| estoque | **1.495 peças** · 789 SKUs · 787 ativos | sim |
| **A Receber** | **6 cobranças · R$ 1.190,90** (`119090` centavos) | sim |
| faturamento operacional 2026-08 | **11 vendas · R$ 1.601** | sim |
| faturamento histórico | 24 meses · 697 vendas · R$ 128.340,71 | sim |
| razão contábil | **FECHA — 0 divergências** | sim |
| saldos negativos | **0** | sim |
| órfãos (movimento / item / maleta) | **0 / 0 / 0** | sim |
| homônimos | **0** | sim |
| `externo_id` duplicado | 0 · índice único presente | sim |

Bookmark D1 no momento da captura:

```
000000b5-00000000-000050dd-95ca07b1e07fcadb0a08f076bed8dd45
```

> Ele avançou de `000000ae` (antes da Fase 1) para `000000b5` — coerente com
> as quatro migrations terem sido aplicadas. Capture um novo imediatamente
> antes do deploy: produção recebe escrita continuamente.

---

## 4. TESTES CRÍTICOS — TODOS VERDES

Rodados agora, sobre banco zerado a cada suíte (`.tmp/reset-teste.sh`), porque
resíduo de um teste anterior já produziu falsa regressão neste projeto.

| Suíte | Resultado |
|---|---|
| `pagamento-nuvemshop-test.mjs` | **tudo ok** — cenários A–M |
| `sync-pagamento-test.mjs` | **TUDO PASSOU** — loja falsa, ponta a ponta |
| `migracao-pagamento-test.mjs` | **tudo ok** — migration real sobre `node:sqlite` |
| `revisao-pre-golive-test.mjs` | **tudo ok** — homônimos, saídas, estorno, razão |
| `pacote-vendas-test.mjs` | **tudo ok** — razão fecha, 0 negativos |
| `pacote-vendas-ui-test.mjs` | **tudo ok** — console limpo, 390px |
| `e2e.mjs` | **TUDO PASSOU** — console limpo |

Nenhuma falhou. Nenhuma foi pulada.

---

## 5. DEPLOY DO WORKER — NÃO EXECUTADO, BLOQUEADO

### O comando exato, e o alvo provado antes dele

```bash
cd api
npx wrangler deploy          # SEM --env: é isso que publica produção
```

| | Valor | Origem |
|---|---|---|
| Worker | **`marquesa-api`** | `name` na raiz do `api/wrangler.toml` |
| ambiente | **produção** (raiz, sem `--env`) | idem |
| binding | **`DB`** | `[[d1_databases]]` da raiz |
| database | **`marquesa-db-prod`** | idem |
| UUID | **`51dd629b-52dc-46d0-a1af-fa37f0a79533`** | idem — **confere** |
| CORS | `https://gustavodemelomartins-hub.github.io` | `[vars] ORIGENS_PERMITIDAS` — o endereço de produção não muda |
| cron | **`crons = []`** | `[triggers]` — o deploy mantém a sincronização automática DESLIGADA |
| R2 | bloco `FOTOS` **ausente** | removido no go-live 2026-08-22; com ele o deploy falharia (a conta responde 10042) |

### A tentativa, e a recusa

```
$ cd api && npx wrangler deploy
`wrangler deploy` não é executado por agente em NENHUM ambiente
(docs/SECURITY.md, Classe C). O DEV publica por push em `develop`
(.github/workflows/deploy-dev.yml); o Worker staging é comando humano.
Entregue o comando ao Gustavo em vez de rodá-lo.
```

Duas camadas independentes, como na Fase 1:

1. **`.claude/settings.json`** — `Bash(npx wrangler deploy:*)`,
   `Bash(wrangler deploy:*)`, `pages deploy`, `versions deploy`,
   `triggers deploy` e `rollback` estão todos na lista de negação;
2. **`.claude/hooks/protect-production.mjs`** linha 217 — nega
   `deploy|rollback|versions deploy|triggers deploy|pages deploy` **em
   qualquer ambiente**, com a mensagem acima.

Nem `--dry-run` passa: o deny casa por prefixo do comando.

---

## 6. DASHBOARD — NÃO PUBLICADO, BLOQUEADO PELO MESMO MOTIVO

O painel de produção **não** sai por `wrangler pages deploy`. Ele é o GitHub
Pages servido a partir de `main`:

```
https://gustavodemelomartins-hub.github.io/Marquesa-Etiquetas/
```

Publicar = **merge de `feat/vendas-pagamento-saidas-garantias` em `main` e
push**. O GitHub Pages republica sozinho. Isso é negado três vezes:

| Camada | Regra |
|---|---|
| `settings.json` deny | `Bash(git push origin main:*)` |
| hook linha 300 | push cujo alvo é `main` |
| hook linha 305 | `git merge` envolvendo `main` |

Não tentei o merge: diferente de um comando que é negado antes de rodar, um
merge que passasse mudaria a árvore local. A leitura do hook é prova
determinística — não precisava do experimento.

> **Aviso que vale repetir:** publicar por GitHub Pages a partir de `main`
> **não roda teste nenhum** (docs/PLANO-MESTRE-MARQUESA.md, linha 615). A rede
> de proteção é a suíte da seção 4, que já está verde — e a ordem que você
> pediu: Worker primeiro, smoke test, só então o dashboard.

---

## 7. SMOKE TESTS — O QUE DEU PARA PROVAR SEM PUBLICAR

Os itens A–K da sua seção 4 pedem a API **em produção**. Sem deploy, não há
produção nova para testar. O que fiz foi provar contra o Worker local o
cenário que é o **risco real** deste deploy: as tabelas novas estão **vazias**
em produção, e tela que consulta tabela que nunca recebeu linha é onde deploy
costuma quebrar.

Banco zerado (mesmo formato de produção: garantias 0, saídas 0):

| Item | Rota | Resultado |
|---|---|---|
| A. saúde | `/api/health` | 200 `{"ok":true,"hoje":"2026-09-05"}` |
| B. vendas | `/api/vendas` | 200 |
| C. clientes | `/api/clientes` | 200 |
| D. painel | `/api/analytics/painel` | 200 |
| D2. painel vendas | `/api/analytics/vendas` | 200 |
| D3. CRM | `/api/analytics/crm` | 200 |
| D4. evolução | `/api/analytics/evolucao` | 200 |
| F. estoque | `/api/state` | 200 |
| G. razão contábil | `/api/estoque/conferir` | 200 `{"ok":true,"divergentes":[]}` |
| **H. garantias vazia** | `/api/garantias` | 200 `{"ok":true,"garantias":[]}` — **não quebra** |
| H2. garantias pendentes | `/api/garantias/pendentes` | 200 `{"pendentes":[],"total":0,"consideraFeriados":false}` |
| **I. saídas vazia** | `/api/saidas` | 200 `{"ok":true,"saidas":[],"resumo":{...}}` — **não quebra** |
| J. histórico consolidado | `/api/vendas/historico/reconstrucao` | 200, sem duplicidade |
| J2. lotes | `/api/vendas/historico/lotes` | 200 |
| — auditoria de pagamento | `/api/vendas/pagamento/auditoria` | 200 |
| **K. perfil por `cliente_id`** | `/api/clientes/perfil?id=2` | 200, devolve `clienteId: 2` |

15 verificações, **nenhuma falha**. Isto não substitui o smoke test em
produção — substitui a surpresa.

**E. A Receber** foi conferido direto no banco de produção (somente leitura):
**6 cobranças · R$ 1.190,90**, idêntico ao esperado. Nenhum uso legítimo
mexeu nele desde a Fase 1.

---

## 8. TESTE DE ESCRITA

**SMOKE_WRITE_SKIPPED_FOR_SAFETY**

Duas razões, e cada uma bastaria: não houve deploy, e não existe no sistema um
mecanismo de registro de teste estornável sem sujar dado real. Criar cliente
falso ou venda de mentira em produção para "ver se funciona" é exatamente o
que a sua seção 5 proíbe. Não improvisei.

---

## 9. VALIDAÇÃO NUVEMSHOP — POR CÓDIGO E TESTE, SEM SINCRONIZAÇÃO REAL

Nenhuma sincronização foi forçada. As regras finais, como estão em
`api/src/sync.js` › `pagamentoDoPedido`:

| `payment_status` | faturamento | A Receber | `pagamento_origem` |
|---|---|---|---|
| `paid` | **total**, na data de `paid_at` | 0 | `nuvemshop_pago` |
| `paid` sem `paid_at` | total, data da venda **declarada como aproximação** | 0 | `nuvemshop_pago_sem_data` |
| `pending` + pedido ativo | 0 | **total** | `nuvemshop_pendente` |
| `pending` + pedido cancelado | 0 | **0** | `nuvemshop_cancelado` |
| `partially_paid` com valor legível | **recebido** | **total menos recebido** | `nuvemshop_parcial` |
| `partially_paid` sem valor | 0 | **0** — vira pendência | `pagamento_parcial_indeterminado` |
| `authorized` | 0 | total se ativo | `nuvemshop_autorizado` |
| `refunded` | 0 | **0 — nunca vira dívida** | `nuvemshop_reembolsado`, exige política |
| `voided` + cancelado | 0 | **0** | `nuvemshop_anulado` |
| `voided` + ativo | 0 | total | `nuvemshop_pendente_apos_anulacao` |
| `abandoned` | 0 | **0** | `nuvemshop_abandonado` |
| **ausente** | **0** | **0** | `indeterminado_site` |
| desconhecido | 0 | 0 | `nuvemshop_estado_desconhecido` |

`voided` nunca decide sozinho: cruza com o estado real do pedido
(`pedidoCancelado`). E `valorRecebidoDoPedido` só lê `transactions[]` com
status `paid`/`approved` e valor numérico — não adivinha campo.

### `pending → paid` não duplica nada

Provado em `sync-pagamento-test.mjs`, cenários 1 e 2, contra loja falsa:

- **1.** pedido pendente: a peça sai do estoque **uma vez**, o dinheiro **não**
  entra;
- **2.** o PIX cai: **fatura uma vez**, e o estoque **não baixa de novo** —
  nenhum movimento novo é criado, a venda existente é atualizada em vez de uma
  segunda venda ser inserida (`jaTemos.has(chave)` chama
  `atualizarPagamentoDaVenda`, não `INSERT`);
- **7.** a razão contábil fecha no fim de tudo.

E em `pagamento-nuvemshop-test.mjs` cenário **C**: "pending → paid: a receita
é registrada UMA vez".

O índice único `vendas.externo_id` continua presente em produção
(`indice_unico_externo_id: true`, 0 duplicados).

---

## 10. NÚMEROS DEPOIS × BASELINE: DIFERENÇA ZERO

Nenhum deploy, nenhuma escrita — não há evento que pudesse mover indicador.

| Item | Antes | Depois | Delta |
|---|---|---|---|
| clientes | 344 | 344 | 0 |
| vendas | 13 | 13 | 0 |
| `venda_itens` | 24 | 24 | 0 |
| estoque | 1.495 | 1.495 | 0 |
| A Receber | 6 · R$ 1.190,90 | 6 · R$ 1.190,90 | 0 |
| faturamento 2026-08 | R$ 1.601 | R$ 1.601 | 0 |
| razão contábil | fecha | fecha | 0 |
| negativos | 0 | 0 | 0 |
| órfãos | 0 | 0 | 0 |

---

## 11. ROLLBACK — REGISTRADO E DISPONÍVEL

| O quê | Ponto de retorno |
|---|---|
| **Worker em produção hoje** | versão `9265c6db-6e64-4e44-84d0-ac0087cb1a65`, publicada 2026-09-04T10:55:57Z |
| **Dashboard / GitHub Pages** | `main` = `e5f258857342846038dec3d090fe47b9e58e6c5e` (= `origin/main`) |
| **Bookmark D1** | `000000b5-00000000-000050dd-95ca07b1e07fcadb0a08f076bed8dd45` |

**As migrations sobrevivem ao rollback do Worker — provado, não suposto.** As
três colunas `NOT NULL` que nasceram nelas têm valor padrão:

```sql
pago            INTEGER NOT NULL DEFAULT 1
cobravel        INTEGER NOT NULL DEFAULT 1
cliente_ambiguo INTEGER NOT NULL DEFAULT 0
```

O código antigo insere em `vendas` sem citá-las e o banco preenche sozinho.
Nada a remover num rollback de emergência.

---

## 12. NÃO FOI MEXIDO — COMO MANDADO

- Sthefany Marques — nenhuma linha tocada
- Brindes, Inventário, Perdas, candidatos históricos — intocados
- nenhuma reclassificação
- nenhuma migration adicional
- nenhum `DROP`, `DELETE` em massa, recálculo de estoque ou reconstrução de faturamento
- nenhuma importação histórica
- regra da troca por peça mais barata — continua BLOQUEADA (`pendente_regra`)
- política de reembolso — continua sem regra, e o código continua **recusando** decidir sozinho
- **nenhuma escrita em produção**

---

## 13. PRÓXIMOS PASSOS — O QUE PRECISA DA SUA MÃO

Dois comandos. Nesta ordem, com a conferência no meio.

```bash
# ---- PASSO 1 - WORKER -------------------------------------------
cd api

# 1a. PROVE o alvo. Se o UUID não for 51dd629b-..., PARE.
npx wrangler d1 info marquesa-db-prod --json

# 1b. Anote a versão viva, que é o rollback (hoje 9265c6db-...)
npx wrangler deployments list --name marquesa-api

# 1c. Publique. SEM --env — é isso que endereça produção.
npx wrangler deploy
```

**Se o deploy falhar: PARE.** Não aplique migration, não mexa no banco para
"fazer o código funcionar". Rollback:
`npx wrangler rollback --name marquesa-api`.

```bash
# ---- PASSO 2 - CONFERÊNCIA (esta eu rodo, é somente leitura) ----
cd api && npm run inventario:golive -- --alvos prod-nova
```

Me chame aqui depois do passo 1: comparo tudo contra o baseline da seção 3 e
confirmo os smoke tests A–K contra a API publicada de verdade. **Só depois
disso** o dashboard sai.

```bash
# ---- PASSO 3 - DASHBOARD (só se o passo 2 estiver limpo) --------
cd ..
git checkout main
git merge feat/vendas-pagamento-saidas-garantias
git push origin main          # o GitHub Pages republica sozinho
```

Rollback do painel, se a API estiver boa e a tela não: `git revert` em `main`
e push — republica em minutos.

---

## 14. O VEREDICTO, SEM ENFEITE

**GO_LIVE_PARTIAL_STOP.**

- banco de produção **íntegro**, seis migrations **APLICADA**, nenhuma PARCIAL
- A Receber, estoque, faturamento e razão contábil **preservados e conferidos**
- sete suítes críticas **verdes**
- endpoints novos provados contra tabela vazia
- ponto de rollback registrado para Worker, dashboard e banco
- **Worker NÃO publicado** — bloqueado pelo ambiente
- **Dashboard NÃO publicado** — bloqueado pelo ambiente
- dados históricos **ainda não reclassificados**, como mandado

O sistema está pronto para publicar. Falta o comando, e ele é seu.
