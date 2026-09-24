# Decisões abertas — Etiquetas

## Abertas

| ID | Pergunta | Quem decide | Trava o quê | Desde |
|---|---|---|---|---|
| ETQ-Q001 | Qual é a fonte oficial das abreviações já usadas pela Sthefany Marques: planilha, regra por categoria ou mapeamento por SKU? | Gustavo + Sthefany Marques | preenchimento automático seguro | 10/09/2026 |
| ETQ-Q002 | O nome da etiqueta é único por produto/SKU, pode variar por variação ou pode ser diferente em cada lote? | Gustavo | modelo do dado e edição | 10/09/2026 |
| ETQ-Q003 | Qual quantidade entra automaticamente na fila após cadastro/importação: uma unidade, quantidade importada, saldo recebido ou outra regra? | Gustavo + Sthefany Marques | fila automática e métricas | 10/09/2026 |
| ETQ-Q004 | Quais modelos devem coexistir: folha adesiva A4 de recorte manual, Pimaco A4349 ou outros? | Gustavo + Sthefany Marques | seletor de papel e composição | 10/09/2026 |
| ETQ-Q005 | A calibração fica salva por navegador, usuário, impressora ou combinação de impressora e papel? | Gustavo | persistência e recuperação da calibração | 10/09/2026 |
| ETQ-Q006 | Como o sistema diferencia “PDF gerado”, “enviado para impressão” e “fisicamente impresso”? | Gustavo | estados e histórico honestos | 10/09/2026 |
| ETQ-Q007 | Por quanto tempo o histórico é mantido e quem pode consultar ou reimprimir lotes de outras pessoas? | Gustavo | permissões e retenção | 10/09/2026 |
| ETQ-Q008 | O placeholder sem foto deve ser apenas um ícone neutro ou uma miniatura de categoria? | Gustavo | acabamento visual da lista | 10/09/2026 |
| ETQ-Q009 | A primeira folha pode começar em uma posição escolhida para reaproveitar folhas parcialmente usadas? | Gustavo + Sthefany Marques | cálculo de posições e revisão | 10/09/2026 |

## Fechadas

| ID | Pergunta | Resposta | Quem | Data |
|---|---|---|---|---|
| ETQ-D001 | Foto é obrigatória para entrar na fila? | Não. Produto sem foto segue normalmente e recebe estado visual neutro. | Gustavo | 10/09/2026 |
| ETQ-D002 | A pessoa pode corrigir o texto que será impresso? | Sim. O nome da etiqueta precisa ser editável enquanto a padronização das abreviações não estiver completa. | Gustavo | 10/09/2026 |
| ETQ-D003 | Reimprimir altera estoque ou o lote original? | Não. A reimpressão cria um novo lote e preserva os registros existentes. | Gustavo | 10/09/2026 |

A decisão transversal sobre onde o nome abreviado deve viver está registrada
como [DP-003](../../06-backlog/pending-decisions.md).
