# Estados de UI — Vendas

Toda tela deste sistema mostra dado que representa peça física ou dinheiro.
Por isso o estado **incerto** é obrigatório e nunca pode ser desenhado como
sucesso: quando o número é ambíguo, a tela mostra a ambiguidade e para.

| Estado | Quando ocorre | O que a tela mostra | O que o usuário pode fazer | Definido? |
|---|---|---|---|---|
| carregando | requisição em voo | estrutura e escala do gráfico preservadas; skeleton não muda o layout | aguardar ou trocar de área | parcial |
| vazio | nenhum registro existe ainda | orientação sobre como registrar a primeira venda | ir para Lançamentos | parcial |
| sem resultado | período/filtro não casou venda elegível | período ativo, mensagem clara e ação para limpar seleção | limpar ou trocar o período | sim, conceito |
| parcial | parte do dado veio, parte falhou | blocos disponíveis e aviso nomeando o que falta | tentar novamente o bloco | parcial |
| incerto | pagamento, origem ou identidade não permite cálculo confiável | números conhecidos separados da pendência; nunca soma silenciosa | abrir a pendência pertinente | sim, regra |
| erro de rede | API não respondeu | erro no bloco afetado sem apagar a seleção temporal | tentar novamente | parcial |
| erro de permissão | chave ausente ou inválida | | | não |
| sucesso | tudo carregado | painel proporcional, período e visão ativos visíveis | analisar, selecionar mês/intervalo ou alternar visão | sim, desktop |
| ação em progresso | escrita enviada, sem confirmação | | | não |
| ação recusada | o sistema decidiu não fazer e explica por quê | | | não |

**"vazio" ≠ "sem resultado" ≠ "zero".** São três telas diferentes: nada
cadastrado, filtro restritivo, e saldo legitimamente zero. Tratar as três como
uma só é o erro mais comum nesta família de telas.

## Estados da seleção analítica

| Estado | Sinal na interface | Efeito no conteúdo |
|---|---|---|
| período geral | um preset ou intervalo aparece ativo | Análise detalhada resume todo o período; Evolução mostra sua série |
| mês selecionado | barra, rótulo e controle de mês ficam destacados | bloco inferior mostra apenas aquele mês |
| intervalo personalizado | início e fim aparecem juntos e podem ser limpos | blocos inferiores agregam o intervalo contínuo |
| sem seleção específica | nenhuma barra fica marcada; ação de limpar some ou fica inativa | conteúdo volta ao período geral |

## Estados do lançamento

| Estado | Sinal na interface | Efeito nas ações |
|---|---|---|
| rascunho vazio | tipo ativo e campos sem itens | finalizar desabilitado; limpar venda inativo |
| rascunho preenchido | itens e totais calculados | trocar de tipo ou limpar pede confirmação se perder dados |
| item não encontrado | busca informa nome/SKU/código lido | permite corrigir ou buscar novamente |
| item ambíguo | mais de uma variação possível | exige escolher a peça exata; não baixa por aproximação |
| sem preço | produto existe, mas preço é desconhecido | bloqueia a venda sem converter para R$ 0 |
| estoque insuficiente | quantidade ou componente excede o disponível | bloqueia a quantidade e identifica o limitante |
| edição de preço aberta | preço unitário foi ativado por clique ou teclado | mostra preço de tabela, preço final, desconto derivado e motivo sem deslocar toda a tela |
| preço alterado sem motivo | preço final difere da tabela e o motivo está vazio | identifica o campo obrigatório e bloqueia aplicar/finalizar |
| desconto aplicado | preço final e motivo são válidos | mostra tabela riscada, preço cobrado destacado e totais recalculados |
| desconto parcial em quantidade múltipla | somente parte das unidades iguais recebe outro preço | separa as unidades afetadas em nova linha do mesmo SKU |
| preço restaurado | preço final volta a ser igual ao preço de tabela | remove desconto/motivo daquela linha e pode reagrupar linhas equivalentes |
| sem recebimentos | nenhum lançamento de pagamento foi adicionado | recebido R$ 0, saldo integral a receber e estado derivado A RECEBER |
| pagamento simples | um lançamento pago cobre o total | resumo compacto, estado derivado PAGO e finalização imediata |
| pagamento misto | dois ou mais lançamentos cobrem a venda | linhas por forma, recebido, a receber e estado derivado atualizados |
| parcial | recebimentos pagos somam mais que zero e menos que o total | estado derivado PARCIAL e saldo restante destacado |
| parcelado | a venda foi distribuída em parcelas | sequência, valor, vencimento e estado individual de cada parcela |
| lançamento incompleto | falta forma, valor, data efetiva ou vencimento exigido | linha identifica o campo pendente e bloqueia finalização |
| valor não distribuído | pagos + pendentes não cobrem todo o valor da venda | saldo ainda sem recebimento planejado e ação para completar |
| distribuição excedente | soma dos lançamentos ultrapassa o valor da venda | excesso destacado; comportamento depende de decisão sobre troco/crédito |
| finalizando | escrita enviada, ainda não confirmada | bloqueia clique duplicado e não mostra sucesso antecipado |
| concluído | venda e movimentos foram confirmados | mostra resumo/recibo conforme decisão e limpa o rascunho uma vez |
| resultado incerto | conexão caiu sem resposta conclusiva | preserva rascunho e consulta o resultado antes de permitir repetir |

## Estados de cada recebimento/parcela

| Estado | Campos exigidos | Efeito financeiro | Ação principal |
|---|---|---|---|
| pago | valor, forma e data efetiva | soma em recebido e faturamento na data efetiva | ver/corrigir conforme permissão |
| pendente | valor, forma e vencimento | soma no planejamento; não é faturamento | marcar como pago quando receber |
| vencido | pendente com vencimento anterior à data atual | continua a receber e recebe alerta | registrar recebimento ou ajustar prazo |
| em edição | linha nova ou alterada ainda não confirmada | não altera os totais persistidos | salvar ou descartar |
| salvando | gravação em andamento | evita clique repetido | aguardar |
| incerto | resposta da gravação não foi conclusiva | não duplica nem assume pagamento | consultar antes de repetir |
| estornado/corrigido | recebimento anterior ganhou contrapartida ou nova versão | recalcula recebido, saldo e status derivado | consultar trilha |

## Apresentação progressiva

- estado inicial mostra resumo `Venda`, `Recebido` e `A receber`, uma linha
  compacta e `+ Adicionar pagamento`;
- no caminho rápido, o valor vem preenchido com o saldo restante; escolher PIX
  e manter `Pago hoje` é suficiente para uma venda integral;
- `Mais opções` expande data, observação e demais formas sem poluir o caminho
  comum;
- `Parcelar` gera as linhas numeradas e mantém cada parcela editável;
- lançamentos concluídos podem recolher para uma linha-resumo, sem esconder
  forma, valor e estado.

## Estados de saída sem faturamento

| Estado | Sinal na interface | Efeito nas ações |
|---|---|---|
| motivo não escolhido | nenhum dos quatro motivos está confirmado | registrar desabilitado |
| explicação incompleta | falta observação ou contexto obrigatório | mostra o que precisa ser preenchido |
| registrando | baixa foi enviada e ainda não confirmou | impede envio duplicado |
| concluída | saída e movimento correspondente foram confirmados | aparece no histórico, fora das métricas de venda |
| estornada | contrapartida devolveu a peça | preserva linha original e identifica estorno |
| incerta | não há confirmação segura da baixa | não exibe `Concluída`; orienta consultar antes de repetir |

## Estados do histórico detalhado

| Estado | Sinal na interface | Efeito no conteúdo |
|---|---|---|
| filtrado | período e filtros ativos permanecem visíveis | cards, tabela, rodapé e exportação usam o mesmo conjunto |
| sem resultado | filtros válidos não encontram registro | mantém filtros e oferece limpar |
| página vazia | página deixou de existir após mudança de filtro | volta para a última página válida |
| exportando | arquivo está sendo preparado | evita exportações duplicadas e mantém a consulta utilizável |
| detalhe aberto | linha selecionada abre todos os itens e eventos | ações respeitam situação operacional e financeira separadamente |
