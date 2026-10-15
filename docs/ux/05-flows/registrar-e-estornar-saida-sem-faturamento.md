# Fluxo: registrar e estornar saída sem faturamento

**Quem:** perfil autorizado da operação  
**Começa em:** Vendas › Lançamentos › Saída sem faturamento  
**Termina em:** saída auditada no histórico ou estorno registrado

## Passos

| # | Onde | Ação | Resultado | Escreve no banco? |
|---:|---|---|---|---|
| 1 | Novo lançamento | escolher Saída sem faturamento | formulário específico, sem campos de pagamento | não |
| 2 | Itens da saída | buscar/escanear peças e quantidades | lista validada contra o disponível | não |
| 3 | Detalhes | escolher brinde, uso próprio, perda ou sorteio | campos de contexto adequados ao motivo | não |
| 4 | Detalhes | informar data, explicação e responsável/destino aplicável | evento auditável | não |
| 5 | Confirmação | registrar saída uma vez | linha de saída e movimento correspondente | sim; baixa crítica pela razão |
| 6 | Histórico | conferir, filtrar ou exportar | saída aparece fora das métricas de venda | não, leitura |
| 7 | Ações da linha | estornar com motivo | contrapartida devolve a peça e preserva o original | sim; nunca apaga |

## Onde pode falhar

| Ponto | Falha | O que o usuário vê | Recuperação |
|---|---|---|---|
| classificação | motivo ausente ou ajuste de inventário indevidamente misturado | bloqueio e explicação das quatro categorias | escolher natureza correta ou voltar ao Inventário |
| contexto | saída sem explicação auditável | campos faltantes indicados | completar antes de registrar |
| estoque | quantidade indisponível | SKU e quantidade disponíveis | corrigir quantidade ou investigar saldo |
| registro | resultado incerto | não mostrar Concluída; preservar rascunho | consultar a saída antes de repetir |
| estorno | segunda tentativa | ação recusada, original e primeiro estorno visíveis | nenhuma nova baixa/devolução |

## Invariantes

- não cria venda, cliente fictício, faturamento, pagamento ou comissão;
- `sorteio` é categoria própria;
- perda confirmada pode se relacionar ao Inventário, mas não transforma toda
  diferença em perda automaticamente;
- toda baixa ou devolução passa pela razão e mantém o histórico.

## Decisões abertas

Ver `VEN-Q019` a `VEN-Q025` em
[Vendas](../03-screens/vendas/open-questions.md).
