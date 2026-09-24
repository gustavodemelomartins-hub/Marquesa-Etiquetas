# Métricas e cálculos — Catálogo, Mídia e Publicação

Todos os totais são agregações de respostas autoritativas. A UX não transforma
um total observado em decisão de aprovação ou publicação.

| Indicador | Cálculo/fonte | Regra de exibição |
|---|---|---|
| produtos por estado | contagem de `itens[].estado` em `GET /api/catalogo/publicacao` | usar somente os dez estados do contrato |
| produtos com falta humana | itens com `falta.length > 0` | discriminar nome, categoria, preço, quantidade e foto |
| produtos bloqueados | itens com `bloqueios.length > 0` | discriminar `sem_r2`, `sem_preparador`, `foto_nao_preparada`; não somar como falta humana |
| presentes na loja | itens com `presencaNaLoja` | separar observados (`estadoObservado`) de publicados pelo pipeline |
| aprovações invalidadas | itens com `aprovacaoInvalidada: true` | nunca manter no total efetivamente aprovado |
| fotos do produto | quantidade devolvida pela galeria | indicar uma principal; múltiplas são válidas |
| produtos sem categoria | `pecasAtivas`/itens ligados à sentinela conforme resposta | não contar sentinela como categoria comum |
| categorias órfãs | linhas com `orfa: true` | estado legítimo, não erro |
| fotos órfãs | total de `GET /api/fotos/orfas` | aguardam decisão, não casamento automático |
| resultado do lote | contagem final por situação após `confirmar` | recontar do retorno final; não reutilizar análise otimista |
| tarefas abertas | quantidade em `abertas` | separar de `jaTinhamTarefa` e `recusados` |
| preços divergentes | quantidade de `GET /api/catalogo/precos/divergentes` | detecção, nunca correção automática |
| itens não empurrados | tamanho/composição de `semEmpurrar[]` | mostrar por peça e motivo |
| rodada pausada | `pausado: true` | freio, não falha; limiar contratual acima de 20 aprovados |

## Contagens que não podem ser somadas

- um mesmo produto pode ter falta, bloqueio e presença na loja ao mesmo tempo;
- `preparado`, `aguardando_aprovacao`, `aprovado_para_publicar` e `publicado`
  são estados diferentes, não fases concluídas equivalentes;
- `vinculado` e `multiplas` são resultados válidos distintos no lote;
- análise do lote e confirmação final podem ter totais diferentes;
- “Está na loja” observado não aumenta o total “Publicado pelo Sistema
  Marquesa”.

