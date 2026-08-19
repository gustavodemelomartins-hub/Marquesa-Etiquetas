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

| Skill | Quando |
|---|---|
| `marquesa-context` | precisa entender uma regra de negócio |
| `marquesa-sync` | Nuvemshop, pedidos, SKU, variantes, `sync.js` |
| `marquesa-safe-import` | CSV, planilha, catálogo, importação |
| `marquesa-reconciliation` | divergência, duplicado, conflito, revisão humana |
| `safe-d1-change` | schema, migration, índice, qualquer mudança no D1 |
| `pre-deploy-check` | antes de qualquer deploy |

## Nunca execute sem instrução humana explícita

```
git reset --hard · git clean -fd · git push --force
DROP TABLE · DROP DATABASE · DELETE ou UPDATE em massa sem filtro validado
wrangler deploy
wrangler d1 execute --remote  (com qualquer escrita)
wrangler d1 time-travel restore · wrangler d1 delete
POST /api/sync {"forcar": true}  contra produção
```

Este é o clone real de `gustavodemelomartins-hub/Marquesa-Etiquetas`, com o
histórico completo e `origin` configurado. Justamente por isso: `push` só
quando alguém pedir, e `push --force` **nunca**.

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

## Ponto de retorno

Tag local `checkpoint/pre-bootstrap-claude` (commit `f3f08cb`, o último antes
do bootstrap) + tarball em `../Marquesa-Etiquetas-backups/`. Como voltar:
[docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md).
