# Necessidades de API — Personalização

Dado que esta tela precisa, comparado ao que a API entrega hoje. **Nada aqui é
especificação de rota aprovada.** Contrato novo nasce na fase correspondente do
Master Plan, com contract test — não nesta pasta.

Baseline de contratos existentes:
`docs/architecture/API-ROUTES-BASELINE.md` (trilha de refatoração).

## Já atendido

| Dado | Rota atual | Observação |
|---|---|---|
| modelos e opções de personalização | `GET /api/personalizacao/modelos?inativos=1` | contrato existe; funcionalidade permanece sujeita ao estado de ativação |

## Falta

| # | Dado necessário | Existe em algum lugar? | Bloqueia o quê | Fase provável |
|---|---|---|---|---|
| API-PER-001 | slots exigidos pelo modelo, com grupo, posição e ordem | domínio de personalização | renderização dinâmica por posição | avaliar no contrato funcional existente |
| API-PER-002 | disponibilidade elegível por SKU/opção | catálogo e estoque | pré-validação e mensagem `precisa N, disponível M` | avaliar no contrato funcional existente |
| API-PER-003 | validação autoritativa da composição agregando quantidades por SKU | registro de venda/personalização | impedir conclusão quando um SKU repetido não cobre todos os slots | obrigatório no servidor; formato a mapear |

## Regra de consumo repetido

A interface soma quantas vezes cada SKU foi escolhido, inclusive em slots do
mesmo grupo. Essa conta serve para feedback imediato; a confirmação definitiva
é do servidor, porque o estoque pode mudar entre a seleção e a finalização.

## Incompatibilidade conhecida

Caso em que a API responde, mas no formato errado para a tela (agregação
faltando, paginação ausente, campo derivado que a tela teria de recalcular).

| # | Rota | Problema | Alternativa possível |
|---|---|---|---|
| | | | |
