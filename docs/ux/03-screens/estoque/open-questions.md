# Decisões abertas — Estoque

Pergunta que precisa de resposta humana antes desta tela virar implementável.
Fechada: mover para a linha de decisões com data e resposta, **sem apagar** a
pergunta.

## Abertas

| # | Pergunta | Quem decide | Trava o quê | Desde |
|---|---|---|---|---|
| EST-Q001 | Qual é a fórmula e a fonte de `Saúde do estoque`/`98% conciliado`? | Gustavo + arquitetura | card de saúde sem número decorativo | 10/09/2026 |
| EST-Q002 | `Valor estimado do estoque` usa preço de venda, custo histórico auditável ou outra medida? | Gustavo | card monetário e total por produto | 10/09/2026 |
| EST-Q003 | O que aparece no painel inferior quando `Saúde do estoque` está selecionado: diagnóstico, pendências, resumo do último resultado ou combinação? | Gustavo | terceiro contexto do bloco Inventário | 10/09/2026 |
| EST-Q006 | Quais filtros e paginação o histórico de inventários precisa quando houver volume real? | Gustavo | controles da lista histórica | 10/09/2026 |
| EST-Q007 | Como destacar `deltaPos` e movimentações posteriores: aviso geral, marca por linha ou ambos; a aplicação exige confirmação adicional? | Gustavo + contrato Fase 4.4 | revisão segura de resultado alterado depois da contagem | 10/09/2026 |
| EST-Q009 | Quais perfis podem começar, pausar, retomar, concluir, cancelar e aplicar divergências? | Gustavo | matriz de permissões e visibilidade das ações | 10/09/2026 |
| EST-Q010 | Em qual contexto a usuária resolve depois uma pendência `Não sei a variação`: durante a sessão, no fechamento/revisão ou em ambos? | Gustavo + contrato Fase 4.4 | caminho de resolução da identidade pendente | 10/09/2026 |

## Fechadas

| # | Pergunta | Resposta | Quem | Data |
|---|---|---|---|---|
| EST-D001 | Inventário abre como módulo separado? | Não. É uma experiência embutida em Estoque e troca somente o contexto do bloco Inventário. | Gustavo | 10/09/2026 |
| EST-D002 | Os cards Saúde, Último inventário e Inventário em aberto são apenas indicadores? | Não. Funcionam como atalhos de contexto para o conteúdo inferior do mesmo bloco. | Gustavo | 10/09/2026 |
| EST-D003 | Quais ações ficam visíveis durante a contagem? | `Pausar` e `Finalizar inventário`. Finalizar encerra a captura e abre Fechamento/Revisão; não aplica ajustes. | Gustavo | 10/09/2026 |
| EST-D004 | `Não contado` pode ser representado como zero e onde aparece `Contado zero`? | Não. Zero só existe após gesto explícito, oferecido na revisão/confirmação de peça não encontrada; não fica como botão permanente junto à bipagem. | contrato Fase 4.4 + Gustavo | 10/09/2026 |
| EST-D005 | A contagem precisa sobreviver entre dias e dispositivos? | Sim. Inclusões, correções, remoções e `não sei` são persistidos incrementalmente. | contrato Fase 4.4 | 10/09/2026 |
| EST-D006 | `naoConferido` e `naoComparavel` podem participar de ajuste em lote? | Nunca. Não possuem checkbox, sugestão de ajuste nem participação em selecionar todos. | contrato Fase 4.4 | 10/09/2026 |
| EST-D007 | O que o frontend envia ao aplicar uma divergência? | Envia as identidades autorizadas e, se preenchida, a observação opcional. Não envia quantidade: o backend deriva o ajuste. | contrato Fase 4.4 + Gustavo | 10/09/2026 |
| EST-D008 | `Não sei a variação` e `Contado zero` ficam permanentes na captura principal? | Não. `Não sei` aparece após conflito/seleção de variação; zero aparece na revisão/confirmação de peça não encontrada. | Gustavo | 10/09/2026 |
| EST-D009 | Como o conflito de múltiplas variações é resolvido durante a contagem? | Uma interação contextual apresenta apenas variações reais do sistema. A usuária escolhe uma identidade ou registra `Não sei` como pendência; não há texto livre nem opção inventada. | Gustavo | 10/09/2026 |
| EST-D010 | Onde abre o detalhe de um inventário do histórico? | Substitui a lista no conteúdo contextual do bloco Inventário e oferece `Voltar ao histórico`, sem sair de Estoque. | Gustavo | 10/09/2026 |
| EST-D011 | Inventário finalizado implica 100% conciliado? | Não. Pode terminar com sucesso, com pendências ou cancelado/equivalente e preservar não conferidos, não comparáveis, desconhecidos e divergências não aplicadas. | Gustavo | 10/09/2026 |

Decisão que afeta mais de uma tela mora em
[06-backlog/pending-decisions.md](../../06-backlog/pending-decisions.md), não aqui.
