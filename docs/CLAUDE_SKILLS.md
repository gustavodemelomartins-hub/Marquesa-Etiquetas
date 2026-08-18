# Skills e plugins do Claude Code — avaliação

Curadoria do que vale a pena para **esta** stack: HTML/CSS/JS vanilla,
Cloudflare Worker, D1/SQLite, Nuvemshop, testes em Node puro.

Nenhuma instalação foi feita nesta etapa. Este documento é a decisão, não a
execução.

## Método

1. **Fonte, nesta ordem:** Anthropic/oficial → fornecedor oficial da
   tecnologia → repositório amplamente reconhecido → comunidade.
   Listas do tipo `awesome` servem para **descoberta**, nunca como selo de
   segurança.
2. **Avaliação de segurança antes de recomendar** (Fase 11): que scripts
   executa, que comandos shell dispara, se acessa a rede, que permissões
   pede, se lê segredo, se escreve arquivo, se traz dependência externa, e
   se há instrução escondida no prompt.
3. **Custo de contexto:** uma skill custa nome + descrição em **toda**
   sessão, mesmo sem ser usada. Muitas skills irrelevantes é dinheiro
   queimado em toda tarefa.
4. Sem verificação suficiente → `AVALIAR — confiança insuficiente`, e **não
   se instala**.

## Inventário atual desta máquina

Levantado do disco, não presumido.

| Onde | O que está instalado |
|---|---|
| Marketplaces conhecidos | `claude-plugins-official` (Anthropic), `caveman` (comunidade, `JuliusBrussee/caveman`) |
| Plugins instalados (escopo usuário) | `canva`, `caveman`, `claude-code-setup` |
| Skills em `~/.claude/skills/` | 13 skills oficiais da Cloudflare: `cloudflare`, `wrangler`, `workers-best-practices`, `web-perf`, `durable-objects`, `agents-sdk`, `cloudflare-email-service`, `cloudflare-one`, `cloudflare-one-migrations`, `sandbox-stable`, `sandbox-next`, `sandbox-migrate-to-next`, `turnstile-spin` |
| Skills do projeto | `.claude/skills/` — as seis criadas nesta etapa |
| Catálogo oficial disponível | 286 plugins em `claude-plugins-official` |

**As skills da Cloudflare que este projeto usa já estão instaladas.** Não há
o que adicionar para Workers, D1 e Wrangler.

---

## Tabela de decisão

| Skill / plugin | Origem | Função | Relevância | Segurança | Tokens | Instalar? |
|---|---|---|---|---|---|---|
| `cloudflare` | Cloudflare (oficial) | Workers, D1, KV, R2, plataforma | **Alta** — é a stack | Consulta docs; sem shell próprio | Baixo | **JÁ INSTALADA** |
| `wrangler` | Cloudflare (oficial) | Sintaxe correta do CLI antes de rodar | **Alta** — evita comando inventado em D1 | Orienta comandos; quem executa é o agente sob as regras de `SECURITY.md` | Baixo | **JÁ INSTALADA** |
| `workers-best-practices` | Cloudflare (oficial) | Revisa e escreve Worker contra boas práticas | **Alta** | Leitura/revisão | Baixo | **JÁ INSTALADA** |
| `web-perf` | Cloudflare (oficial) | Core Web Vitals, render-blocking, acessibilidade | **Média** — o PWA carrega 450 KB | Precisa do Chrome DevTools MCP para medir de verdade | Médio | **JÁ INSTALADA** — usar sob demanda |
| `durable-objects`, `agents-sdk`, `sandbox-*`, `cloudflare-one*`, `cloudflare-email-service`, `turnstile-spin` | Cloudflare (oficial) | Produtos que este projeto não usa | **Nenhuma** | — | 9 descrições em toda sessão | **REMOVER** de `~/.claude/skills/` (economia direta e permanente) |
| `claude-security` | **Anthropic** | Varredura profunda de vulnerabilidade no próprio código, com cada achado contestado antes de virar relatório | **Alta** — API pública, senha única, repositório público | Roda dentro da sessão; não manda código para fora | Médio, só quando invocada | **INSTALAR** |
| `security-guidance` | **Anthropic** | Aviso por padrão em edição + revisão do diff no Stop + revisor de commit | **Alta** — pega segredo e injeção antes do commit | **Usa hooks** — executa em toda edição. Ler `hooks/` antes de ativar | Médio (hook roda sempre) | **AVALIAR** — instalar depois de ler os hooks |
| `claude-md-management` | **Anthropic** | Audita a qualidade do `CLAUDE.md` e mantém a memória do projeto em dia | **Alta** — o `CLAUDE.md` é o roteador e não pode inchar | Leitura + edição de arquivo de memória | Baixo | **INSTALAR** |
| `skill-creator` | **Anthropic** | Criar, melhorar e medir skills | **Média** — as seis skills locais vão evoluir | Leitura/escrita em `.claude/skills/` | Baixo | **AVALIAR** — só quando for mexer nas skills |
| `code-review` | **Anthropic** | Revisão de PR com múltiplos agentes e filtro de falso positivo | **Média-alta** | Só leitura | Alto **por execução** (multi-agente) | **AVALIAR** — o `/code-review` embutido já cobre o dia a dia |
| `code-simplifier` | **Anthropic** | Simplifica preservando comportamento | **Baixa agora** — refactor está fora de escopo | Edita código | Médio | **NÃO NECESSÁRIA** nesta fase |
| `frontend-design` | **Anthropic** | Interfaces de alta qualidade visual | **Baixa** — o design existe, é coerente, e redesenho está proibido | Gera código | Médio | **NÃO NECESSÁRIA** |
| `feature-dev` | **Anthropic** | Fluxo de feature com agentes de exploração e arquitetura | **Média** — útil no motor de reconciliação | Multi-agente | Alto por execução | **AVALIAR** na próxima fase |
| `commit-commands` | **Anthropic** | `commit`, `push`, criação de PR | **Baixa** — e `push` é justamente o que este repositório **não** deve fazer sem reconciliar histórico | Executa Git | Baixo | **NÃO NECESSÁRIA** — conflita com `BACKUP_RECOVERY.md` |
| `code-modernization` | **Anthropic** | Modernizar legado (COBOL, monolito) | **Nenhuma** | — | — | **NÃO NECESSÁRIA** |
| `playwright` | **Microsoft** (oficial) | MCP de automação de navegador | **Média** — o projeto já usa Playwright direto | MCP com browser real; acessa rede e páginas | Médio | **NÃO NECESSÁRIA** — o `e2e.mjs` já faz isso; o problema é o `executablePath` fixo, não a falta de ferramenta |
| `chrome-devtools-mcp` | **Google Chrome** (oficial) | Inspeciona Chrome ao vivo, trace de performance, rede, console | **Média** — pareado com `web-perf` audita o PWA | MCP controla um navegador; roda local | Médio | **AVALIAR** — útil quando o assunto for desempenho do dashboard |
| `modern-web-guidance` | **Google Chrome** (oficial) | Boas práticas atuais de web | **Média** — stack vanilla se beneficia | Consulta docs | Baixo | **AVALIAR** |
| `semgrep` | Semgrep (fornecedor) | SAST em tempo real | **Média** | Motor externo; conferir se o código sai da máquina | Médio | **AVALIAR — confiança insuficiente** sem ler a configuração de envio |
| `42crunch-api-security-testing` | 42Crunch (fornecedor) | Auditoria OWASP API a partir de OpenAPI | **Nenhuma** — não existe spec OpenAPI aqui | — | — | **NÃO NECESSÁRIA** |
| `aikido`, `ai-plugins` (Endor Labs), `coderabbit`, `jfrog` | Fornecedores de segurança | SAST, secret scanning, supply chain, revisão externa | **Baixa** — o repositório tem **zero dependências de runtime**; o risco de supply chain é quase nulo | Todos mandam código ou metadado para serviço externo | Médio | **NÃO NECESSÁRIA** — reavaliar se algum dia entrar dependência |
| `github`, `gitlab`, `gitkraken` | Fornecedores | MCP de repositório | **Baixa** — nem `remote` este clone tem | Precisa de token com escopo de escrita | Médio | **NÃO NECESSÁRIA** |
| `context7` | Upstash | Documentação sempre atual via MCP remoto | **Baixa** — as libs aqui são estáveis (SheetJS, ZXing) e as docs da Cloudflare já vêm nas skills oficiais | MCP remoto: manda a consulta para fora | Médio | **NÃO NECESSÁRIA** |
| `sentry`, `datadog`, `honeycomb` | Fornecedores | Observabilidade | **Baixa hoje** — o Worker loga em `console` e grava `sync_execucoes` | Precisa de credencial de serviço | Médio | **NÃO NECESSÁRIA** — `sync_execucoes` já responde "o que o robô fez" |
| `caveman` | Comunidade (`JuliusBrussee/caveman`) | Estilo de resposta comprimido | Preferência pessoal, já em uso | **Tem hooks que rodam PowerShell em toda sessão** | Baixo | **JÁ INSTALADA** — decisão do usuário, registrada aqui por transparência |
| `canva` | Canva (oficial) | Design no Canva | **Nenhuma** para este projeto | MCP com OAuth pendente | Baixo | **JÁ INSTALADA** — sem relação com este repositório |
| Skills de SQLite / migrations de terceiros | Comunidade | Migrations, índices, backup | **Média** na necessidade, **baixa** na oferta: o que existe é para Postgres, MySQL, ClickHouse, DuckDB. **Não há skill de D1/SQLite** no catálogo oficial | — | — | **CRIAR INTERNAMENTE** → foi o que originou `safe-d1-change` |
| Conhecimento da Nuvemshop | — | Matching de SKU, variantes, freios | **Alta** | — | — | **CRIAR INTERNAMENTE** → `marquesa-sync`, `marquesa-reconciliation` |
| Regras de negócio da Marquesa | — | Razão contábil, maleta, kit, comissão | **Alta** | — | — | **CRIAR INTERNAMENTE** → `marquesa-context` |

---

## Resumo das decisões

**INSTALAR (2)**
- `claude-security` — Anthropic. Varredura de vulnerabilidade no próprio
  código, sem mandar nada para fora.
- `claude-md-management` — Anthropic. Impede o `CLAUDE.md` de virar
  enciclopédia, que é o principal risco da estratégia de contexto adotada.

**AVALIAR (6)** — instalar só depois de ler o que executam
- `security-guidance` (hooks em toda edição)
- `skill-creator` (quando for evoluir as skills locais)
- `code-review` (custo alto por execução)
- `chrome-devtools-mcp` + `modern-web-guidance` (quando o assunto for o PWA)
- `feature-dev` (na fase do motor de reconciliação)
- `semgrep` — **confiança insuficiente** sem confirmar se o código sai da
  máquina

**NÃO NECESSÁRIA** — todo o resto da tabela. O motivo mais comum não é
qualidade: é que o projeto **não tem dependências de runtime**, não tem
OpenAPI, não usa framework de front, e as ferramentas da Cloudflare já estão
instaladas.

**CRIAR INTERNAMENTE (6)** — feitas nesta etapa, em `.claude/skills/`:
`marquesa-context`, `marquesa-sync`, `marquesa-safe-import`,
`marquesa-reconciliation`, `safe-d1-change`, `pre-deploy-check`.

**REMOVER (9)** — economia imediata, em `~/.claude/skills/`:
`durable-objects`, `agents-sdk`, `sandbox-stable`, `sandbox-next`,
`sandbox-migrate-to-next`, `cloudflare-one`, `cloudflare-one-migrations`,
`cloudflare-email-service`, `turnstile-spin`. Nenhum desses produtos é usado
aqui, e as descrições entram em **toda** sessão.

> É configuração global do usuário, fora deste repositório. A remoção não
> foi executada — é decisão de quem usa a máquina.

---

## O buraco mais importante do catálogo

**Não existe skill oficial de D1 ou SQLite para migrations, índices,
transações, backup e recuperação.** O catálogo cobre Postgres, MySQL, SQL
Server, ClickHouse, DuckDB, MongoDB e Cosmos — nenhum deles é o que este
projeto usa.

A skill `wrangler` cobre a sintaxe do comando; ela não cobre o **processo**
seguro de mudar um banco que guarda estoque real. É exatamente o vão que
`safe-d1-change` preenche, e a razão de ela ser a mais rigorosa das seis.

## Regras permanentes para skills externas

1. Nunca instalar em lote. Uma por vez, com motivo escrito.
2. Antes de instalar, ler: `SKILL.md`, `hooks/`, `scripts/` e qualquer
   `mcp` declarado.
3. Skill que roda hook em toda edição precisa de aprovação consciente — ela
   passa a executar em **todo** trabalho, não só quando invocada.
4. Skill que manda código para serviço externo: só com decisão explícita.
   Este repositório é público, mas o **banco** não é.
5. Lista `awesome` é descoberta, não recomendação.
6. Se não deu para verificar: `AVALIAR — confiança insuficiente`, e não
   instala.
7. Revisar esta tabela quando a stack mudar — entrou dependência de runtime,
   entrou framework, entrou segundo usuário no painel.
