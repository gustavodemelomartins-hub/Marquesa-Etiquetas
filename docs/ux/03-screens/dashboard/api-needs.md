# Necessidades de API — Dashboard

Dado que esta tela precisa, comparado ao que a API entrega hoje. **Nada aqui é
especificação de rota aprovada.** Contrato novo nasce na fase correspondente do
Master Plan, com contract test — não nesta pasta.

Baseline de contratos existentes:
`docs/architecture/API-ROUTES-BASELINE.md` (trilha de refatoração).

## Já atendido / parcial

| Superfície | Base atual | Gap |
|---|---|---|
| prioridades | `GET /api/pendencias?tipo=&adiadas=1` | incluir prioridade, prazo, rota de destino, entidade e `observadoEm` |
| movimento do dia | analytics e contas a receber existentes | definir métricas e fonte autoritativa de cada card |
| atalhos | rotas existentes dos domínios | confirmar permissões por ação |

## UI NEEDS API

| ID | Ação | Contrato mínimo esperado | Criticidade |
|---|---|---|---|
| V2-API-001 | listar/criar/editar compromisso e recorrência | `{id,titulo,inicio,fim,recorrencia,origem,destinoId,estado}` e comandos idempotentes | média |
| V2-API-002 | ordenar prioridades operacionais | acrescentar `prioridade,prazo,rotaDestino,entidadeId,observadoEm` à projeção | alta |

Agenda de fornecedores e compras ficou fora desta primeira versão. O protótipo
usa compromissos próprios, feiras, acertos e prazos operacionais.
