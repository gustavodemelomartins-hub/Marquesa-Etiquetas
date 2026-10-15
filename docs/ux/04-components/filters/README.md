# Componente: Filtros

Recorte do que a tabela ou lista mostra.

Registre aqui apenas o padrão que **repete em mais de uma tela**. Se só existe
numa tela, ele mora no README daquela tela.

Imagens deste componente ficam nesta pasta, nome
`AAAA-MM-DD_filters_<variante>.<ext>`.

## Variantes

| Variante | Quando usar | Referência |
|---|---|---|
| período com presets | intervalo livre combinado a Hoje, 7, 30 e 90 dias | históricos de vendas e saídas |
| busca + facetas | texto combinado a canal, tipo, pagamento, estado, motivo ou pessoa | históricos e filas |

## Estados

| Estado | Aparência | Definido? |
|---|---|---|
| padrão | | não |
| foco (teclado) | | não |
| desabilitado | | não |
| carregando | | não |
| erro | | não |

## Regras de uso

- filtro ativo é visível sem abrir menu;
- resultado vazio por filtro é estado próprio, distinto de `vazio`;
- filtro não pode alterar dado, só a visão.
- cards, tabela, paginação, rodapé e exportação usam exatamente o mesmo conjunto
  filtrado;
- limpar filtros restaura um padrão declarado pela tela, não um intervalo
  silenciosamente diferente;
- abrir uma lista por `Ver todas` preserva o contexto de origem até a pessoa
  escolher outro período;
- exportação não é filtro e deve informar formato e alcance antes de começar.

## Componente React equivalente hoje

— a preencher — Inventário do que já existe:
`docs/ui/COMPONENT-INVENTORY.md`. Não presuma que o padrão novo substitui o
componente atual; isso é decisão da fase 9 do Master Plan.
