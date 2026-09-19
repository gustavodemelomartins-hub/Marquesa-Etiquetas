# Regras de negócio — Vendas

A fonte da regra é [api/REGRAS.md](../../../../api/REGRAS.md). Este arquivo só
registra **como esta tela expõe a regra** e onde a tela impõe restrição própria.
Divergência entre os dois: o `REGRAS.md` vence, e a divergência vira linha em
[open-questions.md](open-questions.md).

## Regras herdadas que a tela deve respeitar

| Regra | Fonte | Consequência na tela | Confirmado? |
|---|---|---|---|
| faturamento é dinheiro recebido | `api/REGRAS.md` §36 e Canonical Vendas | filtra por data do pagamento, não pela data da venda | sim |
| vendas, peças e clientes atendidas são saídas comerciais | `api/REGRAS.md` §36 | filtram pela data da venda | sim |
| clientes atendidas conta pessoas distintas | `api/REGRAS.md` §36 | várias compras da mesma cliente no período contam uma cliente | sim |
| faturamento e vendas podem não coincidir no mês | `api/REGRAS.md` §36 | a tela explica a diferença; não inventa número conciliador | sim |
| A Receber não é o complemento do faturamento | Canonical Vendas | exibe apenas dívida real e cobrável | sim |
| consignação não é venda antes do acerto | `api/REGRAS.md` | peça em maleta aberta não entra nos números de venda | sim |
| venda cancelada não compõe resultado | `api/REGRAS.md` §28 | fica no histórico com estado, mas sai dos agregados elegíveis | sim |
| o preço da venda é o valor efetivamente cobrado; preço de tabela fica congelado | `api/REGRAS.md` §27 e Canonical Vendas | edição de preço é por item; diferença vira desconto rastreável | sim |
| mudança de preço exige motivo e não reprecifica o catálogo | `api/REGRAS.md` §27 | a tela pede o preço final e o motivo antes de finalizar | sim |
| produto sem preço não pode ser vendido como R$ 0 | `api/REGRAS.md` §24 | item fica bloqueado com explicação | sim |
| data da venda pode ser passada, nunca futura | Canonical Vendas | seletor aceita lançamento retroativo e recusa data futura | sim |
| pagamento não movimenta estoque | Canonical Vendas | marcar como paga altera o financeiro, não baixa a peça outra vez | sim |
| brinde, uso próprio, perda e sorteio são saídas sem faturamento distintas | `api/REGRAS.md` §31 e DEC-2026-012 | seletor de motivo oferece quatro categorias sem criar venda ou cliente fictício | sim |
| saída sem faturamento é corrigida por estorno, nunca exclusão | `api/REGRAS.md` §31 | ação devolve a peça por contrapartida e preserva histórico | sim |
| Monte seu Colar baixa base e componentes físicos exatamente uma vez | `api/REGRAS.md` §42 | disponibilidade e finalização validam a composição completa | sim |
| o preço do modelo montável é da composição inteira | `api/REGRAS.md` §42 | não somar preços avulsos dos componentes | sim |
| configuração do Monte seu Colar fica congelada na venda | `api/REGRAS.md` §42 | histórico e detalhe mostram as escolhas originais | sim |
| slots iguais do Monte seu Colar podem repetir SKU/cor, limitados pela quantidade disponível | Gustavo, 10/09/2026 | a validação agrupa as escolhas por SKU e compara a quantidade necessária ao estoque elegível | sim |

## Restrições próprias da tela

Regra que existe por causa da interface, não do domínio — ordenação padrão,
limite de itens por página, o que não pode ser editado inline.

| # | Restrição | Motivo | Confirmado? |
|---|---|---|---|
| UX-VEN-001 | presets `Tudo`, `12 meses`, `90 dias` e `30 dias` atualizam o painel analítico | manter um único contexto temporal | sim · Gustavo, 10/09/2026 |
| UX-VEN-002 | Análise detalhada mostra o período completo selecionado | esta visão responde “o que compôs o período” | sim · Gustavo, 10/09/2026 |
| UX-VEN-003 | o controle segmentado alterna entre Análise detalhada e Evolução por mês sem perder a seleção geral | as duas visões são complementares, não páginas desconectadas | sim · Gustavo, 10/09/2026 |
| UX-VEN-004 | clicar em uma barra mensal seleciona aquele mês e atualiza o bloco inferior | ligar visão geral e investigação | sim · Gustavo, 10/09/2026 |
| UX-VEN-005 | o usuário pode escolher um intervalo contínuo personalizado, como jan/2026 a out/2026 | permitir análise fora dos presets | sim · capacidade; interação exata aberta |
| UX-VEN-006 | limpar mês/intervalo volta ao contexto do período geral | seleção precisa ser reversível e explícita | sim · Gustavo, 10/09/2026 |
| UX-VEN-007 | gráficos preservam proporção e altura legível; conteúdo excedente usa rolagem vertical | não achatar a análise para caber na tela | sim · Gustavo, 10/09/2026 |
| UX-VEN-008 | seleção por gráfico tem alternativa acessível por teclado/controle explícito | clique em barra não pode ser o único caminho | sim · regra de UX |
| UX-VEN-009 | títulos principais e de seção usam cor escura; bordô/rosa indica seleção, ação ou destaque pontual | recuperar hierarquia e reduzir excesso de rosa | sim · Gustavo, 10/09/2026 |
| UX-VEN-010 | o clique em `Ver todas`/`Detalhes` leva ao histórico completo sem perder o contexto do dia | conectar resumo e investigação | sim · capacidade; período inicial ainda aberto |
| UX-VEN-011 | finalizar venda, registrar saída e estornar são ações idempotentes e mostram confirmação inequívoca | evitar venda ou baixa duplicada por clique/retry | sim · regra de segurança |
| UX-VEN-012 | a baixa de estoque só é tratada como concluída depois da confirmação da operação | não exibir sucesso enquanto a escrita está incerta | sim · regra de segurança |
| UX-VEN-013 | `PAGO`, `PARCIAL` e `A RECEBER` são estados derivados dos recebimentos, nunca opções manuais | impedir que o rótulo financeiro contradiga os valores registrados | sim · Gustavo, 10/09/2026 |
| UX-VEN-014 | uma venda aceita vários recebimentos e várias formas de pagamento | suportar PIX + dinheiro + cartão, pagamentos parciais e outros mistos | sim · Gustavo, 10/09/2026 |
| UX-VEN-015 | o caminho simples registra uma venda integral em poucos segundos; pagamentos mistos usam expansão progressiva e qualquer saldo não recebido permanece em `A receber`, sem parcelamento automático nesta versão | manter velocidade no balcão e uma cobrança simples | atualizado · Gustavo, 14/09/2026 |
| UX-VEN-016 | o preço unitário da linha abre a edição do preço final cobrado; desconto e percentual são derivados e o motivo é obrigatório | reproduzir a linguagem do balcão e impedir preço diferente sem explicação | sim · regra vigente + Gustavo, 10/09/2026 |
| UX-VEN-017 | quando somente parte das unidades iguais recebe outro preço, a linha é separada automaticamente | preservar desconto realmente individual sem fingir que todas as unidades tiveram o mesmo preço | sim · Gustavo, 10/09/2026 |
| UX-VEN-018 | em `Vendas do período`, toda venda com saldo cobrável usa o rótulo `A RECEBER` em vinho; o quanto já foi recebido aparece nos valores do detalhe, e a ação `Pendente` permanece amarela | comunicar a ação necessária sem criar dois rótulos para vendas que ainda exigem cobrança | sim · Gustavo, 12/09/2026 |
| UX-VEN-019 | os detalhes das vendas podem ser expandidos e recolhidos de forma independente, mantendo quantas linhas abertas forem úteis; trocar página ou contexto recolhe todos | permitir comparação entre vendas sem manter detalhes ligados a dados que acabaram de mudar | sim · Gustavo, 12/09/2026 |
| UX-VEN-020 | `Vendas do período` mostra até 10 vendas por página | aumentar a visão comparativa sem transformar a lista em rolagem excessiva | sim · Gustavo, 12/09/2026 |
| UX-VEN-021 | o lançamento começa reduzido no seletor de tipo; `Venda normal` revela uma superfície contínua com Itens, Cliente e Pagamento em etapas recolhíveis; no mobile, total e `Finalizar venda` permanecem alcançáveis acima da navegação | preservar velocidade de balcão sem expor um formulário vazio e longo | sim · Gustavo, 12/09/2026 |
| UX-VEN-022 | `Vendas de hoje` permanece visível abaixo dos tipos de lançamento, mesmo antes de abrir `Venda normal`; cores, tipografia, espaçamento e componentes usam a identidade nova do sistema | manter o contexto do dia disponível sem obrigar a começar uma operação | sim · Gustavo, 12/09/2026 |
| UX-VEN-023 | tentar adicionar novamente um SKU que já está no carrinho não cria linha nem aumenta quantidade; a interface orienta usar o controle `+` da peça | impedir aumento acidental por clique repetido em `Adicionar` | sim · Gustavo, 12/09/2026 |
| UX-VEN-024 | preço final abaixo do padrão aparece como `Desconto`; preço final acima aparece como `Acréscimo`; ambos são valores positivos e o motivo continua obrigatório | impedir desconto negativo e deixar explícito o sentido da alteração | sim · Gustavo, 12/09/2026 |
| UX-VEN-025 | a confirmação final mostra cliente, data, local/canal, itens, pagamentos, vencimentos, observação, preço padrão, desconto/acréscimo, total, recebido e a receber | permitir conferência completa antes de registrar a venda | sim · Gustavo, 12/09/2026 |
| UX-VEN-026 | `Local ou canal` oferece os termos já usados no sistema: Balcão, WhatsApp, Instagram, Grupo VIP, Feira, Maleta e Outro com texto livre; a distinção futura entre canal e origem estrutural continua em `VEN-Q013` | usar o vocabulário operacional existente sem fingir que a modelagem de origem já foi decidida | sim · Gustavo, 12/09/2026 |
| UX-VEN-027 | ao abrir `Itens da venda`, a busca começa vazia e sem sugestões; produtos só aparecem depois de digitar, o leitor físico usa o mesmo campo e a câmera do celular só é ativada após toque e confirmação explícitos | evitar catálogo involuntário e reunir digitação, etiqueta e câmera numa entrada única | sim · Gustavo, 12/09/2026 |
| UX-VEN-028 | a busca mostra uma peça com variações uma única vez; se houver mais de uma opção, digitar, bipar ou usar a câmera abre uma escolha explícita com os nomes reais e o saldo de cada variação; a variação escolhida acompanha a linha e a revisão final, e opções sem estoque não podem ser selecionadas | a etiqueta é igual entre variações e não identifica sozinha qual peça física saiu; a venda nunca escolhe por aproximação | sim · Gustavo, 12/09/2026 |
| UX-VEN-029 | `Monte seu Colar` começa sem seleção; o modelo comercial define preço e posições exatas, a base Veneziana SKU `444032` entra automaticamente e cada posição aceita somente os componentes físicos compatíveis; o mesmo SKU pode ocupar posições repetidas enquanto o saldo agregado permitir; ao adicionar, a composição segue como uma única linha comercial com base, ordem e escolhas congeladas | separar a configuração vendida dos componentes que baixam estoque, impedir composição livre e conservar uma conferência curta no celular | substituída por UX-VEN-030 · Gustavo, 13/09/2026 |
| UX-VEN-030 | `Monte seu Colar` começa zerado por quantidades de Menino e Menina; cada unidade recebe sua cor em mini-card compacto; as cinco configurações atuais preenchem SKU, nome e preço conhecidos; outra configuração recebe SKU de seis dígitos, nome e preço sugeridos editáveis, com opção de pingente extra; a base Veneziana SKU `444032` permanece automática e a composição segue como uma única linha comercial | tornar o balcão mais rápido no celular sem perder a identificação de cada peça física, o reconhecimento do produto comercial nem a conferência do valor | sim · Gustavo, 13/09/2026 · aprovado para o protótipo; implementação transacional ainda depende da regra canônica |

## Desconto na Nova Venda

- a pessoa edita o `preço final por peça`; não digita simultaneamente preço e
  desconto;
- quando `preço padrão > preço final`, `desconto unitário = preço padrão − preço final`;
- quando `preço final > preço padrão`, `acréscimo unitário = preço final − preço padrão`;
- desconto e acréscimo nunca são exibidos como valor negativo;
- alterar o preço exige motivo antes da finalização;
- preço de tabela continua pertencendo ao catálogo e não é alterado pela venda;
- quantidade maior que um pode compartilhar o mesmo preço final e motivo;
- se o desconto alcançar somente algumas unidades, a interface separa essas
  unidades em outra linha do mesmo SKU, preservando quantidade, preço final e
  motivo de cada grupo;
- subtotal da linha usa `quantidade × preço final unitário`;
- valor da venda é recalculado antes de validar a distribuição dos pagamentos;
- desconto não cria nem desfaz movimento de estoque.

## Pagamento na Nova Venda

### Estrutura

- a venda possui um `valor total` e zero ou mais lançamentos de recebimento;
- cada lançamento contém valor, forma, estado `pago` ou `pendente` e observação
  opcional;
- lançamento pago exige data efetiva do pagamento;
- lançamento pendente exige vencimento;
- uma venda pode combinar PIX, Dinheiro, Cartão de débito, Cartão de crédito,
  Transferência, Boleto, Link de pagamento, Crédito da cliente e Outro;
- pagamento misto é a coexistência de lançamentos de formas diferentes;
- esta versão não gera parcelas; o saldo que ainda não entrou permanece em
  `A receber` até um recebimento posterior;
- qualquer recebimento posterior não movimenta estoque novamente.

### Valores derivados

```text
valor recebido = soma dos lançamentos com estado pago
valor a receber = máximo(valor total da venda − valor recebido, 0)

recebido = 0                → A RECEBER
0 < recebido < valor total  → PARCIAL
recebido >= valor total     → PAGO
```

Lançamento pendente organiza a cobrança, mas não entra em `valor recebido` nem
em faturamento. O total pendente planejado deve cobrir o saldo da venda; excesso,
troco e valores não distribuídos permanecem decisões abertas.

### Faturamento

- cada lançamento pago entra no faturamento pela sua própria data efetiva;
- a data da venda não substitui a data do recebimento;
- converter um recebimento pendente para pago registra a data efetiva e não
  rebaixa estoque;
- corrigir ou estornar recebimento precisa preservar trilha auditável e
  recalcular os três valores derivados.

## Distinções que a interface não pode misturar

- **tipo de operação:** venda, acerto, saída sem faturamento, troca etc.;
- **canal/local:** balcão, WhatsApp, feira ou outro local aprovado;
- **estado da venda:** ativa, cancelada/estornada ou situação equivalente;
- **estado financeiro:** paga, parcialmente paga, a receber, não cobrável ou
  indeterminado;
- **valor vendido:** preço cobrado na data da venda;
- **faturamento:** dinheiro efetivamente recebido na data do pagamento.

Os nomes e opções finais dessas taxonomias ainda dependem das perguntas em
[open-questions.md](open-questions.md).

## Permissões

Quem pode ver e quem pode escrever nesta tela: — ainda não definido —
