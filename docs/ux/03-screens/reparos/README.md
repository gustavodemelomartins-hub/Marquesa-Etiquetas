# Tela: Reparos

| | |
|---|---|
| Estado do material | protótipo navegável pronto para revisão |
| Última atualização | 15/09/2026 |
| Referências recebidas | 0 — proposta derivada das regras canônicas |
| Existe hoje no legado? | não — domínio novo |
| Existe hoje no React? | ver [07-mapping/frontend-feature-map.md](../../07-mapping/frontend-feature-map.md) |

> Esta pasta é documental. Nada aqui autoriza implementação; ver
> [00-index.md](../../00-index.md).

## Objetivo da tela

Garantia ligada ao item da compra, com entrada, prazo, eventos, conserto, troca,
devolução e diferença financeira quando houver.

## Para quem

Administradora e operação interna da Marquesa.

## Protótipo navegável

- [Abrir Garantias e Trocas](master.html)
- [Captura desktop](reparos-desktop.png)
- [Captura mobile](reparos-mobile.png)

A camada visual usa somente regras já confirmadas. A execução real permanece
`UI NEEDS API` e depende de implementação fora desta rodada de protótipo.

## Conteúdo da pasta

| Arquivo | Guarda |
|---|---|
| `images/` | prints, mockups e protótipos desta tela |
| [states.md](states.md) | estados de UI: vazio, carregando, erro, parcial, sucesso |
| [rules.md](rules.md) | regra de negócio que a tela precisa respeitar |
| [metrics.md](metrics.md) | número exibido e como é calculado |
| [api-needs.md](api-needs.md) | dado que a tela precisa e que a API ainda não dá |
| [open-questions.md](open-questions.md) | decisão aberta, específica desta tela |

Inspiração externa deste domínio: [02-references/reparos/](../../02-references/reparos/).

## Blocos da tela

| # | Bloco | O que mostra | Origem do dado | Referência |
|---|---|---|---|---|
| 1 | Casos | cliente, venda, item, etapa e prazo | garantia por item | `master.html` |
| 2 | Detalhe | fatos, peça e linha do tempo | eventos da garantia | `master.html` |
| 3 | Prazos | dias úteis e honestidade sobre feriados | regra canônica | `master.html` |
| 4 | Troca | peça nova, crédito e diferença | valor efetivamente pago | `master.html` |

## Log de material recebido

| Data | O que chegou | Arquivo | Quem enviou |
|---|---|---|---|
| 15/09/2026 | proposta navegável desktop e mobile | `master.html` | Codex |
