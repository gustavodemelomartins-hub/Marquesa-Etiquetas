# Tela: Estoque

| | |
|---|---|
| Estado do material | descrito |
| Última atualização | 10/09/2026 |
| Referências recebidas | 5 mockups próprios |
| Existe hoje no legado? | sim — `view-estoque` e catálogo |
| Existe hoje no React? | ver [07-mapping/frontend-feature-map.md](../../07-mapping/frontend-feature-map.md) |

> Esta pasta é documental. Nada aqui autoriza implementação; ver
> [00-index.md](../../00-index.md).

## Objetivo da tela

Oferecer uma única área para acompanhar saldo, distribuição e produtos e para
executar inventários físicos sem perder o contexto do Estoque. Toda exibição de
saldo sai da razão contábil; contagem e correção continuam atos separados.

## Princípio estrutural confirmado

> **Inventário é uma experiência embutida na área de Estoque, com trocas de
> estado e contexto dentro do mesmo layout base.**

Não nasce um módulo desconectado. Cabeçalho, navegação de Estoque, resumo geral
e tabela `Todos os produtos` permanecem reconhecíveis. O conteúdo variável
ocupa o bloco de Inventário entre o resumo do estoque e a tabela de produtos.

```text
Cabeçalho global + navegação de Estoque
┌──────────────── resumo geral do estoque ────────────────┐
└──────────────────────────────────────────────────────────┘
┌──────────────────── Inventário ──────────────────────────┐
│ [Saúde] [Último inventário] [Inventário em aberto]       │
│                                                          │
│ conteúdo contextual: iniciar | contar | histórico |      │
│ revisão/resultado                                        │
└──────────────────────────────────────────────────────────┘
┌────────────────── Todos os produtos ─────────────────────┐
└──────────────────────────────────────────────────────────┘
```

## Para quem

Sthefany Marques e demais perfis autorizados a consultar estoque. Permissões para
começar, pausar, concluir e aplicar divergências ainda precisam ser definidas.

## Conteúdo da pasta

| Arquivo | Guarda |
|---|---|
| `images/` | prints, mockups e protótipos desta tela |
| [states.md](states.md) | estados de UI: vazio, carregando, erro, parcial, sucesso |
| [rules.md](rules.md) | regra de negócio que a tela precisa respeitar |
| [metrics.md](metrics.md) | número exibido e como é calculado |
| [api-needs.md](api-needs.md) | dado que a tela precisa e que a API ainda não dá |
| [open-questions.md](open-questions.md) | decisão aberta, específica desta tela |

Inspiração externa deste domínio: [02-references/estoque/](../../02-references/estoque/).

## Blocos da tela

| # | Bloco | O que mostra | Origem do dado | Referência |
|---|---|---|---|---|
| 1 | resumo do estoque | peças totais, em casa, com revendedoras, valor estimado e categorias | estoque, consignação e catálogo; fórmulas monetárias abertas | [Visão Geral](images/2026-09-10_estoque-visao-geral_desktop_01.png) |
| 2 | atalhos de contexto do Inventário | Saúde do estoque, Último inventário e Inventário em aberto | resumo e sessões de inventário | três mockups |
| 3 | estado sem inventário aberto | situação geral e ação para iniciar | consulta da sessão aberta | [Visão Geral](images/2026-09-10_estoque-visao-geral_desktop_01.png) |
| 4 | inventário em andamento | progresso, captura incremental, itens conferidos e resumo parcial | sessão persistida da Fase 4.4 | [Em andamento](images/2026-09-10_estoque-inventario-em-andamento_desktop_01.png) |
| 5 | histórico de inventários | data, status, cobertura, divergências, ajustes resolvidos e detalhe | lista de inventários | [Histórico](images/2026-09-10_estoque-historico-inventarios_desktop_01.png) |
| 6 | fechamento/revisão do inventário | faltando, sobrando, não conferidos, pendências e seleção das divergências elegíveis antes da aplicação | resultado autoritativo da contagem | [Revisão conceitual](images/2026-09-10_estoque-inventario-selecao-variacao_desktop_01.png) |
| 7 | detalhe de inventário finalizado | situação final, cobertura, fatos relevantes e ajustes efetivamente aplicados | detalhe e resultado persistidos do inventário | [Detalhe finalizado](images/2026-09-10_estoque-inventario-detalhe-finalizado_desktop_01.png) |
| 8 | seleção contextual de variação | variações reais do SKU quando a leitura não identifica uma única peça física | resposta de conflito e catálogo | [Seleção de variação](images/2026-09-10_estoque-inventario-selecao-variacao_desktop_01.png) |
| 9 | todos os produtos | foto, identidade, categoria, saldos, valores e ações | catálogo, razão e consignação | cinco mockups |

## Navegação interna do bloco Inventário

Os três cards do topo são atalhos de contexto, não apenas indicadores. O card
ativo possui borda/estado selecionado e semântica acessível de controle; a
troca substitui somente o conteúdo inferior do bloco.

| Atalho | Conteúdo inferior |
|---|---|
| Saúde do estoque | resumo do estado geral e, quando não houver sessão, ação `Iniciar inventário`; conteúdo exato ainda aberto |
| Último inventário | histórico dos inventários realizados, com `Ver detalhes` |
| Inventário em aberto | contagem ativa ou pausada; quando não existe sessão, estado vazio com ação para iniciar |

A seleção não remove a tabela `Todos os produtos`, não troca o módulo principal
e não duplica cabeçalho ou navegação.

## Visões conceituais consolidadas

### 1. Visão Geral de Estoque

- dashboard e cards de resumo;
- bloco de Inventário no estado geral/sem sessão aberta;
- tabela `Todos os produtos`;
- ação de iniciar nasce dentro do card/contexto de Inventário em aberto.

### 2. Inventário em andamento

- sessão aberta e persistida;
- progresso/cobertura visíveis;
- leitura ou digitação de SKU dentro da própria tela;
- lista das contagens já confirmadas e resumo parcial;
- duas ações visíveis: **Pausar** e **Finalizar inventário**;
- nenhuma ação direta deve saltar da contagem para aplicação de ajustes.

`Finalizar inventário` encerra somente a etapa de contagem e abre
**Fechamento / Revisão do inventário**. Não aplica ajuste de estoque. A revisão
mostra faltando, sobrando, não conferidos, não comparáveis e desconhecidos;
somente depois dela aparecem ações de aplicação para itens elegíveis.

### 3. Histórico de inventários

- o card `Último inventário` selecionado troca o conteúdo inferior;
- lista data, status, cobertura, divergências e ajustes resolvidos;
- `Ver detalhes` mantém a pessoa no contexto de Estoque;
- a tabela geral de produtos continua abaixo.

### 4. Detalhe de inventário finalizado

- nasce de `Último inventário` → histórico → `Ver detalhes`;
- substitui a lista no conteúdo inferior do bloco Inventário, sem abrir módulo
  ou página desconectada;
- oferece `Voltar ao histórico` e mantém cabeçalho, resumo e produtos;
- reúne data, status, responsável, cobertura, quantidade conferida,
  divergências, faltas, sobras, pendências de revisão, ajustes aplicados,
  observações, início, fechamento e situação final;
- a tabela destaca itens com divergência ou outro fato relevante, com SKU,
  produto, variação, esperado, contado, diferença, ação aplicada, observação e
  status quando disponíveis.

`Finalizado com sucesso` descreve apenas o exemplo recebido, no qual não há
pendências abertas. Um inventário finalizado também pode terminar com
pendências, itens não conferidos, itens não comparáveis, códigos desconhecidos
ou divergências ainda não aplicadas. **Finalizado não significa, por si só,
100% conciliado.**

### 5. Seleção de variação durante a contagem

Depois da leitura/digitação, um SKU com uma única identidade física relevante
segue o fluxo normal. Se houver múltiplas variações, a leitura é preservada e
uma interação contextual apresenta somente as variações reais cadastradas.
A pessoa escolhe a identidade exata e então confirma a contagem.

`Não sei a variação` registra que a peça física foi encontrada e o SKU é
conhecido, mas a variação ainda não foi identificada. O item vira pendência de
identificação e não pode ser comparado, movimentado ou ajustado até ser
resolvido. Portanto, a frase do mockup “registrar a contagem sem especificar a
variação” não é a redação aprovada. A cópia recomendada é:

> **Não sei a variação**
> Registrar como pendência de identificação. Nenhum ajuste será feito até a
> variação ser identificada.

O fundo de Fechamento/Revisão presente no mockup é apenas composição visual:
esse seletor é acionado durante a captura, após o conflito de identidade.

### 6. Fechamento e revisão — visão oficial atual

A visão conceitual já recebida representa o fluxo oficial:

```text
Finalizar inventário
→ Fechamento / Revisão
→ selecionar divergências elegíveis
→ aplicar ajustes
```

Ela apresenta faltando, sobrando, não conferidos e pendências de revisão antes
de qualquer movimentação. Somente faltas e sobras comparáveis podem receber
checkbox e entrar na aplicação. `naoConferido` e `naoComparavel` não possuem
checkbox, sugestão de ajuste nem participação em lote. A observação é opcional.

Finalizar a contagem apenas abre esta etapa; não movimenta estoque. A aplicação
acontece depois da revisão e o backend continua responsável por calcular o
ajuste. A composição de revisão visível na referência recebida é suficiente
como visão conceitual atual e não depende de um novo mockup.

## Leitura crítica dos mockups

- composição e densidade estão alinhadas ao sistema futuro;
- logo, cabeçalho, tipografia e uso de rosa continuam subordinados aos padrões
  globais já aprovados em `01-brand` e `04-components/header`;
- `98% conciliado` e `Valor estimado do estoque` são exemplos visuais até suas
  fórmulas serem decididas;
- ícone de lixeira na tabela de produtos não aprova exclusão direta: dependência
  existente exige arquivamento conforme a regra canônica;
- cor ajuda a reconhecer estado, mas rótulo textual permanece obrigatório;
- `Conferidos 790` no detalhe representa cobertura de contagem; não deve ser
  lido como 790 itens conciliados ou ajustados;
- diferenças negativas representam faltas e reduzem estoque por saída/perda;
  diferenças positivas representam sobras e aumentam estoque por
  entrada/ajuste;
- opções de variação nunca são inventadas pela interface nem digitadas como
  texto livre.

## Log de material recebido

| Data | O que chegou | Arquivo | Quem enviou |
|---|---|---|---|
| 10/09/2026 | estrutura principal e estado sem inventário aberto | [2026-09-10_estoque-visao-geral_desktop_01.png](images/2026-09-10_estoque-visao-geral_desktop_01.png) | Gustavo |
| 10/09/2026 | inventário em andamento embutido no Estoque | [2026-09-10_estoque-inventario-em-andamento_desktop_01.png](images/2026-09-10_estoque-inventario-em-andamento_desktop_01.png) | Gustavo |
| 10/09/2026 | histórico no conteúdo contextual do bloco Inventário | [2026-09-10_estoque-historico-inventarios_desktop_01.png](images/2026-09-10_estoque-historico-inventarios_desktop_01.png) | Gustavo |
| 10/09/2026 | seleção contextual de variação e composição oficial de Fechamento/Revisão | [2026-09-10_estoque-inventario-selecao-variacao_desktop_01.png](images/2026-09-10_estoque-inventario-selecao-variacao_desktop_01.png) | Gustavo |
| 10/09/2026 | detalhe contextual de inventário finalizado | [2026-09-10_estoque-inventario-detalhe-finalizado_desktop_01.png](images/2026-09-10_estoque-inventario-detalhe-finalizado_desktop_01.png) | Gustavo |
