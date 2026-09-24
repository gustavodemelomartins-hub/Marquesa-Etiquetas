# Componente: Cards

Bloco de conteúdo agrupado — resumo, indicador, item de lista rica.

Registre aqui apenas o padrão que **repete em mais de uma tela**. Se só existe
numa tela, ele mora no README daquela tela.

Imagens deste componente ficam nesta pasta, nome
`AAAA-MM-DD_cards_<variante>.<ext>`.

## Variantes

| Variante | Quando usar | Referência |
|---|---|---|
| opção selecionável | escolher um modo mutuamente exclusivo, com ícone, título, explicação curta, rádio e estado ativo | Vendas: tipos de lançamento e históricos |
| indicador resumido | mostrar uma métrica e sua unidade dentro do mesmo conjunto filtrado | Vendas: históricos; Etiquetas: resumo da impressão |
| opção visual de produto | escolher modelo/componente com imagem, SKU, disponibilidade e seleção | Monte seu Colar |

## Estados

| Estado | Aparência | Definido? |
|---|---|---|
| padrão | | não |
| foco (teclado) | | não |
| desabilitado | | não |
| carregando | | não |
| erro | | não |

## Regras de uso

- card que mostra número segue as regras de [metrics](../../03-screens/dashboard/metrics.md);
- card não esconde dado essencial atrás de hover.
- opção selecionável usa rádio e borda/ícone, nunca somente cor;
- conjunto de opções mutuamente exclusivas permite navegação por teclado;
- card de indicador não inventa unidade ou fórmula: título precisa dizer
  `vendido`, `recebido`, `a receber`, `peças` ou a grandeza exata;
- cards de motivos e estados usam cor sem transformar bordô em cor de todo texto.

## Componente React equivalente hoje

— a preencher — Inventário do que já existe:
`docs/ui/COMPONENT-INVENTORY.md`. Não presuma que o padrão novo substitui o
componente atual; isso é decisão da fase 9 do Master Plan.
