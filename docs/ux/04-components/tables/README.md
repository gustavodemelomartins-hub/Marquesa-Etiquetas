# Componente: Tabelas

Listagem densa com ordenação, seleção e ação por linha.

Registre aqui apenas o padrão que **repete em mais de uma tela**. Se só existe
numa tela, ele mora no README daquela tela.

Imagens deste componente ficam nesta pasta, nome
`AAAA-MM-DD_tables_<variante>.<ext>`.

## Variantes

| Variante | Quando usar | Referência |
|---|---|---|
| fila do catálogo | listar produtos, identidade, prontidão, faltas, bloqueios, presença externa e estado do pipeline | [Catálogo](../../03-screens/catalogo/README.md) |
| casamento de fotos | revisar resultado por arquivo/SKU antes e depois do upload | [Fluxo de fotos](../../05-flows/catalogo-enviar-e-casar-fotos-em-lote.md) |
| categorias | mostrar nome, ordem, cor, peças, ativas, sentinela/órfã e somente ações autorizadas | [Catálogo — categorias](../../03-screens/catalogo/rules.md#produto-categoria-e-variação) |

## Estados

| Estado | Aparência | Definido? |
|---|---|---|
| padrão | | não |
| foco (teclado) | | não |
| desabilitado | | não |
| carregando | | não |
| erro | | não |

## Regras de uso

- coluna de quantidade e de dinheiro alinha à direita;
- ordenação padrão de cada tabela é declarada no `rules.md` da tela;
- linha com divergência é marcada, nunca omitida.
- quando a tabela usa foto de produto, a ausência de foto é um estado normal:
  mostrar placeholder neutro sem reservar um “buraco” quebrado e sem impedir a
  ação principal;
- ação por linha usa o mesmo menu de contexto e mantém rótulo acessível, mesmo
  quando visualmente representada por reticências.
- fila do catálogo nunca colapsa `falta[]`, `bloqueios[]` e presença na loja em
  uma coluna genérica de “pendência”;
- tabela de casamento mantém falha e recuperação por arquivo; `multiplas` não
  recebe estilo de erro;
- tabela de categorias não oferece renomear/arquivar quando os campos
  `podeRenomear`/`podeArquivar` forem falsos e nunca oferece mesclar.

## Componente React equivalente hoje

— a preencher — Inventário do que já existe:
`docs/ui/COMPONENT-INVENTORY.md`. Não presuma que o padrão novo substitui o
componente atual; isso é decisão da fase 9 do Master Plan.
