# Preview do backfill no DEV da V2 — 23/09/2026

**Banco:** `marquesa-db-staging-v2` (`db76e50a-…`), a cópia da operação que
o `/v2/` usa.
**Nada foi escrito.** Este documento é a saída de
[`preview-no-d1.py`](preview-no-d1.py), que só lê.

> O manifesto foi gerado em 07/09/2026 contra um dump de produção. Aplicar
> uma decisão de duas semanas atrás sobre um banco que mudou seria escrever
> sobre um número que ninguém conferiu. Este preview existe para que isso
> não aconteça.

---

## 1. O manifesto continua válido

| | |
|---|---|
| itens do manifesto encontrados | **37 de 37** |
| sumidos | nenhum |
| divergentes (cliente, quantidade ou valor) | **nenhum** |

Os 37 `vendas_historico_itens.id` do manifesto existem no DEV com o mesmo
`cliente_id`, a mesma `qtd` e o mesmo `valor_total`. A auditoria da FASE 1
continua descrevendo este banco.

## 2. O que sai

| | |
|---|---|
| linhas | 37 |
| peças | 37 |
| valor lançado | R$ 1.467,00 |
| **valor pago — o que sai do faturamento** | **R$ 1.100,00** |

Por classe proposta: `uso_proprio` 32 · `brinde` 2 · `perda` 3.

A diferença de R$ 367,00 entre lançado e pago é a parte que **nunca esteve
no faturamento**. Contar os R$ 1.467,00 como impacto seria exagerar o
efeito da migração nesse valor.

## 3. Antes e depois

| Indicador | Antes | Depois |
|---|---:|---:|
| Faturamento histórico | R$ 128.780,71 | **R$ 127.680,71** |
| Peças no histórico importado | 1.394 | **1.357** |
| Cabeçalhos em `vendas_historicas` | 714 | **714** |

Os cabeçalhos não mudam: a exclusão dos indicadores é feita por **filtro**
(`rc.status = 'aplicada'` em `analytics.js` e `historico-dia.js`), não por
remoção. O histórico original fica inteiro, e é isso que permite desfazer.

## 4. O estoque não se mexe — e isso é medido

| | |
|---|---|
| movimentos de origem histórica | **0** |
| razão hoje | `SUM(produtos.qtd)` = `SUM(movimentos.qtd)` = **1481** ✅ |

A importação histórica nunca movimentou estoque. As 37 peças **não saíram
da gaveta por causa destas linhas**, e criar baixa agora inventaria 37
unidades a menos que ninguém tirou. Simetricamente, o rollback não devolve
peça nenhuma.

`migrar-nao-venda.mjs` respeita isso: ele grava decisões pela rota oficial
`POST /api/historico/reclassificar`, que cria a linha em
`saidas_sem_faturamento` com `estoque_refletido = 0` — a coluna que diz
"esta linha CLASSIFICA uma saída que já aconteceu; ela não é dona da baixa".

**Se este número deixar de ser 0, a migração para.** Significaria que algo
mudou desde a FASE 1, e o pressuposto inteiro precisaria ser refeito.

## 5. Destino

| Tabela | Hoje | Depois |
|---|---:|---:|
| `historico_reclassificacao` | 0 | +37 |
| `saidas_sem_faturamento` | 0 | +37 |

As duas tabelas já existem em produção e no DEV, vazias, e as rotas que as
escrevem já estão em `main`. **Não há migration nova a escrever.**

## 6. Os dois que ficam de fora

35 dos 37 são aplicáveis sem decisão humana. Dois não:

| Item | Data | Cadastro | Valor | Observação original | Por quê |
|---|---|---|---:|---|---|
| `h#1693` | 2025-05-10 | Sthefany Marques | R$ 69,00 | `Sorteio (Feira Franceschini)` | Sorteio é prêmio para quem ganha, não retirada pessoal. `brinde`/`sorteio` ou `uso_proprio`? |
| `h#2647` | 2026-08-06 | Inventário | R$ 0,00 | `ACHO QUE FOI VENDIDO` | A própria planilha está em dúvida. O sistema não resolve a dúvida dela. |

`migrar-nao-venda.mjs` só os inclui com `--incluir-duvidosos`, e esse
sinalizador **não deve ser usado** sem uma decisão escrita.

## 7. Os IDs afetados

```
1484 1489 1490 1529 1539 1693 1845 1846 1849 1850 1863 1866
2139 2140 2141 2151 2152 2153 2184 2253 2344 2345 2376 2379
2410 2418 2495 2500 2514 2515 2525 2556 2598 2646 2647 2648
2651
```

## 8. O que ainda falta para aplicar

O `migrar-nao-venda.mjs` chama a API, não o banco — de propósito, porque é
na API que as regras do §30 moram. Ele precisa de:

```
node docs/migracao-nao-venda/migrar-nao-venda.mjs \
  --api https://marquesa-api-staging-v2.marquesaasemijoias.workers.dev \
  --chave <API_KEY do staging-v2>
```

Sem `--aplicar` ele é **seco**: mostra o que faria e sai. A chave do
`staging-v2` não está neste ambiente, e por isso **a aplicação no DEV não
foi executada** — o preview acima é tudo o que dá para provar sem ela.

Ordem de execução, quando a chave existir:

1. seco (sem `--aplicar`) — confere o recorte;
2. `--aplicar` — grava as 35 de confiança alta;
3. `conferencia.sql` — compara com o ANTES desta página;
4. abrir `/v2/#/estoque/saidas` — as 37 aparecem como `Classificação`,
   com custo "Não informado";
5. conferir que o faturamento caiu exatamente R$ 1.100,00.

Rollback: `--desfazer --confirmo`. Ele apaga as decisões e **não devolve
peça nenhuma ao estoque**, porque nenhuma saiu por causa delas.

## 9. Riscos

| Risco | Estado |
|---|---|
| Criar movimento de estoque indevido | **impossível pela rota**: `estoque_refletido = 0` e o CHECK do banco proíbe `movimento_id` nessa linha |
| Rodar duas vezes | **inofensivo**: a rota recusa item já decidido, e devolve 207 com "já decidida" |
| Apagar evidência | **não apaga**: `vendas_historico_itens` e `vendas_historicas` não são escritas |
| Pegar cliente errada | **endereçado por `cliente_id`**, nunca por nome — há nove cadastros "Marques" legítimos, com R$ 3.836,51 de venda real |
| Duplicar lançamento financeiro | não há lançamento: a exclusão é por filtro sobre `rc.status = 'aplicada'` |
| Aplicar em PROD por engano | o script exige `--api` explícito; nenhum endereço de produção aparece em lugar nenhum desta pasta |
