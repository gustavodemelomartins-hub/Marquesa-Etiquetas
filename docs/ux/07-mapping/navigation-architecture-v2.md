# Arquitetura de navegação — Sistema Marquesa V2

**Tarefa:** `ARQ-009` · **Estado:** `READY FOR GUSTAVO REVIEW`
**Atualização:** 19/09/2026 · **Escopo:** protótipo estático e handoff.

## Princípio adotado

O produto tem uma entrada única em `/prototype/` e expõe diretamente todos os
módulos. Nenhuma área depende de `Mais`, carrossel, arquivo HTML aberto à mão ou
rede local. A mesma navegação aparece nas 18 rotas públicas.

## Navegação global

| Ordem | Módulo | Subáreas explícitas |
|---|---|---|
| 1 | Home | Hoje e Agenda |
| 2 | Vendas | Nova venda, Monte seu Colar, Saídas e Histórico |
| 3 | Clientes | Lista, perfil, cadastro e edição |
| 4 | Financeiro | A receber, recebimentos e histórico |
| 5 | Estoque | Visão geral e Inventário |
| 6 | Catálogo | Produtos, conteúdo e fotos |
| 7 | Revendedoras | Maletas e acertos |
| 8 | Garantias/Reparos | Casos, prazos e trocas |
| 9 | Etiquetas | Preparação, impressão e histórico |
| 10 | Nuvemshop | Publicação, publicados, pendências e sincronização |
| 11 | Agenda | Calendário operacional |
| 12 | Notificações | Central e destinos |
| 13 | Configurações | Preferências, perfil e conexão |

O Hub e o Design system são rotas adicionais de revisão. No desktop os links se
distribuem em linhas conforme a largura. No mobile formam uma grade compacta com
texto e permanecem no fluxo da página, sem esconder módulos.

## Relações entre domínios

- Clientes abre a conta correspondente em Financeiro e os casos em Garantias.
- Estoque governa saldo e razão; Catálogo governa cadastro, conteúdo e mídia.
- Inventário é uma subárea operacional de Estoque e não corrige saldo sozinho.
- Revendedoras concentra maletas, circulação, agenda e acertos.
- Nuvemshop concentra preparação, revisão, aprovação simulada, publicação,
  produtos observados, pendências e divergências.
- Agenda reúne compromissos manuais e datas derivadas, mantendo a origem.

## Entradas diretas

`prototype/routes.json` é o manifesto único de rotas, navegação, fluxos e
contagem. `prototype/system.js` monta o cabeçalho e resolve fragmentos. Todas as
entradas usam URLs públicas sob `/prototype/`, preservam parâmetros e fragmentos
e funcionam em abertura direta, recarga e voltar/avançar.

## Decisões ainda abertas

1. Matriz de permissões para ações críticas e dados de custo.
2. Fórmulas definitivas dos indicadores operacionais.
3. Regras de crédito e diferença negativa em trocas.

Nenhuma decisão visual deste documento representa aprovação humana do produto.
