# Necessidades de API — Revendedoras

Dado que esta tela precisa, comparado ao que a API entrega hoje. **Nada aqui é
especificação de rota aprovada.** Contrato novo nasce na fase correspondente do
Master Plan, com contract test — não nesta pasta.

Baseline de contratos existentes:
`docs/architecture/API-ROUTES-BASELINE.md` (trilha de refatoração).

## Já atendido

| Dado | Rota atual | Observação |
|---|---|---|
| cadastro/ficha/status | `POST /api/revendedoras`, `PATCH /api/revendedoras/:id` | núcleo do perfil |
| arquivar | `POST /api/revendedoras/:id/arquivar` | recusa com maleta aberta |
| abrir/editar maleta | `POST /api/maletas`, `PATCH /api/maletas/:id` | cabeçalho/metadados |
| consignar itens | `POST /api/maletas/:id/itens` | movimento e sincronização |
| acerto/cancelamento | `POST /api/maletas/:id/acerto`, `/cancelar` | contrapartidas auditáveis |

## Falta

| # | Dado necessário | Existe em algum lugar? | Bloqueia o quê | Fase provável |
|---|---|---|---|---|
| V2-API-011 | criar maleta com cabeçalho e itens de forma atômica | hoje exige mais de uma chamada | confirmação única sem maleta incompleta | decisão arquitetural |

## Incompatibilidade conhecida

Caso em que a API responde, mas no formato errado para a tela (agregação
faltando, paginação ausente, campo derivado que a tela teria de recalcular).

| # | Rota | Problema | Alternativa possível |
|---|---|---|---|
| 1 | criação + itens | uma falha intermediária pode deixar rascunho incompleto | comando atômico ou token de rascunho com rollback |
