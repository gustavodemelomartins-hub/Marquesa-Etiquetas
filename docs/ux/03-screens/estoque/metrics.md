# Métricas e cálculos — Estoque

Número na tela sem fórmula escrita é número que ninguém consegue auditar depois.
Uma linha por indicador.

| Indicador | Fórmula | Fonte do dado | Janela de tempo | Arredondamento | Confirmado? |
|---|---|---|---|---|---|
| Estoque total | saldo total materializado, sempre reconciliável com a soma da razão | estoque/razão | atual | peças inteiras | sim, conceito |
| Em casa | estoque total menos quantidade consignada em maletas abertas/em acerto | estoque + maletas | atual | peças inteiras | sim |
| Com revendedoras | quantidade consignada em maletas abertas/em acerto | maletas | atual | peças inteiras | sim |
| Cobertura do inventário | numerador e denominador devolvidos pela API para o escopo da sessão; percentual derivado desses dois valores | sessão de inventário | sessão atual/finalizada | peças inteiras + percentual de exibição | sim · contrato Fase 4.4 |
| Quantidade conferida | total autoritativo de identidades com contagem explícita aceita; deve permanecer separado de itens conciliados e de ajustes aplicados | sessão/resultado do inventário | sessão atual/finalizada | peças ou identidades conforme contrato, sempre rotulado | sim, conceito |
| Não contados | total autoritativo de itens do escopo sem contagem explícita | resultado do inventário | sessão | inteiro | sim · contrato Fase 4.4 |
| Contados zero | total de itens cuja quantidade zero foi explicitamente confirmada | itens do inventário | sessão | inteiro | sim · contrato Fase 4.4 |
| Faltando | agregação dos itens comparáveis em que contado é menor que o esperado congelado; diferença negativa | resultado do inventário | inventário concluído | separar itens e peças | sim, conceito |
| Sobrando | agregação dos itens comparáveis em que contado é maior que o esperado congelado; diferença positiva | resultado do inventário | inventário concluído | separar itens e peças | sim, conceito |
| Não comparáveis | quantidade devolvida como `naoComparavel` | resultado do inventário | inventário concluído | inteiro | sim · contrato Fase 4.4 |
| Desconhecidos | quantidade de códigos/leituras preservados sem identidade de catálogo | sessão/resultado | sessão | inteiro | sim · contrato Fase 4.4 |
| Movimentações posteriores | `deltaPos` e sinalização devolvidos pelo backend | resultado atualizado | após conclusão | não recalcular no frontend | sim · contrato Fase 4.4 |
| Ajustes resolvidos | quantidade de divergências cuja aplicação foi confirmada individualmente | resultado/aplicações | inventário finalizado | inteiro | sim, conceito |
| Pendências de revisão | total autoritativo de fatos ainda não resolvidos, discriminando não conferidos, não comparáveis, desconhecidos e divergências não aplicadas | resultado do inventário | inventário finalizado | inteiro total + composição | sim, conceito |
| Saúde do estoque | — fórmula ainda não definida — | — | atual/último inventário | — | não |
| Valor estimado do estoque | — base econômica ainda não definida — | catálogo/custo a decidir | atual | moeda em centavos | não |

## Regras de cálculo que valem para todos os indicadores

- venda cancelada e item corrigido **não** contam como receita;
- categoria não-receita (brinde, sorteio, perda, uso interno) não entra em
  faturamento — ver `docs/domains/`;
- consignação em maleta não é venda até o acerto;
- saldo de estoque vem da razão (`SUM(movimentos.qtd)`), nunca de contagem
  paralela;
- quando duas fontes discordam, a tela mostra **os dois números** e sinaliza a
  divergência. Não escolhe uma.
- cobertura não é calculada pela quantidade de linhas carregadas ou visíveis;
- `conferidos`, cobertura, divergências encontradas e ajustes aplicados são
  medidas diferentes e nunca devem ser exibidas como sinônimos;
- cobertura de 100% não autoriza o rótulo `100% conciliado` se ainda houver
  pendências ou divergências sem aplicação;
- ausência de contagem não entra como zero;
- `deltaPos` é exibido como devolvido pelo backend e sempre acompanhado do
  aviso de movimentação posterior pertinente;
- `naoConferido` e `naoComparavel` podem ser contabilizados no resumo, mas
  nunca transformados em quantidade sugerida de ajuste;
- os cards não exibem `Saúde do estoque` nem valor monetário como fatos até a
  fórmula e a fonte serem aprovadas.

## Indicadores recusados

Indicador que foi pedido e decidimos **não** exibir, com o motivo. Evita que a
mesma ideia volte a cada rodada.

| Indicador | Por que não | Data |
|---|---|---|
| | | |
