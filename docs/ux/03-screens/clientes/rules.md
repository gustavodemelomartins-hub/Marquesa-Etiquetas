# Regras de negócio — Clientes

A fonte canônica é [api/REGRAS.md](../../../../api/REGRAS.md). Este documento
registra somente como o protótipo expõe essas regras.

| Regra | Consequência na tela | Estado |
|---|---|---|
| `cliente_id` é a identidade; nome não é chave | perfil e edição abrem pelo id mesmo com homônimas | confirmada |
| compra, recebimento e saldo são fatos diferentes | valores e eventos aparecem separados | confirmada |
| garantia pertence ao item da compra | pós-venda abre o caso ligado à venda/item | confirmada |
| pagamento e garantia não baixam estoque novamente | linha do tempo não sugere novo movimento | confirmada |
| dado aproximado ou ausente continua visível como tal | a UI não converte ausência em zero | confirmada |
| crédito da cliente ainda não tem regra fechada | bloco mostra `Regra pendente`, sem valor | decisão humana |

## Restrições da interface

1. Busca aceita nome, telefone ou CPF, mas a seleção devolve o id.
2. Edição cadastral não edita fatos financeiros ou comerciais.
3. O painel mostra até cinco indicadores principais; detalhes seguem na linha
   do tempo e no pós-venda.
4. Dados do protótipo são identificados como demonstrativos.

## Permissões

Visualização de custo, estorno, correção financeira e exportação dependem de
uma matriz de capacidades ainda não definida (`V2-DEC-003`).
