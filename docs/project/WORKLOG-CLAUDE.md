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

## 2026-09-10 — Refatoração estrutural Fases 0–4.5 (backend)

| | |
|---|---|
| Branch | `claude/refactor-sistema-marquesa` |
| Commits | 85, de `3204210` a `bfd5d6b` (log completo: `git log ae81c5b..claude/refactor-sistema-marquesa`) |
| Status | **BACKEND PRONTO E TESTADO, NÃO MESCLADO, NÃO IMPLANTADO** — branch só existe neste disco, não está em nenhum remoto |

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
