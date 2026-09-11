# Métricas e cálculos — Vendas

Número na tela sem fórmula escrita é número que ninguém consegue auditar depois.
Uma linha por indicador.

| Indicador | Fórmula | Fonte do dado | Janela de tempo | Arredondamento | Confirmado? |
|---|---|---|---|---|---|
| Faturamento do período | soma do dinheiro efetivamente recebido cuja data de pagamento cai no período | vendas e demais fontes comerciais elegíveis | preset ou intervalo geral | moeda em centavos; exibição com 2 casas | sim |
| Faturamento neste mês | mesma regra do faturamento, limitada ao mês corrente | mesmas fontes do faturamento | mês corrente | moeda em centavos; 2 casas | sim |
| A receber no mês | soma das contas abertas, reais e cobráveis com vencimento no mês | três fontes canônicas de recebíveis | mês exibido | moeda em centavos; 2 casas | sim |
| Vendas | contagem de vendas elegíveis pela data da venda | vendas de balcão, acertos e site | mês/intervalo selecionado | inteiro | sim, conceito |
| Peças vendidas | soma das quantidades elegíveis pela data da venda | itens comerciais | mês/intervalo selecionado | inteiro | sim, conceito |
| Clientes atendidas | contagem distinta de clientes com venda elegível | identidade de cliente das vendas | mês/intervalo selecionado | inteiro | sim |
| Produtos mais vendidos | ranking ainda a definir: peças, faturamento ou outro critério | itens e catálogo | período geral | depende da métrica | não |
| Categorias mais vendidas | distribuição por categoria; denominador da participação ainda a definir | itens e catálogo | período/mês selecionado | peças inteiras e percentual | parcial |
| Origem das vendas | distribuição por origem, com peças e valores; regra exata da participação ainda a definir | vendas por origem | período geral | peças inteiras, moeda e percentual | parcial |
| Maior venda | maior valor elegível; elegibilidade e eixo de data ainda a definir | vendas | mês selecionado | moeda em centavos; 2 casas | não |
| Ticket médio | fórmula e população elegível precisam ser confirmadas para esta visão | vendas | mês selecionado | moeda em centavos; 2 casas | não |
| Dia mais forte | critério ainda a definir: faturamento, valor vendido, vendas ou peças | analytics diário | mês selecionado | data | não |
| Total vendido no período | soma do preço efetivamente cobrado das vendas elegíveis pela data da venda | vendas e itens | período do histórico | moeda em centavos; 2 casas | sim, conceito |
| Quantidade de vendas no histórico | contagem de vendas elegíveis, sem saídas não comerciais | vendas | período do histórico | inteiro | sim, conceito |
| Peças vendidas no histórico | soma das quantidades das vendas elegíveis | itens de venda | período do histórico | inteiro | sim, conceito |
| A receber no histórico filtrado | — ainda não definido: dívidas das vendas exibidas ou vencimentos dentro do período — | contas a receber | período do histórico | moeda em centavos; 2 casas | não |
| Brindes | quantidade de saídas e valor/impacto ainda a definir | saídas sem faturamento | período filtrado | inteiro + moeda | parcial |
| Uso próprio | quantidade de saídas e valor/impacto ainda a definir | saídas sem faturamento | período filtrado | inteiro + moeda | parcial |
| Perdas | quantidade de saídas e valor/impacto ainda a definir | saídas sem faturamento | período filtrado | inteiro + moeda | parcial |
| Sorteios | quantidade de saídas e valor/impacto ainda a definir | saídas sem faturamento | período filtrado | inteiro + moeda | conceito confirmado; ausente no mockup |
| Impacto de saída sem faturamento | fórmula aberta; não assumir preço de tabela como custo/prejuízo | saídas + dado econômico ainda a definir | dia/período | moeda em centavos; 2 casas | não |
| Valor da venda | soma dos preços efetivamente cobrados nos itens da venda | venda e itens congelados | por venda | moeda em centavos; 2 casas | sim |
| Desconto unitário do item | `preço de tabela congelado − preço final cobrado` | item da venda | por grupo de unidades com mesmo SKU, preço e motivo | moeda em centavos; percentual apenas derivado para exibição | sim · regra vigente |
| Subtotal da linha | `quantidade × preço final unitário` | item da venda | por linha | moeda em centavos; 2 casas | sim · Gustavo, 10/09/2026 |
| Desconto total da venda | soma de `quantidade × desconto unitário` dos itens elegíveis | itens da venda | por venda | moeda em centavos; 2 casas | sim · conceito |
| Valor recebido da venda | soma dos lançamentos de recebimento com estado pago | recebimentos da venda | por venda | moeda em centavos; 2 casas | sim · Gustavo, 10/09/2026 |
| Valor a receber da venda | `máximo(valor da venda − valor recebido, 0)` | venda + recebimentos pagos | por venda | moeda em centavos; 2 casas | sim · Gustavo, 10/09/2026 |
| Status de pagamento | recebido `= 0`: A RECEBER; `0 < recebido < total`: PARCIAL; recebido `>= total`: PAGO | valores derivados da venda | estado atual | sem arredondamento; cálculo em centavos | sim · Gustavo, 10/09/2026 |
| Valor pendente planejado | soma dos lançamentos pendentes | recebimentos/parcelas pendentes | por venda | moeda em centavos; 2 casas | sim, operacional |

## Regras de cálculo que valem para todos os indicadores

- venda cancelada e item corrigido **não** contam como receita;
- categoria não-receita (brinde, sorteio, perda, uso interno) não entra em
  faturamento — ver `docs/domains/`;
- consignação em maleta não é venda até o acerto;
- saldo de estoque vem da razão (`SUM(movimentos.qtd)`), nunca de contagem
  paralela;
- quando duas fontes discordam, a tela mostra **os dois números** e sinaliza a
  divergência. Não escolhe uma.
- o mesmo período pode produzir dois recortes legítimos: faturamento por data
  de pagamento; vendas, peças e clientes por data de venda. A interface deve
  explicar isso junto aos números, sem sugerir que precisam fechar entre si.
- `Total vendido` não é sinônimo de faturamento: pertence à data da venda e usa
  o preço cobrado; faturamento pertence à data do recebimento;
- uma saída sem faturamento nunca entra em quantidade de vendas, peças vendidas,
  ticket ou faturamento;
- preço de tabela, custo e prejuízo são medidas diferentes. Enquanto a fonte de
  `Impacto estimado` não for definida, o indicador não pode ser calculado.
- lançamento pendente não entra em valor recebido nem em faturamento;
- cada lançamento pago entra no faturamento pela sua data efetiva, mesmo quando
  pertence à mesma venda ou a outra parcela;
- forma de pagamento não muda a fórmula do recebido; taxas e valor líquido são
  assunto ainda aberto;
- todos os cálculos usam centavos inteiros, sem comparar moeda por ponto flutuante.
- separar unidades do mesmo SKU em linhas com preços diferentes não altera a
  quantidade total de peças; muda apenas a composição financeira rastreável;
- linhas do mesmo SKU só podem ser consolidadas quando preço final e motivo de
  desconto também forem iguais.

## Indicadores recusados

Indicador que foi pedido e decidimos **não** exibir, com o motivo. Evita que a
mesma ideia volte a cada rodada.

| Indicador | Por que não | Data |
|---|---|---|
| | | |
