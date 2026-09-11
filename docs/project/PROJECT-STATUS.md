# Painel Operacional — Sistema Marquesa

**Atualizado em:** 2026-09-11 (revisão da noite: consolidação das decisões e
das frentes paralelas; depois, mesmo dia: Fase 4.6 do Claude Refactor
concluída e branch protegida, `data.workstreams` passa a alimentar o painel;
por último: **as respostas da Sthefany chegaram** e `DR-005`, `DR-006`,
`DR-015` e `DR-016` fecharam)
**Fonte:** auditoria estrutural completa (branches locais/remotas, commits, docs/ux,
docs/ui, docs/domains da branch paralela, código legado e React), mais leitura
read-only do D1 de produção e de `wrangler deployments` em 11/09/2026
**Não é:** um roadmap alternativo. O roadmap único é o
[Master Plan](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md). Este
painel só diz **em que pé** cada pedaço dele está agora.

## Como ler isto

- Cada tarefa tem um **ID estável**, nunca reaproveitado. Prefixo por
  domínio: `CAT` catálogo/produto/publicação, `EST` estoque geral, `INV`
  inventário físico, `NUV` Nuvemshop/sync, `VEN` vendas, `CLI` clientes,
  `REV` revendedoras/maletas, `GAR` garantias, `FIN` financeiro/recebíveis,
  `MON` personalização/Monte seu Colar, `SAI` saídas sem faturamento, `ETQ`
  etiquetas, `ARQ` arquitetura/infraestrutura de refactor, `DOC`
  documentação/governança.
- Esses IDs são um **namespace diferente** de `CAT-Q001`, `VEN-Q001`, `EST-Q001`
  (perguntas de tela em `docs/ux/`) e de `DP-001` (decisão cross-tela em
  `docs/ux/06-backlog/pending-decisions.md`) e de `P1..P17`
  ([docs/decisions/PENDENTES.md](../decisions/PENDENTES.md), já integrado nesta
  linha). Onde uma tarefa daqui depende de uma dessas, o link aparece na linha.
- **`DR-*` e `P*` são a mesma pergunta em dois formatos** — `DR` como ela chega
  ao Gustavo, `P` como ela trava uma fase. O de-para está em
  `## DECISIONS MADE`. Para o conteúdo da regra, `PENDENTES.md` é a fonte;
  para o estado da tarefa, este arquivo é.
- **Definition of Done por tipo de tarefa** (regra permanente, não é opinião
  por tarefa):
  - tarefa de **desenho de UX** → DONE só quando a tela chega ao último degrau
    da escada de `docs/ux/00-index.md` (`pronto para avaliação arquitetural`).
    "descrito" e "recebendo" **não são DONE**.
  - tarefa de **backend** → DONE só quando está mesclada, implantada e
    verificada (`GET /api/estoque/conferir` vazio quando toca estoque, teste
    do assunto rodado). Código+teste numa branch não mesclada é **BACKEND
    PRONTO**, não DONE.
  - tarefa de **frontend React** → DONE só quando a tela substitui o legado
    para aquele fluxo, com teste e uso real — não quando a pasta existe.
  - tarefa de **documentação** → DONE quando o documento descreve o estado
    real e foi commitado. Não exige que a coisa documentada exista.
  - Nenhuma tarefa vira DONE só porque **outra camada** dela terminou. Foi
    exatamente isso que escondeu a lacuna do cadastro de produto.

---

## DONE

| ID | Tarefa | Evidência |
|---|---|---|
| DOC-001 | Master Plan sincronizado com o real da Fase 4.4/4.5 e a lacuna de cadastro de produto registrada | commit `ef6f130`, `docs/architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md` §2, §30, §50 |
| DOC-002 | Auditoria estrutural completa + sistema permanente de acompanhamento (este arquivo + 2 worklogs + paridade do legado) | este commit — ver WORKLOG-CLAUDE.md |
| ARQ-004 | Espelho de governança do Codex (`.codex/agents`, `.codex/hooks`) preservado no Git, replicando `.claude/` sem criar segunda política | commit de preservação desta sessão |
| ARQ-005 | **Reconciliação e integração da branch Claude na V2** — 75 commits classificados por domínio e integrados em 9 lotes (`B1`–`B9`), cada lote testado antes do seguinte; suíte local inteira verde depois (**14/14 gates no nível `release`**, contra 5/5 antes) | merges `B1`–`B9` nesta branch; `node scripts/run-baseline-tests.mjs release` |
| ARQ-006 | **Preservação de todo o trabalho local no remoto** — 10 refs `backup/*` empurradas (a branch Claude de 79 commits, a V2, `main` local, 2 stashes e 3 branches à frente do upstream). Nenhum merge em `main`, nenhum force, nenhum deploy | `git ls-remote origin 'refs/heads/backup/*'` |
| ARQ-008 | Gate `schema-migration-coerencia` na suíte local — `migracao-variantes-test.mjs` rodava só no CI do DEV e por isso a integração passou 15/15 aqui e quebrou lá. Agora ele roda no nível `fast` | `docs/testing/test-suites.json`; 16/16 gates no nível `release` |
| DOC-003 | Painel visual do projeto (`docs/project/dashboard/`) gerado a partir dos `.md`, com gate `projeto-painel` que falha se a tela divergir dos documentos | `scripts/build-project-dashboard.mjs`, `docs/testing/test-suites.json` |
| CAT-003 | Cadastro de produto — **decidido**: continua em Estoque → Cadastro de Produtos; Catálogo não ganha fluxo próprio | `DR-002`, 11/09/2026 |
| DOC-004 | Consolidação das 11 decisões de 11/09/2026, separação de `P11`/`P17`, e registro das 3 frentes paralelas de trabalho | commits `3843297` e `510afa5` — ver `## WORKSTREAMS` e `## DECISIONS MADE` |
| DOC-005 | **Consolidação das respostas finais da Sthefany** — saldos físicos do Monte seu Colar, composição do exemplar consignado, régua de variação, comissão com desconto e classe dos 2 casos históricos. `DR-005`, `DR-006`, `DR-015` e `DR-016` fechadas; nenhuma escrita, migration ou reclassificação executada | este commit — `api/REGRAS.md` §45, `MONTAGEM-MONTE-SEU-COLAR.md` §5, `INVENTARIO-4-4.md` §12, `SAIDAS-SEM-FATURAMENTO.md`, `PENDENTES.md` |

Fora da janela de ontem/hoje, já em produção e estável (contexto, não tarefa
ativa): Pacotes 0–4 do painel (checkpoint `69ac8ac`), 790 produtos / 1.428
movimentos / 19 vendas validados, reconciliação zero — ver Master Plan §2.

---

## IN PROGRESS

| ID | Tarefa | Onde está | Bloqueio/próximo passo |
|---|---|---|---|
| ARQ-001 | Fase 2 — shell HTTP: 142/142 contratos extraídos para tabela de rotas, gate `api-contracts.test.mjs` | **mesclado na V2** (lotes `B1`–`B9`), gate `api-contracts` verde com 173 contratos | falta publicar no DEV (Worker staging é botão manual) |
| ARQ-002 | Fase 3 — plataforma (config tipada, erros/logs, D1 helpers, correlação, adapters) | **mesclado na V2**; 4 testes de plataforma verdes | falta publicar no DEV |
| ARQ-003 | Auditoria/unificação de normalização de SKU (8 pontos) e sufixo de compra | **mesclado na V2**; `sku-normalizacao.test.mjs` verde — uma definição, 61 módulos varridos | falta publicar no DEV |
| CAT-001 | Backend Fase 4.5 — categoria (identidade/renomear), galeria/mídia, tarefa de preparação, publicação (writer + estados), 19 testes de schema | **mesclado na V2**; 26 provas do `catalogo-4-5-test.mjs` verdes | **`P13`–`P16` fecharam em 11/09** (`DR-008`–`DR-011`): o que resta implementar tem regra. R2 continua desligado por `DR-003` |
| CAT-002 | UX da Fase 4.5 — 10 telas conceituais, 4 fluxos, matriz UX↔API | `docs/ux/03-screens/catalogo/`, `docs/ux/05-flows/catalogo-*.md`; estado do material: **domínio mapeado, aguardando mockups** | falta mockup visual. A decisão de cadastro fechou (`DR-002`): Catálogo **não** desenha cadastro próprio |
| INV-001 | Backend Fase 4.4 — inventário físico: 5 rotas preservadas + 7 novas, migration, 22+9 testes | **mesclado na V2**; 22 provas + 9 travas verdes, razão fechando | **`S1`–`S6` fecharam** (`DR-006`): a régua de variação é o aro do anel, e o desenho de inventário pausado **fica** por decisão explícita. Resta o técnico — migration não aplicada em lugar nenhum. PROD está congelada: o alvo é o D1 do DEV |
| INV-002 | UX de Inventário — 9 blocos, 5 mockups, embutido em Estoque | `docs/ux/03-screens/estoque/`; estado: **descrito** (não é o degrau final) | fórmulas de "Saúde do estoque"/"valor estimado" ainda abertas (`EST-Q*`) |
| MON-002 | UX de Personalização (Monte seu Colar) | `docs/ux/03-screens/personalizacao/`; estado: **recebendo** | posições/repetição de criança (`VEN-Q016`–`VEN-Q018`) |
| VEN-001 | UX completa de Vendas — 13 blocos, 8 mockups, editor de desconto por peça, pagamento composto | `docs/ux/03-screens/vendas/`; estado: **descrito** | 35 decisões abertas (`VEN-Q001`–`VEN-Q035`) |
| CLI-001 | React de Clientes — só busca global implementada e testada, sem ficha/CRUD | `frontend/src/app/BuscaGlobalClientes.tsx` | ficha completa ainda não começou |
| REV-001 | React de Maletas — criação em dois passos sem endpoint atômico (risco documentado no próprio código) | `frontend/src/features/maletas/` | endpoint atômico de criação, ou aceitar o risco por decisão explícita |
| REV-002 | React de Revendedoras — visão geral + ficha completas e testadas | `frontend/src/features/revendedoras/` | paridade de acerto/comissão com o legado ainda não confirmada ponta a ponta |
| NUV-001 | React de Nuvemshop/sync — leitura completa e testada (panorama, saúde); escrita/aprovação só no legado | `frontend/src/features/nuvemshop/`, `frontend/src/features/reconciliacao/` | `reconciliacao/` autodeclarada "em construção": aprovar/aplicar não persiste ainda |
| ARQ-007 | **Divergência entre `api/schema.sql` e as migrations** — `migracao-pos-golive-1.sql` cria `maleta_item_variacoes`, `venda_item_correcoes` e 5 índices que nunca foram escritos de volta no schema. Banco criado do zero não os tem; banco migrado (PROD e DEV) tem | achado em 11/09/2026 ao estender `src/migracao-variantes-test.mjs` das 8 migrations originais para as 30 reais. O teste hoje subtrai essa lista nomeada e falha se ela mudar | é anterior a esta sessão e não bloqueia nada hoje; fechar exige `safe-d1-change` e nunca em PROD congelada |
| SAI-001 | Categoria "sorteio" (saída sem faturamento) — **só o schema**, depois da separação de `DR-007`. Código e `api/schema.sql` já têm os 4 tipos | `main` | produção ainda tem o `CHECK` de **3** tipos (lido do `sqlite_master` em 11/09); migration `api/migracao-sorteio-saida-sem-faturamento.sql` **não executada** e reconstrói 2 tabelas (`P11`) |

---

## NEXT

| ID | Tarefa | Depende de |
|---|---|---|
| CAT-004 | Gestão de categorias (criar/editar) — hoje `POST /api/categorias` existe e **nenhuma tela chama**, nem legado nem React | **despriorizada por `DR-012`**: roadmap pós-validação |
| CAT-005 | React de Catálogo/Cadastro — nenhuma pasta existe ainda | **destravada por `DR-002`**: o cadastro não é dela; reutiliza o fluxo de Estoque |
| EST-002 | React de Editar peça/variações/kits/fotos/arquivar — só existe no legado | fatia vertical de Estoque na Fase 9 |
| INV-003 | React de Inventário — nenhuma pasta existe, só o design em `docs/ux` | INV-001 mesclado primeiro (contrato ainda pode mudar) |
| VEN-002 | React de Vendas — `App.tsx` só mostra `AreaPendente`, zero tela real | VEN-001 fechar decisões abertas antes de implementar. **`VEN-105` (correção de item vendido) entra aqui por `DR-014`**, fora da ordem de fase — em curso no Codex |
| VEN-003 | Recebimentos múltiplos/parcelados (`IF-009`) | ideia em detalhamento, sem contrato ainda |
| GAR-001 | React de Garantias — não existe nenhuma pasta | **prioridade alta por `DR-014`** (`GAR-101` é paridade obrigatória). Atenção: `docs/ux/03-screens/reparos/` é domínio NOVO com material `vazio`, **não** é o desenho de `GAR-101` |
| FIN-001 | React de Financeiro/Recebíveis — não existe nenhuma pasta | **prioridade alta por `DR-014`** (`FIN-101` é paridade obrigatória). Não existe pasta de UX para contas a receber em `docs/ux/03-screens/` |
| MON-003 | React de Monte seu Colar — hoje é backend puro atrás de flag | ligar `PERSONALIZACAO_ATIVA` primeiro (ver Decisions Required) |

---

## BLOCKED

| ID | Tarefa | Bloqueado por |
|---|---|---|
| NUV-002 | Publicação externa de catálogo na Nuvemshop (ligar de verdade) | `NUVEMSHOP_PUBLICACAO_ENABLED` ausente em todo ambiente **e** R2 desligado em produção — decisão de release |
| MON-001 | Monte seu Colar em produção | `PERSONALIZACAO_ATIVA=false`. **Os saldos chegaram** (`DR-005`) e o bloqueio deixou de ser humano: falta cadastrar os 4 componentes ausentes e as 3 configurações ausentes, e **resolver o `326660` sem dupla contagem** — ver [MONTAGEM §5.3](../domains/MONTAGEM-MONTE-SEU-COLAR.md). Nada disso é decisão de negócio; é trabalho com conferência peça a peça |
| CAT-001 (parte de mídia/fotos) | Upload/tratamento de foto própria em produção | R2 não habilitado em nenhum ambiente de produção (achado independente desta branch — 158 de 160 peças fora da loja não têm imagem em lugar nenhum). `DR-003` confirmou: continua desligado |
| SAI-002 | **Reclassificação das 37 linhas de não-venda do histórico importado** (32 `uso_proprio`, 2 `brinde`, 3 `perda`) — regra e evidência já integradas ao conhecimento em 09/09/2026 | **`DR-016` fechou a classe** dos 2 casos duvidosos (`sorteio` e `perda`). O bloqueio restante é **técnico, não humano**: falta plano seguro de execução, e o ensaio **não exercitou a rota oficial** nem criou linhas em `saidas_sem_faturamento`, então o histórico operacional da saída continua sem prova (`P17`). A linha do sorteio ainda depende de `P11` |

---

## DECISIONS REQUIRED

Só o que exige escolha do Gustavo — nada que o sistema possa inferir.

**`DR-001` saiu desta lista em 11/09/2026.** Ela perguntava se a branch Claude
devia ser mesclada em `main`. A pergunta tinha uma premissa errada: o destino
não é `main`, é a **linha da V2**, que não vai para produção. Com esse destino,
integrar deixou de ser decisão de negócio e virou trabalho verificável — feito
em 9 lotes testados (ver `ARQ-005`), com a branch original preservada intacta
em `backup/claude-refactor-sistema-marquesa-20260911`. A parte que *era*
decisão sua — quando isso chega a produção — continua aberta, e agora tem nome
próprio: `DR-013`.

**Nenhuma decisão continua aguardando a Sthefany.** As quatro que estavam aqui
— `DR-005`, `DR-006`, `DR-015` e `DR-016` — fecharam em 11/09/2026 com as
respostas dela, e estão em `## DECISIONS MADE`. O que restou nesta lista são
duas escolhas do Gustavo que a auditoria encontrou sem dono, nenhuma delas
bloqueando trabalho em andamento.

| ID | Pergunta | Trava o quê |
|---|---|---|
| DR-017 | Preço de material **bruto** versus **banhado** (`P3`), e a conferência da faixa de comissão contra o contrato assinado — hoje a faixa é calculada só sobre as banhadas, com a Prata 925 a 10% à parte, e perto da fronteira isso vale R$ 295 num acerto | Fase 5 (preço) e o uso do valor do acerto para cobrar |
| DR-018 | A worktree `Marquesa-Kimi` (`kimi/ai-operations`, atrás da V2, sem trabalho recente) continua existindo? | nada em andamento; é higiene de repositório |

**O que a Sthefany respondeu, e o que isso NÃO autorizou.** As respostas
fecharam a **decisão**; nenhuma delas autorizou escrita. Continuam proibidos
sem plano próprio: mexer no saldo de `326660`, aplicar a migration do `sorteio`
(`P11`) e reclassificar as 37 linhas (`SAI-002`, `P17`).

**Perguntas humanas que continuam abertas em outro namespace.** Não são `DR-*` e
não entram na contagem acima, mas são de pessoa e não de código, então ficam
ditas em voz alta: `ETQ-Q001`, `ETQ-Q003`, `ETQ-Q004` e `ETQ-Q009`
(etiquetas), `VEN-Q012`, `VEN-Q017`, `VEN-Q018`, `VEN-Q022`, `VEN-Q027`,
`VEN-Q031` e `VEN-Q032` (vendas) e `DP-003` (onde vive o nome abreviado da
etiqueta) estão marcadas em `docs/ux/` como "Gustavo + Sthefany Marques".
Duas observações sobre elas, para quem for conduzir a próxima conversa:

- **`VEN-Q018` já tem resposta e o arquivo de UX não sabe.** Ela pergunta se a
  base Veneziana pode ser trocada durante a composição; a decisão de 10/09/2026
  diz que **a base não é escolha nesta versão**
  ([MONTAGEM §3.1](../domains/MONTAGEM-MONTE-SEU-COLAR.md)). `docs/ux/` é da
  frente do Codex e não foi editado daqui — a correção pertence a essa worktree.
- **`ETQ-Q002` ganhou insumo, mas não fechou.** A Sthefany confirmou que a única
  variação estruturada é o **aro do anel**, e que a etiqueta automática deveria
  identificar **SKU + variação**. Isso é direção de roadmap, registrado em
  [INVENTARIO-4-4.md §12](../domains/INVENTARIO-4-4.md); o modelo do dado do
  nome da etiqueta continua em aberto.

**O caso `326660` saiu de DR-005 em 11/09/2026.** Ele estava descrito ali como
"SKU preso numa maleta aberta". A verificação read-only em produção mostrou que
a premissa estava errada: nada está preso. Ver `## Achados de auditoria` abaixo.

---

## DECISIONS MADE

Decisões fechadas por Gustavo, com a data. Uma decisão só sai de
`DECISIONS REQUIRED` quando existe resposta — não quando cansa de esperar.
A regra em si mora em [PENDENTES.md](../decisions/PENDENTES.md); aqui fica o
efeito sobre as tarefas.

| ID | Decidido em | Resposta | Libera |
|---|---|---|---|
| DR-002 | 11/09/2026 | Cadastro de produto **continua em Estoque → Cadastro de Produtos**. Catálogo não ganha segundo fluxo; um futuro botão "Novo produto" ali apenas reutiliza o mesmo fluxo, sem duplicar regra, API ou backend | CAT-003 (fechada), CAT-005 |
| DR-003 | 11/09/2026 | R2 de **produção continua desligado**. Bucket de DEV separado é permitido quando o DEV estiver estruturado. Migração futura Nuvemshop → R2 é aditiva e não apaga nada da loja (`P9`) | direção de CAT-001 (mídia) |
| DR-004 | 11/09/2026 | `NUVEMSHOP_PUBLICACAO_ENABLED` **permanece desligada**; os 6 critérios cumulativos de ativação estão fechados (`P8`) | critério de NUV-002 |
| DR-007 | 11/09/2026 | **São dois assuntos, não um.** A migration de schema do `sorteio` (`P11`) e a reclassificação do histórico de não-vendas (`P17`) passam a ser auditadas e decididas separadamente. Nenhuma das duas executa agora | SAI-001, SAI-002 |
| DR-008 | 11/09/2026 | Preço-base oficial é **sempre** o do Sistema Marquesa. Cupom/promoção mudam o valor pago numa venda, não o preço cadastral (`P13`) | CAT-001, NUV-001 |
| DR-009 | 11/09/2026 | Mesclar categorias **não reescreve o passado**; a mesclagem é auditável (`P14`) | CAT-004 |
| DR-010 | 11/09/2026 | Arquivar despublica; **estoque zero não arquiva sozinho**. Arquivado não apaga nada e é reversível (`P15`) | CAT-001 |
| DR-011 | 11/09/2026 | Categorias internas e da Nuvemshop são **entidades distintas, mapeáveis**. Sem espelhamento 1:1 (`P16`) | NUV-001 |
| DR-012 | 11/09/2026 | Tela de gestão de categorias é **roadmap pós-validação**, não prioridade da reconstrução | despriorizada CAT-004 |
| DR-013 | 11/09/2026 | **Não há data de go-live.** A entrada em produção depende de gate de qualidade, não de calendário. PROD continua congelada | critério da escada `DEV` para cima |
| DR-014 | 11/09/2026 | **Sim, fora da ordem de fase.** `FIN-101`, `GAR-101` e `VEN-105` são paridade obrigatória antes de aposentar o legado, e têm prioridade sobre melhoria cosmética | FIN-001, GAR-001, VEN-002 |
| DR-005 | 11/09/2026 | **Sthefany:** saldos físicos **em casa** dos 6 componentes (`263236` 4 · `273470` 5 · `251551` 2 · `251552` 5 · `329494` 2 · `444032` 18), **sem** contar o que está com a Bruna. O exemplar de `326660` na maleta 12 é 1 × `329494` + 1 × `263236` + 1 × `444032` — **Menino Verde confirmado**. `326660` é identidade comercial, **não** peça física adicional (`S1`, `S2`, `S5`) | MON-001 — vira trabalho, não decisão |
| DR-006 | 11/09/2026 | **Sthefany:** `S1`–`S6` respondidas. Variação estruturada é **só o aro do anel**; cor e descritivos continuam texto manual na descrição. `S6`: ela normalmente **para a operação** durante o inventário, mas a arquitetura **continua suportando** movimentação com inventário pausado, para não limitar crescimento | INV-001 — resta só o técnico |
| DR-015 | 11/09/2026 | **Sthefany: a revendedora não vende com desconto.** Desconto que ela dá à cliente dela é negociação particular; para a Marquesa **o acerto é pelo preço cheio**, e essa também é a base da comissão. Desconto autorizado pela Marquesa é caso distinto e explícito, nunca implícito (`P2`) | REV-002, Fase 6 — ver `api/REGRAS.md` §45 |
| DR-016 | 11/09/2026 | **Sthefany, quanto à classe:** `Sorteio (Feira Franceschini)` **foi mesmo sorteio** → saída sem faturamento `tipo = sorteio`; `ACHO QUE FOI VENDIDO` → **`tipo = perda`**, diferença de inventário. Nenhum dos dois é venda. **A execução continua não autorizada** (`P17`) | classe de SAI-002; a execução segue bloqueada |

O gate de qualidade de `DR-013`, por extenso: fluxos principais concluídos;
testes em ambiente DEV seguro; dados representativos; aprovação visual do
Gustavo; validação operacional da Sthefany; ausência de divergência crítica
conhecida; migrations e release auditadas.

---

## WORKSTREAMS

O projeto deixou de ser um workstream único em 11/09/2026. Esta seção é a
**fonte de verdade** de quem está fazendo o quê, em qual worktree e em qual
branch. Antes dela, essa informação só existia na cabeça do Gustavo.

Regra de propriedade: **uma worktree tem um dono por vez.** Enquanto uma tarefa
está em andamento, ninguém mais escreve naquela worktree — nem para "só
terminar uma coisinha". Leitura cruzada é sempre permitida via `git show
<branch>:<arquivo>` a partir da própria worktree.

| Frente | Agente | Worktree | Branch |
|---|---|---|---|
| Frontend / UX V2 | **Codex** | `Marquesa-Etiquetas` | `codex/ui-system-marquesa` |
| Backend / domínios | **Claude Refactor** | `Marquesa-Claude-Refactor` | `claude/refactor-sistema-marquesa` |
| Arquitetura / auditoria / governança | **Claude Review** | `Marquesa-Claude-ReviewV2` | `claude/review-marquesa-v2` |
| Decisões de negócio e realidade física | **Sthefany** | — (não é worktree) | — |

A quarta linha não é um agente e não tem worktree: é a **fonte humana** de que
as outras três dependem, e ela aparece aqui porque "o que está esperando
resposta de pessoa" era justamente o que o painel não sabia dizer. A regra de
propriedade abaixo vale só para as três primeiras.

### Estado por frente (atualizado 11/09/2026, revisão da noite)

#### CODEX — frontend / UX V2

| | |
|---|---|
| Fase | redesign V2 das telas (sem numeração de fase de backend) |
| Item/subetapa | painel/tela atual em refinamento visual |
| Status | **EM ANDAMENTO** — trabalho visual local, Gustavo ainda refinando |
| Progresso | não quantificado — não considerar o frontend encerrado |
| Tarefa atual | concluir o trabalho visual da tela atual |
| Último concluído | 9 mockups de Vendas, protótipo mestre (`9bbf712`), taxonomia de docs |
| Próximo | concluir trabalho visual atual → aprovação do Gustavo → commit → revisão posterior |
| Bloqueios | nenhum técnico conhecido |
| Aguardando Gustavo | sim — aprovação visual |
| Aguardando Sthefany | não |
| Último commit conhecido | `52f5f5f` — idêntico à V2; sem SHA final novo conhecido, tratar como trabalho local/em andamento |

#### CLAUDE REFACTOR — backend / domínios

| | |
|---|---|
| Fase | Fase 4 — Estoque e Catálogo |
| Item/subetapa | 6/6 concluídas — último: 4.6 (Importações relacionadas) |
| Status | **COMPLETA** — Fase 4 fechada nesta branch |
| Progresso | 100% da fase |
| Gate | Fase 4 PASSOU |
| Tarefa atual | nenhuma em andamento |
| Último concluído | 4.6 — Importações relacionadas (`35fd51b` fix, `1bd0dd5` docs — auditoria vira registro canônico) |
| Próximo | Fase 5 — vendas, clientes, financeiro e garantias |
| Status da próxima fase | **AGUARDANDO ALINHAMENTO / NÃO INICIAR FASE 5 AINDA** |
| Bloqueios | alinhar backend com o avanço do redesign do Codex antes de começar a Fase 5 |
| Aguardando Gustavo | não |
| Aguardando Sthefany | **não** para iniciar — `DR-005` e `DR-006` fecharam em 11/09/2026. A Fase 5 ainda cruza perguntas de UX marcadas "Gustavo + Sthefany" (`VEN-Q*`), que são da frente do Codex e não travam o backend |
| Branch | `claude/refactor-sistema-marquesa` — protegida no remoto, upstream configurado; ponto inicial protegido `bfd5d6b` |
| Working tree | limpa |
| Integração | nada desta branch foi mesclado em `main` |
| Último commit conhecido | `1bd0dd5` |
| Pendência futura já identificada | Fase 7 deverá corrigir a exclusão de configuração montável no sync com Nuvemshop |
| Sequência macro | Fases 0–4: concluídas nesta branch · Fase 5: próxima (vendas, clientes, financeiro, garantias) · Fase 6: revendedoras/maletas/comissão · Fase 7: Nuvemshop/sync/reconciliação · Fase 8: analytics/projeções |

#### STHEFANY — decisões de negócio e realidade física

| | |
|---|---|
| Papel | fonte humana das regras de negócio e do que existe fisicamente |
| Status | **RESPOSTAS RECEBIDAS** (11/09/2026) |
| Pendências humanas | **nenhuma** — `DR-005`, `DR-006`, `DR-015` e `DR-016` fecharam |
| O que ela respondeu | saldos físicos **em casa** dos 6 componentes do Monte seu Colar · composição do Colar Casal consignado com a Bruna (Menino Verde confirmado) · variação estruturada é só o **aro do anel** · revendedora acerta pelo **preço cheio** · `Sorteio` é sorteio e `ACHO QUE FOI VENDIDO` é **perda** |
| O que isso **não** autorizou | nenhuma escrita de saldo, nenhuma migration, nenhuma reclassificação. Decisão fechada não é migração executada |
| Ainda com ela, em outro namespace | 11 perguntas de UX marcadas "Gustavo + Sthefany" (`ETQ-Q001` `ETQ-Q003` `ETQ-Q004` `ETQ-Q009` `VEN-Q012` `VEN-Q017` `VEN-Q018` `VEN-Q022` `VEN-Q027` `VEN-Q031` `VEN-Q032`) mais `DP-003`. São da frente do Codex e nenhuma trava backend |
| Próxima conversa | os dois casos de UX já respondidos sem que o arquivo saiba (`VEN-Q018`, insumo de `ETQ-Q002`), e as quantidades de `MON-001` na hora do cadastro real |

#### CLAUDE REVIEW — arquitetura / auditoria / governança

| | |
|---|---|
| Fase | não numerada — governança/auditoria corre em paralelo às fases numeradas do Refactor |
| Item/subetapa | consolidação das respostas finais da Sthefany nas fontes canônicas |
| Status | **respostas de negócio consolidadas** — o que resta na frente é técnico: integração, review e verificação. PROD continua congelada |
| Progresso | 15 decisões fechadas (11 em `DR-002`–`DR-014`, mais `DR-005`, `DR-006`, `DR-015`, `DR-016`); `P2` e a classe de `P17` fechadas; 2 decisões novas abertas para o Gustavo (`DR-017`, `DR-018`) |
| Tarefa atual | este commit — consolidação documental + painel |
| Último concluído | `DOC-005` — respostas da Sthefany integradas em `REGRAS.md`, `PENDENTES.md`, Master Plan e 3 documentos de domínio |
| Próximo | revisar os commits do Codex quando chegarem; planejar (sem executar) a transformação do saldo legado de `326660` e a execução de `SAI-002` |
| Bloqueios | nenhum |
| Aguardando Gustavo | não |
| Aguardando Sthefany | **não** — `DR-005`, `DR-006`, `DR-015` e `DR-016` fecharam em 11/09/2026 |
| Último commit conhecido | `510afa5` |

### Duas worktrees fora das três frentes oficiais

Achado de 11/09/2026: `git worktree list` devolve **cinco**, não três.

| Worktree | Branch | O que é |
|---|---|---|
| `Marquesa-Claude-NonRevenue` | `claude/nonrevenue-migration-prep` | Auditoria de `P17` (2.057 linhas). A **regra e a evidência já foram integradas** em 09/09/2026 por [SAIDAS-SEM-FATURAMENTO.md](../domains/SAIDAS-SEM-FATURAMENTO.md), que classificou artefato por artefato; os scripts ficaram **deliberadamente** no commit de origem. A branch é arquivo de evidência, não trabalho pendente |
| `Marquesa-Kimi` | `kimi/ai-operations` | Em `7c5f8d0`, **atrás** da V2; sem trabalho recente identificado |

Nenhuma das duas tem dono declarado. A `NonRevenue` está resolvida no
conteúdo — o que faltava era só ela ter **tarefa e pendência com nome**
(`SAI-002`, `P17`), o que este commit corrige. A `Kimi` precisa de decisão
sobre se continua existindo.

### Como o painel obtém estes dados — e o que ele ainda não vê

`scripts/build-project-dashboard.mjs` gera `dashboard/data.json` e
`dashboard/data.js` lendo:

| Fonte | O que extrai |
|---|---|
| `PROJECT-STATUS.md` | as 5 tabelas de estado (`DONE` … `DECISIONS REQUIRED`) |
| `LEGACY-PARITY-AUDIT.md` | a escada de paridade, 10 degraus |
| `WORKLOG-CLAUDE.md`, `WORKLOG-CODEX.md` | histórico por agente |
| `api/wrangler.toml` | nomes de banco/bucket e as flags reais dos 3 ambientes |
| `git log -25` | commits recentes |

O gate `projeto-painel` roda com `--check` nos níveis `fast` e `release`: o
painel publicado não pode divergir em silêncio dos documentos.

**Três limitações medidas, que impedem o painel de responder sozinho a
pergunta multi-frente:**

1. **`lerGit()` só enxerga a worktree onde o script rodou** (`cwd: raiz`). O
   painel mostra o `git log` de **uma** branch, nunca das cinco. É por isso que
   a `NonRevenue` era invisível.
2. **Não existe o conceito de agente separado.** Há dois worklogs, `CLAUDE` e
   `CODEX`, e as duas frentes Claude (Refactor e Review) caem no mesmo arquivo
   com o mesmo rótulo. A atribuição em `lerGit()` é heurística por prefixo de
   mensagem (`merge(v2)` → Claude, `docs(ux)` → Codex) e falha em silêncio.
3. **`lerAmbientes()` tem dado digitado à mão**, apesar do comentário do
   arquivo dizer "nenhum dado digitado aqui": as URLs de Worker e Pages, os
   textos de papel e deploy, e o `r2: 'não habilitado'` de produção são
   literais no script. Só `database_name`, `bucket_name`,
   `NUVEMSHOP_WRITES_ENABLED` e `PERSONALIZACAO_ATIVA` vêm mesmo do
   `wrangler.toml`. **É a única fonte duplicada encontrada** — se o R2 de
   produção for ligado, a tela continuará dizendo "não habilitado".

**Das três mudanças propostas, a primeira está implementada** (sessão de
11/09/2026, revisão da noite): o gerador agora lê esta seção como as outras
já eram lidas, produzindo `data.workstreams` — os cards de frente no painel
vêm daqui, não de texto digitado na tela. As outras duas continuam
pendentes, e o painel não finge o contrário:

- ~~ler esta seção como as outras já são lidas, produzindo `data.workstreams`~~
  — feito;
- rodar `git -C <worktree> log` por frente, em vez de um `git log` só, e usar
  `git worktree list --porcelain` para descobrir as worktrees em vez de
  listá-las à mão — **ainda não feito**: o painel só mostra o `git log` desta
  branch;
- mover as literais de `lerAmbientes()` para o `wrangler.toml` (ou para uma
  tabela daqui), eliminando a duplicação do item 3 — **ainda não feito**.

Enquanto os dois itens restantes não existirem, **esta seção `## WORKSTREAMS`
continua atualizada à mão** e é ela que vale para as três frentes.

---

## Achados de auditoria — 11/09/2026

Coisas que a verificação encontrou e que contradizem o que se acreditava.
Registradas aqui porque decisão tomada sobre premissa errada é pior que decisão
adiada.

**1. O SKU `326660` não está "preso". O vínculo é atual e correto.**
`DR-005` o descrevia como "preso numa maleta aberta". Lido do D1 de produção,
somente leitura:

| Fato | Valor |
|---|---|
| Maleta 12 | `aberta`, acerto agendado para **17/09/2026** |
| Revendedora | Bruna Follei (`rev_id` 4), `ativa` |
| Item | `maleta_itens`: `qtd` 1, `preco_envio` 129, `devolvida` 0 |
| Movimentos | `entrada` 1 (importação, 21/08) e `consignacao` 0 (maleta 12, 21/08) |
| Razão | `produtos.qtd` 1 = `SUM(movimentos.qtd)` 1 — fecha |

Não há venda, devolução nem variação pendente. O `qtd 1` do catálogo **é** a
peça consignada: consignação tem efeito zero no total porque a peça mudou de
lugar, não de dono. Nada a corrigir — e a pergunta à Sthefany mudou de "por que
este SKU está preso" para "confirme que a peça está fisicamente com a Bruna,
já que o acerto é dia 17".

**Confirmado por ela em 11/09/2026, com a composição junto:** o exemplar é
1 × `329494` Menino Verde + 1 × `263236` Menina Rosa + 1 × `444032` Veneziana
45cm com extensor. O Menino Verde era a parte que faltava. Isso transforma o
achado numa medição nova e mais incômoda: os saldos que ela informou são
**estoque em casa**, e o `qtd 5` cadastrado de `263236` parece já incluir a
peça que está com a Bruna — o que significaria a mesma Menina Rosa contada
duas vezes, uma em `263236` e outra dentro de `326660`. É **inferência, não
prova**, e é por isso que nenhum saldo foi escrito. A medição está em
[MONTAGEM §5.3](../domains/MONTAGEM-MONTE-SEU-COLAR.md).

**2. `FIN-101` e `GAR-101` não têm design novo no repositório.** A sessão de
decisões partiu de que "Contas a Receber e Garantias já possuem novos designs".
Não commitados em branch nenhuma visível: `docs/ux/03-screens/` não tem pasta
de financeiro/contas a receber, e `reparos/` declara-se **domínio novo** com
material `vazio` e 0 referências — não é `GAR-101` (registrar garantia, troca,
status), que a auditoria de paridade marca `LEGACY ONLY` / "não mapeado". O
único arquivo com "a receber" no nome é um screenshot do **painel legado**
(`docs/releases/baselines/pacote2-2026-09-07/`). Se os designs existem, estão
fora do Git — e `DR-014` os torna paridade obrigatória, então onde eles moram
passa a importar.

**3. O DEV não serve como referência de estado.** Produção tem **41** tabelas;
o DEV tem **29**. Faltam no DEV, entre outras, `garantias`,
`historico_reclassificacao`, `saidas_sem_faturamento`, `maleta_item_variacoes`
e `venda_item_correcoes`. Isso é evidência independente a favor da decisão de
`DR-003` de dar ao DEV uma cópia controlada de produção: hoje um teste feito lá
não prova nada sobre cá.

**4. Grafia do nome.** Este repositório escreve **`Sthefany`**, e é também como
o cadastro aparece em produção (cliente #64, `Sthefany Marques`). A sessão de
decisões escreveu "Stephanie". Não é preciosismo ortográfico: existem nove
clientes legítimas com sobrenome Marques, somando R$ 3.989,51, e um filtro por
nome em vez de `cliente_id` as pegaria junto. A documentação segue com
`Sthefany`.

---

## Contagem

DONE: 10 · IN PROGRESS: 15 · NEXT: 9 · BLOCKED: 4 · DECISIONS REQUIRED: 2

As decisões pendentes caíram de 13 para 4 e depois para **2**, no mesmo dia.
Quinze fecharam (`DR-002`–`DR-016`), sendo as quatro últimas — `DR-005`,
`DR-006`, `DR-015` e `DR-016` — pelas respostas da Sthefany. **Nenhuma decisão
aguarda mais a Sthefany.** As duas que restam são do Gustavo e nasceram da
auditoria (`DR-017`, `DR-018`); nenhuma bloqueia trabalho em andamento. As
fechadas estão em `## DECISIONS MADE` — não desapareceram.

`BLOCKED` continua em 4 de propósito: `SAI-002` e `MON-001` deixaram de ter
bloqueio **humano**, e passaram a ter bloqueio **técnico**. Decisão fechada não
é migração executada.

Contagem gerada por `scripts/build-project-dashboard.mjs` a partir das
tabelas acima — não a edite à mão. O painel visual
([dashboard/](dashboard/index.html)) lê exatamente estes mesmos números.

## Relação com os outros documentos

- **Master Plan** (`docs/architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md`)
  é o plano estrutural. Este painel não o substitui nem duplica as fases —
  só diz o estado corrente de pedaços dele.
- **[LEGACY-PARITY-AUDIT.md](LEGACY-PARITY-AUDIT.md)** é a evidência por trás
  das colunas de Estoque/Vendas/Catálogo/etc. acima — cada tarefa aqui tem
  linhas correspondentes lá.
- **[WORKLOG-CLAUDE.md](WORKLOG-CLAUDE.md)** e **[WORKLOG-CODEX.md](WORKLOG-CODEX.md)**
  são o histórico de execução — quem fez o quê, quando, em que commit.
- Protocolo de atualização permanente: ver rodapé de qualquer um dos worklogs.
