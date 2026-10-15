# Estados de UI — Catálogo, Mídia e Publicação

## Estado geral da tela

| Estado | O que mostra | Recuperação |
|---|---|---|
| carregando | estrutura da fila sem números inventados | aguardar |
| vazio | nenhum item no recorte escolhido | alterar filtro; não confundir com falha |
| sem resultado | filtros ativos sem correspondência | limpar filtros |
| parcial | blocos disponíveis e falha localizada nos demais | tentar novamente apenas o bloco |
| erro | mensagem pronta devolvida pela API e contexto preservado | seguir a ação indicada |

## Pipeline de publicação — conjunto fechado

| Estado técnico | Rótulo aprovado | Natureza |
|---|---|---|
| `falta_informacao` | Falta informação | calculado |
| `pronto_para_preparacao` | Pronto para preparação | calculado |
| `em_preparacao` | Em preparação | gravado ao abrir tarefa |
| `preparado` | Conteúdo preparado | gravado pelo executor |
| `aguardando_aprovacao` | Aguardando aprovação | gravado |
| `aprovado_para_publicar` | Aprovado para publicar | gravado por aprovação humana |
| `publicando` | Publicando | gravado antes da chamada externa |
| `publicado` | Publicado | gravado pelo publicador |
| `falhou_ao_publicar` | Falhou ao publicar | gravado pelo publicador |
| `despublicado` | Despublicado | gravado pelo ato explícito |

Não criar estado como `ajuste_solicitado`, `quase_publicado` ou
`publicacao_pendente` sem contrato. `publicado` com `estadoObservado: true`
recebe linguagem “Está na loja”, não “Publicamos”.

## Dimensões simultâneas por produto

Um produto pode ter estado do pipeline e, simultaneamente:

- `falta[]`: pendências humanas `nome`, `categoria`, `preco`, `quantidade` e
  `foto`;
- `bloqueios[]`: `sem_r2`, `sem_preparador`, `foto_nao_preparada`;
- `presencaNaLoja`: fato observado da vitrine;
- `aprovacaoInvalidada: true`: revisão e nova aprovação necessárias.

Essas dimensões não são convertidas em um único badge.

## Fotos e galeria

| Estado | Apresentação |
|---|---|
| foto própria | original disponível na galeria |
| somente endereço da loja | miniatura/endereço externo identificado como referência da loja |
| nenhuma foto | estado vazio orientando inclusão; não mostrar imagem quebrada |
| original sem preparada | original preservado e bloqueio `foto_nao_preparada` quando aplicável |
| original + preparada | alternância/comparação clara, sem substituir o original |
| principal | marca textual e posição prioritária |
| múltiplas fotos | galeria ordenada com uma única principal |
| salvando ordem | interação bloqueada apenas na galeria; aguarda retorno e `ignorados[]` |
| exclusão da principal | confirmação + anúncio da `novaPrincipal` devolvida |
| sem R2 | bloqueio de infraestrutura; escrita de bytes indisponível |
| erro de mídia | `foto_erro` localizado; não chamar de preparo ou publicação |

## Upload em lote

| Situação do contrato | Texto/semântica |
|---|---|
| `vinculado` | Casou com um SKU |
| `multiplas` | Foto adicional do mesmo SKU; não é erro |
| `sku_nao_encontrado` | Código ausente do catálogo |
| `nome_ambiguo` | Mais de um possível dono; renomear resolve |
| `nome_invalido` | Nome não produz candidato |
| `duplicado` | Arquivo ou imagem já existe |
| `erro_upload` | R2 recusou ou não respondeu |

O progresso é por arquivo. A falha de uma linha não derruba as demais. Após
`confirmar`, o resumo final usa a recontagem do servidor.

## Preparação, aprovação e publicação

- tarefa criada: mostrar `abertas`, `jaTinhamTarefa` e `recusados` sem somar
  categorias diferentes;
- executor trabalhando: usar `em_preparacao`, sem nomear fornecedor de IA;
- resultado entregue: `preparado`/`aguardando_aprovacao` conforme resposta e
  `publicado: false` explícito;
- revisão humana: `aguardando_aprovacao` permite aprovar; pedir ajuste só pode
  chamar `reabrir` e aceitar o estado devolvido;
- aprovação invalidada: aviso informativo, conteúdo atualizado e nova revisão;
- simulação: mostrar `enviaria` completo;
- publicação real indisponível: explicar ausência da capacidade/flag e não
  oferecer botão enganoso;
- rodada pausada: apresentar freio acima de 20 e ação de forçar apenas conforme
  permissão;
- falha de publicação: preservar o erro específico e oferecer `repetir`;
- despublicado: mostrar ato explícito e motivo quando houver.

## Recusas que não viram ações alternativas inventadas

| Recusa | Comportamento da tela |
|---|---|
| categoria inexistente | mostrar mensagem e `categoriasDisponiveis[]` |
| status inválido | mostrar `statusValidos[]` |
| edição direta de `qtd` | remover edição e encaminhar ao fluxo correto de estoque |
| nome de categoria já existente | conflito 409 sem criar duplicata visual |
| categoria com peças | impedir arquivamento e mostrar `pecas` |
| aprovação fora de hora/com faltas | mostrar `faltam[]` |
| publicação sem aprovação/assinatura inválida | voltar à revisão com `aprovacaoInvalidada` |
| exclusão de produto com histórico | mostrar `bloqueios[]` e alternativa `arquivar` |

