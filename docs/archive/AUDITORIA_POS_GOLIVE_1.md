# Auditoria pós-go-live 1 — mapa do que já existe

Levantamento feito **antes** de escrever qualquer linha, como o pacote exige.
Serve a dois propósitos: não duplicar estrutura que já existe, e deixar
escrito de onde cada número vem hoje — para o relatório de impacto poder
dizer o que mudou.

Data: 06/09/2026 · branch `claude/marquesa-operational-review-eztpzt`
Base: `main` em `d3a2740`.

---

## 1. Tabelas envolvidas (estado atual, sem mudanças)

| Tabela | O que guarda | Chaves que importam aqui |
|---|---|---|
| `produtos` | catálogo + `qtd` materializada | `sku` PK, `idx_produtos_sku_norm` |
| `movimentos` | **a razão contábil**; `produtos.qtd == SUM(movimentos.qtd)` | `variacao`, `variante_id`, `venda_id`, `tipo`, `origem` |
| `vendas` | venda de balcão, de acerto e do site na mesma tabela | `origem`, `data`, `data_pagamento`, `pago`, `valor_recebido`, `cobravel`, `cliente_ambiguo`, `externo_id` UNIQUE |
| `venda_itens` | itens da venda; **sem chave própria** | identidade = `(venda_id, sku, variante_id)` |
| `vendas_historicas` / `vendas_historico_itens` | a planilha reconstruída | `venda_historica_id`, `origem_linha` |
| `historico_operacoes` | **decisão financeira versionada** do histórico | `papel` (cliente/acerto/revisao), `cobranca_status`, `saldo_centavos`, `vencimento_em` |
| `historico_operacao_vendas` | liga operação histórica ↔ venda operacional (dedup) | `status_registro='ativa'` |
| `garantias` / `garantia_eventos` / `garantia_trocas` | §32 | `garantia_trocas.diferenca_status`, `diferenca_paga_em`, `movimento_id` |
| `maletas` / `maleta_itens` | consignação | PK `(maleta_id, sku)` — **não tem coluna de variação** |
| `produto_variacoes` | variações locais e da loja | PK `(sku, nome)`, `variante_id` UNIQUE |
| `loja_variantes` | espelho da Nuvemshop | `variante_id` PK, `sku_norm` |
| `kit_componentes` | **produto composto que já existe** | PK `(kit_sku, componente_sku)`, `qtd` |
| `saidas_sem_faturamento` | §31 | `tipo`, `estornada` |
| `reconciliacao_sessoes` / `_itens` | motor de reconciliação | `idx_rec_itens_unico` |

## 2. Onde cada número da tela nasce hoje

### Vendas → Lançamentos (cards)
`src/dashboard.tpl.html › renderVendas()` (linha ~7478).
Os três cards são calculados **no navegador**, a partir de `vendas`, que vem
de `GET /api/vendas?data=`. Essa rota lê **só a tabela `vendas`**.

Consequência — e é o defeito relatado: a data selecionada É respeitada, mas
o recorte é pobre. Linha de planilha daquele dia, acerto de revendedora e
troca de garantia não estão em `vendas`, então um dia histórico como
05/08/2026 mostra `R$ 0` mesmo tendo movimentação. O dado completo já existe
em `GET /api/vendas/dia` (`api/src/historico-dia.js › historicoDoDia`), que
a tela usa **só** para o bloco "Também aconteceu".

O card 3 ("Vindas de acerto") mostra `vivas.length - balcao.length` com o
subtítulo *"Peças que a revendedora não devolveu"* — que é a definição
errada: peça não devolvida ainda pode estar na maleta. E não mostra
comissão nem líquido.

### Painel → gráfico "Evolução por mês"
`analytics.js › evolucao()`, granularidade `mes`. Devolve
`pontos[{chave, faturamento, vendas, pecas}]`. A barra não é clicável e não
existe rota de "resumo de um mês".

### Painel → A receber
`analytics.js › painel()` → `historico-operacoes.js › listarContasReceber()`.
**Só lê `historico_operacoes` com `papel='cliente'`.** Não inclui:
- venda operacional com `pago=0` (existe `cobravel`, mas nada a lista);
- diferença de troca de garantia `diferenca_status='a_receber'`.

O campo de prazo é um `<input type="date">` cru com `onchange` →
`PATCH /api/contas-receber/:id/vencimento`. Formato do valor: `YYYY-MM-DD`.

### Clientes → perfil
`analytics.js › perfilCliente()`. O card "GASTOU" usa
`resumo.faturamento = Σ v.faturamento`, e `faturamento` no CTE é o **dinheiro
recebido** — não o valor comprado. `valor_total` (o comercial) e
`saldo_centavos` (o em aberto) já existem no CTE e já são devolvidos por
venda, mas não são somados no resumo.

### Pendências de variação
`variantes.js › variacoesParaRevisao()` — leitura pura. Motivos em
`IMPEDIMENTOS`: `duplicado`, `maleta`, `sem_reparticao`,
`variacao_nao_mapeada`, `sem_variante_id`.
O caso do print (SKU 647729) é `motivo: 'maleta'`.
Existe `POST /api/produtos/:sku/variacoes/distribuir` (reparte saldo), mas
**não existe** rota para dizer qual variação saiu numa venda ou numa maleta.

### Faturamento e a troca de garantia
`analytics.js › visaoGeral()` soma
`faturamento = Σ vendas pagas + Σ garantia_trocas.diferenca_valor_pago`
(recortado por `diferenca_paga_em`). Ou seja: **a diferença de troca já é
receita hoje**, por caminho próprio. Qualquer registro comercial novo da peça
trocada precisa não recontar esse mesmo dinheiro.

## 3. Endpoints existentes que o pacote toca

| Rota | Arquivo | Observação |
|---|---|---|
| `GET /api/vendas?data=` | `index.js:604` | só `vendas` |
| `GET /api/vendas/dia?data=` | `index.js:611` | todas as origens, já deduplicado |
| `POST /api/vendas` | `index.js:1540` | `registrarVenda` |
| `POST /api/vendas/:id/pagamento` | `index.js:617` | não mexe em estoque |
| `GET /api/painel/vendas` | `analytics.js › painel` | agrega tudo do Painel |
| `GET /api/contas-receber` | `index.js:702` | só histórico |
| `PATCH /api/contas-receber/:id/vencimento` | | versionado |
| `POST /api/garantias/:id/troca` | `garantias.js:272` | já devolve `criouVenda:false` |
| `POST /api/garantias/:id/troca/pagar` | `garantias.js:394` | única receita do módulo |
| `GET /api/variacoes/revisao` | `variantes.js:318` | leitura |
| `POST /api/produtos/:sku/variacoes/distribuir` | `variantes.js:464` | reparte saldo |

## 4. Estruturas reutilizáveis encontradas (não duplicar)

1. **`kit_componentes` + `movimentarKit`** já implementam "produto que baixa
   os componentes, não a si mesmo", com disponível calculado pelo mínimo.
   É a base do *Monte seu Colar* — o que falta é a composição **variável por
   venda**, não a ideia de composição.
2. **`historicoDoDia`** já une todas as origens comerciais de uma data, com
   deduplicação por `referencia`. Os cards de Lançamentos devem consumi-lo,
   não reimplementar o recorte.
3. **`cteVendas`** já expõe, por venda, os três números que o perfil precisa:
   `valor_total` (comprou), `faturamento` (pago) e `saldo_centavos` (em
   aberto). O perfil só não os soma.
4. **`garantia_trocas.diferenca_status`** já modela a pendência da diferença.
   Falta expô-la no A Receber e dar botão.
5. **`historico_reclassificacao`** já é o padrão "corrigir sem apagar, com
   status" — o mesmo formato serve para a correção de SKU.

## 5. Lacunas estruturais reais (exigem migration)

| # | Lacuna | Efeito hoje |
|---|---|---|
| L1 | `maleta_itens` não tem variação | pendência `motivo:'maleta'` não tem como ser resolvida pela maleta |
| L2 | `garantia_trocas` não aponta para uma venda | a peça nova não existe comercialmente |
| L3 | não há registro de correção de SKU | correção seria indistinguível de erro |
| L4 | não há composição por venda | *Monte seu Colar* não tem onde morar |
| L5 | não há tabela de pendências unificada | cada tipo mora num lugar |

Sobre L5: a decisão tomada foi **não** criar tabela nova. Uma pendência é
sempre derivável do estado (`variacoesParaRevisao`, `vendas.nuvemshop_status`,
`clientes_vinculo_revisao`, `garantia_trocas`, `historico_reclassificacao`).
Uma segunda tabela seria um segundo lugar para a mesma verdade divergir. A
Central de Pendências é uma **rota de leitura agregada** sobre as fontes que
já existem.

## 6. Índices que faltam (ver `docs/operations/D1_USAGE_AUDIT.md`)

Levantados na Fase B e listados lá com a medição.
