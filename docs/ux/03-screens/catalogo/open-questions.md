# Decisões abertas — Catálogo, Mídia e Publicação

## Abertas

| ID | Pergunta humana | Trava o quê | Quem decide |
|---|---|---|---|
| CAT-Q001 | Catálogo permanece como navegação interna de Estoque ou ganha outra posição na arquitetura de navegação futura? | hierarquia e cabeçalho dos mockups | Gustavo |
| CAT-Q002 | Quais perfis podem criar/editar/arquivar produto, gerir categorias e fotos, preparar, aprovar, forçar rodada e despublicar? | visibilidade e confirmação das ações | Gustavo |
| CAT-Q003 | `Pedir ajuste` será o rótulo da ação `reabrir`; que instrução humana acompanha o pedido e onde ela reaparece para o executor? | mockup de revisão e retorno à preparação | Gustavo + contrato técnico |
| CAT-Q004 | `publicarNaVitrine` deve aparecer como escolha humana? Se sim, qual linguagem explica a diferença sem inventar regra comercial? | revisão final da publicação | Gustavo + contrato técnico |
| CAT-Q005 | Que confirmação adicional é exigida para excluir foto, despublicar e usar `forcar: true` numa rodada pausada? | modais de ações sensíveis | Gustavo |
| CAT-Q006 | Para produtos encontrados somente na loja e marcados como candidatos, qual fluxo autorizado cria o produto local e quem pode executá-lo? | ação da tela de divergências; o espelho não traz rota de criação | Gustavo + contrato técnico |

## Fechadas pelo contrato

| ID | Decisão | Resposta |
|---|---|---|
| CAT-D001 | Quem é autoridade do produto aprovado? | Sistema Marquesa; Nuvemshop é canal externo. |
| CAT-D002 | Preparação publica? | Não. Preparação devolve `publicado: false` e exige aprovação humana posterior. |
| CAT-D003 | Aprovação garante publicação concluída? | Não. Ainda existem `publicando`, `publicado` e `falhou_ao_publicar`. |
| CAT-D004 | Bloqueio de infraestrutura entra na lista de faltas humanas? | Nunca. `bloqueios[]` e `falta[]` são dimensões diferentes. |
| CAT-D005 | Foto adicional do mesmo SKU é erro? | Não. É `multiplas`. |
| CAT-D006 | A interface pode mesclar categorias ou corrigir preço divergente automaticamente? | Não; essas capacidades não existem. |
| CAT-D007 | Publicação real está disponível agora? | Não. Chamadas são secas por padrão e a flag não está declarada em ambiente algum. |
| CAT-D008 | Executor é fornecedor fixo? | Não. É rótulo livre; a UX não menciona fornecedor de IA. |

