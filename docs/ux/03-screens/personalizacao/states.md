# Estados de UI — Personalização

Toda tela deste sistema mostra dado que representa peça física ou dinheiro.
Por isso o estado **incerto** é obrigatório e nunca pode ser desenhado como
sucesso: quando o número é ambíguo, a tela mostra a ambiguidade e para.

| Estado | Quando ocorre | O que a tela mostra | O que o usuário pode fazer | Definido? |
|---|---|---|---|---|
| carregando | requisição em voo | | | não |
| vazio | nenhum registro existe ainda | | | não |
| sem resultado | filtro não casou nada | | | não |
| parcial | parte do dado veio, parte falhou | | | não |
| incerto | dado conflitante ou divergência não resolvida | | | não |
| erro de rede | API não respondeu | | | não |
| erro de permissão | chave ausente ou inválida | | | não |
| sucesso | tudo carregado | | | não |
| ação em progresso | escrita enviada, sem confirmação | | | não |
| ação recusada | o sistema decidiu não fazer e explica por quê | | | não |

## Estados da composição

| Estado | Quando ocorre | O que a tela mostra | O que o usuário pode fazer | Definido? |
|---|---|---|---|---|
| modelo escolhido | o modelo determinou os slots necessários | uma escolha separada para cada posição | preencher os slots | sim, conceito |
| slot vazio | uma posição obrigatória ainda não foi escolhida | posição pendente sem simular composição completa | escolher cor/SKU | sim |
| repetição válida | dois ou mais slots usam o mesmo SKU e há saldo agregado suficiente | mesma opção selecionada nas posições, sem alerta | concluir normalmente | sim |
| repetição sem saldo | o mesmo SKU foi escolhido `N` vezes e o disponível é menor que `N` | opção/posições afetadas e texto “precisa de N, disponível M” | trocar uma escolha ou repor estoque | sim |
| componente indisponível | escolha não possui unidade elegível | opção indisponível com motivo | escolher outra opção | sim |
| composição válida | todos os slots estão preenchidos e o conjunto cabe no estoque | resumo do modelo e escolhas | adicionar à venda | sim |
| estoque mudou | disponibilidade mudou entre seleção e confirmação | composição deixa de estar pronta e informa o SKU afetado | revisar escolhas | sim |

**"vazio" ≠ "sem resultado" ≠ "zero".** São três telas diferentes: nada
cadastrado, filtro restritivo, e saldo legitimamente zero. Tratar as três como
uma só é o erro mais comum nesta família de telas.
