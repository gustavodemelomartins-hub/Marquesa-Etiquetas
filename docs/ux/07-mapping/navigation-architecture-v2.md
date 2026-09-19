# Arquitetura de navegação — Sistema Marquesa V2

**Tarefa:** `DESIGN-V2` · **Estado:** `READY FOR GUSTAVO REVIEW`
**Atualização:** 19/09/2026 · **Escopo:** protótipo estático e handoff.

## O que mudou e por quê

A rodada anterior resolvia "todos os módulos visíveis" empilhando 13 links no
cabeçalho, em duas linhas. Isso gastava ~190 px de altura em toda tela, não dizia
onde a pessoa estava e não tinha hierarquia: Home e Notificações pesavam igual.

O V2 troca o mural por um **casco de aplicativo**: um trilho lateral permanente
com os módulos agrupados, uma barra superior com contexto e conta, e — no
telefone — uma navegação inferior de cinco destinos com gaveta para o resto.
Nenhum módulo ficou atrás de "Mais".

## As três perguntas

| Pergunta | Quem responde |
|---|---|
| **Onde estou?** | trilho lateral (módulo ativo) + barra superior (módulo · grupo) |
| **O que posso fazer aqui?** | cabeçalho da página: título, uma frase e a ação primária |
| **Para onde posso ir?** | abas do módulo, logo abaixo do título, e os links contextuais das listas |

## Navegação global

Treze módulos em quatro grupos. A ordem segue o dia de trabalho, não o alfabeto.

| Grupo | Módulos | Subáreas |
|---|---|---|
| **Operação** | Home · Vendas · Clientes · Financeiro | Hoje e Agenda · Lançamentos, Painel e Histórico · Lista e Painel da cliente · A receber, Recebimentos e Histórico |
| **Produto** | Estoque · Catálogo · Etiquetas · Nuvemshop | Visão geral e Inventário · Produtos, conteúdo e fotos · Preparar, Impressão e Histórico · Publicação, Produtos na loja, Pendências e Divergências |
| **Rede** | Revendedoras · Garantias e reparos | Maletas, circulação e acertos · Casos, prazos e trocas |
| **Sistema** | Agenda · Notificações · Configurações | Calendário operacional · Central e destinos · Preferências, perfil e conexão |

Hub de revisão e Design System continuam como rotas de trabalho, ligadas no pé
do trilho e fora da navegação de produto.

## Comportamento por largura

| Largura | Trilho | Barra superior | Telefone |
|---|---|---|---|
| ≥ 1181 px | 250 px, rótulos e grupos visíveis | contexto, busca global, sino, avatar | — |
| 901–1180 px | 76 px, só ícones, monograma no topo | igual, sem rótulo de grupo | — |
| ≤ 900 px | gaveta sobre o conteúdo, aberta pelo ☰ | ☰ + módulo + sino + avatar | navegação inferior: Home, Vendas, Clientes, Estoque, Menu |

Abas do módulo (`secondary-nav`) foram tiradas do cabeçalho global e passaram a
viver dentro da página, fixas abaixo da barra superior, com rolagem horizontal
segura. Isso separa "em que módulo estou" de "que recorte deste módulo estou
vendo" — dois níveis que antes se misturavam na mesma faixa.

## Relações entre domínios

- **Clientes** deixou de ser uma aba de Vendas e virou módulo próprio
  (`03-screens/clientes/`), com lista e painel de relacionamento. Ele abre a
  conta correspondente em Financeiro e os casos em Garantias.
- **Estoque** governa saldo, distribuição e razão; **Catálogo** governa cadastro,
  conteúdo e mídia; Inventário é subárea operacional de Estoque e não corrige
  saldo sozinho.
- **Nuvemshop** concentra preparação, revisão, aprovação, publicação, produtos
  observados, pendências e divergências. Catálogo e Estoque encaminham à mesma fila.
- **Revendedoras** concentra maletas, circulação, agenda e acertos.
- **Agenda** reúne compromissos manuais e datas derivadas, preservando a origem.

## Entradas diretas

`prototype/routes.json` continua sendo o manifesto único de rotas, navegação,
fluxos e contagem. `prototype/system.js` monta o casco, resolve fragmentos e
publica o dicionário de ícones. Todas as entradas usam URLs públicas sob
`/prototype/`, preservam parâmetros e fragmentos e funcionam em abertura direta,
recarga e voltar/avançar — verificado em cinco larguras.

## Decisões ainda abertas

1. Matriz de permissões para ações críticas e dados de custo.
2. Fórmulas definitivas dos indicadores operacionais.
3. Regras de crédito e diferença negativa em trocas.
4. Se a busca global da barra superior é busca real ou atalho para cada módulo.

Nenhuma decisão visual deste documento representa aprovação humana do produto.
