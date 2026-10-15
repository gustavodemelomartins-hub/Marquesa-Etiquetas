# Fluxo: Preparar, aprovar e publicar produto

**Quem:** operação de catálogo, executor desacoplado e aprovador humano  
**Começa em:** produto `pronto_para_preparacao`  
**Termina em:** produto publicado, falha explícita ou despublicação posterior

## Linha humana

| # | Estado/origem | Ação | Contrato | Resultado | Escreve no banco/loja? |
|---:|---|---|---|---|---|
| 1 | `pronto_para_preparacao` | iniciar preparação da peça | `POST /api/catalogo/publicacao/:sku/preparar` | estado devolvido pelo servidor | sim, estado local |
| 2 | `aguardando_aprovacao` | abrir prévia | `POST /api/catalogo/publicacao/:sku/previa` | conteúdo para revisão | não informado; não publica |
| 3 | revisão | aprovar | `POST /api/catalogo/publicacao/:sku/aprovar` | `aprovado_para_publicar` | sim, aprovação humana |
| 4 | revisão | pedir ajuste | `POST /api/catalogo/publicacao/:sku/reabrir` | estado autoritativo devolvido | sim; sem estado novo inventado |
| 5 | aprovado | simular publicação | `POST /api/catalogo/publicacao/:sku/publicar` seco por padrão | `enviaria` integral | não escreve na vitrine |
| 6 | aprovado | publicar de verdade | mesma rota com `seco: false`, dependente da flag | indisponível hoje; quando habilitado, resultado real | condicional; atualmente não |
| 7 | falha | repetir | `POST /api/catalogo/publicacao/:sku/repetir` | nova tentativa autoritativa | condicional |
| 8 | publicado | despublicar | `POST /api/catalogo/publicacao/:sku/despublicar` seco por padrão | ensaio ou despublicação explícita | condicional |

## Linha do executor desacoplado

| # | Ação | Contrato | Resposta que a UX monitora |
|---:|---|---|---|
| 1 | abrir tarefas por SKU/campos ou todas as peças prontas | `POST /api/catalogo/preparacao/tarefas` | `abertas`, `jaTinhamTarefa`, `recusados` |
| 2 | listar/entregar tarefa pendente | `GET ...?estado=pendente`; `POST .../:id/entregar` | tarefa atribuída com executor livre |
| 3 | devolver resultado | `POST .../:id/resultado` | conteúdo preparado e `publicado: false` |
| 4 | registrar falha/cancelar | `POST .../:id/falhou`; `POST .../:id/cancelar` | falha de preparo ou cancelamento, nunca falha de publicação |

A ligação interna entre o comando por SKU e a abertura de tarefas é
responsabilidade do backend; a interface não duplica chamadas por suposição.

## Onde pode falhar ou parar

| Ponto | Estado | Tratamento |
|---|---|---|
| preparação | `preparo_erro`/`bloqueioExterno` | erro do estágio, separado de foto/publicação |
| aprovação | `409` + `faltam[]` | voltar ao conteúdo e corrigir faltas |
| após aprovação | `aprovacaoInvalidada: true` | revisar dados mudados e aprovar novamente |
| publicação | flag ausente | explicar capacidade desligada e manter apenas simulação |
| publicação externa | `falhou_ao_publicar` | preservar erro e oferecer `repetir` |
| rodada | `pausado: true` acima de 20 | mostrar freio; `forcar` apenas com permissão |

## Invariantes

- agente prepara; pessoa aprova; publicador publica;
- nenhuma preparação implica publicação;
- aprovação não garante conclusão externa;
- Nuvemshop é canal; o produto aprovado continua sob autoridade Marquesa;
- fornecedor de IA nunca aparece na interface.
