# READY_FOR_GO_LIVE

> Pré-voo final de produção — **somente leitura**. Nenhuma migration foi
> aplicada, nenhum Worker foi publicado, nenhum dashboard foi publicado,
> nenhum registro foi alterado.
>
> Gerado em **2026-09-05 10:40 UTC** · branch `feat/vendas-pagamento-saidas-garantias`
> · commit `f54434e`
> Evidência bruta: `backups/golive/2026-09-05-10-40-29Z_inventario/`

---

## 1. ALVO PROVADO ANTES DE QUALQUER SELECT

| | Esperado | Encontrado | |
|---|---|---|---|
| binding | `DB` | `DB` (raiz do `api/wrangler.toml`) | ✅ |
| database | `marquesa-db-prod` | `marquesa-db-prod` | ✅ |
| UUID | `51dd629b-52dc-46d0-a1af-fa37f0a79533` | idem | ✅ |

O `inventario-golive.mjs` prova o UUID via `d1 info` **antes** de executar
qualquer consulta e aborta se divergir. Todo SQL passou pelo `assertReadOnly`
(só `SELECT`/`WITH`, uma instrução, sem DDL/DML).

Metadados do banco:

```
criado em        2026-08-22T21:48:50Z   (o corte de produção)
tabelas          29
tamanho          2.629.632 bytes
região           ENAM
read replication desativada
leituras 24h     2.242 queries · 5.550.651 linhas
escritas 24h    10.129 queries ·    46.969 linhas
```

---

## 2. PRÉ-VOO DAS SEIS MIGRATIONS

**Nenhuma PARCIAL.** O estado de cada uma é conhecido.

| # | Migration | Estado | Artefatos |
|---|---|---|---|
| 1 | `migracao-venda-desconto.sql` | **APLICADA** | 3/3 |
| 2 | `migracao-historico-operacoes.sql` | **APLICADA** | 2/2 |
| 3 | `migracao-vendas-pagamento.sql` | **NAO_APLICADA** | 0/6 |
| 4 | `migracao-vendas-cliente-ambiguo.sql` | **NAO_APLICADA** | 0/1 |
| 5 | `migracao-saidas-sem-faturamento.sql` | **NAO_APLICADA** | 0/2 |
| 6 | `migracao-garantias.sql` | **NAO_APLICADA** | 0/4 |

Detalhe artefato a artefato:

```
1  migracao-venda-desconto.sql            APLICADA      3/3
     PRESENTE  coluna  venda_itens.preco_tabela
     PRESENTE  coluna  venda_itens.desconto_valor
     PRESENTE  coluna  venda_itens.desconto_rotulo
2  migracao-historico-operacoes.sql       APLICADA      2/2
     PRESENTE  tabela  historico_operacoes
     PRESENTE  tabela  historico_operacao_vendas
3  migracao-vendas-pagamento.sql          NAO_APLICADA  0/6
     AUSENTE   coluna  vendas.pago
     AUSENTE   coluna  vendas.data_pagamento
     AUSENTE   coluna  vendas.observacao
     AUSENTE   coluna  vendas.pagamento_origem
     AUSENTE   coluna  vendas.valor_recebido
     AUSENTE   coluna  vendas.cobravel
4  migracao-vendas-cliente-ambiguo.sql    NAO_APLICADA  0/1
     AUSENTE   coluna  vendas.cliente_ambiguo
5  migracao-saidas-sem-faturamento.sql    NAO_APLICADA  0/2
     AUSENTE   tabela  saidas_sem_faturamento
     AUSENTE   tabela  historico_reclassificacao
6  migracao-garantias.sql                 NAO_APLICADA  0/4
     AUSENTE   tabela  garantias
     AUSENTE   tabela  garantia_eventos
     AUSENTE   tabela  garantia_trocas
     AUSENTE   tabela  feriados
```

### ⚠️ Correção a um relatório anterior

O relatório de 2026-09-04 afirmava que **duas** migrations antigas estavam
pendentes em produção (`venda-desconto` e `historico-operacoes`). **Estava
errado.** As duas já estão aplicadas — provado coluna a coluna e tabela a
tabela, não por contagem.

Isso significa que a correção do "lápis" (preço negociado por peça) **já tem
o banco de que precisa**; falta só o código, que está no corte de 22/08.

**A aplicar no go-live: apenas as migrations 3, 4, 5 e 6, nesta ordem.**

---

## 3. INTEGRIDADE ESTRUTURAL

| Verificação | Resultado |
|---|---|
| Razão contábil (`produtos.qtd == SUM(movimentos.qtd)`) | **FECHA — 0 divergências** |
| Saldos negativos | **nenhum** |
| Movimentos órfãos | 0 |
| Itens de venda órfãos | 0 |
| Itens de maleta órfãos | 0 |
| Índice UNIQUE de `vendas.externo_id` | **provado presente** |
| `externo_id` duplicado | 0 |
| Métricas incompletas por diferença de schema | **0 avisos** |
| Cadastros homônimos (mesmo `nome_norm`) | **0** |

---

## 4. RETRATO DOS DADOS

### Contagens

| Tabela | Linhas |
|---|---|
| `produtos` | 789 (787 ativos · 1.495 peças · 2 sem preço) |
| `clientes` | 344 |
| `vendas` | 13 |
| `venda_itens` | 24 |
| `movimentos` | 1.412 |
| `vendas_historico_itens` | 1.375 |
| `vendas_historicas` | 714 |
| `vendas_historico_lotes` | 2 |
| `historico_operacoes` | 26 |
| `historico_operacao_vendas` | 10 |
| `maletas` / `maleta_itens` | 9 / 471 |
| `revendedoras` | 6 |
| `loja_variantes` | 687 |
| `produto_variacoes` | 83 |
| `clientes_vinculo_revisao` | 1 |

### Vendas por origem

| Origem | Nº | Soma | Primeira | Última | Canceladas |
|---|---|---|---|---|---|
| `balcao` | 12 | R$ 1.700 | 2026-08-05 | 2026-08-22 | 1 |
| `acerto` | 1 | R$ 286 | 2026-08-23 | 2026-08-23 | 0 |
| `site` | **0** | — | — | — | — |

### Faturamento por mês

**Operacional** (vendas de cliente, sem acerto):

| Mês | Vendas | Valor |
|---|---|---|
| 2026-08 | 11 | R$ 1.601 |

**Histórico** (`valor_pago` das vendas reconstruídas) — 24 meses,
**697 vendas**, **R$ 128.340,71** no total. Extremos:

| Mês | Vendas | Valor pago |
|---|---|---|
| 2024-04 | 1 | R$ 159,00 |
| 2024-12 | 29 | R$ 6.275,00 |
| 2026-06 | 21 | R$ 5.393,30 |
| 2026-07 | 45 | R$ 7.492,15 |
| 2026-08 | 38 | R$ 7.341,44 |

> Estes são os números **de origem**, não o do painel — o painel soma as
> duas populações e aplica reclassificação. Servem como linha de base para
> comparar antes × depois da migration.

### Índices existentes nas tabelas que as migrations tocam

```
vendas                     idx_vendas_cliente_norm, idx_vendas_data,
                           idx_vendas_externo, idx_vendas_origem
venda_itens                idx_venda_itens_s, idx_venda_itens_v,
                           idx_venda_itens_variante
historico_operacoes        idx_hist_op_ativa_chave, idx_hist_op_cliente,
                           idx_hist_op_cobranca, idx_hist_op_lote_chave_versao,
                           idx_hist_op_revendedora
historico_operacao_vendas  idx_hist_op_relacao_ativa, idx_hist_op_venda_ativa,
                           idx_hist_op_vendas_operacao
```

As migrations 3 e 4 acrescentam `idx_vendas_pagamento`, `idx_vendas_pago`,
`idx_vendas_pgorigem`, `idx_vendas_cobravel` e `idx_vendas_ambiguo`. Nenhum
índice existente é removido ou alterado.

---

## 5. CONTAS A RECEBER — PRESERVÁVEIS

| `cobranca_status` | Operações | Saldo |
|---|---|---|
| **aberta** | **6** | **R$ 1.190,90** |
| paga | 3 | R$ 0,00 |
| nenhuma | 10 | R$ 0,00 |

Todas vivem em `historico_operacoes`. **A migration 3 não escreve uma linha
nessa tabela** — ela só acrescenta colunas em `vendas` e faz `UPDATE` em
`vendas`. As 6 cobranças abertas continuam abertas, com o mesmo saldo.

Prova de que a preservação funciona mesmo quando há venda operacional
amarrada a cobrança aberta: `src/migracao-pagamento-test.mjs`, seção 2 —
`cobranças abertas: quantidade 1 → 1 · saldo 25000 → 25000`.

---

## 6. CLASSIFICAÇÃO DE PAGAMENTO DAS VENDAS

Calculada pela **evidência que já existe no banco**, com a mesma regra que o
backfill aplicará:

| Classe | Vendas | Valor | Período | O que a migration escreverá |
|---|---|---|---|---|
| `sem_evidencia_legado` | **12** | R$ 1.887 | 2026-08-05 a 2026-08-23 | `pago=1`, `data_pagamento = data`, carimbo `legado_data_venda` |
| `evidencia_pagamento` | 0 | — | — | — |
| `evidencia_pendencia` | 0 | — | — | — |
| `indeterminado_site` | **0** | — | — | — |

### Vendas indeterminadas do site: **NENHUMA**

Produção **não tem uma única venda de origem `site`** (`externo_total = 0`,
zero linhas com `origem='site'`). A lista nominal pedida existe e veio
**vazia**.

Consequência prática, e é boa: a regra definitiva *"faturamento é só dinheiro
efetivamente recebido"* tem **impacto retroativo zero** em produção. Ela
passa a valer para os pedidos que entrarem daqui em diante.

As 12 vendas `sem_evidencia_legado` são de balcão/acerto, lançadas
manualmente. Nunca existiu informação de pagamento para elas, e o sistema
sempre as contou no dia da venda. A migration preserva exatamente isso e
**carimba como aproximação**, nunca como fato.

---

## 7. NUVEMSHOP — REGRA FINAL POR `payment_status`

**Confirmado e implementado** (commits `68b014e` e `7ceadab`).

`GET /orders` devolve o pedido inteiro, e os campos de pagamento **já
estavam no mesmo payload** que a sincronização sempre leu. Ler:

- **não custa requisição nova** — mesmo endpoint, mesma paginação;
- **não pede escopo novo** — `read_orders` já cobre;
- **não muda contrato nenhum** com a loja — a mudança é toda do lado de cá.

### Campos reais utilizados, e nenhum além destes

| Campo | Para quê |
|---|---|
| `payment_status` | o estado do pagamento |
| `paid_at` | a data **real** do recebimento |
| `status` | o pedido está de pé ou cancelado |
| `cancelled_at` | idem, o outro sinal de cancelamento |
| `transactions[]` | valor recebido, **só quando vier** |

### Regra final

Duas frases governam, e elas não são a mesma:

> **FATURAMENTO** = dinheiro efetivamente recebido.
> **A RECEBER** = dinheiro que o cliente **realmente** ainda deve.

A versão anterior deste relatório dizia `pending / authorized /
partially_paid / voided / refunded → A Receber`. **Estava errada.**
Faturamento e A Receber não são complementares: um reembolso não é nem um
nem outro, e um pagamento parcial é os dois em partes.

| `payment_status` | Faturamento | A Receber | Carimbo | Regra |
|---|---|---|---|---|
| `paid` **com** `paid_at` | total | 0 | `nuvemshop_pago` | data real do recebimento decide o mês |
| `paid` **sem** `paid_at` | total | 0 | `nuvemshop_pago_sem_data` | data do pedido como fallback **declarado** no relatório |
| `pending` + pedido ativo | 0 | total | `nuvemshop_pendente` | a venda existe, o dinheiro ainda não |
| `pending` + cancelado | 0 | **0** | `nuvemshop_cancelado` | não há o que cobrar |
| `authorized` + ativo | 0 | total | `nuvemshop_autorizado` | cartão **reservado**, não capturado |
| `authorized` + cancelado | 0 | **0** | `nuvemshop_cancelado` | idem |
| `partially_paid` **com** valor | recebido | saldo | `nuvemshop_parcial` | 40 de 100 → fatura 40, deve 60 |
| `partially_paid` **sem** valor | **0** | **0** | `pagamento_parcial_indeterminado` | nada contabilizado até alguém conferir |
| `refunded` | **0** | **0** | `nuvemshop_reembolsado` | ninguém deve nada · **exige política** |
| `voided` + cancelado | 0 | **0** | `nuvemshop_anulado` | não há o que cobrar |
| `voided` + pedido **ativo** | 0 | total | `nuvemshop_pendente_apos_anulacao` | a peça saiu e o cliente ainda deve |
| `abandoned` | 0 | **0** | `nuvemshop_abandonado` | carrinho nunca virou compra |
| estado desconhecido | 0 | **0** | `nuvemshop_estado_desconhecido` | vira pergunta, não número |
| campo **ausente** | **0** | **0** | `indeterminado_site` | sem evidência de recebimento **nem** de dívida — vira pendência de conferência |

Três colunas sustentam isso: `vendas.pago`, `vendas.valor_recebido`
(`NULL` = ou tudo, ou nada; `0` = o recebido conhecido é zero) e
`vendas.cobravel`.

### Status ausente: ausência de informação permanece ausência

Corrigido em `f54434e`. A versão anterior punha o total no faturamento
quando `payment_status` não vinha — o que viola a regra principal: **sem
`payment_status` não existe evidência suficiente de recebimento.**

```
payment_status ausente
  → pago             = 0
  → valor_recebido   = 0
  → faturamento      = 0
  → cobravel         = 0
  → A Receber        = 0
  → pagamento_origem = indeterminado_site
```

Não vira pago, não vira pendente, não vira faturamento e não vira conta a
receber automaticamente. O pedido continua aparecendo em
`pedidosSemEstadoDePagamento` e no relatório de conferência financeira: ele
não some, vira pendência.

A mesma regra vale no backfill da migration para vendas de site que já
estejam no banco — e em `marquesa-db-prod` isso não move um centavo, porque
não há nenhuma (`externo_total = 0`).

### Nenhum valor é adivinhado

O valor parcial só é lido de estrutura **autodescritiva**: uma lista de
transações em que cada entrada diz o próprio estado e o próprio valor. Sem
ela a resposta é `null`, que é diferente de zero.

**Nenhum payload real da loja da Marquesa foi observado até 2026-09-05** —
produção nunca importou pedido de site, e não há payload gravado no
repositório nem em `sync_execucoes`. Portanto o caminho **provado hoje** é o
`pagamento_parcial_indeterminado`. O outro existe para o dia em que a
informação vier, e não muda nada enquanto não vier.

### Estoque não segue pagamento

`payment_status` **não** decide estoque. A baixa segue o PEDIDO, como sempre
seguiu: a peça saiu da gaveta quando o pedido foi feito, e isso não depende
de o dinheiro ter entrado — nem muda quando o pagamento muda. Provado:
`pending → paid` não grava movimento novo e o saldo não se move.

### O caminho de volta, que faltava

Um pedido entrava `pending` e ficava `pending` para sempre: a rodada
seguinte via o `externo_id` conhecido e pulava o pedido inteiro, então o PIX
que caía nunca virava faturamento. `atualizarPagamentoDaVenda` fecha isso e
escreve **só** pagamento — nunca estoque, item, total ou data.

Duas coisas ela se recusa a fazer sozinha:

- **desfazer faturamento já contado** (`paid → refunded`/`voided`): apagaria
  receita de mês fechado. Ela anuncia em `pedidosExigindoPolitica`;
- **sobrescrever pagamento que uma pessoa registrou** (`informado`).

### O relatório separa pelo motivo

`pedidosNaoPagos` (o cliente deve) · `pedidosParciais` (entrou parte) ·
`pedidosNaoCobraveis` (**ninguém** deve) · `pedidosExigindoPolitica` (falta
regra, não informação) · `pedidosSemEstadoDePagamento` ·
`pagamentosAtualizados`. Todos aparecem **também no dry-run**.

### Impacto retroativo: zero

Produção tem **0 pedidos de site** (`externo_total = 0`). Nenhuma migração
de pedido antigo é necessária. A regra passa a valer para o que entrar.

## 8. USO PRÓPRIO — STHEFANY MARQUES

### ⚠️ A linha aprovada não existe em produção

O registro aprovado como `APROVADO_PARA_RECLASSIFICACAO` foi descrito como:

```
id=39  02/07/2026  Sthefany Marques  sku=800003  1 peça  R$ 120  obs "uso pessoal"
```

**Esse registro é da bancada de teste, não de produção.** Ele veio do
semeador local `.tmp/seed-historico.mjs`, que fabrica linhas com SKUs da
faixa `800xxx` para exercitar o classificador. Em produção, `vendas_historico_itens`
não tem o id 39 com esse conteúdo, e não existe nenhuma linha da Sthefany
com SKU `800003`, valor R$ 120 ou observação "uso pessoal".

Registro a aprovação como recebida, mas **ela não tem alvo em produção**. O
que existe em produção é o conjunto abaixo.

### O que realmente existe: 32 linhas

Varredura somente leitura por nome (`sthefany`, `stefany`, `stephany`,
`marquesa`) e por observação (`uso próprio`, `pessoal`): **34 linhas**, das
quais **32 são "Sthefany Marques"**.

Elas **não** são um bloco homogêneo:

| Grupo | Linhas | Soma | Leitura |
|---|---|---|---|
| valor **R$ 0** | 12 | R$ 0 | compatível com retirada pessoal |
| valor **NULO** (ilegível na planilha) | 8 | — | sem data e sem valor: precisam da planilha original |
| valor **> 0** | 12 | **R$ 1.358** | parecem venda de verdade — reclassificar apagaria faturamento real |

Casos que exigem atenção individual:

- **id 1693** · 2025-05-10 · R$ 69 · obs `Sorteio (Feira Franceschini)` —
  isto é **brinde**, não uso próprio. Classe diferente.
- **8 linhas sem data** (ids 1489, 1490, 1845, 1846, 1849, 1850, 2515, 2556) —
  sem data não entram em recorte de período nenhum e não podem ser
  reclassificadas com confiança.
- **12 linhas com preço cheio** (R$ 49 a R$ 189) — a maioria com observação
  `Maleta`. Podem ser peça que ela levou e pagou, ou peça registrada no nome
  dela por falta de outro lugar. A planilha não diz.

### E o caso que prova por que nome não é identidade

Duas das 34 linhas são de **"Stephany Abreu"** — uma **pessoa diferente**,
cliente real da Feira Franceschini:

```
id=1907  2025-10-03  Stephany Abreu  sku=186033  R$ 59  Maleta (Feira Franceschini)
id=2374  2026-04-17  Stephany Abreu  sku=371010  R$ 94  Maleta (Feira Franceschini)
```

Uma busca por nome parecido as pegou junto. Uma reclassificação em massa por
nome teria transformado **R$ 153 de venda de uma cliente** em retirada
pessoal da dona. É exatamente o defeito que §2 existe para impedir.

**Estado: APROVADO_PARA_RECLASSIFICACAO não é aplicável às 32 linhas de
produção.** Cada uma continua exigindo decisão individual, e nada foi
aplicado.

---

## 9. OUTROS CANDIDATOS HISTÓRICOS A NÃO-VENDA

Varredura crua de texto (**não** é a classificação do módulo de auditoria):
**6 linhas**.

| Grupo | Linhas | Peças | Valor |
|---|---|---|---|
| brinde | 3 | 3 | R$ 298 |
| perda / inventário | 3 | 3 | R$ 0 |

Linha a linha:

| id | Data | Nome | SKU | Valor | Observação | Leitura |
|---|---|---|---|---|---|---|
| 1390 | 2025-04-27 | Josiane Dibbern | 424717 | R$ 189 | `Maleta (Brinde Ensaio de Foto) R$100` | **ambígua** — cliente real, valor R$ 189, observação fala em brinde de R$ 100. Não decidir sozinho |
| 2410 | 2026-05-08 | Brinde dia das mães | 129561 | R$ 109 | `Maleta (Feira Franceschini)` | brinde, confiança alta |
| 2500 | 2026-06-06 | Brinde festa junina | 187203 | R$ 0 | `Maleta` | brinde, confiança alta |
| 2646 | 2026-08-06 | Inventário | 171241 | R$ 0 | `PERDIDO` | perda, confiança alta |
| 2647 | 2026-08-06 | Inventário | 191909 | R$ 0 | **`ACHO QUE FOI VENDIDO`** | **confiança baixa** — a própria planilha está em dúvida |
| 2648 | 2026-08-06 | Inventário | 132721 | R$ 0 | `PERDIDO` | perda, confiança alta |

Impacto máximo se as três de confiança alta forem aplicadas: **−R$ 109** de
faturamento (as duas de inventário valem R$ 0). Nada foi aplicado.

---

## 10. BACKUP / TIME TRAVEL

| | |
|---|---|
| Bookmark atual | `000000a9-00000000-000050dc-dd8697b0b6cfe6f6abdf532b291cccf7` |
| Time travel | **disponível** (D1 mantém 30 dias) |
| Bookmark anterior (04/09) | `000000a8-00000000-000050dc-45852bd67a5189f4b1d80dec9b857f08` |

O bookmark avançou de `a8` para `a9` entre ontem e hoje: **produção está
recebendo escrita agora**. Capture um bookmark novo imediatamente antes de
executar as migrations — o desta página já estará velho.

Comando exato **para consultar** (somente leitura, seguro):

```bash
cd api
node node_modules/wrangler/bin/wrangler.js d1 time-travel info marquesa-db-prod
```

Comando de **restore** — destrutivo, exige autorização humana explícita,
**não executar sem decisão**:

```bash
node node_modules/wrangler/bin/wrangler.js d1 time-travel restore marquesa-db-prod \
  --bookmark=<o bookmark capturado ANTES das migrations>
```

Recomendação: além do time travel, gerar o dump antes do go-live conforme
`docs/BACKUP_RECOVERY.md`, mirando o binding `DB` → `marquesa-db-prod` — **não**
o nome `marquesa-db`, que é a cópia congelada da produção antiga.

---

## 11. RISCO OPERACIONAL Nº 1 — A COTA DO D1

Não é um bloqueio de prontidão, mas é o que pode derrubar o go-live no meio.

```
rows_read_24h: 5.550.651     limite do plano gratuito: 5.000.000/dia
```

Produção **estourou** a cota de leitura diária. Ontem (04/09) toda tentativa
de SELECT contra `marquesa-db-prod` voltou `code: 7500`. A auditoria desta
página só rodou porque a cota zerou às 00:00 UTC.

Causa provável: o Worker em produção está no corte de **2026-08-22**, ou
seja, **antes** do commit `91dad84` (2026-09-01), que corrigiu um `UPPER()`
num JOIN que lia ~1 milhão de linhas por clique. O código que resolve isso
está pronto e é justamente parte do que se quer publicar.

Consequências para o planejamento:

1. **Publicar é a cura, não o risco** — o deploy reduz a leitura por clique;
2. **execute o go-live logo após 00:00 UTC (21h BRT)**, com a cota cheia. Se
   a cota estourar no meio, os SELECTs de conferência param e você fica sem
   como verificar o que acabou de aplicar;
3. o `d1 info` e o `time-travel info` continuam funcionando mesmo com a cota
   esgotada — são o único par de olhos que sobra.

---

## 12. VEREDITO

# READY_FOR_GO_LIVE

| Critério | Situação |
|---|---|
| Banco e UUID corretos | ✅ provados antes de qualquer SELECT |
| Nenhuma migration PARCIAL | ✅ nenhuma |
| Estado de cada migration conhecido | ✅ 2 APLICADAS, 4 NAO_APLICADAS, artefato a artefato |
| A Receber preservável | ✅ 6 abertas · R$ 1.190,90 · a migration não toca a tabela |
| Nenhum problema de estoque | ✅ razão fecha, 0 negativos, 0 órfãos |
| Nenhuma inconsistência estrutural | ✅ 0 avisos, índice único provado, 0 homônimos |
| Migrations necessárias identificadas | ✅ 3, 4, 5 e 6, nesta ordem |

### Suíte, na revisão de 2026-09-05

| Teste | Resultado |
|---|---|
| `pagamento-nuvemshop-test.mjs` | **97 ok** — cenários A–M, puro |
| `sync-pagamento-test.mjs` | **40 ok** — loja de mentira, ponta a ponta |
| `migracao-pagamento-test.mjs` | 22 ok |
| `revisao-pre-golive-test.mjs` | 84 ok |
| `pacote-vendas-test.mjs` · `pacote-vendas-ui-test.mjs` | tudo ok |
| `sync-test` · `corte-pedidos` · `saude-sync` · `pendencias-nuvemshop` | passaram |
| `e2e.mjs` | ✓ TUDO PASSOU |
| `venda-desconto` · `vendas-historico` · `historico-operacoes` | passaram |
| `vendas-reconstrucao` · `categoria-nome` · `revendedora-nao-e-cliente` | Tudo certo |

Schema provado equivalente: **35 tabelas, 81 índices**, colunas idênticas
entre `api/schema.sql` do zero e o caminho das migrations.

**Nada foi aplicado. Aguardando autorização humana.**

### O que executar quando a autorização vier

```bash
# 1. capturar bookmark NOVO (o desta página estará velho)
cd api && node node_modules/wrangler/bin/wrangler.js d1 time-travel info marquesa-db-prod

# 2. backup conforme docs/BACKUP_RECOVERY.md, mirando o binding DB

# 3. as quatro migrations, nesta ordem, uma de cada vez, conferindo entre elas
#    (comandos exatos ficam para a autorização — nenhum é executado aqui)
#      api/migracao-vendas-pagamento.sql
#      api/migracao-vendas-cliente-ambiguo.sql
#      api/migracao-saidas-sem-faturamento.sql
#      api/migracao-garantias.sql

# 4. reconferir com o mesmo pré-voo — as seis devem sair APLICADA
cd api && npm run inventario:golive -- --alvos prod-nova

# 5. publicar Worker e dashboard
# 6. smoke test
```

### Depois do deploy, e só então

- `GET /api/historico/auditoria?usoProprio=Sthefany%20Marques` contra
  produção, para ver as 32 linhas com a classificação e a confiança do
  módulo — e decidir uma a uma;
- conferir a linha 1390 (Josiane Dibbern) e a 2647 (`ACHO QUE FOI VENDIDO`)
  com a planilha original;
- cadastrar os feriados, se quiser o prazo de garantia exato.

### Permanece BLOCKED

**Troca por peça mais barata.** Sem crédito, sem reembolso, sem saldo, sem
faturamento negativo. `diferenca_status = 'pendente_regra'` registra e para.
**Não bloqueia o go-live dos demais fluxos.**
