# Componente: Badges

Marcador curto de estado — situação de pedido, divergência, categoria.

Registre aqui apenas o padrão que **repete em mais de uma tela**. Se só existe
numa tela, ele mora no README daquela tela.

Imagens deste componente ficam nesta pasta, nome
`AAAA-MM-DD_badges_<variante>.<ext>`.

## Variantes

| Variante | Quando usar | Referência |
|---|---|---|
| estado do pipeline de catálogo | indicar um dos dez estados fechados de preparação/aprovação/publicação | [Catálogo — estados](../../03-screens/catalogo/states.md#pipeline-de-publicação--conjunto-fechado) |
| falta humana | nome, categoria, preço, quantidade ou foto podem ser resolvidos pela operação | [Catálogo — dimensões](../../03-screens/catalogo/rules.md#falta-bloqueio-e-presença) |
| bloqueio do sistema | `sem_r2`, `sem_preparador` ou `foto_nao_preparada`; nunca parece checkbox humano | [Catálogo — dimensões](../../03-screens/catalogo/rules.md#falta-bloqueio-e-presença) |
| presença observada na loja | informar “Está na loja” sem alegar “Publicamos” | [Catálogo — estados](../../03-screens/catalogo/states.md#dimensões-simultâneas-por-produto) |

## Estados

| Estado | Aparência | Definido? |
|---|---|---|
| padrão | | não |
| foco (teclado) | | não |
| desabilitado | | não |
| carregando | | não |
| erro | | não |

## Regras de uso

- cor nunca é o único portador do significado; sempre acompanha texto;
- o conjunto de badges de um domínio é fechado e listado no `rules.md` da tela.
- origem/canal, motivo da saída, estado operacional e estado financeiro são
  dimensões diferentes; não reutilizar o mesmo badge como se fossem sinônimos;
- `Concluída` não substitui `Paga`, e `A receber` não é estado operacional da
  venda;
- brinde, uso próprio, perda e sorteio têm texto e ícones próprios; ajuste de
  inventário não vira motivo de saída por semelhança de cor.
- falta humana, bloqueio de infraestrutura, presença na loja e estado do
  pipeline são dimensões diferentes; não usar um badge para substituir outra;
- `estadoObservado: true` usa linguagem de presença, não de autoria da
  publicação;
- `aprovacaoInvalidada` acompanha explicação e ação de revisar novamente; não
  aparece como falha técnica.

## Componente React equivalente hoje

— a preencher — Inventário do que já existe:
`docs/ui/COMPONENT-INVENTORY.md`. Não presuma que o padrão novo substitui o
componente atual; isso é decisão da fase 9 do Master Plan.
