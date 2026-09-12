# Documentação do Sistema Marquesa

Índice único de `docs/`. Se um documento não estiver aqui, ele não é fonte
corrente — é evidência histórica, e vive em `releases/` ou `archive/`.

## Precedência

Uma regra por assunto, nesta ordem:

1. pedido humano explícito mais recente;
2. roteador do agente — [CLAUDE.md](../CLAUDE.md) ou [AGENTS.md](../AGENTS.md);
3. [SECURITY.md](SECURITY.md) para risco/ambientes e [api/REGRAS.md](../api/REGRAS.md)
   para negócio — as duas fontes canônicas;
4. o documento de domínio ou arquitetura do assunto, listado abaixo;
5. `releases/` e `archive/` como evidência do que já aconteceu, nunca como
   precedência sobre os itens acima.

Documento datado descreve o que era verdade naquela data. Ele não revoga
regra corrente e não autoriza operação nenhuma hoje.

## Taxonomia

| Pasta | O que guarda | Muda com |
|---|---|---|
| `architecture/` | arquitetura vigente, plano mestre, modelo de dados, dívida técnica, baselines estruturais | mudança estrutural aprovada |
| `domains/` | regra e contrato por domínio de negócio | mudança de comportamento do domínio |
| `operations/` | ambiente local, DEV, backup/restore, cota do D1, camada agentic | mudança de procedimento operacional |
| `decisions/` | ADRs vigentes | decisão nova ou revogada |
| `releases/` | handoffs, resultados de go-live, revisões e baselines de pacote | nunca: é evidência datada |
| `testing/` | estratégia, manifesto executável e baselines de regressão | mudança de suíte ou de gate |
| `archive/` | planos e levantamentos substituídos | nunca: é registro do que foi |
| `SECURITY.md` | régua de risco, classes C/D e ambientes | decisão humana explícita |

## Arquitetura

| Assunto | Documento |
|---|---|
| Plano mestre da refatoração | [architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md](architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md) |
| Arquitetura atual | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) |
| Frontend React/TS | [architecture/FRONTEND_ARCHITECTURE.md](architecture/FRONTEND_ARCHITECTURE.md) |
| Modelo de dados | [architecture/DATA_MODEL.md](architecture/DATA_MODEL.md) |
| Dívida técnica | [architecture/TECH_DEBT.md](architecture/TECH_DEBT.md) |
| Contratos HTTP congelados | [architecture/API-ROUTES-BASELINE.md](architecture/API-ROUTES-BASELINE.md) |
| Schema, migrations e cron por ambiente | [architecture/SCHEMA-MIGRATIONS-OPERATIONS-BASELINE.md](architecture/SCHEMA-MIGRATIONS-OPERATIONS-BASELINE.md) |
| Grafo do repositório | [architecture/GRAPHIFY-BASELINE-FASE-0.md](architecture/GRAPHIFY-BASELINE-FASE-0.md) |

## Domínios

| Assunto | Documento |
|---|---|
| Estoque e catálogo | [domains/ESTOQUE-CATALOGO-BASELINE.md](domains/ESTOQUE-CATALOGO-BASELINE.md) |
| Inventário — desenho canônico da Fase 4.4 | [domains/INVENTARIO-4-4.md](domains/INVENTARIO-4-4.md) |
| Catálogo, mídia e publicação — desenho canônico da Fase 4.5 | [domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md](domains/CATALOGO-MIDIA-PUBLICACAO-4-5.md) |
| Contrato de UX/API da Fase 4.5 | [domains/CONTRATO-UX-API-4-5.md](domains/CONTRATO-UX-API-4-5.md) |
| Importações relacionadas — auditoria e correção da Fase 4.6 | [domains/IMPORTACAO-4-6.md](domains/IMPORTACAO-4-6.md) |
| Auditoria que originou a Fase 4.5 | [domains/AUDITORIA-4-5-CATALOGO-FOTOS-PUBLICACAO.md](domains/AUDITORIA-4-5-CATALOGO-FOTOS-PUBLICACAO.md) |
| Vendas, clientes, financeiro e garantias — auditoria da Fase 5 | [domains/AUDITORIA-5-VENDAS-CLIENTES-FINANCEIRO-GARANTIAS.md](domains/AUDITORIA-5-VENDAS-CLIENTES-FINANCEIRO-GARANTIAS.md) |
| Saídas sem faturamento | [domains/SAIDAS-SEM-FATURAMENTO.md](domains/SAIDAS-SEM-FATURAMENTO.md) |
| Nuvemshop | [domains/NUVEMSHOP_INTEGRATION.md](domains/NUVEMSHOP_INTEGRATION.md) |
| Sincronização | [domains/SYNC_ENGINE.md](domains/SYNC_ENGINE.md) |
| Reconciliação | [domains/RECONCILIATION_ENGINE.md](domains/RECONCILIATION_ENGINE.md) |
| Próxima fase da reconciliação | [domains/ROADMAP_RECONCILIATION.md](domains/ROADMAP_RECONCILIATION.md) |

Regra de negócio canônica continua em [api/REGRAS.md](../api/REGRAS.md); estes
documentos explicam mecanismo, não revogam regra.

## Operação

| Assunto | Documento |
|---|---|
| Ambiente local e comandos | [operations/DEVELOPMENT.md](operations/DEVELOPMENT.md) |
| Publicar e verificar o DEV | [operations/RUNBOOK-DEV-API.md](operations/RUNBOOK-DEV-API.md) |
| Backup e restauração | [operations/BACKUP_RECOVERY.md](operations/BACKUP_RECOVERY.md) |
| Cota de leitura do D1 | [operations/D1_USAGE_AUDIT.md](operations/D1_USAGE_AUDIT.md) |
| WSL2 e sandbox | [operations/WSL2_MIGRATION.md](operations/WSL2_MIGRATION.md) |
| Estratégia de contexto do agente | [operations/CLAUDE_CONTEXT_STRATEGY.md](operations/CLAUDE_CONTEXT_STRATEGY.md) |
| Skills do projeto | [operations/CLAUDE_SKILLS.md](operations/CLAUDE_SKILLS.md) |

Publicar a API: [api/DEPLOY.md](../api/DEPLOY.md). Montar o dashboard legado:
[src/README.md](../src/README.md). Permissões, hooks e modelos:
[.claude/README.md](../.claude/README.md).

## Testes

| Assunto | Documento |
|---|---|
| Estratégia e catálogo de suítes | [testing/TESTING.md](testing/TESTING.md) |
| Baseline histórico das suítes | [testing/BASELINE.md](testing/BASELINE.md) |
| Baseline de regressão da Fase 0 | [testing/REGRESSION-BASELINE-FASE-0.md](testing/REGRESSION-BASELINE-FASE-0.md) |
| Manifesto executável | [testing/test-suites.json](testing/test-suites.json) |
| Checklist manual do Monte seu Colar | [testing/MONTE_SEU_COLAR_CHECKLIST.md](testing/MONTE_SEU_COLAR_CHECKLIST.md) |

Na raiz, `npm test` roda o gate de release local; `npm run test:list` mostra o
manifesto inteiro.

## Decisões

ADRs vigentes em [decisions/](decisions/README.md). Decisões humanas ainda
pendentes, que nenhum refactor pode resolver sozinho, ficam em
[decisions/PENDENTES.md](decisions/PENDENTES.md).

## Evidência histórica

`releases/` guarda handoffs, resultados de go-live, revisões operacionais e os
baselines dos pacotes 0–4, com as capturas correspondentes. `archive/` guarda o
plano mestre anterior ao go-live e levantamentos substituídos. Nada nessas duas
pastas é reescrito para "ficar atual": elas valem justamente por serem o que se
sabia na data.
