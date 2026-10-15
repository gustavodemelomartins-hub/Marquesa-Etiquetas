# Marquesa Dev Agent v0.1

Configuração do Claude Code deste projeto. Versionada de propósito: é o que
faz o próximo desenvolvedor — humano ou agente — receber as mesmas regras de
segurança.

> **Governança vigente (2026-09-08): production-first.** Classe C é
> autônoma após gates; DEV não é gate. A fonte única de segurança operacional
> é [docs/SECURITY.md](../docs/SECURITY.md).

**Este arquivo não entra no contexto automaticamente.** É referência para
quem for mexer na configuração. O que entra em toda sessão é o `CLAUDE.md`;
rules e skills entram somente quando o caminho ou o assunto as aciona.

```
.claude/
├── README.md              este arquivo — não entra em contexto
├── settings.json          allow / ask / deny + registro dos hooks
├── rules/                 carregadas por PATH, sozinhas
│   ├── frontend.md        frontend/** · src/dashboard.tpl.html · src/build.py
│   ├── api.md             api/src/** · api/wrangler.toml
│   ├── database.md        api/schema.sql · api/migracao-*.sql · estoque.js · reconciliacao.js
│   └── business-rules.md  api/src/** · frontend/src/** · dashboard.tpl.html · REGRAS.md
├── skills/                carregadas SOB DEMANDA, pelo assunto
│   ├── marquesa-context/        regras de negócio — para onde apontar
│   ├── inventory/               estoque, peças novas, foto, planilha
│   ├── marquesa-safe-import/    o mecanismo do importador
│   ├── marquesa-sync/           Nuvemshop, pedidos, SKU, variantes
│   ├── marquesa-reconciliation/ divergência, duplicidade, conflito
│   ├── safe-d1-change/          desenhar schema e migration
│   ├── database-dev/            operar D1 partindo do PROD real
│   ├── deploy-dev/              publicar DEV opcionalmente
│   ├── ui-verification/         provar a tela com Playwright
│   └── pre-deploy-check/        checklist antes de publicar
├── agents/                contexto próprio, devolvem só a conclusão
│   ├── repo-explorer.md     haiku  · "onde acontece X?" (somente leitura)
│   ├── verifier.md          sonnet · roda o teste e dá o veredito
│   ├── database-guardian.md sonnet · integridade e contagens no D1
│   └── architect.md         opus   · mudança que atravessa camadas
├── hooks/                 determinísticos, rodam antes do agente
│   ├── protect-production.mjs       PreToolUse(Bash) — separa Classe C/D
│   ├── protect-production.test.mjs  prova autonomia C + proteção D
│   └── verify-before-stop.mjs       Stop — cobra verificação, 1x por sessão
```

`marquesa-reconciliation` e `marquesa-sync` **são** as skills de
reconciliação e de Nuvemshop. Os nomes ficaram como estavam porque
`docs/operations/CLAUDE_SKILLS.md` e o `CLAUDE.md` já apontam para eles — renomear
custaria mais do que resolveria.

O que **não** entra aqui: skills instaladas por `npx skills add` (~39 MB,
quase tudo imagem) e `settings.local.json`. Ambos no `.gitignore`.

## Três camadas complementares

| Camada | Onde | O que pega |
|---|---|---|
| 1. Permissões | `settings.json` | prefixo de comando · caminho de arquivo |
| 2. Hook | `protect-production.mjs` | o que prefixo não distingue |
| 3. Regra escrita | `CLAUDE.md`, `rules/`, `docs/SECURITY.md` | contexto e julgamento |

`settings.json` libera o trabalho normal e mantém segredos/arquivos gerados
fora do contexto. O hook não decide se uma release foi bem preparada; ele
classifica apenas o que pode ser reconhecido mecanicamente:

- Classe C (push normal, deploy, migration, secret técnico e rollback) segue;
- Classe D (destruição de recurso/dados, Git destrutivo e SQL extraordinário)
  retorna `ask` com alvo e risco concretos;
- leitura de `.dev.vars`, `.env`, backups e seeds reais retorna `deny`;
- SQL em `--file` e `--command` é inspecionado antes da execução.

O hook analisa por segmento e ignora corpo de heredoc: documentar um comando
perigoso não é executá-lo. O antigo Production Release Approval foi removido;
segurança de release vem dos gates e evidências de `docs/SECURITY.md`.

### Depois de mexer no hook

```bash
node .claude/hooks/protect-production.test.mjs
```

## Estratégia de modelo

| Tarefa | Modelo |
|---|---|
| Investigação mecânica, "onde está X", listar chamadores | haiku (`repo-explorer`) |
| Desenvolvimento comum, teste, correção localizada | sonnet |
| Arquitetura entre camadas, regra de estoque ambígua, decisão difícil | opus |

Opus por reflexo em tarefa trivial é desperdício. Agent Team: não, ainda não.
Subagente é para quando a investigação geraria muita saída — ele lê no
contexto dele e devolve só a conclusão.

`/context` e `/usage` mostram para onde o token está indo. Meça antes de
otimizar.

## Portabilidade

Nada aqui depende de VPS, orquestrador ou provedor. Os hooks são Node puro,
sem dependência — rodam igual no Windows, no WSL2, em container ou em outra
máquina. A fonte da verdade da configuração é este diretório, versionado no
Git. Serviço externo, quando existir, é executor substituível — nunca o lugar
onde a regra mora.

## MCP

Nenhum, de propósito. `git`, `gh` e `wrangler` cobrem o que precisamos, e
cada MCP declarado custa contexto em toda sessão mesmo sem ser usado. A
avaliação está em [docs/operations/WSL2_MIGRATION.md](../docs/operations/WSL2_MIGRATION.md).

## Economia de contexto

Ver [docs/operations/CLAUDE_CONTEXT_STRATEGY.md](../docs/operations/CLAUDE_CONTEXT_STRATEGY.md).
Em uma frase: `CLAUDE.md` curto como roteador, regras por caminho, skills sob
demanda, e exploração num subagente que não polui o contexto principal.
