# Auditoria da Fase 5 — vendas, clientes, financeiro e garantias

**Data:** 2026-09-12
**Rodada:** diagnóstico e preparação técnica. **Nenhuma implementação de fluxo
novo foi feita, e nada aqui autoriza migration, deploy ou mudança de contrato.**
**Branch:** `claude/refactor-sistema-marquesa`, HEAD `1bd0dd5`.

## Por que este documento existe

A Fase 5 do Master Plan (§31) é a fase do dinheiro. Ela encosta em venda, item,
preço, desconto, cliente, recebível, garantia, troca e estorno — e o Codex ainda
está refinando a UX de Vendas, com o checkpoint `a6d7c6b` explicitamente
marcado como **UX/UI EM REFINAMENTO**, não como `UX/UI DESIGNED`.

Começar a implementar o fluxo novo agora repetiria o erro que a auditoria da
4.5 já custou uma vez: ler "a rota existe" como "está resolvido". Este
documento separa o que já está provado do que depende de decisão humana e do
que depende do handoff final do Codex, para que o backend possa ser preparado
sem refazer arquitetura depois.

## Método e fontes

Varredura das 173 rotas declaradas em `api/src/http/routes/`, do `api/schema.sql`
real, dos módulos de domínio (`vendas-comandos.js`, `contas-receber.js`,
`garantias.js`, `venda-correcao.js`, `saidas.js`, `clientes.js`, `analytics.js`,
`historico-operacoes.js`), de `api/REGRAS.md` §27–§43, dos testes de
`src/*-test.mjs`, e do legado `src/dashboard.tpl.html` por `grep` de call site.

Leitura **somente** — sem merge — das frentes publicadas:

| Referência | O que foi lido |
|---|---|
| `origin/develop` (`847fe28`) | estado consolidado: auditoria de paridade, status do projeto, decisões pendentes, master plan |
| `a6d7c6b` (checkpoint do Codex) | a pasta `docs/ux/03-screens/vendas/` completa — handoff, matriz de interações, regras, métricas, estados, necessidades de API e decisões abertas |

### Fato de repositório que precisa ser dito

`a6d7c6b` **não é ancestral de** `origin/develop`. O handoff e a matriz de
interações de Vendas existem só na linha do Codex; em `develop` os dois arquivos
estão vazios. E esta branch está 25 commits atrás de `develop` (sem
`docs/project/`, `docs/ux/`, `docs/ui/`) e 2 commits à frente dela (a Fase 4.6
de importação, que `develop` ainda não tem).

Nenhuma das três linhas contém as outras duas. Reconciliar isso é pré-requisito
da Fase 5 — não porque falte código, mas porque a Fase 5 vai escrever em
documentos que hoje moram em branches diferentes.

---

## 1. Estado atual da Fase 5

**Backend: maduro e em produção pelo legado. Frontend novo: zero.**

O ciclo comercial inteiro já existe no backend e é o que o dashboard legado usa
todo dia. O que não existe é (a) o modelo financeiro que a UX proposta pede,
(b) qualquer tela React, e (c) desenho de UX para financeiro e garantias.

`frontend/src/features/` tem `estoque`, `estoque-total`, `maletas`,
`nuvemshop`, `reconciliacao` e `revendedoras`. **Não tem `vendas`, `clientes`,
`financeiro` nem `garantias`.** A única coisa de cliente no React é a busca
global, que busca e linka de volta para o legado.

## 2. Funcionalidades já existentes (backend provado, legado em produção)

| Assunto | Onde | Prova |
|---|---|---|
| criação de venda com itens, data retroativa, cliente e observação | `registrarVenda` em `api/src/vendas-comandos.js` | `src/e2e.mjs`, `src/pacote-vendas-test.mjs` |
| preço final por item + motivo obrigatório (desconto derivado) | mesmo módulo, §27 | `src/venda-desconto-test.mjs` |
| bloqueio de peça sem preço, estoque insuficiente e variação ambígua | mesmo módulo, §24 e §41 | `src/venda-variacao-test.mjs` |
| recusa de escolher entre homônimas (`cliente_ambiguo`) | mesmo módulo, §36.2 | `src/pos-golive-1-test.mjs` |
| cancelamento por contrapartida, nunca por exclusão | `cancelarVenda`, §19 e §28 | `src/pacote2-test.mjs`, `src/kits-test.mjs` |
| marcar pago / desfazer pago, com data do pagamento separada da data da venda | `registrarPagamentoVenda`, §29 e §30 | `src/migracao-pagamento-test.mjs` |
| contas a receber somando as **três** fontes canônicas | `api/src/contas-receber.js`, §38 | `src/historico-operacoes-test.mjs` |
| prazo, vencimento, marcar paga com versão esperada | `api/src/historico-operacoes.js` | `src/historico-operacoes-riscos-test.mjs` |
| garantia por item, eventos, prazo em dias úteis, troca única, diferença a receber | `api/src/garantias.js`, §32 e §37 | `src/pos-golive-1-test.mjs`, `src/troca-historico-atomica-test.mjs` |
| correção de item vendido (trocar o SKU sem criar venda nova) | `api/src/venda-correcao.js`, §40 | `src/pos-golive-1-test.mjs` |
| saída sem faturamento nos quatro motivos, com estorno por contrapartida | `api/src/saidas.js`, §31 | `src/pacote-vendas-test.mjs` |
| Monte seu Colar no mesmo carrinho da venda, composição congelada | `api/src/personalizacao.js`, §42 e §43 | `src/montagem-venda-test.mjs` e mais quatro arquivos |
| histórico do dia somando todas as origens comerciais | `api/src/historico-dia.js`, §33 e §35 | `src/pacote3-test.mjs` |
| painel analítico agregado numa resposta só | `painel()` em `api/src/analytics.js` | `src/pacote3-test.mjs` |
| identidade de cliente, criação na venda, revisão de vínculo | `api/src/clientes.js`, §26 e §34 | `src/vendas-clientes-ui-test.mjs` |

## 3. Funcionalidades parcialmente existentes

| Assunto | O que existe | O que falta |
|---|---|---|
| pagamento | booleano `pago` + `data_pagamento` + `valor_recebido` (só escrito pela importação) | forma de pagamento, múltiplos recebimentos, parcelas, liquidação individual |
| status PAGO / PARCIAL / A RECEBER | `pago` e `cobravel` decidem; `valor_recebido` sustenta o parcial vindo da loja | não há caminho de API que **registre** um recebimento parcial: `registrarPagamentoVenda` só liga ou desliga |
| histórico completo de vendas | `GET /api/vendas/lista` com período, busca, canal, paginação | totais do mesmo filtro, filtro por estado financeiro/operacional, exportação |
| analytics do painel | dez rotas, todas com presets de período | intervalo arbitrário; sinal de dado incerto por métrica |
| canal/local da venda | `vendas.origem` com `balcao`, `acerto` e `site` | WhatsApp, feira e demais locais; a taxonomia da UX não cabe na coluna |
| saída sem faturamento | quatro motivos, estorno, `estoque_refletido` | campo de responsável/destino; observação ainda é opcional quando há motivo |
| rastreabilidade | eventos de garantia, correções de item, operações históricas versionadas, auditoria de pagamento | autoria: nenhuma tabela do ciclo comercial grava **quem** fez |

## 4. Funcionalidades ausentes

1. **Recebimentos múltiplos, formas de pagamento e parcelamento.** Não existe
   tabela, coluna, rota ou teste. É a maior ausência da fase.
2. **Custo da peça.** Nenhuma ocorrência de custo em `api/schema.sql`. Sem ele,
   `Impacto estimado` das saídas não tem fórmula possível (`P12`, `DR-017`).
3. **Autoria por operação.** Não há perfil individual; a chave de API é única.
4. **Exportação de histórico** por rota (o legado exporta no navegador).
5. **Qualquer tela React** de vendas, clientes, financeiro ou garantias.
6. **UX desenhada** para financeiro/recebíveis e para garantias. As pastas
   `docs/ux/03-screens/clientes/` e `docs/ux/03-screens/reparos/` são gabaritos
   vazios, e **Reparos é um domínio novo, não o desenho de garantias**.

## 5. APIs existentes do escopo da Fase 5

Escrita: `POST /api/vendas` · `POST /api/vendas/:id/pagamento` ·
`POST /api/vendas/:id/cancelar` · `POST /api/vendas/corrigir-item` ·
`POST /api/vendas/:id/nuvemshop` · `POST /api/saidas` ·
`POST /api/saidas/:id/estornar` · `POST /api/garantias` ·
`POST /api/garantias/:id/status` · `POST /api/garantias/:id/troca` ·
`POST /api/garantias/:id/troca/pagar` · `POST /api/garantias/:id/troca/estornar` ·
`POST /api/contas-receber/receber` · `POST /api/contas-receber/:id/marcar-paga` ·
`PATCH /api/contas-receber/prazo` · `PATCH /api/contas-receber/:id/vencimento` ·
`POST /api/clientes` · `PATCH /api/clientes/:id` ·
`POST /api/clientes/revisao/:id` · `POST /api/personalizacao/modelos` ·
mais as sete rotas de histórico importado.

Leitura: `GET /api/vendas` · `/api/vendas/dia` · `/api/vendas/lancamentos` ·
`/api/vendas/lista` · `/api/vendas/correcoes` · `/api/vendas/pagamento/auditoria` ·
`/api/contas-receber` · `/api/clientes` · `/api/clientes/perfil` ·
`/api/clientes/revisao` · `/api/saidas` · `/api/garantias` ·
`/api/garantias/pendentes` · `/api/garantias/:id` · `/api/personalizacao/modelos` ·
e as dez de `/api/analytics/*`.

### Correção ao que o Codex registrou

A pasta de necessidades de API de Vendas lista como "já atendido" apenas
`/api/analytics/mes`. Na verdade existem **dez** rotas analíticas, e
`GET /api/analytics/painel` já devolve numa resposta só: visão geral, evolução
mensal, categorias, produtos, origem, ranking de clientes, resumo do mês,
contas a receber, garantias pendentes e saídas sem faturamento do mês — que é
quase exatamente a lista de blocos do Painel proposto.

Isso reduz `API-VEN-002` e `API-VEN-003` de "falta" para "existe, falta provar o
formato", e torna `API-VEN-001` (intervalo arbitrário) o gap analítico real.

## 6. APIs faltantes

| Necessidade | Situação medida aqui |
|---|---|
| intervalo arbitrário de datas no analytics | confirmada: `faixaDePeriodo()` aceita só os presets `tudo`, `7d`, `30d`, `90d` e `12m` |
| totais do histórico sob o mesmo filtro da lista | confirmada: `listarVendasUnificado` devolve itens e paginação, sem agregado |
| filtros de histórico por estado financeiro e operacional | confirmada |
| coleção de recebimentos da venda | confirmada: não existe modelo |
| comandos por recebimento individual (adicionar, liquidar, corrigir, estornar) | confirmada |
| parcelas ordenadas com vencimento e estado próprios | confirmada |
| catálogo de formas de pagamento | confirmada: só a importação histórica conhece forma, em texto |
| idempotência por recebimento | confirmada: a idempotência atual é da **venda** (`vendas.externo_id`) e do lote de histórico |
| exportação por rota | confirmada |
| autoria por operação | confirmada |
| medida econômica para impacto de saída | confirmada e bloqueada por `P12` |

## 7. Tabelas envolvidas

| Tabela | Papel na fase | Observação estrutural |
|---|---|---|
| `vendas` | a venda como ato | dinheiro em `REAL`; pagamento booleano |
| `venda_itens` | itens, preço cobrado, preço de tabela, desconto | `id` próprio desde a 5.2 (TEXT/UUID, único, imutável) |
| `clientes` | identidade | `cpf` sem `UNIQUE`, de propósito |
| `clientes_vinculo_revisao` | fila de vínculo em dúvida | tem rota, quase não tem tela |
| contas a receber | não é tabela: é a união de `vendas` em aberto, `historico_operacoes` com `papel='cliente'` e `garantia_trocas` antigas | por isso cada linha carrega uma `chave` (`venda:45`, `historico:12`, `troca:7`) |
| `historico_operacoes` | operação histórica versionada e cobrança | **já usa colunas inteiras de centavos** |
| `historico_operacao_vendas` | liga operação histórica à venda duplicata | evita cobrar duas vezes |
| `garantias`, `garantia_eventos`, `garantia_trocas` | o caso, a linha do tempo e a troca | troca única por índice; diferença negativa para em `pendente_regra` |
| `saidas_sem_faturamento` | brinde, uso próprio, perda, sorteio | `estoque_refletido` diz de quem é a baixa |
| `venda_personalizacoes`, `venda_personalizacao_itens` | composição congelada do Monte seu Colar | posição única por venda |
| `vendas_historico_lotes`, `vendas_historico_itens`, `vendas_historicas` | histórico importado | **única fonte que conhece forma e número de parcelas** |
| `movimentos` | a razão contábil | tudo acima que mexe em peça passa por aqui |

---

## 8. Os vinte subitens auditados

`PRONTO` = existe, tem teste e roda em produção pelo legado.
`PARCIAL` = existe com lacuna nomeada. `AUSENTE` = não existe.
`AGUARDANDO HANDOFF CODEX` = a regra técnica depende de interação ainda em desenho.

| # | Subitem | Veredito | O que falta, e de quem depende |
|---|---|---|---|
| 1 | criação de venda | `PRONTO` | nada no backend. A tela é que não existe |
| 2 | itens da venda | `PARCIAL` | itens são linhas sem identidade própria; ver achado A3 |
| 3 | preço e desconto | `PRONTO` (regra) · `AGUARDANDO HANDOFF CODEX` (separação automática de linha) | `UX-VEN-017` pede separar unidades iguais com preços diferentes. O backend aceita duas linhas do mesmo SKU hoje; o que falta é identidade de linha e a interação final |
| 4 | cliente | `PRONTO` · uma decisão aberta | `registrarVenda` **exige** nome: não existe venda anônima. `VEN-Q012` (balcão sem cadastro) é decisão de negócio, não de código |
| 5 | formas de pagamento | `AUSENTE` | nenhuma coluna. Depende de `VEN-Q031`, `VEN-Q035` e do handoff |
| 6 | pagamentos múltiplos | `AUSENTE` | modelo novo. `VEN-Q029`, `VEN-Q033` |
| 7 | parcelamento | `AUSENTE` | modelo novo. `VEN-Q032` |
| 8 | contas a receber | `PRONTO` | três fontes unidas e testadas. Falta **tela** — `FIN-101` |
| 9 | status PAGO / NÃO PAGO | `PARCIAL` | hoje é binário. PARCIAL só chega pela importação; nenhuma rota o produz |
| 10 | data real de pagamento | `PRONTO` | `data_pagamento` mais `pagamento_origem` com procedência (§36.1) |
| 11 | correção / edição de venda | `PARCIAL` · `AGUARDANDO HANDOFF CODEX` | só o SKU do item se corrige (§40). Não há correção de preço, cliente, data ou quantidade depois de salva. O fluxo novo é do Codex — ver §17 |
| 12 | estorno / cancelamento | `PRONTO` | contrapartida, nunca exclusão (§19, §28) |
| 13 | impacto em estoque | `PRONTO` | toda baixa passa por `movimentar`; pagamento não move peça |
| 14 | Monte seu Colar na venda | `BACKEND READY`, desligado | `PERSONALIZACAO_ATIVA=false`. Resta trabalho de cadastro (`MON-001`), não decisão |
| 15 | saída sem faturamento relacionada | `PRONTO` · `AGUARDANDO HANDOFF CODEX` | falta responsável/destino (`VEN-Q022`) e a decisão sobre observação obrigatória (`VEN-Q020`) |
| 16 | garantias | `PRONTO` (backend) · `AUSENTE` (UX) | `GAR-101` é paridade obrigatória por `DR-014` e **não tem UX desenhada** |
| 17 | reparos | `PRONTO` como status de garantia · `AUSENTE` como domínio | Reparos na UX é domínio novo com material vazio. Não confundir com `GAR-101` |
| 18 | trocas | `PRONTO` | troca única por índice; diferença vira venda (§37); negativa para em `pendente_regra` |
| 19 | histórico | `PARCIAL` | lista unificada existe; faltam totais, filtros e exportação |
| 20 | auditoria / rastreabilidade | `PARCIAL` | eventos e versões existem; **autoria não existe em lugar nenhum** |

## 9. As três paridades críticas do legado (`DR-014`)

### FIN-101 — contas a receber

Backend inteiro e testado. O legado chama em `src/dashboard.tpl.html` nas linhas
9657, 9672, 10192 e 11185. React: nada. UX: **nenhuma pasta existe**.

É a paridade mais próxima de ser implementável, porque o contrato já está
provado e não depende de modelo financeiro novo — desde que a tela reproduza o
que o legado faz hoje, e não o que a UX de Vendas propõe para o futuro.

### GAR-101 — registrar garantia, troca, status

Backend inteiro, oito rotas, tabelas com invariantes reais. O legado chama nas
linhas 10918, 10928, 11095, 11116 e 11129. React: nada. UX: nada.

**GAR-102 continua código morto.** `POST /api/garantias/:id/troca/estornar`
não tem nenhum call site no legado — confirmado por `grep` nesta branch.
Desfazer uma troca hoje só é possível por chamada direta à API.

### VEN-105 — correção de item vendido

Backend íntegro (`api/src/venda-correcao.js`, §40), com auditoria própria.
O legado chama na linha 10806. React: nada.

O status do projeto registra que isso está **em curso no Codex**. A divisão de
responsabilidade foi fechada em 12/09/2026 e está em §17: `VEN-105` fica
**`AGUARDANDO HANDOFF CODEX`** para tudo que dependa do fluxo visual.

---

## 10. Achados desta auditoria

### A1 — o modelo de pagamento é booleano, e a UX proposta não cabe nele

`vendas` guarda `pago`, `data_pagamento`, `pagamento_origem`, `valor_recebido`,
`cobravel` e `vencimento_em`. Uma venda tem **um** estado de pagamento e
**uma** data. A UX pede uma coleção de recebimentos, cada um com valor, forma,
estado, data efetiva, vencimento, observação e parcela.

Não é um campo a mais: é uma tabela nova e a inversão de quem é a autoridade —
`pago` deixaria de ser coluna escrita e passaria a ser derivado da soma.
`registrarPagamentoVenda` vira caso particular de "um recebimento cobre o total".

**Não implementar antes do handoff.** Mas a forma é previsível o bastante para
que o desenho seja proposto agora e revisado quando a especificação chegar.

### A2 — dinheiro em `REAL` nas tabelas de venda, centavos inteiros nas novas

`vendas.total`, `venda_itens.preco`, `venda_itens.preco_tabela`,
`garantia_trocas.diferenca` e `vendas.valor_recebido` são `REAL`.
`historico_operacoes` já é inteiramente de colunas inteiras de centavos.

As métricas do Codex exigem, textualmente, "centavos inteiros, sem comparar
moeda por ponto flutuante". Com recebimentos múltiplos isso deixa de ser
estética: `PAGO` passa a ser a comparação `recebido >= total`, e é exatamente
essa comparação que ponto flutuante erra.

Migração de precisão é aditiva e possível, mas tem que ser decidida **antes**
do modelo de recebimentos, não depois.

### A3 — `venda_itens` não tem chave primária, e uma rota já expõe o `rowid`

O schema de `garantias` documenta o problema com todas as letras: a identidade
do item é a tripla venda/SKU/variante, porque `venda_itens` não tem chave
própria e o `rowid` não é estável entre VACUUMs.

Mesmo assim, `listarVendasUnificado` seleciona `i.rowid` como `id` da linha
operacional em `GET /api/vendas/lista`. Qualquer tela que guarde esse id para
agir depois está guardando um número que pode mudar.

Isso bloqueia três coisas ao mesmo tempo: separar duas linhas do mesmo SKU com
preços diferentes (`UX-VEN-017`), endereçar um recebimento a um item, e
qualquer correção de item mais fina que a de SKU.

**É o menor trabalho com o maior efeito destravante da fase**: uma migration
aditiva que dá chave própria a `venda_itens`.

**Corrigido na 5.2.** `venda_itens.id` é TEXT/UUID, gerado pela aplicação
antes da escrita, único por índice e imutável por gatilho; um segundo gatilho
preenche quem esquecer. A auditoria subestimou o alcance: além de
`/api/vendas/lista`, o `rowid` também ia e voltava entre duas requisições na
Central de Pendências — e a chave dessa pendência era **gravada** em
`config`. Ver §19.

### A4 — `GET /api/vendas/lista` devolve toda venda operacional como paga

No `UNION ALL` de `listarVendasUnificado`, a coluna `pago` do lado operacional
é a constante `1`, não `v.pago`. Uma venda de balcão lançada como não paga
aparece nessa listagem como paga.

O lado histórico usa o `pago` de verdade, então as duas populações discordam.
É defeito de leitura, não de razão contábil — nenhum dinheiro foi movido —, mas
contradiz `vendas.pago` e contradiz a lista de contas a receber, que enxerga a
mesma venda corretamente em aberto.

**Corrigido na 5.1**, provado em `src/vendas-lista-test.mjs`.

### A5 — a mesma rota não filtra venda cancelada

`cancelada` é selecionada mas nunca aparece no `WHERE`. A regra vigente diz que
venda cancelada fica no histórico com estado e sai dos agregados elegíveis;
cabe decidir se essa listagem é "histórico" (mostra, marcada) ou "agregado"
(exclui). Hoje ela mostra sem que a decisão tenha sido tomada.

**Corrigido na 5.1** pelo contrato vigente: a rota é histórico, então o padrão
continua mostrando a venda cancelada **marcada**, e `canceladas=nao` devolve o
recorte elegível — a mesma porta que `/api/saidas?estornadas=nao` já dá.

### A6 — `canal` significa duas coisas diferentes na mesma resposta

No lado operacional, `canal` é `vendas.origem` (`balcao`, `acerto`, `site`).
No lado histórico, é o canal da planilha, texto normalizado. O filtro `?canal=`
compara os dois contra o mesmo valor.

Isto é `VEN-Q013` deixando de ser pergunta de UX e virando defeito de contrato:
não existe vocabulário único de canal no sistema.

**Corrigido na 5.1 só na parte mecânica.** `canal` passa a ser o texto de cada
população, intacto e auditável; `origem` é o vocabulário comum já existente
(`balcao|acerto|site`), preenchido apenas onde a correspondência é mecânica —
`Site` e `site` são a mesma palavra. `Instagram`, `Grupo VIP`, `Encomendas` e
`Maleta` não têm equivalente ali e ficam **nulos**: classificá-los seria decidir
`VEN-Q013` dentro de uma consulta SQL, e essa decisão é de produto.

### A7 — analytics só aceita presets

`faixaDePeriodo()` reconhece `tudo`, `7d`, `30d`, `90d` e `12m`. Os presets da
UX (`Tudo`, `12 meses`, `90 dias`, `30 dias`) já casam, mas o intervalo
personalizado — que o protótipo já simula com um popover de datas — não tem
contrato nenhum atrás.

### A8 — saída sem faturamento não tem responsável nem destino

A UX pede um campo condicional por motivo: cliente para brinde, área ou pessoa
para uso próprio, ocorrência para perda, campanha para sorteio. A tabela tem
`motivo` (rótulo curto) e `observacao` (texto livre), e a validação atual exige
**um dos dois**, não os dois.

### A9 — não existe custo, e sem custo não existe impacto

Confirmado: zero ocorrência de custo em `api/schema.sql`. `produtos.preco` é
preço de venda. O desenho de custo como série temporal de eventos já foi
proposto na frente de arquitetura, mas continua sem autorização de
implementação (`P12`), e `DR-017` — bruto versus banhado — ainda está aberta e
é explicitamente de Fase 5.

### A10 — a migration do sorteio continua fora de produção

Código e `api/schema.sql` tratam quatro motivos de saída. O `CHECK` do banco de
produção ainda tem três (`P11`). Qualquer caminho novo desta fase que assuma
`sorteio` quebra em runtime contra o banco real, não em teste.

---

## 11. Dependências do handoff do Codex

O que **não** pode ser projetado sem a especificação final:

| Depende de | Decisão que falta |
|---|---|
| modelo de recebimentos | `VEN-Q029` excesso, troco ou crédito · `VEN-Q033` exigir 100% distribuído para finalizar |
| parcelamento | `VEN-Q032` como nascem os vencimentos |
| forma de pagamento | `VEN-Q031` data efetiva e bruto/líquido em cartão e link · `VEN-Q035` descrição obrigatória em `Outro` · `VEN-Q030` o que é crédito da cliente |
| correção financeira | `VEN-Q034` editar com histórico, ou estornar e recriar |
| separação automática de linha | interação final da edição de preço (`UX-VEN-016` e `UX-VEN-017`) |
| ações por venda | `VEN-Q015` quais existem no menu de cada linha |
| taxonomia de canal | `VEN-Q013` o que é canal e o que é origem estrutural |
| escopo das listas | `VEN-Q014` o que entra em "vendas de hoje" · `VEN-Q009` com que período o histórico abre |
| saída sem faturamento | `VEN-Q019` quatro motivos · `VEN-Q020` observação obrigatória · `VEN-Q022` responsável/destino · `VEN-Q023` data retroativa |
| exportação | `VEN-Q024` formato e escopo |
| permissões | `VEN-Q025` quem desconta, estorna, cancela e exporta |
| Monte seu Colar na venda | `VEN-Q016` carrinho misto · `VEN-Q017` ordem das posições |

O que **pode** ser preparado agora, porque já tem regra escrita: identidade de
item de venda, precisão monetária, correção das duas leituras defeituosas,
vocabulário único de canal, intervalo arbitrário no analytics, e as três
paridades de `DR-014` **no comportamento que o legado já tem** — não no
comportamento que a UX ainda vai definir.

## 12. Proposta de divisão da Fase 5

| Subfase | Escopo | Depende de |
|---|---|---|
| 5.0 | reconciliar as três linhas (esta branch, `develop`, Codex) e registrar o baseline de contratos do ciclo comercial | nada |
| 5.1 | ~~corrigir A4, A5 e a parte mecânica de A6 em `GET /api/vendas/lista`, com teste~~ · **feita** — `src/vendas-lista-test.mjs`, 14 provas | nada |
| 5.2 | ~~chave primária própria para `venda_itens` (migration aditiva) e migrar quem usa `rowid`~~ · **feita** — `src/venda-item-id-test.mjs`, 22 provas | nada |
| 5.3 | `FIN-101` — recebíveis com paridade do legado, sem modelo novo | 5.2 |
| 5.4 | `GAR-101` e `GAR-102` — garantias, trocas e o estorno que hoje é código morto | nada |
| 5.5 | `VEN-105` — correção de item vendido · **`AGUARDANDO HANDOFF CODEX`** | 5.2 e o handoff (ver §17) |
| 5.6 | vocabulário único de canal e intervalo arbitrário no analytics | 5.1 |
| 5.7 | precisão monetária em centavos no ciclo comercial | 5.2 |
| 5.8 | **modelo de recebimentos múltiplos, formas e parcelas** | 5.7 e handoff do Codex |
| 5.9 | custo histórico auditável | `P12` e `DR-017` |
| 5.10 | Monte seu Colar dentro da venda, ligado | `MON-001` (trabalho de cadastro) |

### Ordem recomendada

`5.0` → `5.1` → `5.2` → `5.4` → `5.3` → `5.5` → `5.6` → `5.7` → `5.8` → `5.9` → `5.10`.

`5.4` antes de `5.3` por um motivo: garantias é o domínio com backend mais
completo e **menos** interferência do desenho financeiro futuro, então serve de
prova da subida da escada `BACKEND READY` → `UX DESIGNED` → `IMPLEMENTED` sem
apostar em nada que o handoff possa mudar.

`5.8` é a fronteira. Tudo antes dela é preparação que não precisa ser refeita.

## 13. Riscos

| # | Risco | Gravidade | Contenção |
|---|---|---|---|
| R1 | implementar recebimentos múltiplos antes do handoff e ter que refazer o schema | alta | `5.8` é a última subfase, por desenho |
| R2 | `VEN-105` ser feito duas vezes, aqui e no Codex | alta | combinar antes de começar `5.5` |
| R3 | ponto flutuante decidir `PAGO` errado por um centavo | alta | `5.7` antes de `5.8`, sem exceção |
| R4 | tela guardar um `rowid` que muda depois de um VACUUM | média | `5.2` antes de qualquer tela de venda |
| R5 | migration do sorteio ausente em produção quebrar caminho novo | média | `P11`; nada desta fase deve assumir os quatro motivos contra o banco real |
| R6 | três branches divergentes escreverem o mesmo documento | média | `5.0` primeiro |
| R7 | tratar a pasta de Reparos como se fosse o desenho de garantias | média | são domínios diferentes; dito aqui e no status do projeto |
| R8 | reproduzir na tela nova a listagem que hoje mente sobre `pago` | média | `5.1` antes de `5.3` |
| R9 | inventar autoria a partir da chave de API única | baixa | autoria fica ausente e **anunciada**, até haver perfis |

## 14. Testes — o que existe

Diretos do ciclo comercial: `src/venda-desconto-test.mjs`,
`src/venda-variacao-test.mjs`, `src/pacote-vendas-test.mjs`,
`src/pacote-vendas-ui-test.mjs`, `src/vendas-clientes-ui-test.mjs`,
`src/vendas-historico-test.mjs`, `src/vendas-reconstrucao-test.mjs`,
`src/trocar-planilha-test.mjs`, `src/historico-operacoes-test.mjs`,
`src/historico-operacoes-riscos-test.mjs`, `src/troca-historico-atomica-test.mjs`,
`src/migracao-pagamento-test.mjs`, `src/pagamento-nuvemshop-test.mjs`,
`src/pos-golive-1-test.mjs`, `src/revendedora-nao-e-cliente-test.mjs`,
`src/categoria-nome-test.mjs`, `src/e2e.mjs`, e os cinco de montagem.

Cobertura real por assunto: venda e desconto **boa**; cancelamento **boa**;
histórico importado **muito boa**; contas a receber **boa pelo lado histórico**;
garantias **média** (a troca tem prova, o ciclo de status quase não);
correção de item **fraca** (um caso dentro de um teste maior);
saídas **média**; `GET /api/vendas/lista` **nenhuma** — e é justamente onde
estão A4, A5 e A6.

## 15. Testes que precisam ser criados

| Prova | Para qual subfase |
|---|---|
| `GET /api/vendas/lista`: venda não paga aparece como não paga; venda cancelada aparece do jeito decidido; `canal` responde o mesmo vocabulário nas duas populações | 5.1, 5.6 |
| identidade de item sobrevive a duas linhas do mesmo SKU com preços diferentes, e não usa `rowid` | 5.2 |
| contas a receber: as três fontes, sem duplicar a venda que já é operação histórica; liquidar não move estoque | 5.3 |
| garantia: ciclo completo de status, troca única sob duplo clique, estorno de troca devolvendo exatamente o que a troca fez | 5.4 |
| correção de item: as duas populações (venda do sistema e linha de planilha), com a razão fechando | 5.5 |
| analytics com intervalo arbitrário: o mesmo recorte em todos os blocos, sem divergência entre cartão e tabela | 5.6 |
| centavos: `PAGO` não é decidido por arredondamento; soma de parcelas fecha exatamente | 5.7 |
| recebimentos: idempotência sob retry e sob duas telas; nenhum recebimento move estoque | 5.8 |

E, em toda subfase que escreva: `GET /api/estoque/conferir` vazio.

## 16. Próximo passo recomendado

`5.0` — reconciliar as três linhas de trabalho — e, imediatamente depois, `5.1`
e `5.2`, que são pequenas, provadas por teste e destravam tudo que vem depois
sem apostar em nenhuma decisão que o Codex ainda vai tomar.

Nada de `5.8` antes do handoff. Nada de `5.5` antes de combinar com o Codex.

---

## 17. Decisões de 12/09/2026

### VEN-105 — divisão de responsabilidade

| Frente | O que é dela |
|---|---|
| Codex | UX/UI e fluxo de interação da correção de venda e de item vendido |
| Claude Refactor | backend, contratos, invariantes, testes e implementação técnica **depois** que o handoff definir o comportamento final |

Enquanto o handoff não chega, esta frente pode: auditar a implementação
existente, mapear contratos, caracterizar o comportamento atual, escrever testes
de regressão que **só provem o que já existe**, e apontar defeito técnico
independente da UX.

Não pode: inventar fluxo, mudar regra de negócio, ou duplicar o que o Codex está
desenhando. Toda mudança que dependa do fluxo visual novo fica
**`AGUARDANDO HANDOFF CODEX`**.

### Fronteira financeira reafirmada

`5.7` (centavos) e `5.8` (recebimentos múltiplos, parcelas, formas) **não
começam** sem o handoff e sem decisão explícita sobre o modelo monetário.
Também não se inventa forma de pagamento, parcelamento, múltiplos recebimentos
nem correção financeira.

### 5.0 — reconciliação executada

`origin/develop` (`847fe28`) foi integrado em `claude/refactor-sistema-marquesa`
por **merge normal**, sem rebase, sem reescrita de histórico e sem force push.
Merge commit `1418e30`, pais `e4a35fd` e `847fe28`. `main` não foi tocada.

O checkpoint do Codex `a6d7c6b` **continua fora do histórico desta branch** — foi
apenas consultado por `git show`. Os arquivos exclusivos dele (handoff e matriz
de interações de Vendas) seguem vazios aqui, e é assim que tem que ser.

Um achado da reconciliação está registrado em §18.

## 18. Achado da 5.0 — o espelho do Codex versionado está desatualizado

O commit `f1820bc` de `develop` versionou uma cópia da configuração local do
Codex. Seis dos oito arquivos dessa cópia divergem do que existe hoje nesta
máquina, e a divergência não é cosmética:

| Arquivo | O que a cópia versionada diz | O que a cópia local diz |
|---|---|---|
| `hooks.json` | aponta para o clone `Marquesa-Etiquetas` | aponta para este clone |
| `agents/database-guardian.toml` | produção é `marquesa-db`; escrita "nunca por agente" | produção é `marquesa-db-prod` desde o go-live; `marquesa-db` é a cópia congelada de rollback; Classe C é autônoma com gates |
| `hooks/protect-production.mjs` (+ teste) | bloqueio absoluto | proteção proporcional ao risco |
| `agents/repo-explorer.toml`, `agents/verifier.toml` | versão anterior | versão atual |

A cópia versionada contradiz a política vigente de `docs/SECURITY.md` e do
roteador — e, pior, chama de produção um banco que hoje é o rollback congelado.

Por isso a reconciliação **preservou os arquivos locais**: eles ficaram como
modificação não commitada da árvore de trabalho, com cópia de segurança fora do
repositório. Decidir se o espelho versionado passa a acompanhar o local, ou se
deixa de ser versionado, é decisão de governança — não efeito colateral de um
merge.

---

## 19. Fase 5.2 — o mapa completo dos consumidores de `rowid`

A auditoria original (§A3) achou **um** consumidor. A varredura da 5.2 achou
**seis**, e o mais grave não era o que estava na rota pública.

### A. Usavam o `rowid` explicitamente

| Onde | O que fazia | Gravidade | Depois |
|---|---|---|---|
| `analytics.js` · `GET /api/vendas/lista` | devolvia `i.rowid` como `id` da linha | contrato público | devolve `i.id` |
| `pendencias.js` · lista + resolução | devolvia `i.rowid` como `linha` e **recebia o número de volta** numa segunda requisição | **atravessa requisições** | devolve `itemId`; `linha` aceita só por compatibilidade |
| `pendencias.js` · chave da pendência | `venda_variacao:<venda>:<rowid>`, **gravada em `config`** como pendência adiada | **persistida** | `venda_variacao:<venda>:<id>` |
| `historico-dia.js` · `referencia` | chave de deduplicação da resposta, exposta | dentro de uma leitura | usa o `id` |
| `venda-correcao.js` | alvo do `UPDATE` dentro de uma escrita | dentro de uma escrita | usa o `id` |
| `historico-operacoes.js` | `ORDER BY sku, rowid` numa assinatura comparada entre execuções | ordenação instável | `ORDER BY sku, preco, qtd` |

O caso da chave persistida é o que o comentário de §32 dizia não existir: o
`rowid` não só saía da requisição como ficava **gravado**. Um VACUUM faria a
pendência adiada voltar — ou, pior, esconderia outra.

### B. Usavam chave composta por falta de id

`garantias.js` identifica o item por `(venda_id, sku, variante_id)` com
`LIMIT 1`, e `garantias` **guarda** esse trio em três colunas. Desde §27 o
trio pode casar duas linhas, e o `LIMIT 1` escolhe em silêncio.

**Não migrado nesta fase, de propósito.** Trocar o ponteiro da garantia exige
converter dado existente e decidir para qual das duas linhas cada garantia
antiga aponta — é trabalho próprio, com decisão dentro. Fica registrado como a
próxima dívida do assunto.

### C. Não precisam de identidade de item

Os agregados de `analytics.js`, `vendas-estoque-nuvemshop.js`,
`historico-dia.js` (soma), `produtos.js` (dependências) e
`maletas-comandos.js`. Nenhum foi tocado.

### D. Contratos que mudaram

| Contrato | Antes | Depois | Quebra? |
|---|---|---|---|
| `GET /api/vendas/lista` → `itens[].id` (lado operacional) | inteiro (rowid) | UUID | **sim**, e deliberada: a rota não tem nenhuma tela, nem legada nem React |
| `GET /api/pendencias` → `itens[].itemId` | não existia | UUID | aditivo |
| `GET /api/pendencias` → `itens[].linha` | inteiro (rowid) | inteiro (rowid) | não — mantida até o legado sair |
| `POST /api/pendencias/variacao/venda` | aceitava `linha` | aceita `itemId` **ou** `linha` | não |
| `chave` da pendência de variação | `venda_variacao:<venda>:<rowid>` | `venda_variacao:<venda>:<id>` | **sim** — as pendências adiadas com a chave antiga reaparecem uma vez. Reaparecer é o lado seguro de errar, e o dado vive em `config`, não em dinheiro nem em peça |
| `historico-dia` → `referencia` | `venda:<id>:<rowid>` | `venda:<id>:<itemId>` | não — é chave opaca de deduplicação |

O painel legado foi migrado junto (`src/dashboard.tpl.html`): ele passa a
mandar `itemId`. Era obrigatório — o `onclick` interpolava o valor **sem
aspas**, e um UUID ali viraria erro de sintaxe em vez de chamada.

### Opções de identidade consideradas

| Opção | Por que não |
|---|---|
| `id INTEGER PRIMARY KEY AUTOINCREMENT` | `ALTER TABLE` do SQLite não acrescenta PRIMARY KEY: exigiria **reconstruir** a tabela que guarda faturamento. E um id do banco só é conhecido depois da escrita — os itens são escritos num `db.batch`, que não devolve id por instrução |
| `MAX(id) + 1` na aplicação | duas vendas simultâneas leem o mesmo máximo. Não há sequência no D1 para arbitrar |
| `rowid` persistido como coluna | congela hoje o número que o problema é justamente não poder confiar; e não resolve inserção nova |
| reconstrução da tabela | a operação menos reversível disponível, para ganhar uma coluna que `ALTER TABLE` acrescenta. Só se justificaria se houvesse constraint impossível de outro jeito — e os dois gatilhos cobrem NOT NULL e imutabilidade sem reconstruir |
| **TEXT/UUID gerado pela aplicação** | **escolhida.** Sem corrida por construção, conhecida antes da escrita, aditiva, e o rollback é largar dois gatilhos e um índice |

### O que a 5.2 deixou pendente

1. migrar o ponteiro de `garantias` do trio para `venda_itens.id` (item B);
2. remover `linha` de `POST /api/pendencias/variacao/venda` quando o painel
   legado sair de produção;
3. `venda_itens.id` é nulável no schema porque `ALTER TABLE` não acrescenta
   `NOT NULL` sem reconstruir. Nulo é inalcançável na prática — backfill mais
   gatilho —, mas quem um dia reconstruir a tabela por outro motivo deve
   aproveitar para declarar `NOT NULL`.

---

## 20. Fase 5.2b — a garantia aponta para a linha da venda

`garantias` guardava a origem operacional como `(venda_id, sku,
variante_id)`, e o comentário do schema afirmava que o trio identificava a
linha "sem ambiguidade". Duas regras já haviam desmentido isso:

- **§27** — o preço é por item. Duas unidades do mesmo código na mesma venda,
  com preços diferentes, são duas linhas, e o trio casa as duas. `LIMIT 1`
  decidia qual peça física voltou.
- **§41** — corrigir o código de um item reescreve `venda_itens.sku` e
  `variante_id`. O ponteiro da garantia passava a apontar para uma combinação
  inexistente, em silêncio.

### Consumidores encontrados

| Onde | O que usava | Situação |
|---|---|---|
| `garantias.js › itemOperacional` | trio + `LIMIT 1` | migrado: aceita `vendaItemId`; sem id, **conta antes de escolher** e devolve as candidatas |
| `garantias.js › abrirGarantia` (dedup) | `(venda_id, sku)` | preservado, **acrescido** de `venda_item_id` |
| `garantias.js › INSERT` | só o trio | grava `venda_item_id` + `venda_item_vinculo` |
| `garantias.js › publica` | não expunha identidade | expõe `vendaItemId` e `vendaItemVinculo` |
| `analytics.js › perfilCliente` | `NULL AS item_id` no ramo operacional | devolve `i.id` |
| `dashboard.tpl.html › garPorItem` | chave `v:<venda>:<sku>` | chave `i:<id>`, com a chave larga como rede para o que o backfill não resolveu |
| `dashboard.tpl.html › salvarGarantia` | mandava `vendaId`+`sku` | manda `vendaItemId` quando existe |
| `garantia_trocas`, `garantia_eventos` | `garantia_id` (PK real) | **não precisavam de mudança** |
| origem `historico` | `historico_item_id` (PK real) | **não precisava de mudança**; marcada `nao_se_aplica` |

### O desenho

`garantias` ganha `venda_item_id TEXT REFERENCES venda_itens(id)` e
`venda_item_vinculo TEXT`, que registra **como** o ponteiro foi obtido:
`direto`, `backfill_unico`, `backfill_unico_valor`, `ambiguo`, `sem_match`,
`nao_se_aplica`. Nenhuma coluna antiga foi removida — o trio continua sendo a
prova de como a garantia foi aberta, e o único rastro dos casos que o backfill
se recusou a adivinhar.

Sem `CHECK` nas colunas novas: `ALTER TABLE` do SQLite não acrescenta
restrição de tabela, e um `CHECK` que só existisse no banco criado do zero
faria os dois caminhos divergirem em silêncio. A validação do vocabulário
está na aplicação, e o gate `schema-migration-coerencia` passou a comparar
`garantias` e `venda_itens` coluna a coluna.

### O backfill não adivinha

Quatro passos, nesta ordem, e cada um só age sobre o que sobrou do anterior:

1. o trio casa **uma** linha → `backfill_unico`;
2. o trio casa várias, mas exatamente uma foi cobrada pelo valor que a
   garantia registrou ter sido pago → `backfill_unico_valor`. Não é chute:
   `valor_pago_original` foi copiado de `venda_itens.preco` na abertura, e a
   comparação é uma chave mais forte que o trio, não uma preferência;
3. sobrou com **duas ou mais** candidatas → `ambiguo`, **sem ponteiro**;
4. sobrou **sem nenhuma** → `sem_match`, **sem ponteiro**.

`GET /api/garantias/vinculos` é o relatório auditável: conta as populações e
lista cada pendência **com as candidatas** e o que as distingue (preço pago,
variação, rótulo do desconto). "Ambíguo" sem as opções ao lado seria só uma
reclamação.

### Contagem

O D1 local de desenvolvimento está **vazio** (`garantias: 0`,
`venda_itens: 0`), e não existe fixture com dados reais no repositório. A
contagem verdadeira de únicos/ambíguos/sem match só existe no banco de
produção, que **permanece congelado e não foi tocado**. O caminho para
obtê-la sem escrever nada está pronto: aplicar a migration e ler
`GET /api/garantias/vinculos`, ou rodar as quatro contagens em `SELECT`.

Nos cenários controlados do teste a classificação está provada nos três
resultados (1 único, 1 ambíguo, 1 sem match no cenário 11).

### O que 5.2b deliberadamente NÃO mudou

A trava "a mesma peça da mesma compra não abre duas garantias abertas"
continua sendo `(venda, código)`. Com identidade de linha seria defensável
liberar duas unidades do mesmo código — são duas peças físicas —, mas
afrouxar é **decisão de produto**, e esta fase é migração de identidade. O
teste cobra o comportamento atual: quem afrouxar sem decidir quebra o gate.
Fica para 5.4.

### Pendências de 5.2b

1. resolver os casos `ambiguo` e `sem_match` exige **gente olhando qual peça
   voltou**. O caminho de gravação existe (abrir com `vendaItemId`); falta a
   tela, que é UX e está `AGUARDANDO HANDOFF CODEX`;
2. `vendas_historico_itens` não tem equivalente a migrar — `historico_item_id`
   já é chave primária real;
3. a trava por linha (item acima) fica para 5.4.

---

## 21. Fase 5.4 — auditoria de GAR-101 / GAR-102

Rodada de **diagnóstico**, 12/09/2026. Nada foi implementado aqui. O que
segue foi apurado por leitura **e** por sonda de caracterização executada
contra `api/schema.sql` real: os blocos marcados `sonda` são saída de
execução, não inferência.

### 21.1 O ciclo, item a item

| # | Item | Estado |
|---|---|---|
| 1 | abertura | correto — valida motivo, data futura e prazo inteiro |
| 2 | peça via `venda_item_id` | correto desde 5.2b; trio só como legado |
| 3 | cliente | correto — §2 respeitado, venda ambígua não pendura na ficha errada |
| 4 | data da venda | correto — copiada e congelada na abertura |
| 5 | prazo de 45 dias úteis | cálculo correto, **exibição com defeito** (bug 1) |
| 6 | estados | **não existe máquina de estados** (bug 2) |
| 7 | eventos | incompleto — falta o evento do caminho normal (bug 3) |
| 8 | envio para reparo | é o estado inicial; não há registro de quem levou |
| 9 | retorno do reparo | `reparada` → `devolvida`, correto |
| 10 | troca | correto — barra kit, montável e saldo zero; uma troca por garantia |
| 11 | diferença de valor | correto, incluindo a recusa da negativa |
| 12 | limite de troca | correto — `idx_gar_troca_unica` |
| 13 | encerramento | correto, mas `encerrada_em` some ao reabrir (bug 2) |
| 14 | histórico | evento nunca sobrescreve; ver bugs 3 e 4 |
| 15 | cancelamento | backend pronto, **sem caminho na tela** |
| 16 | impacto financeiro | correto — dupla contagem barrada dos dois lados |
| 17 | impacto em estoque | correto — peça nova sai uma vez, defeituosa nunca volta |
| 18 | Saída sem faturamento | **sem relação, por desenho** |
| 19 | ficha da cliente | correto desde 5.2b |
| 20 | vendas históricas | correto — abre sem valor, e a troca **exige** o valor |

Sobre o item 18: `saidas_sem_faturamento.tipo` só aceita `brinde`,
`uso_proprio`, `perda` e `sorteio`. A troca de garantia não passa por essa
tabela — sai por `movimentos`, tipo `troca`, origem `troca_garantia`. A peça
defeituosa nunca reentra no estoque, então também não há saída a registrar
por ela. São dois mecanismos distintos para dois fatos distintos.

### 21.2 Estados e transições reais

Seis estados; `PENDENTES = em_reparo | reparada | sem_conserto`. Qualquer
estado vai para qualquer outro: a única trava é "garantia com troca
registrada não volta para `em_reparo` nem `cancelada`".

```
sonda:
  devolvida -> em_reparo aceito?          true   (e encerrada_em vira null)
  concluida -> cancelada aceito?          true
  troca em garantia CONCLUIDA aceita?     true   (status volta a sem_conserto)
```

### 21.3 APIs e tabelas

Oito rotas: `GET /api/garantias`, `/pendentes`, `/vinculos`, `/:id`;
`POST /api/garantias`, `/:id/status`, `/:id/troca`, `/:id/troca/pagar`,
`/:id/troca/estornar`.

Tabelas próprias: `garantias`, `garantia_eventos`, `garantia_trocas`,
`feriados`. Escreve também em `vendas`, `venda_itens` e `movimentos`.

### 21.4 Testes existentes — o achado mais sério

A cobertura HTTP existe e é boa (`pacote-vendas-test.mjs`,
`pos-golive-1-test.mjs`, `revisao-pre-golive-test.mjs`). Mas todas vivem na
suíte `worker-local`, que é `mode: catalog-only` e `gates: []` — **não roda
em gate nenhum**.

Os únicos testes de garantia que rodam em CI são os de 5.2 e 5.2b. Antes de
5.2b, o domínio que mexe em estoque e faturamento tinha **zero** cobertura
executada. `estornarTroca` nunca teve teste até 5.2b.

### 21.5 Bugs

**Bug 1 — o atraso nunca para de correr.** `prazoDaGarantia` compara com hoje
e ignora `encerrada_em`.

```
sonda: status devolvida · encerradaEm 2026-01-20
       atrasado true · atrasoDiasUteis 134 · diasUteisDecorridos 179
```

Caso entregue no prazo aparece "atrasada 134 dias úteis" para sempre na ficha
da cliente. Não exige decisão de produto: caso encerrado não atrasa mais.

**Bug 2 — reabrir apaga a data de encerramento.** `devolvida → em_reparo`
grava `encerrada_em = NULL`. A data da entrega some, e §28 diz que histórico
não se apaga. **AGUARDANDO REGRA DE ESTADOS** — o significado da coluna
depende da máquina de estados, que ainda não foi decidida. O requisito que já
é absoluto: nenhum encerramento histórico pode sumir.

**Bug 3 — o pagamento normal não entra na linha do tempo.**

```
sonda (recebendo pela tela A Receber, o caminho de §36):
  diferencaStatus              paga
  tipos de evento              aberta,troca
  tem evento diferenca_paga?   false
```

O dinheiro fecha nos dois lugares — `receberConta` cuida disso —, mas a linha
do tempo da garantia mente por omissão. Só `POST /troca/pagar` gera o evento,
e nenhuma tela usa essa rota.

**Bug 4 — o estorno apaga a troca.** `estornarTroca` faz
`DELETE FROM garantia_trocas`. Somem `valor_original`, `valor_novo`,
`movimento_id` e `data`; sobra o evento com `{skuNovo, diferenca, vendaId}`.

O repositório já tem a regra e o precedente, em `saidas.js`:

> *Estornar NÃO apaga. Um segundo movimento devolve a peça, e a linha
> continua no histórico dizendo que houve, e que foi desfeita. Soft delete
> sem rastro deixaria o estoque certo e a explicação perdida.*

Três linhas acima do `DELETE`, o mesmo arquivo **cancela** a venda em vez de
apagá-la, citando §28. A troca é o outlier.

**Bug 5 — garantia sobre venda cancelada depois.** `abrirGarantia` recusa
venda cancelada; nada reconfere em seguida.

```
sonda: venda cancelada após a abertura -> troca ainda aceita: true
```

Sai peça do estoque por uma compra que não existe mais, sem aviso.

### 21.6 A trava de garantia dupla

Como funcionava até esta auditoria: `status IN (em_reparo, reparada,
sem_conserto) AND venda_id = ? AND sku = ?` — **por código, não por unidade**.

```
sonda:
  1a garantia (unidade A)                        true
  2a unidade FISICA do mesmo codigo (B)          RECUSADA: ja tem a garantia 1
  depois que a 1a encerra                        aceita
  reabrir a unidade A (garantia de B em aberto)  RECUSADA: ja tem a garantia 2
```

Cenário bloqueado: a cliente compra dois anéis iguais, um solta a pedra em
setembro e o outro descasca em outubro. O segundo caso não abre enquanto o
primeiro estiver em reparo.

A razão histórica era legítima: com o trio como identidade, duas linhas
pendentes do mesmo código eram mesmo indistinguíveis, e a trava larga
compensava a identidade fraca. 5.2b removeu a causa; a compensação ficou.

**DECISÃO DE PRODUTO, fechada em 12/09/2026:** a garantia passa a ser por
**unidade física**, por `venda_item_id`. Duas unidades com ids distintos na
mesma venda podem ter garantias simultâneas.

A compatibilidade é conservadora e não foi afrouxada: garantia antiga sem
ponteiro confiável (`ambiguo`, `sem_match`, legado sem identidade) continua
sob a trava larga por `(venda_id, sku)`. Distinguir unidades por suposição
seria exatamente o chute que 5.2b se recusou a dar.

### 21.7 GAR-102 — `POST /api/garantias/:id/troca/estornar`

Veredito: **correta e necessária, nunca chamada pela UI, e com um defeito
interno** (o `DELETE` do bug 4).

| Aspecto | Achado |
|---|---|
| Rota | existe, `bearer`, inventariada |
| Comando | `estornarTroca(db, id, { motivo })`, motivo obrigatório |
| Tabelas | `movimentos` (+1), `vendas` (cancela), `garantia_trocas` (**DELETE**), `garantia_eventos` (+1) |
| Estoque | devolve 1 da peça nova, tipo `ajuste`, origem `estorno` — correto, razão fecha |
| Financeiro | cancela a venda de §36; recusa quando a diferença já foi paga |
| Idempotência | segunda chamada devolve 404; não devolve estoque duas vezes |
| Reversibilidade | não há "des-estornar"; registra-se a troca de novo |
| Testes | nenhum até 5.2b; hoje duas provas |
| Call site | **nenhum**, no legado e no React |
| Documentação | `LEGACY-PARITY-AUDIT` linha 111 já o marcava `BACKEND READY` |

É necessária porque a troca baixa estoque, e um SKU digitado errado não se
corrige apagando linha. Sem ela, o único conserto é escrita manual no banco.
Não foi removida nem ativada.

### 21.8 Classificação

**Corrigível sem decisão de produto:** bugs 1, 3, 4 e 5; trazer a cobertura
de garantias para um gate que roda; `api/REGRAS.md` §31 dizendo que a
garantia ainda não migrou (obsoleto desde 5.2b); comentário de
`movimentos.tipo` no schema sem `troca_garantia` nem `estorno`.

**Precisa de decisão humana:** trava de garantia dupla (**fechada**: por
unidade); diferença negativa (**aberta** — crédito, reembolso ou nada);
máquina de estados (**aberta**); resolver as garantias `ambiguo`/`sem_match`
(**aberta**, exige gente olhando qual peça voltou).

**Depende do Codex (`AGUARDANDO HANDOFF CODEX`):** botão de estorno de troca;
caminho para cancelar garantia (o backend aceita `cancelada`, mas o estado
sequer aparece no `GAR_STATUS` do painel); tela de resolução de vínculo
ambíguo; qualquer redesenho da tela de Garantias.

### 21.9 Subetapas

| | Subetapa | Por que nesta ordem |
|---|---|---|
| 5.4a | caracterização do ciclo inteiro, **rodando em gate** | rede antes de mexer; sem isso qualquer correção é fé |
| 5.4b | bugs 1 e 5 + as duas correções de documentação | os mais baratos, sem decisão de produto e sem contrato |
| 5.4c | bug 3 — evento no caminho de `receberConta` | aditivo, mas atravessa `contas-receber.js` |
| 5.4d | bug 4 / GAR-102 — estorno auditável | mexe em schema e em contrato de leitura |

### 21.10 Riscos

- **o maior**: mexer em garantias hoje é mexer sem rede, porque a suíte que
  cobre o domínio não roda em gate nenhum. Daí 5.4a vir primeiro;
- 5.4d toca `idx_gar_troca_unica`: índice único vira parcial, e isso é
  mudança de schema com gate próprio;
- 5.4c atravessa `contas-receber.js`, que serve também venda comum e
  histórico — o risco é vazar evento para conta que não é de troca;
- a trava por unidade é irreversível na prática: garantias abertas sob a
  regra nova não voltam atrás;
- nenhum risco em produção nesta rodada: nada foi executado lá.

### 21.11 O que só o dado real responde

**PRECISA DE AUDITORIA READ-ONLY FUTURA EM PROD**

1. quantas garantias reais caem em `ambiguo` e `sem_match` no backfill de
   5.2b;
2. se alguma cliente já teve o segundo caso legítimo recusado pela trava
   larga.

Nenhum dos dois é conhecível sem dado real. PROD não foi consultado.

---

## 22. Fase 5.4e — as respostas da Sthefany, e o que coube implementar

Rodada de 12/09/2026. Três decisões humanas chegaram fechadas; uma delas
esbarra em infraestrutura que não existe, e isso está dito aqui em vez de
contornado.

### 22.1 Diferença negativa — a regra fechou, o mecanismo não existe

**Regra (Sthefany):** trocar uma peça de R$ 100 por uma de R$ 80 deixa
**R$ 20 de crédito para a cliente**. Não se perde, não volta em dinheiro.

**Auditoria do mecanismo — o sistema não tem nenhum.**

| Onde procurei | O que achei |
|---|---|
| tabela de crédito, carteira, saldo, vale, voucher | **nenhuma**, nem em `schema.sql` nem nas 33 migrations |
| coluna de saldo em `clientes` | **nenhuma** — `id, nome, tel, email, instagram, cidade, nascimento, obs, origem, cpf` e os normalizados |
| `historico_operacoes.saldo_centavos` | é o **saldo a receber** de uma operação histórica. Mão única: o que a cliente deve |
| `movimentos.tipo = 'nota_credito'` | é **movimento de ESTOQUE** — uma peça saindo. Nada a ver com dinheiro de cliente |
| A Receber (`contas-receber.js`) | representa exclusivamente o que a cliente **deve**. Não há o inverso |

Não existe lugar onde um crédito possa viver, nem caminho por onde ele possa
ser consumido numa compra seguinte.

**Classificação: DEPENDÊNCIA DA ARQUITETURA FINANCEIRA.** A regra foi
registrada em `api/REGRAS.md` como fechada. `diferenca_status` continua
`pendente_regra` — mas o que está pendente **mudou de natureza**: era a
regra, agora é a arquitetura.

O que mudou no código, e só isso: o sistema **parou de dizer que a regra não
existe**. As mensagens diziam "crédito ou reembolso ainda não é regra
definida", o que passou a ser falso. Agora dizem que o valor é crédito da
cliente e que falta onde guardá-lo. E a leitura expõe `creditoAoCliente`
(positivo, o valor absoluto da diferença negativa) para nenhuma tela ter de
deduzir isso do sinal.

**Nada foi simulado.** Há prova dedicada de que não aparece preço negativo,
não nasce conta a receber e nada é lançado no financeiro.

### 22.2 Novo atendimento — caso novo, ligado ao anterior

**Regra (Sthefany):** nova troca da mesma peça só dentro de **7 dias úteis**
e com a **etiqueta ainda na peça**. E o histórico do atendimento anterior tem
de continuar visível.

**Modelo escolhido:** o caso anterior **permanece encerrado**. O novo
atendimento é uma linha nova em `garantias`, apontando para a mesma unidade
física (`venda_item_id`) e ligada por `garantia_anterior_id`.

Foi a menor solução que preserva as seis coisas exigidas:

| Exigência | Como |
|---|---|
| caso original | intocado |
| encerramento original | `encerrada_em` permanece, e o relógio segue parado nele |
| eventos originais | intocados, e ganha um a mais: `reaberta_em_novo_caso` |
| nova abertura | linha nova, prazo próprio, evento `aberta` próprio |
| vínculo entre ciclos | `garantia_anterior_id` de um lado, evento do outro — legível dos dois |
| rastreabilidade | `reabertura_dias_uteis` congelado no momento da conferência |

As alternativas descartadas: reutilizar a linha com `UPDATE status,
encerrada_em = NULL` funde dois atendimentos que aconteceram em momentos
diferentes e apaga a data da entrega; uma tabela de ciclos separada exigiria
mover eventos e trocas, quando a própria `garantias` já é a unidade de ciclo.

### 22.3 Os 7 dias úteis

Contados de `encerrada_em` do caso anterior — o dia em que a peça voltou para
a dona — até a data de entrada do novo atendimento, por `diasUteisEntre`, a
mesma função do prazo de reparo. Sábado, domingo e **feriado cadastrado** não
contam. Não são dias corridos, e há prova disso: 03/08 (segunda) + 7 dias
úteis chega em 12/08, que em dias corridos seriam 9; com um feriado
cadastrado no meio, 13/08 ainda passa.

`reabertura_dias_uteis` fica **congelado** na linha. Recalcular depois daria
outro número se a tabela de feriados mudar, e "isto foi autorizado
corretamente na época?" precisa de resposta estável.

### 22.4 A etiqueta

O sistema **não tem como saber** se a etiqueta está na peça — é alguém
olhando a peça no balcão. O dado não foi inventado.

`etiqueta_preservada` guarda a **confirmação** de quem olhou. O backend está
preparado para recebê-la: `reabrirGarantia` exige `etiquetaPreservada`
explicitamente e distingue três respostas —

- ausente → 400, com `precisaConfirmar: 'etiquetaPreservada'`;
- `false` → 409, "a etiqueta foi removida";
- `true` → segue, e a confirmação fica gravada e auditável.

"Ninguém perguntou" nunca é tratado como "sim". **Requisito para a UX:** a
tela do novo atendimento precisa fazer essa pergunta a quem está com a peça
na mão. `AGUARDANDO HANDOFF CODEX`.

### 22.5 A matriz mínima de estados

Deliberadamente mínima: só o que já é seguro afirmar.

Três estados são **terminais** — `devolvida`, `concluida`, `cancelada` — e
**deles não se sai por mudança de status**. Se a peça voltou, o caminho é o
novo atendimento. As transições entre os estados PENDENTES seguem livres,
porque ninguém demonstrou ainda que alguma delas seja errada no balcão.

Isso fecha as duas transições absurdas observadas na auditoria:
`devolvida → em_reparo` apagando o encerramento, e `concluida → cancelada`
reescrevendo o desfecho de um caso terminado. A recusa aponta o caminho certo
em vez de só negar.

A tabela completa está em `api/REGRAS.md`.

### 22.6 Data futura

`mudarStatusGarantia` passou a recusar data futura, como abertura, troca e
pagamento já faziam. Mudança de status registra um fato **já ocorrido**.
Agendamento é outro conceito e terá campo próprio se for preciso.

### 22.7 O que 5.4e NÃO fez

- não criou arquitetura de crédito, carteira ou saldo;
- não simulou crédito com desconto, pagamento negativo ou ajuste de estoque;
- não criou UI nenhuma;
- não impôs máquina de estados além do mínimo;
- não tocou em `ambiguo`/`sem_match`, que continua dependendo de auditoria
  read-only futura em PROD;
- não consultou PROD.

### 22.8 Para declarar 5.4 tecnicamente encerrada

| # | Pendência | Natureza |
|---|---|---|
| 1 | onde o crédito da cliente vive e como é consumido | arquitetura financeira, com FIN-101 e o modelo novo |
| 2 | tela do novo atendimento, incluindo a pergunta da etiqueta | `AGUARDANDO HANDOFF CODEX` |
| 3 | botão de estorno de troca (GAR-102) | `AGUARDANDO HANDOFF CODEX` |
| 4 | caminho para cancelar garantia na tela | `AGUARDANDO HANDOFF CODEX` |
| 5 | reconciliação de `ambiguo`/`sem_match` | `PRECISA DE AUDITORIA READ-ONLY FUTURA EM PROD` |
| 6 | caso encerrado por engano não tem correção | **decisão pendente** — a matriz mínima fecha a saída dos terminais, e um `devolvida` digitado errado fica preso. Não inventei escape: prefiro a pergunta à porta dos fundos |
