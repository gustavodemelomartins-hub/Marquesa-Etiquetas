# Inventário real de telas — Protótipo Marquesa V2

**Tarefa:** `ARQ-009` · **Reconstruído em:** 15/09/2026  
Este inventário descreve o protótipo navegável atual. `READY FOR REVIEW` não
significa aprovação nem implementação React.

| Tela / superfície | Módulo | Protótipo / entrada | UX | Desktop | Mobile | Interações / fluxo | Decisão aberta | API | Gustavo |
|---|---|---|---|---|---|---|---|---|---|
| Hub do protótipo | Transversal | `prototype/index.html` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | abrir 12 famílias | arquitetura final do header | n/a | READY FOR GUSTAVO REVIEW |
| Hoje | Home | `dashboard/master.html` · Hoje | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | prioridade → domínio | métricas definitivas | PARTIAL | READY FOR GUSTAVO REVIEW |
| Agenda semanal | Home | `dashboard/master.html` · Agenda | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | semana, detalhe, criar recorrência | persistência e edição | UI NEEDS API | READY FOR GUSTAVO REVIEW |
| Painel de vendas | Vendas | `vendas/master.html#painel` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | período, gráfico, detalhe | fórmulas e intervalos | PARTIAL | READY FOR GUSTAVO REVIEW |
| Tipos de lançamento | Vendas | `vendas/master.html#lancamentos` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | escolher fluxo | nenhuma estrutural | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Venda normal | Vendas | `#lancamentos` · Venda normal | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | itens → cliente → pagamento → revisão | recebimentos múltiplos | PARTIAL | READY FOR GUSTAVO REVIEW |
| Monte seu Colar | Vendas | `#lancamentos` · Monte seu Colar | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | configurar → revisar → adicionar | regra canônica da nova composição | BLOCKED | READY FOR GUSTAVO REVIEW |
| Saída sem faturamento | Vendas | `#lancamentos` · Saída | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | retirar → custo → confirmar → histórico | fonte do custo histórico | PARTIAL | READY FOR GUSTAVO REVIEW |
| Histórico de vendas | Vendas | `vendas/master.html#painel` | IN PROGRESS | READY FOR REVIEW | READY FOR REVIEW | filtrar, paginar, expandir | exportação e filtros finais | PARTIAL | READY FOR GUSTAVO REVIEW |
| Lista de clientes | Clientes | `vendas/master.html#clientes` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | buscar → abrir perfil | paginação/busca final | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Perfil da cliente | Clientes | `#clientes` · linha selecionada | IN PROGRESS | READY FOR REVIEW | READY FOR REVIEW | resumo → compras → financeiro → pós-venda | crédito da cliente | PARTIAL | READY FOR GUSTAVO REVIEW |
| Cadastro rápido | Clientes | `#clientes` / Venda · Nova cliente | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | criar e selecionar | campos obrigatórios finais | SUPPORTED | READY FOR GUSTAVO REVIEW |
| A receber | Financeiro | `financeiro/master.html` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | cliente → saldo → receber | excesso/crédito | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Registrar/corrigir recebimento | Financeiro | `financeiro/master.html` · modal | IN PROGRESS | READY FOR REVIEW | READY FOR REVIEW | registrar, corrigir, histórico | múltiplos eventos e estorno | PARTIAL | READY FOR GUSTAVO REVIEW |
| Histórico financeiro | Financeiro | `financeiro/master.html` · Histórico | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | auditar evento | autoria/permissão | PARTIAL | READY FOR GUSTAVO REVIEW |
| Lista de garantias | Garantias | `reparos/master.html` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | buscar → abrir caso | taxonomia final de etapas | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Caso e linha do tempo | Garantias | `reparos/master.html` · caso | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | evento → conserto/troca | permissões | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Prazos | Garantias | `reparos/master.html` · Prazos | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | ordenar urgência | calendário de feriados | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Troca e diferença | Garantias | `reparos/master.html` · Simular troca | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | peça nova → diferença → receber | diferença negativa/crédito | PARTIAL | READY FOR GUSTAVO REVIEW |
| Estoque geral | Estoque | `estoque/master.html` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | distribuição e saúde | fórmula de saúde/valor | PARTIAL | READY FOR GUSTAVO REVIEW |
| Produtos | Estoque | `estoque/master.html` · Produtos | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | buscar → editar/cadastrar | posição final Catálogo × Estoque | PARTIAL | READY FOR GUSTAVO REVIEW |
| Inventário · iniciar | Estoque | `estoque/master.html` · Inventário | APPROVED | READY FOR REVIEW | READY FOR REVIEW | iniciar/retomar | permissões | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Inventário · contar | Estoque | mesma rota · sessão | APPROVED | READY FOR REVIEW | READY FOR REVIEW | contar, zero, variação, pausar | permissões | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Inventário · revisar/aplicar | Estoque | mesma rota · revisão | APPROVED | READY FOR REVIEW | READY FOR REVIEW | concluir → selecionar → aplicar | ajuste autorizado | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Inventário · histórico/detalhe | Estoque | mesma rota · histórico | APPROVED | READY FOR REVIEW | READY FOR REVIEW | abrir resultado | retenção/exportação | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Central do Catálogo | Catálogo (em Estoque) | `catalogo/master.html` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | pipeline → produto | confirmar posição na navegação | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Cadastro/edição de produto | Catálogo (em Estoque) | `catalogo/master.html` · Produto | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | editar metadados/variações | rota própria ou importação | PARTIAL | READY FOR GUSTAVO REVIEW |
| Galeria/fotos em lote | Catálogo (em Estoque) | `catalogo/master.html` · Fotos | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | analisar → enviar → casar | habilitar R2 | BLOCKED | READY FOR GUSTAVO REVIEW |
| Conteúdo e aprovação | Catálogo (em Estoque) | `catalogo/master.html` · Conteúdo | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | preparar → revisar → aprovar | nenhuma de UX | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Publicação | Catálogo (em Estoque) | `catalogo/master.html` · Publicação | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | simular → confirmar | ligar flag/R2 | BLOCKED | READY FOR GUSTAVO REVIEW |
| Visão geral de revendedoras | Revendedoras | `revendedoras/master.html` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | agenda/lista/capacidade | métricas finais | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Perfil da revendedora | Revendedoras | mesma rota · Perfil | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | maleta atual + histórico | paridade do acerto | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Criar maleta | Revendedoras | mesma rota · Criar | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | sugestão → revisão → confirmação | comando atômico | PARTIAL | READY FOR GUSTAVO REVIEW |
| Acerto de maleta | Revendedoras | mesma rota · Acerto | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | vendidas/devolvidas → comissão | paridade final | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Preparar etiquetas | Etiquetas | `etiquetas/master.html` | APPROVED | READY FOR REVIEW | READY FOR REVIEW | selecionar → quantidade/texto | fila automática | PARTIAL | APPROVED |
| Revisar/imprimir | Etiquetas | mesma rota · Impressão | APPROVED | READY FOR REVIEW | READY FOR REVIEW | folha, calibrar, PDF, imprimir | histórico persistente | UI NEEDS API | APPROVED |
| Histórico/reimpressão | Etiquetas | mesma rota · Histórico | APPROVED | READY FOR REVIEW | READY FOR REVIEW | abrir lote → reimprimir | autoria/retenção | UI NEEDS API | APPROVED |
| Panorama/saúde | Nuvemshop | `nuvemshop/master.html` | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | estado → panorama | nenhuma de UX | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Pendências | Nuvemshop | mesma rota · Pendências | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | filtro → diagnóstico | política de preço/categoria | PARTIAL | READY FOR GUSTAVO REVIEW |
| Análise segura | Nuvemshop | mesma rota · Análise | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | dry-run → plano | Apply fora do protótipo | SUPPORTED | READY FOR GUSTAVO REVIEW |
| Notificações | Transversal | `notificacoes/master.html` | IN PROGRESS | READY FOR REVIEW | READY FOR REVIEW | filtrar, ler, abrir destino | canal externo/retensão | UI NEEDS API | READY FOR GUSTAVO REVIEW |
| Meu perfil | Conta | `configuracoes/master.html` | IN PROGRESS | READY FOR REVIEW | READY FOR REVIEW | editar identificação | autenticação/permissões | UI NEEDS API | READY FOR GUSTAVO REVIEW |
| Preferências | Conta | mesma rota · Preferências | IN PROGRESS | READY FOR REVIEW | READY FOR REVIEW | salvar preferências locais | escopo local/remoto | PARTIAL | READY FOR GUSTAVO REVIEW |
| Conexão | Conta | mesma rota · Conexão | READY FOR REVIEW | READY FOR REVIEW | READY FOR REVIEW | testar/salvar localmente | gestão de credencial | SUPPORTED | READY FOR GUSTAVO REVIEW |

## Leitura do estado

- `SUPPORTED`: contrato existente atende o núcleo do protótipo.
- `PARTIAL`: existe base, mas agregação, granularidade ou formato não fecha.
- `UI NEEDS API`: a superfície precisa de contrato novo.
- `BLOCKED`: depende de decisão/flag/infra já registrada.
- Aprovação só aparece como `APPROVED` quando já existe registro humano.

