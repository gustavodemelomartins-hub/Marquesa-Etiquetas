# Necessidades de API — Clientes

**Tarefa:** `ARQ-009` · **Estado:** handoff para revisão, sem autorizar backend.

## Já atendido

| Dado / ação | Rota atual | Uso na UI |
|---|---|---|
| buscar e listar | `GET /api/clientes?busca=&limite=` | lista, busca e seleção |
| cadastrar | `POST /api/clientes` | cadastro rápido |
| abrir perfil agregado | `GET /api/clientes/perfil?id=|norm=` | identidade, compras, financeiro e garantias |
| editar cadastro | `PATCH /api/clientes/:id` | contato e dados cadastrais |

## Parcialmente atendido

| ID | Necessidade | Situação | Formato mínimo para fechar a UI |
|---|---|---|---|
| V2-API-006 | linha do tempo unificada | compras, garantias e financeiro existem em fontes distintas | `eventos[]` tipados, ordenados pela data efetiva, com `origemId` e destino |
| V2-API-007 | KPIs do perfil | o perfil já agrega dados, mas a semântica visual precisa ser confirmada | comprado, recebido, em aberto, ticket médio, última compra e frequência com fórmula/fonte |
| V2-API-008 | pós-venda por item comprado | garantias já chegam no perfil | `garantiaId,vendaId,itemId,sku,varianteId,status,prazo` para abrir o caso exato |

## Decisão de negócio pendente

`Crédito disponível` não aparece como `R$ 0,00`: isso afirmaria uma regra que
não existe. Antes de contrato novo, decidir como o crédito nasce, expira, é
usado e auditado (`V2-DEC-001`). Até lá a interface mostra **Regra pendente**.

## Incompatibilidades a evitar

- não identificar cliente pelo nome; usar `cliente_id`;
- não calcular saldo ou ticket divergente no navegador;
- não tratar `COMPROU`, `PAGO` e `EM ABERTO` como soma sempre complementar;
- garantia pertence à linha da compra, nunca apenas à cliente ou ao SKU.

Fonte transversal: [ui-api-handoff-v2.md](../../07-mapping/ui-api-handoff-v2.md).
