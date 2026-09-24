# Fluxo: lançar venda e consultar histórico

**Quem:** Sthefany Marques ou outro perfil autorizado  
**Começa em:** Vendas › Lançamentos  
**Termina em:** venda confirmada, visível no dia e consultável em detalhe

## Passos

| # | Onde | Ação | Resultado | Escreve no banco? |
|---:|---|---|---|---|
| 1 | Lançamentos | escolher Venda normal ou Monte seu Colar | rascunho do tipo selecionado | não |
| 2 | Itens/Personalização | buscar ou escanear peças; configurar cada posição quando montável | itens válidos e totais preliminares | não |
| 3 | Dados da venda | identificar cliente, data, canal/local e observação | contexto comercial completo | cliente novo pode escrever; rascunho ainda não |
| 4 | Preço | ativar o preço unitário, informar preço final e justificar a diferença; separar automaticamente unidades quando só parte recebe outro preço | desconto individual e auditável, com subtotal recalculado | não |
| 5 | Pagamento | adicionar um ou mais lançamentos pagos/pendentes ou gerar parcelas | recebido, a receber e status são derivados em tempo real | ainda não; grava com a venda na finalização |
| 6 | Finalização | revisar e confirmar uma vez | venda, itens, baixa física e recebimentos iniciais são registrados | sim; escrita crítica e idempotente |
| 7 | Vendas do dia | conferir a nova operação | linha aparece com estados operacional e financeiro | não, leitura |
| 8 | Histórico completo | abrir período, filtrar e selecionar uma linha | detalhe, recibo e ações autorizadas | leitura; correções/estorno escrevem separadamente |

## Onde pode falhar

| Ponto | Falha | O que o usuário vê | Recuperação |
|---|---|---|---|
| item | SKU ausente, ambíguo, sem preço ou sem estoque | motivo preciso e item não incluído silenciosamente | corrigir busca/variação ou cadastro |
| personalização | base/componente insuficiente, inclusive SKU repetido mais vezes que o saldo | posição, SKU, quantidade exigida e disponível | trocar uma opção ou o modelo |
| desconto | preço mudou sem motivo | campo de motivo obrigatório | explicar ou restaurar tabela |
| desconto em quantidade | somente parte das unidades iguais recebe outro preço | prévia das duas linhas e respectivas quantidades | confirmar a separação automática ou cancelar a edição |
| pagamento | linha sem valor/forma/data exigida, saldo não distribuído ou excesso | linha e diferença exatas | completar ou corrigir antes de finalizar |
| finalização | resposta incerta ou retry | rascunho preservado e consulta do resultado | confirmar existência antes de repetir |

## Invariantes

- a baixa ocorre uma vez; pagamento posterior nunca baixa de novo;
- PAGO, PARCIAL e A RECEBER derivam dos recebimentos, não de seleção manual;
- cada parcela paga entra no faturamento por sua data efetiva;
- valor vendido e faturamento usam datas e significados diferentes;
- preço final diferente da tabela exige motivo; desconto parcial numa quantidade
  separa as unidades sem alterar a quantidade total nem o estoque;
- cancelamento/estorno preserva histórico;
- Monte seu Colar baixa base e todos os componentes uma vez;
- repetir cor/SKU entre slots é permitido; a disponibilidade soma todas as
  ocorrências do mesmo componente;
- saída sem faturamento não passa por este fluxo como venda.

## Decisões abertas

Ver `VEN-Q009`, `VEN-Q012` a `VEN-Q018` e `VEN-Q025` a `VEN-Q028` em
[Vendas](../03-screens/vendas/open-questions.md).
