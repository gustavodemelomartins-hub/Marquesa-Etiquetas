# Tela: Dashboard

| | |
|---|---|
| Estado do material | protótipo navegável pronto para revisão |
| Última atualização | 15/09/2026 |
| Referências recebidas | 0 — proposta derivada do sistema e das regras atuais |
| Existe hoje no legado? | sim — `view-geral` |
| Existe hoje no React? | ver [07-mapping/frontend-feature-map.md](../../07-mapping/frontend-feature-map.md) |

> Esta pasta é documental. Nada aqui autoriza implementação; ver
> [00-index.md](../../00-index.md).

## Objetivo da tela

Visão de abertura operacional para a administradora: o que exige atenção hoje,
o movimento recente e os atalhos para as tarefas mais frequentes. Os valores
são demonstrativos e preservam a separação entre vendido, recebido e a receber.

## Para quem

Administradora e operação interna da Marquesa.

## Protótipo navegável

- [Abrir Home](master.html)
- [Captura desktop](home-desktop.png)
- [Captura mobile](home-mobile.png)
- [Agenda desktop](agenda-desktop.png)
- [Agenda mobile](agenda-mobile.png)

O protótipo cobre Hoje, Agenda e Alertas; prioridades com destino claro;
indicadores operacionais; movimento do dia; atalhos; atividade recente; e uma
agenda semanal com compromissos recorrentes, acertos e prazos financeiros.
Nenhum dado é persistido.

## Conteúdo da pasta

| Arquivo | Guarda |
|---|---|
| `images/` | prints, mockups e protótipos desta tela |
| [states.md](states.md) | estados de UI: vazio, carregando, erro, parcial, sucesso |
| [rules.md](rules.md) | regra de negócio que a tela precisa respeitar |
| [metrics.md](metrics.md) | número exibido e como é calculado |
| [api-needs.md](api-needs.md) | dado que a tela precisa e que a API ainda não dá |
| [open-questions.md](open-questions.md) | decisão aberta, específica desta tela |

Inspiração externa deste domínio: [02-references/dashboard/](../../02-references/dashboard/).

## Blocos da tela

| # | Bloco | O que mostra | Origem do dado | Referência |
|---|---|---|---|---|
| 1 | Resumo do dia | vendido, recebido, a receber e peças em casa | contratos atuais + dados demonstrativos | `master.html` |
| 2 | Prioridades | acerto atrasado, recebimentos e cadastro incompleto | regras e backlog atuais | `master.html` |
| 3 | Movimento | distribuição das entradas do dia | proposta visual | `master.html` |
| 4 | Atalhos | venda, etiquetas e maleta | fluxos já cobertos | `master.html` |
| 5 | Atividade recente | eventos comerciais e operacionais | regras atuais | `master.html` |
| 6 | Agenda | semana, recorrências, acertos e compromissos | agenda local + prazos do sistema | `master.html` |

## Log de material recebido

| Data | O que chegou | Arquivo | Quem enviou |
|---|---|---|---|
| 15/09/2026 | proposta navegável desktop e mobile | `master.html` | Codex |
