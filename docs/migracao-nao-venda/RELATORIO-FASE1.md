# FASE 1 — Auditoria read-only: saídas que entraram como venda

**Data:** 2026-09-07 · **Branch:** `claude/nonrevenue-migration-prep`
**Fonte:** export do D1 de **PRODUÇÃO** (`marquesa-db-prod`,
`51dd629b-52dc-46d0-a1af-fa37f0a79533`), 41 tabelas / 2.93 MB, lido por
`wrangler d1 export DB --remote` e analisado num snapshot local.
**Nada foi escrito em produção.**

---

## 0. O nome está errado no pedido — e isso importa

O pedido fala em "Stephanie Marques". Em produção o cadastro é
**`Sthefany Marques`, cliente `#64`**. Não existe nenhum cadastro escrito
"Stephanie".

Isso não é detalhe ortográfico: existem **outros nove cadastros com sobrenome
Marques** que são clientes legítimas, e um cadastro `Stephany Abreu` que é
outra pessoa. Um filtro por `LIKE '%marques%'` ou `LIKE '%steph%'` pegaria
R$ 3.836,51 de venda real de terceiros. A migração tem que endereçar
**`cliente_id`**, nunca nome.

| Não tocar (clientes reais) | id | linhas | valor |
|---|---|---|---|
| Joyce Marques | 3 | 14 | R$ 1.601,00 |
| Gislene Marques | 96 | 9 | R$ 775,51 |
| Isadora Marques | 314 | 2 | R$ 549,00 |
| Graciele Marques | 164 | 4 | R$ 311,00 |
| Luca Marques | 250 | 4 | R$ 161,00 |
| Stephany Abreu | 195 | 2 | R$ 153,00 |
| Ana Victoria Barbosa Marques | 73 | 2 | R$ 148,00 |
| Leandro Marques | 312 | 2 | R$ 148,00 |
| Denise Marques | 130 | 2 | R$ 143,00 |

---

## 1. Onde os registros estão (e onde NÃO estão)

Os quatro cadastros existem em `clientes` e movimentam **apenas o histórico
importado de planilha**. Nenhum deles tem venda operacional.

| Cadastro | id | classe destino | linhas | peças | valor lançado | valor pago |
|---|---|---|---|---|---|---|
| Sthefany Marques | 64 | `uso_proprio` | 32 | 32 | R$ 1.358,00 | R$ 991,00 |
| Brinde dia das mães | 300 | `brinde` | 1 | 1 | R$ 109,00 | R$ 109,00 |
| Brinde festa junina | 311 | `brinde` | 1 | 1 | R$ 0,00 | R$ 0,00 |
| Inventário | 326 | `perda` | 3 | 3 | R$ 0,00 | R$ 0,00 |
| **TOTAL** | | | **37** | **37** | **R$ 1.467,00** | **R$ 1.100,00** |

- `vendas` (operacional, 19 linhas): **0 ligadas a esses cadastros.**
- `movimentos` ligados a essas vendas: **0.**
- `venda_itens`: **0.**
- Lote 1 da planilha está `revertido`; **todas** as 1.375 linhas vivas são do
  lote 2 (`importado`). Nenhuma linha dos alvos no lote revertido.

### O que sai de cada indicador

| Indicador | Hoje | Sai | Depois |
|---|---|---|---|
| Faturamento histórico (soma de `valor_pago`) | R$ 128.780,71 | **R$ 1.100,00** | R$ 127.680,71 |
| Vendas históricas (`classe='venda'`) | 711 | **30** | 681 |
| Peças vendidas | 1.391 | **34** | 1.357 |
| Vendas elegíveis a ticket médio | 681 | **17** | 664 |

O `Inventário` (#326) já está com `classe='ajuste'`: as 3 peças saem da
contagem de peças e do ranking de produtos, mas **R$ 0,00 sai do
faturamento** — esse dinheiro nunca esteve lá. Contar os R$ 1.467,00 como
"impacto no faturamento" seria exagerar em R$ 367,00.

---

## 2. Impacto em estoque: NENHUM — e isso é um número, não uma opinião

A importação histórica **não movimentou estoque**. Prova, do próprio dump de
produção:

```
origem=importacao      tipo=entrada        n=772  soma_qtd=+1507   (saldo inicial do catálogo)
origem=maleta          tipo=consignacao    n=471  soma_qtd=0
origem=acerto          tipo=devolucao      n=102  soma_qtd=0
origem=venda           tipo=venda          n=27   soma_qtd=-27
origem=reconciliacao   tipo=ajuste         n=25   soma_qtd=-28
...
(nenhum movimento com origem histórica)

SUM(produtos.qtd) = 1487   SUM(movimentos.qtd) = 1487   FECHA
SKUs divergentes: 0
```

**Consequência mandatória para a FASE 2:** reclassificar essas 37 linhas
**não pode criar movimento de estoque**. As peças nunca saíram por causa
delas; criar uma baixa agora inventaria 37 unidades a menos que nunca
existiram, e quebraria a razão contábil que hoje fecha exata.

Simetricamente, o rollback **não pode devolver peça ao estoque**.

---

## 3. Tabelas envolvidas

| Tabela | Papel | A migração escreve? |
|---|---|---|
| `vendas_historico_itens` (1.375) | as 37 linhas de origem | **não** — preservadas intactas |
| `vendas_historicas` (714) | 30 cabeçalhos afetados | **não** |
| `vendas_historico_lotes` (2) | lote 2 é o válido | não |
| `clientes` (346) | os 4 cadastros | não (ver §5) |
| `historico_reclassificacao` (**0**) | marca "isto não é venda" | **sim** — 37 linhas |
| `saidas_sem_faturamento` (**0**) | a saída propriamente dita | **sim** — 37 linhas, `estoque_refletido=0` |
| `movimentos` (1.428) | razão contábil | **não** — jamais |
| `produtos` (772) | estoque físico | **não** — jamais |
| `vendas` / `venda_itens` | operacional | **não** — nada ligado |
| `historico_operacoes` (36) / `historico_operacao_vendas` (10) | exclusão de duplicatas | não — mecanismo paralelo, não colide |

---

## 4. O trabalho do Codex já cobre isto — e já está em produção

Descoberta que muda o plano: **as duas tabelas já existem no D1 de
produção**, vazias, e o filtro que as respeita já está em `main`.

- `api/migracao-saidas-sem-faturamento.sql` — **aplicada em PROD**.
- `api/src/auditoria-historico.js` — classificador seco + `aplicar` + `desfazer`.
- `api/src/saidas.js` — registro/estorno/listagem das saídas.
- Rotas: `GET /api/historico/auditoria`, `POST /api/historico/reclassificar`,
  `GET /api/historico/reclassificar`, `DELETE /api/historico/reclassificar/:id`.
- Exclusão das métricas, por `rc.status = 'aplicada'`:
  `api/src/analytics.js:128`, `api/src/analytics.js:258`,
  `api/src/historico-dia.js:157`.

**Portanto não há migration nova a escrever.** A "migração" é popular
`historico_reclassificacao` com 37 decisões — pela rota oficial, que já é
idempotente (recusa item já decidido), auditável (`motivo`, `decidido_por`,
`decidido_em`) e reversível (`DELETE`).

---

## 5. Três decisões que são suas, não minhas

1. **`h#1693` — Sthefany, 2025-05-10, R$ 69,00 pago, obs `Sorteio (Feira
   Franceschini)`.** Sorteio é brinde para quem ganha, não retirada pessoal.
   Uso próprio, brinde, ou venda real? Marcado `confianca: media`.
2. **`h#2647` — Inventário, 2026-08-06, obs `ACHO QUE FOI VENDIDO`.** A
   planilha está em dúvida; o sistema não resolve a dúvida dela. Marcado
   `confianca: baixa`.
3. **Os 4 cadastros ficam em `clientes`?** Recomendação: **sim**. Apagá-los
   quebraria `vendas_historico_itens.cliente_id` das linhas preservadas e
   destruiria rastreabilidade. Eles simplesmente param de aparecer no ranking
   quando nenhuma venda os alcança.

**Fora dos alvos, suspeitas que NÃO migrei** (são de clientes reais; só
sinalizo):

| Item | Data | Cliente | Valor | Observação |
|---|---|---|---|---|
| `h#1390` | 2025-04-27 | Josiane Dibbern (#29) | R$ 189,00 | `Maleta (Brinde Ensaio de Foto) R$100` |
| `h#1506` | 2025-05-02 | Ana Victoria (#73) | R$ 69,00 | `Maleta (Ganhadora do Sorteio Dia das Mães)` |
| `h#1522` | 2025-05-02 | Ana Victoria (#73) | R$ 79,00 | `Maleta (Ganhadora do Sorteio Dia das Mães)` |

---

## 6. Drift DEV × PROD × repositório

| | Tabelas | Tamanho | `saidas_sem_faturamento` |
|---|---|---|---|
| **PROD** (`marquesa-db-prod`) | **41** | 2.93 MB | **existe**, 0 linhas |
| DEV (`marquesa-db-dev`) | 29 | 2.42 MB | **não existe** |

PROD tem 12 tabelas que o DEV não tem, entre elas `garantias`,
`garantia_eventos`, `garantia_trocas`, `historico_operacoes`,
`historico_operacao_vendas`, `historico_reclassificacao`,
`saidas_sem_faturamento`, `personalizacao_modelos`, `personalizacao_opcoes`,
`venda_personalizacoes`, `venda_personalizacao_itens`,
`maleta_item_variacoes`, `venda_item_correcoes`, `feriados`.

**DEV não serve como referência de estado.** Qualquer teste desta migração
tem que ser derivado do schema de PROD.

---

## 7. O que ainda bloqueia

`.claude/hooks/protect-production.mjs:441` nega `d1 execute|migrations|export`
sempre que o comando **nomeia** `marquesa-db-prod`, antes de olhar se o SQL é
leitura. O bloco logo abaixo (linha 455, caminho do *binding*) já libera
`SELECT/WITH/PRAGMA/EXPLAIN` via `--command` sem `--file`. Efeito invertido:
nomear o alvo é mais bloqueado do que não dizer banco nenhum.

O patch proposto está em [`patch-hook-leitura-prod.md`](patch-hook-leitura-prod.md).
Não foi aplicado: o classificador do harness recusa que um agente reescreva
sozinho o próprio hook de segurança, e essa recusa está certa.
