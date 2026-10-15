# Componente: Gráficos

Representação visual de série ou composição.

Registre aqui apenas o padrão que **repete em mais de uma tela**. Se só existe
numa tela, ele mora no README daquela tela.

Imagens deste componente ficam nesta pasta, nome
`AAAA-MM-DD_charts_<variante>.<ext>`.

## Variantes

| Variante | Quando usar | Referência |
|---|---|---|
| barras por mês | comparar evolução mensal e permitir selecionar um mês | [Painel de Vendas](../../03-screens/vendas/images/2026-09-10_vendas_desktop_02.png) |
| barras horizontais de ranking | comparar categorias dentro do período | [Análise detalhada](../../03-screens/vendas/images/2026-09-10_vendas_desktop_01.png) |
| barra de composição | mostrar participação por origem sem esconder a tabela de valores | [Análise detalhada](../../03-screens/vendas/images/2026-09-10_vendas_desktop_01.png) |

## Estados

| Estado | Aparência | Definido? |
|---|---|---|
| padrão | proporção preservada, rótulos legíveis e valor exato disponível | sim, conceito |
| hover/foco | destaca o ponto e mostra período, valor e contagens associadas | sim, conceito |
| selecionado | contorno e marcador persistentes; conteúdo inferior passa a refletir a seleção | sim, Vendas |
| foco (teclado) | cada barra selecionável recebe foco visível e ação equivalente ao clique | sim, conceito |
| desabilitado | | não |
| carregando | | não |
| erro | | não |

## Regras de uso

- gráfico não substitui o número: valor exato acessível sempre;
- período exibido é rotulado;
- dado parcial ou estimado é marcado como tal — ver `states.md` da tela.
- gráfico não é achatado para caber na primeira dobra; deve manter altura e
  proporção legíveis, e a página pode rolar verticalmente;
- redimensionamento reduz quantidade/densidade de rótulos antes de deformar a série;
- clique nunca é a única forma de seleção: teclado e controle explícito devem
  oferecer o mesmo resultado;
- escala, unidade e critério da série ficam visíveis; barras decorativas sem
  eixo ou valor acessível não são aceitas.

## Componente React equivalente hoje

— a preencher — Inventário do que já existe:
`docs/ui/COMPONENT-INVENTORY.md`. Não presuma que o padrão novo substitui o
componente atual; isso é decisão da fase 9 do Master Plan.
