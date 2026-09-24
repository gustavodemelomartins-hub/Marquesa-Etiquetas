# Ideias funcionais

Espaço aberto para funcionalidade nova definida enquanto a refatoração
arquitetural acontece.

> **Estas ideias não devem ser implementadas automaticamente.** São requisitos
> futuros aguardando encaixe na arquitetura. Nenhum agente — Codex, Claude ou
> outro — abre código por causa de uma linha desta tabela. É preciso pedido
> humano explícito, e a fase certa do
> [Master Plan](../../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md).

## Como registrar

Adicione uma linha na tabela e, se a ideia tiver mais de um parágrafo, um bloco
detalhado logo abaixo. ID sequencial `IF-001`, `IF-002`… IDs não são
reaproveitados, mesmo depois de recusa.

| ID | Ideia | Domínio | Problema que resolve | Toca banco/estoque? | Status | Data |
|---|---|---|---|---|---|---|
| IF-001 | Seleção personalizada de intervalo no Painel de Vendas | vendas / analytics | analisar períodos contínuos fora dos presets fixos | banco: leitura; estoque: não | em detalhamento | 10/09/2026 |
| IF-002 | Entrada automática de produtos na fila de etiquetas | etiquetas / catálogo / importação | evitar recadastro e garantir que produto novo chegue ao preparo | banco: integração a avaliar; estoque: não movimenta | em detalhamento | 10/09/2026 |
| IF-003 | Nome de etiqueta abreviado e editável | etiquetas / catálogo | imprimir o texto usado pela Marquesa sem perder o nome completo do produto | banco: possível novo dado; estoque: não | em detalhamento | 10/09/2026 |
| IF-004 | Histórico auditável de impressão e reimpressão | etiquetas / perfis | saber quando, por quem e com quais itens cada lote foi gerado | banco: provável persistência; estoque: não | em detalhamento | 10/09/2026 |
| IF-005 | Área unificada de novos lançamentos e operações do dia | vendas / clientes / pagamentos | lançar sem perder a visão do que já aconteceu no dia | banco e estoque: usa escritas críticas existentes | em detalhamento | 10/09/2026 |
| IF-006 | Histórico completo filtrável e exportável de vendas | vendas / analytics / financeiro | investigar vendas além do resumo diário | banco: leitura; estoque: não | em detalhamento | 10/09/2026 |
| IF-007 | Compositor guiado de Monte seu Colar dentro da venda | personalização / vendas / estoque | montar composição válida sem controlar componentes manualmente | banco e estoque: baixa de base/componentes | em detalhamento | 10/09/2026 |
| IF-008 | Registro e histórico completo de saídas sem faturamento | estoque / saídas / auditoria | retirar peças sem contaminar vendas ou faturamento | banco e estoque: escrita crítica pela razão | em detalhamento | 10/09/2026 |
| IF-009 | Recebimentos múltiplos, mistos e parcelados por venda | vendas / financeiro / pagamentos | representar como o dinheiro realmente entra sem transformar o status em campo manual | banco: provável evolução de persistência; estoque: não movimenta | em detalhamento | 10/09/2026 |

**Status:** `registrada` · `em detalhamento` · `pronta para avaliação` ·
`encaixada na fase N` · `recusada`. Só o Gustavo move para `encaixada` ou
`recusada`.

**"Toca banco/estoque?"** é o campo que decide o custo real. Ideia que cria
tabela, coluna ou movimento de estoque não é ideia de tela: passa por
`safe-d1-change` e por proposta de schema separada, mesmo que visualmente
pareça pequena.

## Detalhamento

Um bloco por ideia que precise de mais que uma linha.

```markdown
### IF-000 — <título>

**O que é:**
**Por que agora:**
**Como o usuário usa:**
**O que ainda não sabemos:**
**Depende de:** (fase, tela, decisão)
**Referências:** (arquivos em 02-references/ ou 03-screens/*/images/)
```

### IF-001 — Seleção personalizada de intervalo no Painel de Vendas

**O que é:** permitir escolher um período contínuo, por exemplo janeiro de
2026 até outubro de 2026, além de `Tudo`, `12 meses`, `90 dias` e `30 dias`.

**Problema que resolve:** os presets não cobrem fechamento, comparação ou
investigação de uma faixa escolhida pela operação.

**Telas afetadas:** Vendas → Painel; gráfico Desempenho de vendas; Análise
detalhada; Evolução por mês.

**Comportamento esperado:** o período escolhido vira um único contexto para
as duas visões; uma barra pode selecionar um mês; início e fim personalizados
podem ser limpos; alternar a visão não perde a seleção.

**Regra de negócio:** dentro do mesmo intervalo, faturamento usa a data do
pagamento, enquanto vendas, peças e clientes usam a data da venda. Os dois
recortes não são forçados a coincidir.

**Métricas envolvidas:** faturamento, vendas, peças, clientes atendidas,
produtos, categorias, origens e destaques. Fórmulas ainda abertas continuam em
`03-screens/vendas/metrics.md`.

**Dependências:** fechar a interação de seleção; confirmar os contratos
analíticos existentes; garantir seleção equivalente por teclado.

**Necessidade futura de API:** leitura agregada e detalhada para intervalo
arbitrário, sem calcular regras financeiras novamente no navegador. Nenhuma
rota nova está aprovada aqui.

**Impacto:** não altera estoque; não exige escrita no banco no desenho atual;
toca leitura de vendas e pagamentos; pode incluir vendas originadas na
Nuvemshop, mas não altera sincronização nem estoque online.

**Decisões abertas:** `VEN-Q001`, `VEN-Q002` e `VEN-Q006`.

**Referências:**
[Análise detalhada](../03-screens/vendas/images/2026-09-10_vendas_desktop_01.png)
e [Evolução por mês](../03-screens/vendas/images/2026-09-10_vendas_desktop_02.png).

### IF-002 — Entrada automática de produtos na fila de etiquetas

**O que é:** todo produto vindo de cadastro manual ou importação passa a
aparecer automaticamente na fila de preparação, com a origem identificada.

**Problema que resolve:** elimina a inclusão repetida do mesmo produto em outro
painel e reduz o risco de esquecer etiquetas de peças recém-chegadas.

**Telas afetadas:** cadastro de produto, importação e Etiquetas › Preparar.

**Comportamento esperado:** o item entra uma vez, pode ser localizado por nome
ou SKU e recebe a quantidade definida pela regra ainda pendente. A entrada na
fila não movimenta estoque.

**Regra de negócio:** cadastro e importação continuam sendo autoridades sobre
o produto; Etiquetas recebe uma referência para preparar impressão. Remover da
fila não exclui produto nem afeta estoque, vendas ou maletas.

**Métricas envolvidas:** produtos na fila, etiquetas selecionadas, folhas e
posições. Não envolve faturamento, comissão ou pagamento.

**Dependências:** definir a quantidade inicial (`ETQ-Q003`) e a forma de evitar
duplicidade; avaliar como o catálogo/importação notificará a fila.

**Necessidade futura de API:** evento ou leitura incremental de produtos novos,
com origem e estado da etiqueta. Nenhuma rota foi aprovada.

**Impacto:** pode tocar persistência da fila; não cria movimento de estoque;
não toca venda, pagamento, comissão ou sincronização Nuvemshop, embora uma
importação originada da loja possa gerar um item na fila.

**Referência:** [Preparar etiquetas](../03-screens/etiquetas/images/2026-09-10_etiquetas_desktop_01.png).

### IF-003 — Nome de etiqueta abreviado e editável

**O que é:** manter um texto curto, próprio para impressão, que pode ser
corrigido sem substituir o nome completo do produto.

**Problema que resolve:** Sthefany Marques usa abreviações nas etiquetas e as
importações nem sempre contêm padrão suficiente para gerá-las corretamente.

**Telas afetadas:** Etiquetas › Preparar e, futuramente, pontos de cadastro ou
importação que mostrem a prévia da etiqueta.

**Comportamento esperado:** aplicar automaticamente apenas abreviações
conhecidas; marcar os demais nomes para revisão; permitir edição antes de
imprimir; reutilizar a correção conforme o escopo que ainda será decidido.

**Regra de negócio:** não adivinhar abreviação e não renomear o catálogo como
efeito colateral. Foto continua opcional.

**Métricas envolvidas:** quantidade de itens com nome revisado/pendente pode
ser usada operacionalmente no futuro; não há indicador aprovado agora.

**Dependências:** localizar e validar com Sthefany Marques a planilha/padrão existente;
decidir se o texto pertence ao SKU, variação ou lote (`DP-003`).

**Necessidade futura de API:** leitura e possível gravação do nome de etiqueta
ou do mapeamento de abreviações; qualquer mudança de banco exige proposta
separada.

**Impacto:** pode tocar catálogo e banco; não toca estoque, venda, pagamento,
comissão ou Nuvemshop.

**Referência:** [Preparar etiquetas](../03-screens/etiquetas/images/2026-09-10_etiquetas_desktop_01.png).

### IF-004 — Histórico auditável de impressão e reimpressão

**O que é:** registrar cada saída gerada com data, horário, perfil responsável,
origem, produtos, quantidades, folhas, papel e estado; permitir preparar uma
reimpressão como novo lote.

**Problema que resolve:** dá rastreabilidade ao trabalho e permite repetir um
lote sem reconstruí-lo manualmente.

**Telas afetadas:** Etiquetas › Impressão, Histórico e perfis/permissões.

**Comportamento esperado:** filtros por período e pessoa, detalhe lateral e
ação Preparar reimpressão. O registro original permanece imutável.

**Regra de negócio:** imprimir, gerar PDF e reimprimir não alteram estoque. A
autoria vem do perfil em uso e os estados não podem afirmar impressão física
sem evidência disponível.

**Métricas envolvidas:** produtos, etiquetas, folhas e posições por lote.

**Dependências:** solução futura de perfis; definição dos estados de impressão,
retenção e permissões; persistência a avaliar.

**Necessidade futura de API:** provável criação e consulta de lotes e itens de
impressão. Isso toca banco, mas nenhum schema ou migration é autorizado aqui.

**Impacto:** toca banco e perfis; não toca estoque, venda, pagamento, comissão
ou Nuvemshop.

**Referências:** [Revisar impressão](../03-screens/etiquetas/images/2026-09-10_etiquetas_desktop_02.png)
e [Histórico](../03-screens/etiquetas/images/2026-09-10_etiquetas_desktop_03.png).

### IF-005 — Área unificada de novos lançamentos e operações do dia

**O que é:** uma área com modos `Venda normal`, `Monte seu Colar` e `Saída sem
faturamento`, mantendo abaixo a lista resumida das operações recentes.

**Problema que resolve:** reduz troca de contexto no balcão e permite conferir
imediatamente se o lançamento apareceu.

**Telas afetadas:** Vendas › Lançamentos, clientes, pagamento e histórico do dia.

**Comportamento esperado:** busca/scan de item, quantidades, cliente, data,
canal, observação e preço/desconto; pagamento na mesma tela por um ou mais
recebimentos pagos ou pendentes; finalização idempotente e acesso ao histórico
completo. `PAGO`, `PARCIAL` e `A RECEBER` são resultados calculados, não opções
de preenchimento. O preço final é editado por item; se só parte das unidades
iguais receber outro preço, elas são separadas automaticamente em nova linha.
Trocar/limpar um rascunho preenchido exige confirmação.

**Regras e métricas:** preço cobrado e motivo de desconto seguem a regra atual;
não existe desconto geral distribuído. Venda retroativa é aceita, futura é
recusada; estoque baixa uma vez. Mostra peças, subtotal, desconto e total, sem
confundir valor vendido com faturamento.

**Dependências/API:** contratos de venda, clientes, catálogo, pagamentos e
histórico do dia já existem em partes; a composição final e as permissões ainda
precisam ser fechadas.

**Impacto:** toca banco, estoque, venda e pagamento; pode exibir acerto e site,
mas não altera comissão ou sincronização Nuvemshop por si só.

**Referência:** [Novo lançamento](../03-screens/vendas/images/2026-09-10_vendas-lancamentos_desktop_01.jpg).

### IF-006 — Histórico completo filtrável e exportável de vendas

**O que é:** lista paginada com período, busca, canal, tipo, pagamento, estado,
cards resumidos, exportação e ações por venda.

**Problema que resolve:** permite sair do resumo do dia para conferir um período
e encontrar uma operação específica sem usar o painel analítico.

**Telas afetadas:** Lançamentos, Histórico, Clientes e Financeiro.

**Comportamento esperado:** `Ver todas` preserva o contexto de origem; todos os
cards e o rodapé obedecem aos mesmos filtros; detalhe mostra itens, eventos,
pagamento e correções; exportação usa o conjunto filtrado definido.

**Regras e métricas:** total vendido usa data da venda e preço cobrado;
faturamento usa data do pagamento; situação da venda e do pagamento permanecem
separadas. Mede vendas, peças, valor vendido e dívida conforme fórmula ainda a
fechar.

**Dependências/API:** leitura paginada existe parcialmente; filtros adicionais,
agregados equivalentes, detalhe e exportação precisam de avaliação futura.

**Impacto:** leitura de banco, vendas e pagamentos; não movimenta estoque nem
altera comissão/Nuvemshop.

**Referência:** [Histórico completo de vendas](../03-screens/vendas/images/2026-09-10_vendas-historico-completo_desktop_01.jpg).

### IF-007 — Compositor guiado de Monte seu Colar dentro da venda

**O que é:** escolher um modelo e preencher cada posição com componente físico
compatível e disponível, adicionando a composição como item do rascunho.

**Problema que resolve:** oferece personalização sem transformar cada combinação
em produto permanente nem exigir baixa manual dos componentes.

**Telas afetadas:** Vendas › Lançamentos, Personalização e detalhe da venda.

**Comportamento esperado:** modelo define quantidade/tipo de posições; cada
posição preserva escolha e ordem; disponibilidade é validada antes e novamente
na finalização; a mesma cor/SKU pode ocupar vários slots quando o saldo cobre a
quantidade agregada; cancelar volta ao rascunho sem perda indevida.

**Regras e métricas:** preço é da composição inteira; base e componentes baixam
uma vez; configuração fica congelada; disponibilidade é limitada pelo conjunto
físico. Não cria saldo para o modelo comercial.

**Dependências/API:** funcionalidade existe atrás de flag e não está liberada em
produção; mistura com peças normais, troca de base e desenho por posição ainda
dependem de decisão.

**Impacto:** toca banco, estoque e venda; não muda comissão sem decisão própria;
integração com Nuvemshop continua futura.

**Referência:** [Monte seu Colar](../03-screens/vendas/images/2026-09-10_vendas-monte-seu-colar_desktop_01.jpg).

### IF-008 — Registro e histórico completo de saídas sem faturamento

**O que é:** registrar e consultar brinde, uso próprio, perda e sorteio com
itens, quantidade, data, explicação, responsável/destino, estado e estorno.

**Problema que resolve:** baixa peças com rastreabilidade sem criar venda,
cliente fictício ou faturamento.

**Telas afetadas:** Vendas › Lançamentos, Histórico de saídas, Estoque e
Inventário quando uma diferença for confirmada como perda.

**Comportamento esperado:** campos mudam conforme o motivo; registro é
idempotente; histórico filtra e exporta; correção estorna e preserva o original.

**Regras e métricas:** os quatro motivos são separados; ajuste de inventário não
é sinônimo de perda; saída reduz estoque pela razão e não entra em venda,
pagamento ou comissão. `Impacto estimado` permanece sem fórmula aprovada.

**Dependências/API:** contratos de listar, registrar e estornar já existem;
perfil, filtros adicionais, agregados, exportação e medida econômica precisam
ser avaliados. Qualquer mudança de schema exige trabalho separado.

**Impacto:** toca banco e estoque de forma crítica; não toca faturamento,
pagamento, comissão ou Nuvemshop.

**Referências:** [Registrar saída](../03-screens/vendas/images/2026-09-10_vendas-saida-sem-faturamento_desktop_01.jpg)
e [Histórico de saídas](../03-screens/vendas/images/2026-09-10_vendas-historico-saidas_desktop_01.jpg).

### IF-009 — Recebimentos múltiplos, mistos e parcelados por venda

**O que é:** uma venda possui um valor total e zero ou mais recebimentos. Cada
recebimento registra valor, forma, situação paga ou pendente, data efetiva
quando pago, vencimento quando pendente, observação opcional e, quando houver,
número da parcela.

**Problema que resolve:** representa PIX + dinheiro + cartão, entrada mais
saldo futuro e parcelamento sem pedir que a pessoa escolha manualmente um
estado financeiro que pode ficar incoerente com os valores.

**Telas afetadas:** Nova Venda, detalhe e histórico da venda, Clientes,
recebíveis, Painel de Vendas, filtros, cards e exportações financeiras.

**Comportamento esperado:** a Nova Venda começa com uma linha compacta cujo
valor é o saldo restante. Uma venda integral por PIX exige apenas confirmar
`PIX` e `Pago hoje`. `+ Adicionar pagamento` cria outra linha; `Parcelar` gera
parcelas editáveis; datas, vencimento e observação aparecem sob demanda. Cada
parcela continua independente depois da venda.

**Regra de negócio:** `valorRecebido` é a soma dos recebimentos pagos;
`valorAReceber = max(valorVenda - valorRecebido, 0)`. O status derivado é `A
RECEBER` quando recebido é zero, `PARCIAL` quando está entre zero e o total e
`PAGO` quando é igual ou superior ao total. Recebimento pendente não é
faturamento. Cada valor pago entra no faturamento na própria data efetiva de
pagamento, não na data da venda.

**Formas iniciais:** PIX, Dinheiro, Cartão de débito, Cartão de crédito,
Transferência, Boleto, Link de pagamento, Crédito da cliente e Outro. O
catálogo deve comportar evolução sem espalhar enums fixos pela interface.

**Métricas envolvidas:** valor da venda, recebido, a receber, status financeiro
derivado e faturamento por data efetiva. Venda e estoque continuam vinculados
à operação comercial, não ao momento de cada recebimento.

**Dependências:** ciclo auditável para liquidar, corrigir e estornar cada
recebimento; idempotência e concorrência; decisões sobre excedente/troco,
crédito da cliente, datas de cartão, taxas e geração de vencimentos.

**Necessidade futura de API:** coleção de recebimentos por venda e comandos
individuais para seu ciclo de vida, parcelas e resumos derivados. O contrato
atual não comprova esse modelo. Nenhuma rota, tabela ou migration está aprovada
por esta especificação.

**Impacto:** toca banco, venda, pagamento e analytics; não movimenta estoque ao
registrar ou liquidar recebimento; comissão só muda se regra futura usar data
de pagamento; não altera sincronização ou estoque da Nuvemshop.

**Decisões abertas:** `VEN-Q029` a `VEN-Q035`.

**Referências:** [proposta da Nova Venda](../03-screens/vendas/README.md#proposta-de-ux--pagamento),
[regras](../03-screens/vendas/rules.md),
[estados](../03-screens/vendas/states.md) e
[fluxo de recebimentos](../05-flows/registrar-recebimentos-da-venda.md).

## Recusadas

Ideia descartada fica registrada com o motivo — evita que volte a cada rodada.

| ID | Ideia | Por que não | Data |
|---|---|---|---|
| | | | |
