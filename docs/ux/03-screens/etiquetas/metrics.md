# Métricas e cálculos — Etiquetas

| Indicador | Fórmula | Fonte do dado | Unidade | Confirmado? |
|---|---|---|---|---|
| produtos selecionados | contagem de SKUs/itens distintos incluídos no lote | seleção atual | produtos | sim |
| etiquetas | soma das quantidades dos produtos selecionados | seleção atual | etiquetas | sim |
| capacidade por folha | número de posições do modelo de papel ativo | configuração do papel | posições | sim; valor depende do modelo |
| folhas necessárias | teto de `etiquetas ÷ capacidade utilizável por folha` | seleção + papel + posições indisponíveis | folhas | conceito confirmado |
| posições ocupadas | posições efetivamente compostas na folha/página atual | composição da prévia | posições | sim |
| posições disponíveis | capacidade da página menos posições ocupadas e posições desativadas | composição da prévia | posições | conceito confirmado |
| produtos do lote histórico | contagem de itens distintos gravados no lote | histórico | produtos | sim |
| etiquetas do lote histórico | soma das quantidades gravadas nos itens do lote | histórico | etiquetas | sim |

## Regras de cálculo

- quantidade nunca é inferida pelo tamanho visual da prévia;
- uma etiqueta conta uma vez por posição realmente composta;
- folhas adicionais mantêm tamanho e espaçamento do modelo; a interface não
  reduz a escala para caber tudo em uma página;
- o exemplo Pimaco A4349 possui 126 posições, mas esse número pertence ao
  modelo de papel, não a uma constante global;
- se houver escolha de posição inicial ou posições já usadas, somente as
  posições utilizáveis entram no cálculo da primeira folha;
- reimpressão pertence a um novo lote e não aumenta os totais do lote original.

## Métricas que não pertencem a esta tela

Impressão e reimpressão não são movimento de estoque, venda, pagamento ou
comissão. Nenhuma dessas grandezas é recalculada por este painel.
