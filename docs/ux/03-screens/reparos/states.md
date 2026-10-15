# Estados de UI — Reparos

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

**"vazio" ≠ "sem resultado" ≠ "zero".** São três telas diferentes: nada
cadastrado, filtro restritivo, e saldo legitimamente zero. Tratar as três como
uma só é o erro mais comum nesta família de telas.
