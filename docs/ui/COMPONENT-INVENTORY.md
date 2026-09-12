# Inventário inicial de componentes React

Este inventário registra apenas o necessário para orientar reúso futuro. Ele
não propõe refatoração, biblioteca externa nem consolidação automática.

## Shared visual atual

| Componente | Papel atual | Estado para reúso |
|---|---|---|
| `PageHeader` | kicker, título, texto auxiliar e ações | base reutilizável de página |
| `Painel` / `Colunas` | seção em cartão e composição em colunas | base reutilizável de layout |
| `Drawer` | painel lateral com título, corpo e rodapé | base reutilizável de fluxo auxiliar |
| `EmptyState` | vazio com título, descrição e ação | reutilizável |
| `LoadingState` | carregamento inline | reutilizável |
| `ErrorState` | erro recuperável e tentar novamente | reutilizável |
| `StatusBadge` | estado com quatro tons semânticos | reutilizável |
| `RiskBadge` | risco da reconciliação | visual reutilizável; vocabulário é de domínio |
| `DiffView` | valor anterior, novo e delta | reutilizável em revisão/comparação |
| `Donut` | distribuição categórica com estado vazio | reutilizável com parcimônia |
| `Kpi` / `Kpis` | indicador e grade de indicadores | reutilizável |
| `MetricCard` | métrica compacta com nota e tom | reutilizável; sobrepõe parte de `Kpi` |

Antes de consolidar `Kpi` e `MetricCard`, comparar necessidades reais das
telas. Similaridade visual isolada não justifica refatoração.

## Shell e infraestrutura visual

| Componente | Papel | Dependência relevante |
|---|---|---|
| `AppShell` | marca, navegação principal, utilidades e rodapé | navegação em estado local, sem URL/router |
| `ConnectionForm` | URL, chave e validação de conexão | `/api/health` + armazenamento local existente |
| `BuscaGlobalClientes` | autocomplete por nome/telefone | resultado abre perfil no legado |
| `AreaPendente` | reserva de área ainda não migrada | ponte explícita para `dashboard.html` |
| `DevBadge` | comunica ambiente de desenvolvimento | não é componente de negócio |

## Componentes de domínio atuais

| Grupo | Componentes principais | Observação |
|---|---|---|
| Estoque | `EstoqueArea`, `EstoqueTotalPage`, `PainelEstoque` | destino funcional e fluxo de planilha |
| Estoque Total | escolha, upload, resumo, tabela, confirmação e resultado | etapas de um fluxo; não contar como seis telas principais |
| Nuvemshop | `NuvemshopPage`, `SyncStatus`, `PendenciasList` | leitura, saúde e análise segura |
| Reconciliação | `ReconciliacaoPage`, `ReconciliationSummary`, `ReconciliationTable` | ainda não equivale à Central transversal |
| Revendedoras | `RevendedorasArea`, `VisaoGeralRevendedoras`, `RevendedoraPage`, `NovaRevendedora` | cobertura parcial do domínio |
| Maletas | `CapacidadeMaletas`, `SugestoesDrawer`, `CriarMaletaFluxo` | criação presente; acerto/cancelamento ausentes |

Componentes de domínio permanecem no domínio até existir reúso comprovado.

## Fundação visual existente

- fontes: Cormorant Garamond e Jost;
- cores de marca: marfim, bordô e rosé;
- tons semânticos: neutro, positivo, atenção e crítico;
- escala de espaçamento: `--r1` a `--r8`;
- raios: pequeno, padrão e grande;
- foco visível, `prefers-reduced-motion` e breakpoint principal de 640 px;
- números tabulares para leitura operacional.

Essa fundação é **estado atual**. Mockups futuros podem confirmá-la, ajustá-la
ou substituí-la mediante decisão visual explícita.

## Padrões visuais confirmados no protótipo de Vendas

Ainda não são componentes React. São padrões reutilizáveis suficientemente
estáveis para orientar o design das próximas telas sem criar CSS incompatível:

| Padrão | Estado visual | Pendência antes do componente React |
|---|---|---|
| App Shell e header desktop | direção visual consolidada; logo original e perfil `Sthefany Marques` | navegação real, tablet e mobile |
| Navegação principal e submenu | hierarquia e estado ativo consolidados | URLs, permissões e comportamento responsivo |
| Page Header | composição compacta com título e ações | variantes com descrição, filtros e ações múltiplas |
| Metric Card | hierarquia numérica e grade compacta consolidadas | loading, erro e ausência de dado |
| Alert | chamada horizontal com ação e prioridade visual | severidades e destinos reais |
| Filter / Period Selector | presets e intervalo personalizado simulados | contrato de dados e estados de consulta |
| Chart Card | barras, legenda, seleção e vínculo com conteúdo inferior simulados | biblioteca React, loading, erro e teclado final |
| Tabela, expansão e paginação | linguagem visual consolidada no painel | dados reais, grandes volumes e estados vazios/erro |
| Botões, inputs e badges | linguagem coerente com os tokens atuais | matriz final de variantes e permissões |

Fonte de validação e pendências:
[`interaction-matrix.md`](../ux/03-screens/vendas/interaction-matrix.md) e
[`handoff.md`](../ux/03-screens/vendas/handoff.md).
