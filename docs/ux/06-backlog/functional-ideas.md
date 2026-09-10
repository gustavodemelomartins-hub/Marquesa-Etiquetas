# Ideias funcionais

Espaço aberto para funcionalidade nova definida enquanto a refatoração
arquitetural acontece.

> **Estas ideias não devem ser implementadas automaticamente.** São requisitos
> futuros aguardando encaixe na arquitetura. Nenhum agente — Codex, Claude ou
> outro — abre código por causa de uma linha desta tabela. É preciso pedido
> humano explícito, e a fase certa do
> [Master Plan](../../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md).

## Como registrar

Adicione uma linha na tabela e, se a ideia tiver mais de um parágrafo, um bloco
detalhado logo abaixo. ID sequencial `IF-001`, `IF-002`… IDs não são
reaproveitados, mesmo depois de recusa.

| ID | Ideia | Domínio | Problema que resolve | Toca banco/estoque? | Status | Data |
|---|---|---|---|---|---|---|
| | | | | | | |

**Status:** `registrada` · `em detalhamento` · `pronta para avaliação` ·
`encaixada na fase N` · `recusada`. Só o Gustavo move para `encaixada` ou
`recusada`.

**"Toca banco/estoque?"** é o campo que decide o custo real. Ideia que cria
tabela, coluna ou movimento de estoque não é ideia de tela: passa por
`safe-d1-change` e por proposta de schema separada, mesmo que visualmente
pareça pequena.

## Detalhamento

Um bloco por ideia que precise de mais que uma linha.

```markdown
### IF-000 — <título>

**O que é:**
**Por que agora:**
**Como o usuário usa:**
**O que ainda não sabemos:**
**Depende de:** (fase, tela, decisão)
**Referências:** (arquivos em 02-references/ ou 03-screens/*/images/)
```

## Recusadas

Ideia descartada fica registrada com o motivo — evita que volte a cada rodada.

| ID | Ideia | Por que não | Data |
|---|---|---|---|
| | | | |
