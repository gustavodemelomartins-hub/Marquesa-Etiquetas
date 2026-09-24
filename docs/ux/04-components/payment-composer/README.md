# Componente: Compositor de pagamentos

Área reutilizável para distribuir o valor de uma venda em um ou mais
recebimentos, sem obrigar o caso simples a usar o modo avançado.

Isto é especificação de produto, não componente React nem contrato de API.

## Anatomia

1. resumo persistente: `Venda`, `Recebido`, `A receber` e status derivado;
2. uma ou mais linhas de pagamento;
3. ação `+ Adicionar pagamento`;
4. ação `Parcelar`;
5. expansão `Mais opções` para campos menos frequentes.

## Linha de pagamento

| Campo | Pago | Pendente |
|---|---|---|
| valor | obrigatório | obrigatório |
| forma | obrigatória | obrigatória |
| estado | `Pago` | `Pendente` |
| data efetiva | obrigatória; padrão visual `hoje`, editável | não se aplica até receber |
| vencimento | opcional para organização | obrigatório |
| observação | opcional | opcional |
| parcela | quando fizer parte de parcelamento | quando fizer parte de parcelamento |

Formas iniciais: PIX, Dinheiro, Cartão de débito, Cartão de crédito,
Transferência, Boleto, Link de pagamento, Crédito da cliente e Outro.

## Variantes

| Variante | Quando usar | Comportamento |
|---|---|---|
| rápida | uma forma paga integralmente | valor recebe o saldo; forma e `Pago hoje` ficam na linha compacta |
| mista | duas ou mais formas/estados | cada lançamento ganha sua linha e os totais derivam da soma |
| parcelada | valores organizados em sequência | gera `N` linhas numeradas e editáveis individualmente |
| somente leitura | histórico, recibo ou detalhe | mostra forma, valor, estado e datas sem campos de edição |

## Regras

- `PAGO`, `PARCIAL` e `A RECEBER` nunca são selecionados manualmente;
- o valor recebido soma somente linhas pagas;
- linha pendente não é faturamento;
- cada linha paga fatura na própria data efetiva;
- adicionar recebimento ou marcar parcela como paga nunca movimenta estoque;
- valores são calculados em centavos inteiros;
- linha nova sugere o saldo restante, mas só existe depois da confirmação;
- correção e estorno preservam histórico;
- `Crédito da cliente` não pode gerar faturamento duplicado; a regra de origem
  do crédito precisa ser fechada antes da implementação.

## Estados

| Estado | Aparência/feedback |
|---|---|
| vazio | saldo integral visível e ação para adicionar pagamento |
| válido | linhas fecham a distribuição e a ação de finalizar está disponível |
| incompleto | campo obrigatório da linha é identificado |
| não distribuído | informa quanto do total ainda não possui pagamento planejado |
| excedente | mostra o excesso e bloqueia até a política ser definida |
| salvando | linha e finalização ficam protegidas contra clique duplicado |
| incerto | não repete a escrita; consulta a situação antes de oferecer nova ação |

## Acessibilidade

- cada linha possui rótulo próprio, inclusive número da parcela;
- status usa texto e ícone, nunca somente cor;
- atalhos de forma são botões reais com foco visível;
- expansão não muda a ordem dos campos já focados;
- resumo é anunciado novamente quando os totais mudam, sem interromper a digitação.

## Referências

- [Regras de Vendas](../../03-screens/vendas/rules.md)
- [Estados de Vendas](../../03-screens/vendas/states.md)
- [Fluxo de recebimentos](../../05-flows/registrar-recebimentos-da-venda.md)
