# Componente: Modais

Interrupção para confirmar, decidir ou editar sem perder o contexto.

Registre aqui apenas o padrão que **repete em mais de uma tela**. Se só existe
numa tela, ele mora no README daquela tela.

Imagens deste componente ficam nesta pasta, nome
`AAAA-MM-DD_modals_<variante>.<ext>`.

## Variantes

| Variante | Quando usar | Referência |
|---|---|---|
| seleção contextual de variação | um código identifica um produto, mas não uma única variação física; apresenta somente opções reais do sistema e permite registrar pendência `Não sei a variação` | [Estoque — seleção de variação](../../03-screens/estoque/images/2026-09-10_estoque-inventario-selecao-variacao_desktop_01.png) |

## Estados

| Estado | Aparência | Definido? |
|---|---|---|
| padrão | | não |
| foco (teclado) | | não |
| desabilitado | | não |
| carregando | | não |
| erro | | não |

## Regras de uso

- toda confirmação de escrita diz o efeito exato, com número;
- modal fecha por Esc e devolve o foco à origem;
- ação irreversível exige confirmação explícita, nunca só um botão colorido.

## Padrão mapeado — seleção de variação

Direção de consistência para Venda, Inventário, Maleta e Saída sem
faturamento, sem decisão de implementação nesta fase:

- preservar o código ou item que originou a interação;
- carregar apenas variações reais e suas identidades estáveis;
- exigir uma seleção explícita antes de confirmar;
- não oferecer texto livre nem inventar opção local;
- quando permitido pelo fluxo, `Não sei a variação` cria pendência de
  identificação e nunca movimento/ajuste sobre identidade ambígua;
- fechar devolve foco ao campo ou item de origem, sem perder o restante do
  lançamento.

O padrão de comportamento é compartilhável; a decisão futura pode realizá-lo
como modal, popover adaptativo ou outro componente coerente por dispositivo.
Não há componente React aprovado neste documento.

## Componente React equivalente hoje

— a preencher — Inventário do que já existe:
`docs/ui/COMPONENT-INVENTORY.md`. Não presuma que o padrão novo substitui o
componente atual; isso é decisão da fase 9 do Master Plan.
