# Decisões de arquitetura (ADR)

Uma decisão por arquivo, numerada e **imutável**. Decisão que muda não é
editada: ganha uma nova, que declara qual substituiu.

```
NNNN-titulo-em-kebab-case.md
```

## Quando escrever uma

Quando a decisão for cara de reverter ou fácil de esquecer:

- mudança de schema que altere a forma de guardar estoque;
- mudança na ordem ou nas garantias da sincronização;
- entrada de dependência de runtime (hoje são **zero**);
- mudança do modelo de autenticação;
- qualquer coisa que uma pessoa daqui a seis meses vá querer desfazer sem
  saber por que foi feita.

## Quando **não** escrever

Correção de bug, ajuste de tela, refactor local, mudança de texto.
Comentário no código resolve.

## Onde as decisões antigas moram

Muita coisa já está registrada e **não** precisa virar ADR retroativo:

| Decisão | Onde já está |
|---|---|
| Regras de negócio e as divergências conscientes | [api/REGRAS.md](../../api/REGRAS.md) |
| Por que cada tabela é assim | [api/schema.sql](../../api/schema.sql) e [DATA_MODEL.md](../DATA_MODEL.md) |
| Por que puxar antes de empurrar | [SYNC_ENGINE.md](../SYNC_ENGINE.md) |
| Por que o token não se move sozinho | [NUVEMSHOP_INTEGRATION.md](../NUVEMSHOP_INTEGRATION.md) |

O `REGRAS.md` continua sendo a fonte fundamental das regras do negócio.
ADR é para decisões **técnicas** que ainda não têm dono.

## Modelo

```markdown
# NNNN — Título curto e afirmativo

- **Data:** AAAA-MM-DD
- **Situação:** proposta | aceita | substituída por NNNN
- **Decide:** quem

## Contexto
O que estava acontecendo. Que restrição existia. O que doía.

## Decisão
O que foi decidido, em uma frase, na voz ativa.

## Consequências
O que passa a ser verdade. O que fica pior. O que deixa de ser possível.
Inclua o custo — ADR sem custo declarado é propaganda.

## Alternativas descartadas
O que foi considerado e por que não. É a parte mais útil daqui a um ano.
```

## Índice

| # | Decisão | Data | Situação |
|---|---|---|---|
| [0001](0001-bootstrap-organizacao-claude-code.md) | Bootstrap de organização para Claude Code | 2026-08-18 | aceita |
