# Métricas e cálculos — Clientes

Número na tela sem fórmula escrita é número que ninguém consegue auditar depois.
Uma linha por indicador.

| Indicador | Fórmula | Fonte do dado | Janela de tempo | Arredondamento | Confirmado? |
|---|---|---|---|---|---|
| | | | | | |

## Regras de cálculo que valem para todos os indicadores

- venda cancelada e item corrigido **não** contam como receita;
- categoria não-receita (brinde, sorteio, perda, uso interno) não entra em
  faturamento — ver `docs/domains/`;
- consignação em maleta não é venda até o acerto;
- saldo de estoque vem da razão (`SUM(movimentos.qtd)`), nunca de contagem
  paralela;
- quando duas fontes discordam, a tela mostra **os dois números** e sinaliza a
  divergência. Não escolhe uma.

## Indicadores recusados

Indicador que foi pedido e decidimos **não** exibir, com o motivo. Evita que a
mesma ideia volte a cada rodada.

| Indicador | Por que não | Data |
|---|---|---|
| | | |
