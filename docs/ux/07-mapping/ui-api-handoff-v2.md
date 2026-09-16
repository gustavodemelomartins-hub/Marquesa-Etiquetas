# Handoff técnico UI ↔ API — Sistema Marquesa V2

**Tarefa:** `ARQ-009` · **Estado:** pronto para revisão cruzada  
**Data:** 15/09/2026 · Não autoriza implementação de backend.

## Classificação por módulo

| Módulo | UI já suportada | Parcialmente suportada | Needs API / decisão |
|---|---|---|---|
| Home | estado agregado e pendências | métricas e prioridades | Agenda persistente; métricas finais |
| Vendas | venda atual, listas do dia, saída, cancelamento | histórico/analytics e pagamento | recebimentos múltiplos; exportação; custo histórico |
| Clientes | buscar, criar, perfil agregado, editar | dashboard do perfil | crédito disponível e feed unificado |
| Financeiro | contas a receber e liquidação atual | correção/eventos múltiplos | coleção auditável de recebimentos |
| Garantias | lista, caso, evento, troca e diferença | resumo dentro de Clientes | regra para diferença negativa/crédito |
| Estoque | saldo/razão, produto e inventário | saúde/valor econômico | fórmulas e permissões |
| Catálogo | preparação, aprovação e contratos 4.5 | cadastro e publicação | decisão de rota, R2 e flags |
| Revendedoras | CRUD, maleta e acerto | criação em duas chamadas | comando atômico e paridade final |
| Etiquetas | operação local atual | fila/foto | lote e histórico auditável por perfil |
| Nuvemshop | panorama, saúde, dry-run e leitura | aprovação/aplicação | decisões P13–P16 e migrations |
| Notificações | `GET /api/pendencias` como origem parcial | leitura/destino | estado lido, preferências e entrega |
| Perfil/Conta | conexão local | preferências locais | identidade, sessão e matriz de permissão |

## UI NEEDS API

| ID | Tela | Ação | Informação necessária | Endpoint existente | Gap / formato mínimo esperado | Criticidade |
|---|---|---|---|---|---|---|
| V2-API-001 | Home · Agenda | listar/criar/editar recorrência | eventos manuais e operacionais, origem, recorrência, destino | nenhum contrato de agenda | `{id,titulo,inicio,fim,recorrencia,origem,destinoId,estado}`; comando idempotente | média |
| V2-API-002 | Home | montar prioridades | pendências ordenadas por prazo/impacto com destino | `GET /api/pendencias` parcial | incluir `prioridade,prazo,rotaDestino,entidadeId,observadoEm` | alta |
| V2-API-003 | Vendas/Financeiro | registrar vários recebimentos | coleção por venda com forma, valor, datas e estado | `POST /api/vendas/:id/pagamento` | read model + comandos por evento; status derivado; idempotency key | crítica |
| V2-API-004 | Vendas · histórico | filtrar/exportar | totais e linhas sob o mesmo filtro | `GET /api/vendas/lista` parcial | filtros completos, total autoritativo, cursor/offset e exportação auditada | média |
| V2-API-005 | Saída sem faturamento | exibir/registrar custo real | custo congelado por unidade na saída | não confirmado | `custoUnitario,custoTotal,origemCusto,informadoEm,informadoPor`; nunca usar preço | alta |
| V2-API-006 | Cliente · dashboard | feed unificado | compras, recebimentos, garantias e trocas ordenados | `GET /api/clientes/perfil` parcial | `eventos[]` tipados com data efetiva, origem e destino | média |
| V2-API-007 | Cliente · dashboard | mostrar indicadores | ticket, frequência, última compra e garantias ativas | perfil agregado existe | confirmar campos e semântica no contrato; não recalcular divergente no browser | média |
| V2-API-008 | Garantias no perfil | abrir caso correto | garantia vinculada ao item da compra | rotas de Garantias existem | perfil deve devolver `garantiaId,vendaId,itemId,sku,varianteId,status,prazo` | alta |
| V2-API-009 | Financeiro | corrigir/estornar evento | auditoria por recebimento e autoria | liquidação atual | comandos com `motivo,versaoEsperada`; retorno do evento novo e anterior | crítica |
| V2-API-010 | Estoque | saúde/valor | fórmula, cobertura e qualidade da fonte | leituras atuais parciais | read model documentado, `calculadoEm`, fontes e sinal de parcial | alta |
| V2-API-011 | Revendedoras | criar maleta de forma atômica | cabeçalho + itens + snapshot | `POST /api/maletas` + itens | um comando ou token de rascunho/rollback seguro | crítica |
| V2-API-012 | Etiquetas | salvar lote/histórico | itens, quantidades, papel, calibração, ator e estado | operação local | criar/listar/reimprimir lote; impressão física permanece estado desconhecido | média |
| V2-API-013 | Notificações | marcar lida/preferências | identidade, lidaEm, adiamento, tipos habilitados | pendências adiar/retomar | read model de notificações + comandos idempotentes por usuário | média |
| V2-API-014 | Perfil | autenticar e autorizar | usuário, sessão, papel e capacidades | Bearer técnico atual | `/me` ou equivalente com `id,nome,papel,capacidades[]`; segredo nunca vai à UI | crítica |
| V2-API-015 | Preferências | persistir por conta | início, densidade, alertas e acessibilidade | localStorage parcial | versão e escopo explícitos; fallback local permitido | baixa |

## UI NEEDS BUSINESS DECISION

| ID | Decisão | Afeta | Recomendação UX |
|---|---|---|---|
| V2-DEC-001 | Crédito da cliente existe? Como nasce, expira e é usado? | Cliente, Financeiro, Troca | mostrar `Regra pendente`; não exibir R$ 0 como fato |
| V2-DEC-002 | Diferença negativa em troca vira crédito ou reembolso? | Garantias/Financeiro | manter `pendente_regra` e bloquear liquidação |
| V2-DEC-003 | Quem vê custo e executa ajustes/estornos/exportações? | Estoque, Saídas, Financeiro | ocultar ação sem capacidade; registrar autoria |
| V2-DEC-004 | Catálogo é subárea de Estoque? | navegação | sim, até uso provar necessidade de módulo global |
| V2-DEC-005 | Financeiro merece aba principal? | navegação | manter em `Mais` e medir frequência |
| V2-DEC-006 | Quais métricas abrem a Home? | Home | usar apenas vendido, recebido, a receber e patrimônio com fórmula auditável |

## UI FUTURE

Sem contrato nem promessa na V2 atual: WhatsApp, fornecedores, compras,
controle de custos completo, fluxo de caixa, lucro líquido, CRM/RFM,
aniversariantes e reativação. Espaço arquitetural pode existir; botão e dado
operacional não.

## Regras para implementação posterior

1. A UI não calcula saldo, comissão, diferença de troca, ajuste de estoque ou
   status financeiro quando o servidor pode ser autoritativo.
2. Escritas críticas usam idempotência, versão esperada e retorno autoritativo.
3. Estado parcial, aproximação e ausência de fonte permanecem visíveis.
4. Handoff não muda método/caminho do baseline: contrato novo nasce com teste.

