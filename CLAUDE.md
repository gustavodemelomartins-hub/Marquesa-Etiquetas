# Marquesa Semijoias

Sistema operacional de **estoque, revendedoras e integração com a
Nuvemshop**. Controla estoque físico e vendas reais.

> Confiabilidade vale mais que velocidade de implementação.
> Nunca adivinhe quando um conflito de dados puder representar peça física.

Stack: Cloudflare Worker · D1/SQLite · API da Nuvemshop. **Dois painéis**
sobre o mesmo backend: o legado em HTML/CSS/JS vanilla (`src/dashboard.tpl.html`,
em produção) e o novo em React + TypeScript + Vite (`frontend/`, em
construção). O backend não tem dependência de runtime.

---

## Regras fundamentais

1. **`movimentos` é razão contábil.** Vale sempre
   `produtos.qtd == SUM(movimentos.qtd)`. Toda mudança de estoque passa por
   `estoque.js › movimentar`. **Nunca escreva `produtos.qtd` direto.**
2. **Nunca chute a distribuição de uma variante.** Não sabe qual aro saiu?
   Não escreva. Mostre os dois números e pare.
3. **Nunca altere estoque sem entender a origem.** Toda alteração precisa de
   um movimento que a explique.
4. **A Nuvemshop é destino do estoque, não fonte da verdade do físico.** A
   única exceção é a semeadura de variações, e ela tem duas travas.
5. **Preserve a idempotência dos pedidos.** O índice único
   `vendas.externo_id` é o que impede cobrar a mesma venda duas vezes.
   Rodar o cron duas vezes tem que ser inofensivo.
6. **Prefira preview/dry-run antes de escrever.** `POST /api/sync
   {"seco": true}` lê tudo e não escreve na loja.
7. **Produção é a fonte de verdade operacional.** Classe C (deploy, push,
   migration, infraestrutura e rollback) pode ser executada autonomamente
   após gates proporcionais. Só Classe D destrutiva/empresarial exige decisão
   humana explícita. Ver [docs/SECURITY.md](docs/SECURITY.md).
8. **[api/REGRAS.md](api/REGRAS.md) é a fonte fundamental das regras de
   negócio.** Leia antes de mudar comportamento; não o duplique em lugar
   nenhum.
9. **O que o sistema decide não fazer é anunciado, nunca engolido.**

## Hierarquia de instruções

Use uma regra por assunto, nesta ordem:

1. pedido humano explícito mais recente;
2. este roteador (`CLAUDE.md` no Claude, `AGENTS.md` no Codex);
3. `docs/SECURITY.md` para risco/ambientes e `api/REGRAS.md` para negócio;
4. regra por caminho ou skill especializada, somente quando acionada;
5. runbooks e documentação histórica como evidência, nunca como precedência.

Configuração local (`CLAUDE.local.md`, `AGENTS.override.md`, `.codex/` ou
`.agents/`) conecta a máquina às ferramentas, mas não pode reintroduzir uma
política revogada nem contradizer as duas fontes canônicas do item 3.

## Onde procurar informação

```
Índice da documentação → docs/README.md   (taxonomia e precedência)
Plano mestre       → docs/architecture/MASTER-PLAN-SISTEMA-MARQUESA-2026-09.md
Plano do go-live   → docs/archive/PLANO-MESTRE-MARQUESA.md   (histórico)
Regras de negócio  → api/REGRAS.md
Arquitetura        → docs/architecture/ARCHITECTURE.md
Frontend React/TS  → docs/architecture/FRONTEND_ARCHITECTURE.md
Banco              → docs/architecture/DATA_MODEL.md
Nuvemshop          → docs/domains/NUVEMSHOP_INTEGRATION.md
Sincronização      → docs/domains/SYNC_ENGINE.md
Reconciliação      → docs/domains/RECONCILIATION_ENGINE.md   (backend do Apply existe, tela ainda não)
Segurança          → docs/SECURITY.md
Backup / restore   → docs/operations/BACKUP_RECOVERY.md
Testes             → docs/testing/TESTING.md   (baseline em docs/testing/BASELINE.md)
Ambiente local     → docs/operations/DEVELOPMENT.md
Dívida técnica     → docs/architecture/TECH_DEBT.md
Próxima fase       → docs/domains/ROADMAP_RECONCILIATION.md
Publicar a API     → api/DEPLOY.md
Montar o dashboard → src/README.md
Camada agentic     → .claude/README.md   (permissões, hooks, modelos)
WSL2 / sandbox     → docs/operations/WSL2_MIGRATION.md
```

## Regra de contexto

**Não leia todos os documentos em toda tarefa.** Carregue só o necessário —
o resto é token gasto sem retorno.

- **Nunca** abra `dashboard.html`: é gerado e embute o SheetJS. A fonte do
  painel é `src/dashboard.tpl.html`. `index.html` é a fonte real da tela de
  Etiquetas (editável, com cuidado — é módulo legado estável) — `build.py`
  só lê CSS e SheetJS de dentro dele, não o escreve.
- Tarefa no painel **novo** (React/TS/Vite) mora em `frontend/` e não precisa
  do `dashboard.tpl.html` — os dois convivem e o backend é o mesmo.
- **Nunca** abra `src/dashboard.tpl.html` inteiro (13.948 linhas). Ache com
  `grep -n`, leia a faixa com `sed -n`.
- Use o subagente `repo-explorer` para "onde acontece X?" — ele responde em
  contexto próprio e devolve só a conclusão.

Estratégia completa: [docs/operations/CLAUDE_CONTEXT_STRATEGY.md](docs/operations/CLAUDE_CONTEXT_STRATEGY.md)

## Skills deste projeto

Carregue **sob demanda**, uma de cada vez. Skill carregada "por precaução" é
token gasto sem retorno.

| Skill | Quando |
|---|---|
| `marquesa-context` | precisa entender uma regra de negócio |
| `inventory` | estoque, cadastro, peças novas, quantidade, foto, planilha |
| `marquesa-safe-import` | o mecanismo do importador — CSV, XLSX, catálogo |
| `marquesa-sync` | Nuvemshop, pedidos, SKU, variantes, `sync.js` |
| `marquesa-reconciliation` | divergência, duplicado, conflito, revisão humana |
| `safe-d1-change` | desenhar schema, migration, índice |
| `database-dev` | operação segura no D1; PROD real primeiro, DEV auxiliar |
| `deploy-dev` | publicar/verificar DEV quando ele for útil, nunca como gate |
| `ui-verification` | provar que a tela funciona (Playwright), sem inspeção humana |
| `pre-deploy-check` | antes de qualquer deploy |

## Regras por caminho e travas automáticas

`.claude/rules/` entra sozinho no contexto conforme o arquivo que você toca —
`frontend.md`, `api.md`, `database.md`, `business-rules.md`. Não os leia por
conta própria; eles chegam quando são úteis.

Duas travas rodam antes de você: `PreToolUse` deixa Classe C seguir e pede
decisão explícita somente para Classe D, além de impedir leitura de segredo;
`Stop` cobra a verificação uma vez por sessão. Configurações de Codex devem
espelhar esse comportamento, nunca criar uma segunda política. Ver
[.claude/README.md](.claude/README.md).

## Subagentes

| Agente | Quando | Modelo |
|---|---|---|
| `repo-explorer` | "onde acontece X?" — exploração barata, somente leitura | haiku |
| `verifier` | provar que a mudança funciona; caçar regressão | sonnet |
| `database-guardian` | schema, integridade, contagens, antes/depois no D1 | sonnet |
| `architect` | mudança que atravessa frontend + API + banco | opus |

Use subagente quando a investigação geraria muita saída. Tarefa trivial não
merece Opus nem subagente.

## Operação production-first

PROD é a referência real. Antes de publicar, confira diretamente commit,
Worker, bindings, D1/schema, migrations e configurações implantadas. DEV
(`develop` / `marquesa-api-staging` / `marquesa-db-dev`) é auxiliar: pode ser
usado quando acrescenta evidência, mas nunca é gate, fonte de verdade ou
pré-requisito para produção.

Quando uma tarefa pede implementação, correção ou conclusão de release, o
agente pode executar merge, push, migration, deploy, secret técnico,
validação e rollback necessários. Classe C requer preflight, backup quando
há risco de dados, rollback preparado e validação pós-deploy — não execução
humana. Classe D (apagar dados/recursos, zerar estoque, force-push, reescrever
histórico ou decidir regra empresarial não solicitada) exige instrução humana
explícita. A régua completa está em [docs/SECURITY.md](docs/SECURITY.md).

Este é o clone real de `gustavodemelomartins-hub/Marquesa-Etiquetas`, com o
histórico completo e `origin` configurado. Nunca publique uma branch antiga
por cima de uma produção mais nova; reconcilie primeiro.

## Ciclo de trabalho

```
1. leia a regra    → api/REGRAS.md + o documento de docs/ do assunto
2. edite           → api/src/*.js · src/dashboard.tpl.html · frontend/src/
3. build           → python src/build.py        (se mexeu no painel legado)
                     cd frontend && npm run build (se mexeu no novo)
4. teste           → banco limpo + Worker local + a suíte
5. confira a razão → GET /api/estoque/conferir  tem que voltar vazio
6. diff            → git diff   (--ignore-cr-at-eol para o dashboard.html)
```

Comandos, variáveis do `.dev.vars` e as particularidades de Windows estão em
[docs/operations/DEVELOPMENT.md](docs/operations/DEVELOPMENT.md).

## Definição de pronto

"Editei o arquivo" **não** é pronto. Pronto é verificação executada,
proporcional à mudança — direcionada, nunca a suíte inteira por reflexo:

| Mudou | Prova |
|---|---|
| `api/src/**` | o teste do assunto (`docs/testing/TESTING.md`) + `GET /api/estoque/conferir` vazio |
| `src/dashboard.tpl.html` | `python src/build.py` e depois `node src/e2e.mjs` |
| foto, variação, SKU | `src/editar-peca-test.mjs` · `src/editar-peca-ui-test.mjs` · `src/fotos-catalogo-test.mjs` · `src/sku-auditoria-test.mjs` · `src/sku-gerador-test.mjs` |
| Pendências / Nuvemshop | `src/pendencias-nuvemshop-test.mjs` |
| Vendas, Clientes, histórico | `src/vendas-reconstrucao-test.mjs` · `src/categoria-nome-test.mjs` · `src/revendedora-nao-e-cliente-test.mjs` (puros) · `src/vendas-historico-test.mjs` · `src/trocar-planilha-test.mjs` · `src/vendas-clientes-ui-test.mjs` |
| Preço, desconto na venda | `src/venda-desconto-test.mjs` · `src/e2e.mjs` |
| Revendedoras / Anexo I | `src/revendedoras-test.mjs` |
| `frontend/src/**` | `cd frontend && npm test && npm run build` |
| schema ou migration | contagens antes/depois, cada delta explicado, razão fechando |
| publicado no DEV | smoke test do endereço publicado |

Não deu para rodar? Diga **isso**, em vez de chamar a mudança de pronta. E
diga sempre o que ficou de fora.

## Ponto de retorno

Tag local `checkpoint/pre-bootstrap-claude` (commit `f3f08cb`, o último antes
do bootstrap) + tarball em `../Marquesa-Etiquetas-backups/`. Como voltar:
[docs/operations/BACKUP_RECOVERY.md](docs/operations/BACKUP_RECOVERY.md).
