# Decisões abertas — Vendas

Pergunta que precisa de resposta humana antes desta tela virar implementável.
Fechada: mover para a linha de decisões com data e resposta, **sem apagar** a
pergunta.

## Abertas

| # | Pergunta | Quem decide | Trava o quê | Desde |
|---|---|---|---|---|
| VEN-Q001 | O intervalo personalizado será escolhido por dois campos de mês, por seleção de duas barras, por arraste no gráfico ou por uma combinação acessível desses controles? | Gustavo | interação final de `IF-001` | 10/09/2026 |
| VEN-Q002 | O intervalo personalizado trabalha apenas com meses completos ou também aceita datas exatas? | Gustavo | fórmula, rótulo e necessidade de API | 10/09/2026 |
| VEN-Q003 | “Produtos mais vendidos” ordena por peças, faturamento ou participação? Qual é o denominador da participação? | Gustavo | tabela da Análise detalhada | 10/09/2026 |
| VEN-Q004 | “Dia mais forte” significa maior faturamento recebido, maior valor vendido, mais vendas ou mais peças? | Gustavo | Destaques do mês | 10/09/2026 |
| VEN-Q005 | Qual população entra no Ticket médio desta visão mensal? | Gustavo | Destaques do mês | 10/09/2026 |
| VEN-Q006 | Ao selecionar um mês no gráfico, a visão deve sempre trocar para Evolução por mês ou apenas atualizar a seleção preservando a aba atual? | Gustavo | ligação entre gráfico e seletor de visão | 10/09/2026 |
| VEN-Q007 | A faixa de Reparos pertence permanentemente ao Painel de Vendas ou é um alerta global reaproveitado em outras áreas? | Gustavo | responsabilidade do bloco e navegação de destino | 10/09/2026 |
| VEN-Q008 | A preferência por títulos escuros vale para todos os H1/H2 do sistema, deixando bordô apenas para seleção, CTA e números, ou há títulos que continuam bordô? | Gustavo | regra tipográfica global | 10/09/2026 |
| VEN-Q009 | Ao clicar em `Ver todas`/`Detalhes` nas vendas do dia, o histórico completo abre filtrado naquele dia ou no período padrão de 7 dias? | Gustavo | continuidade entre resumo e histórico | 10/09/2026 |
| VEN-Q012 | Toda venda exige cliente identificado ou o balcão aceita venda sem cadastro? | Gustavo + Sthefany Marques | validação e criação rápida de cliente | 10/09/2026 |
| VEN-Q013 | Quais opções pertencem a `local/canal` e quais pertencem à origem estrutural da venda? | Gustavo | filtros, badges e métricas sem misturar balcão, WhatsApp, site e acerto | 10/09/2026 |
| VEN-Q014 | `Vendas de hoje` mostra apenas vendas ou todo o histórico comercial do dia, que hoje também pode incluir maleta, saída sem faturamento e troca? | Gustavo | escopo da tabela resumida | 10/09/2026 |
| VEN-Q015 | Quais ações existem no menu de cada venda: ver detalhes, recibo, corrigir SKU, registrar/estornar pagamento e cancelar/estornar venda? | Gustavo | detalhe e permissões por linha | 10/09/2026 |
| VEN-Q016 | Uma venda pode misturar peças normais e um ou mais Monte seu Colar no mesmo carrinho, como sugere o primeiro mockup? | Gustavo | modelo do rascunho e finalização | 10/09/2026 |
| VEN-Q017 | No Monte seu Colar, cada posição é escolhida separadamente e a ordem esquerda→direita precisa ser preservada? | Gustavo + Sthefany Marques | modelos com duas ou três crianças do mesmo tipo | 10/09/2026 |
| VEN-Q018 | A base Veneziana 45 cm continua padrão, mas pode ser trocada durante a composição? | Gustavo + Sthefany Marques | estoque, preço e interface da personalização | 10/09/2026 |
| VEN-Q019 | Confirmamos o seletor de saídas com quatro motivos estruturais (`brinde`, `uso próprio`, `perda`, `sorteio`) e retiramos `ajuste` deste fluxo? | Gustavo | coerência com estoque e inventário | 10/09/2026 |
| VEN-Q020 | A observação da saída deixa de ser opcional, como exige a regra auditável atual, ou haverá outro campo obrigatório que já explique suficientemente o motivo? | Gustavo | validação de saída sem faturamento | 10/09/2026 |
| VEN-Q021 | O que significa `Impacto estimado`: preço de tabela retirado, custo da peça ou outra medida? | Gustavo | fórmula, nome e fonte do indicador | 10/09/2026 |
| VEN-Q022 | `Responsável ou destino` muda conforme o motivo — cliente para brinde, área/pessoa para uso próprio, ocorrência para perda e campanha para sorteio? | Gustavo + Sthefany Marques | campos condicionais e relatório | 10/09/2026 |
| VEN-Q023 | Saída sem faturamento pode ser lançada com data retroativa e deve recusar data futura, como a venda? | Gustavo | regra temporal e histórico | 10/09/2026 |
| VEN-Q024 | Exportar gera CSV, XLSX ou PDF e inclui todos os resultados filtrados ou somente a página visível? | Gustavo | exportação das duas listas | 10/09/2026 |
| VEN-Q025 | Quem pode conceder desconto, registrar/estornar saída, cancelar venda e exportar histórico? | Gustavo | matriz de permissões | 10/09/2026 |
| VEN-Q027 | Depois de finalizar, o sistema mostra resumo/recibo e oferece impressão ou envio, ou retorna direto ao rascunho vazio? | Gustavo + Sthefany Marques | confirmação e próximo passo | 10/09/2026 |
| VEN-Q028 | Ao exceder o disponível, a tela bloqueia a quantidade imediatamente e explica qual SKU/componente limitou a venda? | Gustavo | prevenção de estoque negativo | 10/09/2026 |
| VEN-Q029 | Se os pagamentos pagos/planejados ultrapassarem o valor da venda, o sistema bloqueia, registra troco ou cria crédito para a cliente? | Gustavo | validação do total e estado PAGO com excesso | 10/09/2026 |
| VEN-Q030 | Como funciona `Crédito da cliente`: de onde nasce o saldo, quando ele foi faturado e consumir o crédito evita faturar o mesmo dinheiro novamente? | Gustavo | regra financeira da forma Crédito da cliente | 10/09/2026 |
| VEN-Q031 | Em cartão e link, a data efetiva é o dia da cobrança aprovada ou o dia do repasse; faturamento usa valor bruto ou líquido de taxa? | Gustavo + Sthefany Marques | data e valor do faturamento | 10/09/2026 |
| VEN-Q032 | Ao parcelar, qual padrão gera vencimentos: mensal a partir de uma primeira data, dia fixo do mês ou preenchimento manual? | Gustavo + Sthefany Marques | ação Parcelar e geração das linhas | 10/09/2026 |
| VEN-Q033 | A venda só pode finalizar quando pagos + pendentes distribuírem 100% do total? | Gustavo | tratamento de saldo ainda não planejado | 10/09/2026 |
| VEN-Q034 | Como corrigir um recebimento já salvo: editar com histórico, estornar e recriar, ou ações diferentes conforme o campo? | Gustavo | auditoria financeira e permissões | 10/09/2026 |
| VEN-Q035 | A forma `Outro` exige uma descrição curta obrigatória? | Gustavo | qualidade dos filtros e histórico | 10/09/2026 |

## Fechadas

| # | Pergunta | Resposta | Quem | Data |
|---|---|---|---|---|
| VEN-D001 | Slots do mesmo grupo no Monte seu Colar podem repetir o mesmo SKU/cor? | Sim. A escolha é válida quando o estoque elegível do SKU cobre a soma das posições que o utilizam. | Gustavo | 10/09/2026 |
| VEN-D002 | Como a condição de pagamento é informada na Nova Venda? | A venda recebe vários lançamentos de pagamento. PAGO, PARCIAL e A RECEBER são derivados da soma efetivamente recebida; não são opções manuais. | Gustavo | 10/09/2026 |
| VEN-D003 | Situação da venda e situação financeira ficam separadas? | Sim. Estado operacional e status derivado dos recebimentos são dimensões visuais e conceituais diferentes. | Gustavo | 10/09/2026 |
| VEN-D004 | Como o desconto é aplicado quando há uma ou várias unidades do mesmo SKU? | A edição acontece no preço unitário de cada item. Sthefany Marques informa o preço final e o motivo; desconto é derivado. Se apenas parte das unidades iguais receber outro preço, o sistema separa automaticamente essas unidades em nova linha. Não existe desconto geral distribuído. | Gustavo | 10/09/2026 |

Decisão que afeta mais de uma tela mora em
[06-backlog/pending-decisions.md](../../06-backlog/pending-decisions.md), não aqui.
