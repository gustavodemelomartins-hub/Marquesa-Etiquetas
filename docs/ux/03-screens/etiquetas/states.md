# Estados de UI — Etiquetas

## Preparar

| Estado | Quando ocorre | O que a tela mostra | Ação disponível |
|---|---|---|---|
| carregando | fila e catálogo ainda estão sendo obtidos | estrutura da lista e resumo em carregamento | aguardar ou tentar novamente |
| fila vazia | nenhum produto aguarda etiqueta | explicação da fila automática e ação Adicionar produtos | adicionar manualmente |
| sem resultado | busca ou filtro não encontra item | filtro ativo e mensagem específica | limpar busca/filtros |
| com itens | há produtos disponíveis | lista, origem, quantidade e resumo | selecionar, editar nome da etiqueta e revisar |
| nome a revisar | não existe abreviação confiável | indicação clara junto ao texto da etiqueta | editar ou confirmar o texto |
| sem foto | produto não possui imagem válida | placeholder neutro, sem espaço quebrado | seguir normalmente |
| múltiplas folhas | quantidade excede uma folha | total de folhas e posições por página | revisar todas as folhas |
| erro parcial | alguns produtos ou fotos falharam | itens utilizáveis e falhas identificadas separadamente | tentar novamente sem perder seleção |

## Revisar impressão

| Estado | Quando ocorre | O que a tela mostra | Ação disponível |
|---|---|---|---|
| compondo prévia | folha está sendo calculada | indicador de processamento, sem liberar impressão | aguardar |
| prévia pronta | todas as posições foram compostas | folha proporcional, contagens e modelo | imprimir ou baixar PDF |
| calibração alterada | ajuste horizontal/vertical mudou | prévia recalculada e valores atuais | testar, redefinir ou imprimir |
| configuração inválida | papel, posição ou ajuste produz saída impossível | motivo e campo responsável | corrigir configuração |
| gerando PDF | arquivo está sendo montado | progresso e prevenção de clique duplicado | aguardar |
| envio ao diálogo | sistema entregou o documento ao navegador | estado honesto de envio, sem afirmar impressão física | concluir no diálogo ou voltar |
| falha | prévia, PDF ou envio não concluiu | erro preservando lote e seleção | tentar novamente |

## Histórico

| Estado | Quando ocorre | O que a tela mostra | Ação disponível |
|---|---|---|---|
| vazio | nenhum lote foi registrado | explicação do que passa a aparecer aqui | ir para Preparar |
| com lotes | existem impressões ou PDFs | tabela ordenada do mais recente para o mais antigo | filtrar, abrir detalhes ou reimprimir |
| detalhe aberto | um lote foi selecionado | autoria, horário, contagens, produtos e quantidades | fechar ou preparar reimpressão |
| preparando reimpressão | conteúdo do lote está sendo copiado | novo rascunho separado do original | revisar antes de imprimir |
| dado incompleto | lote antigo não possui algum metadado | campo como não disponível, sem inventar valor | consultar o restante do lote |

**Foto ausente é um estado normal, não erro.** **Fila vazia**, **sem resultado**
e **quantidade zero** também são situações diferentes.
