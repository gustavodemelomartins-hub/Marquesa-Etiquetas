# Inventário inicial de telas

## Critério de contagem

O produto atual possui **15 famílias de destinos navegáveis** identificadas no
dispatcher `switchTab` do dashboard legado. Esta é uma unidade de navegação,
não uma contagem de elementos DOM:

- `geral` compõe `view-geral` e `view-estoque` na mesma tela;
- `central` e `publicar` compartilham `view-pendencias`, com seções diferentes;
- `cli:<id>` e `rev:<id>` representam uma família com várias instâncias.

O React exibe 7 entradas de negócio: 5 superfícies funcionais e 2 placeholders
(`Etiqueta` e `Vendas`). Os fluxos auxiliares em drawer/modal não entram como
telas principais.

## Resumo executivo

| Indicador | Quantidade |
|---|---:|
| Famílias de destinos atuais | 15 |
| Superfícies funcionais em React | 5 |
| Famílias ainda sem superfície React funcional | 10 |
| Placeholders React | 2 |

Os números não significam 33% de paridade funcional. As 5 superfícies React
ainda cobrem apenas parte das ações equivalentes do legado.

## Destinos atuais

| # | Domínio | Destino atual | Chave no legado | React atual | Estado |
|---:|---|---|---|---|---|
| 1 | Etiquetas | Peças / fila | `etiquetas` | placeholder `Etiqueta` | legado exclusivo |
| 2 | Etiquetas | Impressão | `etq-print` | não existe | legado exclusivo |
| 3 | Estoque | Visão geral + Estoque Total | `geral` | `EstoqueTotalPage` | React funcional, paridade parcial |
| 4 | Catálogo | Cadastro de produtos | `cadastro` | não existe | legado exclusivo |
| 5 | Catálogo | Publicar na Nuvemshop | `publicar` | não existe | legado exclusivo |
| 6 | Nuvemshop | Integração / panorama | `loja` | `NuvemshopPage` | React funcional, paridade parcial |
| 7 | Pendências / Reconciliação | Central | `central` | `ReconciliacaoPage` | React funcional, escopo parcial |
| 8 | Vendas | Lançamentos | `vendas` | placeholder `Vendas` | legado exclusivo |
| 9 | Analytics | Painel comercial | `vendas-painel` | não existe | legado exclusivo |
| 10 | Saídas | Saídas sem faturamento | `vendas-saidas` | não existe | legado exclusivo |
| 11 | Clientes | Lista / CRM | `clientes` | apenas busca global | legado exclusivo como tela |
| 12 | Clientes | Perfil | `cli:<id>` | busca React abre o legado | legado exclusivo como tela |
| 13 | Revendedoras | Visão geral | `revgeral` | `VisaoGeralRevendedoras` | React funcional, paridade parcial |
| 14 | Revendedoras | Todas as revendedoras | `revlist` | cards dentro da visão geral, sem tela equivalente | legado exclusivo como destino |
| 15 | Revendedoras / Maletas | Perfil da revendedora | `rev:<id>` | `RevendedoraPage` | React funcional, paridade parcial |

## Fluxos auxiliares fora da contagem

| Fluxo | Estado atual |
|---|---|
| Conectar/desconectar | existe no shell React e no legado |
| Busca global de clientes | existe no React, mas termina no perfil legado |
| Nova revendedora | drawer React funcional |
| Sugestões de maleta | drawer React funcional |
| Criar maleta e adicionar itens | fluxo React funcional |
| Acerto/cancelamento/importação de maleta | legado |
| Inventário: contar, concluir e ajustar | legado |
| Editar produto, foto, kit, SKU e variações | legado |
| Ajustes/configurações | legado; planejamento de maletas tem estado local no React |

## Evidências principais

- Navegação React: `frontend/src/app/App.tsx` e `frontend/src/app/AppShell.tsx`.
- Estoque React: `frontend/src/features/estoque/EstoqueArea.tsx`.
- Revendedoras React: `frontend/src/features/revendedoras/RevendedorasArea.tsx`.
- Navegação legada: `src/dashboard.tpl.html`, `switchTab()` e `renderTabs()`.
- Contratos consumidos: `docs/architecture/API-ROUTES-BASELINE.md`.
