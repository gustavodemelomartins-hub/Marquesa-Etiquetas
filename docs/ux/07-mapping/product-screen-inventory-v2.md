# Matriz única de telas — Sistema Marquesa V2

**DESIGN-V2 · 19/09/2026 · PROPOSTA DE DESIGN FINAL — READY FOR GUSTAVO REVIEW**

A coluna **DESIGN** diz o que aconteceu nesta rodada:
`GOLDEN` = tela reconstruída sobre o Design System e usada como referência;
`NORMALIZADA` = estrutura preservada, vocabulário visual traduzido para os
tokens e componentes novos; `NOVA` = superfície que não existia.

Inventário das superfícies atuais, incluindo abas e diálogos. As rotas de módulo
são relativas a `docs/ux/03-screens/`; `prototype/` é relativo a `docs/ux/`.
Todos os módulos são acessíveis pelo menu global. Conceitos e capturas antigas
permanecem preservados como referências, fora da navegação de produto.

READY FOR GUSTAVO REVIEW descreve o protótipo visual; não significa integração
nem aprovação. Somente Gustavo altera a aprovação. Backend é uma classificação
do contrato documentado, sem confirmação de disponibilidade em produção.

| TELA | MÓDULO | ROTA | DESKTOP | MOBILE | INTERAÇÕES | FLUXO | BACKEND | APROVAÇÃO | OBSERVAÇÃO |
|---|---|---|---|---|---|---|---|---|---|
| Hub do protótipo | Transversal | `prototype/index.html` · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | abrir 12 famílias | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | arquitetura final do header |
| Hoje | Home | `dashboard/master.html` · Hoje · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | prioridade → domínio | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | métricas definitivas |
| Agenda semanal | Home | `dashboard/master.html#calendar` · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | semana, detalhe, criar recorrência | READY FOR GUSTAVO REVIEW | UI NEEDS API | READY FOR GUSTAVO REVIEW | persistência e edição |
| Painel de vendas | Vendas | `vendas/master.html#painel` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | período, gráfico, detalhe | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | fórmulas e intervalos |
| Tipos de lançamento | Vendas | `vendas/master.html#lancamentos` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | escolher fluxo | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | nenhuma estrutural |
| Venda normal | Vendas | `vendas/master.html#nova-venda` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | itens → cliente → pagamento → revisão | READY FOR GUSTAVO REVIEW | UI NEEDS CONTRACT CHECK | READY FOR GUSTAVO REVIEW | CC-001: data real por pagamento |
| Monte seu Colar | Vendas | `vendas/master.html#colar` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | configurar → revisar → adicionar | READY FOR GUSTAVO REVIEW | UI NEEDS BUSINESS DECISION | READY FOR GUSTAVO REVIEW | regra canônica da nova composição |
| Saída sem faturamento | Vendas | `vendas/master.html#saida` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | retirar → custo → confirmar → histórico | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | fonte do custo histórico |
| Histórico de vendas | Vendas | `vendas/master.html#painel` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | filtrar, paginar, expandir | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | exportação e filtros finais |
| Lista de clientes | Clientes | `clientes/master.html` · NOVA · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | buscar → abrir perfil | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | paginação/busca final |
| Painel da cliente | Clientes | `clientes/master.html` · Painel · NOVA · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | resumo → compras → financeiro → pós-venda | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | feed detalhado dos outros exemplos; edição cadastral |
| Cadastro rápido | Clientes | `clientes/master.html` · Nova cliente · NOVA | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | criar e selecionar | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | campos obrigatórios finais |
| A receber | Financeiro | `financeiro/master.html` · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | cliente → saldo → receber | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | excesso/crédito |
| Registrar/corrigir recebimento | Financeiro | `financeiro/master.html` · modal | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | registrar, corrigir, histórico | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | auditoria por evento e data real (CC-001) |
| Histórico financeiro | Financeiro | `financeiro/master.html` · Histórico | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | auditar evento | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | autoria/permissão |
| Lista de garantias | Garantias | `reparos/master.html` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | buscar → abrir caso | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | taxonomia final de etapas |
| Caso e linha do tempo | Garantias | `reparos/master.html` · caso | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | evento → conserto/troca | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | permissões |
| Prazos | Garantias | `reparos/master.html` · Prazos | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | ordenar urgência | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | calendário de feriados |
| Troca e diferença | Garantias | `reparos/master.html` · Simular troca | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | peça nova → diferença → receber | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | diferença negativa/crédito |
| Estoque geral | Estoque | `estoque/master.html` · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | distribuição e saúde | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | fórmula de saúde/valor |
| Produtos | Estoque | `estoque/master.html` · Produtos · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | buscar → editar/cadastrar | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | posição final Catálogo × Estoque |
| Inventário · iniciar | Estoque | `estoque/master.html#inventario` · iniciar | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | iniciar/retomar | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | permissões |
| Inventário · contar | Estoque | `estoque/master.html#inventario` · contar | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | contar, zero, variação, pausar | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | permissões |
| Inventário · revisar/aplicar | Estoque | `estoque/master.html#inventario` · revisar/aplicar | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | concluir → selecionar → aplicar | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | ajuste autorizado |
| Inventário · histórico/detalhe | Estoque | `estoque/master.html#inventario` · histórico/detalhe | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | abrir resultado | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | retenção/exportação |
| Central do Catálogo | Catálogo (em Estoque) | `catalogo/master.html` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | pipeline → produto | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | confirmar posição na navegação |
| Cadastro/edição de produto | Catálogo (em Estoque) | `catalogo/master.html` · Produto | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | editar metadados/variações | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | rota própria ou importação |
| Galeria/fotos em lote | Catálogo (em Estoque) | `catalogo/master.html` · Fotos | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | analisar → enviar → casar | READY FOR GUSTAVO REVIEW | UI NEEDS CONTRACT CHECK | READY FOR GUSTAVO REVIEW | R2 e vinculação de fotos (CC-004) |
| Conteúdo e aprovação | Nuvemshop | `nuvemshop/publicar.html` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | preparar → revisar → aprovar e publicar → acompanhar | READY FOR GUSTAVO REVIEW | UI NEEDS CONTRACT CHECK | READY FOR GUSTAVO REVIEW | nenhuma de UX |
| Publicação | Nuvemshop | `nuvemshop/publicar.html` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | preparar → revisar → aprovar e publicar → acompanhar | READY FOR GUSTAVO REVIEW | UI NEEDS CONTRACT CHECK | READY FOR GUSTAVO REVIEW | ligar flag/R2 |
| Visão geral de revendedoras | Revendedoras | `revendedoras/master.html` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | agenda/lista/capacidade | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | métricas finais |
| Perfil da revendedora | Revendedoras | mesma rota · Perfil | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | maleta atual + histórico | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | paridade do acerto |
| Criar maleta | Revendedoras | mesma rota · Criar | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | sugestão → revisão → confirmação | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | comando atômico |
| Acerto de maleta | Revendedoras | mesma rota · Acerto | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | vendidas/devolvidas → comissão | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | paridade final |
| Preparar etiquetas | Etiquetas | `etiquetas/master.html` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | selecionar → quantidade/texto | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | fila automática · aprovação anterior registrada; shell alterado nesta rodada volta à revisão |
| Revisar/imprimir | Etiquetas | mesma rota · Impressão | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | folha, calibrar, PDF, imprimir | READY FOR GUSTAVO REVIEW | UI NEEDS API | READY FOR GUSTAVO REVIEW | histórico persistente · aprovação anterior registrada; shell alterado nesta rodada volta à revisão |
| Histórico/reimpressão | Etiquetas | mesma rota · Histórico | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | abrir lote → reimprimir | READY FOR GUSTAVO REVIEW | UI NEEDS API | READY FOR GUSTAVO REVIEW | autoria/retenção · aprovação anterior registrada; shell alterado nesta rodada volta à revisão |
| Produtos na loja | Nuvemshop | `nuvemshop/master.html` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | buscar, filtrar, comparar saldos, abrir pendência | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | nenhuma de UX |
| Pendências | Nuvemshop | `nuvemshop/master.html#pending` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | filtro → diagnóstico | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | política de preço/categoria |
| Análise segura | Nuvemshop | `nuvemshop/master.html#analysis` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | dry-run → plano | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | Apply fora do protótipo |
| Notificações | Transversal | `notificacoes/master.html` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | filtrar, ler, abrir destino | READY FOR GUSTAVO REVIEW | UI NEEDS API | READY FOR GUSTAVO REVIEW | canal externo/retensão |
| Meu perfil | Conta | `configuracoes/master.html#profile` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | editar identificação | READY FOR GUSTAVO REVIEW | UI NEEDS API | READY FOR GUSTAVO REVIEW | autenticação/permissões |
| Preferências | Conta | `configuracoes/master.html#preferences` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | salvar preferências locais | READY FOR GUSTAVO REVIEW | PARTIAL | READY FOR GUSTAVO REVIEW | escopo local/remoto |
| Conexão | Conta | `configuracoes/master.html#connection` | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | testar/salvar localmente | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | gestão de credencial |
| Fila de publicação | Nuvemshop | `nuvemshop/publicar.html` · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | busca, filtros, preparação, falha e repetição | READY FOR GUSTAVO REVIEW | UI NEEDS CONTRACT CHECK | READY FOR GUSTAVO REVIEW | CC-002/003; nenhum envio real |
| Revisão, fotos e prévia | Nuvemshop | `nuvemshop/publicar.html` · Revisar e aprovar | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | editar texto/SEO, upload múltiplo, principal, ordenar, prévia | READY FOR GUSTAVO REVIEW | UI NEEDS CONTRACT CHECK | READY FOR GUSTAVO REVIEW | CC-004; imagens ilustrativas; alterações na sessão |
| Editar cadastro de cliente | Clientes | `clientes/master.html` · Editar cadastro · NOVA | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | editar dados, salvar, recarregar e restaurar demonstração | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | formulário completo no provedor demonstrativo; integração real ainda depende do contrato |
| Tratamento de imagem | Nuvemshop | `nuvemshop/publicar.html` · Fotos | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | botão Em breve desabilitado | BLOCKED | FUTURE | READY FOR GUSTAVO REVIEW | não depende de executor externo artificial |
| Design system aplicado | Transversal | `prototype/design-system.html` · GOLDEN | READY FOR GUSTAVO REVIEW | READY FOR GUSTAVO REVIEW | tokens, componentes, estados e tipografia | READY FOR GUSTAVO REVIEW | SUPPORTED | READY FOR GUSTAVO REVIEW | shared system.css/system.js nas 12 páginas de produto |

## Rodada de design V2 — o que mudou de superfície

- **Golden screens** (reconstruídas): Home e Agenda, Clientes (lista e painel),
  Financeiro, Estoque, Nuvemshop · publicação, Hub e Design System.
- **Nova rota de origem:** `/prototype/clientes/` deixou de ser servida por
  `03-screens/vendas/master.html#clientes` e passou a ter arquivo próprio em
  `03-screens/clientes/`. Vendas mantém Lançamentos, Painel e Histórico.
- **Normalizadas** (estrutura e JS preservados, linguagem visual trocada):
  Vendas, Catálogo, Revendedoras, Garantias/Reparos, Etiquetas, Notificações,
  Configurações, Produtos na loja, Pendências e Sincronização.
- **Verificação:** `scripts/verify-prototype.mjs` — 970 checagens, 18 rotas,
  44 links, 5 larguras (320 · 390 · 768 · 1024 · 1440), sem erro de console,
  sem transbordo horizontal e sem requisição externa.
- **Telas que ainda pedem revisão sua:** Vendas (Nova venda, Monte seu Colar e
  Saída sem faturamento continuam com o layout anterior sob a pele nova),
  Catálogo · fotos em lote, e a **divisão de Clientes**: o painel de
  relacionamento vive no módulo novo, mas o cadastro completo e o "nova venda a
  partir da cliente" continuam na aba *Cadastro de clientes* dentro de Vendas.
  Unificar os dois é decisão sua — ver
  [decisões de design](../04-components/redesign-decisions-v2.md).

## Limites explícitos

- Backend: SUPPORTED, PARTIAL, UI NEEDS API, UI NEEDS CONTRACT CHECK,
  UI NEEDS BUSINESS DECISION e FUTURE. Ver IDs no handoff.
- A edição completa da cliente está funcional no provedor demonstrativo e
  permanece pendente de aprovação visual e integração.
- Estados operacionais demonstrativos são compartilhados entre módulos e
  persistidos neste navegador; não há sincronização entre dispositivos.
- Persistência, permissões e tratamento de falhas reais precisam da integração.
- Material anterior a esta rodada permanece no histórico Git e nas referências.
