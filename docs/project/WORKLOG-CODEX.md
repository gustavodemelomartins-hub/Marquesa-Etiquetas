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

## 2026-09-24 — REV-002 · Revendedoras V2 e acerto seguro

| | |
|---|---|
| Branch | `develop` |
| Commit | `c59bfc3` |
| Status | **FRONTEND PUBLICADO NO DEV — Worker preparado, publicação humana pendente** |

**Estado inicial:** a V2 usava nomes de pessoas como abas, a composição da
visão geral já lia dados reais mas divergia do protótipo, e a ficha ainda
mandava o acerto para o painel clássico. O endpoint aceitava uma distribuição
parcial e criava a venda antes do lote atômico sem identidade estável de retry.

**Dependências verificadas:** protótipo versionado em
`docs/ux/03-screens/revendedoras/`, contratos reais de `GET /api/state` e
`POST /api/maletas/:id/acerto`, regra de comissão do servidor, regra existente
de capacidade/reserva e índice único já existente de `vendas.externo_id`.

**Trabalho nesta continuação:** navegação estável `Visão geral | Todas as
revendedoras | Configurações`, cabeçalho e composição do protótipo com dados
reais, listagem pesquisável, ficha preservada e fluxo de conferência/encerramento
de maleta. O servidor agora exige `devolvidas + destinadas = enviadas` por SKU
e usa `acerto:maleta:<id>` como identidade única da venda para impedir retry ou
duplo clique de criar venda duplicada.

**Validações executadas:** 293/293 testes React verdes; 27 testes focados de
Revendedoras/rotas; 5 provas puras de distribuição, identidade e limpeza de
órfãos do acerto; build React verde; baseline fast 11/11. O catálogo do runner
integrado não possui gate automático de Worker. A tentativa manual do teste
integrado sem Worker aberto recusou conexão em `127.0.0.1:8787`, sem executar
escrita alguma.

**Evidência/blockers:** Pages DEV `d3688d59-888d-4edf-a97b-e91d80a66b3d`
publicou o commit `c59bfc3`. Comparação visual final feita contra o protótipo
mais recente e `/v2/?v=c59bfc3#/revendedoras`, com dados reais: visão geral,
lista, ficha e abertura da conferência de acerto verificadas. `GET /api/health`
do Worker `staging-v2` responde `ok`; ele continua na versão
`d4cb570b-6954-4126-91cd-7838024898ce` até uma pessoa executar
`npx wrangler deploy --env staging-v2`, exigência das skills versionadas de
deploy. Nenhum dado real foi alterado e PROD não foi tocada. Rollback do
frontend: deployment Pages anterior `27e66776-0394-4292-a226-98d494b1604d`.

---

## 2026-09-24 — REV-002 · nova rodada de paridade estrutural

| | |
|---|---|
| Branch | `develop` |
| Commits | `2e16b65`, `5156379` |
| Status | **PERFIL E VISÃO GERAL PUBLICADOS E VALIDADOS NO DEV** |

**Motivo da rodada:** a primeira versão funcional ainda divergia demais da
composição do protótipo. O perfil usava uma tabela muito alta e um donut grande,
e a visão geral precisava recuperar a densidade, a ordem e as proporções da
referência sem trocar dados nem contratos reais.

**Implementação:** o perfil agora segue a sequência navegação estável, voltar,
eyebrow, identidade e edição, quatro KPIs, maleta grande à esquerda, distribuição
compacta à direita e histórico abaixo. A maleta real de 94 SKUs usa busca e
rolagem interna; cada linha preserva código, nome, categoria, preço de envio,
quantidade e subtotal. O mix foi refeito com total e barras ordenadas, quantidade
e percentual. `Editar cadastro` usa o `PATCH` real e `Adicionar itens` usa o
`POST` real, mantendo as ações condicionadas ao estado da maleta. A visão geral
mantém os quatro KPIs, agenda densa, capacidade lateral e cartões de revendedoras
com dados do DEV.

**Validação:** suíte React completa verde com **328/328** testes e 33 arquivos;
os 14 testes focados da rodada também passaram depois do ajuste visual final;
build React verde (157 módulos, apenas o aviso preexistente de chunk grande).
Smoke HTTP confirmou frontend `200` e `GET /api/health` do Worker `staging-v2`
respondeu `ok`. O teste integrado genérico continua com um seletor legado
`.nav-item`, problema do harness sem relação com a tela; a prova de navegador
foi feita diretamente no DEV publicado.

**QA visual:** comparação lado a lado em 1265×712 entre
`/prototype/revendedoras/` e `/v2/?v=f93a23a#/revendedoras/4`, além da visão geral
em `/v2/?v=f93a23a#/revendedoras`. Foram capturadas telas das duas versões na
tarefa Codex. No perfil publicado ficaram visíveis os quatro KPIs, a maleta #12
com 94 peças em lista interna, o mix compacto com seis categorias e o histórico;
na visão geral ficaram visíveis agenda e capacidade na proporção da referência.

**Deploy e limites:** deployment direto da correção final
`60a83ad3-a7f0-47e2-b773-a54ef48903f5`; deployment mais recente contendo os
commits `73d8a831-4bcd-4c43-898b-8ea509149c86` (source `f93a23a`), workflow
`35975957103` verde. A skill versionada impede o agente de executar
`wrangler deploy`; por isso as travas de backend do commit `c59bfc3` ainda
dependem de uma pessoa executar, dentro de `api/`,
`npx wrangler deploy --env staging-v2`. Nenhuma migration, dado real ou recurso
de PROD foi alterado. Rollback visual desta rodada: deployment Pages anterior
`3fd8fcbd` (source `bfa1229`).

---

## 2026-09-24 — REV-002 · scanner compartilhado na conferência do acerto

| | |
|---|---|
| Branch | `develop` |
| Commit | `7ade6b6` |
| Status | **FRONTEND PUBLICADO E VALIDADO NO DEV — Worker manual pendente** |

**Origem e integração:** o leitor clássico foi localizado em
`src/dashboard.tpl.html` (câmera traseira, `BarcodeDetector`, fallback ZXing,
laço contínuo, antirrepique de 1.800 ms e encerramento das tracks). A extração
compartilhada entrou em `develop` pelo commit `b2cbc1d`, com ajustes até
`abfa3ff`. Revendedoras consome `LeitorDeEtiquetas` e `resolverSku` em
`AcertoMaletaFluxo`; nenhuma câmera ou decodificação paralela foi criada e
nenhum arquivo de Inventário foi alterado nesta frente.

**Semântica preservada:** cada leitura incrementa somente
`conferidos[sku]`, estado local separado do `DocumentoAcerto`. Leituras
intencionais do mesmo SKU contam novas unidades até a quantidade enviada; a
camada compartilhada suprime a mesma imagem durante 1.800 ms. SKU válido fora
da maleta recebe aviso não bloqueante; código desconhecido também não conta.
Nenhum bip chama API, registra venda, devolução, movimento, baixa ou ajuste.
O envio final continua pela rota e pelo documento REV-002 existentes.

**Fallback e ciclo de vida:** a conferência manual anterior continua inteira.
O próprio leitor compartilhado mantém entrada digitada quando a câmera não está
disponível ou a permissão falha. Fechar o leitor, fechar o drawer ou avançar
para revisão desmonta o componente; a camada compartilhada encerra as tracks.
Nenhum frame, foto ou vídeo é armazenado.

**Validação:** 19/19 testes focados de Revendedoras/conferência e suíte React
completa verde com **364/364** testes em 37 arquivos. O teste da integração
prova que dois bipes do mesmo SKU incrementam duas unidades, que SKU fora da
maleta não altera o estado, que o leitor é desmontado na revisão e que o payload
final de `encerrarAcerto` permanece idêntico. Build React verde com 161 módulos;
permanece apenas o aviso conhecido de chunk grande. Os testes do scanner
compartilhado cobrem iPhone/ZXing, antirrepique, leitura contínua e liberação do
stream.

**Deploy e QA:** workflow DEV `36028484199` verde; Pages
`daf25ae1-f793-49eb-bf7a-e3b1a945723c`, source `7ade6b6`. Smoke confirmou
frontend `200` e `GET /api/health` do Worker staging-v2 com `ok: true`. No QA
publicado em 390×844, o drawer mostrou a câmera no topo, alvo legível, botões
grandes, fallback manual e feedback imediato para o SKU `326660` (`Colar Casal`,
`1 de 1 conferidos`). A tela capturada nesta tarefa registra o estado móvel.
Desligar a câmera e fechar o drawer removeram o leitor sem concluir o acerto.

**Pendência explícita:** o frontend desta rodada independe de novo backend, mas
as travas REV-002 já versionadas continuam fora do Worker staging-v2 até uma
pessoa executar, dentro de `api/`, `npx wrangler deploy --env staging-v2`. A
skill versionada proíbe o agente de executar esse deploy. PROD não foi tocada.
Rollback do frontend: deployment anterior
`4538e914-4c3b-4876-9e63-fc79af9c5c5e` (source `9b40f67`).

---

## 2026-09-24 — REV-002 · acerto começa zerado e aceita código sem câmera

| | |
|---|---|
| Branch | `develop` |
| Commit | `ef6878c` |
| Status | **FRONTEND PUBLICADO E VALIDADO NO DEV — Worker manual pendente** |

**Correção de semântica:** esta rodada substitui a interpretação registrada na
entrada anterior. O acerto agora nasce com `0` devolvidas por SKU. Cada código
digitado ou lido pela câmera incrementa uma unidade devolvida no
`DocumentoAcerto` ainda provisório; a quantidade restante começa como venda
provisória e pode ser reclassificada para troca, brinde, perda, quebra, dano ou
permanência com a revendedora. Nenhuma leitura chama API, movimenta estoque ou
grava venda. A única persistência continua no botão final de confirmação do
REV-002.

**Operação e UX:** o campo “Código da etiqueta” fica visível sem abrir a câmera,
aceita teclado/leitor USB e recupera o foco após cada registro. O botão de câmera
virou uma ação opcional por ícone e continua usando o scanner compartilhado. A
tela explica o processo em três passos, distingue vendas provisórias, permite
buscar por nome/SKU, filtrar peças ainda não devolvidas e nomeia explicitamente
o “Destino das não devolvidas”. A revisão alerta quando nenhuma devolução foi
marcada. Alterar a quantidade devolvida preserva destinos excepcionais sempre
que possível, reduzindo primeiro a parte vendida.

**Validação automatizada:** 20/20 provas focadas verdes e suíte React completa
com **365/365** testes em 37 arquivos. Os casos cobrem início em zero, digitação
sem câmera, câmera opcional, mesmo SKU, limite enviado, SKU fora da maleta,
preservação de destino excepcional, fallback manual e payload final único do
REV-002. `npm run build` passou (`tsc --noEmit` + Vite, 161 módulos); permanece
somente o aviso conhecido do chunk principal.

**QA como operadora:** em `/v2/?v=ef6878c#/revendedoras/4`, a maleta #12 abriu
com `94 enviadas · 0 devolvidas · 94 vendidas provisórias`. Digitar `326660`
registrou `Colar Casal` como `1 de 1 devolvidas` e devolveu o foco ao campo; a
segunda tentativa ficou limitada em 1. O SKU válido `230076`, fora da maleta,
mostrou aviso não bloqueante e não alterou a contagem. Busca, filtro de não
devolvidas e revisão (`1 devolvida · 93 vendidas`) funcionaram. O drawer foi
fechado sem confirmar, portanto nenhum dado real foi gravado. Em 390×844, campo,
botão principal, ícone de câmera, feedback e rodapé permaneceram legíveis e
operáveis com uma mão; a captura visual foi feita durante o QA.

**Deploy e smoke:** workflow DEV `36083237226` verde; Pages
`cf852740-460b-40a9-9405-36f5094fca70`, source `ef6878c`. O frontend respondeu
`200` e `GET /api/health` do Worker staging respondeu `{"ok":true}`. Nenhum
arquivo de Inventário e nenhum alvo de PROD foram alterados. Rollback do
frontend: deployment anterior `1d75bbea-c6d2-4bd8-8743-e7528cb9ac10`
(source `7c9e58c`).

**Pendência explícita:** as travas de backend já versionadas continuam fora do
Worker staging-v2 até uma pessoa executar, dentro de `api/`,
`npx wrangler deploy --env staging-v2`. A skill versionada proíbe o agente de
executar esse deploy.

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
