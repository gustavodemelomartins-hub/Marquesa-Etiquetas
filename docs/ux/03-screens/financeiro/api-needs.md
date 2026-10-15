# Necessidades de API — Financeiro

**Tarefa:** `ARQ-009` · **Estado:** handoff para revisão.

## Já atendido

| Ação | Rota atual | Uso |
|---|---|---|
| listar contas | `GET /api/contas-receber?status=` | A receber |
| alterar prazo | `PATCH /api/contas-receber/prazo` | vencimento controlado |
| receber | `POST /api/contas-receber/receber` | liquidação sem tocar estoque |
| marcar item pago | `POST /api/contas-receber/:id/marcar-paga` | histórico legado |
| ajustar vencimento | `PATCH /api/contas-receber/:id/vencimento` | correção de data |

## Parcial / UI NEEDS API

| ID | Necessidade | Gap | Criticidade |
|---|---|---|---|
| V2-API-003 | coleção de recebimentos por venda | forma, valor, data efetiva, estado, idempotência e leitura unificada | crítica |
| V2-API-009 | corrigir/estornar um evento | preservar anterior, autoria, motivo e versão esperada | crítica |

Saldo e estado financeiro vêm do servidor. A UI não gera parcelas nem altera
estoque ao receber, corrigir ou estornar.
