# Auditoria de paridade — Legado × Sistema novo

**Data:** 2026-09-11
**Método:** varredura de `src/dashboard.tpl.html` (13.941 linhas) cruzada com
todas as rotas de `api/src/index.js`, mais o estado real de `frontend/src/`
e o backend implementado na branch não mesclada
`claude/refactor-sistema-marquesa`. Nenhum arquivo de código foi alterado
para produzir esta auditoria.

**Por que este documento existe:** ao desenhar a Fase 4.5 descobrimos que o
cadastro de produto só existe no legado, escondido dentro do fluxo de
importação — ninguém tinha percebido porque "o backend existe" e "a tela
existe" foram lidos como "está resolvido". Este documento existe pra achar
as próximas lacunas iguais antes que apareçam por acidente.

## Vocabulário da coluna Situação

Um valor só, sem combinar:

| Situação | Significado |
|---|---|
| `LEGACY ONLY` | funciona hoje só no dashboard legado; nada novo tocou nisso |
| `MAPPED` | documentado em `docs/ux/` ou `docs/ui/`, nenhum código novo |
| `BACKEND READY` | código + teste existem (mesclado ou não), sem UX desenhada nem tela nova |
| `UX DESIGNED` | tela conceitual com regra/estado fechados, sem código de tela |
| `IMPLEMENTED` | tela React existe e chama API real (pode ter lacuna conhecida) |
| `TESTED` | implementado E com teste automatizado provando o caso |
| `PROD` | está no que os usuários realmente usam hoje (o legado conta como PROD dele mesmo) |
| `LEGACY REMOVABLE` | paridade provada, uso real migrado — nada está aqui ainda |

**Regra de leitura:** "funciona no legado" nunca é, sozinho, motivo pra
marcar como resolvido. "Backend existe" não é "migrado". "API foi provada
numa branch" não é "redesenhada". "UX foi desenhada" não é "implementada".

## Matriz — Estoque e Catálogo

| ID | Funcionalidade | Legado | Novo backend | Nova UX | Novo frontend | Testado | Produção | Situação |
|---|---|---|---|---|---|---|---|---|
| EST-101 | Visão geral (KPIs, avisos, insights) | sim — `view-geral`, `dashboard.tpl.html:3173-3270` | `GET /api/state` (existente) | não | não | não | legado | `LEGACY ONLY` |
| CAT-101 | **Cadastro manual de produto** | sim — reaproveita o endpoint de peça nova (`:3589-3628`) | **não existe rota própria** (`POST /api/produtos` não existe) | mapeada com lacuna deliberada (`docs/ux/05-flows/catalogo-cadastrar-e-completar-produto.md`) | não | não | legado | `LEGACY ONLY` — gap crítico, ver seção abaixo |
| CAT-102 | Importação em lote — peças novas | sim (`:12673-12936`) | `POST /api/produtos/novos/analisar`\|`cadastrar` (existente) | não | não | teste indireto via import | legado | `LEGACY ONLY` |
| CAT-103 | Importação — Estoque Total (planilha, fonte máxima) | sim (`:12093-12468`) | `POST /api/estoque-total/analisar`\|`aplicar` | não | **sim, completo** — `frontend/src/features/estoque-total/` | **sim, 4 arquivos de teste** | legado ainda é a via oficial | `TESTED` (React) / `LEGACY ONLY` (produção real) |
| CAT-104 | Geração/checagem de SKU (6 dígitos) | sim (`:3654-3746`) | `GET /api/produtos/sku/checar`, `POST /sku/gerar` | descrito em `docs/domains/SKU-NORMALIZACAO.md` (branch paralela) | não | `scripts/sku-normalizacao.test.mjs` (branch paralela) | legado | `LEGACY ONLY` (produção) / `BACKEND READY` (auditoria de regra) |
| CAT-105 | Editar peça (descrição/categoria/preço) | sim (`:5046-5285`) | `PATCH /api/produtos/:sku` | não | não | não | legado | `LEGACY ONLY` |
| CAT-106 | Variações — estrutura e distribuição de quantidade | sim (`:5074-5321`) | `PUT /variacoes`, `POST /variacoes/distribuir` | parcialmente coberto por `docs/ux/03-screens/estoque` (bloco 8, seleção de variação) | não | não | legado | `LEGACY ONLY` |
| CAT-107 | Kits (montar/desfazer) | sim (`:4928-5012`) | `PUT /api/produtos/:sku/componentes` | não | não | não | legado | `LEGACY ONLY` — **fora de escopo por decisão** ([business-rules.md](../../.claude/rules/business-rules.md): "Kits: fora do escopo atual") |
| CAT-108 | Excluir / arquivar / desarquivar produto | sim (`:5335-5456`) | `DELETE`, `POST /arquivar`\|`/desarquivar` | não | não | não | legado | `LEGACY ONLY` |
| CAT-109 | Foto do produto (upload original/tratada, remover, fundo branco) | sim (`:4784-4918`) | `PUT/DELETE /foto/*`, `POST /foto/fundo-branco` | mapeada em `docs/ux/03-screens/catalogo` (bloco Galeria) | não | não | legado | `LEGACY ONLY` — **bloqueada estruturalmente**: R2 não habilitado em nenhum ambiente de produção |
| CAT-110 | **Gestão de categorias (criar/editar)** | **nenhuma tela chama** | `POST/PATCH /api/categorias` existe | não | não | não | nenhuma | `BACKEND READY` — achado novo, ver seção abaixo |
| CAT-111 | Fase 4.5 — categoria com identidade/renomear, "Outros" como categoria comum | não (legado usa lista solta) | implementado+testado, branch paralela (`0f06dda`) | mapeado (`docs/ux/03-screens/catalogo/rules.md`) | não | schema tests (branch paralela) | não mesclado | `BACKEND READY` |
| CAT-112 | Fase 4.5 — galeria/mídia (múltiplas fotos, original+preparada, principal, ordem) | parcial (só uma foto original+tratada) | implementado+testado, branch paralela (`5e4209b`) | mapeado (10 telas conceituais) | não | 19 testes de schema (branch paralela) | não mesclado | `BACKEND READY` |
| CAT-113 | Fase 4.5 — preparação de conteúdo (tarefa desacoplada de executor) | não (legado chama de "agente" direto) | implementado+testado, branch paralela (`0763ef6`) | mapeado | não | idem | não mesclado | `BACKEND READY` |
| CAT-114 | Fase 4.5 — publicação (writer, estados publicando/publicado/falhou/despublicado) | sim, aba "Publicar na Nuvemshop" (`:6906-6970`) já funciona com fluxo próprio | implementado+testado, branch paralela (`7b7eefa`); escrita real desligada (`NUVEMSHOP_PUBLICACAO_ENABLED` ausente) | mapeado (blocos 7-9) | não | 19 testes de schema | não mesclado, escrita desligada | `BACKEND READY` |
| CAT-115 | Divergência de preço local × Nuvemshop | não existe hoje (ninguém compara) | `GET /api/catalogo/precos/divergentes` mede, não corrige — branch paralela | mapeado (bloco 10) | não | não relatado | não mesclado | `BACKEND READY`, política pendente (`P13`) |

## Matriz — Inventário

| ID | Funcionalidade | Legado | Novo backend | Nova UX | Novo frontend | Testado | Produção | Situação |
|---|---|---|---|---|---|---|---|---|
| INV-101 | Iniciar/continuar contagem | sim (`:3970-4012`, `:7769-7786`) | `POST/GET /api/inventarios` (existente) | coberto pelo bloco 3/4 de `docs/ux/03-screens/estoque` | não | não | legado | `LEGACY ONLY` |
| INV-102 | Bipagem de contagem (sem limite) | sim (`:7472-7662`) | — | idem | não | não | legado | `LEGACY ONLY` |
| INV-103 | Concluir contagem + relatório faltando/sobrando | sim (`:7804-7886`) | `POST /concluir` (comportamento muda na 4.4: recusa item não comparável) | bloco 6, fechamento/revisão | não | não (legado) | legado | `LEGACY ONLY` |
| INV-104 | Corrigir divergência (individual/lote) | sim (`:7888-7906`) | `POST /ajustar` | idem | não | não | legado | `LEGACY ONLY` |
| INV-105 | Fase 4.4 — contagem pausável, tri-estado (não contado/contado-N/contado-zero) | não (legado não pausa nem distingue zero explícito) | implementado+testado, branch paralela: 5 rotas mudadas + 7 novas, migration | mapeado, 5 mockups, bloco 4 "em andamento" | não | 22 cenários + 9 travas de código-fonte | não mesclado, migration não aplicada | `BACKEND READY` |
| INV-106 | Fase 4.4 — histórico de inventários com cobertura/divergência | não | idem | mapeado, bloco 5 | não | idem | idem | `BACKEND READY` |
| INV-107 | Fase 4.4 — seleção de variação durante contagem, "não sei a variação" vira pendência | não | idem | mapeado, blocos 5 e 8; cópia oficial já decidida | não | idem | idem | `UX DESIGNED` + `BACKEND READY` |

## Matriz — Nuvemshop / Sync / Reconciliação

| ID | Funcionalidade | Legado | Novo backend | Nova UX | Novo frontend | Testado | Produção | Situação |
|---|---|---|---|---|---|---|---|---|
| NUV-101 | Painel/KPIs da loja | sim (`:5463-5499`, `:5838-5963`) | deriva de `state` | não | `frontend/src/features/nuvemshop/` (panorama, saúde) | 2 testes | legado (React só leitura em paralelo) | `TESTED` (React, só leitura) |
| NUV-102 | Analisar sincronização (dry-run) | sim (`:5593-5619`) | `POST /api/sync/analisar` | não | idem (via `sync.ts`) | `sync.test.ts` | legado ainda é quem aplica | `TESTED` (leitura) |
| NUV-103 | Confirmar/aprovar/aplicar sincronização (escrita) | sim (`:5740-5836`) | `POST /api/reconciliacao/*` | não | `reconciliacao/` — autodeclarada "em construção", aprovar/aplicar não persiste ainda | 1 teste (`classificar.test.ts`, lógica pura) | legado | `LEGACY ONLY` (escrita) |
| NUV-104 | Vincular/importar fotos da loja, adotar foto órfã | sim (`:6196-6257`) | `POST /api/fotos/vincular-da-loja`\|`importar-da-loja`\|`/orfas/adotar` | não | não | não | legado | `LEGACY ONLY` |
| NUV-105 | Revisão de distribuição de variações (loja × físico) | sim (`:6272-6407`) | `GET /api/variacoes/revisao` | não | não | não | legado | `LEGACY ONLY` |
| NUV-106 | Exportações manuais (CSV/XLSX pra subir na loja) | sim (`:12949-13027`) | client-side, sem rota | não | não | não | legado | `LEGACY ONLY` |
| NUV-107 | Cron de sincronização automática | `crons=[]` — **desarmado deliberadamente** em `api/wrangler.toml` | handler `scheduled` existe no Worker | não | não | não | nenhum ambiente | `BACKEND READY` (código existe, não ligado) — decisão pendente (`P1`) |
| NUV-108 | Publicação externa real (ligar) | aba "Publicar" já monta payload | writer pronto, branch paralela; flag ausente em todo ambiente | mapeado | não | 19 testes | desligado | `BLOCKED` — ver PROJECT-STATUS |

## Matriz — Vendas, Personalização e Saídas

| ID | Funcionalidade | Legado | Novo backend | Nova UX | Novo frontend | Testado | Produção | Situação |
|---|---|---|---|---|---|---|---|---|
| VEN-101 | Lançamento de venda (bipagem, itens, cliente, pagamento, observação) | sim (`:7921-8705`) | `POST /api/vendas` (existente) | descrito, 13 blocos, 8 mockups | **`App.tsx` só mostra `AreaPendente`** — zero tela real | não | legado | `LEGACY ONLY` |
| VEN-102 | Editor de preço/desconto por peça, motivo obrigatório | sim (`:8375-8457`) | recalcula no servidor | proposta de UX detalhada e específica (`03-screens/vendas/README.md`) | não | não | legado | `UX DESIGNED` (proposta pronta, não implementada) |
| VEN-103 | Pagamento — caminho rápido, misto, parcelado | parcial: só pago/não pago hoje | não existe modelo de recebimentos múltiplos ainda | proposta de UX detalhada (`IF-009`, `VEN-Q029`-`035`) | não | não | legado (mais simples que a proposta) | `UX DESIGNED` |
| VEN-104 | Histórico completo de vendas (filtros, exportação) | sim (`:8707-8934`) | leitura paginada parcial | descrito, bloco 12 | não | não | legado | `LEGACY ONLY` |
| VEN-105 | Correção de item vendido (trocar SKU de uma venda) | sim (`:10689-10819`) | `POST /api/vendas/corrigir-item` | não mapeado ainda | não | não | legado | `LEGACY ONLY` |
| VEN-106 | Painel/analytics de vendas (evolução, categorias, origem) | sim (`:9280-10186`) | `GET /api/analytics/*` | descrito, blocos 3-6 | não | não | legado | `LEGACY ONLY` |
| MON-101 | Monte seu Colar — venda de composição personalizada | sim, atrás de flag (`:8119-8312`) | 11 SKUs, slots tipados, ~20 garantias testadas, branch paralela | 1 mockup, estado "recebendo" | não | 5 arquivos de teste (branch paralela) | `PERSONALIZACAO_ATIVA=false` em todo ambiente | `BACKEND READY`, `BLOCKED` para operar |
| SAI-101 | Saída sem faturamento (brinde/uso próprio/perda) | sim (`:9099-9226`) | `POST /api/saidas`, `/estornar` (existente) | descrito, bloco 11 | não | não | legado | `LEGACY ONLY` |
| SAI-102 | Categoria "sorteio" | não | schema+código prontos em `main` (`ae81c5b`) | descrito, decisão fechada (`DP-005` área) | não | testes unitários (`main`) | **migration não aplicada em produção** | `BACKEND READY`, não em PROD |

## Matriz — Clientes, Revendedoras, Garantias, Financeiro

| ID | Funcionalidade | Legado | Novo backend | Nova UX | Novo frontend | Testado | Produção | Situação |
|---|---|---|---|---|---|---|---|---|
| CLI-101 | Busca/cadastro rápido de cliente | sim (`:8490-8616`, `:11192-11252`) | `GET/POST/PATCH /api/clientes` | não mapeado | busca global implementada (`BuscaGlobalClientes.tsx`), linka de volta pro legado pra editar | `BuscaGlobalClientes.test.tsx` | legado | `TESTED` (só busca) / `LEGACY ONLY` (CRUD) |
| CLI-102 | Ficha completa do cliente (histórico, preferências, garantias) | sim (`:10474-10675`) | `GET /api/clientes/perfil` | não | não | não | legado | `LEGACY ONLY` |
| REV-101 | CRUD de revendedora | sim (`:7414-7463`) | `POST/PATCH/arquivar` | não mapeado | `frontend/src/features/revendedoras/` completo | `RevendedorasArea.test.tsx` | legado ainda oficial | `TESTED` |
| REV-102 | Maleta — montar/bipar/acertar | sim (`:7191-7368`, `:11683-11838`) | rotas existentes | não mapeado | `frontend/src/features/maletas/` — **criação em 2 passos sem endpoint atômico**, lacuna documentada no próprio código | lógica de domínio testada (`domain/maletas.test.ts`), fluxo completo não | legado | `IMPLEMENTED` com lacuna conhecida |
| GAR-101 | Registrar garantia, troca, status | sim (`:10851-11146`) | `POST /api/garantias/*` | não mapeado | não | não | legado | `LEGACY ONLY` |
| GAR-102 | **Estornar troca de garantia** | **nenhum botão em lugar nenhum** | `POST /api/garantias/:id/troca/estornar` existe | não | não | não | nenhuma | `BACKEND READY` — achado novo, código morto na prática |
| FIN-101 | Contas a receber (listar, prazo, marcar paga) | sim (`:9606-9677`) | `GET/PATCH/POST /api/contas-receber/*` | não mapeado | não | não | legado | `LEGACY ONLY` |

## Etiquetas (sistema paralelo por design)

| ID | Funcionalidade | Legado | Novo backend | Nova UX | Novo frontend | Testado | Produção | Situação |
|---|---|---|---|---|---|---|---|---|
| ETQ-101 | Fila, impressão (Pimaco 7×18), PDF, calibração | sim, `window.Etq` em `dashboard.tpl.html:13228-13650+` — **localStorage, fora do D1**, dívida já registrada em `docs/architecture/TECH_DEBT.md` | nenhum (por design) | descrito, `docs/ux/03-screens/etiquetas/`, 4 ideias em backlog (`IF-002`-`004`) | placeholder `AreaPendente` | não | legado | `LEGACY ONLY` — risco: perde tudo se limpar o navegador |

## Apêndice — rotas de API sem nenhuma UI (nem legado, nem React)

Achado da varredura: capacidades que já existem no backend e nunca tiveram
botão em lugar nenhum. Não é regressão do React — é paridade zero desde
sempre. Prioridade baixa, exceto onde marcado.

| Rota | Domínio provável | Observação |
|---|---|---|
| `POST /api/categorias` | Catálogo | ver `CAT-110` acima — prioridade média |
| `POST /api/garantias/:id/troca/estornar` | Garantias | ver `GAR-102` acima — prioridade média |
| `GET /api/clientes/revisao`, `POST /revisao/:id` | Clientes | fila de "vínculo em dúvida"; Central só tem ação genérica |
| `POST /api/loja/variantes/importar`, `GET /variantes/:id` | Nuvemshop | importação direta de variantes fora do fluxo de sync |
| `GET /api/variacoes/reconciliacao` | Estoque/Nuvemshop | distinto de `/revisao`, que tem UI |
| `GET /api/vendas/lista` | Vendas | listagem alternativa a `/vendas`, `/vendas/dia`, `/vendas/lancamentos` |
| `GET /api/vendas/historico/lotes`, `.../reverter`, `.../reconstruir`, `.../operacoes` | Vendas/histórico | gestão fina de lotes importados; só analisar/importar/substituir/retrato têm tela |
| `GET /api/vendas/pagamento/auditoria` | Financeiro | sem tela |
| `GET /api/historico/auditoria`, `/historico/reclassificar` | Auditoria | sem tela |

### Legacy gaps discovered

Ordenado por criticidade — o que hoje "funciona no legado" e foi lido como
resolvido sem nunca ter sido desenhado ou migrado corretamente.

**1. R2 não habilitado em nenhum ambiente de produção — crítico, estrutural**

- Comportamento atual: `api/wrangler.toml` só declara o binding `FOTOS` em
  `[env.staging]`; produção não tem R2 nenhum.
- Onde está no legado: toda a cadeia de foto (`CAT-109`) funciona hoje
  porque usa outro caminho de armazenamento; a Fase 4.5 nova foi desenhada
  assumindo R2.
- Backend existente: escrita de bytes responde `503 { bloqueio: "sem_r2" }`
  de forma controlada — não é bug, é a trava certa. O problema é a ausência
  do bucket, não o código.
- Frontend novo: nenhum.
- UX desenhada: sim, já prevê o bloqueio (`docs/ux/03-screens/catalogo/api-needs.md`).
- Risco: 158 das 160 peças ainda fora da loja não têm imagem em lugar
  nenhum — não é possível "puxar da loja" porque elas não estão lá.
- Fase do Master Plan: Fase 3 (plataforma/adapters) e Fase 4 item 5 (4.5).
- Decisão necessária: habilitar R2 em produção é custo e release, registrada
  em `P9`/`DR-003`.

**2. Cadastro de produto sem rota própria — crítico, já documentado**

- Ver Master Plan §30 e `CAT-101`/`CAT-003`/`DR-002`. Não repetido aqui por
  extenso — é o achado que originou esta auditoria inteira.

**3. Gestão de categorias sem UI em lugar nenhum — médio**

- Comportamento atual: categoria é só uma lista solta (`catList()`) lida a
  partir do cadastro de produto; ninguém cria, edita ou reordena categoria
  em nenhuma tela.
- Backend existente: `POST/PATCH /api/categorias`, `POST /:id/arquivar` já
  existem e são usados pela Fase 4.5 (`CAT-111`).
- Frontend novo: nenhum.
- UX desenhada: sim, tela "Categorias" é a 3ª das 10 telas conceituais da
  Fase 4.5.
- Risco: baixo enquanto ninguém precisar renomear/criar categoria fora do
  cadastro manual; sobe se a Fase 4.5 avançar sem essa tela.
- Fase do Master Plan: Fase 4 item 5.
- Decisão necessária: `DR-012` — vale adiantar essa tela isolada?

**4. Estornar troca de garantia — código morto na prática — médio**

- Comportamento atual: a rota existe e funciona (`POST
  /api/garantias/:id/troca/estornar`), mas nenhum `onclick` no dashboard a
  chama. Se uma troca precisar ser desfeita hoje, não há botão — só acesso
  direto à API.
- Backend existente: sim, íntegro.
- Frontend novo: nenhum.
- UX desenhada: não.
- Risco: operacional — Sthefany não consegue desfazer uma troca de garantia
  pela tela.
- Fase do Master Plan: Fase 5 (vendas, clientes, financeiro, garantias).
- Decisão necessária: incluir na próxima revisão da tela de Garantias, ou
  aceitar formalmente que é ação só-por-suporte.

**5. Maleta sem endpoint atômico de criação — médio, já documentado no código**

- Comportamento atual: `frontend/src/features/maletas/` cria a maleta vazia
  e depois adiciona itens em chamada separada; se a segunda falhar, sobra
  maleta parcial.
- Backend existente: as duas rotas existem, separadas.
- Frontend novo: implementado, com o risco comentado no próprio arquivo.
- Risco: divergência entre o que a revendedora acha que levou e o que o
  sistema registrou.
- Fase do Master Plan: Fase 6.
- Decisão necessária: endpoint atômico novo, ou aceitar o risco documentado.

**6. Migration do sorteio não aplicada em produção — médio**

- Comportamento atual: código e testes já tratam `sorteio` como categoria
  válida de saída sem faturamento; o banco de produção ainda não tem os
  `CHECK`s ampliados.
- Risco: qualquer caminho de código que assuma a migration aplicada e rodar
  contra produção real quebra em runtime, não em teste.
- Decisão necessária: `P11`/`DR-007` — quando aplicar.

**7. Preço divergente local × Nuvemshop sem política — baixo, sob controle**

- `GET /api/catalogo/precos/divergentes` (branch paralela) já mede e não
  corrige nada sozinho — o desenho está certo, falta só a política de
  negócio (`P13`/`DR-008`).

**8. Etiquetas isoladas em `localStorage` — baixo, é decisão deliberada**

- Já registrado como dívida técnica conhecida (`docs/architecture/TECH_DEBT.md`); listado
  aqui só para constar na paridade. Risco real: limpar o navegador apaga a
  fila de etiquetas sem qualquer backup central.

## Contagem por situação

| Situação | Linhas na matriz |
|---|---|
| `LEGACY ONLY` | 27 |
| `BACKEND READY` | 11 |
| `UX DESIGNED` | 3 |
| `IMPLEMENTED` | 1 |
| `TESTED` | 6 |
| `MAPPED` (documental, sem código) | 0 adicional (contido nas linhas acima) |
| `PROD` (novo, substituindo legado) | 0 |
| `LEGACY REMOVABLE` | 0 |

Nenhuma funcionalidade chegou a `PROD` ou `LEGACY REMOVABLE` ainda — o
sistema novo não substituiu nada em produção real até esta data. Isso não é
um problema por si só; é o retrato correto de "em construção" que este
documento existe para não deixar ninguém esquecer.

## Como manter isto vivo

Mude a situação de uma linha só com evidência (teste rodado, deploy feito,
uso real observado) — nunca porque "deve estar pronto". Toda sessão que
mudar o estado de uma funcionalidade legada atualiza esta tabela como parte
do protocolo descrito em `WORKLOG-CLAUDE.md`/`WORKLOG-CODEX.md`.
