# Decisões de design — Marquesa V2

**Estado:** `READY FOR GUSTAVO REVIEW` · **Data:** 19/09/2026
O que foi deliberadamente mudado em relação ao protótipo anterior
(`31c9caf`), com o motivo. Nenhuma regra de negócio foi alterada.

## 1. Bordô como tinta, não como preenchimento

**Antes:** todo número grande era bordô — vendas do dia, a receber, valor do
estoque, atraso. Tudo gritava, então nada tinha ênfase, e a cor da marca virava
ruído de fundo.
**Agora:** dinheiro e quantidade são escritos em tinta escura (`--mq-ink`).
Bordô marca a marca (trilho), a ação primária, a seleção e **o número que pede
decisão** — em geral um por tela. O resultado é que "A receber" finalmente se
destaca, porque é o único bordô na linha de indicadores.

## 2. "A receber" deixou de ser vermelho-marca

**Antes:** `a receber` era uma pílula bordô sólida, visualmente idêntica a erro.
**Agora:** saldo aberto é **estado neutro** (`.mq-status--open`); atraso e falha
usam terracota (`--mq-risk`, `#A83226`), que não se confunde com a marca. Cor
nunca é o único sinal: toda situação tem ponto + texto.
**Precisa da sua decisão:** isto contraria a linha "a receber: bordô sólido" do
design system anterior.

## 3. Um casco de aplicativo no lugar de um mural de links

Trilho lateral bordô permanente, com os 13 módulos em quatro grupos; barra
superior com contexto, busca, sino e conta; navegação inferior no telefone.
Ver [arquitetura de navegação](../07-mapping/navigation-architecture-v2.md).
É a mudança que mais faz o sistema parecer um programa só: toda tela passa a ser
vista dentro do mesmo quadro.

## 4. Abas do módulo saíram do cabeçalho global

"Em que módulo estou" (trilho) e "que recorte deste módulo estou vendo" (abas)
eram duas faixas coladas no topo. As abas desceram para dentro da página, logo
abaixo do título.

## 5. Clientes virou módulo próprio

**Antes:** Clientes era a aba `#clientes` dentro de `vendas/master.html`, o
arquivo de 163 KB que também carrega Nova venda, Monte seu Colar e Saídas.
**Agora:** `03-screens/clientes/` com lista e **painel de relacionamento**:
identidade, cinco indicadores, linha do tempo que separa compra de pagamento,
situação financeira, crédito, pós-venda (garantia, reparo e troca), observações
e atividade da ficha. A rota `/prototype/clientes/` passou a apontar para ele.

**Pendência que isto cria — a mais importante desta rodada.** O cadastro
completo da cliente (e-mail, CPF, nascimento), o botão "nova venda a partir da
cliente" e a persistência que o teste de dados demonstrativos cobre continuam
vivendo dentro de `vendas/master.html`, agora na aba **Cadastro de clientes**.
O módulo novo é o painel da relação; o antigo é o cadastro operacional. Manter
os dois é um remendo consciente: unificá-los significa mover esse fluxo inteiro
para `03-screens/clientes/`, e essa é uma decisão sua, não minha. Enquanto isso,
a aba de Vendas tem um link explícito para o módulo Clientes.

## 6. Três datas ditas de uma vez, no Financeiro

Data da venda, data efetiva do pagamento e data do registro passaram a ter uma
legenda fixa no topo de "A receber", e cada uma aparece rotulada nas linhas, no
painel da venda e no diálogo de recebimento. O faturamento continua contando
pela **data efetiva** — agora isso está escrito na tela, não só na regra.

## 7. A lista é a protagonista na Nuvemshop

Sem painel de cartões. A fila virou o conteúdo: peça, SKU, categoria, situação,
pendência nomeada ("falta imagens, categoria, preço"), presença na loja, data de
cadastro, estoque, preço, as cinco etapas em um stepper e **a próxima ação
possível** — tudo em uma linha, que vira bloco no telefone. Os filtros por etapa
trazem a contagem e substituem o dashboard.

## 8. Estoque responde onde está o patrimônio

Rosca de distribuição (em casa × com revendedoras), lista com os três destinos,
categorias por quantidade e um aviso explícito de que o valor de referência usa
**preço cadastrado** e não representa patrimônio contábil. O inventário
permanece com contagem e correção como etapas separadas.

## 9. Gráfico responde uma pergunta e repete a resposta em texto

Barras claras com destaque no pico, grade discreta, e — abaixo — total do dia,
ticket médio e melhor faixa em números. Quem não lê o gráfico lê a linha.

## 10. Tabela vira cartão, não tabela espremida

Abaixo de 860 px cada linha vira um cartão com rótulo por campo. Nada depende de
rolagem horizontal escondida e nada depende de `hover`.

## 11. Ícones em vez de glifos de texto

`!`, `R$`, `□`, `◇`, `•••` e `↗` eram caracteres. Agora há um dicionário SVG de
traço único cobrindo o domínio (Pix, cartão, dinheiro, crédito, recebimento,
cliente, venda, estoque, inventário, maleta, garantia, reparo, troca, etiqueta,
Nuvemshop, configuração, notificação), servido por `MarquesaUI.icon()`.

## 12. O design system virou código do produto

`marquesa.css` é a primeira folha de toda rota e `system.css` a última. A
vitrine mostra os mesmos componentes que as telas usam. Telas escritas antes do
sistema não foram reescritas: `system.css` traduz o vocabulário antigo
(`.data-section`, `.metric-row`, `.status`, `.account-row`, …) para os tokens
novos, então Catálogo, Revendedoras, Garantias, Etiquetas, Notificações e
Configurações mudaram de língua sem mudar de estrutura.

## Decisões que dependem de você

1. **Unificar Clientes.** Mover cadastro completo e "nova venda a partir da
   cliente" para o módulo novo, ou manter a divisão atual.
2. **"A receber" deixar de ser bordô** (item 2) contraria o design system
   anterior — vale confirmar.
3. **Busca global** da barra superior: busca de verdade ou atalho por módulo.
4. Fórmulas dos indicadores, matriz de permissões e regra de crédito continuam
   abertas, como já estavam.

## O que **não** mudou

- Nenhuma regra de negócio, nenhum fluxo, nenhum campo obrigatório.
- Nenhum arquivo de `api/`, `src/`, `frontend/` ou migration.
- `movimentos` continua sendo razão contábil; nada no protótipo grava estoque.
- Distribuição de variação continua nunca sendo adivinhada.
- Os textos de regra ("receber não movimenta estoque", "finalizar não aplica
  ajustes", "a aprovação é a autorização humana") foram preservados e, em vários
  casos, ganharam mais destaque.
