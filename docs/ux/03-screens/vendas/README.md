# Tela: Vendas

| | |
|---|---|
| Estado do material | descrito |
| Última atualização | 10/09/2026 |
| Referências recebidas | 8 mockups próprios |
| Existe hoje no legado? | sim |
| Existe hoje no React? | ver [07-mapping/frontend-feature-map.md](../../07-mapping/frontend-feature-map.md) |

> Esta pasta é documental. Nada aqui autoriza implementação; ver
> [00-index.md](../../00-index.md).

## Objetivo da tela

Registrar vendas, montar produtos personalizados, registrar saídas sem
faturamento e consultar o histórico detalhado. Cobre produto, cliente, preço,
desconto, pagamento, data, canal, correção e estorno sem confundir venda com
movimento não comercial.

O Painel de Vendas também oferece leitura analítica do período selecionado em
duas visões complementares: **Análise detalhada** e **Evolução por mês**.

## Alvo visual aprovado

- o [protótipo mestre navegável](master.html) consolida o padrão visual da
  área, o cabeçalho global e as superfícies `Painel`, `Lançamentos`, `Clientes`
  e `Saídas sem faturamento`; seus dados são ilustrativos e não constituem
  integração com a API;
- composição, hierarquia e linguagem visual seguem os dois mockups recebidos
  em 10/09/2026;
- gráficos devem manter proporção e legibilidade; a tela pode rolar
  verticalmente para preservar a análise;
- `Análise detalhada` e `Evolução por mês` são duas visões da mesma seleção,
  alternadas por um controle segmentado;
- o cabeçalho segue o padrão global em
  [04-components/header](../../04-components/header/README.md).
- títulos de página e de seção usam texto escuro como padrão; bordô/rosa fica
  reservado para seleção ativa, ação primária e destaques pontuais;
- os símbolos de coroa presentes em parte dos novos mockups não substituem o
  monograma global aprovado.

O nome correto no perfil e nas referências de operação é **Sthefany Marques**.
Mockups raster antigos que exibem outra grafia são mantidos como fonte
histórica, mas a grafia neles está supersedida por esta correção de 11/09/2026.

## Para quem

Sthefany Marques e demais perfis autorizados da operação. Permissões de consulta,
desconto, estorno, saída sem faturamento e exportação ainda estão abertas.

## Conteúdo da pasta

| Arquivo | Guarda |
|---|---|
| `images/` | prints, mockups e protótipos desta tela |
| [states.md](states.md) | estados de UI: vazio, carregando, erro, parcial, sucesso |
| [rules.md](rules.md) | regra de negócio que a tela precisa respeitar |
| [metrics.md](metrics.md) | número exibido e como é calculado |
| [api-needs.md](api-needs.md) | dado que a tela precisa e que a API ainda não dá |
| [open-questions.md](open-questions.md) | decisão aberta, específica desta tela |

Inspiração externa deste domínio: [02-references/vendas/](../../02-references/vendas/).

## Blocos da tela

Preencher quando houver mockup. Um bloco por seção visível.

| # | Bloco | O que mostra | Origem do dado | Referência |
|---|---|---|---|---|
| 1 | resumo financeiro | faturamento do período, faturamento do mês e contas a receber | analytics / recebíveis | ambos os mockups |
| 2 | chamada de reparos | quantidade ativa e itens próximos do prazo | domínio Reparos; integração futura | ambos os mockups |
| 3 | desempenho de vendas | série temporal e presets de período | analytics | ambos os mockups |
| 4 | seletor de visão | alterna Análise detalhada e Evolução por mês | estado da interface | ambos os mockups |
| 5 | análise detalhada | produtos, categorias e origens no período completo | analytics | [mockup 01](images/2026-09-10_vendas_desktop_01.png) |
| 6 | evolução por mês | mês/intervalo selecionado, KPIs, categorias, destaques e vendas | analytics / vendas | [mockup 02](images/2026-09-10_vendas_desktop_02.png) |
| 7 | tipos de lançamento | Venda normal, Monte seu Colar e Saída sem faturamento | estado do rascunho | [Lançamentos](images/2026-09-10_vendas-lancamentos_desktop_01.jpg) |
| 8 | venda normal | itens, cliente, data, canal, observação, preço final por peça, desconto, pagamento e total | catálogo / clientes / vendas | [Nova Venda com pagamento misto](images/2026-09-10_vendas-nova-venda-pagamento-misto_desktop_01.png) |
| 9 | vendas do dia | operações recentes com tipo, pagamento, estado e ações | histórico comercial do dia | [Lançamentos](images/2026-09-10_vendas-lancamentos_desktop_01.jpg) |
| 10 | Monte seu Colar | modelo, disponibilidade, escolhas por posição e valor da composição | personalização / estoque | [Monte seu Colar](images/2026-09-10_vendas-monte-seu-colar_desktop_01.jpg) |
| 11 | saída sem faturamento | itens, motivo, destino, data, canal, explicação e efeito físico | estoque / saídas | [Saída sem faturamento](images/2026-09-10_vendas-saida-sem-faturamento_desktop_01.jpg) |
| 12 | histórico completo de vendas | filtros, indicadores, exportação, tabela paginada e ações | vendas / pagamentos / clientes | [Histórico de vendas](images/2026-09-10_vendas-historico-completo_desktop_01.jpg) |
| 13 | histórico completo de saídas | filtros, totais por tipo, exportação, tabela e ações | saídas / estoque | [Histórico de saídas](images/2026-09-10_vendas-historico-saidas_desktop_01.jpg) |

## Revisão de produto desta rodada

### Pontos fortes

- o rascunho da operação e o histórico do dia convivem sem exigir troca de tela;
- os três caminhos ficam reconhecíveis antes da pessoa preencher campos;
- o histórico completo possui período, busca, filtros, totais, paginação e
  exportação no mesmo contexto;
- o Monte seu Colar mostra disponibilidade antes de adicionar a composição;
- a saída sem faturamento anuncia que não gera receita e mostra seu efeito.

### Ajustes necessários antes de fechar

- `Concluída` e `A receber` misturam estado operacional com estado financeiro;
- o Monte seu Colar precisa representar cada posição do modelo, inclusive duas
  crianças do mesmo tipo e a ordem dos pingentes;
- `Perda / ajuste` não deve ser fechado como um único motivo: ajuste de
  inventário pode inclusive adicionar estoque;
- `Sorteio`, já decidido como saída sem faturamento própria, não aparece;
- `Impacto estimado` precisa de fórmula explícita: preço de tabela não pode ser
  apresentado silenciosamente como custo ou prejuízo;
- `Observações (opcional)` precisa ser reconciliado com a exigência atual de
  explicação auditável para saída sem faturamento.

Pagamento e desconto já receberam propostas específicas abaixo. A área de
Pagamento não pede que a pessoa escolha `Pago`, `Parcial` ou `A receber`:
esses estados são calculados a partir dos lançamentos registrados.

## Proposta de UX — Desconto por peça

O preço unitário em cinza, imediatamente antes do subtotal em negrito, é o
ponto de entrada da edição. Ele deve parecer interativo por foco, hover e um
ícone discreto de lápis; não pode depender de a pessoa descobrir por acaso que
um número estático aceita clique.

Ao ativá-lo, um editor compacto ancorado na linha mostra:

```text
Preço de tabela                 R$ 150,00
Preço final por peça           [R$ 135,00]
Desconto calculado         R$ 15,00 · 10%
Motivo*                       [Grupo VIP ▾]

                         Cancelar  Aplicar
```

- Sthefany Marques informa o preço final cobrado, não o valor do abatimento;
- desconto em reais e percentual são derivados;
- motivo é obrigatório quando o preço final difere da tabela;
- aplicar recalcula subtotal da linha, desconto total, valor da venda e saldo
  dos pagamentos ainda não confirmados;
- o catálogo não é reprecificado;
- após aplicar, preço de tabela riscado e preço final destacado tornam o
  desconto visível sem aumentar permanentemente a altura da linha;
- se uma linha possui duas ou mais unidades e apenas parte delas recebe outro
  preço, as unidades afetadas são separadas automaticamente em nova linha;
- linhas com mesmo SKU só voltam a ser agrupadas quando quantidade, preço final
  e motivo forem iguais.

Especificação reutilizável:
[editor de preço do item](../../04-components/item-price-editor/README.md).

## Proposta de UX — Pagamento

### Caminho rápido

O bloco fica abaixo dos dados da venda e acima da barra de total/finalização.
Ao abrir, mostra o saldo total já preenchido e as formas mais frequentes como
atalhos. Para uma venda integral por PIX, Sthefany escolhe `PIX`; o lançamento
fica `Pago hoje` e a venda pode ser finalizada.

```text
Pagamento
Venda R$ 500,00   Recebido R$ 0,00   A receber R$ 500,00

[ R$ 500,00 ]  [ PIX ▾ ]  [ Pago hoje ▾ ]                 [•••]

+ Adicionar pagamento                         Parcelar · Mais opções
```

O valor da primeira linha e de cada nova linha vem preenchido com o saldo que
ainda falta distribuir. Nenhum pagamento é salvo só por aparecer preenchido:
a finalização confirma venda e lançamentos uma vez.

### Quando houver pagamento misto

`+ Adicionar pagamento` cria outra linha. As linhas continuam compactas e o
resumo reage imediatamente.

```text
R$ 150,00  PIX                 Pago · 10/09/2026
R$ 200,00  Cartão de crédito  Pago · 10/09/2026
R$ 150,00  Boleto             Pendente · vence 20/09/2026

Venda R$ 500,00   Recebido R$ 350,00   A receber R$ 150,00   PARCIAL
```

### Quando houver parcelamento

`Parcelar` abre uma configuração curta — número de parcelas e regra de datas —
e gera linhas `1/3`, `2/3`, `3/3`. Depois disso, cada parcela é independente:
valor, forma, vencimento, estado e data efetiva podem ser vistos e alterados
conforme as permissões.

### Campos avançados

Data efetiva, vencimento e observação aparecem somente quando são pertinentes.
`Mais opções` também expõe as formas menos usadas. A interface mantém visíveis
em todo momento apenas três números: **valor da venda**, **valor recebido** e
**valor a receber**.

## Log de material recebido

| Data | O que chegou | Arquivo | Quem enviou |
|---|---|---|---|
| 10/09/2026 | alvo do Painel em Análise detalhada | [2026-09-10_vendas_desktop_01.png](images/2026-09-10_vendas_desktop_01.png) | Gustavo |
| 10/09/2026 | alvo do Painel em Evolução por mês | [2026-09-10_vendas_desktop_02.png](images/2026-09-10_vendas_desktop_02.png) | Gustavo |
| 10/09/2026 | novo lançamento e vendas do dia | [2026-09-10_vendas-lancamentos_desktop_01.jpg](images/2026-09-10_vendas-lancamentos_desktop_01.jpg) | Gustavo |
| 10/09/2026 | composição Monte seu Colar | [2026-09-10_vendas-monte-seu-colar_desktop_01.jpg](images/2026-09-10_vendas-monte-seu-colar_desktop_01.jpg) | Gustavo |
| 10/09/2026 | registro e resumo de saída sem faturamento | [2026-09-10_vendas-saida-sem-faturamento_desktop_01.jpg](images/2026-09-10_vendas-saida-sem-faturamento_desktop_01.jpg) | Gustavo |
| 10/09/2026 | histórico completo de vendas | [2026-09-10_vendas-historico-completo_desktop_01.jpg](images/2026-09-10_vendas-historico-completo_desktop_01.jpg) | Gustavo |
| 10/09/2026 | histórico completo de saídas sem faturamento | [2026-09-10_vendas-historico-saidas_desktop_01.jpg](images/2026-09-10_vendas-historico-saidas_desktop_01.jpg) | Gustavo |
| 10/09/2026 | Nova Venda com pagamento misto; base para definir desconto por peça | [2026-09-10_vendas-nova-venda-pagamento-misto_desktop_01.png](images/2026-09-10_vendas-nova-venda-pagamento-misto_desktop_01.png) | Gustavo |

## Artefatos consolidados em 11/09/2026

| Artefato | Arquivo | Papel |
|---|---|---|
| protótipo navegável | [master.html](master.html) | referência-mestra de layout, componentes e interação; sem API real |
| estilo do protótipo | [master.css](master.css) | tokens, responsividade e estados visuais |
| Painel · análise detalhada | [desktop](images/2026-09-11_vendas-master_desktop_01.png) | captura principal |
| Painel · evolução por mês | [desktop](images/2026-09-11_vendas-master-mes_desktop_01.png) | variação analítica |
| Lançamentos | [desktop](images/2026-09-11_vendas-master-lancamentos_desktop_01.png) | operação, cliente e pagamento |
| Painel responsivo | [mobile](images/2026-09-11_vendas-master_mobile_01.png) | referência de reorganização em tela estreita |
