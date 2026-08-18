# Configuração do Claude Code deste projeto

Versionada de propósito: é o que faz o próximo desenvolvedor — humano ou
agente — receber as mesmas regras de segurança.

```
.claude/
├── settings.json          permissões: o que roda direto, o que pergunta, o que é proibido
├── agents/
│   └── repo-explorer.md   subagente somente leitura, para exploração barata
└── skills/
    ├── marquesa-context/       regras de negócio
    ├── marquesa-sync/          Nuvemshop, pedidos, SKU, variantes
    ├── marquesa-safe-import/   CSV, planilha, catálogo
    ├── marquesa-reconciliation/ divergências e conflitos
    ├── safe-d1-change/         qualquer mudança no banco
    └── pre-deploy-check/       antes de publicar
```

O que **não** entra aqui: skills instaladas por `npx skills add` (~39 MB,
quase tudo imagem) e `settings.local.json`. Ambos ficam no `.gitignore`.

## settings.json

Três listas, alinhadas com as classes de operação de
[docs/SECURITY.md](../docs/SECURITY.md):

| Lista | Significado | Classe |
|---|---|---|
| `allow` | roda sem perguntar | A (leitura, teste local, build) |
| `ask` | pergunta antes | B (edição, commit, D1 local, export) |
| `deny` | **bloqueado**, mesmo com aprovação no prompt | C (destrutivo) |

O `deny` cobre Git destrutivo, deploy, escrita no D1 remoto, restore por
Time Travel, remoção de banco e manipulação de Secrets. Também bloqueia a
**leitura** de `.dev.vars`, `.env*`, `seed.sql` e `backups/` — segredo e
dado real de cliente não precisam entrar no contexto de um agente.

Bloqueio não é a mesma coisa que impossibilidade: uma pessoa continua
podendo rodar esses comandos no terminal dela. O que a lista impede é o
agente fazer isso sozinho.

## Como o contexto é economizado

Ver [docs/CLAUDE_CONTEXT_STRATEGY.md](../docs/CLAUDE_CONTEXT_STRATEGY.md).
Em uma frase: `CLAUDE.md` curto como roteador, detalhe em `docs/`, skills
sob demanda, e exploração num subagente que não polui o contexto principal.
