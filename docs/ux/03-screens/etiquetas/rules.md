# Regras de negócio — Etiquetas

A fonte canônica das regras existentes é
[api/REGRAS.md](../../../../api/REGRAS.md). Este arquivo descreve como a tela
futura expõe essas regras e registra as decisões de produto desta rodada.

## Regras confirmadas

| ID | Regra | Consequência na tela | Origem |
|---|---|---|---|
| ETQ-R001 | Produtos vindos de cadastro manual ou importação entram automaticamente na fila de preparação. | A origem fica visível e o item já pode ser selecionado e quantificado. | Gustavo, 10/09/2026 |
| ETQ-R002 | O texto impresso pode ser uma abreviação diferente do nome completo do produto. | A etiqueta possui nome de exibição editável sem renomear silenciosamente o produto do catálogo. | Gustavo, 10/09/2026 |
| ETQ-R003 | Uma abreviação só é aplicada automaticamente quando houver padrão ou mapeamento conhecido. | Sem regra confiável, preservar o texto de origem e sinalizar revisão; nunca inventar abreviação. | Gustavo, 10/09/2026 |
| ETQ-R004 | Editar ou retirar uma etiqueta não altera produto, estoque, venda ou maleta. | Confirmações dizem explicitamente o alcance da ação. | `api/REGRAS.md`, § etiquetas |
| ETQ-R005 | Foto não é obrigatória para preparar ou imprimir etiquetas. | Com foto, exibir miniatura; sem foto, usar estado neutro e íntegro, nunca imagem quebrada ou bloqueio. | Gustavo + `api/REGRAS.md`, §12b |
| ETQ-R006 | A revisão deve representar proporcionalmente o resultado que será impresso. | Quantidade, ordem, posições ocupadas, espaços livres, papel e texto precisam coincidir com a saída. | Gustavo, 10/09/2026 |
| ETQ-R007 | Calibração acontece antes da impressão, na revisão. | Ajustes horizontal e vertical são visíveis e a prévia é recalculada. | Gustavo, 10/09/2026 |
| ETQ-R008 | Imprimir ou gerar PDF cria um lote de histórico com data, hora, pessoa responsável, origem e itens. | O histórico permite auditoria e consulta do conteúdo do lote. | Gustavo, 10/09/2026 |
| ETQ-R009 | Reimpressão cria um novo lote e não altera estoque nem o registro anterior. | A pessoa confirma uma nova preparação; o lote original permanece imutável. | mockup aprovado, 10/09/2026 |
| ETQ-R010 | A identidade do responsável vem do perfil em uso. | O histórico mostra “horário por pessoa”; não há campo livre para digitar autoria. | Gustavo, 10/09/2026 |

## Comportamento da fila

- a quantidade de etiquetas é ajustável antes da revisão;
- filtros por origem não criam filas independentes: apenas recortam a mesma fila;
- busca aceita ao menos nome e SKU;
- retirar um produto da impressão remove apenas sua participação no lote atual;
- lotes maiores que a capacidade de uma folha continuam em páginas adicionais,
  sem achatar ou reduzir etiquetas para fazê-las caber;
- a nomenclatura final impressa deve continuar editável enquanto os padrões de
  abreviação ainda estiverem sendo consolidados.

## Papel e impressão

- o uso atual de folha adesiva A4 com recorte manual deve continuar possível;
- Pimaco A4349, 26 × 15 mm e 126 posições é a referência mostrada no mockup e
  precisa de calibração real antes de ser considerado validado;
- a interface não pode afirmar que a folha física foi impressa se o navegador
  só conseguiu abrir o diálogo de impressão; a definição dos estados está em
  [open-questions.md](open-questions.md).

## Permissões

Perfis autorizados a preparar, imprimir, calibrar e reimprimir ainda precisam
ser definidos. O histórico sempre registra o perfil autenticado responsável.
