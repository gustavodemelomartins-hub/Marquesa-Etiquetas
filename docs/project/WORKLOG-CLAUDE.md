# Worklog — Claude

Histórico de execução do Claude no Sistema Marquesa. Isto é registro do que
aconteceu, não um roadmap — o roadmap único é o
[Master Plan](../architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md); o
estado corrente de cada tarefa é o
[PROJECT-STATUS.md](PROJECT-STATUS.md).

**Nota sobre atribuição:** todo commit deste repositório é assinado pelo
mesmo usuário Git (`gustavodemelomartins-hub`), então o autor da ferramenta
não aparece no `git log` diretamente. A atribuição abaixo usa dois sinais
verificáveis: (1) o prefixo do nome da branch (`claude/...` neste
repositório é convenção estabelecida para sessão Claude — confirmado
contra dezenas de branches existentes) e (2) commits desta própria
conversa, que sei de primeira mão serem meus. Commits feitos direto em
`main` sem prefixo de branch **não têm esse sinal** e ficam marcados como
"origem não identificada por branch" em vez de adivinhados.

---

## 2026-09-11 (noite) — Consolidação das decisões e das frentes paralelas

| | |
|---|---|
| Branch | `claude/review-marquesa-v2` |
| Commits | 1, documental |
| Status | **concluído**; nada implantado, nada escrito em produção |

**Task IDs tocados:** `DOC-004`, `CAT-003`, `SAI-001`, `SAI-002`, `CAT-002`,
`CAT-004`, `CAT-005`, `GAR-001`, `FIN-001`, `VEN-002`, `CAT-001`.

**O que foi feito.** Onze decisões de Gustavo foram confrontadas com o
repositório antes de virarem documento, e depois registradas: `DR-002`
(cadastro fica em Estoque), `DR-003` (R2 de produção segue desligado),
`DR-004` (publicação segue desligada, critério fechado), `DR-007` (separa
schema de histórico), `DR-008` (preço cadastral × transacional), `DR-009`
(mesclagem não reescreve o passado), `DR-010` (estoque zero não arquiva),
`DR-011` (categorias mapeáveis), `DR-012`, `DR-013` (go-live por gate, não por
data) e `DR-014` (paridade crítica fora da ordem de fase). No
`PENDENTES.md`, dez pendências fecharam e `P17` nasceu, separada de `P11`.

Três `DR` novas abriram porque a conversa as revelou: `DR-015` (comissão sobre
desconto, `P2`), `DR-016` (autorizar a reclassificação, `P17`) e a consolidação
de `DR-005`+`DR-006` numa pergunta só para a Sthefany.

**Verificações read-only feitas** (nenhuma escrita, em nenhum ambiente):

| O que | Resultado |
|---|---|
| `P1` — cron | `crons = []` nos dois ambientes desde `69986ef` (22/08); **10 deploys posteriores**, o último em 09/09. Desarmado, sem divergência doc × código |
| `saidas_sem_faturamento` em produção | `CHECK` com **3** tipos, não 4; 0 linhas. `api/schema.sql` já tem 4 — outra face de `ARQ-007` |
| `P12` — custo | **zero ocorrências** de custo em `api/schema.sql`; terreno limpo, não correção |
| SKU `326660` | maleta 12 `aberta`, Bruna Follei, acerto 17/09, razão fechando. **Não está "preso"** |
| Razão contábil | `SUM(produtos.qtd)` = `SUM(movimentos.qtd)` = 1.487 |

**Duas correções de rumo durante o próprio trabalho**, ambas por confrontar o
repositório antes de escrever: (1) eu ia registrar a branch
`claude/nonrevenue-migration-prep` como "trabalho valioso esquecido" — ela já
tinha sido auditada e classificada artefato por artefato em 09/09, e os scripts
ficaram fora **de propósito**; (2) eu ia descrever o ensaio de `P17` como
"validado em 14 critérios" sem dizer que ele não exercitou a rota oficial nem
criou linha em `saidas_sem_faturamento`.

**Achados que contradizem premissas** — registrados em
`PROJECT-STATUS.md § Achados de auditoria`: o `326660` não está preso;
`FIN-101` e `GAR-101` **não têm design novo no Git** (`reparos/` é domínio novo
com material `vazio`); o DEV tem 29 tabelas contra 41 de produção; e a grafia
em produção é `Sthefany`, não "Stephanie" — distinção que importa porque nove
clientes legítimas com sobrenome Marques somam R$ 3.989,51.

**Novo:** `docs/architecture/CUSTO-HISTORICO-AUDITAVEL.md`, desenho proposto
para `P12` — custo como série temporal de eventos, migration aditiva, sem
tocar `movimentos`. Proposta, não autorização.

**Governança:** `PROJECT-STATUS.md` ganhou `## WORKSTREAMS`, a primeira fonte
única das frentes paralelas, com a auditoria de como o painel obtém dados e as
três limitações que o impedem de enxergar mais de uma worktree. Nada da
interface do painel foi alterado.

---

## 2026-09-10 — Refatoração estrutural Fases 0–4.5 (backend)

| | |
|---|---|
| Branch | `claude/refactor-sistema-marquesa` |
| Commits | 75 sobre `ae81c5b`, de `6d6c58b` a `bfd5d6b` (log completo: `git log ae81c5b..claude/refactor-sistema-marquesa`). **Corrigido em 11/09 (tarde):** esta linha dizia 85; os 10 a mais eram os 4 commits de `main` fora do remoto, contados junto |
| Status | **MESCLADO NA V2 EM 11/09/2026 (tarde)**, ainda não implantado. Quando esta entrada foi escrita a branch só existia neste disco; hoje está preservada em `backup/claude-refactor-sistema-marquesa-20260911` e integrada em 9 lotes — ver a entrada de 11/09 (tarde) |

**Task IDs tocados:** `ARQ-001`, `ARQ-002`, `ARQ-003`, `CAT-001`, `CAT-111`
a `CAT-115`, `INV-001`, `INV-105`-`107`, `MON-001`, `MON-101`.

**O que foi feito** (agrupado por tema, não commit a commit):

1. **Fase 2 — shell HTTP** (`3204210`…`409ef78`): os 142 contratos HTTP do
   monólito `index.js` foram inventariados (`api-contracts.json`) e movidos
   um a um para uma tabela de rotas (`api/src/http/routes/`), preservando
   método, path, status e efeito. Gate: `scripts/api-contracts.test.mjs`
   reprova qualquer mudança de contrato.
2. **Fase 3 — plataforma** (`28cd460`…`91aa4ab`): erro/log, config tipada
   fail-closed, helpers D1 mínimos, adapters de loja/mídia lendo config,
   correlação de execução em log.
3. **SKU** (`706bc0c`, `fadd06a`, `ca23f4e`): auditoria das 8 normalizações
   de SKU espalhadas pelo backend, unificadas numa só; auditoria (sem
   mudança de comportamento) do sufixo de compra.
4. **Monte seu Colar** (`2490502`…`d9e5196`): 11 SKUs confirmados pela
   Sthefany (6 componentes + 5 configurações), tabela `personalizacao_slots`
   nova, ~20 garantias testadas, feature atrás de `PERSONALIZACAO_ATIVA`.
5. **Inventário 4.4** (`67b5a09`…`0fddd91`, docs `a7afa4b`/`028edcf`/`97befa1`/`b195a32`):
   contagem pausável e tri-estado, 5 rotas com comportamento mudado + 7
   novas, migration com rollback, 22+9 testes.
6. **Catálogo/Publicação 4.5** (`6bbf654`…`d1637e6`): categoria com
   identidade própria, galeria/mídia multi-foto, tarefa de preparação
   desacoplada de executor, writer de publicação com estados
   `publicando`/`publicado`/`falhou_ao_publicar`/`despublicado`, 19 testes
   de schema. `CONTRATO-UX-API-4-5.md` escrito por último, depois do
   código, como espelho fiel do que foi construído.
7. **Auditoria pré-implementação** (`0a43f00`): identificou 7 bugs/riscos
   (R1–R7) e 9 itens de dívida técnica antes de qualquer linha de código —
   inclusive o achado de que R2 nunca foi habilitado em produção.

**Validações executadas:** `scripts/api-contracts.test.mjs`,
`scripts/phase0-artifacts.test.mjs`, `src/inventario-4-4-test.mjs` (22
cenários contra `api/schema.sql` real, migration aplicada 2x pra provar
idempotência), `scripts/inventario-tri-estado.test.mjs`,
`src/montagem-*-test.mjs` (saldo/venda/integração/estorno),
`scripts/montagem-dupla-contagem.test.mjs`, `scripts/razao-estoque.test.mjs`,
`scripts/sku-normalizacao.test.mjs`.

**Resultado:** todas as suítes citadas passaram contra schema real em
SQLite local. Nenhuma migration foi aplicada em produção. Nenhum deploy.

**Pendências:**
- decisão de merge da branch inteira em `main` (`DR-001`);
- 6 perguntas de negócio do Inventário (S1–S6) sobre saldo físico real de
  SKUs específicos;
- 7 dos 11 SKUs de Monte seu Colar sem saldo cadastrado em produção;
- R2 desabilitado trava a mídia/publicação independente do merge;
- `src/pacote2-test.mjs` e o cenário N/O de `src/pos-golive-1-test.mjs`
  foram reescritos mas não executados nesta sessão (exigem `wrangler dev`).

**Próximo passo:** decisão humana sobre merge; se aprovado, rodar os dois
testes pendentes contra Worker real antes de considerar Fase 2/3 fechadas.

---

## 2026-09-11 — Fase 4.5 no Master Plan e lacuna de cadastro de produto

| | |
|---|---|
| Branch | `codex/ui-system-marquesa` |
| Commit | `ef6f130` |
| Status | **DONE** para o escopo desta tarefa (documentar, não resolver) |

**Task ID:** `DOC-001`, `CAT-002`, `CAT-003` (registrada como pendência).

**O que foi feito:** lido o Master Plan inteiro, cruzado com git log de
todas as branches, lido `docs/ux/03-screens/catalogo/` e
`docs/ux/05-flows/catalogo-*.md` (conteúdo preenchido antes desta sessão,
autor não identificado com certeza — ver `WORKLOG-CODEX.md`). Confirmado
por grep em `api/src/*` (ambas as branches) que não existe rota
`POST /api/produtos` de criação — o cadastro manual do legado reaproveita
o endpoint de "peça nova" da importação. Adicionadas ao Master Plan: tabela
de progresso desde o baseline (§2), subseção de Fase 4.4/4.5 com a lacuna
de cadastro documentada por extenso (§30), nota de taxonomia de
documentação (§16), duas linhas novas em decisões pendentes (§50).

**Validações executadas:** nenhuma mudança de código — só leitura e
documentação. Confirmado que a edição é só-adição (`git diff --stat`: +80/-2).

**Resultado:** Master Plan alinhado com o estado real; nenhuma decisão
antiga apagada; nenhuma fase renumerada; nenhuma "Fase 4.5A/B" inventada.

**Pendências:** decisão `DR-002` (cadastro ganha rota própria ou continua
no fluxo de importação).

**Próximo passo:** esta auditoria estrutural completa (ver entrada abaixo).

---

## 2026-09-11 — Auditoria estrutural completa e sistema de acompanhamento

| | |
|---|---|
| Branch | `codex/ui-system-marquesa` |
| Commits | ver lista no fim desta entrada (feita em várias partes — docs/ux, docs/ui, .codex, Master Plan, docs/project) |
| Status | **DONE** para o escopo "criar o sistema"; as lacunas que ele revela continuam abertas |

**Task ID:** `DOC-002`.

**O que foi feito:**
1. Auditado git completo: branches locais e remotas (`git for-each-ref`),
   commits recentes de todas as branches relevantes, `git status` completo,
   stashes existentes (2, ambos na `develop`, preservados sem tocar).
2. Confirmado que `origin/main` está 1 commit atrás de `main` local
   (`ae81c5b` não empurrado) — não mexido, só registrado.
3. Identificada a branch `claude/refactor-sistema-marquesa` (85 commits,
   local apenas) como o maior corpo de trabalho não reconciliado do
   projeto — auditada via `git show branch:caminho` sem checkout, sem
   alterar a working tree.
4. Delegados 3 levantamentos de leitura em paralelo (subagentes,
   somente-leitura): inventário exaustivo de `src/dashboard.tpl.html`
   (todas as abas, botões, formulários, rotas chamadas), inventário de
   `frontend/src/` (maturidade por feature, testes existentes), e extração
   de fatos dos 4 documentos de domínio da branch paralela (Inventário 4.4,
   Monte seu Colar, auditoria 4.5, baseline de rotas).
5. Escritos `PROJECT-STATUS.md`, `LEGACY-PARITY-AUDIT.md` e este worklog +
   `WORKLOG-CODEX.md`.
6. Identificado `.codex/` (espelho de governança do Codex — 4 agentes + 2
   hooks) como trabalho local não commitado, íntegro, sem segredo,
   funcionalmente espelhando `.claude/` como o `CLAUDE.md` do projeto
   determina. Preservado via commit, sem alterar conteúdo.
7. Identificado que `docs/ux/**` (36 arquivos) e `docs/ui/**` (6 arquivos +
   imagens) estavam com conteúdo real não commitado desde antes desta
   sessão. Nenhum conteúdo foi alterado ou reformatado — só adicionado ao
   Git como está.

**Validações executadas:** leitura completa dos 3 relatórios dos
subagentes; conferência cruzada de datas/commits entre `git log` e o
conteúdo dos documentos de domínio; nenhuma suíte de teste rodada (esta
tarefa é documental, sem mudança de código).

**Resultado:** ver relatório final desta conversa para a síntese completa
(contagens de DONE/IN PROGRESS/NEXT/BLOCKED, lacunas por criticidade,
decisões pendentes).

**Pendências:** todas as `DECISIONS REQUIRED` do `PROJECT-STATUS.md` — a
mais estrutural é `DR-001` (merge de `claude/refactor-sistema-marquesa`).

**Próximo passo:** nenhuma implementação de lacuna nesta sessão, por
instrução explícita. Próxima conversa decide o que priorizar a partir do
`PROJECT-STATUS.md`.

**Commits desta entrada:** ver `git log --oneline -8` a partir da data
acima na branch `codex/ui-system-marquesa` — cada um nomeado por conteúdo
(docs/ux, docs/ui, .codex, docs/project) para permitir reverter uma parte
sem reverter as outras.

---

## 2026-09-11 (tarde) — Reconciliação da branch Claude com a V2, e o painel do projeto

| | |
|---|---|
| Branch | `codex/ui-system-marquesa` (a linha da V2) |
| Commits | 9 merges de lote (`B1`–`B9`) + commits de documentação; base `ae81c5b` |
| Status | **DONE** para integrar, testar e documentar. **NÃO implantado no Worker do DEV** — isso é botão manual, ver abaixo |

**Task IDs tocados:** `ARQ-001`, `ARQ-002`, `ARQ-003`, `ARQ-005`, `ARQ-006`,
`ARQ-007`, `ARQ-008`, `CAT-001`, `INV-001`, `MON-001`, `DOC-003`, `DR-001`,
`DR-013`, `DR-014`.

### O que estava errado no retrato anterior

A entrada de 10/09 dizia "85 commits". O número real é **75** commits sobre a
base `ae81c5b`; os outros 10 eram os 4 commits de `main` que ainda não tinham
ido ao remoto, contados duas vezes, mais arredondamento. O `DR-001` também
perguntava se mesclar em `main` — premissa errada, porque o destino da V2 não
é produção.

E o achado que mudou o plano: **a branch da V2 não tinha nenhum código.** Os
8 commits de `codex/ui-system-marquesa` mexiam só em `docs/ux`, `docs/ui`,
`docs/project` e `.codex/`. A interseção de arquivos entre os dois lados era
**zero**. O que parecia um merge de risco era, no nível de arquivo, ortogonal.

### Preservar antes de integrar

Três branches não existiam em nenhum remoto — inclusive a de 79 commits. Dez
refs `backup/*` foram empurradas antes de qualquer merge: as três branches sem
upstream, `main` local, as três à frente do upstream, os dois stashes e a V2
já integrada. Nenhum merge em `main`, nenhum force, nenhum deploy.

### Os 9 lotes

Como a história da branch é linear, cada lote foi um `git merge --no-ff` na
ponta do grupo, testado antes do lote seguinte — integração incremental sem
reescrever SHA nenhum.

| Lote | Domínio | Prova que rodou |
|---|---|---|
| B1 | taxonomia de `docs/` | `docs-links` (falhou de propósito, ver abaixo) |
| B2 | Fase 1 — os 142 contratos congelados | 142 preservados |
| B3 | Fase 2 — rotas de leitura | roteador: ordem, método, parâmetro, fallback |
| B4 | Fase 2 — escrita, 142/142 na tabela | 142 rotas, 31 com id restrito a dígitos |
| B5 | Fase 3 — plataforma | erros, config, D1 helpers, correlação: 4 verdes |
| B6 | SKU, razão contábil, rodada seca | uma definição de SKU em 61 módulos; um dono de `produtos.qtd` |
| B7 | Monte seu Colar | saldo, estorno, venda, dupla contagem: 4 verdes |
| B8 | Inventário 4.4 | 22 provas + 9 travas, razão fechando |
| B9 | Catálogo 4.5 | 26 provas; contratos passam a 173 |

**O lote B1 quebrou o gate de links de propósito, e isso foi informação.** As
23 referências quebradas eram docs do Codex apontando para arquivos que só
chegavam nos lotes seguintes — prova objetiva de que a UX do Codex foi escrita
antecipando o backend do Claude. Sobraram 3 quebras reais, corrigidas à mão.

### Resultado

Suíte local inteira: **14/14 gates no nível `release`** (antes da integração o
que existia eram 5). Frontend: 190 testes em 16 arquivos. `python src/build.py`
regerou `dashboard.html` **byte a byte idêntico** ao commitado.

Não rodou aqui, e isso não é regressão: `pacote1-shell-test`, `dry-run-test` e
`e2e.mjs` são tier integration/browser e exigem Worker local em `:8787` e
servidor em `:8000`.

### Paridade

Nenhum degrau da escada subiu por causa de merge — estar mesclado não é ter
tela. O que mudou foi a evidência: onde a matriz dizia "branch paralela",
agora diz "mesclado na V2". A contagem passou a ser gerada por máquina, com a
regra do **menor degrau** (uma funcionalidade não está mais adiante que o seu
pedaço mais atrasado), o que corrigiu a contagem manual anterior que inflava
`TESTED`.

**Achado novo:** existem **12** outras funcionalidades no mesmo estado do
cadastro de produto — legado funcionando, backend pronto, e nem UX nem tela
nova. Três mexem com dinheiro ou compromisso com cliente (`FIN-101`,
`GAR-101`, `VEN-105`) e viraram a decisão `DR-014`.

### Painel do projeto

`docs/project/dashboard/` é gerado de `docs/project/*.md`, de
`api/wrangler.toml` e do `git log` — nenhum dado digitado. O gate
`projeto-painel` roda `--check` e falha se a tela divergir dos documentos, o
que impede a segunda fonte de verdade que o `PROJECT-STATUS.md` proíbe. Ele
sobe junto com o DEV, em `/projeto/`.

### O deploy do DEV falhou na primeira tentativa, e o que isso revelou

O push em `develop` disparou o workflow, que **falhou** no passo
`node src/migracao-variantes-test.mjs`. Frontend e build passaram; a quebra foi
a coerência entre `api/schema.sql` e as migrations. Regressão minha: a
refatoração consolidou o schema inteiro, e a lista de migrations daquele teste
tinha **8 arquivos dos 33** do repositório — o schema cresceu, a lista não.

A causa de eu não ter pego antes: esse teste só existia no CI do DEV, fora da
suíte local. Por isso 15/15 aqui e falha lá. Agora ele é o gate
`schema-migration-coerencia`, no nível `fast` (`ARQ-008`).

Consertar exigiu descobrir uma ordem de aplicação válida para as 30 migrations
(as 3 de rollback ficam de fora). Duas dependências reais ficaram codificadas
em comentário no arquivo, porque quebram em silêncio se alguém reordenar:
`montagem-slots` precisa de `personalizacao_modelos`, que quem cria é
`pos-golive-1`; e `inventario-4-4` precisa vir depois de
`sorteio-saida-sem-faturamento`, senão o `idx_saida_inventario_unica` se perde.

Duas asserções também estavam erradas por proxy: cobravam que a contagem de
produtos não mudasse para provar que "nada se perdeu". Mas
`migracao-pacote-2.sql` **semeia** legitimamente o SKU de recibo `MONTE-COLAR`
(qtd 0, inativo). Passaram a cobrar a invariante de verdade — o produto
anterior continua lá, a contagem nunca diminui, e o único acréscimo é o
nomeado.

**Achado que veio de brinde (`ARQ-007`):** com as 30 migrations no teste,
apareceu uma divergência **anterior a esta sessão**.
`migracao-pos-golive-1.sql` cria `maleta_item_variacoes`,
`venda_item_correcoes` e 5 índices que nunca foram escritos de volta no
`schema.sql`. Um banco criado do zero não os tem; um banco migrado — que é o
caso de PROD e do DEV — tem. Não escondi com um `skip`: o teste subtrai essa
lista **nomeada**, confere que cada exceção está mesmo onde a lista diz, e
falha se ela mudar. Fechar de verdade mexe em `schema.sql`, o que tem gate
próprio e não se faz de passagem.

### PROD

Intocada, por construção e não por cuidado: não existe workflow de deploy de
produção neste repositório. Os dois que existem publicam no DEV — um no Pages
a cada push em `develop`, outro só por botão com confirmação digitada.
`marquesa-api`, `marquesa-db-prod` e os secrets de produção não foram lidos
nem escritos em momento nenhum desta sessão.

---

## Protocolo permanente Claude/Codex

Toda vez que Claude realizar trabalho significativo neste projeto:

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

Uma tarefa some da lista de pendências de uma conversa de IA só quando
está aqui, com data, commit e resultado. O que não está commitado não
existe pra próxima sessão.

---

## 2026-09-14 — Fase 5.3d: o contrato de leitura do FIN-101

**Task IDs tocados:** `FIN-101` (subfase 5.3d), `B9`.

`GET /api/vendas/lista` passou a devolver o resumo financeiro **da venda** em
centavos inteiros — `valorVenda`, `valorRecebido`, `valorAReceber`,
`statusPagamento` — aninhado em `financeiro`, com `escopo: "venda"`. A rota
devolve itens: a mesma venda aparece em várias linhas, e quatro chaves soltas
convidariam a somar a coluna e obter o total multiplicado pelas peças.

**O que a leitura se recusa a fazer.** `pago = 1` sem `valor_recebido`
registrado devolve `valorRecebido: null` com a lacuna nomeada, e não
`valorRecebido = valorVenda`: inventar isso seria reproduzir, na leitura, a
contradição que B4 achou no banco. Saldo negativo aparece com `sobra: true` em
vez de virar zero (B6). O status operacional é derivado de forma conservadora —
sem recebimento conhecido, `nao_paga`, nunca `parcial`.

`GET /api/contas-receber?status=paga` parou de devolver a metade histórica com
forma de resposta completa: ganhou `cobertura`, que declara fonte por fonte e
diz por que não é completa. O chamador existente não quebrou.

**B9 fechado.** `PATCH /api/contas-receber/:id/vencimento` (zero call sites) e
`POST /api/contas-receber/:id/marcar-paga` (duplicata de `/receber` com
`chave: historico:<id>`, que delega para a mesma função) saíram. Os quatro
chamadores foram migrados no mesmo commit; as funções continuam vivas. O
inventário de contratos registra a aposentadoria com motivo, como ele mesmo
exige.

**Validação:** suíte nova `src/fin-101-5-3d-test.mjs`, 10 provas, registrada em
`docs/testing/test-suites.json` no mesmo commit. Regressão local verde em
`vendas-lista`, `vendas-reconstrucao`, `venda-item-id`, `garantia-venda-item`,
`garantias-ciclo`, `fin-101-5-3a/b/c`, `reclassificacao-nao-venda`,
`estoque-razao`, `phase0-artifacts`, `api-contracts`, `docs-links` e
`governance-versioned`.

**Limites:** nenhuma coluna virou centavos no banco (é 5.7); o `Math.max(0, …)`
dentro de `contas-receber.js` continua onde estava; 5.3e/5.3f/5.7/5.8 não foram
tocadas; nenhum escritor mudou; sem migration, sem DEV, sem PROD, sem deploy,
sem push.

---

## 2026-09-14 — Fase 5.3e: a razão de crédito da cliente

**Task IDs tocados:** `FIN-101` (subfase 5.3e).

A regra é de 12/09/2026 e não tinha onde morar: troca com peça nova mais
barata vira crédito da cliente, e o sistema registrava e parava. Agora existe
`credito_movimentos` — razão por eventos, mesma forma de `movimentos`, saldo
por `SUM` e nunca coluna. `clientes.saldo_credito` segue descartado.

As quatro decisões da Sthefany viraram trava: sem coluna de validade (não
expira), `cliente_id NOT NULL` com recusa nomeada em vez de crédito anônimo,
saldo derivado, e legado sem cliente confiável continua em `pendente_regra`.
Os dois estados dizem coisas diferentes e os dois continuam existindo:
`pendente_regra` é diferença negativa SEM crédito lançado; `credito_emitido` é
COM linha na razão.

**Não estava no plano e apareceu ao ligar as pontas:** estornar uma troca que
emitiu crédito precisa estornar o crédito. Sem isso a cliente ficaria com saldo
de uma compra que não aconteceu, e como o saldo é derivado o furo apareceria
como dinheiro. Contrapartida, nunca DELETE (§28).

Três rotas novas: `GET /api/clientes/:id/credito` (saldo + extrato),
`GET /api/credito/conferir` (a invariante `SUM >= 0`, irmã de
`/api/estoque/conferir`) e `POST /api/credito/ajuste` (motivo obrigatório,
recusa saldo negativo na escrita).

**Migration `api/migracao-credito-cliente.sql`.** Parte 1 aditiva. Parte 2
RECONSTRÓI `garantia_trocas` porque SQLite não altera CHECK — destrutiva no
schema, mesmo caminho da migration de sorteio. **Escrita e provada localmente;
não foi aplicada em ambiente nenhum.** Aplicar em DEV ou PROD exige backup,
Time Travel e aprovação do Gustavo.

**Validação:** suíte nova `src/credito-ledger-test.mjs` (19 provas), registrada
em `docs/testing/test-suites.json` no mesmo commit. `garantias-ciclo` foi para
129 provas, com duas novas de ponta a ponta — a troca negativa emitindo e o
estorno devolvendo. `migracao-variantes-test` ganhou a comparação de DDL entre
os dois caminhos (o CHECK escapava da conferência) e uma troca plantada na
véspera, conferida campo a campo depois da reconstrução. Regressão local verde:
28 suítes de `domain-pure`, 9 gates `fast`, `inventario-4-4`, `catalogo-4-5`,
painel do projeto e build do legado.

**Limites:** consumo de crédito não existe (é 5.8, e a tela é do Codex);
nenhum crédito foi criado para o legado; `contasAReceber` não foi tocada;
nenhuma coluna virou centavos (é 5.7); sem migration aplicada, sem DEV, sem
PROD, sem deploy, sem push.

---

## 2026-09-14 — Fase 5.3f: a rede, e a razão contábil do dinheiro

**Task IDs tocados:** `FIN-101` (subfase 5.3f). **Fase 5.3 fechada.**

Dos dez gaps de teste de §9, sete já tinham caído nas subfases anteriores.
Documentei ONDE cada um mora antes de escrever qualquer coisa — sem isso o
próximo a passar por aqui reescreve o mesmo teste com outro nome. Sobraram G7,
G9 e G10.

**G7 — arredondamento.** Dinheiro ainda é REAL, e `0.1 + 0.2 !== 0.3`. Hoje o
risco é contido porque `pago` é escrito, não comparado; ele nasce em 5.8,
quando `PAGO` virar `SUM >= total`. A rede foi escrita antes: 137 contas de um
centavo somando 137 centavos, resumo batendo com a soma das linhas, e a
tolerância de um centavo provada nos dois sentidos — a conferência não acusa
`0.1 + 0.2` de pagamento incompleto, porque régua que grita à toa é desligada.

**G9 — a conta sem dona.** Venda `cliente_ambiguo = 1` continua na lista e no
total, marcada, com o nome visível e **sem vínculo**: oferecer navegação seria
escolher entre homônimas pela porta da tela.

**G10 — `GET /api/financeiro/conferir`.** O gap estrutural: estoque tinha razão
contábil verificável, recebíveis não tinham nada. Seis verificações, cada uma
nascida de um defeito real desta auditoria (B4, B6, §28/B5, 5.3b, §29, 5.3e),
cada uma carregando a origem na resposta. Ela **mede e não conserta** — e isso
tem teste: consertar exige decidir quem pagou quanto e quando, e nenhum script
decide isso sem inventar dinheiro. Todas as verificações voltam, inclusive as
limpas: "nada apareceu" tem de ser distinguível de "nada foi olhado".

**Validação:** suíte nova `src/fin-101-5-3f-test.mjs` (15 provas), registrada no
mesmo commit. Regressão local verde nas 30 suítes de `domain-pure`, nos gates
`fast`, `inventario-4-4`, `catalogo-4-5`, painel e build do legado.

**Limites:** nada foi consertado — os defeitos que a conferência encontra
continuam lá, agora visíveis; o `Math.max(0, …)` de `contas-receber.js`
permanece; 5.7 e 5.8 não foram tocadas; sem migration, sem DEV, sem PROD, sem
deploy, sem push.

---

## 2026-09-14 — Fase 5.6: vocabulário de canal e intervalo arbitrário

**Task IDs tocados:** `VEN-101` / analytics (subfase 5.6).

**A6.** O analytics ainda somava dois vocabulários na mesma coluna: `canal` era
rótulo de tela do lado operacional (`Balcão`, `Site`) e texto de planilha do
lado histórico (`Site`, `Instagram`, `Maleta`). `cteVendas` ganhou `origem` ao
lado de `canal`, com a mesma regra de 5.1: bruto preservado, comum preenchido
só onde a correspondência é mecânica, e `null` onde não é.
`GET /api/analytics/origem` devolve os dois eixos e anuncia a fatia
`indeterminado` com valor e participação. **`VEN-Q013` continua em aberto e não
foi decidido** — classificar Instagram dentro de um SELECT seria decidir por
produto.

**A7.** `faixaDePeriodo()` passa a aceitar `{ de, ate }` além dos presets, e a
faixa declara `periodo: 'personalizado'`. O que faltava mesmo era a recusa: ela
caía em `tudo` diante de qualquer valor desconhecido, e para data isso devolve
o faturamento inteiro da loja com cara de recorte pedido. Agora meia faixa, mês
13, `2026-02-31` e ordem invertida são 400 com motivo, na porta.

O intervalo desce para **todos** os blocos do painel. Sem isso, cabeçalho e
cartões responderiam sobre recortes diferentes — B1 voltando por outra porta.

**Validação:** suíte nova `src/analytics-recorte-canal-test.mjs` (11 provas),
registrada no mesmo commit. Regressão local verde: 31 suítes de `domain-pure`,
gates `fast`, `inventario-4-4`, `catalogo-4-5`, painel e build do legado.

**Limites:** `resumoDoMes` e `historico-dia` têm recorte próprio e não foram
tocados; nada de 5.7; sem migration, sem DEV, sem PROD, sem deploy, sem push.
