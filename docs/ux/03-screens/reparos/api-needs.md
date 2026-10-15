# Necessidades de API — Reparos

Dado que esta tela precisa, comparado ao que a API entrega hoje. **Nada aqui é
especificação de rota aprovada.** Contrato novo nasce na fase correspondente do
Master Plan, com contract test — não nesta pasta.

Baseline de contratos existentes:
`docs/architecture/API-ROUTES-BASELINE.md` (trilha de refatoração).

## Já atendido

| Dado | Rota atual | Observação |
|---|---|---|
| lista e paginação | `GET /api/garantias?status=&limite=&offset=` | sustenta fila e filtros |
| pendências | `GET /api/garantias/pendentes?limite=` | sustenta prazos/prioridades |
| abrir caso | `POST /api/garantias` | deve ligar à linha da compra |
| caso e eventos | `GET /api/garantias/:id` | detalhe e linha do tempo |
| transição | `POST /api/garantias/:id/status` | mudança controlada |
| troca e diferença | `POST /api/garantias/:id/troca` | preserva origem e diferença |
| pagar/estornar diferença | `POST /api/garantias/:id/troca/pagar` e `/estornar` | financeiro sem segunda baixa |

## Falta

| # | Dado necessário | Existe em algum lugar? | Bloqueia o quê | Fase provável |
|---|---|---|---|---|
| V2-DEC-002 | destino da diferença negativa | regra não fechada | concluir troca com valor a favor | decisão humana |
| V2-API-008 | resumo no perfil da cliente | perfil já agrega garantias | navegação direta ao item/caso | handoff V2 |

## Incompatibilidade conhecida

Caso em que a API responde, mas no formato errado para a tela (agregação
faltando, paginação ausente, campo derivado que a tela teria de recalcular).

| # | Rota | Problema | Alternativa possível |
|---|---|---|---|
| 1 | `GET /api/clientes/perfil` | confirmar `garantiaId,vendaId,itemId,sku,varianteId,status,prazo` | abrir Garantias pela lista principal |
