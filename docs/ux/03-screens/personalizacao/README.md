# Tela: Personalização

| | |
|---|---|
| Estado do material | recebendo |
| Última atualização | 10/09/2026 |
| Referências recebidas | 1 mockup próprio, dentro do fluxo de Vendas |
| Existe hoje no legado? | parcial — modelos de Monte seu Colar |
| Existe hoje no React? | ver [07-mapping/frontend-feature-map.md](../../07-mapping/frontend-feature-map.md) |

> Esta pasta é documental. Nada aqui autoriza implementação; ver
> [00-index.md](../../00-index.md).

## Objetivo da tela

Configurar um Monte seu Colar dentro do rascunho de venda: escolher o modelo,
personalizar cada posição com componentes físicos disponíveis e adicionar a
composição fechada à venda.

## Para quem

Sthefany Marques e demais perfis autorizados a lançar vendas.

## Conteúdo da pasta

| Arquivo | Guarda |
|---|---|
| `images/` | prints, mockups e protótipos desta tela |
| [states.md](states.md) | estados de UI: vazio, carregando, erro, parcial, sucesso |
| [rules.md](rules.md) | regra de negócio que a tela precisa respeitar |
| [metrics.md](metrics.md) | número exibido e como é calculado |
| [api-needs.md](api-needs.md) | dado que a tela precisa e que a API ainda não dá |
| [open-questions.md](open-questions.md) | decisão aberta, específica desta tela |

Inspiração externa deste domínio: [02-references/personalizacao/](../../02-references/personalizacao/).

## Blocos da tela

Preencher quando houver mockup. Um bloco por seção visível.

| # | Bloco | O que mostra | Origem do dado | Referência |
|---|---|---|---|---|
| 1 | modelos prontos | imagem, nome, SKU comercial, preço e disponibilidade | personalização / catálogo / estoque | [mockup](../vendas/images/2026-09-10_vendas-monte-seu-colar_desktop_01.jpg) |
| 2 | posições da composição | opções compatíveis com imagem, SKU e disponibilidade | componentes físicos / estoque | [mockup](../vendas/images/2026-09-10_vendas-monte-seu-colar_desktop_01.jpg) |
| 3 | resumo da ação | preço da composição e retorno ao rascunho de venda | modelo selecionado | [mockup](../vendas/images/2026-09-10_vendas-monte-seu-colar_desktop_01.jpg) |

## Revisão inicial

O conceito em duas etapas está aprovado como direção. Antes de fechar o
desenho, a coluna direita precisa representar **cada posição** do modelo — não
apenas uma escolha genérica de menino e outra de menina — para suportar duas ou
três crianças, repetições e ordem dos pingentes. As decisões correspondentes
estão em `VEN-Q016` a `VEN-Q018` na tela de Vendas.

## Log de material recebido

| Data | O que chegou | Arquivo | Quem enviou |
|---|---|---|---|
| 10/09/2026 | composição Monte seu Colar dentro de Novo lançamento | [mockup](../vendas/images/2026-09-10_vendas-monte-seu-colar_desktop_01.jpg) | Gustavo |
