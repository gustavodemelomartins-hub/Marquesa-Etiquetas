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
7. **Operação crítica precisa de autorização humana explícita** — migration,
   deploy, restore, escrita em massa, Git destrutivo. Ver
   [docs/SECURITY.md](docs/SECURITY.md).
8. **[api/REGRAS.md](api/REGRAS.md) é a fonte fundamental das regras de
   negócio.** Leia antes de mudar comportamento; não o duplique em lugar
   nenhum.
9. **O que o sistema decide não fazer é anunciado, nunca engolido.**

## Onde procurar informação

```
Regras de negócio  → api/REGRAS.md
Arquitetura        → docs/ARCHITECTURE.md
Frontend React/TS  → docs/FRONTEND_ARCHITECTURE.md
Banco              → docs/DATA_MODEL.md
Nuvemshop          → docs/NUVEMSHOP_INTEGRATION.md
Sincronização      → docs/SYNC_ENGINE.md
Reconciliação      → docs/RECONCILIATION_ENGINE.md   (backend do Apply existe, tela ainda não)
Segurança          → docs/SECURITY.md
Backup / restore   → docs/BACKUP_RECOVERY.md
Testes             → docs/TESTING.md   (baseline em docs/BASELINE.md)
Ambiente local     → docs/DEVELOPMENT.md
Dívida técnica     → docs/TECH_DEBT.md
Próxima fase       → docs/ROADMAP_RECONCILIATION.md
Publicar a API     → api/DEPLOY.md
Montar o dashboard → src/README.md
Camada agentic     → .claude/README.md   (permissões, hooks, modelos)
WSL2 / sandbox     → docs/WSL2_MIGRATION.md
```

## Regra de contexto

**Não leia todos os documentos em toda tarefa.** Carregue só o necessário —
o resto é token gasto sem retorno.

- **Nunca** abra `dashboard.html` nem `index.html`: são gerados e embutem o
  SheetJS. A fonte do painel é `src/dashboard.tpl.html`.
- Tarefa no painel **novo** (React/TS/Vite) mora em `frontend/` e não precisa
  do `dashboard.tpl.html` — os dois convivem e o backend é o mesmo.
- **Nunca** abra `src/dashboard.tpl.html` inteiro (3.802 linhas). Ache com
  `grep -n`, leia a faixa com `sed -n`.
- Use o subagente `repo-explorer` para "onde acontece X?" — ele responde em
  contexto próprio e devolve só a conclusão.

Estratégia completa: [docs/CLAUDE_CONTEXT_STRATEGY.md](docs/CLAUDE_CONTEXT_STRATEGY.md)

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
| `database-dev` | **executar** comando no D1 — prova que o alvo é DEV |
| `deploy-dev` | publicar e verificar `marquesa-dev` / `marquesa-api-staging` |
| `ui-verification` | provar que a tela funciona (Playwright), sem inspeção humana |
| `pre-deploy-check` | antes de qualquer deploy |

## Regras por caminho e travas automáticas

`.claude/rules/` entra sozinho no contexto conforme o arquivo que você toca —
`frontend.md`, `api.md`, `database.md`, `business-rules.md`. Não os leia por
conta própria; eles chegam quando são úteis.

Duas travas rodam antes de você: `PreToolUse` bloqueia deploy, escrita em
`marquesa-db`/`marquesa-fotos`, force push, push em `main`, secret e SQL
destrutivo — em qualquer ambiente. `Stop` cobra a verificação uma vez por
sessão. Ver [.claude/README.md](.claude/README.md).

## Subagentes

| Agente | Quando | Modelo |
|---|---|---|
| `repo-explorer` | "onde acontece X?" — exploração barata, somente leitura | haiku |
| `verifier` | provar que a mudança funciona; caçar regressão | sonnet |
| `database-guardian` | schema, integridade, contagens, antes/depois no D1 | sonnet |
| `architect` | mudança que atravessa frontend + API + banco | opus |

Use subagente quando a investigação geraria muita saída. Tarefa trivial não
merece Opus nem subagente.

## DEV é livre. PROD exige autorização a cada vez.

Existe um ambiente de desenvolvimento na nuvem — `develop` → Worker
`marquesa-api-staging` → D1 `marquesa-db-dev` → Cloudflare Pages
`marquesa-dev.pages.dev`. Descartável de propósito: quebrar, importar
planilha errada ou testar reconciliação ali nunca afeta produção. Detalhe
completo em [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

- **Push em `develop` depois de testes verdes → permitido sem pedir.**
  Dispara o deploy automático DEV.
- **Merge em `main` → exige autorização humana explícita.**
- **Deploy de produção (`wrangler deploy` sem `--env`, ou a conexão Git de
  produção) → exige autorização humana explícita.**
- **Migration no D1 de produção (`marquesa-db`) → exige autorização humana
  explícita + backup recente confirmado.**

## Nunca execute sem instrução humana explícita

```
git reset --hard · git clean -fd · git push --force
DROP TABLE · DROP DATABASE · DELETE ou UPDATE em massa sem filtro validado
wrangler deploy                              (qualquer ambiente — ver acima)
wrangler d1 execute --remote  (com qualquer escrita em marquesa-db, produção)
wrangler d1 time-travel restore · wrangler d1 delete
POST /api/sync {"forcar": true}  contra produção
merge de develop/feature/* em main
```

`marquesa-db-dev` é isento da regra de `wrangler d1 execute --remote`
acima — é descartável, existe só para isso. `marquesa-db` (produção)
continua exigindo autorização a cada vez, sem exceção.

Este é o clone real de `gustavodemelomartins-hub/Marquesa-Etiquetas`, com o
histórico completo e `origin` configurado. `push` em `develop` é rotina;
`push` em `main` e `push --force` em qualquer branch só quando alguém
pedir explicitamente, e `--force` **nunca**.

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
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Definição de pronto

"Editei o arquivo" **não** é pronto. Pronto é verificação executada,
proporcional à mudança — direcionada, nunca a suíte inteira por reflexo:

| Mudou | Prova |
|---|---|
| `api/src/**` | o teste do assunto (`docs/TESTING.md`) + `GET /api/estoque/conferir` vazio |
| `src/dashboard.tpl.html` | `python src/build.py` e depois `node src/e2e.mjs` |
| `frontend/src/**` | `cd frontend && npm test && npm run build` |
| schema ou migration | contagens antes/depois, cada delta explicado, razão fechando |
| publicado no DEV | smoke test do endereço publicado |

Não deu para rodar? Diga **isso**, em vez de chamar a mudança de pronta. E
diga sempre o que ficou de fora.

## Ponto de retorno

Tag local `checkpoint/pre-bootstrap-claude` (commit `f3f08cb`, o último antes
do bootstrap) + tarball em `../Marquesa-Etiquetas-backups/`. Como voltar:
[docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md).
