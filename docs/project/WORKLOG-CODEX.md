# Worklog — Codex

Histórico de execução do Codex no Sistema Marquesa. Isto é registro do que
aconteceu, não um roadmap — o roadmap único é o
[Master Plan](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md); o
estado corrente de cada tarefa é o
[PROJECT-STATUS.md](PROJECT-STATUS.md).

**Nota sobre atribuição:** todo commit deste repositório é assinado pelo
mesmo usuário Git (`gustavodemelomartins-hub`), então o autor da ferramenta
não aparece no `git log` diretamente. As entradas abaixo usam o prefixo do
nome da branch (`codex/...` é a convenção estabelecida neste repositório
para sessão Codex, confirmado contra dezenas de branches existentes) como
sinal de atribuição. **Onde esse sinal falta — commit direto em `main`, ou
conteúdo preenchido sem commit correspondente — a entrada diz isso
explicitamente em vez de adivinhar.** Este worklog foi escrito por uma
sessão Claude durante a auditoria estrutural de 2026-09-11; toda entrada
aqui é reconstrução por evidência de Git, não relato de primeira mão.

---

## 2026-09-09 — Baseline Fase 0 e Master Plan (direto em `main`)

| | |
|---|---|
| Branch | `main` (direto, sem branch de feature) |
| Commits | `04edb02`, `b08734f`, `8055732`, `ae81c5b` |
| Status | commitado, parte disso ainda não em produção |
| Origem do agente | **não identificada por branch** — commits sem prefixo `claude/`/`codex/`; atribuídos a Codex aqui por serem a base sobre a qual `codex/ui-system-marquesa` foi criada, não por certeza de autoria |

**Task IDs tocados:** `DOC-001` (versão original), `ARQ-000`, `SAI-102`.

**O que foi feito:**
- `04edb02` — Master Plan de arquitetura criado (`docs/architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md`).
- `b08734f` — baseline da Fase 0: `API-ROUTES-BASELINE.md` (142 contratos),
  `GRAPHIFY-BASELINE-FASE-0.md`, `SCHEMA-MIGRATIONS-OPERATIONS-BASELINE.md`,
  `docs/decisions/` criada, `docs/domains/ESTOQUE-CATALOGO-BASELINE.md`,
  `docs/testing/` criada, `scripts/phase0-artifacts.test.mjs`,
  `scripts/run-baseline-tests.mjs`.
- `8055732` — integração da auditoria de saída não-receita (sorteio) à
  documentação de domínio.
- `ae81c5b` — categoria "sorteio" implementada em schema, regras e código
  (ver `SAI-102` em `LEGACY-PARITY-AUDIT.md`).

**Validações executadas:** não verificado por esta sessão (reconstrução
posterior); os commits em si citam testes próprios
(`src/reclassificacao-nao-venda-test.mjs`, 117 linhas).

**Resultado:** parte desta baseline (rotas, decisões, testing) já existe
também na branch `claude/refactor-sistema-marquesa` porque ela nasceu
depois, no mesmo ponto de `main`.

**Pendências:** migration do sorteio (`P11`/`DR-007`) não aplicada em
produção.

---

## 2026-09-09/10 — Área permanente de produto/UX (`codex/ui-system-marquesa`)

| | |
|---|---|
| Branch | `codex/ui-system-marquesa` |
| Commits | `1d86337`, `1844739` |
| Status | scaffolding commitado; conteúdo real preenchido depois, sem commit próprio (ver seção seguinte) |

**Task IDs tocados:** `DOC-003` (área de intake), `CAT-002`, `VEN-001`,
`INV-002`, `MON-002` (esqueleto).

**O que foi feito:**
- `1d86337` — criada a estrutura `docs/ux/` (00-index, 01-brand,
  02-references, 03-screens, 04-components, 05-flows, 06-backlog,
  07-mapping), com tabelas vazias e convenção de nome de arquivo.
- `1844739` — `docs/ux/07-mapping/` populado como "mapa vivo" de onde cada
  frente do sistema está.

**Validações executadas:** nenhuma (documentação estrutural, sem código).

**Resultado:** área criada; conteúdo real (regras, estados, mockups)
chegou depois, sem commit correspondente — ver próxima entrada.

**Pendências:** nenhuma própria; ver entrada seguinte.

---

## 2026-09-10/11 — Conteúdo real de `docs/ux/` e `docs/ui/` (não commitado até esta auditoria)

| | |
|---|---|
| Branch | `codex/ui-system-marquesa` |
| Commit | **nenhum até esta auditoria** — estava como alteração de working tree (36 arquivos modificados + dezenas de arquivos novos) |
| Status | conteúdo completo, preservado e commitado nesta auditoria (2026-09-11), autoria original não identificável por commit |

**Task IDs tocados:** `CAT-002`, `CAT-110`-`115`, `VEN-001`-`106`, `INV-002`,
`MON-002`, `EST-*` (UX), `ETQ-101` (UX).

**O que foi feito** (segundo o conteúdo dos arquivos, não segundo commit):
- `docs/ux/03-screens/estoque/`, `vendas/`, `personalizacao/` preenchidos
  com regras, estados, métricas, decisões abertas e mockups reais
  (imagens datadas de 10/09/2026, "enviado por Gustavo").
- `docs/ux/03-screens/catalogo/` criado do zero — 10 telas conceituais,
  contrato espelhado de `docs/domains/CONTRATO-UX-API-4-5.md` (branch
  paralela), com a lacuna de cadastro de produto já registrada
  explicitamente (`api-needs.md` § "Lacuna deliberada do espelho").
- `docs/ux/05-flows/` — 8 fluxos completos (catálogo ×4, vendas, saídas,
  recebimentos, etiquetas).
- `docs/ux/06-backlog/functional-ideas.md` — 9 ideias detalhadas (`IF-001`
  a `IF-009`), cada uma com dependências, impacto e decisões abertas
  nomeadas.
- `docs/ux/06-backlog/pending-decisions.md` — 4 decisões cross-tela
  (`DP-001` a `DP-004`) e 1 decisão fechada (`DP-005`).
- `docs/ui/` inteiro (não existia): `UI-VISION.md`, `SCREEN-INVENTORY.md`,
  `LEGACY-REACT-PARITY.md`, `COMPONENT-INVENTORY.md`, `REFERENCE-CATALOG.md`
  — inventário independente de tela × cobertura React, que já registrava
  "Cadastro de produtos: não existe [no React], legado exclusivo" antes
  mesmo da Fase 4.5 ter sido desenhada.

**Validações executadas:** nenhuma (documentação de produto, sem código;
o próprio `docs/ux/00-index.md` proíbe implementação a partir só disso).

**Resultado:** conteúdo extenso e coerente, cruzado e citado por esta
auditoria em `PROJECT-STATUS.md` e `LEGACY-PARITY-AUDIT.md`. Commitado
nesta auditoria (2026-09-11) como preservação — nenhum conteúdo alterado.

**Pendências:** nenhum mockup visual da Fase 4.5 recebido ainda; 35
decisões de Vendas (`VEN-Q001`-`035`), 10 de Estoque (`EST-Q001`-`010`) e 6
de Catálogo (`CAT-Q001`-`006`) continuam abertas.

**Próximo passo:** mockups da Fase 4.5; fechar decisões que travam
implementação (ver `PROJECT-STATUS.md` › Decisions Required).

---

## 2026-09-XX — Governança local `.codex/` (não commitado até esta auditoria)

| | |
|---|---|
| Branch | working tree de `codex/ui-system-marquesa` (data de criação não registrada em commit) |
| Commit | **nenhum até esta auditoria** |
| Status | íntegro, funcional, espelha `.claude/` corretamente — preservado nesta auditoria |

**Task ID:** `ARQ-004`.

**O que foi feito:** `.codex/agents/{architect,database-guardian,repo-explorer,verifier}.toml`
e `.codex/hooks/{protect-production.mjs,protect-production.test.mjs,verify-before-stop.mjs}`
+ `.codex/hooks.json` — mesma estrutura de 4 agentes e 2 hooks
(`PreToolUse`/`Stop`) que `.claude/` já tem versionado (23 arquivos), sem
criar segunda política, conforme o `CLAUDE.md` do projeto exige.

**Validações executadas por esta auditoria:** conferido que nenhum arquivo
contém segredo (`grep` por `api_key|secret|token|password` — só ocorrências
de código legítimo de proteção, nenhuma credencial). Conferido que
`.codex/` não estava no `.gitignore` (só `.agents/` está).

**Resultado:** commitado nesta auditoria sem alteração de conteúdo.

**Pendências:** nenhuma — mas vale conferir periodicamente que `.codex/`
não diverge do comportamento de `.claude/` (risco já registrado no Master
Plan §17).

---

## Protocolo permanente Claude/Codex

Toda vez que Codex realizar trabalho significativo neste projeto:

1. identificar o Task ID (criar um novo em `PROJECT-STATUS.md` se não existir);
2. executar o trabalho;
3. validar (teste do assunto; `GET /api/estoque/conferir` vazio quando toca
   estoque; build quando toca frontend);
4. atualizar **este arquivo** com uma entrada nova (nunca editar uma
   entrada antiga — histórico não se reescreve);
5. atualizar `PROJECT-STATUS.md` (mover a tarefa de coluna, atualizar
   contagem no rodapé);
6. atualizar o Master Plan **somente se** houver mudança arquitetural, de
   escopo ou decisão — não para progresso rotineiro;
7. atualizar `LEGACY-PARITY-AUDIT.md` se o trabalho mudar o estado real de
   uma funcionalidade legada (nunca por documentação sozinha);
8. incluir o Task ID na mensagem do commit (ex.: `feat(catalogo): CAT-003 —
   rota de criação de produto`).

Commitar no fim da sessão, mesmo que a implementação continue depois —
conteúdo que só existe na working tree não aparece pra próxima sessão nem
pro outro agente, como este próprio worklog teve que reconstruir por
evidência em vez de relatar de primeira mão.

---

## 2026-09-11 — Checkpoint `VEN-001`: Vendas em refinamento

| | |
|---|---|
| Branch | `codex/ui-system-marquesa` |
| HEAD de base | `52f5f5f` |
| Tela | Vendas |
| Status | **UX/UI EM REFINAMENTO — design principal avançado, interações pendentes** |
| Natureza | protótipo visual e documentação; sem implementação de produto |

**Estado preservado:** esta rodada começou com alterações locais já existentes
em `docs/ux/03-screens/vendas/master.html` e `master.css`. Elas não foram
apagadas, revertidas nem substituídas. O protótipo mestre continua sendo a
principal frente visual da V2.

**Visualmente avançado:** logo original, header desktop, navegação principal e
secundária, hierarquia do Painel, cartões financeiros, alerta, seletor de
período, gráfico, Análise detalhada, Evolução por mês, tabelas, badges e detalhe
compacto de venda já formam uma linguagem coerente. Isso não equivale ao aceite
da tela completa.

**Interações já simuladas:** tabs de Vendas; presets e intervalo por datas;
seleção de barra com atualização dos dois painéis analíticos; alternância entre
análises; expansão da lista de produtos; paginação das vendas; detalhe inline
por clique/teclado; contexto de cliente/recebíveis; menu de perfil; acesso local
a Saídas sem faturamento.

**Interações ainda em revisão:** lançamento normal, Monte seu Colar, busca e
inclusão de itens, edição de preço, cadastro rápido de cliente, pagamentos
múltiplos, parcelamento, finalização, confirmação, registro/estorno de saídas,
filtros e buscas das superfícies auxiliares, estados vazio/loading/error e
comportamento final em tablet/mobile.

**Destinos futuros:** `Ver recebimentos` e `Pendente` apontam para
Clientes / Recebimentos; o alerta de Reparos aponta para Reparos; menu principal,
notificações, perfil e preferências dependem de telas/rotas fora deste design.
As superfícies contextuais atuais são simulações e não significam que esses
destinos estejam desenhados.

**Documentação criada/atualizada:** matriz oficial em
`docs/ux/03-screens/vendas/interaction-matrix.md`, handoff progressivo em
`docs/ux/03-screens/vendas/handoff.md`, status da tela, inventário de padrões
reutilizáveis e sincronização read-only da decisão `VEN-Q018` a partir da frente
Claude ReviewV2 (`8b306ad`). Nenhum merge entre branches foi feito.

**Situação técnica:** não implementado em React; não integrado ao backend; não
publicado em DEV; não publicado em PROD. Fase 5 de backend não foi iniciada.

**Próximo passo:** Gustavo revisar a matriz; em seguida, refinar somente as
interações locais confirmadas, completar estados e responsividade e fechar o
checklist do handoff antes de qualquer promoção para `UX/UI DESIGNED`.

**Bloqueios/pendências:** decisões de produto ainda abertas, destinos futuros
sem tela, contratos analíticos/financeiros não comprovados e aceite responsivo.
Não há bloqueio para continuar o refinamento visual local.

**Validação desta rodada:** consistência documental, links relativos,
integridade do diff e smoke test read-only no navegador. Foram exercitados
presets, intervalo personalizado, seleção de barra, troca de análise, expansão
do ranking, paginação, detalhe inline, menu de perfil e destinos simulados. Não
houve teste integrado de React/backend porque essas camadas não foram alteradas.

**Governança desta rodada:** `PROJECT-STATUS.md` e o painel global não foram
editados; a consolidação permanece com Claude ReviewV2. Nenhum commit foi
criado, conforme solicitado para este primeiro alinhamento.

---

## 2026-09-12 — `VEN-001`: composição mobile da Vendas V2

| | |
|---|---|
| Branch | `codex/ui-system-marquesa` |
| HEAD de base | `a6d7c6b` |
| Tela | Vendas |
| Status | **UX/UI EM REFINAMENTO — mobile reorganizado e validado tecnicamente** |
| Natureza | CSS responsivo do protótipo; sem React, backend ou ambiente externo |

**Mudança:** o cabeçalho mobile foi compactado, a navegação principal passou
para uma barra fixa no rodapé e as três abas de Vendas deixaram de competir por
espaço com o menu global. Painel, lançamento, pagamento e métricas receberam
densidade própria para celular. As tabelas de Clientes, Reparos e Saídas viraram
cartões legíveis, e o ranking do Painel mostra apenas as colunas que cabem sem
perder a comparação principal.

**Correção encontrada durante a prova:** o `backdrop-filter` do cabeçalho criava
um bloco de referência para a navegação `fixed`, prendendo a barra inferior no
topo e cobrindo o submenu. O efeito foi removido somente no breakpoint mobile;
a barra voltou a se fixar no viewport.

**Validação:** Playwright/Chromium em `320px`, `360px` e `390px`: sem overflow
horizontal, cabeçalho de `114px`, submenu com alvos de `48px`, barra inferior de
`69px` fixa antes e depois da rolagem e navegação funcional entre Painel,
Lançamentos e Clientes. Popover de datas, detalhe expandido, Reparos e Saídas
também foram exercitados sem overflow. Em `1440px`, a navegação desktop
permaneceu estática e sem overflow. `git diff --check` passou.

**Limite:** esta rodada não promove Vendas para `UX/UI DESIGNED`. Ainda faltam
aceite visual do Gustavo no celular, validação específica de tablet,
acessibilidade completa e fechamento das interações locais pendentes.

---

## 2026-09-12 — `VEN-001`: comparação entre vendas do período

**Decisão visual:** em `Evolução por mês → Vendas do período`, qualquer venda
com saldo cobrável aparece como `A receber` em vinho. O estado derivado parcial
continua existindo nos valores (`Venda`, `Recebido`, `A receber`), mas deixa de
competir com a ação operacional na lista. O botão `Pendente` do detalhe segue
amarelo.

**Interação:** cada linha passou a controlar seu próprio detalhe. É possível
manter qualquer quantidade de vendas expandida, recolher somente uma delas por
clique ou teclado e comparar os valores. Paginação e troca de contexto continuam
recolhendo todos os detalhes para não deixar informação antiga na tela.

**Validação:** Playwright/Chromium em `390px` e `1440px`, cobrindo três detalhes
simultâneos, fechamento independente, abertura por `Enter`, recolhimento na
paginação, ausência do rótulo `Parcial`, ARIA e overflow horizontal. Foram 14
verificações direcionadas, todas verdes.

---

## 2026-09-12 — `VEN-001`: 10 vendas por página

`Evolução por mês → Vendas do período` passou de 5 para até 10 vendas por
página. O protótipo agora mantém dez registros amostrais distintos, evitando
repetição de identidade e colisão entre detalhes expandidos.

**Validação:** Playwright/Chromium em `390px` e `1440px`: 10 linhas visíveis,
10 identidades únicas, 10 detalhes simultâneos, rodapé `1 a 10`, segunda página
`11 a 20`, recolhimento dos detalhes na paginação e zero overflow horizontal.
Foram 14 verificações direcionadas, todas verdes.

---

## 2026-09-12 — `VEN-001`: fluxo navegável de Venda normal

O Painel principal foi considerado praticamente fechado pelo Gustavo e o foco
passou para Lançamentos. A variante `Venda normal` foi reorganizada como uma
superfície contínua: itens e cliente dividem a linha principal no desktop,
Pagamento fecha o fluxo em largura total e, no celular, total e finalização
permanecem alcançáveis acima da navegação fixa.

O protótipo agora permite buscar e adicionar produtos ilustrativos, ajustar
quantidade, remover peças, editar o preço final com motivo obrigatório, trocar
ou cadastrar rapidamente uma cliente, editar data/canal/observação, combinar
recebimentos pagos e pendentes, revisar e simular a confirmação. O retorno de
sucesso declara explicitamente que nenhum dado real foi gravado.

**Validação:** Playwright/Chromium executou 24 verificações em `320px`, `390px`
e `1440px`: carrinho e totais reativos, trava de motivo, pagamento misto,
estado financeiro derivado, troca de cliente, revisão, confirmação, reinício,
duas colunas no desktop, ação alcançável na largura mínima, ausência de erros
JavaScript e zero overflow horizontal.

**Limites:** Monte seu Colar, geração de parcelamento, formulário completo de
Saída sem faturamento, persistência, API, React, deploy e produção não foram
alterados nesta rodada.

### Ajuste fiel ao mockup de pagamento misto

Após revisar o mockup com o Gustavo, a Venda normal deixou de usar cartões
independentes e adotou sua estrutura original: uma única moldura para itens,
cliente, pagamento e totais, seguida de `Vendas de hoje`. A identidade nova foi
mantida integralmente. O estado inicial ilustra R$ 500,00 em venda, R$ 350,00
recebidos e R$ 150,00 a receber em três lançamentos independentes.

**Validação complementar:** 30 verificações Playwright/Chromium em `320px`,
`390px` e `1440px`, incluindo fidelidade estrutural, pagamento misto, situação
derivada, desconto, bloqueio por excesso, revisão, sucesso, responsividade e
ausência de erros JavaScript.

## 2026-09-14 — Saída sem faturamento em Lançamentos

Reconstruído o protótipo do registro com a identidade visual de Vendas: busca
por nome/SKU, escolha explícita de aro, quantidades limitadas ao saldo amostral,
quatro motivos (Brinde, Uso próprio, Perda e Sorteio), contexto, explicação
obrigatória e revisão antes da confirmação. O rascunho é preservado ao alternar
o tipo de lançamento. Histórico da sessão com filtro e estorno motivado,
preservando o original e impedindo segundo estorno.

Referências: mockups de registro e histórico de saídas recebidos em 10/09.
O preço de tabela não é apresentado como prejuízo. Data retroativa/futura
permanece decisão de UX aberta; este protótipo não impõe nova regra temporal.

Validação: 64 verificações Playwright em 320, 390, 768 e 1440 pixels;
regressão de Venda normal com 57 verificações aprovadas; diff sem erros.
Escopo: protótipo local com dados ilustrativos; sem API, persistência ou deploy.


### 14/09 — Histórico de saídas com exemplos e refinamento visual

A pedido do Gustavo, o histórico ganhou seis exemplos fictícios, incluindo
brinde, uso próprio, perda, sorteio e um estorno. Resumo por motivo, tabela
compacta no desktop, cartões no celular e detalhes expansíveis com peças, SKU
e explicação. Valores rotulados como referência de tabela, sem inferir custo.
Os exemplos não alteram o saldo do formulário. Link direto pelo hash `#saida`.
Validação: 80 verificações Playwright em quatro larguras, captura visual
conferida e `git diff --check` sem erros. Sem backend ou deploy.


### 14/09 — Custo real por peça e histórico financeiro de saídas

Gustavo aprovou o custo unitário de aquisição editável somente no lançamento,
pré-preenchido quando conhecido, sem assumir zero quando ausente, com snapshot
na saída para não alterar o histórico ao mudar o cadastro. Implementado apenas
no protótipo local; não é contrato publicado de API ou banco.

Detalhes passam a uma linha de largura completa (colspan 7), com múltiplas
expansões independentes. Removidos os quatro cards: resumo compacto de custo
bruto, estornado e líquido, com discriminação por motivo e filtros de datas e
situação. Preço de venda fica secundário. Custos desconhecidos tornam os totais
explicitamente parciais. Dinheiro de aquisição calculado em centavos.

Validação: 144 verificações de saídas em 320/390/768/1440 px, incluindo soma,
quantidade, custo ausente, zero explícito, snapshot, estorno, filtros e expansão
em largura completa; 57 de regressão de Venda normal. Sem API, banco ou deploy.

### 14/09 — Saídas alinhadas ao padrão visual do Painel

O histórico deixou a composição financeira própria e passou a reutilizar a
linguagem de `Evolução por mês`: controle de período, quatro métricas compactas,
análise em duas colunas com barras e destaques, e tabela `Saídas do período`.
As linhas e detalhes agora seguem a interação das vendas do período: linha
clicável, seta circular, fundo rosado ao expandir e detalhe compacto ocupando
toda a largura. Filtros de motivo e situação continuam disponíveis.

Validação: 148 verificações de Saídas em 320/390/768/1440 px e 57 verificações
de regressão de Venda normal. Capturas desktop e mobile revisadas; sem API,
banco ou deploy.

### 14/09 — Custo preenchível pelo histórico da saída

O detalhe expandido agora oferece `Informar custo` quando alguma peça não tem
custo e `Editar custo` quando todos os valores já estão preenchidos. A janela
lista cada item da saída com SKU, quantidade e custo unitário. Ao salvar, o
snapshot daquela saída e toda a análise financeira são recalculados, sem mudar
o preço de venda da peça. Continua sendo comportamento demonstrativo local.

Validação: 176 verificações de Saídas nas quatro larguras, cobrindo abertura,
custo inicialmente vazio, gravação, troca do rótulo e recálculo financeiro;
57 verificações de regressão de Venda normal.

### 14/09 — Revisão móvel do sistema de Vendas

O protótipo recebeu uma composição específica para celular. O histórico de
saídas deixou de comprimir colunas de tabela e passou a empilhar destino, data,
motivo, situação, peças e custo real em linhas legíveis, mantendo o detalhe
logo abaixo do lançamento. As análises ficam em uma coluna, textos financeiros
podem quebrar linha e os indicadores de Clientes se reorganizam em duas
colunas. Os arquivos da prévia ganharam versão na URL para evitar CSS antigo
no cache do celular.

Validação: 39 verificações móveis em 320/390/430 px cobrindo Painel, Clientes,
Lançamentos, Saídas, detalhe expandido, ausência de sobreposição e zero
overflow horizontal; 176 verificações de Saídas, 57 de Venda normal e 37 de
Monte seu Colar aprovadas. Escopo local e demonstrativo, sem API ou deploy.

### 15/09 — Checkpoint de cobertura de Vendas

Fechado o bloco navegável de Vendas para iniciar a cobertura do restante do
produto. Gustavo decidiu que esta versão não gera parcelas: pagamentos pagos e
pendentes continuam independentes, e toda diferença ainda não recebida aparece
como `A receber`. O seletor de parcelas foi removido do protótipo e a decisão
foi propagada para regras, estados, fluxos, matriz de interações e necessidades
futuras de API.

Validação do checkpoint: 57 verificações de Venda normal, 37 de Monte seu
Colar, 176 de Saídas e 39 verificações móveis em 320/390/430 px. Nenhum backend,
banco, ambiente DEV ou produção foi alterado.

### 15/09 — Hub do protótipo e cobertura de Estoque

Criada a entrada central navegável do Sistema Marquesa V2 e a matriz de
cobertura por superfície, separando requisitos, estrutura, desktop, mobile,
interações, fluxo, aprovação humana, contrato de backend e implementação.

Estoque ganhou um protótipo mestre no padrão visual de Vendas, com resumo de
distribuição, categorias, produtos com foto em primeiro lugar e o ciclo de
inventário dentro da mesma área. O fluxo demonstra início, persistência
incremental, pausa e retomada, conflito de variação, fechamento sem ajuste
automático, revisão apenas de divergências elegíveis, histórico e detalhe.
`Não conferido` e `Não comparável` permanecem sem checkbox ou sugestão de
ajuste. Todos os dados e aplicações são explicitamente simulados.

Validação: 92 verificações em 320, 390, 768 e 1440 pixels, cobrindo o hub, os
estados do inventário, as invariantes de revisão, busca de produtos e ausência
de overflow horizontal. Nenhum React, backend, banco ou deploy foi alterado.

### 15/09 — Cobertura navegável de Etiquetas

As três referências aprovadas de Etiquetas foram consolidadas no padrão global
do protótipo: Preparar, Impressão e Histórico. A fila demonstra busca, origem,
seleção, quantidade e edição exclusiva do texto impresso; a revisão apresenta
folha proporcional de 126 posições, múltiplas folhas, calibração horizontal e
vertical, PDF e envio ao diálogo; o histórico preserva autoria, origem, itens e
o lote anterior durante a preparação de uma reimpressão.

Os estados deixam explícito que abrir o diálogo não prova impressão física e
que nenhuma ação de etiquetas movimenta estoque. Validação: 72 verificações em
320, 390, 768 e 1440 pixels, cobrindo edição de texto, totais, composição da
folha, calibração, impressão honesta, histórico, reimpressão e overflow. Sem
React, API, banco, arquivo físico ou deploy.

### 15/09 — Cobertura de Clientes dentro de Vendas

Clientes passou de lista demonstrativa para uma experiência navegável com
perfil, contato, situação financeira e linha do tempo. Total comprado, total
recebido e `A receber` ficam separados; o saldo aberto não gera parcelas. A
linha do tempo apresenta vendas e recebimentos como fatos diferentes, com a
data efetiva do recebimento, e oferece entradas para nova venda, cadastro,
observação e registro de recebimento.

Como não existe mockup próprio recebido para esta família, o desenho foi
registrado como proposta pronta para revisão humana, sem aprovação presumida.
Validação: 52 verificações em 320, 390, 768 e 1440 pixels, mais 39 verificações
de regressão mobile de Vendas. Nenhuma persistência, API, banco ou deploy.

### 15/09 — Proposta navegável de Financeiro

Criada a quinta família do hub com `A receber`, recebimentos e histórico
auditável. A lista separa total, recebido e saldo; o detalhe registra forma e
data efetiva, deriva o estado financeiro e demonstra correção sem apagar o
evento anterior. O fluxo não gera parcelas: o valor restante continua como um
saldo único em `A receber`.

Como não há mockup próprio nesta branch, a composição permanece proposta pronta
para revisão do Gustavo. Validação: 44 verificações em 320, 390, 768 e 1440
pixels, incluindo recalculo do saldo, estado derivado, correção auditável,
histórico, proteção do estoque e overflow. Sem React, API, banco ou deploy.
