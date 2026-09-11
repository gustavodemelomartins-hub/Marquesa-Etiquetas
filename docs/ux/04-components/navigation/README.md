# Componente: Navegação

Como o usuário troca de área e volta.

Registre aqui apenas o padrão que **repete em mais de uma tela**. Se só existe
numa tela, ele mora no README daquela tela.

Imagens deste componente ficam nesta pasta, nome
`AAAA-MM-DD_navigation_<variante>.<ext>`.

## Variantes

| Variante | Quando usar | Referência |
|---|---|---|
| principal | troca entre as grandes áreas do sistema, dentro do header global | [header aprovado](../header/2026-09-10_header_desktop.png) |
| secundária contextual | troca entre subseções da área ativa, em uma faixa logo abaixo do header | [header aprovado](../header/2026-09-10_header_desktop.png) |

## Estados

| Estado | Aparência | Definido? |
|---|---|---|
| padrão | rótulo e ícone neutros, sem preenchimento | sim, desktop |
| ativo principal | fundo rosa suave, ícone/rótulo bordô e sublinhado espesso | sim, desktop |
| ativo secundário | texto com maior peso e sublinhado bordô | sim, desktop |
| foco (teclado) | foco visível e independente da cor | sim, conceito |
| desabilitado | | não |
| carregando | | não |
| erro | | não |

## Regras de uso

- a área ativa é sempre visível;
- caminho de volta nunca depende do botão do navegador.
- a navegação secundária pertence à área ativa e não substitui a navegação principal;
- contadores, como o de Clientes, ficam ligados ao rótulo correspondente e
  precisam de nome acessível;
- a ordem e o conjunto final das áreas não são inferidos só pelo mockup;
- comportamento em tablet e mobile depende da decisão global `DP-001`.

## Componente React equivalente hoje

— a preencher — Inventário do que já existe:
`docs/ui/COMPONENT-INVENTORY.md`. Não presuma que o padrão novo substitui o
componente atual; isso é decisão da fase 9 do Master Plan.
