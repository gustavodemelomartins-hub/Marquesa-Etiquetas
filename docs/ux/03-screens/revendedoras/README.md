# Tela: Revendedoras

| | |
|---|---|
| Estado do material | protótipo navegável pronto para revisão |
| Última atualização | 15/09/2026 |
| Referências recebidas | 0 |
| Existe hoje no legado? | sim |
| Existe hoje no React? | ver [07-mapping/frontend-feature-map.md](../../07-mapping/frontend-feature-map.md) |

> Esta pasta é documental. Nada aqui autoriza implementação; ver
> [00-index.md](../../00-index.md).

## Objetivo da tela

Cadastro, maleta/consignação, acerto, comissão e Anexo I.

## Para quem

— ainda não definido — (Gustavo, Sthefany, revendedora, operação de estoque?)

## Conteúdo da pasta

| Arquivo | Guarda |
|---|---|
| `images/` | prints, mockups e protótipos desta tela |
| [states.md](states.md) | estados de UI: vazio, carregando, erro, parcial, sucesso |
| [rules.md](rules.md) | regra de negócio que a tela precisa respeitar |
| [metrics.md](metrics.md) | número exibido e como é calculado |
| [api-needs.md](api-needs.md) | dado que a tela precisa e que a API ainda não dá |
| [open-questions.md](open-questions.md) | decisão aberta, específica desta tela |

Inspiração externa deste domínio: [02-references/revendedoras/](../../02-references/revendedoras/).

## Protótipo navegável

O arquivo [master.html](master.html) propõe visão geral, agenda de acertos,
capacidade, lista, perfil, maleta em aberto e histórico. A criação exige revisão
e confirmação antes de retirar peças de casa. Valores usam o preço congelado
no envio. O acerto separa vendidas e devolvidas e explicita o efeito de cada
grupo no estoque.

Como não há mockup próprio recebido, a composição está **READY FOR GUSTAVO
REVIEW**. Foram executadas 56 verificações em 320, 390, 768 e 1440 pixels. Os
dados e ações são demonstrativos; não há escrita, React, API ou banco.

## Blocos da tela

Preencher quando houver mockup. Um bloco por seção visível.

| # | Bloco | O que mostra | Origem do dado | Referência |
|---|---|---|---|---|
| 1 | visão geral | peças fora, valor consignado, próximo acerto e capacidade | razão + maletas | proposta atual |
| 2 | agenda | prazos, peças, valores e atraso | maletas abertas | proposta atual |
| 3 | perfil | contato, maleta em aberto e histórico | revendedora + maletas | proposta atual |
| 4 | criação | sugestão revisável, responsável e data de acerto | estoque em casa | proposta atual |
| 5 | acerto | enviadas, vendidas, devolvidas, comissão e líquido | snapshot da maleta | proposta atual |

## Log de material recebido

| Data | O que chegou | Arquivo | Quem enviou |
|---|---|---|---|
| | | | |
