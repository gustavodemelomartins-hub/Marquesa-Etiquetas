# Setup portátil do projeto

A referência para uma máquina nova é o [roteiro de Stephanie](handoff/ROTEIRO-STEPHANIE.md),
na branch `handoff/stephanie-2026-10-29`. O GitHub entrega o código, lockfiles,
regras, testes e configuração de infraestrutura sem segredos. Não entrega logins,
dados D1, objetos R2, estado local ou instalações globais de outra pessoa.

## Obrigatório para desenvolver

- Git com histórico completo, Node 24 LTS (`.node-version`), npm e Python 3.
- `npm ci` em `api/`, `src/` e `frontend/`; versões derivadas dos lockfiles.
- Chromium do Playwright quando testar UI; `npx playwright install chromium` em `src/`.
- Configuração local fictícia ignorada, D1/R2 local e Worker com `--local` explícito.
- No Windows: `python src/build.py`, não o script legado que presume `python3`.

## Ferramentas versionadas

- ESLint e regras locais em `frontend/`, instalados pelo lockfile.
- `npm run lint` (erros reprovam; warnings herdados permanecem visíveis).
- `npm run lint:types` é opcional e não é o gate rápido.
- Hooks Claude/Codex e testes em `.claude/hooks` e `.codex/hooks`.
- Skills de domínio em `.claude/skills`, papéis em `.codex/agents` e `.claude/agents`.
- `.graphifyignore` e `.gitignore` excluem segredos, estado e artefatos gerados.

Confirme no cliente usado que os hooks são reconhecidos; ter arquivos no Git não
comprova execução. As proteções complementam permissões e revisão e não tornam um
comando arbitrário seguro. Freeze e classes de risco continuam em `docs/SECURITY.md`.

## Opcional, fora da instalação do produto

Context7, Chrome DevTools MCP, RTK, Graphify e plugins de processo são opcionais.
Se desejados, instalar por canais oficiais e autenticar com a conta da própria pessoa.
Não copiar arquivos globais, vault privado, histórico ou sessões do Gustavo.
O parser dos hooks inclui a correção para envelopes RTK; isso não instala o RTK.
Não há requisito de chave OpenAI/Anthropic API, proxy ou billing para a aplicação.

## Verificação

`npm run test:fast` na raiz; `npm test` e `npm run build` em `frontend/`;
teste de schema `node src/migracao-variantes-test.mjs`; prova autenticada local
de `/api/estoque/conferir` e inspeção dos painéis. Para mudança específica,
selecionar testes por `docs/testing/TESTING.md`. Catálogos manuais não são testes executados.

A [auditoria da branch](handoff/AUDITORIA-12-COMMITS.md) registra o escopo e as provas
da transferência. Não reutilize resultados datados como certificação de alterações futuras.

Na validação, Node 26 expôs incompatibilidade entre o Web Storage nativo e os testes
JSDOM que usam localStorage. O ambiente de referência deste handoff é Node 24;
não atualizar o runtime por reflexo nem alterar o produto para ocultar falha de ambiente.
