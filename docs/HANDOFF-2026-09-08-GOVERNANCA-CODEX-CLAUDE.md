# Handoff — governança Codex + Claude

Data: 2026-09-08

## Resultado executivo

A governança **versionada** foi simplificada e está coerente: production-first,
Classe C autônoma após gates, Classe D com decisão humana explícita, proteção
de secrets/dados reais e PROD como fonte operacional.

A governança **efetiva do Codex nesta máquina ainda não está totalmente
coerente**, por uma limitação externa comprovada: `.codex/` e `.agents/`
estão graváveis para o dono do diretório, mas montados como somente leitura
para as ferramentas desta sessão e têm ACLs `Deny` antigas. O hook e as skills
locais continuam com o modelo human-only. Não houve tentativa de contorno.

Portanto, a resposta honesta ao critério de encerramento é:

> Claude e a camada versionada estão coerentes. Codex ainda carrega adaptadores
> locais conflitantes neste host; falta somente alinhar/versionar esses
> adaptadores quando a plataforma permitir escrita neles.

## Limites respeitados

- checkpoint inicial confirmado em
  `67154925524918b560de1a312442546371239405`, branch
  `codex/especificacao-mestra-2026-09-07`;
- nenhum deploy, push, migration remota, secret ou escrita em PROD;
- nenhum acesso a valor de secret ou dado pessoal;
- Pacote 5 e a reestruturação geral não foram iniciados;
- `.codex/` não foi apagado nem modificado por outro mecanismo;
- `.agents/` não foi apagado nem modificado por outro mecanismo.

## Hierarquia final

```text
decisão humana atual
  ├─ Codex: AGENTS.override.md local → lê AGENTS.md versionado
  └─ Claude: CLAUDE.local.md local → CLAUDE.md versionado
          ↓
docs/SECURITY.md          política operacional, ambientes e risco
api/REGRAS.md             regras de negócio
          ↓
rules / skills            procedimento especializado, sem mudar a política
          ↓
runbooks / handoffs       evidência temporal e histórico
```

Políticas do host (sandbox, auto-review e permissões da conta) ficam acima do
repositório por natureza, mas devem ser identificadas como externas. Elas não
podem ser descritas como decisão do projeto.

## Mapa das fontes de instrução

| Arquivo/regra | Consumidor | Finalidade | Prioridade | Estado/conflito |
|---|---|---|---|---|
| políticas do host Codex | ferramentas do Codex | sandbox, aprovação e escrita | externa/máxima | impõem read-only a `.codex/.agents`; não pertencem ao repo |
| `AGENTS.override.md` | Codex local | ponte para o vault privado | local, antes de `AGENTS.md` | corrigido para mandar ler `AGENTS.md`; ignorado em `.git/info/exclude` |
| `AGENTS.md` | Codex em clones sem override | roteador do projeto | raiz versionada | hierarquia e papel dos adaptadores explicitados |
| `CLAUDE.local.md` | Claude local | ponte para o vault privado | local | curto, sem política concorrente, ignorado em `.git/info/exclude` |
| `CLAUDE.md` | Claude Code | roteador do projeto | raiz versionada | hierarquia explicitada |
| `docs/SECURITY.md` | ambos | política production-first e classes A–D | canônica operacional | fonte única; approval antigo revogado |
| `api/REGRAS.md` | ambos | invariantes e decisões de negócio | canônica de negócio | não alterado nesta etapa |
| `.claude/settings.json` | Claude Code | permissões e registro de hooks | adaptador versionado | config/schema/infra e Classe C liberados; Classe D continua `ask` |
| `.claude/hooks/*` | Claude Code | classificação mecânica + lembrete de teste | adaptador versionado | 23/23; approval legado removido |
| `.claude/rules/*` | Claude Code por caminho | contexto especializado | subordinada | PROD/D1 e dados de DEV corrigidos |
| `.claude/skills/*` | Claude sob demanda | workflows especializados | subordinada | production-first; importação corrigida |
| `.claude/agents/*` | Claude subagentes | papéis especializados | subordinada | coerente; `database-guardian` conhece os três D1 |
| `.codex/hooks.json` + hooks | Codex local | hooks de projeto | adaptador local | **divergente**; caminho absoluto e human-only |
| `.codex/agents/*` | Codex subagentes | papéis especializados | adaptador local | `database-guardian` ainda chama `marquesa-db` de PROD |
| `.agents/skills/*` | Codex sob demanda | workflows especializados | adaptador local | 8 de 10 diferem hoje da cópia Claude |
| `.claude/settings.local.json` | Claude local | exceções pessoais | local | removido: continha permissões one-off e caminho para outro projeto |
| docs datados/handoffs/ADRs | humanos e agentes | histórico/proveniência | baixa/temporal | não podem superar SECURITY/REGRAS/decisão atual |
| memória `Marquesa-AI` | ambos | canonical, decisões e estado | externa privada | ainda registra DEC-2026-006 antiga; requer writeback fora deste sandbox |

## Por que a divergência ocorreu

Não foi uma única “governança”. Foram quatro causas separadas:

1. **Cópias locais sem sincronização.** `.agents/` nasceu em 19–20/08 e
   `.codex/` em 27/08; `.claude/` foi atualizada em 08/09. Como as duas
   primeiras não são rastreadas, a mudança versionada não chegou nelas.
2. **Descoberta do Codex.** Segundo a documentação oficial, o
   `AGENTS.override.md` do diretório substitui o `AGENTS.md` do mesmo nível.
   Assim, o override local antigo escondia o roteador versionado.
3. **Filesystem/plataforma.** Os diretórios não têm atributo Windows
   `ReadOnly`, mas possuem ACEs `Deny` explícitas para dois SIDs antigos não
   resolvíveis. A sessão atual usa outro SID e, adicionalmente, o sandbox da
   plataforma declara `.codex/` e `.agents/` como read-only. O teste Codex
   falha com `EPERM` ao criar `.codex/hooks/__fixturas__`.
4. **Auto-review externo.** `apply_patch` recusou a atualização de
   `.agents/skills/database-dev/SKILL.md` como redução de salvaguarda. Essa
   mensagem veio da ferramenta da plataforma, não de Git, hook, script ou
   regra do repositório. Nenhum workaround foi usado.
5. **Writeback da memória recusado.** A tentativa de marcar
   `DEC-2026-006` como superada, criar `DEC-2026-010` e atualizar
   `Seguranca-Producao.md` foi recusada pelo mesmo revisor externo, que
   classificou a ampliação da Classe C como risco não autorizado. O patch não
   foi aplicado e não houve tentativa indireta de escrita no vault.

## Estado de `.codex/`

Decisão: **não apagar e não ignorar permanentemente**. Deve virar adaptador de
projeto versionado, portátil e subordinado a `docs/SECURITY.md`.

Estado atual:

- não rastreado e não ignorado;
- `hooks.json` contém caminho absoluto para esta máquina;
- hook antigo nega push em main, deploy, migration, secret, force-push e DROP;
- teste completo não inicia por `EPERM`;
- três agentes estão materialmente alinhados; `database-guardian` não está.

Alinhamento pendente, quando houver escrita:

1. trocar os comandos de `.codex/hooks.json` por caminhos relativos para os
   hooks versionados `.claude/hooks/*` (uma implementação, dois adaptadores);
2. remover os hooks duplicados de `.codex/hooks/` ou transformá-los em wrappers
   mínimos;
3. alinhar `database-guardian.toml` ao alvo `marquesa-db-prod`;
4. versionar `.codex/hooks.json` e `.codex/agents/*.toml`;
5. executar `node scripts/governance-local-audit.mjs` até retornar zero.

## Estado de `.agents/`

Decisão: **versionar como skills de equipe do Codex**, conforme a documentação
oficial; não manter como cópia pessoal ignorada.

Estado atual:

- ignorado por `.gitignore`;
- consumido pelo Codex desta sessão;
- 8 skills divergentes após esta correção; 2 continuam byte a byte iguais;
- divergências críticas: banco de produção antigo, DEV como gate e execução
  humana obrigatória para deploy/migration.

Alinhamento pendente, quando houver escrita:

1. sincronizar cada `SKILL.md` com a versão `.claude/skills/` correspondente;
2. remover `.agents/` do `.gitignore`;
3. versionar as 10 skills;
4. manter um teste de paridade ou gerar uma das duas árvores a partir da outra.

## Governança legada

Removido da camada versionada:

- `.claude/hooks/lib/release-approval.mjs`;
- `.claude/hooks/lib/release-approval.test.mjs`;
- `.claude/approvals/README.md`;
- `.claude/approvals/EXEMPLO.json`.

O runtime ignorado (`production-release.json`, `audit.log.jsonl`) não é mais
consultado. Arquivos locais antigos podem permanecer no disco como histórico,
mas não são fonte nem gate.

Mecanismos mantidos:

- hook production-first: útil para distinguir Classe C/D e inspecionar SQL;
- hook de Stop: útil como lembrete único de verificação proporcional;
- hard-denies/asks de Classe D;
- bloqueio de leitura de secrets, backups e seeds reais;
- gates de preflight, backup, rollback e pós-validação.

## Alterações realizadas

- acrescentada hierarquia explícita em `AGENTS.md` e `CLAUDE.md`;
- corrigidos `marquesa-db-prod` e a separação dados PROD × DEV;
- liberadas em `.claude/settings.json` alterações locais de config/schema/infra
  e instalação de dependências, mantendo destruição em `ask`;
- removidas permissões locais one-off de `.claude/settings.local.json`;
- removido o Production Release Approval versionado e sua documentação;
- simplificado `.claude/README.md`;
- corrigida a skill de importação real;
- `.tmp/` passou a ser ignorado como artefato descartável;
- criados testes para camada versionada e auditoria local Codex;
- criado este handoff.

## Testes e evidências

| Prova | Resultado |
|---|---|
| parse de `.claude/settings.json` | passou |
| `.claude/hooks/protect-production.test.mjs` | 23/23 |
| `scripts/governance-versioned.test.mjs` | 27/27 |
| `node --check` em hooks e testes | passou |
| `git diff --check` | passou |
| matriz direta Claude | Classe C allow · Classe D ask · secrets deny |
| matriz direta Codex local | Classe C/D deny · secret deny (**divergente**) |
| `.codex/hooks/protect-production.test.mjs` | não inicia: `EPERM` na fixture |
| `scripts/governance-local-audit.mjs` | falha esperada: 16 divergências locais |

Não foi necessário rodar frontend/API/banco: nenhuma linha funcional, schema
ou migration foi alterada.

## Próxima ação exata

Executar o alinhamento de `.codex/` e `.agents/` em uma sessão cujo filesystem
permita escrita nesses diretórios. Depois:

```bash
node scripts/governance-versioned.test.mjs
node scripts/governance-local-audit.mjs
node .claude/hooks/protect-production.test.mjs
```

Todos devem passar. Só então a resposta ao critério global muda para “sim” e
qualquer release de PROD pode ser retomada. Até lá, nenhuma release deve usar
o hook Codex antigo como justificativa de política; ele é um bloqueio externo
documentado, não uma decisão vigente.

Em uma sessão que aceite a autorização de governança no vault privado,
registrar `DEC-2026-010` como sucessora de `DEC-2026-006`, marcar a decisão
antiga como `superseded` e atualizar `01_CANONICAL/Seguranca-Producao.md` para
Classes A–D e ausência de approval efêmero. Este writeback deve descrever
explicitamente que Classe C exige os gates proporcionais e que Classe D/hard
denies continuam humanos; não copiar o vault para este repositório.

## Referências externas verificadas

- [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Codex skills](https://learn.chatgpt.com/docs/customization/skills)
