# Painel Operacional — Sistema Marquesa

**Atualizado em:** 2026-09-11
**Fonte:** auditoria estrutural completa (branches locais/remotas, commits, docs/ux,
docs/ui, docs/domains da branch paralela, código legado e React)
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
  `docs/ux/06-backlog/pending-decisions.md`) e de `P1..P16`
  (`docs/decisions/PENDENTES.md`, branch `claude/refactor-sistema-marquesa`).
  Onde uma tarefa daqui depende de uma dessas, o link aparece na linha.
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

Fora da janela de ontem/hoje, já em produção e estável (contexto, não tarefa
ativa): Pacotes 0–4 do painel (checkpoint `69ac8ac`), 790 produtos / 1.428
movimentos / 19 vendas validados, reconciliação zero — ver Master Plan §2.

---

## IN PROGRESS

| ID | Tarefa | Onde está | Bloqueio/próximo passo |
|---|---|---|---|
| ARQ-001 | Fase 2 — shell HTTP: 142/142 contratos extraídos para tabela de rotas, gate `api-contracts.test.mjs` | implementado e testado em `claude/refactor-sistema-marquesa` (85 commits, 2026-09-09/10); **não mesclado, não implantado** | decisão de merge (ver Decisions Required) |
| ARQ-002 | Fase 3 — plataforma (config tipada, erros/logs, D1 helpers, correlação, adapters) | idem, mesma branch | idem |
| ARQ-003 | Auditoria/unificação de normalização de SKU (8 pontos) e sufixo de compra | idem, mesma branch (`fadd06a`, `706bc0c`, `ca23f4e`) | idem |
| CAT-001 | Backend Fase 4.5 — categoria (identidade/renomear), galeria/mídia, tarefa de preparação, publicação (writer + estados), 19 testes de schema | implementado e testado em `claude/refactor-sistema-marquesa`; contrato final em `docs/domains/CONTRATO-UX-API-4-5.md` | bloqueado por R2 desligado em PROD e por P13–P16 (ver Decisions Required) |
| CAT-002 | UX da Fase 4.5 — 10 telas conceituais, 4 fluxos, matriz UX↔API | `docs/ux/03-screens/catalogo/`, `docs/ux/05-flows/catalogo-*.md`; estado do material: **domínio mapeado, aguardando mockups** | falta mockup visual; falta decisão de cadastro (CAT-003) |
| INV-001 | Backend Fase 4.4 — inventário físico: 5 rotas preservadas + 7 novas, migration, 22+9 testes | implementado e testado em `claude/refactor-sistema-marquesa`; **migration não aplicada em produção** | 6 perguntas de negócio abertas (S1–S6 no domain doc) sobre saldo real de SKUs específicos antes de tocar produção |
| INV-002 | UX de Inventário — 9 blocos, 5 mockups, embutido em Estoque | `docs/ux/03-screens/estoque/`; estado: **descrito** (não é o degrau final) | fórmulas de "Saúde do estoque"/"valor estimado" ainda abertas (`EST-Q*`) |
| MON-002 | UX de Personalização (Monte seu Colar) | `docs/ux/03-screens/personalizacao/`; estado: **recebendo** | posições/repetição de criança (`VEN-Q016`–`VEN-Q018`) |
| VEN-001 | UX completa de Vendas — 13 blocos, 8 mockups, editor de desconto por peça, pagamento composto | `docs/ux/03-screens/vendas/`; estado: **descrito** | 35 decisões abertas (`VEN-Q001`–`VEN-Q035`) |
| CLI-001 | React de Clientes — só busca global implementada e testada, sem ficha/CRUD | `frontend/src/app/BuscaGlobalClientes.tsx` | ficha completa ainda não começou |
| REV-001 | React de Maletas — criação em dois passos sem endpoint atômico (risco documentado no próprio código) | `frontend/src/features/maletas/` | endpoint atômico de criação, ou aceitar o risco por decisão explícita |
| REV-002 | React de Revendedoras — visão geral + ficha completas e testadas | `frontend/src/features/revendedoras/` | paridade de acerto/comissão com o legado ainda não confirmada ponta a ponta |
| NUV-001 | React de Nuvemshop/sync — leitura completa e testada (panorama, saúde); escrita/aprovação só no legado | `frontend/src/features/nuvemshop/`, `frontend/src/features/reconciliacao/` | `reconciliacao/` autodeclarada "em construção": aprovar/aplicar não persiste ainda |
| SAI-001 | Categoria "sorteio" (saída sem faturamento) — schema e código prontos (`ae81c5b`, `8055732`), migration escrita | `main` | migration `api/migracao-sorteio-saida-sem-faturamento.sql` **não executada em produção** (P11) |

---

## NEXT

| ID | Tarefa | Depende de |
|---|---|---|
| CAT-003 | Cadastro de produto — decidir se ganha rota própria no domínio Catálogo ou continua exclusivo do fluxo de importação/Estoque | decisão humana — ver Decisions Required |
| CAT-004 | Gestão de categorias (criar/editar) — hoje `POST /api/categorias` existe e **nenhuma tela chama**, nem legado nem React | decisão de prioridade |
| CAT-005 | React de Catálogo/Cadastro/Categorias — nenhuma pasta existe ainda | CAT-003 primeiro (senão desenha a tela errada) |
| EST-002 | React de Editar peça/variações/kits/fotos/arquivar — só existe no legado | fatia vertical de Estoque na Fase 9 |
| INV-003 | React de Inventário — nenhuma pasta existe, só o design em `docs/ux` | INV-001 mesclado primeiro (contrato ainda pode mudar) |
| VEN-002 | React de Vendas — `App.tsx` só mostra `AreaPendente`, zero tela real | VEN-001 fechar decisões abertas antes de implementar |
| VEN-003 | Recebimentos múltiplos/parcelados (`IF-009`) | ideia em detalhamento, sem contrato ainda |
| GAR-001 | React de Garantias — não existe nenhuma pasta | fatia vertical na Fase 5 |
| FIN-001 | React de Financeiro/Recebíveis — não existe nenhuma pasta | fatia vertical na Fase 5 |
| MON-003 | React de Monte seu Colar — hoje é backend puro atrás de flag | ligar `PERSONALIZACAO_ATIVA` primeiro (ver Decisions Required) |

---

## BLOCKED

| ID | Tarefa | Bloqueado por |
|---|---|---|
| NUV-002 | Publicação externa de catálogo na Nuvemshop (ligar de verdade) | `NUVEMSHOP_PUBLICACAO_ENABLED` ausente em todo ambiente **e** R2 desligado em produção — decisão de release |
| MON-001 | Monte seu Colar em produção | `PERSONALIZACAO_ATIVA=false`; 7 dos 11 SKUs de negócio sem saldo cadastrado em produção — precisa da Sthefany |
| CAT-001 (parte de mídia/fotos) | Upload/tratamento de foto própria em produção | R2 não habilitado em nenhum ambiente de produção (achado independente desta branch — 158 de 160 peças fora da loja não têm imagem em lugar nenhum) |

---

## DECISIONS REQUIRED

Só o que exige escolha do Gustavo — nada que o sistema possa inferir.

| ID | Pergunta | Trava o quê |
|---|---|---|
| DR-001 | Mesclar `claude/refactor-sistema-marquesa` (85 commits, Fases 0–4.5 parciais) em `main`? Branch nunca foi pro remoto e não está em nenhum outro lugar seguro além deste disco. | ARQ-001, ARQ-002, ARQ-003, CAT-001, INV-001, MON-001 inteiros |
| DR-002 | Cadastro de produto: rota própria no domínio Catálogo ou continua exclusivo do fluxo de importação/Estoque? | CAT-003, CAT-005, e se a Fase 4.5 pode ser considerada com o fluxo de produto completo |
| DR-003 | Habilitar R2 em produção — é decisão de custo/release, não técnica | CAT-001 (mídia), NUV-002, toda a cadeia de fotos |
| DR-004 | Ligar `NUVEMSHOP_PUBLICACAO_ENABLED` — quando e com qual rodada seca de validação antes | NUV-002 |
| DR-005 | Sthefany: saldo físico real dos 7 SKUs de Monte seu Colar ainda sem cadastro/saldo, e resolver o SKU `326660` preso numa maleta aberta | MON-001 |
| DR-006 | Sthefany: 6 perguntas de negócio do Inventário 4.4 (S1–S6, saldo de SKUs específicos) antes de aplicar a migration em produção | INV-001 |
| DR-007 | Quando aplicar `api/migracao-sorteio-saida-sem-faturamento.sql` em produção | SAI-001 |
| DR-008 | Preço divergente local × Nuvemshop — que política? (`P13`) | CAT-001, NUV-001 |
| DR-009 | Mesclar duas categorias — o que acontece com o histórico de relatório? (`P14`) | CAT-004 |
| DR-010 | Arquivar uma peça deve despublicá-la da loja automaticamente? (`P15`) | CAT-001 |
| DR-011 | Categorias da Nuvemshop: mapear com as internas ou continuar ignorando? (`P16`) | NUV-001 |
| DR-012 | Vale criar tela de gestão de categorias agora, já que a rota existe e nunca teve UI? (achado novo desta auditoria) | CAT-004 |

---

## Contagem

DONE: 3 · IN PROGRESS: 13 · NEXT: 9 · BLOCKED: 3 · DECISIONS REQUIRED: 12

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
