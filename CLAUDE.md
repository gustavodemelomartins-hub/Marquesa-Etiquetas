@AGENTS.md

# Particularidades do Claude Code

Tudo o que vale para qualquer agente está no `AGENTS.md` importado acima.
Aqui fica só o que depende do Claude Code.

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

Duas travas são configuradas: `PreToolUse` exige decisão para Classe D e
Classe C em PROD congelada, além de impedir leitura de segredo;
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
