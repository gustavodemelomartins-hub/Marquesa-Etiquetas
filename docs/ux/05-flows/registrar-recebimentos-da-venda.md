# Fluxo: registrar recebimentos da venda

**Quem:** Sthefany ou outro perfil autorizado  
**Começa em:** bloco Pagamento da Nova Venda ou cobrança pendente no histórico  
**Termina em:** recebimentos auditados e totais/status derivados atualizados

## Passos na Nova Venda

| # | Onde | Ação | Resultado | Escreve no banco? |
|---:|---|---|---|---|
| 1 | Resumo da venda | sistema calcula o valor total cobrado | Venda, Recebido e A receber aparecem separados | não |
| 2 | Pagamento rápido | escolher forma; valor vem com o saldo restante e estado inicial é Pago hoje | venda simples integral pronta em uma linha | não |
| 3 | Pagamento misto | usar `+ Adicionar pagamento` | nova linha independente para outra forma/estado | não |
| 4 | Pagamento pendente | marcar linha como Pendente e informar vencimento | valor permanece fora do recebido/faturamento | não |
| 5 | Parcelamento | gerar e revisar parcelas numeradas | cada parcela ganha valor, vencimento e estado próprios | não |
| 6 | Finalização | confirmar venda e lançamentos válidos | venda, baixa de estoque e recebimentos iniciais são gravados uma vez | sim; escrita crítica |

## Passos depois da venda

| # | Onde | Ação | Resultado | Escreve no banco? |
|---:|---|---|---|---|
| 7 | Histórico/Financeiro | abrir venda ou parcela pendente | composição financeira completa fica visível | não |
| 8 | Recebimento | marcar lançamento pendente como pago e informar data efetiva/forma real | soma em recebido e faturamento na data efetiva | sim; nunca estoque |
| 9 | Correção/estorno | corrigir lançamento sem apagar o anterior | trilha preservada e valores/status recalculados | sim; operação auditável |

## Cálculo contínuo

```text
recebido = soma(pagamentos pagos)
a receber = máximo(valor da venda − recebido, 0)

recebido = 0       → A RECEBER
0 < recebido < total → PARCIAL
recebido >= total  → PAGO
```

## Onde pode falhar

| Ponto | Falha | O que o usuário vê | Recuperação |
|---|---|---|---|
| linha paga | falta forma, valor ou data efetiva | campo obrigatório na própria linha | completar antes de confirmar |
| linha pendente | falta forma, valor ou vencimento | vencimento obrigatório e saldo afetado | completar ou remover a linha |
| distribuição | total planejado não fecha ou excede a venda | valor faltante/excedente explícito | ajustar lançamentos conforme política definida |
| concorrência | parcela foi alterada em outra tela | versão atual e ação recusada sem duplicar valor | recarregar e decidir novamente |
| conexão | confirmação ficou incerta | nenhum novo clique de cobrança até consultar o estado | reconciliar pelo identificador idempotente |

## Invariantes

- estado financeiro é derivado, nunca digitado;
- uma venda pode ter várias formas e várias parcelas;
- cada recebimento pago fatura na sua data efetiva;
- pendente não é recebido e não é faturamento;
- receber, corrigir ou estornar pagamento não movimenta estoque;
- venda e histórico preservam os lançamentos individuais, não somente o total.

## Decisões abertas

`VEN-Q029` a `VEN-Q035` em
[Vendas](../03-screens/vendas/open-questions.md).
