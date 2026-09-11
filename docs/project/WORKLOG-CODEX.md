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
