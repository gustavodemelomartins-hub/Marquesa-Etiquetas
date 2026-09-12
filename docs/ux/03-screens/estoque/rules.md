# Regras de negócio — Estoque

A fonte canônica técnica do inventário futuro é
`docs/domains/INVENTARIO-4-4.md`, ainda ausente desta branch e espelhada pelo
contrato aprovado recebido em 10/09/2026. A fonte fundamental das invariantes
vigentes continua sendo [api/REGRAS.md](../../../../api/REGRAS.md). Este arquivo
registra somente como a tela expõe essas regras.

## Regras herdadas que a tela deve respeitar

| Regra | Fonte | Consequência na tela | Confirmado? |
|---|---|---|---|
| inventário confere o estoque em casa; consignado é descontado do esperado | `api/REGRAS.md` §5.2 e Canonical Estoque | progresso e comparação não tratam peça em maleta como faltante em casa | sim |
| contagem e correção são atos separados | `api/REGRAS.md` §19 | concluir mostra resultado; não altera saldo | sim |
| todo ajuste passa pela razão | `api/REGRAS.md` §19 | aplicação mostra retorno do backend; tela nunca grava saldo diretamente | sim |
| o backend deriva a quantidade do ajuste | contrato Fase 4.4 | frontend envia identidade selecionada e observação, nunca quantidade, delta ou saldo desejado | sim · contrato aprovado |
| `não contado` é diferente de `contado zero` | contrato Fase 4.4 | ausência de contagem nunca aparece como zero; zero exige gesto explícito | sim · contrato aprovado |
| contagem é incremental e persistente | contrato Fase 4.4 | cada item confirmado sobrevive a pausa, outro dia, nova sessão de uso e outro dispositivo | sim · contrato aprovado |
| inventário é pausável e retomável | contrato Fase 4.4 | pausa não conclui nem descarta; retomada restaura o snapshot da API | sim · contrato aprovado |
| SKU com variações exige identidade exata | contrato Fase 4.4 + regra fundamental 2 | `409` abre escolha de variação; a tela nunca adivinha | sim · contrato aprovado |
| `Não sei a variação` é uma decisão válida | contrato Fase 4.4 | registra a pendência sem atribuir quantidade por aproximação | sim · contrato aprovado |
| faltando e sobrando preservam o sinal da comparação | Canonical Estoque + decisão humana | contado menor que esperado é diferença negativa e saída/perda; contado maior é diferença positiva e entrada/ajuste | sim · Gustavo, 10/09/2026 |
| código desconhecido é anunciado e preservado | `api/REGRAS.md` §22 + contrato Fase 4.4 | aparece separado no resultado; não some nem vira SKU conhecido | sim |
| cobertura é autoritativa no backend | contrato Fase 4.4 | progresso usa numerador/denominador retornados, não conta linhas visíveis | sim · contrato aprovado |
| resultado distingue comparáveis, `naoConferido`, `naoComparavel` e desconhecidos | contrato Fase 4.4 | grupos têm tratamento e ações diferentes | sim · contrato aprovado |
| `deltaPos` e movimentações posteriores vêm do backend | contrato Fase 4.4 | tela avisa mudança posterior e não recalcula o campo | sim · contrato aprovado |
| observação de uma divergência é opcional | decisão posterior ao espelho inicial da Fase 4.4 | aplicação não é bloqueada pela ausência de observação; quando informada, ela acompanha o registro | sim · Gustavo, 10/09/2026 |
| ajuste do mesmo código não pode ser aplicado duas vezes | `api/REGRAS.md` §19 | retorno individual e retry não podem produzir segundo movimento | sim |

## Restrições próprias da tela

Regra que existe por causa da interface, não do domínio — ordenação padrão,
limite de itens por página, o que não pode ser editado inline.

| # | Restrição | Motivo | Confirmado? |
|---|---|---|---|
| UX-EST-001 | Inventário permanece embutido na estrutura principal de Estoque | preservar contexto, produtos e navegação | sim · Gustavo, 10/09/2026 |
| UX-EST-002 | Saúde, Último inventário e Inventário em aberto funcionam como atalhos de contexto do mesmo bloco | trocar conteúdo sem criar módulo/tela desconectada | sim · Gustavo, 10/09/2026 |
| UX-EST-003 | o card ativo possui estado selecionado textual/visual e troca apenas o painel inferior | tornar navegação previsível e acessível | sim · Gustavo, 10/09/2026 |
| UX-EST-004 | durante a contagem, `Pausar` e `Finalizar inventário` permanecem visíveis | permitir interromper ou encerrar conscientemente a etapa de captura | sim · Gustavo, 10/09/2026 |
| UX-EST-005 | `Finalizar inventário` encerra a contagem e abre Fechamento/Revisão; não aplica ajustes | impedir que contagem, comparação e correção se misturem | sim · Gustavo, 10/09/2026 |
| UX-EST-006 | `Todos os produtos` permanece no layout base nos três contextos conceituais | manter visão do estoque e evitar navegação desnecessária | sim · Gustavo, 10/09/2026 |
| UX-EST-007 | `naoConferido` e `naoComparavel` nunca exibem checkbox, sugestão de ajuste ou seleção em lote | hard deny visual contra correção indevida | sim · contrato aprovado |
| UX-EST-008 | `Não sei a variação` aparece apenas após conflito/contexto pertinente | preservar a capacidade sem poluir a captura principal | sim · Gustavo, 10/09/2026 |
| UX-EST-009 | estado nunca depende só de verde, rosa, amarelo ou cinza | cor não pode carregar sozinha uma decisão sobre peça física | sim · regra de UX |
| UX-EST-010 | `Contado zero` aparece na revisão/confirmação de peça não encontrada, nunca como botão permanente ao lado da bipagem | distinguir zero explícito sem poluir o caminho comum | sim · Gustavo, 10/09/2026 |
| UX-EST-011 | o seletor de variação exibe somente identidades reais devolvidas pelo sistema; não aceita nome livre nem cria opção local | impedir que a interface invente a identidade de uma peça física | sim · Gustavo, 10/09/2026 |
| UX-EST-012 | `Não sei a variação` registra peça encontrada + SKU conhecido + variação desconhecida como pendência de identificação | impedir que uma contagem ambígua vire comparação, movimento ou ajuste | sim · Gustavo, 10/09/2026 |
| UX-EST-013 | o detalhe de inventário substitui o histórico dentro do mesmo bloco e oferece `Voltar ao histórico` | manter o contexto único de Estoque | sim · Gustavo, 10/09/2026 |
| UX-EST-014 | `finalizado` descreve encerramento, não reconciliação perfeita | permitir sucesso, finalização com pendências e cancelamento conforme o resultado real | sim · Gustavo, 10/09/2026 |
| UX-EST-015 | Venda, Inventário, Maleta e Saída sem faturamento devem convergir para o mesmo padrão de escolha de variação | reduzir erro de identidade entre fluxos que movimentam peça | sim · direção de consistência, Gustavo, 10/09/2026 |

## Ordem conceitual do fluxo

```text
começar
→ contar incrementalmente
→ corrigir/remover quando necessário
→ pausar e retomar quantas vezes for preciso
→ Finalizar inventário
→ abrir Fechamento / Revisão com o resultado
→ selecionar somente divergências elegíveis
→ informar observação se necessário
→ aplicar; backend calcula a quantidade do ajuste
```

Finalizar não significa aplicar. Pausar não significa finalizar. Remover
contagem não significa contar zero.

## Semântica das divergências

| Situação | Comparação | Diferença | Natureza da correção |
|---|---|---|---|
| faltando | contado < esperado | negativa | saída/perda; reduz estoque |
| sobrando | contado > esperado | positiva | entrada/ajuste; aumenta estoque |

A tela não troca esses sentidos por conveniência de cor, legenda ou texto do
mockup. A aplicação continua sendo uma decisão posterior e explícita.

## Identidade de variação

- SKU com uma identidade física relevante segue sem interrupção;
- SKU com múltiplas variações abre a escolha contextual após o `409`;
- as opções vêm do cadastro real e usam identidade estável do backend;
- confirmar permanece indisponível até escolher uma variação ou a opção
  explícita `Não sei a variação`;
- `Não sei` não cria uma contagem normal sem variação: cria pendência de
  identificação, fora de comparação, movimento e ajuste até resolução;
- esse padrão deve manter a mesma linguagem e lógica em Venda, Inventário,
  Maleta e Saída sem faturamento, ainda sem compromisso de componente React.

## Hard deny de aplicação

Para qualquer item classificado como `naoConferido` ou `naoComparavel`, a tela
não pode renderizar checkbox desabilitado como se fosse uma ação futura: o
controle de seleção simplesmente não existe. Também não existe sugestão de
ajuste, `Selecionar todos` não o inclui e payload em lote não o referencia.

## Permissões

Consulta geral de estoque e permissões para começar, pausar, retomar, concluir,
cancelar ou aplicar ajustes ainda precisam de matriz própria. A interface não
deduz autorização pelo simples fato de a pessoa conseguir abrir Estoque.
