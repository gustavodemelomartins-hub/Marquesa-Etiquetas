# Estados de UI — Estoque

Toda tela deste sistema mostra dado que representa peça física ou dinheiro.
Por isso o estado **incerto** é obrigatório e nunca pode ser desenhado como
sucesso: quando o número é ambíguo, a tela mostra a ambiguidade e para.

| Estado | Quando ocorre | O que a tela mostra | O que o usuário pode fazer | Definido? |
|---|---|---|---|---|
| carregando | consulta de estoque/sessão em voo | esqueleto preserva o espaço dos cards e do painel contextual | aguardar | parcial |
| vazio | catálogo realmente não possui produtos | orientação de cadastro; não confundir com inventário sem contagens | ir ao cadastro conforme permissão | parcial |
| sem resultado | busca/filtro não encontrou produto ou inventário | filtros ativos e ação para limpar | ajustar busca/filtro | sim, conceito |
| parcial | resumo carregou, mas inventário ou produtos falharam | cada bloco mantém estado próprio e nomeia o que falta | tentar novamente somente o bloco | sim, conceito |
| incerto | contagem/gravação ou identidade não foi confirmada | rascunho e aviso explícito; nunca selo de conferido | consultar a sessão antes de repetir | sim, regra |
| erro de rede | API não respondeu | erro localizado sem apagar contagens já confirmadas | tentar novamente/retomar | parcial |
| erro de permissão | perfil não pode executar a ação | ação oculta ou explicação sem sugerir falha técnica | voltar/solicitar acesso | aberto |
| sucesso | resumo, contexto e produtos carregados | layout único de Estoque com estado ativo visível | navegar entre contextos | sim, desktop |
| ação em progresso | gravação incremental, pausa, conclusão ou aplicação em voo | controle afetado ocupado e prevenção de clique duplicado | aguardar | sim, regra |
| ação recusada | backend recusou a operação | motivo específico e estado autoritativo preservado | corrigir ou seguir o caminho indicado | sim, regra |

**"vazio" ≠ "sem resultado" ≠ "zero".** São três telas diferentes: nada
cadastrado, filtro restritivo, e saldo legitimamente zero. Tratar as três como
uma só é o erro mais comum nesta família de telas.

## Contextos do bloco Inventário

| Contexto | Conteúdo inferior | Ação principal | Mantém o quê |
|---|---|---|---|
| sem inventário aberto | status geral e convite para começar | `Iniciar inventário` | cabeçalho, resumo e produtos |
| inventário em andamento | progresso, captura incremental, itens persistidos e resumo parcial | `Pausar` e `Finalizar inventário` | toda a estrutura de Estoque |
| inventário pausado | progresso congelado visualmente e data/autor da pausa | `Retomar inventário` | contagens persistidas e produtos |
| histórico | inventários anteriores com data, status, cobertura, divergências, ajustes e detalhe | `Ver detalhes` por linha | card Último inventário selecionado e produtos |
| revisão/fechamento | resultado por grupos, pendências e seleção somente das divergências comparáveis | revisar e aplicar ajustes elegíveis em uma ação posterior | contexto de Estoque; visão conceitual oficial já recebida |
| detalhe finalizado | situação final, cobertura, fatos relevantes e aplicações efetivas | `Voltar ao histórico`; demais ações conforme estado/permissão | card Último inventário selecionado, estrutura de Estoque e produtos |

Trocar de contexto não desmonta a página inteira nem abre outro módulo.

## Estados da sessão

| Estado | Sinal na interface | Comportamento |
|---|---|---|
| inexistente | `Nenhum inventário aberto` | permite começar |
| começando | ação ocupada, sem progresso inventado | aguarda identificador autoritativo |
| em andamento | cobertura e última gravação visíveis | aceita contagens/correções; mantém Pausar e Finalizar inventário visíveis |
| pausando | captura bloqueada enquanto confirma | não perde itens já persistidos |
| pausado | rótulo e instante de pausa | contagem bloqueada até Retomar |
| retomando | busca snapshot atual | não usa cache local como verdade |
| pronto para revisão | `Finalizar inventário` confirmou o encerramento da captura | abre Fechamento/Revisão; ainda não aplica ajustes |
| finalizado com sucesso | encerrado sem pendências abertas segundo o resultado autoritativo | mostra o que foi contado, divergências e aplicações; não presume esse estado apenas pela cobertura |
| finalizado com pendências | encerrado com não conferidos, não comparáveis, desconhecidos ou divergências não aplicadas | mantém pendências explícitas e caminhos permitidos de consulta/resolução |
| aplicação parcial | alguns ajustes aplicados e outros recusados/pendentes | resultado individual por item; não mostra sucesso total |
| cancelado | encerrado sem apagar o histórico | preserva cobertura alcançada, responsável e fatos disponíveis; não apresenta como sucesso |

## Estados de cada item contado

| Estado | O que significa | Apresentação e ação |
|---|---|---|
| não contado | não existe gesto explícito de contagem | quantidade vazia com rótulo `Não contado`; não usar zero |
| contado zero | a pessoa confirmou que encontrou zero na revisão/confirmação de peça não encontrada | `0` mais rótulo explícito; não existe botão permanente junto ao campo de bipagem |
| contado N | quantidade inteira N persistida | número, horário/autor quando disponível e ações corrigir/remover |
| salvando | contagem enviada sem confirmação | linha não recebe `Conferido` antecipadamente |
| gravação incerta | resposta não conclusiva | consulta snapshot antes de novo envio |
| variação necessária | API respondeu `409` | preserva leitura e abre escolha de variação |
| não sei a variação | decisão explícita após conflito | pendência identificada, fora da comparação e resolvível depois |
| desconhecido | código não pertence ao catálogo | código original preservado e anunciado |
| conferido | contagem comparável coincide com esperado | rótulo textual; sem ação de ajuste |
| faltando | contagem comparável menor que esperado | divergência elegível apenas na etapa de revisão |
| sobrando | contagem comparável maior que esperado | divergência elegível apenas na etapa de revisão |
| `naoConferido` | item não foi contado no escopo | sem checkbox, sem sugestão e fora do lote |
| `naoComparavel` | identidade/dado não permite comparação segura | motivo visível; sem checkbox, sugestão ou lote |
| movimentação posterior | backend devolveu `deltaPos`/aviso | alerta junto ao item antes de aplicar; frontend não recalcula |
| ajustado | backend confirmou movimento pela razão | estado e observação consultáveis; não permite ajuste duplicado |

## Estados da captura incremental

| Situação | Resposta da interface |
|---|---|
| SKU simples válido | confirmar quantidade e persistir incrementalmente |
| quantidade zero | oferecer o gesto explícito somente na revisão/confirmação de peça não encontrada, não na captura principal |
| SKU com múltiplas variações | tratar `409` com seletor, nunca como erro genérico |
| variação conhecida | reenviar usando identidade exata |
| variação desconhecida pela pessoa | ação secundária `Não sei a variação`; registrar pendência, não contagem comparável |
| correção | substituir a contagem persistida após confirmação |
| remoção | voltar a `não contado`, nunca converter para zero |

## Estados do seletor contextual de variação

| Estado | O que aparece | Ação permitida |
|---|---|---|
| carregando opções | código/SKU preservado e carregamento localizado | cancelar; não confirmar |
| opções disponíveis | produto e lista de variações reais cadastradas | escolher exatamente uma opção |
| nenhuma escolha | rádios sem seleção | `Confirmar variação` desabilitado |
| variação escolhida | uma identidade marcada por controle e rótulo, não só por cor | confirmar e persistir naquela identidade |
| `Não sei` escolhido | aviso de pendência de identificação e bloqueio de movimento/ajuste | registrar a pendência explicitamente |
| erro ao obter opções | mensagem localizada sem descartar o código lido | tentar novamente ou cancelar |
| sem opções válidas | inconsistência anunciada; nenhuma alternativa inventada | sair do fluxo e corrigir o cadastro por caminho autorizado |

## Estados do detalhe finalizado

- o resumo sempre separa cobertura/conferidos, divergências encontradas,
  pendências de revisão e ajustes efetivamente aplicados;
- `Finalizado com sucesso` só aparece quando a resposta autoritativa não tiver
  pendências segundo a regra de domínio;
- `Finalizado com pendências` mantém visíveis não conferidos, não comparáveis,
  desconhecidos e divergências não aplicadas;
- `Cancelado` preserva os dados existentes sem parecer inventário concluído
  com sucesso;
- cada linha relevante diferencia `aplicado`, `não aplicado`, `bloqueado` e
  outros status devolvidos, sem inferir ação pela diferença;
- cobertura de 100% não equivale automaticamente a 100% conciliado.

## Estados da revisão e aplicação

- a tela agrupa conferidos, faltando, sobrando, `naoConferido`,
  `naoComparavel` e desconhecidos;
- somente divergências comparáveis e elegíveis podem ter checkbox;
- observação é opcional e acompanha a divergência quando informada;
- payload nunca contém quantidade do ajuste;
- `deltaPos` e movimentações posteriores permanecem visíveis durante a decisão;
- retorno por item diferencia aplicado, recusado, já aplicado e ainda pendente.
