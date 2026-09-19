# Mapeamento

Ligação entre o material de produto desta pasta e o código real.

> **Este mapeamento é provisório por natureza.** Ele será atualizado conforme o
> [Master Plan](../../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md)
> avançar. Caminho final de módulo, nome de arquivo e fronteira de domínio
> **não se inventam aqui**: eles nascem na fase de refatoração do domínio
> correspondente, com contract test provando o antes e o depois.
>
> Enquanto a arquitetura de um domínio não estabilizou, a linha da tabela fica
> `— indefinido (fase N) —`. Preencher com um palpite é pior que deixar vazio:
> vira caminho fantasma que alguém segue mais tarde.

| Arquivo | Responde |
|---|---|
| [navigation-architecture-v2.md](navigation-architecture-v2.md) | como módulos, subáreas, perfil e atalhos se organizam |
| [product-screen-inventory-v2.md](product-screen-inventory-v2.md) | quais superfícies existem e o estado real de cada camada |
| [prototype-coverage.md](prototype-coverage.md) | cobertura visual consolidada por família |
| [ui-api-handoff-v2.md](ui-api-handoff-v2.md) | o que a UI já consegue consumir e quais contratos/decisões faltam |
| [frontend-feature-map.md](frontend-feature-map.md) | onde cada tela vive hoje no legado e no React |
| [backend-feature-map.md](backend-feature-map.md) | qual módulo da API sustenta cada tela |
| [integration-status.md](integration-status.md) | o que já está ligado ponta a ponta |
| [catalogo-fase-4-5.md](catalogo-fase-4-5.md) | relação exata entre as telas conceituais de Catálogo e o contrato da Fase 4.5 |
